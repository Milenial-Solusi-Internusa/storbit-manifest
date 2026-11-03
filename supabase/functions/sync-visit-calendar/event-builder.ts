// supabase/functions/sync-visit-calendar/event-builder.ts
// Fungsi MURNI -- nol I/O, nol Deno.serve, nol panggilan Google -- supaya bisa
// dites lewat `deno test` tanpa menjalankan Edge Function apa pun. Pola persis
// card.ts (notify-prf-space): satu fungsi buildEventPayload() + helper kecil
// di bawahnya, dipanggil oleh index.ts.
//
// Privasi (koreksi Mas #10): HANYA 4 sumber data yang boleh masuk payload --
// nama akun, lokasi/alamat, label visit_type, agenda (point_of_meeting). TIDAK
// PERNAH: details.mom, notes, alasan pembatalan, kontak PIC (phone/email),
// data komersial akun (credit_limit/estimated_value/bant_*). Fungsi ini bahkan
// tidak punya PARAMETER untuk field-field terlarang itu -- bukan cuma "tidak
// dipakai", tapi strukturnya tidak menerimanya sama sekali, supaya pemanggil
// di index.ts tidak bisa "lupa" dan menyelipkannya.

// Label ramah visit_type -- disalin dari VISIT_TYPES
// (src/modules/crm/CRMDashboardPage.jsx:1513-1519), BUKAN diimpor (Deno tidak
// bisa mengimpor dari src/ React). Nilai tak dikenal tampil apa adanya (pola
// sama dengan DOC_STATUS_LABELS/COMMODITY_LABELS di card.ts PRF).
const VISIT_TYPE_LABELS: Record<string, string> = {
  discovery: 'Discovery Visit',
  solution_presentation: 'Solution Presentation',
  qbr: 'QBR Visit',
  problem_solving: 'Problem Solving',
  routine_touch: 'Routine Touch',
}

function visitTypeLabel(code: string | null): string | null {
  if (!code) return null
  return VISIT_TYPE_LABELS[code] ?? code
}

export interface VisitForEvent {
  activityId: string
  scheduledFor: string // 'YYYY-MM-DD', activities.scheduled_for
  activityTime: string | null // 'HH:MM' atau 'HH:MM:SS' (Postgres time), null = sehari penuh
  accountName: string | null
  accountAddress: string | null
  accountCity: string | null
  detailsLocation: string | null // details.location (diisi sales, prioritas di atas alamat akun)
  visitTypeCode: string | null // details.visit_type (kode mentah)
  pointOfMeeting: string | null // details.point_of_meeting (agenda)
}

interface EventDateTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

export interface GoogleEventBody {
  summary: string
  location?: string
  description: string
  start: EventDateTime
  end: EventDateTime
  // Selalu 'confirmed' -- koreksi Mas #1 (perbaikan 1): INSERT (event baru)
  // valid dengan status ini, dan PUT (events.update) dengan status:'confirmed'
  // persis cara membangkitkan kembali event yang sempat berstatus 'cancelled'
  // di Google (tombstone bekas pembatalan) -- Fase 2b, lihat TODO index.ts.
  status: 'confirmed'
  visibility: 'private'
  reminders: { useDefault: false; overrides: Array<{ method: string; minutes: number }> }
  extendedProperties: { private: { nexus_activity_id: string } }
}

const DURATION_MINUTES = 60

// Postgres time bisa "HH:MM" (5 char) atau "HH:MM:SS" (8 char) -- keduanya
// ditangani (koreksi Mas #6). Nilai di luar format itu (termasuk null/kosong)
// dianggap "tidak ada jam" -> event sehari penuh, BUKAN error -- kolom
// activity_time memang nullable dan itu kondisi yang sah.
function parseTimeOfDay(t: string | null): { h: number; m: number } | null {
  if (!t) return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return { h, m }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Rollover TANGGAL murni (bukan jam/zona) via Date ber-anchor UTC pada
// T00:00:00Z -- AMAN karena tak ada komponen jam-dinding yang dilibatkan sama
// sekali, beda dari konversi UTC untuk WAKTU kunjungan (yang DILARANG --
// start/end dikirim sebagai dateTime+timeZone apa adanya, tanpa dikonversi).
// Dipakai utk (a) end.date event sehari-penuh (besok dari scheduledFor), dan
// (b) saat durasi 1 jam melewati tengah malam (mis. mulai 23:30).
function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function buildLocation(detailsLocation: string | null, accountAddress: string | null, accountCity: string | null): string | undefined {
  const fromDetails = detailsLocation?.trim()
  if (fromDetails) return fromDetails
  const address = accountAddress?.trim() || '';
  const city = accountCity?.trim() || '';
  if (address && city) return `${address}, ${city}`
  if (address) return address
  if (city) return city
  return undefined // key "location" di-OMIT sama sekali, bukan string kosong
}

function buildDescription(visitTypeCode: string | null, pointOfMeeting: string | null, nexusLinkUrl: string): string {
  const lines: string[] = []
  const typeLabel = visitTypeLabel(visitTypeCode)
  if (typeLabel) lines.push(`Jenis: ${typeLabel}`)
  const agenda = pointOfMeeting?.trim()
  if (agenda) lines.push(`Agenda: ${agenda}`)
  const link = `Dibuat lewat Nexus: ${nexusLinkUrl}`
  return lines.length ? `${lines.join('\n')}\n\n${link}` : link
}

function buildStartEnd(scheduledFor: string, activityTime: string | null): { start: EventDateTime; end: EventDateTime } {
  const time = parseTimeOfDay(activityTime)
  if (!time) {
    // Sehari penuh -- Google mewajibkan end.date = HARI SETELAHNYA (eksklusif),
    // bukan tanggal yang sama, bahkan untuk event satu-hari.
    return { start: { date: scheduledFor }, end: { date: addOneDay(scheduledFor) } }
  }
  const startDateTime = `${scheduledFor}T${pad2(time.h)}:${pad2(time.m)}:00`
  const totalEndMinutes = time.h * 60 + time.m + DURATION_MINUTES
  const rolledOverToNextDay = totalEndMinutes >= 24 * 60
  const endTimeOfDay = totalEndMinutes % (24 * 60)
  const endH = Math.floor(endTimeOfDay / 60)
  const endM = endTimeOfDay % 60
  const endDateStr = rolledOverToNextDay ? addOneDay(scheduledFor) : scheduledFor
  const endDateTime = `${endDateStr}T${pad2(endH)}:${pad2(endM)}:00`
  return {
    start: { dateTime: startDateTime, timeZone: 'Asia/Jakarta' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Jakarta' },
  }
}

export function buildEventPayload(visit: VisitForEvent, nexusLinkUrl: string): GoogleEventBody {
  const summary = visit.accountName?.trim()
    ? `Kunjungan: ${visit.accountName.trim()}`
    : 'Kunjungan: (Tanpa Akun)'
  const location = buildLocation(visit.detailsLocation, visit.accountAddress, visit.accountCity)
  const description = buildDescription(visit.visitTypeCode, visit.pointOfMeeting, nexusLinkUrl)
  const { start, end } = buildStartEnd(visit.scheduledFor, visit.activityTime)

  // Perbaikan 4: event sehari-penuh (tanpa jam) nol reminder -- popup "30
  // menit lagi" tak bermakna untuk event yang tak punya jam pasti, dan kalau
  // dibiarkan Google menghitungnya dari tengah malam (23:30 malam
  // sebelumnya) -- membingungkan, bukan membantu. Event ber-jam tetap dapat
  // popup 30 menit sebelumnya.
  const isAllDay = parseTimeOfDay(visit.activityTime) === null
  const reminders = isAllDay
    ? { useDefault: false as const, overrides: [] }
    : { useDefault: false as const, overrides: [{ method: 'popup', minutes: 30 }] }

  const body: GoogleEventBody = {
    summary,
    description,
    start,
    end,
    status: 'confirmed',
    visibility: 'private',
    reminders,
    extendedProperties: { private: { nexus_activity_id: visit.activityId } },
  }
  if (location) body.location = location
  return body
}

// Id event deterministik dari activity_id (koreksi Mas #9): UUID standar
// hanya memakai 0-9 dan a-f, yang merupakan HIMPUNAN BAGIAN dari alfabet
// event id Google (a-v dan 0-9) -- jadi UUID tanpa tanda hubung SAH apa
// adanya, nol transformasi tambahan diperlukan. Panjang 32 karakter, dalam
// rentang 5-1024 yang disyaratkan Google.
export function deterministicEventId(activityId: string): string {
  return activityId.replace(/-/g, '')
}

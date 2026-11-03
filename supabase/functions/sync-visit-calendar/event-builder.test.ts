// supabase/functions/sync-visit-calendar/event-builder.test.ts
// Deno test -- belum ada pola `*.test.ts` lain di supabase/functions/ untuk
// diikuti, jadi dipakai konvensi Deno standar: Deno.test() + jsr:@std/assert.
// Jalankan: deno test --allow-none supabase/functions/sync-visit-calendar/
import { assertEquals, assertExists } from 'jsr:@std/assert@1.0.19'
import { buildEventPayload, deterministicEventId, type VisitForEvent } from './event-builder.ts'

const NEXUS_LINK = 'https://nexus.msigroup.co.id/crm/pipeline/performance/team'

function baseVisit(overrides: Partial<VisitForEvent> = {}): VisitForEvent {
  return {
    activityId: '0f1e2d3c-4b5a-6978-8899-aabbccddeeff',
    scheduledFor: '2026-11-10',
    activityTime: '14:00',
    accountName: 'PT Agro Sawit Kalimantan',
    accountAddress: null,
    accountCity: null,
    detailsLocation: 'Kantor PT Agro Sawit Kalimantan, Jl. Sudirman No. 1, Jakarta',
    visitTypeCode: 'discovery',
    pointOfMeeting: 'Diskusi kebutuhan logistik Q1 2027',
    ...overrides,
  }
}

Deno.test('visit ber-jam: dateTime+timeZone, durasi 1 jam, judul & deskripsi lengkap', () => {
  const body = buildEventPayload(baseVisit(), NEXUS_LINK)
  assertEquals(body.summary, 'Kunjungan: PT Agro Sawit Kalimantan')
  assertEquals(body.start, { dateTime: '2026-11-10T14:00:00', timeZone: 'Asia/Jakarta' })
  assertEquals(body.end, { dateTime: '2026-11-10T15:00:00', timeZone: 'Asia/Jakarta' })
  assertEquals(body.location, 'Kantor PT Agro Sawit Kalimantan, Jl. Sudirman No. 1, Jakarta')
  assertEquals(
    body.description,
    'Jenis: Discovery Visit\nAgenda: Diskusi kebutuhan logistik Q1 2027\n\nDibuat lewat Nexus: https://nexus.msigroup.co.id/crm/pipeline/performance/team',
  )
  assertEquals(body.status, 'confirmed')
  assertEquals(body.visibility, 'private')
  assertEquals(body.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] })
  assertEquals(body.extendedProperties.private.nexus_activity_id, '0f1e2d3c-4b5a-6978-8899-aabbccddeeff')
})

Deno.test('perbaikan 1: status selalu "confirmed" -- juga utk event sehari penuh', () => {
  const body = buildEventPayload(baseVisit({ activityTime: null }), NEXUS_LINK)
  assertEquals(body.status, 'confirmed')
})

Deno.test('perbaikan 4: event sehari penuh (tanpa jam) -> reminders.overrides kosong, nol popup', () => {
  const body = buildEventPayload(baseVisit({ activityTime: null }), NEXUS_LINK)
  assertEquals(body.reminders, { useDefault: false, overrides: [] })
})

Deno.test('perbaikan 4: event ber-jam tetap dapat popup 30 menit (regresi tidak ikut kosong)', () => {
  const body = buildEventPayload(baseVisit({ activityTime: '09:15' }), NEXUS_LINK)
  assertEquals(body.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] })
})

Deno.test('visit 23:30: durasi 1 jam melewati tengah malam -> end.dateTime jatuh ke hari berikutnya', () => {
  const body = buildEventPayload(baseVisit({ activityTime: '23:30' }), NEXUS_LINK)
  assertEquals(body.start, { dateTime: '2026-11-10T23:30:00', timeZone: 'Asia/Jakarta' })
  assertEquals(body.end, { dateTime: '2026-11-11T00:30:00', timeZone: 'Asia/Jakarta' })
})

Deno.test('activity_time format HH:MM:SS (Postgres time) ditangani sama seperti HH:MM', () => {
  const body = buildEventPayload(baseVisit({ activityTime: '14:00:00' }), NEXUS_LINK)
  assertEquals(body.start, { dateTime: '2026-11-10T14:00:00', timeZone: 'Asia/Jakarta' })
  assertEquals(body.end, { dateTime: '2026-11-10T15:00:00', timeZone: 'Asia/Jakarta' })
})

Deno.test('visit tanpa jam: event sehari penuh, end.date = besoknya (eksklusif, syarat Google)', () => {
  const body = buildEventPayload(baseVisit({ activityTime: null }), NEXUS_LINK)
  assertEquals(body.start, { date: '2026-11-10' })
  assertEquals(body.end, { date: '2026-11-11' })
})

Deno.test('visit tanpa lokasi sama sekali: key "location" tidak ada di body (bukan string kosong)', () => {
  const body = buildEventPayload(baseVisit({ detailsLocation: null, accountAddress: null, accountCity: null }), NEXUS_LINK)
  assertEquals('location' in body, false)
})

Deno.test('visit tanpa akun: judul fallback "(Tanpa Akun)"', () => {
  const body = buildEventPayload(baseVisit({ accountName: null }), NEXUS_LINK)
  assertEquals(body.summary, 'Kunjungan: (Tanpa Akun)')
})

Deno.test('lokasi fallback ke accounts.address + city saat details.location kosong', () => {
  const body = buildEventPayload(
    baseVisit({ detailsLocation: null, accountAddress: 'Jl. Gatot Subroto 5', accountCity: 'Surabaya' }),
    NEXUS_LINK,
  )
  assertEquals(body.location, 'Jl. Gatot Subroto 5, Surabaya')
})

Deno.test('lokasi fallback hanya city (address kosong)', () => {
  const body = buildEventPayload(
    baseVisit({ detailsLocation: null, accountAddress: null, accountCity: 'Bandung' }),
    NEXUS_LINK,
  )
  assertEquals(body.location, 'Bandung')
})

Deno.test('deskripsi tanpa visit_type/agenda: hanya baris link, nol baris kosong menggantung', () => {
  const body = buildEventPayload(baseVisit({ visitTypeCode: null, pointOfMeeting: null }), NEXUS_LINK)
  assertEquals(body.description, `Dibuat lewat Nexus: ${NEXUS_LINK}`)
})

Deno.test('visit_type tak dikenal tampil apa adanya (fallback), bukan hilang/error', () => {
  const body = buildEventPayload(baseVisit({ visitTypeCode: 'jenis_baru_belum_dipetakan' }), NEXUS_LINK)
  assertEquals(body.description.startsWith('Jenis: jenis_baru_belum_dipetakan'), true)
})

Deno.test('deterministicEventId: UUID tanpa tanda hubung, 32 karakter, hanya [0-9a-f]', () => {
  const id = deterministicEventId('0f1e2d3c-4b5a-6978-8899-aabbccddeeff')
  assertEquals(id, '0f1e2d3c4b5a69788899aabbccddeeff')
  assertEquals(id.length, 32)
  assertEquals(/^[0-9a-v]+$/.test(id), true)
})

Deno.test('privasi: field terlarang (mom/notes/pic/komersial) TIDAK PERNAH muncul di teks event untuk data apa pun', () => {
  // event-builder.ts bahkan tidak punya parameter untuk field-field itu --
  // uji ini memastikan nol jejaknya di summary/location/description untuk
  // kasus data yang paling "berisi" sekalipun.
  const body = buildEventPayload(baseVisit(), NEXUS_LINK)
  const haystack = `${body.summary}\n${body.location ?? ''}\n${body.description}`
  for (const forbidden of ['mom', 'MOM', 'credit_limit', 'bant_', 'pic_phone', 'pic_email', 'cancel']) {
    assertEquals(haystack.toLowerCase().includes(forbidden.toLowerCase()), false, `teks event mengandung "${forbidden}"`)
  }
  assertExists(body.extendedProperties.private.nexus_activity_id)
})

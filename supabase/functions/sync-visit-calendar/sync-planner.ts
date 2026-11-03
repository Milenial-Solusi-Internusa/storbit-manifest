// supabase/functions/sync-visit-calendar/sync-planner.ts
// Fungsi MURNI -- nol I/O, nol Google, nol Supabase -- memisahkan KEPUTUSAN
// (apa yang harus dilakukan) dari EKSEKUSI (bagaimana melakukannya, di
// index.ts). Tiga lapis keputusan, masing-masing dites sendiri-sendiri:
//
//   1. determineRoute()        -- SEBELUM panggilan Google apa pun: liat
//      keadaan visit (cancelled/deleted?, email pemilik valid?, pemilik
//      berubah dari sinkron terakhir?) -> rute level-atas (skip/noop/
//      cleanup/sync/reassign).
//   2. planAfterGetForCleanup() / planAfterGetForSync() -- SETELAH satu GET:
//      terjemahkan keadaan event di Google (classifyGetResult) jadi aksi
//      primer (NOOP/DELETE utk cleanup; INSERT/PUT utk sync).
//   3. planFallback()          -- SETELAH mencoba aksi primer: kalau
//      ditolak, putuskan SATU fallback (atau berhenti sbg error). Dipanggil
//      PALING BANYAK SEKALI per aksi primer -- strukturnya sendiri
//      (union 'done'/'retry_as_put'/'retry_as_insert'/'error', bukan
//      daftar/rekursi) membuat loop tak terbatas mustahil secara desain.
//
// index.ts HANYA mengeksekusi apa yang tiga fungsi ini putuskan -- nol
// keputusan bisnis tersisa di sana selain memanggil Google/Supabase.

// ── 1. Rute level-atas ───────────────────────────────────────────────────────

export interface Identity {
  ownerEmail: string
  calendarId: string
}

export type Route =
  | { kind: 'skip'; reason: string }
  // cancelled/deleted, TAPI belum pernah sinkron sekali pun (synced_owner_email
  // kosong) -- nol identitas utk dicek, nol GET diperlukan.
  | { kind: 'noop_already_clean' }
  // cancelled/deleted, PERNAH sinkron -- perlu GET+mungkin DELETE di
  // identitas TERAKHIR yang tersimpan (koreksi #1: bukan identitas sekarang).
  | { kind: 'cleanup'; identity: Identity }
  // aktif, pemilik TIDAK berubah dari sinkron terakhir (atau belum pernah
  // sinkron) -- GET+INSERT-atau-PUT biasa di satu identitas.
  | { kind: 'sync'; identity: Identity }
  // aktif, pemilik BERUBAH dari synced_owner_email tersimpan (dibandingkan
  // case-insensitive) -- hapus di identitas LAMA, buat di identitas BARU.
  | { kind: 'reassign'; oldIdentity: Identity; newIdentity: Identity }

export interface RouteInput {
  visitIsCancelledOrDeleted: boolean
  effectiveOwnerEmail: string | null // null = kosong ATAU gagal validasi format
  scheduledForPresent: boolean
  syncedOwnerEmail: string | null // visit_calendar_sync.synced_owner_email
  syncedCalendarId: string | null // visit_calendar_sync.google_calendar_id
  currentCalendarId: string // GOOGLE_CALENDAR_ID saat ini (atau 'primary')
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase()
}

export function determineRoute(input: RouteInput): Route {
  // scheduled_for kosong didahulukan di atas cancelled/deleted -- data tak
  // lengkap tetap skip apa pun status visit-nya (konsisten dgn 2a).
  if (!input.scheduledForPresent) {
    return { kind: 'skip', reason: 'scheduled_for kosong' }
  }

  if (input.visitIsCancelledOrDeleted) {
    if (!input.syncedOwnerEmail) return { kind: 'noop_already_clean' }
    return {
      kind: 'cleanup',
      identity: { ownerEmail: input.syncedOwnerEmail, calendarId: input.syncedCalendarId ?? 'primary' },
    }
  }

  if (!input.effectiveOwnerEmail) {
    return { kind: 'skip', reason: 'email pemilik kosong atau tidak valid' }
  }

  const ownerChanged =
    !!input.syncedOwnerEmail && normalizeEmail(input.syncedOwnerEmail) !== normalizeEmail(input.effectiveOwnerEmail)

  if (ownerChanged) {
    return {
      kind: 'reassign',
      oldIdentity: { ownerEmail: input.syncedOwnerEmail as string, calendarId: input.syncedCalendarId ?? 'primary' },
      newIdentity: { ownerEmail: input.effectiveOwnerEmail, calendarId: input.currentCalendarId },
    }
  }

  return { kind: 'sync', identity: { ownerEmail: input.effectiveOwnerEmail, calendarId: input.currentCalendarId } }
}

// ── 2. Aksi primer setelah satu GET ──────────────────────────────────────────

// Keadaan event Google HASIL klasifikasi satu respons GET. Dipanggil HANYA
// setelah pemanggil (index.ts) sendiri memastikan GET "berhasil secara
// struktural" (2xx ATAU 404/410) -- status lain (401/403/5xx-sisa-retry/dll)
// ditangani index.ts SEBAGAI ERROR SEBELUM sampai ke fungsi ini, tidak
// pernah diteruskan kemari.
export type GoogleEventState = 'not_found' | 'active' | 'cancelled'

export function classifyGetResult(httpStatus: number, bodyEventStatus: string | null): GoogleEventState {
  if (httpStatus === 404 || httpStatus === 410) return 'not_found'
  return bodyEventStatus === 'cancelled' ? 'cancelled' : 'active'
}

export type CleanupAction = { type: 'NOOP' } | { type: 'DELETE' }
export type SyncAction = { type: 'INSERT' } | { type: 'PUT' }

// Rute 'cleanup' (dan separuh 'reassign' -- identitas LAMA): sudah tak ada
// (not_found) ATAU sudah berstatus cancelled di Google (tombstone -- koreksi
// #1: tombstone dihitung "sudah tak ada", JANGAN kirim DELETE lagi) -> NOOP.
// Masih aktif -> DELETE.
export function planAfterGetForCleanup(state: GoogleEventState): CleanupAction {
  return state === 'active' ? { type: 'DELETE' } : { type: 'NOOP' }
}

// Rute 'sync' (dan separuh 'reassign' -- identitas BARU): belum ada
// (not_found) -> INSERT. Sudah ada, aktif ATAU cancelled (koreksi #2:
// reaktivasi tombstone cukup PUT, body sudah berisi status:'confirmed' dari
// event-builder.ts -- JANGAN INSERT ulang) -> PUT.
export function planAfterGetForSync(state: GoogleEventState): SyncAction {
  return state === 'not_found' ? { type: 'INSERT' } : { type: 'PUT' }
}

// ── 3. Fallback SATU PUTARAN setelah mencoba aksi primer ───────────────────

export type FallbackDecision =
  | { type: 'done' }
  | { type: 'retry_as_put' } // 409 pada INSERT -> (GET lalu) PUT, SEKALI
  | { type: 'retry_as_insert' } // 404/410 pada PUT -> INSERT, SEKALI
  | { type: 'error'; message: string } // permanen ATAU fallback sudah dipakai -- nol retry lagi

// Dipanggil index.ts tepat SEKALI per aksi primer yang gagal (status bukan
// 2xx). Hasil 'retry_as_put'/'retry_as_insert' dieksekusi index.ts sebagai
// SATU percobaan tambahan -- hasil percobaan tambahan itu TIDAK dilewatkan
// balik ke fungsi ini lagi (index.ts menilainya langsung: ok -> selesai,
// gagal -> error generik). Union ini (bukan daftar/rekursi) membuat
// "putaran kedua" mustahil secara struktur, bukan sekadar dijanjikan lewat
// komentar.
export function planFallback(attempted: 'INSERT' | 'PUT' | 'DELETE', status: number): FallbackDecision {
  if (status >= 200 && status < 300) return { type: 'done' }
  if (attempted === 'DELETE' && (status === 404 || status === 410)) return { type: 'done' }
  if (attempted === 'INSERT' && status === 409) return { type: 'retry_as_put' }
  if (attempted === 'PUT' && (status === 404 || status === 410)) return { type: 'retry_as_insert' }
  return { type: 'error', message: `Google Calendar tolak ${attempted} (HTTP ${status})` }
}

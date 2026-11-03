// supabase/functions/sync-visit-calendar/sync-planner.test.ts
// Tabel-driven, mencakup SETIAP baris tabel keputusan Fase 2 (rencana yang
// sudah disetujui) + kasus pindah pemilik + kasus fallback -- tanpa Google
// sama sekali (pure function), termasuk kasus pindah pemilik yang TIDAK
// mungkin diuji visual di staging (override satu mailbox).
import { assertEquals } from 'jsr:@std/assert@1.0.19'
import {
  classifyGetResult,
  determineRoute,
  planAfterGetForCleanup,
  planAfterGetForSync,
  planFallback,
  type RouteInput,
} from './sync-planner.ts'

function baseRouteInput(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    visitIsCancelledOrDeleted: false,
    effectiveOwnerEmail: 'sales@msigroup.co.id',
    scheduledForPresent: true,
    syncedOwnerEmail: null,
    syncedCalendarId: null,
    currentCalendarId: 'primary',
    ...overrides,
  }
}

// ── determineRoute: baris 7 & 8 tabel keputusan (skip) ──────────────────────

Deno.test('route: scheduled_for kosong -> skip, didahulukan di atas apa pun', () => {
  const r = determineRoute(baseRouteInput({ scheduledForPresent: false, visitIsCancelledOrDeleted: true }))
  assertEquals(r, { kind: 'skip', reason: 'scheduled_for kosong' })
})

Deno.test('route: email pemilik kosong/tidak valid (bukan cancelled) -> skip', () => {
  const r = determineRoute(baseRouteInput({ effectiveOwnerEmail: null }))
  assertEquals(r, { kind: 'skip', reason: 'email pemilik kosong atau tidak valid' })
})

Deno.test('route: koreksi #6 -- visit skip (email hilang) walau PERNAH sinkron (synced_owner_email ada) tetap skip, bukan cleanup', () => {
  // JANGAN hapus event diam-diam -- dibiarkan, index.ts yang mencatat
  // sync_error "dibiarkan" (bukan fungsi ini, murni keputusan rute).
  const r = determineRoute(baseRouteInput({ effectiveOwnerEmail: null, syncedOwnerEmail: 'lama@msigroup.co.id' }))
  assertEquals(r, { kind: 'skip', reason: 'email pemilik kosong atau tidak valid' })
})

// ── determineRoute: baris 4 & 5 (cancelled/deleted) ─────────────────────────

Deno.test('route: cancelled, belum pernah sinkron (synced_owner_email kosong) -> noop_already_clean, nol identitas', () => {
  const r = determineRoute(baseRouteInput({ visitIsCancelledOrDeleted: true, syncedOwnerEmail: null }))
  assertEquals(r, { kind: 'noop_already_clean' })
})

Deno.test('route: deleted_at terisi, pernah sinkron -> cleanup di identitas TERAKHIR (bukan identitas sekarang)', () => {
  const r = determineRoute(
    baseRouteInput({
      visitIsCancelledOrDeleted: true,
      syncedOwnerEmail: 'sales.lama@msigroup.co.id',
      syncedCalendarId: 'cal-lama-123',
      effectiveOwnerEmail: 'sales.baru@msigroup.co.id', // SENGAJA beda -- harus diabaikan, cleanup pakai yang lama
    }),
  )
  assertEquals(r, { kind: 'cleanup', identity: { ownerEmail: 'sales.lama@msigroup.co.id', calendarId: 'cal-lama-123' } })
})

Deno.test('route: cleanup fallback calendarId "primary" kalau syncedCalendarId belum pernah tersimpan', () => {
  const r = determineRoute(
    baseRouteInput({ visitIsCancelledOrDeleted: true, syncedOwnerEmail: 'x@msigroup.co.id', syncedCalendarId: null }),
  )
  assertEquals(r, { kind: 'cleanup', identity: { ownerEmail: 'x@msigroup.co.id', calendarId: 'primary' } })
})

// ── determineRoute: baris 1-3 (aktif, pemilik TIDAK berubah) ────────────────

Deno.test('route: aktif, belum pernah sinkron -> sync (bukan reassign -- nol pembanding)', () => {
  const r = determineRoute(baseRouteInput({ syncedOwnerEmail: null }))
  assertEquals(r, { kind: 'sync', identity: { ownerEmail: 'sales@msigroup.co.id', calendarId: 'primary' } })
})

Deno.test('route: aktif, pemilik SAMA dengan sinkron terakhir -> sync, bukan reassign', () => {
  const r = determineRoute(baseRouteInput({ syncedOwnerEmail: 'sales@msigroup.co.id' }))
  assertEquals(r.kind, 'sync')
})

Deno.test('route: perbandingan pemilik case-insensitive -- beda huruf besar/kecil TETAP dianggap SAMA (bukan reassign)', () => {
  const r = determineRoute(baseRouteInput({ syncedOwnerEmail: 'SALES@MSIGROUP.CO.ID' }))
  assertEquals(r.kind, 'sync')
})

// ── determineRoute: baris 6 -- pindah pemilik (TIDAK bisa diuji visual di staging) ──

Deno.test('route: pindah pemilik -- email berbeda (case-insensitive) -> reassign dgn oldIdentity & newIdentity benar', () => {
  const r = determineRoute(
    baseRouteInput({
      effectiveOwnerEmail: 'Sales.Baru@MsiGroup.co.id',
      syncedOwnerEmail: 'sales.lama@msigroup.co.id',
      syncedCalendarId: 'cal-lama',
      currentCalendarId: 'primary',
    }),
  )
  assertEquals(r, {
    kind: 'reassign',
    oldIdentity: { ownerEmail: 'sales.lama@msigroup.co.id', calendarId: 'cal-lama' },
    newIdentity: { ownerEmail: 'Sales.Baru@MsiGroup.co.id', calendarId: 'primary' },
  })
})

Deno.test('route: reassign oldIdentity fallback calendarId "primary" kalau syncedCalendarId kosong', () => {
  const r = determineRoute(
    baseRouteInput({ effectiveOwnerEmail: 'baru@x.com', syncedOwnerEmail: 'lama@x.com', syncedCalendarId: null }),
  )
  assertEquals(r.kind, 'reassign')
  if (r.kind === 'reassign') assertEquals(r.oldIdentity.calendarId, 'primary')
})

// ── classifyGetResult ────────────────────────────────────────────────────────

Deno.test('classifyGetResult: 404 -> not_found', () => {
  assertEquals(classifyGetResult(404, null), 'not_found')
})
Deno.test('classifyGetResult: 410 -> not_found (disamakan dgn 404)', () => {
  assertEquals(classifyGetResult(410, null), 'not_found')
})
Deno.test('classifyGetResult: 200 + body.status="cancelled" -> cancelled (tombstone)', () => {
  assertEquals(classifyGetResult(200, 'cancelled'), 'cancelled')
})
Deno.test('classifyGetResult: 200 + body.status="confirmed" -> active', () => {
  assertEquals(classifyGetResult(200, 'confirmed'), 'active')
})
Deno.test('classifyGetResult: 200 + body.status null/tak dikenal -> active (fallback aman)', () => {
  assertEquals(classifyGetResult(200, null), 'active')
})

// ── planAfterGetForCleanup: baris 4 & 5 + koreksi #1 (tombstone = sudah tak ada) ──

Deno.test('cleanup: not_found -> NOOP (jangan DELETE)', () => {
  assertEquals(planAfterGetForCleanup('not_found'), { type: 'NOOP' })
})
Deno.test('cleanup: cancelled (tombstone) -> NOOP -- koreksi #1, JANGAN kirim DELETE lagi', () => {
  assertEquals(planAfterGetForCleanup('cancelled'), { type: 'NOOP' })
})
Deno.test('cleanup: active -> DELETE', () => {
  assertEquals(planAfterGetForCleanup('active'), { type: 'DELETE' })
})

// ── planAfterGetForSync: baris 1-3 + koreksi #2 (reaktivasi cukup PUT) ──────

Deno.test('sync: not_found -> INSERT', () => {
  assertEquals(planAfterGetForSync('not_found'), { type: 'INSERT' })
})
Deno.test('sync: active -> PUT', () => {
  assertEquals(planAfterGetForSync('active'), { type: 'PUT' })
})
Deno.test('sync: cancelled (reaktivasi tombstone) -> PUT, BUKAN INSERT -- koreksi #2', () => {
  assertEquals(planAfterGetForSync('cancelled'), { type: 'PUT' })
})

// ── planFallback: baris 9-11 + fallback satu putaran ────────────────────────

Deno.test('fallback: 2xx apa pun -> done', () => {
  assertEquals(planFallback('INSERT', 200), { type: 'done' })
  assertEquals(planFallback('PUT', 204), { type: 'done' })
})

Deno.test('fallback: INSERT dibalas 409 -> retry_as_put (GET lalu PUT, dieksekusi index.ts)', () => {
  assertEquals(planFallback('INSERT', 409), { type: 'retry_as_put' })
})

Deno.test('fallback: PUT dibalas 404 -> retry_as_insert', () => {
  assertEquals(planFallback('PUT', 404), { type: 'retry_as_insert' })
})
Deno.test('fallback: PUT dibalas 410 -> retry_as_insert (disamakan dgn 404)', () => {
  assertEquals(planFallback('PUT', 410), { type: 'retry_as_insert' })
})

Deno.test('fallback: DELETE dibalas 404/410 -> done (dianggap BERHASIL, bukan error)', () => {
  assertEquals(planFallback('DELETE', 404), { type: 'done' })
  assertEquals(planFallback('DELETE', 410), { type: 'done' })
})

Deno.test('fallback: 400/401/403 -> error, nol retry (permanen)', () => {
  assertEquals(planFallback('INSERT', 400).type, 'error')
  assertEquals(planFallback('PUT', 401).type, 'error')
  assertEquals(planFallback('DELETE', 403).type, 'error')
})

Deno.test('fallback: 429/5xx yang MASIH gagal setelah fetchWithRetry (retry sudah habis) -> error, bukan fallback lagi', () => {
  // planFallback tidak tahu/tidak peduli ada retry di layer HTTP -- status
  // yang sampai ke sini SUDAH pasca-retry. 429/5xx di sini berarti retry
  // sekali pun tak menolong -> error generik, konsisten dgn "satu putaran".
  assertEquals(planFallback('INSERT', 429).type, 'error')
  assertEquals(planFallback('PUT', 500).type, 'error')
  assertEquals(planFallback('DELETE', 503).type, 'error')
})

Deno.test('fallback: INSERT dibalas 404 (bukan 409) -> error -- bukan pola fallback yang dikenal utk INSERT', () => {
  assertEquals(planFallback('INSERT', 404).type, 'error')
})

// supabase/functions/sync-visit-calendar/index.ts
// Sinkron SATU kunjungan (activities.type='visit') ke Google Calendar lewat
// service account + domain-wide delegation. Dipanggil HANYA server-to-server
// (trigger DB, Fase 3 -- BELUM ADA, fungsi ini berdiri sendiri dan diuji
// lewat pemanggilan manual) lewat net.http_post, pola PERSIS
// notify-prf-space/index.ts -- BUKAN dipanggil dari FE/browser, karena itu
// nol CORS di sini. config.toml men-set verify_jwt=true -- gateway Supabase
// sudah menolak JWT tak sah/kedaluwarsa SEBELUM kode ini sempat jalan; yang
// tersisa untuk kita cek hanyalah klaim `role` di token yang (menurut
// gateway) sudah sah. Pola decodeJwtRole PERSIS aging-pipeline/notify-prf-space.
//
// KEPUTUSAN vs EKSEKUSI dipisah tegas (Fase 2b): sync-planner.ts (fungsi
// MURNI, nol I/O) memutuskan rute level-atas (skip/noop/cleanup/sync/
// reassign), aksi primer setelah satu GET, dan fallback satu putaran. Berkas
// ini HANYA mengeksekusi apa yang planner putuskan lewat Google/Supabase --
// nol keputusan bisnis tersisa di sini.
//
// RINGKASAN PERILAKU AKHIR (2a+2b lengkap):
//   - Visit aktif (bukan cancelled, deleted_at kosong), pemilik TIDAK
//     berubah dari sinkron terakhir -> GET lalu INSERT (belum ada) atau PUT
//     (sudah ada, aktif ATAU tombstone cancelled -- PUT body selalu membawa
//     status:'confirmed', jadi sekaligus mereaktivasi tombstone).
//   - Visit cancelled ATAU deleted_at terisi -> event DIHAPUS (bukan
//     dipertahankan dgn status lain). GET dulu di identitas TERAKHIR yang
//     tersimpan (synced_owner_email/google_calendar_id) -- kalau sudah tak
//     ada (404/410) ATAU sudah tombstone cancelled, nol aksi (sudah sesuai).
//     Kalau masih aktif, DELETE; 404/410 pada DELETE dianggap BERHASIL.
//     Hasil akhir: google_event_id=NULL, google_calendar_id/synced_owner_email
//     TETAP (jejak historis "pernah di mana"), sync_status='synced'.
//   - Pemilik berubah (assigned_to baru, dibandingkan case-insensitive thd
//     synced_owner_email) -> hapus event di identitas LAMA (gagal permanen
//     di langkah ini TIDAK menghentikan proses -- lihat sync-planner.ts),
//     lalu buat/timpa di identitas BARU seperti alur sync biasa.
//   - Fallback SATU PUTARAN saja: INSERT->409 => GET lalu PUT sekali;
//     PUT->404/410 => INSERT sekali. Gagal lagi setelah itu -> error.
//   - Visit skipped (email kosong/scheduled_for kosong) TIDAK PERNAH
//     menghapus event yang sudah ada -- dibiarkan apa adanya, hanya dicatat
//     alasan di sync_error.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildEventPayload, deterministicEventId, type VisitForEvent, type GoogleEventBody } from './event-builder.ts'
import { getAccessToken, TokenError, type ServiceAccountKey } from './google-auth.ts'
import { getEvent, insertEvent, updateEvent, deleteEvent } from './calendar-client.ts'
import {
  determineRoute,
  classifyGetResult,
  planAfterGetForCleanup,
  planAfterGetForSync,
  planFallback,
  type Identity,
  type GoogleEventState,
} from './sync-planner.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Decode klaim `role` dari JWT TANPA verifikasi ulang tanda tangan -- aman
// karena verify_jwt=true di config.toml (lihat komentar di atas). Token yang
// tidak bisa didekode membalas 401 (masukan tak sah), bukan 500.
function decodeJwtRole(authHeader: string | null): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

// Rute tab Calendar CRM Dashboard -- DIVERIFIKASI ke kode (bukan ditebak):
// MENU_PATHS['crm-dashboard'] di src/routes/menu-paths.js:77 datang dari
// `...SKELETON_MENU_PATHS` (src/routes/menu-skeleton.js), yang untuk
// menuId "crm-dashboard" berisi path "/crm/pipeline/performance/team"
// (menu-skeleton.js:214, label tab "Ringkasan Tim"). Rute itu merender
// CRMDashboardPage (src/routes/crm.routes.jsx:738+159) -- halaman yang sama
// berisi tab "Calendar". Tidak ada deep-link per-visit (VisitDetailModal
// murni state komponen, bukan rute/query-param) -- link ini mengarah ke
// HALAMAN-nya, bukan ke kunjungan spesifik.
const CALENDAR_PAGE_PATH = '/crm/pipeline/performance/team'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SyncOutcome =
  | {
      status: 'synced'
      googleEventId: string | null
      googleCalendarId?: string
      ownerEmail?: string
      warning?: string
      // true = JANGAN timpa google_calendar_id/synced_owner_email di DB --
      // dipakai utk hasil "tidak ada event" (cleanup/noop_already_clean),
      // supaya kolom itu tetap jejak historis "pernah di mana", bukan
      // ditimpa null (koreksi #4).
      keepIdentity?: boolean
    }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; message: string }

async function handler(req: Request): Promise<Response> {
  const role = decodeJwtRole(req.headers.get('Authorization'))
  if (role !== 'service_role') {
    return json({ error: 'Unauthorized' }, 401)
  }

  const body = await req.json().catch(() => null)
  const activityId = body?.activity_id
  if (!activityId || typeof activityId !== 'string') {
    return json({ error: 'payload tidak valid: activity_id (string) wajib diisi' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Baca keadaan SEGAR -- kolom disebut eksplisit satu-satu (bukan select('*')
  // seperti notify-prf-space) karena di sini kolomnya sedikit dan tetap, jadi
  // lebih mudah dilihat sekali pandang kolom apa saja yang sungguh dipakai
  // fungsi ini; risiko "kolom salah nama menggagalkan seluruh query" yang jadi
  // alasan notify-prf-space memilih '*' tetap berlaku di sini, makanya nama
  // kolom di bawah sudah diverifikasi ke schema_snapshot.sql, bukan ditebak.
  const { data: activity, error: activityErr } = await supabase
    .from('activities')
    .select(`
      id, type, scheduled_for, activity_time, status, deleted_at, details,
      assigned_to, account_id,
      accounts:accounts!activities_account_id_fkey(name, address, city)
    `)
    .eq('id', activityId)
    .maybeSingle() as { data: ActivityRow | null; error: { message: string } | null }

  if (activityErr) {
    console.error('[sync-visit-calendar] gagal baca activities:', activityErr.message)
    return json({ error: 'Gagal membaca data kunjungan.' }, 500)
  }
  if (!activity) {
    return json({ error: 'Kunjungan tidak ditemukan' }, 404)
  }
  if (activity.type !== 'visit') {
    return json({ error: `activity_id ini bukan kunjungan (type='${activity.type}')` }, 400)
  }

  // Baca baris sinkron YANG SUDAH ADA (kalau ada) -- dipakai DUA hal: (a)
  // jejak "percobaan dimulai" (attempt_count/last_attempted_at) sebelum
  // panggilan Google apa pun, dan (b) sync-planner.ts butuh
  // synced_owner_email/google_calendar_id utk memutuskan rute (cleanup di
  // identitas lama, deteksi pindah pemilik) -- satu SELECT dipakai utk
  // keduanya, bukan dua query terpisah.
  const { data: existingSync, error: existingSyncErr } = await supabase
    .from('visit_calendar_sync')
    .select('attempt_count, synced_owner_email, google_calendar_id, google_event_id')
    .eq('activity_id', activityId)
    .maybeSingle() as { data: ExistingSyncRow | null; error: { message: string } | null }

  // Bedakan "tidak ada baris" (existingSync=null, error=null -- AMAN, lanjut
  // sbg kunjungan yang belum pernah disinkron) dari "query gagal" (error
  // terisi -- BERHENTI sebelum menulis apa pun atau memanggil Google).
  if (existingSyncErr) {
    console.error('[sync-visit-calendar] gagal baca visit_calendar_sync:', existingSyncErr.message)
    return json({ error: 'Gagal membaca status sinkron.' }, 500)
  }

  // Jejak "percobaan dimulai" SEBELUM panggilan Google apa pun -- supaya
  // kalau fungsi crash di tengah (jaringan macet, dsb) tetap ada baris
  // dengan attempt_count/last_attempted_at terbaru utk Mas telusuri.
  //
  // CATATAN JUJUR (dilaporkan juga di laporan sesi 2a, tetap berlaku):
  // increment di bawah BUKAN atomik lewat ekspresi SQL
  // "attempt_count = attempt_count + 1" -- itu butuh RPC/UPSERT ON CONFLICT
  // yang tak bisa diekspresikan lewat query builder supabase-js biasa tanpa
  // menulis fungsi SQL baru, dan prompt ini eksplisit dilarang
  // menjalankan/menambah SQL. Pola di bawah (SELECT nilai lama lalu
  // INSERT/UPDATE) punya jendela race yang SANGAT sempit, paling buruk
  // kehilangan satu hitungan attempt_count (murni observabilitas).
  const nowIso = new Date().toISOString()
  if (existingSync) {
    await supabase.from('visit_calendar_sync')
      .update({ sync_status: 'pending', attempt_count: existingSync.attempt_count + 1, last_attempted_at: nowIso })
      .eq('activity_id', activityId)
  } else {
    await supabase.from('visit_calendar_sync')
      .insert({ activity_id: activityId, sync_status: 'pending', attempt_count: 1, last_attempted_at: nowIso })
  }

  const outcome = await syncOneVisit(supabase, activity, existingSync)

  const finalWrite: Record<string, unknown> = { sync_status: outcome.status }
  if (outcome.status === 'synced') {
    finalWrite.google_event_id = outcome.googleEventId
    if (!outcome.keepIdentity) {
      finalWrite.google_calendar_id = outcome.googleCalendarId
      finalWrite.synced_owner_email = outcome.ownerEmail
    }
    finalWrite.synced_at = new Date().toISOString()
    finalWrite.sync_error = outcome.warning ?? null
  } else if (outcome.status === 'skipped') {
    finalWrite.sync_error = outcome.reason
  } else {
    finalWrite.sync_error = outcome.message
  }
  const { error: writeErr } = await supabase
    .from('visit_calendar_sync')
    .update(finalWrite)
    .eq('activity_id', activityId)
  if (writeErr) {
    console.error('[sync-visit-calendar] gagal menulis hasil akhir ke visit_calendar_sync:', writeErr.message)
  }

  const httpStatus = outcome.status === 'error' ? 500 : 200
  return json({ activity_id: activityId, ...outcome }, httpStatus)
}

interface ActivityRow {
  id: string
  type: string
  scheduled_for: string | null
  activity_time: string | null
  status: string
  deleted_at: string | null
  details: Record<string, unknown> | null
  assigned_to: string | null
  account_id: string | null
  accounts: { name: string | null; address: string | null; city: string | null } | null
}

interface ExistingSyncRow {
  attempt_count: number
  synced_owner_email: string | null
  google_calendar_id: string | null
  google_event_id: string | null
}

type ActionResult = { ok: true } | { ok: false; message: string }

// Token akses utk SATU identitas (impersonasi). Kegagalan di sini
// diklasifikasi terpisah (TokenError) dari kegagalan Calendar API --
// pesannya tetap generik, nol detail kredensial.
async function getAuthedAccessToken(
  serviceAccount: ServiceAccountKey,
  ownerEmail: string,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  try {
    const token = await getAccessToken(serviceAccount, ownerEmail)
    return { ok: true, token }
  } catch (e) {
    const msg = e instanceof TokenError ? e.message : 'gagal mendapatkan access token'
    console.error('[sync-visit-calendar] token error:', msg)
    return { ok: false, message: `autentikasi Google gagal (${msg})` }
  }
}

// Satu GET + klasifikasi (sync-planner.ts classifyGetResult) -- dipakai
// KEDUA alur (cleanup & sync/reassign). Status selain 2xx/404/410 (401/403/
// 5xx-sisa-retry/dll) dihentikan DI SINI sebagai error, tidak pernah
// diteruskan ke classifyGetResult (lihat precondition-nya di sync-planner.ts).
async function getClassifiedState(
  accessToken: string,
  identity: Identity,
  eventId: string,
): Promise<{ ok: true; state: GoogleEventState } | { ok: false; message: string }> {
  const res = await getEvent(accessToken, identity.calendarId, eventId)
  if (res.status === 404 || res.status === 410) {
    return { ok: true, state: classifyGetResult(res.status, null) }
  }
  if (res.ok) {
    const parsed = (await res.json().catch(() => null)) as { status?: string } | null
    return { ok: true, state: classifyGetResult(res.status, parsed?.status ?? null) }
  }
  return { ok: false, message: `Google Calendar GET gagal (HTTP ${res.status})` }
}

// Rute 'cleanup' (dan separuh 'reassign' -- identitas LAMA): GET lalu NOOP
// atau DELETE sesuai sync-planner.ts, 404/410 pada DELETE dianggap berhasil.
async function cleanupIdentity(
  serviceAccount: ServiceAccountKey,
  identity: Identity,
  eventId: string,
): Promise<ActionResult> {
  const tok = await getAuthedAccessToken(serviceAccount, identity.ownerEmail)
  if (!tok.ok) return tok
  const got = await getClassifiedState(tok.token, identity, eventId)
  if (!got.ok) return got

  const primary = planAfterGetForCleanup(got.state)
  if (primary.type === 'NOOP') return { ok: true }

  const delRes = await deleteEvent(tok.token, identity.calendarId, eventId)
  const decision = planFallback('DELETE', delRes.status)
  if (decision.type === 'done') return { ok: true }
  if (decision.type === 'error') return { ok: false, message: decision.message }
  // decision.type 'retry_as_put'/'retry_as_insert' tak pernah dihasilkan
  // planFallback utk attempted='DELETE' -- cabang ini murni kelengkapan tipe
  // (union-nya generik lintas ketiga aksi), bukan jalur yang diharapkan
  // tercapai.
  return { ok: false, message: `Google Calendar tolak DELETE (HTTP ${delRes.status})` }
}

// Satu percobaan INSERT/PUT + fallback SATU PUTARAN (sync-planner.ts
// planFallback). Dipakai rute 'sync' dan separuh 'reassign' (identitas BARU).
async function attemptAction(
  accessToken: string,
  identity: Identity,
  eventId: string,
  eventBody: GoogleEventBody,
  action: 'INSERT' | 'PUT',
): Promise<ActionResult> {
  const res = action === 'INSERT'
    ? await insertEvent(accessToken, identity.calendarId, eventId, eventBody)
    : await updateEvent(accessToken, identity.calendarId, eventId, eventBody)
  if (res.ok) return { ok: true }

  const decision = planFallback(action, res.status)
  if (decision.type === 'done') return { ok: true }
  if (decision.type === 'error') return { ok: false, message: decision.message }

  if (decision.type === 'retry_as_put') {
    // "INSERT dibalas 409: GET lalu PUT, sekali saja." GET di sini murni
    // memenuhi instruksi itu secara harfiah -- hasilnya TIDAK mengubah
    // keputusan (PUT selalu dikirim berikutnya; body sudah membawa
    // status:'confirmed', benar utk kedua kemungkinan keadaan Google).
    await getEvent(accessToken, identity.calendarId, eventId)
    const putRes = await updateEvent(accessToken, identity.calendarId, eventId, eventBody)
    return putRes.ok
      ? { ok: true }
      : { ok: false, message: `Google Calendar tolak sinkron setelah fallback PUT (HTTP ${putRes.status})` }
  }

  // decision.type === 'retry_as_insert'
  const insertRes = await insertEvent(accessToken, identity.calendarId, eventId, eventBody)
  return insertRes.ok
    ? { ok: true }
    : { ok: false, message: `Google Calendar tolak sinkron setelah fallback INSERT (HTTP ${insertRes.status})` }
}

async function syncToIdentity(
  serviceAccount: ServiceAccountKey,
  identity: Identity,
  eventId: string,
  eventBody: GoogleEventBody,
): Promise<ActionResult> {
  const tok = await getAuthedAccessToken(serviceAccount, identity.ownerEmail)
  if (!tok.ok) return tok
  const got = await getClassifiedState(tok.token, identity, eventId)
  if (!got.ok) return got
  const primary = planAfterGetForSync(got.state)
  return attemptAction(tok.token, identity, eventId, eventBody, primary.type)
}

async function syncOneVisit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  activity: ActivityRow,
  existingSync: ExistingSyncRow | null,
): Promise<SyncOutcome> {
  const overrideEmail = Deno.env.get('GOOGLE_CALENDAR_TEST_OVERRIDE_EMAIL')
  let effectiveOwnerEmail: string | null = null
  if (overrideEmail) {
    effectiveOwnerEmail = overrideEmail
  } else if (activity.assigned_to) {
    // Tanpa FK activities.assigned_to -> profiles.id (dikonfirmasi ke
    // schema_snapshot.sql -- nol constraint itu), jadi TIDAK BISA di-embed
    // lewat select() di handler(); query terpisah, pola PERSIS
    // fetchCalVisits() di CRMDashboardPage.jsx.
    const { data: prof } = await supabase.from('profiles').select('email').eq('id', activity.assigned_to).maybeSingle()
    effectiveOwnerEmail = prof?.email ?? null
  }
  if (effectiveOwnerEmail && !EMAIL_RE.test(effectiveOwnerEmail)) effectiveOwnerEmail = null

  const currentCalendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary'

  const route = determineRoute({
    visitIsCancelledOrDeleted: activity.status === 'cancelled' || !!activity.deleted_at,
    effectiveOwnerEmail,
    scheduledForPresent: !!activity.scheduled_for,
    syncedOwnerEmail: existingSync?.synced_owner_email ?? null,
    syncedCalendarId: existingSync?.google_calendar_id ?? null,
    currentCalendarId,
  })

  if (route.kind === 'skip') {
    // Koreksi #6: visit yang SUDAH punya google_event_id tersimpan dan
    // sekarang jadi skip (mis. email pemilik hilang) TIDAK membuat kita
    // menghapus event-nya -- rute 'skip' tidak pernah memanggil Google sama
    // sekali, keepIdentity pun tak relevan karena finalWrite utk 'skipped'
    // tidak menyentuh google_event_id/google_calendar_id/synced_owner_email
    // sama sekali (lihat handler()) -- nilai lama (termasuk event id lama
    // yang MASIH berlaku di Google) dibiarkan apa adanya.
    return { status: 'skipped', reason: route.reason }
  }
  if (route.kind === 'noop_already_clean') {
    return { status: 'synced', googleEventId: null, keepIdentity: true }
  }

  // Perbaikan 2a #2 (tetap berlaku): pesan error di cabang ini TIDAK PERNAH
  // menyisipkan (e as Error).message -- pesan bawaan JSON.parse Deno bisa
  // memuat cuplikan teks persis dari secret yang gagal diparse. Setiap
  // cabang membalas string TETAP.
  let serviceAccount: ServiceAccountKey
  const rawServiceAccount = Deno.env.get('GOOGLE_CALENDAR_SA_KEY')
  if (!rawServiceAccount) {
    return { status: 'error', message: 'secret GOOGLE_CALENDAR_SA_KEY kosong' }
  }
  try {
    serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccountKey
  } catch {
    return { status: 'error', message: 'format secret GOOGLE_CALENDAR_SA_KEY tidak valid (bukan JSON service account)' }
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    return { status: 'error', message: 'format secret GOOGLE_CALENDAR_SA_KEY tidak valid (bukan JSON service account)' }
  }

  const eventId = deterministicEventId(activity.id)

  if (route.kind === 'cleanup') {
    const result = await cleanupIdentity(serviceAccount, route.identity, eventId)
    if (!result.ok) return { status: 'error', message: result.message }
    return { status: 'synced', googleEventId: null, keepIdentity: true }
  }

  // route.kind === 'sync' | 'reassign' -- keduanya butuh payload event.
  const nexusAppUrl = Deno.env.get('NEXUS_APP_URL')
  const linkUrl = nexusAppUrl ? `${nexusAppUrl.replace(/\/$/, '')}${CALENDAR_PAGE_PATH}` : CALENDAR_PAGE_PATH
  const details = activity.details ?? {}
  const visitForEvent: VisitForEvent = {
    activityId: activity.id,
    // scheduled_for sudah dipastikan terisi oleh determineRoute
    // (scheduledForPresent) sebelum rute bisa jadi 'sync'/'reassign'.
    scheduledFor: activity.scheduled_for as string,
    activityTime: activity.activity_time,
    accountName: activity.accounts?.name ?? null,
    accountAddress: activity.accounts?.address ?? null,
    accountCity: activity.accounts?.city ?? null,
    detailsLocation: typeof details.location === 'string' ? details.location : null,
    visitTypeCode: typeof details.visit_type === 'string' ? details.visit_type : null,
    pointOfMeeting: typeof details.point_of_meeting === 'string' ? details.point_of_meeting : null,
  }
  const eventBody = buildEventPayload(visitForEvent, linkUrl)

  if (route.kind === 'sync') {
    const result = await syncToIdentity(serviceAccount, route.identity, eventId, eventBody)
    if (!result.ok) return { status: 'error', message: result.message }
    return {
      status: 'synced',
      googleEventId: eventId,
      googleCalendarId: route.identity.calendarId,
      ownerEmail: route.identity.ownerEmail,
    }
  }

  // route.kind === 'reassign'
  // Koreksi #3: kegagalan PERMANEN menghapus di identitas LAMA TIDAK
  // menghentikan proses -- tetap lanjut membuat event di pemilik baru.
  // Keputusan default (diusulkan, dipilih sendiri -- dijelaskan di laporan
  // sesi): hasil akhir TETAP 'synced', peringatan pendek tanpa data
  // sensitif diselipkan ke sync_error walau sinkronnya sendiri berhasil.
  let oldDeleteWarning: string | undefined
  const oldResult = await cleanupIdentity(serviceAccount, route.oldIdentity, eventId)
  if (!oldResult.ok) {
    oldDeleteWarning =
      'event lama tidak terhapus (kemungkinan identitas lama tak lagi berhak/nonaktif) -- dibiarkan, event baru tetap dibuat'
  }

  const newResult = await syncToIdentity(serviceAccount, route.newIdentity, eventId, eventBody)
  if (!newResult.ok) {
    const message = oldDeleteWarning ? `${newResult.message} (juga: ${oldDeleteWarning})` : newResult.message
    return { status: 'error', message }
  }

  return {
    status: 'synced',
    googleEventId: eventId,
    googleCalendarId: route.newIdentity.calendarId,
    ownerEmail: route.newIdentity.ownerEmail,
    warning: oldDeleteWarning,
  }
}

Deno.serve(handler)

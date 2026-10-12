import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Batch DS 3 Lead Management, irisan 8 Paket 2 -- PENANDA STALE. Ganti
// TOTAL dari mekanisme lama (AGING_RULES hardcode per pipeline_stage +
// pindah ke Lead Pool) -- lihat git history versi sebelumnya kalau perlu
// bandingkan. KEPUTUSAN Den: penuaan TIDAK LAGI memindahkan kepemilikan
// atau memasukkan akun ke Lead Pool. Penuaan sekarang HANYA menandai
// accounts.is_stale/stale_flagged_at + notifikasi ke pemilik (assigned_to
// TIDAK PERNAH diubah di sini). Mekanisme Lead Pool (is_in_lead_pool dkk)
// kini SEPENUHNYA dikendalikan jalur lain (lead_pool_sweep_deactivated_owner,
// lead_pool_release/approve_pull/reject_pull -- migrasi 20261012000002).
//
// Ambang (hari diam) dibaca per entitas dari sla_policies (policy_type
// 'lead_aging', code 'LEAD_STALE', migrasi 20261012000005) -- NOL angka
// ambang di-hardcode di sini, beda dari AGING_RULES lama. Entitas tanpa
// kebijakan ini dilewati (dilaporkan di respons), bukan dipakai dengan
// angka tebakan.
//
// Lifecycle yang diproses = HANYA lead/mql (bukan sql/prospect seperti
// PRA_CUSTOMER_LIFECYCLE lama) -- keputusan Den, irisan 8.

const BATCH_SIZE = 1000

type CompanyCfg = { thresholdDays: number; baselineMs: number }
type AccountRow = {
  id: string
  name: string
  assigned_to: string | null
  company_id: string
  last_activity_at: string | null
  stage_changed_at: string | null
  created_at: string | null
}

// Decode payload JWT TANPA verifikasi ulang tanda tangan. Ini aman karena
// config.toml men-set verify_jwt=true untuk fungsi ini -- gateway Supabase
// SUDAH menolak request dengan signature invalid/kedaluwarsa SEBELUM kode
// ini sempat jalan; yang tersisa untuk kita cek hanyalah KLAIM `role` di
// token yang (menurut gateway) sudah sah.
//
// JANGAN membandingkan token ini dengan SUPABASE_SERVICE_ROLE_KEY secara
// string-demi-string -- jadwal pg_cron mengirim kunci dari vault secret
// aging_pipeline_key, dan nilainya TIDAK dijamin sama persis dengan env
// var SUPABASE_SERVICE_ROLE_KEY runtime EF ini (dua secret independen,
// lihat migrasi 20260710000009 header).
//
// Token yang tidak bisa didekode (bukan tiga segmen dipisah '.', payload
// bukan base64url valid, atau bukan JSON valid) mengembalikan null --
// pemanggil membalasnya sebagai 401 (token ditolak), BUKAN 500 (yang
// menyiratkan bug server kita, padahal ini murni masukan tak sah).
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

Deno.serve(async (req) => {
  const role = decodeJwtRole(req.headers.get('Authorization'))
  if (role !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === 'true'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  const dilewati: Array<{ company_id: string; alasan: string }> = []

  // 1. Entitas yang boleh diproses: aging_enabled + is_active + sudah
  //    punya baseline. Tanpa baseline, lead lama akan langsung melewati
  //    ambang massal di hari pertama fitur ini dinyalakan untuk entitas
  //    itu -- lihat komentar kolom companies.aging_baseline_at (migrasi
  //    20261012000001).
  const { data: companies, error: errCompanies } = await supabase
    .from('companies')
    .select('id, aging_baseline_at')
    .eq('aging_enabled', true)
    .eq('is_active', true)

  if (errCompanies) {
    return new Response(JSON.stringify({ error: errCompanies.message }), { status: 500 })
  }

  for (const c of companies ?? []) {
    if (!c.aging_baseline_at) dilewati.push({ company_id: c.id, alasan: 'aging_baseline_at kosong' })
  }
  const withBaseline = (companies ?? []).filter((c) => !!c.aging_baseline_at)

  if (withBaseline.length === 0) {
    return new Response(
      JSON.stringify({ diperiksa: 0, ditandai: 0, direset: 0, gagal: 0, dilewati }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 2. Ambang per entitas dari sla_policies -- NOL angka hardcode.
  const { data: policies, error: errPolicies } = await supabase
    .from('sla_policies')
    .select('company_id, threshold, time_unit')
    .eq('policy_type', 'lead_aging')
    .eq('code', 'LEAD_STALE')
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('company_id', withBaseline.map((c) => c.id))

  if (errPolicies) {
    return new Response(JSON.stringify({ error: errPolicies.message }), { status: 500 })
  }

  const policyByCompany = new Map((policies ?? []).map((p) => [p.company_id, p]))
  const companyCfg = new Map<string, CompanyCfg>()

  for (const c of withBaseline) {
    const p = policyByCompany.get(c.id)
    if (!p) {
      dilewati.push({ company_id: c.id, alasan: 'kebijakan LEAD_STALE tidak ada' })
      continue
    }
    // Cuma 'day' yang didukung -- 14 (threshold Task 1) selalu 'day'.
    // Unit lain dilewati (bukan ditebak konversinya) sampai ada kebutuhan
    // nyata + aturan konversi yang disepakati.
    if (p.time_unit !== 'day') {
      dilewati.push({ company_id: c.id, alasan: `time_unit '${p.time_unit}' tidak didukung` })
      continue
    }
    companyCfg.set(c.id, { thresholdDays: p.threshold, baselineMs: new Date(c.aging_baseline_at).getTime() })
  }

  const eligibleIds = [...companyCfg.keys()]
  if (eligibleIds.length === 0) {
    return new Response(
      JSON.stringify({ diperiksa: 0, ditandai: 0, direset: 0, gagal: 0, dilewati }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 3. Sinyal dokumen (inquiries/quotations) -- pola BATCH yang sudah ada
  //    di versi sebelumnya fungsi ini: dua query DI LUAR loop per akun,
  //    limit 1000 masing-masing diurut updated_at DESC. Kalau terpotong,
  //    yang hilang baris PALING LAMA -- akun yang benar-benar baru
  //    tersentuh selalu ikut terbawa. SENGAJA TIDAK ikut di-range-loop
  //    seperti kandidat accounts di bawah (poin 9 instruksi khusus
  //    menyebut "kandidat", bukan lookup bantu ini).
  const [inqRes, quoRes] = await Promise.all([
    supabase.from('inquiries')
      .select('prospect_id, customer_id, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabase.from('quotations')
      .select('prospect_id, customer_id, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1000),
  ])

  if (inqRes.error || quoRes.error) {
    return new Response(
      JSON.stringify({ error: (inqRes.error ?? quoRes.error)!.message }),
      { status: 500 }
    )
  }

  const sinyalDokumen = new Map<string, number>()
  const catatDokumen = (accId: string | null, iso: string | null) => {
    if (!accId || !iso) return
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return
    if (t > (sinyalDokumen.get(accId) ?? 0)) sinyalDokumen.set(accId, t)
  }
  for (const r of [...(inqRes.data ?? []), ...(quoRes.data ?? [])]) {
    catatDokumen(r.prospect_id, r.updated_at)
    catatDokumen(r.customer_id, r.updated_at)
  }

  // Waktu terakhir disentuh, EFEKTIF: diukur dari yang paling baru di
  // antara last_activity_at/stage_changed_at/created_at/sinyal dokumen,
  // TAPI tidak pernah lebih lama dari aging_baseline_at entitasnya --
  // itulah yang mencegah lead lama ditandai stale massal di hari pertama.
  function diamHari(row: AccountRow): number {
    const cfg = companyCfg.get(row.company_id)!
    const tglAktivitas = row.last_activity_at ? new Date(row.last_activity_at).getTime() : 0
    const tglStage = row.stage_changed_at ? new Date(row.stage_changed_at).getTime() : 0
    const tglBuat = row.created_at ? new Date(row.created_at).getTime() : 0
    const tglDokumen = sinyalDokumen.get(row.id) ?? 0
    const terakhir = Math.max(tglAktivitas, tglStage, tglBuat, tglDokumen)
    const efektif = Math.max(terakhir, cfg.baselineMs)
    return Math.floor((now.getTime() - efektif) / (1000 * 60 * 60 * 24))
  }

  // Range-loop sampai habis -- JANGAN berhenti di 1000 baris (poin 9).
  // .order('id') murni untuk pagination DETERMINISTIK (tanpa order,
  // urutan antar-halaman tidak dijamin stabil -> baris bisa terlewat
  // atau terbaca dua kali).
  async function fetchAllCandidates(extra: (q: any) => any): Promise<AccountRow[]> {
    const out: AccountRow[] = []
    let from = 0
    for (;;) {
      let q = supabase.from('accounts')
        .select('id, name, assigned_to, company_id, last_activity_at, stage_changed_at, created_at')
        .in('company_id', eligibleIds)
        .in('lifecycle_stage', ['lead', 'mql'])
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, from + BATCH_SIZE - 1)
      q = extra(q)
      const { data, error } = await q
      if (error) throw error
      out.push(...((data ?? []) as AccountRow[]))
      if (!data || data.length < BATCH_SIZE) break
      from += BATCH_SIZE
    }
    return out
  }

  let flagRows: AccountRow[] = []
  let resetRows: AccountRow[] = []
  try {
    // Kandidat TANDAI -- is_stale masih false, pool false, berpemilik, aktif.
    flagRows = await fetchAllCandidates((q) =>
      q.eq('is_in_lead_pool', false).not('assigned_to', 'is', null).eq('is_active', true).eq('is_stale', false)
    )
    // Kandidat RESET -- SENGAJA TIDAK ikut mensyaratkan is_in_lead_pool/
    // assigned_to/is_active seperti pass TANDAI (Risiko #2, disetujui
    // Den): tanda yang sudah tidak berlaku lebih dari ambang waktu
    // dibersihkan terlepas dari status pool/kepemilikan saat ini.
    resetRows = await fetchAllCandidates((q) => q.eq('is_stale', true))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }

  const kandidatTandai = flagRows.filter((r) => diamHari(r) > companyCfg.get(r.company_id)!.thresholdDays)
  const kandidatReset = resetRows.filter((r) => diamHari(r) <= companyCfg.get(r.company_id)!.thresholdDays)

  // Mode kering: laporkan per entitas, jangan tulis apa pun.
  if (dryRun) {
    const perEntitas: Record<string, { akan_ditandai: number; akan_direset: number }> = {}
    for (const id of eligibleIds) perEntitas[id] = { akan_ditandai: 0, akan_direset: 0 }
    for (const r of kandidatTandai) perEntitas[r.company_id].akan_ditandai++
    for (const r of kandidatReset) perEntitas[r.company_id].akan_direset++
    return new Response(
      JSON.stringify({
        dry_run: true,
        diperiksa: flagRows.length + resetRows.length,
        akan_ditandai: kandidatTandai.length,
        akan_direset: kandidatReset.length,
        per_entitas: perEntitas,
        dilewati,
      }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let ditandai = 0
  let direset = 0
  let gagal = 0

  for (const r of kandidatTandai) {
    const hari = diamHari(r)
    const { error: errUpdate } = await supabase
      .from('accounts')
      .update({ is_stale: true, stale_flagged_at: now.toISOString() })
      .eq('id', r.id)

    if (errUpdate) {
      console.error(`Gagal menandai ${r.id}:`, errUpdate.message)
      gagal++
      continue
    }
    ditandai++

    if (r.assigned_to) {
      const { error: errNotif } = await supabase
        .from('notifications')
        .insert({
          company_id: r.company_id,
          user_id: r.assigned_to,
          event_type: 'crm.lead_stale',
          title: 'Lead perlu ditindaklanjuti',
          body: `${r.name} sudah diam ${hari} hari.`,
          reference_type: 'account',
          reference_id: r.id,
          is_read: false,
        })

      if (errNotif) {
        console.error(`Gagal mengirim notifikasi untuk ${r.id}:`, errNotif.message)
      }
    }
  }

  // Bersihkan tanda yang sudah tidak berlaku -- TANPA notifikasi (poin 8).
  for (const r of kandidatReset) {
    const { error: errReset } = await supabase
      .from('accounts')
      .update({ is_stale: false, stale_flagged_at: null })
      .eq('id', r.id)

    if (errReset) {
      console.error(`Gagal mereset ${r.id}:`, errReset.message)
      gagal++
      continue
    }
    direset++
  }

  return new Response(
    JSON.stringify({
      diperiksa: flagRows.length + resetRows.length,
      ditandai,
      direset,
      gagal,
      dilewati,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})

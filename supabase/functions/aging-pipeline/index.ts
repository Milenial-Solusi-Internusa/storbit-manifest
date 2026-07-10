import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Batas hari per stage. Lead yang diam lebih lama dari ini masuk Lead Pool.
const AGING_RULES: Record<string, number> = {
  NEW: 7,
  CONTACTED: 5,
  QUALIFIED: 5,
  PROPOSAL: 3,
  NEGOTIATION: 14,
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === 'true'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const stages = Object.keys(AGING_RULES)

  // Hanya entitas dengan aging_enabled=true yang lead-nya boleh dipindahkan.
  // EF memakai service role key sehingga menembus RLS — filter ini WAJIB eksplisit.
  const { data: companies, error: errCompanies } = await supabase
    .from("companies")
    .select("id")
    .eq("aging_enabled", true)
    .eq("is_active", true)

  if (errCompanies) {
    return new Response(JSON.stringify({ error: errCompanies.message }), { status: 500 })
  }

  const companyIds = (companies ?? []).map((c) => c.id)
  if (companyIds.length === 0) {
    return new Response(
      JSON.stringify({ pesan: "Tak ada entitas dengan aging_enabled=true", diperiksa: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  const { data: prospects, error } = await supabase
    .from('accounts')
    .select('id, name, pipeline_stage, stage_changed_at, last_activity_at, assigned_to, company_id')
    .eq('is_in_lead_pool', false)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('pipeline_stage', stages)
    .in('company_id', companyIds)
    .limit(1000)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const now = new Date()
  const kandidat: Array<Record<string, unknown>> = []

  for (const p of prospects ?? []) {
    const limit = AGING_RULES[p.pipeline_stage]
    if (!limit) continue

    // Lead dianggap "disentuh" kalau stage-nya naik ATAU ada aktivitas tercatat.
    // Ambil yang paling baru di antara keduanya.
    const tglStage = p.stage_changed_at ? new Date(p.stage_changed_at).getTime() : 0
    const tglAktivitas = p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0
    const terakhirDisentuh = Math.max(tglStage, tglAktivitas)

    if (terakhirDisentuh === 0) continue // tak ada acuan waktu, lewati

    const diamHari = Math.floor((now.getTime() - terakhirDisentuh) / (1000 * 60 * 60 * 24))
    if (diamHari <= limit) continue

    kandidat.push({
      id: p.id,
      nama: p.name,
      stage: p.pipeline_stage,
      diam_hari: diamHari,
      assigned_to: p.assigned_to,
      company_id: p.company_id,
    })
  }

  // Mode kering: laporkan siapa yang memenuhi syarat, jangan pindahkan apa pun.
  if (dryRun) {
    return new Response(
      JSON.stringify({
        dry_run: true,
        diperiksa: prospects?.length ?? 0,
        memenuhi_syarat: kandidat.length,
        per_stage: kandidat.reduce((acc: Record<string, number>, k) => {
          const s = k.stage as string
          acc[s] = (acc[s] ?? 0) + 1
          return acc
        }, {}),
        daftar: kandidat,
      }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let dipindahkan = 0

  for (const k of kandidat) {
    const { error: errUpdate } = await supabase
      .from('accounts')
      .update({
        is_in_lead_pool: true,
        account_status: 'lead_pool',
        lead_pool_at: now.toISOString(),
        lead_pool_reason: `Aging ${k.diam_hari} hari di stage ${k.stage}`,
      })
      .eq('id', k.id)

    if (errUpdate) {
      console.error(`Gagal memindahkan ${k.id}:`, errUpdate.message)
      continue
    }
    dipindahkan++

    if (k.assigned_to) {
      const { error: errNotif } = await supabase
        .from('notifications')
        .insert({
          company_id: k.company_id,
          user_id: k.assigned_to,
          event_type: 'crm.lead_idle',
          title: 'Prospect Masuk Lead Pool',
          body: `${k.nama} diam ${k.diam_hari} hari di stage ${k.stage} dan dipindahkan ke Lead Pool.`,
          reference_type: 'account',
          reference_id: k.id,
          is_read: false,
        })

      if (errNotif) {
        console.error(`Gagal mengirim notifikasi untuk ${k.id}:`, errNotif.message)
      }
    }
  }

  return new Response(
    JSON.stringify({
      diperiksa: prospects?.length ?? 0,
      dipindahkan,
      gagal: kandidat.length - dipindahkan,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})

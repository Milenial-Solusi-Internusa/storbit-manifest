import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AGING_RULES: Record<string, number> = {
  CONTACTED: 5,
  QUALIFIED: 5,
  PROPOSAL: 3,
  NEGOTIATION: 14,
}

const PREV_STAGE: Record<string, string> = {
  CONTACTED: 'NEW',
  QUALIFIED: 'CONTACTED',
  PROPOSAL: 'QUALIFIED',
  NEGOTIATION: 'PROPOSAL',
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const stages = Object.keys(AGING_RULES)

  const { data: prospects, error } = await supabase
    .from('accounts')
    .select('id, pipeline_stage, stage_changed_at, assigned_to, company_id, name')
    .eq('is_in_lead_pool', false)
    .eq('is_active', true)
    .in('pipeline_stage', stages)
    .limit(1000)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const now = new Date()
  const toPool: string[] = []

  for (const p of prospects ?? []) {
    const limit = AGING_RULES[p.pipeline_stage]
    if (!limit) continue
    const changedAt = new Date(p.stage_changed_at)
    const diffDays = (now.getTime() - changedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > limit) {
      toPool.push(p.id)

      // Update ke lead pool
      await supabase
        .from('accounts')
        .update({
          is_in_lead_pool: true,
          lead_pool_at: now.toISOString(),
          lead_pool_reason: `Aging ${Math.floor(diffDays)} hari di stage ${p.pipeline_stage}`,
        })
        .eq('id', p.id)

      // Kirim notifikasi ke sales (assigned_to)
      if (p.assigned_to) {
        await supabase
          .from('notifications')
          .insert({
            company_id: p.company_id,
            user_id: p.assigned_to,
            title: 'Prospect Masuk Lead Pool',
            message: `${p.name} telah aging di stage ${p.pipeline_stage} dan dipindahkan ke Lead Pool.`,
            type: 'warning',
            is_read: false,
          })
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: prospects?.length, moved_to_pool: toPool.length }),
    { status: 200 }
  )
})
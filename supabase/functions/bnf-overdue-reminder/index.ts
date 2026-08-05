// supabase/functions/bnf-overdue-reminder/index.ts
// Reminder harian otomatis untuk laporan BNF yang target_date-nya sudah lewat
// dan belum Closed. Dijadwalkan via pg_cron (lihat migrasi pg_cron_bnf_overdue_
// reminder) — tidak pernah dipanggil dari browser. Struktur meniru
// aging-pipeline/index.ts (Deno.serve native, 1 client service-role, dry_run
// via query string, {data,error} manual per query, kegagalan per-baris
// di-console.error dan lanjut, bukan fatal).
//
// Beda dari aging-pipeline: fase ini KIRIM EMAIL. send-email/index.ts tidak
// bisa dipanggil server-to-server (auth modelnya butuh JWT user asli lewat
// callerClient.auth.getUser(), bukan service-role Bearer dari pg_net) — jadi
// function ini relay ke Resend API langsung, meniru blok "Relay to Resend"
// milik send-email/index.ts tanpa melewatinya.
//
// Tidak ada state "sudah pernah diingatkan" (keputusan produk, Fase E) —
// granularitas "1x/hari selama overdue" murni datang dari cron yang jalan
// 1x/hari, bukan dedup logic. Re-run manual (mis. testing) akan kirim ulang.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c])
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === 'true'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date().toISOString().slice(0, 10)

  const { data: overdueReports, error } = await supabase
    .from('bnf_reports')
    .select('id, report_no, description, target_date, department_id')
    .lt('target_date', today)
    .neq('status', 'Closed')
    .is('deleted_at', null)
    .limit(1000)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!overdueReports || overdueReports.length === 0) {
    return new Response(
      JSON.stringify({ diperiksa: 0, dikirim: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Batch-resolve department -> head email dalam 1 query (hindari N+1),
  // gaya sama dengan aging-pipeline's document-signal batch fetch.
  const departmentIds = [...new Set(overdueReports.map((r) => r.department_id).filter(Boolean))]
  const { data: departments, error: deptErr } = await supabase
    .from('bnf_departments')
    .select('id, head_profile_id, profiles(email)')
    .in('id', departmentIds)

  if (deptErr) {
    return new Response(JSON.stringify({ error: deptErr.message }), { status: 500 })
  }

  const emailByDept = new Map<string, string>()
  for (const d of departments ?? []) {
    const email = (d as { profiles?: { email?: string } }).profiles?.email
    if (email) emailByDept.set(d.id, email)
  }

  if (dryRun) {
    return new Response(
      JSON.stringify({
        dry_run: true,
        diperiksa: overdueReports.length,
        akan_dikirim: overdueReports.filter((r) => emailByDept.has(r.department_id)).length,
        daftar: overdueReports.map((r) => ({
          report_no: r.report_no,
          target_date: r.target_date,
          department_id: r.department_id,
          punya_kepala_departemen: emailByDept.has(r.department_id),
        })),
      }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('[bnf-overdue-reminder] RESEND_API_KEY is not set.')
    return new Response(JSON.stringify({ error: 'Email service not configured.' }), { status: 500 })
  }
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Nexus by MSI <onboarding@resend.dev>'

  let dikirim = 0
  let gagal = 0

  for (const r of overdueReports) {
    const email = emailByDept.get(r.department_id)
    if (!email) {
      console.warn(`[bnf-overdue-reminder] no head_profile_id set for department ${r.department_id} — reminder skipped for report ${r.report_no}`)
      continue
    }

    const hariTerlambat = Math.floor(
      (Date.now() - new Date(r.target_date + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24)
    )
    const subject = `[TERLAMBAT ${hariTerlambat} Hari] Laporan BNF — ${r.report_no}`
    const html = `<p>Halo,</p><p>Laporan BNF <strong>${escapeHtml(r.report_no)}</strong> sudah melewati target penyelesaian (${escapeHtml(r.target_date)}), terlambat <strong>${hariTerlambat} hari</strong>:</p><p>${escapeHtml((r.description || '').slice(0, 300))}</p><p><a href="https://nexus.msigroup.co.id">Buka Nexus</a> untuk melihat detail laporan.</p><p style="color:#7A828E;font-size:12px;margin-top:24px;">Email otomatis dari Nexus by MSI — reminder harian selama laporan masih terlambat dan belum Closed.</p>`

    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: email, subject, html }),
      })
      if (resendRes.ok) {
        dikirim++
      } else {
        gagal++
        const errBody = await resendRes.json().catch(() => null)
        console.error(`[bnf-overdue-reminder] Resend gagal untuk ${r.report_no}:`, errBody)
      }
    } catch (e) {
      gagal++
      console.error(`[bnf-overdue-reminder] fetch gagal untuk ${r.report_no}:`, e)
    }
  }

  return new Response(
    JSON.stringify({ diperiksa: overdueReports.length, dikirim, gagal }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})

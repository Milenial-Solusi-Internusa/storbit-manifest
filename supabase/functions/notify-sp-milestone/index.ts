// supabase/functions/notify-sp-milestone/index.ts
// Event-driven email notifier for 4 SP status milestones (CONFIRMED,
// BTB_TERBIT, SUBMITTED, CANCELLED) — internal-only (operations/
// finance_controller/sales roles + SP creator on CANCELLED). Customer/DC
// contacts deliberately NOT included yet (contacts table has no usable
// data for Storbit's 45 DCs — checked 14 Aug 2026).
//
// Triggered SYNCHRONOUSLY via net.http_post from inside
// sp_recompute_status/set_sp_status at the exact moment of transition —
// NOT pg_cron (contrast with aging-pipeline/bnf-overdue-reminder, which
// poll on a timer; this fires once, on the actual DB write).
//
// send-email/index.ts can't be used here: it requires a real user JWT via
// callerClient.auth.getUser(), which a service-role Bearer token from
// pg_net doesn't satisfy. This relays to Resend directly instead — same
// workaround bnf-overdue-reminder/index.ts already uses.
//
// notification_rules is deliberately NOT consulted (checked 14 Aug 2026:
// zero consumers anywhere in this codebase, every real notifier hardcodes
// its own recipient logic — this follows that established pattern rather
// than becoming the table's first consumer).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', CONFIRMED: 'Dikonfirmasi', MENUNGGU_STOK: 'Menunggu Stok',
  PICKING: 'Picking', PACKED: 'Packed', DIKIRIM: 'Dikirim', SAMPAI: 'Sampai',
  TERKIRIM_PENUH: 'Terkirim Penuh', BTB_TERBIT: 'BTB Terbit', INVOICED: 'Invoiced',
  SUBMITTED: 'Submitted', LUNAS: 'Lunas', CANCELLED: 'Dibatalkan',
}

const MILESTONE_ROLES: Record<string, string[]> = {
  CONFIRMED: ['operations'],
  BTB_TERBIT: ['finance_controller'],
  SUBMITTED: ['finance_controller', 'sales'],
  CANCELLED: ['operations', 'finance_controller', 'sales'],
}

const BADGE: Record<string, { bg: string; text: string; label: string; detail3Label: string }> = {
  CONFIRMED: { bg: '#E6F1FB', text: '#0C447C', label: 'SP DIKONFIRMASI', detail3Label: 'Total Item' },
  BTB_TERBIT: { bg: '#FDEBE3', text: '#993C1D', label: 'BTB TERBIT', detail3Label: 'No. BTB' },
  SUBMITTED: { bg: '#EAF3DE', text: '#3B6D11', label: 'INVOICE TERKIRIM', detail3Label: 'No. Invoice' },
  CANCELLED: { bg: '#FCEBEB', text: '#A32D2D', label: 'SP DIBATALKAN', detail3Label: 'Alasan' },
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c])
}

// Markup identical to template.html (co-located in this same directory —
// keep both in sync manually if you edit either; no build step links them).
// {{token}} legend and per-milestone badge color/label table live as
// comments in template.html, not duplicated here.
const TEMPLATE = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE3; padding:24px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#F6EFE3; border-radius:8px; font-family:Arial,Helvetica,sans-serif;">

<tr><td style="background:#144682; padding:20px 28px; border-radius:8px 8px 0 0;">
<div style="color:#FFFFFF; font-size:18px; font-weight:bold;">NEXUS</div>
<div style="color:#B8CBE8; font-size:11px; margin-top:2px;">by MSI Group &middot; Storbit Logistics</div>
</td></tr>

<tr><td style="padding:28px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:8px; border:1px solid #C9B896;">
<tr><td style="padding:24px;">

<table cellpadding="0" cellspacing="0"><tr><td style="background:{{badge_bg}}; color:{{badge_text}}; font-size:12px; font-weight:bold; padding:5px 12px; border-radius:20px;">{{badge_label}}</td></tr></table>
<div style="height:14px; line-height:14px; font-size:1px;">&nbsp;</div>

<div style="font-size:13px; color:#8A8578;">Sales Pesanan</div>
<div style="font-size:24px; font-weight:bold; color:#1A1A1A; margin:2px 0 16px;">SP {{sp_no}}</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE3; border-radius:6px; margin-bottom:16px;">
<tr><td style="padding:10px 14px; font-size:13px; color:#8A8578;">{{old_status_label}} &nbsp;&rarr;&nbsp; <span style="color:{{badge_text}}; font-weight:bold;">{{new_status_label}}</span></td></tr>
</table>

<table width="100%" cellpadding="4" cellspacing="0" style="font-size:13px;">
<tr><td style="color:#8A8578;">Customer</td><td align="right" style="color:#1A1A1A;">{{customer}}</td></tr>
<tr><td style="color:#8A8578;">DC Tujuan</td><td align="right" style="color:#1A1A1A;">{{dc}}</td></tr>
<tr><td style="color:#8A8578;">{{detail3_label}}</td><td align="right" style="color:#1A1A1A;">{{detail3_value}}</td></tr>
<tr><td style="color:#8A8578;">Waktu</td><td align="right" style="color:#1A1A1A;">{{timestamp}}</td></tr>
</table>

<div style="height:16px; line-height:16px; font-size:1px;">&nbsp;</div>
<a href="{{detail_url}}" style="display:block; background:#E85A1E; color:#FFFFFF; font-size:14px; font-weight:bold; text-decoration:none; padding:13px; border-radius:6px; text-align:center;">Lihat detail di Nexus</a>

</td></tr>
</table>
</td></tr>

<tr><td style="text-align:center; padding:0 28px 22px; font-size:11px; color:#8A8578;">Email otomatis dari sistem Nexus. Jangan dibalas ke alamat ini.</td></tr>

</table>
</td></tr>
</table>`

function render(tpl: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce((html, [k, v]) => html.replaceAll(`{{${k}}}`, v ?? ''), tpl)
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => null)
  const sp_order_id = body?.sp_order_id
  const milestone = body?.milestone
  const old_status = body?.old_status
  const new_status = body?.new_status

  if (!sp_order_id || !milestone || !MILESTONE_ROLES[milestone]) {
    return new Response(JSON.stringify({ error: 'invalid payload: sp_order_id and a known milestone are required' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: sp, error: spErr } = await supabase
    .from('sp_orders')
    .select('id, sp_no, company_id, customer_id, dc_id, created_by, cancel_reason, accounts(name), dc_master(nama)')
    .eq('id', sp_order_id)
    .single()
  if (spErr || !sp) {
    return new Response(JSON.stringify({ error: spErr?.message ?? 'SP not found' }), { status: 404 })
  }

  // Milestone-specific detail3 value.
  let detail3Value = '—'
  if (milestone === 'CONFIRMED') {
    const { data } = await supabase.from('sp_order_items').select('qty').eq('sp_order_id', sp_order_id)
    detail3Value = String((data ?? []).reduce((s: number, r: { qty: number }) => s + (Number(r.qty) || 0), 0))
  } else if (milestone === 'BTB_TERBIT') {
    const { data } = await supabase
      .from('sp_btb').select('btb_no').eq('sp_order_id', sp_order_id)
      .is('deleted_at', null).order('received_at', { ascending: false }).limit(1).maybeSingle()
    detail3Value = data?.btb_no ?? '—'
  } else if (milestone === 'SUBMITTED') {
    const { data } = await supabase
      .from('sp_invoices').select('invoice_no').eq('sp_order_id', sp_order_id)
      .eq('status', 'submitted').maybeSingle()
    detail3Value = data?.invoice_no ?? '—'
  } else if (milestone === 'CANCELLED') {
    detail3Value = sp.cancel_reason ?? '—'
  }

  // Role-based recipients. user_roles.user_id FKs to auth.users(id), NOT
  // profiles(id) directly (verified 14 Aug 2026) — so this is 2 queries,
  // not a single PostgREST embed.
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('user_id, is_active, valid_until, roles!inner(code, company_id)')
    .eq('roles.company_id', sp.company_id)
    .in('roles.code', MILESTONE_ROLES[milestone])
    .eq('is_active', true)

  const today = new Date().toISOString().slice(0, 10)
  const userIds = [...new Set(
    (roleRows ?? [])
      .filter((r: { valid_until: string | null }) => !r.valid_until || r.valid_until >= today)
      .map((r: { user_id: string }) => r.user_id),
  )]

  const recipients = new Set<string>()
  if (userIds.length) {
    const { data: people } = await supabase.from('profiles').select('email').in('id', userIds)
    for (const p of people ?? []) if (p.email) recipients.add(p.email)
  }

  // CANCELLED also notifies whoever created the SP, in addition to the roles above.
  if (milestone === 'CANCELLED' && sp.created_by) {
    const { data: creator } = await supabase.from('profiles').select('email').eq('id', sp.created_by).maybeSingle()
    if (creator?.email) recipients.add(creator.email)
  }

  if (recipients.size === 0) {
    return new Response(
      JSON.stringify({ milestone, sp_no: sp.sp_no, dikirim: 0, alasan: 'no recipients resolved' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const html = render(TEMPLATE, {
    sp_no: sp.sp_no,
    customer: sp.accounts?.name ?? '—',
    dc: sp.dc_master?.nama ?? '—',
    timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
    detail_url: 'https://nexus.msigroup.co.id',
    old_status_label: STATUS_LABELS[old_status] ?? old_status ?? '—',
    new_status_label: STATUS_LABELS[new_status] ?? new_status ?? '—',
    badge_bg: BADGE[milestone].bg,
    badge_text: BADGE[milestone].text,
    badge_label: BADGE[milestone].label,
    detail3_label: BADGE[milestone].detail3Label,
    detail3_value: escapeHtml(detail3Value),
  })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('[notify-sp-milestone] RESEND_API_KEY is not set.')
    return new Response(JSON.stringify({ error: 'Email service not configured.' }), { status: 500 })
  }
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Nexus by MSI <onboarding@resend.dev>'

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [...recipients],
        subject: `${BADGE[milestone].label} — SP ${sp.sp_no}`,
        html,
      }),
    })
    const dikirim = resendRes.ok
    if (!dikirim) {
      const errBody = await resendRes.json().catch(() => null)
      console.error('[notify-sp-milestone] Resend gagal:', errBody)
    }
    return new Response(
      JSON.stringify({ milestone, sp_no: sp.sp_no, recipients: recipients.size, dikirim: dikirim ? recipients.size : 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[notify-sp-milestone] fetch gagal:', e)
    return new Response(JSON.stringify({ error: 'Resend request failed' }), { status: 502 })
  }
})

// supabase/functions/send-email/index.ts
// Generic transactional email relay via Resend. Takes {to, subject, html} and
// forwards to Resend's API — no business-logic/content decisions here, callers
// (e.g. InquiryChatter.jsx) build the subject/body themselves.
//
// Security model:
//   - Requires Authorization header (Supabase anon-key JWT from the calling
//     user) and verifies it resolves to a real authenticated user.
//   - Unlike create-user/delete-user/reset-password, this does NOT require an
//     elevated role (no is_super_admin() check) — sending a notification email
//     isn't a privileged action, same permissiveness as RLS `notifications_insert`
//     (WITH CHECK (true), any authenticated user may notify any other user).
//   - RESEND_API_KEY read from Deno.env.get() (Supabase Function Secret) —
//     never exposed to the frontend.
//
// Flow:
//   1. Parse + validate input (to, subject, html)
//   2. Verify caller is an authenticated Supabase user
//   3. POST to https://api.resend.com/emails using RESEND_API_KEY
//   4. Return { id } on success, { error: string } on failure

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Parse and validate ──────────────────────────────────────────────
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Invalid JSON body.' }, 400)

    const { to, subject, html } = body
    if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ error: 'Valid "to" email is required.' }, 400)
    }
    if (typeof subject !== 'string' || !subject.trim()) {
      return json({ error: '"subject" is required.' }, 400)
    }
    if (typeof html !== 'string' || !html.trim()) {
      return json({ error: '"html" is required.' }, 400)
    }

    // ── 2. Verify caller is an authenticated user (no elevated role needed) ─
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized.' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized.' }, 401)

    // ── 3. Relay to Resend ───────────────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('[send-email] RESEND_API_KEY is not set.')
      return json({ error: 'Email service not configured.' }, 500)
    }
    // Defaults to Resend's built-in test sender so this works before a custom
    // sending domain is verified in Resend. Override via `supabase secrets set
    // RESEND_FROM_EMAIL="..."` once a domain is verified — no redeploy needed.
    const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Nexus by MSI <onboarding@resend.dev>'

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    })

    const resendData = await resendRes.json().catch(() => null)
    if (!resendRes.ok) {
      console.error('[send-email] Resend API error:', resendData)
      return json({ error: resendData?.message ?? 'Failed to send email.' }, 502)
    }

    return json({ id: resendData?.id }, 200)

  } catch (err) {
    console.error('[send-email] unexpected error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

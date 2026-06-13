// supabase/functions/reset-password/index.ts
// Resets a Supabase Auth user's password to a new value chosen by an admin.
// Called only by super_admin users from the Admin → User Access page.
//
// Security model:
//   - Requires Authorization header (Supabase anon-key JWT from the calling user)
//   - Verifies the caller is is_super_admin() before proceeding
//   - Uses SUPABASE_SERVICE_ROLE_KEY (injected by Supabase Edge runtime — never
//     exposed to the frontend) for the password update — bypasses RLS so super_admin
//     can reset any user's password in any company.
//
// Flow:
//   1. Parse + validate input (user_id, new_password — min 8 chars)
//   2. Verify caller is super_admin via is_super_admin() RPC
//   3. auth.admin.updateUserById() → set the new password (service role)
//   4. Return { success: true } on success, { error: string } on failure

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

    const { user_id, new_password } = body
    if (!user_id || typeof user_id !== 'string') {
      return json({ error: 'user_id is required.' }, 400)
    }
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400)
    }

    // ── 2. Verify caller is super_admin ────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized.' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: isSuperAdmin, error: roleErr } = await callerClient.rpc('is_super_admin')
    if (roleErr || !isSuperAdmin) {
      return json({ error: 'Forbidden. Only super admin can reset passwords.' }, 403)
    }

    // ── 3. Reset the password (service-role client) ────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    )

    if (updateErr) {
      console.error('[reset-password] password update failed:', updateErr.message)
      return json({ error: updateErr.message ?? 'Failed to reset password.' }, 400)
    }

    return json({ success: true }, 200)

  } catch (err) {
    console.error('[reset-password] unexpected error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

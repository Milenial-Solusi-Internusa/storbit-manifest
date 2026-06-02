// supabase/functions/create-user/index.ts
// Creates a new Supabase Auth user and updates their profile row.
// Called only by super_admin users from the Admin → User Access page.
//
// Security model:
//   - Requires Authorization header (Supabase anon-key JWT from the calling user)
//   - Verifies the caller is is_super_admin() before proceeding
//   - Uses SUPABASE_SERVICE_ROLE_KEY (injected by Supabase Edge runtime — never
//     exposed to the frontend) to call auth.admin.createUser()
//
// Flow:
//   1. Parse + validate input fields
//   2. Verify caller is super_admin via is_super_admin() RPC
//   3. auth.admin.createUser() → handle_new_user() trigger auto-inserts profiles row
//   4. UPDATE profiles SET full_name, role, company_id WHERE id = newUserId
//   5. Return { id: uuid } on success, { error: string } on failure
//
// Email confirmation: email_confirm: true — user can log in immediately.
// Password: enforced min 8 chars at caller side; raw value passed to Supabase Auth.

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

    const { email, password, full_name, role, company_id } = body

    if (!email || !password || !full_name || !role || !company_id) {
      return json({ error: 'email, password, full_name, role, and company_id are all required.' }, 400)
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid email format.' }, 400)
    }
    if (typeof password !== 'string' || password.length < 8) {
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
      return json({ error: 'Forbidden. Only super admin can create users.' }, 403)
    }

    // ── 3. Create the auth user (service-role client) ──────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,         // user can log in immediately — no email verification step
      user_metadata: {
        // Passed so handle_new_user() trigger already gets full_name on INSERT.
        // The UPDATE at step 4 also sets it — this is defense-in-depth so the
        // profile is never left with an empty name if the UPDATE were to fail.
        full_name: full_name.trim(),
      },
    })

    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? 'Failed to create auth user.' }, 400)
    }

    const userId = created.user.id

    // ── 4. Update the profile row inserted by handle_new_user() trigger ────
    // The trigger already inserted the row with MSI/HO/IT defaults.
    // We override with the values the admin provided.
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({
        full_name: full_name.trim(),
        role,        // legacy enum: super | logistic | procurement | finance | management
        company_id,
      })
      .eq('id', userId)

    if (profileErr) {
      // Auth user exists — partial success.
      // Admin can fix via Edit modal; user can still log in.
      console.error('[create-user] profile update failed:', profileErr.message)
      return json({
        id: userId,
        warning: 'User created but profile update failed. Use the Edit modal to set company and role.',
      }, 201)
    }

    return json({ id: userId }, 201)

  } catch (err) {
    console.error('[create-user] unexpected error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

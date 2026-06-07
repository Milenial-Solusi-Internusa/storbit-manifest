// supabase/functions/create-user/index.ts
// Creates a new Supabase Auth user, updates their profile row, and assigns ERP role.
// Called only by super_admin users from the Admin → User Access page.
//
// Security model:
//   - Requires Authorization header (Supabase anon-key JWT from the calling user)
//   - Verifies the caller is is_super_admin() before proceeding
//   - Uses SUPABASE_SERVICE_ROLE_KEY (injected by Supabase Edge runtime — never
//     exposed to the frontend) for all write operations — bypasses RLS so super_admin
//     can create users and assign roles in any company.
//
// Flow:
//   1. Parse + validate input fields
//   2. Verify caller is super_admin via is_super_admin() RPC
//   3. auth.admin.createUser() → handle_new_user() trigger auto-inserts profiles row
//   4. UPDATE profiles SET full_name, role, company_id, branch_id, department_id, position_id
//   5. INSERT user_roles (service role — bypasses RLS cross-company restriction)
//   6. Return { id: uuid } on success, { error: string } on failure
//
// Email confirmation: email_confirm: true — user can log in immediately.
// Password: enforced min 8 chars at caller side; raw value passed to Supabase Auth.
//
// legacy `role` field: derived from erp_role code if possible, else defaults to 'operations'.
// This field coexists with user_roles during the ERP role transition period.

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

// Map ERP role code → legacy profiles.role enum value.
// Must only produce values in user_role_legacy enum:
//   'super' | 'logistic' | 'procurement' | 'finance' | 'management'
const ERP_CODE_TO_LEGACY: Record<string, string> = {
  super_admin:        'super',
  ceo:                'management',
  gm:                 'management',
  admin:              'management',
  manager:            'management',
  hrga:               'management',
  viewer:             'management',
  supervisor:         'management',
  finance_controller: 'finance',
  finance:            'finance',
  sales:              'logistic',
  operations:         'logistic',
  it:                 'logistic',
  procurement:        'procurement',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Parse and validate ──────────────────────────────────────────────
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Invalid JSON body.' }, 400)

    const {
      email, password, full_name, company_id,
      erp_role_id,                              // required — ERP role UUID
      branch_id     = null,                     // optional
      department_id = null,                     // optional
      position_id   = null,                     // optional
    } = body

    if (!email || !password || !full_name || !company_id || !erp_role_id) {
      return json({ error: 'email, password, full_name, company_id, and erp_role_id are all required.' }, 400)
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
    // All subsequent writes use adminClient (service role) — bypasses RLS so
    // super_admin can create users and assign roles in any company.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    })

    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? 'Failed to create auth user.' }, 400)
    }

    const userId = created.user.id

    // ── 4. Resolve ERP role code for legacy field mapping ──────────────────
    const { data: roleRow } = await adminClient
      .from('roles')
      .select('code')
      .eq('id', erp_role_id)
      .single()

    const legacyRole = ERP_CODE_TO_LEGACY[roleRow?.code ?? ''] ?? 'management'

    // ── 5. Update the profile row inserted by handle_new_user() trigger ────
    const profilePatch: Record<string, unknown> = {
      full_name:  full_name.trim(),
      role:       legacyRole,
      company_id,
    }
    if (branch_id)     profilePatch.branch_id     = branch_id
    if (department_id) profilePatch.department_id = department_id
    if (position_id)   profilePatch.position_id   = position_id

    const { error: profileErr } = await adminClient
      .from('profiles')
      .update(profilePatch)
      .eq('id', userId)

    if (profileErr) {
      console.error('[create-user] profile update failed:', profileErr.message)
      return json({
        id: userId,
        warning: 'User created but profile update failed. Use the Edit modal to fix.',
      }, 201)
    }

    // ── 6. Insert user_roles (service role bypasses cross-company RLS) ─────
    const now = new Date().toISOString()
    const { data: { user: callerUser } } = await callerClient.auth.getUser()
    const grantedBy = callerUser?.id ?? null

    const { error: roleInsertErr } = await adminClient
      .from('user_roles')
      .upsert(
        {
          user_id:    userId,
          role_id:    erp_role_id,
          company_id,
          is_active:  true,
          granted_at: now,
          granted_by: grantedBy,
        },
        { onConflict: 'user_id,role_id,company_id' }
      )

    if (roleInsertErr) {
      console.error('[create-user] user_roles insert failed:', roleInsertErr.message)
      return json({
        id: userId,
        warning: `User created but ERP role assignment failed: ${roleInsertErr.message}`,
      }, 201)
    }

    return json({ id: userId }, 201)

  } catch (err) {
    console.error('[create-user] unexpected error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

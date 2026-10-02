// supabase/functions/set-user-status/index.ts
// TD-301 hotfix -- deactivates/reactivates a user as ONE atomic-as-possible
// server-side action: profile flag + ERP roles + Supabase Auth ban, instead of
// the two independent, unguarded writes that existed before this function
// (UserAccessPage/UserEditPage writing `profiles.active` directly via
// PostgREST, with nothing touching user_roles or Supabase Auth at all).
//
// Security model (identical to create-user/delete-user/reset-password):
//   - Requires Authorization header (caller's own JWT)
//   - Verifies the caller is is_super_admin() before proceeding -- deliberately
//     NOT opened to same-company `admin` (unlike the direct `profiles_update`
//     RLS path this replaces) to match the existing super_admin-only Edge
//     Function pattern and avoid a weaker, second authorization story for the
//     same action. See TD-301 PLAN Q1 -- UserEditPage/UserAccessPage hide the
//     "Account active" control for non-super_admin as a consequence.
//   - Prevents self-action (a super_admin cannot deactivate/reactivate their
//     own account) -- same shape as delete-user's self-delete guard, now
//     enforced server-side where the existing FE-only guard never was.
//   - Uses SUPABASE_SERVICE_ROLE_KEY for all writes -- bypasses RLS.
//
// Flow (deactivate, active=false):
//   1. UPDATE profiles SET active = false
//   2. UPDATE user_roles SET is_active=false, revoked_at=now(), revoked_by=caller
//      WHERE user_id=:user_id AND is_active=true -- ALL companies, no scoping
//      (deactivation is a full stop, unlike a single-company role edit).
//      Reactivation does NOT restore these rows -- an admin must explicitly
//      re-assign a role afterwards (TD-301 PLAN Q2, approved as-is).
//   3. auth.admin.updateUserById(user_id, { ban_duration: '876600h' }) -- ~100
//      years, the documented Admin API mechanism (no literal "infinity" exists
//      for this parameter). Blocks new sign-in immediately and the next
//      refresh-token exchange; an access token already issued and not yet
//      expired remains valid until its own `exp` (TD-301 PLAN Q5, accepted
//      limitation -- closed at the data layer by the companion DB migration,
//      not by this function).
// Flow (reactivate, active=true):
//   1. UPDATE profiles SET active = true
//   2. auth.admin.updateUserById(user_id, { ban_duration: 'none' })
//   (user_roles is intentionally left empty -- see above)
//
// Each step's own success/failure is reported back distinctly in the response
// so a partial failure is never silently swallowed (the exact "jendela gagal
// diam-diam" the direct-table-write path could not rule out). Audit logging
// is NOT done here -- it is done by the caller (FE) after a successful
// response, matching the existing CREATE_USER pattern (useUserAccess.js /
// UserAccessPage.jsx), not a new convention invented for this function.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ~100 years -- GoTrue's ban_duration has no literal "forever"; this is the
// documented way to express an effectively-permanent ban via the Admin API
// (as opposed to a raw `UPDATE auth.users SET banned_until = 'infinity'`,
// which would need a direct Postgres connection this function does not have).
const PERMANENT_BAN_DURATION = '876600h'

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

    const { user_id, active } = body
    if (!user_id || typeof user_id !== 'string') {
      return json({ error: 'user_id is required.' }, 400)
    }
    if (typeof active !== 'boolean') {
      return json({ error: 'active (boolean) is required.' }, 400)
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
      return json({ error: 'Forbidden. Only super admin can change user status.' }, 403)
    }

    // ── 3. SAFETY: prevent self-deactivation/self-reactivation ─────────────
    const { data: { user: callerUser } } = await callerClient.auth.getUser()
    if (callerUser?.id === user_id) {
      return json({ error: 'Tidak bisa mengubah status akun sendiri.' }, 400)
    }

    // ── 4. Apply (service-role client) ──────────────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const steps: Record<string, 'ok' | string> = {}

    // 4a. profiles.active
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({ active })
      .eq('id', user_id)

    if (profileErr) {
      console.error('[set-user-status] profile update failed:', profileErr.message)
      return json({ error: `Gagal mengubah status profil: ${profileErr.message}` }, 400)
    }
    steps.profile = 'ok'

    // 4b. user_roles -- deactivate only, never auto-restore (see header).
    if (!active) {
      const now = new Date().toISOString()
      const { error: rolesErr } = await adminClient
        .from('user_roles')
        .update({ is_active: false, revoked_at: now, revoked_by: callerUser?.id ?? null })
        .eq('user_id', user_id)
        .eq('is_active', true)

      steps.roles = rolesErr ? `GAGAL: ${rolesErr.message}` : 'ok'
      if (rolesErr) console.error('[set-user-status] user_roles revoke failed:', rolesErr.message)
    } else {
      steps.roles = 'tidak di-restore (sesuai kebijakan TD-301)'
    }

    // 4c. Supabase Auth ban/unban.
    const { error: banErr } = await adminClient.auth.admin.updateUserById(user_id, {
      ban_duration: active ? 'none' : PERMANENT_BAN_DURATION,
    })

    steps.auth_ban = banErr ? `GAGAL: ${banErr.message}` : 'ok'
    if (banErr) console.error('[set-user-status] auth ban/unban failed:', banErr.message)

    // ── 5. Report precisely -- never a bare {success:true} if a sub-step
    //      failed. profiles.active (4a) already committed at this point; a
    //      caller reading `partial: true` must re-run or escalate manually,
    //      not assume the deactivation is complete.
    const partial = steps.roles?.toString().startsWith('GAGAL') || steps.auth_ban?.toString().startsWith('GAGAL')

    return json({ success: true, partial: !!partial, steps }, 200)

  } catch (err) {
    console.error('[set-user-status] unexpected error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

// supabase/functions/delete-user/index.ts
// Deletes a Supabase Auth user along with their profile row and ERP role assignments.
// Called only by super_admin users from the Admin → User Access page.
//
// Security model:
//   - Requires Authorization header (Supabase anon-key JWT from the calling user)
//   - Verifies the caller is is_super_admin() before proceeding
//   - Prevents self-deletion (a super_admin cannot delete their own account)
//   - Uses SUPABASE_SERVICE_ROLE_KEY (injected by Supabase Edge runtime — never
//     exposed to the frontend) for all delete operations — bypasses RLS so super_admin
//     can delete users and roles in any company.
//
// Flow:
//   1. Parse + validate input (user_id)
//   2. Verify caller is super_admin via is_super_admin() RPC
//   3. SAFETY: reject if user_id === caller's own id
//   4. Delete user_roles → delete profiles → delete auth user (service role)
//   5. Return { success: true } on success, { error: string } on failure

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

    const { user_id } = body
    if (!user_id || typeof user_id !== 'string') {
      return json({ error: 'user_id is required.' }, 400)
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
      return json({ error: 'Forbidden. Only super admin can delete users.' }, 403)
    }

    // ── 3. SAFETY: prevent self-deletion ───────────────────────────────────
    const { data: { user: callerUser } } = await callerClient.auth.getUser()
    if (callerUser?.id === user_id) {
      return json({ error: 'Tidak bisa menghapus akun sendiri.' }, 400)
    }

    // ── 4. Delete (service-role client) ────────────────────────────────────
    // All deletes use adminClient (service role) — bypasses RLS so super_admin
    // can delete users and roles in any company.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 4a. Delete ERP role assignments first
    const { error: roleDelErr } = await adminClient
      .from('user_roles')
      .delete()
      .eq('user_id', user_id)

    if (roleDelErr) {
      console.error('[delete-user] user_roles delete failed:', roleDelErr.message)
      return json({ error: `Failed to delete user roles: ${roleDelErr.message}` }, 400)
    }

    // 4b. Delete the profile row manually (in case there is no FK cascade)
    const { error: profileDelErr } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', user_id)

    if (profileDelErr) {
      console.error('[delete-user] profile delete failed:', profileDelErr.message)
      return json({ error: `Failed to delete profile: ${profileDelErr.message}` }, 400)
    }

    // 4c. Delete the auth user
    const { error: authDelErr } = await adminClient.auth.admin.deleteUser(user_id)

    if (authDelErr) {
      console.error('[delete-user] auth user delete failed:', authDelErr.message)
      return json({ error: authDelErr.message ?? 'Failed to delete auth user.' }, 400)
    }

    return json({ success: true }, 200)

  } catch (err) {
    console.error('[delete-user] unexpected error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

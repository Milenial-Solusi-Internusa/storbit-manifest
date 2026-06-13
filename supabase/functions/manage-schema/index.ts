import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_TABLES = ['customers','vendors','prospects','products','branches','departments','positions','assets','inquiries','quotations']
const ALLOWED_TYPES = ['text','integer','numeric','boolean','date','timestamptz','jsonb']
const BLOCKED_COLUMN_NAMES = ['id','created_at','updated_at','deleted_at','created_by','updated_by','company_id','password','secret','token','key','hash']
const COLUMN_NAME_REGEX = /^[a-z][a-z0-9_]{1,50}$/

async function dbExecSql(url: string, serviceRoleKey: string, sql: string) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
    },
    body: JSON.stringify({ sql })
  })
  // exec_sql returns void — response body mungkin kosong
  const text = await res.text()
  if (!text || text === '') return { success: true }
  try {
    return JSON.parse(text)
  } catch {
    return { success: true, raw: text }
  }
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
    }

    try {
      const { action, table, column, type, default_value } = await req.json()

      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 })

      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const serviceKey = Deno.env.get('MSI_DB_KEY') ?? ''

      // Super-admin gate via is_super_admin() RPC, evaluated as the CALLING user
      // (anon key + the user's JWT) — NOT the service role, so auth.uid() inside
      // the function resolves to the real caller. Replaces the old profiles.role
      // check (that column is being dropped).
      const callerClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: isSuper, error: roleErr } = await callerClient.rpc('is_super_admin')
      if (roleErr || !isSuper) {
        return Response.json({ error: 'Forbidden — super admin only' }, { status: 403 })
      }

      if (action !== 'add_column') return Response.json({ error: 'Invalid action' }, { status: 400 })
      if (!ALLOWED_TABLES.includes(table)) return Response.json({ error: `Table '${table}' tidak diizinkan` }, { status: 400 })
      if (!column || !COLUMN_NAME_REGEX.test(column)) return Response.json({ error: 'Nama kolom tidak valid' }, { status: 400 })
      if (BLOCKED_COLUMN_NAMES.includes(column)) return Response.json({ error: `Kolom '${column}' tidak diizinkan` }, { status: 400 })
      if (!ALLOWED_TYPES.includes(type)) return Response.json({ error: `Tipe '${type}' tidak diizinkan` }, { status: 400 })

      const defaultClause = default_value !== undefined && default_value !== ''
        ? ` DEFAULT '${String(default_value).replace(/'/g, "''")}'` : ''

      const sql = `ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${column} ${type}${defaultClause};`

      const result = await dbExecSql(supabaseUrl, serviceKey, sql)

      // Kalau ada error dari Postgres
      if (result?.code && result?.message) {
        return Response.json({ error: result.message }, { status: 500 })
      }

      return Response.json({
        success: true,
        message: `Kolom '${column}' (${type}) berhasil ditambahkan ke tabel '${table}'`,
        sql
      })

    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 })
    }
  })
}

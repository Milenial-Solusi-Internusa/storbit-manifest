// supabase/functions/sync-visit-calendar/google-auth.ts
// Satu-satunya berkas yang menyentuh jose. Membangun+menandatangani JWT
// 2-legged service account (RS256) lalu menukarnya ke access token lewat
// endpoint token Google -- alur domain-wide delegation standar, SATU-SATUNYA
// cara kita mengautentikasi (nol OAuth interaktif, nol consent screen per
// user -- otorisasi sudah diberikan Mas sekali lewat Admin Console Workspace,
// Fase 0, di luar kode ini).
//
// jose dipilih (bukan paket `googleapis`, sesuai instruksi Mas) dan diimpor
// lewat esm.sh -- SATU-SATUNYA gaya impor eksternal yang dipakai KONSISTEN
// di seluruh 9 Edge Function lain di repo ini (nol pemakaian `npm:` di mana
// pun: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'`
// di notify-prf-space/aging-pipeline/dll). Versi dikunci 6.2.14 -- dist-tag
// "latest" npm saat ditulis (dicek langsung, bukan ditebak).
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@6.2.14'
import { fetchWithRetry } from './calendar-client.ts'

export interface ServiceAccountKey {
  client_email: string
  private_key: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const TOKEN_TTL_SECONDS = 3600 // batas maksimum Google utk JWT bearer assertion

// Kegagalan di sini diklasifikasi TERPISAH dari kegagalan Calendar API --
// berarti masalah delegasi/kredensial (setup Google, bukan data visit).
// index.ts menuliskan ini sebagai pesan generik, nol detail JSON Google yang
// bisa memuat info kredensial.
export class TokenError extends Error {}

export async function getAccessToken(
  serviceAccount: ServiceAccountKey,
  impersonateEmail: string,
): Promise<string> {
  let privateKey: CryptoKey
  try {
    privateKey = await importPKCS8(serviceAccount.private_key, 'RS256')
  } catch {
    throw new TokenError('private_key service account tidak valid/tidak bisa diparse')
  }

  const now = Math.floor(Date.now() / 1000)
  let assertion: string
  try {
    assertion = await new SignJWT({ scope: CALENDAR_SCOPE, sub: impersonateEmail })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(serviceAccount.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .sign(privateKey)
  } catch {
    throw new TokenError('gagal menandatangani JWT service account')
  }

  const res = await fetchWithRetry(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!res.ok) {
    // Perbaikan 3: boleh ambil HANYA field "error" (kode pendek standar
    // OAuth, mis. invalid_grant/unauthorized_client) -- DIVALIDASI pola
    // ketat sebelum dipakai, supaya mustahil membawa potongan teks
    // bebas/rahasia. error_description dan field lain TIDAK PERNAH
    // dibaca/disimpan, dan body mentah TIDAK PERNAH dicatat log. Gagal
    // parse/tak cocok pola -> diam-diam jatuh ke format lama (status saja).
    let errorCode: string | null = null
    try {
      const errBody = (await res.json()) as { error?: unknown }
      if (typeof errBody.error === 'string' && /^[a-z_]{1,40}$/.test(errBody.error)) {
        errorCode = errBody.error
      }
    } catch {
      // body bukan JSON/tak terbaca -- errorCode tetap null, pakai format lama.
    }
    throw new TokenError(
      errorCode ? `token_exchange_failed:${res.status}:${errorCode}` : `token_exchange_failed:${res.status}`,
    )
  }

  let data: { access_token?: string }
  try {
    data = (await res.json()) as { access_token?: string }
  } catch {
    throw new TokenError('respons token Google tidak bisa diparse')
  }
  if (!data.access_token) throw new TokenError('respons token Google tanpa access_token')
  return data.access_token
}

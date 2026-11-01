// supabase/functions/notify-prf-space/index.ts
// Kartu notifikasi Google Space saat PRF disubmit (status -> SUBMITTED).
//
// Dipanggil HANYA server-to-server (trigger DB notify_prf_submitted(), Fase
// A3 -- supabase/migrations/20261101000005_notify_prf_submitted_trigger.sql)
// lewat net.http_post, persis pola notify-sp-milestone/index.ts -- BUKAN
// dipanggil dari FE/browser, karena itu nol CORS di sini. config.toml
// men-set verify_jwt=true untuk fungsi ini -- gateway Supabase sudah
// menolak JWT tak sah/kedaluwarsa SEBELUM kode ini sempat jalan; yang
// tersisa untuk kita cek hanyalah klaim `role` di token yang (menurut
// gateway) sudah sah. Pola decodeJwtRole persis aging-pipeline/index.ts.
//
// Secret Edge Function (diset lewat `supabase secrets set`, BUKAN hardcode):
//   GOOGLE_SPACE_WEBHOOK_URL -- webhook Google Chat Space tujuan. Nilainya
//     BEDA per proyek Supabase (staging = Space uji, produksi = Space asli);
//     nama secret-nya SAMA -- nol percabangan kode untuk ini.
//   NEXUS_APP_URL -- origin aplikasi Nexus, contoh:
//     https://nexus.msigroup.co.id (produksi) /
//     https://beta.nexus.msigroup.co.id (staging).
//     Path daftar PRF di-hardcode di konstanta PRF_LIST_PATH di bawah --
//     path itu SUDAH ADA di router (src/routes/menu-skeleton.js, menu id
//     proc-inquiry-fwd-msi) -- fungsi ini TIDAK menambah rute baru.
//
// Idempoten: kalau prf.space_notified_at SUDAH terisi, fungsi ini membalas
// {skipped:true} tanpa mengirim ulang kartu dan tanpa menulis apa pun lagi.
//
// Nilai GOOGLE_SPACE_WEBHOOK_URL TIDAK PERNAH masuk log, respons, atau pesan
// error -- kegagalan kirim ke Google dilaporkan sebagai pesan generik saja.
//
// UPDATE ke tabel prf di sini HANYA pernah menyentuh space_notified_at /
// space_notify_error -- diperiksa sengaja supaya tidak memicu trigger
// trg_inquiry_review maupun trg_z_notify_prf_submitted_* (keduanya
// kolom-spesifik atas `status`; kolom status tidak pernah disebut di SET
// clause manapun di berkas ini).
//
// Isi kartu (buildCard + PrfRow) dipindah ke ./card.ts -- fungsi murni, nol
// I/O, supaya bisa dites lokal tanpa ikut menjalankan Deno.serve. Query PRF
// di bawah pakai select('*') + join profiles/accounts (kolom salah nama
// pada select eksplisit akan menggagalkan SELURUH query; '*' menghindari
// itu). companies (kode entitas) dan inquiries (inquiry_no) dibaca TERPISAH
// dan TIDAK PERNAH membuat notifikasi gagal -- kegagalan keduanya hanya
// berarti baris kartu terkait tidak tampil.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCard, type PrfRow } from './card.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Decode klaim `role` dari JWT TANPA verifikasi ulang tanda tangan -- aman
// karena verify_jwt=true di config.toml (lihat komentar di atas). Token yang
// tidak bisa didekode membalas 401 (masukan tak sah), bukan 500.
function decodeJwtRole(authHeader: string | null): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

const PRF_LIST_PATH = '/procurement/prf/requisition/list'

async function handler(req: Request): Promise<Response> {
  const role = decodeJwtRole(req.headers.get('Authorization'))
  if (role !== 'service_role') {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const body = await req.json().catch(() => null)
    const prf_id = body?.prf_id
    if (!prf_id || typeof prf_id !== 'string') {
      return json({ error: 'payload tidak valid: prf_id (string) wajib diisi' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: prf, error: prfErr } = await supabase
      .from('prf')
      .select(`
        *,
        profiles:profiles!prf_created_by_fkey(full_name, job_title),
        accounts:accounts!prf_account_id_fkey(name)
      `)
      .eq('id', prf_id)
      .maybeSingle() as { data: PrfRow | null; error: { message: string } | null }

    if (prfErr) {
      console.error('[notify-prf-space] gagal baca PRF:', prfErr.message)
      return json({ error: 'Gagal membaca data PRF.' }, 500)
    }
    if (!prf) {
      return json({ error: 'PRF tidak ditemukan' }, 404)
    }

    // Idempoten -- jangan kirim ulang kartu yang sudah pernah berhasil.
    if (prf.space_notified_at) {
      return json({ skipped: true }, 200)
    }

    const webhookUrl = Deno.env.get('GOOGLE_SPACE_WEBHOOK_URL')
    const nexusAppUrl = Deno.env.get('NEXUS_APP_URL')
    if (!webhookUrl || !nexusAppUrl) {
      console.error('[notify-prf-space] secret belum diset (GOOGLE_SPACE_WEBHOOK_URL / NEXUS_APP_URL).')
      await supabase.from('prf')
        .update({ space_notify_error: 'Notifikasi belum dikonfigurasi (secret kosong).' })
        .eq('id', prf_id)
        .then(null, (e) => console.error('[notify-prf-space] gagal tulis space_notify_error:', e))
      return json({ error: 'Notification service not configured.' }, 500)
    }

    // companies (kode entitas) dan inquiries (inquiry_no) -- dibaca
    // TERPISAH, kegagalan keduanya TIDAK PERNAH menggagalkan notifikasi;
    // baris terkait di kartu cukup tidak tampil.
    let entitas: string | null = null
    const { data: company, error: companyErr } = await supabase
      .from('companies').select('code').eq('id', prf.company_id).maybeSingle()
    if (companyErr) console.error('[notify-prf-space] gagal baca companies (non-fatal):', companyErr.message)
    else entitas = company?.code ?? null

    let inquiryNo: string | null = null
    if (prf.inquiry_id) {
      const { data: inquiry, error: inquiryErr } = await supabase
        .from('inquiries').select('inquiry_no').eq('id', prf.inquiry_id).maybeSingle()
      if (inquiryErr) console.error('[notify-prf-space] gagal baca inquiries (non-fatal):', inquiryErr.message)
      else inquiryNo = inquiry?.inquiry_no ?? null
    }

    const linkUrl = `${nexusAppUrl.replace(/\/$/, '')}${PRF_LIST_PATH}`
    const cardPayload = buildCard(prf, entitas, inquiryNo, linkUrl)

    let sendError: string | null = null
    try {
      let res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardPayload),
      })
      if (res.status === 429) {
        // Rate-limited oleh Google Chat -- tunggu sebentar, coba SEKALI lagi.
        // HANYA 429 yang di-retry; status error lain langsung dilaporkan
        // seperti sebelumnya, nol retry lain di luar ini.
        await new Promise((resolve) => setTimeout(resolve, 1500))
        res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cardPayload),
        })
      }
      if (!res.ok) {
        // Sengaja TIDAK membaca/membocorkan body respons Google (bisa memuat
        // detail konfigurasi webhook) -- status code cukup untuk diagnosis.
        sendError = `Google Chat menolak kiriman (HTTP ${res.status}).`
        console.error('[notify-prf-space] gagal kirim, status:', res.status)
      }
    } catch (e) {
      sendError = 'Gagal menghubungi Google Chat.'
      console.error('[notify-prf-space] fetch ke webhook gagal:', e)
    }

    if (sendError) {
      await supabase.from('prf')
        .update({ space_notify_error: sendError })
        .eq('id', prf_id)
        .then(null, (e) => console.error('[notify-prf-space] gagal tulis space_notify_error:', e))
      return json({ error: sendError }, 502)
    }

    const { error: writeErr } = await supabase.from('prf')
      .update({ space_notified_at: new Date().toISOString(), space_notify_error: null })
      .eq('id', prf_id)
    if (writeErr) {
      // Kartu SUDAH terkirim ke Space pada titik ini -- kegagalan menulis
      // balik status bukan kegagalan pengiriman. Dilaporkan, bukan di-retry
      // di sini (retry berarti kartu dobel).
      console.error('[notify-prf-space] kartu terkirim tapi gagal menulis space_notified_at:', writeErr.message)
    }

    return json({ sent: true }, 200)

  } catch (err) {
    console.error('[notify-prf-space] unexpected error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
}

Deno.serve(handler)

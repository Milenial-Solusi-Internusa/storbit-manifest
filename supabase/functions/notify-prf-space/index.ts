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
// (TIDAK diubah dari versi sebelumnya -- lihat migrasi Fase A3 untuk
// bagaimana ini dijaga di sisi pemicu/trigger juga.)
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
// ── ISI KARTU (buildCard) ───────────────────────────────────────────────────
// buildCard() adalah FUNGSI MURNI (tanpa I/O, tanpa jaringan) supaya bisa
// dites lokal -- lihat DoD di laporan sesi. Query PRF di handler pakai
// select('*') + join profiles/accounts (kolom salah nama pada select
// eksplisit akan menggagalkan SELURUH query; '*' menghindari itu).
// companies (kode entitas) dan inquiries (inquiry_no) dibaca TERPISAH dan
// TIDAK PERNAH membuat notifikasi gagal -- kegagalan keduanya hanya berarti
// baris kartu terkait tidak tampil (ikut aturan "baris kosong tidak
// ditampilkan").
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Ubah ke false untuk menyembunyikan baris "Nilai komersial" dari kartu --
// satu titik kontrol, bukan keputusan yang di-hardcode di tengah kode.
const SHOW_COMMERCIAL_VALUE = true

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

// Label ramah service_type. Nilai sebenarnya di DB adalah 'custom' (lihat
// src/modules/procurement/PRFFormPage.jsx, SERVICE_TYPES) -- 'customs'
// disertakan sebagai alias jaga-jaga (keputusan Den) kalau nilainya pernah
// berubah/ditulis beda di masa depan.
const SERVICE_TYPE_LABELS: Record<string, string> = {
  sea: 'Sea Freight',
  air: 'Air Freight',
  inland: 'Inland/Trucking',
  custom: 'Customs Clearance',
  customs: 'Customs Clearance',
  project: 'Project Cargo',
}

type PrfRow = {
  id: string
  prf_no: string
  company_id: string
  inquiry_id: string | null
  account_name_manual: string | null
  direction: string | null
  stream: string | null
  customer_source: string | null
  service_type: string | null
  sea_freight_type: string | null
  origin: string | null
  destination: string | null
  pickup_address: string | null
  delivery_address: string | null
  inland_pickup_address: string | null
  inland_delivery_address: string | null
  incoterms: string | null
  cargo_ready_date: string | null
  deadline_quotation: string | null
  goods_name: string | null
  commodity: string | null
  hs_code: string | null
  un_number: string | null
  imo_class: string | null
  msds_available: boolean | null
  commercial_currency: string | null
  commercial_value: number | null
  sea_container_types: string[] | null
  sea_container_qty: Record<string, number> | null
  sea_lcl_gw: number | null
  sea_lcl_volume: number | null
  sea_lcl_koli: number | null
  sea_lcl_dimension: string | null
  air_gw: number | null
  air_volume: number | null
  air_koli: number | null
  air_dimension: string | null
  inland_fleet_types: string[] | null
  inland_gw: number | null
  inland_dimension: string | null
  custom_doc_type: string | null
  project_freight_types: string[] | null
  project_qty: number | null
  add_on_services: string[] | null
  add_on_others: string | null
  notes: string | null
  submitted_at: string | null
  created_at: string | null
  space_notified_at: string | null
  profiles: { full_name: string | null; job_title: string | null } | null
  accounts: { name: string | null } | null
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c])
}

// "Nilai pertama yang terisi" -- string kosong/whitespace dianggap TIDAK terisi.
function firstFilled(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (v !== null && v !== undefined && String(v).trim() !== '') return v
  }
  return null
}

function fmtIdNumber(n: number): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

// Tanggal-saja (kolom `date`, disimpan 'YYYY-MM-DD') -- T00:00:00 mencegah
// geser hari akibat parse sebagai UTC lalu ditampilkan di zona lain.
function fmtDateOnly(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'medium' })
}

// Timestamptz -- WIB eksplisit, bukan default zona server.
function fmtDateTimeWib(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB'
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}

type Row = { decoratedText: { topLabel: string; text: string; wrapText: true; icon?: { knownIcon: string } } }

// Baris dengan nilai kosong/null TIDAK ditampilkan -- return null, disaring
// oleh section().
function row(topLabel: string, text: string | null, icon?: string): Row | null {
  if (text === null || text === undefined) return null
  const t = String(text).trim()
  if (!t) return null
  const decoratedText: Row['decoratedText'] = { topLabel, text: t, wrapText: true }
  if (icon) decoratedText.icon = { knownIcon: icon }
  return { decoratedText }
}

// Section yang SEMUA barisnya kosong TIDAK ditampilkan sama sekali.
function section(header: string, rows: Array<Row | null>): { header?: string; widgets: Row[] } | null {
  const widgets = rows.filter((r): r is Row => r !== null)
  if (widgets.length === 0) return null
  return { header, widgets }
}

function containerText(types: string[] | null, qty: Record<string, number> | null): string | null {
  if (!types || !types.length || !qty) return null
  const parts: string[] = []
  for (const t of types) {
    const n = Number(qty[t])
    if (n > 0) parts.push(`${t} ×${n}`)
  }
  return parts.length ? parts.join(', ') : null
}

function weightVolumeKoliText(gw: number | null, vol: number | null, koli: number | null): string | null {
  const parts: string[] = []
  if (gw !== null && gw !== undefined) parts.push(`${fmtIdNumber(gw)} kg`)
  if (vol !== null && vol !== undefined) parts.push(`${fmtIdNumber(vol)} CBM`)
  if (koli !== null && koli !== undefined) parts.push(`${koli} koli`)
  return parts.length ? parts.join(' · ') : null
}

function fleetText(fleetTypes: string[] | null, gw: number | null): string | null {
  const parts: string[] = []
  if (fleetTypes && fleetTypes.length) parts.push(fleetTypes.join('/'))
  if (gw !== null && gw !== undefined) parts.push(`${fmtIdNumber(gw)} kg`)
  return parts.length ? parts.join(' · ') : null
}

function projectText(freightTypes: string[] | null, qty: number | null): string | null {
  const parts: string[] = []
  if (freightTypes && freightTypes.length) parts.push(freightTypes.join('/'))
  if (qty !== null && qty !== undefined) parts.push(`${qty} unit`)
  return parts.length ? parts.join(' · ') : null
}

function addOnsText(services: string[] | null, others: string | null): string | null {
  const parts: string[] = []
  if (services && services.length) parts.push(services.join(', '))
  if (others && others.trim()) parts.push(`(${others.trim()})`)
  return parts.length ? parts.join(' ') : null
}

// Fungsi MURNI -- nol I/O, nol jaringan. entitas/inquiryNo/linkUrl sudah
// diresolusi pemanggil (companies/inquiries dibaca terpisah, non-fatal).
export function buildCard(prf: PrfRow, entitas: string | null, inquiryNo: string | null, linkUrl: string) {
  const esc = escapeHtml

  // a. Pemohon
  const pembuatParts = [prf.profiles?.full_name, prf.profiles?.job_title].filter(Boolean).map((s) => esc(s))
  const pembuat = pembuatParts.length ? pembuatParts.join(' · ') : null
  const submittedRaw = prf.submitted_at || prf.created_at
  const disubmit = submittedRaw ? fmtDateTimeWib(submittedRaw) : null

  const sectionPemohon = section('Pemohon', [
    row('Dibuat oleh', pembuat, 'PERSON'),
    row('Disubmit', disubmit, 'CLOCK'),
  ])

  // b. Customer
  const akunRaw = firstFilled(prf.accounts?.name, prf.account_name_manual)
  const akun = akunRaw ? esc(akunRaw) : null
  const arusParts = [prf.direction, prf.stream].filter(Boolean).map((s) => esc(s as string))
  const arus = arusParts.length ? arusParts.join(' · ') : null
  const sumber = prf.customer_source ? esc(prf.customer_source) : null
  const inquiryText = inquiryNo ? esc(inquiryNo) : null

  const sectionCustomer = section('Customer', [
    row('Akun', akun, 'STORE'),
    row('Arus', arus, 'BOOKMARK'),
    row('Sumber', sumber),
    row('Inquiry terkait', inquiryText, 'DESCRIPTION'),
  ])

  // c. Pengiriman
  const layananLabel = prf.service_type ? (SERVICE_TYPE_LABELS[prf.service_type] ?? prf.service_type) : null
  const layananParts = [layananLabel, prf.sea_freight_type ? prf.sea_freight_type.toUpperCase() : null]
    .filter(Boolean)
    .map((s) => esc(s as string))
  const layanan = layananParts.length ? layananParts.join(' · ') : null
  const rute = prf.origin && prf.destination ? `${esc(prf.origin)} → ${esc(prf.destination)}` : null
  const alamatJemputRaw = firstFilled(prf.pickup_address, prf.inland_pickup_address)
  const alamatJemput = alamatJemputRaw ? esc(alamatJemputRaw) : null
  const alamatTujuanRaw = firstFilled(prf.delivery_address, prf.inland_delivery_address)
  const alamatTujuan = alamatTujuanRaw ? esc(alamatTujuanRaw) : null
  const incoterms = prf.incoterms ? esc(prf.incoterms) : null
  const cargoReady = prf.cargo_ready_date ? fmtDateOnly(prf.cargo_ready_date) : null
  const deadlineQuote = prf.deadline_quotation ? fmtDateOnly(prf.deadline_quotation) : null

  const sectionPengiriman = section('Pengiriman', [
    row('Layanan', layanan, 'AIRPLANE'),
    row('Rute', rute, 'MAP_PIN'),
    row('Alamat jemput', alamatJemput),
    row('Alamat tujuan', alamatTujuan),
    row('Incoterms', incoterms),
    row('Cargo ready', cargoReady, 'CLOCK'),
    row('Deadline quote', deadlineQuote, 'CLOCK'),
  ])

  // d. Barang
  const barangRaw = firstFilled(prf.goods_name, prf.commodity)
  const barang = barangRaw ? esc(barangRaw) : null
  const komoditas = prf.commodity ? esc(prf.commodity) : null
  const hsCode = prf.hs_code ? esc(prf.hs_code) : null
  const dgParts = [prf.un_number, prf.imo_class].filter(Boolean).map((s) => esc(s as string))
  const barangBerbahaya = dgParts.length ? dgParts.join(' · ') : null
  // MSDS hanya relevan (ditampilkan) kalau: commodity='dg' ATAU un_number/
  // imo_class terisi ATAU msds_available=true -- msds_available sendiri
  // DEFAULT false dan FE selalu mengirim nilai eksplisit (tidak pernah
  // benar-benar NULL), jadi "terisi" literal akan selalu true dan baris ini
  // akan selalu tampil bahkan utk PRF yang bukan dangerous-goods. Keputusan
  // Den: gerbang relevansi di atas, bukan literal "kolom != null".
  const msdsRelevant = prf.commodity === 'dg' || Boolean(prf.un_number) || Boolean(prf.imo_class) || prf.msds_available === true
  const msds = msdsRelevant ? (prf.msds_available ? 'Tersedia' : 'Tidak tersedia') : null
  const nilaiKomersial =
    SHOW_COMMERCIAL_VALUE && prf.commercial_value !== null && prf.commercial_value !== undefined
      ? `${prf.commercial_currency ? esc(prf.commercial_currency) + ' ' : ''}${fmtIdNumber(prf.commercial_value)}`
      : null

  const sectionBarang = section('Barang', [
    row('Barang', barang, 'SHOPPING_CART'),
    row('Komoditas', komoditas),
    row('HS Code', hsCode),
    row('Barang berbahaya', barangBerbahaya),
    row('MSDS', msds),
    row('Nilai komersial', nilaiKomersial, 'DOLLAR'),
  ])

  // e. Muatan -- tampilkan hanya yang terisi, apa pun service_type-nya.
  const kontainer = containerText(prf.sea_container_types, prf.sea_container_qty)
  const lcl = weightVolumeKoliText(prf.sea_lcl_gw, prf.sea_lcl_volume, prf.sea_lcl_koli)
  const airCargo = weightVolumeKoliText(prf.air_gw, prf.air_volume, prf.air_koli)
  const armada = fleetText(prf.inland_fleet_types, prf.inland_gw)
  const dimensiRaw = firstFilled(prf.sea_lcl_dimension, prf.air_dimension, prf.inland_dimension)
  const dimensi = dimensiRaw ? esc(dimensiRaw) : null
  const jenisDokumen = prf.custom_doc_type ? esc(prf.custom_doc_type) : null
  const projectCargo = projectText(prf.project_freight_types, prf.project_qty)

  const sectionMuatan = section('Muatan', [
    row('Kontainer', kontainer),
    row('LCL', lcl),
    row('Air cargo', airCargo),
    row('Armada/berat', armada),
    row('Dimensi', dimensi),
    row('Jenis dokumen', jenisDokumen),
    row('Project cargo', projectCargo),
  ])

  // f. Tambahan
  const layananTambahan = addOnsText(prf.add_on_services, prf.add_on_others)
  const catatan = prf.notes && prf.notes.trim() ? esc(truncate(prf.notes, 200)) : null

  const sectionTambahan = section('Tambahan', [
    row('Layanan tambahan', layananTambahan),
    row('Catatan', catatan),
  ])

  // g. Section terakhir -- tombol saja, nol header.
  const sectionAksi = {
    widgets: [
      {
        buttonList: {
          buttons: [{ text: 'Lihat di Nexus', onClick: { openLink: { url: linkUrl } } }],
        },
      },
    ],
  }

  const sections: Array<{ header?: string; widgets: unknown[] }> = [
    sectionPemohon, sectionCustomer, sectionPengiriman, sectionBarang, sectionMuatan, sectionTambahan,
  ].filter((s): s is { header?: string; widgets: Row[] } => s !== null)
  sections.push(sectionAksi)

  return {
    cardsV2: [
      {
        cardId: `prf-${prf.id}`,
        card: {
          header: {
            title: `PRF ${prf.prf_no}`,
            subtitle: entitas ? `PRF baru disubmit · ${esc(entitas)}` : 'PRF baru disubmit',
          },
          sections,
        },
      },
    ],
  }
}

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
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardPayload),
      })
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

// import.meta.main hanya true saat berkas ini dijalankan langsung (deploy
// Supabase) -- false saat diimpor modul lain (skrip tes lokal buildCard),
// supaya tes tidak ikut membuka listener HTTP.
if (import.meta.main) {
  Deno.serve(handler)
}

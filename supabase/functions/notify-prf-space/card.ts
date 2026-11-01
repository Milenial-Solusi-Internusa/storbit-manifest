// supabase/functions/notify-prf-space/card.ts
// Pembangun kartu Google Chat (cardsV2) untuk notifikasi PRF disubmit.
//
// SELURUH isi berkas ini adalah FUNGSI MURNI -- nol I/O, nol jaringan, nol
// panggilan Supabase -- dipisah dari index.ts supaya bisa diimpor & dites
// lokal (skrip tes scratchpad) TANPA ikut menjalankan Deno.serve.
//
// Hanya `buildCard` dan `PrfRow` di-export; seluruh helper (escapeHtml, row,
// section, dkk) sengaja TIDAK di-export -- detail implementasi internal.
//
// ── ESCAPE DI SATU TEMPAT ────────────────────────────────────────────────────
// Semua teks dari database (&, <, >) di-escape HANYA di dalam row() --
// sekali, di titik akhir sebelum masuk payload kartu. Pemanggil (buildCard)
// SELALU meneruskan teks MENTAH (belum di-escape) ke row()/ke komposisi
// string topLabel/text -- menghindari double-escape (&amp;amp;) yang akan
// terjadi kalau pemanggil juga meng-escape sebelum row() meng-escape lagi.
// Pengecualian: header.title/header.subtitle kartu adalah field teks POLOS
// Google Chat (tidak mendukung markup seperti decoratedText.text yang
// mendukung <br>/<b>/dst) -- SENGAJA TIDAK di-escape di mana pun, termasuk
// bagian `entitas` yang disisipkan ke subtitle.

// Ubah ke false untuk menyembunyikan baris "Nilai komersial" dari kartu --
// satu titik kontrol, bukan keputusan yang di-hardcode di tengah kode.
const SHOW_COMMERCIAL_VALUE = true

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

export type PrfRow = {
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

type Row = { decoratedText: { topLabel: string; text: string; wrapText: true; startIcon?: { knownIcon: string } } }

// Baris dengan nilai kosong/null TIDAK ditampilkan -- return null, disaring
// oleh section(). Escape (&, <, >) terjadi DI SINI, satu kali, atas teks
// MENTAH yang diteruskan pemanggil -- lihat catatan di kepala berkas.
function row(topLabel: string, text: string | null, icon?: string): Row | null {
  if (text === null || text === undefined) return null
  const t = String(text).trim()
  if (!t) return null
  const decoratedText: Row['decoratedText'] = {
    topLabel: escapeHtml(topLabel),
    text: escapeHtml(t),
    wrapText: true,
  }
  if (icon) decoratedText.startIcon = { knownIcon: icon }
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
// Seluruh teks di bawah diteruskan MENTAH ke row() -- escape terjadi di sana.
export function buildCard(prf: PrfRow, entitas: string | null, inquiryNo: string | null, linkUrl: string) {
  // a. Pemohon
  const pembuatParts = [prf.profiles?.full_name, prf.profiles?.job_title].filter(Boolean) as string[]
  const pembuat = pembuatParts.length ? pembuatParts.join(' · ') : null
  const submittedRaw = prf.submitted_at || prf.created_at
  const disubmit = submittedRaw ? fmtDateTimeWib(submittedRaw) : null

  const sectionPemohon = section('Pemohon', [
    row('Dibuat oleh', pembuat, 'PERSON'),
    row('Disubmit', disubmit, 'CLOCK'),
  ])

  // b. Customer
  const akun = firstFilled(prf.accounts?.name, prf.account_name_manual)
  const arusParts = [prf.direction, prf.stream].filter(Boolean) as string[]
  const arus = arusParts.length ? arusParts.join(' · ') : null
  const sumber = prf.customer_source
  const inquiryText = inquiryNo

  const sectionCustomer = section('Customer', [
    row('Akun', akun, 'STORE'),
    row('Arus', arus, 'BOOKMARK'),
    row('Sumber', sumber),
    row('Inquiry terkait', inquiryText, 'DESCRIPTION'),
  ])

  // c. Pengiriman
  const layananLabel = prf.service_type ? (SERVICE_TYPE_LABELS[prf.service_type] ?? prf.service_type) : null
  const layananParts = [layananLabel, prf.sea_freight_type ? prf.sea_freight_type.toUpperCase() : null].filter(Boolean) as string[]
  const layanan = layananParts.length ? layananParts.join(' · ') : null
  const rute = prf.origin && prf.destination ? `${prf.origin} → ${prf.destination}` : null
  const alamatJemput = firstFilled(prf.pickup_address, prf.inland_pickup_address)
  const alamatTujuan = firstFilled(prf.delivery_address, prf.inland_delivery_address)
  const incoterms = prf.incoterms
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
  const barang = firstFilled(prf.goods_name, prf.commodity)
  const komoditas = prf.commodity
  const hsCode = prf.hs_code
  const dgParts = [prf.un_number, prf.imo_class].filter(Boolean) as string[]
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
      ? `${prf.commercial_currency ? prf.commercial_currency + ' ' : ''}${fmtIdNumber(prf.commercial_value)}`
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
  const dimensi = firstFilled(prf.sea_lcl_dimension, prf.air_dimension, prf.inland_dimension)
  const jenisDokumen = prf.custom_doc_type
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
  const catatan = prf.notes && prf.notes.trim() ? truncate(prf.notes, 200) : null

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
            // Field teks POLOS Google Chat -- SENGAJA tidak di-escape (lihat
            // catatan di kepala berkas).
            title: `PRF ${prf.prf_no}`,
            subtitle: entitas ? `PRF baru disubmit · ${entitas}` : 'PRF baru disubmit',
          },
          sections,
        },
      },
    ],
  }
}

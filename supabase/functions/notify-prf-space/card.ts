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
//
// ── IKON WAJIB DI SETIAP BARIS ───────────────────────────────────────────────
// SEMUA baris decoratedText WAJIB punya startIcon (rata kiri seragam) --
// row() mensyaratkan parameter icon (tidak lagi opsional), diketik KnownIcon
// (union literal, BUKAN string bebas) supaya nama ikon di luar daftar resmi
// Google Chat GAGAL di `deno check` sebelum sempat jadi bug runtime (Google
// menolak SELURUH kartu dengan HTTP 400 kalau satu nama ikon saja salah).
// KNOWN_ICONS di bawah = daftar resmi yang diizinkan.
const KNOWN_ICONS = [
  'AIRPLANE', 'BOOKMARK', 'BUS', 'CAR', 'CLOCK', 'CONFIRMATION_NUMBER_ICON',
  'DESCRIPTION', 'DOLLAR', 'EMAIL', 'EVENT_SEAT', 'FLIGHT_ARRIVAL',
  'FLIGHT_DEPARTURE', 'HOTEL', 'HOTEL_ROOM_TYPE', 'INVITE', 'MAP_PIN',
  'MEMBERSHIP', 'MULTIPLE_PEOPLE', 'PERSON', 'PHONE', 'RESTAURANT_ICON',
  'SHOPPING_CART', 'STAR', 'STORE', 'TICKET', 'TRAIN', 'VIDEO_CAMERA',
  'VIDEO_PLAY',
] as const
type KnownIcon = typeof KNOWN_ICONS[number]

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

// Label ramah direction. Nilai mentah dikonfirmasi 'import'/'export'/
// 'domestic' (PRFFormPage.jsx DIRECTIONS). Nilai tak dikenal tampil apa adanya.
const DIRECTION_LABELS: Record<string, string> = {
  import: 'Import',
  export: 'Ekspor',
  domestic: 'Domestik',
}

// Label ramah commodity. Nilai tak dikenal tampil apa adanya.
const COMMODITY_LABELS: Record<string, string> = {
  general: 'General Cargo',
  dg: 'Dangerous Goods',
  special_permit: 'Special Permit (Lartas)',
  perishable: 'Perishable',
  live_animal: 'Live Animal',
  valuable: 'Valuable',
  pharma: 'Pharma',
}

function directionLabel(v: string | null): string | null {
  if (!v) return null
  return DIRECTION_LABELS[v] ?? v
}

function commodityLabel(v: string | null): string | null {
  if (!v) return null
  return COMMODITY_LABELS[v] ?? v
}

// Label status Dokumen Pendukung (PI/LS/MSDS/Lainnya) -- domain sama dengan
// DOC_STATUS_OPTIONS/DOC_STATUS_LABEL di prfShared.js (FE), disalin di sini
// karena card.ts (Edge Function Deno) tidak bisa mengimpor dari src/.
const DOC_STATUS_LABELS: Record<string, string> = {
  tidak_perlu: 'Tidak perlu',
  tersedia: 'Tersedia',
  belum_tersedia: 'Belum tersedia',
  belum_diketahui: 'Belum diketahui',
}

function docStatusLabel(v: string | null): string | null {
  if (!v) return null
  return DOC_STATUS_LABELS[v] ?? v
}

// Label ramah Layanan Tambahan -- DISALIN PERSIS dari ADD_ONS di
// src/modules/procurement/prfShared.js (card.ts, Edge Function Deno, tidak
// bisa mengimpor dari src/). Kode tak dikenal tampil apa adanya.
const ADD_ON_LABELS: Record<string, string> = {
  custom_clearance: 'Custom Clearance',
  inland: 'Inland',
  import_license_undername: 'Import License (Undername)',
  import_license_pi: 'Import License (PI)',
  export_license: 'Export License',
  ls: 'LS',
  warehouse_umum: 'Warehouse Umum',
  warehouse_reefer: 'Warehouse Reefer',
  tkbm: 'TKBM',
  insurance: 'Insurance',
  others: 'Others',
}

function addOnLabel(v: string): string {
  return ADD_ON_LABELS[v] ?? v
}

// Layanan: Air Freight -> AIRPLANE, Inland/Trucking -> BUS, selain itu TICKET.
function layananIcon(serviceType: string | null): KnownIcon {
  if (serviceType === 'air') return 'AIRPLANE'
  if (serviceType === 'inland') return 'BUS'
  return 'TICKET'
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
  doc_pi_status: string | null
  doc_ls_status: string | null
  doc_msds_status: string | null
  doc_other_status: string | null
  doc_other_name: string | null
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

// Timestamptz -- WIB eksplisit. Jam:menit dibangun manual via
// formatToParts (bukan toLocaleString time-style) supaya pemisahnya PASTI
// titik dua ("16:09"), bukan titik ("16.09") seperti default locale id-ID.
function fmtDateTimeWib(iso: string): string {
  const d = new Date(iso)
  const datePart = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium' })
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${datePart}, ${hh}:${mm} WIB`
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}

// Kapitalkan huruf awal tiap kata HANYA kalau seluruh teks huruf kecil --
// teks yang sudah punya huruf besar (kode pelabuhan/bandara seperti IDJKT,
// atau nama yang sudah benar) dibiarkan apa adanya, tidak disentuh sama
// sekali.
function titleCaseIfLower(s: string): string {
  if (s !== s.toLowerCase()) return s
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

type Row = { decoratedText: { topLabel: string; text: string; wrapText: true; startIcon: { knownIcon: KnownIcon } } }

// Nilai placeholder yang diperlakukan SAMA SEPERTI kosong (baris tidak
// ditampilkan) -- strip manual ('-'/en dash/em dash) atau '0' yang biasanya
// berarti "belum diisi" utk field teks bebas. Dicek SESUDAH trim, di row()
// supaya berlaku untuk SEMUA baris tanpa daftar per baris. Field gw/volume/
// koli punya aturan nolnya sendiri (lihat weightVolumeKoliText/fleetText) --
// nilai NUMERIK 0 di sana dilewati SEBELUM jadi teks gabungan, jadi tidak
// pernah mentah "0" yang sampai ke sini.
const PLACEHOLDER_VALUES = new Set(['-', '–', '—', '0'])

// Baris dengan nilai kosong/null/placeholder TIDAK ditampilkan -- return
// null, disaring oleh section(). Escape (&, <, >) terjadi DI SINI, satu
// kali, atas teks MENTAH yang diteruskan pemanggil -- lihat catatan di
// kepala berkas. icon WAJIB diisi (bukan opsional) supaya SEMUA baris rata
// kiri seragam. `bold` (opsional, default false) membungkus teks YANG SUDAH
// di-escape dengan <b></b> -- escape tetap terjadi sekali, nol double-escape.
function row(topLabel: string, text: string | null, icon: KnownIcon, bold?: boolean): Row | null {
  if (text === null || text === undefined) return null
  const t = String(text).trim()
  if (!t || PLACEHOLDER_VALUES.has(t)) return null
  const escaped = escapeHtml(t)
  return {
    decoratedText: {
      topLabel: escapeHtml(topLabel),
      text: bold ? `<b>${escaped}</b>` : escaped,
      wrapText: true,
      startIcon: { knownIcon: icon },
    },
  }
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

// gw/volume/koli yang SAMA DENGAN 0 dilewati (null tetap dilewati seperti
// sebelumnya) -- "880 kg" tanpa "· 0 CBM · 0 koli" kalau yang lain nol.
function weightVolumeKoliText(gw: number | null, vol: number | null, koli: number | null): string | null {
  const parts: string[] = []
  if (gw !== null && gw !== undefined && gw !== 0) parts.push(`${fmtIdNumber(gw)} kg`)
  if (vol !== null && vol !== undefined && vol !== 0) parts.push(`${fmtIdNumber(vol)} CBM`)
  if (koli !== null && koli !== undefined && koli !== 0) parts.push(`${koli} koli`)
  return parts.length ? parts.join(' · ') : null
}

// gw yang SAMA DENGAN 0 dilewati (null tetap dilewati seperti sebelumnya).
function fleetText(fleetTypes: string[] | null, gw: number | null): string | null {
  const parts: string[] = []
  if (fleetTypes && fleetTypes.length) parts.push(fleetTypes.join('/'))
  if (gw !== null && gw !== undefined && gw !== 0) parts.push(`${fmtIdNumber(gw)} kg`)
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
  if (services && services.length) parts.push(services.map(addOnLabel).join(', '))
  if (others && others.trim()) parts.push(`(${others.trim()})`)
  return parts.length ? parts.join(' ') : null
}

// Nilai imo_class di DB kadang sudah berbentuk "Class 1 — Explosives"
// (sudah diawali kata "Class"), kadang cuma angka ("3"/"3.1"). Tambahkan
// "Class" HANYA kalau nilainya BELUM diawali kata itu -- supaya tidak dobel
// "kelas Class"/"Class Class".
function imoClassText(imoClass: string): string {
  const t = imoClass.trim()
  return /^class\b/i.test(t) ? `IMO ${t}` : `IMO Class ${t}`
}

// "UN 1263 · IMO Class 3 — Flammable Liquids" -- tiap bagian hanya tampil
// kalau terisi.
function dangerousGoodsText(unNumber: string | null, imoClass: string | null): string | null {
  const parts: string[] = []
  if (unNumber) parts.push(`UN ${unNumber}`)
  if (imoClass) parts.push(imoClassText(imoClass))
  return parts.length ? parts.join(' · ') : null
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
  const arusParts = [directionLabel(prf.direction), prf.stream].filter(Boolean) as string[]
  const arus = arusParts.length ? arusParts.join(' · ') : null
  const sumber = prf.customer_source ? titleCaseIfLower(prf.customer_source) : null
  const inquiryText = inquiryNo

  const sectionCustomer = section('Customer', [
    row('Akun', akun, 'STORE'),
    row('Arus', arus, 'BOOKMARK'),
    row('Sumber', sumber, 'MULTIPLE_PEOPLE'),
    row('Inquiry terkait', inquiryText, 'DESCRIPTION'),
  ])

  // c. Pengiriman
  const layananLabel = prf.service_type ? (SERVICE_TYPE_LABELS[prf.service_type] ?? prf.service_type) : null
  const layananParts = [layananLabel, prf.sea_freight_type ? prf.sea_freight_type.toUpperCase() : null].filter(Boolean) as string[]
  const layanan = layananParts.length ? layananParts.join(' · ') : null
  const rute = prf.origin && prf.destination
    ? `${titleCaseIfLower(prf.origin)} → ${titleCaseIfLower(prf.destination)}`
    : null
  const alamatJemput = firstFilled(prf.pickup_address, prf.inland_pickup_address)
  const alamatTujuan = firstFilled(prf.delivery_address, prf.inland_delivery_address)
  const incoterms = prf.incoterms
  const cargoReady = prf.cargo_ready_date ? fmtDateOnly(prf.cargo_ready_date) : null
  const deadlineQuote = prf.deadline_quotation ? fmtDateOnly(prf.deadline_quotation) : null

  const sectionPengiriman = section('Pengiriman', [
    row('Layanan', layanan, layananIcon(prf.service_type)),
    row('Rute', rute, 'MAP_PIN', true),
    row('Alamat jemput', alamatJemput, 'MAP_PIN'),
    row('Alamat tujuan', alamatTujuan, 'MAP_PIN'),
    row('Incoterms', incoterms, 'DESCRIPTION'),
    row('Cargo ready', cargoReady, 'CLOCK'),
    row('Deadline quote', deadlineQuote, 'CLOCK'),
  ])

  // d. Barang
  const barang = firstFilled(prf.goods_name, commodityLabel(prf.commodity))
  const komoditas = commodityLabel(prf.commodity)
  const hsCode = prf.hs_code
  const barangBerbahaya = dangerousGoodsText(prf.un_number, prf.imo_class)
  const nilaiKomersial =
    SHOW_COMMERCIAL_VALUE && prf.commercial_value !== null && prf.commercial_value !== undefined
      ? `${prf.commercial_currency ? prf.commercial_currency + ' ' : ''}${fmtIdNumber(prf.commercial_value)}`
      : null

  const sectionBarang = section('Barang', [
    row('Barang', barang, 'SHOPPING_CART'),
    row('Komoditas', komoditas, 'SHOPPING_CART'),
    row('HS Code', hsCode, 'DESCRIPTION'),
    row('Barang berbahaya', barangBerbahaya, 'STAR'),
    row('Nilai komersial', nilaiKomersial, 'DOLLAR'),
  ])

  // d2. Dokumen Pendukung -- section TERPISAH (bukan baris di dalam Barang),
  // diletakkan SESUDAH Barang. Hanya menampilkan dokumen berstatus SELAIN
  // tidak_perlu/NULL (nol baris -> section() otomatis menyembunyikan section
  // ini seluruhnya -- PRF barang umum yang keempat dokumennya 'tidak_perlu'
  // tidak menampilkan section ini sama sekali).
  function docRowValue(status: string | null): string | null {
    if (!status || status === 'tidak_perlu') return null
    return docStatusLabel(status)
  }
  // MSDS -- fallback KHUSUS kolom ini: kalau doc_msds_status masih NULL (PRF
  // lama belum ter-backfill, atau backfill migrasi 20261101000006 belum
  // dijalankan), jatuh ke gerbang relevansi LAMA (persis logika msdsRelevant
  // sebelum migrasi ini) supaya PRF lama tidak diam-diam kehilangan sinyal
  // MSDS-nya. PI/LS/Lainnya TIDAK punya fallback -- konsep baru, NULL cukup
  // berarti "tidak tampil", titik.
  const msdsFallbackRelevant = prf.commodity === 'dg' || Boolean(prf.un_number) || Boolean(prf.imo_class) || prf.msds_available === true
  const msdsValue = prf.doc_msds_status != null
    ? docRowValue(prf.doc_msds_status)
    : (msdsFallbackRelevant ? (prf.msds_available ? 'Tersedia' : 'Tidak tersedia') : null)
  const piValue = docRowValue(prf.doc_pi_status)
  const lsValue = docRowValue(prf.doc_ls_status)
  const lainnyaBase = docRowValue(prf.doc_other_status)
  const lainnyaValue = lainnyaBase
    ? (prf.doc_other_name ? `${lainnyaBase} — ${prf.doc_other_name}` : lainnyaBase)
    : null

  const sectionDokumen = section('Dokumen pendukung', [
    row('PI (Persetujuan Impor)', piValue, 'DESCRIPTION'),
    row('LS (Laporan Surveyor)', lsValue, 'DESCRIPTION'),
    row('MSDS', msdsValue, 'DESCRIPTION'),
    row('Lainnya', lainnyaValue, 'DESCRIPTION'),
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
    row('Kontainer', kontainer, 'SHOPPING_CART'),
    row('LCL', lcl, 'SHOPPING_CART'),
    row('Air cargo', airCargo, 'SHOPPING_CART'),
    row('Armada/berat', armada, 'BUS'),
    row('Dimensi', dimensi, 'SHOPPING_CART'),
    row('Jenis dokumen', jenisDokumen, 'TICKET'),
    row('Project cargo', projectCargo, 'TICKET'),
  ])

  // f. Tambahan
  const layananTambahan = addOnsText(prf.add_on_services, prf.add_on_others)
  const catatan = prf.notes && prf.notes.trim() ? truncate(prf.notes, 200) : null

  const sectionTambahan = section('Tambahan', [
    row('Layanan tambahan', layananTambahan, 'CONFIRMATION_NUMBER_ICON'),
    row('Catatan', catatan, 'DESCRIPTION'),
  ])

  // g. Section terakhir -- tombol saja, nol header, bukan decoratedText
  // (buttonList tidak kena syarat startIcon).
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
    sectionPemohon, sectionCustomer, sectionPengiriman, sectionBarang, sectionDokumen, sectionMuatan, sectionTambahan,
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

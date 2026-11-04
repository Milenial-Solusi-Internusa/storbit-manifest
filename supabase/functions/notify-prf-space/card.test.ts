// supabase/functions/notify-prf-space/card.test.ts
// Deno test -- pola PERSIS supabase/functions/sync-visit-calendar/
// event-builder.test.ts (import jsr:@std/assert, Deno.test(), helper
// base*(overrides) berisi default lengkap).
// Jalankan: deno test --allow-none supabase/functions/notify-prf-space/
//
// ── CATATAN LAYOUT (USE_COLUMNS) ────────────────────────────────────────────
// Seluruh test LAMA (sebelum layout berkolom ditambahkan) menguji LOGIKA
// BARIS (placeholder, nol muatan, kapitalisasi, bold, escape, label add-on,
// IMO Class) lewat findRow() -- helper itu HANYA mencari di `section.widgets`
// langsung, TIDAK menyusup ke dalam `columns.columnItems[].widgets`. Karena
// USE_COLUMNS=true adalah DEFAULT produksi (lihat card.ts), test LAMA kini
// meneruskan `{ useColumns: false }` sebagai argumen ke-5 `buildCard()` --
// opsional, TANPA ekspor baru -- supaya tetap menguji susunan FLAT lama
// (satu kolom, byte-identik commit sebelum fitur kolom) dan findRow() tetap
// relevan. NOL nilai ekspektasi yang berubah, HANYA argumen ke-5 ditambah.
// Test BARU khusus layout kolom (menyusul di bawah) SENGAJA memanggil
// `{ useColumns: true }` secara eksplisit (walau itu default) supaya niatnya
// terbaca tanpa bergantung nilai default yang bisa berubah.
import { assertEquals } from 'jsr:@std/assert@1.0.19'
import { buildCard, type PrfRow } from './card.ts'

const LINK = 'https://nexus.msigroup.co.id/procurement/prf/a1b2c3d4-0000-0000-0000-000000000001'

// PRF "normal" -- nol placeholder, nol nol, origin/destination/sumber SUDAH
// berhuruf kapital (supaya tes regresi tidak ikut kena perbaikan 3).
function basePrf(overrides: Partial<PrfRow> = {}): PrfRow {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    prf_no: 'PRF/MSI/2026/00123',
    company_id: 'company-1',
    inquiry_id: null,
    account_name_manual: null,
    direction: 'export',
    stream: 'Direct',
    customer_source: 'Inquiry',
    service_type: 'sea',
    sea_freight_type: 'lcl',
    origin: 'Jakarta',
    destination: 'Singapore',
    pickup_address: 'Jl. Industri No. 5, Jakarta',
    delivery_address: 'Pasir Panjang Terminal, Singapore',
    inland_pickup_address: null,
    inland_delivery_address: null,
    incoterms: 'FOB',
    cargo_ready_date: '2026-11-15',
    deadline_quotation: '2026-11-10',
    goods_name: 'Furniture Kayu',
    commodity: 'general',
    hs_code: '9403.60',
    un_number: null,
    imo_class: null,
    msds_available: false,
    doc_pi_status: null,
    doc_ls_status: null,
    doc_msds_status: null,
    doc_other_status: null,
    doc_other_name: null,
    commercial_currency: 'USD',
    commercial_value: 15000,
    sea_container_types: null,
    sea_container_qty: null,
    sea_lcl_gw: 880,
    sea_lcl_volume: 4.2,
    sea_lcl_koli: 12,
    sea_lcl_dimension: '120x80x100 cm',
    air_gw: null,
    air_volume: null,
    air_koli: null,
    air_dimension: null,
    inland_fleet_types: null,
    inland_gw: null,
    inland_dimension: null,
    custom_doc_type: null,
    project_freight_types: null,
    project_qty: null,
    add_on_services: ['Insurance'],
    add_on_others: null,
    notes: 'Mohon diprioritaskan.',
    submitted_at: '2026-11-04T09:30:00+07:00',
    created_at: '2026-11-04T09:00:00+07:00',
    space_notified_at: null,
    profiles: { full_name: 'Siti Rahma', job_title: 'Sales Executive' },
    accounts: { name: 'PT Agro Sawit Kalimantan' },
    ...overrides,
  }
}

// Cari baris decoratedText di seluruh section lewat topLabel -- topLabel di
// kartu ini semuanya ASCII polos (nol &, <, >), jadi escapeHtml(topLabel)
// selalu sama dengan topLabel mentah, boleh dibandingkan langsung.
// deno-lint-ignore no-explicit-any
function findRow(card: any, topLabel: string): { topLabel: string; text: string } | undefined {
  for (const s of card.cardsV2[0].card.sections) {
    for (const w of s.widgets ?? []) {
      if (w.decoratedText && w.decoratedText.topLabel === topLabel) return w.decoratedText
    }
  }
  return undefined
}

// Reproduksi fmtDateOnly/fmtDateTimeWib (card.ts, TIDAK diexport) HANYA
// untuk membangun nilai "expected" di tes regresi -- kedua fungsi tanggal
// itu sendiri TIDAK disentuh task ini, bukan bagian yang diuji di sini.
function expDateOnly(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'medium' })
}
function expDateTimeWib(iso: string): string {
  const d = new Date(iso)
  const datePart = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium' })
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${datePart}, ${hh}:${mm} WIB`
}

function expRow(topLabel: string, text: string, icon: string) {
  return { decoratedText: { topLabel, text, wrapText: true, startIcon: { knownIcon: icon } } }
}

// ── Perbaikan 1: placeholder ('-', en dash, em dash, '0') == kosong ────────

Deno.test('perbaikan 1: nilai placeholder (-, en dash, em dash, 0) diperlakukan sama seperti kosong -- baris tidak tampil', () => {
  const prf = basePrf({
    delivery_address: '-',
    pickup_address: '–',
    incoterms: '—',
    sea_lcl_dimension: '0',
  })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Alamat tujuan'), undefined)
  assertEquals(findRow(card, 'Alamat jemput'), undefined)
  assertEquals(findRow(card, 'Incoterms'), undefined)
  assertEquals(findRow(card, 'Dimensi'), undefined)
})

Deno.test('perbaikan 1: nilai asli (bukan placeholder) tetap tampil apa adanya', () => {
  const prf = basePrf()
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Alamat tujuan')?.text, 'Pasir Panjang Terminal, Singapore')
  assertEquals(findRow(card, 'Dimensi')?.text, '120x80x100 cm')
})

// ── Perbaikan 2: gw/volume/koli == 0 dilewati di Muatan ────────────────────

Deno.test('perbaikan 2: weightVolumeKoliText -- gw 880, volume 0, koli 0 -> "880 kg" saja', () => {
  const prf = basePrf({ sea_lcl_gw: 880, sea_lcl_volume: 0, sea_lcl_koli: 0 })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'LCL')?.text, '880 kg')
})

Deno.test('perbaikan 2: weightVolumeKoliText -- semua nol -> baris LCL tidak tampil (return null tetap berlaku)', () => {
  const prf = basePrf({ sea_lcl_gw: 0, sea_lcl_volume: 0, sea_lcl_koli: 0 })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'LCL'), undefined)
})

Deno.test('perbaikan 2: fleetText -- gw 0 dilewati sama seperti null', () => {
  const prf = basePrf({ inland_fleet_types: ['Truk'], inland_gw: 0 })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Armada/berat')?.text, 'Truk')
})

// ── Perbaikan 3: huruf awal kapital untuk Rute & Sumber ────────────────────

Deno.test('perbaikan 3: origin/destination/sumber huruf kecil -> dikapitalkan huruf awal tiap kata', () => {
  const prf = basePrf({ origin: 'bangkok', destination: 'jakarta', customer_source: 'inquiry' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Rute')?.text, '<b>Bangkok → Jakarta</b>')
  assertEquals(findRow(card, 'Sumber')?.text, 'Inquiry')
})

Deno.test('perbaikan 3: teks yang sudah punya huruf besar (kode pelabuhan, nama benar) TIDAK diubah', () => {
  const prf = basePrf({ origin: 'IDJKT', destination: 'SGSIN', customer_source: 'Website Form' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Rute')?.text, '<b>IDJKT → SGSIN</b>')
  assertEquals(findRow(card, 'Sumber')?.text, 'Website Form')
})

// ── Perbaikan 4: Rute tebal, baris lain tidak ──────────────────────────────

Deno.test('perbaikan 4: baris Rute dibungkus <b>...</b>, baris lain TIDAK', () => {
  const prf = basePrf()
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  const rute = findRow(card, 'Rute')
  assertEquals(rute?.text, '<b>Jakarta → Singapore</b>')
  assertEquals(findRow(card, 'Akun')?.text.includes('<b>'), false)
  assertEquals(findRow(card, 'Alamat jemput')?.text.includes('<b>'), false)
})

// ── Escape (DoD): &, <, > tetap benar, termasuk di baris Rute yang tebal ──

Deno.test('escape ganda: origin berisi "&" TIDAK jadi "&amp;amp;" di baris Rute yang tebal', () => {
  const prf = basePrf({ origin: 'bangkok & co', destination: 'jakarta' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Rute')?.text, '<b>Bangkok &amp; Co → Jakarta</b>')
})

Deno.test('escape &, <, > pada baris biasa (bukan Rute) tetap benar, satu kali', () => {
  const prf = basePrf({ incoterms: 'FOB <Jakarta> & Co' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Incoterms')?.text, 'FOB &lt;Jakarta&gt; &amp; Co')
})

// ── Regresi: PRF normal -- kartu identik, kecuali Rute kini tebal ─────────

Deno.test('regresi: PRF data normal (nol placeholder, nol nol, sudah berhuruf kapital) -- kartu identik dgn sebelum perubahan, kecuali Rute kini tebal', () => {
  const prf = basePrf()
  const card = buildCard(prf, 'MSI', 'INQ/MSI/2026/00045', LINK, { useColumns: false })

  const expected = {
    cardsV2: [
      {
        cardId: `prf-${prf.id}`,
        card: {
          header: { title: `PRF ${prf.prf_no}`, subtitle: 'PRF baru disubmit · MSI' },
          sections: [
            {
              header: 'Pemohon',
              widgets: [
                expRow('Dibuat oleh', 'Siti Rahma · Sales Executive', 'PERSON'),
                expRow('Disubmit', expDateTimeWib(prf.submitted_at!), 'CLOCK'),
              ],
            },
            {
              header: 'Customer',
              widgets: [
                expRow('Akun', 'PT Agro Sawit Kalimantan', 'STORE'),
                expRow('Arus', 'Ekspor · Direct', 'BOOKMARK'),
                expRow('Sumber', 'Inquiry', 'MULTIPLE_PEOPLE'),
                expRow('Inquiry terkait', 'INQ/MSI/2026/00045', 'DESCRIPTION'),
              ],
            },
            {
              header: 'Pengiriman',
              widgets: [
                expRow('Layanan', 'Sea Freight · LCL', 'TICKET'),
                expRow('Rute', '<b>Jakarta → Singapore</b>', 'MAP_PIN'),
                expRow('Alamat jemput', 'Jl. Industri No. 5, Jakarta', 'MAP_PIN'),
                expRow('Alamat tujuan', 'Pasir Panjang Terminal, Singapore', 'MAP_PIN'),
                expRow('Incoterms', 'FOB', 'DESCRIPTION'),
                expRow('Cargo ready', expDateOnly(prf.cargo_ready_date!), 'CLOCK'),
                expRow('Deadline quote', expDateOnly(prf.deadline_quotation!), 'CLOCK'),
              ],
            },
            {
              header: 'Barang',
              widgets: [
                expRow('Barang', 'Furniture Kayu', 'SHOPPING_CART'),
                expRow('Komoditas', 'General Cargo', 'SHOPPING_CART'),
                expRow('HS Code', '9403.60', 'DESCRIPTION'),
                expRow('Nilai komersial', 'USD 15.000', 'DOLLAR'),
              ],
            },
            {
              header: 'Muatan',
              widgets: [
                expRow('LCL', '880 kg · 4,2 CBM · 12 koli', 'SHOPPING_CART'),
                expRow('Dimensi', '120x80x100 cm', 'SHOPPING_CART'),
              ],
            },
            {
              header: 'Tambahan',
              widgets: [
                expRow('Layanan tambahan', 'Insurance', 'CONFIRMATION_NUMBER_ICON'),
                expRow('Catatan', 'Mohon diprioritaskan.', 'DESCRIPTION'),
              ],
            },
            {
              widgets: [
                { buttonList: { buttons: [{ text: 'Lihat di Nexus', onClick: { openLink: { url: LINK } } }] } },
              ],
            },
          ],
        },
      },
    ],
  }

  assertEquals(card, expected)
})

// ── Definition of Done: PRF contoh eksplisit di instruksi ─────────────────

Deno.test('DoD: PRF contoh (origin bangkok, destination jakarta, sumber inquiry, alamat tujuan "-", gw 880/vol 0/koli 0, dimensi "0")', () => {
  const prf = basePrf({
    origin: 'bangkok',
    destination: 'jakarta',
    customer_source: 'inquiry',
    delivery_address: '-',
    sea_lcl_gw: 880,
    sea_lcl_volume: 0,
    sea_lcl_koli: 0,
    sea_lcl_dimension: '0',
  })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Rute')?.text, '<b>Bangkok → Jakarta</b>')
  assertEquals(findRow(card, 'Sumber')?.text, 'Inquiry')
  assertEquals(findRow(card, 'Alamat tujuan'), undefined)
  assertEquals(findRow(card, 'LCL')?.text, '880 kg')
  assertEquals(findRow(card, 'Dimensi'), undefined)
})

// ── Label ramah Layanan tambahan (ADD_ON_LABELS) ──────────────────────────

Deno.test('layanan tambahan: kode dipetakan ke label ramah, dipisah ", "', () => {
  const prf = basePrf({ add_on_services: ['custom_clearance', 'inland'] })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Layanan tambahan')?.text, 'Custom Clearance, Inland')
})

Deno.test('layanan tambahan: kode asing (tak dikenal) tampil apa adanya, tidak hilang/error', () => {
  const prf = basePrf({ add_on_services: ['custom_clearance', 'kode_baru_belum_dipetakan'] })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Layanan tambahan')?.text, 'Custom Clearance, kode_baru_belum_dipetakan')
})

Deno.test('layanan tambahan: add_on_others tetap tampil di belakang sebagai "(...)"', () => {
  const prf = basePrf({ add_on_services: ['insurance'], add_on_others: 'Permintaan khusus' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Layanan tambahan')?.text, 'Insurance (Permintaan khusus)')
})

// ── Commodity live_animal ──────────────────────────────────────────────────

Deno.test('commodity live_animal -> label "Live Animal"', () => {
  const prf = basePrf({ goods_name: null, commodity: 'live_animal' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Komoditas')?.text, 'Live Animal')
  assertEquals(findRow(card, 'Barang')?.text, 'Live Animal')
})

// ── IMO Class tanpa duplikasi "kelas Class" ────────────────────────────────

Deno.test('IMO Class: nilai DB sudah diawali "Class" -- tidak ditambah "Class" lagi', () => {
  const prf = basePrf({ un_number: null, imo_class: 'Class 1 — Explosives' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Barang berbahaya')?.text, 'IMO Class 1 — Explosives')
})

Deno.test('IMO Class: nilai DB hanya angka -- ditambah "Class"', () => {
  const prf = basePrf({ un_number: null, imo_class: '3' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Barang berbahaya')?.text, 'IMO Class 3')
})

Deno.test('IMO Class: angka desimal ("3.1") -- "IMO Class 3.1"', () => {
  const prf = basePrf({ un_number: null, imo_class: '3.1' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Barang berbahaya')?.text, 'IMO Class 3.1')
})

Deno.test('IMO Class kosong (null) -- UN tetap tampil sendirian', () => {
  const prf = basePrf({ un_number: '1263', imo_class: null })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Barang berbahaya')?.text, 'UN 1263')
})

Deno.test('UN dan IMO Class keduanya terisi -- digabung dengan " · "', () => {
  const prf = basePrf({ un_number: '1263', imo_class: 'Class 3 — Flammable Liquids' })
  const card = buildCard(prf, null, null, LINK, { useColumns: false })
  assertEquals(findRow(card, 'Barang berbahaya')?.text, 'UN 1263 · IMO Class 3 — Flammable Liquids')
})

// ── Layout berkolom (USE_COLUMNS=true) ─────────────────────────────────────
// Fixture "semua terisi": basePrf() + satu field dokumen -- satu-satunya
// section yang NULL di basePrf() default adalah "Dokumen pendukung" (semua
// doc_*_status null); menambah satu status membuatnya ikut terisi, supaya
// KEEMPAT slot (pairA/Pengiriman/pairC/pairD) terisi sekaligus.
function allFilledPrf(overrides: Partial<PrfRow> = {}): PrfRow {
  return basePrf({ doc_pi_status: 'tersedia', ...overrides })
}

Deno.test('kolom (a): PRF semua section terisi -> pairA, Pengiriman lebar penuh, pairC, pairD, tombol', () => {
  const prf = allFilledPrf()
  const card = buildCard(prf, 'MSI', 'INQ/MSI/2026/00045', LINK, { useColumns: true }) as any
  const sections = card.cardsV2[0].card.sections
  assertEquals(sections.length, 5)

  const pairA = sections[0]
  assertEquals('header' in pairA, false)
  assertEquals(pairA.widgets[0].columns.columnItems.length, 2)

  const pengiriman = sections[1]
  assertEquals(pengiriman.header, 'Pengiriman')
  assertEquals('columns' in pengiriman.widgets[0], false)
  assertEquals(pengiriman.widgets[0].decoratedText.topLabel, 'Layanan')

  const pairC = sections[2]
  assertEquals('header' in pairC, false)
  assertEquals(pairC.widgets[0].columns.columnItems.length, 2)

  const pairD = sections[3]
  assertEquals('header' in pairD, false)
  assertEquals(pairD.widgets[0].columns.columnItems.length, 2)

  const aksi = sections[4]
  assertEquals(aksi.widgets[0].buttonList.buttons[0].text, 'Lihat di Nexus')
})

Deno.test('kolom (b): satu sisi pasangan kosong -> sisi lain dirender section biasa lebar penuh dgn header-nya', () => {
  // basePrf() default: Dokumen pendukung NULL (semua doc_*_status null),
  // Tambahan terisi (add_on_services/notes) -> pairD kolaps jadi section
  // Tambahan APA ADANYA, bukan kotak kolom bolong di sebelah Dokumen.
  const prf = basePrf()
  const card = buildCard(prf, null, null, LINK, { useColumns: true }) as any
  const sections = card.cardsV2[0].card.sections
  assertEquals(sections.length, 5)
  const fallback = sections[3]
  assertEquals(fallback.header, 'Tambahan')
  assertEquals('columns' in fallback.widgets[0], false)
  assertEquals(fallback.widgets[0].decoratedText.topLabel, 'Layanan tambahan')
})

Deno.test('kolom (c): kedua sisi pasangan kosong -> pasangan itu TIDAK dirender sama sekali', () => {
  // Dokumen pendukung sudah null by default; Tambahan dikosongkan juga di
  // sini -> pairD lenyap total, bukan section kosong yang tetap muncul.
  const prf = basePrf({ add_on_services: null, add_on_others: null, notes: null })
  const card = buildCard(prf, null, null, LINK, { useColumns: true }) as any
  const sections = card.cardsV2[0].card.sections
  assertEquals(sections.length, 4) // pairA, Pengiriman, pairC, Aksi -- pairD absen
  const headers = sections.map((s: any) => s.header)
  assertEquals(headers.includes('Dokumen pendukung'), false)
  assertEquals(headers.includes('Tambahan'), false)
})

Deno.test('kolom (d): tombol "Lihat di Nexus" tetap section TERAKHIR, lintas ketiga bentuk fixture di atas', () => {
  const fixtures = [allFilledPrf(), basePrf(), basePrf({ add_on_services: null, add_on_others: null, notes: null })]
  for (const prf of fixtures) {
    const card = buildCard(prf, null, null, LINK, { useColumns: true }) as any
    const sections = card.cardsV2[0].card.sections
    const last = sections[sections.length - 1]
    assertEquals(last.widgets[0].buttonList.buttons[0].text, 'Lihat di Nexus')
  }
})

Deno.test('kolom (e): tiap columnItem diawali judul (textParagraph tebal) sebagai widget PERTAMA', () => {
  const prf = allFilledPrf()
  const card = buildCard(prf, null, null, LINK, { useColumns: true }) as any
  const sections = card.cardsV2[0].card.sections
  const [pairA, , pairC, pairD] = sections
  assertEquals(pairA.widgets[0].columns.columnItems[0].widgets[0], { textParagraph: { text: '<b>Pemohon</b>' } })
  assertEquals(pairA.widgets[0].columns.columnItems[1].widgets[0], { textParagraph: { text: '<b>Customer</b>' } })
  assertEquals(pairC.widgets[0].columns.columnItems[0].widgets[0], { textParagraph: { text: '<b>Barang</b>' } })
  assertEquals(pairC.widgets[0].columns.columnItems[1].widgets[0], { textParagraph: { text: '<b>Muatan</b>' } })
  assertEquals(pairD.widgets[0].columns.columnItems[0].widgets[0], { textParagraph: { text: '<b>Dokumen pendukung</b>' } })
  assertEquals(pairD.widgets[0].columns.columnItems[1].widgets[0], { textParagraph: { text: '<b>Tambahan</b>' } })
})

Deno.test('kolom (f): jumlah columnItems selalu TEPAT 2 di setiap widget `columns`', () => {
  const prf = allFilledPrf()
  const card = buildCard(prf, null, null, LINK, { useColumns: true }) as any
  const sections = card.cardsV2[0].card.sections
  let foundColumns = 0
  for (const s of sections) {
    for (const w of s.widgets ?? []) {
      if (w.columns) {
        foundColumns++
        assertEquals(w.columns.columnItems.length, 2)
      }
    }
  }
  assertEquals(foundColumns, 3) // pairA, pairC, pairD -- Pengiriman & Aksi bukan widget columns
})

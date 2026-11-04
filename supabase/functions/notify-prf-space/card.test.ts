// supabase/functions/notify-prf-space/card.test.ts
// Deno test -- pola PERSIS supabase/functions/sync-visit-calendar/
// event-builder.test.ts (import jsr:@std/assert, Deno.test(), helper
// base*(overrides) berisi default lengkap).
// Jalankan: deno test --allow-none supabase/functions/notify-prf-space/
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
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Alamat tujuan'), undefined)
  assertEquals(findRow(card, 'Alamat jemput'), undefined)
  assertEquals(findRow(card, 'Incoterms'), undefined)
  assertEquals(findRow(card, 'Dimensi'), undefined)
})

Deno.test('perbaikan 1: nilai asli (bukan placeholder) tetap tampil apa adanya', () => {
  const prf = basePrf()
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Alamat tujuan')?.text, 'Pasir Panjang Terminal, Singapore')
  assertEquals(findRow(card, 'Dimensi')?.text, '120x80x100 cm')
})

// ── Perbaikan 2: gw/volume/koli == 0 dilewati di Muatan ────────────────────

Deno.test('perbaikan 2: weightVolumeKoliText -- gw 880, volume 0, koli 0 -> "880 kg" saja', () => {
  const prf = basePrf({ sea_lcl_gw: 880, sea_lcl_volume: 0, sea_lcl_koli: 0 })
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'LCL')?.text, '880 kg')
})

Deno.test('perbaikan 2: weightVolumeKoliText -- semua nol -> baris LCL tidak tampil (return null tetap berlaku)', () => {
  const prf = basePrf({ sea_lcl_gw: 0, sea_lcl_volume: 0, sea_lcl_koli: 0 })
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'LCL'), undefined)
})

Deno.test('perbaikan 2: fleetText -- gw 0 dilewati sama seperti null', () => {
  const prf = basePrf({ inland_fleet_types: ['Truk'], inland_gw: 0 })
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Armada/berat')?.text, 'Truk')
})

// ── Perbaikan 3: huruf awal kapital untuk Rute & Sumber ────────────────────

Deno.test('perbaikan 3: origin/destination/sumber huruf kecil -> dikapitalkan huruf awal tiap kata', () => {
  const prf = basePrf({ origin: 'bangkok', destination: 'jakarta', customer_source: 'inquiry' })
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Rute')?.text, '<b>Bangkok → Jakarta</b>')
  assertEquals(findRow(card, 'Sumber')?.text, 'Inquiry')
})

Deno.test('perbaikan 3: teks yang sudah punya huruf besar (kode pelabuhan, nama benar) TIDAK diubah', () => {
  const prf = basePrf({ origin: 'IDJKT', destination: 'SGSIN', customer_source: 'Website Form' })
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Rute')?.text, '<b>IDJKT → SGSIN</b>')
  assertEquals(findRow(card, 'Sumber')?.text, 'Website Form')
})

// ── Perbaikan 4: Rute tebal, baris lain tidak ──────────────────────────────

Deno.test('perbaikan 4: baris Rute dibungkus <b>...</b>, baris lain TIDAK', () => {
  const prf = basePrf()
  const card = buildCard(prf, null, null, LINK)
  const rute = findRow(card, 'Rute')
  assertEquals(rute?.text, '<b>Jakarta → Singapore</b>')
  assertEquals(findRow(card, 'Akun')?.text.includes('<b>'), false)
  assertEquals(findRow(card, 'Alamat jemput')?.text.includes('<b>'), false)
})

// ── Escape (DoD): &, <, > tetap benar, termasuk di baris Rute yang tebal ──

Deno.test('escape ganda: origin berisi "&" TIDAK jadi "&amp;amp;" di baris Rute yang tebal', () => {
  const prf = basePrf({ origin: 'bangkok & co', destination: 'jakarta' })
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Rute')?.text, '<b>Bangkok &amp; Co → Jakarta</b>')
})

Deno.test('escape &, <, > pada baris biasa (bukan Rute) tetap benar, satu kali', () => {
  const prf = basePrf({ incoterms: 'FOB <Jakarta> & Co' })
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Incoterms')?.text, 'FOB &lt;Jakarta&gt; &amp; Co')
})

// ── Regresi: PRF normal -- kartu identik, kecuali Rute kini tebal ─────────

Deno.test('regresi: PRF data normal (nol placeholder, nol nol, sudah berhuruf kapital) -- kartu identik dgn sebelum perubahan, kecuali Rute kini tebal', () => {
  const prf = basePrf()
  const card = buildCard(prf, 'MSI', 'INQ/MSI/2026/00045', LINK)

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
  const card = buildCard(prf, null, null, LINK)
  assertEquals(findRow(card, 'Rute')?.text, '<b>Bangkok → Jakarta</b>')
  assertEquals(findRow(card, 'Sumber')?.text, 'Inquiry')
  assertEquals(findRow(card, 'Alamat tujuan'), undefined)
  assertEquals(findRow(card, 'LCL')?.text, '880 kg')
  assertEquals(findRow(card, 'Dimensi'), undefined)
})

// src/lib/spStatusConstants.js
// Sumber tunggal pengelompokan status SP untuk Dashboard Storbit.
//
// KENAPA FILE INI ADA: array status yang sama dipakai di DUA tempat yang tak
// bisa saling mengimpor — RPC `get_storbit_dashboard_stats` (SQL, menghitung
// angka kartu) dan query drill-down PostgREST di FE (menampilkan daftar SP di
// balik kartu itu). Kalau keduanya menulis array-nya sendiri-sendiri, cepat
// atau lambat drift: kartu bilang 12, daftarnya isi 9, tak ada yang sadar.
// Persis yang terjadi pada TD-168 (AGING_LIMITS di PipelineKanbanPage vs
// AGING_RULES di Edge Function aging-pipeline — drift sejak stage proposal/
// negotiation dicabut, baru ketahuan berbulan-bulan kemudian).
//
// ⚠️ SQL tidak bisa mengimpor file JS. Sinkronisasinya manual dan disengaja:
// kalau salah satu dari 6 grup di bawah berubah — array status-nya MAUPUN nama
// kuncinya — WAJIB ubah juga FILTER dan kunci `jsonb_build_object` di
// `supabase/migrations/20260818000002_storbit_dashboard_stats_rpc.sql`
// (dan sebaliknya). Komentar peringatan yang sama ada di file migrasi itu.
// Preseden nyata bahwa ini bukan paranoia: `btb_terbit` sendiri baru ketahuan
// hilang lewat smoke test, bukan lewat review desain.
//
// ⚠️ VERSI LIVE kedua RPC itu kini datang dari migrasi yang LEBIH BARU:
// `20260826000002_sp_status_menunggu_konfirmasi_dc.sql` (STEP 3 & 4) menimpa
// keduanya lewat CREATE OR REPLACE. Saat menyamakan array di bawah, baca
// migrasi TERBARU itu — 20260818000002 sudah bukan potret yang berjalan.
//
// BUKAN pengganti TAB_GROUPS di SalesOrderPage.jsx — itu pengelompokan LAIN
// untuk keperluan lain (tab list SP: pending/gudang/kirim/cancelled, di mana
// `pending` cuma DRAFT). Sengaja dibiarkan terpisah; menyatukannya akan
// memaksa salah satu layar memakai pengelompokan yang bukan miliknya.

/**
 * 13 tahap mesin status SP + CANCELLED, urut sesuai peringkat
 * `sp_recompute_status` (dari paling awal ke paling akhir).
 * Dipakai sebagai acuan urutan; bukan filter.
 *
 * MENUNGGU_KONFIRMASI_DC (tahap ke-8, ditambahkan 26 Agu 2026) duduk PERSIS di
 * antara SAMPAI dan BTB_TERBIT: qty sudah berangkat penuh, tapi masih ada surat
 * jalan 'in_transit' — tim DC customer belum mengonfirmasi barang sampai.
 * Sebelum ini SP melompat langsung ke TERKIRIM_PENUH begitu qty penuh, sehingga
 * konfirmasi DC tak pernah terlihat di layar. Lihat migrasi
 * `20260826000002_sp_status_menunggu_konfirmasi_dc.sql`.
 */
export const SP_STATUS_ORDER = [
  'DRAFT', 'CONFIRMED', 'MENUNGGU_STOK', 'PICKING', 'PACKED',
  'DIKIRIM', 'SAMPAI', 'MENUNGGU_KONFIRMASI_DC', 'BTB_TERBIT', 'TERKIRIM_PENUH',
  'INVOICED', 'SUBMITTED', 'LUNAS', 'CANCELLED',
];

/**
 * Pengelompokan kartu Dashboard Storbit — Shipping Manifest. SATU grup per
 * kartu berbasis status; 6 grup.
 *
 * Kunci di sini SENGAJA snake_case = persis kunci di payload `manifest` yang
 * dikembalikan RPC, supaya `stats.manifest[key]` bisa dipakai langsung tanpa
 * peta penerjemah di tengah. Jangan diubah ke camelCase sepihak — mismatch
 * casing antara UI dan lapisan data persis yang bikin TD-197 (`dppPPN` vs
 * `dppPpn`) memutus kolom di KEDUA arah tanpa error apa pun.
 *
 * Catatan per grup:
 *  - `shipped` sengaja BERIRISAN dengan `delivered_belum_btb` di status SAMPAI.
 *    Itu memang dua sudut pandang berbeda atas SP yang sama (sedang berjalan
 *    vs. menunggu BTB), bukan bug — jumlah seluruh kartu TIDAK sama dengan
 *    total SP dan tak seharusnya dipaksa sama.
 *  - `delivered_belum_btb` butuh anti-join ke sp_btb; array ini hanya separuh
 *    filternya (lihat helper di bawah).
 *  - `btb_terbit` adalah KEBALIKAN kartu di atasnya: BTB sudah terbit, invoice
 *    belum. Ditambahkan susulan setelah smoke test 18 Agu 2026 menemukan 390
 *    dari 463 SP (±84%) ada di status ini — tanpa kartu ini, mayoritas mutlak
 *    data Storbit tak terwakili di dashboard mana pun (BTB_TERBIT tidak masuk
 *    pending_open, tidak masuk shipped, belum masuk finance).
 *  - `expired`/`mendekati_expired` TIDAK punya entri sendiri: keduanya memakai
 *    ULANG `pending_open` ditambah syarat tanggal. Lihat catatan di bawah.
 *  - `pernah_risiko_pinalti` juga tak punya entri: penentunya bukan status SP
 *    melainkan keberadaan delivery_notes yang berangkat lewat tenggat.
 */
export const STATUS_GROUPS = {
  pending_open:        ['DRAFT', 'CONFIRMED', 'MENUNGGU_STOK', 'PICKING', 'PACKED'],
  shipped:             ['DIKIRIM', 'SAMPAI', 'MENUNGGU_KONFIRMASI_DC'],
  delivered_belum_btb: ['SAMPAI', 'TERKIRIM_PENUH'],
  btb_terbit:          ['BTB_TERBIT'],
  terkirim_penuh:      ['TERKIRIM_PENUH'],
  finance:             ['INVOICED', 'SUBMITTED', 'LUNAS'],
  cancelled:           ['CANCELLED'],
};

// PERGESERAN PERAN (18 Agu 2026): sejak drill-down dilayani RPC
// get_storbit_sp_drilldown (migrasi 20260818000003), array di atas TIDAK LAGI
// dipakai memfilter query FE — filternya hidup di SQL. Yang dipertahankan:
// (a) acuan tertulis kategori mana mencakup status apa, (b) kunci kanonik yang
// dipakai payload RPC, label, dan argumen p_category. Peringatan sinkronisasi
// di atas karena itu berlaku untuk DUA migrasi sekaligus (stats + drilldown).

// CATATAN EXPIRY (revisi 18 Agu 2026) — `STATUS_EXCLUDED_FROM_EXPIRY` DIHAPUS.
//
// `expired_date` = tenggat SP harus DIKIRIM; lewat tanggal itu Storbit
// berpotensi kena pinalti dari customer. Rumus lama memakai daftar pengecualian
// (`NOT IN ('LUNAS','CANCELLED')`) dan karena itu ikut menghitung SP yang sudah
// dikirim TEPAT WAKTU sebagai "expired" begitu kalender lewat tenggat lamanya.
//
// Filter yang benar bersifat POSITIF, bukan pengecualian:
//   expired            = STATUS_GROUPS.pending_open  DAN expired_date <  hari ini
//   mendekati_expired  = STATUS_GROUPS.pending_open  DAN expired_date >= hari ini
//                        DAN expired_date masih di bulan berjalan
// LUNAS/CANCELLED otomatis tersingkir karena tidak ada di `pending_open`.
//
// Pelanggaran yang SUDAH terjadi diukur terpisah oleh `pernah_risiko_pinalti`
// di RPC (butuh delivery_notes, tak bisa dihitung dari status saja).

/**
 * Kartu `pernah_risiko_pinalti` WAJIB ditampilkan berpasangan dengan penyebut
 * `dispatch_data_tersedia` — keduanya dikembalikan RPC di blok `manifest`.
 *
 * Alasannya bukan estetika: cakupan data pengiriman baru **16,2%** (69 dari 425
 * SP yang sudah lewat tahap kirim, diukur 18 Agu 2026). SP hasil import Excel
 * tak pernah melewati alur picking → surat jalan, dan status BTB_TERBIT (±84%
 * data) tercapai lewat keberadaan sp_btb tanpa perlu delivery_notes sama
 * sekali. Jadi angka pinalti yang kecil BUKAN berarti tak ada keterlambatan —
 * datanya memang belum ada. Angka telanjang tanpa penyebut akan dibaca sebagai
 * "aman", dan itu lebih menyesatkan daripada tidak menampilkan kartunya.
 */
export const PENALTY_METRIC_PAIR = ['pernah_risiko_pinalti', 'dispatch_data_tersedia'];

/**
 * Palet donut "Distribusi Status SP" — 6 slice yang MUTUALLY EXCLUSIVE dan
 * menjumlah persis `total_sp` (berbeda dari kartu KPI yang sengaja beririsan:
 * `shipped` ∩ `delivered_belum_btb` di status SAMPAI).
 *
 * Urutan array = urutan slice searah jarum jam dan urutan legenda, mengikuti
 * perjalanan SP dari pra-kirim sampai selesai. `terkirim_penuh` dipisah dari
 * `btb_terbit` (revisi 18 Agu 2026) — sebelumnya status itu tak terwakili
 * kunci payload mana pun, jadi donutnya tak bisa dipartisi bersih.
 *
 * DIVERIFIKASI ULANG 26 Agu 2026 setelah MENUNGGU_KONFIRMASI_DC lahir: state
 * baru itu TIDAK butuh slice sendiri karena sudah ikut terhitung di `shipped`
 * (lihat STATUS_GROUPS di atas — dan FILTER-nya di STEP 3 migrasi
 * 20260826000002 memang sudah memuatnya). Partisinya tetap utuh: gabungan
 * pending_open + shipped + terkirim_penuh + btb_terbit + finance + cancelled
 * menutup ke-14 nilai `sp_orders_status_check` tanpa tumpang tindih, jadi
 * jumlah 6 slice tetap persis `total_sp`.
 */
export const DONUT_STATUS_SLICES = [
  { key: 'pending_open',   label: 'Pra-Kirim',      color: '#AEC2EE' },
  { key: 'shipped',        label: 'Dikirim',        color: '#9ED9CB' },
  { key: 'terkirim_penuh', label: 'Terkirim Penuh', color: '#CFC3EA' },
  { key: 'btb_terbit',     label: 'BTB Terbit',     color: '#B7A0E3' },
  { key: 'finance',        label: 'Finance',        color: '#F0CE8E' },
  { key: 'cancelled',      label: 'Dibatalkan',     color: '#EFAEAE' },
];

/**
 * Label kartu (Bahasa Indonesia) — dipisah dari array status supaya penamaan
 * UI bisa berubah tanpa menyentuh logika filter.
 */
export const STATUS_GROUP_LABELS = {
  pending_open:        'Pending / Open',
  shipped:             'Dikirim',
  delivered_belum_btb: 'Sampai · BTB Belum Terbit',
  btb_terbit:          'BTB Terbit · Belum Invoice',
  terkirim_penuh:      'Terkirim Penuh',
  expired:             'Lewat Tenggat Kirim',
  mendekati_expired:   'Mendekati Tenggat Kirim',
  pernah_risiko_pinalti: 'Pernah Kirim Telat · Risiko Pinalti',
  finance:             'Finance',
  cancelled:           'Dibatalkan',
};

/**
 * Ambang aman PostgREST. Query drill-down apa pun yang mengembalikan TEPAT
 * angka ini berarti kemungkinan terpotong — dan untuk kartu yang memakai
 * join/diff di client (deliveredBelumBtb, expired, mendekatiExpired) hasilnya
 * jadi tak bisa dipercaya, bukan sekadar kurang lengkap. Saat itu terjadi,
 * drill-down-nya naik jadi RPC.
 */
export const DRILLDOWN_ROW_CAP = 1000;

/**
 * True kalau salah satu hasil fetch drill-down menyentuh batas cap.
 * @param {...({length:number}|undefined|null)} results - array hasil fetch
 */
export function isDrilldownTruncated(...results) {
  return results.some((r) => (r?.length ?? 0) >= DRILLDOWN_ROW_CAP);
}

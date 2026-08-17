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
// BUKAN pengganti TAB_GROUPS di SalesOrderPage.jsx — itu pengelompokan LAIN
// untuk keperluan lain (tab list SP: pending/gudang/kirim/cancelled, di mana
// `pending` cuma DRAFT). Sengaja dibiarkan terpisah; menyatukannya akan
// memaksa salah satu layar memakai pengelompokan yang bukan miliknya.

/**
 * 12 tahap mesin status SP + CANCELLED, urut sesuai peringkat
 * `sp_recompute_status` (dari paling awal ke paling akhir).
 * Dipakai sebagai acuan urutan; bukan filter.
 */
export const SP_STATUS_ORDER = [
  'DRAFT', 'CONFIRMED', 'MENUNGGU_STOK', 'PICKING', 'PACKED',
  'DIKIRIM', 'SAMPAI', 'BTB_TERBIT', 'TERKIRIM_PENUH',
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
 *  - `expired`/`mendekati_expired` TIDAK ditentukan status, melainkan tanggal,
 *    jadi tak punya entri di sini — lihat STATUS_EXCLUDED_FROM_EXPIRY.
 */
export const STATUS_GROUPS = {
  pending_open:        ['DRAFT', 'CONFIRMED', 'MENUNGGU_STOK', 'PICKING', 'PACKED'],
  shipped:             ['DIKIRIM', 'SAMPAI'],
  delivered_belum_btb: ['SAMPAI', 'TERKIRIM_PENUH'],
  btb_terbit:          ['BTB_TERBIT'],
  finance:             ['INVOICED', 'SUBMITTED', 'LUNAS'],
  cancelled:           ['CANCELLED'],
};

/**
 * Status yang membuat sebuah SP TIDAK dihitung kedaluwarsa, berapa pun
 * tanggalnya. Dipakai kartu `expired` dan `mendekatiExpired`.
 */
export const STATUS_EXCLUDED_FROM_EXPIRY = ['LUNAS', 'CANCELLED'];

/**
 * Label kartu (Bahasa Indonesia) — dipisah dari array status supaya penamaan
 * UI bisa berubah tanpa menyentuh logika filter.
 */
export const STATUS_GROUP_LABELS = {
  pending_open:        'Pending / Open',
  shipped:             'Dikirim',
  delivered_belum_btb: 'Sampai — BTB Belum Terbit',
  btb_terbit:          'BTB Terbit — Belum Invoice',
  expired:             'Expired',
  mendekati_expired:   'Mendekati Expired',
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

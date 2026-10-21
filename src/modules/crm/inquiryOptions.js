/* =========================================================================
   inquiryOptions — kosakata pilihan Inquiry yang dipakai LEBIH DARI SATU layar.

   KENAPA FILE TERSENDIRI, bukan di-export dari InquiryFormPage.jsx.
   Rencana awal Batch B4 memang meng-export `CARGO_TYPES`/`SERVICES` langsung
   dari form yang menuliskannya. Itu ditolak lint: `react-refresh/only-export-
   components` — sebuah file yang meng-export komponen tak boleh sekaligus
   meng-export konstanta, karena Fast Refresh jadi rusak. Proyek ini SUDAH punya
   jawaban kanoniknya: `v3/tokens.js` lahir persis karena alasan yang sama
   (lihat komentar di baris ~113 file itu), begitu juga `bant.js`,
   `salesRoster.js`, `activityFeed.js` di folder ini.

   Yang PENTING dan tak berubah dari rencananya: ini SATU sumber kebenaran, BUKAN
   cermin. `InquiryFormPage` (yang menulis nilainya) dan `DealDetailPage` (yang
   menampilkannya) sama-sama membaca dari sini. Menambah satu kategori kargo
   cukup di file ini — nol tempat kedua yang harus diingat.

   ⚠️ `id` di bawah adalah nilai yang BENAR-BENAR tersimpan di kolom
   `inquiries.cargo_types[]` dan `inquiries.additional_services[]`. Mengubah `id`
   = memutus data lama yang sudah tersimpan; yang boleh diubah bebas hanya
   `label` dan `desc`.
   ========================================================================= */

import {
  Package, AlertTriangle, Droplets, Thermometer, Maximize2, FileCheck,
  Shield, Warehouse, FileText, Umbrella, Truck,
} from 'lucide-react';

/* Kategori kargo — multi-pilih, tersimpan di `inquiries.cargo_types[]`. */
export const CARGO_TYPES = [
  { id: 'normal', Icon: Package, label: 'Normal Cargo', desc: 'General cargo, no special handling' },
  { id: 'dg', Icon: AlertTriangle, label: 'Dangerous Goods (DG) / Hazmat', desc: 'Bahan berbahaya & beracun' },
  { id: 'liquid', Icon: Droplets, label: 'Liquid Cargo', desc: 'Liquids, flexitank or drums' },
  { id: 'reefer', Icon: Thermometer, label: 'Temperature Controlled (Reefer)', desc: 'Rantai dingin / temperature-controlled' },
  { id: 'oversize', Icon: Maximize2, label: 'Oversize / Overweight', desc: 'Out-of-gauge / break bulk' },
  { id: 'permit', Icon: FileCheck, label: 'Special Permit (BPOM, Kementan, etc.)', desc: 'Memerlukan izin instansi terkait' },
];

/* Layanan tambahan — multi-pilih, tersimpan di `inquiries.additional_services[]`. */
export const SERVICES = [
  { id: 'customs', Icon: Shield, label: 'Custom Clearance' },
  { id: 'warehouse', Icon: Warehouse, label: 'Warehouse' },
  { id: 'undername', Icon: FileText, label: 'Undername' },
  { id: 'insurance', Icon: Umbrella, label: 'Cargo Insurance' },
  { id: 'trucking', Icon: Truck, label: 'Trucking' },
];

/* Irisan 2 Inquiry, lanjutan audit mockup -- EMPAT daftar di bawah dipindah
   dari const lokal InquiryFormPage.jsx (persis alasan header file ini: SATU
   sumber kebenaran, bukan cermin) supaya DealDetailPage.jsx (tab Overview
   inline-edit, section Route/Cargo) bisa memakai array PERSIS SAMA dengan
   yang menuliskannya, tanpa menyalin array string kedua yang bisa melenceng.
   Ketiganya array string polos (string itu sendiri = nilai tersimpan, bukan
   `{id,label}` seperti CARGO_TYPES/SERVICES di atas) -- bentuk lama
   dipertahankan apa adanya, cuma pindah lokasi. */

/* Incoterms — multi-pilih, tersimpan di `inquiries.incoterms[]`. */
export const INCOTERMS = ['EXW', 'FOB', 'CFR/CNF', 'CIF', 'DDU/DAP', 'DDP'];

/* Tipe kontainer — multi-pilih, tersimpan di `inquiries.container_types[]`. */
export const CONTAINER_TYPES = ["FCL 20'", "FCL 40'", "FCL 40'HC", 'LCL'];

/* Kelas IMO — single-select, tersimpan di `inquiries.imo_class`. Label
   mockup Inquiry Management.dc.html hanya "Class 1".."Class 9" polos (tanpa
   keterangan) -- SENGAJA TETAP dipertahankan dengan keterangan di sini
   (bukan disederhanakan ikut mockup): nilai yang sudah tersimpan di data
   lama memakai format ber-keterangan ini, menyamakan ke mockup akan
   memutus kecocokan pilihan <select> terhadap data yang sudah ada. */
export const IMO_CLASSES = ['Class 1 — Explosives', 'Class 2 — Gases', 'Class 3 — Flammable Liquids', 'Class 4 — Flammable Solids', 'Class 5 — Oxidizers', 'Class 6 — Toxic', 'Class 7 — Radioactive', 'Class 8 — Corrosives', 'Class 9 — Miscellaneous'];

/* MSDS Available — single-select, tersimpan di `inquiries.has_msds` (text,
   bukan boolean). Label mockup berbahasa Inggris ("Yes"/"No"/"Not sure
   yet") -- SENGAJA TETAP Bahasa Indonesia di sini ("Ya"/"Tidak") karena
   itu yang sudah tersimpan di data lama lewat InquiryFormPage.jsx; memakai
   label Inggris akan membuat <select> edit tak punya opsi yang cocok untuk
   baris lama (muncul kosong/tak terpilih padahal datanya ada). */
export const MSDS_OPTS = ['Ya', 'Tidak', 'Not Sure Yet'];

/* TD-318 Irisan 3 -- 4 alasan Won manual, tersimpan di `inquiries.won_reason`.
   SATU sumber kebenaran untuk tiga pemakai: DealWonModals.jsx (pilihan
   <select>), DealDetailPage.jsx (menentukan "ini Won manual" untuk chip
   "Manual win" + link Revert -- BUKAN "<> 'Accepted quotation'", karena
   staging punya baris won_reason teks bebas yang bukan salah satu dari 4
   ini dan bukan juga 'Accepted quotation'; whitelist positif menolak
   keduanya dari dianggap "manual yang valid"), dan migrasi
   20261021000001 (badan mark_inquiry_won/revert_manual_win -- disalin
   manual di SQL, bukan diimpor, tapi WAJIB bergerak bersama daftar ini). */
export const WON_MANUAL_REASONS = [
  'Quoted outside Nexus',
  'Repeat order under existing agreement',
  'Verbal confirmation',
  'Legacy data',
];

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

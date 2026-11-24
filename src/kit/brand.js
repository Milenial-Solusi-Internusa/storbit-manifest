/* =========================================================================
   Nexus Kit — brand assets. Satu sumber kebenaran untuk aset yang sebelumnya
   di-hardcode sebagai string literal di banyak file (logo MSI dipakai 6
   file: App.jsx, Login.jsx x2, QuotationDetailPage.jsx x2, RateSheetPDF.jsx,
   QuotationPDF.jsx — ditemukan saat investigasi item Dev Tracker "Bangun
   component library UI Nexus", 24 Nov 2026).

   ⚠️ URL ini menunjuk Supabase Storage PRODUCTION (bucket `assets`, public,
   baca-saja) — bukan aset lokal di repo. Mengganti logo/nama produk ke depan
   (Nexus -> NusaGrid, belum dikunci) berarti ganti NILAI konstanta ini saja,
   bukan menyisir 6 file lagi.
   ========================================================================= */

export const MSI_LOGO_URL =
  'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png';

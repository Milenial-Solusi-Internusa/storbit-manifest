// src/lib/taxConstants.js
// Single source of truth for PPN (VAT) rate literals currently hardcoded
// across SP/Invoice/Quotation calculations.

/**
 * Standard PPN rate (11%) — dipakai spCalc.js's calcItem() (confirmed by
 * Koh Denny), SalesOrderDetailPage.jsx, InputSPPage.jsx, dan
 * QuotationFormPage.jsx (service_type "custom"/kepabeanan saja).
 *
 * Harus tetap sinkron manual dengan literal 0.11 di dalam RPC create_invoice
 * (supabase/schema_snapshot.sql) — fungsi SQL itu di luar scope perubahan ini.
 * Keduanya nanti idealnya baca entity_finance_settings.ppn_rate per company,
 * tapi penyambungan itu kerjaan terpisah, belum dijadwalkan.
 */
export const PPN_RATE = 0.11;

/**
 * Reduced PPN rate (1.1%) untuk quotation bertipe freight-forwarding.
 * BUKAN typo/bug — business rule sengaja (perlakuan PPN "nilai lain" ala
 * Indonesia untuk freight forwarder vs. jasa kepabeanan langsung), sudah
 * dikonfirmasi & dipertahankan eksplisit di histori project:
 *   - docs/Governance/00_DEV_JOURNEY.md, fase "2.1A": "VAT_RATE tetap 0.011
 *     (1.1%, existing); tidak diubah ke 0.11 (formula task '×0.11' ilustratif)"
 *   - docs/Governance/00_DEV_JOURNEY.md, fase "2.10C": "service Customs→VAT
 *     11%, lainnya→1,1%"
 *   - PROGRESS.md, 2026-06-22, "TASK 2 (Form VAT)"
 * Cuma dipakai QuotationFormPage.jsx, sebagai default utk service_type
 * selain "custom". Jangan "dibenerin" biar sama dengan PPN_RATE.
 */
export const PPN_RATE_FREIGHT_FORWARDING = 0.011;

/**
 * Persentase PPN yang DICETAK sebagai LABEL di invoice ("VAT (12%)").
 *
 * ⚠️ SENGAJA BERBEDA dari PPN_RATE = 0.11 di atas, dan KEDUANYA BENAR — jangan
 * "disamakan" ke salah satu arah. Ini bukan konstanta perhitungan; ia TIDAK
 * dipakai di aritmetika mana pun, hanya untuk teks label.
 *
 * Alasannya (dari Finance, 11 Sep 2026): tarif PPN resmi sejak 2025 adalah 12%,
 * tapi ia dikenakan atas DPP NILAI LAIN = 11/12 x DPP (DPP_NILAI_LAIN_RATIO di
 * bawah). Jadi:
 *     PPN = 12% x (11/12 x DPP) = 11% x DPP
 * Tarif EFEKTIF terhadap DPP penuh memang 11% — itulah yang dihitung
 * create_invoice (literal 0.11 di SQL) dan PPN_RATE di sini, dan NOMINALNYA
 * SUDAH BENAR. Sedangkan Faktur Pajak menuliskan tarif STATUTORI-nya: 12%.
 * Invoice mengikuti Faktur Pajak, supaya angka di kedua dokumen tidak terbaca
 * bertentangan oleh customer.
 *
 * Kalau tarif statutori berubah lagi: ubah INI untuk label, dan ubah PPN_RATE
 * + literal 0.11 di create_invoice untuk perhitungan — keduanya keputusan
 * terpisah, dan mengubah yang satu tidak mengubah yang lain.
 */
export const PPN_LABEL_PCT = 12;

/**
 * Rasio DPP Nilai Lain (11/12) — dasar hukum PPN 12% tetap memakai DPP Nilai
 * Lain supaya beban pajak efektif setara tarif 11% lama. Dipakai InvoicePDF.jsx
 * untuk baris informational "DPP (Nilai Lain)" — TIDAK menggantikan total_dpp
 * (kolom DB, beda definisi) dan TIDAK ikut dijumlahkan ke Grand Total.
 */
export const DPP_NILAI_LAIN_RATIO = 11 / 12;

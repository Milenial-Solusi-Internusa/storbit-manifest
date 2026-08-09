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

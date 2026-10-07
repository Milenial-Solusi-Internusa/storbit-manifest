# Batch FS — Peta Struktur Target

Gambaran akhir struktur folder repo Nexus setelah seluruh Batch FS (Fase 1 sampai 7) selesai dieksekusi, hasil penerapan aturan di `Batch_FS_Fase_0_Aturan_Struktur.md` ke sembilan modul Bagian 1 Grand Design. Dokumen ini murni target, tidak mencampur status migrasi (mana yang sudah ada, mana yang belum) — status per item ditelusuri terpisah lewat catatan di Fase 0 dan Bagian 4 Gap Analysis.

---

## `src/`

```
src/
  App.jsx              shell dan layout saja, tidak lagi tempat halaman didaftarkan
  main.jsx
  index.css
  routes/              satu file kecil per modul, digabung index.js
  assets/              file statis: logo, font
  components/          komponen lintas MODUL saja
  contexts/
  hooks/               hook lintas MODUL saja
  kit/                 design system (Batch DS), termasuk kit/print/ —
                       printKit.jsx dan printTokens.js, dipakai Invoice,
                       Storbit Report, Picking List, dan Surat Jalan
  lib/                 utilitas lintas MODUL saja

  modules/
    crm/
      lead/
      inquiry/
        pages/
        documents/          InquiryPDF
      feasibility/
        pages/
      quotation/
        pages/
        documents/
      sales-order/
        pages/
        documents/
      shipment-instruction/
      pipeline/
        pages/
      customer/
        pages/
      sales-activity/
        pages/
        documents/
      sales-target/
        pages/
      handover/
        pages/
      components/       lintas 2+ sub-fitur CRM

    procurement/
      vendor/
        pages/
      rate-sourcing/
        pages/
      purchase-requisition/
      purchase-order/
      trading-procurement/
      vendor-evaluation/

    logistics-warehouse/
      freight/
        job-order/
        export-packing-list/
        shipment-execution/
        fleet-trucking/
        proof-of-delivery/   dicadangkan untuk bukti serah terima freight MSI
      warehouse/
        goods-receiving/
          pages/
        bin-management/
        wave-dispatch/
        picking-packing/
          pages/
          documents/
        delivery-note/
          pages/
          documents/
        proof-of-delivery/   BTB Storbit, menyusul diekstrak dari
                             SalesOrderDetailPage.jsx
        stock-transfer/
        stock-opname/
        stock-dashboard/
        barcode-label/

    console/
      consolidation-planning/
      space-booking/
      master-manifest/
      agent-partner/

    ppjk/
      tariff-classification/
      regulatory-licensing/
      duty-tax/
      customs-document/
      inspection-risk/
      compliance-risk/

    finance-accounting/
      cash-bank/
      accounts-receivable/
        pages/
        documents/          InvoicePDF
      accounts-payable/
      general-ledger/
      tax-compliance/
      payment-terms/

    hcga/
      employee-directory/
      recruitment/
      training/
      performance-appraisal/
      service-request/
        pages/
      offboarding/
      payroll-administration/

    it/
      helpdesk/
      development-backlog/
      security-access/
      infrastructure-monitoring/
      asset-network/

    quality-management/
      document-control/
      internal-audit-capa/
      risk-register/
      management-review/
      continual-improvement/

    system/
      admin-settings/
      home/
      dashboard/
      profile/
```

---

## `docs/`

```
docs/
  Governance/
    00_DEV_JOURNEY.md
    00_INDEX_README.md
    01_PRD_NEXUS.md
    02_RULES_GOVERNANCE.md
    03_DATA_MODEL.md            + model data yang diserap dari Finance Blueprint lama
    04_ROLE_PERMISSION_MATRIX.md
    05_WORKFLOW_MAP.md          + alur proses yang diserap dari Finance Blueprint lama
    06_UI_UX_FLOW.md            + seluruh isi Design System Reference lama
    07_API_REPOSITORY.md
    08_TECH_DEBT.md
    09_ROADMAP.md               + rencana migrasi yang diserap dari Finance Blueprint lama
    10_TASK_BREAKDOWN.md
  archive/                      tujuan dokumen lama di luar Governance
```

Persis sebelas file, satu keluarga penomoran 00 sampai 10. Tidak ada file lepas di `docs/` di luar `Governance/` dan `archive/`.

---

## `supabase/`

```
supabase/
  schema_snapshot.sql
  config.toml
  functions/
    aging-pipeline/
    create-user/
    delete-user/
    manage-schema/
    notify-sp-milestone/
    reset-password/
    send-email/
  migrations/                   ratusan file bertanggal, tidak diringkas di sini
```

---

## `scripts/`

```
scripts/
  seed/
    accounts_soa_seed.csv
    branches_seed.csv
    dc_master_soa_seed.csv
    products_soa_seed.csv
    master_data_seed.sql
    menu_catalog_seed.sql
  backup/
    backup_full_20260709.sql
```

---

## Root

```
CLAUDE.md, AGENTS.md, PROGRESS.md, README.md, PROJECT_CONTEXT.md
package.json, package-lock.json
vite.config.js, tailwind.config.js, postcss.config.js, eslint.config.js
index.html, .env.example, .gitignore
```

Tidak ada lagi file seed, backup, atau dokumen audit lepas nangkring di root.

---

## Catatan Terbuka yang Belum Diputuskan

```
Konfigurasi agent (.claude/agents/ dan .codex/agents/) yang dobel, belum
diputuskan disatukan atau memang sengaja dipertahankan dua-duanya kalau
Codex dan Claude Code memang dipakai bergantian
```

---

*Peta ini adalah penerapan aturan Fase 0 ke seluruh repo. Eksekusi menuju bentuk ini berjalan bertahap lewat Fase 1 sampai 7, bukan sekali jalan. Lihat `Batch_FS_Fase_0_Aturan_Struktur.md` untuk aturan lengkap dan alasan tiap keputusan.*

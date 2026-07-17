# CRM FLOW AUDIT — Nexus by MSI (potret APA ADANYA)

> **Sifat dokumen:** recon read-only kondisi CRM di kode per commit `dbfd868` (branch `fix/load-ibm-plex-mono`). Bukan penilaian bagus/jelek, bukan rancangan baru — hanya memetakan yang BENAR-BENAR ada di kode + membandingkannya dengan diagram rancangan CRM saat itu.
> **Catatan rujukan:** diagram rancangan asli (dulu `crm_workflow.md`) sudah **dihapus secara sengaja** dan **tidak lagi menjadi acuan**. Perbandingan di Bagian 5 dipertahankan sebagai **rekaman historis** kondisi saat audit dibuat (2026-07-15), bukan rujukan hidup.
> **Sumber kebenaran DB:** `supabase/schema_snapshot.sql` (bukan `migrations/`).
> **⚠️ TIDAK dijalankan app/build.** Semua di bawah = pembacaan kode + schema + dokumentasi Governance. Perilaku yang hanya bisa dipastikan runtime ditandai eksplisit di Bagian 6.

---

## BAGIAN 1 — Alur CRM Nyata (Stage Machine + Transisi)

### 1.1 Definisi stage

Pipeline = tabel **`accounts`**, kolom **`pipeline_stage`** (`character varying DEFAULT 'NEW'`, `schema_snapshot.sql:1440`). **TIDAK ada CHECK constraint** yang membatasi nilai stage di DB (hanya `source` & `pull_status` yang ber-CHECK, `schema_snapshot.sql:1489-1490`) → kosakata stage **hanya di-enforce di kode**.

Konstanta `STAGES` di `PipelineKanbanPage.jsx:18-26`:

| Urut | id (kode, lowercase) | Nilai DB (uppercase) | Label | Prob % |
|---|---|---|---|---|
| 1 | `new` | `NEW` | New | 10 |
| 2 | `contacted` | `CONTACTED` | Contacted | 20 |
| 3 | `qualified` | `QUALIFIED` | Qualified | 40 |
| 4 | `proposal` | `PROPOSAL` | Proposal | 60 |
| 5 | `negotiation` | `NEGOTIATION` | Negotiation | 80 |
| 6 | `won` | `WON` | Won | 100 |
| 7 | `lost` | `LOST` | Lost | 0 |

Konversi case: tulis `stageId.toUpperCase()` (`PipelineKanbanPage.jsx:611`), baca `.toLowerCase()` (`:838`). `account_status` (kolom terpisah, `schema_snapshot.sql:1466`) menandai tahap master: `prospect` / `lead_pool` / `customer` / `lost`.

`stage_changed_at` (`schema_snapshot.sql:1479`) **di-stamp otomatis oleh trigger DB** `track_stage_change()` (`schema_snapshot.sql:1402-1412`) saat `pipeline_stage` berubah — inilah yang memberi makan badge aging & Edge Function aging.

### 1.2 Tabel transisi (yang benar-benar ada di kode)

Semua transisi = drag-drop di Kanban (`handleDropStage` `PipelineKanbanPage.jsx:648-694`; tulis DB `applyStageMove` `:610-646`). Gate hanya dicek berdasar stage **tujuan**, bukan asal.

| Dari → Ke | Pemicu | Gate / ambang | Blok atau Warn | Bukti (file:line) |
|---|---|---|---|---|
| stage → stage sama | drop kolom sama | — | no-op (return awal) | `:654` |
| → QUALIFIED | drag-drop | BANT `calcBantScore < 5` | **HARD BLOK** (toast, batal) | `:662-668` |
| → QUALIFIED | drag-drop | BANT `5 ≤ score < 8` | WARN (ConfirmModal) | `:669-671`, `:1121` |
| → QUALIFIED | drag-drop | BANT `score ≥ 8` | lolos | `:662-672` |
| → PROPOSAL | drag-drop | 0 baris `inquiries` utk prospect | WARN (ConfirmModal) | `:673-681`, `:1122` |
| → WON | drag-drop | 0 baris `quotations` utk prospect | WARN (ConfirmModal) | `:682-691`, `:1119` |
| → WON | setelah confirm | alasan WinLossModal wajib | tunda tulis s/d disimpan | `:613-618`, `:744-759` |
| → WON | setelah WinLoss save | **handover Light/Strategic** by nilai > Rp100jt | tunda tulis s/d handover submit | `:558`, `:751-757`, `:784-801` |
| → LOST | drag-drop | alasan WinLossModal wajib | tunda tulis s/d disimpan | `:613-618`, `:761-773` |
| → NEW / CONTACTED / NEGOTIATION | drag-drop | **tak ada** | lolos (tulis langsung) | `:648-694`, `:610-646` |

Catatan: tak ada transisi balik otomatis. BANT blok (`<5`) hanya **membatalkan** pemindahan (kartu tetap di tempat) — **BUKAN** menendang balik ke CONTACTED seperti digambar desain.

### 1.3 BANT scorecard (`bant.js`)

4 dimensi rubrik 0–3 (`bant_budget/authority/need/timeline`, `bant.js:7-52`); `BANT_MAX_SCORE=12` (`:54`); skor = jumlah 4 dimensi (`calcBantScore` `:56-57`). Band (`bantScoreMeta` `:59-63`): `≥8` Qualified (canQualify:true) · `≥5` Nurture · `<5` Disqualify. Kolom DB `accounts.bant_score` (`schema_snapshot.sql:1465`); kolom legacy `bant_commodity/origin/…` dipertahankan tapi **tak** memberi makan skor.

### 1.4 Lead Pool & Aging

- **Kanban menyembunyikan** yang di-pool: `.eq('is_in_lead_pool', false)` (`PipelineKanbanPage.jsx:587`). **Lead Pool page** hanya yang di-pool: `.eq('is_in_lead_pool', true)` (`LeadPoolPage.jsx:120`).
- **Aging otomatis** via Edge Function `supabase/functions/aging-pipeline/index.ts` (batas: NEW 7 · CONTACTED 5 · QUALIFIED 5 · PROPOSAL 3 · NEGOTIATION 14, `index.ts:4-10`), cron harian 01:00 WIB, hanya entitas `aging_enabled=true` (MSI). Idle = hari sejak `MAX(stage_changed_at, last_activity_at)`. Lewat batas → `is_in_lead_pool=true` + `account_status='lead_pool'` + notifikasi `crm.lead_idle`.
- **Tarik ke pipeline** (sales): `pull_status='pending'` + justifikasi **≥20 char** (`LeadPoolPage.jsx:50,168-179`) → **approval manager/supervisor** (`LeadPoolApprovalPage.jsx:114-133`) → balik ke stage sebelumnya (`PREV_STAGE` map). Reject → tetap di pool.

---

## BAGIAN 2 — Inventaris Form (input yang dikonsumsi)

| # | Form | File | Page/Modal | Field utama | Target tabel / RPC | Bukti (file:line) |
|---|---|---|---|---|---|---|
| 1a | Prospect / Lead | `src/modules/crm/ProspectFormPage.jsx` | Page (create+edit) | company (`name`,`legal_name`,`customer_type`,`source`,PIC,`phone/email/city/address`), pipeline (`pipeline_stage`,`assigned_to`,`payment_terms_id`,`notes`), **BANT 4-dim** (`bant_budget/authority/need/timeline`), cargo legacy (`bant_commodity/origin/destination/frequency/current_vendor/decision_maker`), `won_reason`/`lost_reason` | **`accounts`** (`account_status='prospect'`); soft-delete `deleted_at` | insert `:232`, update `:228`, delete `:173` |
| 1b | Win/Loss capture | `src/modules/crm/WinLossModal.jsx` | Modal | Won: `won_reason` (wajib). Lost: kategori (price/competitor/no_need/no_response/budget_cut/other)+detail → `lost_reason` | **Tak tulis DB sendiri** — `onSave` balikkan objek ke ProspectFormPage/PipelineKanban | `:43` / `:51` |
| 2a | Visit (AddVisitModal) | `src/modules/crm/CRMDashboardPage.jsx` | Modal (`:1075`) | `visit_type`,`visit_date`→scheduled_for,`visit_time`,`prospect_id`→account_id,`salesperson_id`→assigned_to,`location`,`point_of_meeting`,`mom`,`follow_up`→next_action,`notes`,`status` (visit-fields di `details` jsonb) | **`activities`** (type='visit') + `activity_logs` | insert `:2231`, update `:2229`, details `:2215`, log `:2244` |
| 2b | Sales Call | `src/modules/crm/SalesCallsPage.jsx` | Modal (create+edit) | `contact_name/phone`,`prospect_id`,`call_date`,`call_time`,`result`→outcome,`notes`,`next_action(_date)`; `details` jsonb: `call_type`,`duration_minutes`,`bant_collected` | **`activities`** (type='call', status='done') | insert `:548`, update `:546`, details `:538` |
| 2c | Activity / Task | `src/modules/crm/ActivitiesPage.jsx` | Modal (create+edit) | `type`(call/whatsapp/visit/meeting),`scheduled_for`,`activity_time`,`assigned_to`,`account_id`,`contact_*`,`notes`,`next_action(_date)`,`details.location` | **`activities`**; + `activity_logs` | insert `:686`, edit `:807`, done `:715`, cancel `:739`, delete `:763`, log `:696/725/750/809` |
| 3 | Inquiry / RFQ | `src/modules/crm/InquiryFormPage.jsx` | Page (create+edit) | source→`prospect_id`/`customer_id`,`service_type`,`deadline_quote`,`pol`,`pod`,`pickup/delivery_address`,`incoterms[]`,`container_types[]`,`goods_name`,`hs_code`,`weight_kg`,`volume_cbm`,`dimension`,`route`,`commodity`,`estimated_volume`,`cargo_types[]`,DG(`un_number`,`imo_class`,`has_msds`),`additional_services[]`,`notes` | **`inquiries`**; nomor RPC **`increment_document_sequence`** (INQ/CRM) | insert `:283`, update `:268`, nomor `:135` |
| 4 | PRF (Price Request Form) | `src/modules/procurement/PRFFormPage.jsx` | Page **create-only** (DRAFT/SUBMITTED, tanpa jalur edit) | Sec01 (`customer_source`,`account_id`/`account_name_manual`,`inquiry_id`,`stream`,`deadline_quotation`), inquiry details (`direction`,`commodity`,`hs_code`,`msds_available`,`service_type`,`incoterms`,`commercial_value/currency`,`origin/destination`,addr,`add_on_services[]`/`others`,`cargo_ready_date`), Sec03 dinamis (Sea FCL/LCL, Air, Inland, Custom, Project), `notes` | **`prf`**; nomor RPC **`increment_document_sequence`** (PRF/PROC, reset per-bulan) | insert `:371`, nomor `:302` |
| 5 | Quotation Builder | `src/modules/crm/QuotationFormPage.jsx` | Page (create+edit) | Header (`inquiry_id`,`service_type`,`route`,`quote_date`,`valid_until`,`pricing_done_at`,`discount_pct`,`payment_terms_id`,`vat_rate`,`usd_rate`,`attention_to`,addr,`cargo_mode`,`gw/dimension/cw/cbm`,`container_type/qty`) + line items per section (`description`,`cost_price`,`currency`,`exchange_rate`,`unit_price`,`unit_label`,`qty`,`total`,`if_any`) + total (`subtotal`,`tax_amount`,`total_amount`,`status`) | **Edit**: RPC **`save_quotation`** (atomik). **Create**: insert langsung `quotations` + `quotation_items`. Nomor RPC (QUO/CRM) | edit RPC `:748`, create quotations `:805`, items `:810`, nomor `:153` |
| 6a | Light Handover | `src/modules/crm/LightHandoverModal.jsx` | Modal | `npwp`,`alamat`,`pic_operasional`,`pic_finance`,`tipe_customer`,`stream_service`,`estimasi_volume`,`payment_terms`,`credit_limit`,`validity_quote`,`special_handling` (Ops checklist = UI-only, tak persist) | **Tak tulis sendiri** — `onSubmit(fields)`; caller insert **`deal_handovers`** | onSubmit `:70`; caller `PipelineKanbanPage.jsx:787` |
| 6b | Strategic Handover | `src/modules/crm/StrategicHandoverModal.jsx` | Modal | profil (`npwp`,`nib`,`ktp_direktur`,`industri`,`tier_assigned`…), PIC tree (`pic_decision_maker/operasional/commercial/finance/escalation_1/2`), komersial (`tcv_forecast`,`quotation_ref`,`volume_per_lane`,`service_mix`,`sla_komitmen`,`msa_status`), kredit (`payment_terms`,`credit_limit`,`pefindo_score`,`bank_reference`,`tax_status`), SOP (`doc_requirement`,`communication_pref`,`reporting_cadence`,`kam_assigned`) | **Tak tulis sendiri** — `onSubmit(fields)`; caller insert **`deal_handovers`** (type='strategic') | onSubmit `:89`; caller `PipelineKanbanPage.jsx:787` |
| 6c | TOP Request | `src/modules/crm/TOPRequestModal.jsx` | Modal (**tulis sendiri**) | identitas, profil bisnis, finansial (`total_aset`,`annual_revenue`…), bank refs (`bank_1/2_*`), trade refs (`trade_ref_1/2/3`), kredit (`top_requested`,`credit_limit_diminta`,`alasan_top`) | **`top_requests`** (status='submitted') | insert `:81` |
| 7 | Rate List editor | `src/modules/crm/RateListPage.jsx` | Page + `RateEditor` inline | `rate_name`,`valid_until`,`note`, `columns`(jsonb string[]), `rows`(jsonb string[][]); default kolom POL/POD/O·F/CFS/OTHERS/REMARKS | **`rate_sheets`** | insert `:128`, update `:124`, delete `:282` |

Entry point tambahan yang bukan form input tapi menulis stage: **PipelineKanban drag** (`accounts.update` `:626-629`), **finalizeWon** (`:722-728`), **LOST** (`:764-765`).

---

## BAGIAN 3 — Inventaris Dokumen / Output (yang dihasilkan)

**Temuan kunci: TIDAK ADA satu pun PDF CRM yang dipersist.** Nol `storage.from(...)` / `.upload()` / `getPublicUrl` di seluruh `src/modules/crm/`. Semua PDF di-generate di browser via `@react-pdf/renderer` lalu di-download sebagai blob (atau `<PDFDownloadLink>`). Tak ada baris `quotations`/`inquiries` yang menyimpan path/URL PDF. Yang tersimpan ke DB hanya **record terstruktur** (bukan dokumennya).

| Output | Pemicu (file:line) | Dibuat oleh | Disimpan di mana | Format | Persist? |
|---|---|---|---|---|---|
| Quotation Letter PDF | `QuotationDetailPage.jsx:274` (tombol `:357`,`:526`; blob `:277-285`) | `QuotationPDF.jsx:99` | — (blob download) | PDF | **Tidak** |
| Inquiry PDF | `InquiryListPage.jsx:324-340` (`<PDFDownloadLink>`) | `InquiryPDF.jsx:113` | — (download link) | PDF | **Tidak** |
| Rate Sheet PDF | `RateListPage.jsx:290` (blob `:299-309`) | `RateSheetPDF.jsx:80` | — (blob download) | PDF | **Tidak** |
| Activity Report PDF | `CRMReportPage.jsx:469` (blob `:479-486`) | `ActivityReportPDF.jsx:77` | — (blob download) | PDF | **Tidak** |
| Visit History PDF | `RiwayatVisitPage.jsx` (blob `:260-280`) | `VisitHistoryPDF.jsx:79` | — (blob download) | PDF | **Tidak** |
| Activity feed / log | `ActivitiesPage.jsx:696/725/750/809`; `CRMDashboardPage.jsx:2244` | inline `activity_logs.insert` | **`activity_logs`** | baris transisi status | **Ya** |
| Audit log | caller `logAudit`, mis. `PipelineKanbanPage.jsx:767`, `QuotationFormPage.jsx:755` | `src/lib/auditLogger.js:70` | **`audit_logs`** | baris (action/entity/old/new jsonb) | **Ya** |
| Lost Reason | `PipelineKanbanPage.jsx:744` (save `:764-765`) | WinLossModal + `accounts.update` | **`accounts.lost_reason`** (+ audit) | kolom + audit | **Ya** |
| MOM (visit) | `CRMDashboardPage.jsx:2219` | draft visit | **`activities.details`** jsonb (`mom`) | field jsonb | **Ya** |
| Call Report | `SalesCallsPage.jsx:525` (details `:538-542`) | `activities.insert/update` | **`activities`** row + `details` jsonb | row + jsonb | **Ya** |

`logAudit` ACTION_TYPES CRM (`auditLogger.js:23-50`): CREATE/UPDATE/DELETE_PROSPECT, _INQUIRY, _QUOTATION, APPROVE/REJECT_QUOTATION (didefinisikan tapi **tak ada pemicunya** — tak ada flow approve/reject quotation), CREATE/UPDATE/DELETE_ACTIVITY, CONVERT_LEAD, CHANGE_PIPELINE_STAGE.

Artefak desain yang **TIDAK di-generate** kode: Lead Card/LC, Costing Sheet/BOM, Client Purchase Order (PO), Official Sales Order (SO) sebagai dokumen. Lost Reason "Log" hanya kolom, bukan log/dokumen tersendiri.

---

## BAGIAN 4 — Gate & Handoff

### 4.1 Gate & Approval

| # | Gate | Siapa berhak | Lolos/blok | Di-enforce di mana | Bukti |
|---|---|---|---|---|---|
| A1 | **BANT → QUALIFIED** | siapa pun yang bisa drag (RLS `prospects_update`) | `<5` HARD BLOK · `5–7` WARN · `≥8` lolos | **Client-only** (tak ada cek DB/RLS atas `bant_score`) | `PipelineKanbanPage.jsx:662-672`; `bant.js:54-62` |
| A2 | **Lead Pool pull approval** | requester: sales; approver-menu: `ceo,gm,gm_bd,manager,supervisor,admin,super_admin` (App.jsx:474) | sales set `pending`→manager set `approved`/`rejected` | Peran approver **client-only** (menu). RLS `prospects_update` **tak column-guard `pull_status`** → sales bisa saja set `approved` sendiri via RLS | `LeadPoolPage.jsx:169-175`; `LeadPoolApprovalPage.jsx:118-121`; RLS `schema_snapshot.sql` (`prospects_update`) |
| A3 | **Win/Loss** | siapa pun yang bisa pindah kartu | WON/LOST butuh alasan; LOST tulis langsung; WON tunda → gate handover | **Client-only** | `PipelineKanbanPage.jsx:613-615`, `:744-772` |
| A4 | **WON handover (nilai)** | — | `estimated_value ≤ Rp100jt → Light` / `> → Strategic`; WON resmi (`finalizeWon`) hanya jalan **setelah** `deal_handovers` tersimpan | **Client-only** | `PipelineKanbanPage.jsx:558`, `:751-757`, `:784-801` |
| A5 | **PRF margin/pricing** | — | **TIDAK ADA** approve/reject. PRF hanya `DRAFT`/`SUBMITTED` | status-only | `PRFFormPage.jsx:136-137`, `:371` |
| A6 | **PRF RLS** | insert: `sales`/`gm_bd` (own); select: creator/`procurement`/manager+; update-status: `procurement` saat SUBMITTED | company-scoped + role | **RLS (server)** | `prf_insert`/`prf_select`/`prf_update_draft`/`prf_update_status` di `schema_snapshot.sql` |
| A7 | **Quotation submit** | sales | tombol Submit **disabled sampai `inquiry_id` terisi** (hard gate ketertautan inquiry, BUKAN gate margin/diskon); submit membalik inquiry → `QUOTED` | **Client-only** | `QuotationFormPage.jsx:730,790` |

**Konfirmasi penting:** gate margin (`margin_floor`) & matriks diskon di quotation = **display-only** (Governance `09_ROADMAP.md:157`, TD-38) — tak ada blok server-side. WON `estimated_value` **88% kosong** karena status ACCEPTED tak pernah ditulis (trigger `sync_deal_value_on_quotation_accept` tak pernah jalan; Governance `05_WORKFLOW_MAP.md:53`, TD-54) → gate handover A4 sering menerima nilai 0 → jatuh ke Light.

### 4.2 Role-gate menu CRM (App.jsx, blok kanonik)

| Menu id | Gate | file:line |
|---|---|---|
| `crm-dashboard` | menuKey `crm_dashboard` | `App.jsx:471` |
| `crm-pipeline` | menuKey `crm_pipeline` | `:472` |
| `crm-lead-pool` | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor,sales] | `:473` |
| `crm-lead-pool-approval` | role[ceo,gm,gm_bd,manager,supervisor,admin,super_admin] (**tanpa sales**) | `:474` |
| `crm-prospects` | role[…,ceo,gm,manager,sales,operations] + module `crm` | `:475` |
| `crm-inquiry` | menuKey `crm_inquiry` | `:476` |
| `crm-rate-list` | role[super_admin,admin,ceo,gm,gm_bd,manager,sales] | `:478` |
| `crm-customers` (+msi/jci/soa/free) | menuKey `crm_customers` | `:480-485` |
| `crm-calls` / `crm-activity-log` | role[…,gm_bd,manager,supervisor,sales] | `:488-489` |
| `prf` | role[sales,gm_bd,procurement,manager,ceo,admin,super_admin] | `:581` |
| `riwayat-visit` | role[super_admin,ceo,gm_bd] (paling ketat) | `:795` |
| `indomarco-dashboard` | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor] | `:796` |

Gate menu = **UI-only**; akses data di-enforce terpisah oleh RLS.

### 4.3 Handoff antar-tim (jalur kode nyata)

| # | Handoff | Otomatis / Manual | Bukti |
|---|---|---|---|
| C1 | **RFQ/Inquiry → PRF** | **MANUAL greenfield.** Inquiry tak auto-bikin PRF. Pilih sumber=inquiry hanya simpan `inquiry_id` + auto-isi `account_id`; **tak menyalin** service/route/cargo. Link opsional | `PRFFormPage.jsx:147,226-229,330,371` |
| C2 | **Pricing → Quotation** | **MANUAL.** Tak ada costing sheet / harga-approved / rate_list yang mengalir ke quotation builder. `cost_price`/`unit_price` diketik per baris (default hanya dari `products.default_price`) | `QuotationFormPage.jsx:105,237-238,243-267,416-417` |
| C3 | **WON → Handover → Fulfillment/SP** | **PUTUS di SP.** WON→handover modal→insert 1 baris `deal_handovers` (status='submitted')→finalize WON. **Rantai berakhir di situ** — tak ada trigger/RPC/kode yang bikin SO/SP dari handover. `deal_handovers` tak punya trigger (hanya RLS). SP (`InputSPPage`) modul manual terpisah, nomor SP diketik dari PO customer, nol referensi ke `deal_handovers`/`quotations`/WON. Kolom `approved_by_sales/ops/finance` ada tapi tak ada kode yang mengisinya | `PipelineKanbanPage.jsx:558,751-757,787-795`; modal `:70`/`:89`; SP `InputSPPage.jsx:149,208-240` |
| C4 | **Prospect → Customer (WON)** | **OTOMATIS, dual-enforce.** Client `finalizeWon` set `account_status='customer'` + `converted_at`/`became_customer_at`; independen, trigger DB `trg_set_customer_on_won` (BEFORE INSERT/UPDATE) memaksa `customer` bila `pipeline_stage='WON'` | `PipelineKanbanPage.jsx:722-728`; trigger `schema_snapshot.sql` `set_customer_on_won()` |

---

## BAGIAN 5 — GAP: Desain (rancangan CRM) vs Kode

> ⚠️ Diagram rancangan asli (dulu `crm_workflow.md`) sudah **dihapus secara sengaja** dan tak lagi jadi acuan. Tabel di bawah dipertahankan sebagai **rekaman historis** GAP pada saat audit (2026-07-15), bukan rujukan hidup.
>
> Kolom kiri = ada di diagram rancangan tapi belum/berbeda di kode. Kolom kanan = ada di kode tapi tak tergambar di diagram. **Ini bagian terpenting — didetailkan, bukan diringkas.**

| ADA DI DESAIN, tapi BELUM/BEDA di KODE | ADA DI KODE, tapi TIDAK di DESAIN |
|---|---|
| **Doc "Lead Card / LC"** — tak ada artefak Lead Card. Prospect cuma baris `accounts`, tak ada dokumen LC di-generate. | **Lead Pool + Aging Pipeline** — Edge Function `aging-pipeline` + cron harian + `is_in_lead_pool` + pull-to-pipeline + halaman Approval Lead Pool. Seluruh subsistem ini absen dari diagram. |
| **Gate BANT ambang tunggal** — desain: `<5 blok → balik ke CONTACTED`, `≥5 lolos → PROPOSAL`. Kode: `<5` blok (batal di tempat, **tak** ke CONTACTED), `5–7` **warn** (band tengah yang tak ada di desain), `≥8` lolos (`PipelineKanbanPage.jsx:662-672`). Lolos QUALIFIED ≠ langsung PROPOSAL. | **Gate handover by nilai** — Light ≤Rp100jt / Strategic >Rp100jt (`PipelineKanbanPage.jsx:558`). Desain gambar dua doc handover tapi tak menggambar routing berbasis nilai. |
| **Doc "Call/Meeting Report"** per-visit — tak ada dokumen laporan per-kunjungan. Yang ada: baris `activities` + `mom`/`details` jsonb, plus PDF **agregat** (Visit History / Activity Report), bukan report per-visit. | **TOP Request** (`TOPRequestModal` → `top_requests`) — pengajuan Terms of Payment lengkap (bank/trade ref, pefindo). Tak ada di diagram. |
| **PRICING_LANE — "Run Costing Sheet / BOM"** — **TIDAK ADA** di kode. Tak ada tabel costing/BOM, tak ada mesin costing. PRF cuma form input. | **Mesin status Quotation DRAFT→SUBMITTED→SENT** + hard-gate submit (disabled s/d `inquiry_id`) — gate nyata (`QuotationFormPage.jsx:730`) yang tak digambar (desain cuma "Quotation Letter PDF"). |
| **Gate "FM Review: Margin & T&C Check" (Approved/Rejected)** — **TIDAK ADA**. PRF tanpa approve/reject (cuma DRAFT/SUBMITTED). Margin quotation display-only (TD-38). Tak ada loop Rejected→PRF. | **Konversi Customer OTOMATIS** via trigger DB (`set_customer_on_won`). Desain menyiratkan "Register Master Customer" manual di logistics lane; kode meng-otomasi saat WON. |
| **Doc "Costing Sheet / Rate List"** sebagai output pricing yang balik ke quotation — Rate List **ada** (`RateListPage`→`rate_sheets`) TAPI berdiri sendiri, **tak** tersambung ke Quotation Builder. Costing Sheet tak ada. | **Audit log** (`audit_logs`) + **Activity feed** (`activity_logs`) — dua lapisan pencatatan lintas-modul, tak ada di diagram. |
| **Handoff #1 "Request Harga" (RFQ ⇒ PRF)** — semi-ada. Manual; hanya salin `account_id`, tak salin detail RFQ (C1). | **Reporting surfaces** — CRM Dashboard, CRM Report, Indomarco Dashboard, Riwayat Visit. Tak ada di diagram. |
| **Handoff #2 "Return Base Price" (Costing ⇒ Quotation)** — **TIDAK ADA** jalur otomatis. Semua harga quotation diketik tangan (C2). | **Multi-tipe Activity** via satu tabel `activities` (call/visit/meeting/whatsapp/email/followup) + `activity_logs` transisi. Desain cuma "Visit" & "Call/Meeting Report". |
| **Doc "Client Purchase Order / PO"** — tak ada capture PO. Nomor SP diketik manual dari PO customer, tapi PO tak jadi dokumen/record. | **DealDetailPage** (detail deal per-inquiry + stepper stage) — halaman yang tak tergambar. |
| **Handoff #3 "Trigger Fulfillment" (Handover ⇒ Master Customer/SO)** — **PUTUS**. `deal_handovers` = dead-end, tak ada SO/SP auto (C3). | **WinLossModal redundan** — kumpul alasan di FE padahal konversi WON di-enforce trigger DB (dipertahankan sengaja; `05_WORKFLOW_MAP.md:45`). |
| **LOGISTICS "Convert to Sales Order SO" + Doc "Official SO"** — modul SP ada tapi **terpisah total** & manual, keyed ke PO customer, tanpa FK/trigger balik ke deal/handover/quotation. | **Nomor dokumen via RPC** `increment_document_sequence` (INQ/PRF/QUO, reset per-entitas/bulan) — mekanik yang tak digambar. |
| **Doc "Lost Reason Log"** sebagai log/dokumen — hanya kolom `accounts.lost_reason` + baris `audit_logs`, bukan log tersendiri. | **PRF child fields dinamis** (Sea/Air/Inland/Custom/Project) + 11 add-on — jauh lebih kaya dari kotak "PRF" tunggal di desain. |

**Ringkas kesenjangan struktural:** desain memodelkan **PRICING_LANE sebagai mesin costing dengan gate margin** dan **tiga handoff otomatis** (RFQ→harga, harga→quotation, handover→fulfillment). Kode: PRICING_LANE tereduksi jadi **form PRF tanpa costing/approval**, dan **ketiga handoff itu manual atau putus** — paling parah **WON→SP** (`deal_handovers` dead-end). Sebaliknya, kode punya seluruh subsistem **Lead Pool/Aging** + **reporting** + **TOP Request** + **audit** yang sama sekali tak ada di diagram.

---

## BAGIAN 6 — Ambiguitas / Yang Tak Bisa Dipastikan dari Kode Saja

1. **Quotation header "new fields" (`attention_to`,`pickup/delivery_address`,`cargo_mode`,`gw/dimension/cw/cbm`,`container_type/qty`)** — komentar create-path `QuotationFormPage.jsx:347` menyebut "state-only/tak di DB", TAPI kolomnya **nyata ada** di `schema_snapshot.sql:4033-4042` dan payload create/edit mengirimnya (`:792-801`, `:736-745`). Jadi komentar itu **stale**; kolom persist. Yang perlu runtime: pastikan RPC `save_quotation` (branch UPDATE) benar-benar memetakan semua field ini (Governance mencatat pernah ada gap 2.11S).
2. **RLS `prospects_update` tak column-guard `pull_status`** (A2) — secara teori sales bisa set `pull_status='approved'` sendiri lewat query langsung; approval hanya di-enforce di menu client. **Butuh uji runtime/SQL** untuk konfirmasi apakah ada guard lain (mis. trigger) yang menutup celah.
3. **Ambang aging NEW** — Edge Function meng-age NEW di 7 hari (`index.ts:5`) tapi client `AGING_LIMITS` **tak punya key `new`** (`PipelineKanbanPage.jsx:170`) → kartu NEW ter-pool tanpa badge peringatan lebih dulu. Konsistensi hanya bisa dilihat penuh saat cron jalan.
4. **Label filter BANT toolbar stale** — `BANT_BANDS` label "Tinggi 6–7 / Sedang 4–5 / Rendah 1–3" & cutoff 6/4/1 (`PipelineKanbanPage.jsx:209-214,228-234`) memakai model 0–7, tak konsisten dengan model **0–12** aktual & gate 5/8. Kosmetik, tapi menyesatkan.
5. **`estimated_value` 88% kosong pada WON** (Governance TD-54) — karena status ACCEPTED tak pernah ditulis. Efek nyata ke gate handover A4 (nilai 0 → selalu Light) **hanya bisa dipastikan dengan data runtime**.
6. **Dua blok render menu di App.jsx** (kanonik ~469-796 dengan `role[]`, dan list kedua ~855-984 tanpa role inline, di-gate `MENU_KEY_MAP`/`hasMenuPermission`) — peran efektif akhir = interseksi keduanya + permission data-driven; **tak bisa dipastikan penuh tanpa menjalankan app + data permission nyata**.
7. **`activities.type` vocabulary** — tersebar di beberapa form (visit/call/meeting/whatsapp/email/followup) tanpa CHECK di DB (`activities.type text NOT NULL`, `schema_snapshot.sql:1505`); nilai sah hanya konvensi kode.

---

## Catatan Wajib

**Audit ini TIDAK menjalankan app/build/test.** Seluruh temuan = pembacaan kode (`src/`), schema (`supabase/schema_snapshot.sql`), dan dokumentasi Governance. Klaim tentang perilaku runtime — persistensi payload RPC `save_quotation`, celah RLS `pull_status`, dampak `estimated_value` kosong ke routing handover, dan peran menu efektif setelah gabungan menuKey + permission data — **belum diverifikasi dengan menjalankan aplikasi** dan ditandai eksplisit di Bagian 6.

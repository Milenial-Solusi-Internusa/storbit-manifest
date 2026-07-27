# AUDIT — Modul PRF (Price Request Form) end-to-end

> **Mode: AUDIT MURNI, READ-ONLY.** Tidak ada kode/DB yang diubah. Tidak ada file lain yang disentuh. `AUDIT_PRF.md` adalah satu-satunya file yang dibuat di sesi ini.
> **Auditor:** Claude Code, berperan sebagai auditor senior — kritis, bukan pemuji.
> **Tanggal:** 2026-07-27 · **Branch saat audit:** `feat/akun-merge` (HEAD `2ae1c5e`).
> **Sumber:** `src/modules/procurement/PRFFormPage.jsx` (830 baris), `PRFDetailPage.jsx` (754 baris), `ProcInquiryForwardingPage.jsx` (128 baris) + seluruh pemanggil di `src/App.jsx`, `src/modules/crm/DealDetailPage.jsx`, `DealPanels.jsx`, `CustomerDetailPage.jsx`, `SalesOrderDocDetailPage.jsx`, `InquiryFormPage.jsx`; `supabase/schema_snapshot.sql` (13.479 baris — tabel `prf`, `prf_cost_items`, RLS, trigger, RPC); `docs/Governance/*`; `docs/archive/audits/AUDIT_PRF_FLOW.md` (audit internal 24 Jul 2026, dipakai sebagai referensi awal dan **diverifikasi ulang secara independen** terhadap kode HARI INI — sebagian temuannya sudah usang/resolved, dicatat eksplisit di bawah).
> **Batasan jujur:** **NOL akses DB langsung.** Semua klaim RLS/kolom/trigger/constraint berasal dari `schema_snapshot.sql` (file di repo, bukan DB hidup) dan pembacaan kode. Statistik data (berapa PRF, berapa ke-award, dst.) **tidak diaudit** — lihat bagian SQL untuk dijalankan manual. GRANT tidak terlihat sama sekali di snapshot (0 baris `GRANT` di seluruh file 13k+ baris) — ini konsisten dengan TD-63 yang sudah tercatat (`pg_dump --no-privileges`), **bukan temuan spesifik PRF**, tapi berarti saya tidak bisa memverifikasi apakah `authenticated` benar-benar punya GRANT tabel di `prf`/`prf_cost_items` — lihat bagian SQL.

---

## RINGKASAN EKSEKUTIF

**Skor jujur (1–10, 10 = terbaik):**

| Dimensi | Skor | Catatan singkat |
|---|---|---|
| Arsitektur | 5/10 | Pola form/detail konsisten dgn modul CRM sebelah, tapi 3 file saling duplikasi helper, token warna, dan fetch — tak ada satu pun yang dipakai bersama. |
| Keamanan | **3/10** | RLS jadi penegak nyata (bukan cuma UI) untuk hal-hal yang SUDAH dipikirkan — tapi aturan bisnis PALING PENTING modul ini ("satu PRF, satu vendor pemenang") **nol penegakan di DB**, hanya hidup di dalam satu RPC yang bisa dilewati. |
| Maintainability | 4/10 | 9 tech debt EXISTING sudah tercatat khusus untuk modul 3-file ini (TD-48/76/90/93/103/105/107/108/109/110/115/120/121/122) sebelum audit ini menambah 12 lagi — kepadatan utang tertinggi yang saya temukan untuk modul seukuran ini di seluruh repo. |
| Reliability | 3/10 | Nol test, nol audit log, error ditelan diam-diam di banyak titik, satu bug hantu (TD-110) yang akarnya tak pernah dipastikan, dan proses yang sekali salah tak bisa dibatalkan selamanya. |

**Kritik inti (jangan dilewati):**

Modul ini adalah implementasi "jalur bahagia" yang kompeten: sales membuka inquiry yang sudah ada, menekan "Cetak PRF", mengisi form, submit — procurement membuka daftar, mengisi harga per vendor, memilih pemenang — sales kembali dan menekan "Buat Quotation". Selama tak ada yang keluar dari skrip itu, RLS benar-benar menegakkan siapa boleh apa (bukan sekadar tombol yang disembunyikan), dan itu patut dihargai. Tapi begitu ada yang menyimpang sedikit saja dari skrip — orang berubah pikiran, dua staf procurement mengedit bersamaan, seseorang memanggil API langsung, volume PRF lewat dari 200 baris, atau seorang admin membuka halaman ini lewat jalur yang tak disangka — modul ini tidak punya jaring pengaman sama sekali. Ini bukan modul yang "agak rapuh di tepi", ini modul yang **hanya punya satu jalur yang teruji**, dan semua yang lain adalah lubang tak terverifikasi.

Temuan paling serius, dan ini menyangkut tepat apa yang diminta di brief ("harga beli"): aturan bisnis "satu PRF hanya boleh punya satu vendor pemenang" — invarian yang paling penting dalam seluruh modul ini, karena dialah yang menentukan angka modal yang akhirnya jadi dasar harga jual ke customer — **hanya ditegakkan di dalam satu fungsi RPC (`save_prf_pricing`)**, dalam bentuk `IF v_vendors > 1 THEN RAISE EXCEPTION`. RLS `prf_cost_items_insert`/`prf_cost_items_update` (`schema_snapshot.sql:12568,12586`) **mengizinkan siapa pun berperan `procurement` menulis LANGSUNG ke tabel** selama PRF induknya berstatus `SUBMITTED` — tanpa peduli lewat RPC atau tidak. Siapa pun dengan sesi login procurement yang sah dan tab Network browser terbuka bisa hari ini juga membuat dua vendor sama-sama `is_awarded=true` untuk satu PRF, dan Postgres tidak akan menghentikannya. Ini sudah tercatat sebagai TD-122 (MEDIUM di tracker proyek) — saya menilai ulang ini sebagai **CRITICAL** untuk audit ini, karena persis inilah kelas kegagalan yang brief minta saya cari paling keras.

Kedua, mesin status PRF adalah jalan satu arah tanpa ujung keluar. `prf.status` punya CHECK enam nilai (`DRAFT, SUBMITTED, ACKNOWLEDGED, CANCELLED, QUOTED, EXPIRED`), tapi diverifikasi lewat grep menyeluruh: **tidak ada satu baris kode pun**, di mana pun di `src/`, yang pernah menulis empat nilai terakhir. `ProcInquiryForwardingPage.jsx:16-23` bahkan sudah punya peta warna badge untuk keempatnya — dekorasi untuk status yang tidak pernah bisa dicapai. Konsekuensinya nyata: PRF yang salah ketik, berubah kebutuhan, atau sudah tak relevan **tidak bisa dibatalkan, ditolak, atau dihapus** oleh siapa pun lewat aplikasi (tak ada RLS DELETE untuk `prf`, tak ada tombol), dan inquiry sumbernya permanen terparkir di `IN_REVIEW` ("Menunggu harga") karena trigger `trg_inquiry_review` (`schema_snapshot.sql:8207`) cuma bisa MAJU, tak pernah MUNDUR.

Ketiga, dan ini lebih tentang proses daripada kode: seluruh alur "handoff" — poin yang secara eksplisit disebut di brief — **tidak punya satu pun sinyal**. Saya grep seluruh pemakaian tabel `notifications` di repo: hanya modul MOM (`MOMFormPage.jsx:231`, `MOMDetailPage.jsx:122`) dan Lead Pool (`LeadPoolPage.jsx:166`, `LeadPoolApprovalPage.jsx:103`) yang memakainya. **Nol** untuk PRF. Procurement mengetahui ada PRF baru murni karena kebiasaan membuka daftar "Forwarding (MSI)" secara berkala — daftar yang sendirinya melanggar aturan wajib proyek (`.limit(200)`, bukan `.limit(1000)`, tanpa `company_id`, tanpa paginasi — `ProcInquiryForwardingPage.jsx:46`). Sales mengetahui harga sudah keluar murni dengan membuka kembali halaman yang sama. Tidak ada badge, tidak ada email, tidak ada apa pun.

---

## PETA ALUR PRF

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ INQUIRY (sudah ada, status='OPEN' — satu-satunya penulis: INSERT saja,       │
│ InquiryFormPage.jsx:295. Tidak pernah ditulis ulang saat edit.)              │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │  JALUR A                │  JALUR B                │  JALUR C (LATEN)
        │  Detail Inquiry          │  Detail Account →       │  activeMenu='prf'
        │  (DealDetailPage)        │  tab Riwayat            │  dipulihkan dari
        │  DealPanels.jsx:434-443  │  (CustomerDetailPage)   │  localStorage saat
        │  tombol "Cetak PRF"      │  CustomerDetailPage     │  refresh — TANPA
        │  canCreate =             │  .jsx:495-497           │  prefill (state hilang)
        │  ['sales','gm_bd']       │  canCreatePRF =         │  App.jsx:695 (gate
        │  .includes(erpRole)      │  ['sales','gm_bd']      │  registry) — TAK ADA
        │  (App.jsx:3325)          │  .includes(erpRole)     │  leaf sidebar utk 'prf'
        │                          │  (App.jsx:3523-3527,    │  di NEXUS_NAV
        │                          │  TANPA canRenderPage)   │  (App.jsx:1035-1105)
        └────────────┬─────────────┴────────────┬────────────┴──────────┬────────┘
                      └──────────────┬───────────┘                     │
                                     ▼                                 ▼
                    ┌───────────────────────────────────────────────────┐
                    │  PRFFormPage — "Buat PRF Baru" (create-only)       │
                    │  Section 01 Informasi Dasar (sumber=inquiry WAJIB) │
                    │  Section 02 Inquiry Details (direction/commodity/  │
                    │    HS/incoterm/pickup-delivery/add-on)             │
                    │  Section 03 Detail Layanan (dinamis per moda)      │
                    │  Section 04 Catatan                                │
                    └───────────────────────┬─────────────────────────────┘
                                            │ tombol "Submit PRF" / "Simpan Draft"
                                            │ handleSave() (PRFFormPage.jsx:376-470)
                                            ▼
                    1. guard inquiry_id (:378) — gagal→return, nomor belum disentuh
                    2. validate() PENUH — HANYA jika status='SUBMITTED' (:383)
                       ('Simpan Draft' MELEWATI validasi ini sepenuhnya)
                    3. JARING 3 — cek ulang Lead Pool ke DB (:389-397)
                    4. generatePrfNo() ← RPC increment_document_sequence (:398)
                       ★ NOMOR TERBAKAR DI SINI (baik Draft maupun Submit)
                    5. INSERT INTO prf (:461) — ditegakkan RLS prf_insert
                       (schema_snapshot.sql:12597): super_admin OR
                       (company match AND created_by=self AND
                        (has_role('sales') OR has_role('gm_bd')))
                    6. toast 2,8 detik → onBack() (form TERTUTUP)
                                            │
                                            ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  TRIGGER DB (SECURITY DEFINER) — set_inquiry_review_on_       │
        │  prf_submit() (schema_snapshot.sql:1297)                      │
        │  AFTER INSERT OR UPDATE OF status ON prf                      │
        │  IF NEW.status='SUBMITTED' AND inquiry_id IS NOT NULL         │
        │    → UPDATE inquiries SET status='IN_REVIEW'                 │
        │      WHERE id=inquiry_id AND status='OPEN'                    │
        │  "Simpan Draft" TIDAK memicu trigger ini (status tetap DRAFT) │
        └───────────────────────────────────┬─────────────────────────────┘
                                            ▼
        inquiries.status: OPEN → IN_REVIEW ("Menunggu harga",
        InquiryListPage.jsx:64). ⚠️ TIDAK ADA JALUR BALIK — lihat Temuan #TD-139.
                                            │
                                            ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  ProcInquiryForwardingPage — "Forwarding (MSI)"                │
        │  fetch prf, .limit(200), TANPA company_id, TANPA status filter,│
        │  TANPA paginasi (ProcInquiryForwardingPage.jsx:41-46)          │
        │  RLS prf_select (schema_snapshot.sql:12604): super_admin OR    │
        │  (company match AND (created_by=self OR has_role('procurement')│
        │   OR is_manager_or_above()))                                   │
        │  → sales hanya lihat PRF miliknya; procurement/manager+ lihat  │
        │    semua di company-nya; super_admin lihat LINTAS ENTITAS      │
        │    (halaman berlabel "(MSI)" tapi tak difilter entity apa pun) │
        └───────────────────────────────────┬─────────────────────────────┘
                                            │ klik baris → onSelect(id)
                                            ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  PRFDetailPage — Ringkasan + panel "Jawaban Harga"             │
        │  canEdit = ['procurement','super_admin'].includes(erpRole)     │
        │  (cermin RLS prf_update_status, prf_cost_items_*)              │
        │  Kartu per-vendor (banyak) + kartu Biaya Internal (1) +        │
        │  tabel kurs header + field Harga Jual/Currency/Valid dari-sampai│
        │  Tombol "Pilih Vendor Ini" per kartu → awardedKey (state lokal)│
        └───────────────────────────────────┬─────────────────────────────┘
                                            │ tombol "Simpan Jawaban Harga"
                                            │ handleSave() (PRFDetailPage.jsx:257-325)
                                            ▼
        supabase.rpc('save_prf_pricing', {p_prf_id, p_header, p_items})
        (SECURITY INVOKER — schema_snapshot.sql:1070-1135)
          1. UPDATE prf SET suggested_rate/rate_currency/valid_*/pricing_notes/
             exchange_rates/answered_by=auth.uid()/answered_at=now()
             WHERE id=p_prf_id  → 0 baris ter-update → RAISE (RLS gagal)
          2. Guard: COUNT(DISTINCT vendor_id) WHERE is_awarded=true
             AND vendor_id IS NOT NULL > 1 → RAISE (satu pemenang saja)
             ⚠️ Guard ini HANYA aktif via RPC ini — lihat Temuan Kritis #1
          3. DELETE FROM prf_cost_items WHERE prf_id=p_prf_id (SELALU,
             tanpa syarat p_items — lihat TD-110/catatan RPC)
          4. INSERT ulang seluruh p_items (vendor + internal, is_awarded
             per baris)
        prf.status TETAP 'SUBMITTED' selamanya (tidak pernah berubah oleh
        aksi ini) — RLS prf_cost_items_* tetap terbuka untuk EDIT ULANG
        kapan pun, TERMASUK setelah Quotation sudah dibuat dari angka ini
        (lihat Temuan Kritis #3 / TD-150).
                                            │
                                            ▼
        canCreateQuotation: onCreateQuotation fn ada AND
        hasMenuPermission('crm_quotation','view') AND answered_at not null
        AND suggested_rate>0 AND status NOT IN ('CANCELLED','EXPIRED')
        (dua kondisi terakhir MATI — kedua status itu tak pernah tercapai)
                                            │ tombol "Buat Quotation"
                                            ▼
        App.jsx:quotationFromPrf state → QuotationFormPage
        prefillFromPrf={prf_id, inquiry_id, rate_currency, valid_until,
                        suggested_rate, cost_total}
        (QuotationFormPage.jsx:643-691, sekali pakai — snapshot, bukan link
        hidup; jalur non-IDR DIBLOKIR — TD-120)
                                            │ CREATE quotation (insert langsung,
                                            │ bukan lewat save_prf_pricing)
                                            ▼
        TRIGGER guard_quotation_prf_consistency (BEFORE INSERT/UPDATE
        ON quotations, schema_snapshot.sql:664) — menjamin quotation.
        inquiry_id konsisten dgn prf.inquiry_id (tak ada padanan untuk
        prf.account_id vs prf.inquiry_id sendiri — lihat TD-147 usulan)


   ═══════════════ CABANG YANG SECARA STRUKTURAL TAK TERJANGKAU ═══════════════
   prf.status = ACKNOWLEDGED | CANCELLED | QUOTED | EXPIRED
     → CHECK constraint mengizinkan, TAK ADA kode/RPC/trigger yang menulisnya.
     → RLS prf_update_status mensyaratkan status='SUBMITTED' untuk write jawaban
       harga — begitu (secara hipotetis) status berubah, procurement TERKUNCI
       (TD-109, sudah tercatat, "belum masalah aktif" krn transisi ini memang
       tak pernah terjadi).
     → TIDAK ADA jalur balik inquiries.status dari IN_REVIEW ke OPEN.
```

---

## TEMUAN PER DIMENSI

### 1. Arsitektur & Struktur

**[MEDIUM] Tiga file, tiga set token gaya, nol yang dibagi.** `PRFFormPage.jsx:15-22` mendefinisikan objek `C` sendiri (`navy:'#1B4D8A'`); `PRFDetailPage.jsx:23-30` dan `ProcInquiryForwardingPage.jsx:9-13` masing-masing mendefinisikan konstanta `NAVY/ORANGE/BORDER/...` sendiri (`'#144682'`) — bukan cuma gaya penulisan beda, **nilainya sendiri beda** (lihat dimensi 8). Ini instance konkret dari utang yang sudah diakui sendiri oleh `AGENTS.md` baris 91: *"`PASTEL` design tokens duplicated across many files — pending a single `src/lib/tokens.js`."* Modul PRF menambah tiga contoh baru ke daftar itu alih-alih menguranginya.

**[LOW] Helper `fmtDate` dan `SERVICE_LABEL` disalin verbatim, bukan dibagi.** `PRFDetailPage.jsx:32,36-42` dan `ProcInquiryForwardingPage.jsx:15,25-31` — kedua konstanta identik karakter demi karakter, didefinisikan dua kali di dua file yang diimpor bersamaan dari direktori yang sama (`src/modules/procurement/`). Tak ada `src/modules/procurement/shared.js` atau semacamnya. Diusulkan: **TD-148** (digabung dengan temuan token warna di atas — lihat dimensi 8).

**[MEDIUM] Fetch reference-data yang identik ditulis ulang di dua file alih-alih dibagi lewat hook yang SUDAH ADA.** `PRFFormPage.jsx:217-218` fetch `currencies` inline; `PRFDetailPage.jsx:154-159` fetch `currencies` inline lagi — pola query sama persis (`select('code,name').order('code')`, filter `is_active` beda-beda tanpa alasan jelas: form TIDAK filter `is_active`, detail YA memfilter). `PRFFormPage.jsx:13,182` justru sudah mengimpor `useDropdownOptions` untuk field `stream` — hook yang sama bisa dipakai untuk currency tapi tidak dipakai secara konsisten dalam file yang SAMA.

**[LOW] File berukuran pas di ambang TD-34 (`800-1.000 baris`).** `PRFFormPage.jsx` = 830 baris, `PRFDetailPage.jsx` = 754 baris — keduanya masuk kategori yang sudah tercatat sebagai tech debt umum proyek (`08_TECH_DEBT.md` TD-34), bukan temuan baru, hanya konfirmasi bahwa modul PRF adalah instance dari pola itu.

**[POSITIF, dicatat untuk keseimbangan]** `PRF_SELECT`/`COST_SELECT` sebagai konstanta string kolom terpusat di `PRFDetailPage.jsx:54-55` adalah pola yang baik (satu sumber untuk daftar kolom yang di-select berulang) — kontras dengan sebagian besar temuan lain di dimensi ini.

**[LOW] Dead code kosmetik: peta warna badge untuk status yang tak pernah tercapai.** `ProcInquiryForwardingPage.jsx:16-23` — `BADGE` map memuat entri lengkap untuk `ACKNOWLEDGED`, `QUOTED`, `CANCELLED`, `EXPIRED` padahal keempatnya dikonfirmasi TAK PERNAH ditulis oleh kode mana pun (lihat Temuan Kritis #2 di bawah). Bukan bug, tapi indikasi jelas fitur separuh-jadi.

### 2. Konsistensi & Maintainability

**[MEDIUM] "Cetak PRF" adalah nama yang salah untuk aksi yang sebenarnya terjadi.** Tombol berlabel **"Cetak PRF"** (`DealPanels.jsx:442`, `CustomerDetailPage.jsx:497`) tidak mencetak apa pun — ia membuka form entri data. Diverifikasi lewat grep: **tidak ada komponen `PRFPDF`** di `src/` (bandingkan `InquiryPDF`, `QuotationPDF`, `RateSheetPDF`, `ActivityReportPDF`, `VisitHistoryPDF`, `DeliveryNotePDF`, `PickingListPDF` — tujuh PDF nyata untuk modul lain, nol untuk PRF). Sales yang membaca label ini akan mengira sedang mencetak dokumen yang sudah ada, padahal sedang menerbitkan dokumen baru berikut nomornya. (Diverifikasi ulang independen dari `AUDIT_PRF_FLOW.md` Temuan #1 — masih akurat hari ini.)

**[MEDIUM] Nama kolom sama, sumbu beda — `service_type`.** `inquiries.service_type` = lini layanan (`freight_forwarding`/`customs`/`trading`); `prf.service_type` = moda angkut (`sea`/`air`/`inland`/`project`/`custom`). Sudah tercatat sebagai **TD-108** (MEDIUM) — risiko nyata: laporan/JOIN masa depan yang memperlakukan kolom ini sebanding akan menghasilkan angka salah TANPA error.

**[LOW] Duplikasi ~11 field antar `inquiries` dan `prf` di bawah nama/kosakata berbeda** (`pol/pod` vs `origin/destination`, `additional_services` vs `add_on_services`, dll.) — ditambal di layer FE lewat `applyInquiryData` (`PRFFormPage.jsx:104-123`), bukan disatukan. Sudah tercatat **TD-107**.

**[LOW] Magic string kategori biaya `ITEM_GROUPS`** (`PRFDetailPage.jsx:34`, `['Origin Charges','Freight Charges','Destination Charges']`) adalah aturan bisnis yang hidup HANYA di FE — kolom `prf_cost_items.item_group` di DB adalah `text` polos tanpa CHECK. Sudah tercatat sebagai bagian dari **TD-122**.

**[LOW] Format nomor PRF menyimpang dari standar tertulis `AGENTS.md`.** Format aktual `PRF/{ENTITY}/{YYYY}/{ROMAWI}/{SEQ-3digit}` (`PRFFormPage.jsx:373`) tidak mencantumkan `{DEPT}` yang disebut wajib di `AGENTS.md` § Document Numbering Direction, walau `'PROC'` tetap dikirim sebagai kunci counter. Bukan bug — konsisten dengan Inquiry/Quotation yang sama-sama menyimpang — tapi standar tertulis belum diperbarui untuk mengakui varian ini.

### 3. Database & Data Integrity

**[HIGH] Tidak ada CHECK constraint untuk nilai non-negatif** pada kolom uang/berat/volume manapun di `prf`/`prf_cost_items` (`commercial_value numeric(14,2)`, `suggested_rate numeric(18,2)`, `prf_cost_items.amount numeric(18,2)`, `air_gw`, `sea_lcl_gw`, dll — diverifikasi dari `CREATE TABLE` penuh, tidak ada satu pun `CHECK (... >= 0)`). Pencegahan HANYA di client (`onPatch` di `PRFDetailPage.jsx:425` melakukan `.replace(/[^\d.]/g,'')` yang kebetulan membuang tanda minus, tapi ini efek samping regex, bukan validasi yang disengaja/didokumentasikan). Panggilan langsung ke RPC/tabel dengan angka negatif akan lolos dan merusak perhitungan Total Modal/Margin. Diusulkan **TD-145**.

**[HIGH — amplifikasi TD-122 EXISTING] Nol constraint tingkat-DB untuk aturan "satu vendor pemenang per PRF."** Lihat Temuan Kritis di bawah.

**[MEDIUM] Tidak ada trigger konsistensi `prf.account_id` ↔ `prf.inquiry_id`.** Untuk `quotations`, ada trigger eksplisit `guard_quotation_prf_consistency` (`schema_snapshot.sql:664-690`) yang memvalidasi `quotation.inquiry_id` konsisten dengan `prf.inquiry_id`. Untuk `prf` sendiri, **tidak ada padanan** yang memvalidasi bahwa `prf.account_id` (diisi FE dari `inq.customer_id || inq.prospect_id` saat create, `PRFFormPage.jsx:250,298`) benar-benar cocok dengan akun yang terhubung ke `prf.inquiry_id`. Risikonya rendah hari ini (satu-satunya penulis adalah FE yang konsisten) tapi tak ada jaring pengaman DB kalau ada penulis lain di masa depan. Diusulkan **TD-147**.

**[MEDIUM] Tidak ada UNIQUE constraint pada `(company_id, inquiry_id)`** — satu inquiry boleh melahirkan berapa pun PRF, tanpa batas, tanpa peringatan UI (`DealPanels.jsx:434-443` selalu merender tombol "Cetak PRF" apa pun isi kartu "Daftar PRF" di sebelahnya). Constraint yang ADA hanya `prf_pkey` dan `prf_no_unique(company_id, prf_no)` (`schema_snapshot.sql:6409-6421`). Ini mungkin keputusan sadar (seperti relasi PRF→Quotation yang eksplisit didokumentasikan "satu PRF boleh banyak quotation — keputusan desain") — tapi untuk Inquiry→PRF, **keputusan itu tidak tertulis di mana pun**. Lihat Pertanyaan Terbuka.

**[LOW] `prf.exchange_rates jsonb`** tidak divalidasi terhadap tabel `currencies` — bisa berisi key kode mata uang apa pun (mis. `"XXX": 999`) tanpa FK/CHECK. Risiko rendah karena UI hanya menawarkan kode dari dropdown `currencies`, tapi tak ada jaring DB.

**[BUTUH VERIFIKASI SQL] GRANT tidak terlihat untuk `prf`/`prf_cost_items`.** `grep -c "^GRANT " schema_snapshot.sql` = **0 untuk SELURUH file** (bukan hanya dua tabel ini) — dump ini jelas dibuat tanpa privileges (konsisten TD-63 yang sudah tercatat). Karena `prf`/`prf_cost_items` dibuat lewat SQL manual di luar migrasi berurutan (sesuai catatan `CLAUDE.md`), dan aturan proyek sendiri eksplisit *"GRANT setelah CREATE (tabel CLI tak auto-grant)"* — saya **tidak bisa memastikan dari repo** apakah `authenticated` benar sudah di-GRANT `SELECT/INSERT/UPDATE/DELETE` pada kedua tabel. Kalau belum, RLS-nya sama sekali tidak relevan (Postgres menolak di layer GRANT sebelum RLS sempat dievaluasi) — dan sebaliknya kalau sudah lupa di-drop untuk kolom sensitif, itu juga tak akan terlihat. **Wajib dicek manual** — lihat bagian SQL.

### 4. Security (dimensi paling penting untuk modul ini)

**[CRITICAL] Aturan "satu vendor pemenang per PRF" hanya ditegakkan di dalam SATU fungsi RPC — nol jaring pengaman di RLS.**

- RLS `prf_cost_items_insert` (`schema_snapshot.sql:12568`) dan `prf_cost_items_update` (`:12586`) mengizinkan tulis untuk siapa pun `has_role('procurement')` selama `prf.status='SUBMITTED'` (atau `is_super_admin()`) — **TIDAK PEDULI apakah tulisannya lewat RPC `save_prf_pricing` atau lewat `supabase.from('prf_cost_items').insert(...)`/`.update(...)` langsung dari klien manapun.**
- Guard "hanya satu vendor pemenang" (`COUNT(DISTINCT vendor_id) ... > 1 → RAISE`, `schema_snapshot.sql:1099-1108`) **hidup HANYA di dalam badan RPC** `save_prf_pricing`. Fungsi ini `SECURITY INVOKER` (bukan `DEFINER` — dikonfirmasi tidak ada kata kunci `SECURITY DEFINER` di definisinya, `schema_snapshot.sql:1070-1072`), artinya ia berjalan atas nama pemanggil dan RLS di atas berlaku untuknya — **tapi itu juga berarti tak ada apa pun yang memaksa siapa pun MEMANGGIL RPC ini** untuk menulis ke `prf_cost_items`.
- **Skenario nyata:** seorang user dengan role `procurement` yang sah, memakai DevTools/Postman/curl dengan token sesi miliknya sendiri, memanggil endpoint PostgREST `POST /prf_cost_items` dua kali dengan `vendor_id` berbeda dan `is_awarded=true` pada keduanya, untuk PRF yang sama. RLS mengizinkan (kondisinya cocok: role procurement, status SUBMITTED). Tidak ada CHECK constraint, tidak ada unique index, tidak ada trigger yang menghentikannya. Hasilnya: dua vendor "menang" bersamaan untuk satu PRF — data yang menjadi dasar keputusan harga jual jadi ambigu.
- Ini sudah tercatat sebagai **TD-122** dengan severity **MEDIUM** di tracker proyek. **Saya menilai ulang ini sebagai CRITICAL** untuk audit ini — bukan karena TD-122 salah dicatat, tapi karena brief secara eksplisit meminta penilaian independen untuk dimensi keamanan yang menyangkut harga beli, dan invarian yang bocor di sini ADALAH invarian harga beli itu sendiri.
- TD-122 sendiri sudah mencatat arah perbaikan yang benar: constraint level-himpunan ("paling banyak SATU `vendor_id` distinct ter-award per PRF") tidak bisa diungkapkan lewat unique index biasa (satu PRF sah punya BANYAK baris `is_awarded=true` — semua baris kartu pemenang + semua baris internal) — solusinya butuh tabel award terpisah (`prf_id` unik + vendor pemenang), yang **belum dibangun**.

**[HIGH] Tidak ada RLS DELETE untuk `prf` sama sekali.** Hanya empat policy terdaftar: `prf_insert`, `prf_select`, `prf_update_draft`, `prf_update_status` (`schema_snapshot.sql:12597-12625`) — nol `FOR DELETE`, nol `FOR ALL`. Kolom `deleted_at` ada di tabel dan dipakai filter baca di ketiga file FE (`PRFFormPage.jsx:215`, `PRFDetailPage.jsx:83`, `ProcInquiryForwardingPage.jsx:44`), tapi **tidak ada satu pun jalur yang bisa menulisinya** — bukan lewat RLS DELETE (tidak ada), bukan lewat UPDATE (kedua policy UPDATE yang ada tidak mengecualikan kolom apa pun di WITH CHECK, jadi seorang `super_admin` YANG MEMBYPASS RLS teoretis BISA menyetel `deleted_at` lewat `.update()` — tapi tak ada satu tombol/form pun di UI yang menawarkan ini). Efek gabungan dengan temuan #2 di bawah: PRF benar-benar tidak bisa disingkirkan dari sistem oleh siapa pun lewat aplikasi.

**[HIGH — usulan TD-139] Tidak ada jalur cancel/reject/withdraw untuk PRF, sama sekali.** Digabung dari beberapa fakta terverifikasi:
- CHECK `prf_status_check` mengizinkan 6 nilai (`schema_snapshot.sql:4531`), tapi grep `status.*'CANCELLED'|'ACKNOWLEDGED'|'QUOTED'|'EXPIRED'` di seluruh `src/` untuk konteks `prf` = **nol hit** di luar peta warna dekoratif.
- Satu-satunya penulis `prf.status` adalah `INSERT` di `PRFFormPage.jsx:409` (`DRAFT` atau `SUBMITTED`, dipilih user).
- Tidak ada RLS DELETE (lihat di atas).
- Akibatnya: begitu inquiry sumber sudah naik ke `IN_REVIEW` lewat trigger, **tidak ada jalur apa pun untuk membawanya kembali ke `OPEN`** kecuali `markInquiryLost` (`DealDetailPage.jsx:330-336`, menulis `status='LOST'`) — yang levelnya adalah "kalahkan seluruh inquiry", bukan "batalkan permintaan harga ini saja". Kalau sales cuma ingin menarik PRF yang salah kirim tanpa mengalahkan inquiry-nya, **tidak ada cara**.
- Ini memperluas TD-76 (sudah tercatat, HIGH, fokusnya "draft tak bisa dibuka lagi") ke sudut yang belum ditulis eksplisit di mana pun: bukan cuma draft yang macet, **seluruh siklus hidup PRF tidak punya pintu keluar**.

**[HIGH — usulan TD-150] Jawaban Harga PRF bisa diedit bebas selamanya, termasuk SETELAH Quotation sudah dibuat darinya — tanpa lock, tanpa peringatan.** `PRFDetailPage.jsx:257` (`handleSave`) tidak memeriksa `prfQuotes.length` atau kondisi apa pun terkait dokumen turunan sebelum mengizinkan simpan ulang. Karena `prf.status` tidak pernah berubah dari `SUBMITTED` (lihat di atas), RLS `prf_update_status`/`prf_cost_items_update` tetap mengizinkan tulis kapan pun status `SUBMITTED` — yaitu **selamanya**. Skenario nyata: procurement mengisi harga → sales membuat Quotation dari angka itu (snapshot satu-kali via `prefillFromPrf`, `QuotationFormPage.jsx:643-691`) → beberapa hari kemudian procurement merevisi vendor pemenang/harga di PRF yang sama (mis. karena vendor lama batal) → Quotation yang sudah dibuat (mungkin sudah dikirim ke customer) **tidak ikut berubah dan tidak ada apa pun yang memberi tahu siapa pun bahwa keduanya sudah menyimpang**. TD-109 (sudah tercatat) mencatat kekhawatiran ARAH SEBALIKNYA (procurement terkunci kalau status BERUBAH) — belum ada yang mencatat bahwa hari ini masalahnya justru TIDAK PERNAH terkunci sama sekali.

**[HIGH — usulan TD-140] Nol notifikasi/handoff signal dua arah.** Diverifikasi via grep menyeluruh `notifications'` di seluruh `src/`: satu-satunya pemakai adalah `MOMFormPage.jsx:231`, `MOMDetailPage.jsx:122`, `LeadPoolPage.jsx:166`, `LeadPoolApprovalPage.jsx:103`. **Nol** untuk PRF — tidak ada baris kode di `PRFFormPage.jsx`, `PRFDetailPage.jsx`, `ProcInquiryForwardingPage.jsx`, `DealDetailPage.jsx`, atau `DealPanels.jsx` yang menyentuh tabel `notifications`. Procurement tidak diberi tahu ada PRF baru; sales tidak diberi tahu harga sudah keluar. Satu-satunya mekanisme adalah kebiasaan membuka halaman secara manual dan berkala.

**[HIGH — usulan TD-142] Nol audit log untuk create/submit/pricing-answer/award PRF.** `AGENTS.md` § Security Requirements eksplisit mendaftar *"Mandatory audit events: ... create, update, ... submit, approve ..."*. Modul lain di CRM yang setara (perubahan pipeline stage, "Tandai Kalah" pada inquiry, MOM, Lead Pool) **sudah** memakai helper `logAudit` (`src/lib/auditLogger.js`) — dikonfirmasi lewat grep: `DealDetailPage.jsx:30,342-344` dan `DealPanels.jsx:21,157-159` mengimpor dan memanggilnya. **Ketiga file PRF (`PRFFormPage.jsx`, `PRFDetailPage.jsx`, `ProcInquiryForwardingPage.jsx`) tidak mengimpor `auditLogger` sama sekali.** Ini berarti: siapa membuat PRF, siapa mengubah harga, dan — paling penting — siapa mengganti pemenang vendor dan kapan, **tidak tercatat di mana pun** selain kolom `answered_by`/`answered_at` (yang hanya menyimpan state TERAKHIR, bukan riwayat perubahan).

**[MEDIUM] `hasMenuPermission('crm_quotation','view')` dipakai sebagai proxy gate lintas-domain.** `PRFDetailPage.jsx:60` memakai izin menu "Quotation" (domain CRM) untuk menentukan apakah tombol "Buat Quotation" + panel riwayat quotation (domain Procurement) tampil. Ini **fail-closed** dengan benar (`AuthContext.jsx:271-282` — user non-`super_admin` tanpa baris cocok di `user_menu_permissions` selalu dapat `false`), jadi bukan lubang keamanan aktif. Tapi ini peminjaman izin yang tidak berhubungan secara semantik: jika kelak seorang procurement diberi izin `crm_quotation`/`view` untuk alasan lain (misalnya dia juga mem-back-up tim sales), efek sampingnya adalah dia otomatis mendapat kemampuan memicu pembuatan Quotation dari PRFDetailPage — sebuah kopling implisit yang tidak didokumentasikan di mana pun kecuali komentar kode. Sudah disinggung sebagai bagian dari TD-90.

**[MEDIUM — usulan TD-146] Empat lapis gate untuk "siapa boleh membuat PRF" tidak saling konsisten, dan divergensinya tidak didokumentasikan sebagai keputusan sadar.** Lihat tabel MATRIKS GATE di bawah untuk rincian penuh. Ringkas: registry menu (`App.jsx:695`, 7 role) ⊋ RLS insert (`prf_insert`, 2 role + super bypass) ⊋ tombol "Cetak PRF" (`['sales','gm_bd']`, **TANPA `super_admin`** — `DealDetailPage.jsx:483`, `CustomerDetailPage.jsx:724`). Efek konkret dan mudah direproduksi: **`super_admin` — role dengan bypass RLS di semua tabel dalam sistem — tidak bisa melihat tombol "Cetak PRF" di kedua entry point resmi**, karena array role tombolnya secara eksplisit tidak menyertakan `super_admin`. Ini bukan lubang keamanan (arahnya justru lebih ketat dari seharusnya), tapi ini bukti nyata bahwa keempat lapis gate ini ditulis secara independen tanpa satu sumber kebenaran, persis pola yang sudah dicatat sebagai TD-105 untuk seluruh aplikasi.

### 5. State & Data Flow

**[MEDIUM — usulan TD-144] Tidak ada guard konkurensi pada "Jawaban Harga".** `PRFDetailPage.jsx` tidak menyimpan/membandingkan `updated_at`/versi apa pun sebelum menyimpan (`handleSave`, :257-325). Dua staf procurement yang membuka PRF yang sama secara bersamaan dan sama-sama menekan "Simpan Jawaban Harga" akan membuat yang terakhir menang secara diam-diam — kartu vendor, kurs, dan pemenang milik penyimpan pertama hilang tanpa pesan apa pun ke siapa pun. Karena `DELETE FROM prf_cost_items WHERE prf_id=...` dijalankan **tanpa syarat** di dalam RPC sebelum INSERT ulang (`schema_snapshot.sql:1112`), ini bukan sekadar "override kolom" — ini penghapusan-dan-penulisan-ulang total baris anak, membuat potensi kehilangan data lebih besar daripada race condition UPDATE biasa.

**[MEDIUM, sudah tercatat TD-110] Bug hantu yang akarnya tak pernah dipastikan.** Rincian biaya sempat 0 baris tersimpan tanpa error di produksi; gejala hilang setelah `CREATE OR REPLACE` fungsi berikutnya dijalankan, tapi guard yang dipasang untuk menangkapnya tidak pernah menyala — artinya akar masalah **tidak pernah benar-benar dikonfirmasi**, hanya berhenti terjadi. Saya independen mengonfirmasi: kode FE (`PRFDetailPage.jsx:274-314`, konstruksi `p_items`) memang selalu mengirim array JS biasa (bukan pernah `null`), konsisten dengan catatan TD-110 bahwa FE bukan penyebabnya. Tapi karena akarnya tak dipastikan, tidak ada jaminan gejala ini tidak berulang.

**[LOW] Efek `.then()` tanpa `useCallback`/pembersihan konsisten pada `PRFFormPage.jsx`.** Effect utama (`:207-221`) dan effect prefill (`:227-254`) sama-sama melakukan fetch async, tapi hanya effect prefill yang punya flag `cancelled` untuk mencegah `setState` setelah unmount (`:229,234,253`); effect utama (fetch inquiries/currencies/companyCode) **tidak punya guard `cancelled` sama sekali** — kalau `profile.company_id` berubah cepat (mis. ganti entitas di UI multi-entitas) sebelum fetch pertama selesai, ada risiko `setState` dari respons yang sudah usang menimpa data yang lebih baru. Risiko rendah dalam praktik (company_id jarang berubah selagi form ini terbuka) tapi inkonsisten dalam file yang sama.

### 6. Error Handling & Reliability

**[HIGH — usulan TD-143] Error di-telan diam-diam di banyak titik fetch, dan tidak konsisten dengan fetch lain di FILE YANG SAMA.**

- `PRFFormPage.jsx:215-216`: `supabase.from('inquiries')...then(({ data }) => setInquiries((data||[]).filter(...)))` — **`error` tidak pernah didestrukturisasi**. Kalau query ini gagal (RLS, jaringan, kolom berubah), dropdown "Inquiry" akan tampil kosong tanpa pesan apa pun ke user, dan tanpa `console.error` untuk developer melacaknya (dikonfirmasi: **nol** `console.*` di seluruh tiga file procurement, lihat dimensi 9).
- `PRFFormPage.jsx:217-218` (fetch `currencies`) dan `:219-220` (fetch `companies.code`) — pola sama, error dibuang.
- `PRFFormPage.jsx:230-233` (prefill by-id) — pola sama.
- `PRFDetailPage.jsx:143-150` (fetch `vendors`) dan `:156-157` (fetch `currencies`) — pola sama.
- **Bandingkan** dengan `PRFFormPage.jsx:389-397` ("JARING 3", cek Lead Pool sebelum simpan) yang MEMERIKSA `chkErr` dengan benar dan melempar pesan jelas ke user; dan `ProcInquiryForwardingPage.jsx:47-51` yang juga memeriksa `error` dengan benar (`setError(e.message)`). Jadi pola yang benar SUDAH ADA dan dipakai di tempat lain — file yang lain justru tidak konsisten memakainya.

**[MEDIUM] Fallback entity code `'MSI'` bisa menghasilkan nomor dokumen yang menyebut entitas keliru.** `PRFFormPage.jsx:219-220` (`companyCode` fallback `'MSI'` bila fetch gagal/kosong) dan `:373` (`generatePrfNo` fallback `'MSI'` lagi). Tak ada guard yang mencegah tombol "Submit PRF" ditekan selagi `companyCode` masih kosong. PRF milik JCI/SOA yang lahir saat fetch nama entitas lambat/gagal akan bernomor `PRF/MSI/...` sementara `company_id` di baris DB tetap benar (JCI/SOA) — nomor dokumen jadi menyesatkan dan `prf_no_unique(company_id, prf_no)` tidak akan menangkapnya (kombinasinya tetap unik karena `company_id` berbeda). Ini menyentuh langsung prinsip #1 `AGENTS.md`: *"Multi-company by design."*

**[MEDIUM] Perlindungan klik-ganda lemah.** `saving` state (`PRFFormPage.jsx:203,384`) mencegah klik ganda PADA SATU render form yang sama, tapi tidak ada apa pun yang mencegah user menutup form lalu membukanya lagi dan mengulang submit untuk inquiry yang sama — dikombinasikan dengan tiadanya UNIQUE constraint `(company_id, inquiry_id)` (dimensi 3), ini bisa menghasilkan PRF duplikat bernomor berbeda tanpa peringatan.

**[LOW, sudah tercatat TD-48] Nomor PRF bisa hangus (gap) kalau INSERT gagal setelah nomor sudah di-generate.** `generatePrfNo()` (:398, memanggil RPC atomik) dipanggil SEBELUM `INSERT INTO prf` (:461) — kalau insert gagal (RLS/validasi/error jaringan), counter `document_sequences` sudah terlanjur naik. Komentar kode sendiri mengakui ini eksplisit (`:388`, "Sengaja SEBELUM generatePrfNo supaya penolakan tidak menghanguskan nomor PRF" — komentar ini sendiri agak membingungkan karena urutan sebenarnya JUSTRU menghanguskan nomor kalau gagal SETELAH nomor lahir, bukan sebelumnya; kemungkinan komentar merujuk ke guard-guard SEBELUM `generatePrfNo`, bukan sesudahnya).

### 7. Performance

**[MEDIUM] `ProcInquiryForwardingPage.jsx:46` — `.limit(200)`, bukan `.limit(1000)`.** Ini bukan cuma pelanggaran gaya — ini pelanggaran aturan wajib proyek sendiri yang tertulis eksplisit di `CLAUDE.md` § Aturan Wajib: *"Fetch: selalu `.limit(1000)` (default PostgREST 10)"*. Query ini juga: (a) tidak punya `.eq('company_id', ...)` sama sekali — mengandalkan RLS sepenuhnya, bertentangan dengan aturan wajib yang sama ("scope `company_id`"); (b) tidak punya paginasi apa pun; (c) tidak punya filter status. Konsekuensi: begitu total baris `prf` yang boleh dibaca oleh seorang user (procurement/manager di satu company, atau SEMUA entitas untuk super_admin) melewati 200, baris-baris **tertua** (termasuk yang mungkin masih `SUBMITTED` dan menunggu harga) akan **hilang dari tampilan tanpa indikasi apa pun** bahwa ada lebih banyak data. Untuk halaman yang secara fungsi adalah "inbox kerja" procurement, ini serius. Diusulkan **TD-141**.

**[LOW-MEDIUM] Over-fetch pada dropdown Inquiry.** `PRFFormPage.jsx:215` melakukan `.select(...)` dengan 17 kolom + dua embed relasi, `.limit(1000)`, HANYA untuk mengisi satu `<select>` yang sebenarnya cuma butuh `id` dan `inquiry_no` sebagai opsi — kolom-kolom lain ada untuk mendukung prefill-saat-pilih (`applyInquiryData`). Ini trade-off yang bisa dipahami (menghindari round-trip kedua), tapi berarti setiap kali form "Buat PRF Baru" dibuka, hingga 1000 baris inquiry LENGKAP ditarik sebelum user memilih apa pun.

**[LOW] Dropdown vendor & currency di `PRFDetailPage.jsx` di-fetch ulang setiap kali komponen mount (tidak ada cache lintas-buka), padahal keduanya reference data yang jarang berubah** — pola yang sama berulang di banyak halaman lain di app ini (bukan spesifik PRF), disebut di sini hanya untuk kelengkapan cakupan performa.

### 8. UX & Konsistensi Visual

**[MEDIUM — bagian dari usulan TD-148] Warna "navy" berbeda dalam SATU alur kerja yang sama.** `PRFFormPage.jsx:16` — `C.navy = '#1B4D8A'`. `PRFDetailPage.jsx:23` dan `ProcInquiryForwardingPage.jsx:9` — `NAVY = '#144682'` (navy brand kanonik per `CLAUDE.md`). Seorang sales membuka "Cetak PRF" (navy `#1B4D8A`), submit, lalu — detik berikutnya, di halaman yang sama sekali berbeda tapi konsep alur yang sama — procurement membuka PRFDetailPage (navy `#144682`). Ini bukan sekadar "drift app-wide" yang sudah tercatat TD-93 — ini drift **di dalam modul yang sama, dua klik terpisah**, kasus paling mudah dilihat langsung dari TD-93.

**[LOW] Perlakuan font untuk nilai yang SAMA (`prf_no`) berbeda di tiga layar.** Badge preview di form create memakai `IBM Plex Mono` (`PRFFormPage.jsx:130`, sesuai brand). Kolom di daftar "Forwarding (MSI)" memakai `fontFamily: 'ui-monospace, monospace'` (`ProcInquiryForwardingPage.jsx:109`) — font sistem generik, BUKAN `IBM Plex Mono` yang secara eksplisit adalah font mono resmi proyek. Judul `<h1>` di halaman Detail memakai `HEAD` (Montserrat, bukan mono sama sekali — `PRFDetailPage.jsx:487`). Tiga treatment berbeda untuk satu jenis data (nomor dokumen) dalam tiga layar yang sama-sama bagian dari modul ini.

**[LOW] Tidak ada combobox pencarian untuk dropdown Inquiry, padahal preseden sudah ada di proyek ini.** `PRFFormPage.jsx:518-521` — `<select>` native berisi hingga 1000 `<option>`, tanpa search/typeahead. Bentuk masalahnya identik dengan yang baru-baru ini diperbaiki di tempat lain: `AccountPicker` (dikerjakan 25 Jul 2026 per riwayat proyek) secara eksplisit dibangun untuk mengganti `<select>` panjang serupa di form Inquiry karena "panjang, scroll-only, tak bisa search". Perbaikan yang sama tidak pernah diperluas ke picker Inquiry di form PRF, walau bentuk masalahnya sama persis. Diusulkan **TD-149**.

**[LOW] Pratinjau nomor PRF berakhiran `—` literal sebelum simpan** (`PRFFormPage.jsx:474`, `badgePreview`) bisa dibaca user sebagai indikasi sistem belum "siap"/error, bukan sekadar placeholder sekuens. Kosmetik, tapi menambah kebingungan bersama label "Cetak" yang sudah membingungkan.

**[POSITIF]** Pesan error dan hint kondisional (mis. teks bantu "Dari inquiry: … — pilih manual" saat field tidak bisa di-prefill otomatis, `PRFFormPage.jsx:572,626,636,681`) ditulis jelas dalam Bahasa Indonesia dan cukup membantu — kualitas copy-nya jauh di atas rata-rata pesan error generik yang biasa ditemukan di form lain.

**[TIDAK ADA pelanggaran]** Tidak ditemukan emoji atau warna hijau gelap di ketiga file inti (`PRFFormPage.jsx`, `PRFDetailPage.jsx`, `ProcInquiryForwardingPage.jsx`). Satu kandidat borderline: badge warna `QUOTED` di `ProcInquiryForwardingPage.jsx:20` (`fg:'#1F8B4D'`, hijau medium-tua) — tapi karena status ini tak pernah tercapai (dead code, lihat dimensi 1), dampaknya nol dalam praktik.

### 9. Testing & Observability

**[HIGH] Nol test di seluruh repo.** `find ... -iname "*.test.js*" -o -iname "*.spec.js*"` di seluruh proyek (bukan hanya PRF) mengembalikan hasil kosong. Ini bukan celah spesifik PRF — proyek ini memang belum punya test suite sama sekali (konsisten dengan `08_TECH_DEBT.md` TD-07/08 yang sudah mengakuinya). Dicatat di sini karena brief secara eksplisit meminta jawaban "ada test?" — jawabannya tegas: tidak ada, untuk modul ini maupun modul lain manapun.

**[HIGH] Nol logging apa pun di modul procurement.** `grep -n "console\.\(log\|error\|warn\)"` pada ketiga file procurement mengembalikan **nol hasil**. Digabung dengan temuan error-ditelan di dimensi 6: kalau sesuatu gagal di modul ini hari ini, di produksi, tidak ada jejak APAPUN untuk developer — tidak di UI (toast), tidak di console, tidak di audit log (dimensi 4), tidak di sistem monitoring manapun yang bisa saya verifikasi dari kode.

**[MEDIUM] Tidak ada cara mendeteksi drift produksi untuk invarian bisnis inti.** Tidak ada job/cron/dashboard yang, misalnya, secara berkala mengecek "apakah ada PRF dengan >1 vendor `is_awarded=true`?" — yang berarti kalaupun Temuan Kritis #1 di atas sudah terjadi di data produksi HARI INI, tidak ada mekanisme apa pun di dalam aplikasi yang akan memberi tahu siapa pun. (Lihat query SQL di bawah untuk mengecek ini secara manual — sangat disarankan dijalankan segera.)

---

## MATRIKS GATE

| Halaman / Aksi | Gate menu (registry) | Gate tombol/route | RLS | Konsisten? |
|---|---|---|---|---|
| **Sidebar/registry `'prf'`** (`App.jsx:695`) | `role: ['sales','gm_bd','procurement','manager','ceo','admin','super_admin']` (7 role) — **tidak ada di `NEXUS_NAV`, tak ada leaf sidebar** (`App.jsx:1035-1105`, dikonfirmasi grep) | — | — | **Tidak** — 7 role diizinkan menu-level tapi hanya 3 (sales/gm_bd/super via bypass) yang bisa benar-benar submit (lihat RLS insert). |
| **Jalur A** — tombol "Cetak PRF" di Detail Inquiry | (mengarah ke `'prf'` di atas) | `canCreate=['sales','gm_bd'].includes(erpRole)` (`DealDetailPage.jsx:483`) — **super_admin TIDAK termasuk** | — | **PERLU KONFIRMASI DEN** — apakah super_admin memang sengaja tak boleh memicu "Cetak PRF"? |
| **Jalur B** — tombol "Cetak PRF" di Detail Account tab Riwayat | — (render `PRFFormPage` di `App.jsx:3523-3527` **tanpa** `canRenderPage`, berbeda dari Jalur A yang pakai `canRenderPage('prf')` di `App.jsx:3581`) | `canCreatePRF=['sales','gm_bd'].includes(erpRole)` (`CustomerDetailPage.jsx:724`), prop hanya dikirim bila true (`:1497`) | — | **Asimetri terverifikasi** — Jalur B satu lapis lebih tipis dari Jalur A (tak ada `canRenderPage`). Bukan lubang aktif (state hanya terisi lewat callback yang sudah digate), tapi pola ini rawan replikasi kalau ada sub-view baru. |
| **Jalur C** — `activeMenu='prf'` dipulihkan dari `localStorage` saat refresh | Gate registry `'prf'` (7 role) via `canRenderPage('prf')` (`App.jsx:3581`, kini **fail-closed** sejak TD-103 RESOLVED — id `'prf'` dikenal, dievaluasi normal, bukan lewat cabang unknown-id) | — (tidak ada tombol, langsung render form kosong tanpa prefill) | `prf_insert` (lihat bawah) | **Tidak** — 4 dari 7 role yang lolos gate menu (procurement/manager/ceo/admin) akan mendarat di form yang bisa diisi penuh, lalu ditolak RLS saat submit SETELAH nomor PRF sudah terbakar (TD-48). |
| **`prf` — INSERT** | — | — | `prf_insert` (`schema_snapshot.sql:12597`): `is_super_admin() OR (company match AND created_by=self AND (has_role('sales') OR has_role('gm_bd')))` | Ini yang paling ketat dari semua lapis — **penegak sebenarnya**. |
| **`prf` — SELECT** | — | — | `prf_select` (`:12604`): `is_super_admin() OR (company match AND (created_by=self OR has_role('procurement') OR is_manager_or_above()))` | Konsisten dengan desain "sales lihat punya sendiri, procurement/manager lihat semua company". |
| **`prf` — UPDATE (draft, milik sendiri)** | — | — | `prf_update_draft` (`:12611`): pembuat sendiri **dan** `status='DRAFT'` | Tak ada UI yang memakai ini (form create-only, TD-76) — **RLS hidup, konsumen nol**. |
| **`prf` — UPDATE (jawaban harga)** | — | `canEdit=['procurement','super_admin'].includes(erpRole)` (`PRFDetailPage.jsx:59`) | `prf_update_status` (`:12618`): `has_role('procurement') AND status='SUBMITTED'` (atau super) — **WITH CHECK hanya mensyaratkan company match, TIDAK mensyaratkan role/status** | Konsisten untuk kondisi normal; catatan: WITH CHECK yang longgar berarti begitu USING lolos, baris bisa ditulis ke kombinasi apa pun selama company cocok (mis. teoretis bisa mengubah `status` ke nilai CHECK lain — tapi tak ada kode yang melakukannya). |
| **`prf_cost_items` — INSERT/UPDATE/DELETE** | — | Diturunkan dari `canEdit` yang sama di UI | Ketiganya diturunkan dari kondisi identik: `has_role('procurement') AND prf.status='SUBMITTED'` (via EXISTS ke `prf`) | **Konsisten SECARA ROLE, TAPI lihat Temuan Kritis #1** — RLS ini tidak tahu (dan tidak bisa tahu) apakah penulisnya lewat RPC `save_prf_pricing` atau langsung. |
| **Tombol "Buat Quotation" + panel riwayat quotation di PRFDetailPage** | — | `hasMenuPermission('crm_quotation','view')` (`PRFDetailPage.jsx:60`) — **fail-closed**, per-user granular (bukan role array) | Efektif ditegakkan oleh RLS `quotations`/`quotation_items` saat submit form Quotation yang sebenarnya (di luar scope file ini) | Konsisten by design (TD-90) — tapi meminjam gate dari domain lain (CRM Quotation) untuk mengontrol aksi domain Procurement. |
| **Menu "Forwarding (MSI)" (`proc-inquiry-fwd-msi`)** | `role: ['sales','gm_bd','procurement','manager','ceo','admin','super_admin']` (`App.jsx:697`, identik array `'prf'`) | `canRenderPage('proc-inquiry-fwd-msi')` (`App.jsx:3592`) | `prf_select` (sama seperti di atas) | Konsisten role-wise, tapi **query-nya sendiri melanggar aturan wajib** (lihat dimensi 3/7) — sales yang membuka halaman ini melihat "inbox" yang isinya cuma PRF miliknya sendiri, sementara procurement melihat SEMUA — dua pengalaman sangat berbeda di bawah judul dan tombol yang identik, tanpa indikasi apa pun di UI tentang perbedaan cakupan ini. |
| **`proc-contracts-carrier` / `proc-vendor-catalog`** | `soon: true`, murni node skeleton di `NEXUS_NAV` (`App.jsx:1091,1099`) | Tidak ada — tidak dirender di manapun (`grep` di seluruh `src/` = 0 hit selain deklarasi node itu sendiri) | — | **PLACEHOLDER murni, terkonfirmasi.** Nol query, nol komponen. Catatan proyek sendiri (`CLAUDE.md`, 21 Jul) sudah mengidentifikasi tumpang-tindih konseptual dengan `rate_sheets` (Rate List) — "belum konflik aktif, tapi begitu salah satunya dibangun perlu keputusan eksplisit soal sumber kebenaran tarif BELI vs JUAL." Saya angkat ulang ini di Pertanyaan Terbuka karena belum pernah dijawab. |

---

## SQL UNTUK DIJALANKAN MANUAL

Semua query di bawah **read-only** (`SELECT` murni). Jalankan di Supabase SQL Editor. Saya kelompokkan per tujuan.

```sql
-- ═══════════════════════════════════════════════════════════════════
-- (1) Berapa total PRF, dan distribusinya per status.
-- Tujuan: memastikan asumsi audit ("hanya DRAFT/SUBMITTED yang pernah
-- ditulis") benar di data nyata, dan melihat berapa banyak yang DRAFT
-- (kandidat "draft nyasar", TD-76).
-- ═══════════════════════════════════════════════════════════════════
SELECT status, count(*) AS jumlah
FROM public.prf
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY jumlah DESC;

-- ═══════════════════════════════════════════════════════════════════
-- (2) TEMUAN KRITIS #1 — apakah ada PRF dengan LEBIH DARI SATU vendor
-- yang sama-sama is_awarded=true? Ini pengecekan LANGSUNG apakah celah
-- "nol constraint DB untuk satu vendor pemenang" sudah pernah menghasilkan
-- data ambigu di produksi. JALANKAN INI SEGERA.
-- ═══════════════════════════════════════════════════════════════════
SELECT prf_id, count(DISTINCT vendor_id) AS jumlah_vendor_menang
FROM public.prf_cost_items
WHERE is_awarded = true AND vendor_id IS NOT NULL
GROUP BY prf_id
HAVING count(DISTINCT vendor_id) > 1;

-- ═══════════════════════════════════════════════════════════════════
-- (3) Berapa PRF yang sudah punya minimal 1 baris prf_cost_items
-- (artinya sudah pernah diisi harga), vs yang masih kosong sama sekali.
-- Tujuan: mengukur seberapa jauh proses "Jawaban Harga" benar-benar
-- dipakai, dan apakah bug hantu TD-110 (0 baris tanpa error) masih
-- meninggalkan jejak PRF ber-answered_at tapi 0 baris cost_items.
-- ═══════════════════════════════════════════════════════════════════
SELECT
  p.id, p.prf_no, p.status, p.answered_at,
  count(ci.id) AS jumlah_baris_biaya
FROM public.prf p
LEFT JOIN public.prf_cost_items ci ON ci.prf_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.prf_no, p.status, p.answered_at
HAVING p.answered_at IS NOT NULL AND count(ci.id) = 0
ORDER BY p.answered_at DESC;

-- ═══════════════════════════════════════════════════════════════════
-- (4) Berapa PRF yang sudah "ter-award" (punya minimal 1 vendor_id
-- non-null dengan is_awarded=true) vs yang belum, per status.
-- Tujuan: gambaran umum seberapa jauh proses award benar dipakai.
-- ═══════════════════════════════════════════════════════════════════
SELECT
  p.status,
  count(DISTINCT p.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.prf_cost_items ci
      WHERE ci.prf_id = p.id AND ci.is_awarded = true AND ci.vendor_id IS NOT NULL
    )
  ) AS sudah_ter_award,
  count(DISTINCT p.id) AS total_prf_status_ini
FROM public.prf p
WHERE p.deleted_at IS NULL
GROUP BY p.status;

-- ═══════════════════════════════════════════════════════════════════
-- (5) Berapa inquiry yang berstatus IN_REVIEW ("Menunggu harga") saat
-- ini, dan sudah berapa lama (untuk menaksir dampak nyata Temuan #TD-139
-- — inquiry yang macet permanen karena tak ada jalur balik).
-- ═══════════════════════════════════════════════════════════════════
SELECT
  i.id, i.inquiry_no, i.status, i.updated_at,
  now() - i.updated_at AS lama_macet,
  (SELECT count(*) FROM public.prf p WHERE p.inquiry_id = i.id AND p.deleted_at IS NULL) AS jumlah_prf_terkait
FROM public.inquiries i
WHERE i.status = 'IN_REVIEW' AND i.deleted_at IS NULL
ORDER BY i.updated_at ASC;  -- yang PALING LAMA macet muncul duluan

-- ═══════════════════════════════════════════════════════════════════
-- (6) Distribusi PRF per company_id (per entitas) — untuk memastikan
-- benar hanya MSI (atau memang ada JCI/SOA juga, yang berarti label
-- halaman "Forwarding (MSI)" menyesatkan untuk data yang bukan MSI).
-- ═══════════════════════════════════════════════════════════════════
SELECT c.code AS entitas, count(*) AS jumlah_prf
FROM public.prf p
JOIN public.companies c ON c.id = p.company_id
WHERE p.deleted_at IS NULL
GROUP BY c.code
ORDER BY jumlah_prf DESC;

-- ═══════════════════════════════════════════════════════════════════
-- (7) Satu inquiry, berapa PRF? Untuk menjawab pertanyaan terbuka
-- "apakah 1 inquiry -> banyak PRF itu disengaja atau celah".
-- ═══════════════════════════════════════════════════════════════════
SELECT inquiry_id, count(*) AS jumlah_prf
FROM public.prf
WHERE deleted_at IS NULL AND inquiry_id IS NOT NULL
GROUP BY inquiry_id
HAVING count(*) > 1
ORDER BY jumlah_prf DESC;

-- ═══════════════════════════════════════════════════════════════════
-- (8) Total baris di "Forwarding (MSI)" yang SEHARUSNYA terlihat oleh
-- seorang procurement/manager di company tertentu (tanpa limit) —
-- bandingkan dengan 200 (limit hardcoded di kode) untuk tahu apakah
-- pelanggaran .limit(200) sudah nyata memotong data HARI INI.
-- Ganti <COMPANY_ID_MSI> dengan UUID company MSI yang sebenarnya.
-- ═══════════════════════════════════════════════════════════════════
SELECT company_id, count(*) AS total_baris_tanpa_limit
FROM public.prf
WHERE deleted_at IS NULL
GROUP BY company_id;

-- ═══════════════════════════════════════════════════════════════════
-- (9) Ada baris prf_cost_items dengan amount negatif? (Mengecek apakah
-- ketiadaan CHECK constraint non-negatif sudah pernah dieksploitasi/
-- ke-trigger oleh bug apa pun.)
-- ═══════════════════════════════════════════════════════════════════
SELECT id, prf_id, component, amount, currency
FROM public.prf_cost_items
WHERE amount < 0;

-- ═══════════════════════════════════════════════════════════════════
-- (10) Ada prf.commercial_value atau suggested_rate negatif?
-- ═══════════════════════════════════════════════════════════════════
SELECT id, prf_no, commercial_value, suggested_rate
FROM public.prf
WHERE (commercial_value IS NOT NULL AND commercial_value < 0)
   OR (suggested_rate IS NOT NULL AND suggested_rate < 0);

-- ═══════════════════════════════════════════════════════════════════
-- (11) WAJIB — cek GRANT tabel-level untuk prf/prf_cost_items pada role
-- `authenticated`. Snapshot repo TIDAK memuat info GRANT sama sekali
-- (dump tanpa privileges), jadi ini SATU-SATUNYA cara memastikan.
-- ═══════════════════════════════════════════════════════════════════
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('prf', 'prf_cost_items')
ORDER BY table_name, grantee, privilege_type;

-- ═══════════════════════════════════════════════════════════════════
-- (12) Berapa PRF yang sudah punya Quotation dibuat darinya, DAN
-- prf.answered_at LEBIH BARU dari quotation.created_at yang mengacu
-- padanya — indikasi kuat "Jawaban Harga diedit SETELAH Quotation
-- dibuat" (Temuan Kritis #3 / TD-150) sudah benar terjadi di data nyata.
-- ═══════════════════════════════════════════════════════════════════
SELECT
  p.id AS prf_id, p.prf_no, p.answered_at AS prf_terakhir_dijawab,
  q.id AS quotation_id, q.quotation_no, q.created_at AS quotation_dibuat
FROM public.prf p
JOIN public.quotations q ON q.prf_id = p.id
WHERE p.deleted_at IS NULL AND q.deleted_at IS NULL
  AND p.answered_at > q.created_at
ORDER BY p.answered_at DESC;

-- ═══════════════════════════════════════════════════════════════════
-- (13) Umur draft PRF — berapa banyak DRAFT yang sudah lama tak
-- disentuh (kandidat "nomor terbuang + baris permanen", TD-76/TD-139).
-- ═══════════════════════════════════════════════════════════════════
SELECT prf_no, created_at, now() - created_at AS umur
FROM public.prf
WHERE status = 'DRAFT' AND deleted_at IS NULL
ORDER BY created_at ASC;
```

---

## PERTANYAAN TERBUKA

Hal-hal berikut **tidak bisa saya pastikan hanya dari kode/skema**, dan butuh jawaban Den atau data live sebelum diputuskan jadi bug/fitur:

1. **Apakah "satu inquiry boleh melahirkan banyak PRF" itu keputusan sadar** (mis. untuk revisi harga, sama seperti pola "satu PRF boleh banyak Quotation" yang sudah eksplisit didokumentasikan sebagai keputusan desain), **atau celah yang belum disadari?** Tidak ada satu baris dokumentasi pun yang menyatakan keputusan ini untuk relasi Inquiry→PRF secara spesifik — hanya ketiadaan cek. (Query SQL #7 akan menunjukkan apakah ini sudah terjadi di data nyata.)

2. **Apakah jalur C (`activeMenu='prf'` tanpa leaf sidebar, hanya bisa dicapai lewat dua tombol atau refresh-restore) memang disengaja** sebagai "halaman berdiri sendiri" yang belum diberi leaf sidebar, **atau efek samping tak tercatat** dari pencabutan leaf `prf` di commit `83238c3` (restrukturisasi nav Procurement, menurut catatan `CLAUDE.md`)? Kalau disengaja, mengapa array role gate-nya (7 role) masih lebih luas dari RLS insert (2 role + super)?

3. **Apakah `super_admin` memang sengaja dikecualikan** dari array role tombol "Cetak PRF" (`['sales','gm_bd']`, tanpa `super_admin`) di kedua entry point resminya? Ini tidak berbahaya (arahnya lebih ketat, bukan lebih longgar), tapi kalau tak disengaja, ini menghalangi admin melakukan dukungan/pengujian tanpa berpindah akun.

4. **`proc-vendor-catalog` (Vendor Price List/Catalog) — akan pakai tabel `rate_sheets` yang sama dengan Rate List CRM, atau tabel terpisah?** Catatan proyek sendiri (21 Jul 2026) sudah mengenali tumpang-tindih konsep ini ("belum konflik aktif, tapi begitu salah satunya dibangun perlu keputusan eksplisit soal sumber kebenaran tarif BELI vs JUAL") tapi belum dijawab. Saya angkat ulang secara eksplisit di sini karena brief secara khusus menanyakan halaman ini.

5. **Apakah tombol "Cetak PRF" akan benar-benar diberi PDF suatu saat** (sehingga labelnya jadi akurat), **atau akan di-rename** menjadi sesuatu yang lebih jujur soal apa yang sebenarnya terjadi (membuka form, bukan mencetak)? Ini keputusan produk, bukan bug — tapi mempengaruhi ekspektasi user secara langsung.

6. **Apakah "Jawaban Harga" PRF perlu dikunci begitu Quotation pertama dibuat darinya** (supaya angka yang sudah dipakai customer-facing tak bisa diam-diam menyimpang), **atau memang dirancang agar procurement selalu bisa merevisi** dan tanggung jawab menyinkronkan ke Quotation ada di sales secara manual? Tidak ada dokumen yang menyatakan salah satunya.

7. **Berapa banyak PRF sudah ada di produksi, dan apakah Temuan Kritis #1 (double-award) sudah pernah terjadi?** Wajib dicek via SQL query (2) di atas SEBELUM memutuskan prioritas perbaikan — kalau datanya sudah bersih, ini "cegah sebelum terjadi"; kalau sudah ada yang kena, ini butuh perbaikan data + rilis darurat.

8. **Apakah GRANT tabel `authenticated` pada `prf`/`prf_cost_items` sudah benar dijalankan manual** mengikuti konvensi proyek ("GRANT setelah CREATE")? Tak terlihat di snapshot karena dump tanpa privileges — wajib dicek via SQL query (11).

---

## TOP 10 MASALAH PALING KRITIS

1. **[CRITICAL]** Aturan "satu vendor pemenang per PRF" nol penegakan di DB — hanya guard prosedural di dalam RPC `save_prf_pricing`; RLS `prf_cost_items_insert`/`_update` mengizinkan tulis langsung yang melewati RPC ini sepenuhnya (amplifikasi TD-122 existing → CRITICAL untuk audit ini). *(dimensi 4, DB & Security)*
2. **[HIGH]** PRF tidak punya jalur batal/tolak/tarik sama sekali — status machine satu arah permanen, 4 dari 6 nilai CHECK tak terjangkau, `deleted_at` ada tapi tak ada RLS DELETE atau UI yang memakainya (usulan **TD-139**, memperluas TD-76). *(dimensi 4)*
3. **[HIGH]** Jawaban Harga PRF tetap bisa diedit bebas SETELAH Quotation dibuat darinya, tanpa lock atau peringatan — dokumen customer-facing bisa diam-diam menyimpang dari basis biaya sumbernya (usulan **TD-150**). *(dimensi 4/5)*
4. **[HIGH]** Nol notifikasi/handoff signal dua arah sepanjang seluruh alur — procurement dan sales sama-sama mengandalkan kebiasaan membuka halaman manual (usulan **TD-140**). *(dimensi 4)*
5. **[HIGH]** `ProcInquiryForwardingPage.jsx` melanggar aturan wajib proyeknya sendiri: `.limit(200)` bukan `.limit(1000)`, tanpa `company_id`, tanpa paginasi, tanpa filter status — data lama silam hilang dari tampilan tanpa indikasi begitu volume >200 (usulan **TD-141**). *(dimensi 3/7)*
6. **[HIGH]** Nol audit log untuk create/submit/pricing-answer/award PRF, padahal `AGENTS.md` mewajibkannya secara eksplisit dan pola `logAudit` sudah dipakai fitur tetangga (usulan **TD-142**). *(dimensi 4/9)*
7. **[MEDIUM-HIGH]** Error di-telan diam-diam (destrukturisasi `{data}` tanpa `error`) di ≥5 titik fetch dalam file yang sama yang di tempat lain justru memeriksa error dengan benar — inkonsistensi internal, bukan cuma gap eksternal (usulan **TD-143**). *(dimensi 6)*
8. **[MEDIUM]** Tidak ada guard konkurensi/optimistic-lock saat dua staf procurement mengedit "Jawaban Harga" PRF yang sama — DELETE-lalu-INSERT tanpa syarat di RPC membuat potensi kehilangan data lebih besar dari override kolom biasa (usulan **TD-144**). *(dimensi 5)*
9. **[MEDIUM]** Nol CHECK constraint DB untuk nilai negatif di kolom uang/berat/volume `prf`/`prf_cost_items` — validasi murni client-side, mudah dilewati panggilan API langsung (usulan **TD-145**). *(dimensi 3)*
10. **[MEDIUM]** Empat lapis gate untuk "siapa boleh membuat PRF" saling tidak konsisten (registry 7 role vs tombol 2 role TANPA super_admin vs RLS 2 role+super) tanpa dokumentasi bahwa ini keputusan sadar — memperluas TD-105 yang sudah ada (usulan **TD-146**). *(dimensi 4/8)*

**Sebutan kehormatan (belum bisa diberi severity pasti tanpa akses DB):** GRANT tabel `authenticated` pada `prf`/`prf_cost_items` tidak bisa diverifikasi dari repo sama sekali — kalau ternyata belum di-GRANT, ini bisa jadi **CRITICAL prod-mati** (semua orang gagal insert/select); kalau sudah benar, ini bukan masalah sama sekali. **Wajib dicek via SQL #11 sebelum menutup audit ini.**

---

## DAFTAR FIX (CHECKLIST)

### SEGERA (sebelum kerja lain di modul ini)

- [ ] Jalankan **SQL #2** (cek double-award di data nyata) dan **SQL #11** (cek GRANT) — dua-duanya bisa mengubah seluruh prioritas di bawah tergantung hasilnya.
- [ ] Putuskan arah perbaikan untuk TD-122 (tabel award terpisah, sesuai arah yang sudah dipilih proyek 21 Jul 2026) dan jadwalkan — jangan biarkan ini jadi utang jangka panjang mengingat ini invarian harga beli.
- [ ] Tambahkan `logAudit(ACTION_TYPES.CREATE_PRF / UPDATE_PRF_PRICING / AWARD_VENDOR, ENTITY_TYPES.PRF, ...)` di titik submit `PRFFormPage.jsx:461` dan di `PRFDetailPage.jsx:316` (setelah RPC sukses) — pola sudah ada di `src/lib/auditLogger.js`, tinggal wiring seperti `DealDetailPage.jsx:342-344`.
- [ ] Perbaiki `ProcInquiryForwardingPage.jsx:46`: `.limit(200)` → `.limit(1000)`, tambahkan `.eq('company_id', profile.company_id)` (untuk non-super) sesuai pola file PRF lain, dan jadwalkan paginasi (server-side, mengikuti pola `SalesOrderPage`).

### JANGKA PENDEK

- [ ] Desain minimal untuk "batalkan PRF" (bisa sesederhana: super_admin/pembuat bisa menyetel `status='CANCELLED'` selama belum dijawab, dengan trigger baru yang mengembalikan `inquiries.status` ke `OPEN` bila tak ada PRF `SUBMITTED` lain untuk inquiry itu) — menutup TD-139.
- [ ] Tambahkan guard di `PRFDetailPage.handleSave` (`:257`): kalau `prfQuotes.length > 0`, tampilkan peringatan eksplisit sebelum menyimpan perubahan harga/award ("PRF ini sudah dipakai N Quotation — perubahan TIDAK akan otomatis tersinkron") — menutup sebagian TD-150 tanpa perlu desain lock penuh.
- [ ] Perbaiki 5 titik fetch yang menelan `error` diam-diam di `PRFFormPage.jsx` (:215-220, :230-233) dan `PRFDetailPage.jsx` (:143-150, :156-157) — samakan dengan pola yang sudah benar di `ProcInquiryForwardingPage.jsx:47-51`.
- [ ] Tambahkan CHECK constraint non-negatif untuk `prf.commercial_value`, `prf.suggested_rate`, `prf_cost_items.amount` (dan idealnya seluruh kolom berat/volume) — perubahan skema kecil, risiko rendah (tak ada data existing yang mungkin negatif kalau UI sudah selalu memfilter).
- [ ] Rekonsiliasi array role di 4 lapis gate PRF (registry, tombol Jalur A, tombol Jalur B, RLS insert) jadi satu sumber kebenaran, atau dokumentasikan eksplisit kenapa mereka sengaja berbeda (termasuk kasus super_admin yang tak melihat tombol).
- [ ] Pertimbangkan notifikasi minimal: insert ke `notifications` saat PRF `SUBMITTED` (target: procurement di company yang sama) dan saat `answered_at` pertama kali terisi (target: `prf.created_by`) — pola sudah ada di `LeadPoolPage.jsx:166`, tinggal adaptasi.

### JANGKA PANJANG

- [ ] Satukan token warna/font `PRFFormPage.jsx`/`PRFDetailPage.jsx`/`ProcInquiryForwardingPage.jsx` ke satu modul lokal (`src/modules/procurement/shared.js` atau sejenis) — sekalian selesaikan drift `#1B4D8A` vs `#144682` untuk modul ini secara spesifik (bagian dari TD-93 besar).
- [ ] Ekstrak `fmtDate`/`SERVICE_LABEL` yang diduplikasi ke helper bersama modul procurement.
- [ ] Selesaikan konsolidasi kosakata `inquiries` ↔ `prf` (TD-107/TD-108) — bukan tambal per-task seperti sudah diperingatkan tech debt existing.
- [ ] Ganti dropdown Inquiry native `<select>` di `PRFFormPage.jsx` dengan combobox pencarian, mengikuti preseden `AccountPicker` yang sudah dibangun untuk masalah identik di form lain.
- [ ] Putuskan nasib label "Cetak PRF" — beri PDF sungguhan atau rename jadi sesuai kenyataan.
- [ ] Bangun test coverage minimal untuk RPC `save_prf_pricing` (khususnya guard double-award) dan trigger `set_inquiry_review_on_prf_submit` — dua titik paling kritis untuk regresi diam-diam, dan proyek ini belum punya test apa pun sama sekali untuk menangkapnya.
- [ ] Selesaikan keputusan `proc-vendor-catalog` vs `rate_sheets` sebelum salah satunya dibangun, supaya tak ada dua "sumber tarif" yang bersaing.

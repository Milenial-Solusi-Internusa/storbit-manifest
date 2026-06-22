# Nexus MSI — Development Progress Log

## 2026-06-22

### Notification bell + producer notifikasi (Phase 2.10K)
> 3 file (App.jsx, ActivitiesPage.jsx, useHrgaRequests.js). RLS `notifications_*` ditambah via SQL Editor. Tabel `notifications.company_id` NOT NULL → disertakan di tiap insert.
- [x] **TASK 1 (App.jsx bell)** — state notifications/unreadCount/notifOpen; fetch (user_id=me, is_read=false, order desc, limit 20) saat mount + setInterval 60s + cleanup; badge orange #E85A1E (>99→"99+"); dropdown 340px max-h scroll z-50 + overlay click-outside + Escape; header "Notifikasi" + "Tandai semua dibaca" (update is_read semua unread); item = Lucide icon per event_type + title bold + body + relative-time; klik → optimistic mark-read + navigate (hrga_request→hrga-semua-request, activity→crm-calls); empty state
- [x] **Fix bug 2.10J** — badge Pending Approval status `['submitted','under_review']` → `['submitted','in_progress']` (under_review tak ada di enum)
- [x] **TASK 2A** — ActivitiesPage CREATE sukses → notif assignee (skip self/null) `activity_assigned`, company_id profile
- [x] **TASK 2B** — mark-done → notif creator (skip self) `activity_done`, company_id row||profile
- [x] **TASK 2C** — useHrgaRequests submit Step 7 (reuse recipientIds approver) → notif `hrga_approval_needed` (skip submitter), body pakai rtRow.type_name (+ditambah ke select), company_id profile
- [x] **TASK 2D** — submitApproval terminal (approved final/rejected) → notif requester (skip self) `hrga_approved`/`hrga_rejected`, +requester_id,subject ke req select, company_id req
- [x] Semua producer fire-and-forget (try-catch → console.debug, tak block UI/tak toast)
- [x] **Build clean** — 2550 modules, 1.26s
- [ ] Catatan: notif intermediate-level (next approver saat in_progress) TIDAK diproduksi (di luar scope; submit hanya notif level-1). Isolasi notif = RLS DB (baru ditambah) + filter client `user_id`
- [ ] **Tes manual (belum — runtime):** bell muncul; submit HRGA→approver dapat notif; approve/reject→requester dapat; assign activity ke orang lain→mereka dapat; klik notif→mark read badge turun; "tandai semua dibaca"; empty state

### Quotation — currency dropdown DB + VAT rate per service_type + PPN dynamic (Phase 2.10C)
> Prasyarat DB (SQL Editor, sudah ada; snapshot stale): tabel `currencies`, `quotations.vat_rate` DEFAULT 0.011, RPC save_quotation terima vat_rate. `currencies_read_all` USING(true). 3 file.
- [x] **TASK 1 (Form currency)** — state `currencies` + fetch (is_active, order code); SectionCard prop `currencies` → dropdown render code (fallback ['IDR','USD']). Kurs USD/calcRowTotal tak diubah (currency non-USD listing only, konversi USD-only out of scope)
- [x] **TASK 2 (Form VAT)** — VAT_OPTIONS (0/1,1%/11%) + `vatDefaultFor` (customs→0.11 else 0.011) + `vatLabel` (koma). header.vat_rate default+edit-populate. Field "Tarif PPN" antara Kurs USD & Notes. Auto-default saat service_type berubah (handleServiceTypeChange + handleInquiryChange), override manual OK. tax pakai header.vat_rate; vat_rate ke p_header+insertPayload; summary label dynamic
- [x] **TASK 3 (DetailPage on-screen)** — SELECT +vat_rate; effVat=`quot.vat_rate ?? 0.011`; tax recompute pakai effVat (bukan cuma label); sidebar label PPN dynamic koma. Dead print-area (html2canvas) tak disentuh
- [x] **TASK 4 (PDF)** — effVat=`quot.vat_rate ?? 0.011`; tax=`tax_amount ?? round((sub-disc)*effVat)`; label PPN dynamic koma; baris VAT hidden kalau effVat===0
- [x] Format label ID-koma konsisten Task 2/3/4 (`.replace('.',',')`)
- [x] **Build clean** — 2550 modules, 1.65s
- [ ] **Tes manual (belum — runtime):** dropdown currency EUR/SGD/JPY/MYR/USD/IDR muncul · service Customs→VAT 11%, lain→1,1% · override manual tersimpan+reload benar · detail+PDF label PPN dynamic · baris VAT hilang di PDF saat 0% · quote lama vat_rate null→fallback 1,1%

### Quotation PDF rewrite — html2canvas+jsPDF → @react-pdf/renderer (Phase 2.10A)
> Vector/text PDF, pagination otomatis. Ganti raster JPEG screenshot. 3 file (deps + QuotationPDF baru + QuotationDetailPage).
- [x] **TASK 1 (deps)** — uninstall html2canvas+jspdf (cuma dipakai di QuotationDetailPage, diverifikasi), install @react-pdf/renderer ^4.5.1
- [x] **TASK 2 (`QuotationPDF.jsx` BARU)** — `({quot, items, sections, creatorProfile})`, Document/Page/View/Text/Image/StyleSheet, font Helvetica built-in (no register). 9 section: header(logo h36, not fixed)/customer details(+APPROVED BY blank)/item tables per section (wrap=false per row, section-name+col-header nyatu, zebra, USD #a45a22, kolom 35/8/14/14/8/21, NO cost/margin)/grand summary(VAT 1.1%, GRAND TOTAL navy)/notes(navy left)/terms(orange left "Above rates :")/signatures 2-kolom/divider 8%+92%/footer navy `fixed` text-only (logo footer skip — filter invert tak didukung). Page paddingBottom 96 ≥ footer
- [x] **TASK 3 (QuotationDetailPage)** — hapus import html2canvas+jsPDF, +`{ pdf }`+QuotationPDF; handleDownloadPDF → `pdf(<QuotationPDF/>).toBlob()` → a.download `${quotation_no}_rev${revision??1}.pdf`; showToast?.(msg,'error') (urutan existing, bukan snippet kebalik); 2 tombol tetap. `#quotation-print-area` DIPERTAHANKAN (per instruksi; kini dead DOM, comment stale)
- [x] Internal (internal_notes/cost_price/margin) TIDAK di PDF
- [x] **Build clean** — 2550 modules (turun dari 2633: html2canvas+jsPDF dibuang; @react-pdf di chunk lazy), 1.50s
- [ ] **Tes manual (belum — runtime):** Download PDF → .pdf ter-download (bukan error) · teks selectable (bukan raster) · 9 section urut lengkap · tabel item tak kepotong di tengah baris · footer tiap halaman · grand total benar · internal_notes/cost/margin tak muncul · on-screen detail tetap normal
- [ ] **Catatan:** `#quotation-print-area` kini dead/unused DOM (dipertahankan per instruksi) — kandidat cleanup terpisah kalau memang tak dipakai on-screen

### Activity lifecycle → feed: tulis activity_logs + feed baca log (Phase 2.9Z)
> 3 file (ActivitiesPage/activityFeed/ActivityLogPage). Tanpa ubah DB (activity_logs + RLS sudah ada). Pilihan: edit via edited↔edited (A) + ganti sumber feed (B).
- [x] **TASK 1 (ActivitiesPage)** — fire-and-forget INSERT activity_logs (`changed_by: profile.id`; error→console.error, tak block/tak toast) tiap op: CREATE `.select('id').single()` → `{from:null,to:'todo'}`; mark-done `{from:row.status,to:'done'}`; cancel (resolve from via `rows.find`) `{to:'cancelled'}`; edit `{from:'edited',to:'edited'}`. deps +profile (+rows di cancel)
- [x] **TASK 2 (activityFeed)** — hapus sumber activities-row; ganti `activity_logs` (embed `activity:activities(type,contact_name,account:accounts(name))`, order changed_at desc limit 200, no company filter → RLS via parent). Map type:'activity' (tetap), actType=activity.type, title per to_status (baru/selesai/dibatalkan/diubah), subtitle contact_name||account.name, timestamp changed_at, user_id changed_by (auto nameMap). id `actlog-`
- [x] **TASK 3 (ActivityLogPage)** — no change: type tetap 'activity' → TYPE_TONE.activity + filter 'activity' existing tetap jalan (hanya title beda per status)
- [x] **Build clean** — 2633 modules, 1.19s
- [x] Catatan: activity lama tanpa baris activity_logs (kecuali visit via CRMDashboard sejak 2.9D) tak muncul di feed sampai di-aksi lagi (konsekuensi ganti sumber). FEED_ACT_LABEL tetap di-export; FEED_ACT_ICON tetap dipakai
- [ ] **Tes manual (belum — runtime):** create→"Aktivitas baru" · mark-done→"Aktivitas selesai" · edit→"Aktivitas diubah" · cancel→"Aktivitas dibatalkan" · nama user benar · subtitle kontak/akun · tak ada duplikat (activities-row sudah dihapus)

### PipelineKanban — aktifkan 4 kontrol toolbar + fix list crash + value 0 (Phase 2.9X)
> `PipelineKanbanPage.jsx` saja. Prasyarat DB: `accounts.estimated_value` sudah dibuat via SQL Editor. Tanpa ubah DB/RLS/file lain.
- [x] **Shared infra** — `openMenu` (1 popover) + overlay z140 click-outside (no doc listener) + menu z150 dalam wrapper relative; primitives `MenuBox`/`MenuOption`/`CheckRow` (navy aktif, Lucide check). Pipeline turunan: `filteredDeals = deals→member→panel`, `sortDeals()` per stage (board & list sama)
- [x] **TASK 1 (fix crash)** — `ListGroup`/`ListRow` +`onRowClick` (ganti `setDetailDeal` out-of-scope → ReferenceError); list pass `onRowClick={setDetailDeal}`
- [x] **TASK 2 (value)** — `estimated_value` ke SELECT + mapping `value: p.estimated_value ?? 0` (buang deal_value); display `rp()` existing (toLocaleString id-ID, 0/null→'—')
- [x] **TASK 3 (Semua Anggota)** — dropdown; members derive distinct assigned_to+full_name; "Semua Anggota" reset; filter assigned_to; label=member
- [x] **TASK 4 (sort "Nilai Pipeline")** — 6 opsi (Terbaru/Terlama/Nilai↑↓/Closing Terdekat null-last/Nama A–Z) via sortDeals per stage; default recent; aktif check+navy; label=opsi
- [x] **TASK 5 (Filter panel)** — draft→applied; Source(multi)+Customer Type(multi)+BANT(multi 6-7/4-5/1-3/0)+Closing(single bulan ini/30/60/90/semua); Terapkan+Reset; badge "Filter · N"; AND dgn member
- [x] **TASK 6 (list view)** — full setelah fix; member+filter+sort+value lewat filteredDeals/sortDeals di kedua view
- [x] **Header "X prospect aktif"** dari filteredDeals (excl won/lost) — konsisten saat filter aktif (disepakati)
- [x] **Build clean** — 2633 modules, 1.17s
- [ ] **Tes manual (belum — runtime):** toggle list→klik baris buka detail (bukan crash) · nilai kartu+total Rp setelah estimated_value diisi · member filter → board hanya deal-nya · sort Nilai Tertinggi → urutan berubah · Filter panel + badge angka · kombinasi member+filter+sort di board & list

### Org chart — warna node level-based (Phase 2.9U)
> `OrgStructurePage.jsx` saja. Node accent dari entity-based → level-based; badge entitas tetap entity-based.
- [x] `LEVEL_COLOR` map + `levelColorOf(level)` — Director #9B1C1C / Manager #166534 / Supervisor #4338CA / Staff #1E40AF / Operator #374151 / default #64748B
- [x] **Node** — `lc=levelColorOf(person.positionLevel)` dipakai avatar bg + card border-left + nama color + focus ring (hexA); **badge entitas tetap `ent.color`**
- [x] **Modal head avatar** ikut `lc` (drop `c` unused, `ent` tetap utk label)
- [x] **Fetch** `position:positions(name)` → `(name, level)`; mapping +`positionLevel`
- [x] **Build clean** — 2633 modules, 1.18s
- [x] Catatan: `positions.level` enum tak punya 'Operator'; 'Head' tak ada di mapping task → jatuh ke slate default (sesuai instruksi eksplisit)
- [ ] **Tes manual (belum — runtime):** avatar+border+nama per level (Director merah/Manager hijau/Supervisor indigo/Staff biru) · badge entitas tetap navy/orange/coral · node tanpa level → slate

### Positions — compact group-by-code + edit modal checkbox entitas (Phase 2.9T)
> `PositionsPage.jsx` saja (rewrite). Tanpa ubah `usePositions.js`/DB/file lain. Tabel lama 1 baris per (company,code) → "Manager" 3×.
- [x] **TASK 1 (compact list)** — fetch lokal `positions` `.eq('is_active',true).is('deleted_at',null).order('name').limit(1000)` (ganti usePositions paginated); group by `code` → 1 baris/code: Code badge · Name · LevelBadge · entity pills inline (MSI navy/JCI orange/SOA coral; absent=abu dim) · Status ACTIVE(3 entitas)/PARTIAL · Edit. Department dihapus, pagination dihapus, search client-side
- [x] **TASK 2 (edit modal, reuse AdminFormModal)** — Code (read-only edit / editable create) · Name · Level dropdown · 3 EntityCheckbox pre-checked sesuai row aktif
- [x] **Save (supabase.from langsung, BUKAN hook updatePosition yg null-kan department_id)** — pre-check existing rows lintas-3-entitas (incl inactive/deleted): dicentang+ada→UPDATE name/level/is_active=true/deleted_at=null (reactivate, hindari langgar UNIQUE(company_id,code)); dicentang+tak ada→INSERT; uncentang+aktif→UPDATE is_active=false (soft delete flag, bukan hard delete). Error→toast asli; sukses→toast+refetch
- [x] **Create dipertahankan** — "New Position" → modal create-mode (code editable, wajib ≥1 entitas)
- [x] **Build clean** — 2633 modules, 1.22s
- [x] **RLS caveat dicatat** — positions_read/insert/update scope non-super ke company sendiri → cross-entity view+save fully functional utk super_admin; admin biasa 1 badge & write lintas-entitas error RLS (ter-surface toast); tak nambah role-gating
- [ ] **Tes manual (belum — runtime):** Manager 1 baris badge MSI+JCI+SOA · edit pre-checked benar · uncheck→save→inactive & hilang dari badge · recheck→save→reactivate (bukan duplicate) · edit name/level→semua entitas ke-update · create code baru

### Struktur Organisasi (Org Chart) — port Lovable + Supabase (Phase 2.9S)
> File baru `src/modules/foundation/OrgStructurePage.jsx`. Modul Foundation (AdminShell). Tanpa ubah DB (kolom `profiles.reports_to` sudah ada).
- [x] **Import desain** — paste manual (Option A); MCP `claude_design`/DesignSync tak bisa auth di sesi token-pinned (`CLAUDE_CODE_OAUTH_TOKEN` tak bisa di-grant design scopes, `/design-login`/`/login` tak tersedia)
- [x] **Data (ganti dummy)** — `profiles` `.eq('active', true)` (TAK ada `deleted_at`) + embed `position:positions(name)` (FK `fk_profiles_position_id`) + `department:departments(name)` + `reports_to` + `company_id`; `.order('full_name').limit(1000)`
- [x] **company_id dari user_roles** — query terpisah (`user_roles.user_id→auth.users`, tak bisa embed dari profiles): `is_active=true`, `revoked_at IS NULL`, `order granted_at`, ambil pertama; **fallback `profiles.company_id`** kalau role aktif tak terlihat (RLS)
- [x] **Warna node by company_id** — MSI navy #144682 / JCI orange #E85A1E / SOA coral #F08C7D (badge+avatar+border-left+focus ring); unknown→abu fallback
- [x] **Edit modal "Atur Atasan"** — `update({ reports_to: value }).eq('id', nodeId)`, null=root; cycle-guard (exclude self+descendants); async save + saving/saveError + re-fetch tree setelah sukses
- [x] **Adaptasi shell** — `height:100vh`→`calc(100vh-120px)` card (AdminShell normal-flow); chart `overflow:auto`; loading/error+retry/empty/no-root states
- [x] **Brand/ikon** — company colors persis brand; Lucide `X`/`Search` (ganti glyph `×` + inline SVG); select chevron CSS data-URI (bukan emoji); no dark green; CSS connector scoped `.ocp`
- [x] **Sidebar** — AdminShell import `GitBranch`+`OrgStructurePage`; nav `org-structure` "Struktur Organisasi" SETELAH Positions (section Organization); PAGE_MAP ErrorBoundary
- [x] **Build clean** — 2633 modules, 1.21s
- [ ] **Tes manual (belum — runtime):** tree dari data nyata · warna per entitas benar · search dim/highlight · klik node → modal → ganti atasan → save → re-fetch & re-parent · set "tanpa atasan" → jadi root · cek RLS: non-super admin mungkin lihat "—" untuk position/department lintas-entitas (idealnya super_admin)

### Quotation mobile fix — list scroll horizontal + box tabel item muat konten (Phase 2.9R)
> MURNI mobile styling (`@media max-width:1023px`, desktop pixel-identik). 2 file. Tanpa DB/perhitungan/alignment/header-coral.
- [x] **TASK 1 (QuotationListPage)** — tabel di card `overflow:hidden` ke-clip di mobile (kolom Service tak terjangkau). Tambah `<style>` in-component `@media(max-width:1023px){ .q-list-table{ min-width:920px } }` + bungkus `<table>` dgn `<div overflowX:auto>` + className. Desktop `width:100%` + media mobile-only → identik
- [x] **TASK 2 (QuotationFormPage SectionCard)** — UNIT LABEL & QTY desimal ke-clip karena squeeze. `<style>` existing +blok `@media(max-width:1023px)`: `.q-item-table{min-width:800px}` (tak squeeze → wrapper overflowX:auto [sudah ada] scroll), `.q-unit-select{appearance:none +min-width:116px}` (panah dropdown hilang HANYA mobile, reclaim ruang, tetap tappable), `.qty-input{min-width:54px}` ("4,1" muat). className `q-item-table` ke table, `q-unit-select` ke select unit (qty input sudah `qty-input`)
- [x] Semua min-width ≤ lebar kolom desktop + media mobile-only → desktop tak berubah (full-width 2.9Q, alignment, header coral, panah unit desktop tetap)
- [x] **Build clean** — 2632 modules, 1.19s
- [ ] **Tes manual (belum — runtime mobile):** list geser samping → Service kebaca penuh · form "Per CBM"/"Per Shipment" muat + qty "4,1" lengkap + panah unit hilang + tabel scroll horizontal · desktop tak berubah

### Quotation line item — full-width tabel (form) + alignment konsisten + header coral (Phase 2.9Q)
> MURNI layout/styling, 2 file (QuotationFormPage + QuotationDetailPage). Tanpa DB/RPC/perhitungan.
- [x] **TASK 1 (full-width, FORM saja)** — `.nx-stack` 1-baris (kiri 60% header+sections+summary 40%) → **2 baris**: Baris 1 `.nx-stack` (header card 60% + summary 40% sticky, tak berubah); Baris 2 baru full-width = `sections.map(SectionCard)` + tombol Tambah Section. Responsive: `.nx-stack` collapse <1024px (index.css:44), Baris 2 stack di bawah pada mobile; drawer/sidebar/`flex-col lg:flex-row` tak disentuh
- [x] **Tradeoff (disepakati "two-row, summary on top")** — summary sticky kini di Baris 1 → scroll lewat saat dalam tabel; tiap SectionCard tetap punya "Section total", grand total di atas
- [x] **TASK 2 (alignment, kedua file on-screen)** — Description=left · Cost=right · Currency=center · Sell=right · Unit=center · Qty=center · Total=right (header ikut isi). Form: qty input right→center, select currency/unit +center; Detail: header cost→right, currency/unit header+cell→center
- [x] **TASK 3 (header coral, kedua file on-screen)** — baris header `background:#F08C7D` + teks `color:#144682` navy (kontras, bukan cream/putih). Bar judul section cream TIDAK diubah
- [x] **PDF `#quotation-print-area` TIDAK disentuh** (opsi "on-screen only"; dokumen customer tetap brand navy, tak ada kolom Cost Price)
- [x] **Build clean** — 2632 modules, 1.22s
- [ ] **Tes manual (belum — runtime):** form tabel full-width di desktop + rapih di mobile (layar kecil) · alignment sesuai spec, header sejajar isi, sama di form+detail · header coral+navy kebaca · angka/total tak berubah (cuma posisi)

## 2026-06-18

### Quotation save hardening — RPC atomik + internal/per-item notes + quote_date (Phase 2.9O)
> Prasyarat DB (SQL Editor, BELUM di snapshot): `quotations.internal_notes`/`quote_date`, RPC `save_quotation(p_quotation_id,p_header,p_items)` atomik, RLS `quotation_items` fix.
- [x] **QuotationDetailPage** — detail select +`inquiry_id,prospect_id,customer_id,internal_notes,quote_date,currency_code,margin_floor` (wajib biar form edit punya nilai real); blok "Catatan Internal (Sales)" on-screen `no-print` + TIDAK di `#quotation-print-area` (tak ke PDF customer); "Kirim ke Customer" +`.select('id')`+cek row → error asli
- [x] **QuotationFormPage TASK 1 (edit)** — update→delete→insert diganti 1 `rpc('save_quotation')`; `rpcError`→pesan asli (no fake success). `p_header` lengkap; **inquiry_id/prospect_id/customer_id ikut** (dulu ketinggalan), prospect/customer fallback ke prop kalau inquiry tak diganti; **internal_notes/currency_code/margin_floor dibaca dari prop real** (bukan default '' /0/'IDR' → cegah wipe). `p_items`=baseItemRows tanpa quotation_id
- [x] **TASK 2 (create)** — tetap insert +`.select('id').single()`+guard `!quot?.id`→error asli; items +quotation_id; payload +quote_date/internal_notes
- [x] **TASK 3 quote_date** — ganti field-hantu `tanggal` (load `quote_date||created_at`, bind setH('quote_date'), masuk payload) → tanggal kini kesimpen
- [x] **TASK 4 internal_notes** — textarea "Catatan Internal (Sales)" di form; sales-only (no-print, bukan di print-area)
- [x] **TASK 5 per-item notes** — input baris-expand (`<Fragment>`+`<tr colSpan=8>` di bawah item, bukan kolom ke-9 → tabel tak melebar); kebawa ke p_items; tetap customer-facing (PDF)
- [x] **Build clean** — 2632 modules, 1.18s; lint net-zero (QuotationFormPage 4→4, QuotationDetailPage 1→1, baseline)
- [ ] **Tes manual (belum — runtime):** edit semua header (tanggal/ganti inquiry/internal notes) → reload SEMUA kesimpen · edit item +per-item notes → kesimpen · internal notes di form+detail TAPI tidak di PDF · per-item notes di PDF · non-owner edit quotation orang lain → ERROR ASLI (bukan sukses palsu) · Kirim ke Customer gagal → error asli
- [ ] **Refresh schema_snapshot.sql** (kolom internal_notes/quote_date + RPC save_quotation belum ter-pull)

### Unified feed — sumber ke-5: login (user_login_logs) (Phase 2.9M)
> Tabel `user_login_logs` BARU (belum di schema_snapshot; RLS gating manager+/super/own).
- [x] **activityFeed.js** — fetch ke-5 `user_login_logs.select('*').order('logged_in_at',desc).limit(1000)` TANPA filter company/owner (andelin RLS, tak ada kolom company_id). Event `{type:'login', title:'Login', subtitle:nama user, icon:'LogIn'}`; subtitle dari nameMap (`||'Pengguna'`); user_id login ikut nameMap. `FEED_ACT_LABEL`/`FEED_ACT_ICON` +login
- [x] **ActivityLogPage.jsx** — filter tipe +opsi "Login"; ICONS +LogIn; TYPE_TONE.login slate (no dark green)
- [x] **CRMDashboardPage.jsx** — widget pakai feed sama → login auto top-7; ICONS registry +SVG `login` + ACT_META.login (slate) biar tak fallback info
- [x] **Build clean** — 2632 modules, 1.14s; lint net-zero (activityFeed 0, ActivityLogPage 3→3, CRMDashboard 8→8). Login `select('*')` no embed → tak 400
- [x] Scoping note (FYI bukan bug): widget dashboard sumber login andelin RLS → super_admin lihat login semua entitas (minor, hanya super; tak dipaksa single-entity)
- [ ] **Tes manual (belum — runtime):** Activity Log filter "Login" → event login muncul (min. punya sendiri) · feed campuran login interleaved · dashboard Recent Activity login nongol kalau terbaru · login sebagai sales → cuma login sendiri (RLS) · fetch user_login_logs tak 400

### Unified activity feed + Activity Log page + Recent Activity widget (Phase 2.9L)
> Shared feed (4 tabel) dipakai halaman Activity Log baru + widget dashboard. DB read-only.
- [x] **`activityFeed.js` (BARU, shared)** — `fetchActivityFeed({companyId,uid,isAllEntities,isSalesOnly})`: merge accounts(prospect)/inquiries/quotations/activities → events `{id,timestamp,type,actType,title,subtitle,user_id,user_name,icon}`, sort desc. Role-aware scoping (company always kecuali super; sales own via created_by/assigned_to). Nama user via nameMap profiles. `.limit(1000)`/sumber. Helper feedTimeAgo/feedFmtDate
- [x] **Embed FK names diverifikasi vs schema** (byte-identik dgn list page live): `inquiries_prospect_id_fkey`, `inquiries_customer_id_fkey`, `quotations_prospect_id_fkey`, `quotations_customer_id_fkey`, `activities_account_id_fkey` — semua prefix tabel sendiri, BUKAN legacy `prospects_*`/`customers_*`. Build clean → tak 400
- [x] **`ActivityLogPage.jsx` (BARU)** — feed penuh, newest-first (icon Lucide + title + subtitle + user + relatif+tanggal). Filter tipe + tanggal (today/this_week/this_month/custom); manager+ dropdown sales (fetchSalesProfiles RBAC), sales own-only. Pagination 25. `isAllEntities=super_admin`
- [x] **App.jsx** — lucide +History; menu `crm-activity-log` "Activity Log" PERSIS setelah Activities di grup CRM (item lain tak disentuh, TIDAK di MENU_KEY_MAP spt crm-calls); lazy import + route block
- [x] **CRMDashboardPage (Task 3)** — `recentActivity` pakai unified feed top-7 (ganti prospects-only); widget dashboard SELALU single-entity (`isAllEntities:false`, termasuk super_admin); ACT_META +`activity`; subtitle → "Prospect, inquiry, quotation & aktivitas terbaru". Render tak berubah
- [x] **Build clean** — 2632 modules, 1.33s; lint net-zero (activityFeed 0, ActivityLogPage 3 baseline, CRMDashboard 8→8, App 4→4)
- [ ] **Tes manual (belum — runtime):** menu Activity Log muncul di bawah Activities → halaman kebuka · feed campuran (prospect+inquiry+quotation+activity), terbaru di atas · filter tipe/tanggal jalan, manager filter sales, sales own-only · dashboard Recent Activity campuran (bukan cuma "Prospect baru") · login sales → feed own-only

### ActivitiesPage — tipe final (6) + convert-to-prospect aksi list + delete list (Phase 2.9K)
- [x] **Tipe (6):** TYPE_META/TYPE_FORM hapus `prospecting` → call(biru)/whatsapp(hijau)/visit(ungu)/meeting(navy)/email(amber)/followup(slate), no dark green. `activities.type` tanpa CHECK → aman tanpa ubah DB. Field kondisional: contact utk call|whatsapp, location utk visit|meeting, email/followup notes saja. **Field `prospect_name` dihapus dari form** (input/EMPTY_TASK/actToDraft/payload); legacy read dipertahankan
- [x] **Hapus flow prospecting dari centang:** handleCheck tak lagi `setConfirmProspect` saat type prospecting → centang selesai tak munculkan popup
- [x] **Convert-to-Prospect = aksi LIST:** icon UserPlus di kolom Aksi, muncul jika `!row.account_id` → ConfirmModal "Jadikan Prospek?" (reuse confirmProspect, wording baru) → openProspectFromActivity prefill `{name:contact_name, pic_name:contact_name, pic_phone:contact_phone}`. Activity tak berubah saat convert
- [x] **Delete LIST (super_admin):** icon Trash2 danger di kolom Aksi, muncul jika `erpRole==='super_admin'` (status apapun) → reuse deleteConfirm + ConfirmModal danger (2.9I) → handleDeleteActivity soft delete. Footer modal Hapus tetap ada
- [x] **Build clean** — 2630 modules, 1.16s; lint 5→5 (net-zero baseline)
- [ ] **DB migrasi (BELUM — manual):** `SELECT count(*) FROM activities WHERE type='prospecting';` lalu `UPDATE activities SET type='whatsapp'|'followup' WHERE type='prospecting';` (pilih satu). Detail di CLAUDE.md Phase 2.9K
- [ ] **Tes manual (belum — runtime):** form tipe = 6 baru (no prospecting) · call/whatsapp→contact, visit/meeting→location, email/followup→notes · list tanpa account → Convert muncul, dengan account → tidak · Convert → form prospek prefilled dari contact · centang → tak ada popup prospek · super_admin → icon Hapus tiap row, role lain tak ada · Hapus list → konfirmasi → soft delete

### ActivitiesPage — footer modal gate per-tombol (Phase 2.9J)
> Fix: tombol Hapus (super_admin) & Edit/Batalkan tertutup gate `status==='todo'` tunggal → dipisah per tombol.
- [x] Wrapper footer view-mode: `{act.status === 'todo' && …}` → `{(act.status === 'todo' || isSuperAdmin) && …}` (render hanya jika ada ≥1 tombol visible → no empty bar)
- [x] Gate per tombol: **Tandai Selesai** = `status==='todo'`; **Batalkan Aktivitas** = `status==='todo' && canEdit`; **Hapus** = `isSuperAdmin` (apapun status, paling kiri)
- [x] Handler (handleCheck/handleCancelActivity/handleDeleteActivity) tidak diubah. Build clean — 2630 modules, 1.13s; lint 5→5 (net-zero)
- [ ] **Tes manual (belum — runtime):** todo → Tandai Selesai (+Batalkan jk canEdit) · done+super_admin → tombol Hapus muncul (tanpa Tandai/Batalkan) · done+non-super → footer tak render (no empty bar) · klik Hapus di done → konfirmasi → soft delete

### ActivitiesPage — delete (super_admin) + fix popup "Buat Prospek?" (Phase 2.9I)
- [x] **Delete activity (super_admin)** — tombol "Hapus" (outline danger, paling kiri) di footer view-mode modal, muncul hanya jika `isSuperAdmin`. `handleDeleteActivity` = soft delete (`deleted_at=now()`) + toast + setDetail(null) + setDeleteConfirm(null) + fetchActivities(). Flow: Hapus → tutup modal + `ConfirmModal` variant=danger "Hapus Aktivitas?" → confirm → soft delete. Role non-super: tombol tak muncul
- [x] **Fix popup "Buat Prospek?"** — `handleCheck` urutan: UPDATE → fetchActivities() → setConfirmProspect(row) → setDetail(null) TERAKHIR (sebelumnya setConfirmProspect sebelum fetch/setDetail). ConfirmModal prospek `open={!!confirmProspect}` dikonfirmasi benar. Popup kini muncul saat "Tandai Selesai" prospecting dari modal
- [x] **Build clean** — 2630 modules, 1.22s; lint ActivitiesPage 5→5 (net-zero baseline)
- [ ] **Tes manual (belum — runtime):** super_admin buka modal → tombol Hapus → konfirmasi danger → soft delete, list refresh · role lain → Hapus tak muncul · prospecting + Tandai Selesai dari modal → popup "Buat Prospek?" muncul → [Ya] → form prospek prefilled

### ActivitiesPage — aksi dari dalam modal: Tandai Selesai + Batalkan (Phase 2.9H)
> Footer button bar di ActivityDetailModal view mode, muncul hanya saat status='todo'.
- [x] **Tombol "Tandai Selesai"** (primary navy, icon Check) → `handleCheck(detail)` (reuse — handle prospecting `setConfirmProspect` + mark done); muncul saat status todo (tanpa gate canEdit, konsisten centang list row)
- [x] **Tombol "Batalkan Aktivitas"** (outline danger) → `handleCancelActivity(id)`: UPDATE status='cancelled' + toast + setDetail(null) + fetchActivities(); muncul saat `status==='todo' && canEdit`
- [x] **handleCheck** +`setDetail(null)` setelah fetchActivities() (unconditional, no-op dari list row → modal auto-tutup setelah mark-done; popup "Buat Prospek?" tetap muncul utk prospecting krn state terpisah)
- [x] Modal signature +2 prop (onCancel, onMarkDone), mount di-wire `detail && handleCheck/handleCancelActivity`. Status done/cancelled → kedua tombol tak muncul
- [x] **Build clean** — 2630 modules, 1.07s; lint ActivitiesPage 5→5 (net-zero baseline)
- [ ] **Tes manual (belum — runtime):** modal todo → 2 tombol muncul · Tandai Selesai biasa → modal tutup, done di list · Tandai Selesai prospecting → popup "Buat Prospek?" · Batalkan → modal tutup, cancelled di list · modal done/cancelled → tombol tak muncul

### Activity module Phase 2C — edit + history tab + daily report (Phase 2.9G)
> Edit activity (3B), tab Aktivitas di CustomerDetail (3C), daily activity report di Dashboard (3D). DB tidak diubah.
- [x] **ActivitiesPage.jsx — edit mode di ActivityDetailModal** (bukan modal baru): tombol Edit (view mode, muncul jika `canEdit`) → form inline. `canEdit = isManagerOrAbove || assigned_to===self`; `isManagerOrAbove` incl. `sales_head` (selaras `is_manager_or_above()` DB). Field: type/tanggal/waktu/sales/account/prospect_name/contact/outcome/notes/next_action+date/location. Status TIDAK via form. `handleEditSave` UPDATE (tanpa status/company_id/created_by); **details merge-preserve** (tak hapus call_type/visit_type/mom)
- [x] **CustomerDetailPage.jsx — tab "Aktivitas"** setelah 'visit': fetch semua tipe (account_id, tanpa filter type), tabel Tanggal/Tipe/Status/Sales/Catatan-Outcome, badge copy ACT_TYPE_META/ACT_STATUS_META, count badge. Tab 'visit' tak diubah
- [x] **CRMDashboardPage.jsx — tab "Aktivitas"** (DASH_TABS ketiga, icon activity): `ActivityReportTab` role-aware. SALES → ringkasan hari ini (todo/done + done per tipe) + detail (filter tanggal). MANAGER+ → ringkasan per-sales hari ini (Todo/Done/per-tipe) + filter sales (fetchSalesProfiles RBAC) + filter tanggal + detail (+kolom Sales). Fetch company-scoped, assigned_to=uid jika sales. Tab Overview/Calendar tak diubah
- [x] **Build clean** — 2630 modules, 1.18s; 3 chunk rebuilt. Lint net +1 set-state-in-effect per file (baseline); "Cannot create components" CRMDashboard pre-existing (line shift, bukan dari edit ini)
- [ ] **Tes manual (belum — runtime):** edit activity (klik row→Edit→ubah→simpan→refresh) · sales hanya bisa edit milik sendiri (tombol Edit tak muncul kalau bukan owner/manager) · tab Aktivitas CustomerDetail (semua tipe muncul) · Dashboard Aktivitas login sales (ringkasan+detail diri) · login manager (summary per-sales + filter sales + detail)

### CRM role-scoping hardening (Phase 2.9F — hasil audit role akses)
> Tutup celah defense-in-depth + selaraskan frontend dgn RLS. Tampilan/fitur tidak diubah.
- [x] **LeadPoolPage.jsx frontend belt** — sebelumnya fetch `lead_pool` tanpa `company_id`/owner filter (sole guard = RLS). Tambah pola ProspectListPage: `isAllEntities=['super_admin']` + `isSalesOnly=['sales','operations']`; guard profile.id/company_id; `if(!isAllEntities) .eq('company_id')` + `if(isSalesOnly) .or('assigned_to.eq.{uid},created_by.eq.{uid}')`; deps effect diperbarui. Sales kini cuma lihat leads milik sendiri
- [x] **Admin role alignment** — `isAllEntities` `['super_admin','admin']`→`['super_admin']` di 7 file CRM (Prospect/Inquiry/Quotation/PipelineKanban/Activities/SalesCalls/LeadPool). Admin tadinya intent all-entities tapi RLS batasi own-entity (silent mismatch) → kini frontend single-entity utk admin, konsisten RLS. super_admin tetap lintas entitas
- [x] **Build clean** — 2630 modules, 1.07s; grep verifikasi 7/7 file `isAllEntities=['super_admin']`, 0 sisa `'admin'`. Lint LeadPool 2 set-state-in-effect (baseline)
- [ ] **Tes manual (belum — runtime):** login sales → LeadPool cuma leads sendiri · login admin → data CRM tetap jalan (single-entity, tak hilang) · login super_admin → data tetap lintas entitas

### Activity module Phase 2B — ActivitiesPage gantikan SalesCallsPage (Phase 2.9E)
> Halaman aktivitas terpadu (semua tipe) di route `crm-calls`. SalesCallsPage tidak dihapus.
- [x] **`src/modules/crm/ActivitiesPage.jsx` (BARU)** — list semua activity (call/visit/meeting/prospecting/followup) dari `activities`, role-aware (sales→assigned_to/created_by, manager+→se-entitas, super/admin→semua), embed account name + nama sales via client map. Kolom: Tanggal/Tipe/Status/Customer-Prospek/Sales/Catatan-Outcome/Aksi. Visual mirror SalesCallsPage (tokens C, pagination 20)
- [x] **Filter bar** — tipe, status (todo/done/cancelled), tanggal (hari ini/minggu ini/bulan ini/custom/semua), sales dropdown (RBAC `fetchSalesProfiles` sales-only)
- [x] **Tambah Task modal** — wajib: tipe+tanggal+salesperson; kondisional per tipe (call/prospecting→contact; prospecting→prospect_name; visit/meeting→location→details.location); notes/next_action/next_action_date/account_id opsional; `status='todo'` default
- [x] **Centang selesai** — todo row → `status='done'`+`completed_at`; `type='prospecting'` → ConfirmModal "Buat Prospek?" [Ya]→ProspectFormPage CREATE prefilled {name,pic_name,pic_phone} (pola PipelineKanban: setActiveMenu+setShowProspectForm+setEditingProspect), [Nanti saja]→mark done saja
- [x] **Badge** — status todo(abu outline)/done(hijau)/cancelled(merah outline); tipe call(biru)/visit(ungu)/meeting(navy)/prospecting(orange)/followup(amber). No emoji, brand MSI
- [x] **Option A — ProspectFormPage.jsx tweak** — `isEdit = !!prospect` → `!!prospect?.id` (prefill object tanpa id = CREATE, handleSave tetap INSERT) + effect seed name/pic_name/pic_phone dari prefill
- [x] **App.jsx** — lazy import ActivitiesPage; menu `crm-calls` label→'Activities' icon `PhoneCall`→`Activity` (PhoneCall dihapus dari import krn unused); route render → ActivitiesPage + 3 props; menu key `crm-calls` TIDAK diubah; SalesCallsPage import dibiarkan (per instruksi, 1 lint unused-var diterima)
- [x] **Build clean** — 2630 modules, 1.00s; chunk `ActivitiesPage` ter-emit (code-split). Lint baseline-category (set-state-in-effect/memoization-skip, sama pola SalesCallsPage)
- [ ] **Tes manual (belum dijalankan — runtime):** buka menu Activities (list muncul/kosong OK) · filter tipe/status/tanggal/sales · Tambah Task (field kondisional muncul per tipe) · simpan → status todo · centang biasa → done · centang prospecting → popup konfirmasi · login sales → cuma lihat task sendiri

## 2026-06-17

### Activity cutover Phase 2A — frontend call/visit → `activities`/`activity_logs` (Phase 2.9D)
> Cutover **data-layer only** — tampilan/UX tidak berubah. Setelah ini TIDAK ada kode menyentuh `sales_calls`/`sales_visits`/`sales_visit_logs`. Plan: `ACTIVITY_UI_MAP.md`.
- [x] **SalesCallsPage.jsx** — CRUD call → `activities` (type='call', status='done'). Read remap activities→bentuk call lama (UI tak diubah); write payload + `details jsonb` (call_type/duration_minutes/bant_collected); account name embed `accounts!activities_account_id_fkey`
- [x] **CRMDashboardPage.jsx** — kalender visit + 2 KPI mingguan (call/visit) read → `activities`; `handleSaveVisit` write → `activities` (type='visit', `details` visit_type/location/point_of_meeting/mom, `follow_up`→`next_action`); log write + VisitDetailModal timeline read → `activity_logs` (`activity_id`); `ownBySales` pakai `assigned_to`
- [x] **CustomerDetailPage.jsx** — History Visit + Health Score read → `activities` `.eq('account_id',id).eq('type','visit')` (**visit only**, call tidak digabung — keputusan disetujui)
- [x] **Mapping status** scheduled/completed/cancelled ⇄ todo/done/cancelled (`VISIT_TO_ACT_STATUS`/`ACT_TO_VISIT_STATUS`); `activity_logs` simpan vocab visit agar konsisten dgn data migrasi + lookup `VISIT_STATUS`
- [x] **Nama sales/log-author via client-side map** — `activities.assigned_to` & `activity_logs.changed_by` tak punya FK ke `profiles` (DB tak diubah) → fetch profiles by id (TANPA filter active, biar sales nonaktif/lama tetap kebaca) & map di JS. Account name tetap embed (FK ada)
- [x] **Fix #3 dropdown sales** — helper `fetchSalesProfiles(companyId)` (RBAC: `roles.code='sales'` per-company → `user_roles` is_active+revoked_at IS NULL+company_id → profiles active), **tanpa hardcode role_id**; ganti query bocor CRMDashboard (tanpa company filter) + konsistenkan SalesCallsPage. Default salesperson = user login dibiarkan
- [x] **Verifikasi:** `grep sales_calls|sales_visits|sales_visit_logs` di `src/` = **0 di luar `*.legacy`**; `npm run build` clean (**2629 modules, 886ms**)
- [ ] **Checklist tes manual (belum dijalankan — runtime):** log call baru muncul di list · tambah visit dari kalender → muncul di kalender+detail+timeline · detail customer tampil history visit · login sales → dropdown cuma sales se-entitas · KPI call/visit wajar
- [ ] **(Backlog) drop `sales_calls`/`sales_visits`/`sales_visit_logs`** setelah tes manual lolos (masih DORMANT)

### DB Changes via SQL Editor (Phase 2.9B/2.9C — dokumentasi, sudah masuk schema_snapshot.sql refresh: 71 tabel, ~8.395 baris)
> Tidak ada kode/DB diubah dari sesi dokumentasi ini. Detail lengkap: CLAUDE.md section **DB Changes via SQL Editor — 17 Jun 2026** + audit `CRM_FLOW.md` & `ACTIVITY_UI_MAP.md`.
- [x] **(2.9B) WON → customer (fix konversi).** Masalah: deal `pipeline_stage='WON'` tidak selalu jadi `account_status='customer'` — cuma jalur drag+`WinLossModal` yang konversi; form-edit ([ProspectFormPage.jsx:320-323](src/modules/crm/ProspectFormPage.jsx#L320)) & import TIDAK (gejala: TOKO DAMRAH, `created_by` null = jejak import). Fix: (1) backfill record WON yang masih `prospect`; (2) trigger `trg_set_customer_on_won` (function `set_customer_on_won`, `BEFORE INSERT OR UPDATE ON accounts`) set `account_status='customer'` + `became_customer_at`/`converted_at` saat `pipeline_stage='WON'`. **Menutup SEMUA jalur → DB jadi sumber kebenaran tunggal**; frontend `WinLossModal` jadi redundan (dibiarkan, tak dicabut)
- [x] **(2.9B) Tabel `public.activities` (Phase 1 modul Activity/Task).** Tabel baru yang menyatukan & akan menggantikan `sales_calls`+`sales_visits`: multi-tipe (`type` call/visit/meeting/prospecting/followup), `status` todo/done/cancelled, anchor `account_id`/`inquiry_id`/`quotation_id` (FK lengkap → menjawab titik-putus `CRM_FLOW.md`), `details jsonb` per-tipe, `migrated_from`, RLS role-aware niru `accounts`, 6 index. Data lama dimigrasi (0 calls + 2 visits)
- [x] **(2.9C) Tabel `public.activity_logs` (audit log status untuk `activities`).** Kolom: `activity_id` → activities(id) **ON DELETE CASCADE**, `changed_by`, `changed_at`, `from_status`, `to_status`, `notes`; 1 index (`activity_id`); **RLS scope via parent activity** (`EXISTS` ke `activities`, bukan `company_id` langsung). **Menggantikan `sales_visit_logs`**; data lama dimigrasi (2 log)
- [ ] **(Backlog) repoint frontend call/visit/log → `activities`/`activity_logs`:** `SalesCallsPage.jsx` + `CRMDashboardPage` AddVisitModal/VisitDetailModal/fetch masih pakai tabel lama (`sales_calls`/`sales_visits`/`sales_visit_logs`). Inventory UI: `ACTIVITY_UI_MAP.md`
- [ ] **(Backlog) drop `sales_calls` + `sales_visits` + `sales_visit_logs`** — HANYA setelah frontend dipindah & diverifikasi (saat ini DORMANT, jangan drop dulu)

### DB Schema Snapshot
- [x] `pg_dump --schema-only --schema=public` → `supabase/schema_snapshot.sql` (**69 tabel, ~8.140 baris**); pakai `pg_dump` (libpq), BUKAN `supabase db pull` (Docker tak terinstall). Menangkap semua perubahan SQL-Editor (4 kolom `assets`, `accounts` unified, RBAC 6 tabel, dll)
- [x] Roadmap 🔴 "schema ke version control" = **DONE**; cara refresh + instruksi "baca snapshot, bukan migrasi" dicatat di section **DB Schema Reference** (CLAUDE.md)

### Mobile Responsive Overhaul (Phase 2.8S–2.8X)
> Prinsip: SEMUA perilaku mobile di-gate breakpoint (`@media max-width:1023px` / Tailwind `lg:`) → **desktop ≥1024px tidak berubah sama sekali**.
- [x] **2.8S** — Fix layout BLANK di mobile: container utama `flex min-h-screen` → `flex flex-col lg:flex-row` (flex-row bikin mobile topbar ke-stretch ~2389px menutupi konten). App.jsx
- [x] **2.8T** — Responsive grids semua halaman utama: util opt-in di `index.css` (`.nx-grid-kpi`/`.nx-grid-3`/`.nx-grid-2`/`.nx-page-pad`/`.nx-stack`) aktif HANYA `@media(max-width:1023px)` + `!important` → desktop ≥1024 pixel-identik (inline style menang). Diterapkan: CRM/Inventory Dashboard, Asset (IT/detail/dashboard), Logistics (InputSP/SalesOrderDetail), Quotation detail/form (`nx-stack`), Finance Defaults. Tabel lebar pakai `overflow-x-auto`
- [x] **2.8U** — Navigasi mobile: hamburger drawer + App Launcher. `ModuleSidebar` prop `asDrawer`/`isOpen`/`onClose` (reuse, DRY); desktop sidebar static (`hidden lg:flex`), mobile drawer slide-in + overlay; hamburger (lucide `Menu`) muncul saat in-module; nav pills flat dihapus; App Launcher kini tampil di mobile; state `mobileDrawerOpen`. App.jsx
- [x] **2.8V→2.8W** — Kalender mobile: scroll horizontal (2.8V, sempat dibuat) → **diganti** pola dot + tap-for-detail (2.8W). Mobile <1024px cell mengecil (7 kolom muat tanpa scroll), event jadi DOT PASTEL (sky `#A5C8E8`/teal `#7FD8C4`/peach `#F5C9A8`, maks 3 + "+N"); tap tanggal ber-visit → bottom-sheet detail + Tambah Visit; desktop tetap event-text. Hybrid: visual CSS (`hidden`/`lg:`), tap via `useIsMobile` (matchMedia). `.nx-cal-scroll` dihapus total. CRMDashboardPage.jsx + index.css
- [x] **2.8X** — Recent Activity reflow mobile: timestamp+badge dibungkus `nx-act-meta`, di mobile pindah ke bawah nama (stack, tak overlap); desktop tetap horizontal. CRMDashboardPage.jsx + index.css

### CEO Unblock (Phase 2.8Y — DB change via SQL Editor, BUKAN di repo)
- [x] `profiles_read` di-DROP & dibuat ulang `USING (true)` → semua `authenticated` bisa baca `profiles`; `profiles_update` TIDAK disentuh. Akar masalah: `is_admin_or_above()` tak kenal role `ceo` → CEO ke-block baca nama assignee/sales
- [x] Aman sekarang (`profiles` bukan HRIS, tak ada data sensitif). **⚠️ WAJIB diperketat saat modul HRIS masuk**

### RLS Migration Backlog (planned — BESAR, risiko tinggi, sesi fresh)
- [ ] Migrasi RLS proper (RBAC-driven): ganti cek role hardcode → RBAC granular + entity boundary; prasyarat HRIS
- [ ] Audit 173 policy: ~51 `is_admin_or_above` (target migrasi), 70 `super_admin` (OK), 130 `company_id` (OK); `has_permission()` BROKEN (query tabel `permissions`/`role_permissions` yg tak ada)
- [ ] Cross-entity (`is_cross_entity`) sudah ada strukturnya di `role_permission_templates` & `user_menu_permissions`; rencana 4 fase — detail di CLAUDE.md section **Backlog — Migrasi RLS Proper (RBAC-driven)**

### Console cleanup + empty-catch fix (Phase 2.8Z)
- [x] Hapus 6 `console.log` debug di `AuthContext.jsx` (termasuk yg mem-leak seluruh row profile user) + 3 `console.log` data produk/company di `ProductsPage.jsx`; `console.error`/`console.warn` (error handling beneran) dipertahankan
- [x] `PipelineKanbanPage.jsx` empty `catch (_) {}` (drag `setData`) → `console.warn` + komentar (operasi opsional, non-fatal, tak di-surface); lint `no-empty` + `_` unused hilang (5→3)
- [x] Refresh angka basi CLAUDE.md Roadmap: App.jsx 4.618→4.667, CRMDashboardPage 1.850→1.996 (aktual `wc -l`)

### CRM Batch 1 — fix correctness frontend (Phase 2.9A, hasil AUDIT_CRM.md)
- [x] Nomor dokumen: hapus fallback `Date.now().slice(-4)` di InquiryForm/QuotationForm `generateXNo` → RPC gagal = throw → save dibatalkan + toast error (tak ada nomor non-sekuensial)
- [x] InquiryForm dropdown account tambah `.limit(1000)` (default-10 → account ke-11+ tak kepilih); QuotationList tambah `.is('deleted_at', null)`
- [x] Role-aware visibility (tiru pola ProspectListPage) di InquiryList/QuotationList/SalesCalls — super_admin lihat semua entitas, sales hanya miliknya; sales-own ikut kolom RLS (inquiries/quotations=created_by, sales_calls=salesperson_id/created_by)
- [x] `.single()`→`.maybeSingle()`: QuotationDetail (3×), CustomerDetail (2×), QuotationForm, InquiryForm — aman saat data minim (mis. payment_terms null)
- [x] `catch {}` CustomerDetail/CustomerList → `console.error` + cek error query fallback (tak senyap)
- [ ] (Batch DB terpisah — belum) RLS `inquiries_update` admin-only, UNIQUE accounts (dedup), write quotation atomik

### Backlog (update)
- [ ] Mobile polish — verifikasi visual per-halaman (Inventory/Asset/Logistics/Quotation) di <1024px
- [ ] Warning React "form field value without onChange handler" di input read-only — bersihkan
- [ ] (lanjut) audit CRUD policy lintas tabel · update `assigned_to` 24 laptop · cleanup office Semper · Software/Maintenance inline edit

## 2026-06-16

### Quotation
- [x] Fix PDF quotation (Phase 2.8M): section header dipindah ke `<thead>` sebagai `<tr className="pdf-no-break">` (anti ke-potong antar halaman) + box Notes (border kiri navy `#144682`) & Above rates/Terms (border kiri orange `#E85A1E`)
- [x] Fix RLS `quotations_update` (Phase 2.8Q, DB via SQL Editor): policy lama `is_admin_or_above()` → sales ke-block edit quotation sendiri. Diubah `(company_id=get_user_company_id() AND (is_manager_or_above() OR created_by=auth.uid())) OR is_super_admin()` + `WITH CHECK` sama. Sales kini bisa edit quotation miliknya

### Inventory
- [x] Dashboard Inventory baru (Phase 2.8N): `InventoryDashboardPage.jsx`, accent **TEAL #0D9488** (pembeda dari navy CRM), data Supabase asli (role-aware, company-scoped, `.limit(1000)`, `useWidth` callback ref). KPI: Total SKU, Total Nilai Inventory, Total On-Hand, Stok Menipis (<10). Charts: tren pergerakan (`stock_ledger`), stok per kategori, top 10 by nilai, per gudang
- [x] Fix nilai inventory (Phase 2.8N-fix): `unit_cost` semua NULL → pakai `default_price` (harga jual); subtitle "Berdasarkan harga jual"

### CRM
- [x] Fix visit dropdown (Phase 2.8O, CRMDashboard AddVisitModal): `.eq('account_status','prospect')` → `.in('account_status',['prospect','customer'])` supaya customer (mantan WON spt Indochem) muncul; label "Prospect" → "Prospect / Customer". Query KPI/salesPerf tetap prospect-only

### Asset Management
- [x] Inline edit semua tab `AssetDetailITPage` (Phase 2.8P): tombol Edit global → field Info/Spesifikasi/Network jadi input in-place (bukan modal/route), Save/Cancel, save lintas 3 tabel via UPSERT + error handling per-tabel + refetch tanpa reload. Assigned To = dropdown user (pilih → checked_out, kosong → available). Dropdown bernilai-valid utk field ber-constraint (status/asset_subtype/storage_type/depreciation_method). Health/Software/Maintenance read-only (TODO per-row)
- [x] Aktifkan brand/condition/department_id/assignment_status (Phase 2.8P-fix): keempat kolom ADA di DB (via SQL Editor, belum di migrasi). Edit form + view mode + save; fix `useAssetDetail` select tak ambil `assigned_to_user_id` (dropdown assignee kini pre-fill benar)
- [x] Schema (DB via SQL Editor, Phase 2.8R): `assets` ALTER ADD `condition`/`department_id`(FK departments)/`brand`/`assignment_status`(default 'available')
- [x] Master data (DB via SQL Editor): `asset_locations` "Head Office BSD" (branch_id MSI HO, NOT NULL); `departments` MSI +3 (HCGA/PPJK/CONSOLE); bulk insert **24 laptop MSI** ke `assets`+`asset_specifications`+`asset_network` (assigned_to kosong, assignment_status 'available')

### Catatan / Backlog
- [ ] ⬆️ **`supabase db pull`** NAIK PRIORITAS — 2× jadi penghambat hari ini (4 kolom `assets` + `unit_cost` via SQL Editor tak terlihat di file migrasi → sempat skip field)
- [ ] Audit CRUD policy lintas tabel — pola berulang "UPDATE admin-only" (`quotations_update`) + over-filter `account_status` (dashboard/visit/visibility)
- [ ] Update `assigned_to` 24 laptop MSI setelah re-audit
- [ ] Office "Semper": 2 branch duplikat di JCI (SEMPER + HO SEMP) — office asli MSI Group (hampir salah hapus), perlu dedup + ownership
- [ ] Inline edit tab Software & Lisensi + Maintenance (per-row terpisah, ada TODO)
- [ ] UI list Asset tampilkan field baru (condition/brand/department/assignment_status)

## 2026-06-15

### Security Hardening (milestone)
- [x] Cabut GRANT `anon` di **29 tabel sensitif** — 3 finansial (accounts/quotations/quotation_items) + 26 (finance/RBAC/user/CRM/inventory); RLS tetap lapisan kedua (defense-in-depth, anon ke-block di GRANT DAN RLS); GRANT `authenticated` diverifikasi lengkap sebelum revoke
- [ ] Backlog: tabel kategori REFERENCES/TRIGGER/TRUNCATE-only (companies/payment_terms/assets dll) belum dicabut — tidak urgent (tidak beri akses baca/tulis data)

### Bug Fixes — CRM & Auth (Phase 2.8B–2.8I, kode)
- [x] 2.8B — Form state hilang saat tab-switching (AuthContext Opsi A: `previousUserIdRef`, skip `setLoading` saat same-user re-emit SIGNED_IN/TOKEN_REFRESHED)
- [x] 2.8C — Prospect visibility role-aware (super_admin/admin semua entitas, manager se-entitas, sales own) + badge "Belum di-assign" + auto-assign saat sales create prospect
- [x] 2.8D — Dropdown Assigned To kosong di Edit Prospect (list select tak ikut `assigned_to` UUID; synthetic option utk cross-entity assignee)
- [x] 2.8E — `UNIT_LABELS` quotation jadi 13 (tambah Per CBM/KG/Ton/Container/Shipment/Trip di depan)
- [x] 2.8F — Soft stage gating (PROPOSAL butuh inquiry, WON butuh quotation — konfirmasi via ConfirmModal, bisa di-bypass)
- [x] 2.8G — Dashboard WON/Win Rate/Sales Performance hitung deal WON termasuk yang auto-convert jadi customer (`became_customer_at`); Total Prospects tetap prospect aktif saja
- [x] 2.8H — Chart Prospect Trend kosong → `useWidth` pakai callback ref (terukur saat container mount setelah data load)
- [x] 2.8I — Polish CRM Dashboard: gradient horizontal line (ungu→pink→biru), Bulan Lalu jadi abu, pie Lead Source pastel + fix crop

### Bug Fix — Quotation Duplikat (Phase 2.8J, DB/RLS)
- [x] ROOT CAUSE: RLS policy DELETE hilang di `quotation_items` → `.delete()` "sukses" 0-row tanpa error → insert numpuk → item+total dobel; Solusi: `CREATE POLICY quotation_items_delete` (kode tidak diubah)

### Data Cleanup (Phase 2.8K, DB)
- [x] Indochem dedup: hapus `64ee0492` (customer/NEW kosong), pertahankan `79c3562b` (prospect/WON + inquiry+quotation)
- [x] Indochem → customer (`account_status=customer`, `code=IJL`, `became_customer_at` stamped)
- [x] Konfirmasi auto-convert WON→customer SUDAH ADA di PipelineKanbanPage; Indochem hanya korban timing
- [x] Payment term "Cash Before Delivery" (`CBD`) ditambah ke MSI/JCI/SOA

### Audit Menyeluruh + Roadmap
- [x] Audit aplikasi menyeluruh (arsitektur/keamanan/maintainability/reliability/performance) → section **ROADMAP MENUJU PRODUCTION-GRADE** di CLAUDE.md (3 tier: SEGERA / JANGKA PENDEK / JANGKA PANJANG)

### Status Nggantung
- [ ] Quotation Hisaka (`QUO/MSI/2026/004`) — items di-wipe, total reset 0, **perlu input ulang via UI**
- [ ] Field Registry Level 1 — disepakati, nunggu 4 keputusan desain (struktur metadata, core 2a/2b, custom field JSONB, pilot form Prospect)

## 2026-06-14
### Accounts Unification — Single Master Customer
- [x] Tabel `prospects` → di-rename jadi `accounts` (master customer tunggal); kolom baru: `account_status` (prospect/customer/lost/free_agent/lead_pool), `owner_company_id`, `tier`, `code`, `nomor_kontrak`, `default_dc`, `last_activity_at`, `became_customer_at`
- [x] CRM migrasi penuh ke `accounts` (Batch 1–3): Pipeline/Prospect/Dashboard, Inquiry/Calls/Quotation embeds, Master Customer list+detail — `.eq('account_status', ...)` filter pipeline vs customer
- [x] WON di pipeline → auto-convert `account_status='customer'` + `became_customer_at`
- [x] Customer unification: tabel `customers` → `accounts` (single master); 5 FK di-repoint (sp_items, ar_ttfs, inquiries, quotations, accounts.converted_to); INDOMARCO pindah, id sama; tabel `customers` lama dipensiunkan (tidak dihapus)
- [x] db.js (Storbit SP/AR): listCustomers/upsertCustomer/deleteCustomer → `.from('accounts')`; embed pakai alias `customers:accounts!<constraint>(name)` agar mapper tidak berubah
- [x] CRM InquiryFormPage dropdown → accounts WHERE account_status='customer', simpan ke prospect_id; embed `customer:accounts!*_customer_id_fkey` di Inquiry/Quotation

### Master Customer — Sub-menu per Entitas + Detail Page
- [x] Master Customer 4 sub-menu per entitas: MSI / JCI / SOA / Free Agent (entityFilter)
- [x] CustomerListPage + CustomerDetailPage (dedicated page, state-swap mirror AssetDetailPage); CustomerFormModal named export untuk reuse
- [x] CustomerDetailPage: 6 tab (Info Dasar, Komersial, History Visit, BANT & Pipeline, Health Score, Notes); visual port dari Lovable handoff
- [x] Health Score tab — heuristik dari sinyal real (engagement visit, BANT, pipeline stage, kelengkapan profil, status kontrak); gauge SVG + breakdown; banner "skor sementara"

### User Access Management
- [x] Edge Functions baru: `delete-user` (gate super_admin, blokir hapus akun sendiri) + `reset-password` (min 8 char); pola two-client (caller ANON + admin SERVICE_ROLE)
- [x] Edit User: modal → full page (UserEditPage, state-swap); tab Profile/Permissions; Hapus User + Ubah Password (super_admin only, self-protection)
- [x] Avatar upload — bucket Storage `avatars`, kolom `profiles.avatar_url`, validasi tipe+2MB, overlay kamera + Hapus Foto

### Hierarchical RBAC
- [x] Permission model hierarki: 6 tabel (modules, module_menus, module_actions/menu_actions, user_menu_permissions, dst.) — 9 modules / 57 menus / 399 actions
- [x] AuthContext: `hasMenuPermission(menuKey, action)` + `menuPermissions` state; gating Sidebar + AppLauncher migrasi ke hasMenuPermission (fallback hasPermission → role → true)
- [x] Permission Matrix tab di Edit User (collapsible per module, select-all, diff-based save)

### Drop Legacy profiles.role
- [x] Deprecate `profiles.role` — role sekarang MURNI dari `user_roles` (erpRole/role di context)
- [x] Tahap 1–3 selesai (kode): DB functions dibersihkan, Edge Functions (manage-schema/create-user) pakai `is_super_admin()` RPC bukan profiles.role, frontend `src/` 0 ref profiles.role
- [ ] Tahap 4 — drop kolom `profiles.role` + type `user_role_legacy` (pending approval; verifikasi semua super_admin ada di user_roles dulu)

### Auth Lifecycle Hardening
- [x] Fix A — logout bersihkan `nexus_last_menu`/`nexus_last_module` di localStorage
- [x] Fix B — validasi restored activeMenu (redirect kalau user baru warisi menu yg tak punya akses)
- [x] Fix C — content-level access gate (AccessDeniedPage, defense-in-depth selain sidebar gating)
- [x] Fix D — `permissionsLoading` flag; AppLauncher dim+blocked "Memuat izin akses…" saat permission belum load; fix klik modul no-op setelah login user baru
- [x] Fix enterModule stale closure + auth listener setLoading(true) saat SIGNED_IN

### Lead Pool
- [x] Import 506 lead (arsip, ter-assign ke sales) → `account_status='lead_pool'`
- [x] LeadPoolPage — list/tabel (pagination client-side 25), filter source/type/search, 2 stat card; aksi "Tarik ke Pipeline" per row (account_status → prospect)
- [x] RLS aktif di `accounts`: sales lihat assigned_to=dia, manager se-entitas, super semua

## 2026-06-12
- [x] activeMenu di-persist ke localStorage (`nexus_last_menu`) — survive browser refresh
- [x] ProspectFormPage SOURCE options diperluas jadi 11 (sales_visit, cold_call, referral, existing_network, exhibition, instagram, linkedin, tiktok, website, walk_in, other); sinkron `SOURCE_LABELS_KP` + `sourceToSvc` di PipelineKanbanPage
- [x] Fix profiles query → `.eq('active', true)` (kolom `active`, bukan `is_active`)

## 2026-06-07
### Modules Live — HRGA, Assets, Logistics, Inventory, CRM Dashboard
- [x] HRGA Request module — schema 9 tabel + RLS + GRANT, 20 request types × 3 company, approval matrix; My Requests / Semua Request / detail modal; form ATK line items (migrations 020–024)
- [x] Asset Management — IT Equipment + Kendaraan list/detail (useAssets hook, server-side pagination); migrations 025–027 (specs, network, software licenses, maintenance, fuel logs)
- [x] Logistics Sales Order — SP list page (KPI cards, tabs, filter, bulk, pagination) + SP Detail page (5 tab, Finance Status INV/FP/SUB/KRM per-stage, Edit Item modal, Delete SP type-to-confirm)
- [x] Product Detail Modal — overlay modal, inline edit, toggle active, copy SKU (migration 028)
- [x] Inventory — Stok Barang (stock_summary JOIN products+warehouses) + Penerimaan Barang (goods receipt → stock_ledger)
- [x] App Launcher (Odoo-style grid, solid colour cards per group) + vertical sidebar per module
- [x] CRM Dashboard fully connected ke Supabase — KPI, Pipeline by Stage, Prospect Trend, Lead Source donut, Sales Performance, Calendar Jadwal Visit (semua real, mock dihapus)
- [x] CRM enhancements — Visit stepper (scheduled/completed/cancelled) + visit type + log history; BANT Scorecard; Sales Calls page; Win/Loss capture; Pricing Authority + Quote SLA; dashboard per-role
- [x] `src/lib/spCalc.js` — single source of truth kalkulasi SP (calcItem/groupBySP)
- [x] `src/components/ConfirmModal.jsx` — reusable confirm dialog (ganti semua window.confirm)
- [x] Permission gating DB-driven — role_permissions → hasPermission(module, action) + isCrossEntity

## 2026-06-06
### CRM UI — Visual Redesigns & New Pages
- [x] PipelineKanbanPage.jsx — full visual redesign: Lovable JSX port, chevron/arrow stage headers (clip-path), MSI Navy #144682, list/kanban toggle, drag-drop fade fix (draggingId reset on drop)
- [x] InputSPPage.jsx — full visual redesign: MSI brand colors, Montserrat headings, 2-row item sub-card grid (Product+SKU+QTY / UnitPrice+Shipping+ExpDate+Deadline), BTB trash red bg
- [x] CRMDashboardPage.jsx — new page created from Lovable design bundle, recharts (Bar/Pie/Area), mock data, registered at activeMenu === 'crm-dashboard'
- [x] CRM sidebar menu restructured — 4 items: Dashboard (crm-dashboard), Pipeline/Leads (crm-pipeline), Inquiry (crm-inquiry), Quotation (quotation-draft); removed section dividers and unused items
- [x] 'crm' removed from PLANNED_MODULES — CRM is live, parent click now expands dropdown without navigating to Coming Soon page
- [x] sp_items — tambah 3 kolom baru: sla_days, estimated_delivery_date, delivered_date; auto-calc estimatedDeliveryDate via useEffect; badge Est. Delivery / Delivered / Overdue di item card
- [x] Master Data status audit — documented in CLAUDE.md (12 tabel, status per tabel)
- [x] Roles structure defined — 13 system roles based on official org chart OD/HCGA-MSI/V/2026
- [x] Permission matrix documented in CLAUDE.md
- [x] Role migration completed — 7 deprecated soft-deleted, bod→ceo, supervisor→gm, logistic legacy handled
- [x] Role permissions seeded for all 13 roles (finance, hrga, it, manager, operations, sales, procurement, gm, ceo)
- [x] Company codes updated: SBI → SOA, JCI name → Jago Custom Indonesia
- [x] RolesPage updated with editable permission matrix for super_admin
- [x] Company names updated to PT full names (MSI, JCI, SOA)
- [x] Departments cleaned and synced with org chart — 9 dept MSI/SOA, 10 dept JCI (+PPJK)
- [x] Departments cleaned per entity — JCI (2), MSI (9), SOA (3) sesuai org chart
- [x] Positions cleaned and synced with org chart — MSI (10), JCI (3), SOA (3)
- [x] ProductsPage.jsx created — grid/list view, company tabs, Supabase integration, 78 products (MSI:10, JCI:5, SOA:63)
- [x] Products RLS fixed — super_admin can view all companies; fetch uses id→code map instead of join
- [x] Supabase default limit 10 discovered — fixed with .limit(1000); rule added to CLAUDE.md Debugging Field Notes
- [x] InquiryListPage designed in Lovable — pending port to Nexus
- [x] ProductDetailPage designed in Lovable — pending port to Nexus (adaptive service/product layout)
- [x] CRM tab navigation designed — pending implementation

## 2026-06-05
### CRM Module — Initial Implementation
- [x] Migration: tabel prospects, inquiries, quotations, quotation_items
- [x] RLS & GRANT permissions untuk 4 tabel CRM
- [x] ProspectListPage.jsx — list + filter + badge stage
- [x] ProspectFormPage.jsx — form tambah/edit
- [x] InquiryListPage.jsx — list + filter + auto-generate INQ number
- [x] InquiryFormPage.jsx — form inquiry
- [x] QuotationFormPage.jsx — sectioned table, multi-currency, VAT 1.1%
- [x] PipelineKanbanPage.jsx — 7 kolom, HTML5 drag and drop
- [x] Fix: column mismatch (company_name → name, payment_term_id → payment_terms_id)
- [x] Fix: inquiries.deleted_at ditambah via ALTER TABLE
- [x] Fix: quotation_items.total kolom GENERATED di-DROP, diganti plain numeric
- [x] Schema update: usd_rate di quotations, group_name/currency/unit_label/exchange_rate/total di quotation_items
- [x] Cost price tracking per quotation item — cost_price kolom di quotation_items, no-print CSS, profit summary di sidebar
- [x] Fix: input angka leading zero di QuotationFormPage (cost_price, unit_price, qty, usd_rate)
- [x] Fix: tambah kolom route di insert payload quotations (konfirmasi sudah ada, schema cache issue sisi Supabase)
- [x] QuotationListPage.jsx — list + filter status + search + pagination
- [x] QuotationDetailPage.jsx — detail read-only + sectioned table + print layout + internal cost/profit (no-print)
- [x] Routing App.jsx untuk quotation list, detail, form (create + edit mode via crmQuotationDetail + editingQuotation state)
- [x] PDF generator: jspdf + html2canvas, tombol Download PDF di QuotationDetailPage
- [x] Print area: logo MSI, customer info, sectioned table (tanpa cost_price), summary, notes, footer — off-screen div#quotation-print-area
- [x] Print area redesign: customer details table (dark-green label cells), terms/above rates, Best Regards + jabatan dari profiles.positions, footer alamat lengkap
- [x] Print area update: verticalAlign middle semua customer details cells, baris APPROVED BY + APPROVAL DATE, Best Regards ↔ Approved by side-by-side, divider orange-navy, footer navy dengan 2 kantor MSI
- [x] Fix: QuotationFormPage edit mode — prop quotation, useEffect populate header+sections, handleSave branch UPDATE vs INSERT
- [x] Fix: tambah field Terms & Conditions / Above Rates di QuotationFormPage + di insert/update payload quotations

## 2026-06-05 — SLA & Delivery Fields pada sp_items
- [x] db.js: tambah sla_days, estimated_delivery_date, delivered_date ke spFromDb dan spToDb
- [x] SalesOrderDetailPage EditItemModal: tambah baris baru di section TANGGAL (SLA hari, Estimated Delivery, Delivered Date)
- [x] Auto-calc estimatedDeliveryDate via useEffect saat shippingDate atau slaDays berubah (masih editable manual)
- [x] Item card footer: badge Est. Delivery (biru), badge Delivered (hijau), badge Overdue (merah) sesuai kondisi

## 2026-06-05 — BTB No: item-level → SP-level (sp_btbs table)
- [x] db.js: hapus btb_no dari rowFromDb/spToDb (column renamed btb_no_deprecated), tambah listSpBtbs/addSpBtb/deleteSpBtb/bulkInsertSpBtbs
- [x] SalesOrderDetailPage: hapus btbNo dari EditItemModal state+form+badge, tambah BTB Numbers section di Overview tab (fetch sp_btbs, inline add+delete)
- [x] InputSPPage: tambah BTB Numbers card (dynamic list add/remove), bulkInsertSpBtbs saat submit
- [x] App.jsx ShipmentModal + FinanceModal: hapus btbNo field dari state dan form

## 2026-06-05 — Dynamic Custom Fields for Customers
- [x] useCustomFields.js hook — fetch extra columns via get_table_columns RPC, filter STANDARD_COLUMNS, return customFields array
- [x] CustomFieldsSection.jsx — renders per data_type: text/number/boolean/date/datetime/jsonb, read-only mode support
- [x] CustomerModal updated: useCustomFields('customers'), customValues state, populate on edit, merge on save
- [x] CustomersPage updated: useCustomFields at page level, CustomFieldsSection read-only per card
- [x] STANDARD_COLUMNS exported from hook for use in App.jsx

## 2026-06-05 — Schema Manager
- [x] SchemaManagerPage.jsx — super admin UI untuk tambah kolom ke tabel existing via manage-schema Edge Function
- [x] Sidebar kiri: list tabel per grup (Master Data / CRM / Assets)
- [x] Tabel kolom existing dari information_schema (dengan RPC fallback)
- [x] Form: Field Label, Field Key (auto snake_case), Data Type dropdown, Default Value
- [x] SQL preview sebelum submit
- [x] Call Edge Function manage-schema dengan Bearer session token
- [x] Guard: hidden kalau role bukan 'super' atau 'super_admin'
- [x] Wire ke App.jsx: lazy import, menu entry Foundation > Master Data, render block
- [x] Catch-all exclusion untuk 'schema-manager' menu ID

## 2026-06-05 — Rebrand MSI Brand Guideline v1.0
- [x] Audit: scan semua file warna (#2F6B3F, #1a3a2a, Plus Jakarta Sans) — 27 files teridentifikasi
- [x] Navy #144682 replace dark green #1a3a2a di print area QuotationDetailPage
- [x] Navy gradient replace sidebar dark green #0F2A23/#173D34 di App.jsx
- [x] Orange #E85A1E replace accent green #2F6B3F di semua 19 module files (42 occurrences)
- [x] accentSoft #FEF2EC replace #E7EFE2 (60 occurrences)
- [x] Font: Montserrat (heading) + Inter (body) via Google Fonts — index.html + index.css + App.jsx
- [x] Active icon color updated #C8EFD9 → #FFB899 (orange tint on navy sidebar)
- [x] CLAUDE.md updated dengan Brand System token table

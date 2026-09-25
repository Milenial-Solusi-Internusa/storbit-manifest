-- =============================================================================
-- Migration: 20260924000001_menu_skeleton_catalog
-- Phase:     Kerangka menu Grand Design Bagian 1 — pendaftaran KATALOG untuk
--            157 menu key tab placeholder (`skel_*`).
-- Depends:   tabel modules / module_menus / menu_actions (RBAC 3-tingkat).
--
-- Status:    BELUM DIJALANKAN — di staging maupun produksi.
--
-- TIDAK WAJIB untuk membuat kerangka menunya bekerja. Kode sudah benar tanpa
--    migrasi ini: hasMenuPermission default-deny, dan key yang TIDAK ada di
--    katalog otomatis berarti "hanya super_admin" (bypass tier 1). Migrasi ini
--    hanya membuat ke-157 key itu MUNCUL di matriks RoleDefaultsPage /
--    UserEditPage, supaya kelak bisa di-grant lewat UI tanpa SQL lagi.
--
-- SIFAT: 3 INSERT idempoten (ON CONFLICT DO NOTHING), 100% DATA.
--   Nol DDL, nol GRANT/REVOKE, nol policy, nol RPC, nol baris dihapus.
--   NOL baris role_menu_permissions — itu justru intinya: begitu sebuah key
--   punya baris grant, ia berhenti jadi "hanya super_admin". Pemberian izin
--   dilakukan terpisah lewat 20260924000002 (template) atau lewat UI.
--
-- -- KENAPA modules IKUT DI-INSERT ------------------------------------------
--   Tiga modul Bagian 1 belum tentu punya baris di katalog (console, ppjk,
--   quality -- juga 'it', yang hari ini menumpang modul 'service' lewat key
--   hrga_it). Blok 1 memakai ON CONFLICT DO NOTHING sehingga modul yang SUDAH
--   ada tidak tersentuh sama sekali (label & sort_order-nya utuh), dan yang
--   belum ada lahir. Nol key menu lama dipindah modul.
--
-- -- VERIFIKASI --------------------------------------------------------------
--   V0 mencatat angka sebelum; V1..V4 sesudah. Kalau V3 mengembalikan baris,
--   ADA yang salah: migrasi ini tidak boleh melahirkan satu pun grant.
-- =============================================================================


-- =============================================================================
-- V0 -- jalankan SEBELUM blok eksekusi, catat angkanya.
-- =============================================================================
SELECT
  (SELECT count(*) FROM public.modules)               AS modules_sebelum,
  (SELECT count(*) FROM public.module_menus)          AS module_menus_sebelum,
  (SELECT count(*) FROM public.menu_actions)          AS menu_actions_sebelum,
  (SELECT count(*) FROM public.role_menu_permissions) AS rmp_sebelum;


-- =============================================================================
-- BLOK EKSEKUSI -- tempel APA ADANYA, satu Run.
-- =============================================================================

BEGIN;

-- 1. Modul Bagian 1. Yang sudah ada TIDAK disentuh (ON CONFLICT DO NOTHING).
INSERT INTO public.modules (key, label, sort_order, is_active)
SELECT v.key, v.label, v.sort_order, true
FROM (VALUES
  ('crm', 'CRM (Business Development)', 10),
  ('procurement', 'Procurement', 20),
  ('logistics', 'Logistics & Warehouse', 30),
  ('console', 'Console', 40),
  ('ppjk', 'PPJK (Customs)', 50),
  ('finance', 'Finance & Accounting', 60),
  ('service', 'HCGA', 70),
  ('it', 'Digital Transformation (IT)', 80),
  ('quality', 'Quality Management (QMR/GMR)', 90)
) AS v(key, label, sort_order)
ON CONFLICT (key) DO NOTHING;

-- 2. 157 menu key tab placeholder. Label = "<kode Bagian 1> <nama Level 3>"
--    supaya tiap baris di matriks izin bisa dicocokkan langsung ke dokumennya.
INSERT INTO public.module_menus (module_id, key, label, sort_order, is_active)
SELECT m.id, v.key, v.label, v.sort_order, true
FROM (VALUES
  ('crm', 'skel_1_2_1', '1.2.1 Inquiry Intake Form', 901),
  ('crm', 'skel_1_2_2', '1.2.2 Inquiry Classification', 902),
  ('crm', 'skel_1_2_3', '1.2.3 Inquiry Owner Assignment', 903),
  ('crm', 'skel_1_3_1', '1.3.1 30-Point Feasibility Checklist', 904),
  ('crm', 'skel_1_3_2', '1.3.2 Preliminary Cost & Margin Estimation', 905),
  ('crm', 'skel_1_3_3', '1.3.3 Feasibility Recommendation', 906),
  ('crm', 'skel_1_3_4', '1.3.4 Feasibility Approval', 907),
  ('crm', 'skel_1_4_2', '1.4.2 Version & Revision History', 908),
  ('crm', 'skel_1_4_3', '1.4.3 Pricing Approval Matrix', 909),
  ('crm', 'skel_1_4_4', '1.4.4 Delivery & Read Status Tracking', 910),
  ('crm', 'skel_1_5_1', '1.5.1 SO Generation from Approved Quotation', 911),
  ('crm', 'skel_1_5_4', '1.5.4 SO Amendment History', 912),
  ('crm', 'skel_1_6_1', '1.6.1 SI Detail Capture', 913),
  ('crm', 'skel_1_6_2', '1.6.2 SI to SO/Quotation Linking', 914),
  ('crm', 'skel_1_6_3', '1.6.3 SI Completeness Status', 915),
  ('crm', 'skel_1_7_2', '1.7.2 Win/Loss/Cancellation Tracking', 916),
  ('crm', 'skel_1_8_2', '1.8.2 Customer Payment Terms', 917),
  ('crm', 'skel_1_8_3', '1.8.3 Transaction History', 918),
  ('crm', 'skel_1_8_4', '1.8.4 Customer Tiering', 919),
  ('crm', 'skel_1_9_1', '1.9.1 Monthly Target per Salesperson', 920),
  ('crm', 'skel_1_9_2', '1.9.2 Target vs Actual Tracking', 921),
  ('crm', 'skel_1_10_1', '1.10.1 Cross-department Handover Checklist', 922),
  ('crm', 'skel_1_10_2', '1.10.2 Auto-attached Supporting Documents', 923),
  ('crm', 'skel_1_10_3', '1.10.3 Handover Notification', 924),
  ('procurement', 'skel_2_1_2', '2.1.2 Vendor Category', 901),
  ('procurement', 'skel_2_1_3', '2.1.3 Performance History & Rating', 902),
  ('procurement', 'skel_2_2_1', '2.2.1 Multi-vendor Rate Request', 903),
  ('procurement', 'skel_2_2_2', '2.2.2 Buy Rate Comparison', 904),
  ('procurement', 'skel_2_3_2', '2.3.2 Multi-level Approval', 905),
  ('procurement', 'skel_2_4_2', '2.4.2 PO Status Tracking', 906),
  ('procurement', 'skel_2_4_3', '2.4.3 PO Document & Attachments', 907),
  ('procurement', 'skel_2_5_2', '2.5.2 Supplier Delivery Schedule', 908),
  ('procurement', 'skel_2_5_3', '2.5.3 Linking to Goods Receiving', 909),
  ('procurement', 'skel_2_6_1', '2.6.1 Periodic Evaluation Form', 910),
  ('procurement', 'skel_2_6_2', '2.6.2 Price/Time/Quality Scorecard', 911),
  ('procurement', 'skel_2_6_3', '2.6.3 Vendor Blacklist/Watchlist', 912),
  ('logistics', 'skel_3_1_2', '3.1.2 Vendor & Sub-process Assignment', 901),
  ('logistics', 'skel_3_1_3', '3.1.3 Job Costing Basis', 902),
  ('logistics', 'skel_3_2_1', '3.2.1 Packing List Generation', 903),
  ('logistics', 'skel_3_2_2', '3.2.2 Linking to Job Order & Commercial Invoice', 904),
  ('logistics', 'skel_3_2_3', '3.2.3 Reference Feed to Console & PPJK', 905),
  ('logistics', 'skel_3_3_1', '3.3.1 Pickup & Delivery Scheduling', 906),
  ('logistics', 'skel_3_3_2', '3.3.2 Vehicle/Vendor Assignment', 907),
  ('logistics', 'skel_3_3_3', '3.3.3 Shipment Status Tracking', 908),
  ('logistics', 'skel_3_4_1', '3.4.1 Fleet/Vendor Master', 909),
  ('logistics', 'skel_3_4_2', '3.4.2 Vehicle Scheduling & Allocation', 910),
  ('logistics', 'skel_3_4_3', '3.4.3 Trip Cost Recording', 911),
  ('logistics', 'skel_3_5_1', '3.5.1 Delivery Confirmation Capture', 912),
  ('logistics', 'skel_3_5_2', '3.5.2 Photo/Document Evidence Upload', 913),
  ('logistics', 'skel_3_5_3', '3.5.3 Auto BTB Generation & Delivery Note Status Update', 914),
  ('logistics', 'skel_3_6_2', '3.6.2 PO/Inbound Document Matching', 915),
  ('logistics', 'skel_3_6_3', '3.6.3 Put-away to Storage Location', 916),
  ('logistics', 'skel_3_7_2', '3.7.2 Warehouse & Zone Master', 917),
  ('logistics', 'skel_3_7_3', '3.7.3 Rack/Bin Structure', 918),
  ('logistics', 'skel_3_7_4', '3.7.4 Location Capacity & Utilization', 919),
  ('logistics', 'skel_3_8_1', '3.8.1 Order Grouping by Route/Zone/Priority', 920),
  ('logistics', 'skel_3_8_2', '3.8.2 Wave Release to Picking', 921),
  ('logistics', 'skel_3_8_3', '3.8.3 Wave Status Tracking', 922),
  ('logistics', 'skel_3_9_2', '3.9.2 Real-time Picked Quantity Update', 923),
  ('logistics', 'skel_3_9_3', '3.9.3 Packing & Shipping Label', 924),
  ('logistics', 'skel_3_10_3', '3.10.3 Delivery Note Print & Digital Copy', 925),
  ('logistics', 'skel_3_11_2', '3.11.2 Transfer Approval', 926),
  ('logistics', 'skel_3_11_3', '3.11.3 Transfer Audit Trail', 927),
  ('logistics', 'skel_3_12_2', '3.12.2 Physical Count Entry', 928),
  ('logistics', 'skel_3_12_3', '3.12.3 Variance Report & Adjustment', 929),
  ('logistics', 'skel_3_13_2', '3.13.2 Reorder Point Alert', 930),
  ('logistics', 'skel_3_13_3', '3.13.3 Dead/Slow-moving Stock Report', 931),
  ('logistics', 'skel_3_14_1', '3.14.1 SKU & Location Label Generation', 932),
  ('logistics', 'skel_3_14_2', '3.14.2 Scanner/Mobile App Integration', 933),
  ('logistics', 'skel_3_14_3', '3.14.3 Scan Transaction Log', 934),
  ('console', 'skel_4_1_1', '4.1.1 Cargo Consolidation Plan per Route/Schedule', 901),
  ('console', 'skel_4_1_2', '4.1.2 Space Allocation per Shipment', 902),
  ('console', 'skel_4_1_3', '4.1.3 Container/Aircraft Capacity Simulation', 903),
  ('console', 'skel_4_2_1', '4.2.1 Booking to Shipping Line/Airline', 904),
  ('console', 'skel_4_2_2', '4.2.2 Booking Confirmation & Amendment', 905),
  ('console', 'skel_4_2_3', '4.2.3 Vendor Booking History', 906),
  ('console', 'skel_4_3_1', '4.3.1 House Bill of Lading (HBL)', 907),
  ('console', 'skel_4_3_2', '4.3.2 Master Bill of Lading (MBL)', 908),
  ('console', 'skel_4_3_3', '4.3.3 HBL vs MBL Reconciliation', 909),
  ('console', 'skel_4_4_1', '4.4.1 Overseas Agent/Partner Master', 910),
  ('console', 'skel_4_4_2', '4.4.2 Agreement & Commission Terms', 911),
  ('console', 'skel_4_4_3', '4.4.3 Collaboration History per Shipment', 912),
  ('ppjk', 'skel_5_1_1', '5.1.1 HS Code Database', 901),
  ('ppjk', 'skel_5_1_2', '5.1.2 Classification Proposal per Item', 902),
  ('ppjk', 'skel_5_1_3', '5.1.3 Classification Decision History', 903),
  ('ppjk', 'skel_5_2_1', '5.2.1 Licensing Checklist', 904),
  ('ppjk', 'skel_5_2_2', '5.2.2 Document Completeness Status', 905),
  ('ppjk', 'skel_5_2_3', '5.2.3 License Expiry Reminder', 906),
  ('ppjk', 'skel_5_3_1', '5.3.1 Import Duty & Tax Calculator', 907),
  ('ppjk', 'skel_5_3_2', '5.3.2 Tariff Scenario Simulation', 908),
  ('ppjk', 'skel_5_3_3', '5.3.3 Estimation History per Shipment', 909),
  ('ppjk', 'skel_5_4_1', '5.4.1 PIB/PEB Submission', 910),
  ('ppjk', 'skel_5_4_2', '5.4.2 Clearance Status Tracking', 911),
  ('ppjk', 'skel_5_4_3', '5.4.3 Customs Document Archive', 912),
  ('ppjk', 'skel_5_5_1', '5.5.1 Lane Prediction', 913),
  ('ppjk', 'skel_5_5_2', '5.5.2 Prior Inspection History', 914),
  ('ppjk', 'skel_5_5_3', '5.5.3 Inspection Follow-up Notes', 915),
  ('ppjk', 'skel_5_6_1', '5.6.1 Compliance Risk Score per Shipment', 916),
  ('ppjk', 'skel_5_6_2', '5.6.2 Findings & Follow-up Register', 917),
  ('ppjk', 'skel_5_6_3', '5.6.3 Periodic Compliance Report', 918),
  ('finance', 'skel_6_1_2', '6.1.2 Cash Flow Projection', 901),
  ('finance', 'skel_6_1_3', '6.1.3 Bank Reconciliation', 902),
  ('finance', 'skel_6_1_4', '6.1.4 Payroll Disbursement', 903),
  ('finance', 'skel_6_2_1', '6.2.1 Invoice Management', 904),
  ('finance', 'skel_6_3_2', '6.3.2 3-Way Matching (PO vs Goods Receiving vs Vendor Bill)', 905),
  ('finance', 'skel_6_3_3', '6.3.3 Payment Scheduling & Approval', 906),
  ('finance', 'skel_6_3_4', '6.3.4 AP Aging', 907),
  ('finance', 'skel_6_4_2', '6.4.2 General Ledger & Chart of Accounts', 908),
  ('finance', 'skel_6_4_3', '6.4.3 Financial Statements (Balance Sheet/P&L)', 909),
  ('finance', 'skel_6_5_1', '6.5.1 Tax Rate Master', 910),
  ('finance', 'skel_6_5_2', '6.5.2 VAT/Income Tax Calculation', 911),
  ('finance', 'skel_6_5_3', '6.5.3 Coretax Integration/Reporting', 912),
  ('finance', 'skel_6_5_4', '6.5.4 Withholding Tax & Tax Invoice Archive', 913),
  ('finance', 'skel_6_6', '6.6 Payment Terms Master', 914),
  ('service', 'skel_7_1_1', '7.1.1 Personal & Employment Data', 901),
  ('service', 'skel_7_1_2', '7.1.2 Organization Structure, Department & Position Master', 902),
  ('service', 'skel_7_1_3', '7.1.3 Mutation/Promotion History', 903),
  ('service', 'skel_7_2_1', '7.2.1 Job Requisition & Posting', 904),
  ('service', 'skel_7_2_2', '7.2.2 Candidate Pipeline Tracking', 905),
  ('service', 'skel_7_2_3', '7.2.3 Recruitment Approval', 906),
  ('service', 'skel_7_3_1', '7.3.1 Training Schedule & Catalog', 907),
  ('service', 'skel_7_3_2', '7.3.2 Attendance & Participant Records', 908),
  ('service', 'skel_7_3_3', '7.3.3 Certification History', 909),
  ('service', 'skel_7_4_1', '7.4.1 Periodic Appraisal Form', 910),
  ('service', 'skel_7_4_2', '7.4.2 Individual KPI/Target', 911),
  ('service', 'skel_7_4_3', '7.4.3 Score History & Calibration', 912),
  ('service', 'skel_7_5_2', '7.5.2 Equipment/Facility Request', 913),
  ('service', 'skel_7_6_1', '7.6.1 Asset & Access Return Checklist', 914),
  ('service', 'skel_7_6_2', '7.6.2 Exit Interview Process', 915),
  ('service', 'skel_7_6_3', '7.6.3 Reference/Employment Certificate', 916),
  ('service', 'skel_7_7_1', '7.7.1 Salary Calculation', 917),
  ('service', 'skel_7_7_2', '7.7.2 Payroll Data Master', 918),
  ('it', 'skel_8_1_2', '8.1.2 Priority & SLA Management', 901),
  ('it', 'skel_8_1_3', '8.1.3 Resolution History', 902),
  ('it', 'skel_8_2_1', '8.2.1 Development Request List', 903),
  ('it', 'skel_8_2_2', '8.2.2 Backlog Status & Priority', 904),
  ('it', 'skel_8_2_3', '8.2.3 Roadmap/Release Linking', 905),
  ('it', 'skel_8_3_1', '8.3.1 Account & Role Management', 906),
  ('it', 'skel_8_3_2', '8.3.2 Periodic Access Audit', 907),
  ('it', 'skel_8_3_3', '8.3.3 Sensitive Activity Log', 908),
  ('it', 'skel_8_4_1', '8.4.1 System Uptime Dashboard', 909),
  ('it', 'skel_8_4_2', '8.4.2 Incident/Downtime Notification', 910),
  ('it', 'skel_8_4_3', '8.4.3 Maintenance History', 911),
  ('it', 'skel_8_5_2', '8.5.2 Network & License Master', 912),
  ('it', 'skel_8_5_3', '8.5.3 Maintenance/Replacement Schedule', 913),
  ('quality', 'skel_9_1_2', '9.1.2 Document Change Approval Flow', 901),
  ('quality', 'skel_9_1_3', '9.1.3 Revision History', 902),
  ('quality', 'skel_9_2_2', '9.2.2 Non-conformance Findings', 903),
  ('quality', 'skel_9_2_3', '9.2.3 CAPA Follow-up', 904),
  ('quality', 'skel_9_3_1', '9.3.1 Departmental Risk List', 905),
  ('quality', 'skel_9_3_2', '9.3.2 Impact & Likelihood Assessment', 906),
  ('quality', 'skel_9_3_3', '9.3.3 Mitigation & Follow-up Status', 907),
  ('quality', 'skel_9_4_2', '9.4.2 Cross-department KPI Summary', 908),
  ('quality', 'skel_9_4_3', '9.4.3 Executive Decision & Action Items', 909),
  ('quality', 'skel_9_5_1', '9.5.1 Improvement Proposal Form', 910),
  ('quality', 'skel_9_5_2', '9.5.2 Proposal Status Tracking', 911),
  ('quality', 'skel_9_5_3', '9.5.3 Implementation Documentation', 912)
) AS v(module_key, key, label, sort_order)
JOIN public.modules m ON m.key = v.module_key
ON CONFLICT (key) DO NOTHING;

-- 3. Aksi 'view' -- satu-satunya aksi yang diperiksa canSeeMenuItem.
INSERT INTO public.menu_actions (menu_id, action, is_active)
SELECT mm.id, 'view', true
FROM public.module_menus mm
WHERE mm.key LIKE 'skel\_%'
ON CONFLICT (menu_id, action) DO NOTHING;

COMMIT;


-- =============================================================================
-- VERIFIKASI -- jalankan TERPISAH sesudah COMMIT.
-- =============================================================================

-- V1 -- DIHARAPKAN 157 baris.
SELECT count(*) AS menu_skeleton FROM public.module_menus WHERE key LIKE 'skel\_%';

-- V2 -- DIHARAPKAN 157 baris (satu aksi 'view' per menu).
SELECT count(*) AS aksi_view
FROM   public.menu_actions ma
JOIN   public.module_menus mm ON mm.id = ma.menu_id
WHERE  mm.key LIKE 'skel\_%' AND ma.action = 'view';

-- V3 -- DIHARAPKAN NOL BARIS. Kalau ada, sebuah tab placeholder sudah terlihat
--       oleh role non-super_admin dan janji "placeholder super_admin-only" batal.
SELECT r.code, mm.key
FROM   public.role_menu_permissions rmp
JOIN   public.menu_actions ma ON ma.id = rmp.menu_action_id
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = rmp.role_id
WHERE  mm.key LIKE 'skel\_%';

-- V4 -- sebaran per modul, untuk dicocokkan dengan Bagian 1.
--       DIHARAPKAN: crm 24, procurement 12, logistics 34, console 12, ppjk 18, finance 14, service 18, it 13, quality 12.
SELECT m.key AS module, count(*) AS jumlah
FROM   public.module_menus mm
JOIN   public.modules m ON m.id = mm.module_id
WHERE  mm.key LIKE 'skel\_%'
GROUP  BY m.key ORDER BY m.key;

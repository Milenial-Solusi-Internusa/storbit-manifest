// src/routes/menu-skeleton.js
// ============================================================================
// KERANGKA MENU — Grand Design MSI Group Bagian 1, BAGIAN A (Level 1-3).
//
// SATU sumber untuk lima hal yang dulu tersebar:
//   1. urutan & label sidebar (NEXUS_NAV di App.jsx dibangun dari sini)
//   2. registry gate (entri ERP_MENU_GROUPS untuk id placeholder)
//   3. menu key (MENU_KEY_MAP untuk id placeholder — sengaja TIDAK di-seed)
//   4. kontrak URL tiap tab (menu-paths.js menyerapnya ke MENU_PATHS)
//   5. daftar rute tab + redirect path lama (skeleton.routes.jsx)
//
// ── ATURAN ISI ────────────────────────────────────────────────────────────
// `label` Level 1/2/3 disalin VERBATIM dari Bagian A, tidak disingkat
// (keputusan Den: "3.10.1 berlabel 'Delivery Note Issuance from Completed
// Picking', bukan 'DN Issuance...'"). File ini di-generate dari dokumen
// sumbernya, jadi tidak ada kesempatan salah ketik; kalau Bagian A berubah,
// yang diperbarui file ini, bukan label di komponen.
//
// Kurung yang merupakan BAGIAN NAMA tetap di label ("Purchase Requisition
// (PRF)", "Delivery Note (Surat Jalan) Management", "Stock Opname (Cycle
// Count)"). Kurung yang berisi catatan redaksional asal-usul/cakupan
// (1.6, 1.9, 6.6, 7.7) dipindah ke `note` supaya tidak ikut jadi label menu.
//
// `mounts` = halaman LAMA yang dipasang di tab itu. `menuId`-nya sengaja id
// menu lama, BUKAN id baru: dengan begitu activeMenu, canSeeMenuItem,
// canRenderPage, nexus_last_menu, dan ?menu=<id> bekerja persis seperti
// sebelum kerangka ini ada — nol menu key berubah, nol izin bergeser.
// Tab tanpa `mounts` = placeholder: id `ph-<kode>`, menu key `skel_<kode>`
// yang SENGAJA tidak di-seed di katalog → default-deny untuk semua orang
// kecuali super_admin (bypass tier-1 hasMenuPermission).
//
// Istilah DI DALAM file halaman tidak disentuh sama sekali — cakupan
// terminologi Bagian 1 hanya label navigasi (keputusan Den).
// ============================================================================
import {
  Activity, AlertTriangle, ArrowUpDown, BarChart2, BarChart3, BookOpen, Boxes, BriefcaseBusiness, Building2, Calendar, Car, CheckCircle2, ClipboardCheck, ClipboardList, Clock, Contact, CreditCard, Download, FileCheck, FileText, FolderOpen, Globe, Landmark, LayoutDashboard, LayoutList, LifeBuoy, LogOut, Monitor, Package, Presentation, Receipt, ScrollText, Search, Shield, ShieldCheck, Ship, ShoppingCart, Sparkles, Tag, TrendingUp, Truck, User, Users, UsersRound, Wallet,
} from 'lucide-react';

/** Sub-grup Level 1 → segmen path (keputusan Den: 3.1-3.5 freight, 3.6-3.14 warehouse). */
export const SUBGROUP_SEGMENT = {"Freight & Delivery Operations":"freight","Warehouse & Inventory Operations":"warehouse"};

export const SKELETON = [
  {
    no: 1, label: "CRM (Business Development)", slug: "crm", icon: Contact, tone: "blue",
    items: [
      {
        code: "1.1", label: "Lead Management", slug: "lead",
        path: "/crm/lead", icon: Users,
        tabs: [
          { code: "1.1.1", label: "Multi-channel Lead Capture", slug: "capture", path: "/crm/lead/capture",
            desc: "menangkap data lead mentah dari call, referral, pameran, atau website sebelum masuk proses kualifikasi.",
            mounts: [
              { menuId: "crm-prospects", path: "/crm/lead/capture" },
            ] },
          { code: "1.1.2", label: "Lead Assignment / Claim", slug: "assignment", path: "/crm/lead/assignment",
            desc: "menugaskan atau membiarkan sales mengklaim lead yang belum ada pemiliknya.",
            mounts: [
              { menuId: "crm-lead-pool", path: "/crm/lead/assignment" },
            ] },
          { code: "1.1.3", label: "Lead Qualification to Inquiry", slug: "qualification", path: "/crm/lead/qualification",
            desc: "menyaring lead yang sudah layak untuk naik status jadi Inquiry resmi.",
            mounts: [
              { menuId: "crm-lead-pool-approval", path: "/crm/lead/qualification" },
            ] },
        ],
      },
      {
        code: "1.2", label: "Inquiry Management", slug: "inquiry",
        path: "/crm/inquiry", icon: FileText,
        tabs: [
          { code: "1.2.1", label: "Inquiry Intake Form", slug: "intake", path: "/crm/inquiry/intake",
            desc: "mencatat data awal permintaan customer, termasuk arah shipment dan deskripsi cargo.",
            id: "ph-1-2-1", menuKey: "skel_1_2_1", mounts: [] },
          { code: "1.2.2", label: "Inquiry Classification", slug: "classification", path: "/crm/inquiry/classification",
            desc: "mengelompokkan inquiry berdasarkan jenis (import/export/domestik, freight/trading/customs).",
            id: "ph-1-2-2", menuKey: "skel_1_2_2", mounts: [] },
          { code: "1.2.3", label: "Inquiry Owner Assignment", slug: "owner-assignment", path: "/crm/inquiry/owner-assignment",
            desc: "menetapkan sales yang bertanggung jawab atas inquiry tersebut.",
            id: "ph-1-2-3", menuKey: "skel_1_2_3", mounts: [] },
          { code: "1.2.4", label: "Inquiry Status & History", slug: "status-history", path: "/crm/inquiry/status-history",
            desc: "memantau status berjalan dan riwayat perubahan tiap inquiry.",
            mounts: [
              { menuId: "crm-inquiry", path: "/crm/inquiry/status-history" },
            ] },
        ],
      },
      {
        code: "1.3", label: "Feasibility Assessment", slug: "feasibility",
        path: "/crm/feasibility", icon: ClipboardCheck,
        tabs: [
          { code: "1.3.1", label: "30-Point Feasibility Checklist", slug: "checklist", path: "/crm/feasibility/checklist",
            desc: "mengisi checklist kelayakan lengkap sebelum quotation dibuat.",
            id: "ph-1-3-1", menuKey: "skel_1_3_1", mounts: [] },
          { code: "1.3.2", label: "Preliminary Cost & Margin Estimation", slug: "cost-margin", path: "/crm/feasibility/cost-margin",
            desc: "menghitung estimasi biaya dan margin awal.",
            id: "ph-1-3-2", menuKey: "skel_1_3_2", mounts: [] },
          { code: "1.3.3", label: "Feasibility Recommendation", slug: "recommendation", path: "/crm/feasibility/recommendation",
            desc: "merumuskan rekomendasi layak, layak bersyarat, atau tidak layak.",
            id: "ph-1-3-3", menuKey: "skel_1_3_3", mounts: [] },
          { code: "1.3.4", label: "Feasibility Approval", slug: "approval", path: "/crm/feasibility/approval",
            desc: "meminta persetujuan sebelum proses lanjut ke quotation.",
            id: "ph-1-3-4", menuKey: "skel_1_3_4", mounts: [] },
        ],
      },
      {
        code: "1.4", label: "Quotation Management", slug: "quotation",
        path: "/crm/quotation", icon: Receipt,
        tabs: [
          { code: "1.4.1", label: "Quotation Builder", slug: "builder", path: "/crm/quotation/builder",
            desc: "menyusun rincian item, harga, dan term penawaran.",
            mounts: [
              { menuId: "quotation-draft", path: "/crm/quotation/builder" },
            ] },
          { code: "1.4.2", label: "Version & Revision History", slug: "version-history", path: "/crm/quotation/version-history",
            desc: "menyimpan versi dan riwayat revisi quotation.",
            id: "ph-1-4-2", menuKey: "skel_1_4_2", mounts: [] },
          { code: "1.4.3", label: "Pricing Approval Matrix", slug: "pricing-approval", path: "/crm/quotation/pricing-approval",
            desc: "meminta persetujuan harga sesuai kewenangan yang berlaku.",
            id: "ph-1-4-3", menuKey: "skel_1_4_3", mounts: [] },
          { code: "1.4.4", label: "Delivery & Read Status Tracking", slug: "delivery-status", path: "/crm/quotation/delivery-status",
            desc: "memantau status quotation terkirim, dibaca, atau disetujui customer.",
            id: "ph-1-4-4", menuKey: "skel_1_4_4", mounts: [] },
        ],
      },
      {
        code: "1.5", label: "Sales Order Management", slug: "sales-order",
        path: "/crm/sales-order", icon: ClipboardList,
        tabs: [
          { code: "1.5.1", label: "SO Generation from Approved Quotation", slug: "so-generation", path: "/crm/sales-order/so-generation",
            desc: "menerbitkan Sales Order otomatis dari quotation yang sudah disetujui (jalur freight MSI/JCI).",
            id: "ph-1-5-1", menuKey: "skel_1_5_1", mounts: [] },
          { code: "1.5.2", label: "SO Generation from Customer PO", slug: "customer-po", path: "/crm/sales-order/customer-po",
            desc: "mencatat Sales Order (SP) langsung dari PO customer tanpa melalui quotation (jalur trading Storbit).",
            mounts: [
              { menuId: "input", path: "/crm/sales-order/customer-po" },
            ] },
          { code: "1.5.3", label: "SO Status Tracking", slug: "status-tracking", path: "/crm/sales-order/status-tracking",
            desc: "memantau status SO (draft, dikonfirmasi, dibatalkan).",
            mounts: [
              { menuId: "crm-sales-order", path: "/crm/sales-order/status-tracking/msi", label: "Sales Order (MSI)" },
              { menuId: "manifest", path: "/crm/sales-order/status-tracking/storbit", label: "Surat Pesanan (Storbit)" },
              { menuId: "storbit-dashboard", path: "/crm/sales-order/status-tracking/ringkasan", label: "Ringkasan Storbit" },
              { menuId: "indomarco-dashboard", path: "/crm/sales-order/status-tracking/indomarco", label: "Indomarco" },
            ] },
          { code: "1.5.4", label: "SO Amendment History", slug: "amendment-history", path: "/crm/sales-order/amendment-history",
            desc: "mencatat riwayat perubahan SO setelah terbit.",
            id: "ph-1-5-4", menuKey: "skel_1_5_4", mounts: [] },
        ],
      },
      {
        code: "1.6", label: "Shipment Instruction Management", slug: "shipment-instruction",
        path: "/crm/shipment-instruction", icon: Ship,
        note: "export only, MSI",
        tabs: [
          { code: "1.6.1", label: "SI Detail Capture", slug: "si-detail", path: "/crm/shipment-instruction/si-detail",
            desc: "mencatat detail instruksi pengiriman export (consignee, notify party, marks and numbers).",
            id: "ph-1-6-1", menuKey: "skel_1_6_1", mounts: [] },
          { code: "1.6.2", label: "SI to SO/Quotation Linking", slug: "si-linking", path: "/crm/shipment-instruction/si-linking",
            desc: "menautkan SI ke quotation atau SO terkait.",
            id: "ph-1-6-2", menuKey: "skel_1_6_2", mounts: [] },
          { code: "1.6.3", label: "SI Completeness Status", slug: "si-completeness", path: "/crm/shipment-instruction/si-completeness",
            desc: "memantau kelengkapan data SI sebelum diteruskan ke operasional.",
            id: "ph-1-6-3", menuKey: "skel_1_6_3", mounts: [] },
        ],
      },
      {
        code: "1.7", label: "Pipeline & Deal Tracking", slug: "pipeline",
        path: "/crm/pipeline", icon: TrendingUp,
        tabs: [
          { code: "1.7.1", label: "Stage-based Pipeline Board", slug: "board", path: "/crm/pipeline/board",
            desc: "menampilkan progres deal per tahap dalam bentuk papan visual.",
            mounts: [
              { menuId: "crm-pipeline", path: "/crm/pipeline/board" },
            ] },
          { code: "1.7.2", label: "Win/Loss/Cancellation Tracking", slug: "win-loss", path: "/crm/pipeline/win-loss",
            desc: "mencatat hasil akhir deal beserta alasannya.",
            id: "ph-1-7-2", menuKey: "skel_1_7_2", mounts: [] },
          { code: "1.7.3", label: "Deal Aging & Follow-up Reminder", slug: "deal-aging", path: "/crm/pipeline/deal-aging",
            desc: "mengingatkan deal yang sudah lama tidak ada progres.",
            mounts: [
              { menuId: "crm-calls", path: "/crm/pipeline/deal-aging/schedule", label: "Jadwal & Tindak Lanjut" },
              { menuId: "crm-activity-log", path: "/crm/pipeline/deal-aging/log", label: "Log Aktivitas" },
              { menuId: "riwayat-visit", path: "/crm/pipeline/deal-aging/visit", label: "Kunjungan" },
            ] },
          { code: "1.7.4", label: "Sales Performance Dashboard", slug: "performance", path: "/crm/pipeline/performance",
            desc: "merangkum kinerja penjualan per sales atau tim.",
            mounts: [
              { menuId: "crm-dashboard", path: "/crm/pipeline/performance/team", label: "Ringkasan Tim" },
              { menuId: "reporting-sales", path: "/crm/pipeline/performance/sales-report", label: "Laporan Penjualan" },
            ] },
        ],
      },
      {
        code: "1.8", label: "Customer Master", slug: "customer",
        path: "/crm/customer", icon: Building2,
        tabs: [
          { code: "1.8.1", label: "Legal & Contact Data", slug: "legal-contact", path: "/crm/customer/legal-contact",
            desc: "menyimpan data legal dan kontak resmi customer.",
            mounts: [
              { menuId: "crm-customers", path: "/crm/customer/legal-contact" },
            ] },
          { code: "1.8.2", label: "Customer Payment Terms", slug: "payment-terms", path: "/crm/customer/payment-terms",
            desc: "merujuk term pembayaran spesifik customer dari master Finance & Accounting.",
            id: "ph-1-8-2", menuKey: "skel_1_8_2", mounts: [] },
          { code: "1.8.3", label: "Transaction History", slug: "transaction-history", path: "/crm/customer/transaction-history",
            desc: "menampilkan riwayat transaksi customer.",
            id: "ph-1-8-3", menuKey: "skel_1_8_3", mounts: [] },
          { code: "1.8.4", label: "Customer Tiering", slug: "tiering", path: "/crm/customer/tiering",
            desc: "mengelompokkan customer berdasarkan tingkat atau kategori.",
            id: "ph-1-8-4", menuKey: "skel_1_8_4", mounts: [] },
        ],
      },
      {
        code: "1.9", label: "Sales Target Master", slug: "sales-target",
        path: "/crm/sales-target", icon: BarChart2,
        note: "pindahan dari Admin Settings",
        tabs: [
          { code: "1.9.1", label: "Monthly Target per Salesperson", slug: "monthly-target", path: "/crm/sales-target/monthly-target",
            desc: "menetapkan target bulanan tiap sales.",
            id: "ph-1-9-1", menuKey: "skel_1_9_1", mounts: [] },
          { code: "1.9.2", label: "Target vs Actual Tracking", slug: "target-vs-actual", path: "/crm/sales-target/target-vs-actual",
            desc: "membandingkan pencapaian sales terhadap target.",
            id: "ph-1-9-2", menuKey: "skel_1_9_2", mounts: [] },
        ],
      },
      {
        code: "1.10", label: "Order Handover", slug: "order-handover",
        path: "/crm/order-handover", icon: ArrowUpDown,
        tabs: [
          { code: "1.10.1", label: "Cross-department Handover Checklist", slug: "handover-checklist", path: "/crm/order-handover/handover-checklist",
            desc: "memastikan seluruh syarat serah terima ke Procurement, Logistics, PPJK, dan Finance terpenuhi.",
            id: "ph-1-10-1", menuKey: "skel_1_10_1", mounts: [] },
          { code: "1.10.2", label: "Auto-attached Supporting Documents", slug: "supporting-documents", path: "/crm/order-handover/supporting-documents",
            desc: "melampirkan dokumen pendukung secara otomatis saat handover.",
            id: "ph-1-10-2", menuKey: "skel_1_10_2", mounts: [] },
          { code: "1.10.3", label: "Handover Notification", slug: "handover-notification", path: "/crm/order-handover/handover-notification",
            desc: "mengirim notifikasi handover ke tim terkait.",
            id: "ph-1-10-3", menuKey: "skel_1_10_3", mounts: [] },
        ],
      },
    ],
  },
  {
    no: 2, label: "Procurement", slug: "procurement", icon: ShoppingCart, tone: "peach",
    items: [
      {
        code: "2.1", label: "Vendor & Supplier Master", slug: "vendor",
        path: "/procurement/vendor", icon: UsersRound,
        tabs: [
          { code: "2.1.1", label: "Vendor Profile & Legal Data", slug: "profile", path: "/procurement/vendor/profile",
            desc: "menyimpan data profil dan legalitas vendor.",
            mounts: [
              { menuId: "proc-vendor-list", path: "/procurement/vendor/profile" },
            ] },
          { code: "2.1.2", label: "Vendor Category", slug: "category", path: "/procurement/vendor/category",
            desc: "mengelompokkan vendor berdasarkan jenis layanan (freight, trading, umum).",
            id: "ph-2-1-2", menuKey: "skel_2_1_2", mounts: [] },
          { code: "2.1.3", label: "Performance History & Rating", slug: "performance-history", path: "/procurement/vendor/performance-history",
            desc: "mencatat riwayat kinerja dan rating vendor.",
            id: "ph-2-1-3", menuKey: "skel_2_1_3", mounts: [] },
        ],
      },
      {
        code: "2.2", label: "Freight Rate Sourcing", slug: "rate-sourcing",
        path: "/procurement/rate-sourcing", icon: Tag,
        tabs: [
          { code: "2.2.1", label: "Multi-vendor Rate Request", slug: "rate-request", path: "/procurement/rate-sourcing/rate-request",
            desc: "meminta penawaran rate ke beberapa vendor sekaligus.",
            id: "ph-2-2-1", menuKey: "skel_2_2_1", mounts: [] },
          { code: "2.2.2", label: "Buy Rate Comparison", slug: "buy-rate-comparison", path: "/procurement/rate-sourcing/buy-rate-comparison",
            desc: "membandingkan harga beli antar vendor.",
            id: "ph-2-2-2", menuKey: "skel_2_2_2", mounts: [] },
          { code: "2.2.3", label: "Rate Card & Contract Management", slug: "rate-card", path: "/procurement/rate-sourcing/rate-card",
            desc: "mengelola kontrak dan rate card berkala per vendor.",
            mounts: [
              { menuId: "crm-rate-list", path: "/procurement/rate-sourcing/rate-card" },
            ] },
        ],
      },
      {
        code: "2.3", label: "Purchase Requisition (PRF)", slug: "prf",
        path: "/procurement/prf", icon: FileText,
        tabs: [
          { code: "2.3.1", label: "Requisition Form", slug: "requisition", path: "/procurement/prf/requisition",
            desc: "mengajukan permintaan pembelian internal.",
            mounts: [
              { menuId: "proc-inquiry-fwd-msi", path: "/procurement/prf/requisition/list", label: "Daftar Permintaan" },
              { menuId: "prf", path: "/procurement/prf/requisition/new", label: "Buat Permintaan" },
            ] },
          { code: "2.3.2", label: "Multi-level Approval", slug: "multi-level-approval", path: "/procurement/prf/multi-level-approval",
            desc: "memproses persetujuan berjenjang atas permintaan tersebut.",
            id: "ph-2-3-2", menuKey: "skel_2_3_2", mounts: [] },
          { code: "2.3.3", label: "Linking to Related Inquiry/Deal", slug: "linking", path: "/procurement/prf/linking",
            desc: "menautkan permintaan ke inquiry atau deal terkait.",
            mounts: [
              { menuId: "proc-sales-order", path: "/procurement/prf/linking" },
            ] },
        ],
      },
      {
        code: "2.4", label: "Purchase Order", slug: "purchase-order",
        path: "/procurement/purchase-order", icon: ScrollText,
        tabs: [
          { code: "2.4.1", label: "PO Issuance from Approved Requisition", slug: "issuance", path: "/procurement/purchase-order/issuance",
            desc: "menerbitkan PO dari requisition yang sudah disetujui.",
            mounts: [
              { menuId: "purchaseOrder", path: "/procurement/purchase-order/issuance" },
            ] },
          { code: "2.4.2", label: "PO Status Tracking", slug: "status-tracking", path: "/procurement/purchase-order/status-tracking",
            desc: "memantau status PO (terbit, diterima, selesai).",
            id: "ph-2-4-2", menuKey: "skel_2_4_2", mounts: [] },
          { code: "2.4.3", label: "PO Document & Attachments", slug: "documents", path: "/procurement/purchase-order/documents",
            desc: "menyimpan dokumen dan lampiran PO.",
            id: "ph-2-4-3", menuKey: "skel_2_4_3", mounts: [] },
        ],
      },
      {
        code: "2.5", label: "Trading Procurement", slug: "trading",
        path: "/procurement/trading", icon: ShoppingCart,
        tabs: [
          { code: "2.5.1", label: "Merchandise Purchase Order", slug: "merchandise-po", path: "/procurement/trading/merchandise-po",
            desc: "menerbitkan PO khusus barang dagangan Storbit.",
            mounts: [
              { menuId: "trading", path: "/procurement/trading/merchandise-po" },
            ] },
          { code: "2.5.2", label: "Supplier Delivery Schedule", slug: "delivery-schedule", path: "/procurement/trading/delivery-schedule",
            desc: "memantau jadwal kedatangan barang dari supplier.",
            id: "ph-2-5-2", menuKey: "skel_2_5_2", mounts: [] },
          { code: "2.5.3", label: "Linking to Goods Receiving", slug: "goods-receiving-link", path: "/procurement/trading/goods-receiving-link",
            desc: "menautkan PO ke proses penerimaan barang di gudang.",
            id: "ph-2-5-3", menuKey: "skel_2_5_3", mounts: [] },
        ],
      },
      {
        code: "2.6", label: "Vendor Performance Evaluation", slug: "vendor-performance",
        path: "/procurement/vendor-performance", icon: BarChart3,
        tabs: [
          { code: "2.6.1", label: "Periodic Evaluation Form", slug: "evaluation-form", path: "/procurement/vendor-performance/evaluation-form",
            desc: "menilai kinerja vendor secara berkala.",
            id: "ph-2-6-1", menuKey: "skel_2_6_1", mounts: [] },
          { code: "2.6.2", label: "Price/Time/Quality Scorecard", slug: "scorecard", path: "/procurement/vendor-performance/scorecard",
            desc: "memberi skor vendor dari sisi harga, waktu, dan kualitas.",
            id: "ph-2-6-2", menuKey: "skel_2_6_2", mounts: [] },
          { code: "2.6.3", label: "Vendor Blacklist/Watchlist", slug: "blacklist", path: "/procurement/vendor-performance/blacklist",
            desc: "mencatat vendor yang perlu diwaspadai atau dihentikan kerjasamanya.",
            id: "ph-2-6-3", menuKey: "skel_2_6_3", mounts: [] },
        ],
      },
    ],
  },
  {
    no: 3, label: "Logistics & Warehouse", slug: "logistics-warehouse", icon: Truck, tone: "teal",
    items: [
      {
        code: "3.1", label: "Job Order Management", slug: "job-order",
        path: "/logistics-warehouse/freight/job-order", icon: BriefcaseBusiness,
        subgroup: "Freight & Delivery Operations",
        tabs: [
          { code: "3.1.1", label: "JO Generation from SO/SI", slug: "generation", path: "/logistics-warehouse/freight/job-order/generation",
            desc: "menerbitkan Job Order dari Sales Order atau Shipment Instruction.",
            mounts: [
              { menuId: "job", path: "/logistics-warehouse/freight/job-order/generation" },
            ] },
          { code: "3.1.2", label: "Vendor & Sub-process Assignment", slug: "vendor-assignment", path: "/logistics-warehouse/freight/job-order/vendor-assignment",
            desc: "menetapkan vendor trucking dan mereferensikan proses Console/PPJK terkait.",
            id: "ph-3-1-2", menuKey: "skel_3_1_2", mounts: [] },
          { code: "3.1.3", label: "Job Costing Basis", slug: "costing-basis", path: "/logistics-warehouse/freight/job-order/costing-basis",
            desc: "menjadi dasar perhitungan biaya operasional per Job Order.",
            id: "ph-3-1-3", menuKey: "skel_3_1_3", mounts: [] },
        ],
      },
      {
        code: "3.2", label: "Export Packing List Management", slug: "export-packing-list",
        path: "/logistics-warehouse/freight/export-packing-list", icon: Package,
        subgroup: "Freight & Delivery Operations",
        tabs: [
          { code: "3.2.1", label: "Packing List Generation", slug: "generation", path: "/logistics-warehouse/freight/export-packing-list/generation",
            desc: "menyusun rincian berat, dimensi, dan jumlah kemasan untuk keperluan export.",
            id: "ph-3-2-1", menuKey: "skel_3_2_1", mounts: [] },
          { code: "3.2.2", label: "Linking to Job Order & Commercial Invoice", slug: "linking", path: "/logistics-warehouse/freight/export-packing-list/linking",
            desc: "menautkan Packing List ke Job Order dan Commercial Invoice.",
            id: "ph-3-2-2", menuKey: "skel_3_2_2", mounts: [] },
          { code: "3.2.3", label: "Reference Feed to Console & PPJK", slug: "reference-feed", path: "/logistics-warehouse/freight/export-packing-list/reference-feed",
            desc: "menyediakan data Packing List untuk Master Manifest dan dokumen customs.",
            id: "ph-3-2-3", menuKey: "skel_3_2_3", mounts: [] },
        ],
      },
      {
        code: "3.3", label: "Shipment Execution", slug: "shipment-execution",
        path: "/logistics-warehouse/freight/shipment-execution", icon: Truck,
        subgroup: "Freight & Delivery Operations",
        tabs: [
          { code: "3.3.1", label: "Pickup & Delivery Scheduling", slug: "scheduling", path: "/logistics-warehouse/freight/shipment-execution/scheduling",
            desc: "menjadwalkan pengambilan dan pengiriman barang.",
            id: "ph-3-3-1", menuKey: "skel_3_3_1", mounts: [] },
          { code: "3.3.2", label: "Vehicle/Vendor Assignment", slug: "vehicle-assignment", path: "/logistics-warehouse/freight/shipment-execution/vehicle-assignment",
            desc: "menetapkan kendaraan atau vendor angkutan yang bertugas.",
            id: "ph-3-3-2", menuKey: "skel_3_3_2", mounts: [] },
          { code: "3.3.3", label: "Shipment Status Tracking", slug: "status-tracking", path: "/logistics-warehouse/freight/shipment-execution/status-tracking",
            desc: "memantau status perjalanan pengiriman.",
            id: "ph-3-3-3", menuKey: "skel_3_3_3", mounts: [] },
        ],
      },
      {
        code: "3.4", label: "Fleet & Trucking Management", slug: "fleet-trucking",
        path: "/logistics-warehouse/freight/fleet-trucking", icon: Car,
        subgroup: "Freight & Delivery Operations",
        tabs: [
          { code: "3.4.1", label: "Fleet/Vendor Master", slug: "fleet-master", path: "/logistics-warehouse/freight/fleet-trucking/fleet-master",
            desc: "menyimpan data armada dan vendor trucking.",
            id: "ph-3-4-1", menuKey: "skel_3_4_1", mounts: [] },
          { code: "3.4.2", label: "Vehicle Scheduling & Allocation", slug: "vehicle-scheduling", path: "/logistics-warehouse/freight/fleet-trucking/vehicle-scheduling",
            desc: "mengatur jadwal dan alokasi kendaraan.",
            id: "ph-3-4-2", menuKey: "skel_3_4_2", mounts: [] },
          { code: "3.4.3", label: "Trip Cost Recording", slug: "trip-cost", path: "/logistics-warehouse/freight/fleet-trucking/trip-cost",
            desc: "mencatat biaya per perjalanan angkutan.",
            id: "ph-3-4-3", menuKey: "skel_3_4_3", mounts: [] },
        ],
      },
      {
        code: "3.5", label: "Proof of Delivery & Receipt Confirmation", slug: "proof-of-delivery",
        path: "/logistics-warehouse/freight/proof-of-delivery", icon: CheckCircle2,
        subgroup: "Freight & Delivery Operations",
        tabs: [
          { code: "3.5.1", label: "Delivery Confirmation Capture", slug: "delivery-confirmation", path: "/logistics-warehouse/freight/proof-of-delivery/delivery-confirmation",
            desc: "merekam data penerima, waktu, dan kondisi barang saat diterima.",
            id: "ph-3-5-1", menuKey: "skel_3_5_1", mounts: [] },
          { code: "3.5.2", label: "Photo/Document Evidence Upload", slug: "evidence-upload", path: "/logistics-warehouse/freight/proof-of-delivery/evidence-upload",
            desc: "mengunggah foto atau dokumen bukti serah terima.",
            id: "ph-3-5-2", menuKey: "skel_3_5_2", mounts: [] },
          { code: "3.5.3", label: "Auto BTB Generation & Delivery Note Status Update", slug: "auto-btb", path: "/logistics-warehouse/freight/proof-of-delivery/auto-btb",
            desc: "menerbitkan BTB otomatis dan memperbarui status Surat Jalan begitu konfirmasi masuk.",
            id: "ph-3-5-3", menuKey: "skel_3_5_3", mounts: [] },
        ],
      },
      {
        code: "3.6", label: "Goods Receiving", slug: "goods-receiving",
        path: "/logistics-warehouse/warehouse/goods-receiving", icon: Download,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.6.1", label: "Receiving Form", slug: "form", path: "/logistics-warehouse/warehouse/goods-receiving/form",
            desc: "mencatat penerimaan barang masuk gudang.",
            mounts: [
              { menuId: "inventory-penerimaan", path: "/logistics-warehouse/warehouse/goods-receiving/form" },
            ] },
          { code: "3.6.2", label: "PO/Inbound Document Matching", slug: "po-matching", path: "/logistics-warehouse/warehouse/goods-receiving/po-matching",
            desc: "mencocokkan barang masuk dengan PO atau dokumen terkait.",
            id: "ph-3-6-2", menuKey: "skel_3_6_2", mounts: [] },
          { code: "3.6.3", label: "Put-away to Storage Location", slug: "put-away", path: "/logistics-warehouse/warehouse/goods-receiving/put-away",
            desc: "menempatkan barang ke lokasi simpan yang sesuai.",
            id: "ph-3-6-3", menuKey: "skel_3_6_3", mounts: [] },
        ],
      },
      {
        code: "3.7", label: "Warehouse & Bin Management", slug: "bin-management",
        path: "/logistics-warehouse/warehouse/bin-management", icon: Boxes,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.7.1", label: "Distribution Center (DC) Master", slug: "dc-master", path: "/logistics-warehouse/warehouse/bin-management/dc-master",
            desc: "menyimpan data distribution center tempat barang disimpan atau dikirim (pindahan dari Admin Settings).",
            mounts: [
              { menuId: "dc-master", path: "/logistics-warehouse/warehouse/bin-management/dc-master" },
            ] },
          { code: "3.7.2", label: "Warehouse & Zone Master", slug: "warehouse-zone", path: "/logistics-warehouse/warehouse/bin-management/warehouse-zone",
            desc: "mengelola data gudang dan pembagian zona di dalamnya.",
            id: "ph-3-7-2", menuKey: "skel_3_7_2", mounts: [] },
          { code: "3.7.3", label: "Rack/Bin Structure", slug: "rack-bin", path: "/logistics-warehouse/warehouse/bin-management/rack-bin",
            desc: "mengatur struktur rak dan bin penyimpanan.",
            id: "ph-3-7-3", menuKey: "skel_3_7_3", mounts: [] },
          { code: "3.7.4", label: "Location Capacity & Utilization", slug: "capacity", path: "/logistics-warehouse/warehouse/bin-management/capacity",
            desc: "memantau kapasitas dan tingkat pemakaian tiap lokasi.",
            id: "ph-3-7-4", menuKey: "skel_3_7_4", mounts: [] },
        ],
      },
      {
        code: "3.8", label: "Wave & Dispatch Planning", slug: "wave-dispatch",
        path: "/logistics-warehouse/warehouse/wave-dispatch", icon: Calendar,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.8.1", label: "Order Grouping by Route/Zone/Priority", slug: "order-grouping", path: "/logistics-warehouse/warehouse/wave-dispatch/order-grouping",
            desc: "mengelompokkan beberapa order jadi satu gelombang kerja gudang.",
            id: "ph-3-8-1", menuKey: "skel_3_8_1", mounts: [] },
          { code: "3.8.2", label: "Wave Release to Picking", slug: "wave-release", path: "/logistics-warehouse/warehouse/wave-dispatch/wave-release",
            desc: "melepas gelombang kerja yang sudah siap ke proses picking.",
            id: "ph-3-8-2", menuKey: "skel_3_8_2", mounts: [] },
          { code: "3.8.3", label: "Wave Status Tracking", slug: "wave-status", path: "/logistics-warehouse/warehouse/wave-dispatch/wave-status",
            desc: "memantau progres tiap gelombang kerja.",
            id: "ph-3-8-3", menuKey: "skel_3_8_3", mounts: [] },
        ],
      },
      {
        code: "3.9", label: "Picking & Packing", slug: "picking-packing",
        path: "/logistics-warehouse/warehouse/picking-packing", icon: ClipboardList,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.9.1", label: "Picking List Generation", slug: "generation", path: "/logistics-warehouse/warehouse/picking-packing/generation",
            desc: "menerbitkan daftar pengambilan barang dari hasil wave planning.",
            mounts: [
              { menuId: "picking", path: "/logistics-warehouse/warehouse/picking-packing/generation" },
            ] },
          { code: "3.9.2", label: "Real-time Picked Quantity Update", slug: "picked-quantity", path: "/logistics-warehouse/warehouse/picking-packing/picked-quantity",
            desc: "memperbarui jumlah barang yang sudah diambil secara langsung.",
            id: "ph-3-9-2", menuKey: "skel_3_9_2", mounts: [] },
          { code: "3.9.3", label: "Packing & Shipping Label", slug: "packing-label", path: "/logistics-warehouse/warehouse/picking-packing/packing-label",
            desc: "mengemas barang dan mencetak label pengiriman.",
            id: "ph-3-9-3", menuKey: "skel_3_9_3", mounts: [] },
        ],
      },
      {
        code: "3.10", label: "Delivery Note (Surat Jalan) Management", slug: "delivery-note",
        path: "/logistics-warehouse/warehouse/delivery-note", icon: Truck,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.10.1", label: "Delivery Note Issuance from Completed Picking", slug: "issuance", path: "/logistics-warehouse/warehouse/delivery-note/issuance",
            desc: "menerbitkan Surat Jalan begitu proses picking selesai.",
            mounts: [
              { menuId: "surat-jalan", path: "/logistics-warehouse/warehouse/delivery-note/issuance" },
            ] },
          { code: "3.10.2", label: "Delivery Note Status", slug: "status", path: "/logistics-warehouse/warehouse/delivery-note/status",
            desc: "memantau status Surat Jalan dari terbit, dalam perjalanan, sampai diterima.",
            mounts: [
              { menuId: "shipment", path: "/logistics-warehouse/warehouse/delivery-note/status" },
            ] },
          { code: "3.10.3", label: "Delivery Note Print & Digital Copy", slug: "print-digital-copy", path: "/logistics-warehouse/warehouse/delivery-note/print-digital-copy",
            desc: "mencetak atau menyimpan salinan digital Surat Jalan.",
            id: "ph-3-10-3", menuKey: "skel_3_10_3", mounts: [] },
        ],
      },
      {
        code: "3.11", label: "Stock Transfer", slug: "stock-transfer",
        path: "/logistics-warehouse/warehouse/stock-transfer", icon: ArrowUpDown,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.11.1", label: "Inter-location/Warehouse Transfer Form", slug: "form", path: "/logistics-warehouse/warehouse/stock-transfer/form",
            desc: "mengajukan perpindahan stok antar lokasi atau gudang.",
            mounts: [
              { menuId: "inventory-transfer", path: "/logistics-warehouse/warehouse/stock-transfer/form" },
            ] },
          { code: "3.11.2", label: "Transfer Approval", slug: "approval", path: "/logistics-warehouse/warehouse/stock-transfer/approval",
            desc: "meminta persetujuan sebelum perpindahan stok dieksekusi.",
            id: "ph-3-11-2", menuKey: "skel_3_11_2", mounts: [] },
          { code: "3.11.3", label: "Transfer Audit Trail", slug: "audit-trail", path: "/logistics-warehouse/warehouse/stock-transfer/audit-trail",
            desc: "mencatat jejak setiap perpindahan stok yang terjadi.",
            id: "ph-3-11-3", menuKey: "skel_3_11_3", mounts: [] },
        ],
      },
      {
        code: "3.12", label: "Stock Opname (Cycle Count)", slug: "stock-opname",
        path: "/logistics-warehouse/warehouse/stock-opname", icon: ClipboardCheck,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.12.1", label: "Periodic Count Schedule", slug: "schedule", path: "/logistics-warehouse/warehouse/stock-opname/schedule",
            desc: "menjadwalkan penghitungan stok fisik secara berkala.",
            mounts: [
              { menuId: "inventory-opname", path: "/logistics-warehouse/warehouse/stock-opname/schedule" },
            ] },
          { code: "3.12.2", label: "Physical Count Entry", slug: "physical-count", path: "/logistics-warehouse/warehouse/stock-opname/physical-count",
            desc: "mencatat hasil hitung fisik ke sistem.",
            id: "ph-3-12-2", menuKey: "skel_3_12_2", mounts: [] },
          { code: "3.12.3", label: "Variance Report & Adjustment", slug: "variance-report", path: "/logistics-warehouse/warehouse/stock-opname/variance-report",
            desc: "melaporkan selisih dan melakukan penyesuaian stok.",
            id: "ph-3-12-3", menuKey: "skel_3_12_3", mounts: [] },
        ],
      },
      {
        code: "3.13", label: "Stock Dashboard & Replenishment", slug: "stock-dashboard",
        path: "/logistics-warehouse/warehouse/stock-dashboard", icon: LayoutDashboard,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.13.1", label: "Real-time Stock Balance Dashboard", slug: "balance", path: "/logistics-warehouse/warehouse/stock-dashboard/balance",
            desc: "menampilkan saldo stok terkini.",
            mounts: [
              { menuId: "inventory-dashboard", path: "/logistics-warehouse/warehouse/stock-dashboard/balance/summary", label: "Ringkasan Stok" },
              { menuId: "inventory-stok", path: "/logistics-warehouse/warehouse/stock-dashboard/balance/products", label: "Rincian per Produk" },
            ] },
          { code: "3.13.2", label: "Reorder Point Alert", slug: "reorder-alert", path: "/logistics-warehouse/warehouse/stock-dashboard/reorder-alert",
            desc: "memberi peringatan saat stok mendekati titik pemesanan ulang.",
            id: "ph-3-13-2", menuKey: "skel_3_13_2", mounts: [] },
          { code: "3.13.3", label: "Dead/Slow-moving Stock Report", slug: "dead-stock", path: "/logistics-warehouse/warehouse/stock-dashboard/dead-stock",
            desc: "melaporkan produk yang stoknya mati atau bergerak lambat.",
            id: "ph-3-13-3", menuKey: "skel_3_13_3", mounts: [] },
        ],
      },
      {
        code: "3.14", label: "Barcode & Label Management", slug: "barcode-label",
        path: "/logistics-warehouse/warehouse/barcode-label", icon: Tag,
        subgroup: "Warehouse & Inventory Operations",
        tabs: [
          { code: "3.14.1", label: "SKU & Location Label Generation", slug: "label-generation", path: "/logistics-warehouse/warehouse/barcode-label/label-generation",
            desc: "mencetak label SKU dan lokasi penyimpanan.",
            id: "ph-3-14-1", menuKey: "skel_3_14_1", mounts: [] },
          { code: "3.14.2", label: "Scanner/Mobile App Integration", slug: "scanner-integration", path: "/logistics-warehouse/warehouse/barcode-label/scanner-integration",
            desc: "mengintegrasikan proses gudang dengan alat pindai atau aplikasi mobile.",
            id: "ph-3-14-2", menuKey: "skel_3_14_2", mounts: [] },
          { code: "3.14.3", label: "Scan Transaction Log", slug: "scan-log", path: "/logistics-warehouse/warehouse/barcode-label/scan-log",
            desc: "mencatat riwayat setiap transaksi hasil pindaian.",
            id: "ph-3-14-3", menuKey: "skel_3_14_3", mounts: [] },
        ],
      },
    ],
  },
  {
    no: 4, label: "Console", slug: "console", icon: Boxes, tone: "violet",
    items: [
      {
        code: "4.1", label: "Consolidation Planning", slug: "consolidation-planning",
        path: "/console/consolidation-planning", icon: Boxes,
        tabs: [
          { code: "4.1.1", label: "Cargo Consolidation Plan per Route/Schedule", slug: "cargo-plan", path: "/console/consolidation-planning/cargo-plan",
            desc: "merencanakan penggabungan cargo berdasarkan rute dan jadwal.",
            id: "ph-4-1-1", menuKey: "skel_4_1_1", mounts: [] },
          { code: "4.1.2", label: "Space Allocation per Shipment", slug: "space-allocation", path: "/console/consolidation-planning/space-allocation",
            desc: "mengalokasikan ruang untuk tiap shipment.",
            id: "ph-4-1-2", menuKey: "skel_4_1_2", mounts: [] },
          { code: "4.1.3", label: "Container/Aircraft Capacity Simulation", slug: "capacity-simulation", path: "/console/consolidation-planning/capacity-simulation",
            desc: "mensimulasikan kapasitas container atau pesawat sebelum booking.",
            id: "ph-4-1-3", menuKey: "skel_4_1_3", mounts: [] },
        ],
      },
      {
        code: "4.2", label: "Space Booking", slug: "space-booking",
        path: "/console/space-booking", icon: Calendar,
        tabs: [
          { code: "4.2.1", label: "Booking to Shipping Line/Airline", slug: "booking", path: "/console/space-booking/booking",
            desc: "memesan ruang ke pelayaran atau maskapai.",
            id: "ph-4-2-1", menuKey: "skel_4_2_1", mounts: [] },
          { code: "4.2.2", label: "Booking Confirmation & Amendment", slug: "confirmation", path: "/console/space-booking/confirmation",
            desc: "mengonfirmasi atau mengubah booking yang sudah dibuat.",
            id: "ph-4-2-2", menuKey: "skel_4_2_2", mounts: [] },
          { code: "4.2.3", label: "Vendor Booking History", slug: "vendor-history", path: "/console/space-booking/vendor-history",
            desc: "mencatat riwayat booking per vendor.",
            id: "ph-4-2-3", menuKey: "skel_4_2_3", mounts: [] },
        ],
      },
      {
        code: "4.3", label: "Master Manifest", slug: "master-manifest",
        path: "/console/master-manifest", icon: LayoutList,
        tabs: [
          { code: "4.3.1", label: "House Bill of Lading (HBL)", slug: "hbl", path: "/console/master-manifest/hbl",
            desc: "menerbitkan dokumen HBL.",
            id: "ph-4-3-1", menuKey: "skel_4_3_1", mounts: [] },
          { code: "4.3.2", label: "Master Bill of Lading (MBL)", slug: "mbl", path: "/console/master-manifest/mbl",
            desc: "menerbitkan dokumen MBL.",
            id: "ph-4-3-2", menuKey: "skel_4_3_2", mounts: [] },
          { code: "4.3.3", label: "HBL vs MBL Reconciliation", slug: "reconciliation", path: "/console/master-manifest/reconciliation",
            desc: "mencocokkan kesesuaian data HBL dengan MBL.",
            id: "ph-4-3-3", menuKey: "skel_4_3_3", mounts: [] },
        ],
      },
      {
        code: "4.4", label: "Agent & Partner Management", slug: "agent-partner",
        path: "/console/agent-partner", icon: Globe,
        tabs: [
          { code: "4.4.1", label: "Overseas Agent/Partner Master", slug: "agent-master", path: "/console/agent-partner/agent-master",
            desc: "menyimpan data agen atau mitra di luar negeri.",
            id: "ph-4-4-1", menuKey: "skel_4_4_1", mounts: [] },
          { code: "4.4.2", label: "Agreement & Commission Terms", slug: "agreement-commission", path: "/console/agent-partner/agreement-commission",
            desc: "mengelola perjanjian dan skema komisi kerjasama.",
            id: "ph-4-4-2", menuKey: "skel_4_4_2", mounts: [] },
          { code: "4.4.3", label: "Collaboration History per Shipment", slug: "collaboration-history", path: "/console/agent-partner/collaboration-history",
            desc: "mencatat riwayat kerjasama per shipment.",
            id: "ph-4-4-3", menuKey: "skel_4_4_3", mounts: [] },
        ],
      },
    ],
  },
  {
    no: 5, label: "PPJK (Customs)", slug: "ppjk", icon: FileCheck, tone: "blue",
    items: [
      {
        code: "5.1", label: "Tariff Classification", slug: "tariff-classification",
        path: "/ppjk/tariff-classification", icon: Tag,
        tabs: [
          { code: "5.1.1", label: "HS Code Database", slug: "hs-code", path: "/ppjk/tariff-classification/hs-code",
            desc: "menyimpan basis data HS Code.",
            id: "ph-5-1-1", menuKey: "skel_5_1_1", mounts: [] },
          { code: "5.1.2", label: "Classification Proposal per Item", slug: "classification-proposal", path: "/ppjk/tariff-classification/classification-proposal",
            desc: "mengusulkan klasifikasi tarif untuk tiap barang.",
            id: "ph-5-1-2", menuKey: "skel_5_1_2", mounts: [] },
          { code: "5.1.3", label: "Classification Decision History", slug: "decision-history", path: "/ppjk/tariff-classification/decision-history",
            desc: "mencatat riwayat keputusan klasifikasi.",
            id: "ph-5-1-3", menuKey: "skel_5_1_3", mounts: [] },
        ],
      },
      {
        code: "5.2", label: "Regulatory & Licensing Check", slug: "regulatory-licensing",
        path: "/ppjk/regulatory-licensing", icon: ShieldCheck,
        tabs: [
          { code: "5.2.1", label: "Licensing Checklist", slug: "licensing-checklist", path: "/ppjk/regulatory-licensing/licensing-checklist",
            desc: "memeriksa kelengkapan izin seperti NIB, API, dan Lartas.",
            id: "ph-5-2-1", menuKey: "skel_5_2_1", mounts: [] },
          { code: "5.2.2", label: "Document Completeness Status", slug: "completeness-status", path: "/ppjk/regulatory-licensing/completeness-status",
            desc: "memantau status kelengkapan dokumen regulasi.",
            id: "ph-5-2-2", menuKey: "skel_5_2_2", mounts: [] },
          { code: "5.2.3", label: "License Expiry Reminder", slug: "expiry-reminder", path: "/ppjk/regulatory-licensing/expiry-reminder",
            desc: "mengingatkan masa berlaku izin yang mendekati habis.",
            id: "ph-5-2-3", menuKey: "skel_5_2_3", mounts: [] },
        ],
      },
      {
        code: "5.3", label: "Duty & Tax Estimation", slug: "duty-tax-estimation",
        path: "/ppjk/duty-tax-estimation", icon: Landmark,
        tabs: [
          { code: "5.3.1", label: "Import Duty & Tax Calculator", slug: "duty-calculator", path: "/ppjk/duty-tax-estimation/duty-calculator",
            desc: "menghitung estimasi bea masuk dan pajak impor.",
            id: "ph-5-3-1", menuKey: "skel_5_3_1", mounts: [] },
          { code: "5.3.2", label: "Tariff Scenario Simulation", slug: "scenario-simulation", path: "/ppjk/duty-tax-estimation/scenario-simulation",
            desc: "mensimulasikan berbagai skenario tarif.",
            id: "ph-5-3-2", menuKey: "skel_5_3_2", mounts: [] },
          { code: "5.3.3", label: "Estimation History per Shipment", slug: "estimation-history", path: "/ppjk/duty-tax-estimation/estimation-history",
            desc: "mencatat riwayat estimasi per shipment.",
            id: "ph-5-3-3", menuKey: "skel_5_3_3", mounts: [] },
        ],
      },
      {
        code: "5.4", label: "Customs Document Processing", slug: "customs-document",
        path: "/ppjk/customs-document", icon: FileCheck,
        tabs: [
          { code: "5.4.1", label: "PIB/PEB Submission", slug: "submission", path: "/ppjk/customs-document/submission",
            desc: "mengajukan dokumen PIB atau PEB ke Bea Cukai.",
            id: "ph-5-4-1", menuKey: "skel_5_4_1", mounts: [] },
          { code: "5.4.2", label: "Clearance Status Tracking", slug: "clearance-status", path: "/ppjk/customs-document/clearance-status",
            desc: "memantau status proses di Bea Cukai.",
            id: "ph-5-4-2", menuKey: "skel_5_4_2", mounts: [] },
          { code: "5.4.3", label: "Customs Document Archive", slug: "archive", path: "/ppjk/customs-document/archive",
            desc: "mengarsipkan dokumen kepabeanan.",
            id: "ph-5-4-3", menuKey: "skel_5_4_3", mounts: [] },
        ],
      },
      {
        code: "5.5", label: "Inspection Risk Assessment", slug: "inspection-risk",
        path: "/ppjk/inspection-risk", icon: Search,
        tabs: [
          { code: "5.5.1", label: "Lane Prediction", slug: "lane-prediction", path: "/ppjk/inspection-risk/lane-prediction",
            desc: "memprediksi jalur pemeriksaan (hijau, kuning, merah).",
            id: "ph-5-5-1", menuKey: "skel_5_5_1", mounts: [] },
          { code: "5.5.2", label: "Prior Inspection History", slug: "prior-inspection", path: "/ppjk/inspection-risk/prior-inspection",
            desc: "mencatat riwayat pemeriksaan sebelumnya.",
            id: "ph-5-5-2", menuKey: "skel_5_5_2", mounts: [] },
          { code: "5.5.3", label: "Inspection Follow-up Notes", slug: "follow-up-notes", path: "/ppjk/inspection-risk/follow-up-notes",
            desc: "mencatat tindak lanjut hasil pemeriksaan.",
            id: "ph-5-5-3", menuKey: "skel_5_5_3", mounts: [] },
        ],
      },
      {
        code: "5.6", label: "Compliance Risk Review", slug: "compliance-risk",
        path: "/ppjk/compliance-risk", icon: Shield,
        tabs: [
          { code: "5.6.1", label: "Compliance Risk Score per Shipment", slug: "risk-score", path: "/ppjk/compliance-risk/risk-score",
            desc: "menilai skor risiko kepatuhan tiap shipment.",
            id: "ph-5-6-1", menuKey: "skel_5_6_1", mounts: [] },
          { code: "5.6.2", label: "Findings & Follow-up Register", slug: "findings-register", path: "/ppjk/compliance-risk/findings-register",
            desc: "mencatat temuan dan tindak lanjutnya.",
            id: "ph-5-6-2", menuKey: "skel_5_6_2", mounts: [] },
          { code: "5.6.3", label: "Periodic Compliance Report", slug: "periodic-report", path: "/ppjk/compliance-risk/periodic-report",
            desc: "menyusun laporan kepatuhan berkala.",
            id: "ph-5-6-3", menuKey: "skel_5_6_3", mounts: [] },
        ],
      },
    ],
  },
  {
    no: 6, label: "Finance & Accounting", slug: "finance-accounting", icon: CreditCard, tone: "green",
    items: [
      {
        code: "6.1", label: "Cash & Bank Management", slug: "cash-bank",
        path: "/finance-accounting/cash-bank", icon: Landmark,
        tabs: [
          { code: "6.1.1", label: "Cash & Bank Position Dashboard", slug: "position", path: "/finance-accounting/cash-bank/position",
            desc: "menampilkan posisi kas dan bank terkini.",
            mounts: [
              { menuId: "cashBank", path: "/finance-accounting/cash-bank/position" },
            ] },
          { code: "6.1.2", label: "Cash Flow Projection", slug: "cash-flow", path: "/finance-accounting/cash-bank/cash-flow",
            desc: "memproyeksikan arus kas ke depan.",
            id: "ph-6-1-2", menuKey: "skel_6_1_2", mounts: [] },
          { code: "6.1.3", label: "Bank Reconciliation", slug: "reconciliation", path: "/finance-accounting/cash-bank/reconciliation",
            desc: "mencocokkan catatan kas dengan mutasi bank.",
            id: "ph-6-1-3", menuKey: "skel_6_1_3", mounts: [] },
          { code: "6.1.4", label: "Payroll Disbursement", slug: "payroll-disbursement", path: "/finance-accounting/cash-bank/payroll-disbursement",
            desc: "mengeksekusi pembayaran gaji dan pembukuannya, menerima data perhitungan dari Payroll Administration di HCGA (lihat 7.7).",
            id: "ph-6-1-4", menuKey: "skel_6_1_4", mounts: [] },
        ],
      },
      {
        code: "6.2", label: "Accounts Receivable", slug: "accounts-receivable",
        path: "/finance-accounting/accounts-receivable", icon: Wallet,
        tabs: [
          { code: "6.2.1", label: "Invoice Management", slug: "invoice", path: "/finance-accounting/accounts-receivable/invoice",
            desc: "mengelola penerbitan dan pencatatan invoice.",
            id: "ph-6-2-1", menuKey: "skel_6_2_1", mounts: [] },
          { code: "6.2.2", label: "Invoice Submission & Acknowledgement (TTF / Customer System Confirmation)", slug: "submission", path: "/finance-accounting/accounts-receivable/submission",
            desc: "mencatat gerbang wajib sebelum invoice berstatus siap ditagih.",
            mounts: [
              { menuId: "finance", path: "/finance-accounting/accounts-receivable/submission" },
            ] },
          { code: "6.2.3", label: "AR Aging", slug: "aging", path: "/finance-accounting/accounts-receivable/aging",
            desc: "memantau umur piutang yang belum tertagih.",
            mounts: [
              { menuId: "outstanding", path: "/finance-accounting/accounts-receivable/aging" },
            ] },
          { code: "6.2.4", label: "Payment & Collection Tracking", slug: "collection", path: "/finance-accounting/accounts-receivable/collection",
            desc: "memantau proses penagihan dan pembayaran masuk.",
            mounts: [
              { menuId: "ar", path: "/finance-accounting/accounts-receivable/collection" },
            ] },
        ],
      },
      {
        code: "6.3", label: "Accounts Payable", slug: "accounts-payable",
        path: "/finance-accounting/accounts-payable", icon: Wallet,
        tabs: [
          { code: "6.3.1", label: "Vendor Bill Intake", slug: "bill-intake", path: "/finance-accounting/accounts-payable/bill-intake",
            desc: "mencatat tagihan yang masuk dari vendor.",
            mounts: [
              { menuId: "ap", path: "/finance-accounting/accounts-payable/bill-intake" },
            ] },
          { code: "6.3.2", label: "3-Way Matching (PO vs Goods Receiving vs Vendor Bill)", slug: "three-way-matching", path: "/finance-accounting/accounts-payable/three-way-matching",
            desc: "mencocokkan tiga sumber sebelum tagihan vendor dibayar.",
            id: "ph-6-3-2", menuKey: "skel_6_3_2", mounts: [] },
          { code: "6.3.3", label: "Payment Scheduling & Approval", slug: "payment-scheduling", path: "/finance-accounting/accounts-payable/payment-scheduling",
            desc: "menjadwalkan dan menyetujui pembayaran ke vendor.",
            id: "ph-6-3-3", menuKey: "skel_6_3_3", mounts: [] },
          { code: "6.3.4", label: "AP Aging", slug: "aging", path: "/finance-accounting/accounts-payable/aging",
            desc: "memantau umur hutang yang belum dibayar.",
            id: "ph-6-3-4", menuKey: "skel_6_3_4", mounts: [] },
        ],
      },
      {
        code: "6.4", label: "General Ledger & Accounting", slug: "general-ledger",
        path: "/finance-accounting/general-ledger", icon: BarChart3,
        tabs: [
          { code: "6.4.1", label: "Journal Entry", slug: "journal-entry", path: "/finance-accounting/general-ledger/journal-entry",
            desc: "mencatat jurnal transaksi keuangan.",
            mounts: [
              { menuId: "accounting", path: "/finance-accounting/general-ledger/journal-entry" },
            ] },
          { code: "6.4.2", label: "General Ledger & Chart of Accounts", slug: "chart-of-accounts", path: "/finance-accounting/general-ledger/chart-of-accounts",
            desc: "mengelola buku besar dan struktur akun.",
            id: "ph-6-4-2", menuKey: "skel_6_4_2", mounts: [] },
          { code: "6.4.3", label: "Financial Statements (Balance Sheet/P&L)", slug: "financial-statements", path: "/finance-accounting/general-ledger/financial-statements",
            desc: "menyusun laporan keuangan seperti neraca dan laba rugi.",
            id: "ph-6-4-3", menuKey: "skel_6_4_3", mounts: [] },
        ],
      },
      {
        code: "6.5", label: "Tax & Compliance", slug: "tax-compliance",
        path: "/finance-accounting/tax-compliance", icon: Receipt,
        tabs: [
          { code: "6.5.1", label: "Tax Rate Master", slug: "tax-rate-master", path: "/finance-accounting/tax-compliance/tax-rate-master",
            desc: "mengelola master tarif pajak yang berlaku (pindahan dari Admin Settings, sebelumnya \"Taxes\").",
            id: "ph-6-5-1", menuKey: "skel_6_5_1", mounts: [] },
          { code: "6.5.2", label: "VAT/Income Tax Calculation", slug: "vat-income-tax", path: "/finance-accounting/tax-compliance/vat-income-tax",
            desc: "menghitung PPN dan PPh.",
            id: "ph-6-5-2", menuKey: "skel_6_5_2", mounts: [] },
          { code: "6.5.3", label: "Coretax Integration/Reporting", slug: "coretax", path: "/finance-accounting/tax-compliance/coretax",
            desc: "mengintegrasikan pelaporan ke sistem Coretax DJP.",
            id: "ph-6-5-3", menuKey: "skel_6_5_3", mounts: [] },
          { code: "6.5.4", label: "Withholding Tax & Tax Invoice Archive", slug: "withholding-archive", path: "/finance-accounting/tax-compliance/withholding-archive",
            desc: "mengarsipkan bukti potong dan faktur pajak.",
            id: "ph-6-5-4", menuKey: "skel_6_5_4", mounts: [] },
        ],
      },
      {
        code: "6.6", label: "Payment Terms Master", slug: "payment-terms",
        path: "/finance-accounting/payment-terms", icon: Clock,
        note: "pindahan dari Admin Settings, dimiliki Finance, dirujuk CRM dan Procurement",
        desc: "mengelola termin pembayaran yang dipakai lintas modul lewat pola Contextual Master Data Access.",
        tabs: [],
        placeholderId: "ph-6-6", placeholderKey: "skel_6_6",
      },
    ],
  },
  {
    no: 7, label: "HCGA", slug: "hcga", icon: Users, tone: "rose",
    items: [
      {
        code: "7.1", label: "Employee Directory", slug: "employee-directory",
        path: "/hcga/employee-directory", icon: Users,
        tabs: [
          { code: "7.1.1", label: "Personal & Employment Data", slug: "personal-data", path: "/hcga/employee-directory/personal-data",
            desc: "menyimpan data pribadi dan kepegawaian.",
            id: "ph-7-1-1", menuKey: "skel_7_1_1", mounts: [] },
          { code: "7.1.2", label: "Organization Structure, Department & Position Master", slug: "org-structure", path: "/hcga/employee-directory/org-structure",
            desc: "mengelola struktur organisasi, departemen, dan jabatan (pindahan dari Admin Settings: Departments, Positions, Struktur Organisasi).",
            id: "ph-7-1-2", menuKey: "skel_7_1_2", mounts: [] },
          { code: "7.1.3", label: "Mutation/Promotion History", slug: "mutation-history", path: "/hcga/employee-directory/mutation-history",
            desc: "mencatat riwayat mutasi dan promosi karyawan.",
            id: "ph-7-1-3", menuKey: "skel_7_1_3", mounts: [] },
        ],
      },
      {
        code: "7.2", label: "Recruitment", slug: "recruitment",
        path: "/hcga/recruitment", icon: User,
        tabs: [
          { code: "7.2.1", label: "Job Requisition & Posting", slug: "job-requisition", path: "/hcga/recruitment/job-requisition",
            desc: "mengajukan dan mempublikasikan lowongan.",
            id: "ph-7-2-1", menuKey: "skel_7_2_1", mounts: [] },
          { code: "7.2.2", label: "Candidate Pipeline Tracking", slug: "candidate-pipeline", path: "/hcga/recruitment/candidate-pipeline",
            desc: "memantau progres kandidat per tahap seleksi.",
            id: "ph-7-2-2", menuKey: "skel_7_2_2", mounts: [] },
          { code: "7.2.3", label: "Recruitment Approval", slug: "recruitment-approval", path: "/hcga/recruitment/recruitment-approval",
            desc: "memproses persetujuan hasil rekrutmen.",
            id: "ph-7-2-3", menuKey: "skel_7_2_3", mounts: [] },
        ],
      },
      {
        code: "7.3", label: "Training & Development", slug: "training-development",
        path: "/hcga/training-development", icon: BookOpen,
        tabs: [
          { code: "7.3.1", label: "Training Schedule & Catalog", slug: "schedule-catalog", path: "/hcga/training-development/schedule-catalog",
            desc: "menyusun jadwal dan katalog pelatihan.",
            id: "ph-7-3-1", menuKey: "skel_7_3_1", mounts: [] },
          { code: "7.3.2", label: "Attendance & Participant Records", slug: "attendance", path: "/hcga/training-development/attendance",
            desc: "mencatat kehadiran dan peserta pelatihan.",
            id: "ph-7-3-2", menuKey: "skel_7_3_2", mounts: [] },
          { code: "7.3.3", label: "Certification History", slug: "certification", path: "/hcga/training-development/certification",
            desc: "mencatat riwayat sertifikasi karyawan.",
            id: "ph-7-3-3", menuKey: "skel_7_3_3", mounts: [] },
        ],
      },
      {
        code: "7.4", label: "Performance Appraisal", slug: "performance-appraisal",
        path: "/hcga/performance-appraisal", icon: BarChart2,
        tabs: [
          { code: "7.4.1", label: "Periodic Appraisal Form", slug: "appraisal-form", path: "/hcga/performance-appraisal/appraisal-form",
            desc: "menilai kinerja karyawan secara berkala.",
            id: "ph-7-4-1", menuKey: "skel_7_4_1", mounts: [] },
          { code: "7.4.2", label: "Individual KPI/Target", slug: "individual-kpi", path: "/hcga/performance-appraisal/individual-kpi",
            desc: "menetapkan target atau KPI individu.",
            id: "ph-7-4-2", menuKey: "skel_7_4_2", mounts: [] },
          { code: "7.4.3", label: "Score History & Calibration", slug: "score-history", path: "/hcga/performance-appraisal/score-history",
            desc: "mencatat riwayat skor dan proses kalibrasi penilaian.",
            id: "ph-7-4-3", menuKey: "skel_7_4_3", mounts: [] },
        ],
      },
      {
        code: "7.5", label: "HRGA Service Request", slug: "service-request",
        path: "/hcga/service-request", icon: ClipboardList,
        tabs: [
          { code: "7.5.1", label: "Leave/Permission Request", slug: "leave", path: "/hcga/service-request/leave",
            desc: "mengajukan cuti atau izin.",
            mounts: [
              { menuId: "hrga", path: "/hcga/service-request/leave/my", label: "Milik Saya" },
              { menuId: "hrga-buat-request", path: "/hcga/service-request/leave/new", label: "Buat Baru" },
              { menuId: "hrga-semua-request", path: "/hcga/service-request/leave/all", label: "Semua Permintaan" },
              { menuId: "hrga-arsip", path: "/hcga/service-request/leave/archive", label: "Arsip" },
            ] },
          { code: "7.5.2", label: "Equipment/Facility Request", slug: "equipment", path: "/hcga/service-request/equipment",
            desc: "mengajukan permintaan alat kerja atau fasilitas.",
            id: "ph-7-5-2", menuKey: "skel_7_5_2", mounts: [] },
          { code: "7.5.3", label: "Multi-level Approval", slug: "approval", path: "/hcga/service-request/approval",
            desc: "memproses persetujuan berjenjang atas permintaan tersebut.",
            mounts: [
              { menuId: "hrga-pending-approval", path: "/hcga/service-request/approval" },
            ] },
        ],
      },
      {
        code: "7.6", label: "Offboarding", slug: "offboarding",
        path: "/hcga/offboarding", icon: LogOut,
        tabs: [
          { code: "7.6.1", label: "Asset & Access Return Checklist", slug: "return-checklist", path: "/hcga/offboarding/return-checklist",
            desc: "memastikan aset dan akses dikembalikan saat karyawan keluar.",
            id: "ph-7-6-1", menuKey: "skel_7_6_1", mounts: [] },
          { code: "7.6.2", label: "Exit Interview Process", slug: "exit-interview", path: "/hcga/offboarding/exit-interview",
            desc: "melakukan wawancara keluar karyawan.",
            id: "ph-7-6-2", menuKey: "skel_7_6_2", mounts: [] },
          { code: "7.6.3", label: "Reference/Employment Certificate", slug: "reference-letter", path: "/hcga/offboarding/reference-letter",
            desc: "menerbitkan surat referensi atau keterangan kerja.",
            id: "ph-7-6-3", menuKey: "skel_7_6_3", mounts: [] },
        ],
      },
      {
        code: "7.7", label: "Payroll Administration", slug: "payroll",
        path: "/hcga/payroll", icon: Wallet,
        note: "mengalir ke Finance & Accounting untuk pembayaran, lihat 6.1",
        tabs: [
          { code: "7.7.1", label: "Salary Calculation", slug: "salary-calculation", path: "/hcga/payroll/salary-calculation",
            desc: "menghitung gaji berdasarkan data kepegawaian dan kehadiran.",
            id: "ph-7-7-1", menuKey: "skel_7_7_1", mounts: [] },
          { code: "7.7.2", label: "Payroll Data Master", slug: "payroll-master", path: "/hcga/payroll/payroll-master",
            desc: "mengelola komponen gaji, potongan, dan tunjangan per karyawan.",
            id: "ph-7-7-2", menuKey: "skel_7_7_2", mounts: [] },
        ],
      },
    ],
  },
  {
    no: 8, label: "Digital Transformation (IT)", slug: "it", icon: LifeBuoy, tone: "slate",
    items: [
      {
        code: "8.1", label: "Helpdesk & Ticketing", slug: "helpdesk",
        path: "/it/helpdesk", icon: LifeBuoy,
        tabs: [
          { code: "8.1.1", label: "Ticket Creation & Categorization", slug: "ticket-creation", path: "/it/helpdesk/ticket-creation",
            desc: "mencatat dan mengelompokkan tiket keluhan atau permintaan.",
            mounts: [
              { menuId: "it", path: "/it/helpdesk/ticket-creation" },
            ] },
          { code: "8.1.2", label: "Priority & SLA Management", slug: "priority-sla", path: "/it/helpdesk/priority-sla",
            desc: "menetapkan prioritas dan memantau SLA penyelesaian tiket.",
            id: "ph-8-1-2", menuKey: "skel_8_1_2", mounts: [] },
          { code: "8.1.3", label: "Resolution History", slug: "resolution-history", path: "/it/helpdesk/resolution-history",
            desc: "mencatat riwayat penyelesaian tiket.",
            id: "ph-8-1-3", menuKey: "skel_8_1_3", mounts: [] },
        ],
      },
      {
        code: "8.2", label: "Development Backlog", slug: "development-backlog",
        path: "/it/development-backlog", icon: ClipboardCheck,
        tabs: [
          { code: "8.2.1", label: "Development Request List", slug: "request-list", path: "/it/development-backlog/request-list",
            desc: "mencatat daftar permintaan pengembangan sistem.",
            id: "ph-8-2-1", menuKey: "skel_8_2_1", mounts: [] },
          { code: "8.2.2", label: "Backlog Status & Priority", slug: "backlog-status", path: "/it/development-backlog/backlog-status",
            desc: "memantau status dan prioritas tiap item backlog.",
            id: "ph-8-2-2", menuKey: "skel_8_2_2", mounts: [] },
          { code: "8.2.3", label: "Roadmap/Release Linking", slug: "roadmap-linking", path: "/it/development-backlog/roadmap-linking",
            desc: "menautkan backlog ke roadmap atau jadwal rilis.",
            id: "ph-8-2-3", menuKey: "skel_8_2_3", mounts: [] },
        ],
      },
      {
        code: "8.3", label: "Security & Access Management", slug: "security-access",
        path: "/it/security-access", icon: Shield,
        tabs: [
          { code: "8.3.1", label: "Account & Role Management", slug: "account-role", path: "/it/security-access/account-role",
            desc: "mengelola akun dan peran pengguna.",
            id: "ph-8-3-1", menuKey: "skel_8_3_1", mounts: [] },
          { code: "8.3.2", label: "Periodic Access Audit", slug: "access-audit", path: "/it/security-access/access-audit",
            desc: "memeriksa akses secara berkala.",
            id: "ph-8-3-2", menuKey: "skel_8_3_2", mounts: [] },
          { code: "8.3.3", label: "Sensitive Activity Log", slug: "sensitive-log", path: "/it/security-access/sensitive-log",
            desc: "mencatat aktivitas sensitif di sistem.",
            id: "ph-8-3-3", menuKey: "skel_8_3_3", mounts: [] },
        ],
      },
      {
        code: "8.4", label: "Infrastructure Monitoring", slug: "infrastructure-monitoring",
        path: "/it/infrastructure-monitoring", icon: Activity,
        tabs: [
          { code: "8.4.1", label: "System Uptime Dashboard", slug: "uptime", path: "/it/infrastructure-monitoring/uptime",
            desc: "memantau ketersediaan sistem secara real time.",
            id: "ph-8-4-1", menuKey: "skel_8_4_1", mounts: [] },
          { code: "8.4.2", label: "Incident/Downtime Notification", slug: "incident-notification", path: "/it/infrastructure-monitoring/incident-notification",
            desc: "mengirim notifikasi saat terjadi insiden atau downtime.",
            id: "ph-8-4-2", menuKey: "skel_8_4_2", mounts: [] },
          { code: "8.4.3", label: "Maintenance History", slug: "maintenance-history", path: "/it/infrastructure-monitoring/maintenance-history",
            desc: "mencatat riwayat pemeliharaan sistem.",
            id: "ph-8-4-3", menuKey: "skel_8_4_3", mounts: [] },
        ],
      },
      {
        code: "8.5", label: "IT Asset & Network Inventory", slug: "asset-inventory",
        path: "/it/asset-inventory", icon: Monitor,
        tabs: [
          { code: "8.5.1", label: "Hardware/Software Asset Master", slug: "asset-master", path: "/it/asset-inventory/asset-master",
            desc: "menyimpan data aset perangkat keras dan lunak.",
            mounts: [
              { menuId: "assets", path: "/it/asset-inventory/asset-master/overview", label: "Ringkasan" },
              { menuId: "assets-it", path: "/it/asset-inventory/asset-master/it-equipment", label: "IT Equipment" },
              { menuId: "assets-kendaraan", path: "/it/asset-inventory/asset-master/vehicle", label: "Kendaraan" },
              { menuId: "assets-furniture", path: "/it/asset-inventory/asset-master/furniture", label: "Furniture & Office" },
              { menuId: "assets-properti", path: "/it/asset-inventory/asset-master/property", label: "Properti" },
            ],
            // Q-D: 11 id stub AssetShell — punya path sendiri supaya rute lama &
            // ?menu= tetap hidup, TAPI tidak muncul sebagai pilihan segmented.
            stubs: [
              { menuId: "assets-analytics", path: "/it/asset-inventory/asset-master/analytics" },
              { menuId: "assets-docs", path: "/it/asset-inventory/asset-master/documents" },
              { menuId: "assets-kategori", path: "/it/asset-inventory/asset-master/categories" },
              { menuId: "assets-lokasi", path: "/it/asset-inventory/asset-master/locations" },
              { menuId: "assets-vendor", path: "/it/asset-inventory/asset-master/vendors" },
              { menuId: "assets-settings", path: "/it/asset-inventory/asset-master/settings" },
              { menuId: "assets-maint", path: "/it/asset-inventory/asset-master/maintenance" },
              { menuId: "assets-hist", path: "/it/asset-inventory/asset-master/maintenance-history" },
              { menuId: "assets-workorders", path: "/it/asset-inventory/asset-master/work-orders" },
              { menuId: "assets-expiring", path: "/it/asset-inventory/asset-master/expiring" },
              { menuId: "assets-expired", path: "/it/asset-inventory/asset-master/expired" },
            ] },
          { code: "8.5.2", label: "Network & License Master", slug: "network-license", path: "/it/asset-inventory/network-license",
            desc: "mengelola data jaringan dan lisensi.",
            id: "ph-8-5-2", menuKey: "skel_8_5_2", mounts: [] },
          { code: "8.5.3", label: "Maintenance/Replacement Schedule", slug: "maintenance-schedule", path: "/it/asset-inventory/maintenance-schedule",
            desc: "menjadwalkan perawatan dan penggantian aset IT.",
            id: "ph-8-5-3", menuKey: "skel_8_5_3", mounts: [] },
        ],
      },
    ],
  },
  {
    no: 9, label: "Quality Management (QMR/GMR)", slug: "quality-management", icon: ShieldCheck, tone: "indigo",
    items: [
      {
        code: "9.1", label: "Document Control", slug: "document-control",
        path: "/quality-management/document-control", icon: FolderOpen,
        tabs: [
          { code: "9.1.1", label: "Document Master List & Versioning", slug: "master-list", path: "/quality-management/document-control/master-list",
            desc: "mengelola daftar dan versi dokumen.",
            mounts: [
              { menuId: "docMgmt", path: "/quality-management/document-control/master-list" },
            ] },
          { code: "9.1.2", label: "Document Change Approval Flow", slug: "change-approval", path: "/quality-management/document-control/change-approval",
            desc: "memproses persetujuan perubahan dokumen.",
            id: "ph-9-1-2", menuKey: "skel_9_1_2", mounts: [] },
          { code: "9.1.3", label: "Revision History", slug: "revision-history", path: "/quality-management/document-control/revision-history",
            desc: "mencatat riwayat revisi dokumen.",
            id: "ph-9-1-3", menuKey: "skel_9_1_3", mounts: [] },
        ],
      },
      {
        code: "9.2", label: "Internal Audit & CAPA", slug: "internal-audit",
        path: "/quality-management/internal-audit", icon: ScrollText,
        tabs: [
          { code: "9.2.1", label: "Audit Schedule", slug: "schedule", path: "/quality-management/internal-audit/schedule",
            desc: "menjadwalkan audit internal.",
            mounts: [
              { menuId: "audit", path: "/quality-management/internal-audit/schedule" },
            ] },
          { code: "9.2.2", label: "Non-conformance Findings", slug: "findings", path: "/quality-management/internal-audit/findings",
            desc: "mencatat temuan ketidaksesuaian.",
            id: "ph-9-2-2", menuKey: "skel_9_2_2", mounts: [] },
          { code: "9.2.3", label: "CAPA Follow-up", slug: "capa-follow-up", path: "/quality-management/internal-audit/capa-follow-up",
            desc: "menindaklanjuti tindakan korektif dan preventif.",
            id: "ph-9-2-3", menuKey: "skel_9_2_3", mounts: [] },
        ],
      },
      {
        code: "9.3", label: "Risk Register", slug: "risk-register",
        path: "/quality-management/risk-register", icon: AlertTriangle,
        tabs: [
          { code: "9.3.1", label: "Departmental Risk List", slug: "risk-list", path: "/quality-management/risk-register/risk-list",
            desc: "mencatat daftar risiko per departemen.",
            id: "ph-9-3-1", menuKey: "skel_9_3_1", mounts: [] },
          { code: "9.3.2", label: "Impact & Likelihood Assessment", slug: "impact-likelihood", path: "/quality-management/risk-register/impact-likelihood",
            desc: "menilai dampak dan kemungkinan tiap risiko.",
            id: "ph-9-3-2", menuKey: "skel_9_3_2", mounts: [] },
          { code: "9.3.3", label: "Mitigation & Follow-up Status", slug: "mitigation", path: "/quality-management/risk-register/mitigation",
            desc: "memantau mitigasi dan tindak lanjut risiko.",
            id: "ph-9-3-3", menuKey: "skel_9_3_3", mounts: [] },
        ],
      },
      {
        code: "9.4", label: "Management Review", slug: "management-review",
        path: "/quality-management/management-review", icon: Presentation,
        tabs: [
          { code: "9.4.1", label: "Review Meeting Agenda & Minutes", slug: "minutes", path: "/quality-management/management-review/minutes",
            desc: "menyusun agenda dan notulen rapat tinjauan.",
            mounts: [
              { menuId: "reporting-mom", path: "/quality-management/management-review/minutes" },
            ] },
          { code: "9.4.2", label: "Cross-department KPI Summary", slug: "kpi-summary", path: "/quality-management/management-review/kpi-summary",
            desc: "merangkum KPI lintas departemen.",
            id: "ph-9-4-2", menuKey: "skel_9_4_2", mounts: [] },
          { code: "9.4.3", label: "Executive Decision & Action Items", slug: "executive-decision", path: "/quality-management/management-review/executive-decision",
            desc: "mencatat keputusan dan tindak lanjut level eksekutif.",
            id: "ph-9-4-3", menuKey: "skel_9_4_3", mounts: [] },
        ],
      },
      {
        code: "9.5", label: "Continual Improvement", slug: "continual-improvement",
        path: "/quality-management/continual-improvement", icon: Sparkles,
        tabs: [
          { code: "9.5.1", label: "Improvement Proposal Form", slug: "proposal-form", path: "/quality-management/continual-improvement/proposal-form",
            desc: "mengajukan usulan perbaikan.",
            id: "ph-9-5-1", menuKey: "skel_9_5_1", mounts: [] },
          { code: "9.5.2", label: "Proposal Status Tracking", slug: "proposal-status", path: "/quality-management/continual-improvement/proposal-status",
            desc: "memantau status usulan perbaikan.",
            id: "ph-9-5-2", menuKey: "skel_9_5_2", mounts: [] },
          { code: "9.5.3", label: "Implementation Documentation", slug: "implementation-doc", path: "/quality-management/continual-improvement/implementation-doc",
            desc: "mendokumentasikan hasil implementasi perbaikan.",
            id: "ph-9-5-3", menuKey: "skel_9_5_3", mounts: [] },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Turunan — dihitung sekali saat modul dimuat.
// ─────────────────────────────────────────────────────────────────────────────

/** Sebelas id yang halamannya sudah ada SEJAK LAMA tapi isinya masih
 *  ComingSoon. Mereka punya rute, menu key, dan izin sendiri — semuanya TIDAK
 *  disentuh — tapi di SIDEBAR diperlakukan sama dengan tab Soon: redup, tak
 *  bisa diklik, dan TIDAK ikut menghidupkan modul Level 1 maupun grup Level 2
 *  (keputusan Den).
 *
 *  Alasannya kelihatan dari gejalanya: tanpa aturan ini `zzztest.warehouse`
 *  melihat modul Procurement semata-mata karena ia punya izin
 *  `logistics_general_trading` untuk satu halaman yang isinya belum ada —
 *  modul penuh muncul untuk sesuatu yang tidak bisa dikerjakan.
 *
 *  ⚠️ Ini murni aturan TAMPILAN. Rute, redirect, MENU_KEY_MAP, dan izin
 *  kesebelasnya tetap apa adanya; deep-link ke path-nya tetap membuka
 *  ComingSoon lama untuk yang berizin, persis seperti sebelumnya. */
export const LEGACY_COMING_SOON_IDS = Object.freeze([
  'purchaseOrder', 'trading', 'job', 'inventory-transfer', 'inventory-opname',
  'cashBank', 'ap', 'accounting', 'it', 'docMgmt', 'audit',
]);

export const isLegacyComingSoon = (menuId) => LEGACY_COMING_SOON_IDS.includes(menuId);

/** Tab punya halaman yang SUNGGUH hidup? Tab yang seluruh mount-nya ComingSoon
 *  lama dijawab `false` — dipakai sidebar (jadi baris Soon) dan ContextHeader
 *  (tidak dipilih sebagai "Level 3 pertama yang punya halaman hidup"). */
export const tabHasLivePage = (tab) => tab.mounts.some((m) => !isLegacyComingSoon(m.menuId));

/** Semua tab, rata, lengkap dengan konteks modul & Level 2-nya. */
export const SKELETON_TABS = SKELETON.flatMap((mod) =>
  mod.items.flatMap((l2) =>
    (l2.tabs.length ? l2.tabs : [{
      // Level 2 tanpa Level 3 (6.6 Payment Terms Master) — satu halaman
      // placeholder tanpa tab bar; dibungkus sebagai "tab tunggal" supaya
      // pembacanya tidak perlu cabang khusus.
      code: l2.code, label: l2.label, slug: '', path: l2.path,
      desc: l2.desc || '', id: l2.placeholderId, menuKey: l2.placeholderKey,
      mounts: [], soleTab: true,
    }]).map((tab) => ({ ...tab, module: mod, l2 }))
  )
);

/** Level 2 pemilik sebuah pathname (pencocokan prefix terpanjang). */
export function l2ForPath(pathname) {
  if (!pathname) return null;
  let best = null;
  for (const mod of SKELETON) for (const l2 of mod.items) {
    if (pathname === l2.path || pathname.startsWith(l2.path + '/')) {
      if (!best || l2.path.length > best.l2.path.length) best = { module: mod, l2 };
    }
  }
  return best;
}

/** Tab pemilik sebuah pathname. */
export function tabForPath(pathname) {
  if (!pathname) return null;
  let best = null;
  for (const t of SKELETON_TABS) {
    if (pathname === t.path || pathname.startsWith(t.path + '/')) {
      if (!best || t.path.length > best.path.length) best = t;
    }
  }
  return best;
}

/** id menu → path, untuk SEMUA yang lahir/pindah karena kerangka ini:
 *  mount (id lama), placeholder (ph-*), dan 11 stub AssetShell. */
export const SKELETON_MENU_PATHS = Object.freeze((() => {
  const out = {};
  for (const t of SKELETON_TABS) {
    if (t.mounts.length) for (const m of t.mounts) out[m.menuId] = m.path;
    else out[t.id] = t.path;
    for (const s of (t.stubs || [])) out[s.menuId] = s.path;
  }
  return out;
})());

/** id placeholder → menu key yang SENGAJA tidak di-seed (super_admin-only). */
export const SKELETON_PLACEHOLDER_KEYS = Object.freeze((() => {
  const out = {};
  for (const t of SKELETON_TABS) if (!t.mounts.length) out[t.id] = t.menuKey;
  return out;
})());

/** Id menu LAMA yang kini dipasang di sebuah tab (izin & key-nya tidak berubah). */
export const SKELETON_MOUNTED_IDS = Object.freeze(
  SKELETON_TABS.flatMap((t) => t.mounts.map((m) => m.menuId))
);

/** Id stub AssetShell: punya rute & path, TIDAK jadi pilihan segmented (Q-D). */
export const SKELETON_STUB_IDS = Object.freeze(
  SKELETON_TABS.flatMap((t) => (t.stubs || []).map((s) => s.menuId))
);

/** Path lama → path baru. Dipakai redirects.routes.jsx supaya bookmark,
 *  `nexus_last_path`, dan tautan lama tetap mendarat di tempat yang benar.
 *  Bentuk ber-`:param` di-interpolasi ulang oleh ParamRedirect. */
export const LEGACY_PATH_REDIRECTS = Object.freeze([
  ["/crm/lead", "/crm/lead/capture"],
  ["/crm/lead/pool", "/crm/lead/assignment"],
  ["/crm/lead/pool/approval", "/crm/lead/qualification"],
  ["/crm/inquiry", "/crm/inquiry/status-history"],
  ["/crm/quotation", "/crm/quotation/builder"],
  ["/logistics-warehouse/warehouse/sales-order/new", "/crm/sales-order/customer-po"],
  ["/crm/sales-order", "/crm/sales-order/status-tracking/msi"],
  ["/logistics-warehouse/warehouse/sales-order", "/crm/sales-order/status-tracking/storbit"],
  ["/logistics-warehouse/warehouse/dashboard", "/crm/sales-order/status-tracking/ringkasan"],
  ["/crm/dashboard/indomarco", "/crm/sales-order/status-tracking/indomarco"],
  ["/crm/pipeline", "/crm/pipeline/board"],
  ["/crm/activity", "/crm/pipeline/deal-aging/schedule"],
  ["/crm/activity/log", "/crm/pipeline/deal-aging/log"],
  ["/crm/activity/visit", "/crm/pipeline/deal-aging/visit"],
  ["/crm/dashboard", "/crm/pipeline/performance/team"],
  ["/crm/report", "/crm/pipeline/performance/sales-report"],
  ["/crm/customer", "/crm/customer/legal-contact"],
  ["/procurement/vendor", "/procurement/vendor/profile"],
  ["/crm/rate-list", "/procurement/rate-sourcing/rate-card"],
  ["/procurement/prf", "/procurement/prf/requisition/list"],
  ["/procurement/prf/new", "/procurement/prf/requisition/new"],
  ["/procurement/sales-order", "/procurement/prf/linking"],
  ["/planned/purchaseOrder", "/procurement/purchase-order/issuance"],
  ["/planned/trading", "/procurement/trading/merchandise-po"],
  ["/planned/job", "/logistics-warehouse/freight/job-order/generation"],
  ["/logistics-warehouse/warehouse/goods-receiving", "/logistics-warehouse/warehouse/goods-receiving/form"],
  ["/logistics-warehouse/warehouse/picking-packing", "/logistics-warehouse/warehouse/picking-packing/generation"],
  ["/logistics-warehouse/warehouse/delivery-note", "/logistics-warehouse/warehouse/delivery-note/issuance"],
  ["/logistics-warehouse/warehouse/shipment", "/logistics-warehouse/warehouse/delivery-note/status"],
  ["/planned/inventory-transfer", "/logistics-warehouse/warehouse/stock-transfer/form"],
  ["/planned/inventory-opname", "/logistics-warehouse/warehouse/stock-opname/schedule"],
  ["/logistics-warehouse/warehouse/stock-dashboard", "/logistics-warehouse/warehouse/stock-dashboard/balance/summary"],
  ["/logistics-warehouse/warehouse/stock", "/logistics-warehouse/warehouse/stock-dashboard/balance/products"],
  ["/planned/cashBank", "/finance-accounting/cash-bank/position"],
  ["/finance-accounting/documents", "/finance-accounting/accounts-receivable/submission"],
  ["/finance-accounting/outstanding", "/finance-accounting/accounts-receivable/aging"],
  ["/finance-accounting/accounts-receivable", "/finance-accounting/accounts-receivable/collection"],
  ["/planned/ap", "/finance-accounting/accounts-payable/bill-intake"],
  ["/planned/accounting", "/finance-accounting/general-ledger/journal-entry"],
  ["/hcga/service-request", "/hcga/service-request/leave/my"],
  ["/hcga/service-request/new", "/hcga/service-request/leave/new"],
  ["/hcga/service-request/all", "/hcga/service-request/leave/all"],
  ["/hcga/service-request/archive", "/hcga/service-request/leave/archive"],
  ["/hcga/service-request/pending-approval", "/hcga/service-request/approval"],
  ["/planned/it", "/it/helpdesk/ticket-creation"],
  ["/assets", "/it/asset-inventory/asset-master/overview"],
  ["/assets/it", "/it/asset-inventory/asset-master/it-equipment"],
  ["/assets/vehicle", "/it/asset-inventory/asset-master/vehicle"],
  ["/assets/furniture", "/it/asset-inventory/asset-master/furniture"],
  ["/assets/property", "/it/asset-inventory/asset-master/property"],
  ["/assets/analytics", "/it/asset-inventory/asset-master/analytics"],
  ["/assets/documents", "/it/asset-inventory/asset-master/documents"],
  ["/assets/categories", "/it/asset-inventory/asset-master/categories"],
  ["/assets/locations", "/it/asset-inventory/asset-master/locations"],
  ["/assets/vendors", "/it/asset-inventory/asset-master/vendors"],
  ["/assets/settings", "/it/asset-inventory/asset-master/settings"],
  ["/assets/maintenance-schedule", "/it/asset-inventory/asset-master/maintenance"],
  ["/assets/maintenance-history", "/it/asset-inventory/asset-master/maintenance-history"],
  ["/assets/work-orders", "/it/asset-inventory/asset-master/work-orders"],
  ["/assets/expiring", "/it/asset-inventory/asset-master/expiring"],
  ["/assets/expired", "/it/asset-inventory/asset-master/expired"],
  ["/planned/docMgmt", "/quality-management/document-control/master-list"],
  ["/planned/audit", "/quality-management/internal-audit/schedule"],
  ["/reporting/mom", "/quality-management/management-review/minutes"],
  // Sub-rute (detail/new/edit) yang ikut turun ke bawah slug tab-nya.
  ["/crm/lead/new", "/crm/lead/capture/new"],
  ["/crm/inquiry/new", "/crm/inquiry/status-history/new"],
  ["/crm/inquiry/:id", "/crm/inquiry/status-history/:id"],
  ["/crm/inquiry/:id/edit", "/crm/inquiry/status-history/:id/edit"],
  ["/crm/quotation/new", "/crm/quotation/builder/new"],
  ["/crm/quotation/:id", "/crm/quotation/builder/:id"],
  ["/crm/quotation/:id/edit", "/crm/quotation/builder/:id/edit"],
  ["/crm/customer/:id", "/crm/customer/legal-contact/:id"],
  ["/crm/customer/:id/inquiry/:inquiryId/edit", "/crm/customer/legal-contact/:id/inquiry/:inquiryId/edit"],
  ["/crm/customer/:id/quotation/:quotationId", "/crm/customer/legal-contact/:id/quotation/:quotationId"],
  ["/crm/sales-order/new", "/crm/sales-order/status-tracking/msi/new"],
  ["/crm/sales-order/:id", "/crm/sales-order/status-tracking/msi/:id"],
  ["/logistics-warehouse/warehouse/sales-order/:customerId/:spNo", "/crm/sales-order/status-tracking/storbit/:customerId/:spNo"],
  ["/logistics-warehouse/warehouse/picking-packing/:id", "/logistics-warehouse/warehouse/picking-packing/generation/:id"],
  ["/logistics-warehouse/warehouse/delivery-note/:id", "/logistics-warehouse/warehouse/delivery-note/issuance/:id"],
]);

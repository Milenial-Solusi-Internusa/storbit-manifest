/* =========================================================================
   AdminHub — Nexus by MSI · Foundation › unifikasi Master Data + Admin Settings
   Fase 1: landing card-grid tunggal menaungi 25 destinasi (12 eks-AdminShell +
   9 eks-AdminSettingsHub + 4 eks-top-level NEXUS_NAV). Halaman tujuan TIDAK
   diubah — cuma cara masuknya. Routing: state lokal (activeSection), BUKAN
   activeMenu App.jsx baru per halaman — pola sama seperti AdminShell.jsx.

   Gating — 2 lapis independen (lihat plan /Users/den/.claude/plans/
   floating-dreaming-spark.md, bagian "Pembuktian gate union"):
     1) visibility (grid)  — tiap card cuma tampil kalau kondisi ASLI-nya true.
     2) render-guard       — SATU titik check tunggal (lihat `renderActive`
        di bawah) yang WAJIB dilewati setiap kali activeSection != 'landing',
        membaca G[activeSection].open — bukan union apa pun. Ini pola yang
        sama dengan defense-in-depth RoleDefaultsPage/App.jsx:3883.
   Tidak ada satu pun tempat di file ini yang mengevaluasi "akses AdminShell
   ATAU akses AdminSettingsHub" — union itu cuma boleh muncul SATU KALI, di
   gate mount App.jsx (di luar file ini).
   ========================================================================= */

import { useState, useCallback, lazy, Suspense } from "react";
import { useAuth } from "../../contexts/useAuth";
import ErrorBoundary from "../../components/ErrorBoundary";
import { Icon, PageHeader, SectionLabel, KitStyles } from "./admin-settings/kit";
import { SURFACE, NAVY, LINE, ORANGE, FAINT, INK, MUTED, FONT_BODY, FONT_HEAD, FONT_MONO } from "./admin-settings/tokens";

/* ---------- lazy imports — 12 eks-AdminShell (src/modules/admin/pages/*) ---------- */
const CompaniesPage      = lazy(() => import("../../modules/admin/pages/CompaniesPage"));
const BranchesPage       = lazy(() => import("../../modules/admin/pages/BranchesPage"));
const DepartmentsPage    = lazy(() => import("../../modules/admin/pages/DepartmentsPage"));
const PositionsPage      = lazy(() => import("../../modules/admin/pages/PositionsPage"));
const OrgStructurePage   = lazy(() => import("../../modules/foundation/OrgStructurePage"));
const UserAccessPage     = lazy(() => import("../../modules/admin/pages/UserAccessPage"));
const UserEditPage       = lazy(() => import("../../modules/admin/pages/UserEditPage"));
const RoleDefaultsPage   = lazy(() => import("../../modules/admin/pages/RoleDefaultsPage"));
const DocumentTypesPage  = lazy(() => import("../../modules/admin/pages/DocumentTypesPage"));
const StatusCatalogPage  = lazy(() => import("../../modules/admin/pages/StatusCatalogPage"));
const TaxesPage          = lazy(() => import("../../modules/admin/pages/TaxesPage"));
const PaymentTermsPage   = lazy(() => import("../../modules/admin/pages/PaymentTermsPage"));
const DcMasterPage       = lazy(() => import("../../modules/admin/pages/DcMasterPage"));
const SalesTargetsPage   = lazy(() => import("../../modules/admin/pages/SalesTargetsPage"));

/* ---------- lazy imports — 9 eks-AdminSettingsHub (./admin-settings/*) ---------- */
const EntitySettingsPage     = lazy(() => import("./admin-settings/EntitySettingsPage"));
const DocumentSettingsPage   = lazy(() => import("./admin-settings/DocumentSettingsPage"));
const FinanceDefaultsPage    = lazy(() => import("./admin-settings/FinanceDefaultsPage"));
const ApprovalWorkflowsPage  = lazy(() => import("./admin-settings/ApprovalWorkflowsPage"));
const NotificationsPage      = lazy(() => import("./admin-settings/NotificationsPage"));
const SecurityPolicyPage     = lazy(() => import("./admin-settings/SecurityPolicyPage"));
const AuditLogPage           = lazy(() => import("./admin-settings/AuditLogPage"));
const GeneralPreferencesPage = lazy(() => import("./admin-settings/GeneralPreferencesPage"));
const IntegrationsPage       = lazy(() => import("./admin-settings/IntegrationsPage"));

/* ---------- lazy imports — 4 eks-top-level NEXUS_NAV ---------- */
const ProductsPage       = lazy(() => import("../../modules/admin/pages/ProductsPage"));
const ProductDetailModal = lazy(() => import("../../modules/admin/pages/ProductDetailPage"));
const BulkEditPricePage  = lazy(() => import("../../modules/admin/pages/BulkEditPricePage"));
const BNFOrgRolesPage    = lazy(() => import("../../modules/bnf/BNFOrgRolesPage"));
const SchemaManagerPage  = lazy(() => import("../../modules/admin/pages/SchemaManagerPage"));

/* ---------- card grid data — 6 grup, 25 kartu ---------- */
const HUB_GROUPS = [
  {
    title: "Organisasi",
    cards: [
      { id: "companies",       icon: "building2", name: "Companies",             desc: "Data perusahaan/entitas dalam grup." },
      { id: "branches",        icon: "mappin",     name: "Branches",              desc: "Cabang & lokasi operasional." },
      { id: "departments",     icon: "layout",     name: "Departments",           desc: "Struktur departemen internal." },
      { id: "positions",       icon: "user",       name: "Positions",             desc: "Jabatan & posisi karyawan." },
      { id: "org-structure",   icon: "gitbranch",  name: "Struktur Organisasi",   desc: "Bagan organisasi lintas departemen." },
      { id: "entity-settings", icon: "bank",       name: "Entity Settings",       desc: "Profil perusahaan, rekening bank, penanda tangan." },
    ],
  },
  {
    title: "Akses Kontrol",
    cards: [
      { id: "user-access",   icon: "key",    name: "User Access",   desc: "Kelola user & hak akses." },
      { id: "role-defaults", icon: "shield", name: "Role Defaults", desc: "Default izin per role." },
    ],
  },
  {
    title: "Dokumen & Konfigurasi",
    cards: [
      { id: "document-types",    icon: "filetext", name: "Document Types",    desc: "Katalog jenis dokumen." },
      { id: "document-settings", icon: "hash",      name: "Document Settings", desc: "Skema penomoran & template dokumen." },
      { id: "status-catalog",    icon: "layers",    name: "Status Catalog",    desc: "Katalog status lintas modul." },
      { id: "dc-master",         icon: "globe2",    name: "DC Master",         desc: "Master data distribution center." },
    ],
  },
  {
    // Grup BARU. Sales Targets tidak pas di grup mana pun yang ada: ia bukan
    // struktur organisasi, bukan konfigurasi dokumen, dan bukan referensi
    // finance seperti pajak/termin. Grup ini juga tempat yang wajar untuk
    // master data CRM lain yang sampai sekarang belum punya UI admin sama
    // sekali (loss_reasons, channel_types, sla_policies).
    title: "Commercial",
    cards: [
      { id: "sales-targets", icon: "scale", name: "Sales Targets", desc: "Target penjualan per salesperson per bulan." },
    ],
  },
  {
    title: "Finance",
    cards: [
      { id: "finance-defaults", icon: "coins",   name: "Finance Defaults", desc: "Konfigurasi pajak, mata uang, termin pembayaran." },
      { id: "taxes",            icon: "percent", name: "Taxes",            desc: "Katalog tarif pajak." },
      { id: "payment-terms",    icon: "wallet",  name: "Payment Terms",    desc: "Katalog termin pembayaran." },
    ],
  },
  {
    title: "Produk & Harga",
    cards: [
      { id: "products",   icon: "shoppingcart", name: "Products & Services",  desc: "Katalog produk & layanan." },
      { id: "bulk-price", icon: "banknote",     name: "Update Harga Massal",  desc: "Update harga produk secara massal." },
    ],
  },
  {
    title: "Sistem",
    cards: [
      { id: "approval-workflows", icon: "gitbranch", name: "Approval Workflows", desc: "Rantai persetujuan per jenis dokumen & HRGA." },
      { id: "notifications",      icon: "bell",       name: "Notifications",     desc: "Aturan notifikasi in-app & email." },
      { id: "security-policy",    icon: "shield",     name: "Security Policy",   desc: "Kebijakan kata sandi, sesi & 2FA." },
      { id: "audit-log",          icon: "clipboard",  name: "Audit Log",         desc: "Riwayat aktivitas sistem." },
      { id: "general-preferences",icon: "settings",   name: "General Preferences", desc: "Lokalisasi, format & tampilan." },
      { id: "integrations",       icon: "plug",       name: "Integrations",      desc: "Konektor eksternal & API key." },
      { id: "schema-manager",     icon: "layers",     name: "Schema Manager",    desc: "Eksplorasi skema database." },
      { id: "bnf-org-roles",      icon: "user",       name: "BNF — Kepala & Direktur", desc: "Setup eskalasi Kepala Divisi/Direktur." },
    ],
  },
];

/* ---------- kecil: access denied (padanan App.jsx AccessDeniedPage, self-contained) ---------- */
function AccessDenied({ onBack }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1rem" }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center", background: SURFACE, border: "1px solid " + LINE, borderRadius: 20, padding: "40px 32px", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: "#EAF0F8", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <Icon name="shield" size={28} color={NAVY} />
        </div>
        <h2 style={{ fontFamily: FONT_HEAD, fontSize: 21, fontWeight: 800, color: NAVY, margin: "0 0 8px" }}>Akses Ditolak</h2>
        <p style={{ fontFamily: FONT_BODY, fontSize: 14, color: MUTED, margin: "0 0 24px", lineHeight: 1.5 }}>
          Anda tidak memiliki izin untuk mengakses halaman ini.
        </p>
        <button type="button" onClick={onBack}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: NAVY, color: "#fff", border: "none", borderRadius: 12, padding: "10px 20px", fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          <Icon name="arrowleft" size={16} color="#fff" /> Kembali
        </button>
      </div>
    </div>
  );
}

/* ---------- kecil: strip "kembali" persisten membungkus halaman tujuan aktif ---------- */
function SectionShell({ label, onBack, children }) {
  return (
    <div>
      <button type="button" onClick={onBack}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", border: "none", padding: "4px 0", marginBottom: 14, cursor: "pointer", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: MUTED }}
        onMouseEnter={(e) => { e.currentTarget.style.color = NAVY; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = MUTED; }}>
        <Icon name="arrowleft" size={15} /> Foundation{label ? " / " + label : ""}
      </button>
      {children}
    </div>
  );
}

/* ---------- kecil: kartu grid ---------- */
function HubCard({ card, onOpen }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={() => onOpen(card.id)}
      style={{
        position: "relative", background: SURFACE, border: "1px solid " + (h ? NAVY : LINE),
        borderRadius: 16, padding: "22px 22px 20px 24px", cursor: "pointer",
        overflow: "hidden", transition: "border-color .2s ease, box-shadow .2s ease, transform .2s ease",
        transform: h ? "translateY(-2px)" : "none",
        boxShadow: h ? "0 10px 28px rgba(20,40,70,.1)" : "0 1px 2px rgba(20,40,70,.03)",
        height: "100%",
      }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: ORANGE, transform: h ? "scaleY(1)" : "scaleY(0)", transformOrigin: "center", transition: "transform .25s cubic-bezier(.22,1,.36,1)" }} />
      <div style={{ width: 50, height: 50, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: h ? NAVY : "#EAF0F8", color: h ? "#fff" : NAVY, transition: "all .25s" }}>
        <Icon name={card.icon} size={24} />
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: NAVY, marginTop: 16, letterSpacing: -0.2 }}>{card.name}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 1.5, textWrap: "pretty" }}>{card.desc}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 18, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: h ? ORANGE : NAVY, transition: "color .2s" }}>
        Buka
        <span style={{ display: "inline-flex", transform: h ? "translateX(4px)" : "none", transition: "transform .25s cubic-bezier(.22,1,.36,1)" }}><Icon name="arrowright" size={15} /></span>
      </div>
    </div>
  );
}

const Loading = () => <div style={{ padding: 40, textAlign: "center", fontFamily: FONT_BODY, fontSize: 13, color: FAINT }}>Memuat…</div>;

/* ===================== SHELL UTAMA ===================== */
export default function AdminHub({ onExit, initialSection }) {
  const { role, hasMenuPermission } = useAuth();
  const [activeSection, setActiveSection] = useState(initialSection || "landing");
  const backToLanding = useCallback(() => setActiveSection("landing"), []);

  // Shell-level toast (dipakai UserAccessPage/UserEditPage/RoleDefaultsPage/
  // BNFOrgRolesPage/SchemaManagerPage — pola sama AdminShell.jsx).
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // User Access → User Edit nested state-swap (pola sama AdminShell.jsx).
  const [editUserId, setEditUserId] = useState(null);
  const [editUserRow, setEditUserRow] = useState(null);
  const openUserEdit = useCallback((row) => { setEditUserRow(row); setEditUserId(row?.id || null); }, []);
  const closeUserEdit = useCallback(() => { setEditUserId(null); setEditUserRow(null); }, []);

  // Products & Services → Product Detail modal (pola sama App.jsx activeMenu='product-detail').
  const [selectedProduct, setSelectedProduct] = useState(null);

  /* ---------- kondisi ASLI per destinasi — REPLIKASI, bukan union ----------
     G[id].view  = gate visibility card di grid.
     G[id].open  = gate render-guard (dicek SATU KALI di renderActive, di
                   bawah, sebelum komponen manapun di-mount).
     Utk 24 dari 25 destinasi, view === open (persis kondisi asli hari ini,
     tak ada celah baru). SATU pengecualian sengaja: schema-manager — visibility
     via hasMenuPermission (longgar), tapi konten TETAP hardcode role literal
     (App.jsx:3322-3325 hari ini) — bug pre-existing, diwarisi apa adanya,
     BUKAN diperbaiki di sini (lihat plan, bagian "4 item top-level"). */
  const gMaster   = hasMenuPermission("foundation_master", "view");
  const gSettings = role === "super_admin" || role === "admin";
  const gSchemaView = hasMenuPermission("foundation_schema", "view");
  const gSchemaOpen = role === "super_admin";
  const G = {
    "companies":            { view: gMaster,   open: gMaster },
    "branches":             { view: gMaster,   open: gMaster },
    "departments":          { view: gMaster,   open: gMaster },
    "positions":            { view: gMaster,   open: gMaster },
    "org-structure":        { view: gMaster,   open: gMaster },
    "user-access":          { view: gMaster,   open: gMaster },
    "role-defaults":        { view: gMaster && role === "super_admin", open: gMaster && role === "super_admin" },
    "document-types":       { view: gMaster,   open: gMaster },
    "status-catalog":       { view: gMaster,   open: gMaster },
    "taxes":                { view: gMaster,   open: gMaster },
    "payment-terms":        { view: gMaster,   open: gMaster },
    "dc-master":             { view: gMaster,   open: gMaster },
    // Menumpang gate master data yang sudah ada — TIDAK memakai menu key baru,
    // jadi nol seeding role_menu_permissions. Penegak sebenarnya tetap RLS
    // sales_targets (baca: manager+ atau pemilik target; tulis: manager+).
    "sales-targets":         { view: gMaster,   open: gMaster },
    "entity-settings":      { view: gSettings, open: gSettings },
    "document-settings":    { view: gSettings, open: gSettings },
    "finance-defaults":     { view: gSettings, open: gSettings },
    "approval-workflows":   { view: gSettings, open: gSettings },
    "notifications":        { view: gSettings, open: gSettings },
    "security-policy":      { view: gSettings, open: gSettings },
    "audit-log":            { view: gSettings, open: gSettings },
    "general-preferences":  { view: gSettings, open: gSettings },
    "integrations":         { view: gSettings, open: gSettings },
    "products":             { view: hasMenuPermission("foundation_products", "view"), open: hasMenuPermission("foundation_products", "view") },
    "bulk-price":           { view: role === "super_admin", open: role === "super_admin" },
    "bnf-org-roles":        { view: role === "super_admin" || role === "admin", open: role === "super_admin" || role === "admin" },
    "schema-manager":       { view: gSchemaView, open: gSchemaOpen },
  };

  function renderDestinationContent(id) {
    switch (id) {
      case "companies":     return <CompaniesPage onHome={backToLanding} />;
      case "branches":      return <BranchesPage onHome={backToLanding} />;
      case "departments":   return <DepartmentsPage onHome={backToLanding} />;
      case "positions":     return <PositionsPage onHome={backToLanding} />;
      case "org-structure": return <OrgStructurePage />;
      case "user-access":
        return editUserId ? (
          <UserEditPage userId={editUserId} initialRow={editUserRow} onBack={closeUserEdit} showToast={showToast} />
        ) : (
          <UserAccessPage showToast={showToast} onEditUser={openUserEdit} />
        );
      case "role-defaults":       return <RoleDefaultsPage showToast={showToast} />;
      case "document-types":      return <DocumentTypesPage onHome={backToLanding} />;
      case "status-catalog":      return <StatusCatalogPage onHome={backToLanding} />;
      case "taxes":                return <TaxesPage onHome={backToLanding} />;
      case "payment-terms":       return <PaymentTermsPage onHome={backToLanding} />;
      case "dc-master":            return <DcMasterPage onHome={backToLanding} />;
      case "sales-targets":       return <SalesTargetsPage onHome={backToLanding} />;
      case "entity-settings":     return <EntitySettingsPage onHome={backToLanding} />;
      case "document-settings":   return <DocumentSettingsPage onHome={backToLanding} />;
      case "finance-defaults":    return <FinanceDefaultsPage onHome={backToLanding} />;
      case "approval-workflows":  return <ApprovalWorkflowsPage onHome={backToLanding} />;
      case "notifications":       return <NotificationsPage onHome={backToLanding} />;
      case "security-policy":     return <SecurityPolicyPage onHome={backToLanding} />;
      case "audit-log":            return <AuditLogPage onHome={backToLanding} />;
      case "general-preferences": return <GeneralPreferencesPage onHome={backToLanding} />;
      case "integrations":        return <IntegrationsPage onHome={backToLanding} />;
      case "products":
        return selectedProduct ? (
          <ProductDetailModal product={selectedProduct} onBack={() => setSelectedProduct(null)} />
        ) : (
          <ProductsPage onSelectProduct={(p) => setSelectedProduct(p)} />
        );
      case "bulk-price":     return <BulkEditPricePage />;
      case "bnf-org-roles":  return <BNFOrgRolesPage showToast={showToast} />;
      case "schema-manager": return <SchemaManagerPage showToast={showToast} />;
      default:                return null;
    }
  }

  // Titik render-guard TUNGGAL — satu-satunya tempat G[id].open dicek. Tidak
  // pernah membaca union A∨B (variabel itu tidak ada/tidak bisa ada di file
  // ini — union cuma dievaluasi di gate mount App.jsx, di luar komponen ini).
  function renderActive() {
    const gate = G[activeSection];
    if (!gate || !gate.open) return <AccessDenied onBack={backToLanding} />;
    const card = HUB_GROUPS.flatMap((g) => g.cards).find((c) => c.id === activeSection);
    return (
      <SectionShell label={card?.name} onBack={backToLanding}>
        <ErrorBoundary title={(card?.name || "Halaman") + " unavailable"}>
          <Suspense fallback={<Loading />}>{renderDestinationContent(activeSection)}</Suspense>
        </ErrorBoundary>
      </SectionShell>
    );
  }

  if (activeSection !== "landing") {
    return (
      <div style={{ fontFamily: FONT_BODY, color: INK }}>
        <KitStyles />
        {renderActive()}
        {toast && <ToastBar toast={toast} />}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Master Data & Admin Settings" }]}
        title="Master Data & Admin Settings"
        subtitle="Satu pintu masuk untuk seluruh data master, konfigurasi, dan akses sistem."
        onBack={onExit}
        right={<span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 20, background: "#EAF0F8", color: NAVY, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600 }}><Icon name="shield" size={15} />Akses Terbatas</span>}
      />
      {HUB_GROUPS.map((group, gi) => {
        const visibleCards = group.cards.filter((c) => G[c.id]?.view);
        if (!visibleCards.length) return null;
        return (
          <div key={group.title} style={{ marginBottom: gi === HUB_GROUPS.length - 1 ? 0 : 34 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <SectionLabel>{group.title}</SectionLabel>
              <span style={{ flex: 1, height: 1, background: LINE }} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600, color: FAINT }}>{visibleCards.length} menu</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {visibleCards.map((c) => <HubCard key={c.id} card={c} onOpen={setActiveSection} />)}
            </div>
          </div>
        );
      })}
      {toast && <ToastBar toast={toast} />}
    </div>
  );
}

function ToastBar({ toast }) {
  return (
    <div
      className="fixed bottom-6 right-6 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 z-[60]"
      style={{
        background: toast.type === "error" || toast.type === "alert" ? "#FCE4E4" : "#DCF0E6",
        color: INK,
        border: "1px solid " + (toast.type === "error" || toast.type === "alert" ? "#E39A9A" : "#7FC9A0"),
      }}
    >
      <Icon name="check" size={14} />
      {toast.msg}
    </div>
  );
}

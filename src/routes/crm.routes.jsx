/* eslint-disable react-refresh/only-export-components -- file peta rute: mengekspor daftar rute (nilai) berdampingan dengan komponen wrapper-nya; pola sama dengan logistics-warehouse.routes.jsx (G2) dan src/modules/crm/DealPanels.jsx. Komponen HALAMAN-nya sendiri hidup di filenya masing-masing, jadi HMR halaman tidak terpengaruh. */
// src/routes/crm.routes.jsx
// ============================================================================
// Batch FS Fase 2.5 G3 — modul CRM keluar dari LegacyMenuOutlet.
// Cakupan = SELURUH id ber-path `/crm/*` menurut kontrak G0: 27 cabang render
// / 16 id menu, yang ternyata memuat **29 keadaan tampilan** (crm-sales-order
// menyembunyikan tiga tampilan di dalam SATU cabang lewat ternary
// soDetailId/soFormOpen — tidak terlihat kalau hanya menghitung cabang).
//
// ⛔ `prf` dan ketiga `proc-*` SENGAJA tidak ikut: kontrak G0 menaruh `prf` di
// /procurement/prf/new, jadi mereka milik giliran Procurement — walaupun CRM
// memanggilnya (Detail Deal "Buat PRF", tab Dokumen Detail Customer).
//
// Bentuknya WRAPPER TIPIS seperti G2: useParams() + useAppShell() lalu render
// komponen halaman APA ADANYA. Nol file halaman dipindah lokasi fisik, nol
// prop komponen halaman berubah (Fase 3/7 yang memindahkan filenya).
//
// EMPAT KEPUTUSAN DEN (23 Sep 2026) yang membentuk file ini:
//  #1 Handoff di Detail Customer dipecah SEPARUH — dua yang CRM-murni (edit
//     Inquiry, lihat Quotation) jadi rute BERSARANG di bawah customer-nya;
//     dua yang merender halaman PRF tetap state sampai Procurement pindah.
//  #2 crm-sales-order digarap penuh: ternary dibongkar jadi /new + /:id.
//  #3 Tombol kembali dari sub-view handoff → ke CUSTOMER yang membukanya.
//     Itu hanya bisa deterministik kalau asal-usulnya ada DI URL, bukan di
//     location.state — kalau di state, janji "tetap benar saat di-refresh"
//     gugur persis di kasus yang jadi alasan memilihnya. Karena itu rute
//     bersarang, bukan satu rute datar + penanda asal.
//  #4 Form ber-objek pakai pola HYBRID: location.state dipakai sebagai cache
//     (datang dari daftar/detail = nol fetch, perilaku persis hari ini), dan
//     barisnya DIAMBIL dari :id kalau state tak ada (refresh/deep-link).
//     URL tetap pemilik kebenaran id; state cuma optimasi yang boleh hilang.
//
// ⚠️ PENAMBAHAN KONTRAK G0 (sekelas +32 id camelCase di G1):
//     DETAIL_ROUTE_TEMPLATES hanya mencatat bentuk TUNGGAL
//     ('/crm/quotation/:id', '/crm/inquiry/:id/edit'). Dua bentuk BERSARANG
//     di bawah /crm/customer/:id lahir di sini sebagai konsekuensi keputusan
//     #3 dan harus ikut dicatat saat kontraknya diperbarui.
//
// ⚠️ `/crm/lead/:id/edit` SENGAJA TIDAK DIBUAT: diukur di kode, hari ini NOL
//     pemanggil membuka form prospect dengan baris tersimpan — setEditingProspect
//     hanya menerima `null` (tombol "+") atau objek DRAFT baru dari
//     ActivitiesPage:824, dan memilih prospect justru membuka Detail Customer.
//     Templatnya dibiarkan di kontrak sampai ada pintu masuk edit yang nyata.
// ============================================================================
import { lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { supabase } from '@/lib/supabase';
import { AccessDeniedPage } from '@/App.jsx';
import { MENU_PATHS } from './menu-paths.js';
import Boundary from './Boundary.jsx';
import ModuleShell from './ModuleShell.jsx';
import RecordNotFound from './RecordNotFound.jsx';

// ProspectListPage.jsx/ProspectFormPage.jsx diganti LeadCapturePage/
// LeadDetailPage (Batch DS 3 Lead Management, Paket 1 irisan 4-5) dan
// DIHAPUS di irisan 5 (nol importir tersisa).
const LeadCapturePage         = lazy(() => import('@/modules/crm/lead/pages/LeadCapturePage'));
const LeadDetailPage         = lazy(() => import('@/modules/crm/lead/pages/LeadDetailPage'));
const LeadQualificationPage  = lazy(() => import('@/modules/crm/lead/pages/LeadQualificationPage'));
const InquiryListPage        = lazy(() => import('@/modules/crm/InquiryListPage'));
const InquiryClassificationPage = lazy(() => import('@/modules/crm/InquiryClassificationPage'));
const InquiryOwnerAssignmentPage = lazy(() => import('@/modules/crm/InquiryOwnerAssignmentPage'));
const InquiryFormPage        = lazy(() => import('@/modules/crm/InquiryFormPage'));
// Putaran 4 Tahap 4B -- wizard Intake Form, CREATE-ONLY (Single Shipment).
// InquiryFormPage TETAP satu-satunya halaman EDIT -- lihat InquiryEditRoute/
// CustomerInquiryEditRoute di bawah, tidak disentuh.
const InquiryIntakeWizardPage = lazy(() => import('@/modules/crm/InquiryIntakeWizardPage'));
const DealDetailPage         = lazy(() => import('@/modules/crm/DealDetailPage'));
const QuotationListPage      = lazy(() => import('@/modules/crm/QuotationListPage'));
const QuotationDetailPage    = lazy(() => import('@/modules/crm/QuotationDetailPage'));
const QuotationFormPage      = lazy(() => import('@/modules/crm/QuotationFormPage'));
const PipelineKanbanPage     = lazy(() => import('@/modules/crm/PipelineKanbanPage'));
const CRMDashboardPage       = lazy(() => import('@/modules/crm/CRMDashboardPage'));
const IndomarcoDashboardPage = lazy(() => import('@/modules/crm/IndomarcoDashboardPage'));
const CustomerListPage       = lazy(() => import('@/modules/crm/CustomerListPage'));
const CustomerDetailPage     = lazy(() => import('@/modules/crm/CustomerDetailPage'));
const ActivitiesPage         = lazy(() => import('@/modules/crm/ActivitiesPage'));
const ActivityLogPage        = lazy(() => import('@/modules/crm/ActivityLogPage'));
const RiwayatVisitPage       = lazy(() => import('@/modules/crm/RiwayatVisitPage'));
// LeadPoolPage.jsx/LeadPoolApprovalPage.jsx DIGANTIKAN LeadAssignmentPage
// (Batch DS 3 Lead Management, irisan 9 Paket 2) dan DIHAPUS (nol importir
// tersisa). Tiga tab (Leads/Free Agent/Pull Approvals) satu halaman --
// lihat LeadAssignmentRoute di bawah.
const LeadAssignmentPage     = lazy(() => import('@/modules/crm/lead/pages/LeadAssignmentPage'));
const CRMReportPage          = lazy(() => import('@/modules/crm/CRMReportPage'));
const RateListPage           = lazy(() => import('@/modules/crm/RateListPage'));
const OptionRequestsPage     = lazy(() => import('@/modules/crm/OptionRequestsPage'));
const PRFFormPage            = lazy(() => import('@/modules/procurement/PRFFormPage'));
const PRFDetailPage          = lazy(() => import('@/modules/procurement/PRFDetailPage'));
const SalesOrderDocListPage   = lazy(() => import('@/modules/sales-order/SalesOrderDocListPage'));
const SalesOrderDocFormPage   = lazy(() => import('@/modules/sales-order/SalesOrderDocFormPage'));
const SalesOrderDocDetailPage = lazy(() => import('@/modules/sales-order/SalesOrderDocDetailPage'));

// ── path induk (dipakai sebagai tujuan tombol kembali) ──────────────────────
const P_INQUIRY   = MENU_PATHS['crm-inquiry'];
const P_QUOTATION = MENU_PATHS['quotation-draft'];
const P_LEAD      = MENU_PATHS['crm-prospects'];
const P_CUSTOMER  = MENU_PATHS['crm-customers'];
const P_SO        = MENU_PATHS['crm-sales-order'];

/** Gate halaman yang SUDAH ada di dalam cabang lamanya (di ATAS gate konten
 *  ModuleShell). Empat id membawanya: indomarco-dashboard, crm-lead-pool-approval,
 *  riwayat-visit, crm-sales-order. Direplikasi apa adanya — G2 menetapkan bahwa
 *  giliran pemindahan tidak mengubah gate (TD-272 tetap di luar cakupan). */
function Gated({ menuId, children, onGoHome = true }) {
  const { canRenderPage, setActiveMenu } = useAppShell();
  if (canRenderPage(menuId)) return children;
  return onGoHome ? <AccessDeniedPage onGoHome={() => setActiveMenu('home')} /> : <AccessDeniedPage />;
}

/** Pola HYBRID keputusan #4: pakai baris dari location.state kalau ia memang
 *  baris yang diminta URL, kalau tidak ambil dari :id.
 *  `state` hilang bukan kegagalan — ia cuma cache; hilangnya berarti satu fetch. */
function useRecord(table, id, seedFromState) {
  const seeded = seedFromState && seedFromState.id === id ? seedFromState : null;
  const [fetched, setFetched] = useState(null);   // { id, row } — hasil terakhir
  const hasSeed = !!seeded;
  const fetchedId = fetched?.id;
  useEffect(() => {
    if (!id || hasSeed || fetchedId === id) return;
    let alive = true;
    supabase.from(table).select('*').eq('id', id).is('deleted_at', null).maybeSingle()
      .then(({ data }) => { if (alive) setFetched({ id, row: data ?? null }); })
      .catch(() => { if (alive) setFetched({ id, row: null }); });
    return () => { alive = false; };
  }, [table, id, hasSeed, fetchedId]);
  // Diturunkan saat render, bukan lewat setState di dalam effect (kalau tidak,
  // React Compiler menandainya sebagai render berantai).
  return {
    row: seeded ?? (fetchedId === id ? fetched.row : null),
    loading: !!id && !hasSeed && fetchedId !== id,
  };
}

/** Status inquiry induk — dipakai Task 3.2 (migrasi 20261012000007) utk
 *  mengunci mode edit quotation dari inquiry LOST/CANCELLED, termasuk akses
 *  lewat URL langsung (cek ini di level rute, sebelum QuotationFormPage
 *  mount). Diturunkan saat render seperti useRecord di atas, bukan lewat
 *  setState sinkron di dalam effect.
 *  Return: null = tak ada inquiry_id, undefined = fetch belum selesai,
 *  string = status inquiry-nya. */
function useInquiryStatus(inquiryId) {
  const [fetched, setFetched] = useState({ id: null, status: null });
  useEffect(() => {
    if (!inquiryId) return;
    let cancelled = false;
    supabase.from('inquiries').select('status').eq('id', inquiryId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setFetched({ id: inquiryId, status: data?.status ?? null }); });
    return () => { cancelled = true; };
  }, [inquiryId]);
  if (!inquiryId) return null;
  return fetched.id === inquiryId ? fetched.status : undefined;
}

// ============================================================================
// Dashboard · Pipeline · Report · Rate List — daun tanpa state
// ============================================================================
function CrmDashboardRoute() {
  return <Boundary title="CRM Dashboard temporarily unavailable"><CRMDashboardPage /></Boundary>;
}

function IndomarcoDashboardRoute() {
  return (
    <Gated menuId="indomarco-dashboard">
      <Boundary title="Indomarco Dashboard temporarily unavailable"><IndomarcoDashboardPage /></Boundary>
    </Gated>
  );
}

function PipelineRoute() {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Pipeline Kanban temporarily unavailable">
      {/* B3: papan per-INQUIRY dan read-only. Prop lama yang melayani papan
          berbasis akun (setShowProspectForm / setEditingProspect /
          onSelectAccount / setActiveMenu) sudah tak dipakai. */}
      <PipelineKanbanPage
        showToast={showToast}
        onSelectInquiry={(inq) => navigate(`${P_INQUIRY}/${inq.id}`)}
      />
    </Boundary>
  );
}

function CrmReportRoute() {
  return <Boundary title="Sales Report temporarily unavailable"><CRMReportPage /></Boundary>;
}

function RateListRoute() {
  const { showToast } = useAppShell();
  return <Boundary title="Rate List temporarily unavailable"><RateListPage showToast={showToast} /></Boundary>;
}

// Option Requests (Irisan 5) -- gate halaman (NoAccess vs hasAccess)
// dihitung DI DALAM OptionRequestsPage lewat isManagerOrAbove(erpRoles) via
// useAuth() langsung (plan §10.9) -- wrapper ini hanya meneruskan showToast,
// pola sama RateListRoute. ModuleShell (gate konten sidebar/deep-link) sudah
// benar lewat canAccessActiveMenu (App.jsx, threading isManagerOrAboveUser).
function OptionRequestsRoute() {
  const { showToast } = useAppShell();
  return <Boundary title="Option Requests temporarily unavailable"><OptionRequestsPage showToast={showToast} /></Boundary>;
}

// ============================================================================
// Lead Capture (ex-Account/Prospects) — Batch DS 3 Lead Management irisan 4
// ============================================================================
/** "Capture Lead" kini MODAL di dalam LeadCapturePage, bukan rute terpisah
 *  (keputusan Den atas plan Lead Management, Perbedaan Visual #1 — pola baru
 *  di app, menyimpang sengaja dari konvensi form-halaman-penuh). Handoff dari
 *  ActivitiesPage (draft { name }, via rute lama `${P_LEAD}/new`) dibawa lewat
 *  location.state ke sini supaya modal auto-terbuka ter-prefill — lihat
 *  LeadNewRedirect di bawah.
 *
 *  Klik baris -> `${P_LEAD}/:id` (LeadDetailRoute, irisan 5) untuk SEMUA
 *  baris, termasuk yang sudah lifecycle_stage='customer' -- LeadDetailRoute
 *  sendiri yang mengalihkan ke /crm/customer/:id begitu baris itu dibuka
 *  (satu titik keputusan, bukan dua: lihat komentar kepala LeadDetailRoute). */
function LeadCaptureRoute() {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  const location = useLocation();
  const openCapture = !!location.state?.openCapture;
  const from = location.state?.from;
  return (
    <div>
      <Boundary title="CRM Prospects temporarily unavailable">
        <LeadCapturePage
          onSelectProspect={(p) => navigate(`${P_LEAD}/${p.id}`)}
          onQuickEdit={(p) => navigate(`${P_LEAD}/${p.id}`, { state: { quickEdit: true } })}
          onAddNote={(p) => navigate(`${P_LEAD}/${p.id}`, { state: { openNote: true } })}
          showToast={showToast}
          openCaptureOnMount={openCapture}
          captureInitialName={location.state?.captureName || ''}
          onCaptureClosed={() => { if (openCapture && from === 'activity') navigate(MENU_PATHS['crm-calls']); }}
        />
      </Boundary>
    </div>
  );
}

/** Detail Lead (irisan 5) -- GUARD "sudah customer" dilakukan DI SINI, bukan
 *  di dalam LeadDetailPage: `useRecord` sudah hidup di file ini (dipakai
 *  CustomerDetailRoute dkk), jadi memakainya ulang untuk satu-satunya
 *  keputusan "alihkan atau render" tetap satu sumber kebenaran, dan
 *  LeadDetailPage sendiri tak perlu tahu apa pun soal react-router. */
function LeadDetailRoute() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast, hasMenuPermission, setInquiryPrefill } = useAppShell();
  const { row, loading } = useRecord('accounts', id, location.state?.row);

  if (loading) return <Boundary title="Lead Detail temporarily unavailable"><div style={{ padding: '3rem', textAlign: 'center' }}>Loading data…</div></Boundary>;
  if (!row) return <RecordNotFound label="Lead not found." onBack={() => navigate(P_LEAD)} backLabel="Back to list" />;
  if (row.lifecycle_stage === 'customer') return <Navigate to={`${P_CUSTOMER}/${id}`} replace />;

  return (
    <Boundary title="Lead Detail temporarily unavailable">
      <LeadDetailPage
        id={id}
        onBack={() => navigate(P_LEAD)}
        showToast={showToast}
        quickEditOnMount={!!location.state?.quickEdit}
        openNoteOnMount={!!location.state?.openNote}
        onCreateInquiry={hasMenuPermission('crm_inquiry', 'view')
          ? (account) => { setInquiryPrefill({ accountId: id }); navigate(MENU_PATHS['crm-inquiry-intake'], { state: { leadAccount: account } }); }
          : undefined}
        onOpenInquiry={(inquiryId) => navigate(`${P_INQUIRY}/${inquiryId}`)}
        onOpenQuotation={(quotationId) => navigate(`${P_QUOTATION}/${quotationId}`)}
      />
    </Boundary>
  );
}

/** Lead Qualification to Inquiry (1.1.3, irisan 6) -- gerbang `crm_prospects`
 *  (MENU_KEY_MAP + CRM_MENU_ITEMS di App.jsx), SAMA dengan Capture. Baris
 *  "Create Inquiry" memakai jalur prefill yang SUDAH ADA, identik
 *  LeadDetailRoute di atas -- satu sumber kebenaran untuk "bagaimana lead
 *  jadi Inquiry", bukan dua implementasi yang bisa melenceng. */
function LeadQualificationRoute() {
  const { showToast, hasMenuPermission, setInquiryPrefill } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Lead Qualification temporarily unavailable">
      <LeadQualificationPage
        showToast={showToast}
        onSelectLead={(account) => navigate(`${P_LEAD}/${account.id}`, { state: { row: account } })}
        onCreateInquiry={hasMenuPermission('crm_inquiry', 'view')
          ? (account) => { setInquiryPrefill({ accountId: account.id }); navigate(MENU_PATHS['crm-inquiry-intake'], { state: { leadAccount: account } }); }
          : undefined}
      />
    </Boundary>
  );
}

/** Rute lama `/crm/lead/capture/new` (dan `?from=activity` dari Activities)
 *  TETAP BERFUNGSI — dialihkan ke daftar dengan modal Capture Lead terbuka,
 *  bukan lagi ke ProspectFormPage. Nol pemanggil lain diukur (satu-satunya:
 *  ActivitiesRoute di bawah). */
function LeadNewRedirect() {
  const [sp] = useSearchParams();
  const draftName = useLocation().state?.row?.name ?? null;
  return <Navigate to={P_LEAD} replace state={{ openCapture: true, captureName: draftName, from: sp.get('from') }} />;
}

// LeadAssignmentPage (irisan 9 Paket 2) -- SATU halaman tiga tab menggantikan
// LeadPoolPage + LeadPoolApprovalPage. `initialView` dipakai hanya oleh rute
// /approval (bookmark lama) supaya mendarat langsung di tab Pull Approvals;
// rute dasar selalu mulai di tab Leads. `canApprove` dari hasMenuPermission
// (route wrapper, pola sama onOpenApprovals lama) -- halaman sendiri TIDAK
// memanggil useAppShell, menerima boolean jadi.
function LeadAssignmentRoute({ initialView = 'pool' }) {
  const { showToast, hasMenuPermission } = useAppShell();
  const navigate = useNavigate();
  const onSelectAccount = useCallback((a) => {
    navigate(`${a.lifecycle_stage === 'free_agent' ? P_CUSTOMER : P_LEAD}/${a.id}`);
  }, [navigate]);
  return (
    <Boundary title="Lead Assignment / Claim temporarily unavailable">
      <LeadAssignmentPage
        showToast={showToast}
        canApprove={hasMenuPermission('crm_lead_pool_approval', 'view')}
        initialView={initialView}
        onSelectAccount={onSelectAccount}
      />
    </Boundary>
  );
}

// Bookmark lama /crm/lead/assignment/approval -- gate DIREPLIKASI apa
// adanya (Gated menuId, pola sama LeadPoolApprovalRoute lama) supaya user
// yang kehilangan izin crm_lead_pool_approval tetap ditolak di sini, bukan
// diam-diam mendarat di tab Leads.
function LeadAssignmentApprovalRoute() {
  return (
    <Gated menuId="crm-lead-pool-approval" onGoHome={false}>
      <LeadAssignmentRoute initialView="approvals" />
    </Gated>
  );
}

// ============================================================================
// Inquiry / Deal — 4 rute
// ============================================================================
// `location.state.presetOwnerId` -- dikirim Team Workload
// (InquiryOwnerAssignmentPage.jsx) saat baris salesperson diklik. P_INQUIRY
// sejak Putaran 7 SUDAH menunjuk ke halaman 1.2.4 "Inquiry Status & History"
// (bukan lagi "belum ada" seperti komentar lama -- lihat menu-skeleton.js
// mount 'crm-inquiry'). `presetStatus` DICABUT dari pemanggil ini Putaran 8
// (L-12) -- InquiryListPage.jsx sendiri sudah jatuh ke default OPEN_STATUSES
// (4 status) begitu presetStatus tidak dikirim, persis `stSel: OPEN` mockup
// baris 829. Prop `presetStatus` di bawah TETAP ada (generik, dipakai
// pemanggil lain yang mungkin muncul kelak) -- yang berubah hanya pemanggil
// InquiryOwnerAssignmentRoute, lihat komentarnya.
function InquiryListRoute() {
  const { showToast, setInquiryPrefill } = useAppShell();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Boundary title="CRM Inquiry temporarily unavailable">
      {/* Jalur "+" lama: SELALU tanpa konteks. Clear eksplisit supaya prefill
          sisa dari jalur Detail Account tak pernah bocor ke form kosong ini. */}
      <InquiryListPage
        onAddInquiry={() => { setInquiryPrefill(null); navigate(MENU_PATHS['crm-inquiry-intake']); }}
        onSelectInquiry={(inq) => navigate(`${P_INQUIRY}/${inq.id}`)}
        showToast={showToast}
        presetOwnerId={location.state?.presetOwnerId}
        presetStatus={location.state?.presetStatus}
      />
    </Boundary>
  );
}

// Inquiry Classification (Putaran 3 Tahap 3A, Lingkup B) -- gate halaman
// ikut crm_inquiry (migrasi 20261024000003 menyalin role_menu_permissions-
// nya), jadi Sales yang boleh membuka Inquiry List otomatis boleh membuka
// halaman ini juga; RLS inquiries_read yang menyaring dataset ke ownernya.
// Nol prop handoff -- halaman murni baca+UPDATE langsung, nol state App.jsx
// yang dirujuk.
function InquiryClassificationRoute() {
  const { showToast } = useAppShell();
  return (
    <Boundary title="Inquiry Classification temporarily unavailable">
      <InquiryClassificationPage showToast={showToast} />
    </Boundary>
  );
}

// Inquiry Owner Assignment (Putaran 3 Tahap 3B; L-12 Putaran 8) --
// onViewSalesInquiries = Team Workload row click (mockup baris 829),
// navigasi ke Inquiry Status & History (P_INQUIRY, sudah ada sejak
// Putaran 7) dgn location.state preset OWNER SAJA -- `presetStatus`
// DICABUT (lihat komentar InquiryListRoute di atas): InquiryListPage.jsx
// jatuh ke default OPEN_STATUSES (4 status: Open/In Review/Quoted/
// Negotiation) begitu presetStatus undefined, persis `stSel: OPEN` mockup
// -- BUKAN lagi satu status 'OPEN' terkunci seperti versi Tahap 3B.
function InquiryOwnerAssignmentRoute() {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Inquiry Owner Assignment temporarily unavailable">
      <InquiryOwnerAssignmentPage
        showToast={showToast}
        onViewSalesInquiries={(ownerId) => navigate(P_INQUIRY, { state: { presetOwnerId: ownerId } })}
      />
    </Boundary>
  );
}

/** `inquiryPrefill` (state App.jsx, dipakai InquiryFormPage lewat prop --
 *  "rute yang SUDAH ADA", TIDAK disentuh) tetap satu-satunya yang DIBACA
 *  halaman. `location.state.leadAccount` (Lead Qualification/Detail Lead,
 *  irisan 6) ikut dikirim sebagai cadangan -- pola hybrid yang sama dengan
 *  useRecord di file ini (state = cache, bukan sumber wajib): kalau
 *  `inquiryPrefill` context kosong tapi location.state masih ada (mis.
 *  balik lewat tombol Back/Forward browser), id akunnya tetap ketemu. */
function InquiryNewRoute() {
  const { showToast, inquiryPrefill, setInquiryPrefill } = useAppShell();
  const navigate = useNavigate();
  const location = useLocation();
  const accountId = inquiryPrefill?.accountId || location.state?.leadAccount?.id || null;
  return (
    <Boundary title="Inquiry Form temporarily unavailable">
      <InquiryIntakeWizardPage
        prefillAccountId={accountId}
        prefillContactId={inquiryPrefill?.contactId || null}
        onBack={() => { setInquiryPrefill(null); navigate(P_INQUIRY); }}
        onCreated={(id) => { setInquiryPrefill(null); navigate(id ? `${P_INQUIRY}/${id}` : P_INQUIRY); }}
        showToast={showToast}
      />
    </Boundary>
  );
}

function DealDetailRoute() {
  const { id } = useParams();
  const { showToast, setViewingProfileId, navigateToCustomerDetail, setPrfPrefillInquiryId, setProcPrfDetailId, setActiveMenu } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Deal Detail temporarily unavailable">
      <DealDetailPage
        inquiryId={id}
        onBack={() => navigate(P_INQUIRY)}
        onCreateQuotation={(inqId) => navigate(`${P_QUOTATION}/new${inqId ? `?inquiry=${inqId}` : ''}`)}
        onViewQuotation={(q) => navigate(`${P_QUOTATION}/${q.id}`, { state: { row: q } })}
        onEditInquiry={() => navigate(`${P_INQUIRY}/${id}/edit`)}
        // PRF belum pindah (giliran Procurement) → handoff tetap lewat menu id.
        onCreatePRF={() => { setPrfPrefillInquiryId(id); setActiveMenu('prf'); }}
        onViewPRF={(p) => { setProcPrfDetailId(p.id); setActiveMenu('proc-inquiry-fwd-msi'); }}
        onViewProfile={setViewingProfileId}
        onViewCustomer={(customerId) => navigateToCustomerDetail(customerId)}
        showToast={showToast}
      />
    </Boundary>
  );
}

function InquiryEditRoute() {
  const { id } = useParams();
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Edit Inquiry temporarily unavailable">
      <InquiryFormPage
        inquiryId={id}
        mode="edit"
        onBack={() => navigate(`${P_INQUIRY}/${id}`)}
        showToast={showToast}
      />
    </Boundary>
  );
}

// ============================================================================
// Quotation — list / detail / form (new · edit · duplicate · dari PRF/inquiry)
// ============================================================================
function QuotationListRoute() {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Quotation List temporarily unavailable">
      <QuotationListPage
        onAddQuotation={() => navigate(`${P_QUOTATION}/new`)}
        onSelectQuotation={(q) => navigate(`${P_QUOTATION}/${q.id}`, { state: { row: q } })}
        showToast={showToast}
      />
    </Boundary>
  );
}

/** Detail Quotation dipakai DUA rute: dari daftar (kembali → daftar) dan
 *  bersarang di bawah customer (kembali → customer itu, keputusan #3). */
function QuotationDetailView({ quotationId, backTo }) {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  const edit = (q, mode) =>
    navigate(`${P_QUOTATION}/${mode === 'duplicate' ? 'new' : `${q.id}/edit`}${mode === 'duplicate' ? `?duplicate=${q.id}` : ''}`, { state: { row: q } });
  return (
    <Boundary title="Quotation Detail temporarily unavailable">
      <QuotationDetailPage
        quotationId={quotationId}
        onBack={() => navigate(backTo)}
        onEdit={(q) => edit(q, 'edit')}
        onDuplicate={(q) => edit(q, 'duplicate')}
        showToast={showToast}
      />
    </Boundary>
  );
}

function QuotationDetailRoute() {
  const { id } = useParams();
  return <QuotationDetailView quotationId={id} backTo={P_QUOTATION} />;
}

/** Form Quotation. `quotation`/`duplicateFrom` = baris (bisa di-fetch dari id);
 *  `prefillFromPrf` = payload HITUNGAN dari PRFDetailPage — bukan baris, jadi
 *  ia hanya bisa datang lewat state dan hilang saat refresh (form jatuh ke
 *  kosong; perilaku lama malah melempar keluar form sama sekali). */
function QuotationFormRoute({ mode }) {
  const { id } = useParams();
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const seeded = useLocation().state ?? null;
  const duplicateId = sp.get('duplicate');
  const editing = useRecord('quotations', mode === 'edit' ? id : null, seeded?.row);
  const duplicate = useRecord('quotations', duplicateId, seeded?.row);
  const back = mode === 'edit' ? `${P_QUOTATION}/${id}` : P_QUOTATION;

  // Task 3.2 (migrasi 20261012000007) — tolak membuka mode edit kalau inquiry
  // induknya LOST/CANCELLED, termasuk akses lewat URL langsung (cek di level
  // rute ini, sebelum QuotationFormPage mount sama sekali). Trigger DB tetap
  // penjaga akhir kalau titik ini terlewat. Duplicate SENGAJA tidak ikut
  // diblokir di sini (keputusan Den — lihat prefill di QuotationFormPage).
  const inquiryStatus = useInquiryStatus(mode === 'edit' ? editing.row?.inquiry_id : null);
  const inquiryStatusLoading = mode === 'edit' && !!editing.row?.inquiry_id && inquiryStatus === undefined;

  if (editing.loading || duplicate.loading || inquiryStatusLoading) {
    return <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>;
  }
  if (mode === 'edit' && !editing.row) {
    return <RecordNotFound label="Quotation tidak ditemukan." onBack={() => navigate(P_QUOTATION)} backLabel="Kembali ke daftar Quotation" />;
  }
  if (mode === 'edit' && ['LOST', 'CANCELLED'].includes(inquiryStatus)) {
    return <RecordNotFound label="Quotation ini terkunci — inquiry induknya sudah Lost/Cancelled." onBack={() => navigate(back)} backLabel="Kembali ke Quotation" />;
  }
  return (
    <Boundary title="Quotation Form temporarily unavailable">
      <QuotationFormPage
        quotation={editing.row}
        duplicateFrom={duplicate.row}
        prefillFromPrf={seeded?.prf ?? null}
        prefillInquiryId={sp.get('inquiry')}
        onBack={() => navigate(back)}
        showToast={showToast}
      />
    </Boundary>
  );
}

// ============================================================================
// Customer — daftar, detail (+2 sub-view PRF yang MASIH state), 2 rute bersarang
// ============================================================================
function CustomerListRoute() {
  const { showToast, navigateToCustomerDetail } = useAppShell();
  return (
    <Boundary title="Master Customer temporarily unavailable">
      <CustomerListPage showToast={showToast} onSelectCustomer={navigateToCustomerDetail} />
    </Boundary>
  );
}

function CustomerDetailRoute() {
  const { id } = useParams();
  const {
    showToast, hasMenuPermission, setInquiryPrefill,
    customerPrfInquiryId, setCustomerPrfInquiryId,
    customerPrfViewId, setCustomerPrfViewId,
  } = useAppShell();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const tab = sp.get('tab') || 'info';
  const at = useCallback((t) => `${P_CUSTOMER}/${id}?tab=${t}`, [id]);

  // Keputusan #1: dua sub-view PRF TETAP state sampai Procurement pindah.
  // Keduanya merender halaman modul lain; memberi mereka alamat sekarang
  // berarti melahirkan rute /procurement/* di luar gilirannya.
  if (customerPrfInquiryId) {
    return (
      <Boundary title="Cetak PRF temporarily unavailable">
        <PRFFormPage prefillInquiryId={customerPrfInquiryId} onBack={() => setCustomerPrfInquiryId(null)} showToast={showToast} />
      </Boundary>
    );
  }
  if (customerPrfViewId) {
    return (
      <Boundary title="PRF Detail temporarily unavailable">
        <PRFDetailPage prfId={customerPrfViewId} onBack={() => setCustomerPrfViewId(null)} showToast={showToast} />
      </Boundary>
    );
  }
  return (
    <Boundary title="Customer Detail temporarily unavailable">
      <CustomerDetailPage
        id={id}
        onBack={() => navigate(P_CUSTOMER)}
        showToast={showToast}
        initialTab={tab}
        // "+ New Inquiry" — bawa akun (+ kontak utamanya) ke form create di menu
        // Inquiry. Digerbangi izin yang SAMA dengan Edit Inquiry (crm_inquiry.view).
        onCreateInquiry={hasMenuPermission('crm_inquiry', 'view')
          ? (accountId, contactId) => { setInquiryPrefill({ accountId, contactId }); navigate(MENU_PATHS['crm-inquiry-intake']); }
          : undefined}
        onEditInquiry={hasMenuPermission('crm_inquiry', 'view')
          ? (inq) => navigate(`${P_CUSTOMER}/${id}/inquiry/${inq.id}/edit`)
          : undefined}
        onViewQuotation={(q) => navigate(`${P_CUSTOMER}/${id}/quotation/${q.id}`, { state: { row: q } })}
        // Tab disimpan di URL lebih dulu supaya "kembali" mendarat di tab yang benar
        // walau sub-view PRF-nya masih digerakkan state.
        onCreatePRF={(inq) => { navigate(at('riwayat'), { replace: true }); setCustomerPrfInquiryId(inq.id); }}
        onViewPRF={(p) => { navigate(at('dokumen'), { replace: true }); setCustomerPrfViewId(p.id); }}
      />
    </Boundary>
  );
}

/** Keputusan #3: dibuka DARI Detail Customer → kembali ke customer itu, dan
 *  tujuannya ada di URL sehingga tetap benar setelah refresh / deep-link. */
function CustomerInquiryEditRoute() {
  const { id, inquiryId } = useParams();
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Edit Inquiry temporarily unavailable">
      <InquiryFormPage
        inquiryId={inquiryId}
        mode="edit"
        onBack={() => navigate(`${P_CUSTOMER}/${id}?tab=riwayat`)}
        showToast={showToast}
      />
    </Boundary>
  );
}

function CustomerQuotationRoute() {
  const { id, quotationId } = useParams();
  return <QuotationDetailView quotationId={quotationId} backTo={`${P_CUSTOMER}/${id}?tab=riwayat`} />;
}

// ============================================================================
// Aktivitas — tab bar (Jadwal & Tugas / Log / Riwayat Visit)
// ============================================================================
function ActivitiesRoute() {
  const { showToast, setActiveMenu } = useAppShell();
  const navigate = useNavigate();
  // ActivitiesPage:824-828 memanggil BERURUTAN setEditingProspect(draft) →
  // setShowProspectForm(true) → setActiveMenu('crm-prospects'). Kalau
  // setActiveMenu diteruskan apa adanya, ia menavigasi ke DAFTAR dan menimpa
  // perpindahan ke form. Jadi dua panggilan pertama hanya mencatat niat, dan
  // panggilan KETIGA yang mengeksekusinya — kontrak halaman tidak berubah.
  const draft = useRef(null);
  const wantForm = useRef(false);
  return (
    <div>
      <Boundary title="Activities temporarily unavailable">
        <ActivitiesPage
          showToast={showToast}
          setEditingProspect={(p) => { draft.current = p; }}
          setShowProspectForm={(open) => { wantForm.current = !!open; }}
          setActiveMenu={(menuId) => {
            if (menuId === 'crm-prospects' && wantForm.current) {
              wantForm.current = false;
              navigate(`${P_LEAD}/new?from=activity`, { state: { row: draft.current } });
              draft.current = null;
              return;
            }
            setActiveMenu(menuId);
          }}
        />
      </Boundary>
    </div>
  );
}

function ActivityLogRoute() {
  const { showToast } = useAppShell();
  return (
    <div>
      <Boundary title="Activity Log temporarily unavailable"><ActivityLogPage showToast={showToast} /></Boundary>
    </div>
  );
}

function RiwayatVisitRoute() {
  const { showToast } = useAppShell();
  return (
    <div>
      <Gated menuId="riwayat-visit">
        <Boundary title="Riwayat Visit temporarily unavailable"><RiwayatVisitPage showToast={showToast} /></Boundary>
      </Gated>
    </div>
  );
}

// ============================================================================
// Sales Order (dokumen CRM) — keputusan #2: ternary dibongkar jadi rute
// ============================================================================
function SalesOrderDocListRoute() {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Gated menuId="crm-sales-order">
      <Boundary title="Sales Order temporarily unavailable">
        <SalesOrderDocListPage
          variant="crm"
          onCreate={() => navigate(`${P_SO}/new`)}
          onSelect={(r) => navigate(`${P_SO}/${r.id}`)}
          showToast={showToast}
        />
      </Boundary>
    </Gated>
  );
}

function SalesOrderDocFormRoute() {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Gated menuId="crm-sales-order">
      <Boundary title="Sales Order temporarily unavailable">
        <SalesOrderDocFormPage
          onBack={() => navigate(P_SO)}
          onCreated={(id) => navigate(`${P_SO}/${id}`, { replace: true })}
          showToast={showToast}
        />
      </Boundary>
    </Gated>
  );
}

function SalesOrderDocDetailRoute() {
  const { id } = useParams();
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  return (
    <Gated menuId="crm-sales-order">
      <Boundary title="Sales Order temporarily unavailable">
        <SalesOrderDocDetailPage soId={id} onBack={() => navigate(P_SO)} showToast={showToast} />
      </Boundary>
    </Gated>
  );
}

// ============================================================================
// Peta rute
// ============================================================================
/** id menu yang PINDAH ke modul ini — dipakai legacy.routes.jsx untuk
 *  mengecualikannya dari rute legacy, dan route-table.jsx untuk validasi
 *  `nexus_last_path` (pelajaran (b) G2: pembaca "daftar rute yang dikenal"
 *  bukan cuma router). */
export const CRM_MENU_IDS = Object.freeze([
  'crm-dashboard', 'indomarco-dashboard', 'crm-pipeline',
  'crm-prospects', 'crm-lead-qualification', 'crm-lead-pool', 'crm-lead-pool-approval',
  'crm-inquiry', 'crm-inquiry-intake', 'crm-inquiry-classification', 'crm-inquiry-owner-assignment', 'quotation-draft', 'crm-customers', 'customer-detail',
  'crm-calls', 'crm-activity-log', 'riwayat-visit',
  'reporting-sales', 'crm-rate-list', 'crm-sales-order',
]);

export const crmRoutes = [
  {
    element: <ModuleShell><Outlet /></ModuleShell>,
    children: [
      { path: MENU_PATHS['crm-dashboard'],          handle: { menuId: 'crm-dashboard' },          element: <CrmDashboardRoute /> },
      { path: MENU_PATHS['indomarco-dashboard'],    handle: { menuId: 'indomarco-dashboard' },    element: <IndomarcoDashboardRoute /> },
      { path: MENU_PATHS['crm-pipeline'],           handle: { menuId: 'crm-pipeline' },           element: <PipelineRoute /> },

      { path: P_LEAD,                               handle: { menuId: 'crm-prospects' },          element: <LeadCaptureRoute /> },
      { path: `${P_LEAD}/new`,                      handle: { menuId: 'crm-prospects' },          element: <LeadNewRedirect /> },
      { path: `${P_LEAD}/:id`,                      handle: { menuId: 'crm-prospects' },          element: <LeadDetailRoute /> },
      { path: MENU_PATHS['crm-lead-qualification'], handle: { menuId: 'crm-lead-qualification' }, element: <LeadQualificationRoute /> },
      { path: MENU_PATHS['crm-lead-pool'],          handle: { menuId: 'crm-lead-pool' },          element: <LeadAssignmentRoute /> },
      { path: MENU_PATHS['crm-lead-pool-approval'], handle: { menuId: 'crm-lead-pool-approval' }, element: <LeadAssignmentApprovalRoute /> },

      { path: P_INQUIRY,                            handle: { menuId: 'crm-inquiry' },            element: <InquiryListRoute /> },
      { path: `${P_INQUIRY}/new`,                   handle: { menuId: 'crm-inquiry' },            element: <InquiryNewRoute /> },
      // Putaran 7 -- slot sidebar 1.2.1, elemen SAMA dengan "+ New Inquiry"
      // (${P_INQUIRY}/new di atas) tapi path & menuId sendiri (lihat
      // menu-skeleton.js: id BARU, bukan reuse 'crm-inquiry', supaya
      // SKELETON_MENU_PATHS tidak saling menimpa path dua mount).
      { path: MENU_PATHS['crm-inquiry-intake'],     handle: { menuId: 'crm-inquiry-intake' },     element: <InquiryNewRoute /> },
      { path: `${P_INQUIRY}/:id`,                   handle: { menuId: 'crm-inquiry' },            element: <DealDetailRoute /> },
      { path: `${P_INQUIRY}/:id/edit`,              handle: { menuId: 'crm-inquiry' },            element: <InquiryEditRoute /> },
      { path: MENU_PATHS['crm-inquiry-classification'], handle: { menuId: 'crm-inquiry-classification' }, element: <InquiryClassificationRoute /> },
      { path: MENU_PATHS['crm-inquiry-owner-assignment'], handle: { menuId: 'crm-inquiry-owner-assignment' }, element: <InquiryOwnerAssignmentRoute /> },

      { path: P_QUOTATION,                          handle: { menuId: 'quotation-draft' },        element: <QuotationListRoute /> },
      { path: `${P_QUOTATION}/new`,                 handle: { menuId: 'quotation-draft' },        element: <QuotationFormRoute mode="new" /> },
      { path: `${P_QUOTATION}/:id`,                 handle: { menuId: 'quotation-draft' },        element: <QuotationDetailRoute /> },
      { path: `${P_QUOTATION}/:id/edit`,            handle: { menuId: 'quotation-draft' },        element: <QuotationFormRoute mode="edit" /> },

      { path: P_CUSTOMER,                           handle: { menuId: 'crm-customers' },          element: <CustomerListRoute /> },
      { path: `${P_CUSTOMER}/:id`,                  handle: { menuId: 'customer-detail' },        element: <CustomerDetailRoute /> },
      { path: `${P_CUSTOMER}/:id/inquiry/:inquiryId/edit`, handle: { menuId: 'customer-detail' }, element: <CustomerInquiryEditRoute /> },
      { path: `${P_CUSTOMER}/:id/quotation/:quotationId`,  handle: { menuId: 'customer-detail' }, element: <CustomerQuotationRoute /> },

      { path: MENU_PATHS['crm-calls'],              handle: { menuId: 'crm-calls' },              element: <ActivitiesRoute /> },
      { path: MENU_PATHS['crm-activity-log'],       handle: { menuId: 'crm-activity-log' },       element: <ActivityLogRoute /> },
      { path: MENU_PATHS['riwayat-visit'],          handle: { menuId: 'riwayat-visit' },          element: <RiwayatVisitRoute /> },

      { path: MENU_PATHS['reporting-sales'],        handle: { menuId: 'reporting-sales' },        element: <CrmReportRoute /> },
      { path: MENU_PATHS['crm-rate-list'],          handle: { menuId: 'crm-rate-list' },          element: <RateListRoute /> },
      { path: MENU_PATHS['crm-option-requests'],    handle: { menuId: 'crm-option-requests' },    element: <OptionRequestsRoute /> },

      { path: P_SO,                                 handle: { menuId: 'crm-sales-order' },        element: <SalesOrderDocListRoute /> },
      { path: `${P_SO}/new`,                        handle: { menuId: 'crm-sales-order' },        element: <SalesOrderDocFormRoute /> },
      { path: `${P_SO}/:id`,                        handle: { menuId: 'crm-sales-order' },        element: <SalesOrderDocDetailRoute /> },
    ],
  },
];

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
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { supabase } from '@/lib/supabase';
import { AccessDeniedPage } from '@/App.jsx';
import { MENU_PATHS } from './menu-paths.js';
import Boundary from './Boundary.jsx';
import ModuleShell from './ModuleShell.jsx';
import RecordNotFound from './RecordNotFound.jsx';

const ProspectListPage       = lazy(() => import('@/modules/crm/ProspectListPage'));
const ProspectFormPage       = lazy(() => import('@/modules/crm/ProspectFormPage'));
const InquiryListPage        = lazy(() => import('@/modules/crm/InquiryListPage'));
const InquiryFormPage        = lazy(() => import('@/modules/crm/InquiryFormPage'));
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
const LeadPoolPage           = lazy(() => import('@/modules/crm/LeadPoolPage'));
const LeadPoolApprovalPage   = lazy(() => import('@/modules/crm/LeadPoolApprovalPage'));
const CRMReportPage          = lazy(() => import('@/modules/crm/CRMReportPage'));
const RateListPage           = lazy(() => import('@/modules/crm/RateListPage'));
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

// ============================================================================
// Account (Prospects / Lead Pool) — tab bar + Approval di luar tab
// ============================================================================
/** Tab bar Account disembunyikan saat form Prospect terbuka (sub-view satu
 *  halaman penuh) supaya form tak hilang karena salah pencet tab — perilaku
 *  lama; di sini "form terbuka" = rute /crm/lead/new, bukan lagi state. */
function ProspectListRoute() {
  const { showToast, navigateToCustomerDetail } = useAppShell();
  const navigate = useNavigate();
  return (
    <div>
      <Boundary title="CRM Prospects temporarily unavailable">
        <ProspectListPage
          onAddProspect={() => navigate(`${P_LEAD}/new`)}
          onSelectProspect={(p) => navigateToCustomerDetail(p.id)}
          showToast={showToast}
        />
      </Boundary>
    </div>
  );
}

function ProspectFormRoute() {
  const { showToast } = useAppShell();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  // Draft dari ActivitiesPage dititipkan lewat location.state (bukan baris
  // tersimpan → tak ada yang bisa di-fetch; refresh = form kosong, dan itu
  // tetap lebih baik daripada perilaku lama yang melempar keluar form).
  const draft = useLocation().state?.row ?? null;
  return (
    <div>
      <Boundary title="Prospect Form temporarily unavailable">
        <ProspectFormPage
          prospect={draft}
          onBack={() => navigate(sp.get('from') === 'activity' ? MENU_PATHS['crm-calls'] : P_LEAD)}
          showToast={showToast}
        />
      </Boundary>
    </div>
  );
}

function LeadPoolRoute() {
  const { showToast } = useAppShell();
  return (
    <div>
      <Boundary title="Lead Pool temporarily unavailable"><LeadPoolPage showToast={showToast} /></Boundary>
    </div>
  );
}

function LeadPoolApprovalRoute() {
  const { showToast } = useAppShell();
  return (
    <Gated menuId="crm-lead-pool-approval" onGoHome={false}>
      <Boundary title="Approval Lead Pool temporarily unavailable"><LeadPoolApprovalPage showToast={showToast} /></Boundary>
    </Gated>
  );
}

// ============================================================================
// Inquiry / Deal — 4 rute
// ============================================================================
function InquiryListRoute() {
  const { showToast, setInquiryPrefill } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="CRM Inquiry temporarily unavailable">
      {/* Jalur "+" lama: SELALU tanpa konteks. Clear eksplisit supaya prefill
          sisa dari jalur Detail Account tak pernah bocor ke form kosong ini. */}
      <InquiryListPage
        onAddInquiry={() => { setInquiryPrefill(null); navigate(`${P_INQUIRY}/new`); }}
        onSelectInquiry={(inq) => navigate(`${P_INQUIRY}/${inq.id}`)}
        showToast={showToast}
      />
    </Boundary>
  );
}

function InquiryNewRoute() {
  const { showToast, inquiryPrefill, setInquiryPrefill } = useAppShell();
  const navigate = useNavigate();
  return (
    <Boundary title="Inquiry Form temporarily unavailable">
      <InquiryFormPage
        prefillAccountId={inquiryPrefill?.accountId || null}
        prefillContactId={inquiryPrefill?.contactId || null}
        onBack={() => { setInquiryPrefill(null); navigate(P_INQUIRY); }}
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

  if (editing.loading || duplicate.loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>;
  }
  if (mode === 'edit' && !editing.row) {
    return <RecordNotFound label="Quotation tidak ditemukan." onBack={() => navigate(P_QUOTATION)} backLabel="Kembali ke daftar Quotation" />;
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
          ? (accountId, contactId) => { setInquiryPrefill({ accountId, contactId }); navigate(`${P_INQUIRY}/new`); }
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
  'crm-prospects', 'crm-lead-pool', 'crm-lead-pool-approval',
  'crm-inquiry', 'quotation-draft', 'crm-customers', 'customer-detail',
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

      { path: P_LEAD,                               handle: { menuId: 'crm-prospects' },          element: <ProspectListRoute /> },
      { path: `${P_LEAD}/new`,                      handle: { menuId: 'crm-prospects' },          element: <ProspectFormRoute /> },
      { path: MENU_PATHS['crm-lead-pool'],          handle: { menuId: 'crm-lead-pool' },          element: <LeadPoolRoute /> },
      { path: MENU_PATHS['crm-lead-pool-approval'], handle: { menuId: 'crm-lead-pool-approval' }, element: <LeadPoolApprovalRoute /> },

      { path: P_INQUIRY,                            handle: { menuId: 'crm-inquiry' },            element: <InquiryListRoute /> },
      { path: `${P_INQUIRY}/new`,                   handle: { menuId: 'crm-inquiry' },            element: <InquiryNewRoute /> },
      { path: `${P_INQUIRY}/:id`,                   handle: { menuId: 'crm-inquiry' },            element: <DealDetailRoute /> },
      { path: `${P_INQUIRY}/:id/edit`,              handle: { menuId: 'crm-inquiry' },            element: <InquiryEditRoute /> },

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

      { path: P_SO,                                 handle: { menuId: 'crm-sales-order' },        element: <SalesOrderDocListRoute /> },
      { path: `${P_SO}/new`,                        handle: { menuId: 'crm-sales-order' },        element: <SalesOrderDocFormRoute /> },
      { path: `${P_SO}/:id`,                        handle: { menuId: 'crm-sales-order' },        element: <SalesOrderDocDetailRoute /> },
    ],
  },
];

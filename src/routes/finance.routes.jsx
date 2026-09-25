/* eslint-disable react-refresh/only-export-components -- file peta rute: mengekspor daftar rute (nilai) berdampingan dengan komponen wrapper-nya; pola sama dengan logistics-warehouse.routes.jsx (G2) dan crm.routes.jsx (G3). Komponen HALAMAN-nya hidup di filenya masing-masing, jadi HMR halaman tidak terpengaruh. */
// src/routes/finance.routes.jsx
// ============================================================================
// AR Tahap 2 — rute modul Finance, tab 6.2.1 "Invoice Management".
//
//   /finance-accounting/accounts-receivable/invoice          -> redirect ke /ready
//   /finance-accounting/accounts-receivable/invoice/ready    ReadyToInvoicePage
//   /finance-accounting/accounts-receivable/invoice/list     InvoiceListPage
//   /finance-accounting/accounts-receivable/invoice/:id      InvoiceDetailPage
//
// SATU `handle.menuId` untuk keempatnya: `billing` -> menu key `fin_invoice`.
// Itu keputusan Den K-1: satu mount, pilihan Siap Ditagih / Daftar Invoice jadi
// tab DI DALAM halaman. Konsekuensinya nol key menu baru, nol baris katalog
// baru — yang perlu cuma grant (20260927000004).
//
// Sub-halamannya RUTE BERSARANG, bukan state: pelajaran TD-129/G3 — begitu
// "halaman mana yang sedang dibuka" hidup di state, refresh dan Back berhenti
// bisa dipercaya. Di sini /ready, /list, dan /:id semuanya punya alamat.
//
// ⚠️ Entitas aktif TIDAK diteruskan dari sini. Kedua halaman membacanya sendiri
// dari useAuth().activeCompanyId — pola yang sudah hidup di CRMDashboardPage,
// CRMReportPage, dan StorbitDashboardPage. `useAppShell()` sengaja TIDAK dipakai
// untuk itu: ia tidak membawa activeCompanyId, dan meneruskan nilai yang tak ada
// dari sana menghasilkan `undefined` yang jatuh jadi "semua entitas" — bug yang
// sama, cuma berbaju rapi. (Nyaris terjadi saat perbaikan uji manual 25 Sep.)
//
// ⚠️ `:id` diletakkan PALING AKHIR supaya /ready dan /list (statis) menang.
// Kalau urutannya dibalik, "ready" akan tertangkap sebagai invoiceId dan halaman
// menampilkan "Invoice tidak ditemukan" untuk path yang sah.
// ============================================================================
import { lazy } from 'react';
import { Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { parseListQuery } from '@/modules/finance/invoiceStatus.js';
import { C, FONT_DISPLAY, RADIUS } from '@/modules/logistics/spDetailTokens.js';
import { MENU_PATHS } from './menu-paths.js';
import Boundary from './Boundary.jsx';
import ModuleShell from './ModuleShell.jsx';

const ReadyToInvoicePage = lazy(() => import('@/modules/finance/ReadyToInvoicePage'));
const InvoiceListPage    = lazy(() => import('@/modules/finance/InvoiceListPage'));
const InvoiceDetailPage  = lazy(() => import('@/modules/finance/InvoiceDetailPage'));

const BASE       = MENU_PATHS.billing;
const PATH_READY = `${BASE}/ready`;
const PATH_LIST  = `${BASE}/list`;
// `query` = keadaan filter/pencarian Daftar Invoice, dibawa ke URL detail
// supaya navigasi rekaman "3 / 22" di sana mengikuti urutan yang sama dan tetap
// benar sesudah refresh (lihat invoiceStatus.js).
const invoicePath = (id, query = '') => `${BASE}/${encodeURIComponent(id)}${query}`;
const listPath    = (query = '') => `${PATH_LIST}${query}`;

/** Path Detail SP — dibentuk dari kontrak URL yang sama dengan modul gudang,
 *  supaya tautan lintas-modul tidak punya salinan bentuk path sendiri. */
const spDetailPath = (customerId, spNo) =>
  `${MENU_PATHS.manifest}/${encodeURIComponent(customerId)}/${encodeURIComponent(spNo)}`;

/** Path Detail Surat Jalan — sumber bentuk yang sama, dipakai tab
 *  "Dokumen Terkait" di Detail Invoice. */
const deliveryPath = (id) => `${MENU_PATHS['surat-jalan']}/${encodeURIComponent(id)}`;

// Pilihan sekunder di dalam halaman (keputusan K-1). Dirender di kedua halaman
// daftar, bukan di ContextHeader: ContextHeader menarik pilihannya dari
// `tab.mounts`, dan tab ini sengaja punya SATU mount.
function SubTabs({ aktif }) {
  const navigate = useNavigate();
  const item = [
    ['ready', 'Siap Ditagih',   PATH_READY],
    ['list',  'Daftar Invoice', PATH_LIST],
  ];
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
      {item.map(([kunci, label, path]) => {
        const on = aktif === kunci;
        return (
          <button
            key={kunci}
            onClick={() => navigate(path)}
            aria-pressed={on}
            style={{
              padding: '7px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
              border: `1px solid ${on ? C.accent : C.line}`,
              background: on ? C.accentSoft : 'transparent',
              color: on ? C.accentDeep : C.inkSoft,
              fontSize: 14, fontWeight: 600, fontFamily: FONT_DISPLAY,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ReadyRoute() {
  const navigate = useNavigate();
  const { showToast } = useAppShell();
  return (
    <ModuleShell>
      <Boundary title="Halaman Siap Ditagih tidak tersedia">
        <SubTabs aktif="ready"/>
        <ReadyToInvoicePage
          showToast={showToast}
          onOpenSp={(customerId, spNo) => navigate(spDetailPath(customerId, spNo))}
        />
      </Boundary>
    </ModuleShell>
  );
}

function ListRoute() {
  const navigate = useNavigate();
  return (
    <ModuleShell>
      <Boundary title="Daftar Invoice tidak tersedia">
        <SubTabs aktif="list"/>
        <InvoiceListPage onOpenInvoice={(id, query) => navigate(invoicePath(id, query))} />
      </Boundary>
    </ModuleShell>
  );
}

function DetailRoute() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useAppShell();
  // Keadaan daftar dibaca dari URL, BUKAN dari location.state: pelajaran G3 --
  // begitu asal-usul dititipkan ke state, janji "tetap benar setelah refresh"
  // gugur persis di kasus yang jadi alasannya ada.
  const query = `?${searchParams.toString()}`.replace(/^\?$/, '');
  return (
    <ModuleShell>
      <Boundary title="Detail Invoice tidak tersedia">
        <InvoiceDetailPage
          key={invoiceId}
          invoiceId={invoiceId}
          showToast={showToast}
          listQuery={parseListQuery(searchParams)}
          onBack={() => navigate(listPath(query))}
          onOpenInvoice={(id) => navigate(invoicePath(id, query))}
          onOpenSp={(customerId, spNo) => navigate(spDetailPath(customerId, spNo))}
          onOpenDelivery={(id) => navigate(deliveryPath(id))}
        />
      </Boundary>
    </ModuleShell>
  );
}

/** Id menu yang rutenya dimiliki file INI — dipakai legacy.routes.jsx dan
 *  skeleton.routes.jsx untuk mengecualikannya, supaya tidak pernah ada dua rute
 *  untuk satu path. */
export const FINANCE_MENU_IDS = ['billing'];

export const financeRoutes = [
  {
    path: BASE,
    handle: { menuId: 'billing' },
    element: <Outlet/>,
    children: [
      { index: true,          element: <Navigate to={PATH_READY} replace/> },
      { path: 'ready',        handle: { menuId: 'billing' }, element: <ReadyRoute/> },
      { path: 'list',         handle: { menuId: 'billing' }, element: <ListRoute/> },
      { path: ':invoiceId',   handle: { menuId: 'billing' }, element: <DetailRoute/> },
    ],
  },
];

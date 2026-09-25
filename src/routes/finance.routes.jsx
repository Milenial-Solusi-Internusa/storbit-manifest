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
// ⚠️ `:id` diletakkan PALING AKHIR supaya /ready dan /list (statis) menang.
// Kalau urutannya dibalik, "ready" akan tertangkap sebagai invoiceId dan halaman
// menampilkan "Invoice tidak ditemukan" untuk path yang sah.
// ============================================================================
import { lazy } from 'react';
import { Navigate, Outlet, useNavigate, useParams } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { MENU_PATHS } from './menu-paths.js';
import Boundary from './Boundary.jsx';
import ModuleShell from './ModuleShell.jsx';

const ReadyToInvoicePage = lazy(() => import('@/modules/finance/ReadyToInvoicePage'));
const InvoiceListPage    = lazy(() => import('@/modules/finance/InvoiceListPage'));
const InvoiceDetailPage  = lazy(() => import('@/modules/finance/InvoiceDetailPage'));

const BASE       = MENU_PATHS.billing;
const PATH_READY = `${BASE}/ready`;
const PATH_LIST  = `${BASE}/list`;
const invoicePath = (id) => `${BASE}/${encodeURIComponent(id)}`;

/** Path Detail SP — dibentuk dari kontrak URL yang sama dengan modul gudang,
 *  supaya tautan lintas-modul tidak punya salinan bentuk path sendiri. */
const spDetailPath = (customerId, spNo) =>
  `${MENU_PATHS.manifest}/${encodeURIComponent(customerId)}/${encodeURIComponent(spNo)}`;

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
      {item.map(([kunci, label, path]) => (
        <button
          key={kunci}
          onClick={() => navigate(path)}
          style={{
            padding: '7px 14px', borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${aktif === kunci ? '#5b3fa0' : '#C2C4C6'}`,
            background: aktif === kunci ? '#EFECF6' : 'transparent',
            color: aktif === kunci ? '#4a3585' : '#6B7686',
            fontSize: 14, fontWeight: 600,
            fontFamily: "'Storbit Display', 'Cormorant Garamond', Georgia, serif",
          }}
        >
          {label}
        </button>
      ))}
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
        <InvoiceListPage onOpenInvoice={(id) => navigate(invoicePath(id))} />
      </Boundary>
    </ModuleShell>
  );
}

function DetailRoute() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useAppShell();
  return (
    <ModuleShell>
      <Boundary title="Detail Invoice tidak tersedia">
        <InvoiceDetailPage
          key={invoiceId}
          invoiceId={invoiceId}
          showToast={showToast}
          onBack={() => navigate(PATH_LIST)}
          onOpenSp={(customerId, spNo) => navigate(spDetailPath(customerId, spNo))}
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

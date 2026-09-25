/* eslint-disable react-refresh/only-export-components -- file peta rute: mengekspor daftar rute (nilai) berdampingan dengan komponen wrapper-nya; pola sama dengan src/modules/crm/DealPanels.jsx. Komponen HALAMAN-nya sendiri hidup di filenya masing-masing, jadi HMR halaman tidak terpengaruh. */
// src/routes/logistics-warehouse.routes.jsx
// ============================================================================
// Batch FS Fase 2.5 G2 — modul PERTAMA yang keluar dari LegacyMenuOutlet.
// Cakupan (keputusan Den 22 Sep 2026): chain Storbit + Inventory — 13 cabang
// render / 9 id menu, termasuk TIGA halaman detail yang kini punya alamat
// sendiri (bentuknya dari DETAIL_ROUTE_TEMPLATES, kontrak G0):
//
//   /logistics-warehouse/warehouse/sales-order                  daftar SP
//   /logistics-warehouse/warehouse/sales-order/new              Input SP   (id `input`)
//   /logistics-warehouse/warehouse/sales-order/:customerId/:spNo  Detail SP
//   /logistics-warehouse/warehouse/picking-packing[/:id]        Picking List + detail
//   /logistics-warehouse/warehouse/delivery-note[/:id]          Surat Jalan + detail
//   /logistics-warehouse/warehouse/dashboard · /shipment
//   /logistics-warehouse/warehouse/stock-dashboard · /stock · /goods-receiving
//
// Bentuknya WRAPPER TIPIS (keputusan Den): tiap rute punya komponen kecil di
// file ini yang membaca `useParams()` + `useAppShell()`, lalu merender komponen
// halaman APA ADANYA — **nol prop komponen halaman berubah**, nol file halaman
// disentuh (file-filenya akan dipindah folder di Fase 3/7; menyentuhnya
// sekarang berarti menyentuhnya dua kali).
//
// Sumber kebenaran id record = URL. State pembawa lama (`selectedSpId`,
// `selectedPickingId`, `selectedDeliveryId`, `showInputSP`) DICABUT dari
// App.jsx — kalau dipertahankan, ia menghidupkan lagi dua sumber kebenaran yang
// baru saja dihapus G1 untuk `activeMenu`. Tombol kembali mengarah ke path
// daftar induk (deterministik: dari deep-link pun mendarat di daftar, bukan
// keluar aplikasi), bukan `navigate(-1)`.
// ============================================================================
import { lazy } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { AccessDeniedPage } from '@/App.jsx';
import { generatePickingFromSp, generateDeliveryFromPicking } from '@/lib/db';
import { MENU_PATHS, DETAIL_ROUTE_TEMPLATES } from './menu-paths.js';
import Boundary from './Boundary.jsx';
import ModuleShell from './ModuleShell.jsx';
import RecordNotFound from './RecordNotFound.jsx';

const SalesOrderPage         = lazy(() => import('@/modules/logistics/SalesOrderPage'));
const SalesOrderDetailPage   = lazy(() => import('@/modules/logistics/SalesOrderDetailPage'));
const InputSPPage            = lazy(() => import('@/modules/logistics/InputSPPage'));
const PickingListPage        = lazy(() => import('@/modules/logistics/PickingListPage'));
const PickingListDetailPage  = lazy(() => import('@/modules/logistics/PickingListDetailPage'));
const DeliveryNotePage       = lazy(() => import('@/modules/logistics/DeliveryNotePage'));
const DeliveryNoteDetailPage = lazy(() => import('@/modules/logistics/DeliveryNoteDetailPage'));
const StorbitDashboardPage   = lazy(() => import('@/modules/logistics/StorbitDashboardPage'));
const InventoryDashboardPage = lazy(() => import('@/modules/inventory/pages/InventoryDashboardPage'));
const StokBarangPage         = lazy(() => import('@/modules/inventory/pages/StokBarangPage'));
const PenerimaanBarangPage   = lazy(() => import('@/modules/inventory/pages/PenerimaanBarangPage'));


// ── pembentuk path detail (satu sumber: kontrak menu-paths.js) ──────────────
const LIST_SP       = MENU_PATHS.manifest;
const LIST_PICKING  = MENU_PATHS.picking;
const LIST_DELIVERY = MENU_PATHS['surat-jalan'];
const spDetailPath       = (customerId, spNo) => `${LIST_SP}/${encodeURIComponent(customerId)}/${encodeURIComponent(spNo)}`;
const pickingDetailPath  = (id) => `${LIST_PICKING}/${encodeURIComponent(id)}`;
const deliveryDetailPath = (id) => `${LIST_DELIVERY}/${encodeURIComponent(id)}`;
// Lintas modul: Detail SP -> Detail Invoice di modul Finance (AR Tahap 2).
// Bentuknya dibaca dari kontrak URL yang sama (MENU_PATHS.billing), bukan
// ditulis ulang di sini -- dua salinan bentuk path pasti melenceng suatu hari.
const invoiceDetailPath  = (id) => `${MENU_PATHS.billing}/${encodeURIComponent(id)}`;

// ── Daftar SP ───────────────────────────────────────────────────────────────
function SalesOrderListRoute() {
  const navigate = useNavigate();
  const { groupedSP, customers, dcList, role, exportCSV, refreshSp, showToast, canInputSP } = useAppShell();
  return (
    <Boundary title="Sales Order section temporarily unavailable">
      <SalesOrderPage
        groupedSP={groupedSP}
        customers={customers}
        dcList={dcList}
        role={role}
        onSelectSP={(g) => navigate(spDetailPath(g.customerId, g.spNo))}
        // Penyatuan jalur Input SP (kontrak G0 #9) + keputusan Den 22 Sep 2026:
        // tombolnya kini digerbangi izin yang SAMA dengan rutenya (canInputSP) —
        // undefined = SalesOrderPage menyembunyikan tombolnya, jadi tak ada lagi
        // tombol yang pasti berujung Akses Ditolak. Sebelum G2 tombol ini tanpa
        // gate sama sekali, padahal InputSPPage tidak punya guard sendiri.
        onAddSP={canInputSP ? () => navigate(MENU_PATHS.input) : undefined}
        onExport={exportCSV}
        onRefresh={refreshSp}
        showToast={showToast}
      />
    </Boundary>
  );
}

// ── Input SP (menu `input` + tombol "Input SP" di daftar) ───────────────────
function InputSpRoute() {
  const navigate = useNavigate();
  const { customers, dcList, showToast, canInputSP, setActiveMenu } = useAppShell();
  if (!canInputSP) return <AccessDeniedPage onGoHome={() => setActiveMenu('home')} />;
  return (
    <Boundary title="Input SP section temporarily unavailable">
      <InputSPPage
        onBack={() => navigate(LIST_SP)}
        customers={customers}
        dcList={dcList}
        showToast={showToast}
      />
    </Boundary>
  );
}

// ── Detail SP ───────────────────────────────────────────────────────────────
function SalesOrderDetailRoute() {
  const navigate = useNavigate();
  const { customerId, spNo } = useParams();
  const {
    enrichedRows, groupedSP, dbSaveRow, handleDelete, dbRemoveRowsBySp,
    refreshSp, showToast, role, spLoading,
  } = useAppShell();
  const group = groupedSP.find(g => g.uid === `${customerId}|${spNo}`) || null;
  // Generate picking dari SP, lalu lompat ke detailnya. Sebelum G2 fungsi ini
  // hidup di App.jsx dan memindahkan halaman lewat setState; kini ia milik
  // modulnya dan berpindah lewat alamat.
  const handleGeneratePicking = async (spNoArg, customerIdArg) => {
    const { data, error } = await generatePickingFromSp(spNoArg, customerIdArg);
    if (error) { showToast(error.message || 'Gagal membuat picking list', 'error'); return; }
    if (!data?.picking_list_id) { showToast('Picking list gagal dibuat', 'error'); return; }
    showToast(`Picking list ${data.picking_no} dibuat`);
    navigate(pickingDetailPath(data.picking_list_id));
  };
  // Deep-link id tak sah (checklist butir 4). `spLoading` wajib ikut diuji:
  // tanpa itu, SP yang SAH akan dituduh "tidak ditemukan" selama fetch pertama
  // masih jalan. SalesOrderDetailPage sendiri tidak punya keadaan ini (beda
  // dari PickingListDetailPage/DeliveryNoteDetailPage yang sudah punya).
  if (!spLoading && !group) {
    return (
      <RecordNotFound
        label={`SP ${spNo} tidak ditemukan.`}
        backLabel="Kembali ke daftar SP"
        onBack={() => navigate(LIST_SP)}
      />
    );
  }
  return (
    <Boundary title="SP Detail section temporarily unavailable">
      <SalesOrderDetailPage
        key={`${customerId}|${spNo}`}
        spNo={spNo}
        items={enrichedRows.filter(r => r.spNo === spNo && r.customerId === customerId)}
        group={group}
        onBack={() => navigate(LIST_SP)}
        onSaveItem={dbSaveRow}
        onDeleteItem={handleDelete}
        onDeleteSP={async (spNoArg, customerIdArg) => {
          await dbRemoveRowsBySp(spNoArg, customerIdArg);
          navigate(LIST_SP);
          showToast(`SP ${spNoArg} dihapus`);
        }}
        onGeneratePicking={handleGeneratePicking}
        onRefresh={refreshSp}
        onOpenPicking={(pid) => navigate(pickingDetailPath(pid))}
        onOpenDelivery={(did) => navigate(deliveryDetailPath(did))}
        onOpenInvoice={(invId) => navigate(invoiceDetailPath(invId))}
        showToast={showToast}
        role={role}
      />
    </Boundary>
  );
}

// ── Picking List ────────────────────────────────────────────────────────────
function PickingListRoute() {
  const navigate = useNavigate();
  const { customerByUid, showToast } = useAppShell();
  return (
    <Boundary title="Picking List section temporarily unavailable">
      <PickingListPage
        customerByUid={customerByUid}
        onOpenDetail={(id) => navigate(pickingDetailPath(id))}
        showToast={showToast}
      />
    </Boundary>
  );
}

function PickingDetailRoute() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast } = useAppShell();
  // Surat jalan lahir dari picking list — sama seperti handleGeneratePicking,
  // fungsi ini pindah dari App.jsx ke modulnya.
  const handleCreateDelivery = async (picking) => {
    const { data, error } = await generateDeliveryFromPicking(picking?.id);
    if (error) { showToast(error.message || 'Gagal membuat surat jalan', 'error'); return; }
    if (!data?.delivery_note_id) { showToast('Surat jalan gagal dibuat', 'error'); return; }
    showToast(`Surat jalan ${data.do_no} dibuat`);
    navigate(deliveryDetailPath(data.delivery_note_id));
  };
  return (
    <Boundary title="Picking Detail section temporarily unavailable">
      <PickingListDetailPage
        pickingListId={id}
        onBack={() => navigate(LIST_PICKING)}
        onCreateDelivery={handleCreateDelivery}
        onGoToSp={(spNoArg, customerIdArg) => navigate(spDetailPath(customerIdArg, spNoArg))}
        showToast={showToast}
      />
    </Boundary>
  );
}

// ── Surat Jalan ─────────────────────────────────────────────────────────────
function DeliveryNoteListRoute() {
  const navigate = useNavigate();
  const { customerBySpNo, showToast } = useAppShell();
  return (
    <Boundary title="Surat Jalan section temporarily unavailable">
      <DeliveryNotePage
        customerBySpNo={customerBySpNo}
        onOpenDetail={(id) => navigate(deliveryDetailPath(id))}
        showToast={showToast}
      />
    </Boundary>
  );
}

function DeliveryNoteDetailRoute() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast } = useAppShell();
  return (
    <Boundary title="Surat Jalan Detail section temporarily unavailable">
      <DeliveryNoteDetailPage
        deliveryNoteId={id}
        onBack={() => navigate(LIST_DELIVERY)}
        onGoToPicking={(pid) => navigate(pickingDetailPath(pid))}
        showToast={showToast}
      />
    </Boundary>
  );
}

// ── Dashboard Storbit ───────────────────────────────────────────────────────
function StorbitDashboardRoute() {
  const navigate = useNavigate();
  const { customers, showToast, setSelectedProduct, setActiveMenu } = useAppShell();
  return (
    <Boundary title="Dashboard Storbit temporarily unavailable">
      <StorbitDashboardPage
        customers={customers}
        showToast={showToast}
        // Drill-down baris tabel. SP kini punya alamat sendiri → navigate.
        // Produk BELUM pindah (giliran modul Admin/Foundation): tetap memakai
        // pola lama `setSelectedProduct` + `setActiveMenu('product-detail')`,
        // yang di G1 dibawa sebagai overlay location.state.
        onSelectSP={(r) => navigate(spDetailPath(r.customer_id, r.sp_no))}
        onSelectProduct={(r) => {
          setSelectedProduct({ id: r.product_id });
          setActiveMenu('product-detail');
        }}
      />
    </Boundary>
  );
}

// ── Pengiriman SP (halaman inline App.jsx) ──────────────────────────────────
function ShipmentRoute() {
  const { ShipmentPage, enrichedRows, updateShipmentRow, role, canRenderPage, setActiveMenu } = useAppShell();
  if (!canRenderPage('shipment')) return <AccessDeniedPage onGoHome={() => setActiveMenu('home')} />;
  return <ShipmentPage rows={enrichedRows} onUpdate={updateShipmentRow} role={role} />;
}

// ── Inventory ───────────────────────────────────────────────────────────────
function InventoryDashboardRoute() {
  return (
    <Boundary title="Dashboard Inventory temporarily unavailable">
      <InventoryDashboardPage />
    </Boundary>
  );
}

function StokBarangRoute() {
  const { setActiveMenu } = useAppShell();
  return (
    <Boundary title="Stok Barang temporarily unavailable">
      <StokBarangPage setActiveMenu={setActiveMenu} />
    </Boundary>
  );
}

function PenerimaanBarangRoute() {
  const { setActiveMenu } = useAppShell();
  return (
    <Boundary title="Penerimaan Barang temporarily unavailable">
      <PenerimaanBarangPage setActiveMenu={setActiveMenu} />
    </Boundary>
  );
}

/** Id menu yang sudah punya rute sendiri di file ini — dikecualikan dari
 *  legacy.routes.jsx supaya tidak ada dua rute untuk path yang sama. */
export const LOGISTICS_WAREHOUSE_MENU_IDS = Object.freeze([
  'manifest', 'input', 'picking', 'surat-jalan',
  'storbit-dashboard', 'shipment',
  'inventory-dashboard', 'inventory-stok', 'inventory-penerimaan',
]);

const SP_DETAIL_PATH       = DETAIL_ROUTE_TEMPLATES.manifest[0];
const PICKING_DETAIL_PATH  = DETAIL_ROUTE_TEMPLATES.picking[0];
const DELIVERY_DETAIL_PATH = DETAIL_ROUTE_TEMPLATES['surat-jalan'][0];

/** Rute modul Logistics & Warehouse. Dibungkus satu layout tanpa path
 *  (ModuleShell) yang memasang bingkai `.nexus-main-surface` + gate konten —
 *  keduanya diwarisi dari region lama di LegacyMenuOutlet. */
export const logisticsWarehouseRoutes = [
  {
    element: (
      <ModuleShell>
        <Outlet />
      </ModuleShell>
    ),
    children: [
      { path: MENU_PATHS['storbit-dashboard'],   handle: { menuId: 'storbit-dashboard' },   element: <StorbitDashboardRoute /> },
      { path: MENU_PATHS.manifest,               handle: { menuId: 'manifest' },            element: <SalesOrderListRoute /> },
      { path: MENU_PATHS.input,                  handle: { menuId: 'input' },               element: <InputSpRoute /> },
      { path: SP_DETAIL_PATH,                    handle: { menuId: 'manifest' },            element: <SalesOrderDetailRoute /> },
      { path: MENU_PATHS.picking,                handle: { menuId: 'picking' },             element: <PickingListRoute /> },
      { path: PICKING_DETAIL_PATH,               handle: { menuId: 'picking' },             element: <PickingDetailRoute /> },
      { path: MENU_PATHS['surat-jalan'],         handle: { menuId: 'surat-jalan' },         element: <DeliveryNoteListRoute /> },
      { path: DELIVERY_DETAIL_PATH,              handle: { menuId: 'surat-jalan' },         element: <DeliveryNoteDetailRoute /> },
      { path: MENU_PATHS.shipment,               handle: { menuId: 'shipment' },            element: <ShipmentRoute /> },
      { path: MENU_PATHS['inventory-dashboard'], handle: { menuId: 'inventory-dashboard' }, element: <InventoryDashboardRoute /> },
      { path: MENU_PATHS['inventory-stok'],      handle: { menuId: 'inventory-stok' },      element: <StokBarangRoute /> },
      { path: MENU_PATHS['inventory-penerimaan'],handle: { menuId: 'inventory-penerimaan' },element: <PenerimaanBarangRoute /> },
    ],
  },
];

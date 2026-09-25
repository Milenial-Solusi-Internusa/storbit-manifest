/* eslint-disable react-refresh/only-export-components -- file peta rute: mengekspor daftar rute (nilai) berdampingan dengan komponen wrapper-nya; pola sama dengan crm.routes.jsx (G3) dan logistics-warehouse.routes.jsx (G2). Komponen HALAMAN-nya sendiri hidup di filenya masing-masing, jadi HMR halaman tidak terpengaruh. */
// src/routes/skeleton.routes.jsx
// Rute yang LAHIR dari kerangka Bagian 1 (menu-skeleton.js). Tiga jenis saja —
// sisanya tetap dimiliki file rute yang sudah ada:
//
//   1. tab placeholder            → <MenuPlaceholderPage/> (statis, nol fetch)
//   2. mount yang MASIH tinggal   → LEGACY_OUTLET, `handle.menuId` = id lama,
//      di LegacyMenuOutlet           jadi cabang render di App.jsx tidak berubah
//   3. DC Master                  → satu-satunya halaman yang belum pernah punya
//                                   rute (hari ini hanya kartu di AdminHub)
//
// Mount yang halamannya SUDAH keluar dari LegacyMenuOutlet (CRM di G3,
// Logistics & Warehouse di G2) TIDAK disentuh di sini: crm.routes.jsx dan
// logistics-warehouse.routes.jsx membangun path-nya dari MENU_PATHS, jadi
// begitu kontrak URL-nya bergeser, rutenya ikut pindah sendiri.
//
// Kepala konteksnya sendiri bukan urusan file ini — ContextHeader (layout
// tunggal di route-table.jsx) yang merendernya untuk SEMUA rute anak; sejak
// sidebar jadi tiga tingkat ia berisi breadcrumb + pilihan sekunder, bukan
// tab bar.
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { LegacyMenuOutlet, AccessDeniedPage } from '@/App.jsx';
import ModuleShell from './ModuleShell.jsx';
import Boundary from './Boundary.jsx';
import MenuPlaceholderPage from '@/components/MenuPlaceholderPage.jsx';
import {
  SKELETON, SKELETON_TABS, LEGACY_PATH_REDIRECTS,
} from './menu-skeleton.js';
import { CRM_MENU_IDS } from './crm.routes.jsx';
import { LOGISTICS_WAREHOUSE_MENU_IDS } from './logistics-warehouse.routes.jsx';
import { FINANCE_MENU_IDS } from './finance.routes.jsx';

const DcMasterPage = lazy(() => import('@/modules/admin/pages/DcMasterPage'));

// Satu instance dibagi semua rute legacy di bawah kerangka ini — alasan yang
// sama dengan legacy.routes.jsx sejak G1: pindah tab tidak me-remount.
const LEGACY_OUTLET = <LegacyMenuOutlet />;

/** Id yang rutenya sudah dimiliki file rute modul (G2/G3). */
const ALREADY_ROUTED = new Set([...CRM_MENU_IDS, ...LOGISTICS_WAREHOUSE_MENU_IDS, ...FINANCE_MENU_IDS]);

function DcMasterRoute() {
  const navigate = useNavigate();
  return (
    <ModuleShell>
      <Boundary title="DC Master tidak tersedia">
        <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', color: '#9C948D' }}>Loading…</div>}>
          {/* onHome: di AdminHub tombol ini kembali ke landing hub. Dari tab
              Logistics & Warehouse, tujuan yang setara adalah hub itu sendiri. */}
          <DcMasterPage onHome={() => navigate('/admin-settings')} />
        </Suspense>
      </Boundary>
    </ModuleShell>
  );
}

function PlaceholderRoute({ tab }) {
  return (
    <ModuleShell>
      <MenuPlaceholderPage tab={tab} />
    </ModuleShell>
  );
}

// Hanya tercapai kalau ContextHeader tidak menemukan SATU pun Level 3 yang
// boleh dibuka user di Level 2 ini — artinya ia memang tidak berhak. Tanpa
// komponen ini rute index Level 2 akan menampilkan halaman kosong, bukan
// penolakan. (Nama fungsinya dipertahankan: ia dirujuk di bawah.)
function Level2NoAccess() {
  const navigate = useNavigate();
  return <AccessDeniedPage onGoHome={() => navigate('/home')} />;
}

const redirectFroms = new Set(LEGACY_PATH_REDIRECTS.map(([from]) => from));

const routes = [];
/** Id menu yang rutenya dimiliki file INI (dipakai legacy.routes.jsx untuk
 *  mengecualikannya, supaya tidak pernah ada dua rute untuk satu path). */
const ownedIds = [];

for (const tab of SKELETON_TABS) {
  if (!tab.mounts.length) {
    // Tab placeholder — satu rute, satu id, tanpa splat (tidak punya sub-view).
    routes.push({ path: tab.path, handle: { menuId: tab.id }, element: <PlaceholderRoute tab={tab} /> });
    ownedIds.push(tab.id);
    continue;
  }
  for (const mount of tab.mounts) {
    if (ALREADY_ROUTED.has(mount.menuId)) continue;
    if (mount.menuId === 'dc-master') {
      routes.push({ path: mount.path, handle: { menuId: 'dc-master' }, element: <DcMasterRoute /> });
      ownedIds.push('dc-master');
      continue;
    }
    // Sufiks `/*` mempertahankan perilaku legacy.routes.jsx: sub-path mendarat
    // di blok render induknya (mis. Detail PRF yang masih digerakkan state).
    routes.push({ path: `${mount.path}/*`, handle: { menuId: mount.menuId }, element: LEGACY_OUTLET });
    ownedIds.push(mount.menuId);
  }
  // 11 id stub AssetShell (Q-D): punya rute supaya path lama & ?menu= tetap
  // hidup, tapi tidak muncul sebagai pilihan segmented di tab-nya.
  for (const stub of (tab.stubs || [])) {
    routes.push({ path: `${stub.path}/*`, handle: { menuId: stub.menuId }, element: LEGACY_OUTLET });
    ownedIds.push(stub.menuId);
  }
}

// Path Level 2 telanjang → ContextHeader melemparnya ke Level 3 pertama yang
// layak (punya halaman hidup dan boleh dibuka user).
// TIDAK didaftarkan kalau path itu sudah jadi sumber redirect path lama:
// redirect eksplisit menuju tab yang TEPAT, sementara index Level 2 menuju tab
// pertama — untuk 1.5 keduanya berbeda, dan yang lama harus menang.
for (const mod of SKELETON) {
  for (const l2 of mod.items) {
    if (!l2.tabs.length) continue;                 // 6.6 — path Level 2 = path tab-nya sendiri
    if (redirectFroms.has(l2.path)) continue;
    routes.push({ path: l2.path, element: <Level2NoAccess /> });
  }
}

export const skeletonRoutes = routes;
export const SKELETON_ROUTE_MENU_IDS = Object.freeze(ownedIds);

// src/routes/Level2Shell.jsx
// Kerangka tab untuk item Level 2 Grand Design Bagian 1.
//
// Dipasang SATU kali di route-table.jsx sebagai layout yang membungkus SELURUH
// rute anak. Ia menentukan sendiri apakah sedang berdiri di dalam sebuah Level 2
// dengan mencocokkan `pathname` ke kontrak di menu-skeleton.js:
//
//   - cocok  → render judul Level 2 + tab bar (+ pilihan sekunder bila tab itu
//              memuat lebih dari satu halaman lama), lalu <Outlet/>
//   - tidak  → render <Outlet/> apa adanya (/, /home, /dashboard, /admin-settings,
//              /bnf/*, /planned/*, dan seluruh rute legacy lain tidak berubah)
//
// Bentuk ini sengaja dipilih supaya crm.routes.jsx / logistics-warehouse.routes.jsx
// TIDAK perlu diubah strukturnya: halaman yang sudah keluar dari LegacyMenuOutlet
// tetap dibungkus ModuleShell-nya sendiri, yang masih di dalam tetap dirender
// LegacyMenuOutlet. Tab bar hidup DI ATAS kedua-duanya, jadi tidak ada salinan
// ketiga gate konten maupun bingkai .nexus-main-surface (TD-273 tetap dua).
//
// Elemen komponen ini dipakai sebagai KONSTANTA tunggal (satu <Level2Shell/>
// untuk semua rute): pindah tab atau pindah modul tidak pernah me-remount-nya,
// pola yang sama dengan LEGACY_OUTLET sejak G1.
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { l2ForPath, tabForPath } from './menu-skeleton.js';

/** Tab boleh dibuka kalau minimal SATU halaman di dalamnya boleh dibuka.
 *  Tab placeholder dinilai lewat id-nya sendiri (menu key `skel_*` yang sengaja
 *  tidak di-seed → hanya super_admin). */
function tabAccessible(tab, canRenderPage) {
  if (tab.mounts.length) return tab.mounts.some((m) => canRenderPage(m.menuId));
  return canRenderPage(tab.id);
}

/** Tab pertama yang layak dibuka saat user mendarat di Level 2 tanpa menyebut
 *  tab: yang PUNYA halaman hidup lebih dulu, placeholder hanya kalau tak ada
 *  satu pun (keputusan Den Q-E). */
function firstUsefulTab(l2, canRenderPage) {
  const tabs = l2.tabs.length ? l2.tabs : [];
  const live = tabs.find((t) => t.mounts.length && tabAccessible(t, canRenderPage));
  if (live) return live;
  return tabs.find((t) => tabAccessible(t, canRenderPage)) || null;
}

/** Halaman pertama di dalam sebuah tab yang boleh dibuka user. */
function firstUsefulMount(tab, canRenderPage) {
  return tab.mounts.find((m) => canRenderPage(m.menuId)) || null;
}

function TabBar({ tabs, activeCode, onGo }) {
  return (
    <div
      style={{
        display: 'flex', gap: 2, flexWrap: 'wrap',
        borderBottom: '1px solid var(--line, #E8ECF2)',
        marginBottom: 2,
      }}
    >
      {tabs.map((t) => {
        const on = t.code === activeCode;
        return (
          <button
            key={t.code} type="button" onClick={() => onGo(t)} title={t.desc || undefined}
            style={{
              appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '9px 14px', marginBottom: -1,
              fontFamily: "'Montserrat', system-ui, sans-serif",
              fontSize: 12.5, fontWeight: on ? 700 : 600,
              color: on ? 'var(--navy, #1B4D8A)' : 'var(--mute, #7E8899)',
              borderBottom: on ? '2px solid var(--navy, #1B4D8A)' : '2px solid transparent',
              textAlign: 'left',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function SecondaryPicker({ mounts, activeMenuId, onGo }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 0 0' }}>
      {mounts.map((m) => {
        const on = m.menuId === activeMenuId;
        return (
          <button
            key={m.menuId} type="button" onClick={() => onGo(m)}
            style={{
              appearance: 'none', cursor: 'pointer',
              padding: '5px 12px', borderRadius: 999,
              border: `1px solid ${on ? 'var(--navy, #1B4D8A)' : 'var(--line, #E8ECF2)'}`,
              background: on ? 'var(--p-blue, #E9F1FC)' : 'white',
              color: on ? 'var(--navy, #1B4D8A)' : 'var(--mute, #7E8899)',
              fontSize: 12, fontWeight: on ? 700 : 600,
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Level2Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { canRenderPage, activeMenu } = useAppShell();

  const found = l2ForPath(pathname);
  if (!found) return <Outlet />;

  const { module, l2 } = found;
  const tabs = (l2.tabs.length ? l2.tabs : []).filter((t) => tabAccessible(t, canRenderPage));
  const active = tabForPath(pathname);

  // Mendarat di path Level 2 tanpa menyebut tab → lempar ke tab pertama yang
  // layak. Kalau NOL tab boleh dibuka, biarkan anak rutenya yang menampilkan
  // Akses Ditolak — jangan memutuskan sendiri di sini.
  if (!active) {
    const first = firstUsefulTab(l2, canRenderPage);
    if (first) {
      const mount = first.mounts.length ? firstUsefulMount(first, canRenderPage) : null;
      return <Navigate to={mount ? mount.path : first.path} replace />;
    }
    return <Outlet />;
  }

  const visibleMounts = active.mounts.filter((m) => canRenderPage(m.menuId));
  const showPicker = active.mounts.length > 1 && visibleMounts.length > 1;

  const goTab = (t) => {
    const mount = t.mounts.length ? firstUsefulMount(t, canRenderPage) : null;
    navigate(mount ? mount.path : t.path);
  };

  // Padding horizontal HANYA di blok kepala. Anak rutenya membawa
  // `.nexus-main-surface` dengan kelas padding yang sama persis, jadi kalau
  // pembungkus ini ikut ber-padding, isinya menjorok dua kali dan tab bar tidak
  // lagi sejajar dengan konten.
  return (
    <div className="w-full min-w-0">
      <div className="px-5 sm:px-7 xl:px-9 pt-5 lg:pt-6">
      <div
        style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.9px',
          textTransform: 'uppercase', color: 'var(--faint, #A6AEBD)',
          marginBottom: 6,
        }}
      >
        {module.label}
      </div>
      <h1
        style={{
          fontFamily: "'Montserrat', system-ui, sans-serif",
          fontSize: 19, fontWeight: 800, lineHeight: 1.25,
          color: 'var(--ink, #212A37)', margin: '0 0 14px',
        }}
      >
        {l2.label}
      </h1>

      {tabs.length > 0 && <TabBar tabs={tabs} activeCode={active.code} onGo={goTab} />}
      {showPicker && (
        <SecondaryPicker
          mounts={visibleMounts}
          activeMenuId={activeMenu}
          onGo={(m) => navigate(m.path)}
        />
      )}
      </div>

      <Outlet />
    </div>
  );
}

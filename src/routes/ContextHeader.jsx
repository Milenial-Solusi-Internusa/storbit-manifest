// src/routes/ContextHeader.jsx
// Kepala konteks untuk halaman yang duduk di kerangka Grand Design Bagian 1.
//
// Menggantikan Level2Shell (tab bar Level 3) sejak sidebar jadi TIGA tingkat:
// begitu Level 3 punya barisnya sendiri di sidebar, tab bar di dalam halaman
// mengulang navigasi yang sama dua kali. Yang tersisa di sini tinggal tiga hal:
//
//   1. BREADCRUMB "Modul > Level 2 > Level 3" (nama Bagian 1 verbatim) —
//      ringan, tanpa judul besar, supaya tidak menumpuk dengan judul asli
//      halaman yang tidak boleh disentuh.
//   2. PILIHAN SEKUNDER untuk Level 3 yang memuat lebih dari satu halaman lama.
//   3. REDIRECT path Level 2 telanjang → Level 3 pertama yang punya halaman
//      hidup dan boleh dibuka user.
//
// ⭐ Breadcrumb-nya SENGAJA bukan <h1>/<h2>, melainkan <nav> berisi <span>.
// Bukan soal selera: fingerprint QA memungut `headings` dari
// querySelectorAll('h1,h2'). Dengan elemen non-heading, `headings` tiap halaman
// tetap identik dengan baseline, sehingga aturan bacanya bisa tetap keras —
// headings berubah = regresi, tanpa kategori pengecualian.
//
// Dipasang SATU kali di route-table.jsx sebagai layout pembungkus seluruh rute
// anak; ia menentukan sendiri apakah sedang berada di dalam sebuah Level 2
// dengan mencocokkan `pathname` ke menu-skeleton.js. Di luar itu ia merender
// <Outlet/> apa adanya (/, /home, /dashboard, /admin-settings, /bnf/*,
// /planned/*, dan seluruh rute legacy lain tidak berubah).
//
// Elemennya dipakai sebagai KONSTANTA tunggal (satu <ContextHeader/> untuk semua
// rute) supaya pindah halaman tidak pernah me-remount-nya — pola yang sama
// dengan LEGACY_OUTLET sejak G1. Dirender DI LUAR `.nexus-main-surface`, jadi
// bingkai maupun gate konten tetap milik ModuleShell/LegacyMenuOutlet
// (TD-273 tetap dua salinan, bukan tiga).
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { l2ForPath, tabForPath } from './menu-skeleton.js';

/** Level 3 boleh dibuka kalau minimal SATU halaman di dalamnya boleh dibuka.
 *  Level 3 tanpa halaman hidup (Soon) dinilai lewat id-nya sendiri: menu key
 *  `skel_*` yang sengaja tidak di-seed → hanya super_admin, dan itu hanya
 *  berlaku untuk deep-link; barisnya di sidebar tampil untuk semua orang tapi
 *  tidak bisa diklik. */
function tabAccessible(tab, canRenderPage) {
  if (tab.mounts.length) return tab.mounts.some((m) => canRenderPage(m.menuId));
  return canRenderPage(tab.id);
}

/** Level 3 pertama yang layak dibuka saat user mendarat di path Level 2 tanpa
 *  menyebut Level 3: yang PUNYA halaman hidup lebih dulu, Soon hanya kalau tak
 *  ada satu pun (keputusan Den Q-E, dipertahankan di desain tiga tingkat). */
function firstUsefulTab(l2, canRenderPage) {
  const tabs = l2.tabs.length ? l2.tabs : [];
  const live = tabs.find((t) => t.mounts.length && tabAccessible(t, canRenderPage));
  if (live) return live;
  return tabs.find((t) => tabAccessible(t, canRenderPage)) || null;
}

/** Halaman pertama di dalam sebuah Level 3 yang boleh dibuka user. */
function firstUsefulMount(tab, canRenderPage) {
  return tab.mounts.find((m) => canRenderPage(m.menuId)) || null;
}

function Crumb({ children, current = false }) {
  return (
    <span
      style={{
        color: current ? 'var(--mute, #7E8899)' : 'var(--faint, #A6AEBD)',
        fontWeight: current ? 600 : 500,
        whiteSpace: 'normal',
      }}
    >
      {children}
    </span>
  );
}

function Sep() {
  return <span aria-hidden="true" style={{ color: 'var(--faint, #A6AEBD)', opacity: 0.7 }}>›</span>;
}

function SecondaryPicker({ mounts, activeMenuId, onGo }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 0 0' }}>
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

export default function ContextHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { canRenderPage, activeMenu } = useAppShell();

  const found = l2ForPath(pathname);
  if (!found) return <Outlet />;

  const { module, l2 } = found;
  const active = tabForPath(pathname);

  // Mendarat di path Level 2 telanjang → lempar ke Level 3 pertama yang layak.
  // Kalau NOL yang boleh dibuka, biarkan anak rutenya yang menampilkan Akses
  // Ditolak — jangan memutuskan sendiri di sini.
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
  // `soleTab` = Level 2 tanpa Level 3 (6.6 Payment Terms Master): label Level 3
  // -nya sama dengan Level 2, jadi menuliskannya dua kali cuma mengulang.
  const showLeaf = !active.soleTab && active.label !== l2.label;

  // Padding horizontal HANYA di blok kepala. Anak rutenya membawa
  // `.nexus-main-surface` dengan kelas padding yang sama persis, jadi kalau
  // pembungkus ini ikut ber-padding, isinya menjorok dua kali.
  return (
    <div className="w-full min-w-0">
      <div className="px-5 sm:px-7 xl:px-9 pt-4 lg:pt-5">
        <nav
          aria-label="Lokasi"
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 11.5, lineHeight: 1.45, letterSpacing: '0.1px',
          }}
        >
          <Crumb>{module.label}</Crumb>
          <Sep />
          <Crumb current={!showLeaf}>{l2.label}</Crumb>
          {showLeaf && (
            <>
              <Sep />
              <Crumb current>{active.label}</Crumb>
            </>
          )}
        </nav>

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

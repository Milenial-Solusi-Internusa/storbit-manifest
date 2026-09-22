// src/routes/ModuleShell.jsx
// Batch FS Fase 2.5 G2 — pembungkus WAJIB untuk setiap rute modul yang sudah
// keluar dari LegacyMenuOutlet. Dua tanggung jawab, keduanya diwarisi dari
// region render lama di App.jsx:
//
//   1. BINGKAI `.nexus-main-surface` — div ini hidup DI DALAM LegacyMenuOutlet
//      (App.jsx), bukan di App shell, karena di G1 ia ikut terbawa saat region
//      dipindah utuh. Halaman yang keluar dari sana otomatis kehilangan padding
//      (`px-5 sm:px-7 xl:px-9 py-6 lg:py-7`) DAN dua aturan CSS yang menempel
//      pada kelas itu (`.nexus-main-surface .rounded-3xl` box-shadow,
//      `.nexus-main-surface table` min-width) — ketahuan di uji G2: seluruh
//      halaman Storbit kehilangan bingkainya. Kelasnya dipertahankan apa adanya
//      supaya CSS, dan alat QA yang memakainya sebagai penanda, tetap bekerja.
//      (`display:none` saat `home` TIDAK disalin: rute modul bukan home.)
//   2. GATE KONTEN — salinan persis penjaga lama
//      (`!canAccessActiveMenu && !permissionsLoading && !bnfAuthLoading` →
//      AccessDeniedPage), termasuk sifat "selama izin belum settle, halaman
//      tetap dirender": itu perilaku yang sudah ada (efek samping yang tercatat
//      di TD-271), bukan sesuatu yang G2 putuskan. `canAccessActiveMenu`
//      dihitung App.jsx dari `activeMenu` = `handle.menuId` rute yang cocok,
//      jadi nilainya sudah benar untuk rute anak saat komponen ini dirender.
//
// Saat LegacyMenuOutlet habis (G6), div surface-nya ikut mati dan komponen ini
// jadi satu-satunya pemilik bingkai itu.
import { useAppShell } from '@/contexts/useAppShell';
import { AccessDeniedPage } from '@/App.jsx';

export default function ModuleShell({ children }) {
  const { canAccessActiveMenu, permissionsLoading, bnfAuthLoading, setActiveMenu } = useAppShell();
  const denied = !canAccessActiveMenu && !permissionsLoading && !bnfAuthLoading;
  return (
    <div className="nexus-main-surface w-full min-w-0 px-5 sm:px-7 xl:px-9 py-6 lg:py-7">
      {denied ? <AccessDeniedPage onGoHome={() => setActiveMenu('home')} /> : children}
    </div>
  );
}

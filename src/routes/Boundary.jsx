// src/routes/Boundary.jsx
// ErrorBoundary + Suspense dengan fallback yang PERSIS sama dengan blok-blok
// render di App.jsx sebelum modulnya dipindah (teks & gaya tidak berubah).
//
// Lahir di G2 sebagai `function Boundary` lokal di
// logistics-warehouse.routes.jsx. Diangkat jadi file sendiri di G3 SEBELUM
// salinan kedua sempat lahir — pelajaran langsung dari TD-273: yang mahal
// bukan menyalin delapan baris, melainkan enam file rute yang harus diingat
// bergerak bersama saat fallback-nya berubah.
import { Suspense } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function Boundary({ title, children }) {
  return (
    <ErrorBoundary title={title}>
      <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

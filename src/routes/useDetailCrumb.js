// src/routes/useDetailCrumb.js
// Hook ADITIF (TD-318 Lead Detail, #19): halaman detail yang ingin menambah
// crumb ke-4 (identitas record, mis. account code) memanggil ini dengan
// labelnya. ContextHeader.jsx SATU-SATUNYA pembaca -- crumb ke-3 ikut
// berubah jadi link ke halaman daftarnya HANYA selama hook ini aktif
// (label truthy). Mockup (Lead Management.dc.html, definisi `crumbs` di
// blok script): [CRM (Business Development), Lead Management, PAGES[s.tab]
// -- link kembali ke daftar, lead.code] -- empat level, level 3 bisa
// diklik.
//
// Lazy-cleared di unmount (bukan reset manual oleh pemanggil) supaya
// pindah dari halaman detail ke halaman LAIN yang tidak memanggil hook ini
// otomatis kembali ke breadcrumb 3-level standar -- nol halaman lain yang
// perlu tahu soal mekanisme ini.
import { useContext, useEffect } from 'react';
import { DetailCrumbContext } from './detailCrumbCtx';

export function useDetailCrumb(label) {
  const { setDetailCrumb } = useContext(DetailCrumbContext);
  useEffect(() => {
    setDetailCrumb(label || null);
    return () => setDetailCrumb(null);
  }, [label, setDetailCrumb]);
}

// src/routes/detailCrumbCtx.js
// Context ADITIF untuk breadcrumb 4 level (TD-318 Lead Detail, #19) -- lihat
// ContextHeader.jsx untuk pembacanya dan useDetailCrumb.js untuk pemanggilnya.
// Default `setDetailCrumb` no-op: kalau sebuah halaman memanggil
// useDetailCrumb() di luar <ContextHeader/> (tidak seharusnya terjadi --
// seluruh rute Level 2 lewat sini), ia gagal senyap, bukan crash.
import { createContext } from 'react';
export const DetailCrumbContext = createContext({ setDetailCrumb: () => {} });

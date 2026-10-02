// src/modules/finance/ttfGrouping.js
// Data bersama untuk tab "Daftar TTF" (TtfSubmissionPage.jsx) dan halaman
// Detail TTF (TtfDetailPage.jsx) -- SATU muatan listInvoices+
// getTtfStatusByInvoices, SATU fungsi pengelompokan, supaya definisi "grup
// TTF" PERSIS sama di kedua tempat (pola sama dengan collectionData.js: AR
// Aging + Payment & Collection berbagi satu hook data).
//
// Nol JSX di berkas ini.
import { useEffect, useMemo, useState } from 'react';
import { listInvoices, getTtfStatusByInvoices } from '../../lib/db';

// Sentinel kunci grup untuk invoice ber-TTF TANPA nomor TTF (no_ttf kosong) --
// JANGAN dibuang dari Daftar TTF, dikumpulkan sebagai satu grup tersendiri.
// Dipakai DUA kali: (1) kunci internal `kelompokkanDaftarTtf`, (2) kunci URL
// Detail TTF (`/ttf/:kunci`) -- sengaja berupa string yang mustahil jadi
// nomor TTF asli (garis bawah ganda + kata Indonesia), jadi nol risiko
// bentrok dengan nomor TTF sungguhan yang di-trim+lowercase.
export const KUNCI_TANPA_NOMOR = '__tanpa_nomor__';

/** Kelompokkan invoice ber-TTF per nomor TTF (trim + lowercase sebagai kunci;
 *  teks aslinya yang ditampilkan). Tanggal TTF yang berbeda dalam satu grup
 *  ditampilkan sebagai RENTANG, bukan dipilih salah satu diam-diam. */
export function kelompokkanDaftarTtf(invoices, ttfByInvoiceId) {
  const grup = new Map();
  invoices.forEach((inv) => {
    const ttf = ttfByInvoiceId[inv.id];
    if (!ttf) return; // nol catatan TTF -- bukan bagian Daftar TTF (ada di tab Belum TTF, atau invoice tertutup tanpa TTF)
    const noTtfAsli = (ttf.no_ttf || '').trim();
    const kunci = noTtfAsli ? noTtfAsli.toLowerCase() : KUNCI_TANPA_NOMOR;
    if (!grup.has(kunci)) {
      grup.set(kunci, {
        kunci, noTtf: noTtfAsli || null, tanggalMin: null, tanggalMax: null,
        customerMap: new Map(), invoices: [],
      });
    }
    const g = grup.get(kunci);
    g.invoices.push({ ...inv, ttf });
    if (ttf.tanggal_ttf) {
      if (!g.tanggalMin || ttf.tanggal_ttf < g.tanggalMin) g.tanggalMin = ttf.tanggal_ttf;
      if (!g.tanggalMax || ttf.tanggal_ttf > g.tanggalMax) g.tanggalMax = ttf.tanggal_ttf;
    }
    const custId = inv.sp_orders?.customer_id || '__tanpa_customer__';
    if (!g.customerMap.has(custId)) g.customerMap.set(custId, inv.sp_orders?.accounts?.name || '—');
  });
  return [...grup.values()].map((g) => ({
    ...g,
    totalNilai: g.invoices.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    customerLabel: g.customerMap.size > 1 ? 'Multi-customer' : ([...g.customerMap.values()][0] || '—'),
  })).sort((a, b) => (b.tanggalMax || '').localeCompare(a.tanggalMax || ''));
}

/**
 * Memuat SELURUH invoice (semua status, termasuk lunas -- `listInvoices({})`
 * sudah begitu sejak awal) + status TTF-nya, lalu mengelompokkannya per nomor
 * TTF. Dipakai tab Daftar TTF (daftar) DAN halaman Detail TTF (mencari satu
 * grup lewat kunci URL) supaya datanya PERSIS sama di kedua tempat -- bukan
 * dua fetch yang bisa diam-diam melenceng.
 */
export default function useDaftarTtf() {
  const [invoices, setInvoices] = useState([]);
  const [ttfByInvoiceId, setTtfByInvoiceId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [muatKe, setMuatKe] = useState(0);
  // `setLoading(true)` dipanggil DI SINI, bukan di dalam efek -- pola yang
  // sama dengan tombol "Muat Ulang" InvoiceListPage.jsx (hindari
  // react-hooks/set-state-in-effect).
  const reload = () => { setLoading(true); setMuatKe((n) => n + 1); };

  useEffect(() => {
    let batal = false;
    listInvoices({}).then(async ({ data, error: errInv }) => {
      if (batal) return;
      const baris = data || [];
      const { data: ttf, error: errTtf } = await getTtfStatusByInvoices(baris.map((r) => r.id));
      if (batal) return;
      setInvoices(baris);
      setTtfByInvoiceId(ttf || {});
      setError(errInv || errTtf || null);
      setLoading(false);
    });
    return () => { batal = true; };
  }, [muatKe]);

  const daftarTtf = useMemo(() => kelompokkanDaftarTtf(invoices, ttfByInvoiceId), [invoices, ttfByInvoiceId]);

  return { invoices, daftarTtf, loading, error, reload };
}

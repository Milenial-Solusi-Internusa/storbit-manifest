// src/modules/finance/collectionData.js
// Data bersama untuk AR Aging (6.2.3) dan Payment & Collection Tracking (6.2.4).
//
// SATU hook, SATU muatan: invoice terbuka (OPEN_STATUSES) + sigma pembayaran +
// kelompok umur dihitung di CLIENT, nol RPC/view baru (keputusan Den). Kedua
// halaman memakai hook yang sama supaya "sisa" dan kelompok umurnya PERSIS
// sama di mana pun ditampilkan -- termasuk kolom "Sisa" Daftar Invoice
// (InvoiceListPage.jsx), yang formulanya SENGAJA disalin identik, bukan
// diimpor dari sana: komponen itu tidak mengekspor fungsinya, dan menyalin
// satu formula tiga baris lebih aman daripada mengubah file yang tidak
// termasuk unit kerja ini.
//
// Nol JSX di berkas ini.
import { useEffect, useMemo, useState } from 'react';
import { listInvoices, getPaymentTotalsByInvoice } from '../../lib/db';
import { getTodayWIB } from '../../lib/dateUtils';
import { OPEN_STATUSES } from './invoiceStatus.js';

// Enam kelompok umur (keputusan Den). Urutan di sini = urutan tampil.
export const AGING_BUCKETS = [
  { key: 'belum_ttf',        label: 'Belum TTF' },
  { key: 'belum_jatuh_tempo', label: 'Belum Jatuh Tempo' },
  { key: 'd1_30',            label: '1–30 Hari' },
  { key: 'd31_60',           label: '31–60 Hari' },
  { key: 'd61_90',           label: '61–90 Hari' },
  { key: 'd90_plus',         label: '> 90 Hari' },
];

/** Kelompok umur satu invoice. `due_date` NULL -> "Belum TTF" (AR Tahap 3:
 *  jatuh tempo HANYA lahir dari TTF, jadi NULL berarti TTF belum dicatat --
 *  lihat invoiceStatus.js:dueDateText). Sebaliknya dihitung dari selisih hari
 *  terhadap hari ini. */
export function agingBucketOf(row, todayIso) {
  if (!row?.due_date) return 'belum_ttf';
  if (String(row.due_date) >= String(todayIso)) return 'belum_jatuh_tempo';
  const hariTelat = Math.round((Date.parse(todayIso) - Date.parse(row.due_date)) / 86400000);
  if (hariTelat <= 30) return 'd1_30';
  if (hariTelat <= 60) return 'd31_60';
  if (hariTelat <= 90) return 'd61_90';
  return 'd90_plus';
}

/** Sisa tagihan satu baris -- formula PERSIS sama dengan kolom "Sisa" di
 *  InvoiceListPage.jsx dan dengan v_sisa_sebelum di record_payment v3
 *  (total_amount - Sigma(amount+pph+potongan_lain)). Baris bukan OPEN_STATUSES
 *  (paid/void/draft/pending_approval) selalu nol -- tidak relevan utk
 *  penagihan/aging. */
export function sisaInvoice(row, terbayarMap) {
  if (!OPEN_STATUSES.includes(row?.status)) return 0;
  const total = Number(row.total_amount) || 0;
  if (row.status !== 'partial') return total;
  return Math.max(0, total - ((terbayarMap || {})[row.id] || 0));
}

/**
 * Memuat seluruh invoice TERBUKA (lintas entitas yang boleh dilihat user) +
 * sigma pembayarannya, lalu menempelkan `sisa`, `bucket`, dan `hariTelat` ke
 * tiap baris. `reload()` memaksa muat ulang (dipakai sesudah impor TTF/catat
 * pembayaran dari halaman lain supaya datanya segar).
 */
export default function useOpenInvoicesForCollection() {
  const [rows,    setRows]    = useState([]);
  const [terbayar, setTerbayar] = useState({});
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [muatKe,  setMuatKe]  = useState(0);
  // `setLoading(true)` dipanggil DI SINI (pemicu reload), bukan di dalam efek
  // -- pola yang sama dengan tombol "Muat Ulang" InvoiceListPage.jsx. Memanggil
  // setState sinkron di awal efek sendiri kena react-hooks/set-state-in-effect.
  const reload = () => { setLoading(true); setMuatKe((n) => n + 1); };

  useEffect(() => {
    let batal = false;
    listInvoices({}).then(async ({ data, error: err }) => {
      if (batal) return;
      const terbuka = (data || []).filter((r) => OPEN_STATUSES.includes(r.status));
      setRows(terbuka);
      setError(err || null);
      setLoading(false);
      const idPartial = terbuka.filter((r) => r.status === 'partial').map((r) => r.id);
      const { data: peta } = await getPaymentTotalsByInvoice(idPartial);
      if (!batal) setTerbayar(peta || {});
    });
    return () => { batal = true; };
  }, [muatKe]);

  const hariIni = getTodayWIB();

  const invoices = useMemo(() => rows.map((r) => {
    const sisa = sisaInvoice(r, terbayar);
    const bucket = agingBucketOf(r, hariIni);
    const hariTelat = r.due_date && String(r.due_date) < hariIni
      ? Math.round((Date.parse(hariIni) - Date.parse(r.due_date)) / 86400000)
      : 0;
    return { ...r, sisa, bucket, hariTelat };
  }), [rows, terbayar, hariIni]);

  return { invoices, loading, error, reload, hariIni };
}

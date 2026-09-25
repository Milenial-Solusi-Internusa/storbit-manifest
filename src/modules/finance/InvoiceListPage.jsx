// src/modules/finance/InvoiceListPage.jsx
// Finance > Accounts Receivable > Invoice Management > Daftar Invoice (6.2.1).
//
// BENTUK: strip ringkas di atas, tab status ber-hitungan + pencarian, lalu satu
// tabel yang barisnya bisa diklik — pola daftar Odoo yang dipakai Finance.
//
// BACA-SAJA, dan itu keputusan yang dipertahankan: aksi apa pun (terbitkan,
// upload portal, bayar, TTF) hidup di halaman DETAIL, supaya tidak ada tombol
// yang bekerja pada baris yang sedang tidak dilihat.
//
// Keadaan filter + pencarian dibawa ke URL saat membuka detail (buildListQuery)
// supaya navigasi rekaman "3 / 22" di sana mengikuti urutan yang SAMA dengan
// yang sedang dilihat di sini — dan tetap benar sesudah refresh.
//
// Keluarga token: ungu/serif Storbit (lihat catatan di financeKit.jsx / TD-277).
import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Receipt, RefreshCw, Search } from 'lucide-react';
import { listInvoices, getPaymentTotalsByInvoice } from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { getTodayWIB } from '../../lib/dateUtils';
import {
  STATUS_LABEL, STATUS_LABEL_SHORT, STATUS_TAG,
  buildListQuery, filterInvoices, isOverdue, OPEN_STATUSES,
} from './invoiceStatus.js';
import {
  PageHead, Btn, StatCard, TabBar, TabBtn, TableShell, Td, Notice, Hint, Empty,
} from './financeKit.jsx';
import {
  C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, rp, fmtDate,
} from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

// Urutan tab. 'semua' pertama, lalu mengikuti alur hidup invoice.
const TABS = ['semua', 'issued', 'submitted', 'partial', 'paid', 'void'];

/** Awal bulan berjalan dalam WIB, 'YYYY-MM-01'. */
const awalBulanWIB = (hariIni) => `${hariIni.slice(0, 7)}-01`;

export default function InvoiceListPage({ onOpenInvoice }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [status,  setStatus]  = useState('semua');
  const [search,  setSearch]  = useState('');
  const [muatKe,  setMuatKe]  = useState(0);
  // Sigma pembayaran per invoice — HANYA untuk baris `partial` (lihat catatan
  // di getPaymentTotalsByInvoice). Baris lain sisanya bisa diturunkan dari
  // statusnya sendiri tanpa query.
  const [terbayar, setTerbayar] = useState({});

  // Entitas aktif = CompanySwitcher, bukan home company (lihat catatan yang
  // sama di ReadyToInvoicePage).
  const { activeCompanyId } = useAuth();

  useEffect(() => {
    let batal = false;
    listInvoices({ companyId: activeCompanyId }).then(async ({ data, error: err }) => {
      if (batal) return;
      const baris = data || [];
      setRows(baris);
      setError(err || null);
      setLoading(false);
      const idPartial = baris.filter((r) => r.status === 'partial').map((r) => r.id);
      const { data: peta } = await getPaymentTotalsByInvoice(idPartial);
      if (!batal) setTerbayar(peta || {});
    });
    return () => { batal = true; };
  }, [activeCompanyId, muatKe]);

  const hariIni = getTodayWIB();

  // Sisa tagihan satu baris. `partial` memakai Sigma pembayaran yang sudah
  // dimuat; selama peta itu belum tiba, ia jatuh ke total (aman: terlalu besar,
  // bukan terlalu kecil) dan membaik sendiri begitu datanya masuk.
  const sisaBaris = (r) => {
    if (!OPEN_STATUSES.includes(r.status)) return 0;
    const total = Number(r.total_amount) || 0;
    if (r.status !== 'partial') return total;
    return Math.max(0, total - (terbayar[r.id] || 0));
  };

  const tampil = useMemo(
    () => filterInvoices(rows, { status, search }),
    [rows, status, search],
  );

  // Hitungan per tab dihitung dari SELURUH data (setelah pencarian), bukan dari
  // baris yang tampil — angka di tab harus menjelaskan ke mana klik itu membawa.
  const hitungan = useMemo(() => {
    const dasar = filterInvoices(rows, { status: 'semua', search });
    const map = { semua: dasar.length };
    TABS.slice(1).forEach((s) => { map[s] = dasar.filter((r) => r.status === s).length; });
    return map;
  }, [rows, search]);

  // ── Strip ringkas ────────────────────────────────────────────────────────
  // SENGAJA dihitung dari SELURUH data entitas, bukan dari filter yang sedang
  // aktif: tiga angka ini adalah keadaan piutang, bukan keterangan tabel di
  // bawahnya. Kalau ia ikut filter, "lewat jatuh tempo" akan jadi nol begitu
  // orang membuka tab Lunas — dan itu kabar yang salah.
  const ringkas = useMemo(() => {
    const belumLunas = rows.filter((r) => OPEN_STATUSES.includes(r.status));
    const telat      = belumLunas.filter((r) => isOverdue(r, hariIni));
    const awalBulan  = awalBulanWIB(hariIni);
    const lunasBulanIni = rows.filter(
      (r) => r.status === 'paid' && r.invoice_date && String(r.invoice_date) >= awalBulan,
    );
    const jmlTotal = (xs) => xs.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const jmlSisa  = (xs) => xs.reduce((s, r) => s + sisaBaris(r), 0);
    return {
      sisaJumlah:  jmlSisa(belumLunas),
      sisaCount:   belumLunas.length,
      telatJumlah: jmlSisa(telat),
      telatCount:  telat.length,
      lunasJumlah: jmlTotal(lunasBulanIni),
      lunasCount:  lunasBulanIni.length,
    };
    // `terbayar` ikut jadi dependensi lewat sisaBaris — strip harus ikut
    // membaik begitu Sigma pembayaran baris `partial` selesai dimuat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, hariIni, terbayar]);

  const buka = (row) => onOpenInvoice?.(row.id, buildListQuery({ status, search }));

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <PageHead
        kicker="Accounts Receivable"
        title="Daftar Invoice"
        right={
          <Btn
            icon={RefreshCw} onClick={() => { setLoading(true); setMuatKe((n) => n + 1); }}
            disabled={loading}
          >
            {loading ? 'Memuat…' : 'Muat Ulang'}
          </Btn>
        }
      />

      {error && (
        <Notice tone="danger" icon={AlertTriangle}>
          Daftar invoice gagal dimuat: {error.message || 'penyebab tidak diketahui'}
        </Notice>
      )}

      {/* ── Strip ringkas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: SP.s3 }}>
        <StatCard
          label="Sisa tagihan belum lunas"
          value={rp(ringkas.sisaJumlah)}
          sub={`${ringkas.sisaCount} invoice · Terbit, Sudah Upload, Bayar Sebagian`}
        />
        <StatCard
          label="Lewat jatuh tempo"
          value={rp(ringkas.telatJumlah)}
          sub={`${ringkas.telatCount} invoice`}
          tone={ringkas.telatCount > 0 ? C.danger : undefined}
        />
        <StatCard
          label="Lunas bulan ini"
          value={rp(ringkas.lunasJumlah)}
          sub={`${ringkas.lunasCount} invoice · menurut tanggal invoice`}
          tone={C.accentDeep}
        />
      </div>

      {/* ── Tab status + pencarian ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap' }}>
        <TabBar style={{ flex: 1, minWidth: 260 }}>
          {TABS.map((s) => (
            <TabBtn
              key={s} active={status === s} onClick={() => setStatus(s)}
              label={s === 'semua' ? 'Semua' : (STATUS_LABEL_SHORT[s] || STATUS_LABEL[s])}
              count={hitungan[s] ?? 0}
            />
          ))}
        </TabBar>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px',
          border: `1px solid ${C.line}`, borderRadius: RADIUS.md, background: C.surface, marginBottom: SP.s2,
        }}>
          <Search size={14} style={{ color: C.inkFaint, flexShrink: 0 }}/>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari no. invoice, no. SP, customer"
            aria-label="Cari invoice"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: C.ink, width: 250, maxWidth: '48vw', fontFamily: 'inherit' }}
          />
        </label>
      </div>

      {/* ── Tabel ── */}
      <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden', background: C.surface }}>
        {loading ? (
          <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat…</p>
        ) : tampil.length === 0 ? (
          <Empty
            icon={Receipt}
            title="Tidak ada invoice pada tampilan ini"
            sub={search ? 'Coba kosongkan kolom pencarian atau pilih tab lain.' : 'Pilih tab lain, atau terbitkan invoice dari halaman Siap Ditagih.'}
          />
        ) : (
          <div style={{ padding: SP.s3 }}>
            <TableShell
              minWidth={860}
              head={[
                ['No. Invoice'], ['Customer'], ['No. SP'], ['Tanggal'], ['Jatuh Tempo'],
                ['Total', 'right'], ['Sisa', 'right'], ['Status'],
              ]}
            >
              {tampil.map((r) => {
                const telat = isOverdue(r, hariIni);
                const sisa  = sisaBaris(r);
                return (
                  <tr
                    key={r.id} onClick={() => buka(r)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buka(r); } }}
                    tabIndex={0} role="button" title="Buka detail invoice"
                    style={{ cursor: 'pointer' }}
                  >
                    <Td mono nowrap style={{ color: C.accent, fontWeight: 600 }}>{r.invoice_no || '—'}</Td>
                    <Td>{r.sp_orders?.accounts?.name || '—'}</Td>
                    <Td mono nowrap style={{ color: C.inkSoft }}>{r.sp_orders?.sp_no || '—'}</Td>
                    <Td nowrap>{fmtDate(r.invoice_date)}</Td>
                    <Td nowrap style={telat ? { color: C.danger, fontWeight: 700 } : undefined}>
                      {fmtDate(r.due_date)}
                    </Td>
                    <Td align="right" mono nowrap>{rp(r.total_amount)}</Td>
                    <Td align="right" mono nowrap style={{ color: sisa > 0 ? C.attn : C.inkFaint }}>
                      {sisa > 0 ? rp(sisa) : '—'}
                    </Td>
                    <Td nowrap>
                      <Badge {...(STATUS_TAG[r.status] || STATUS_TAG.draft)}>
                        {STATUS_LABEL_SHORT[r.status] || r.status || '—'}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </TableShell>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap', marginTop: SP.s3 }}>
              <Hint>Klik baris mana pun untuk membuka detailnya.</Hint>
              <span style={{ fontSize: 12.5, color: C.inkSoft }}>
                {tampil.length} baris · nilai baris tampil{' '}
                <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.ink }}>
                  {rp(tampil.reduce((s, r) => s + (Number(r.total_amount) || 0), 0))}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

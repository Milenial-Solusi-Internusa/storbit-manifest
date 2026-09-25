// src/modules/finance/InvoiceListPage.jsx
// Finance > Accounts Receivable > Invoice Management > Daftar Invoice (6.2.1).
//
// Baca-saja: satu tabel invoice, satu tautan ke detailnya. Aksi apa pun
// (terbitkan, submit, bayar, TTF) hidup di halaman DETAIL, bukan di daftar --
// supaya tidak ada tombol yang bekerja pada baris yang sedang tidak dilihat.
import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { listInvoices } from '../../lib/db';
import {
  C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, kickerStyle, cardTitleStyle, thStyle,
  TAG_PALE, TAG_OUTLINE, TAG_NEUTRAL, TAG_ATTN, rp, fmtDate,
} from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

const STATUS_LABEL = {
  draft: 'Draft', issued: 'Issued', submitted: 'Submitted',
  partial: 'Dibayar Sebagian', paid: 'Lunas', void: 'Void',
};
const STATUS_TAG = {
  draft: TAG_NEUTRAL, issued: TAG_OUTLINE, submitted: TAG_OUTLINE,
  partial: TAG_ATTN,  paid: TAG_PALE,      void: TAG_NEUTRAL,
};
// Urutan tombol filter. 'semua' pertama, lalu mengikuti alur hidup invoice.
const FILTER = ['semua', 'issued', 'submitted', 'partial', 'paid', 'void'];

export default function InvoiceListPage({ companyId = null, onOpenInvoice }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [filter,  setFilter]  = useState('semua');
  const [muatKe,  setMuatKe]  = useState(0);

  useEffect(() => {
    let batal = false;
    listInvoices({ companyId }).then(({ data, error: err }) => {
      if (batal) return;
      setRows(data || []);
      setError(err || null);
      setLoading(false);
    });
    return () => { batal = true; };
  }, [companyId, muatKe]);

  const tampil = useMemo(
    () => (filter === 'semua' ? rows : rows.filter(r => r.status === filter)),
    [rows, filter],
  );

  // Total SENGAJA dihitung dari baris yang TAMPIL, bukan dari seluruh data:
  // angka di bawah filter harus menjelaskan apa yang sedang dilihat. Void ikut
  // terhitung kalau filternya memasukkannya -- itu bukan piutang, jadi kolomnya
  // diberi nama "nilai baris tampil", bukan "outstanding".
  const totalTampil = useMemo(
    () => tampil.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    [tampil],
  );

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...kickerStyle }}>Accounts Receivable</div>
          <h2 style={{ ...cardTitleStyle, fontSize: 22, margin: '2px 0 0' }}>Daftar Invoice</h2>
        </div>
        <button
          onClick={() => { setLoading(true); setMuatKe(n => n + 1); }}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${loading ? C.line : C.accent}`, background: 'transparent', color: loading ? C.inkFaint : C.accent, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT_DISPLAY }}
        >
          <RefreshCw size={14}/> {loading ? 'Memuat…' : 'Muat Ulang'}
        </button>
      </div>

      {error && (
        <div style={{ border: `1px solid ${C.dangerBd}`, background: C.dangerBg, color: C.danger, borderRadius: RADIUS.md, padding: SP.s3, fontSize: 13 }}>
          <AlertTriangle size={14} style={{ verticalAlign: '-2px' }}/> Gagal memuat daftar invoice: {error.message || 'unknown error'}
        </div>
      )}

      <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTER.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '6px 12px', borderRadius: RADIUS.md, border: `1px solid ${filter === f ? C.accent : C.line}`, background: filter === f ? C.accentSoft : 'transparent', color: filter === f ? C.accentDeep : C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_DISPLAY }}>
            {f === 'semua' ? 'Semua' : STATUS_LABEL[f]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: C.inkSoft }}>
          {tampil.length} baris &middot; nilai baris tampil{' '}
          <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.ink }}>{rp(totalTampil)}</span>
        </span>
      </div>

      <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat…</p>
        ) : tampil.length === 0 ? (
          <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>Belum ada invoice pada filter ini.</p>
        ) : (
          <div style={{ overflowX: 'auto', padding: SP.s3 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {[['No. Invoice','left'],['Tanggal','left'],['Jatuh Tempo','left'],['No. SP','left'],['Customer','left'],['Total','right'],['Status','left']].map(([h,al]) => (
                    <th key={h} style={{ ...thStyle, textAlign: al, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tampil.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>
                      {onOpenInvoice ? (
                        <button onClick={() => onOpenInvoice(r.id)}
                          style={{ background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600 }}>
                          {r.invoice_no || '—'}
                        </button>
                      ) : <span style={{ fontFamily: FONT_MONO }}>{r.invoice_no || '—'}</span>}
                    </td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>{fmtDate(r.invoice_date)}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>{fmtDate(r.due_date)}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>{r.sp_orders?.sp_no || '—'}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}` }}>{r.sp_orders?.accounts?.name || '—'}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>{rp(r.total_amount)}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}` }}>
                      <Badge {...(STATUS_TAG[r.status] || TAG_NEUTRAL)}>{STATUS_LABEL[r.status] || r.status || '—'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// src/modules/finance/InvoiceDetailPage.jsx
// Finance > Accounts Receivable > Invoice Management > Detail Invoice.
//
// Rumah BARU panel invoice: penerbitan, submit, pembayaran, dan TTF yang dulu
// hidup di Detail SP (AR Tahap 2, keputusan Den K-5 -- dipindah APA ADANYA,
// logika dan RPC-nya sama). Halaman ini sendiri tipis: ia cuma menerjemahkan
// invoiceId -> sp_order_id lalu menyerahkan sisanya ke InvoicePanel.
//
// ⚠️ Panel-nya butuh Sigma qty & Sigma shipped_qty SP untuk gate "Terbitkan
// Invoice". Di Detail SP angka itu datang dari items yang sudah ada di state;
// di sini ia harus di-query sendiri (getSpOrderQtySummary) -- kalau gate-nya
// dibiarkan menebak, tombolnya bisa menawarkan aksi yang pasti ditolak server.
import { useState, useEffect } from 'react';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { getInvoiceById, getSpOrderQtySummary } from '../../lib/db';
import InvoicePanel from './InvoicePanel';
import {
  C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, kickerStyle, cardTitleStyle,
} from '../logistics/spDetailTokens.js';

export default function InvoiceDetailPage({ invoiceId, showToast, onBack, onOpenSp }) {
  const [head,    setHead]    = useState(null);
  const [qty,     setQty]     = useState({ totalQty: 0, shippedQty: 0 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let batal = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!invoiceId) { setLoading(false); return undefined; }
    getInvoiceById(invoiceId).then(async ({ data, error: err }) => {
      if (batal) return;
      setHead(data || null);
      setError(err || null);
      if (data?.sp_order_id) {
        const { data: q } = await getSpOrderQtySummary(data.sp_order_id);
        if (!batal && q) setQty(q);
      }
      if (!batal) setLoading(false);
    });
    return () => { batal = true; };
  }, [invoiceId]);

  if (loading) {
    return <p style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: C.inkFaint }}>Memuat invoice…</p>;
  }

  if (error || !head) {
    // Sengaja MEMBEDAKAN "gagal baca" dari "tidak ada": keduanya butuh tindakan
    // berbeda, dan menyatukannya membuat masalah izin terlihat seperti data hilang.
    return (
      <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
        {onBack && (
          <button onClick={onBack} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: FONT_DISPLAY, fontSize: 14 }}>
            <ChevronLeft size={15}/> Daftar Invoice
          </button>
        )}
        <div style={{ border: `1px solid ${C.attnBd}`, background: C.attnBg, color: C.attn, borderRadius: RADIUS.md, padding: SP.s3, fontSize: 13, lineHeight: 1.5 }}>
          <AlertTriangle size={14} style={{ verticalAlign: '-2px' }}/>{' '}
          {error
            ? <>Gagal membaca invoice: {error.message || 'unknown error'}</>
            : <>Invoice tidak ditemukan, atau tidak bisa dibaca dengan peran kamu di entitas ini.</>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      {onBack && (
        <button onClick={onBack} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: FONT_DISPLAY, fontSize: 14 }}>
          <ChevronLeft size={15}/> Daftar Invoice
        </button>
      )}

      <div>
        <div style={{ ...kickerStyle }}>Detail Invoice</div>
        <h2 style={{ ...cardTitleStyle, fontSize: 22, margin: '2px 0 0', fontFamily: FONT_MONO }}>
          {head.invoice_no || '(tanpa nomor)'}
        </h2>
        <p style={{ margin: `${SP.s1}px 0 0`, fontSize: 13, color: C.inkSoft }}>
          {head.sp_orders?.accounts?.name || '—'}
          {' · SP '}
          {onOpenSp && head.sp_orders?.customer_id ? (
            <button onClick={() => onOpenSp(head.sp_orders.customer_id, head.sp_orders.sp_no)}
              style={{ background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 13 }}>
              {head.sp_orders?.sp_no || '—'}
            </button>
          ) : <span style={{ fontFamily: FONT_MONO }}>{head.sp_orders?.sp_no || '—'}</span>}
        </p>
      </div>

      {/* Grid satu kolom: panel-nya membawa `gridColumn: '1 / -1'` dari rumah
          lamanya, jadi ia butuh induk ber-display grid supaya aturan itu berarti
          sesuatu alih-alih diabaikan diam-diam. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: SP.s4 }}>
        <InvoicePanel
          spOrderId={head.sp_order_id}
          totalQty={qty.totalQty}
          shippedQty={qty.shippedQty}
          showToast={showToast}
        />
      </div>
    </div>
  );
}

// src/modules/finance/CollectionTrackingPage.jsx
// Finance > Accounts Receivable > Payment & Collection Tracking (6.2.4).
//
// Dua bagian, keduanya BACA-SAJA -- aksi (catat pembayaran, catat TTF) tetap
// di Detail Invoice, pola yang sama dengan InvoiceListPage.jsx:
//   1. "Perlu Ditindaklanjuti" -- invoice terbuka urut hari telat terbanyak
//      (data dari collectionData.js, SAMA dengan AR Aging).
//   2. "Riwayat Pembayaran Terbaru" -- pembayaran terbaru lintas invoice.
//
// ⛔ Tautan HANYA ke Detail Invoice, TIDAK ke halaman SP (TD-289: Finance
// Controller belum tentu bisa membuka menu SP) -- keputusan Den saat PLAN.
//
// Keluarga token: ungu/serif Storbit (lihat catatan di financeKit.jsx).
import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Wallet } from 'lucide-react';
import { listRecentPayments } from '../../lib/db';
import useOpenInvoicesForCollection from './collectionData.js';
import { STATUS_LABEL_SHORT, STATUS_TAG } from './invoiceStatus.js';
import { PageHead, Btn, Panel, TableShell, Td, Notice, Hint, Empty } from './financeKit.jsx';
import { C, FONT_DISPLAY, SP, rp, fmtDate } from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

export default function CollectionTrackingPage({ onOpenInvoice }) {
  const { invoices, loading, error, reload } = useOpenInvoicesForCollection();

  const perluDitindaklanjuti = [...invoices].sort((a, b) => b.hariTelat - a.hariTelat || b.sisa - a.sisa);

  const [pembayaran, setPembayaran] = useState([]);
  const [loadingBayar, setLoadingBayar] = useState(true);
  const [errorBayar, setErrorBayar] = useState(null);

  useEffect(() => {
    // `loading` sudah `true` sejak useState di atas -- berkas ini dimuat
    // sekali saat mount (nol reload), jadi tidak perlu disetel ulang di sini
    // (hindari react-hooks/set-state-in-effect).
    let batal = false;
    listRecentPayments(30).then(({ data, error: err }) => {
      if (batal) return;
      setPembayaran(data || []);
      setErrorBayar(err || null);
      setLoadingBayar(false);
    });
    return () => { batal = true; };
  }, []);

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <PageHead
        kicker="Accounts Receivable"
        title="Payment & Collection Tracking"
        sub="Memantau proses penagihan dan pembayaran masuk."
        right={<Btn onClick={reload} disabled={loading}>{loading ? 'Memuat…' : 'Muat Ulang'}</Btn>}
      />

      {/* ── Perlu Ditindaklanjuti ── */}
      <Panel title="Perlu Ditindaklanjuti" icon={Clock}>
        {error && (
          <div style={{ marginBottom: SP.s3 }}>
            <Notice tone="danger" icon={AlertTriangle}>
              Data gagal dimuat: {error.message || 'penyebab tidak diketahui'}
            </Notice>
          </div>
        )}
        {loading ? (
          <Hint>Memuat…</Hint>
        ) : perluDitindaklanjuti.length === 0 ? (
          <Empty icon={Clock} title="Nol invoice terbuka" sub="Tidak ada piutang yang perlu ditindaklanjuti saat ini."/>
        ) : (
          <TableShell
            minWidth={980}
            head={[['Entitas'], ['No. Invoice'], ['Customer'], ['Jatuh Tempo'], ['Hari Telat', 'right'], ['Sisa', 'right'], ['Status']]}
          >
            {perluDitindaklanjuti.map((r) => (
              <tr
                key={r.id} onClick={() => onOpenInvoice?.(r.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenInvoice?.(r.id); } }}
                tabIndex={0} role="button" title="Buka detail invoice"
                style={{ cursor: 'pointer' }}
              >
                <Td nowrap style={{ color: C.inkSoft }}>{r.companies?.code || r.companies?.name || '—'}</Td>
                <Td mono nowrap style={r.invoice_no ? { color: C.accent, fontWeight: 600 } : { color: C.inkFaint }}>
                  {r.invoice_no || 'Menunggu nomor'}
                </Td>
                <Td>{r.sp_orders?.accounts?.name || '—'}</Td>
                <Td nowrap>{r.due_date ? fmtDate(r.due_date) : 'Belum TTF'}</Td>
                <Td align="right" mono style={r.hariTelat > 0 ? { color: C.danger, fontWeight: 700 } : { color: C.inkFaint }}>
                  {r.hariTelat > 0 ? r.hariTelat : '—'}
                </Td>
                <Td align="right" mono>{rp(r.sisa)}</Td>
                <Td nowrap>
                  <Badge {...(STATUS_TAG[r.status] || STATUS_TAG.issued)}>{STATUS_LABEL_SHORT[r.status] || r.status}</Badge>
                </Td>
              </tr>
            ))}
          </TableShell>
        )}
      </Panel>

      {/* ── Riwayat Pembayaran Terbaru ── */}
      <Panel title="Riwayat Pembayaran Terbaru" icon={Wallet}>
        {errorBayar && (
          <div style={{ marginBottom: SP.s3 }}>
            <Notice tone="danger" icon={AlertTriangle}>
              Riwayat pembayaran gagal dimuat: {errorBayar.message || 'penyebab tidak diketahui'}
            </Notice>
          </div>
        )}
        {loadingBayar ? (
          <Hint>Memuat…</Hint>
        ) : pembayaran.length === 0 ? (
          <Empty icon={Wallet} title="Belum ada pembayaran tercatat"/>
        ) : (
          <TableShell
            minWidth={900}
            head={[['Tanggal'], ['No. Invoice'], ['Customer'], ['Nominal', 'right'], ['PPh 23', 'right'], ['Referensi'], ['Dicatat Oleh']]}
          >
            {pembayaran.map((p) => {
              const inv = p.sp_invoices;
              return (
                <tr
                  key={p.id} onClick={() => inv && onOpenInvoice?.(p.invoice_id)}
                  onKeyDown={(e) => { if (inv && e.key === 'Enter') { e.preventDefault(); onOpenInvoice?.(p.invoice_id); } }}
                  tabIndex={inv ? 0 : -1} role={inv ? 'button' : undefined}
                  title={inv ? 'Buka detail invoice' : undefined}
                  style={{ cursor: inv ? 'pointer' : 'default' }}
                >
                  <Td nowrap>{fmtDate(p.payment_date)}</Td>
                  <Td mono nowrap style={{ color: inv ? C.accent : C.inkFaint, fontWeight: 600 }}>
                    {inv?.invoice_no || '—'}
                  </Td>
                  <Td>{inv?.sp_orders?.accounts?.name || '—'}</Td>
                  <Td align="right" mono>{rp(p.amount)}</Td>
                  <Td align="right" mono style={{ color: C.inkSoft }}>{p.pph > 0 ? rp(p.pph) : '—'}</Td>
                  <Td nowrap style={{ color: C.inkSoft }}>{p.reference || '—'}</Td>
                  <Td nowrap style={{ color: C.inkSoft }}>{p.pencatat || '—'}</Td>
                </tr>
              );
            })}
          </TableShell>
        )}
      </Panel>
    </div>
  );
}

// src/modules/finance/CollectionTrackingPage.jsx
// Finance > Accounts Receivable > Payment & Collection Tracking (6.2.4).
//
// TIGA tab, seluruhnya BACA-SAJA -- aksi (catat pembayaran, catat TTF) tetap
// di Detail Invoice, pola yang sama dengan InvoiceListPage.jsx:
//   1. "Perlu Ditagih" -- invoice terbuka yang SUDAH lewat jatuh tempo, urut
//      paling telat (data dari collectionData.js, SAMA dengan AR Aging).
//   2. "Jatuh Tempo Dekat" -- belum lewat jatuh tempo, jatuh tempo <= 7 hari
//      lagi, urut paling dekat.
//   3. "Riwayat Pembayaran" -- pembayaran terbaru lintas invoice.
//
// Invoice "Belum TTF" (due_date NULL) TIDAK PERNAH muncul di tab 1 maupun
// tab 2 -- bukan filter tambahan, melainkan konsekuensi alami definisi
// hariTelat/hariMenujuJatuhTempo di collectionData.js (keduanya 0/null untuk
// baris tanpa due_date). Tempatnya tetap satu-satunya di Invoice Submission
// & Acknowledgement (TtfSubmissionPage.jsx).
//
// Pencarian + filter entitas mengikuti pola InvoiceListPage.jsx (TabBar di
// kiri, kontrol filter di kanan, satu baris) -- berlaku untuk KETIGA tab
// sekaligus, satu kontrol untuk seluruh halaman.
//
// ⛔ Tautan HANYA ke Detail Invoice, TIDAK ke halaman SP (TD-289: Finance
// Controller belum tentu bisa membuka menu SP) -- keputusan Den saat PLAN.
//
// Keluarga token: ungu/serif Storbit (lihat catatan di financeKit.jsx).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Clock, Hourglass, Search, Wallet } from 'lucide-react';
import { listRecentPayments } from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { useCompanies } from '../../hooks/useCompanies';
import { isAllEntities as isAllEntitiesRole } from '../../lib/roles';
import useOpenInvoicesForCollection from './collectionData.js';
import { STATUS_LABEL_SHORT, STATUS_TAG, filterInvoices } from './invoiceStatus.js';
import {
  PageHead, Btn, TabBar, TabBtn, TableShell, Td, Notice, Hint, Empty,
} from './financeKit.jsx';
import { C, FONT_DISPLAY, RADIUS, SP, rp, fmtDate } from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

const TABS = ['perlu', 'dekat', 'riwayat'];
const TAB_LABEL = { perlu: 'Perlu Ditagih', dekat: 'Jatuh Tempo Dekat', riwayat: 'Riwayat Pembayaran' };

/** Baris payment (bentuk nested sp_invoices) terhadap search -- dibungkus
 *  dalam bentuk yang dipahami filterInvoices() alih-alih menulis ulang
 *  logika cocok teksnya sendiri. */
function pembayaranCocokCari(p, search) {
  if (!search.trim()) return true;
  const inv = p.sp_invoices;
  return filterInvoices([{ invoice_no: inv?.invoice_no, sp_orders: inv?.sp_orders }], { search }).length > 0;
}

export default function CollectionTrackingPage({ onOpenInvoice }) {
  const { invoices, loading, error, reload } = useOpenInvoicesForCollection();
  const { erpRoles, myCompanyIds } = useAuth();
  const { data: companies } = useCompanies();
  const entitasPilihan = isAllEntitiesRole(erpRoles)
    ? companies
    : companies.filter((c) => (myCompanyIds || []).includes(c.id));

  const [tab, setTab] = useState('perlu');
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('semua');

  const [pembayaran, setPembayaran] = useState([]);
  const [loadingBayar, setLoadingBayar] = useState(true);
  const [errorBayar, setErrorBayar] = useState(null);

  useEffect(() => {
    // `loadingBayar` sudah `true` sejak useState di atas -- berkas ini dimuat
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

  const dasar = useMemo(() => filterInvoices(
    entityFilter === 'semua' ? invoices : invoices.filter((r) => r.company_id === entityFilter),
    { search },
  ), [invoices, search, entityFilter]);

  const perluDitagih = useMemo(
    () => dasar.filter((r) => r.hariTelat > 0).sort((a, b) => b.hariTelat - a.hariTelat || b.sisa - a.sisa),
    [dasar],
  );
  const jatuhTempoDekat = useMemo(
    () => dasar.filter((r) => r.hariMenujuJatuhTempo !== null && r.hariMenujuJatuhTempo <= 7)
      .sort((a, b) => a.hariMenujuJatuhTempo - b.hariMenujuJatuhTempo),
    [dasar],
  );
  const pembayaranTersaring = useMemo(() => pembayaran.filter((p) => {
    if (entityFilter !== 'semua' && p.sp_invoices?.company_id !== entityFilter) return false;
    return pembayaranCocokCari(p, search);
  }), [pembayaran, search, entityFilter]);

  const hitungan = { perlu: perluDitagih.length, dekat: jatuhTempoDekat.length, riwayat: pembayaranTersaring.length };

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <PageHead
        kicker="Accounts Receivable"
        title="Payment & Collection Tracking"
        sub="Memantau proses penagihan dan pembayaran masuk."
        right={<Btn onClick={reload} disabled={loading}>{loading ? 'Memuat…' : 'Muat Ulang'}</Btn>}
      />

      {error && (
        <Notice tone="danger" icon={AlertTriangle}>
          Data invoice gagal dimuat: {error.message || 'penyebab tidak diketahui'}
        </Notice>
      )}
      {errorBayar && (
        <Notice tone="danger" icon={AlertTriangle}>
          Riwayat pembayaran gagal dimuat: {errorBayar.message || 'penyebab tidak diketahui'}
        </Notice>
      )}

      {/* ── Tab + pencarian ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap' }}>
        <TabBar style={{ flex: 1, minWidth: 260 }}>
          {TABS.map((t) => (
            <TabBtn key={t} active={tab === t} onClick={() => setTab(t)} label={TAB_LABEL[t]} count={hitungan[t]}/>
          ))}
        </TabBar>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s2, marginBottom: SP.s2 }}>
          {entitasPilihan.length > 1 && (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 4px 0 11px',
              border: `1px solid ${C.line}`, borderRadius: RADIUS.md, background: C.surface,
            }}>
              <Building2 size={14} style={{ color: C.inkFaint, flexShrink: 0 }}/>
              <select
                value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
                aria-label="Filter entitas"
                style={{
                  height: 32, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 13, color: C.ink, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                <option value="semua">Semua entitas</option>
                {entitasPilihan.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px',
            border: `1px solid ${C.line}`, borderRadius: RADIUS.md, background: C.surface,
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
      </div>

      {/* ── Isi tab aktif ── */}
      <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden', background: C.surface }}>
        {tab === 'perlu' && (
          loading ? (
            <Hint>Memuat…</Hint>
          ) : perluDitagih.length === 0 ? (
            <Empty
              icon={Clock} title="Nol invoice perlu ditagih"
              sub={search || entityFilter !== 'semua' ? 'Coba kosongkan filter di atas.' : 'Tidak ada piutang yang lewat jatuh tempo saat ini.'}
            />
          ) : (
            <div style={{ padding: SP.s3 }}>
              <TableShell
                minWidth={980}
                head={[['Entitas'], ['No. Invoice'], ['Customer'], ['Jatuh Tempo'], ['Hari Telat', 'right'], ['Sisa', 'right'], ['Status']]}
              >
                {perluDitagih.map((r) => (
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
                    <Td nowrap>{fmtDate(r.due_date)}</Td>
                    <Td align="right" mono style={{ color: C.danger, fontWeight: 700 }}>{r.hariTelat}</Td>
                    <Td align="right" mono>{rp(r.sisa)}</Td>
                    <Td nowrap>
                      <Badge {...(STATUS_TAG[r.status] || STATUS_TAG.issued)}>{STATUS_LABEL_SHORT[r.status] || r.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </TableShell>
            </div>
          )
        )}

        {tab === 'dekat' && (
          loading ? (
            <Hint>Memuat…</Hint>
          ) : jatuhTempoDekat.length === 0 ? (
            <Empty
              icon={Hourglass} title="Nol invoice jatuh tempo dalam 7 hari ke depan"
              sub={search || entityFilter !== 'semua' ? 'Coba kosongkan filter di atas.' : 'Tidak ada invoice yang mendekati jatuh tempo saat ini.'}
            />
          ) : (
            <div style={{ padding: SP.s3 }}>
              <TableShell
                minWidth={980}
                head={[['Entitas'], ['No. Invoice'], ['Customer'], ['Jatuh Tempo'], ['Hari Lagi', 'right'], ['Sisa', 'right'], ['Status']]}
              >
                {jatuhTempoDekat.map((r) => (
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
                    <Td nowrap>{fmtDate(r.due_date)}</Td>
                    <Td align="right" mono style={{ color: r.hariMenujuJatuhTempo <= 2 ? C.danger : C.ink, fontWeight: 700 }}>
                      {r.hariMenujuJatuhTempo === 0 ? 'Hari ini' : r.hariMenujuJatuhTempo}
                    </Td>
                    <Td align="right" mono>{rp(r.sisa)}</Td>
                    <Td nowrap>
                      <Badge {...(STATUS_TAG[r.status] || STATUS_TAG.issued)}>{STATUS_LABEL_SHORT[r.status] || r.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </TableShell>
            </div>
          )
        )}

        {tab === 'riwayat' && (
          loadingBayar ? (
            <Hint>Memuat…</Hint>
          ) : pembayaranTersaring.length === 0 ? (
            <Empty
              icon={Wallet} title={pembayaran.length === 0 ? 'Belum ada pembayaran tercatat' : 'Tidak ada pembayaran pada tampilan ini'}
              sub={pembayaran.length > 0 ? 'Coba kosongkan filter di atas.' : undefined}
            />
          ) : (
            <div style={{ padding: SP.s3 }}>
              <TableShell
                minWidth={900}
                head={[['Tanggal'], ['No. Invoice'], ['Customer'], ['Nominal', 'right'], ['PPh 23', 'right'], ['Referensi'], ['Dicatat Oleh']]}
              >
                {pembayaranTersaring.map((p) => {
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
            </div>
          )
        )}
      </div>
    </div>
  );
}

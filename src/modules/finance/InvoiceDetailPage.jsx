// src/modules/finance/InvoiceDetailPage.jsx
// Finance > Accounts Receivable > Invoice Management > Detail Invoice.
//
// BENTUK: dokumen di kiri, konteks di kanan (pola detail invoice dashboard SaaS
// modern), dengan kepala halaman, stepper tahap, dan navigasi rekaman "3 / 22"
// ala form Odoo yang dipakai Finance hari ini.
//
// ⛔ MURNI TAMPILAN. Seluruh kelakuan -- gate peran, keempat RPC, perhitungan
// sisa tagihan & saran PPh -- tinggal di `useInvoiceWorkflow.js`, dipindah apa
// adanya dari `InvoicePanel.jsx` (berkas itu dihapus; halaman ini satu-satunya
// pemakainya). Halaman ini tidak pernah memanggil RPC sendiri.
//
// ⚠️ TIDAK ADA TOMBOL EDIT, dan itu disengaja: invoice Nexus tidak bisa diubah
// setelah terbit (nomor & jurnalnya sudah beredar). Koreksi ditempuh lewat void
// + terbit ulang, dan jalur itu BELUM ADA di tahap ini -- jadi jangan
// "melengkapi" halaman ini dengan tombol ubah.
//
// Keluarga token: ungu/serif Storbit (lihat catatan di financeKit.jsx / TD-277).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, Download, FileText, Link2, Pencil, Printer, Receipt,
  Send, Stamp, Truck, Wallet,
} from 'lucide-react';
import {
  getInvoiceViewData, listInvoices, getSpFulfillmentDocs, listSpBtbNew,
} from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { PPN_RATE } from '../../lib/taxConstants';
import { getTodayWIB, fmtRelativeWIB, fmtDateTimeWIB } from '../../lib/dateUtils';
import useInvoiceWorkflow from './useInvoiceWorkflow';
import {
  STATUS_LABEL, STATUS_TAG, INVOICE_STEPS, stepIndexOf,
  filterInvoices, isOverdue,
} from './invoiceStatus.js';
import {
  Crumbs, Btn, MoreMenu, RecordNav, Stepper, Panel, MetaRow, TabBar, TabBtn,
  TableShell, Td, Notice, Hint, Empty, Avatar,
} from './financeKit.jsx';
import {
  C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, kickerStyle, thStyle,
  rp, fmtDate, selectOnFocus,
} from '../logistics/spDetailTokens.js';
import { Badge, ModalField, ModalInp } from '../logistics/spDetailKit.jsx';

// Alasan tertulis di tombol yang akan ditolak server (aturan K-6). Teksnya
// SENGAJA menyebut siapa yang boleh, bukan cuma "tidak diizinkan": orang yang
// kena harus tahu ke siapa memintanya.
const ALASAN_TERBIT = 'Server hanya menerima Finance Controller, manager ke atas, atau Super Admin.';
const ALASAN_BAYAR  = 'Pencatatan pembayaran hanya diterima dari Finance Controller atau Super Admin.';

/* Grid isian yang menyesuaikan diri — kolom kanan halaman ini sempit, jadi
   jumlah kolomnya tidak boleh ditetapkan. */
function FormGrid({ children, min = 150 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: '12px 14px' }}>
      {children}
    </div>
  );
}

/* Satu baris lini masa bergaya chatter. `actor` boleh kosong — beberapa
   kejadian memang tidak menyimpan pelakunya (mis. submitted_at tak punya
   kolom submitted_by), dan menebaknya = mengarang. */
function EventRow({ ev }) {
  const Icon = ev.icon || FileText;
  return (
    <li style={{ display: 'flex', gap: SP.s2, padding: `${SP.s2}px 0`, borderBottom: `1px solid ${C.lineSoft}` }}>
      {ev.actor
        ? <Avatar name={ev.actor} size={28}/>
        : (
          <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: C.surface2, border: `1px solid ${C.line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.inkFaint }}>
            <Icon size={13}/>
          </span>
        )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s2, flexWrap: 'wrap' }}>
          <b style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: C.ink }}>{ev.title}</b>
          <span title={fmtDateTimeWIB(ev.at)} style={{ fontSize: 11.5, color: C.inkFaint, whiteSpace: 'nowrap' }}>
            {fmtRelativeWIB(ev.at)}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45, marginTop: 1 }}>
          {ev.actor && <span style={{ color: C.ink }}>{ev.actor}</span>}
          {ev.actor && ev.detail ? ' · ' : null}
          {ev.detail}
        </div>
      </div>
    </li>
  );
}

export default function InvoiceDetailPage({
  invoiceId, showToast, onBack, onOpenSp, onOpenDelivery,
  listQuery = { status: 'semua', search: '' },
  onOpenInvoice,
}) {
  const { activeCompanyId } = useAuth();

  const [inv,     setInv]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Dokumen terkait (Surat Jalan + BTB) — tab "Dokumen Terkait".
  const [docs, setDocs] = useState({ deliveries: [], btb: [] });

  // Tetangga untuk navigasi rekaman. Dimuat TERPISAH dan gagalnya DIABAIKAN:
  // ia cuma alat bantu pindah rekaman, dan halaman detail tidak boleh gagal
  // terbuka gara-gara daftarnya tak bisa dibaca.
  const [siblings, setSiblings] = useState([]);

  const [tab,     setTab]     = useState('lines');
  const [payOpen, setPayOpen] = useState(false);

  const muat = useCallback(async () => {
    const { data, error: err } = await getInvoiceViewData(invoiceId);
    setInv(data || null);
    setError(err || null);
    return data;
  }, [invoiceId]);

  useEffect(() => {
    let batal = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!invoiceId) { setLoading(false); return undefined; }
    getInvoiceViewData(invoiceId).then(({ data, error: err }) => {
      if (batal) return;
      setInv(data || null);
      setError(err || null);
      setLoading(false);
    });
    return () => { batal = true; };
  }, [invoiceId]);

  // Dokumen terkait mengikuti SP-nya. Kunci (customer_id, sp_no) untuk Surat
  // Jalan — pola yang sama dengan Detail SP; BTB lewat sp_order_id.
  const spOrderId  = inv?.sp_order_id || null;
  const customerId = inv?.customer_id || null;
  const spNo       = inv?.sp_no || '';
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!spOrderId) { setDocs({ deliveries: [], btb: [] }); return undefined; }
    let batal = false;
    Promise.all([
      getSpFulfillmentDocs(customerId, spNo),
      listSpBtbNew(spOrderId),
    ]).then(([f, b]) => {
      if (batal) return;
      setDocs({ deliveries: f.data?.deliveries || [], btb: b.data || [] });
    });
    return () => { batal = true; };
  }, [spOrderId, customerId, spNo]);

  useEffect(() => {
    let batal = false;
    listInvoices({ companyId: activeCompanyId }).then(({ data }) => {
      if (!batal) setSiblings(data || []);
    });
    return () => { batal = true; };
  }, [activeCompanyId]);

  const wf = useInvoiceWorkflow({ invoice: inv, showToast, onChanged: muat });

  // ── Turunan tampilan ────────────────────────────────────────────────────
  const hariIni = getTodayWIB();
  const status  = inv?.status || null;
  const telat   = inv ? isOverdue(inv, hariIni) : false;

  const urutan = useMemo(() => filterInvoices(siblings, listQuery), [siblings, listQuery]);
  const idxRekaman = useMemo(
    () => urutan.findIndex((r) => r.id === invoiceId),
    [urutan, invoiceId],
  );

  // Ongkos kirim diturunkan DARI INVOICE ITU SENDIRI (total - dpp - ppn), bukan
  // dari Sigma sp_order_items.shipping_price. Sumbernya satu dengan saran PPh 23
  // di useInvoiceWorkflow, jadi baris ongkir di tabel selalu menutup selisih ke
  // Total — mustahil ada dua angka ongkir yang berbeda di satu layar.
  const ongkir = wf.totalOngkirInv;

  const events = useMemo(() => {
    if (!inv) return [];
    const out = [];
    if (inv.created_at) {
      out.push({
        key: 'created', at: inv.created_at, icon: Receipt,
        title: 'Invoice diterbitkan',
        actor: inv.created_by_name || null,
        detail: inv.invoice_no ? `No. ${inv.invoice_no}` : null,
      });
    }
    if (inv.submitted_at) {
      out.push({
        key: 'submitted', at: inv.submitted_at, icon: Send,
        title: 'Ditandai sudah upload ke portal',
        actor: null, detail: 'Pelakunya tidak direkam',
      });
    }
    (wf.payments || []).forEach((p) => {
      out.push({
        key: `pay-${p.id}`, at: p.created_at || p.payment_date, icon: Wallet,
        title: `Pembayaran dicatat ${rp(p.amount)}`,
        actor: null,
        detail: [p.payment_date ? `Tanggal bayar ${fmtDate(p.payment_date)}` : null,
                 Number(p.pph) ? `PPh ${rp(p.pph)}` : null,
                 p.reference || null].filter(Boolean).join(' · ') || null,
      });
    });
    if (wf.ttf?.tanggal_menerima) {
      out.push({
        key: 'ttf', at: wf.ttf.tanggal_menerima, icon: Stamp,
        title: 'Tanda Terima Faktur diterima',
        actor: wf.ttf.diterima_oleh || null,
        detail: [wf.ttf.no_ttf ? `No. ${wf.ttf.no_ttf}` : null, wf.ttf.notes || null]
          .filter(Boolean).join(' · ') || null,
      });
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [inv, wf.payments, wf.ttf]);

  // ── Keadaan gagal / kosong ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
        <Crumbs items={[{ label: 'Daftar Invoice', onClick: onBack }, { label: 'Memuat…' }]}/>
        <p style={{ fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat invoice…</p>
      </div>
    );
  }

  if (error || !inv) {
    // Sengaja MEMBEDAKAN "gagal baca" dari "tidak ada": keduanya butuh tindakan
    // berbeda, dan menyatukannya membuat masalah izin terlihat seperti data hilang.
    return (
      <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
        <Crumbs items={[{ label: 'Daftar Invoice', onClick: onBack }, { label: 'Tidak ditemukan' }]}/>
        <Notice tone="attn" icon={AlertTriangle}>
          {error
            ? <>Gagal membaca invoice: {error.message || 'unknown error'}</>
            : <>Invoice tidak ditemukan, atau tidak bisa dibaca dengan peran kamu di entitas ini.</>}
        </Notice>
        <div><Btn variant="ghost" onClick={onBack}>Kembali ke Daftar Invoice</Btn></div>
      </div>
    );
  }

  const tagStatus = STATUS_TAG[status] || STATUS_TAG.draft;

  /* ── Aksi utama, KONTEKSTUAL pada status ──────────────────────────────── */
  const aksiUtama = (() => {
    if (status === 'issued') {
      return (
        <Btn
          variant="primary" icon={Send}
          onClick={wf.handleSubmitInvoice}
          disabled={!wf.canSubmit || wf.invoiceSaving}
          title={wf.canSubmit ? undefined : ALASAN_TERBIT}
        >
          {wf.invoiceSaving ? 'Menyimpan…' : 'Tandai Sudah Upload ke Portal'}
        </Btn>
      );
    }
    if (status === 'submitted' || status === 'partial') {
      return (
        <Btn
          variant="primary" icon={Wallet}
          onClick={() => setPayOpen(true)}
          disabled={!wf.canRecordPayment}
          title={wf.canRecordPayment ? undefined : ALASAN_BAYAR}
        >
          Catat Pembayaran
        </Btn>
      );
    }
    return null;
  })();

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>

      {/* ══ Kepala halaman ══════════════════════════════════════════════ */}
      <Crumbs items={[
        { label: 'Daftar Invoice', onClick: onBack },
        { label: inv.invoice_no || '(tanpa nomor)', mono: true },
      ]}/>

      <div className="nx-grid-2 nx-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: SP.s6, alignItems: 'start' }}>
        {/* Kiri: nomor + badge + baris ringkas */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3, flexWrap: 'wrap' }}>
            <h1 style={{
              margin: 0, fontFamily: FONT_MONO, fontSize: 30, fontWeight: 600,
              letterSpacing: '-0.01em', lineHeight: 1.15, color: C.ink, wordBreak: 'break-all',
            }}>
              {inv.invoice_no || '(tanpa nomor)'}
            </h1>
            <Badge {...tagStatus}>{STATUS_LABEL[status] || status || '—'}</Badge>
          </div>

          {/* Baris ringkas: total + jatuh tempo / lunas */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s3, flexWrap: 'wrap', marginTop: SP.s2 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 700, color: C.grandTotal }}>
              {rp(inv.total_amount)}
            </span>
            <span style={{ fontSize: 13, color: telat ? C.danger : C.inkSoft, fontWeight: telat ? 700 : 400 }}>
              {status === 'paid'
                ? <>Lunas {fmtDate(wf.payments[0]?.payment_date || wf.payments[0]?.created_at)}</>
                : inv.due_date
                  ? <>Jatuh tempo {fmtDate(inv.due_date)}{telat ? ' · lewat jatuh tempo' : ''}</>
                  : <>Jatuh tempo belum diisi</>}
            </span>
          </div>
        </div>

        {/* Kanan: navigasi rekaman + stepper */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: SP.s2, alignItems: 'flex-start' }}>
          <RecordNav
            index={idxRekaman} total={urutan.length}
            onPrev={idxRekaman > 0 ? () => onOpenInvoice?.(urutan[idxRekaman - 1].id) : null}
            onNext={idxRekaman > -1 && idxRekaman < urutan.length - 1 ? () => onOpenInvoice?.(urutan[idxRekaman + 1].id) : null}
          />
          <Stepper
            steps={INVOICE_STEPS}
            currentIndex={stepIndexOf(status)}
            allDone={status === 'paid'}
            closedLabel={status === 'void' ? 'VOID' : null}
          />
        </div>
      </div>

      {/* ══ Baris tombol ════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap', alignItems: 'center' }}>
        {aksiUtama}
        <Btn
          icon={Printer} onClick={() => wf.handleInvoicePdf('print')} disabled={!!wf.invoicePdfBusy}
          title="Versi untuk kertas kop: tanpa blok kop & tanpa latar krem"
        >
          {wf.invoicePdfBusy === 'print' ? 'Menyiapkan…' : 'Cetak PDF (Kop Surat)'}
        </Btn>
        <Btn icon={Download} onClick={() => wf.handleInvoicePdf('download')} disabled={!!wf.invoicePdfBusy}>
          {wf.invoicePdfBusy === 'download' ? 'Menyiapkan…' : 'Download PDF'}
        </Btn>
        <MoreMenu items={[{
          label: wf.ttf?.tanggal_menerima ? 'Ubah TTF' : 'Catat TTF',
          icon: Stamp,
          disabled: !wf.canMarkTtf || !wf.bisaTtfSekarang,
          title: !wf.canMarkTtf
            ? 'Hanya manager ke atas, Finance Controller, atau Super Admin.'
            : !wf.bisaTtfSekarang ? 'TTF hanya bisa dicatat pada invoice yang sudah terbit.' : undefined,
          onClick: wf.mulaiEditTtf,
        }]}/>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.inkFaint }}>
          Invoice tidak bisa diubah setelah terbit — koreksi lewat void &amp; terbit ulang.
        </span>
      </div>

      {/* ══ Badan: dokumen kiri, konteks kanan ══════════════════════════ */}
      <div className="nx-grid-2 nx-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: SP.s6, alignItems: 'start' }}>

        {/* ─────────────── KIRI: kartu dokumen ─────────────── */}
        <main style={{ minWidth: 0 }}>
          <div style={{
            background: '#F8F4F4', border: `1px solid ${C.line}`, borderRadius: RADIUS.md,
            boxShadow: '0 3px 10px rgba(45,43,43,.16)', padding: `${SP.s6}px ${SP.s4}px`,
          }}>
            {/* Kepala kertas: Ditagihkan ke + DC · meta kanan */}
            <div style={{ display: 'flex', gap: SP.s4, flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: SP.s3, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                <div style={{ ...kickerStyle }}>Ditagihkan ke</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginTop: 3 }}>
                  {inv.customer_name || '—'}
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5, marginTop: 2 }}>
                  {inv.customer_address || '—'}
                </div>
                <div style={{ ...kickerStyle, marginTop: SP.s3 }}>DC tujuan</div>
                <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>
                  {inv.dc ? [inv.dc.kode, inv.dc.nama].filter(Boolean).join(' · ') : '—'}
                </div>
                {inv.dc?.alamat && (
                  <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>{inv.dc.alamat}</div>
                )}
              </div>

              <div style={{ minWidth: 220, flex: '0 1 280px' }}>
                <MetaRow label="No. Invoice" mono strong>{inv.invoice_no || '—'}</MetaRow>
                <MetaRow label="No. SP" mono>
                  {onOpenSp && inv.customer_id ? (
                    <button
                      type="button" onClick={() => onOpenSp(inv.customer_id, inv.sp_no)}
                      style={{ background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600 }}
                    >
                      {inv.sp_no || '—'}
                    </button>
                  ) : (inv.sp_no || '—')}
                </MetaRow>
                <MetaRow label="Tanggal Invoice">{fmtDate(inv.invoice_date)}</MetaRow>
                <MetaRow label="Jatuh Tempo">
                  <span style={{ color: telat ? C.danger : C.ink, fontWeight: telat ? 700 : 500 }}>
                    {fmtDate(inv.due_date)}
                  </span>
                </MetaRow>
                <MetaRow label="TTF">
                  {wf.ttf?.tanggal_menerima
                    ? <>{wf.ttf.no_ttf ? `${wf.ttf.no_ttf} · ` : ''}{fmtDate(wf.ttf.tanggal_menerima)}</>
                    : <span style={{ color: C.inkFaint }}>Belum ada</span>}
                </MetaRow>
              </div>
            </div>

            {/* Tab dokumen */}
            <TabBar style={{ margin: `${SP.s4}px 0 ${SP.s4}px` }}>
              <TabBtn active={tab === 'lines'} onClick={() => setTab('lines')} label="Baris Invoice" count={inv.lines.length}/>
              <TabBtn active={tab === 'docs'}  onClick={() => setTab('docs')}  label="Dokumen Terkait" count={docs.deliveries.length + docs.btb.length}/>
              <TabBtn active={tab === 'tax'}   onClick={() => setTab('tax')}   label="Pajak"/>
            </TabBar>

            {/* ── Tab: Baris Invoice ── */}
            {tab === 'lines' && (
              <>
                <TableShell
                  minWidth={560}
                  head={[['Produk'], ['SKU'], ['Qty', 'right'], ['Harga Satuan', 'right'], ['Jumlah', 'right']]}
                >
                  {inv.lines.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: SP.s3, fontSize: 12.5, color: C.inkFaint, textAlign: 'center' }}>Invoice ini tidak punya baris.</td></tr>
                  ) : inv.lines.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.product_name || '—'}</Td>
                      <Td mono style={{ color: C.inkSoft, fontSize: 12 }}>{l.sku || '—'}</Td>
                      <Td align="right" mono nowrap>
                        {l.qty.toLocaleString('id-ID')}
                        {l.uom ? <span style={{ color: C.inkFaint, fontFamily: 'inherit' }}> {l.uom}</span> : null}
                      </Td>
                      <Td align="right" mono nowrap>{rp(l.unit_price)}</Td>
                      <Td align="right" mono nowrap>{rp(l.dpp)}</Td>
                    </tr>
                  ))}
                  {/* Baris ongkos kirim hanya muncul kalau memang ada nilainya. */}
                  {ongkir > 0 && (
                    <tr>
                      <Td>Ongkos kirim</Td>
                      <Td mono style={{ color: C.inkFaint }}>—</Td>
                      <Td align="right" mono>—</Td>
                      <Td align="right" mono>—</Td>
                      <Td align="right" mono nowrap>{rp(ongkir)}</Td>
                    </tr>
                  )}
                </TableShell>

                {/* Rincian nilai — Sisa Tagihan paling menonjol. */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SP.s4 }}>
                  <div style={{ width: '100%', maxWidth: 340 }}>
                    <MetaRow label="DPP" mono>{rp(inv.total_dpp)}</MetaRow>
                    {/* Label memakai tarif EFEKTIF (11%) — angka yang memang
                        dihitung create_invoice. ⚠️ PDF-nya mencetak "VAT (12%)"
                        (PPN_LABEL_PCT): 12% statutori atas DPP Nilai Lain 11/12
                        = 11% efektif. KEDUANYA BENAR; jangan disamakan ke salah
                        satu arah (taxConstants.js, gotcha #32). */}
                    <MetaRow label={`PPN (${Math.round(PPN_RATE * 100)}%)`} mono>{rp(inv.total_ppn)}</MetaRow>
                    {ongkir > 0 && <MetaRow label="Ongkos kirim" mono>{rp(ongkir)}</MetaRow>}
                    <div style={{ borderTop: `1.5px solid ${C.line}`, marginTop: 5, paddingTop: 5 }}>
                      <MetaRow label="Total" mono strong>
                        <span style={{ fontSize: 15, color: C.grandTotal }}>{rp(inv.total_amount)}</span>
                      </MetaRow>
                    </div>
                    <MetaRow label="Sudah dibayar" mono>{rp(wf.paidSettled)}</MetaRow>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.s3,
                      marginTop: SP.s2, padding: `${SP.s2}px ${SP.s3}px`, borderRadius: RADIUS.md,
                      background: wf.sisaTagihan > 0 ? C.attnBg : C.accentSoft,
                      border: `1px solid ${wf.sisaTagihan > 0 ? C.attnBd : C.accentBd}`,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: wf.sisaTagihan > 0 ? C.attn : C.accentDeep }}>
                        {wf.sisaTagihan < 0 ? 'Lebih Bayar' : 'Sisa Tagihan'}
                      </span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700, color: wf.sisaTagihan > 0 ? C.attn : C.accentDeep }}>
                        {rp(Math.abs(wf.sisaTagihan))}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Dokumen Terkait ── */}
            {tab === 'docs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
                <div>
                  <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Surat Jalan</div>
                  {docs.deliveries.length === 0 ? (
                    <Hint>Tidak ada Surat Jalan yang tercatat untuk SP ini.</Hint>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s1 }}>
                      {docs.deliveries.map((d) => (
                        <div
                          key={d.id}
                          onClick={onOpenDelivery ? () => onOpenDelivery(d.id) : undefined}
                          role={onOpenDelivery ? 'button' : undefined}
                          tabIndex={onOpenDelivery ? 0 : undefined}
                          onKeyDown={onOpenDelivery ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDelivery(d.id); } } : undefined}
                          style={{
                            display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap',
                            border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md,
                            padding: `${SP.s2}px ${SP.s3}px`, background: C.surface,
                            cursor: onOpenDelivery ? 'pointer' : 'default',
                          }}
                        >
                          <Truck size={14} style={{ color: onOpenDelivery ? C.accent : C.inkFaint, flexShrink: 0 }}/>
                          <b style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: C.ink }}>{d.do_no || '—'}</b>
                          <span style={{ fontSize: 12, color: C.inkSoft }}>
                            {d.signed_date
                              ? <>Ditandatangani {fmtDate(d.signed_date)}</>
                              : <span style={{ color: C.attn }}>Tanggal tanda tangan belum diisi</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Bukti Terima Barang (BTB)</div>
                  {docs.btb.length === 0 ? (
                    <Hint>Belum ada BTB untuk SP ini.</Hint>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s1 }}>
                      {/* BTB belum punya halaman detail sendiri — barisnya memang
                          tidak bisa diklik, bukan kelalaian. */}
                      {docs.btb.map((b) => (
                        <div key={b.id} style={{
                          display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap',
                          border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md,
                          padding: `${SP.s2}px ${SP.s3}px`, background: C.surface,
                        }}>
                          <FileText size={14} style={{ color: C.inkFaint, flexShrink: 0 }}/>
                          <b style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: C.ink }}>{b.btb_no || '—'}</b>
                          <span style={{ fontSize: 12, color: C.inkSoft }}>
                            {b.btb_date ? fmtDate(b.btb_date) : <span style={{ color: C.inkFaint }}>Tanggal kosong</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Pajak ── */}
            {tab === 'tax' && (
              <div style={{ maxWidth: 420 }}>
                <MetaRow label="No. Faktur Pajak" mono strong>
                  {inv.faktur_no || <span style={{ color: C.inkFaint, fontFamily: 'inherit' }}>Belum ada</span>}
                </MetaRow>
                <MetaRow label="DPP" mono>{rp(inv.total_dpp)}</MetaRow>
                <MetaRow label={`PPN (${Math.round(PPN_RATE * 100)}%)`} mono>{rp(inv.total_ppn)}</MetaRow>
                <div style={{ marginTop: SP.s3 }}>
                  <Notice tone="info" icon={Stamp}>
                    <b>Coretax</b> belum tersambung. Nomor Faktur Pajak hari ini diisi dari luar
                    Nexus; begitu integrasinya ada, blok ini yang menampilkan status penerbitannya.
                  </Notice>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ─────────────── KANAN: konteks ─────────────── */}
        <aside style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>

          {/* ── Kartu Pembayaran ── */}
          <Panel
            title="Pembayaran" icon={Wallet}
            right={wf.bisaBayarSekarang && !payOpen ? (
              <Btn
                size="sm" variant="outline" icon={Wallet} onClick={() => setPayOpen(true)}
                disabled={!wf.canRecordPayment}
                title={wf.canRecordPayment ? undefined : ALASAN_BAYAR}
              >
                Catat
              </Btn>
            ) : null}
          >
            <MetaRow label="Total tagihan" mono>{rp(inv.total_amount)}</MetaRow>
            <MetaRow label="Total terbayar" mono>{rp(wf.paidSettled)}</MetaRow>
            <MetaRow label={wf.sisaTagihan < 0 ? 'Lebih bayar' : 'Sisa'} mono strong>
              <span style={{ color: wf.sisaTagihan > 0 ? C.attn : C.accentDeep }}>
                {rp(Math.abs(wf.sisaTagihan))}
              </span>
            </MetaRow>

            {wf.showPaymentHistory && (
              <div style={{ marginTop: SP.s3, borderTop: `1px solid ${C.lineSoft}`, paddingTop: SP.s2 }}>
                {wf.payments.length === 0 ? (
                  <Hint>Belum ada pembayaran tercatat.</Hint>
                ) : (
                  <TableShell head={[['Tanggal'], ['Nominal', 'right'], ['PPh', 'right'], ['Referensi']]}>
                    {wf.payments.map((pm) => (
                      <tr key={pm.id}>
                        <Td nowrap style={{ fontSize: 12.5 }}>{fmtDate(pm.payment_date)}</Td>
                        <Td align="right" mono nowrap style={{ fontSize: 12.5 }}>{rp(pm.amount)}</Td>
                        <Td align="right" mono nowrap style={{ fontSize: 12.5, color: C.inkSoft }}>{rp(pm.pph)}</Td>
                        <Td style={{ fontSize: 12.5 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {pm.reference || '—'}
                            {pm.bukti_potong_url && (
                              <a
                                href={pm.bukti_potong_url} target="_blank" rel="noopener noreferrer"
                                title={pm.bukti_potong_no ? `Bukti potong ${pm.bukti_potong_no}` : 'Bukti potong'}
                                style={{ color: C.accent, display: 'inline-flex', alignItems: 'center' }}
                              >
                                <Link2 size={13}/>
                              </a>
                            )}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </TableShell>
                )}
              </div>
            )}

            {/* Form Terima Pembayaran — logika PERSIS panel lama. */}
            {wf.bisaBayarSekarang && payOpen && (
              <div style={{ marginTop: SP.s3, borderTop: `1px solid ${C.lineSoft}`, paddingTop: SP.s3 }}>
                <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Terima Pembayaran</div>
                {!wf.canRecordPayment && (
                  <div style={{ marginBottom: SP.s2 }}>
                    <Notice tone="attn" icon={AlertTriangle}>{ALASAN_BAYAR}</Notice>
                  </div>
                )}
                <FormGrid>
                  <ModalField label="Nominal (Rp)" req>
                    <ModalInp
                      type="number" value={wf.payForm.amount} onFocus={selectOnFocus}
                      disabled={!wf.canRecordPayment}
                      onChange={(e) => wf.setPayForm((f) => ({ ...f, amount: e.target.value.replace(/^0+(?=\d)/, '') }))}
                    />
                  </ModalField>
                  <ModalField label="Tanggal Bayar">
                    <ModalInp
                      type="date" value={wf.payForm.paymentDate} disabled={!wf.canRecordPayment}
                      onChange={(e) => wf.setPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
                    />
                  </ModalField>
                  <ModalField label="Referensi / No. Transfer">
                    <ModalInp
                      value={wf.payForm.reference} disabled={!wf.canRecordPayment}
                      onChange={(e) => wf.setPayForm((f) => ({ ...f, reference: e.target.value }))}
                    />
                  </ModalField>
                  <ModalField label="PPh 23 (Rp)">
                    {/* Prefill saran sekali; begitu user mengetik, nilainya tak ditimpa lagi. */}
                    <ModalInp
                      type="number" onFocus={selectOnFocus} disabled={!wf.canRecordPayment}
                      value={wf.pphTouched ? wf.payForm.pph : (wf.payForm.pph || String(wf.pphSuggestion))}
                      onChange={(e) => { wf.setPphTouched(true); wf.setPayForm((f) => ({ ...f, pph: e.target.value })); }}
                    />
                    <span style={{ fontSize: 11, color: C.inkFaint }}>Saran otomatis, sesuaikan dengan bukti potong asli.</span>
                  </ModalField>
                  <ModalField label="Link Bukti Potong">
                    <ModalInp
                      type="url" placeholder="https://drive.google.com/…" value={wf.payForm.buktiUrl}
                      disabled={!wf.canRecordPayment}
                      onChange={(e) => wf.setPayForm((f) => ({ ...f, buktiUrl: e.target.value }))}
                    />
                  </ModalField>
                  <ModalField label="No. Bukti Potong">
                    <ModalInp
                      value={wf.payForm.buktiNo} disabled={!wf.canRecordPayment}
                      onChange={(e) => wf.setPayForm((f) => ({ ...f, buktiNo: e.target.value }))}
                    />
                  </ModalField>
                </FormGrid>
                <div style={{ display: 'flex', gap: SP.s2, marginTop: SP.s3, flexWrap: 'wrap' }}>
                  <Btn
                    variant="primary" icon={Wallet} onClick={wf.handleRecordPayment}
                    disabled={!wf.canRecordPayment || wf.paySaving || !(Number(wf.payForm.amount) > 0)}
                    title={wf.canRecordPayment ? undefined : ALASAN_BAYAR}
                  >
                    {wf.paySaving ? 'Menyimpan…' : 'Catat Pembayaran'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setPayOpen(false)} disabled={wf.paySaving}>Tutup</Btn>
                </div>
              </div>
            )}
          </Panel>

          {/* ── Kartu TTF ── */}
          <Panel
            title="Tanda Terima Faktur" icon={Stamp}
            right={wf.ttf?.tanggal_menerima && !wf.ttfEditing ? (
              <Btn size="sm" variant="ghost" icon={Pencil} onClick={wf.mulaiEditTtf} disabled={!wf.canMarkTtf}
                title={wf.canMarkTtf ? undefined : 'Hanya manager ke atas, Finance Controller, atau Super Admin.'}>
                Ubah
              </Btn>
            ) : null}
          >
            {!wf.bisaTtfSekarang ? (
              <Hint>TTF dicatat setelah invoice terbit.</Hint>
            ) : (wf.ttf?.tanggal_menerima && !wf.ttfEditing) ? (
              <>
                <MetaRow label="No. TTF" mono>{wf.ttf.no_ttf || '—'}</MetaRow>
                <MetaRow label="Tanggal diterima">{fmtDate(wf.ttf.tanggal_menerima)}</MetaRow>
                <MetaRow label="Diterima oleh">{wf.ttf.diterima_oleh || '—'}</MetaRow>
                {wf.ttf.notes && <MetaRow label="Catatan">{wf.ttf.notes}</MetaRow>}
              </>
            ) : wf.ttfEditing ? (
              <>
                {!wf.canMarkTtf && (
                  <div style={{ marginBottom: SP.s2 }}>
                    <Notice tone="attn" icon={AlertTriangle}>
                      Hanya manager ke atas, Finance Controller, atau Super Admin yang bisa menandai TTF.
                    </Notice>
                  </div>
                )}
                <FormGrid>
                  <ModalField label="Nama Penerima" req>
                    <ModalInp
                      value={wf.ttfForm.receivedBy} disabled={!wf.canMarkTtf}
                      onChange={(e) => wf.setTtfForm((f) => ({ ...f, receivedBy: e.target.value }))}
                    />
                  </ModalField>
                  <ModalField label="No. TTF">
                    <ModalInp
                      value={wf.ttfForm.ttfNo} disabled={!wf.canMarkTtf}
                      onChange={(e) => wf.setTtfForm((f) => ({ ...f, ttfNo: e.target.value }))}
                    />
                  </ModalField>
                  <ModalField label="Catatan">
                    <ModalInp
                      value={wf.ttfForm.notes} disabled={!wf.canMarkTtf}
                      onChange={(e) => wf.setTtfForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </ModalField>
                </FormGrid>
                <div style={{ display: 'flex', gap: SP.s2, marginTop: SP.s3, flexWrap: 'wrap' }}>
                  <Btn
                    variant="primary" icon={Check} onClick={wf.handleMarkTtf}
                    disabled={!wf.canMarkTtf || wf.ttfSaving || !wf.ttfForm.receivedBy.trim()}
                  >
                    {wf.ttfSaving ? 'Menyimpan…' : (wf.ttf?.tanggal_menerima ? 'Simpan Perubahan' : 'Tandai TTF Diterima')}
                  </Btn>
                  <Btn variant="ghost" onClick={wf.batalEditTtf} disabled={wf.ttfSaving}>Batal</Btn>
                </div>
              </>
            ) : (
              <>
                <Hint>TTF belum dicatat untuk invoice ini.</Hint>
                <div style={{ marginTop: SP.s2 }}>
                  <Btn
                    size="sm" icon={Stamp} onClick={wf.mulaiEditTtf} disabled={!wf.canMarkTtf}
                    title={wf.canMarkTtf ? undefined : 'Hanya manager ke atas, Finance Controller, atau Super Admin.'}
                  >
                    Catat TTF
                  </Btn>
                </div>
              </>
            )}
          </Panel>

          {/* ── Riwayat (chatter) ── */}
          <Panel title="Riwayat" icon={FileText}>
            {events.length === 0 ? (
              <Empty icon={FileText} title="Belum ada kejadian" sub="Riwayat terisi sendiri dari penerbitan, upload portal, TTF, dan pembayaran."/>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {events.map((ev) => <EventRow key={ev.key} ev={ev}/>)}
              </ul>
            )}
            {/* Lini masa ini disusun dari data yang SUDAH ADA (created_at,
                submitted_at, ar_ttfs, sp_payments) — nol tabel baru, nol kolom
                baru. Karena itu ia tidak bisa menampilkan komentar bebas, dan
                beberapa kejadian tidak punya pelaku. */}
            <p style={{ ...thStyle, padding: `${SP.s2}px 0 0`, letterSpacing: '.06em' }}>
              Disusun dari jejak yang sudah tersimpan
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

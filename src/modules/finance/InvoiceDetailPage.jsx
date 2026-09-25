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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Download, FileText, Link2, Lock, MessageSquare,
  Paperclip, Pencil, Printer, Receipt, Send, Stamp, Trash2, Truck, Upload, Wallet,
} from 'lucide-react';
import {
  getInvoiceViewData, listInvoices, getSpFulfillmentDocs, listSpBtbNew,
} from '../../lib/db';
import useInvoiceExtras from './useInvoiceExtras';
import { useAuth } from '../../contexts/useAuth';
import { PPN_RATE, CORETAX_TX_CODES } from '../../lib/taxConstants';
import { getTodayWIB, fmtRelativeWIB, fmtDateTimeWIB } from '../../lib/dateUtils';
import useInvoiceWorkflow from './useInvoiceWorkflow';
import {
  STATUS_LABEL, STATUS_TAG, INVOICE_STEPS, stepIndexOf,
  filterInvoices, isOverdue,
} from './invoiceStatus.js';
import {
  Crumbs, Btn, MoreMenu, RecordNav, Stepper, Panel, MetaRow, TabBar, TabBtn,
  TableShell, Td, Notice, Hint, Empty, Avatar, Ref, QuickPanel, Sel,
} from './financeKit.jsx';
import {
  C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, kickerStyle, thStyle,
  rp, fmtDate, selectOnFocus,
} from '../logistics/spDetailTokens.js';
import { Badge, ModalField, ModalInp } from '../logistics/spDetailKit.jsx';

/* Kolom yang MENGUBAH ANGKA dan dikunci di DB sampai kebijakannya ada
   (CHECK bernama, 20260928000001/2). Ditampilkan read-only beserta alasannya --
   bukan disembunyikan: kolom yang hilang dari layar akan ditanyakan lagi.

   Teks di bawah untuk PENGGUNA: satu kalimat, tanpa istilah teknis. Alasan
   teknis lengkapnya (kebijakan revaluasi, akun selisih kurs, invariant piutang,
   jurnal) ada di komentar masing-masing CHECK di berkas migrasinya -- itu
   tempatnya, bukan layar Finance. */
const TERKUNCI = {
  currency: 'Semua invoice Nexus dibuat dalam Rupiah.',
  rounding: 'Nilai invoice tidak dibulatkan.',
  dppnl:    'DPP Nilai Lain tidak perlu diaktifkan. PPN 11% di invoice ini sudah setara 12% x 11/12.',
  diskon:   'Diskon diatur di harga SP, bukan di invoice.',
  days:     'Kolom ini tidak dipakai. Jumlah tagihan dihitung dari Qty.',
};

/* Baris nilai yang terkunci: nilainya tampil, gemboknya tampil, alasannya
   tersedia di tooltip DAN di teks kecil -- tooltip saja tidak terbaca di
   sentuh. */
function Terkunci({ label, children, alasan }) {
  return (
    <div style={{ padding: '6px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.s3, fontSize: 13 }}>
        <span style={{ color: C.inkSoft, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Lock size={11} style={{ color: C.inkFaint }}/> {label}
        </span>
        <span style={{ color: C.inkSoft, fontFamily: FONT_MONO, textAlign: 'right' }}>{children}</span>
      </div>
      <p title={alasan} style={{ margin: '3px 0 0', fontSize: 11.5, color: C.inkFaint, lineHeight: 1.45 }}>
        {alasan}
      </p>
    </div>
  );
}

// Alasan tertulis di tombol yang akan ditolak server (aturan K-6). Teksnya
// SENGAJA menyebut siapa yang boleh, bukan cuma "tidak diizinkan": orang yang
// kena harus tahu ke siapa memintanya. Satu kalimat, tanpa kata "server".
const ALASAN_TERBIT = 'Hanya Finance Controller, manager ke atas, atau Super Admin yang bisa menandai invoice sudah diupload.';
const ALASAN_BAYAR  = 'Hanya Finance Controller atau Super Admin yang bisa mencatat pembayaran.';
const ALASAN_TTF    = 'Hanya manager ke atas, Finance Controller, atau Super Admin yang bisa mencatat TTF.';
const ALASAN_PAJAK  = 'Hanya Finance, Finance Controller, atau Super Admin yang bisa mengisi data pajak.';
const ALASAN_UNGGAH = 'Hanya Finance, Finance Controller, manager ke atas, atau Super Admin yang bisa mengunggah lampiran.';

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
  // Panel samping (Contextual Master Data Access). Satu state untuk SELURUH
  // jenis rujukan: dua panel terbuka sekaligus tidak pernah masuk akal, dan
  // satu state membuat itu mustahil alih-alih cuma tidak dilakukan.
  const [panel,   setPanel]   = useState(null);
  const berkasRef = useRef(null);

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
  const ex = useInvoiceExtras({ invoice: inv, showToast, onChanged: muat });

  // Satu pembangun per jenis rujukan. Sengaja fungsi kecil yang mengembalikan
  // bentuk panel, bukan komponen per jenis: panelnya SATU, isinya yang berbeda.
  // Cetak = buat PDF dulu, baru catat jejaknya. Urutannya penting dan bukan
  // gaya: mencatat di depan akan menghitung percobaan yang gagal.
  const cetak = async (variant) => {
    await wf.handleInvoicePdf(variant);
    await ex.catatCetak(variant);
  };

  const panelCustomer = () => setPanel({
    kicker: 'Customer', title: inv.customer_name || '(tanpa nama)',
    rows: [
      ['Alamat', inv.customer_address || '—'],
      ['NPWP', inv.customer_tax_id || <span style={{ color: C.inkFaint }}>Belum diisi</span>],
      ['Termin', inv.payment_term_days != null ? `${inv.payment_term_days} hari` : '—'],
    ],
  });
  const panelDc = () => setPanel({
    kicker: 'DC tujuan', title: [inv.dc?.kode, inv.dc?.nama].filter(Boolean).join(' - ') || '(tanpa DC)',
    rows: [['Kode', inv.dc?.kode || '—'], ['Wilayah', inv.dc?.wilayah || '—'], ['Alamat', inv.dc?.alamat || '—']],
  });
  const panelSp = () => setPanel({
    kicker: 'Surat Pesanan', title: inv.sp_no || '(tanpa nomor)',
    rows: [
      ['Tanggal SP', fmtDate(inv.sp_date)],
      ['Customer', inv.customer_name || '—'],
      ['DC', [inv.dc?.kode, inv.dc?.nama].filter(Boolean).join(' - ') || '—'],
    ],
    onOpenFull: onOpenSp && inv.customer_id ? () => onOpenSp(inv.customer_id, inv.sp_no) : null,
    fullLabel: 'Buka Detail SP',
  });
  const panelDelivery = (d) => setPanel({
    kicker: 'Surat Jalan', title: d.do_no || '(tanpa nomor)',
    rows: [
      ['Status', d.status || '—'],
      ['Diberangkatkan', d.dispatched_at ? fmtDate(d.dispatched_at) : '—'],
      ['Ditandatangani', d.signed_date
        ? fmtDate(d.signed_date)
        : <span style={{ color: C.attn }}>Belum diisi</span>],
      ['Sopir', d.driver_name || '—'],
      ['Kendaraan', d.vehicle_no || '—'],
      ['Koli / Qty', `${d.total_koli ?? '—'} / ${(d.total_qty ?? 0).toLocaleString('id-ID')}`],
    ],
    onOpenFull: onOpenDelivery ? () => onOpenDelivery(d.id) : null,
    fullLabel: 'Buka Detail Surat Jalan',
  });
  // BTB belum punya halaman detail sendiri -- panelnya sengaja tanpa tombol
  // "buka halaman penuh", bukan dengan tombol yang mati.
  const panelBtb = (b) => setPanel({
    kicker: 'Bukti Terima Barang', title: b.btb_no || '(tanpa nomor)',
    rows: [
      ['Tanggal BTB', b.btb_date ? fmtDate(b.btb_date) : <span style={{ color: C.inkFaint }}>Kosong</span>],
      ['Qty diterima', b.qty == null ? '—' : Number(b.qty).toLocaleString('id-ID')],
      ['Dicatat', fmtDate(b.created_at)],
      ['Catatan', b.remarks || '—'],
    ],
  });
  const panelTtf = () => setPanel({
    kicker: 'Tanda Terima Faktur', title: wf.ttf?.no_ttf || '(tanpa nomor)',
    rows: [
      ['Tanggal diterima', fmtDate(wf.ttf?.tanggal_menerima)],
      ['Diterima oleh', wf.ttf?.diterima_oleh || '—'],
      ['Catatan', wf.ttf?.notes || '—'],
    ],
  });
  const panelProduk = (l) => setPanel({
    kicker: 'Produk', title: l.product_name || '(tanpa nama)',
    rows: [
      ['SKU', l.sku || '—'],
      ['Satuan', l.uom || '—'],
      ['Harga satuan', rp(l.unit_price)],
      ['Qty', l.qty.toLocaleString('id-ID')],
      ['Akun', l.account_code ? `${l.account_code} - ${l.account_name}` : <span style={{ color: C.inkFaint }}>Belum dipetakan</span>],
      ['Pajak', l.tax_code ? `${l.tax_code} (${l.tax_name})` : <span style={{ color: C.inkFaint }}>Belum ditautkan</span>],
      ['Keterangan', l.description || '—'],
    ],
    extra: (
      <div style={{ marginTop: SP.s3 }}>
        <Terkunci label="Diskon" alasan={TERKUNCI.diskon}>{l.discount_pct}%</Terkunci>
        <Terkunci label="Hari (analytic)" alasan={TERKUNCI.days}>{l.days == null ? '—' : l.days}</Terkunci>
        <Hint>
          Angka di sini direkam saat invoice terbit, bukan harga produk hari ini.
        </Hint>
      </div>
    ),
  });
  const panelBayar = (pm) => setPanel({
    kicker: 'Pembayaran', title: pm.reference || fmtDate(pm.payment_date),
    rows: [
      ['Tanggal', fmtDate(pm.payment_date)],
      ['Nominal', rp(pm.amount)],
      ['PPh dipotong', rp(pm.pph)],
      ['No. bukti potong', pm.bukti_potong_no || '—'],
      ['Metode', pm.method || '—'],
    ],
    extra: pm.bukti_potong_url ? (
      <div style={{ marginTop: SP.s3 }}>
        <a
          href={pm.bukti_potong_url} target="_blank" rel="noopener noreferrer"
          style={{ color: C.accent, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Link2 size={14}/> Buka berkas bukti potong
        </a>
      </div>
    ) : null,
  });

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
    if (inv.printed_at) {
      out.push({
        key: 'printed', at: inv.printed_at, icon: Printer,
        title: inv.print_count > 1 ? `Invoice dicetak (${inv.print_count}x)` : 'Invoice dicetak',
        actor: null, detail: null,
      });
    }
    if (inv.emailed_at) {
      out.push({ key: 'emailed', at: inv.emailed_at, icon: Send, title: 'Invoice dikirim lewat email', actor: null, detail: null });
    }
    // Catatan internal masuk ke lini masa yang SAMA, bukan lini masa kedua:
    // memisahkannya membuat pembaca harus menggabungkan dua urutan waktu
    // sendiri untuk tahu apa yang terjadi lebih dulu.
    for (const n of ex.notes) {
      if (n.deleted_at) continue;
      out.push({
        key: `note-${n.id}`, at: n.created_at, icon: MessageSquare,
        title: 'Catatan internal', actor: n.penulis || null, detail: n.body,
      });
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [inv, wf.payments, wf.ttf, ex.notes]);

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
            ? <>Invoice gagal dimuat: {error.message || 'penyebab tidak diketahui'}</>
            : <>Invoice tidak ditemukan, atau tidak bisa dibuka dengan peran kamu di entitas ini.</>}
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
          icon={Printer} onClick={() => cetak('print')} disabled={!!wf.invoicePdfBusy}
          title="Versi untuk kertas kop: tanpa blok kop & tanpa latar krem"
        >
          {wf.invoicePdfBusy === 'print' ? 'Menyiapkan…' : 'Cetak PDF (Kop Surat)'}
        </Btn>
        <Btn icon={Download} onClick={() => cetak('download')} disabled={!!wf.invoicePdfBusy}>
          {wf.invoicePdfBusy === 'download' ? 'Menyiapkan…' : 'Download PDF'}
        </Btn>
        <MoreMenu items={[{
          label: wf.ttf?.tanggal_menerima ? 'Ubah TTF' : 'Catat TTF',
          icon: Stamp,
          disabled: !wf.canMarkTtf || !wf.bisaTtfSekarang,
          title: !wf.canMarkTtf
            ? ALASAN_TTF
            : !wf.bisaTtfSekarang ? 'TTF hanya bisa dicatat pada invoice yang sudah terbit.' : undefined,
          onClick: wf.mulaiEditTtf,
        }]}/>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.inkFaint }}>
          Invoice tidak bisa diubah setelah terbit.
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
                  <Ref mono={false} onClick={panelCustomer} title="Lihat ringkas customer">
                    {inv.customer_name || '—'}
                  </Ref>
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5, marginTop: 2 }}>
                  {inv.customer_address || '—'}
                </div>
                <div style={{ ...kickerStyle, marginTop: SP.s3 }}>DC tujuan</div>
                <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>
                  {inv.dc
                    ? <Ref mono={false} onClick={panelDc} title="Lihat ringkas DC">{[inv.dc.kode, inv.dc.nama].filter(Boolean).join(' - ')}</Ref>
                    : '—'}
                </div>
                {inv.dc?.alamat && (
                  <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>{inv.dc.alamat}</div>
                )}
              </div>

              <div style={{ minWidth: 220, flex: '0 1 280px' }}>
                <MetaRow label="No. Invoice" mono strong>{inv.invoice_no || '—'}</MetaRow>
                <MetaRow label="No. SP" mono>
                  {inv.sp_no
                    ? <Ref onClick={panelSp} title="Lihat ringkas SP">{inv.sp_no}</Ref>
                    : '—'}
                </MetaRow>
                <MetaRow label="Tanggal Invoice">{fmtDate(inv.invoice_date)}</MetaRow>
                <MetaRow label="Jatuh Tempo">
                  <span style={{ color: telat ? C.danger : C.ink, fontWeight: telat ? 700 : 500 }}>
                    {fmtDate(inv.due_date)}
                  </span>
                </MetaRow>
                {/* DUA baris, bukan satu. Digabung, "NOMOR - TANGGAL" membungkus
                    di kolom meta selebar 280px (lebar layar 1000px) dan labelnya
                    ikut melorot -- lihat komentar MetaRow di financeKit. Dipecah,
                    tiap nilai muat satu baris dan tiap label punya labelnya
                    sendiri. */}
                <MetaRow label="No. TTF" mono>
                  {wf.ttf?.no_ttf
                    ? <Ref onClick={panelTtf} title="Lihat ringkas TTF">{wf.ttf.no_ttf}</Ref>
                    : <span style={{ color: C.inkFaint, fontFamily: 'inherit' }}>
                        {wf.ttf?.tanggal_menerima ? '—' : 'Belum ada'}
                      </span>}
                </MetaRow>
                <MetaRow label="Tanggal TTF">
                  {wf.ttf?.tanggal_menerima
                    ? <Ref mono={false} onClick={panelTtf} title="Lihat ringkas TTF">{fmtDate(wf.ttf.tanggal_menerima)}</Ref>
                    : <span style={{ color: C.inkFaint }}>Belum ada</span>}
                </MetaRow>
              </div>
            </div>

            {/* Tab dokumen */}
            <TabBar style={{ margin: `${SP.s4}px 0 ${SP.s4}px` }}>
              <TabBtn active={tab === 'lines'} onClick={() => setTab('lines')} label="Baris Invoice" count={inv.lines.length}/>
              <TabBtn active={tab === 'other'} onClick={() => setTab('other')} label="Info Lain"/>
              <TabBtn active={tab === 'tax'}   onClick={() => setTab('tax')}   label="Pajak & Coretax"/>
              <TabBtn active={tab === 'docs'}  onClick={() => setTab('docs')}  label="Dokumen Terkait" count={docs.deliveries.length + docs.btb.length}/>
              <TabBtn active={tab === 'files'} onClick={() => setTab('files')} label="Lampiran & Catatan" count={ex.attachments.length + ex.notes.filter((n) => !n.deleted_at).length}/>
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
                      <Td>
                        <Ref mono={false} onClick={() => panelProduk(l)} title="Lihat ringkas baris">
                          {l.product_name || '(tanpa nama)'}
                        </Ref>
                      </Td>
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
                          style={{
                            display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap',
                            border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md,
                            padding: `${SP.s2}px ${SP.s3}px`, background: C.surface,
                          }}
                        >
                          <Truck size={14} style={{ color: C.accent, flexShrink: 0 }}/>
                          <span style={{ fontSize: 12.5 }}>
                            <Ref onClick={() => panelDelivery(d)} title="Lihat ringkas Surat Jalan">{d.do_no || '(tanpa nomor)'}</Ref>
                          </span>
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
                      {/* BTB belum punya halaman detail sendiri — panelnya sengaja
                          tanpa tombol "buka halaman penuh", bukan tombol mati. */}
                      {docs.btb.map((b) => (
                        <div key={b.id} style={{
                          display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap',
                          border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md,
                          padding: `${SP.s2}px ${SP.s3}px`, background: C.surface,
                        }}>
                          <FileText size={14} style={{ color: C.accent, flexShrink: 0 }}/>
                          <span style={{ fontSize: 12.5 }}>
                            <Ref onClick={() => panelBtb(b)} title="Lihat ringkas BTB">{b.btb_no || '(tanpa nomor)'}</Ref>
                          </span>
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

            {/* ── Tab: Info Lain ── */}
            {tab === 'other' && (
              <div className="nx-grid-2 nx-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: SP.s4 }}>
                <div>
                  <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Penjualan &amp; dokumen</div>
                  <MetaRow label="Salesperson">
                    {inv.salesperson_name || <span style={{ color: C.inkFaint }}>Belum dipetakan</span>}
                  </MetaRow>
                  <MetaRow label="Sales team">
                    {inv.sales_team || <span style={{ color: C.inkFaint }}>Belum dipetakan</span>}
                  </MetaRow>
                  <MetaRow label="Termin">
                    {inv.payment_term_days != null
                      ? <>{inv.payment_term_days} hari{inv.payment_term_label ? ` (${inv.payment_term_label})` : ''}</>
                      : <span style={{ color: C.inkFaint }}>-</span>}
                  </MetaRow>
                  <MetaRow label="Cetak untuk">{inv.print_to === 'agen' ? 'Agen' : 'Customer'}</MetaRow>
                  <MetaRow label="Reimbursement">
                    {inv.is_reimbursement ? 'Ya' : 'Tidak'}
                  </MetaRow>
                  {inv.is_reimbursement && (
                    <Hint>Penanda saja. Tidak mengubah perhitungan pajak.</Hint>
                  )}
                  <MetaRow label="Sumber">{inv.source_type === 'sp_storbit' ? 'SP Storbit' : inv.source_type}</MetaRow>
                  <MetaRow label="NPWP customer" mono>
                    {inv.customer_tax_id || <span style={{ color: C.inkFaint, fontFamily: 'inherit' }}>Belum diisi</span>}
                  </MetaRow>
                  <MetaRow label="Dibuat oleh">{inv.created_by_name || '—'}</MetaRow>
                </div>

                <div>
                  <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Jejak &amp; penggantian</div>
                  <MetaRow label="Terakhir dicetak">
                    {inv.printed_at
                      ? <span title={fmtDateTimeWIB(inv.printed_at)}>{fmtRelativeWIB(inv.printed_at)} ({inv.print_count}x)</span>
                      : <span style={{ color: C.inkFaint }}>Belum pernah dicetak</span>}
                  </MetaRow>
                  <MetaRow label="Kirim email">
                    {inv.emailed_at
                      ? <span title={fmtDateTimeWIB(inv.emailed_at)}>{fmtRelativeWIB(inv.emailed_at)}</span>
                      : <span style={{ color: C.inkFaint }}>Belum pernah dikirim</span>}
                  </MetaRow>
                  {!inv.emailed_at && (
                    <Hint>Pengiriman invoice lewat email belum tersedia.</Hint>
                  )}
                  <MetaRow label="Menggantikan">
                    {inv.replaces
                      ? <Ref onClick={() => onOpenInvoice?.(inv.replaces.id)} title="Buka invoice yang digantikan">{inv.replaces.invoice_no}</Ref>
                      : <span style={{ color: C.inkFaint }}>-</span>}
                  </MetaRow>
                  <MetaRow label="Digantikan oleh">
                    {inv.replaced_by
                      ? <Ref onClick={() => onOpenInvoice?.(inv.replaced_by.id)} title="Buka invoice pengganti">{inv.replaced_by.invoice_no}</Ref>
                      : <span style={{ color: C.inkFaint }}>-</span>}
                  </MetaRow>

                  <div style={{ ...kickerStyle, margin: `${SP.s4}px 0 ${SP.s2}px` }}>Terkunci sampai tahapnya</div>
                  <Terkunci label="Mata uang / kurs" alasan={TERKUNCI.currency}>
                    {inv.currency_code} / {Number(inv.fx_rate).toLocaleString('id-ID', { minimumFractionDigits: 6 })}
                  </Terkunci>
                  <Terkunci label="Pembulatan" alasan={TERKUNCI.rounding}>
                    {inv.rounding_method === 'none' ? 'Tidak ada' : inv.rounding_method}
                  </Terkunci>
                  <Terkunci label="DPP Nilai Lain (11/12)" alasan={TERKUNCI.dppnl}>
                    {inv.use_dpp_nilai_lain ? 'Ya' : 'Tidak'}
                  </Terkunci>
                </div>
              </div>
            )}

            {/* ── Tab: Pajak & Coretax ── */}
            {tab === 'tax' && (
              <div style={{ maxWidth: 520 }}>
                {ex.bolehIsiPajak ? (
                  <>
                    <FormGrid min={200}>
                      <ModalField label="No. Faktur Pajak">
                        {/* ⛔ SENGAJA TANPA validasi/contoh format. Format nomor di
                            Coretax belum dikonfirmasi Finance (09_ROADMAP.md,
                            Pertanyaan untuk Finance) — memasang pola sekarang
                            berarti menolak nomor yang sah. Placeholder-nya
                            netral, bukan contoh e-Faktur lama. */}
                        <ModalInp
                          value={ex.taxForm.fakturNo}
                          placeholder="Nomor faktur dari Coretax"
                          readOnly={!!inv.faktur_no && !ex.isSuperAdmin}
                          onChange={(e) => ex.setTaxForm((f) => ({ ...f, fakturNo: e.target.value }))}
                        />
                        {!!inv.faktur_no && !ex.isSuperAdmin && (
                          <span style={{ fontSize: 11, color: C.inkFaint }}>Sudah diisi. Hanya Super Admin yang bisa mengubahnya.</span>
                        )}
                      </ModalField>
                      <ModalField label="Kode Transaksi Coretax">
                        {/* Daftar tetap 01..10. Dropdown = kenyamanan; yang
                            menjaga tetap RPC set_invoice_tax_info (berkas 11). */}
                        <Sel
                          value={ex.taxForm.coretaxTxCode}
                          disabled={!!inv.coretax_tx_code && !ex.isSuperAdmin}
                          onChange={(e) => ex.setTaxForm((f) => ({ ...f, coretaxTxCode: e.target.value }))}
                        >
                          <option value="">— Pilih kode —</option>
                          {/* Nilai lama yang tidak ada di daftar tetap ditampilkan
                              apa adanya, supaya tidak hilang dari layar. */}
                          {ex.taxForm.coretaxTxCode
                            && !CORETAX_TX_CODES.some((k) => k.label === ex.taxForm.coretaxTxCode) && (
                            <option value={ex.taxForm.coretaxTxCode}>{ex.taxForm.coretaxTxCode}</option>
                          )}
                          {CORETAX_TX_CODES.map((k) => (
                            <option key={k.code} value={k.label}>{k.label}</option>
                          ))}
                        </Sel>
                        {!!inv.coretax_tx_code && !ex.isSuperAdmin && (
                          <span style={{ fontSize: 11, color: C.inkFaint }}>Sudah diisi. Hanya Super Admin yang bisa mengubahnya.</span>
                        )}
                      </ModalField>
                    </FormGrid>
                    <div style={{ marginTop: SP.s3 }}>
                      <Btn variant="primary" icon={Stamp} onClick={ex.simpanPajak} disabled={ex.taxSaving}>
                        {ex.taxSaving ? 'Menyimpan…' : 'Simpan Data Pajak'}
                      </Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <MetaRow label="No. Faktur Pajak" mono strong>
                      {inv.faktur_no || <span style={{ color: C.inkFaint, fontFamily: 'inherit' }}>Belum ada</span>}
                    </MetaRow>
                    <MetaRow label="Kode Transaksi Coretax" mono>
                      {inv.coretax_tx_code || <span style={{ color: C.inkFaint, fontFamily: 'inherit' }}>Belum ada</span>}
                    </MetaRow>
                    <div style={{ marginTop: SP.s2 }}>
                      <Notice tone="attn" icon={AlertTriangle}>{ALASAN_PAJAK}</Notice>
                    </div>
                  </>
                )}

                <div style={{ marginTop: SP.s4 }}>
                  <MetaRow label="DPP" mono>{rp(inv.total_dpp)}</MetaRow>
                  <MetaRow label={`PPN (${Math.round(PPN_RATE * 100)}%)`} mono>{rp(inv.total_ppn)}</MetaRow>
                  <MetaRow label="Bukti potong diterima">
                    {wf.payments.some((p) => p.bukti_potong_no || p.bukti_potong_url)
                      ? <Badge {...STATUS_TAG.paid}>Ada</Badge>
                      : <span style={{ color: C.inkFaint }}>Belum ada</span>}
                  </MetaRow>
                  <Terkunci label="DPP Nilai Lain (11/12)" alasan={TERKUNCI.dppnl}>
                    {inv.use_dpp_nilai_lain ? 'Ya' : 'Tidak'}
                  </Terkunci>
                </div>

                {/* Kedua tombol sengaja TAMPIL nonaktif, bukan disembunyikan:
                    jalurnya direncanakan, dan menyembunyikannya membuat orang
                    mencarinya berulang kali. */}
                <div style={{ marginTop: SP.s3, display: 'flex', gap: SP.s2, flexWrap: 'wrap' }}>
                  <Btn icon={Download} disabled title="Belum tersedia.">Unduh XLSX Coretax</Btn>
                  <Btn icon={Download} disabled title="Belum tersedia.">Unduh XML Coretax</Btn>
                </div>
                <div style={{ marginTop: SP.s2 }}>
                  <Notice tone="info" icon={Stamp}>
                    Unduh Coretax belum tersedia. Nomor Faktur Pajak sementara diisi dari aplikasi Coretax.
                  </Notice>
                </div>
              </div>
            )}

            {/* ── Tab: Lampiran & Catatan ── */}
            {tab === 'files' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SP.s2, marginBottom: SP.s2, flexWrap: 'wrap' }}>
                    <span style={{ ...kickerStyle, flex: 1 }}>Lampiran ({ex.attachments.length}/10)</span>
                    <input
                      ref={berkasRef} type="file" multiple hidden
                      accept={ex.mimeDiterima.join(',')}
                      onChange={(e) => { ex.unggah(e.target.files); e.target.value = ''; }}
                    />
                    <Btn
                      size="sm" icon={Upload} onClick={() => berkasRef.current?.click()}
                      disabled={!ex.bolehUnggah || ex.uploading || ex.attachments.length >= 10}
                      title={ex.bolehUnggah ? undefined : ALASAN_UNGGAH}
                    >
                      {ex.uploading ? 'Mengunggah…' : 'Unggah'}
                    </Btn>
                  </div>
                  <Hint>PDF, JPG, PNG, XLSX, atau XML. Maksimum 10 MB per berkas.</Hint>
                  {ex.attachments.length === 0 ? (
                    <div style={{ marginTop: SP.s2 }}>
                      <Empty icon={Paperclip} title="Belum ada lampiran" sub="Faktur pajak dan bukti potong diunggah di sini."/>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s1, marginTop: SP.s2 }}>
                      {ex.attachments.map((a) => (
                        <div key={a.id} style={{
                          display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap',
                          border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md,
                          padding: `${SP.s2}px ${SP.s3}px`, background: C.surface,
                        }}>
                          <Paperclip size={14} style={{ color: C.accent, flexShrink: 0 }}/>
                          <Ref mono={false} onClick={() => ex.bukaLampiran(a.storage_path)} title="Buka berkas">
                            {a.file_name}
                          </Ref>
                          <span style={{ fontSize: 12, color: C.inkSoft }}>
                            {(a.size_bytes / 1024).toLocaleString('id-ID', { maximumFractionDigits: 0 })} KB
                            {' · '}
                            <span title={fmtDateTimeWIB(a.uploaded_at)}>{fmtRelativeWIB(a.uploaded_at)}</span>
                            {a.pengunggah ? ` · ${a.pengunggah}` : ''}
                          </span>
                          <button
                            type="button" onClick={() => ex.hapusLampiran(a.id)} title="Hapus lampiran"
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.inkFaint, padding: 0 }}
                          >
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Catatan internal</div>
                  {/* Append-only DISENGAJA: jejak yang bisa ditulis ulang bukan
                      jejak. Alasannya di 20260928000009; di layar cukup akibatnya. */}
                  <Hint>Catatan tidak bisa diubah setelah dikirim. Kalau salah, kirim catatan baru.</Hint>
                  <div style={{ marginTop: SP.s2 }}>
                    <textarea
                      value={ex.noteDraft}
                      onChange={(e) => ex.setNoteDraft(e.target.value)}
                      placeholder="Tulis catatan untuk tim…"
                      rows={3}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: SP.s2,
                        border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface,
                        fontSize: 13, color: C.ink, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
                      }}
                    />
                    <div style={{ marginTop: SP.s2 }}>
                      <Btn
                        size="sm" variant="primary" icon={MessageSquare}
                        onClick={ex.kirimCatatan} disabled={ex.noteSaving || !ex.noteDraft.trim()}
                      >
                        {ex.noteSaving ? 'Menyimpan…' : 'Kirim Catatan'}
                      </Btn>
                    </div>
                  </div>
                  {ex.notes.length === 0 ? (
                    <div style={{ marginTop: SP.s3 }}>
                      <Hint>Belum ada catatan.</Hint>
                    </div>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: `${SP.s3}px 0 0`, padding: 0 }}>
                      {ex.notes.map((n) => (
                        <li key={n.id} style={{ display: 'flex', gap: SP.s2, padding: `${SP.s2}px 0`, borderBottom: `1px solid ${C.lineSoft}` }}>
                          <Avatar name={n.penulis || 'Tim'} size={28}/>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, color: C.inkFaint }} title={fmtDateTimeWIB(n.created_at)}>
                              {fmtRelativeWIB(n.created_at)}
                            </div>
                            <div style={{
                              fontSize: 13, color: n.deleted_at ? C.inkFaint : C.ink,
                              fontStyle: n.deleted_at ? 'italic' : 'normal',
                              lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                              {n.deleted_at ? 'Catatan dihapus.' : n.body}
                            </div>
                          </div>
                          {!n.deleted_at && (
                            <button
                              type="button" onClick={() => ex.hapusCatatan(n.id)} title="Hapus catatan"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkFaint, padding: 0, alignSelf: 'flex-start' }}
                            >
                              <Trash2 size={13}/>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
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
                            <Ref mono={false} onClick={() => panelBayar(pm)} title="Lihat ringkas pembayaran">
                              {pm.reference || fmtDate(pm.payment_date)}
                            </Ref>
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
                title={wf.canMarkTtf ? undefined : ALASAN_TTF}>
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
                      {ALASAN_TTF}
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
                    title={wf.canMarkTtf ? undefined : ALASAN_TTF}
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
              <Empty icon={FileText} title="Belum ada kejadian" sub="Riwayat terisi sendiri dari penerbitan, upload portal, TTF, cetak, dan pembayaran."/>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {events.map((ev) => <EventRow key={ev.key} ev={ev}/>)}
              </ul>
            )}
            {/* Lini masa disusun dari jejak yang SUDAH tersimpan (created_at,
                submitted_at, ar_ttfs, sp_payments, printed_at/emailed_at) plus
                catatan internal dari `invoice_notes`. Beberapa kejadian tidak
                punya pelaku karena kolomnya memang tidak ada. */}
            <p style={{ ...thStyle, padding: `${SP.s2}px 0 0`, letterSpacing: '.06em' }}>
              Disusun dari jejak yang sudah tersimpan
            </p>
            <div style={{ marginTop: SP.s2 }}>
              <Btn size="sm" variant="ghost" icon={MessageSquare} onClick={() => setTab('files')}>
                Tulis catatan
              </Btn>
            </div>
          </Panel>
        </aside>
      </div>

      {/* Panel samping rujukan (Contextual Master Data Access). Dirender di
          akar halaman, bukan di dalam kartu: ia `position: fixed`, dan menaruh
          elemen fixed di dalam kartu ber-`box-shadow` membuatnya ikut terpotong
          kalau kelak ada induk ber-`transform`. */}
      <QuickPanel
        open={!!panel} onClose={() => setPanel(null)}
        kicker={panel?.kicker} title={panel?.title || ''}
        rows={panel?.rows || []} extra={panel?.extra}
        onOpenFull={panel?.onOpenFull} fullLabel={panel?.fullLabel}
      />
    </div>
  );
}

// src/modules/finance/TtfDetailPage.jsx
// Finance > Accounts Receivable > Invoice Submission & Acknowledgement (6.2.2)
// > Detail TTF.
//
// Satu halaman per GRUP TTF (lihat ttfGrouping.js) -- baris tab "Daftar TTF"
// di TtfSubmissionPage.jsx kini murni daftar yang diklik, bukan expand/
// collapse (keputusan Den): rincian per grup pindah ke sini supaya punya
// alamat sendiri -- refresh-safe, bisa ditautkan -- pola yang sama dengan
// Daftar Invoice -> Detail Invoice.
//
// Kunci URL = kunci pengelompokan internal (`ttfGrouping.js`: no_ttf
// di-trim+lowercase, atau sentinel KUNCI_TANPA_NOMOR) -- di-encodeURIComponent
// saat dipasang ke path oleh finance.routes.jsx (pola yang sama dengan
// invoicePath/spDetailPath di file itu), lalu dibaca balik sudah ter-decode
// oleh useParams(). Satu sumber kebenaran "kunci" -- nol field encoding
// terpisah yang bisa diam-diam melenceng dari logika pengelompokan.
//
// BACA-SAJA: nol aksi di sini. Mencatat/mengoreksi TTF tetap di Detail
// Invoice (useInvoiceWorkflow.js), satu-per-satu.
//
// Keluarga token: ungu/serif Storbit (lihat catatan di financeKit.jsx).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { listSpBtbNew } from '../../lib/db';
import { STATUS_LABEL_SHORT, STATUS_TAG } from './invoiceStatus.js';
import useDaftarTtf from './ttfGrouping.js';
import {
  PageHead, Btn, Crumbs, Panel, MetaRow, TableShell, Td, Empty,
} from './financeKit.jsx';
import { C, FONT_DISPLAY, SP, rp, fmtDate } from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

const LABEL_SUBMISSION = 'Invoice Submission & Acknowledgement';

/** Rentang tanggal (atau satu tanggal, atau '—') dari daftar tanggal ISO --
 *  dipakai Tanggal TTF (grup) dan Tanggal Diterima Nexus (ringkasan). Sengaja
 *  TIDAK memilih salah satu diam-diam kalau nilainya berbeda dalam satu grup. */
function rentangTanggalDari(list) {
  const terisi = [...new Set(list.filter(Boolean))].sort();
  if (terisi.length === 0) return '—';
  if (terisi.length === 1) return fmtDate(terisi[0]);
  return `${fmtDate(terisi[0])} – ${fmtDate(terisi[terisi.length - 1])}`;
}

/** Satu nilai teks (atau 'Beragam', atau '—') dari daftar nilai per invoice --
 *  dipakai Diterima Oleh: tiap invoice dalam grup punya baris ar_ttfs sendiri,
 *  jadi nilainya BISA berbeda walau satu dokumen fisik yang sama. */
function nilaiTunggalDari(list) {
  const terisi = [...new Set(list.map((v) => (v || '').trim()).filter(Boolean))];
  if (terisi.length === 0) return '—';
  if (terisi.length === 1) return terisi[0];
  return 'Beragam';
}

export default function TtfDetailPage({ kunci, onBack, onOpenInvoice }) {
  const { daftarTtf, loading, error } = useDaftarTtf();

  // Kunci datang dari URL -- sudah ter-decode oleh useParams() di route
  // wrapper, tapi dinormalkan sekali lagi (lowercase) supaya URL yang
  // di-bookmark/dibagikan dengan kapitalisasi berbeda tetap menemukan grupnya
  // (kunci internal SELALU lowercase, lihat ttfGrouping.js).
  const kunciNormal = (kunci || '').toLowerCase();
  const grup = useMemo(() => daftarTtf.find((g) => g.kunci === kunciNormal), [daftarTtf, kunciNormal]);

  // No. BTB per SP dalam grup ini -- dimuat saat halaman dibuka (nol expand/
  // collapse lagi, jadi nol alasan menunda fetch-nya).
  const [btbBySpOrderId, setBtbBySpOrderId] = useState({});
  useEffect(() => {
    if (!grup) return undefined;
    let batal = false;
    const idSp = [...new Set(grup.invoices.map((inv) => inv.sp_order_id).filter(Boolean))];
    if (idSp.length === 0) return undefined;
    Promise.all(idSp.map((id) => listSpBtbNew(id).then(({ data }) => [id, data || []])))
      .then((hasil) => {
        if (batal) return;
        setBtbBySpOrderId(Object.fromEntries(hasil));
      });
    return () => { batal = true; };
  }, [grup]);

  const ringkasan = useMemo(() => {
    if (!grup) return null;
    return {
      tanggalTtf: rentangTanggalDari([grup.tanggalMin, grup.tanggalMax]),
      diterimaOleh: nilaiTunggalDari(grup.invoices.map((inv) => inv.ttf.diterima_oleh)),
      tanggalMenerima: rentangTanggalDari(grup.invoices.map((inv) => inv.ttf.tanggal_menerima)),
    };
  }, [grup]);

  const judul = grup ? (grup.noTtf || 'Tanpa Nomor TTF') : null;

  const remah = (label) => [
    { label: 'Finance & Accounting' },
    { label: 'Accounts Receivable' },
    { label: LABEL_SUBMISSION, onClick: onBack },
    { label },
  ];

  if (loading) {
    return (
      <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
        <Crumbs items={remah('Memuat…')}/>
        <p style={{ fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat…</p>
      </div>
    );
  }

  if (error || !grup) {
    // Sengaja MEMBEDAKAN "gagal baca" dari "tidak ada" -- pola yang sama
    // dengan InvoiceDetailPage.jsx: dua masalah itu butuh tindakan berbeda.
    return (
      <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
        <Crumbs items={remah('Tidak ditemukan')}/>
        <Empty
          icon={AlertTriangle}
          title={error ? 'TTF gagal dimuat' : 'TTF tidak ditemukan'}
          sub={error
            ? (error.message || 'penyebab tidak diketahui')
            : 'Nomor TTF ini tidak ada dalam Daftar TTF -- cek lagi tautannya, atau kembali ke daftar.'}
        />
        <div><Btn variant="ghost" onClick={onBack}>Kembali ke Daftar TTF</Btn></div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <Crumbs items={remah(judul)}/>

      <PageHead
        kicker="Accounts Receivable"
        title={judul}
        sub="Rincian invoice yang tercakup dalam satu dokumen TTF."
        right={<Btn variant="ghost" onClick={onBack}>Kembali ke Daftar TTF</Btn>}
      />

      <Panel title="Ringkasan">
        <div style={{ maxWidth: 420 }}>
          <MetaRow label="No. TTF" mono={!!grup.noTtf}>{grup.noTtf || 'Tanpa nomor TTF'}</MetaRow>
          <MetaRow label="Tanggal TTF">{ringkasan.tanggalTtf}</MetaRow>
          <MetaRow label="Customer">
            {grup.customerLabel === 'Multi-customer'
              ? <span style={{ fontStyle: 'italic' }}>{grup.customerLabel}</span>
              : grup.customerLabel}
          </MetaRow>
          <MetaRow label="Jumlah Invoice" mono>{grup.invoices.length}</MetaRow>
          <MetaRow label="Total Nilai Invoice" mono strong>{rp(grup.totalNilai)}</MetaRow>
          <MetaRow label="Diterima Oleh">{ringkasan.diterimaOleh}</MetaRow>
          <MetaRow label="Tanggal Diterima Nexus">{ringkasan.tanggalMenerima}</MetaRow>
        </div>
      </Panel>

      <Panel title="Invoice dalam TTF ini">
        <TableShell
          minWidth={900}
          head={[
            ['No. Invoice'], ['No. SP'], ['No. BTB'], ['Tanggal Invoice'],
            ['Total', 'right'], ['Jatuh Tempo'], ['Status'],
          ]}
        >
          {grup.invoices.map((inv) => {
            const btb = inv.sp_order_id ? btbBySpOrderId[inv.sp_order_id] : null;
            return (
              <tr
                key={inv.id} onClick={() => onOpenInvoice?.(inv.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenInvoice?.(inv.id); } }}
                tabIndex={0} role="button" title="Buka detail invoice"
                style={{ cursor: 'pointer' }}
              >
                <Td mono nowrap style={{ color: C.accent, fontWeight: 600 }}>{inv.invoice_no || '—'}</Td>
                <Td mono nowrap style={{ color: C.inkSoft }}>{inv.sp_orders?.sp_no || '—'}</Td>
                <Td mono nowrap>
                  {btb === null || btb === undefined ? '…' : (btb.length === 0 ? '—' : btb.map((b) => b.btb_no).join(', '))}
                </Td>
                <Td nowrap>{fmtDate(inv.invoice_date)}</Td>
                <Td align="right" mono>{rp(inv.total_amount)}</Td>
                <Td nowrap>{inv.due_date ? fmtDate(inv.due_date) : 'Belum jatuh tempo'}</Td>
                <Td nowrap>
                  <Badge {...(STATUS_TAG[inv.status] || STATUS_TAG.issued)}>{STATUS_LABEL_SHORT[inv.status] || inv.status}</Badge>
                </Td>
              </tr>
            );
          })}
        </TableShell>
      </Panel>
    </div>
  );
}

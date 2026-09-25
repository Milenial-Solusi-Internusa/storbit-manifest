// src/modules/finance/ReadyToInvoicePage.jsx
// Finance > Accounts Receivable > Invoice Management > Siap Ditagih (6.2.1).
//
// DUA kelompok, satu sumber aturan:
//   (a) SP yang lolos SELURUH guard create_invoice_for_sp -> tombol terbitkan
//   (b) SP yang TERTAHAN, beserta alasannya per SP
//
// ⭐ Alasannya TIDAK dihitung di sini. RPC sp_invoice_readiness_all memanggil
// sp_invoice_readiness, fungsi yang SAMA dengan yang dipakai guard di DB untuk
// menolak (AR Tahap 2, keputusan Den K-2). Jadi halaman ini tidak bisa
// "berpendapat lain" dari DB: kalau teksnya berubah, keduanya berubah bersama.
// ⛔ Jangan menambahkan aturan siap/tertahan di berkas ini.
//
// Tampilannya diselaraskan dengan Daftar & Detail Invoice (strip ringkas, panel
// berbingkai, tabel bersama) — isi dan logikanya TIDAK berubah.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Receipt, AlertTriangle, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { getInvoiceReadinessAll, createInvoiceRpc } from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { canIssueInvoice } from '../../lib/roles';
import {
  PageHead, Btn, StatCard, Panel, TableShell, Td, Notice, Hint, Empty,
} from './financeKit.jsx';
import {
  C, FONT_DISPLAY, SP, fmtDate,
} from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';
import { STATUS_TAG } from './invoiceStatus.js';

// Label pendek per kode alasan, untuk kolom sempit. Teks PANJANGNYA tetap
// datang dari DB (alasan_teks) dan ditampilkan apa adanya di bawahnya — yang di
// sini cuma ringkasannya supaya tabel bisa dibaca sekilas.
const ALASAN_RINGKAS = {
  BELUM_ADA_BTB:        'BTB belum ada',
  SJ_BELUM_SELESAI:     'Surat Jalan belum selesai',
  SJ_TANPA_TANGGAL_TTD: 'Tanggal tanda tangan kosong',
  BELUM_TERKIRIM_PENUH: 'Belum terkirim penuh',
  SUDAH_ADA_INVOICE:    'Sudah ada invoice aktif',
  SP_TIDAK_DITEMUKAN:   'SP tidak ditemukan',
};

export default function ReadyToInvoicePage({ showToast, onOpenSp }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busyId,  setBusyId]  = useState(null);

  // activeCompanyId, BUKAN profile.company_id: yang menentukan "entitas yang
  // sedang saya pakai" adalah CompanySwitcher, bukan home company. Pola sama
  // dengan CRMDashboardPage/StorbitDashboardPage.
  // ⚠️ Tanpa penyaring ini RPC-nya dipanggil dengan NULL = SELURUH entitas, dan
  // user ber-role di dua entitas melihat data entitas lain walau switcher-nya
  // menunjuk yang satu. Tidak terlihat selama data cuma ada di satu entitas.
  const { erpRoles, activeCompanyId } = useAuth();
  const bolehTerbit = canIssueInvoice(erpRoles);

  // Muat pertama SENGAJA tidak memanggil `muat()`: effect yang memanggil fungsi
  // ber-setLoading(true) di prefiks sinkronnya memicu cascading render (aturan
  // react-hooks/set-state-in-effect). Bentuk ini men-set state hanya di dalam
  // callback promise, jadi tak ada setState sinkron di dalam effect.
  useEffect(() => {
    let batal = false;
    getInvoiceReadinessAll(activeCompanyId).then(({ data, error: err }) => {
      if (batal) return;
      setRows(data || []);
      setError(err || null);
      setLoading(false);
    });
    return () => { batal = true; };
  }, [activeCompanyId]);

  // Muat ulang MANUAL (tombol, dan sesudah invoice terbit) — bukan effect, jadi
  // boleh menyalakan indikator memuat lebih dulu.
  const muat = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getInvoiceReadinessAll(activeCompanyId);
    setRows(data || []);
    setError(err || null);
    setLoading(false);
  }, [activeCompanyId]);

  const siap     = useMemo(() => rows.filter(r => r.siap),  [rows]);
  const tertahan = useMemo(() => rows.filter(r => !r.siap), [rows]);

  // Sebaran alasan tertahan — satu baris ringkas supaya jelas apa yang
  // sebenarnya menahan penagihan (hari ini: sebagian besar "BTB belum ada",
  // yaitu pekerjaan gudang, bukan pekerjaan Finance).
  const sebaran = useMemo(() => {
    const map = {};
    tertahan.forEach((r) => { map[r.alasan_kode] = (map[r.alasan_kode] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [tertahan]);

  const terbitkan = async (row) => {
    if (busyId) return;
    setBusyId(row.sp_order_id);
    const { error: err } = await createInvoiceRpc(row.sp_order_id);
    setBusyId(null);
    if (err) {
      // Pesan RAISE dari DB diteruskan APA ADANYA — ia sudah menyebut alasan
      // bisnisnya, dan membungkusnya dengan pesan generik justru menghapus
      // satu-satunya keterangan yang berguna.
      showToast?.(err.message || 'Gagal menerbitkan invoice', 'error');
      await muat();
      return;
    }
    showToast?.(`Invoice untuk SP ${row.sp_no} diterbitkan`, 'success');
    await muat();
  };

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <PageHead
        kicker="Accounts Receivable"
        title="Siap Ditagih"
        sub="SP yang sudah terkirim penuh dan belum punya invoice aktif."
        right={<Btn icon={RefreshCw} onClick={muat} disabled={loading}>{loading ? 'Memuat…' : 'Muat Ulang'}</Btn>}
      />

      {error && (
        <Notice tone="danger" icon={AlertTriangle}>
          Daftar gagal dimuat: {error.message || 'penyebab tidak diketahui'}
        </Notice>
      )}

      {/* Tombolnya tetap TAMPIL nonaktif (aturan K-6) supaya jelas jalurnya ada
          dan siapa yang bisa memakainya. */}
      {!bolehTerbit && (
        <Notice tone="attn" icon={AlertTriangle}>
          Hanya Finance Controller, manager ke atas, atau Super Admin yang bisa menerbitkan invoice.
        </Notice>
      )}

      {/* ── Strip ringkas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: SP.s3 }}>
        <StatCard label="Siap ditagih" value={siap.length} sub="siap diterbitkan sekarang" tone={C.accentDeep}/>
        <StatCard label="Tertahan" value={tertahan.length} sub="menunggu dokumen atau pengiriman" tone={tertahan.length > 0 ? C.attn : undefined}/>
        <StatCard
          label="Penahan terbanyak"
          text
          value={sebaran[0] ? (ALASAN_RINGKAS[sebaran[0][0]] || sebaran[0][0]) : '—'}
          sub={sebaran[0] ? `${sebaran[0][1]} SP` : 'tidak ada yang tertahan'}
        />
      </div>

      {/* ── Kelompok A: siap ── */}
      <Panel
        title="Siap Ditagih" icon={CheckCircle2}
        right={<Badge {...STATUS_TAG.paid}>{siap.length}</Badge>}
      >
        {loading ? (
          <Hint>Memuat…</Hint>
        ) : siap.length === 0 ? (
          <Empty icon={Receipt} title="Tidak ada SP yang siap ditagih saat ini" sub="Begitu Surat Jalan tuntas dan BTB terbit, SP-nya muncul di sini."/>
        ) : (
          <TableShell
            minWidth={620}
            head={[['No. SP'], ['Tanggal SP'], ['Surat Jalan', 'right'], ['BTB', 'right'], ['', 'right']]}
          >
            {siap.map((r) => (
              <tr key={r.sp_order_id}>
                <Td mono nowrap>
                  {onOpenSp ? (
                    <button
                      type="button" onClick={() => onOpenSp(r.customer_id, r.sp_no)}
                      style={{ background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {r.sp_no} <ExternalLink size={12}/>
                    </button>
                  ) : r.sp_no}
                </Td>
                <Td nowrap>{fmtDate(r.sp_date)}</Td>
                <Td align="right" mono>{r.n_sj}</Td>
                <Td align="right" mono>{r.n_btb}</Td>
                <Td align="right">
                  <Btn
                    size="sm" variant="primary" icon={Receipt}
                    onClick={() => terbitkan(r)}
                    disabled={!bolehTerbit || !!busyId}
                    title={bolehTerbit ? undefined : 'Server menolak peran kamu untuk menerbitkan invoice'}
                  >
                    {busyId === r.sp_order_id ? 'Menerbitkan…' : 'Terbitkan Invoice'}
                  </Btn>
                </Td>
              </tr>
            ))}
          </TableShell>
        )}
      </Panel>

      {/* ── Kelompok B: tertahan, beserta ALASANNYA ── */}
      <Panel
        title="Tertahan" icon={Clock}
        right={<Badge {...STATUS_TAG.partial}>{tertahan.length}</Badge>}
      >
        {loading ? (
          <Hint>Memuat…</Hint>
        ) : tertahan.length === 0 ? (
          <Empty icon={CheckCircle2} title="Tidak ada SP yang tertahan" sub="Semua SP terkirim penuh sudah punya invoice atau siap diterbitkan."/>
        ) : (
          <TableShell
            minWidth={680}
            head={[['No. SP'], ['Tanggal SP'], ['Alasan'], ['SJ', 'right'], ['BTB', 'right']]}
          >
            {tertahan.map((r) => (
              <tr key={r.sp_order_id}>
                <Td mono nowrap top>
                  {onOpenSp ? (
                    <button
                      type="button" onClick={() => onOpenSp(r.customer_id, r.sp_no)}
                      style={{ background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {r.sp_no} <ExternalLink size={12}/>
                    </button>
                  ) : r.sp_no}
                </Td>
                <Td nowrap top>{fmtDate(r.sp_date)}</Td>
                <Td top>
                  <Badge {...STATUS_TAG.draft}>{ALASAN_RINGKAS[r.alasan_kode] || r.alasan_kode}</Badge>
                  {/* Teks panjangnya datang dari DB apa adanya — inilah pesan
                      yang akan dilempar server kalau tombolnya dipaksa. */}
                  <p style={{ margin: `${SP.s1}px 0 0`, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45 }}>
                    {r.alasan_teks}
                  </p>
                </Td>
                <Td align="right" mono top>{r.n_sj}</Td>
                <Td align="right" mono top>{r.n_btb}</Td>
              </tr>
            ))}
          </TableShell>
        )}
      </Panel>

      {/* Nilainya baru pasti saat terbit -- dihitung per Surat Jalan yang sudah
          ditandatangani (create_invoice_for_sp). */}
      <Hint>Nilai invoice baru muncul setelah invoice terbit.</Hint>
    </div>
  );
}

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
import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Receipt, AlertTriangle, ExternalLink } from 'lucide-react';
import { getInvoiceReadinessAll, createInvoiceRpc } from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { canIssueInvoice } from '../../lib/roles';
import {
  C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, kickerStyle, cardTitleStyle, thStyle,
  TAG_PALE, TAG_ATTN, TAG_NEUTRAL, fmtDate,
} from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

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
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...kickerStyle }}>Accounts Receivable</div>
          <h2 style={{ ...cardTitleStyle, fontSize: 22, margin: '2px 0 0' }}>Siap Ditagih</h2>
          <p style={{ margin: `${SP.s1}px 0 0`, fontSize: 13, color: C.inkSoft }}>
            SP yang sudah terkirim penuh dan belum punya invoice aktif. Alasan tertahan dihitung
            dari aturan yang sama dengan yang menolak di server.
          </p>
        </div>
        <button
          onClick={muat}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${loading ? C.line : C.accent}`, background: 'transparent', color: loading ? C.inkFaint : C.accent, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT_DISPLAY }}
        >
          <RefreshCw size={14}/> {loading ? 'Memuat…' : 'Muat Ulang'}
        </button>
      </div>

      {error && (
        <div style={{ border: `1px solid ${C.dangerBd}`, background: C.dangerBg, color: C.danger, borderRadius: RADIUS.md, padding: SP.s3, fontSize: 13 }}>
          <AlertTriangle size={14} style={{ verticalAlign: '-2px' }}/> Gagal memuat daftar: {error.message || 'unknown error'}
        </div>
      )}

      {!bolehTerbit && (
        <div style={{ border: `1px solid ${C.attnBd}`, background: C.attnBg, color: C.attn, borderRadius: RADIUS.md, padding: SP.s3, fontSize: 13, lineHeight: 1.5 }}>
          Peran kamu boleh MELIHAT halaman ini tapi belum boleh menerbitkan invoice —
          server hanya menerima <b>Finance Controller</b>, <b>manager ke atas</b>, atau <b>Super Admin</b>.
          Tombolnya tetap ditampilkan (nonaktif) supaya jelas jalurnya ada dan siapa yang bisa memakainya.
        </div>
      )}

      {/* ── Kelompok A: siap ────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
        <div style={{ padding: `${SP.s3}px ${SP.s3}px 0`, display: 'flex', alignItems: 'center', gap: SP.s2 }}>
          <span style={{ ...kickerStyle }}>Siap Ditagih</span>
          <Badge {...TAG_PALE}>{siap.length}</Badge>
        </div>
        {loading ? (
          <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat…</p>
        ) : siap.length === 0 ? (
          <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>
            Tidak ada SP yang siap ditagih saat ini.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', padding: `${SP.s2}px ${SP.s3}px ${SP.s3}px` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {[['No. SP','left'],['Tanggal SP','left'],['Surat Jalan','right'],['BTB','right'],['','right']].map(([h,al],ix) => (
                    <th key={h || ix} style={{ ...thStyle, textAlign: al, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {siap.map(r => (
                  <tr key={r.sp_order_id}>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>
                      {onOpenSp ? (
                        <button onClick={() => onOpenSp(r.customer_id, r.sp_no)}
                          style={{ background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {r.sp_no} <ExternalLink size={12}/>
                        </button>
                      ) : r.sp_no}
                    </td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>{fmtDate(r.sp_date)}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO }}>{r.n_sj}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO }}>{r.n_btb}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right' }}>
                      <button
                        onClick={() => terbitkan(r)}
                        disabled={!bolehTerbit || !!busyId}
                        title={bolehTerbit ? undefined : 'Server menolak peran kamu untuk menerbitkan invoice'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: RADIUS.md, border: `1px solid ${(bolehTerbit && !busyId) ? C.accent : C.line}`, background: 'transparent', color: (bolehTerbit && !busyId) ? C.accent : C.inkFaint, fontSize: 13, fontWeight: 600, cursor: (bolehTerbit && !busyId) ? 'pointer' : 'not-allowed', fontFamily: FONT_DISPLAY, whiteSpace: 'nowrap' }}
                      >
                        <Receipt size={13}/> {busyId === r.sp_order_id ? 'Menerbitkan…' : 'Terbitkan Invoice'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Kelompok B: tertahan, beserta ALASANNYA ─────────────────────── */}
      <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
        <div style={{ padding: `${SP.s3}px ${SP.s3}px 0`, display: 'flex', alignItems: 'center', gap: SP.s2 }}>
          <span style={{ ...kickerStyle }}>Tertahan</span>
          <Badge {...TAG_ATTN}>{tertahan.length}</Badge>
        </div>
        {loading ? (
          <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat…</p>
        ) : tertahan.length === 0 ? (
          <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>
            Tidak ada SP yang tertahan.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', padding: `${SP.s2}px ${SP.s3}px ${SP.s3}px` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {[['No. SP','left'],['Tanggal SP','left'],['Alasan','left'],['SJ','right'],['BTB','right']].map(([h,al]) => (
                    <th key={h} style={{ ...thStyle, textAlign: al, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tertahan.map(r => (
                  <tr key={r.sp_order_id}>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, fontFamily: FONT_MONO, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      {onOpenSp ? (
                        <button onClick={() => onOpenSp(r.customer_id, r.sp_no)}
                          style={{ background: 'none', border: 'none', padding: 0, color: C.accent, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {r.sp_no} <ExternalLink size={12}/>
                        </button>
                      ) : r.sp_no}
                    </td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{fmtDate(r.sp_date)}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: 'top' }}>
                      <Badge {...TAG_NEUTRAL}>{ALASAN_RINGKAS[r.alasan_kode] || r.alasan_kode}</Badge>
                      {/* Teks panjangnya datang dari DB apa adanya — inilah pesan
                          yang akan dilempar server kalau tombolnya dipaksa. */}
                      <p style={{ margin: `${SP.s1}px 0 0`, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45 }}>
                        {r.alasan_teks}
                      </p>
                    </td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO, verticalAlign: 'top' }}>{r.n_sj}</td>
                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO, verticalAlign: 'top' }}>{r.n_btb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: C.inkFaint, lineHeight: 1.5 }}>
        Nilai invoice belum ditampilkan di halaman ini: angkanya baru pasti saat invoice terbit
        (dihitung per Surat Jalan yang sudah ditandatangani).
      </p>
    </div>
  );
}

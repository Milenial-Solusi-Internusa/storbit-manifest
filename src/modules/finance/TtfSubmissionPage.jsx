// src/modules/finance/TtfSubmissionPage.jsx
// Finance > Accounts Receivable > Invoice Submission & Acknowledgement (6.2.2).
//
// DUA TAB:
//   1. "Belum TTF" -- Impor Massal TTF dari spreadsheet + daftar kerja invoice
//      terbuka yang belum punya tanggal jatuh tempo karena TTF-nya belum
//      tercatat (lihat invoiceStatus.js:dueDateText -- "Belum TTF" BUKAN
//      status invoice, ia kondisi `due_date IS NULL` pada invoice terbuka).
//   2. "Daftar TTF" -- invoice yang SUDAH punya catatan TTF (baris ar_ttfs),
//      TERMASUK invoice lunas, dikelompokkan per nomor TTF. Satu nomor TTF
//      fisik bisa menanungi banyak invoice/customer (lihat KONTEKS PLAN:
//      dokumen TTF Indomarco nyata) -- pengelompokan dilakukan DI TAMPILAN
//      (client-side, kunci = no_ttf di-trim+lowercase), BUKAN di struktur DB:
//      `ar_ttfs` hari ini satu baris per invoice, nol relasi ke `sp_btb`. Yang
//      TIDAK bisa ditampilkan tanpa perubahan struktur: nilai TTF/PPh PER BTB
//      dan nomor faktur pajak per BTB (lihat roadmap TASK 4, dicatat doc-keeper
//      terpisah) -- No. BTB di sini murni daftar nomor BTB milik SP invoice
//      itu (`sp_btb`), bukan pecahan nilai per BTB.
//
// Tab 1 SENGAJA baca-saja: tiap baris menaut ke Detail Invoice, tempat form
// "Catat TTF" satu-per-satu sudah ada (useInvoiceWorkflow.js). Formnya TIDAK
// diduplikasi di sini.
//
// Impor massal memanggil markTtfReceived() (db.js) satu per baris -- RPC yang
// SAMA dengan pencatatan manual -- supaya jatuh tempo, "isi sekali" tanggal
// diterima, dan audit KOREKSI_TTF ikut terhitung persis seperti jalur manual.
// TIDAK ada RPC baru, TIDAK ada tulis langsung ke tabel (keputusan Den).
// Pencocokan impor HANYA No. Invoice (belum No. BTB) -- evaluasi itu ditunda
// sesudah 15 Oktober, lihat PLAN.
//
// Keluarga token: ungu/serif Storbit (lihat catatan di financeKit.jsx).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Download, FileSpreadsheet,
  Search, Stamp, Upload, X,
} from 'lucide-react';
import { listInvoices, getTtfStatusByInvoices, listSpBtbNew, markTtfReceived } from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { canImportTtf } from '../../lib/roles';
import { getTodayWIB } from '../../lib/dateUtils';
import { OPEN_STATUSES, STATUS_LABEL, STATUS_LABEL_SHORT, STATUS_TAG } from './invoiceStatus.js';
import {
  downloadTtfImportTemplate, parseTtfImportFile, categorizeImportRows, KATEGORI, KATEGORI_LABEL,
} from './ttfImport.js';
import {
  PageHead, Btn, Panel, TabBar, TabBtn, TableShell, Td, Notice, Hint, Empty,
} from './financeKit.jsx';
import { C, FONT_DISPLAY, RADIUS, SP, rp, fmtDate } from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

const KATEGORI_TAG = {
  [KATEGORI.COCOK_BARU]:      { bg: C.accentSoft, color: C.accentDeep, bd: C.accentBd },
  [KATEGORI.TTF_BEDA]:        { bg: C.attnBg,     color: C.attn,       bd: C.attnBd   },
  [KATEGORI.TTF_IDENTIK]:     { bg: C.neutralBg,  color: C.neutral,    bd: C.neutralBd },
  [KATEGORI.TIDAK_COCOK]:     { bg: C.dangerBg,   color: C.danger,     bd: C.dangerBd },
  [KATEGORI.STATUS_TERTUTUP]: { bg: C.dangerBg,   color: C.danger,     bd: C.dangerBd },
  [KATEGORI.TIDAK_VALID]:     { bg: C.dangerBg,   color: C.danger,     bd: C.dangerBd },
};

const ALASAN_IMPOR = 'Hanya Finance, Finance Controller, atau Super Admin yang bisa memproses impor TTF massal.';

// Sentinel kunci grup untuk invoice ber-TTF TANPA nomor TTF (no_ttf kosong) --
// JANGAN dibuang dari Daftar TTF, dikumpulkan sebagai satu grup tersendiri.
const KUNCI_TANPA_NOMOR = '__tanpa_nomor__';

/** Baris pendek perbedaan lama -> baru, HANYA untuk kategori "sudah TTF beda". */
function diffBaris(row) {
  if (row.kategori !== KATEGORI.TTF_BEDA || !row.existing) return [];
  const out = [];
  if (String(row.existing.tanggal_ttf || '') !== row.tanggalTtf) {
    out.push(`Tanggal TTF: ${fmtDate(row.existing.tanggal_ttf)} → ${fmtDate(row.tanggalTtf)}`);
  }
  if ((row.existing.no_ttf || '').trim() !== (row.noTtf || '').trim()) {
    out.push(`No. TTF: ${row.existing.no_ttf || '—'} → ${row.noTtf || '—'}`);
  }
  if ((row.existing.diterima_oleh || '').trim() !== (row.diterimaOleh || '').trim()) {
    out.push(`Diterima Oleh: ${row.existing.diterima_oleh || '—'} → ${row.diterimaOleh || '—'}`);
  }
  return out;
}

/** Kelompokkan invoice ber-TTF per nomor TTF (trim + lowercase sebagai kunci;
 *  teks aslinya yang ditampilkan). Tanggal TTF yang berbeda dalam satu grup
 *  ditampilkan sebagai RENTANG, bukan dipilih salah satu diam-diam. */
function kelompokkanDaftarTtf(invoices, ttfByInvoiceId) {
  const grup = new Map();
  invoices.forEach((inv) => {
    const ttf = ttfByInvoiceId[inv.id];
    if (!ttf) return; // nol catatan TTF -- bukan bagian Daftar TTF (ada di tab Belum TTF, atau invoice tertutup tanpa TTF)
    const noTtfAsli = (ttf.no_ttf || '').trim();
    const kunci = noTtfAsli ? noTtfAsli.toLowerCase() : KUNCI_TANPA_NOMOR;
    if (!grup.has(kunci)) {
      grup.set(kunci, {
        kunci, noTtf: noTtfAsli || null, tanggalMin: null, tanggalMax: null,
        customerMap: new Map(), invoices: [],
      });
    }
    const g = grup.get(kunci);
    g.invoices.push({ ...inv, ttf });
    if (ttf.tanggal_ttf) {
      if (!g.tanggalMin || ttf.tanggal_ttf < g.tanggalMin) g.tanggalMin = ttf.tanggal_ttf;
      if (!g.tanggalMax || ttf.tanggal_ttf > g.tanggalMax) g.tanggalMax = ttf.tanggal_ttf;
    }
    const custId = inv.sp_orders?.customer_id || '__tanpa_customer__';
    if (!g.customerMap.has(custId)) g.customerMap.set(custId, inv.sp_orders?.accounts?.name || '—');
  });
  return [...grup.values()].map((g) => ({
    ...g,
    totalNilai: g.invoices.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
    customerLabel: g.customerMap.size > 1 ? 'Multi-customer' : ([...g.customerMap.values()][0] || '—'),
  })).sort((a, b) => (b.tanggalMax || '').localeCompare(a.tanggalMax || ''));
}

export default function TtfSubmissionPage({ onOpenInvoice, showToast }) {
  const { erpRoles } = useAuth();
  const bolehImpor = canImportTtf(erpRoles);

  const [tab, setTab] = useState('belum-ttf');

  // ── Daftar invoice (dipakai worklist Belum TTF, pencocokan impor, DAN
  // Daftar TTF) -- listInvoices({}) mengambil SEMUA status, termasuk lunas,
  // supaya Daftar TTF bisa memuat invoice yang sudah LUNAS sekalipun. ───────
  const [invoices, setInvoices] = useState([]);
  const [loadingInv, setLoadingInv] = useState(true);
  const [errorInv, setErrorInv] = useState(null);
  const [muatKe, setMuatKe] = useState(0);
  // `setLoadingInv(true)` dipanggil DI SINI, bukan di dalam efek -- pola yang
  // sama dengan tombol "Muat Ulang" InvoiceListPage.jsx (hindari
  // react-hooks/set-state-in-effect).
  const muatUlang = () => { setLoadingInv(true); setMuatKe((n) => n + 1); };

  // Status TTF untuk SELURUH invoice (bukan hanya yang terbuka -- beda dari
  // peta yang dipakai pencocokan impor di handleFile) -- sumber Daftar TTF.
  const [ttfByInvoiceId, setTtfByInvoiceId] = useState({});
  const [loadingTtf, setLoadingTtf] = useState(true);
  const [errorTtf, setErrorTtf] = useState(null);

  useEffect(() => {
    let batal = false;
    listInvoices({}).then(async ({ data, error }) => {
      if (batal) return;
      const baris = data || [];
      setInvoices(baris);
      setErrorInv(error || null);
      setLoadingInv(false);
      const { data: ttf, error: errTtf } = await getTtfStatusByInvoices(baris.map((r) => r.id));
      if (batal) return;
      setTtfByInvoiceId(ttf || {});
      setErrorTtf(errTtf || null);
      setLoadingTtf(false);
    });
    return () => { batal = true; };
  }, [muatKe]);

  const belumTtf = useMemo(
    () => invoices.filter((r) => OPEN_STATUSES.includes(r.status) && !r.due_date),
    [invoices],
  );

  // ── Daftar TTF (tab 2) ──────────────────────────────────────────────────
  const daftarTtf = useMemo(() => kelompokkanDaftarTtf(invoices, ttfByInvoiceId), [invoices, ttfByInvoiceId]);

  const [searchTtf, setSearchTtf] = useState('');
  const daftarTtfTersaring = useMemo(() => {
    const q = searchTtf.trim().toLowerCase();
    if (!q) return daftarTtf;
    return daftarTtf.filter((g) => (
      (g.noTtf || '').toLowerCase().includes(q)
      || g.customerLabel.toLowerCase().includes(q)
      || g.invoices.some((inv) => (
        (inv.invoice_no || '').toLowerCase().includes(q)
        || (inv.sp_orders?.sp_no || '').toLowerCase().includes(q)
        || (inv.sp_orders?.accounts?.name || '').toLowerCase().includes(q)
      ))
    ));
  }, [daftarTtf, searchTtf]);

  // No. BTB per SP -- dimuat LAZY saat grup dibuka, di-cache per sp_order_id
  // supaya buka-tutup berulang tidak memicu fetch ulang (pola sama dengan
  // lazy-fetch tab Dashboard Storbit).
  const [expandedTtf, setExpandedTtf] = useState(() => new Set());
  const [btbBySpOrderId, setBtbBySpOrderId] = useState({});

  const toggleGrupTtf = (kunci) => {
    setExpandedTtf((s) => {
      const next = new Set(s);
      if (next.has(kunci)) next.delete(kunci); else next.add(kunci);
      return next;
    });
  };

  useEffect(() => {
    let batal = false;
    const idButuh = [];
    expandedTtf.forEach((kunci) => {
      const g = daftarTtf.find((x) => x.kunci === kunci);
      g?.invoices.forEach((inv) => {
        if (inv.sp_order_id && !(inv.sp_order_id in btbBySpOrderId) && !idButuh.includes(inv.sp_order_id)) {
          idButuh.push(inv.sp_order_id);
        }
      });
    });
    if (idButuh.length === 0) return undefined;
    Promise.all(idButuh.map((id) => listSpBtbNew(id).then(({ data }) => [id, data || []])))
      .then((hasil) => {
        if (batal) return;
        setBtbBySpOrderId((prev) => {
          const next = { ...prev };
          hasil.forEach(([id, data]) => { next[id] = data; });
          return next;
        });
      });
    return () => { batal = true; };
  }, [expandedTtf, daftarTtf, btbBySpOrderId]);

  // ── Impor massal ───────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parsing,  setParsing]  = useState(false);
  const [rows,     setRows]     = useState(null); // null = belum ada pratinjau
  const [koreksi,  setKoreksi]  = useState(() => new Set()); // baris TTF_BEDA yang dicentang
  const [hasil,    setHasil]    = useState({}); // baris -> { ok, message }
  const [memproses, setMemproses] = useState(false);

  const pilihFile = () => fileInputRef.current?.click();

  const siapDiproses = useMemo(() => (rows || []).filter((row) => row.kategori === KATEGORI.COCOK_BARU
    || (row.kategori === KATEGORI.TTF_BEDA && koreksi.has(row.baris))), [rows, koreksi]);

  const ringkasan = useMemo(() => {
    const m = {};
    Object.values(KATEGORI).forEach((k) => { m[k] = 0; });
    (rows || []).forEach((r) => { m[r.kategori] = (m[r.kategori] || 0) + 1; });
    return m;
  }, [rows]);

  const handleFile = async (fileList) => {
    const f = fileList?.[0];
    if (!f) return;
    setFileName(f.name);
    setRows(null);
    setHasil({});
    setKoreksi(new Set());
    setParsing(true);
    try {
      const parsed = await parseTtfImportFile(f);
      if (parsed.length === 0) {
        showToast?.('File tidak berisi baris data di bawah header', 'error');
        return;
      }
      const { data: semuaInvoice } = await listInvoices({});
      const idTerbuka = (semuaInvoice || [])
        .filter((inv) => OPEN_STATUSES.includes(inv.status))
        .map((inv) => inv.id);
      const { data: ttfMap } = await getTtfStatusByInvoices(idTerbuka);
      const dikategorikan = categorizeImportRows(parsed, {
        invoices: semuaInvoice, ttfMap, todayIso: getTodayWIB(),
      });
      setRows(dikategorikan);
    } catch (e) {
      showToast?.('Gagal membaca file: ' + (e?.message || e), 'error');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleKoreksi = (baris) => {
    setKoreksi((s) => {
      const next = new Set(s);
      if (next.has(baris)) next.delete(baris); else next.add(baris);
      return next;
    });
  };

  const prosesImpor = async () => {
    if (!bolehImpor || memproses || siapDiproses.length === 0) return;
    setMemproses(true);
    let sukses = 0;
    // Berurutan, BUKAN Promise.all -- satu baris gagal tidak boleh menghentikan
    // baris lain, dan hasil tiap baris ditempel balik segera supaya pratinjau
    // menunjukkan progres, bukan menunggu seluruh batch selesai.
    // Berurutan disengaja (komentar di atas) -- linter proyek ini nol aturan
    // no-await-in-loop, jadi nol eslint-disable yang perlu ditulis di sini.
    for (const row of siapDiproses) {
      const { error } = await markTtfReceived({
        invoiceId:  row.invoice.id,
        receivedBy: row.diterimaOleh,
        ttfNo:      row.noTtf || null,
        notes:      row.catatan || null,
        ttfDate:    row.tanggalTtf,
      });
      if (error) {
        setHasil((h) => ({ ...h, [row.baris]: { ok: false, message: error.message || 'Gagal' } }));
      } else {
        sukses += 1;
        setHasil((h) => ({ ...h, [row.baris]: { ok: true, message: 'Tersimpan' } }));
      }
    }
    setMemproses(false);
    const gagal = siapDiproses.length - sukses;
    showToast?.(
      gagal === 0 ? `${sukses} TTF berhasil diimpor` : `${sukses} berhasil, ${gagal} gagal — lihat kolom Hasil`,
      gagal === 0 ? 'success' : 'error',
    );
    muatUlang();
  };

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <PageHead
        kicker="Accounts Receivable"
        title="Invoice Submission & Acknowledgement"
        sub="Tanda Terima Faktur (TTF) dari customer — gerbang wajib sebelum invoice punya tanggal jatuh tempo."
      />

      <TabBar>
        <TabBtn active={tab === 'belum-ttf'} onClick={() => setTab('belum-ttf')} label="Belum TTF" count={belumTtf.length}/>
        <TabBtn active={tab === 'daftar-ttf'} onClick={() => setTab('daftar-ttf')} label="Daftar TTF" count={daftarTtf.length}/>
      </TabBar>

      {tab === 'belum-ttf' && (
        <>
          {/* ── Impor Massal ── */}
          <Panel title="Impor Massal TTF" icon={FileSpreadsheet}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: SP.s2, marginBottom: SP.s3 }}>
              <Btn icon={Download} variant="outline" onClick={downloadTtfImportTemplate}>
                Unduh Template
              </Btn>
              <Btn icon={Upload} onClick={pilihFile} disabled={parsing}>
                {parsing ? 'Membaca…' : 'Unggah File'}
              </Btn>
              <input
                ref={fileInputRef} type="file" accept=".xlsx"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files)}
              />
              {fileName && <Hint>Berkas: {fileName}</Hint>}
            </div>

            {!bolehImpor && (
              <div style={{ marginBottom: SP.s3 }}>
                <Notice tone="attn" icon={AlertTriangle}>{ALASAN_IMPOR} Anda tetap bisa mengunggah file untuk melihat pratinjaunya.</Notice>
              </div>
            )}

            {rows === null ? (
              <Hint>Unduh template, isi kolom No. Invoice / Tanggal TTF / Diterima Oleh, lalu unggah di sini untuk melihat pratinjau.</Hint>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.s2, marginBottom: SP.s3 }}>
                  {Object.values(KATEGORI).map((k) => (
                    <Badge key={k} {...KATEGORI_TAG[k]}>{KATEGORI_LABEL[k]}: {ringkasan[k] || 0}</Badge>
                  ))}
                </div>

                <TableShell
                  minWidth={1080}
                  head={[
                    ['Baris', 'right'], ['No. Invoice'], ['No. TTF'], ['Tanggal TTF'], ['Diterima Oleh'],
                    ['Kategori'], ['Hasil'],
                  ]}
                >
                  {rows.map((row) => {
                    const h = hasil[row.baris];
                    const diff = diffBaris(row);
                    return (
                      <tr key={row.baris}>
                        <Td align="right" mono>{row.baris}</Td>
                        <Td mono>{row.noInvoice || '—'}</Td>
                        <Td mono>{row.noTtf || '—'}</Td>
                        <Td nowrap>{row.tanggalTtf ? fmtDate(row.tanggalTtf) : '—'}</Td>
                        <Td>{row.diterimaOleh || '—'}</Td>
                        <Td top>
                          <Badge {...KATEGORI_TAG[row.kategori]}>{KATEGORI_LABEL[row.kategori]}</Badge>
                          {row.alasan && (
                            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 3 }}>{row.alasan}</div>
                          )}
                          {diff.length > 0 && (
                            <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 3 }}>
                              {diff.map((d) => <div key={d}>{d}</div>)}
                            </div>
                          )}
                          {row.kategori === KATEGORI.TTF_BEDA && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12, color: C.ink, cursor: bolehImpor ? 'pointer' : 'not-allowed' }}>
                              <input
                                type="checkbox" disabled={!bolehImpor}
                                checked={koreksi.has(row.baris)}
                                onChange={() => toggleKoreksi(row.baris)}
                              />
                              Izinkan koreksi
                            </label>
                          )}
                        </Td>
                        <Td nowrap>
                          {h ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: h.ok ? C.accentDeep : C.danger, fontSize: 12.5 }}>
                              {h.ok ? <Check size={13}/> : <X size={13}/>} {h.message}
                            </span>
                          ) : '—'}
                        </Td>
                      </tr>
                    );
                  })}
                </TableShell>

                <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3, marginTop: SP.s3, flexWrap: 'wrap' }}>
                  <Btn
                    variant="primary" icon={Stamp} onClick={prosesImpor}
                    disabled={!bolehImpor || memproses || siapDiproses.length === 0}
                  >
                    {memproses ? 'Memproses…' : `Proses Impor (${siapDiproses.length} baris)`}
                  </Btn>
                  {bolehImpor === false ? null : (
                    <Hint>
                      {siapDiproses.length === 0
                        ? 'Belum ada baris yang siap diproses — centang "Izinkan koreksi" untuk baris yang berbeda, kalau memang perlu dikoreksi.'
                        : `${siapDiproses.length} baris akan dikirim, baris lain dilewati.`}
                    </Hint>
                  )}
                </div>
              </>
            )}
          </Panel>

          {/* ── Daftar kerja: Belum TTF ── */}
          <Panel title="Belum TTF" icon={AlertTriangle}>
            {errorInv && (
              <div style={{ marginBottom: SP.s3 }}>
                <Notice tone="danger" icon={AlertTriangle}>
                  Daftar invoice gagal dimuat: {errorInv.message || 'penyebab tidak diketahui'}
                </Notice>
              </div>
            )}
            {loadingInv ? (
              <Hint>Memuat…</Hint>
            ) : belumTtf.length === 0 ? (
              <Empty icon={Check} title="Nol invoice menunggu TTF" sub="Seluruh invoice terbuka sudah punya tanggal TTF."/>
            ) : (
              <TableShell
                minWidth={820}
                head={[['Entitas'], ['No. Invoice'], ['Customer'], ['No. SP'], ['Tanggal Invoice'], ['Status']]}
              >
                {belumTtf.map((r) => (
                  <tr
                    key={r.id} onClick={() => onOpenInvoice?.(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenInvoice?.(r.id); } }}
                    tabIndex={0} role="button" title="Buka detail invoice"
                    style={{ cursor: 'pointer' }}
                  >
                    <Td nowrap style={{ color: C.inkSoft }}>{r.companies?.code || r.companies?.name || '—'}</Td>
                    <Td mono style={{ color: C.accent, fontWeight: 600 }}>{r.invoice_no || '—'}</Td>
                    <Td>{r.sp_orders?.accounts?.name || '—'}</Td>
                    <Td mono nowrap style={{ color: C.inkSoft }}>{r.sp_orders?.sp_no || '—'}</Td>
                    <Td nowrap>{fmtDate(r.invoice_date)}</Td>
                    <Td nowrap>{STATUS_LABEL[r.status] || r.status}</Td>
                  </tr>
                ))}
              </TableShell>
            )}
            <div style={{ marginTop: SP.s3 }}>
              <Hint>Klik baris untuk mencatat TTF-nya satu-per-satu di Detail Invoice.</Hint>
            </div>
          </Panel>
        </>
      )}

      {tab === 'daftar-ttf' && (
        <>
          {(errorInv || errorTtf) && (
            <Notice tone="danger" icon={AlertTriangle}>
              Data gagal dimuat: {(errorInv || errorTtf)?.message || 'penyebab tidak diketahui'}
            </Notice>
          )}

          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px',
            border: `1px solid ${C.line}`, borderRadius: RADIUS.md, background: C.surface, alignSelf: 'flex-start',
          }}>
            <Search size={14} style={{ color: C.inkFaint, flexShrink: 0 }}/>
            <input
              value={searchTtf} onChange={(e) => setSearchTtf(e.target.value)}
              placeholder="Cari no. TTF, no. invoice, no. SP, customer"
              aria-label="Cari TTF"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: C.ink, width: 280, maxWidth: '60vw', fontFamily: 'inherit' }}
            />
          </label>

          <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden', background: C.surface }}>
            {(loadingInv || loadingTtf) ? (
              <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat…</p>
            ) : daftarTtfTersaring.length === 0 ? (
              <Empty
                icon={AlertTriangle} title="Nol TTF pada tampilan ini"
                sub={searchTtf ? 'Coba kosongkan kolom pencarian.' : 'Belum ada invoice yang tercatat TTF-nya.'}
              />
            ) : (
              <div style={{ padding: SP.s3 }}>
                <TableShell
                  minWidth={900}
                  head={[
                    [''], ['No. TTF'], ['Tanggal TTF'], ['Customer'],
                    ['Jumlah Invoice', 'right'], ['Total Nilai', 'right'],
                  ]}
                >
                  {daftarTtfTersaring.map((g) => {
                    const terbuka = expandedTtf.has(g.kunci);
                    const rentangTanggal = g.tanggalMin && g.tanggalMax
                      ? (g.tanggalMin === g.tanggalMax ? fmtDate(g.tanggalMin) : `${fmtDate(g.tanggalMin)} – ${fmtDate(g.tanggalMax)}`)
                      : '—';
                    return (
                      <Fragment key={g.kunci}>
                        <tr
                          onClick={() => toggleGrupTtf(g.kunci)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleGrupTtf(g.kunci); } }}
                          tabIndex={0} role="button" title="Buka/tutup rincian"
                          style={{ cursor: 'pointer' }}
                        >
                          <Td style={{ width: 24 }}>
                            {terbuka ? <ChevronDown size={15} style={{ color: C.inkSoft }}/> : <ChevronRight size={15} style={{ color: C.inkSoft }}/>}
                          </Td>
                          <Td mono nowrap style={g.noTtf ? { fontWeight: 600 } : { color: C.inkFaint, fontStyle: 'italic' }}>
                            {g.noTtf || 'Tanpa nomor TTF'}
                          </Td>
                          <Td nowrap>{rentangTanggal}</Td>
                          <Td style={g.customerLabel === 'Multi-customer' ? { color: C.inkSoft, fontStyle: 'italic' } : undefined}>
                            {g.customerLabel}
                          </Td>
                          <Td align="right" mono>{g.invoices.length}</Td>
                          <Td align="right" mono style={{ fontWeight: 600 }}>{rp(g.totalNilai)}</Td>
                        </tr>
                        {terbuka && (
                          <tr>
                            <td colSpan={6} style={{ padding: `0 0 ${SP.s3}px`, borderBottom: `1px solid ${C.lineSoft}`, background: C.surface2 }}>
                              <div style={{ padding: `${SP.s2}px ${SP.s3}px` }}>
                                <TableShell
                                  minWidth={820}
                                  head={[
                                    ['No. Invoice'], ['No. SP'], ['No. BTB'], ['Diterima Oleh'],
                                    ['Tanggal Diterima Nexus'], ['Jatuh Tempo'], ['Status'],
                                  ]}
                                >
                                  {g.invoices.map((inv) => {
                                    const btb = inv.sp_order_id ? btbBySpOrderId[inv.sp_order_id] : null;
                                    return (
                                      <tr
                                        key={inv.id} onClick={(e) => { e.stopPropagation(); onOpenInvoice?.(inv.id); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOpenInvoice?.(inv.id); } }}
                                        tabIndex={0} role="button" title="Buka detail invoice"
                                        style={{ cursor: 'pointer' }}
                                      >
                                        <Td mono nowrap style={{ color: C.accent, fontWeight: 600 }}>{inv.invoice_no || '—'}</Td>
                                        <Td mono nowrap style={{ color: C.inkSoft }}>{inv.sp_orders?.sp_no || '—'}</Td>
                                        <Td mono nowrap>
                                          {btb === null || btb === undefined ? '…' : (btb.length === 0 ? '—' : btb.map((b) => b.btb_no).join(', '))}
                                        </Td>
                                        <Td>{inv.ttf.diterima_oleh || '—'}</Td>
                                        <Td nowrap>{inv.ttf.tanggal_menerima ? fmtDate(inv.ttf.tanggal_menerima) : '—'}</Td>
                                        <Td nowrap>{inv.due_date ? fmtDate(inv.due_date) : 'Belum jatuh tempo'}</Td>
                                        <Td nowrap>
                                          <Badge {...(STATUS_TAG[inv.status] || STATUS_TAG.issued)}>{STATUS_LABEL_SHORT[inv.status] || inv.status}</Badge>
                                        </Td>
                                      </tr>
                                    );
                                  })}
                                </TableShell>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </TableShell>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// src/modules/sales-order/SalesOrderDocDetailPage.jsx
// SO detail — struktur visual mengikuti SODetailPageMockup.jsx (referensi), token lokal
// (bukan hardcode ala mockup), tersambung data nyata. History quotation & PRF ditarik
// via inquiry_id (SO menunjuk, tidak menyalin). Sign by Customer = link teks + penanda.
// Aksi (Kirim ke Procurement, Sign) hanya untuk creator (RLS update meng-enforce).
import { useState, useEffect } from 'react';
import { ChevronLeft, Send, BadgeCheck, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  navy: '#144682', navyDark: '#0E3260', orange: '#E85A1E', orangeSoft: '#FBEDE4',
  cream: '#F6EFE3', ink: '#1F2733', muted: '#6B7684', line: '#E4E7EC',
  surface: '#FFFFFF', pageBg: '#F7F8FA', warnBg: '#FDF4E7', warnInk: '#9A5B12',
  chip: '#EEF2F8',
};
const HEAD = "'Montserrat', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// Peran yang RLS beri hak baca company-wide (untuk membedakan "kosong" vs "tak boleh lihat").
const MGR_OR_ABOVE = ['super_admin', 'admin', 'ceo', 'gm', 'gm_bd', 'manager', 'supervisor'];

// Label service_type (map lokal modul — belum ada helper bersama yang ter-export).
const SERVICE_LABEL = { freight_forwarding: 'Freight Forwarding', customs: 'Customs', trading: 'Trading' };
const svc = (v) => SERVICE_LABEL[v] || v || '—';

const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
function fmtDate(iso) {
  if (!iso) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

function Pill({ children, tone = 'navy' }) {
  const map = {
    navy: { bg: '#E7EEF7', fg: C.navy }, orange: { bg: C.orangeSoft, fg: C.orange },
    muted: { bg: '#EEF1F4', fg: C.muted }, warn: { bg: C.warnBg, fg: C.warnInk },
  };
  const c = map[tone] || map.navy;
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 12, fontWeight: 600, fontFamily: BODY, letterSpacing: 0.2 }}>{children}</span>;
}

function Card({ title, action, accent, children }) {
  return (
    <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${C.line}`, borderLeft: accent ? `3px solid ${accent}` : 'none' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: HEAD, letterSpacing: 0.2 }}>{title}</h3>
        {action}
      </header>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function MiniTable({ head, rows, empty }) {
  if (!rows.length) return <p style={{ margin: 0, color: C.muted, fontSize: 14, fontFamily: BODY }}>{empty}</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: BODY }}>
      <thead><tr>{head.map(h => (
        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.line}`, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
      ))}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.line}` : 'none' }}>
          {r.map((cell, j) => <td key={j} style={{ padding: '10px', fontSize: 14, color: C.ink, verticalAlign: 'middle' }}>{cell}</td>)}
        </tr>
      ))}</tbody>
    </table>
  );
}

const isUrl = (s) => /^https?:\/\/\S+/i.test(String(s || '').trim());

export default function SalesOrderDocDetailPage({ soId, onBack, showToast }) {
  const { profile, erpRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [so, setSo] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [prfs, setPrfs] = useState([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signLink, setSignLink] = useState('');

  useEffect(() => {
    if (!soId) return undefined;
    // setState hanya di jalur async (hindari sync-set di body effect). Initial state
    // loading=true/notFound=false dari useState; reload me-refetch di tempat.
    let cancelled = false;
    (async () => {
      const { data: row, error } = await supabase
        .from('sales_orders')
        .select('id, so_no, status, signed, sign_link, signed_at, created_by, created_at, inquiry_id, account_id, account:accounts!sales_orders_account_id_fkey(name), inquiry:inquiries!sales_orders_inquiry_id_fkey(inquiry_no, service_type, route)')
        .eq('id', soId).is('deleted_at', null).maybeSingle();
      if (cancelled) return;
      if (error || !row) { setNotFound(true); setLoading(false); return; }
      // History ditarik via inquiry_id (RLS masing-masing tabel berlaku apa adanya).
      const { data: quos } = await supabase.from('quotations')
        .select('quotation_no, created_at, status, total_amount')
        .eq('inquiry_id', row.inquiry_id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(200);
      const { data: prfRows } = await supabase.from('prf')
        .select('prf_no, created_at, service_type, status')
        .eq('inquiry_id', row.inquiry_id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(200);
      if (cancelled) return;
      setSo(row); setQuotations(quos || []); setPrfs(prfRows || []);
      setSignLink(row.sign_link || '');
      setLoading(false);
    })().catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [soId, reload]);

  const isCreator = so && profile?.id && so.created_by === profile.id;
  const canEdit = isCreator || erpRole === 'super_admin';
  const quotationsDefinitive = MGR_OR_ABOVE.includes(erpRole);
  const prfDefinitive = quotationsDefinitive || erpRole === 'procurement';

  async function sendToProcurement() {
    if (!so) return;
    setBusy(true);
    const { error } = await supabase.from('sales_orders').update({ status: 'SENT', updated_by: profile.id }).eq('id', so.id);
    setBusy(false);
    if (error) { showToast?.('Gagal kirim: ' + error.message, 'error'); return; }
    showToast?.('SO dikirim ke Procurement');
    setReload(r => r + 1);
  }

  async function saveSign() {
    if (!isUrl(signLink)) { showToast?.('Masukkan link URL yang valid (http/https)', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('sales_orders')
      .update({ sign_link: signLink.trim(), signed: true, signed_at: new Date().toISOString(), updated_by: profile.id })
      .eq('id', so.id);
    setBusy(false);
    if (error) { showToast?.('Gagal menyimpan sign: ' + error.message, 'error'); return; }
    showToast?.('Ditandai signed by customer');
    setSignOpen(false);
    setReload(r => r + 1);
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: C.muted, fontFamily: BODY }}>Memuat…</div>;
  if (notFound) return (
    <div style={{ padding: '3rem', textAlign: 'center', fontFamily: BODY }}>
      <p style={{ color: C.muted }}>Sales Order tidak ditemukan.</p>
      <button onClick={onBack} style={{ marginTop: 12, height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.navy}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontWeight: 700, cursor: 'pointer' }}>Kembali</button>
    </div>
  );

  const inq = so.inquiry || {};
  return (
    <div style={{ fontFamily: BODY, color: C.ink }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* Breadcrumb + back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}><ChevronLeft size={15} />Kembali</button>
          <span style={{ fontSize: 12.5, color: C.muted, letterSpacing: 0.5, fontWeight: 600 }}>SALES ORDER · DETAIL</span>
        </div>

        {/* Header SO */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: '22px 24px', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.navy, fontFamily: HEAD, letterSpacing: 0.2 }}>{so.account?.name || '—'}</h1>
                <Pill tone="muted">{so.status}</Pill>
                {so.signed ? <Pill tone="navy">Signed by customer</Pill> : <Pill tone="warn">Belum di-sign</Pill>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', color: C.muted, fontSize: 13.5 }}>
                <span style={{ fontFamily: MONO, fontWeight: 600, color: C.navy, background: C.chip, padding: '4px 10px', borderRadius: 8 }}>{so.so_no}</span>
                <span>{svc(inq.service_type)}</span>
                <span>{inq.route || '—'}</span>
                <span>Terbit {fmtDate(so.created_at)}</span>
              </div>
            </div>
            {canEdit && so.status === 'DRAFT' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={sendToProcurement} disabled={busy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.navy, color: '#fff', border: `1px solid ${C.navy}`, borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: BODY, opacity: busy ? 0.7 : 1 }}>
                  <Send size={15} />Kirim ke Procurement
                </button>
              </div>
            )}
          </div>

          {/* Amplop dari → ke */}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, letterSpacing: 0.4 }}>PERINTAH KERJA</span>
            <Pill tone="navy">Sales</Pill>
            <span style={{ color: C.orange, fontWeight: 700 }}>→</span>
            <Pill tone="orange">Procurement</Pill>
            <span style={{ marginLeft: 'auto', fontSize: 13.5, color: C.muted }}>Inquiry asal: <strong style={{ color: C.navy }}>{inq.inquiry_no || '—'}</strong></span>
          </div>
        </div>

        {/* Grid 2 kolom */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, alignItems: 'start' }}>
          {/* Kiri: history dokumen */}
          <div>
            <Card title="History Quotation" accent={C.navy} action={<span style={{ fontSize: 12.5, color: C.muted }}>ditarik dari inquiry · read-only</span>}>
              <MiniTable
                head={['Quotation No', 'Tanggal', 'Status', 'Total']}
                rows={quotations.map(q => [
                  <span style={{ fontFamily: MONO, fontWeight: 600, color: C.navy }}>{q.quotation_no}</span>,
                  fmtDate(q.created_at),
                  <Pill tone={String(q.status).toUpperCase() === 'SENT' ? 'navy' : 'muted'}>{String(q.status).toUpperCase()}</Pill>,
                  <strong>{rp(q.total_amount)}</strong>,
                ])}
                empty={quotationsDefinitive ? 'Belum ada quotation' : 'Quotation tidak dapat ditampilkan untuk role ini (kebijakan akses).'}
              />
            </Card>

            <Card title="History PRF" accent={C.orange} action={<span style={{ fontSize: 12.5, color: C.muted }}>ditarik dari inquiry · read-only</span>}>
              <MiniTable
                head={['PRF No', 'Tanggal', 'Service', 'Status']}
                rows={prfs.map(p => [
                  <span style={{ fontFamily: MONO, fontWeight: 600, color: C.navy }}>{p.prf_no}</span>,
                  fmtDate(p.created_at),
                  p.service_type || '—',
                  <Pill tone={String(p.status).toUpperCase() === 'QUOTED' ? 'navy' : 'muted'}>{String(p.status).toUpperCase()}</Pill>,
                ])}
                empty={prfDefinitive ? 'Belum ada PRF' : 'PRF tidak dapat ditampilkan untuk role ini (kebijakan akses).'}
              />
            </Card>

            {/* Slot SI — placeholder (entitas terpisah) */}
            <Card title="Shipment Instruction (SI)" accent={C.line}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, color: C.muted, fontSize: 14, maxWidth: 460, lineHeight: 1.6 }}>
                  SI di-generate sebagai dokumen tersendiri lalu disambungkan ke SO ini. Modul SI dibangun terpisah.
                </p>
                <Pill tone="muted">Nyusul</Pill>
              </div>
            </Card>
          </div>

          {/* Kanan: Sign + Ringkasan */}
          <div>
            <Card title="Sign by Customer" accent={C.orange}>
              {!so.signed && !signOpen && (
                <>
                  <p style={{ margin: '0 0 14px', color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
                    Tandai SO ini sudah disetujui customer dengan menautkan dokumen ber-tanda-tangan (link Drive).
                  </p>
                  {canEdit
                    ? <button onClick={() => setSignOpen(true)} style={{ background: C.orange, color: '#fff', border: `1px solid ${C.orange}`, borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: BODY }}>Sign by Customer</button>
                    : <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>Belum ditandai signed.</p>}
                </>
              )}
              {!so.signed && signOpen && (
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 6, letterSpacing: 0.3 }}>LINK DRIVE DOKUMEN SIGNED</label>
                  <input value={signLink} onChange={e => setSignLink(e.target.value)} placeholder="https://drive.google.com/..."
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 14, fontFamily: BODY, marginBottom: 8 }} />
                  <p style={{ margin: '0 0 14px', color: C.warnInk, fontSize: 12.5, lineHeight: 1.5 }}>Pastikan link dapat diakses procurement (setelan share yang benar).</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveSign} disabled={busy} style={{ background: C.orange, color: '#fff', border: `1px solid ${C.orange}`, borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: BODY, opacity: busy ? 0.7 : 1 }}>Simpan &amp; tandai signed</button>
                    <button onClick={() => { setSignOpen(false); setSignLink(so.sign_link || ''); }} style={{ background: '#fff', color: C.navy, border: `1px solid ${C.line}`, borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Batal</button>
                  </div>
                </div>
              )}
              {so.signed && (
                <div>
                  <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BadgeCheck size={18} color={C.navy} /><Pill tone="navy">Signed by customer</Pill>
                    {so.signed_at && <span style={{ fontSize: 12, color: C.muted }}>· {fmtDate(so.signed_at)}</span>}
                  </div>
                  {so.sign_link && (
                    <a href={so.sign_link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.navy, fontWeight: 600, wordBreak: 'break-all' }}>
                      <ExternalLink size={14} />{so.sign_link}
                    </a>
                  )}
                  {canEdit && (
                    <div style={{ marginTop: 12 }}>
                      <button onClick={() => { setSignLink(so.sign_link || ''); setSignOpen(true); setSo(s => ({ ...s, signed: false })); }}
                        style={{ background: '#fff', color: C.navy, border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Ubah link</button>
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card title="Ringkasan">
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 12, columnGap: 14 }}>
                {[
                  ['Customer', so.account?.name || '—'],
                  ['Inquiry asal', inq.inquiry_no || '—'],
                  ['Layanan', svc(inq.service_type)],
                  ['Rute', inq.route || '—'],
                  ['Status', so.status],
                  ['Terbit', fmtDate(so.created_at)],
                ].map(([k, v]) => (
                  <span key={k} style={{ display: 'contents' }}>
                    <dt style={{ fontSize: 13, color: C.muted }}>{k}</dt>
                    <dd style={{ margin: 0, fontSize: 13.5, color: C.ink, fontWeight: 600, textAlign: 'right' }}>{v}</dd>
                  </span>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// src/modules/procurement/PRFDetailPage.jsx
// Detail PRF minimal (dibuka dari list Forwarding MSI): ringkasan PRF read-only +
// panel "Jawaban Harga" (cost build-up per komponen → prf_cost_items + kolom jawaban di prf).
// Edit hanya untuk procurement/super_admin (cermin RLS prf_update_status + prf_cost_items write);
// sales/lainnya LIHAT saja. RLS = penegak sebenarnya. Total Modal/Untung/Margin dihitung saat render.
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const BORDER = '#E8ECF2';
const INK = '#16243A';
const MUTE = '#7E8899';
const HEAD = "'Montserrat',sans-serif";
const BODY = "'Inter',system-ui,sans-serif";
const DANGER = '#C0392B';

const SERVICE_LABEL = { sea: 'Sea', air: 'Air', inland: 'Inland', project: 'Project', custom: 'Custom' };
const COST_TYPES = [{ v: 'vendor', l: 'Vendor' }, { v: 'internal', l: 'Internal' }];

const fmtDate = (iso) => {
  if (!iso) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};
const num = (v) => (Number(v) || 0);
const money = (v) => (Number(v) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

// PRF fields yang ada sekarang (read-only summary). Nilai kosong disaring saat render.
const PRF_SELECT = 'id, prf_no, status, created_at, customer_source, account_name_manual, stream, deadline_quotation, direction, commodity, hs_code, service_type, incoterms, origin, destination, pickup_address, delivery_address, cargo_ready_date, add_on_services, notes, suggested_rate, rate_currency, valid_from, valid_until, pricing_notes, answered_by, answered_at, account:accounts!prf_account_id_fkey(name), inquiry:inquiries!prf_inquiry_id_fkey(inquiry_no)';

export default function PRFDetailPage({ prfId, onBack, showToast }) {
  const { erpRole } = useAuth();
  const canEdit = ['procurement', 'super_admin'].includes(erpRole);

  const [prf, setPrf] = useState(null);
  const [rows, setRows] = useState([]);           // cost items (editable draft)
  const [answer, setAnswer] = useState({ suggested_rate: '', rate_currency: 'IDR', valid_from: '', valid_until: '', pricing_notes: '' });
  const [answeredName, setAnsweredName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: p, error: e1 } = await supabase.from('prf').select(PRF_SELECT).eq('id', prfId).is('deleted_at', null).maybeSingle();
    if (e1) { setError(e1.message); setLoading(false); return; }
    if (!p) { setError('PRF tidak ditemukan atau tidak ada akses.'); setLoading(false); return; }
    setPrf(p);
    setAnswer({
      suggested_rate: p.suggested_rate != null ? String(p.suggested_rate) : '',
      rate_currency: p.rate_currency || 'IDR',
      valid_from: p.valid_from || '',
      valid_until: p.valid_until || '',
      pricing_notes: p.pricing_notes || '',
    });
    const { data: ci } = await supabase.from('prf_cost_items').select('id, component, cost_type, amount, currency, sort_order, notes').eq('prf_id', prfId).order('sort_order', { ascending: true });
    setRows((ci || []).map(r => ({ ...r, amount: r.amount != null ? String(r.amount) : '0' })));
    if (p.answered_by) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', p.answered_by).maybeSingle();
      setAnsweredName(prof?.full_name || '');
    } else { setAnsweredName(''); }
    setLoading(false);
  }, [prfId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // ── Cost-item row ops (edit only) ──
  const addRow = () => setRows(r => [...r, { id: null, component: '', cost_type: 'vendor', amount: '0', currency: answer.rate_currency || 'IDR', sort_order: r.length, notes: '' }]);
  const removeRow = (i) => setRows(r => r.filter((_, idx) => idx !== i));
  const patchRow = (i, k, v) => setRows(r => r.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
  const moveRow = (i, dir) => setRows(r => {
    const j = i + dir; if (j < 0 || j >= r.length) return r;
    const next = [...r]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  // ── Derived (dihitung saat render — TIDAK disimpan) ──
  const totalModal = rows.reduce((s, r) => s + num(r.amount), 0);
  const sell = num(answer.suggested_rate);
  const untung = sell - totalModal;
  const margin = sell > 0 ? (untung / sell) * 100 : 0;

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      // Header + replace rincian dalam SATU transaksi via RPC atomik (RLS tetap penegak:
      // prf_update_status utk header, prf_cost_items_* utk rincian). Kalau insert rincian
      // gagal, header TIDAK tersimpan & rincian lama TIDAK hilang (seluruh txn di-rollback).
      // answered_by diisi server (auth.uid() = user login), answered_at = now() di dalam RPC.
      const clean = rows.filter(r => r.component.trim() !== '' || num(r.amount) !== 0);
      const p_header = {
        suggested_rate: answer.suggested_rate,          // '' -> NULL di RPC
        rate_currency: answer.rate_currency || 'IDR',
        valid_from: answer.valid_from || '',            // '' -> NULL di RPC
        valid_until: answer.valid_until || '',
        pricing_notes: answer.pricing_notes.trim(),     // '' -> NULL di RPC
      };
      const p_items = clean.map((r, idx) => ({
        component: r.component.trim(),
        cost_type: r.cost_type === 'internal' ? 'internal' : 'vendor',
        amount: num(r.amount),
        currency: r.currency || 'IDR',
        sort_order: idx,
        notes: r.notes?.trim() || '',
      }));
      const { error } = await supabase.rpc('save_prf_pricing', { p_prf_id: prfId, p_header, p_items });
      if (error) throw error;
      showToast?.('Jawaban harga tersimpan');
      await load();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Styles ──
  const page = { maxWidth: 1000, margin: '0 auto', padding: '24px 24px 48px', fontFamily: BODY };
  const backBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 18 };
  const card = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 };
  const secBar = { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: '#F7F9FB' };
  const secTitle = { fontFamily: HEAD, fontWeight: 700, fontSize: 14, color: NAVY };
  const secBody = { padding: 20 };
  const label = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTE, marginBottom: 4 };
  const val = { fontSize: 13.5, color: INK, fontFamily: BODY };
  const input = { height: 40, width: '100%', borderRadius: 9, border: `1px solid ${BORDER}`, padding: '0 12px', fontSize: 13.5, fontFamily: BODY, color: INK, boxSizing: 'border-box', outline: 'none', background: canEdit ? '#fff' : '#F7F9FB' };
  const th = { textAlign: 'left', padding: '9px 10px', fontFamily: HEAD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: MUTE, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '7px 10px', fontSize: 13, color: INK, borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' };
  const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer' };
  const numTd = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  if (loading) return <div style={page}><div style={{ padding: '40px 0', textAlign: 'center', color: MUTE }}>Memuat…</div></div>;
  if (error) return (
    <div style={page}>
      <button type="button" onClick={onBack} style={backBtn}><ChevronLeft size={16} />Kembali</button>
      <div style={{ padding: '40px 0', textAlign: 'center', color: DANGER }}>{error}</div>
    </div>
  );

  const customer = prf.account?.name || prf.account_name_manual || '—';
  // Summary field list (kosong disaring)
  const summary = [
    ['Customer', customer],
    ['Inquiry', prf.inquiry?.inquiry_no || '—'],
    ['Service Type', SERVICE_LABEL[prf.service_type] || prf.service_type || '—'],
    ['Direction', prf.direction || '—'],
    ['Commodity', prf.commodity || '—'],
    ['HS Code', prf.hs_code || '—'],
    ['Incoterms', prf.incoterms || '—'],
    ['Origin', prf.origin || '—'],
    ['Destination', prf.destination || '—'],
    ['Pickup', prf.pickup_address || '—'],
    ['Delivery', prf.delivery_address || '—'],
    ['Stream', prf.stream || '—'],
    ['Deadline Quotation', fmtDate(prf.deadline_quotation)],
    ['Cargo Ready', fmtDate(prf.cargo_ready_date)],
    ['Add-On', Array.isArray(prf.add_on_services) && prf.add_on_services.length ? prf.add_on_services.join(', ') : '—'],
  ];

  return (
    <div style={page}>
      <button type="button" onClick={onBack} style={backBtn}><ChevronLeft size={16} />Kembali</button>

      {/* Header ringkas */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: ORANGE, marginBottom: 6 }}>Procurement · PRF</div>
        <h1 style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: NAVY, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{prf.prf_no}</h1>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 5 }}>Status <b style={{ color: INK }}>{String(prf.status).toUpperCase()}</b> · dibuat {fmtDate(prf.created_at)}</div>
      </div>

      {/* Ringkasan PRF (read-only) */}
      <section style={card}>
        <div style={secBar}><span style={secTitle}>Ringkasan Permintaan</span></div>
        <div style={secBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 20px' }}>
            {summary.map(([k, v]) => (
              <div key={k}><div style={label}>{k}</div><div style={val}>{v}</div></div>
            ))}
          </div>
          {prf.notes && <div style={{ marginTop: 16 }}><div style={label}>Catatan</div><div style={{ ...val, whiteSpace: 'pre-wrap' }}>{prf.notes}</div></div>}
        </div>
      </section>

      {/* Panel Jawaban Harga */}
      <section style={card}>
        <div style={secBar}>
          <span style={secTitle}>Jawaban Harga</span>
          {!canEdit && <span style={{ fontSize: 11.5, color: MUTE }}>(hanya bisa dilihat — pengisian oleh procurement)</span>}
          {prf.answered_at && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: MUTE }}>Dijawab {answeredName ? `oleh ${answeredName} ` : ''}· {fmtDate(prf.answered_at)}</span>}
        </div>
        <div style={secBody}>
          {/* Rincian biaya */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Komponen</th>
                  <th style={th}>Tipe</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                  <th style={th}>Currency</th>
                  {canEdit && <th style={{ ...th, textAlign: 'center', width: 110 }}>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td style={{ ...td, color: MUTE, textAlign: 'center' }} colSpan={canEdit ? 5 : 4}>Belum ada rincian biaya.</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>
                      {canEdit
                        ? <input value={r.component} onChange={e => patchRow(i, 'component', e.target.value)} style={input} placeholder="mis. Ocean Freight" />
                        : <span>{r.component || '—'}</span>}
                    </td>
                    <td style={td}>
                      {canEdit
                        ? <select value={r.cost_type} onChange={e => patchRow(i, 'cost_type', e.target.value)} style={input}>{COST_TYPES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
                        : <span>{COST_TYPES.find(c => c.v === r.cost_type)?.l || r.cost_type}</span>}
                    </td>
                    <td style={numTd}>
                      {canEdit
                        ? <input value={r.amount} onChange={e => patchRow(i, 'amount', e.target.value.replace(/[^\d.]/g, ''))} onWheel={e => e.currentTarget.blur()} inputMode="decimal" style={{ ...input, textAlign: 'right' }} placeholder="0" />
                        : <span>{money(r.amount)}</span>}
                    </td>
                    <td style={td}>
                      {canEdit
                        ? <input value={r.currency} onChange={e => patchRow(i, 'currency', e.target.value.toUpperCase().slice(0, 3))} style={{ ...input, width: 90 }} placeholder="IDR" />
                        : <span>{r.currency || 'IDR'}</span>}
                    </td>
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => moveRow(i, -1)} style={{ ...iconBtn, marginRight: 4 }} title="Naik"><ArrowUp size={14} /></button>
                        <button type="button" onClick={() => moveRow(i, 1)} style={{ ...iconBtn, marginRight: 4 }} title="Turun"><ArrowDown size={14} /></button>
                        <button type="button" onClick={() => removeRow(i)} style={{ ...iconBtn, color: DANGER, borderColor: '#F0D2D2' }} title="Hapus"><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <button type="button" onClick={addRow} style={{ ...backBtn, marginTop: 12, marginBottom: 0, color: NAVY }}><Plus size={15} />Tambah Baris</button>
          )}

          {/* Ringkasan angka (dihitung saat render) */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <Stat label="Total Modal" value={money(totalModal)} sub={answer.rate_currency} />
            <div>
              <div style={label}>Harga Jual</div>
              {canEdit
                ? <input value={answer.suggested_rate} onChange={e => setAnswer(a => ({ ...a, suggested_rate: e.target.value.replace(/[^\d.]/g, '') }))} onWheel={e => e.currentTarget.blur()} inputMode="decimal" style={input} placeholder="0" />
                : <div style={{ ...val, fontWeight: 700 }}>{money(sell)}</div>}
            </div>
            <Stat label="Untung" value={money(untung)} sub={answer.rate_currency} tone={untung < 0 ? 'danger' : 'navy'} />
            <Stat label="Margin" value={(sell > 0 ? margin.toFixed(1) : '0.0') + ' %'} tone={untung < 0 ? 'danger' : 'navy'} />
          </div>

          {/* Field header jawaban */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <div style={label}>Rate Currency</div>
              {canEdit
                ? <input value={answer.rate_currency} onChange={e => setAnswer(a => ({ ...a, rate_currency: e.target.value.toUpperCase().slice(0, 3) }))} style={input} placeholder="IDR" />
                : <div style={val}>{answer.rate_currency || 'IDR'}</div>}
            </div>
            <div>
              <div style={label}>Berlaku Dari</div>
              {canEdit
                ? <input type="date" value={answer.valid_from} onChange={e => setAnswer(a => ({ ...a, valid_from: e.target.value }))} style={input} />
                : <div style={val}>{fmtDate(answer.valid_from)}</div>}
            </div>
            <div>
              <div style={label}>Berlaku Sampai</div>
              {canEdit
                ? <input type="date" value={answer.valid_until} onChange={e => setAnswer(a => ({ ...a, valid_until: e.target.value }))} style={input} />
                : <div style={val}>{fmtDate(answer.valid_until)}</div>}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={label}>Catatan Pricing</div>
            {canEdit
              ? <textarea value={answer.pricing_notes} onChange={e => setAnswer(a => ({ ...a, pricing_notes: e.target.value }))} rows={3} style={{ ...input, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} placeholder="Catatan untuk sales / syarat harga…" />
              : <div style={{ ...val, whiteSpace: 'pre-wrap' }}>{answer.pricing_notes || '—'}</div>}
          </div>

          {canEdit && (
            <div style={{ marginTop: 20 }}>
              <button type="button" onClick={handleSave} disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 24px', borderRadius: 10, border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Menyimpan…' : 'Simpan Jawaban Harga'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  const color = tone === 'danger' ? '#C0392B' : '#144682';
  return (
    <div style={{ border: '1px solid #E8ECF2', borderRadius: 12, padding: '12px 14px', background: '#F7F9FB' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7E8899', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 18, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}{sub ? <span style={{ fontSize: 11, fontWeight: 600, color: '#7E8899', marginLeft: 5 }}>{sub}</span> : null}</div>
    </div>
  );
}

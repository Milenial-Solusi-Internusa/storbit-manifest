// src/modules/reporting/MOMDetailPage.jsx
// MOM read-only view + approval (CEO/admin/super_admin). Fetches meeting_moms +
// child tables. Approve/Reject update status + notify the notulis.
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Pencil, Download, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { C, MOM_STATUS_META, momTypeLabel, statusLabel, statusColor, prioritasLabel, fmtDate } from './momConstants';

const APPROVER_ROLES = ['ceo', 'admin', 'super_admin'];

function StatusBadge({ status, big }) {
  const m = MOM_STATUS_META[status] || MOM_STATUS_META.draft;
  return <span style={{ display: 'inline-block', padding: big ? '5px 14px' : '3px 10px', borderRadius: 999, fontSize: big ? 12.5 : 11, fontWeight: 700, background: m.color + '18', color: m.color, border: `1px solid ${m.color}40` }}>{m.label}</span>;
}
function RowStatus({ value }) {
  const c = statusColor(value);
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c + '18', color: c, border: `1px solid ${c}40` }}>{statusLabel(value)}</span>;
}
const thS = { padding: '9px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.sub, borderBottom: `1px solid ${C.border}`, background: '#F8FAFC' };
const tdS = { padding: '9px 12px', verticalAlign: 'top', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` };

function Section({ badge, title, children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F1F5F9', borderBottom: `1px solid ${C.border}`, padding: '12px 20px' }}>
        <span style={{ width: 26, height: 26, borderRadius: 999, background: C.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11.5, flexShrink: 0 }}>{badge}</span>
        <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14.5, color: C.text }}>{title}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}
function ReadTable({ cols, rows, render }) {
  if (!rows.length) return <div style={{ fontSize: 13, color: C.muted, fontStyle: 'italic' }}>Tidak ada data.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ ...thS, width: 40 }}>No</th>{cols.map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.id || i}><td style={{ ...tdS, textAlign: 'center', color: C.muted, fontWeight: 700 }}>{i + 1}</td>{render(r)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
function Info({ label, value }) {
  return <div><div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div><div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{value || '—'}</div></div>;
}

/* ---------- reject modal ---------- */
function RejectModal({ momNo, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(480px,100%)', boxShadow: '0 24px 64px rgba(15,23,42,0.28)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.border}`, background: '#F8FAFC' }}>
          <XCircle size={18} color={C.red} /><h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>Tolak MOM</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>
        <div style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>Tolak <b style={{ color: C.text }}>{momNo}</b>. Berikan alasan untuk notulis.</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' }}>Alasan Penolakan</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Alasan…" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', outline: 'none', resize: 'vertical' }} />
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.border}`, background: '#F8FAFC' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
          <button type="button" disabled={saving || !reason.trim()} onClick={async () => { setSaving(true); const ok = await onSubmit(reason.trim()); setSaving(false); if (ok) onClose(); }}
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: (saving || !reason.trim()) ? '#E5A7A0' : C.red, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: (saving || !reason.trim()) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={15} />}Tolak
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function MOMDetailPage({ momId, onBack, onEdit, showToast }) {
  const { profile, erpRole } = useAuth();
  const canApprove = APPROVER_ROLES.includes(erpRole);

  const [mom, setMom] = useState(null);
  const [ap, setAp] = useState([]);
  const [pu, setPu] = useState([]);
  const [iss, setIss] = useState([]);
  const [imp, setImp] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!momId) return undefined;
    let cancelled = false;
    setLoading(true); setNotFound(false);
    (async () => {
      const { data: m } = await supabase.from('meeting_moms').select('*').eq('id', momId).maybeSingle();
      if (cancelled) return;
      if (!m) { setNotFound(true); setLoading(false); return; }
      const [apr, pur, isr, impr] = await Promise.all([
        supabase.from('mom_action_plans').select('*').eq('mom_id', momId).order('no'),
        supabase.from('mom_progress_updates').select('*').eq('mom_id', momId).order('no'),
        supabase.from('mom_issues').select('*').eq('mom_id', momId).order('no'),
        supabase.from('mom_improvements').select('*').eq('mom_id', momId).order('no'),
      ]);
      const pIds = [...new Set([m.notulis_id, m.approved_by].filter(Boolean))];
      const map = {};
      if (pIds.length) { const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', pIds); (profs || []).forEach(p => { map[p.id] = p.full_name; }); }
      if (cancelled) return;
      setMom(m); setAp(apr.data || []); setPu(pur.data || []); setIss(isr.data || []); setImp(impr.data || []); setNames(map); setLoading(false);
    })().catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [momId, reloadKey]);

  const notifyNotulis = async (title, body) => {
    if (!mom?.notulis_id) return;
    try {
      await supabase.from('notifications').insert({ company_id: mom.company_id, user_id: mom.notulis_id, event_type: 'mom_approval_result', title, body, reference_type: 'mom', reference_id: momId });
    } catch (e) { console.error('[mom] notify notulis failed:', e?.message || e); }
  };

  const approve = async () => {
    setBusy(true);
    const { error } = await supabase.from('meeting_moms').update({ status: 'approved', approved_by: profile.id, approved_at: new Date().toISOString() }).eq('id', momId);
    setBusy(false);
    if (error) { showToast?.('Gagal approve: ' + error.message, 'error'); return; }
    await notifyNotulis('MOM Disetujui', `MOM ${mom.mom_no} telah disetujui`);
    showToast?.('MOM disetujui ✨', 'success');
    refetch();
  };
  const reject = async (reason) => {
    const { error } = await supabase.from('meeting_moms').update({ status: 'rejected', reject_reason: reason }).eq('id', momId);
    if (error) { showToast?.('Gagal reject: ' + error.message, 'error'); return false; }
    await notifyNotulis('MOM Ditolak', `MOM ${mom.mom_no} ditolak: ${reason}`);
    showToast?.('MOM ditolak', 'success');
    refetch();
    return true;
  };

  if (loading) return <div style={{ padding: '60px 24px', textAlign: 'center', color: C.muted, fontFamily: "'Inter',sans-serif" }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} /><div style={{ marginTop: 12, fontSize: 13.5 }}>Memuat MOM…</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if (notFound || !mom) return <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: "'Inter',sans-serif", color: C.sub }}><div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>MOM tidak ditemukan</div><button type="button" onClick={onBack} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, fontWeight: 700, cursor: 'pointer' }}>Kembali</button></div>;

  const canEdit = mom.status === 'draft' || mom.status === 'rejected';

  return (
    <div style={{ background: C.page, padding: '8px 8px 40px', borderRadius: 16, fontFamily: "'Inter',system-ui,sans-serif", color: C.text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* header */}
        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 26px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={onBack} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub }}><ChevronLeft size={18} /></button>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: C.navy, background: C.navySoft, padding: '4px 11px', borderRadius: 8 }}>{mom.mom_no || '—'}</span>
            <StatusBadge status={mom.status} big />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => showToast?.('Download PDF — segera hadir', 'info')} style={btnGhost}><Download size={15} />Download PDF</button>
              {canEdit && <button type="button" onClick={() => onEdit?.(momId)} style={btnGhost}><Pencil size={15} />Edit</button>}
              {canApprove && mom.status === 'submitted' && (
                <>
                  <button type="button" onClick={approve} disabled={busy} style={{ ...btnSolid, background: C.green }}>{busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={15} />}Approve</button>
                  <button type="button" onClick={() => setRejectOpen(true)} disabled={busy} style={{ ...btnSolid, background: C.red }}><XCircle size={15} />Reject</button>
                </>
              )}
            </div>
          </div>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 14px' }}>{momTypeLabel(mom.mom_type)} — {mom.divisi || '—'}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '14px 20px' }}>
            <Info label="Tanggal" value={fmtDate(mom.meeting_date)} />
            <Info label="Waktu" value={(mom.time_start || mom.time_end) ? `${String(mom.time_start || '').slice(0, 5) || '—'} – ${String(mom.time_end || '').slice(0, 5) || '—'}` : '—'} />
            <Info label="Pemimpin" value={mom.pemimpin} />
            <Info label="Notulis" value={names[mom.notulis_id]} />
            <Info label="Lokasi / Media" value={mom.lokasi} />
            <Info label="Peserta" value={(mom.peserta || []).join(', ')} />
          </div>
          {mom.status === 'rejected' && mom.reject_reason && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: '#FEE2E2', border: '1px solid #FCA5A5', color: C.red, fontSize: 13 }}><b>Alasan ditolak:</b> {mom.reject_reason}</div>
          )}
          {mom.status === 'approved' && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: C.green, fontWeight: 600 }}>Disetujui oleh {names[mom.approved_by] || '—'} · {fmtDate(mom.approved_at)}</div>
          )}
        </div>

        <Section badge="A" title="Review Action Plan">
          <ReadTable cols={['Action Plan', 'PIC', 'Target', 'Status']} rows={ap.filter(r => r.section === 'review')} render={r => (<>
            <td style={tdS}>{r.action_plan || '—'}</td><td style={tdS}>{r.pic || '—'}</td><td style={tdS}>{fmtDate(r.timeline)}</td><td style={tdS}><RowStatus value={r.status} /></td>
          </>)} />
        </Section>
        <Section badge="B" title="Weekly Progress Update">
          <ReadTable cols={['Aspek', 'Capaian', 'Target', 'Status']} rows={pu} render={r => (<>
            <td style={tdS}>{r.aspek || '—'}</td><td style={tdS}>{r.capaian || '—'}</td><td style={tdS}>{r.target || '—'}</td><td style={tdS}><RowStatus value={r.status} /></td>
          </>)} />
        </Section>
        <Section badge="C" title="Highlight Issue & Bottleneck">
          <ReadTable cols={['Issue', 'Dampak', 'Akar Masalah']} rows={iss} render={r => (<>
            <td style={tdS}>{r.issue || '—'}</td><td style={tdS}>{r.dampak || '—'}</td><td style={tdS}>{r.akar_masalah || '—'}</td>
          </>)} />
        </Section>
        <Section badge="D" title="Improvement Plan / SOP Review">
          <ReadTable cols={['Usulan', 'Catatan']} rows={imp} render={r => (<>
            <td style={tdS}>{r.usulan || '—'}</td><td style={tdS}>{r.catatan || '—'}</td>
          </>)} />
        </Section>
        <Section badge="F" title="Action Plan Baru">
          <ReadTable cols={['Action Plan', 'PIC', 'Timeline', 'Prioritas', 'Status']} rows={ap.filter(r => r.section === 'new')} render={r => (<>
            <td style={tdS}>{r.action_plan || '—'}</td><td style={tdS}>{r.pic || '—'}</td><td style={tdS}>{fmtDate(r.timeline)}</td><td style={tdS}>{prioritasLabel(r.prioritas)}</td><td style={tdS}><RowStatus value={r.status} /></td>
          </>)} />
        </Section>
        {mom.catatan_tambahan && (
          <Section badge="G" title="Catatan Tambahan">
            <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{mom.catatan_tambahan}</div>
          </Section>
        )}
      </div>

      {rejectOpen && <RejectModal momNo={mom.mom_no} onClose={() => setRejectOpen(false)} onSubmit={reject} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.navy}`, background: '#fff', color: C.navy, fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnSolid = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 10, border: 'none', color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer' };

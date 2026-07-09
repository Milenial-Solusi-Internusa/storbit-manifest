// src/modules/crm/LeadPoolApprovalPage.jsx
// Approval Lead Pool — manager/supervisor/admin meninjau request "Tarik ke
// Pipeline" (accounts.pull_status='pending'). Approve → prospect kembali ke
// pipeline di stage sebelumnya & keluar dari lead pool. Reject → tetap di pool.
// Akses di-gate di App.jsx (menu role + canRenderPage).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle2, XCircle, Loader2, ClipboardCheck, ChevronDown, ChevronUp, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  bg: '#F6EFE3', surface: '#FFFDF8', surface2: '#FBF6EC',
  ink: '#23291E', inkSoft: '#5E6553', inkFaint: '#8A8E7C',
  line: '#E7DCC8', lineSoft: '#F0E7D6', navy: '#1B4D8A', accent: '#E85A1E',
  green: '#1F8B4D', greenBg: '#DEF0E4', red: '#C0392B', redBg: '#FBE3E3',
};

const STAGE_LABEL = { NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', PROPOSAL: 'Proposal', NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost' };
const PREV_STAGE = { CONTACTED: 'NEW', QUALIFIED: 'CONTACTED', PROPOSAL: 'QUALIFIED', NEGOTIATION: 'PROPOSAL' };
const prevStageOf = (s) => PREV_STAGE[String(s || '').toUpperCase()] || 'NEW';

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ---------- Reject reason modal ---------- */
function RejectModal({ account, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  if (!account) return null;
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(19,35,59,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(480px, 100%)', boxShadow: '0 24px 64px rgba(19,35,59,0.28)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.line}`, background: C.surface2 }}>
          <XCircle size={18} color={C.red} />
          <h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 16, fontWeight: 700, color: C.ink, flex: 1 }}>Tolak Request</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>
        <div style={{ padding: 22 }}>
          <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 12 }}>Tolak request tarik <b style={{ color: C.ink }}>{account.name}</b> dari Lead Pool. Prospect tetap di pool.</div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, display: 'block' }}>Alasan (opsional)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="Alasan penolakan…"
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', outline: 'none', resize: 'vertical' }} />
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.line}`, background: C.surface2 }}>
          <button onClick={onClose} disabled={saving} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.inkSoft, fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
          <button onClick={async () => { setSaving(true); const ok = await onSubmit(account, reason.trim()); setSaving(false); if (ok) onClose(); }} disabled={saving}
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={15} />}Tolak
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function LeadPoolApprovalPage({ showToast }) {
  const { profile, erpRole } = useAuth();
  const isAllEntities = ['super_admin'].includes(erpRole);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!profile?.id) return undefined;
    if (!isAllEntities && !profile?.company_id) return undefined;
    let cancelled = false;
    setLoading(true);
    let query = supabase
      .from('accounts')
      .select('id, name, pipeline_stage, assigned_to, pull_requested_at, pull_justification, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)')
      .eq('pull_status', 'pending')
      .is('deleted_at', null);
    if (!isAllEntities) query = query.eq('company_id', profile.company_id);

    query.order('pull_requested_at', { ascending: true }).limit(1000).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { showToast?.('Gagal memuat request: ' + error.message, 'error'); setRows([]); }
      else setRows(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, showToast, reloadKey]);

  // Notify the prospect's assigned sales. Best-effort.
  const notifySales = useCallback(async (account, title, body) => {
    if (!account.assigned_to) return;
    try {
      await supabase.from('notifications').insert({
        company_id: profile.company_id,
        user_id: account.assigned_to,
        event_type: 'lead_pool_pull_result',
        title,
        body,
        reference_type: 'lead_pool',
        reference_id: account.id,
      });
    } catch (e) {
      console.error('[lead-pool] notify sales failed:', e?.message || e);
    }
  }, [profile?.company_id]);

  const handleApprove = useCallback(async (account) => {
    setBusyId(account.id);
    const newStage = prevStageOf(account.pipeline_stage);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('accounts').update({
      pull_status: 'approved',
      pull_approved_by: profile.id,
      pull_approved_at: nowIso,
      is_in_lead_pool: false,
      account_status: 'prospect',
      pipeline_stage: newStage,
      stage_changed_at: nowIso,
    }).eq('id', account.id);
    setBusyId(null);
    if (error) { showToast?.('Gagal approve: ' + error.message, 'error'); return; }
    await notifySales(account, 'Request Pull Disetujui',
      `Request pull ${account.name} disetujui. Prospect kembali ke pipeline stage ${STAGE_LABEL[newStage] || newStage}.`);
    showToast?.(`"${account.name}" dikembalikan ke pipeline (${STAGE_LABEL[newStage] || newStage})`, 'success');
    setRows(prev => prev.filter(r => r.id !== account.id));
  }, [profile?.id, showToast, notifySales]);

  const handleReject = useCallback(async (account, reason) => {
    const { error } = await supabase.from('accounts').update({ pull_status: 'rejected' }).eq('id', account.id);
    if (error) { showToast?.('Gagal reject: ' + error.message, 'error'); return false; }
    await notifySales(account, 'Request Pull Ditolak',
      `Request pull ${account.name} ditolak.${reason ? ' Alasan: ' + reason : ''}`);
    showToast?.(`Request "${account.name}" ditolak`, 'success');
    setRows(prev => prev.filter(r => r.id !== account.id));
    return true;
  }, [showToast, notifySales]);

  const count = useMemo(() => rows.length, [rows]);

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EAF0F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ClipboardCheck size={22} style={{ color: C.navy }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 24, fontWeight: 800, color: C.navy, margin: 0, letterSpacing: '-.4px' }}>Approval Lead Pool</h1>
          <p style={{ fontSize: 13.5, color: C.inkSoft, margin: '4px 0 0' }}>Request tarik prospect dari lead pool · {loading ? '…' : `${count} pending`}</p>
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                {['Nama Prospect', 'Stage Terakhir', 'Sales', 'Tanggal Request', 'Justifikasi', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 5 ? 'right' : 'left', padding: '11px 14px', fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '48px 14px', textAlign: 'center', color: C.inkFaint }}>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} /> &nbsp;Memuat request…
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '48px 14px', textAlign: 'center', color: C.inkFaint }}>Tidak ada request pending.</td></tr>
              ) : rows.map(r => {
                const isOpen = expanded === r.id;
                const just = r.pull_justification || '';
                const long = just.length > 60;
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: C.ink }}>{r.name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft }}>{STAGE_LABEL[String(r.pipeline_stage || '').toUpperCase()] || r.pipeline_stage || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft }}>{r.assigned_profile?.full_name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{fmtDateTime(r.pull_requested_at)}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft, maxWidth: 300 }}>
                      {just ? (
                        <>
                          <span>{isOpen || !long ? just : just.slice(0, 60) + '…'}</span>
                          {long && (
                            <button onClick={() => setExpanded(isOpen ? null : r.id)}
                              style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.navy, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              {isOpen ? <>Tutup <ChevronUp size={12} /></> : <>Selengkapnya <ChevronDown size={12} /></>}
                            </button>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button onClick={() => handleApprove(r)} disabled={busyId === r.id}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9, border: `1px solid ${C.green}33`, background: C.greenBg, color: C.green, fontSize: 12.5, fontWeight: 700, cursor: busyId === r.id ? 'wait' : 'pointer' }}>
                          {busyId === r.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}Approve
                        </button>
                        <button onClick={() => setRejectTarget(r)} disabled={busyId === r.id}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9, border: `1px solid ${C.red}33`, background: C.redBg, color: C.red, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                          <XCircle size={14} />Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RejectModal account={rejectTarget} onClose={() => setRejectTarget(null)} onSubmit={handleReject} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

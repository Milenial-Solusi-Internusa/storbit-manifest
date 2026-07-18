// src/modules/crm/DealPanels.jsx
/* eslint-disable react-refresh/only-export-components */
// This is a deliberate shared module: it exports panel COMPONENTS alongside the
// deal design tokens/helpers (STAGES, C, fmt*, saveDealUpdate) they need, so both
// DealDetailPage and CustomerDetailPage import from ONE source. Fast-refresh's
// "only export components" rule is disabled for this shared-module file on purpose.
// Tahap 3a — shared "deal" design system + panels, extracted verbatim from
// DealDetailPage so BOTH DealDetailPage (per-inquiry) and CustomerDetailPage
// (per-account) render identical panels. Components are PROPS-DRIVEN (no self
// fetch) so each page supplies data at whatever scope it wants.
// Single source: brand tokens (C), STAGES, formatters, and the small layout
// bits (Card/InfoRow) live here — pages import them instead of keeping copies.

import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Phone, BadgeCheck, FileText, Handshake, Trophy, XCircle,
  ChevronDown, Check, Pencil, X, ArrowRightLeft,
  Plus, Eye, Download, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';

export const HEAD = "'Montserrat', system-ui, sans-serif";
export const BODY = "'Inter', system-ui, sans-serif";

export const C = {
  navy: '#1B4D8A', navySoft: '#EAF0F8', orange: '#E85A1E', orangeSoft: '#FEF2EC',
  text: '#16243A', textMute: '#5E6553', textFaint: '#8A8E7C',
  surface: '#FFFFFF', surfaceAlt: '#FBF6EC',
  border: '#E7DCC8', borderStrong: '#D9CDB6',
  green: '#1F8B4D', greenBg: '#E4F0E5', greenBd: '#BFDDC4',
  red: '#C0392B', redBg: '#FBE3E3', redBd: '#ECC2BA',
  blue: '#2563EB', blueBg: '#E1ECF7', blueBd: '#BBD3EE',
  amber: '#B45309', amberBg: '#FBF0DD', amberBd: '#E6CE94',
  gray: '#6B7280', grayBg: '#EEEAE0', grayBd: '#DDD3BE',
};

export const STAGES = [
  { key: 'NEW',         label: 'New',         prob: 10,  Icon: Sparkles   },
  { key: 'CONTACTED',   label: 'Contacted',   prob: 20,  Icon: Phone      },
  { key: 'QUALIFIED',   label: 'Qualified',   prob: 40,  Icon: BadgeCheck },
  { key: 'PROPOSAL',    label: 'Proposal',    prob: 60,  Icon: FileText   },
  { key: 'NEGOTIATION', label: 'Negotiation', prob: 80,  Icon: Handshake  },
  { key: 'WON',         label: 'Won',         prob: 100, Icon: Trophy     },
  { key: 'LOST',        label: 'Lost',        prob: 0,   Icon: XCircle    },
];
export const stageIndex = (s) => {
  const i = STAGES.findIndex((x) => x.key === String(s || '').toUpperCase());
  return i < 0 ? 0 : i;
};

export const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
export const fmtCompact = (n) => {
  const v = Number(n || 0);
  if (v >= 1e9) return 'Rp ' + (v / 1e9).toFixed(v % 1e9 ? 1 : 0) + 'M';
  if (v >= 1e6) return 'Rp ' + Math.round(v / 1e6) + 'jt';
  return fmtRp(v);
};
export const fmtDate = (iso) => {
  if (!iso) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

const QUO_BADGE = {
  DRAFT:    { bg: C.grayBg,  fg: C.gray,  bd: C.grayBd  },
  SENT:     { bg: C.blueBg,  fg: C.blue,  bd: C.blueBd  },
  SUBMITTED:{ bg: C.blueBg,  fg: C.blue,  bd: C.blueBd  },
  ACCEPTED: { bg: C.greenBg, fg: C.green, bd: C.greenBd },
  REJECTED: { bg: C.redBg,   fg: C.red,   bd: C.redBd   },
};
const PRF_BADGE = {
  DRAFT:       { bg: C.grayBg,  fg: C.gray,  bd: C.grayBd  },
  SUBMITTED:   { bg: C.blueBg,  fg: C.blue,  bd: C.blueBd  },
  ACKNOWLEDGED:{ bg: C.amberBg, fg: C.amber, bd: C.amberBd },
  QUOTED:      { bg: C.greenBg, fg: C.green, bd: C.greenBd },
  CANCELLED:   { bg: C.redBg,   fg: C.red,   bd: C.redBd   },
  EXPIRED:     { bg: C.grayBg,  fg: C.gray,  bd: C.grayBd  },
};
// PRF service_type = moda transport (beda taksonomi dari inquiry SERVICE_LABEL).
const PRF_SERVICE_LABEL = {
  sea: 'Sea', air: 'Air', inland: 'Inland', project: 'Project', custom: 'Custom',
};

export function useIsMobile(bp = 760) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [bp]);
  return m;
}

// Sales/manager/supervisor/gm_bd of a company, via user_roles (profiles.role is dormant).
// Roster ASSIGNEE deal (operasional: siapa yang boleh pegang deal) → gm_bd ikut.
// Daftar sengaja LEBIH LUAS dari `./salesRoster` (yg cuma ['sales','gm_bd']) — jangan
// ditukar dgn helper itu, nanti manager & supervisor hilang dari dropdown ini.
export async function fetchAssignees(companyId) {
  const { data: roleRows } = await supabase
    .from('roles').select('id').eq('company_id', companyId).in('code', ['sales', 'manager', 'supervisor', 'gm_bd']);
  const roleIds = (roleRows || []).map((r) => r.id);
  if (!roleIds.length) return [];
  const { data: urs } = await supabase
    .from('user_roles').select('user_id')
    .eq('company_id', companyId).in('role_id', roleIds)
    .eq('is_active', true).is('revoked_at', null);
  const userIds = [...new Set((urs || []).map((u) => u.user_id).filter(Boolean))];
  if (!userIds.length) return [];
  const { data: profs } = await supabase
    .from('profiles').select('id, full_name').in('id', userIds)
    .eq('active', true).order('full_name').limit(1000);
  return profs || [];
}

// SINGLE write path for a deal/stage update — used by DealDetailPage AND
// CustomerDetailPage so the audit trail + toast behave identically. Returns bool.
export async function saveDealUpdate({ accountId, patch, auditStageKey, prevStage, accountName, actor, showToast }) {
  const { error } = await supabase.from('accounts').update(patch).eq('id', accountId);
  if (error) { showToast?.('Gagal menyimpan: ' + error.message, 'error'); return false; }
  if (auditStageKey) {
    logAudit(supabase, {
      action: ACTION_TYPES.CHANGE_PIPELINE_STAGE,
      entityType: ENTITY_TYPES.DEAL,
      entityId: accountId,
      entityLabel: accountName,
      notes: `${prevStage || 'NEW'} → ${auditStageKey}`,
    }, actor);
  }
  showToast?.('Perubahan disimpan', 'success');
  return true;
}

/* ---------- small layout helpers (shared) ---------- */
export function Card({ title, icon, right, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          {icon && <span style={{ color: C.navy, display: 'flex' }}>{icon}</span>}
          <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
export function InfoRow({ label, value, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text, lineHeight: 1.45 }}>{value || '—'}</div>
    </div>
  );
}

/* ---------- DealStepper (7-stage chevron pipeline) ---------- */
export function DealStepper({ current, value }) {
  const mobile = useIsMobile();
  if (mobile) {
    const s = STAGES[current];
    const SIcon = s.Icon;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 }}>
        <span style={{ width: 42, height: 42, borderRadius: 999, background: s.key === 'WON' ? C.green : s.key === 'LOST' ? C.red : C.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <SIcon size={20} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: BODY, fontSize: 11.5, fontWeight: 600, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step {current + 1} of {STAGES.length} · {s.prob}%</div>
          <div style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: C.navy }}>{s.label}</div>
          <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.textFaint }}>{fmtCompact(value)}</div>
        </div>
      </div>
    );
  }

  const D = 15;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {STAGES.map((s, i) => {
          const active = i === current;
          const completed = i < current;
          let bg = '#E5E7EB', fg = '#6B7280', opacity = 1;
          if (s.key === 'WON' && (active || completed)) { bg = C.green; fg = '#fff'; }
          else if (s.key === 'LOST' && active) { bg = C.red; fg = '#fff'; }
          else if (active) { bg = C.navy; fg = '#fff'; }
          else if (completed) { bg = C.navy; fg = '#fff'; opacity = 0.7; }

          const isFirst = i === 0;
          const isLast = i === STAGES.length - 1;
          const clip = isFirst
            ? `polygon(0 0, calc(100% - ${D}px) 0, 100% 50%, calc(100% - ${D}px) 100%, 0 100%)`
            : isLast
              ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${D}px 50%)`
              : `polygon(0 0, calc(100% - ${D}px) 0, 100% 50%, calc(100% - ${D}px) 100%, 0 100%, ${D}px 50%)`;

          return (
            <div key={s.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: isFirst ? 0 : -D, zIndex: STAGES.length - i }}>
              <div style={{
                boxSizing: 'border-box', height: 44, background: bg, color: fg, opacity,
                clipPath: clip, WebkitClipPath: clip,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: `0 ${D + 6}px`, transition: 'background .25s, color .25s, opacity .25s',
              }}>
                {completed && <Check size={14} strokeWidth={3} />}
                <span style={{ fontFamily: HEAD, fontSize: 11.5, fontWeight: active ? 800 : 600, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
              </div>
              <span style={{ height: 3, margin: `5px ${isLast ? 4 : D + 4}px 0 ${isFirst ? 4 : D + 4}px`, borderRadius: 999, background: active ? C.orange : 'transparent', transition: 'background .25s' }} />
              <div style={{ textAlign: 'center', padding: `4px ${isFirst ? 2 : D}px 0 ${isFirst ? 2 : D}px`, lineHeight: 1.35 }}>
                <div style={{ fontFamily: HEAD, fontSize: 12, fontWeight: 700, color: active ? C.navy : completed ? C.green : C.textMute }}>{s.prob}%</div>
                <div style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 600, color: C.textFaint, whiteSpace: 'nowrap' }}>{fmtCompact(value)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- DealHeaderControls (Nilai Deal + Edit + Pindah Stage) ---------- */
export function DealHeaderControls({ value, stageIdx, onEdit, onPickStage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: BODY, fontSize: 11.5, fontWeight: 600, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nilai Deal</div>
        <div style={{ fontFamily: HEAD, fontSize: 26, fontWeight: 800, color: C.navy, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{fmtRp(value)}</div>
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        <button onClick={onEdit} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.text, fontFamily: HEAD, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}><Pencil size={15} />Edit Deal</button>
        <div style={{ position: 'relative' }} ref={ref}>
          <button onClick={() => setOpen(!open)} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: C.navy, color: '#fff', fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ArrowRightLeft size={15} />Pindah Stage<ChevronDown size={14} />
          </button>
          {open && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(19,35,59,0.16)', padding: 7, width: 230, zIndex: 30 }}>
              <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '7px 11px 4px' }}>Pindahkan ke stage</div>
              {STAGES.map((s, i) => {
                const SIcon = s.Icon;
                return (
                  <button key={s.key} onClick={() => { onPickStage(i); setOpen(false); }} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: i === stageIdx ? C.surfaceAlt : 'transparent',
                    padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: BODY, fontSize: 13, color: C.text, textAlign: 'left',
                  }}>
                    <SIcon size={16} color={i === stageIdx ? C.navy : C.textMute} />
                    <span style={{ flex: 1, fontWeight: i === stageIdx ? 600 : 500 }}>{s.label.toUpperCase()}</span>
                    {i === stageIdx && <Check size={15} color={C.navy} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Edit Deal Modal ---------- */
export function EditDealModal({ open, initial, assignees, onClose, onSave }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setDraft(initial); }, [open, initial]);
  if (!open) return null;

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const labelStyle = { fontFamily: BODY, fontSize: 11.5, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' };
  const inputStyle = { width: '100%', boxSizing: 'border-box', fontFamily: BODY, fontSize: 14, color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: '10px 13px', outline: 'none', background: '#fff' };

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(19,35,59,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: 'min(520px, 100%)', boxShadow: '0 24px 64px rgba(19,35,59,0.28)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <span style={{ color: C.navy, display: 'flex' }}><Pencil size={18} strokeWidth={2.2} /></span>
          <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: C.text, flex: 1 }}>Edit Deal</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMute, display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Pipeline Stage</label>
            <select value={draft.stage} onChange={(e) => set('stage', parseInt(e.target.value, 10))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {STAGES.map((s, i) => <option key={s.key} value={i}>{s.label.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Assigned To</label>
            <select value={draft.assignedId || ''} onChange={(e) => set('assignedId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">— Pilih sales —</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Estimated Value</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontFamily: BODY, fontSize: 14, fontWeight: 600, color: C.textMute, pointerEvents: 'none' }}>Rp</span>
                <input type="number" min="0" value={draft.value} onChange={(e) => set('value', e.target.value === '' ? '' : Number(e.target.value))} style={{ ...inputStyle, paddingLeft: 38 }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Est. Closing Date</label>
              <input type="date" value={draft.closeDate || ''} onChange={(e) => set('closeDate', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>Nilai: <b style={{ color: C.navy }}>{fmtRp(draft.value || 0)}</b></div>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <button onClick={onClose} disabled={saving} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.textMute, fontFamily: HEAD, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={async () => { setSaving(true); const ok = await onSave(draft); setSaving(false); if (ok) onClose(); }}
            disabled={saving}
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: C.orange, color: '#fff', fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            {saving ? <Loader2 size={15} className="dd-spin" /> : <Check size={15} />}Save
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- QuotationListCard (flat, per-scope) ---------- */
// onCreate optional → tombol "Buat Quotation" hanya muncul bila disediakan.
export function QuotationListCard({ quotations, onCreate, onView }) {
  return (
    <Card
      title="Daftar Quotation"
      icon={<FileText size={17} />}
      right={onCreate ? (
        <button onClick={onCreate} style={{ height: 34, padding: '0 12px', borderRadius: 9, border: 'none', background: C.orange, color: '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} />Buat Quotation
        </button>
      ) : null}
    >
      {quotations.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Belum ada quotation</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['No', 'Quotation No', 'Tanggal', 'Nilai', 'Status', 'Aksi'].map((h) => (
                  <th key={h} style={{ textAlign: h === 'Nilai' ? 'right' : 'left', padding: '7px 8px', fontFamily: HEAD, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textFaint, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotations.map((q, i) => {
                const b = QUO_BADGE[String(q.status).toUpperCase()] || QUO_BADGE.DRAFT;
                return (
                  <tr key={q.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', color: C.textFaint }}>{i + 1}</td>
                    <td style={{ padding: '8px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>{q.quotation_no}</td>
                    <td style={{ padding: '8px', color: C.textMute, whiteSpace: 'nowrap' }}>{fmtDate(q.created_at)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRp(q.total_amount)}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: 99, background: b.bg, color: b.fg, border: `1px solid ${b.bd}`, fontFamily: HEAD, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{String(q.status).toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button title="Lihat detail" onClick={() => onView?.(q)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.navy, padding: 4 }}><Eye size={15} /></button>
                      <button title="Download (segera hadir)" disabled style={{ background: 'none', border: 'none', cursor: 'not-allowed', color: C.textFaint, padding: 4, opacity: 0.5 }}><Download size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---------- PrfListCard ---------- */
// canCreate + onCreate → tombol "Cetak PRF" (role check dilakukan pemanggil).
export function PrfListCard({ prfs, canCreate, onCreate }) {
  return (
    <Card
      title="Daftar PRF"
      icon={<FileText size={17} />}
      right={canCreate ? (
        <button onClick={() => onCreate?.()} style={{ height: 34, padding: '0 12px', borderRadius: 9, border: 'none', background: C.orange, color: '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FileText size={14} />Cetak PRF
        </button>
      ) : null}
    >
      {prfs.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Belum ada PRF</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['No', 'PRF No', 'Tanggal', 'Service Type', 'Status'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '7px 8px', fontFamily: HEAD, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textFaint, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prfs.map((p, i) => {
                const b = PRF_BADGE[String(p.status).toUpperCase()] || PRF_BADGE.DRAFT;
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', color: C.textFaint }}>{i + 1}</td>
                    <td style={{ padding: '8px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>{p.prf_no}</td>
                    <td style={{ padding: '8px', color: C.textMute, whiteSpace: 'nowrap' }}>{fmtDate(p.created_at)}</td>
                    <td style={{ padding: '8px', color: C.textMute, whiteSpace: 'nowrap' }}>{PRF_SERVICE_LABEL[p.service_type] || p.service_type || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: 99, background: b.bg, color: b.fg, border: `1px solid ${b.bd}`, fontFamily: HEAD, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{String(p.status).toUpperCase()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---------- PriceSummaryCard (derives best/min/max from quotations) ---------- */
export function PriceSummaryCard({ quotations, termMap }) {
  const accepted = quotations.find((q) => String(q.status).toUpperCase() === 'ACCEPTED');
  const best = accepted || [...quotations].sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0))[0] || null;
  const totals = quotations.map((q) => Number(q.total_amount || 0));
  const minT = totals.length ? Math.min(...totals) : null;
  const maxT = totals.length ? Math.max(...totals) : null;
  return (
    <Card title="Summary Harga" icon={<FileText size={17} />}>
      {!best ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.navy, borderRadius: 12, padding: '14px 16px', color: '#fff' }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>Best Quote</div>
            <div style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0' }}>{fmtRp(best.total_amount)}</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, opacity: 0.85 }}>{best.quotation_no}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <InfoRow label="Masa Berlaku" value={fmtDate(best.valid_until)} />
            <InfoRow label="Payment Terms" value={termMap?.[best.payment_terms_id]} />
            <InfoRow label="Rentang Penawaran" value={(minT != null && maxT != null) ? `${fmtRp(minT)} – ${fmtRp(maxT)}` : '—'} full />
          </div>
        </div>
      )}
    </Card>
  );
}

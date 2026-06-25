// src/modules/crm/DealDetailPage.jsx
// CRM — Detail Deal (per inquiry). Ported from the Lovable handoff, adapted to
// Nexus conventions: Lucide icons, shared supabase client, useAuth, brand
// tokens (navy #144682 / orange #E85A1E), Montserrat/Inter fonts.
//
// Props:
//   inquiryId          : string — inquiry to render
//   onBack             : () => void
//   onCreateQuotation  : () => void                 — open blank Quotation form
//   onViewQuotation    : (quotation) => void        — open Quotation detail
//   showToast          : (msg, type?) => void
//
// Data: inquiries + accounts (prospect) + quotations (WHERE inquiry_id) +
// activities (WHERE account_id = inquiry.prospect_id) + profiles + payment_terms.
// No DB schema change. Stage updates write accounts.pipeline_stage.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, Phone, BadgeCheck, FileText, Handshake, Trophy, XCircle,
  ChevronLeft, ChevronRight, ChevronDown, Check, Pencil, X, ArrowRightLeft,
  Hash, CalendarClock, Plus, Eye, Download, Loader2, AlertCircle,
  MessageCircle, MapPin, Users, Mail, ListChecks, Anchor,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';

const HEAD = "'Montserrat', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

const C = {
  navy: '#144682', navySoft: '#EAF0F8', orange: '#E85A1E', orangeSoft: '#FEF2EC',
  text: '#16243A', textMute: '#5E6553', textFaint: '#8A8E7C',
  surface: '#FFFFFF', surfaceAlt: '#FBF6EC',
  border: '#E7DCC8', borderStrong: '#D9CDB6',
  green: '#1F8B4D', greenBg: '#E4F0E5', greenBd: '#BFDDC4',
  red: '#C0392B', redBg: '#FBE3E3', redBd: '#ECC2BA',
  blue: '#2563EB', blueBg: '#E1ECF7', blueBd: '#BBD3EE',
  amber: '#B45309', amberBg: '#FBF0DD', amberBd: '#E6CE94',
  gray: '#6B7280', grayBg: '#EEEAE0', grayBd: '#DDD3BE',
};

const STAGES = [
  { key: 'NEW',         label: 'New',         prob: 10,  Icon: Sparkles   },
  { key: 'CONTACTED',   label: 'Contacted',   prob: 20,  Icon: Phone      },
  { key: 'QUALIFIED',   label: 'Qualified',   prob: 40,  Icon: BadgeCheck },
  { key: 'PROPOSAL',    label: 'Proposal',    prob: 60,  Icon: FileText   },
  { key: 'NEGOTIATION', label: 'Negotiation', prob: 80,  Icon: Handshake  },
  { key: 'WON',         label: 'Won',         prob: 100, Icon: Trophy     },
  { key: 'LOST',        label: 'Lost',        prob: 0,   Icon: XCircle    },
];
const stageIndex = (s) => {
  const i = STAGES.findIndex((x) => x.key === String(s || '').toUpperCase());
  return i < 0 ? 0 : i;
};

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtCompact = (n) => {
  const v = Number(n || 0);
  if (v >= 1e9) return 'Rp ' + (v / 1e9).toFixed(v % 1e9 ? 1 : 0) + 'M';
  if (v >= 1e6) return 'Rp ' + Math.round(v / 1e6) + 'jt';
  return fmtRp(v);
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

const SERVICE_LABEL = {
  freight_forwarding: 'Freight Forwarding',
  customs: 'Customs Clearance',
  trading: 'General Trading',
};
const QUO_BADGE = {
  DRAFT:    { bg: C.grayBg,  fg: C.gray,  bd: C.grayBd  },
  SENT:     { bg: C.blueBg,  fg: C.blue,  bd: C.blueBd  },
  SUBMITTED:{ bg: C.blueBg,  fg: C.blue,  bd: C.blueBd  },
  ACCEPTED: { bg: C.greenBg, fg: C.green, bd: C.greenBd },
  REJECTED: { bg: C.redBg,   fg: C.red,   bd: C.redBd   },
};
const ACT_ICON = {
  call: Phone, whatsapp: MessageCircle, visit: MapPin, meeting: Users,
  email: Mail, followup: ListChecks,
};

function useIsMobile(bp = 760) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [bp]);
  return m;
}

// Sales/manager/supervisor of a company, via user_roles (profiles.role is dormant).
async function fetchAssignees(companyId) {
  const { data: roleRows } = await supabase
    .from('roles').select('id').eq('company_id', companyId).in('code', ['sales', 'manager', 'supervisor']);
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

function Avatar({ name, size = 28 }) {
  const init = (name && name !== '—')
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '—';
  return (
    <span style={{ width: size, height: size, borderRadius: 999, background: C.navySoft, color: C.navy, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontFamily: HEAD, fontSize: size * 0.4, fontWeight: 700 }}>
      {init}
    </span>
  );
}

function StageBadge({ idx }) {
  const s = STAGES[idx] || STAGES[0];
  const tone = s.key === 'WON' ? { bg: C.greenBg, fg: C.green } : s.key === 'LOST' ? { bg: C.redBg, fg: C.red } : { bg: C.navySoft, fg: C.navy };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 99, background: tone.bg, color: tone.fg, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: tone.fg }} />{s.label}
    </span>
  );
}

/* ---------- Stepper (7-stage chevron pipeline) ---------- */
function Stepper({ current, value }) {
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

/* ---------- Edit Deal Modal ---------- */
function EditDealModal({ open, initial, assignees, onClose, onSave }) {
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

/* ---------- Header ---------- */
function Header({ name, stageIdx, inquiryNo, assignedName, closeDate, value, onBack, onEdit, onPickStage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute }}><ChevronLeft size={18} /></button>
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>Inquiry List</button>
        <ChevronRight size={14} color={C.textFaint} />
        <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>Detail Deal</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontFamily: HEAD, fontSize: 25, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{name || '—'}</h1>
            <StageBadge idx={stageIdx} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 600, color: C.navy, background: C.navySoft, padding: '4px 11px', borderRadius: 8 }}>
              <Hash size={13} />{inquiryNo || '—'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: BODY, fontSize: 13, color: C.textMute }}>
              <Avatar name={assignedName} size={26} />{assignedName || 'Belum di-assign'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 13, color: C.textMute }}>
              <CalendarClock size={15} color={C.textFaint} />Est. closing {fmtDate(closeDate)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: BODY, fontSize: 11.5, fontWeight: 600, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nilai Deal</div>
            <div style={{ fontFamily: HEAD, fontSize: 26, fontWeight: 800, color: C.navy, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{fmtRp(value)}</div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={onEdit} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.text, fontFamily: HEAD, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}><Pencil size={15} />Edit</button>
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
      </div>
    </div>
  );
}

/* ---------- small layout helpers ---------- */
function Card({ title, icon, right, children }) {
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
function InfoRow({ label, value, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text, lineHeight: 1.45 }}>{value || '—'}</div>
    </div>
  );
}

// Render a text[] (or null) as pills; "—" when empty.
function BadgeRow({ label, values, full }) {
  const arr = Array.isArray(values) ? values.filter(Boolean) : [];
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      {arr.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {arr.map((v) => (
            <span key={v} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.navy, background: C.navySoft, borderRadius: 7, padding: '3px 9px' }}>{v}</span>
          ))}
        </div>
      ) : <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text }}>—</div>}
    </div>
  );
}

/* ========================================================================= */
export default function DealDetailPage({ inquiryId, onBack, onCreateQuotation, onViewQuotation, showToast }) {
  const { profile, erpRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inquiry, setInquiry] = useState(null);
  const [account, setAccount] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [activities, setActivities] = useState([]);
  const [profMap, setProfMap] = useState({});
  const [termMap, setTermMap] = useState({});
  const [assignees, setAssignees] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!inquiryId) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data: inq, error: e1 } = await supabase
        .from('inquiries')
        .select('id, inquiry_no, service_type, route, commodity, estimated_volume, status, notes, prospect_id, created_by, created_at, deadline_quote, pol, pod, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, cargo_types, un_number, imo_class, has_msds, additional_services')
        .eq('id', inquiryId).is('deleted_at', null).maybeSingle();
      if (cancelled) return;
      if (e1 || !inq) { setNotFound(true); setLoading(false); return; }

      let acc = null;
      if (inq.prospect_id) {
        const { data } = await supabase
          .from('accounts')
          .select('id, name, pipeline_stage, estimated_value, assigned_profile, assigned_to, pic_name, estimated_closing_date')
          .eq('id', inq.prospect_id).maybeSingle();
        acc = data || null;
      }

      const { data: quos } = await supabase
        .from('quotations')
        .select('id, quotation_no, total_amount, status, valid_until, created_at, payment_terms_id')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000);

      let acts = [];
      if (inq.prospect_id) {
        const { data } = await supabase
          .from('activities')
          .select('id, type, status, notes, outcome, contact_name, prospect_name, scheduled_for, created_at')
          .eq('account_id', inq.prospect_id).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(5);
        acts = data || [];
      }

      // resolve profile names (assigned_profile, assigned_to, created_by)
      const pIds = [...new Set([acc?.assigned_profile, acc?.assigned_to, inq.created_by].filter(Boolean))];
      const pMap = {};
      if (pIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', pIds).limit(1000);
        (profs || []).forEach((p) => { pMap[p.id] = p.full_name; });
      }

      // resolve payment terms names
      const tIds = [...new Set((quos || []).map((q) => q.payment_terms_id).filter(Boolean))];
      const tMap = {};
      if (tIds.length) {
        const { data: terms } = await supabase.from('payment_terms').select('id, name').in('id', tIds).limit(1000);
        (terms || []).forEach((t) => { tMap[t.id] = t.name; });
      }

      if (cancelled) return;
      setInquiry(inq);
      setAccount(acc);
      setQuotations(quos || []);
      setActivities(acts);
      setProfMap(pMap);
      setTermMap(tMap);
      setLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setNotFound(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [inquiryId, reloadKey]);

  // assignees for the Edit modal (company-scoped)
  useEffect(() => {
    if (!profile?.company_id) return undefined;
    let cancelled = false;
    fetchAssignees(profile.company_id).then((a) => { if (!cancelled) setAssignees(a); });
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  const stageIdx = stageIndex(account?.pipeline_stage);
  const estValue = Number(account?.estimated_value || 0);
  const assignedName = profMap[account?.assigned_profile] || profMap[account?.assigned_to] || null;
  const createdByName = profMap[inquiry?.created_by] || null;

  // Update accounts row (used by both Edit modal & Pindah Stage). Returns boolean.
  async function updateAccount(patch, auditStageKey) {
    if (!account?.id) { showToast?.('Prospect tidak ditemukan untuk deal ini', 'error'); return false; }
    const { error } = await supabase.from('accounts').update(patch).eq('id', account.id);
    if (error) { showToast?.('Gagal menyimpan: ' + error.message, 'error'); return false; }
    if (auditStageKey) {
      logAudit(supabase, {
        action: ACTION_TYPES.CHANGE_PIPELINE_STAGE,
        entityType: ENTITY_TYPES.DEAL,
        entityId: account.id,
        entityLabel: account.name,
        notes: `${account.pipeline_stage || 'NEW'} → ${auditStageKey}`,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    }
    showToast?.('Perubahan disimpan', 'success');
    refetch();
    return true;
  }

  function pickStage(i) {
    const key = STAGES[i].key;
    if (key === (account?.pipeline_stage || 'NEW')) return;
    updateAccount({ pipeline_stage: key }, key);
  }

  async function saveEdit(draft) {
    return updateAccount({
      pipeline_stage: STAGES[draft.stage].key,
      assigned_profile: draft.assignedId || null,
      estimated_value: draft.value === '' ? 0 : Number(draft.value),
      estimated_closing_date: draft.closeDate || null,
    });
  }

  // ── loading / not-found ──
  if (loading) {
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textFaint, fontFamily: BODY }}>
        <Loader2 size={30} className="dd-spin" />
        <div style={{ fontSize: 13.5 }}>Memuat detail deal…</div>
        <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}`}</style>
      </div>
    );
  }
  if (notFound || !inquiry) {
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textMute, fontFamily: BODY }}>
        <AlertCircle size={30} color={C.red} />
        <div style={{ fontFamily: HEAD, fontSize: 16, fontWeight: 700, color: C.text }}>Inquiry tidak ditemukan</div>
        <button onClick={onBack} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}><ChevronLeft size={15} />Kembali</button>
      </div>
    );
  }

  // ── price summary derivations ──
  const accepted = quotations.find((q) => String(q.status).toUpperCase() === 'ACCEPTED');
  const best = accepted || [...quotations].sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0))[0] || null;
  const totals = quotations.map((q) => Number(q.total_amount || 0));
  const minT = totals.length ? Math.min(...totals) : null;
  const maxT = totals.length ? Math.max(...totals) : null;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: BODY, color: C.text }}>
      <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}`}</style>

      <Stepper current={stageIdx} value={estValue} />

      <Header
        name={account?.name}
        stageIdx={stageIdx}
        inquiryNo={inquiry.inquiry_no}
        assignedName={assignedName}
        closeDate={account?.estimated_closing_date}
        value={estValue}
        onBack={onBack}
        onEdit={() => setEditOpen(true)}
        onPickStage={pickStage}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 20, alignItems: 'start' }} className="dd-cols">
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <Card title="Detail Inquiry" icon={<FileText size={17} />}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ padding: '4px 11px', borderRadius: 99, background: C.orangeSoft, color: C.orange, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700 }}>
                {SERVICE_LABEL[inquiry.service_type] || inquiry.service_type || '—'}
              </span>
              <span style={{ padding: '4px 11px', borderRadius: 99, background: C.navySoft, color: C.navy, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700 }}>
                {inquiry.status || 'OPEN'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
              <InfoRow label="Jenis Layanan" value={SERVICE_LABEL[inquiry.service_type] || inquiry.service_type} />
              <InfoRow label="Status" value={inquiry.status} />
              {/* POL → POD */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Anchor size={15} color={C.navy} />
                    <span style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 600, color: C.text }}>{inquiry.pol || '—'}</span>
                  </span>
                  <ChevronRight size={15} color={C.textFaint} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={15} color={C.orange} />
                    <span style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 600, color: C.text }}>{inquiry.pod || '—'}</span>
                  </span>
                </div>
              </div>
              <BadgeRow label="Incoterm" values={inquiry.incoterms} />
              <BadgeRow label="Jenis Kontainer" values={inquiry.container_types} />
              <InfoRow label="Nama Barang" value={inquiry.goods_name} />
              <InfoRow label="HS Code" value={inquiry.hs_code} />
              <InfoRow label="Berat Total (KG)" value={inquiry.weight_kg != null ? String(inquiry.weight_kg) : ''} />
              <InfoRow label="Volume (CBM)" value={inquiry.volume_cbm != null ? String(inquiry.volume_cbm) : ''} />
              <BadgeRow label="Cargo Type" values={inquiry.cargo_types} />
              <BadgeRow label="Layanan Tambahan" values={inquiry.additional_services} />
              <InfoRow label="Deadline Quote" value={inquiry.deadline_quote ? fmtDate(inquiry.deadline_quote) : ''} />
              <InfoRow label="Route" value={inquiry.route} />
              <InfoRow label="Komoditas" value={inquiry.commodity} />
              <InfoRow label="Estimasi Volume" value={inquiry.estimated_volume} />
              <InfoRow label="Dibuat Oleh" value={createdByName} />
              <InfoRow label="Tanggal Dibuat" value={fmtDate(inquiry.created_at)} />
              <InfoRow label="Notes" value={inquiry.notes} full />
            </div>
          </Card>

          <Card title="Aktivitas Terkait" icon={<ListChecks size={17} />}>
            {activities.length === 0 ? (
              <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Belum ada aktivitas</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activities.map((a) => {
                  const AIcon = ACT_ICON[a.type] || ListChecks;
                  return (
                    <div key={a.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <span style={{ width: 32, height: 32, borderRadius: 9, background: C.navySoft, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><AIcon size={15} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 600, color: C.text }}>
                          {(a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1) : 'Aktivitas')}{a.contact_name ? ` · ${a.contact_name}` : ''}
                        </div>
                        {(a.notes || a.outcome) && <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, lineHeight: 1.4 }}>{a.notes || a.outcome}</div>}
                        <div style={{ fontFamily: BODY, fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{fmtDate(a.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <Card
            title="Daftar Quotation"
            icon={<FileText size={17} />}
            right={(
              <button onClick={onCreateQuotation} style={{ height: 34, padding: '0 12px', borderRadius: 9, border: 'none', background: C.orange, color: '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} />Buat Quotation
              </button>
            )}
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
                            <button title="Lihat detail" onClick={() => onViewQuotation?.(q)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.navy, padding: 4 }}><Eye size={15} /></button>
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
                  <InfoRow label="Payment Terms" value={termMap[best.payment_terms_id]} />
                  <InfoRow label="Rentang Penawaran" value={(minT != null && maxT != null) ? `${fmtRp(minT)} – ${fmtRp(maxT)}` : '—'} full />
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <EditDealModal
        open={editOpen}
        initial={{ stage: stageIdx, assignedId: account?.assigned_profile || '', value: estValue, closeDate: account?.estimated_closing_date || '' }}
        assignees={assignees}
        onClose={() => setEditOpen(false)}
        onSave={saveEdit}
      />

      <style>{`@media (max-width: 860px){ .dd-cols{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

// src/modules/crm/ActivitiesPage.jsx
// Activities — single entry point for all sales activities (call / whatsapp / visit /
// meeting / email / follow-up) on the `activities` table. Replaces SalesCallsPage as the
// component for the crm-calls route. Visual pattern follows SalesCallsPage.jsx
// (warm-beige C tokens, badge maps, detail modal, client-side pagination).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, Eye, Check, Activity, X, Pencil, UserPlus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import ConfirmModal from '../../components/ConfirmModal';

// Resolve active 'sales' users for a company via RBAC (roles.code='sales'),
// never a hardcoded role_id. Conditions: same company, user_roles active +
// not revoked. Returns [{ id, full_name }] (active profiles only).
// (Same convention as SalesCallsPage — kept local, no new shared module.)
async function fetchSalesProfiles(companyId) {
  const { data: roleRows } = await supabase
    .from('roles').select('id').eq('company_id', companyId).eq('code', 'sales');
  const roleIds = (roleRows || []).map(r => r.id);
  if (!roleIds.length) return [];
  const { data: urs } = await supabase
    .from('user_roles').select('user_id')
    .eq('company_id', companyId).in('role_id', roleIds)
    .eq('is_active', true).is('revoked_at', null);
  const userIds = [...new Set((urs || []).map(u => u.user_id).filter(Boolean))];
  if (!userIds.length) return [];
  const { data: profs } = await supabase
    .from('profiles').select('id, full_name').in('id', userIds)
    .eq('active', true).order('full_name').limit(1000);
  return profs || [];
}

const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  navy:      '#144682',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  ok:        '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  warn:      '#9A6B0E', warnBg: '#F8ECCF', warnBd: '#E6CE94',
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
};

// Activity type — badge colours: call=biru, whatsapp=hijau, visit=ungu,
// meeting=navy, email=amber, followup=slate. (no dark green)
const TYPE_META = {
  call:     { label: 'Call',      bg: '#E1ECF7', color: '#2563EB', bd: '#BBD3EE' },
  whatsapp: { label: 'WhatsApp',  bg: '#E4F0E5', color: '#2E7D4F', bd: '#BFDDC4' },
  visit:    { label: 'Visit',     bg: '#EFE7F6', color: '#7C3AED', bd: '#D6C6EC' },
  meeting:  { label: 'Meeting',   bg: '#E1ECF5', color: '#144682', bd: '#BAD2E6' },
  email:    { label: 'Email',     bg: '#F8ECCF', color: '#9A6B0E', bd: '#E6CE94' },
  followup: { label: 'Follow-up', bg: '#EEF0F3', color: '#51607A', bd: '#CDD5E1' },
};
const TYPE_FORM = [
  { value: 'call',     label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visit',    label: 'Visit' },
  { value: 'meeting',  label: 'Meeting' },
  { value: 'email',    label: 'Email' },
  { value: 'followup', label: 'Follow-up' },
];

// Status — todo (abu outline), done (hijau), cancelled (merah outline).
const STATUS_META = {
  todo:      { label: 'To Do',      bg: 'transparent', color: C.inkSoft, bd: C.neutralBd },
  done:      { label: 'Selesai',    bg: C.okBg,        color: C.ok,      bd: C.okBd     },
  cancelled: { label: 'Dibatalkan', bg: 'transparent', color: C.danger,  bd: C.dangerBd },
};

const PAGE_SIZE = 20;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthBounds() {
  const d = new Date();
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { start, end: endStr };
}
function weekBounds() {
  // ISO week — Monday start.
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;          // 0 = Monday … 6 = Sunday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const f = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: f(monday), end: f(sunday) };
}
function accountLabel(a, prospectName) {
  return (a && a.name) || prospectName || '—';
}

function Badge({ meta }) {
  if (!meta) return <span style={{ color: '#D1D5DB' }}>—</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99,
      fontSize: 11.5, fontWeight: 700, letterSpacing: '.3px',
      border: `1px solid ${meta.bd}`, background: meta.bg, color: meta.color,
    }}>
      {meta.label}
    </span>
  );
}

function StatCard({ label, value, unit, accent }) {
  return (
    <div style={{ flex: '1 1 180px', background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 6px rgba(35,41,30,.05)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: accent, fontFamily: "'IBM Plex Mono',monospace" }}>{value}</span>
        {unit && <span style={{ fontSize: 12.5, color: C.inkFaint }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ── Detail modal ── */
const DField = ({ label, value, mono, full }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: full ? '1 / -1' : undefined }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
    <div style={{ fontSize: 13.5, color: value ? C.ink : '#D1D5DB', fontStyle: value ? 'normal' : 'italic', fontFamily: mono ? "'IBM Plex Mono',monospace" : 'inherit', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
  </div>
);
const DSection = ({ title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${C.lineSoft}` }}>{title}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>{children}</div>
  </div>
);

// Build an edit draft from a mapped activity row (reverse of the list mapping).
function actToDraft(act) {
  return {
    type:             act.type || 'call',
    scheduled_for:    act.scheduled_for || '',
    activity_time:    act.activity_time ? String(act.activity_time).slice(0, 5) : '',
    assigned_to:      act.assigned_to || '',
    account_id:       act.account_id || '',
    contact_name:     act.contact_name || '',
    contact_phone:    act.contact_phone || '',
    outcome:          act.outcome || '',
    notes:            act.notes || '',
    next_action:      act.next_action || '',
    next_action_date: act.next_action_date || '',
    location:         act.details?.location || '',
  };
}

function ActivityDetailModal({ act, canEdit, isSuperAdmin, salesProfiles, accounts, saving, error, onEnterEdit, onSave, onCancel, onMarkDone, onDelete, onClose }) {
  const [mode, setMode] = useState('view');
  const [draft, setDraft] = useState(null);

  // Reset to view whenever a different activity is opened.
  useEffect(() => { setMode('view'); setDraft(null); }, [act?.id]);

  if (!act) return null;

  const startEdit = () => { setDraft(actToDraft(act)); setMode('edit'); onEnterEdit?.(); };
  const upd = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const inpStyle = {
    width: '100%', height: 38, borderRadius: 8, border: `1px solid ${C.line}`,
    padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box', background: C.surface,
  };
  const selStyle = { ...inpStyle, cursor: 'pointer' };
  const taStyle = {
    width: '100%', borderRadius: 8, border: `1px solid ${C.line}`, padding: '8px 12px',
    fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: C.surface,
  };
  const lbl = (text, req) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
      {text}{req && <span style={{ color: C.danger }}> *</span>}
    </div>
  );

  const isEdit = mode === 'edit' && draft;
  const needContact = isEdit && ['call', 'whatsapp'].includes(draft.type);
  const needLocation = isEdit && ['visit', 'meeting'].includes(draft.type);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, maxWidth: 620, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: `1px solid ${C.line}` }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 6 }}>{isEdit ? 'EDIT AKTIVITAS' : 'DETAIL AKTIVITAS'}</div>
              <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: C.ink, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2 }}>
                {accountLabel(act.account, act.prospect_name)}
              </h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge meta={TYPE_META[act.type]} />
                <Badge meta={STATUS_META[act.status]} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {!isEdit && canEdit && (
                <button onClick={startEdit} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: C.navy, color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button onClick={onClose} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={16} color={C.inkSoft} />
              </button>
            </div>
          </div>
        </div>

        {!isEdit ? (
          <div style={{ padding: '20px 28px 28px' }}>
            <DSection title="Info Aktivitas">
              <DField label="Tanggal"     value={fmtDate(act.scheduled_for)} mono />
              <DField label="Waktu"       value={fmtTime(act.activity_time)} mono />
              <DField label="Salesperson" value={act.salesperson_name} />
              <DField label="Lokasi"      value={act.details?.location} />
            </DSection>
            <DSection title="Kontak">
              <DField label="Prospect Name" value={act.prospect_name} />
              <DField label="Contact Name"  value={act.contact_name} />
              <DField label="Contact Phone" value={act.contact_phone} mono />
            </DSection>
            {(act.notes || act.outcome) && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.lineSoft}` }}>Catatan / Outcome</div>
                <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: C.surface2, borderRadius: 8, padding: '10px 14px' }}>{act.outcome || act.notes}</div>
              </div>
            )}
            <DSection title="Tindak Lanjut">
              <DField label="Next Action"      value={act.next_action} full />
              <DField label="Next Action Date" value={act.next_action_date ? fmtDate(act.next_action_date) : null} mono />
            </DSection>
            {(act.status === 'todo' || isSuperAdmin) && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, marginTop: 4, borderTop: `1px solid ${C.lineSoft}` }}>
                {isSuperAdmin && (
                  <button onClick={onDelete} style={{ marginRight: 'auto', padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.dangerBd}`, background: 'transparent', color: C.danger, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Hapus
                  </button>
                )}
                {act.status === 'todo' && (
                  <button onClick={onMarkDone} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, border: 'none', background: C.navy, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Check size={15} /> Tandai Selesai
                  </button>
                )}
                {act.status === 'todo' && canEdit && (
                  <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.dangerBd}`, background: 'transparent', color: C.danger, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Batalkan Aktivitas
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '20px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {lbl('Tipe', true)}
                <select value={draft.type} onChange={e => upd('type', e.target.value)} style={selStyle}>
                  {TYPE_FORM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                {lbl('Salesperson', true)}
                <select value={draft.assigned_to} onChange={e => upd('assigned_to', e.target.value)} style={selStyle}>
                  <option value="">— Pilih sales —</option>
                  {salesProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {lbl('Tanggal', true)}
                <input type="date" value={draft.scheduled_for} onChange={e => upd('scheduled_for', e.target.value)} style={inpStyle} />
              </div>
              <div>
                {lbl('Waktu')}
                <input type="time" value={draft.activity_time} onChange={e => upd('activity_time', e.target.value)} style={inpStyle} />
              </div>
            </div>

            <div>
              {lbl('Account (Customer / Prospek)')}
              <select value={draft.account_id} onChange={e => upd('account_id', e.target.value)} style={selStyle}>
                <option value="">— Opsional —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {needContact && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  {lbl('Contact Name')}
                  <input value={draft.contact_name} onChange={e => upd('contact_name', e.target.value)} style={inpStyle} placeholder="Nama kontak" />
                </div>
                <div>
                  {lbl('Contact Phone')}
                  <input value={draft.contact_phone} onChange={e => upd('contact_phone', e.target.value)} style={inpStyle} placeholder="08xx…" />
                </div>
              </div>
            )}

            {needLocation && (
              <div>
                {lbl('Lokasi')}
                <input value={draft.location} onChange={e => upd('location', e.target.value)} style={inpStyle} placeholder="Lokasi visit / meeting" />
              </div>
            )}

            <div>
              {lbl('Catatan')}
              <textarea value={draft.notes} onChange={e => upd('notes', e.target.value)} rows={3} style={taStyle} placeholder="Catatan / agenda…" />
            </div>

            <div>
              {lbl('Outcome')}
              <textarea value={draft.outcome} onChange={e => upd('outcome', e.target.value)} rows={2} style={taStyle} placeholder="Hasil aktivitas…" />
            </div>

            <div>
              {lbl('Next Action')}
              <textarea value={draft.next_action} onChange={e => upd('next_action', e.target.value)} rows={2} style={taStyle} placeholder="Tindak lanjut berikutnya…" />
            </div>

            <div>
              {lbl('Next Action Date')}
              <input type="date" value={draft.next_action_date} onChange={e => upd('next_action_date', e.target.value)} style={inpStyle} />
            </div>

            {error && <div style={{ background: C.dangerBg, color: C.danger, padding: '9px 13px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={() => setMode('view')} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Batal
              </button>
              <button onClick={() => onSave?.(draft)} disabled={saving} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: C.navy, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add task modal ── */
const EMPTY_TASK = {
  type: 'call', scheduled_for: todayStr(), activity_time: '', assigned_to: '',
  account_id: '', contact_name: '', contact_phone: '',
  location: '', notes: '', next_action: '', next_action_date: '',
};

function TaskFormModal({ open, draft, setDraft, saving, error, accounts, salesProfiles, onClose, onSave }) {
  if (!open) return null;
  const needContact = ['call', 'whatsapp'].includes(draft.type);
  const needLocation = ['visit', 'meeting'].includes(draft.type);

  const inpStyle = {
    width: '100%', height: 38, borderRadius: 8, border: `1px solid ${C.line}`,
    padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box', background: C.surface,
  };
  const selStyle = { ...inpStyle, cursor: 'pointer' };
  const taStyle = {
    width: '100%', borderRadius: 8, border: `1px solid ${C.line}`, padding: '8px 12px',
    fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: C.surface,
  };
  const lbl = (text, req) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
      {text}{req && <span style={{ color: C.danger }}> *</span>}
    </div>
  );
  const upd = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 18, padding: 28, maxWidth: 560, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.ink, fontFamily: "'Montserrat',sans-serif" }}>Tambah Task</h2>
          <button onClick={onClose} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={C.inkSoft} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Tipe', true)}
              <select value={draft.type} onChange={e => upd('type', e.target.value)} style={selStyle}>
                {TYPE_FORM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              {lbl('Salesperson', true)}
              <select value={draft.assigned_to} onChange={e => upd('assigned_to', e.target.value)} style={selStyle}>
                <option value="">— Pilih sales —</option>
                {salesProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Tanggal', true)}
              <input type="date" value={draft.scheduled_for} onChange={e => upd('scheduled_for', e.target.value)} style={inpStyle} />
            </div>
            <div>
              {lbl('Waktu')}
              <input type="time" value={draft.activity_time} onChange={e => upd('activity_time', e.target.value)} style={inpStyle} />
            </div>
          </div>

          <div>
            {lbl('Account (Customer / Prospek)')}
            <select value={draft.account_id} onChange={e => upd('account_id', e.target.value)} style={selStyle}>
              <option value="">— Opsional —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {needContact && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {lbl('Contact Name')}
                <input value={draft.contact_name} onChange={e => upd('contact_name', e.target.value)} style={inpStyle} placeholder="Nama kontak" />
              </div>
              <div>
                {lbl('Contact Phone')}
                <input value={draft.contact_phone} onChange={e => upd('contact_phone', e.target.value)} style={inpStyle} placeholder="08xx…" />
              </div>
            </div>
          )}

          {needLocation && (
            <div>
              {lbl('Lokasi')}
              <input value={draft.location} onChange={e => upd('location', e.target.value)} style={inpStyle} placeholder="Lokasi visit / meeting" />
            </div>
          )}

          <div>
            {lbl('Notes')}
            <textarea value={draft.notes} onChange={e => upd('notes', e.target.value)} rows={3} style={taStyle} placeholder="Catatan / agenda…" />
          </div>

          <div>
            {lbl('Next Action')}
            <textarea value={draft.next_action} onChange={e => upd('next_action', e.target.value)} rows={2} style={taStyle} placeholder="Tindak lanjut berikutnya…" />
          </div>

          <div>
            {lbl('Next Action Date')}
            <input type="date" value={draft.next_action_date} onChange={e => upd('next_action_date', e.target.value)} style={inpStyle} />
          </div>

          {error && <div style={{ background: C.dangerBg, color: C.danger, padding: '9px 13px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Batal
            </button>
            <button onClick={onSave} disabled={saving} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: C.navy, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Menyimpan…' : 'Simpan Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ActivitiesPage({ showToast, setActiveMenu, setShowProspectForm, setEditingProspect }) {
  const { profile, erpRole, user } = useAuth();
  // Visibility scope by role (mirrors RLS on `activities`):
  //  • super_admin / admin → all entities (no company filter)
  //  • sales / operations  → only activities assigned to or created by them
  //  • everyone else (manager, ceo, gm, …) → their own entity
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);
  // Mirrors DB is_manager_or_above() (incl. supervisor). Edit allowed for
  // manager+ or the activity's own assignee.
  const isManagerOrAbove = ['super_admin', 'admin', 'ceo', 'gm', 'manager', 'supervisor'].includes(erpRole);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('this_month'); // today | this_week | this_month | custom | all
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterSales, setFilterSales] = useState('all');
  const [page, setPage] = useState(0);

  const [detail, setDetail] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [confirmProspect, setConfirmProspect] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // form modal
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_TASK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [salesProfiles, setSalesProfiles] = useState([]);

  const fetchActivities = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      // account_id has an FK to accounts so the account name embeds; assigned_to
      // does NOT have a profiles FK → salesperson name resolved via client map.
      let query = supabase
        .from('activities')
        .select(`
          *,
          account:accounts!activities_account_id_fkey(name)
        `)
        .is('deleted_at', null);

      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      if (isSalesOnly)    query = query.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);

      const { data, error } = await query
        .order('scheduled_for', { ascending: false })
        .order('activity_time', { ascending: false })
        .limit(1000);
      if (error) throw error;

      // Resolve salesperson names (no profiles FK on assigned_to). Fetch ALL
      // referenced profiles regardless of active flag so inactive/legacy sales
      // still render in the list.
      const list = data || [];
      const salesIds = [...new Set(list.map(a => a.assigned_to).filter(Boolean))];
      const nameMap = {};
      if (salesIds.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name').in('id', salesIds);
        (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
      }

      setRows(list.map(a => ({
        id:               a.id,
        type:             a.type,
        status:           a.status,
        scheduled_for:    a.scheduled_for,
        activity_time:    a.activity_time,
        account:          a.account,
        account_id:       a.account_id,
        prospect_name:    a.prospect_name,
        contact_name:     a.contact_name,
        contact_phone:    a.contact_phone,
        outcome:          a.outcome,
        notes:            a.notes,
        next_action:      a.next_action,
        next_action_date: a.next_action_date,
        details:          a.details || {},
        assigned_to:      a.assigned_to,
        salesperson_name: a.assigned_to ? (nameMap[a.assigned_to] || null) : null,
        completed_at:     a.completed_at,
      })));
    } catch (err) {
      showToast?.('Gagal memuat data activity: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, showToast]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);
  useEffect(() => { setPage(0); }, [search, filterType, filterStatus, filterDate, customFrom, customTo, filterSales]);

  // Load account + salesperson options for the form (called when modal opens).
  const loadFormOptions = useCallback(async () => {
    if (!profile?.company_id) return;
    const [aRes, sales] = await Promise.all([
      supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).in('account_status', ['prospect', 'customer']).is('deleted_at', null).order('name').limit(1000),
      fetchSalesProfiles(profile.company_id),
    ]);
    setAccounts(aRes.data || []);
    setSalesProfiles(sales);
  }, [profile?.company_id]);

  // Sales dropdown (filter bar) also needs the sales list — load once.
  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    fetchSalesProfiles(profile.company_id).then(s => { if (!cancelled) setSalesProfiles(s); });
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  // ── stats (current month) ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const { start, end } = monthBounds();
    const monthRows = rows.filter(r => r.scheduled_for >= start && r.scheduled_for <= end);
    return {
      total: monthRows.length,
      todo: rows.filter(r => r.status === 'todo').length,
      done: monthRows.filter(r => r.status === 'done').length,
    };
  }, [rows]);

  // ── client-side filtering ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let range = null;
    if (filterDate === 'today')      range = { start: todayStr(), end: todayStr() };
    else if (filterDate === 'this_week')  range = weekBounds();
    else if (filterDate === 'this_month') range = monthBounds();
    else if (filterDate === 'custom') range = { start: customFrom || '0000-01-01', end: customTo || '9999-12-31' };

    return rows.filter(r => {
      if (filterType !== 'all' && r.type !== filterType) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterSales !== 'all' && r.assigned_to !== filterSales) return false;
      if (range && !(r.scheduled_for >= range.start && r.scheduled_for <= range.end)) return false;
      if (q) {
        const hay = `${r.account?.name || ''} ${r.prospect_name || ''} ${r.contact_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterType, filterStatus, filterDate, customFrom, customTo, filterSales]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // ── add task ───────────────────────────────────────────────────────────────
  const openAdd = () => {
    setDraft({ ...EMPTY_TASK, scheduled_for: todayStr(), assigned_to: profile?.id || '' });
    setFormError(null);
    setFormOpen(true);
    loadFormOptions();
  };

  const handleSave = useCallback(async () => {
    if (!draft.type)          { setFormError('Tipe wajib dipilih.'); return; }
    if (!draft.scheduled_for) { setFormError('Tanggal wajib diisi.'); return; }
    if (!draft.assigned_to)   { setFormError('Salesperson wajib dipilih.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const needContact = ['call', 'whatsapp'].includes(draft.type);
      const needLocation = ['visit', 'meeting'].includes(draft.type);
      const payload = {
        type:             draft.type,
        status:           'todo',
        scheduled_for:    draft.scheduled_for,
        activity_time:    draft.activity_time     || null,
        assigned_to:      draft.assigned_to,
        account_id:       draft.account_id        || null,
        contact_name:     needContact ? (draft.contact_name  || null) : null,
        contact_phone:    needContact ? (draft.contact_phone || null) : null,
        notes:            draft.notes             || null,
        next_action:      draft.next_action       || null,
        next_action_date: draft.next_action_date  || null,
        details:          needLocation ? { location: draft.location || null } : {},
        company_id:       profile.company_id,
        created_by:       profile.id,
      };
      const { data: created, error } = await supabase.from('activities').insert(payload).select('id').single();
      if (error) throw error;
      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_ACTIVITY,
        entityType: ENTITY_TYPES.ACTIVITY,
        entityId: created?.id ?? null,
        entityLabel: draft.contact_name || draft.type,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      // fire-and-forget activity_logs feed (don't block UI; log errors only)
      if (created?.id) {
        supabase.from('activity_logs').insert({
          activity_id: created.id, changed_by: profile.id,
          from_status: null, to_status: 'todo',
        }).then(({ error: logErr }) => { if (logErr) console.error('[activity_logs] create', logErr); });
      }
      showToast?.('Task berhasil disimpan');
      setFormOpen(false);
      fetchActivities();
    } catch (err) {
      setFormError('Gagal menyimpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [draft, profile, fetchActivities, showToast]);

  // ── mark done ───────────────────────────────────────────────────────────────
  const handleCheck = useCallback(async (row) => {
    const { error } = await supabase
      .from('activities')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) { showToast?.('Gagal menandai selesai: ' + error.message, 'error'); return; }
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_ACTIVITY,
      entityType: ENTITY_TYPES.ACTIVITY,
      entityId: row.id,
      entityLabel: row.contact_name || '',
      notes: (row.status || 'todo') + ' → done',
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    supabase.from('activity_logs').insert({
      activity_id: row.id, changed_by: profile.id,
      from_status: row.status || null, to_status: 'done',
    }).then(({ error: logErr }) => { if (logErr) console.error('[activity_logs] done', logErr); });
    showToast?.('Aktivitas ditandai selesai');
    fetchActivities();
    // Close the detail modal if open (no-op when invoked from a list row).
    setDetail(null);
  }, [fetchActivities, showToast, profile]);

  // ── cancel activity (from detail modal, todo only) ──────────────────────────
  const handleCancelActivity = useCallback(async (id) => {
    const { error } = await supabase
      .from('activities')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) { showToast?.('Gagal membatalkan: ' + error.message, 'error'); return; }
    const fromStatus = rows.find(r => r.id === id)?.status || null;
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_ACTIVITY,
      entityType: ENTITY_TYPES.ACTIVITY,
      entityId: id,
      entityLabel: rows.find(r => r.id === id)?.contact_name || '',
      notes: (fromStatus || 'todo') + ' → cancelled',
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    supabase.from('activity_logs').insert({
      activity_id: id, changed_by: profile.id,
      from_status: fromStatus, to_status: 'cancelled',
    }).then(({ error: logErr }) => { if (logErr) console.error('[activity_logs] cancel', logErr); });
    showToast?.('Aktivitas dibatalkan');
    setDetail(null);
    fetchActivities();
  }, [fetchActivities, showToast, profile, rows]);

  // ── delete activity (super_admin only, soft delete) ─────────────────────────
  const handleDeleteActivity = useCallback(async (id) => {
    const { error } = await supabase
      .from('activities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { showToast?.('Gagal menghapus: ' + error.message, 'error'); return; }
    logAudit(supabase, {
      action: ACTION_TYPES.DELETE_ACTIVITY,
      entityType: ENTITY_TYPES.ACTIVITY,
      entityId: id,
      entityLabel: null,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    showToast?.('Aktivitas dihapus');
    setDetail(null);
    setDeleteConfirm(null);
    fetchActivities();
  }, [fetchActivities, showToast, profile, erpRole, user]);

  // ── edit activity (via ActivityDetailModal edit mode) ───────────────────────
  // Same payload shape as handleSave minus status/company_id/created_by. details
  // is merge-preserved so hidden jsonb keys (call_type/visit_type/mom/…) survive.
  const handleEditSave = useCallback(async (draft) => {
    if (!detail) return;
    if (!draft.type)          { setDetailError('Tipe wajib dipilih.'); return; }
    if (!draft.scheduled_for) { setDetailError('Tanggal wajib diisi.'); return; }
    if (!draft.assigned_to)   { setDetailError('Salesperson wajib dipilih.'); return; }
    setDetailSaving(true);
    setDetailError(null);
    try {
      const needContact = ['call', 'whatsapp'].includes(draft.type);
      const needLocation = ['visit', 'meeting'].includes(draft.type);
      const prevDetails = detail.details || {};
      const payload = {
        type:             draft.type,
        scheduled_for:    draft.scheduled_for,
        activity_time:    draft.activity_time     || null,
        assigned_to:      draft.assigned_to,
        account_id:       draft.account_id        || null,
        contact_name:     needContact ? (draft.contact_name  || null) : null,
        contact_phone:    needContact ? (draft.contact_phone || null) : null,
        outcome:          draft.outcome           || null,
        notes:            draft.notes             || null,
        next_action:      draft.next_action       || null,
        next_action_date: draft.next_action_date  || null,
        // Merge-preserve existing details; only touch location for visit/meeting.
        details:          needLocation ? { ...prevDetails, location: draft.location || null } : prevDetails,
      };
      const { error } = await supabase.from('activities').update(payload).eq('id', detail.id);
      if (error) throw error;
      supabase.from('activity_logs').insert({
        activity_id: detail.id, changed_by: profile.id,
        from_status: 'edited', to_status: 'edited',
      }).then(({ error: logErr }) => { if (logErr) console.error('[activity_logs] edit', logErr); });
      showToast?.('Aktivitas berhasil diperbarui');
      setDetail(null);
      fetchActivities();
    } catch (err) {
      setDetailError('Gagal menyimpan: ' + err.message);
    } finally {
      setDetailSaving(false);
    }
  }, [detail, fetchActivities, showToast, profile]);

  // Open the existing ProspectFormPage in CREATE mode, prefilled from the
  // activity (Option A: ProspectFormPage treats an id-less object as create).
  const openProspectFromActivity = (row) => {
    // Activity has no separate company name → use contact_name as the prospect
    // name (best available); user can refine company name in the form.
    setEditingProspect?.({
      name:      row.contact_name  || '',
      pic_name:  row.contact_name  || '',
      pic_phone: row.contact_phone || '',
    });
    setShowProspectForm?.(true);
    setActiveMenu?.('crm-prospects');
  };

  const selStyle = {
    height: 34, borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.surface, padding: '0 10px', fontSize: 13, color: C.ink,
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EAF0F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} color={C.navy} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Activities</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>Catat dan pantau semua aktivitas sales — call, whatsapp, visit, meeting, email, follow-up</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.navy, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(20,70,130,.22)' }}
        >
          <Plus size={16} /> Tambah Task
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Total Aktivitas Bulan Ini" value={stats.total} unit="aktivitas" accent={C.navy} />
        <StatCard label="To Do (Belum Selesai)"     value={stats.todo}  unit="task"      accent={C.accent} />
        <StatCard label="Selesai Bulan Ini"         value={stats.done}  unit="aktivitas" accent={C.ok} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari customer / prospek / contact…"
            style={{ width: '100%', height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, paddingLeft: 32, paddingRight: 10, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selStyle}>
          <option value="all">Semua Tipe</option>
          {TYPE_FORM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">Semua Status</option>
          <option value="todo">To Do</option>
          <option value="done">Selesai</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={selStyle}>
          <option value="today">Hari Ini</option>
          <option value="this_week">Minggu Ini</option>
          <option value="this_month">Bulan Ini</option>
          <option value="custom">Custom</option>
          <option value="all">Semua Tanggal</option>
        </select>
        {filterDate === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={selStyle} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={selStyle} />
          </>
        )}
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)} style={selStyle}>
          <option value="all">Semua Sales</option>
          {salesProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                {['Tanggal', 'Tipe', 'Status', 'Customer / Prospek', 'Sales', 'Catatan / Outcome', 'Aksi'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Memuat data…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Belum ada aktivitas</td></tr>
              ) : pageRows.map((r, i) => (
                <tr key={r.id} onClick={() => setDetail(r)} style={{ borderBottom: i < pageRows.length - 1 ? `1px solid ${C.lineSoft}` : 'none', cursor: 'pointer' }}>
                  <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: C.ink, whiteSpace: 'nowrap' }}>
                    {fmtDate(r.scheduled_for)}{r.activity_time ? ` · ${fmtTime(r.activity_time)}` : ''}
                  </td>
                  <td style={{ padding: '12px 14px' }}><Badge meta={TYPE_META[r.type]} /></td>
                  <td style={{ padding: '12px 14px' }}><Badge meta={STATUS_META[r.status]} /></td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{accountLabel(r.account, r.prospect_name)}</td>
                  <td style={{ padding: '12px 14px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{r.salesperson_name || '—'}</td>
                  <td style={{ padding: '12px 14px', color: C.inkSoft, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.outcome || r.notes || '—'}</td>
                  <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {r.status === 'todo' && (
                        <button
                          title="Tandai selesai"
                          onClick={(e) => { e.stopPropagation(); handleCheck(r); }}
                          style={{ background: C.okBg, border: `1px solid ${C.okBd}`, borderRadius: 7, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Check size={15} color={C.ok} />
                        </button>
                      )}
                      <button title="Detail" onClick={(e) => { e.stopPropagation(); setDetail(r); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                        <Eye size={16} color={C.inkFaint} />
                      </button>
                      {!r.account_id && (
                        <button title="Jadikan Prospek" onClick={(e) => { e.stopPropagation(); setConfirmProspect(r); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                          <UserPlus size={16} color={C.navy} />
                        </button>
                      )}
                      {erpRole === 'super_admin' && (
                        <button title="Hapus" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(r); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                          <Trash2 size={16} color={C.danger} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 13, color: C.inkSoft }}>
          <span>Halaman {page + 1} dari {totalPages} ({filtered.length} total)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? C.inkFaint : C.ink, fontSize: 13 }}>
              ← Prev
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? C.inkFaint : C.ink, fontSize: 13 }}>
              Next →
            </button>
          </div>
        </div>
      )}

      <ActivityDetailModal
        act={detail}
        canEdit={!!detail && (isManagerOrAbove || detail.assigned_to === profile?.id)}
        salesProfiles={salesProfiles}
        accounts={accounts}
        saving={detailSaving}
        error={detailError}
        onEnterEdit={() => { setDetailError(null); loadFormOptions(); }}
        onSave={handleEditSave}
        onCancel={() => detail && handleCancelActivity(detail.id)}
        onMarkDone={() => detail && handleCheck(detail)}
        isSuperAdmin={erpRole === 'super_admin'}
        onDelete={() => { setDeleteConfirm(detail); setDetail(null); }}
        onClose={() => { setDetail(null); setDetailError(null); }}
      />

      <TaskFormModal
        open={formOpen}
        draft={draft}
        setDraft={setDraft}
        saving={saving}
        error={formError}
        accounts={accounts}
        salesProfiles={salesProfiles}
        onClose={() => { setFormOpen(false); setFormError(null); }}
        onSave={handleSave}
      />

      <ConfirmModal
        open={!!confirmProspect}
        variant="info"
        title="Jadikan Prospek?"
        message="Buat prospek baru dari kontak aktivitas ini?"
        confirmLabel="Ya, Jadikan Prospek"
        cancelLabel="Batal"
        onConfirm={() => { const r = confirmProspect; setConfirmProspect(null); openProspectFromActivity(r); }}
        onCancel={() => setConfirmProspect(null)}
      />

      <ConfirmModal
        open={!!deleteConfirm}
        variant="danger"
        title="Hapus Aktivitas?"
        message="Aktivitas ini akan dihapus permanen."
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        onConfirm={() => deleteConfirm && handleDeleteActivity(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

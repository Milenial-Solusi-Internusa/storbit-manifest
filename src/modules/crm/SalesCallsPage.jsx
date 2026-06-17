// src/modules/crm/SalesCallsPage.jsx
// Activity & Calls — log and monitor sales-team call activity.
// Visual pattern follows InquiryListPage.jsx (warm-beige C tokens, badge maps, detail modal).
// DB: table `activities` (type='call'). Migrated from the legacy calls table.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, Eye, PhoneCall, X, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

// Resolve active 'sales' users for a company via RBAC (roles.code='sales'),
// never a hardcoded role_id. Conditions: same company, user_roles active +
// not revoked. Returns [{ id, full_name }] (active profiles only).
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

const CALL_TYPE_META = {
  discovery: { label: 'Discovery',  bg: '#E1ECF7', color: '#2563EB', bd: '#BBD3EE' },
  follow_up: { label: 'Follow-up',  bg: '#FBE6DA', color: '#C8521B', bd: '#F0C3A8' },
  closing:   { label: 'Closing',    bg: '#DEF0E4', color: '#1F8B4D', bd: '#BFE0CC' },
};
const CALL_TYPE_FORM = [
  { value: 'discovery', label: 'Discovery Call' },
  { value: 'follow_up', label: 'Follow-up Call' },
  { value: 'closing',   label: 'Closing Call' },
];

const RESULT_META = {
  connected:    { label: 'Connected',    bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  no_answer:    { label: 'No Answer',    bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  callback:     { label: 'Callback',     bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  wrong_number: { label: 'Wrong Number', bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
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
function prospectLabel(p) {
  if (!p) return '—';
  return [p.company_prefix, p.name].filter(Boolean).join(' ') || '—';
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

function CallDetailModal({ call, onClose, onEdit }) {
  if (!call) return null;
  const resultMeta = RESULT_META[call.result];
  const typeMeta   = CALL_TYPE_META[call.call_type];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, maxWidth: 620, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: `1px solid ${C.line}` }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 6 }}>DETAIL CALL</div>
              <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: C.ink, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2 }}>
                {prospectLabel(call.prospect)}
              </h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge meta={resultMeta} />
                <Badge meta={typeMeta} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => onEdit(call)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: C.navy, color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Pencil size={13} /> Edit
              </button>
              <button onClick={onClose} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={16} color={C.inkSoft} />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px 28px' }}>
          <DSection title="Info Call">
            <DField label="Tanggal"     value={fmtDate(call.call_date)} mono />
            <DField label="Waktu"       value={fmtTime(call.call_time)} mono />
            <DField label="Durasi"      value={call.duration_minutes != null ? `${call.duration_minutes} menit` : null} />
            <DField label="Salesperson" value={call.salesperson?.full_name} />
          </DSection>

          <DSection title="Contact">
            <DField label="Contact Name"  value={call.contact_name} />
            <DField label="Contact Phone" value={call.contact_phone} mono />
          </DSection>

          <DSection title="Klasifikasi">
            <DField label="Call Type"      value={typeMeta?.label || call.call_type} />
            <DField label="BANT Collected" value={`${call.bant_collected ?? 0} / 6`} mono />
          </DSection>

          {call.notes && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.lineSoft}` }}>Notes</div>
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: C.surface2, borderRadius: 8, padding: '10px 14px' }}>{call.notes}</div>
            </div>
          )}

          <DSection title="Tindak Lanjut">
            <DField label="Next Action"      value={call.next_action} full />
            <DField label="Next Action Date" value={call.next_action_date ? fmtDate(call.next_action_date) : null} mono />
          </DSection>
        </div>
      </div>
    </div>
  );
}

/* ── Add / Edit form modal ── */
const EMPTY_CALL = {
  prospect_id: '', contact_name: '', contact_phone: '',
  call_date: todayStr(), call_time: '', duration_minutes: '',
  call_type: 'discovery', result: 'connected', bant_collected: 0,
  notes: '', next_action: '', next_action_date: '', salesperson_id: '',
};

function CallFormModal({ open, isEdit, draft, setDraft, saving, error, prospects, salesProfiles, onClose, onSave }) {
  if (!open) return null;

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
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.ink, fontFamily: "'Montserrat',sans-serif" }}>
            {isEdit ? 'Edit Call' : 'Catat Call'}
          </h2>
          <button onClick={onClose} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={C.inkSoft} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            {lbl('Prospect')}
            <select value={draft.prospect_id} onChange={e => upd('prospect_id', e.target.value)} style={selStyle}>
              <option value="">— Opsional —</option>
              {prospects.map(p => <option key={p.id} value={p.id}>{prospectLabel(p)}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Contact Name', true)}
              <input value={draft.contact_name} onChange={e => upd('contact_name', e.target.value)} style={inpStyle} placeholder="Nama kontak" />
            </div>
            <div>
              {lbl('Contact Phone')}
              <input value={draft.contact_phone} onChange={e => upd('contact_phone', e.target.value)} style={inpStyle} placeholder="08xx…" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Tanggal Call', true)}
              <input type="date" value={draft.call_date} onChange={e => upd('call_date', e.target.value)} style={inpStyle} />
            </div>
            <div>
              {lbl('Waktu')}
              <input type="time" value={draft.call_time} onChange={e => upd('call_time', e.target.value)} style={inpStyle} />
            </div>
            <div>
              {lbl('Durasi (menit)')}
              <input type="number" min={0} value={draft.duration_minutes} onChange={e => upd('duration_minutes', e.target.value)} style={inpStyle} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Call Type')}
              <select value={draft.call_type} onChange={e => upd('call_type', e.target.value)} style={selStyle}>
                {CALL_TYPE_FORM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              {lbl('Result', true)}
              <select value={draft.result} onChange={e => upd('result', e.target.value)} style={selStyle}>
                {Object.entries(RESULT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            {lbl(`BANT Collected — ${draft.bant_collected ?? 0} / 6`)}
            <input
              type="range" min={0} max={6} step={1}
              value={draft.bant_collected ?? 0}
              onChange={e => upd('bant_collected', Number(e.target.value))}
              style={{ width: '100%', accentColor: C.navy, cursor: 'pointer' }}
            />
          </div>

          <div>
            {lbl('Notes')}
            <textarea value={draft.notes} onChange={e => upd('notes', e.target.value)} rows={3} style={taStyle} placeholder="Ringkasan percakapan…" />
          </div>

          <div>
            {lbl('Next Action')}
            <textarea value={draft.next_action} onChange={e => upd('next_action', e.target.value)} rows={2} style={taStyle} placeholder="Tindak lanjut berikutnya…" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Next Action Date')}
              <input type="date" value={draft.next_action_date} onChange={e => upd('next_action_date', e.target.value)} style={inpStyle} />
            </div>
            <div>
              {lbl('Salesperson')}
              <select value={draft.salesperson_id} onChange={e => upd('salesperson_id', e.target.value)} style={selStyle}>
                <option value="">— Saya —</option>
                {salesProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>

          {error && <div style={{ background: C.dangerBg, color: C.danger, padding: '9px 13px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Batal
            </button>
            <button onClick={onSave} disabled={saving} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: C.navy, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Simpan Call')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SalesCallsPage({ showToast }) {
  const { profile, erpRole } = useAuth();
  // Visibility scope by role (mirrors RLS on `activities`):
  //  • super_admin / admin → all entities (no company filter)
  //  • sales / operations  → only calls where they are the salesperson or creator
  //  • everyone else (manager, ceo, gm, …) → their own entity
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterResult, setFilterResult] = useState('all');
  const [filterDate, setFilterDate] = useState('this_month'); // this_month | all
  const [page, setPage] = useState(0);

  const [detailCall, setDetailCall] = useState(null);

  // form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_CALL);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [salesProfiles, setSalesProfiles] = useState([]);

  const fetchCalls = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      // Calls now live in `activities` (type='call'). account_id has an FK to
      // accounts so the prospect name embeds; assigned_to/created_by do NOT have
      // a profiles FK → salesperson name is resolved via a client-side map below.
      let query = supabase
        .from('activities')
        .select(`
          *,
          prospect:accounts!activities_account_id_fkey(name, company_prefix)
        `)
        .eq('type', 'call')
        .is('deleted_at', null);

      // Role-aware scope (mirrors RLS on `activities`)
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
      const rows = data || [];
      const salesIds = [...new Set(rows.map(a => a.assigned_to).filter(Boolean))];
      const nameMap = {};
      if (salesIds.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name').in('id', salesIds);
        (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
      }

      // Map activities rows back to the call shape the rest of the UI expects.
      setCalls(rows.map(a => ({
        id:               a.id,
        prospect_id:      a.account_id,
        salesperson_id:   a.assigned_to,
        prospect:         a.prospect,
        salesperson:      a.assigned_to ? { full_name: nameMap[a.assigned_to] || null } : null,
        call_date:        a.scheduled_for,
        call_time:        a.activity_time,
        contact_name:     a.contact_name,
        contact_phone:    a.contact_phone,
        result:           a.outcome,
        notes:            a.notes,
        next_action:      a.next_action,
        next_action_date: a.next_action_date,
        call_type:        a.details?.call_type ?? null,
        duration_minutes: a.details?.duration_minutes ?? null,
        bant_collected:   a.details?.bant_collected ?? 0,
        created_by:       a.created_by,
        created_at:       a.created_at,
      })));
    } catch (err) {
      showToast?.('Gagal memuat data call: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, showToast]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);
  useEffect(() => { setPage(0); }, [search, filterType, filterResult, filterDate]);

  // Load prospect + salesperson options for the form (called when a modal opens).
  // Salesperson dropdown = active 'sales' users in the current entity only
  // (resolved via RBAC role code, see fetchSalesProfiles).
  const loadFormOptions = async () => {
    if (!profile?.company_id) return;
    const [pRes, sales] = await Promise.all([
      supabase.from('accounts').select('id, name, company_prefix').eq('company_id', profile.company_id).eq('account_status', 'prospect').is('deleted_at', null).order('name').limit(1000),
      fetchSalesProfiles(profile.company_id),
    ]);
    setProspects(pRes.data || []);
    setSalesProfiles(sales);
  };

  // ── stats (current month) ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const { start, end } = monthBounds();
    const today = todayStr();
    const monthCalls = calls.filter(c => c.call_date >= start && c.call_date <= end);
    const durations = monthCalls.map(c => Number(c.duration_minutes)).filter(n => !isNaN(n) && n > 0);
    return {
      total: monthCalls.length,
      connected: monthCalls.filter(c => c.result === 'connected').length,
      followupPending: monthCalls.filter(c => c.result && c.next_action_date && c.next_action_date >= today).length,
      avgDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    };
  }, [calls]);

  // ── client-side filtering ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const { start, end } = monthBounds();
    const q = search.trim().toLowerCase();
    return calls.filter(c => {
      if (filterType !== 'all' && c.call_type !== filterType) return false;
      if (filterResult !== 'all' && c.result !== filterResult) return false;
      if (filterDate === 'this_month' && !(c.call_date >= start && c.call_date <= end)) return false;
      if (q) {
        const hay = `${c.prospect?.name || ''} ${c.contact_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [calls, search, filterType, filterResult, filterDate]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // ── form open helpers ──────────────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null);
    setDraft({ ...EMPTY_CALL, call_date: todayStr(), salesperson_id: profile?.id || '' });
    setFormError(null);
    setFormOpen(true);
    loadFormOptions();
  };
  const openEdit = (call) => {
    setEditId(call.id);
    setDraft({
      prospect_id:      call.prospect_id      || '',
      contact_name:     call.contact_name     || '',
      contact_phone:    call.contact_phone    || '',
      call_date:        call.call_date        || todayStr(),
      call_time:        call.call_time ? fmtTime(call.call_time) : '',
      duration_minutes: call.duration_minutes ?? '',
      call_type:        call.call_type        || 'discovery',
      result:           call.result           || 'connected',
      bant_collected:   call.bant_collected ?? 0,
      notes:            call.notes            || '',
      next_action:      call.next_action      || '',
      next_action_date: call.next_action_date || '',
      salesperson_id:   call.salesperson_id   || '',
    });
    setFormError(null);
    setDetailCall(null);
    setFormOpen(true);
    loadFormOptions();
  };

  const handleSave = useCallback(async () => {
    if (!draft.contact_name.trim()) { setFormError('Contact Name wajib diisi.'); return; }
    if (!draft.call_date)           { setFormError('Tanggal call wajib diisi.'); return; }
    if (!draft.result)              { setFormError('Result wajib dipilih.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      // Write to `activities` (type='call', logged as a completed event).
      // Field-specific call data lives in details jsonb.
      const payload = {
        type:             'call',
        status:           'done',
        account_id:       draft.prospect_id      || null,
        contact_name:     draft.contact_name.trim(),
        contact_phone:    draft.contact_phone    || null,
        scheduled_for:    draft.call_date,
        activity_time:    draft.call_time        || null,
        outcome:          draft.result,
        notes:            draft.notes            || null,
        next_action:      draft.next_action      || null,
        next_action_date: draft.next_action_date || null,
        assigned_to:      draft.salesperson_id   || profile.id,
        details: {
          call_type:        draft.call_type || null,
          duration_minutes: draft.duration_minutes !== '' ? Number(draft.duration_minutes) : null,
          bant_collected:   Number(draft.bant_collected) || 0,
        },
      };
      let error;
      if (editId) {
        ({ error } = await supabase.from('activities').update(payload).eq('id', editId));
      } else {
        ({ error } = await supabase.from('activities').insert({ ...payload, company_id: profile.company_id, created_by: profile.id }));
      }
      if (error) throw error;
      showToast?.(editId ? 'Call berhasil diperbarui ✨' : 'Call berhasil dicatat ✨');
      setFormOpen(false);
      setEditId(null);
      fetchCalls();
    } catch (err) {
      setFormError('Gagal menyimpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [draft, editId, profile, fetchCalls, showToast]);

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
            <PhoneCall size={20} color={C.navy} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Activity & Calls</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>Catat dan pantau aktivitas call tim sales</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.navy, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(20,70,130,.22)' }}
        >
          <Plus size={16} /> Catat Call
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Total Call Bulan Ini" value={stats.total}           unit="call"  accent={C.navy} />
        <StatCard label="Connected"            value={stats.connected}       unit="call"  accent={C.ok} />
        <StatCard label="Follow-up Pending"    value={stats.followupPending} unit="call"  accent={C.accent} />
        <StatCard label="Rata-rata Durasi"     value={stats.avgDuration}     unit="menit" accent={C.info} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari prospect / contact…"
            style={{ width: '100%', height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, paddingLeft: 32, paddingRight: 10, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selStyle}>
          <option value="all">Semua Type</option>
          {Object.entries(CALL_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)} style={selStyle}>
          <option value="all">Semua Result</option>
          {Object.entries(RESULT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={selStyle}>
          <option value="this_month">Bulan Ini</option>
          <option value="all">Semua Tanggal</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                {['Tanggal & Waktu', 'Prospect', 'Contact', 'Type', 'Durasi', 'BANT', 'Result', 'Next Action', 'Salesperson', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Memuat data…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Belum ada call tercatat</td></tr>
              ) : pageRows.map((c, i) => (
                <tr key={c.id} onClick={() => setDetailCall(c)} style={{ borderBottom: i < pageRows.length - 1 ? `1px solid ${C.lineSoft}` : 'none', cursor: 'pointer' }}>
                  <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: C.ink, whiteSpace: 'nowrap' }}>
                    {fmtDate(c.call_date)}{c.call_time ? ` · ${fmtTime(c.call_time)}` : ''}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{prospectLabel(c.prospect)}</td>
                  <td style={{ padding: '12px 14px', color: C.inkSoft }}>{c.contact_name || '—'}</td>
                  <td style={{ padding: '12px 14px' }}><Badge meta={CALL_TYPE_META[c.call_type]} /></td>
                  <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: C.inkSoft }}>{c.duration_minutes != null ? `${c.duration_minutes}'` : '—'}</td>
                  <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: C.inkSoft }}>{c.bant_collected ?? 0}/6</td>
                  <td style={{ padding: '12px 14px' }}><Badge meta={RESULT_META[c.result]} /></td>
                  <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: C.inkFaint, whiteSpace: 'nowrap' }}>{c.next_action_date ? fmtDate(c.next_action_date) : '—'}</td>
                  <td style={{ padding: '12px 14px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{c.salesperson?.full_name || '—'}</td>
                  <td style={{ padding: '12px 10px' }}>
                    <button onClick={(e) => { e.stopPropagation(); setDetailCall(c); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                      <Eye size={16} color={C.inkFaint} />
                    </button>
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

      <CallDetailModal call={detailCall} onClose={() => setDetailCall(null)} onEdit={openEdit} />

      <CallFormModal
        open={formOpen}
        isEdit={!!editId}
        draft={draft}
        setDraft={setDraft}
        saving={saving}
        error={formError}
        prospects={prospects}
        salesProfiles={salesProfiles}
        onClose={() => { setFormOpen(false); setEditId(null); setFormError(null); }}
        onSave={handleSave}
      />
    </div>
  );
}

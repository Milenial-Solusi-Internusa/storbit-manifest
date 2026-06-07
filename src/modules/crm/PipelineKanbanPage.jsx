// src/modules/crm/PipelineKanbanPage.jsx
// Visual structure: Claude Design handoff (PipelineKanbanPage.jsx)
// Data layer: existing Supabase logic (fetchProspects, handleDrop, useEffect) — unchanged
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

/* =========================================================================
   Pipeline config — lowercase ids match Supabase pipeline_stage.toLowerCase()
   ========================================================================= */
const STAGES = [
  { id: 'new',         name: 'New',         prob: 10,  tone: 'navy', color: '#144682' },
  { id: 'contacted',   name: 'Contacted',   prob: 20,  tone: 'navy', color: '#144682' },
  { id: 'qualified',   name: 'Qualified',   prob: 40,  tone: 'navy', color: '#144682' },
  { id: 'proposal',    name: 'Proposal',    prob: 60,  tone: 'navy', color: '#144682' },
  { id: 'negotiation', name: 'Negotiation', prob: 80,  tone: 'navy', color: '#144682' },
  { id: 'won',         name: 'Won',         prob: 100, tone: 'won',  color: '#1F8B4D' },
  { id: 'lost',        name: 'Lost',        prob: 0,   tone: 'lost', color: '#C0392B' },
];

const HEAD_BG = { navy: '#144682', won: '#1F8B4D', lost: '#C0392B' };

// Service type display config — mapped from prospect.source
const SVC = {
  sea:     { label: 'Sea Freight',   bg: '#E1ECF5', fg: '#1E5894' },
  air:     { label: 'Air Freight',   bg: '#E2F0F7', fg: '#1B7299' },
  land:    { label: 'Trucking',      bg: '#F6E8D6', fg: '#A45A22' },
  customs: { label: 'Customs',       bg: '#ECE3F4', fg: '#6E4B8C' },
  wh:      { label: 'Warehousing',   bg: '#DCEBEA', fg: '#1F6B6B' },
  project: { label: 'Project Cargo', bg: '#E5EDF7', fg: '#234F86' },
  digital: { label: 'Digital',       bg: '#FBE6DA', fg: '#C8521B' },
};

// Map prospect.source → SVC key
const SOURCE_TO_SVC = {
  digital_marketing: 'digital',
  sales_visit:       'land',
  referral:          'sea',
  event:             'customs',
};
const sourceToSvc = src => SOURCE_TO_SVC[src] || 'sea';

const rp = n => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Inline SVG icon (lucide paths) ── */
const ICONS = {
  chevright:   '<path d="m9 18 6-6-6-6"/>',
  plus:        '<path d="M5 12h14"/><path d="M12 5v14"/>',
  chevdown:    '<path d="m6 9 6 6 6-6"/>',
  filter:      '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  wallet:      '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  refresh:     '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  columns:     '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
  list:        '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  calendar:    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  check:       '<path d="M20 6 9 17l-5-5"/>',
  checkcircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  ban:         '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  info:        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};

function Icon({ name, size = 18, color, style }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke={color || 'currentColor'}
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.info }}
    />
  );
}

function HoverButton({ base, hover, children, ...rest }) {
  const [h, setH] = useState(false);
  return (
    <button
      {...rest}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ ...base, ...(h ? hover : null) }}
    >
      {children}
    </button>
  );
}

/* ── Style tokens (from design file — unchanged) ── */
const S = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", background: 'transparent', minHeight: '100%', padding: '22px 0 30px 0', boxSizing: 'border-box', color: '#1A2330' },
  head: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, paddingRight: 0, marginBottom: 16, flexWrap: 'wrap' },
  crumbs: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#9AA0AC', marginBottom: 7 },
  crumbCur: { color: '#545B66', fontWeight: 600 },
  title: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 23, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: 0 },
  sub: { fontSize: 13, color: '#7A828E', marginTop: 3 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, paddingRight: 0, marginBottom: 18, flexWrap: 'wrap' },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid #E85A1E', background: '#E85A1E', color: '#fff', fontWeight: 600, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer' },
  primaryHover: { background: '#CF4D14', borderColor: '#CF4D14' },
  drop: { display: 'inline-flex', alignItems: 'center', gap: 9, height: 40, padding: '0 13px', borderRadius: 10, border: '1px solid #E0E2E8', background: '#fff', color: '#3C4350', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  dropHover: { borderColor: '#C7CBD4' },
  icoBtn: { width: 40, height: 40, borderRadius: 10, border: '1px solid #E0E2E8', background: '#fff', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  icoBtnHover: { borderColor: '#C7CBD4', color: '#3C4350' },
  spacer: { flex: 1 },
  kanbanWrap: { overflowX: 'auto', overflowY: 'hidden', padding: '2px 0 14px' },
  kanban: { display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 'min-content' },
  col: { width: 266, flex: '0 0 266px', display: 'flex', flexDirection: 'column' },
  colHead: { position: 'relative', padding: '10px 24px 11px 17px', color: '#fff' },
  chTop: { display: 'flex', alignItems: 'center', gap: 8 },
  chName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 },
  chCount: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,.22)', padding: '1px 8px', borderRadius: 20, lineHeight: 1.5 },
  chSub: { fontSize: 11, marginTop: 3, color: 'rgba(255,255,255,.88)', fontVariantNumeric: 'tabular-nums' },
  prog: { height: 4, background: '#E6E8ED', borderRadius: 3, margin: '5px 3px 0', overflow: 'hidden' },
  colBody: { marginTop: 11, borderRadius: 11, padding: 9, minHeight: 130, display: 'flex', flexDirection: 'column', gap: 9, flex: 1, border: '1px solid transparent' },
  colBodyOver: { background: '#FBEEE5', border: '1.5px dashed #E85A1E' },
  colEmpty: { fontSize: 11.5, color: '#A6ABB5', textAlign: 'center', padding: '20px 8px', border: '1.5px dashed #E2E4EA', borderRadius: 9 },
  deal: { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 9, padding: '11px 12px 12px', boxShadow: '0 1px 2px rgba(20,40,70,.05)', cursor: 'grab', transition: 'box-shadow .15s ease, transform .15s ease' },
  dealHover: { boxShadow: '0 9px 22px rgba(20,40,70,.14)', transform: 'translateY(-2px)' },
  dCo: { fontWeight: 700, fontSize: 13, color: '#1A2330', letterSpacing: -0.1, lineHeight: 1.3 },
  dContact: { fontSize: 11.5, color: '#838A95', marginTop: 2 },
  dVal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 15, marginTop: 9, letterSpacing: -0.3 },
  dMeta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9 },
  dDate: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8A919C', fontVariantNumeric: 'tabular-nums' },
  svc: { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' },
  list: { paddingRight: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  lg: { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 11, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,40,70,.04)' },
  lgHead: { width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', background: '#fff', border: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  lgName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: '#16243A' },
  lgCount: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 600, color: '#838A95' },
  lgProb: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  lgTotal: { marginLeft: 'auto', fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, color: '#144682', fontSize: 14, letterSpacing: -0.3 },
  lr: { display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 150px 150px 170px', gap: 14, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid #F4F5F7' },
  lrHead: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9AA0AC', background: '#FAFBFC', borderBottom: '1px solid #F0F1F4', padding: '8px 16px' },
  lrCo: { fontWeight: 700, fontSize: 13, color: '#1A2330', letterSpacing: -0.1 },
  lrContact: { fontSize: 11.5, color: '#838A95', marginTop: 1 },
  lrDate: { fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 6 },
  lrVal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 14, color: '#144682', textAlign: 'right', letterSpacing: -0.3 },
  lrEmpty: { padding: '18px 16px', fontSize: 11.5, color: '#A6ABB5' },
  toast: { position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 9, background: '#16243A', color: '#fff', padding: '11px 15px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 12px 30px rgba(10,20,40,.28)', zIndex: 200, transition: 'opacity .2s ease, transform .2s ease' },
};

const valColorFor = stage => stage === 'won' ? '#1F8B4D' : stage === 'lost' ? '#9AA0AC' : '#144682';

/* ── Deal card ── */
function DealCard({ deal, stColor, onDragStart, onDragEnd, dragging }) {
  const [h, setH] = useState(false);
  const svc = SVC[deal.svc] || SVC.sea;
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, deal.id)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ ...S.deal, borderLeft: '3px solid ' + stColor, ...(h ? S.dealHover : null), ...(dragging ? { opacity: 0.45 } : null) }}
    >
      <div style={S.dCo}>{deal.co}</div>
      {deal.contact && <div style={S.dContact}>{deal.contact}</div>}
      <div style={{ ...S.dVal, color: valColorFor(deal.stage), textDecoration: deal.stage === 'lost' ? 'line-through' : 'none' }}>
        {deal.value ? rp(deal.value) : '—'}
      </div>
      <div style={S.dMeta}>
        <span style={S.dDate}><Icon name="calendar" size={13} color="#A6ABB5" />{deal.date}</span>
        <span style={{ ...S.svc, background: svc.bg, color: svc.fg }}>{svc.label}</span>
      </div>
    </div>
  );
}

/* ── List row ── */
function ListRow({ deal }) {
  const [h, setH] = useState(false);
  const svc = SVC[deal.svc] || SVC.sea;
  return (
    <div
      style={{ ...S.lr, ...(h ? { background: '#FAFBFC' } : null) }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
    >
      <div>
        <div style={S.lrCo}>{deal.co}</div>
        {deal.contact && <div style={S.lrContact}>{deal.contact}</div>}
      </div>
      <div><span style={{ ...S.svc, background: svc.bg, color: svc.fg }}>{svc.label}</span></div>
      <div style={S.lrDate}><Icon name="calendar" size={13} color="#A6ABB5" />{deal.date}</div>
      <div style={{ ...S.lrVal, color: valColorFor(deal.stage), textDecoration: deal.stage === 'lost' ? 'line-through' : 'none' }}>
        {deal.value ? rp(deal.value) : '—'}
      </div>
    </div>
  );
}

/* ── List group ── */
function ListGroup({ stage, items }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hh, setHh] = useState(false);
  const total = items.reduce((a, d) => a + (d.value || 0), 0);
  const probTone =
    stage.tone === 'won'  ? { color: '#1F8B4D', background: '#DEF0E4' } :
    stage.tone === 'lost' ? { color: '#9AA0AC', background: '#EFEFF2' } :
                            { color: '#E85A1E', background: '#FBE6DA' };
  return (
    <div style={S.lg}>
      <button
        onClick={() => setCollapsed(c => !c)}
        onMouseEnter={() => setHh(true)}
        onMouseLeave={() => setHh(false)}
        style={{ ...S.lgHead, borderLeft: '3px solid ' + stage.color, ...(hh ? { background: '#FAFBFC' } : null) }}
      >
        <Icon name="chevdown" size={16} color="#9AA0AC" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', flex: '0 0 9px', background: stage.color }} />
        <span style={S.lgName}>{stage.name}</span>
        <span style={S.lgCount}>{items.length} deal</span>
        <span style={{ ...S.lgProb, ...probTone }}>{stage.prob}%</span>
        <span style={S.lgTotal}>{total > 0 ? rp(total) : '—'}</span>
      </button>
      {!collapsed && (
        <div style={{ borderTop: '1px solid #F0F1F4' }}>
          <div style={{ ...S.lr, ...S.lrHead }}>
            <div>Prospek</div><div>Layanan</div><div>Estimasi Close</div>
            <div style={{ textAlign: 'right' }}>Nilai</div>
          </div>
          {items.length
            ? items.map(d => <ListRow key={d.id} deal={d} />)
            : <div style={S.lrEmpty}>Tidak ada deal di tahap ini</div>}
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
export default function PipelineKanbanPage({ showToast, setActiveMenu, setShowProspectForm, setEditingProspect }) {
  const { profile } = useAuth();

  // ── Existing state — unchanged ─────────────────────────────────────────────
  const [prospects,  setProspects]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [draggingId, setDraggingId] = useState(null);

  // ── New UI-only state ──────────────────────────────────────────────────────
  const [view,      setView]      = useState('board');
  const [dropStage, setDropStage] = useState(null);
  const [toast,     setToast]     = useState({ msg: '', icon: 'check', show: false });
  const dragId      = useRef(null);
  const toastTimer  = useRef(null);

  // Internal toast (move confirmations); errors still go to app-level showToast
  function notify(msg, icon) {
    setToast({ msg, icon: icon || 'check', show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2200);
  }

  // ── Data fetching — unchanged ──────────────────────────────────────────────
  const fetchProspects = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, name, pic_name, source, pipeline_stage, created_at')
        .eq('company_id', profile.company_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProspects(data || []);
    } catch (err) {
      showToast?.('Gagal memuat pipeline: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, showToast]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  // ── Drag-and-drop handler — Supabase logic unchanged, adapted for new design ─
  // New design calls handleDrop(stageId) with lowercase id; DB needs uppercase.
  const handleDropStage = useCallback(async (stageId) => {
    const id = dragId.current;
    setDraggingId(null);                              // always clear fade immediately
    const newStage = stageId.toUpperCase();           // DB stores uppercase
    const prospect = prospects.find(p => p.id === id);
    if (!prospect || (prospect.pipeline_stage || 'NEW') === newStage) {
      setDropStage(null);
      return;
    }

    // Optimistic update
    setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: newStage } : p));
    setDropStage(null);

    try {
      const { error } = await supabase
        .from('prospects')
        .update({ pipeline_stage: newStage, updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      const st = STAGES.find(s => s.id === stageId);
      notify((prospect.name || '') + ' dipindah ke ' + (st?.name || stageId),
        stageId === 'won' ? 'checkcircle' : stageId === 'lost' ? 'ban' : 'check');
    } catch (err) {
      // Rollback
      setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: prospect.pipeline_stage } : p));
      showToast?.('Gagal memindah stage: ' + err.message, 'error');
    }
  }, [prospects, profile?.id, showToast]);

  function onDragStart(e, id) {
    dragId.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
  }
  function onDragEnd() {
    setDraggingId(null);
    setDropStage(null);
  }
  function refresh() { fetchProspects(); notify('Pipeline diperbarui', 'refresh'); }

  // ── Map Supabase prospects → deal shape for visual components ──────────────
  const deals = prospects.map(p => ({
    id:      p.id,
    co:      p.name,
    contact: p.pic_name || '',
    value:   p.estimated_value ?? p.deal_value ?? 0,
    date:    fmtDate(p.created_at),
    svc:     sourceToSvc(p.source),
    stage:   (p.pipeline_stage || 'NEW').toLowerCase(),
  }));

  const activeCount = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;

  /* ── Render ── */
  return (
    <div style={S.root}>

      {/* ── Header ── */}
      <div style={S.head}>
        <div>
          <nav style={S.crumbs}>
            <span>Home</span>
            <Icon name="chevright" size={13} />
            <span>CRM / Sales</span>
            <Icon name="chevright" size={13} />
            <span style={S.crumbCur}>Pipeline / Leads</span>
          </nav>
          <h1 style={S.title}>Pipeline / Leads</h1>
          <div style={S.sub}>
            <b style={{ color: '#E85A1E', fontWeight: 700 }}>{activeCount}</b> prospect aktif dalam pipeline
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={S.toolbar}>
        <HoverButton base={S.primary} hover={S.primaryHover}
          onClick={() => {
            setEditingProspect?.(null);
            setShowProspectForm?.(true);
            setActiveMenu?.('crm-prospects');
          }}>
          <Icon name="plus" size={16} />Tambah Deal
        </HoverButton>
        <HoverButton base={S.drop} hover={S.dropHover}>
          <span>Semua Anggota</span><Icon name="chevdown" size={15} color="#9AA0AC" />
        </HoverButton>
        <HoverButton base={S.drop} hover={S.dropHover}>
          <Icon name="filter" size={15} color="#9AA0AC" /><span>Filter</span>
        </HoverButton>
        <HoverButton base={S.drop} hover={S.dropHover}>
          <span>Nilai Pipeline</span><Icon name="chevdown" size={15} color="#9AA0AC" />
        </HoverButton>
        <HoverButton base={S.icoBtn} hover={S.icoBtnHover} title="Refresh" onClick={refresh}>
          <Icon name="refresh" size={18} />
        </HoverButton>
        <div style={S.spacer} />
        {/* Single toggle icon: shows the OTHER view */}
        <HoverButton
          base={S.icoBtn} hover={S.icoBtnHover}
          title={view === 'board' ? 'Tampilan daftar' : 'Tampilan kolom'}
          onClick={() => setView(v => v === 'board' ? 'list' : 'board')}
        >
          <Icon name={view === 'board' ? 'list' : 'columns'} size={18} />
        </HoverButton>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: '5rem', textAlign: 'center', color: '#9AA0AC', fontSize: 14 }}>
          Memuat pipeline…
        </div>
      )}

      {/* ── Kanban / board view ── */}
      {!loading && view === 'board' && (
        <div style={S.kanbanWrap}>
          <div style={S.kanban}>
            {STAGES.map((stage, i) => {
              const items    = deals.filter(d => d.stage === stage.id);
              const total    = items.reduce((a, d) => a + (d.value || 0), 0);
              const isFirst  = i === 0;
              const isLast   = i === STAGES.length - 1;
              const clip     = isFirst
                ? 'polygon(0 0, calc(100% - 13px) 0, 100% 50%, calc(100% - 13px) 100%, 0 100%)'
                : isLast
                ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 13px 50%)'
                : 'polygon(0 0, calc(100% - 13px) 0, 100% 50%, calc(100% - 13px) 100%, 0 100%, 13px 50%)';
              const fillColor = stage.tone === 'won' ? '#1F8B4D' : '#E85A1E';
              return (
                <div key={stage.id} style={S.col}>
                  {/* Chevron header */}
                  <div style={{ ...S.colHead, background: HEAD_BG[stage.tone], clipPath: clip, paddingLeft: isFirst ? 16 : 17 }}>
                    <div style={S.chTop}>
                      <span style={S.chName}>{stage.name}</span>
                      <span style={S.chCount}>{items.length}</span>
                    </div>
                    <div style={S.chSub}>
                      <b style={{ fontWeight: 700, color: '#fff' }}>{stage.prob}%</b>
                      {total > 0 ? ` · ${rp(total)}` : ''}
                    </div>
                  </div>
                  {/* Progress bar (outside chevron, full width) */}
                  <div style={{ ...S.prog, opacity: stage.tone === 'lost' ? 0.5 : 1 }}>
                    <span style={{ display: 'block', height: '100%', width: stage.prob + '%', background: fillColor, borderRadius: 3, transition: 'width .3s' }} />
                  </div>
                  {/* Drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropStage(stage.id); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropStage(s => s === stage.id ? null : s); }}
                    onDrop={e => { e.preventDefault(); setDraggingId(null); handleDropStage(stage.id); }}
                    style={{ ...S.colBody, ...(dropStage === stage.id ? S.colBodyOver : null) }}
                  >
                    {items.length
                      ? items.map(d => (
                          <DealCard
                            key={d.id} deal={d} stColor={stage.color}
                            dragging={draggingId === d.id}
                            onDragStart={onDragStart} onDragEnd={onDragEnd}
                          />
                        ))
                      : <div style={S.colEmpty}>Tidak ada deal</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── List view ── */}
      {!loading && view === 'list' && (
        <div style={S.list}>
          {STAGES.map(stage => (
            <ListGroup
              key={stage.id}
              stage={stage}
              items={deals.filter(d => d.stage === stage.id)}
            />
          ))}
        </div>
      )}

      {/* ── Toast notification ── */}
      <div style={{ ...S.toast, opacity: toast.show ? 1 : 0, transform: toast.show ? 'translateY(0)' : 'translateY(8px)', pointerEvents: 'none' }}>
        <Icon name={toast.icon} size={17} />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

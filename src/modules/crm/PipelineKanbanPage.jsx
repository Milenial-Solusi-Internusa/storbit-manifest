// src/modules/crm/PipelineKanbanPage.jsx
// Visual structure: Claude Design handoff (PipelineKanbanPage.jsx)
// Data layer: existing Supabase logic (fetchProspects, handleDrop, useEffect) — unchanged
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import WinLossModal from './WinLossModal';
import LightHandoverModal from './LightHandoverModal';
import StrategicHandoverModal from './StrategicHandoverModal';
import ConfirmModal from '../../components/ConfirmModal';
import { calcBantScore } from './bant';
import BantScoreBar from './BantScoreBar';

/* =========================================================================
   Pipeline config — lowercase ids match Supabase pipeline_stage.toLowerCase()
   ========================================================================= */
const STAGES = [
  { id: 'new',         name: 'New',         prob: 10,  tone: 'navy', color: '#1B4D8A' },
  { id: 'contacted',   name: 'Contacted',   prob: 20,  tone: 'navy', color: '#1B4D8A' },
  { id: 'qualified',   name: 'Qualified',   prob: 40,  tone: 'navy', color: '#1B4D8A' },
  { id: 'proposal',    name: 'Proposal',    prob: 60,  tone: 'navy', color: '#1B4D8A' },
  { id: 'negotiation', name: 'Negotiation', prob: 80,  tone: 'navy', color: '#1B4D8A' },
  { id: 'won',         name: 'Won',         prob: 100, tone: 'won',  color: '#1F8B4D' },
  { id: 'lost',        name: 'Lost',        prob: 0,   tone: 'lost', color: '#C0392B' },
];

const HEAD_BG = { navy: '#1B4D8A', won: '#1F8B4D', lost: '#C0392B' };

// Service type display config — mapped from prospect.source
const SVC = {
  sea:     { label: 'Sea Freight',   bg: '#E1ECF5', fg: '#1E5894' },
  air:     { label: 'Air Freight',   bg: '#E2F0F7', fg: '#1B7299' },
  land:    { label: 'Trucking',      bg: '#F6E8D6', fg: '#A45A22' },
  customs: { label: 'Customs',       bg: '#ECE3F4', fg: '#6E4B8C' },
  wh:      { label: 'Warehousing',   bg: '#DCEBEA', fg: '#1F6B6B' },
  project: { label: 'Project Cargo', bg: '#E5EDF7', fg: '#234F86' },
  digital: { label: 'Digital',       bg: '#FBE6DA', fg: '#C8521B' },
  forwarding: { label: 'Forwarding', bg: '#EEF2FF', fg: '#1B4D8A' },
  trading:    { label: 'Trading',    bg: '#FEF3EE', fg: '#E85A1E' },
};

// Map prospect.source → service/badge group (covers all 11 current source values)
const SOURCE_TO_SVC = {
  sales_visit:      'forwarding',
  cold_call:        'forwarding',
  referral:         'forwarding',
  existing_network: 'forwarding',
  exhibition:       'trading',
  instagram:        'digital',
  linkedin:         'digital',
  tiktok:           'digital',
  website:          'digital',
  walk_in:          'forwarding',
  other:            'forwarding',
};
const sourceToSvc = src => SOURCE_TO_SVC[src] || 'forwarding';

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
  user:        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clock:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
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
  lgName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 600, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: '#fff' },
  lgCount: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.8)' },
  lgProb: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  lgTotal: { marginLeft: 'auto', fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, color: '#fff', fontSize: 14, letterSpacing: -0.3 },
  lr: { display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 150px 150px 170px', gap: 14, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid #F4F5F7' },
  lrHead: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9AA0AC', background: '#FAFBFC', borderBottom: '1px solid #F0F1F4', padding: '8px 16px' },
  lrCo: { fontWeight: 700, fontSize: 13, color: '#1A2330', letterSpacing: -0.1 },
  lrContact: { fontSize: 11.5, color: '#838A95', marginTop: 1 },
  lrDate: { fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 6 },
  lrVal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 14, color: '#1B4D8A', textAlign: 'right', letterSpacing: -0.3 },
  lrEmpty: { padding: '18px 16px', fontSize: 11.5, color: '#A6ABB5' },
  toast: { position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 9, background: '#16243A', color: '#fff', padding: '11px 15px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 12px 30px rgba(10,20,40,.28)', zIndex: 200, transition: 'opacity .2s ease, transform .2s ease' },
};

const valColorFor = stage => stage === 'won' ? '#1F8B4D' : stage === 'lost' ? '#9AA0AC' : '#1B4D8A';

// Aging limits (hari) per stage — selaras Edge Function aging-pipeline.
const AGING_LIMITS = { contacted: 5, qualified: 5, proposal: 3, negotiation: 14 };
// Hitung badge aging dari stage_changed_at. null bila stage tak ter-aging / aman.
function agingBadge(stageId, stageChangedAt) {
  const limit = AGING_LIMITS[stageId];
  if (!limit || !stageChangedAt) return null;
  const days = Math.floor((Date.now() - new Date(stageChangedAt).getTime()) / 86400000);
  if (isNaN(days)) return null;
  if (days > limit) return { text: 'Overdue', bg: '#FBE3E3', fg: '#C0392B' };
  if (days >= Math.ceil(limit * 0.75)) return { text: `${days} hari`, bg: '#FBF0DD', fg: '#B45309' };
  return null;
}

/* ── Stage badge config ── */
const STAGE_BADGE = {
  new:         { bg: '#EEF3FB', color: '#1B4D8A' },
  contacted:   { bg: '#EEF3FB', color: '#1B4D8A' },
  qualified:   { bg: '#FBE6DA', color: '#C8521B' },
  proposal:    { bg: '#ECE3F4', color: '#6E4B8C' },
  negotiation: { bg: '#FBEFD3', color: '#9A6B12' },
  won:         { bg: '#DEF0E4', color: '#1F8B4D' },
  lost:        { bg: '#EFEFF2', color: '#9AA0AC' },
};
const CUSTOMER_TYPE_LABELS = { freight: 'Freight', customs: 'Customs', trading: 'Trading', mixed: 'Mixed' };
const SOURCE_LABELS_KP = {
  sales_visit: 'Sales Visit', cold_call: 'Cold Call', referral: 'Referral',
  existing_network: 'Existing Network', exhibition: 'Exhibition', instagram: 'Instagram',
  linkedin: 'LinkedIn', tiktok: 'TikTok', website: 'Website', walk_in: 'Walk-in', other: 'Lainnya',
};

/* ── Toolbar control config + client-side filter/sort helpers ── */
const SORT_OPTIONS = [
  { id: 'recent',     label: 'Terbaru' },
  { id: 'oldest',     label: 'Terlama' },
  { id: 'value_desc', label: 'Nilai Tertinggi' },
  { id: 'value_asc',  label: 'Nilai Terendah' },
  { id: 'closing',    label: 'Closing Terdekat' },
  { id: 'name_az',    label: 'Nama A–Z' },
];

const BANT_BANDS = [
  { id: 'high', label: 'Tinggi (6–7)' },
  { id: 'mid',  label: 'Sedang (4–5)' },
  { id: 'low',  label: 'Rendah (1–3)' },
  { id: 'none', label: 'Belum diisi' },
];

const CLOSING_OPTIONS = [
  { id: 'all',   label: 'Semua' },
  { id: 'month', label: 'Bulan ini' },
  { id: 'd30',   label: '30 hari ke depan' },
  { id: 'd60',   label: '60 hari ke depan' },
  { id: 'd90',   label: '90 hari ke depan' },
];

const EMPTY_FILTERS = { sources: [], types: [], bant: [], closing: 'all' };

const toggleIn = (arr, val) => (arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

function bantBandOf(raw) {
  const s = raw.bant_score != null ? raw.bant_score : calcBantScore(raw);
  if (s >= 6) return 'high';
  if (s >= 4) return 'mid';
  if (s >= 1) return 'low';
  return 'none';
}

function closingMatch(raw, mode) {
  if (mode === 'all') return true;
  if (!raw.estimated_closing_date) return false;
  const d = new Date(raw.estimated_closing_date);
  if (isNaN(d.getTime())) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (mode === 'month') {
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  const days = mode === 'd30' ? 30 : mode === 'd60' ? 60 : 90;
  const end = new Date(today); end.setDate(end.getDate() + days);
  return d >= today && d <= end;
}

function sortDeals(items, mode) {
  const arr = [...items];
  const t = iso => { const d = new Date(iso); return isNaN(d.getTime()) ? 0 : d.getTime(); };
  switch (mode) {
    case 'oldest':     arr.sort((a, b) => t(a.raw.created_at) - t(b.raw.created_at)); break;
    case 'value_desc': arr.sort((a, b) => (b.value || 0) - (a.value || 0)); break;
    case 'value_asc':  arr.sort((a, b) => (a.value || 0) - (b.value || 0)); break;
    case 'closing':    arr.sort((a, b) => {
        const da = a.raw.estimated_closing_date, db = b.raw.estimated_closing_date;
        if (!da && !db) return 0;
        if (!da) return 1;            // null/empty closing date sorts last
        if (!db) return -1;
        return t(da) - t(db);
      }); break;
    case 'name_az':    arr.sort((a, b) => (a.co || '').localeCompare(b.co || '')); break;
    case 'recent':
    default:           arr.sort((a, b) => t(b.raw.created_at) - t(a.raw.created_at)); break;
  }
  return arr;
}

/* ── Toolbar popover primitives ── */
const FILTER_SECTION = { fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#9AA0AC', padding: '8px 8px 4px' };

function MenuBox({ width, children }) {
  return (
    <div style={{ position: 'absolute', top: 46, left: 0, minWidth: width || 220, maxHeight: 360, overflowY: 'auto', background: '#fff', border: '1px solid #E0E2E8', borderRadius: 10, boxShadow: '0 12px 30px rgba(20,40,70,.16)', padding: 6, zIndex: 150 }}>
      {children}
    </div>
  );
}

function MenuOption({ active, onClick, children }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, border: 0, background: active ? '#EEF3FB' : (h ? '#F6F7F9' : 'transparent'), color: active ? '#1B4D8A' : '#3C4350', fontWeight: active ? 700 : 500, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
    >
      <span style={{ width: 16, flex: '0 0 16px', display: 'flex' }}>{active && <Icon name="check" size={15} color="#1B4D8A" />}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}

function CheckRow({ checked, round, onClick, children }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 6, border: 0, background: h ? '#F6F7F9' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: '#3C4350', textAlign: 'left' }}
    >
      <span style={{ width: 16, height: 16, flex: '0 0 16px', borderRadius: round ? '50%' : 4, border: `1.5px solid ${checked ? '#1B4D8A' : '#C7CBD4'}`, background: checked ? '#1B4D8A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && (round ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} /> : <Icon name="check" size={11} color="#fff" />)}
      </span>
      <span>{children}</span>
    </button>
  );
}

/* ── ProspectDetailModal — presentational sub-components (module scope) ── */
const Field = ({ label, value, full }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: full ? '1 / -1' : undefined }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
    <div style={{ fontSize: 13.5, color: value ? '#111827' : '#D1D5DB', fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</div>
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #F3F4F6' }}>{title}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>{children}</div>
  </div>
);

function ProspectDetailModal({ deal, onClose, onEdit }) {
  if (!deal) return null;
  const raw   = deal.raw || {};
  const stage = STAGES.find(s => s.id === deal.stage) || STAGES[0];
  const badge = STAGE_BADGE[deal.stage] || STAGE_BADGE.new;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, maxWidth: 640, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.20)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 6 }}>DETAIL PROSPECT</div>
              <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: '#111827', fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2 }}>{deal.co}</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...badge, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{stage.name}</span>
                {raw.customer_type && (
                  <span style={{ background: '#F3F4F6', color: '#374151', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                    {CUSTOMER_TYPE_LABELS[raw.customer_type] || raw.customer_type}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => { onEdit(deal); onClose(); }}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1B4D8A', color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Edit
              </button>
              <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="checkcircle" size={16} color="#6B7280" style={null} />
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#6B7280" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px 28px' }}>
          <Section title="Informasi Perusahaan">
            <Field label="Legal Name"     value={raw.legal_name} />
            <Field label="Customer Type"  value={CUSTOMER_TYPE_LABELS[raw.customer_type] || raw.customer_type} />
            <Field label="Phone"          value={raw.phone} />
            <Field label="Email"          value={raw.email} />
            <Field label="City"           value={raw.city} />
            <Field label="Address"        value={raw.address} full />
          </Section>

          <Section title="PIC">
            <Field label="PIC Name"  value={raw.pic_name} />
            <Field label="PIC Phone" value={raw.pic_phone} />
            <Field label="PIC Email" value={raw.pic_email} full />
          </Section>

          <Section title="Pipeline & Sales">
            <Field label="Stage"                  value={stage.name} />
            <Field label="Source"                 value={SOURCE_LABELS_KP[raw.source] || raw.source} />
            <Field label="Assigned To"            value={raw.assigned_profile?.full_name} />
            <Field label="Estimated Closing Date" value={raw.estimated_closing_date ? fmtDate(raw.estimated_closing_date) : null} />
            {deal.stage === 'won'  && <Field label="Alasan Won"  value={raw.won_reason} full />}
            {deal.stage === 'lost' && <Field label="Alasan Lost" value={raw.lost_reason} full />}
          </Section>

          <Section title="BANT Qualification">
            <div style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
              <BantScoreBar score={raw.bant_score != null ? raw.bant_score : calcBantScore(raw)} />
            </div>
            <Field label="Komoditi / Barang"          value={raw.bant_commodity} />
            <Field label="Kota/Port Asal (POL)"       value={raw.bant_origin} />
            <Field label="Kota/Port Tujuan (POD)"     value={raw.bant_destination} />
            <Field label="Frekuensi Pengiriman"       value={raw.bant_frequency} />
            <Field label="Vendor / Forwarder Saat Ini" value={raw.bant_current_vendor} />
            <Field label="Preferensi Payment"         value={raw.bant_payment} />
            <Field label="Decision Maker"             value={raw.bant_decision_maker} full />
          </Section>

          <Section title="Finansial">
            <Field label="Payment Terms" value={raw.payment_terms_id || null} />
          </Section>

          {raw.notes && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #F3F4F6' }}>Notes</div>
              <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: '10px 14px' }}>{raw.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Deal card ── */
function DealCard({ deal, stColor, onDragStart, onDragEnd, dragging, onClick }) {
  const [h, setH] = useState(false);
  const isDragging = useRef(false);
  const svc = SVC[deal.svc] || SVC.sea;
  const aging = agingBadge(deal.stage, deal.stageChangedAt);
  return (
    <div
      draggable
      onDragStart={e => { isDragging.current = true; onDragStart(e, deal.id); }}
      onDragEnd={e => { isDragging.current = false; onDragEnd(e); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => { if (!isDragging.current) onClick?.(deal); }}
      style={{ ...S.deal, borderLeft: '3px solid ' + stColor, ...(h ? S.dealHover : null), ...(dragging ? { opacity: 0.45 } : null) }}
    >
      {aging && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: aging.fg, background: aging.bg, borderRadius: 99, padding: '2px 8px' }}>
            <Icon name="clock" size={11} color={aging.fg} />{aging.text}
          </span>
        </div>
      )}
      <div style={S.dCo}>{deal.co}</div>
      {deal.contact && <div style={S.dContact}>{deal.contact}</div>}
      <div style={{ ...S.dVal, color: valColorFor(deal.stage), textDecoration: deal.stage === 'lost' ? 'line-through' : 'none' }}>
        {deal.value ? rp(deal.value) : '—'}
      </div>
      <div style={S.dMeta}>
        <span style={S.dDate}><Icon name="calendar" size={13} color="#A6ABB5" />{deal.date}</span>
        <span style={{ ...S.svc, background: svc.bg, color: svc.fg }}>{svc.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11.5 }}>
        <Icon name="user" size={12} color="#A6ABB5" />
        {deal.assigned
          ? <span style={{ color: '#6B7280', fontWeight: 500 }}>{deal.assigned}</span>
          : <span style={{ color: '#C2410C', fontWeight: 600 }}>Belum di-assign</span>}
      </div>
    </div>
  );
}

/* ── List row ── */
function ListRow({ deal, onClick }) {
  const [h, setH] = useState(false);
  const svc = SVC[deal.svc] || SVC.sea;
  return (
    <div
      style={{ ...S.lr, ...(h ? { background: '#FAFBFC' } : null), cursor: 'pointer' }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => onClick?.(deal)}
    >
      <div>
        <div style={S.lrCo}>{deal.co}</div>
        {deal.contact && <div style={S.lrContact}>{deal.contact}</div>}
        <div style={{ fontSize: 11, marginTop: 2 }}>
          {deal.assigned
            ? <span style={{ color: '#9AA0AA' }}>{deal.assigned}</span>
            : <span style={{ color: '#C2410C', fontWeight: 600 }}>Belum di-assign</span>}
        </div>
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
function ListGroup({ stage, items, onRowClick }) {
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
        style={{ ...S.lgHead, background: HEAD_BG[stage.tone], borderLeft: '3px solid ' + stage.color, ...(hh ? { filter: 'brightness(1.08)' } : null) }}
      >
        <Icon name="chevdown" size={16} color="rgba(255,255,255,.85)" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', flex: '0 0 9px', background: 'rgba(255,255,255,.9)' }} />
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
            ? items.map(d => <ListRow key={d.id} deal={d} onClick={onRowClick} />)
            : <div style={S.lrEmpty}>Tidak ada deal di tahap ini</div>}
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
export default function PipelineKanbanPage({ showToast, setActiveMenu, setShowProspectForm, setEditingProspect }) {
  const { profile, erpRole, user } = useAuth();
  // Visibility scope by role (mirrors RLS on `accounts` + CRMDashboard):
  //  • super_admin / admin → all entities (no company filter)
  //  • sales / operations  → only prospects assigned to / created by them
  //  • everyone else (manager, ceo, gm, …) → their own entity
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);

  // ── Existing state — unchanged ─────────────────────────────────────────────
  const [prospects,    setProspects]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [draggingId,   setDraggingId]   = useState(null);
  const [detailDeal,   setDetailDeal]   = useState(null);

  // ── New UI-only state ──────────────────────────────────────────────────────
  const [view,      setView]      = useState('board');
  const [dropStage, setDropStage] = useState(null);
  const [toast,     setToast]     = useState({ msg: '', icon: 'check', show: false });
  // Win/Loss capture modal — { open, mode, id, prevStage, prospectName }
  const [winLoss,       setWinLoss]       = useState({ open: false, mode: 'won', id: null, prevStage: 'NEW', prospectName: '' });
  const [winLossSaving, setWinLossSaving] = useState(false);
  // Handover gate (WON only): { open, type:'light'|'strategic', account, prevStage, wonValues }
  const [handover,      setHandover]      = useState({ open: false, type: 'light', account: null, prevStage: 'NEW', wonValues: null });
  const HANDOVER_TCV_LIMIT = 100000000; // ≤ 100jt → Light, > → Strategic
  // Soft stage gating — confirm (not block) when prerequisites are missing.
  const [stageGate,     setStageGate]     = useState({ open: false, stageId: null, id: null, type: null, prospectName: '' });
  // Toolbar controls — member filter / sort / filter panel (all client-side)
  const [openMenu,     setOpenMenu]     = useState(null);   // 'member' | 'sort' | 'filter' | null
  const [memberFilter, setMemberFilter] = useState(null);   // accounts.assigned_to
  const [sortMode,     setSortMode]     = useState('recent');
  const [filters,      setFilters]      = useState(EMPTY_FILTERS);  // applied
  const [filterDraft,  setFilterDraft]  = useState(EMPTY_FILTERS);  // panel working copy
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
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('accounts')
        .select('id, name, legal_name, customer_type, phone, email, city, address, pic_name, pic_phone, pic_email, source, pipeline_stage, lost_reason, won_reason, estimated_closing_date, estimated_value, payment_terms_id, notes, assigned_to, created_at, stage_changed_at, is_in_lead_pool, bant_commodity, bant_origin, bant_destination, bant_frequency, bant_current_vendor, bant_payment, bant_decision_maker, bant_score, bant_budget, bant_authority, bant_need, bant_timeline, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)')
        .eq('account_status', 'prospect')
        .eq('is_in_lead_pool', false)
        .is('deleted_at', null);

      // Role-aware scope (see flags above)
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      if (isSalesOnly)    query = query.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      setProspects(data || []);
    } catch (err) {
      showToast?.('Gagal memuat pipeline: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, showToast]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  // ── Drag-and-drop handler — Supabase logic unchanged, adapted for new design ─
  // New design calls handleDrop(stageId) with lowercase id; DB needs uppercase.
  // Perform the actual stage move. Shared by handleDropStage (no gating needed)
  // and the soft-gate confirm handler (user chose "Ya, Lanjut").
  const applyStageMove = useCallback(async (stageId, id, prospect) => {
    const newStage = stageId.toUpperCase();           // DB stores uppercase

    // WON / LOST require a reason — move card optimistically, then open WinLossModal.
    // The DB write happens only after the modal is saved (handleWinLossSave).
    if (newStage === 'WON' || newStage === 'LOST') {
      const prevStage = prospect.pipeline_stage || 'NEW';
      setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: newStage } : p));
      setWinLoss({ open: true, mode: newStage.toLowerCase(), id, prevStage, prospectName: prospect.name || '' });
      return;
    }

    // Optimistic update
    setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: newStage } : p));

    try {
      const { error } = await supabase
        .from('accounts')
        .update({ pipeline_stage: newStage, updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      logAudit(supabase, {
        action: ACTION_TYPES.CHANGE_PIPELINE_STAGE,
        entityType: ENTITY_TYPES.DEAL,
        entityId: id,
        entityLabel: prospect.name || '',
        notes: (prospect.pipeline_stage || 'NEW') + ' → ' + newStage,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      const st = STAGES.find(s => s.id === stageId);
      notify((prospect.name || '') + ' dipindah ke ' + (st?.name || stageId),
        stageId === 'won' ? 'checkcircle' : stageId === 'lost' ? 'ban' : 'check');
    } catch (err) {
      // Rollback
      setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: prospect.pipeline_stage } : p));
      showToast?.('Gagal memindah stage: ' + err.message, 'error');
    }
  }, [profile?.id, showToast]);

  const handleDropStage = useCallback(async (stageId) => {
    const id = dragId.current;
    setDraggingId(null);                              // always clear fade immediately
    const newStage = stageId.toUpperCase();           // DB stores uppercase
    const prospect = prospects.find(p => p.id === id);
    setDropStage(null);
    if (!prospect || (prospect.pipeline_stage || 'NEW') === newStage) {
      return;
    }

    // ── Soft stage gating ──────────────────────────────────────────────────
    // PROPOSAL without an Inquiry, or WON without a Quotation → ask first
    // (lightweight COUNT). User can always proceed. On confirm, the move
    // resumes via handleStageGateConfirm → applyStageMove.
    if (newStage === 'QUALIFIED') {
      // BANT gate: ≥8 lolos, 5–7 konfirmasi, <5 blok total.
      const score = calcBantScore(prospect);
      if (score < 5) {
        showToast?.(`BANT score terlalu rendah (${score}/12). Lengkapi qualification dulu sebelum Qualified.`, 'error');
        return;
      }
      if (score < 8) {
        setStageGate({ open: true, stageId, id, type: 'qualified', prospectName: prospect.name || '', score });
        return;
      }
    } else if (newStage === 'PROPOSAL') {
      const { count } = await supabase
        .from('inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('prospect_id', id);
      if (!count) {
        setStageGate({ open: true, stageId, id, type: 'proposal', prospectName: prospect.name || '' });
        return;
      }
    } else if (newStage === 'WON') {
      const { count } = await supabase
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('prospect_id', id);
      if (!count) {
        setStageGate({ open: true, stageId, id, type: 'won', prospectName: prospect.name || '' });
        return;
      }
    }

    applyStageMove(stageId, id, prospect);
  }, [prospects, applyStageMove, showToast]);

  // ── Soft gate — "Ya, Lanjut" resumes the held move; "Batal" leaves card put ─
  const handleStageGateConfirm = useCallback(() => {
    const { stageId, id, open } = stageGate;
    setStageGate(g => ({ ...g, open: false }));
    if (!open || !id) return;
    const prospect = prospects.find(p => p.id === id);
    if (prospect) applyStageMove(stageId, id, prospect);
  }, [stageGate, prospects, applyStageMove]);

  const handleStageGateCancel = useCallback(() => {
    // No optimistic update happened yet, so the card simply stays in place.
    setStageGate(g => ({ ...g, open: false }));
  }, []);

  // ── Win/Loss modal — cancel reverts the optimistic move (no DB write) ───────
  const handleWinLossCancel = useCallback(() => {
    setWinLoss(wl => {
      if (wl.id) {
        setProspects(prev => prev.map(p => p.id === wl.id ? { ...p, pipeline_stage: wl.prevStage } : p));
      }
      return { ...wl, open: false, id: null };
    });
  }, []);

  // Finalize WON → write accounts (pipeline_stage WON + convert to customer).
  // Dipanggil setelah handover form disubmit. Return boolean.
  const finalizeWon = useCallback(async (id, prevStage, prospectName, wonValues) => {
    const nowIso = new Date().toISOString();
    const payload = {
      pipeline_stage: 'WON', ...wonValues, updated_by: profile.id,
      converted_at: nowIso, account_status: 'customer', became_customer_at: nowIso,
    };
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) {
      setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: prevStage } : p));
      showToast?.('Gagal menyimpan: ' + error.message, 'error');
      return false;
    }
    logAudit(supabase, {
      action: ACTION_TYPES.CHANGE_PIPELINE_STAGE, entityType: ENTITY_TYPES.DEAL,
      entityId: id, entityLabel: prospectName || '', notes: (prevStage || 'NEW') + ' → WON',
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: 'WON', ...wonValues } : p));
    notify((prospectName || '') + ' dipindah ke Won', 'checkcircle');
    return true;
  }, [profile?.id, showToast]);

  // ── Win/Loss modal — LOST tulis langsung; WON buka handover gate dulu ──────────
  const handleWinLossSave = useCallback(async (values) => {
    const { id, mode } = winLoss;
    if (!id) return;
    if (mode === 'won') {
      // Tunda update accounts — buka handover form (Light/Strategic by estimated_value).
      const prospect = prospects.find(p => p.id === id);
      const tcv = Number(prospect?.estimated_value || 0);
      setHandover({
        open: true,
        type: tcv > HANDOVER_TCV_LIMIT ? 'strategic' : 'light',
        account: prospect || { id, name: winLoss.prospectName },
        prevStage: winLoss.prevStage,
        wonValues: values,
      });
      setWinLoss(wl => ({ ...wl, open: false }));
      return;
    }
    // LOST → tulis langsung
    setWinLossSaving(true);
    try {
      const payload = { pipeline_stage: 'LOST', ...values, updated_by: profile.id, account_status: 'lost' };
      const { error } = await supabase.from('accounts').update(payload).eq('id', id);
      if (error) throw error;
      logAudit(supabase, {
        action: ACTION_TYPES.CHANGE_PIPELINE_STAGE, entityType: ENTITY_TYPES.DEAL,
        entityId: id, entityLabel: winLoss.prospectName || '', notes: (winLoss.prevStage || 'NEW') + ' → LOST',
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: 'LOST', ...values } : p));
      notify((winLoss.prospectName || '') + ' dipindah ke Lost', 'ban');
      setWinLoss(wl => ({ ...wl, open: false, id: null }));
    } catch (err) {
      setProspects(prev => prev.map(p => p.id === id ? { ...p, pipeline_stage: winLoss.prevStage } : p));
      setWinLoss(wl => ({ ...wl, open: false, id: null }));
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setWinLossSaving(false);
    }
  }, [winLoss, prospects, profile?.id, showToast]);

  // Handover submit → insert deal_handovers, lalu finalize WON. Return boolean.
  const handleHandoverSubmit = useCallback(async (fields) => {
    const { account, type, prevStage, wonValues } = handover;
    if (!account?.id) return false;
    const { error } = await supabase.from('deal_handovers').insert({
      company_id: profile.company_id,
      account_id: account.id,
      handover_type: type,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      created_by: profile.id,
      ...fields,
    });
    if (error) { showToast?.('Gagal menyimpan handover: ' + error.message, 'error'); return false; }
    const ok = await finalizeWon(account.id, prevStage, account.name, wonValues);
    if (!ok) return false;
    setHandover(h => ({ ...h, open: false, account: null }));
    return true;
  }, [handover, profile?.company_id, profile?.id, finalizeWon, showToast]);

  // Handover cancel → batalkan WON, kembalikan stage ke sebelumnya.
  const handleHandoverCancel = useCallback(() => {
    setHandover(h => {
      if (h.account?.id) setProspects(prev => prev.map(p => p.id === h.account.id ? { ...p, pipeline_stage: h.prevStage } : p));
      return { ...h, open: false, account: null };
    });
  }, []);

  function onDragStart(e, id) {
    dragId.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch (err) {
      // Non-fatal: the drag uses dragId.current as its source of truth, so a
      // setData() failure (rare browser edge case) doesn't break drag-and-drop.
      // Log lightly for diagnostics; do not surface to the user.
      console.warn('[Pipeline] dataTransfer.setData failed (non-fatal):', err);
    }
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
    value:   p.estimated_value ?? 0,
    date:    fmtDate(p.created_at),
    svc:     sourceToSvc(p.source),
    stage:   (p.pipeline_stage || 'NEW').toLowerCase(),
    assigned: p.assigned_profile?.full_name || null,
    stageChangedAt: p.stage_changed_at || null,
    raw:     p,
  }));

  // Distinct members / sources / customer types for the toolbar controls
  const memberMap = new Map();
  prospects.forEach(p => { if (p.assigned_to && !memberMap.has(p.assigned_to)) memberMap.set(p.assigned_to, p.assigned_profile?.full_name || 'Tanpa nama'); });
  const members    = [...memberMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const sourceOpts = [...new Set(prospects.map(p => p.source).filter(Boolean))];
  const typeOpts   = [...new Set(prospects.map(p => p.customer_type).filter(Boolean))];

  // Apply member + panel filters (AND-combined). Sort is applied per-stage at render.
  const filteredDeals = deals.filter(d => {
    if (memberFilter && d.raw.assigned_to !== memberFilter) return false;
    if (filters.sources.length && !filters.sources.includes(d.raw.source)) return false;
    if (filters.types.length && !filters.types.includes(d.raw.customer_type)) return false;
    if (filters.bant.length && !filters.bant.includes(bantBandOf(d.raw))) return false;
    if (!closingMatch(d.raw, filters.closing)) return false;
    return true;
  });

  const activeCount = filteredDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;
  const activeFilterCount =
    (filters.sources.length ? 1 : 0) +
    (filters.types.length ? 1 : 0) +
    (filters.bant.length ? 1 : 0) +
    (filters.closing !== 'all' ? 1 : 0);
  const memberLabel = memberFilter ? (members.find(m => m.id === memberFilter)?.name || 'Anggota') : 'Semua Anggota';
  const sortLabel   = SORT_OPTIONS.find(o => o.id === sortMode)?.label || 'Urutkan';

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
        {/* Member filter */}
        <div style={{ position: 'relative' }}>
          <HoverButton base={S.drop} hover={S.dropHover}
            onClick={() => setOpenMenu(m => m === 'member' ? null : 'member')}>
            <Icon name="users" size={15} color="#9AA0AC" />
            <span>{memberLabel}</span>
            <Icon name="chevdown" size={15} color="#9AA0AC" />
          </HoverButton>
          {openMenu === 'member' && (
            <MenuBox width={230}>
              <MenuOption active={!memberFilter} onClick={() => { setMemberFilter(null); setOpenMenu(null); }}>Semua Anggota</MenuOption>
              {members.map(m => (
                <MenuOption key={m.id} active={memberFilter === m.id} onClick={() => { setMemberFilter(m.id); setOpenMenu(null); }}>{m.name}</MenuOption>
              ))}
              {members.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: '#9AA0AC' }}>Belum ada anggota ter-assign</div>}
            </MenuBox>
          )}
        </div>

        {/* Filter panel */}
        <div style={{ position: 'relative' }}>
          <HoverButton base={S.drop} hover={S.dropHover}
            onClick={() => { if (openMenu === 'filter') { setOpenMenu(null); } else { setFilterDraft(filters); setOpenMenu('filter'); } }}>
            <Icon name="filter" size={15} color="#9AA0AC" />
            <span>{activeFilterCount ? `Filter · ${activeFilterCount}` : 'Filter'}</span>
          </HoverButton>
          {openMenu === 'filter' && (
            <MenuBox width={300}>
              <div style={FILTER_SECTION}>Source</div>
              {sourceOpts.length ? sourceOpts.map(src => (
                <CheckRow key={src} checked={filterDraft.sources.includes(src)} onClick={() => setFilterDraft(d => ({ ...d, sources: toggleIn(d.sources, src) }))}>
                  {SOURCE_LABELS_KP[src] || src}
                </CheckRow>
              )) : <div style={{ padding: '4px 10px', fontSize: 12, color: '#9AA0AC' }}>—</div>}

              <div style={FILTER_SECTION}>Customer Type</div>
              {typeOpts.length ? typeOpts.map(tp => (
                <CheckRow key={tp} checked={filterDraft.types.includes(tp)} onClick={() => setFilterDraft(d => ({ ...d, types: toggleIn(d.types, tp) }))}>
                  {CUSTOMER_TYPE_LABELS[tp] || tp}
                </CheckRow>
              )) : <div style={{ padding: '4px 10px', fontSize: 12, color: '#9AA0AC' }}>—</div>}

              <div style={FILTER_SECTION}>BANT Score</div>
              {BANT_BANDS.map(b => (
                <CheckRow key={b.id} checked={filterDraft.bant.includes(b.id)} onClick={() => setFilterDraft(d => ({ ...d, bant: toggleIn(d.bant, b.id) }))}>
                  {b.label}
                </CheckRow>
              ))}

              <div style={FILTER_SECTION}>Estimasi Closing</div>
              {CLOSING_OPTIONS.map(c => (
                <CheckRow key={c.id} round checked={filterDraft.closing === c.id} onClick={() => setFilterDraft(d => ({ ...d, closing: c.id }))}>
                  {c.label}
                </CheckRow>
              ))}

              <div style={{ display: 'flex', gap: 8, padding: '10px 8px 4px', borderTop: '1px solid #F0F1F4', marginTop: 6 }}>
                <button onClick={() => { setFilters(EMPTY_FILTERS); setFilterDraft(EMPTY_FILTERS); setOpenMenu(null); }}
                  style={{ flex: 1, height: 34, borderRadius: 8, border: '1px solid #E0E2E8', background: '#fff', color: '#6B7280', fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
                  Reset
                </button>
                <button onClick={() => { setFilters(filterDraft); setOpenMenu(null); }}
                  style={{ flex: 1, height: 34, borderRadius: 8, border: '1px solid #1B4D8A', background: '#1B4D8A', color: '#fff', fontWeight: 700, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
                  Terapkan
                </button>
              </div>
            </MenuBox>
          )}
        </div>

        {/* Sort */}
        <div style={{ position: 'relative' }}>
          <HoverButton base={S.drop} hover={S.dropHover}
            onClick={() => setOpenMenu(m => m === 'sort' ? null : 'sort')}>
            <span>{sortLabel}</span><Icon name="chevdown" size={15} color="#9AA0AC" />
          </HoverButton>
          {openMenu === 'sort' && (
            <MenuBox width={210}>
              {SORT_OPTIONS.map(o => (
                <MenuOption key={o.id} active={sortMode === o.id} onClick={() => { setSortMode(o.id); setOpenMenu(null); }}>{o.label}</MenuOption>
              ))}
            </MenuBox>
          )}
        </div>
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

      {/* Click-outside catcher for any open toolbar popover */}
      {openMenu && <div onClick={() => setOpenMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 140 }} />}

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
              const items    = sortDeals(filteredDeals.filter(d => d.stage === stage.id), sortMode);
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
                            onClick={setDetailDeal}
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
              items={sortDeals(filteredDeals.filter(d => d.stage === stage.id), sortMode)}
              onRowClick={setDetailDeal}
            />
          ))}
        </div>
      )}

      {/* ── Toast notification ── */}
      <div style={{ ...S.toast, opacity: toast.show ? 1 : 0, transform: toast.show ? 'translateY(0)' : 'translateY(8px)', pointerEvents: 'none' }}>
        <Icon name={toast.icon} size={17} />
        <span>{toast.msg}</span>
      </div>

      {/* ── Win/Loss capture modal ── */}
      <WinLossModal
        key={`${winLoss.mode}-${winLoss.id || 'none'}`}
        open={winLoss.open}
        mode={winLoss.mode}
        prospectName={winLoss.prospectName}
        saving={winLossSaving}
        onSave={handleWinLossSave}
        onCancel={handleWinLossCancel}
      />

      {/* ── Handover gate (WON) — Light / Strategic by estimated_value ── */}
      {handover.open && handover.type === 'light' && (
        <LightHandoverModal
          account={handover.account}
          onCancel={handleHandoverCancel}
          onSubmit={handleHandoverSubmit}
        />
      )}
      {handover.open && handover.type === 'strategic' && (
        <StrategicHandoverModal
          account={handover.account}
          onCancel={handleHandoverCancel}
          onSubmit={handleHandoverSubmit}
        />
      )}

      {/* ── Soft stage gating confirmation ── */}
      <ConfirmModal
        open={stageGate.open}
        variant="warning"
        title={stageGate.type === 'won' ? 'Belum Ada Quotation' : stageGate.type === 'qualified' ? 'Score BANT Belum Optimal' : 'Belum Ada Inquiry'}
        message={stageGate.type === 'won'
          ? 'Prospect ini belum punya Quotation. Biasanya deal ditandai WON setelah ada Quotation yang disetujui. Tetap tandai sebagai WON?'
          : stageGate.type === 'qualified'
            ? `BANT score ${stageGate.score}/12 — prospect masih perlu di-nurture. Yakin pindah ke Qualified?`
            : 'Prospect ini belum punya Inquiry. Biasanya Proposal dibuat setelah ada Inquiry. Tetap lanjut ke Proposal?'}
        confirmLabel={stageGate.type === 'won' ? 'Ya, Tandai WON' : 'Ya, Lanjut'}
        cancelLabel="Batal"
        onConfirm={handleStageGateConfirm}
        onCancel={handleStageGateCancel}
      />

      {/* ── Prospect detail modal ── */}
      <ProspectDetailModal
        deal={detailDeal}
        onClose={() => setDetailDeal(null)}
        onEdit={(deal) => {
          setDetailDeal(null);
          setEditingProspect?.(deal.raw);
          setShowProspectForm?.(true);
          setActiveMenu?.('crm-prospects');
        }}
      />
    </div>
  );
}

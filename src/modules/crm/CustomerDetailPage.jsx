// src/modules/crm/CustomerDetailPage.jsx
// Master Customer — DETAIL page. Visual ported from Claude Design (Lovable) handoff
// (CustomerDetailPage.jsx — asset-detail-it style: header card → underline tabs →
//  2-col grid sections + Health Score gauge/breakdown/recommendation).
// Data layer UNCHANGED: real Supabase fetch (customer + joins + prospect for BANT),
// visit history from activities (account_id), BantScoreBar, ConfirmModal delete, inline Notes edit.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import BantScoreBar from './BantScoreBar';
import { calcBantScore } from './bant';
import ConfirmModal from '../../components/ConfirmModal';
import { CustomerFormModal } from './CustomerListPage';
import TOPRequestModal from './TOPRequestModal';
import {
  DealStepper, DealHeaderControls, EditDealModal, PrfListCard,
  STAGES, stageIndex, isKnownStage, saveDealUpdate, fetchAssignees,
} from './DealPanels';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const NAVY = '#1B4D8A';
const ORANGE = '#E85A1E';
const SURFACE = '#FFFDF8';
const INK = '#1A2330';
const INK_SOFT = '#4A5360';
const INK_FAINT = '#A29684';
const LINE = '#ECE3D2';
const LINE_SOFT = '#F2E9D8';
const GREEN = '#22C55E';
const YELLOW = '#F59E0B';
const RED = '#EF4444';

// ─── Inline lucide icons (self-contained) ───────────────────────────────────────
// TOP Request (perpanjangan termin) hanya relevan untuk customer dengan payment
// terms TEMPO. Whitelist by NAMA (id terduplikasi per entitas) — nilai non-tempo
// atau payment terms kosong default-nya hide.
const TEMPO_TERMS = new Set([
  'Net 15 Days',
  'Net 30 Days',
  'Net 45 Days',
  'Net 60 Days',
  'Top Net 7 hari',
]);
const isTempoTerm = (name) => !!name && TEMPO_TERMS.has(String(name).trim());

const ICONS = {
  chevright:  '<path d="m9 18 6-6-6-6"/>',
  chevdown:   '<path d="m6 9 6 6 6-6"/>',
  arrowleft:  '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  pencil:     '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash:      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  x:          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check:      '<path d="M20 6 9 17l-5-5"/>',
  save:       '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  info:       '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  briefcase:  '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  route:      '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  target:     '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  notebook:   '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/>',
  building:   '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  phone:      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  user:       '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  award:      '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  creditcard: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  calendar:   '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  clock:      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  mappin:     '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  globe:      '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  package:    '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  truck:      '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  repeat:     '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  trophy:     '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  usercheck:  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  trendingup: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  filecheck:  '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
  activity:   '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  alert:      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  heartpulse: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.49 4.04 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  database:   '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  eye:        '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
};
function Icon({ name, size = 18, color, style, strokeWidth = 1.7 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color || 'currentColor'}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.info }} />
  );
}

// ─── Config / helpers ───────────────────────────────────────────────────────────
const TIER_CFG = {
  A: { bg: '#F7EAC4', fg: '#8A6A12' },
  B: { bg: '#ECEDF1', fg: '#6B7280' },
  C: { bg: '#F1E1D2', fg: '#9A5B2C' },
};
const STATUS_CFG = {
  // accounts.account_status segments (lifecycle akun)
  lead:       { bg: '#EFEAF6', fg: '#6A3D9A', dot: '#7A4E8C', label: 'Lead'       },
  mql:        { bg: '#E6EEF9', fg: '#2A5B8C', dot: '#2A5B8C', label: 'MQL'        },
  sql:        { bg: '#E1ECF7', fg: '#1B4D8A', dot: '#1B4D8A', label: 'SQL'        },
  customer:   { bg: '#DEF0E4', fg: '#1F8B4D', dot: '#1F8B4D', label: 'Customer'   },
  prospect:   { bg: '#EAF0F8', fg: '#1B4D8A', dot: '#1B4D8A', label: 'Prospect'   },
  lost:       { bg: '#FBE3E0', fg: '#B23227', dot: '#C0392B', label: 'Lost'       },
  free_agent: { bg: '#FBE6DA', fg: '#C8521B', dot: '#E85A1E', label: 'Free Agent' },
  // TODO: hapus setelah backfill lifecycle - lihat AUDIT_CRM_FLOW.md
  lead_pool:  { bg: '#F0EBE0', fg: '#7A6A45', dot: '#B0703C', label: 'Lead Pool'  },
  // legacy customers.status (fallback)
  active:     { bg: '#DEF0E4', fg: '#1F8B4D', dot: '#1F8B4D', label: 'Active'     },
  inactive:   { bg: '#EEF0F3', fg: '#9AA0AC', dot: '#B6BCC6', label: 'Inactive'   },
};
const VISIT_TYPE_CFG = {
  discovery:             { label: 'Discovery',    bg: '#EAF0F8', fg: NAVY },
  solution_presentation: { label: 'Solution',     bg: '#E8F3EC', fg: '#1F8B4D' },
  qbr:                   { label: 'QBR',          bg: '#EFE8F5', fg: '#6A3D9A' },
  problem_solving:       { label: 'Problem',      bg: '#FBE6DA', fg: '#C8521B' },
  routine_touch:         { label: 'Routine',      bg: '#F0EBE0', fg: '#7A6A45' },
};
const VISIT_STATUS_CFG = {
  scheduled: { bg: '#FBE6DA', fg: '#C8521B', dot: '#E85A1E', label: 'Terjadwal'  },
  completed: { bg: '#DEF0E4', fg: '#1F8B4D', dot: '#1F8B4D', label: 'Selesai'    },
  cancelled: { bg: '#FEE2E2', fg: '#B91C1C', dot: '#EF4444', label: 'Dibatalkan' },
};

// Activity type/status badge metas — copied from ActivitiesPage (same colours).
const ACT_TYPE_META = {
  call:        { label: 'Call',        bg: '#E1ECF7', color: '#2563EB', bd: '#BBD3EE' },
  visit:       { label: 'Visit',       bg: '#EFE7F6', color: '#7C3AED', bd: '#D6C6EC' },
  meeting:     { label: 'Meeting',     bg: '#E1ECF5', color: '#1B4D8A', bd: '#BAD2E6' },
  prospecting: { label: 'Prospecting', bg: '#FBE6DA', color: '#C8521B', bd: '#F0C3A8' },
  followup:    { label: 'Follow-up',   bg: '#F8ECCF', color: '#9A6B0E', bd: '#E6CE94' },
};
const ACT_STATUS_META = {
  todo:      { label: 'To Do',      bg: 'transparent', color: '#5E6553', bd: '#DDD3BE' },
  done:      { label: 'Selesai',    bg: '#E4F0E5',     color: '#2E7D4F', bd: '#BFDDC4' },
  cancelled: { label: 'Dibatalkan', bg: 'transparent', color: '#B23227', bd: '#E6BBB2' },
};
function ActBadge({ meta }) {
  if (!meta) return <span style={{ color: '#D1D5DB' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, letterSpacing: '.3px', border: `1px solid ${meta.bd}`, background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}
const BANT_FIELD_DEFS = [
  { key: 'bant_commodity',      label: 'Komoditi',        icon: 'package' },
  { key: 'bant_origin',         label: 'Asal',            icon: 'globe' },
  { key: 'bant_destination',    label: 'Tujuan',          icon: 'mappin' },
  { key: 'bant_frequency',      label: 'Frekuensi',       icon: 'repeat' },
  { key: 'bant_current_vendor', label: 'Vendor Saat Ini', icon: 'truck' },
  { key: 'bant_payment',        label: 'Payment',         icon: 'creditcard' },
  { key: 'bant_decision_maker', label: 'Decision Maker',  icon: 'user' },
];
const PIC_COLORS = ['#2A5B8C', '#2F6B3F', '#9A5B2C', '#6B6F5E', '#7A4E8C', '#1F6B6B'];

const fmtRupiah = (n) => (n == null || n === '') ? '—' : 'Rp ' + Number(n).toLocaleString('id-ID');
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const fmtDateShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const txt = (x) => (x == null || x === '') ? '—' : x;
const initials = (s) => ((s || '?').replace(/^PT\s+|^CV\s+/i, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()) || '?';
const picInitials = (s) => (s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const colorFor = (s) => PIC_COLORS[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PIC_COLORS.length];
const statusOf = (c) => c.account_status || c.status || 'customer';

// ─── Style tokens (ported from design) ──────────────────────────────────────────
const S = {
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 16, flexWrap: 'wrap' },
  backRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 9 },
  backBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px 0 9px', borderRadius: 9, border: '1px solid ' + LINE, background: SURFACE, color: INK_SOFT, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  crumbs: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: INK_FAINT, flexWrap: 'wrap' },
  crumbCur: { color: '#6E6353', fontWeight: 600 },
  title: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 25, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: 10 },
  outlineBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 11, border: '1px solid #DED3BF', background: SURFACE, color: INK_SOFT, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  dangerBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 11, border: '1px solid #F0CDBE', background: '#FCEEE9', color: '#C0392B', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },

  card: { background: SURFACE, border: '1px solid ' + LINE, borderRadius: 14, boxShadow: '0 1px 2px rgba(60,45,20,.04), 0 4px 14px rgba(60,45,20,.03)' },

  headCard: { background: SURFACE, border: '1px solid ' + LINE, borderRadius: 14, boxShadow: '0 1px 2px rgba(60,45,20,.04), 0 4px 14px rgba(60,45,20,.03)', marginBottom: 16 },
  headTop: { display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 22, padding: '22px 24px 20px', alignItems: 'flex-start' },
  avatar: { width: 76, height: 76, borderRadius: '50%', background: NAVY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 28, fontWeight: 800, flex: '0 0 76px', boxShadow: '0 6px 18px rgba(20,70,130,.28)' },
  plate: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' },
  code: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 600, color: '#6B7280', letterSpacing: 0.3 },
  custName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 23, fontWeight: 800, letterSpacing: -0.5, color: '#16243A', margin: '0 0 3px' },
  custSub: { fontSize: 13.5, color: '#857A68', marginBottom: 13 },
  badgeRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tierValBox: { textAlign: 'right', whiteSpace: 'nowrap' },
  tierValLbl: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10.5, fontWeight: 700, color: INK_FAINT },
  tierValNum: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: '#16243A', marginTop: 3 },
  tierValSince: { fontSize: 12, color: '#857A68', marginTop: 4 },

  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '5px 11px 5px 9px', borderRadius: 20, whiteSpace: 'nowrap' },
  bdot: { width: 6, height: 6, borderRadius: '50%', flex: '0 0 6px' },
  navyBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 20, background: '#EAF0F8', color: NAVY, whiteSpace: 'nowrap' },
  picBadge: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, padding: '4px 12px 4px 5px', borderRadius: 20, background: '#F4EFE5', color: INK_SOFT, whiteSpace: 'nowrap' },

  tabs: { display: 'flex', alignItems: 'stretch', gap: 4, padding: '0 14px', borderTop: '1px solid ' + LINE_SOFT, flexWrap: 'wrap' },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 14px', border: 0, borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent', background: 'transparent', color: '#857A68', fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: -0.1, cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' },
  tabActive: { color: ORANGE, borderBottomColor: ORANGE },

  mono: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, color: INK },

  gridSectionCard: { background: SURFACE, border: '1px solid ' + LINE, borderRadius: 14, boxShadow: '0 1px 2px rgba(60,45,20,.04), 0 4px 14px rgba(60,45,20,.03)', marginBottom: 16, overflow: 'hidden' },
  gridSectionHead: { display: 'flex', alignItems: 'center', gap: 9, padding: '14px 22px', borderBottom: '1px solid ' + LINE_SOFT, fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: NAVY, background: '#FBF6EC' },
  gridWrap: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))' },
  gridField: { padding: '13px 22px' },
  gridFieldLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: INK_FAINT, marginBottom: 5 },
  gridFieldValue: { fontSize: 13.5, color: INK, fontWeight: 500, lineHeight: 1.4 },

  healthTop: { display: 'flex', alignItems: 'center', gap: 26, padding: 24, flexWrap: 'wrap' },
  healthGauge: { position: 'relative', width: 150, height: 150, flex: '0 0 150px' },
  hgCenter: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  hgNum: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 44, fontWeight: 700, letterSpacing: -2, lineHeight: 0.9 },
  hgOutOf: { fontSize: 12, color: INK_FAINT, fontWeight: 600, marginTop: 2 },
  healthInfo: { flex: '1 1 260px', minWidth: 220 },
  healthStatusBadge: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, fontFamily: "'Montserrat', system-ui, sans-serif", letterSpacing: 0.6, padding: '6px 14px', borderRadius: 22 },
  healthTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: '12px 0 4px' },
  healthSub: { fontSize: 13, color: '#857A68', lineHeight: 1.5 },
  hcompRow: { padding: '16px 22px', borderBottom: '1px solid ' + LINE_SOFT },
  hcompHead: { display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 },
  hcompIco: { width: 34, height: 34, borderRadius: 9, flex: '0 0 34px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EAF0F8', color: NAVY },
  hcompName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 13.5, fontWeight: 700, color: '#16243A', flex: 1 },
  hcompWeight: { fontSize: 11, fontWeight: 600, color: INK_FAINT, background: '#F0E7D6', padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' },
  hcompVal: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 700, minWidth: 48, textAlign: 'right' },
  hcompBar: { height: 9, borderRadius: 6, background: '#EDE4D2', overflow: 'hidden' },
  hcompBarFill: { display: 'block', height: '100%', borderRadius: 6 },
  recCard: { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 20px', borderRadius: 12, margin: '18px 22px' },
  recIco: { width: 40, height: 40, borderRadius: 11, flex: '0 0 40px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  recTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 13.5, fontWeight: 700, marginBottom: 3 },
  recText: { fontSize: 13, lineHeight: 1.5 },

  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid ' + LINE_SOFT },
  cardHeadTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 15, fontWeight: 700, color: '#16243A', margin: 0 },
  cardHeadSub: { fontSize: 12.5, color: INK_FAINT, fontWeight: 500 },

  who: { display: 'inline-flex', alignItems: 'center', gap: 9 },
  whoAv: { width: 26, height: 26, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flex: '0 0 26px' },

  visitItem: { padding: '18px 22px', borderBottom: '1px solid ' + LINE_SOFT },
  visitHead: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  visitDate: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, color: '#16243A' },
  visitMeta: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 12.5, color: INK_SOFT },
  visitMetaItem: { display: 'inline-flex', alignItems: 'center', gap: 7 },
  visitPoint: { fontSize: 13, color: INK_SOFT, lineHeight: 1.5, marginTop: 11 },
  expandBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 13, height: 32, padding: '0 13px', borderRadius: 9, border: '1px solid ' + LINE, background: '#FBF6EC', color: NAVY, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  expandBox: { marginTop: 13, background: '#FBF6EC', border: '1px solid ' + LINE_SOFT, borderRadius: 11, padding: '15px 17px' },
  expandLbl: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: INK_FAINT, marginBottom: 5 },
  expandText: { fontSize: 12.5, color: INK_SOFT, lineHeight: 1.55 },

  bantField: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '15px 22px', borderBottom: '1px solid ' + LINE_SOFT },
  bantIco: { width: 36, height: 36, borderRadius: 10, flex: '0 0 36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EAF0F8', color: NAVY },
  bantK: { fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: INK_FAINT, marginBottom: 3 },
  bantV: { fontSize: 13, color: INK, fontWeight: 500, lineHeight: 1.4 },
  bantGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 0 },
  pipelineRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 22px', flexWrap: 'wrap' },

  notesBox: { margin: '20px 22px', background: '#FBF6EC', border: '1px solid ' + LINE_SOFT, borderRadius: 12, padding: '18px 20px', fontSize: 13.5, color: INK_SOFT, lineHeight: 1.65, whiteSpace: 'pre-wrap' },
  notesArea: { width: 'calc(100% - 44px)', margin: '16px 22px 0', minHeight: 180, borderRadius: 12, border: '1px solid #E3D8C4', background: '#fff', padding: '16px 18px', fontFamily: 'inherit', fontSize: 13.5, color: INK, lineHeight: 1.65, resize: 'vertical', boxSizing: 'border-box' },
  banner: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 12, background: '#FEF3C7', border: '1px solid #F6E2A8', color: '#92710A', fontSize: 12.5, lineHeight: 1.5, marginBottom: 16 },
};

// ─── Sub-components ─────────────────────────────────────────────────────────────
function Badge({ cfg, children, dot = true }) {
  return (
    <span style={{ ...S.badge, background: cfg.bg, color: cfg.fg }}>
      {dot && cfg.dot ? <span style={{ ...S.bdot, background: cfg.dot }} /> : null}
      {children}
    </span>
  );
}
function PicAvatar({ name, size = 26 }) {
  return (
    <span style={{ ...S.whoAv, width: size, height: size, flex: `0 0 ${size}px`, fontSize: size * 0.38, background: colorFor(name) }}>
      {picInitials(name)}
    </span>
  );
}
function Tab({ id, icon, label, active, onClick, count }) {
  return (
    <button type="button" className="cd-tab" onClick={() => onClick(id)} style={active ? { ...S.tab, ...S.tabActive } : S.tab}>
      <Icon name={icon} size={15} strokeWidth={active ? 2.1 : 1.8} />{label}
      {count != null ? <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 700, background: active ? '#FBE6DA' : '#F0E7D6', color: active ? ORANGE : INK_FAINT, borderRadius: 20, padding: '1px 7px', marginLeft: 1 }}>{count}</span> : null}
    </button>
  );
}
function GridSection({ label, icon, children }) {
  return (
    <div style={S.gridSectionCard}>
      <div style={S.gridSectionHead}><Icon name={icon} size={14} color={NAVY} strokeWidth={2} />{label}</div>
      <div style={S.gridWrap}>{children}</div>
    </div>
  );
}
function GridField({ label, children, mono, idx, total }) {
  const isLeft = idx % 2 === 0;
  const lastRowStart = total % 2 === 0 ? total - 2 : total - 1;
  const noBottom = idx >= lastRowStart;
  const aloneLast = idx === total - 1 && isLeft && total % 2 === 1;
  const style = {
    ...S.gridField,
    borderBottom: noBottom ? 0 : '1px solid ' + LINE_SOFT,
    ...(isLeft && !aloneLast ? { borderRight: '1px solid ' + LINE_SOFT } : {}),
  };
  return (
    <div style={style}>
      <div style={S.gridFieldLabel}>{label}</div>
      <div style={mono ? { ...S.gridFieldValue, ...S.mono } : S.gridFieldValue}>{children}</div>
    </div>
  );
}
function VisitRow({ v }) {
  const [open, setOpen] = useState(false);
  const vt = VISIT_TYPE_CFG[v.visit_type] || { label: v.visit_type || 'Visit', bg: '#F0EBE0', fg: '#7A6A45' };
  const vs = VISIT_STATUS_CFG[v.status] || VISIT_STATUS_CFG.scheduled;
  const hasDetail = (v.mom && v.mom.trim()) || (v.follow_up && v.follow_up.trim());
  return (
    <div style={S.visitItem}>
      <div style={S.visitHead}>
        <span style={S.visitDate}>{fmtDateShort(v.visit_date)}</span>
        <span style={{ ...S.badge, background: vt.bg, color: vt.fg, padding: '5px 11px' }}>{vt.label}</span>
        <Badge cfg={vs}>{vs.label}</Badge>
      </div>
      {v.point_of_meeting && <div style={S.visitPoint}>{v.point_of_meeting}</div>}
      <div style={S.visitMeta}>
        {v.salesperson?.full_name && <span style={S.visitMetaItem}><PicAvatar name={v.salesperson.full_name} size={22} />{v.salesperson.full_name}</span>}
        {v.location && <span style={S.visitMetaItem}><Icon name="mappin" size={14} color={INK_FAINT} />{v.location}</span>}
        {v.visit_time && <span style={S.visitMetaItem}><Icon name="clock" size={14} color={INK_FAINT} />{v.visit_time.slice(0, 5)}</span>}
      </div>
      {hasDetail && (
        <button type="button" className="cd-expand" style={S.expandBtn} onClick={() => setOpen(o => !o)}>
          <Icon name="chevdown" size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }} />
          {open ? 'Sembunyikan detail' : 'Lihat MOM & tindak lanjut'}
        </button>
      )}
      {open && hasDetail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {v.mom && v.mom.trim() && (
            <div style={S.expandBox}>
              <div style={S.expandLbl}>Minutes of Meeting</div>
              <div style={S.expandText}>{v.mom}</div>
            </div>
          )}
          {v.follow_up && v.follow_up.trim() && (
            <div style={{ ...S.expandBox, background: '#FFF6EE', borderColor: '#F6E2D2' }}>
              <div style={{ ...S.expandLbl, color: '#C8521B' }}>Tindak Lanjut</div>
              <div style={S.expandText}>{v.follow_up}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tahap 3a: nested inquiry → quotation row (Riwayat tab) ──
const INQ_SERVICE_LABEL = { freight_forwarding: 'Freight Forwarding', customs: 'Customs', trading: 'Trading' };
const QUO_TONE = {
  DRAFT:     { bg: '#EEEAE0', fg: '#6B7280' }, SENT:      { bg: '#E1ECF7', fg: '#2563EB' },
  SUBMITTED: { bg: '#E1ECF7', fg: '#2563EB' }, ACCEPTED:  { bg: '#DEF0E4', fg: '#1F8B4D' },
  REJECTED:  { bg: '#FBE3E3', fg: '#C0392B' },
};
// Palet status inquiry — hex/label DIREPLIKASI dari InquiryListPage.STATUS_META (skema
// yang sama, bukan skema baru). Sengaja tak diimpor: InquiryListPage lazy-loaded →
// impor konstanta darinya menyeret bundle-nya ke chunk halaman ini. Duplikasi ini
// tech debt (LOW): rumah yang benar = konstanta status CRM bersama.
const INQ_STATUS_TONE = {
  OPEN:      { bg: '#E1ECF5', fg: '#2A5B8C', label: 'Open'      },
  IN_REVIEW: { bg: '#F8ECCF', fg: '#9A6B0E', label: 'In Review' },
  QUOTED:    { bg: '#ECE3F4', fg: '#6E4B8C', label: 'Quoted'    },
  WON:       { bg: '#E4F0E5', fg: '#2E7D4F', label: 'Won'       },
  LOST:      { bg: '#F6E0DB', fg: '#B23227', label: 'Lost'      },
  CANCELLED: { bg: '#EEE9DC', fg: '#6B6F5E', label: 'Cancelled' },
};
// Satu field skalar detail permintaan — tak dirender bila kosong (hindari baris menggantung).
function InqField({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div style={S.gridFieldLabel}>{label}</div>
      <div style={S.gridFieldValue}>{value}</div>
    </div>
  );
}
// Field bertipe array (incoterms/kontainer/cargo/layanan) → pills; tak dirender bila kosong.
function InqPills({ label, values }) {
  const arr = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!arr.length) return null;
  return (
    <div>
      <div style={S.gridFieldLabel}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
        {arr.map((v) => (
          <span key={v} style={{ fontSize: 11.5, fontWeight: 600, color: NAVY, background: '#EAF0F8', borderRadius: 7, padding: '3px 9px' }}>{v}</span>
        ))}
      </div>
    </div>
  );
}
// Blok "Detail Permintaan" untuk satu inquiry (tampil saat baris di-expand, sebelum quotation).
// Semua field kosong disaring supaya tak ada baris kosong menggantung.
function InquiryDetailBlock({ inq }) {
  const scalars = [
    { l: 'Route',          v: inq.route },
    { l: 'Komoditas',      v: inq.commodity },
    { l: 'Nama Barang',    v: inq.goods_name },
    { l: 'HS Code',        v: inq.hs_code },
    { l: 'Berat (KG)',     v: inq.weight_kg != null ? String(inq.weight_kg) : '' },
    { l: 'Volume (CBM)',   v: inq.volume_cbm != null ? String(inq.volume_cbm) : '' },
    { l: 'Deadline Quote', v: inq.deadline_quote ? fmtDateShort(inq.deadline_quote) : '' },
  ].filter((f) => f.v != null && f.v !== '');
  const pills = [
    { l: 'Incoterm',         v: inq.incoterms },
    { l: 'Jenis Kontainer',  v: inq.container_types },
    { l: 'Cargo Type',       v: inq.cargo_types },
    { l: 'Layanan Tambahan', v: inq.additional_services },
  ].filter((p) => Array.isArray(p.v) && p.v.filter(Boolean).length);
  const hasNotes = inq.notes && String(inq.notes).trim();
  const isEmpty = !scalars.length && !pills.length && !hasNotes;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: INK_FAINT, marginBottom: 10 }}>Detail Permintaan</div>
      {isEmpty ? (
        <div style={{ fontSize: 12.5, color: INK_FAINT }}>Detail permintaan belum diisi.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 20px' }}>
          {scalars.map((f) => <InqField key={f.l} label={f.l} value={f.v} />)}
          {pills.map((p) => <InqPills key={p.l} label={p.l} values={p.v} />)}
          {hasNotes ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={S.gridFieldLabel}>Notes</div>
              <div style={{ ...S.gridFieldValue, whiteSpace: 'pre-wrap' }}>{inq.notes}</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
function InquiryHistoryRow({ inq, quotes, onEditInquiry, onViewQuotation, onCreatePRF }) {
  const [open, setOpen] = useState(false);
  const n = quotes.length;
  // Nilai tak dikenal JANGAN dibuat blank — tampilkan mentahnya (pelajaran NURTURE / TD-61).
  const st = INQ_STATUS_TONE[String(inq.status || '').toUpperCase()] || { bg: '#EEF0F3', fg: '#5E6553', label: String(inq.status || '—') };
  return (
    <div style={{ borderBottom: '1px solid ' + LINE_SOFT }}>
      {/* Header baris: tombol toggle (expand) + tombol aksi Edit Inquiry sebagai
          SAUDARA di dalam wrapper flex (bukan anak button toggle → hindari nested
          button + jaga aksesibilitas keyboard tombol toggle). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 22 }}>
        <button type="button" onClick={() => setOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, border: 0, background: 'transparent', padding: '15px 0 15px 22px', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap' }}>
          <Icon name="chevright" size={15} color={INK_FAINT} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
          <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, color: NAVY }}>{inq.inquiry_no || '—'}</span>
          <span style={{ fontSize: 12.5, color: INK_SOFT }}>{INQ_SERVICE_LABEL[inq.service_type] || inq.service_type || '—'}</span>
          {(inq.pol || inq.pod) && <span style={{ fontSize: 12, color: INK_FAINT }}>{inq.pol || '—'} → {inq.pod || '—'}</span>}
          <span style={{ fontSize: 12, color: INK_FAINT, marginLeft: 'auto' }}>{fmtDateShort(inq.created_at)}</span>
          <span style={{ ...S.badge, background: st.bg, color: st.fg, padding: '3px 10px' }}>{st.label}</span>
          <span style={{ ...S.badge, background: n ? '#EAF0F8' : '#F4EFE5', color: n ? NAVY : INK_FAINT, padding: '3px 10px' }}>
            {n ? `${n} quotation` : 'Belum ada quotation'}
          </span>
        </button>
        {onEditInquiry && (
          <button type="button" className="cd-outline" style={{ ...S.outlineBtn, height: 36, fontSize: 12.5, flex: '0 0 auto' }}
            onClick={() => onEditInquiry(inq)}>
            <Icon name="pencil" size={14} />Edit Inquiry
          </button>
        )}
        {onCreatePRF && (
          <button type="button" className="cd-outline" style={{ ...S.outlineBtn, height: 36, fontSize: 12.5, flex: '0 0 auto' }}
            onClick={() => onCreatePRF(inq)}>
            <Icon name="filecheck" size={14} />Cetak PRF
          </button>
        )}
      </div>
      {open && (
        <div style={{ padding: '0 22px 16px 49px' }}>
          <InquiryDetailBlock inq={inq} />
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: INK_FAINT, marginBottom: 10 }}>Quotation</div>
          {n === 0 ? (
            <div style={{ fontSize: 12.5, color: INK_FAINT }}>Inquiry ini belum punya quotation.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid ' + LINE_SOFT }}>
                    {['Quotation No', 'Tanggal', 'Nilai', 'Status', 'Aksi'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Nilai' ? 'right' : 'left', padding: '7px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: INK_FAINT, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const t = QUO_TONE[String(q.status).toUpperCase()] || QUO_TONE.DRAFT;
                    return (
                      <tr key={q.id} style={{ borderBottom: '1px solid ' + LINE_SOFT }}>
                        <td style={{ padding: '8px', fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{q.quotation_no}</td>
                        <td style={{ padding: '8px', color: INK_SOFT, whiteSpace: 'nowrap' }}>{fmtDateShort(q.created_at)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRupiah(q.total_amount)}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ ...S.badge, background: t.bg, color: t.fg, padding: '3px 9px' }}>{String(q.status).toUpperCase()}</span>
                        </td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                          {onViewQuotation && (
                            <button type="button" title="Lihat quotation" onClick={() => onViewQuotation(q)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: NAVY, padding: 4, display: 'inline-flex' }}>
                              <Icon name="eye" size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthGauge({ score, color }) {
  const r = 64;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - score / 100);
  return (
    <div style={S.healthGauge}>
      <svg viewBox="0 0 160 160" width="150" height="150" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="#EDE4D2" strokeWidth="13" />
        <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <div style={S.hgCenter}>
        <span style={{ ...S.hgNum, color }}>{score}</span>
        <span style={S.hgOutOf}>/ 100</span>
      </div>
    </div>
  );
}
const healthTone = (v) => (v >= 75 ? GREEN : v >= 60 ? YELLOW : RED);
function HealthComp({ comp }) {
  const tone = healthTone(comp.value);
  return (
    <div className="cd-hcomp" style={S.hcompRow}>
      <div style={S.hcompHead}>
        <span style={S.hcompIco}><Icon name={comp.icon} size={17} strokeWidth={1.9} /></span>
        <span style={S.hcompName}>{comp.name}</span>
        <span style={S.hcompWeight}>Bobot {comp.weight}%</span>
        <span style={{ ...S.hcompVal, color: tone }}>{comp.value}%</span>
      </div>
      <div style={S.hcompBar}><i style={{ ...S.hcompBarFill, width: comp.value + '%', background: tone }} /></div>
    </div>
  );
}
function healthStatus(score) {
  if (score > 75) return { key: 'HEALTHY', color: GREEN, bg: '#DCFCE7', fg: '#15803D', recIcon: 'check', rec: 'Customer engaged & growing. Lanjutkan cadence normal.' };
  if (score >= 60) return { key: 'MONITOR', color: YELLOW, bg: '#FEF3C7', fg: '#B45309', recIcon: 'activity', rec: 'Sinyal campuran. Tingkatkan frekuensi touch & investigasi root cause.' };
  return { key: 'AT-RISK', color: RED, bg: '#FEE2E2', fg: '#B91C1C', recIcon: 'alert', rec: 'Trigger Save Playbook. Jadwalkan visit face-to-face dalam 3 hari kerja.' };
}

// TODO(health-score): replace this heuristic with a real auto-calculated score once
// transaction/payment/NPS/complaint data exists (server-side or via a DB view).
// Current score is derived ONLY from available signals — visits, BANT, pipeline,
// and profile completeness — and is clearly labelled "preliminary". No new DB columns.
function computeHealth(customer, prospect, visits) {
  const visitCount = visits.length;
  const engagement = Math.min(visitCount * 30, 100);
  const bantPct = prospect
    ? Math.round(((prospect.bant_score != null ? prospect.bant_score : calcBantScore(prospect)) / 12) * 100)
    : 0;
  const stage = (prospect?.pipeline_stage || '').toUpperCase();
  const pipeline = stage === 'WON' ? 100
    : (stage === 'NEGOTIATION' || stage === 'PROPOSAL') ? 70
    : stage === 'QUALIFIED' ? 50
    : stage ? 30 : 0;
  const profFields = [customer.phone, customer.email, customer.address, customer.pic_name, customer.tax_id, customer.payment_terms_id, customer.tier];
  const completeness = Math.round((profFields.filter(Boolean).length / profFields.length) * 100);
  const contract = (customer.contract_no || customer.payment_term?.name || customer.payment_terms_id) ? 100 : 40;
  const components = [
    { name: 'Engagement Visit',   weight: 30, value: engagement,   icon: 'route' },
    { name: 'BANT Qualification', weight: 30, value: bantPct,      icon: 'target' },
    { name: 'Pipeline Status',    weight: 20, value: pipeline,     icon: 'trendingup' },
    { name: 'Kelengkapan Profil', weight: 10, value: completeness, icon: 'usercheck' },
    { name: 'Status Kontrak',     weight: 10, value: contract,     icon: 'filecheck' },
  ];
  const score = Math.round(components.reduce((s, c) => s + (c.value * c.weight) / 100, 0));
  return { score, components };
}

// ─── Main component ─────────────────────────────────────────────────────────────
export default function CustomerDetailPage({ id, onBack, showToast, onEditInquiry, onViewQuotation, onCreatePRF, initialTab }) {
  const { profile, erpRole, user } = useAuth();
  // Delete customer is restricted to super_admin (soft-delete via deleted_at).
  const canDelete = erpRole === 'super_admin';
  // Gate Cetak PRF — DISALIN APA ADANYA dari DealDetailPage.jsx:373 (nol perubahan
  // perilaku). erpRole = role primer; lihat TD (user multi-role). Tombol muncul iff true.
  const canCreatePRF = ['sales', 'gm_bd'].includes(erpRole);

  const [customer, setCustomer] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState(initialTab || 'info');

  const [visits, setVisits]               = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [activities, setActivities]             = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const [editing,    setEditing]    = useState(false);
  const [topOpen,    setTopOpen]    = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const [editNotes, setEditNotes]     = useState(false);
  const [notesDraft, setNotesDraft]   = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // ── Deal controls (stepper + Nilai Deal + Pindah Stage + Edit Deal) ──
  // Writes go through the SAME saveDealUpdate as DealDetailPage (audit parity).
  const [dealEditOpen,  setDealEditOpen]  = useState(false);
  const [dealSeed,      setDealSeed]      = useState(null);   // fresh deal fields for the Edit modal
  const [dealAssignees, setDealAssignees] = useState([]);

  // ── Lazy tab data: Riwayat (inquiry+quotation) & Dokumen (PRF+SO) ──
  const [histLoaded,    setHistLoaded]    = useState(false);
  const [histLoading,   setHistLoading]   = useState(false);
  const [histInquiries, setHistInquiries] = useState([]);
  const [histQuotes,    setHistQuotes]    = useState([]);
  const [docLoaded,     setDocLoaded]     = useState(false);
  const [docLoading,    setDocLoading]    = useState(false);
  const [docPrfs,       setDocPrfs]       = useState([]);
  const [docSOs,        setDocSOs]        = useState([]);

  // ── Fetch customer (+ joins, incl. linked prospect for BANT) ──
  const fetchCustomer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // accounts model: customer IS the account row → BANT (bant_*, pipeline_stage)
      // lives directly on the row, no prospect embed needed.
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          *,
          assigned_profile:profiles!prospects_assigned_to_fkey(full_name),
          source_company:companies!prospects_owner_company_id_fkey(name, code),
          payment_term:payment_terms!prospects_payment_terms_id_fkey(name)
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      setCustomer(data);
    } catch (err) {
      // The joined query can fail if an FK embed is missing/renamed; fall back to a
      // plain row fetch so the page still renders. Log the original error (not silent).
      console.error('[CustomerDetail] joined fetch failed, falling back to plain select:', err);
      const { data, error: fbErr } = await supabase.from('accounts').select('*').eq('id', id).maybeSingle();
      if (fbErr) console.error('[CustomerDetail] fallback fetch also failed:', fbErr);
      setCustomer(data || null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  // ── Fetch visits from `activities` (serves History Visit + Health Score) ──
  // Visits are activities with type='visit' and account_id = this account.
  // type='visit' only (calls excluded) to keep this tab/health identical.
  // Salesperson name resolved via client map (no profiles FK on assigned_to);
  // all profiles, no active filter, so inactive/legacy sales still resolve.
  useEffect(() => {
    if (!id) { setVisits([]); return; }
    setVisitsLoading(true);
    const ACT_TO_VISIT = { todo: 'scheduled', done: 'completed', cancelled: 'cancelled' };
    supabase.from('activities')
      .select('id, scheduled_for, activity_time, status, notes, next_action, assigned_to, details')
      .eq('account_id', id)
      .eq('type', 'visit')
      .is('deleted_at', null)
      .order('scheduled_for', { ascending: false })
      .limit(50)
      .then(async ({ data }) => {
        const rows = data || [];
        const ids = [...new Set(rows.map(a => a.assigned_to).filter(Boolean))];
        const nm = {};
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          (profs || []).forEach(p => { nm[p.id] = p.full_name; });
        }
        setVisits(rows.map(a => ({
          id:               a.id,
          visit_date:       a.scheduled_for,
          visit_time:       a.activity_time,
          status:           ACT_TO_VISIT[a.status] || 'scheduled',
          notes:            a.notes,
          visit_type:       a.details?.visit_type       || '',
          location:         a.details?.location         || '',
          point_of_meeting: a.details?.point_of_meeting || '',
          mom:              a.details?.mom              || '',
          follow_up:        a.next_action              || '',
          salesperson:      a.assigned_to ? { full_name: nm[a.assigned_to] || null } : null,
        })));
        setVisitsLoading(false);
      });
  }, [id]);

  // ── Fetch ALL activities (every type) for this account — tab 'Aktivitas' ──
  // Same pattern as the visit fetch but without the type filter. Salesperson
  // name via client-side nameMap (no profiles FK on assigned_to).
  useEffect(() => {
    if (!id) { setActivities([]); return; }
    setActivitiesLoading(true);
    supabase.from('activities')
      .select('id, type, status, scheduled_for, activity_time, outcome, notes, assigned_to')
      .eq('account_id', id)
      .is('deleted_at', null)
      .order('scheduled_for', { ascending: false })
      .limit(200)
      .then(async ({ data }) => {
        const rows = data || [];
        const ids = [...new Set(rows.map(a => a.assigned_to).filter(Boolean))];
        const nm = {};
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          (profs || []).forEach(p => { nm[p.id] = p.full_name; });
        }
        setActivities(rows.map(a => ({
          id:               a.id,
          type:             a.type,
          status:           a.status,
          scheduled_for:    a.scheduled_for,
          activity_time:    a.activity_time,
          outcome:          a.outcome,
          notes:            a.notes,
          salesperson_name: a.assigned_to ? (nm[a.assigned_to] || null) : null,
        })));
        setActivitiesLoading(false);
      });
  }, [id]);

  // ── Lazy: tab 'Riwayat' — inquiries (account) + quotations (account), nested ──
  // Account-scoped via prospect_id OR customer_id (customer_id = kolom warisan).
  useEffect(() => {
    if (tab !== 'riwayat' || histLoaded || !id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistLoading(true);
    Promise.all([
      supabase.from('inquiries')
        .select('id, inquiry_no, service_type, status, created_at, pol, pod, route, commodity, goods_name, hs_code, weight_kg, volume_cbm, deadline_quote, incoterms, container_types, cargo_types, additional_services, notes')
        .or(`prospect_id.eq.${id},customer_id.eq.${id}`).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000),
      supabase.from('quotations')
        .select('id, quotation_no, total_amount, status, created_at, inquiry_id, valid_until')
        .or(`prospect_id.eq.${id},customer_id.eq.${id}`).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000),
    ]).then(([inqRes, quoRes]) => {
      setHistInquiries(inqRes.data || []);
      setHistQuotes(quoRes.data || []);
      setHistLoaded(true);
      setHistLoading(false);
    });
  }, [tab, histLoaded, id]);

  // ── Lazy: tab 'Dokumen' — PRF + Sales Order. PRF data TIDAK seragam: sebagian
  // baris hanya punya inquiry_id → query WAJIB tangkap account_id OR inquiry_id∈akun. ──
  useEffect(() => {
    if (tab !== 'dokumen' || docLoaded || !id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocLoading(true);
    (async () => {
      let inqIds = histInquiries.map((i) => i.id);
      if (!histLoaded) {
        const { data: inq } = await supabase.from('inquiries').select('id')
          .or(`prospect_id.eq.${id},customer_id.eq.${id}`).is('deleted_at', null).limit(1000);
        inqIds = (inq || []).map((i) => i.id);
      }
      let prfQ = supabase.from('prf')
        .select('id, prf_no, service_type, status, created_at, account_id, inquiry_id')
        .is('deleted_at', null);
      prfQ = inqIds.length
        ? prfQ.or(`account_id.eq.${id},inquiry_id.in.(${inqIds.join(',')})`)
        : prfQ.eq('account_id', id);
      const [prfRes, soRes] = await Promise.all([
        prfQ.order('created_at', { ascending: false }).limit(500),
        supabase.from('sales_orders')
          .select('id, so_no, status, signed, created_at, inquiry_id')
          .eq('account_id', id).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(500),
      ]);
      setDocPrfs(prfRes.data || []);
      setDocSOs(soRes.data || []);
      setDocLoaded(true);
      setDocLoading(false);
    })();
  }, [tab, docLoaded, id, histLoaded, histInquiries]);

  // ── Deal handlers — SATU jalur tulis (saveDealUpdate), audit sama DealDetailPage ──
  const dealActor = { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id };
  const pickStage = async (i) => {
    const key = STAGES[i].key;
    if (key === (customer?.pipeline_stage || 'NEW')) return;
    const ok = await saveDealUpdate({
      accountId: id, patch: { pipeline_stage: key }, auditStageKey: key,
      prevStage: customer?.pipeline_stage, accountName: customer?.name, actor: dealActor, showToast,
    });
    if (ok) fetchCustomer();
  };
  const openDealEdit = async () => {
    // Fetch deal fields fresh — the main fetch aliases assigned_profile as the
    // embed (shadowing the raw uuid the write path needs), so re-read it here.
    const { data } = await supabase.from('accounts')
      .select('id, name, pipeline_stage, estimated_value, estimated_closing_date, assigned_profile')
      .eq('id', id).maybeSingle();
    setDealSeed(data || null);
    if (!dealAssignees.length && profile?.company_id) fetchAssignees(profile.company_id).then(setDealAssignees);
    setDealEditOpen(true);
  };
  const saveDealEdit = async (draft) => {
    // No auditStageKey here → mirrors DealDetailPage's Edit modal (only Pindah
    // Stage logs a stage-change audit event).
    //
    // PENJAGA stage tak dikenal. `draft.stage` diturunkan dari
    // `stageIndex(dealSeed.pipeline_stage)` (lihat prop `initial` EditDealModal), dan
    // stageIndex mengembalikan 0 (=NEW) untuk nilai di luar STAGES. Tanpa penjaga ini,
    // menyimpan modal untuk akun ber-stage 'NURTURE' menimpanya jadi 'NEW' — diam-diam
    // dan tanpa audit.
    // Sengaja membaca `dealSeed`, BUKAN `customer` — dealSeed adalah sumber yang SAMA
    // dengan yang menyemai draft.stage (fetch segar di openDealEdit). Kalau memakai
    // state halaman yang bisa basi, stageKnown bisa true padahal DB berisi NURTURE, dan
    // penimpaan itu lolos lagi. dealSeed null (fetch gagal) → juga dianggap tak dikenal,
    // jadi stage tidak ditulis: menolak menebak lebih aman daripada menulis 'NEW'.
    const seedStage = dealSeed?.pipeline_stage;
    const stageKnown = isKnownStage(seedStage);
    const patch = {
      assigned_profile: draft.assignedId || null,
      estimated_value: draft.value === '' ? 0 : Number(draft.value),
      estimated_closing_date: draft.closeDate || null,
    };
    if (stageKnown) patch.pipeline_stage = STAGES[draft.stage].key;
    const ok = await saveDealUpdate({
      accountId: id,
      patch,
      prevStage: customer?.pipeline_stage, accountName: customer?.name, actor: dealActor, showToast,
    });
    if (ok) fetchCustomer();
    // Setelah saveDealUpdate supaya pesan ini yang terakhir dilihat user (saveDealUpdate
    // memunculkan toast 'Perubahan disimpan' sendiri). Tipe default, bukan 'error' —
    // penyimpanannya memang berhasil.
    if (ok && !stageKnown) {
      showToast(`Stage "${seedStage || '(kosong)'}" tidak dikenal — stage tidak diubah. Perubahan lain tersimpan.`);
    }
    return ok;
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      showToast?.('Customer dihapus.', 'success');
      setConfirmDel(false);
      onBack?.();
    } catch (err) {
      showToast?.('Gagal menghapus: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const startEditNotes = () => { setNotesDraft(customer?.notes || ''); setEditNotes(true); };
  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ notes: notesDraft || null, updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      setCustomer(c => ({ ...c, notes: notesDraft || null }));
      setEditNotes(false);
      showToast?.('Notes diperbarui ✨');
    } catch (err) {
      showToast?.('Gagal menyimpan notes: ' + err.message, 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return <div style={{ fontFamily: "'Inter', system-ui, sans-serif", padding: '4rem', textAlign: 'center', color: INK_FAINT, fontSize: 14 }}>Memuat data customer…</div>;
  }
  if (!customer) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", padding: '3rem', textAlign: 'center', color: '#C0392B', fontSize: 14 }}>
        Customer tidak ditemukan.
        <div style={{ marginTop: 14 }}>
          <button type="button" style={S.backBtn} onClick={onBack}><Icon name="arrowleft" size={15} />Kembali</button>
        </div>
      </div>
    );
  }

  const statusKey = statusOf(customer);
  // Nilai tak dikenal JANGAN dibuat blank — tampilkan mentahnya (pelajaran NURTURE / TD-61).
  const statusCfg = STATUS_CFG[statusKey] || { bg: '#EEF0F3', fg: '#5E6553', dot: '#B6BCC6', label: String(statusKey || '—') };
  // Penanda parkir Lead Pool = badge TERPISAH dari lifecycle, dari is_in_lead_pool.
  const leadPoolCfg = { bg: '#F0EBE0', fg: '#7A6A45', dot: '#B0703C', label: 'Lead Pool' };
  const tierCfg = customer.tier ? (TIER_CFG[customer.tier] || TIER_CFG.B) : null;
  const coCode = customer.source_company?.code;
  // accounts model: BANT / pipeline data lives directly on the account row.
  const prospect = customer;
  const hasBant = customer.pipeline_stage || customer.bant_score != null ||
    BANT_FIELD_DEFS.some(f => customer[f.key]);
  const subLine = (customer.legal_name && customer.legal_name !== customer.name)
    ? customer.legal_name
    : (customer.customer_type || '');

  // Deal (stepper + Nilai Deal) — dari baris accounts yang SUDAH di-fetch (0 query tambahan).
  const dealStageIdx = stageIndex(customer.pipeline_stage);
  const dealValue = Number(customer.estimated_value || 0);
  // Riwayat: group quotations per inquiry (nested); orphan = tanpa inquiry / inquiry di luar akun.
  const quotesByInquiry = {};
  histQuotes.forEach((q) => {
    if (!q.inquiry_id) return;
    if (!quotesByInquiry[q.inquiry_id]) quotesByInquiry[q.inquiry_id] = [];
    quotesByInquiry[q.inquiry_id].push(q);
  });
  const inqIdSet = new Set(histInquiries.map((i) => i.id));
  const orphanQuotes = histQuotes.filter((q) => !q.inquiry_id || !inqIdSet.has(q.inquiry_id));

  const TABS = [
    { id: 'info',      icon: 'info',      label: 'Info Dasar' },
    { id: 'komersial', icon: 'briefcase', label: 'Komersial' },
    { id: 'riwayat',   icon: 'clock',     label: 'Riwayat',   count: histInquiries.length || undefined },
    { id: 'dokumen',   icon: 'filecheck', label: 'Dokumen',   count: (docPrfs.length + docSOs.length) || undefined },
    { id: 'visit',     icon: 'route',     label: 'History Visit', count: visits.length || undefined },
    { id: 'aktivitas', icon: 'activity',  label: 'Aktivitas',     count: activities.length || undefined },
    { id: 'bant',      icon: 'target',    label: 'BANT & Pipeline' },
    { id: 'health',    icon: 'activity',  label: 'Health Score' },
    { id: 'notes',     icon: 'notebook',  label: 'Notes' },
  ];

  // Info Dasar / Komersial — 2-col grid sections
  const infoSections = [
    { label: 'Identitas', icon: 'building', fields: [
      { l: 'Nama Perusahaan', v: txt(customer.name) },
      { l: 'Legal Name', v: txt(customer.legal_name) },
      { l: 'Customer Type', v: txt(customer.customer_type) },
      { l: 'Tax ID / NPWP', v: txt(customer.tax_id), mono: true },
      { l: 'Customer Code', v: txt(customer.code), mono: true },
    ]},
    { label: 'Kontak', icon: 'phone', fields: [
      { l: 'Phone', v: txt(customer.phone), mono: true },
      { l: 'Email', v: txt(customer.email), mono: true },
      { l: 'Address', v: txt(customer.address) },
      { l: 'City', v: txt(customer.city) },
      { l: 'Country', v: txt(customer.country || 'Indonesia') },
    ]},
    { label: 'PIC', icon: 'user', fields: [
      { l: 'PIC Name', v: customer.pic_name ? <span style={S.who}><PicAvatar name={customer.pic_name} />{customer.pic_name}</span> : '—' },
      { l: 'PIC Phone', v: txt(customer.pic_phone), mono: true },
      { l: 'PIC Email', v: txt(customer.pic_email), mono: true },
    ]},
  ];
  const komSections = [
    { label: 'Klasifikasi & Kepemilikan', icon: 'briefcase', fields: [
      { l: 'Tier', v: tierCfg ? <span style={{ ...S.badge, background: tierCfg.bg, color: tierCfg.fg }}><Icon name="award" size={13} strokeWidth={2} />Tier {customer.tier}</span> : '—' },
      { l: 'Status', v: <Badge cfg={statusCfg}>{statusCfg.label}</Badge> },
      { l: 'Entitas Owner', v: customer.source_company?.name ? <span style={S.who}><Icon name="building" size={16} color={NAVY} />{customer.source_company.name}</span> : '—' },
      { l: 'Assigned Salesperson', v: customer.assigned_profile?.full_name ? <span style={S.who}><PicAvatar name={customer.assigned_profile.full_name} />{customer.assigned_profile.full_name}</span> : '—' },
    ]},
    { label: 'Ketentuan Komersial', icon: 'creditcard', fields: [
      { l: 'Payment Terms', v: txt(customer.payment_term?.name || customer.payment_terms), mono: true },
      { l: 'Credit Limit', v: fmtRupiah(customer.credit_limit), mono: true },
      { l: 'Currency', v: txt(customer.currency_code), mono: true },
      { l: 'Nomor Kontrak', v: txt(customer.contract_no), mono: true },
      { l: 'Last Activity', v: <span style={S.who}><Icon name="clock" size={15} color={INK_FAINT} />{fmtDate(customer.last_activity_at || customer.updated_at || customer.created_at)}</span> },
    ]},
  ];
  const renderSections = (secs) => (
    <div>
      {secs.map((sec) => (
        <GridSection key={sec.label} label={sec.label} icon={sec.icon}>
          {sec.fields.map((f, i) => (
            <GridField key={f.l} label={f.l} mono={f.mono} idx={i} total={sec.fields.length}>{f.v}</GridField>
          ))}
        </GridSection>
      ))}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: INK }}>
      <style>{`
        .cd-outline:hover{border-color:#C9BCA2;background:#FCF7EC;}
        .cd-danger:hover{border-color:#E6B5A4;background:#FBE3DA;}
        .cd-back:hover{border-color:#C9BCA2;background:#FCF7EC;}
        .cd-tab:hover{color:${NAVY};}
        .cd-expand:hover{border-color:#C9BCA2;background:#FBF1DF;}
        .cd-hcomp:last-child{border-bottom:0;}
        textarea:focus{outline:none;border-color:${NAVY};box-shadow:0 0 0 3px rgba(20,70,130,.10);}
        @media (max-width:760px){
          .cd-headtop{grid-template-columns:1fr !important;}
          .cd-tierval{text-align:left !important;}
        }
      `}</style>

      {/* page head */}
      <div style={S.topRow}>
        <div>
          <div style={S.backRow}>
            <button type="button" className="cd-back" style={S.backBtn} onClick={onBack}><Icon name="arrowleft" size={15} />Kembali</button>
            <nav style={S.crumbs}>
              <span>CRM</span><Icon name="chevright" size={13} />
              <span>Account</span><Icon name="chevright" size={13} />
              <span style={S.crumbCur}>{customer.name}</span>
            </nav>
          </div>
          <h1 style={S.title}>Detail Account</h1>
        </div>
        <div style={S.actions}>
          {isTempoTerm(customer.payment_term?.name) && (
            <button type="button" className="cd-outline" style={S.outlineBtn} onClick={() => setTopOpen(true)}><Icon name="creditcard" size={16} />Ajukan TOP Request</button>
          )}
          <button type="button" className="cd-outline" style={S.outlineBtn} onClick={() => setEditing(true)}><Icon name="pencil" size={16} />Edit</button>
          {canDelete && <button type="button" className="cd-danger" style={S.dangerBtn} onClick={() => setConfirmDel(true)}><Icon name="trash" size={16} />Hapus</button>}
        </div>
      </div>

      {/* Deal: stepper + Nilai Deal + Pindah Stage + Edit Deal (Tahap 3a) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <DealStepper current={dealStageIdx} value={dealValue} />
        <div style={{ ...S.card, padding: '14px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <DealHeaderControls value={dealValue} stageIdx={dealStageIdx} onEdit={openDealEdit} onPickStage={pickStage} />
        </div>
      </div>

      {/* header card */}
      <div style={S.headCard}>
        <div style={S.headTop} className="cd-headtop">
          <div style={S.avatar}>{initials(customer.name)}</div>
          <div>
            <div style={S.plate}>
              {customer.code && <span style={S.code}>{customer.code}</span>}
              <Badge cfg={statusCfg}>{statusCfg.label}</Badge>
              {customer.is_in_lead_pool ? <Badge cfg={leadPoolCfg}>{leadPoolCfg.label}</Badge> : null}
            </div>
            <h2 style={S.custName}>{customer.name}</h2>
            {subLine && <div style={S.custSub}>{subLine}</div>}
            <div style={S.badgeRow}>
              {customer.is_odoo_customer && (
                <span style={S.navyBadge}><Icon name="database" size={13} strokeWidth={2} />Existing · Odoo</span>
              )}
              {customer.source_company?.name && (
                <span style={S.navyBadge}><Icon name="building" size={13} strokeWidth={2} />{coCode ? coCode + ' · ' : ''}{customer.source_company.name}</span>
              )}
              {tierCfg && <span style={{ ...S.badge, background: tierCfg.bg, color: tierCfg.fg }}><Icon name="award" size={13} strokeWidth={2} />Tier {customer.tier}</span>}
              {customer.pic_name && <span style={S.picBadge}><PicAvatar name={customer.pic_name} size={20} />PIC {customer.pic_name}</span>}
            </div>
          </div>
          <div style={S.tierValBox} className="cd-tierval">
            <div style={S.tierValLbl}>Credit Limit</div>
            <div style={S.tierValNum}>{fmtRupiah(customer.credit_limit)}</div>
            <div style={S.tierValSince}>Customer sejak {fmtDate(customer.created_at)}</div>
          </div>
        </div>

        {/* tabs */}
        <div style={S.tabs}>
          {TABS.map((t) => (
            <Tab key={t.id} id={t.id} icon={t.icon} label={t.label} count={t.count} active={tab === t.id} onClick={setTab} />
          ))}
        </div>
      </div>

      {/* ============ TAB PANELS ============ */}

      {tab === 'info' && renderSections(infoSections)}
      {tab === 'komersial' && renderSections(komSections)}

      {/* RIWAYAT — inquiry (account-scoped) dengan quotation bertingkat */}
      {tab === 'riwayat' && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <h3 style={S.cardHeadTitle}>Riwayat Inquiry &amp; Quotation</h3>
            <span style={S.cardHeadSub}>{histInquiries.length} inquiry · {histQuotes.length} quotation</span>
          </div>
          {histLoading ? (
            <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Memuat…</div>
          ) : (histInquiries.length === 0 && orphanQuotes.length === 0) ? (
            <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Belum ada inquiry untuk account ini.</div>
          ) : (
            <div>
              {histInquiries.map((inq) => (
                <InquiryHistoryRow key={inq.id} inq={inq} quotes={quotesByInquiry[inq.id] || []} onEditInquiry={onEditInquiry} onViewQuotation={onViewQuotation} onCreatePRF={canCreatePRF ? onCreatePRF : undefined} />
              ))}
              {orphanQuotes.length > 0 && (
                <div style={{ padding: '15px 22px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: INK_FAINT, marginBottom: 10 }}>
                    Quotation tanpa inquiry ({orphanQuotes.length})
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <tbody>
                        {orphanQuotes.map((q) => {
                          const t = QUO_TONE[String(q.status).toUpperCase()] || QUO_TONE.DRAFT;
                          return (
                            <tr key={q.id} style={{ borderBottom: '1px solid ' + LINE_SOFT }}>
                              <td style={{ padding: '8px', fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{q.quotation_no}</td>
                              <td style={{ padding: '8px', color: INK_SOFT, whiteSpace: 'nowrap' }}>{fmtDateShort(q.created_at)}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRupiah(q.total_amount)}</td>
                              <td style={{ padding: '8px' }}><span style={{ ...S.badge, background: t.bg, color: t.fg, padding: '3px 9px' }}>{String(q.status).toUpperCase()}</span></td>
                              <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                <button type="button" title="Lihat quotation" onClick={() => onViewQuotation(q)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: NAVY, padding: 4, display: 'inline-flex' }}>
                                  <Icon name="eye" size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DOKUMEN — PRF + Sales Order (account-scoped). PRF menangkap account_id OR inquiry_id∈akun. */}
      {tab === 'dokumen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {docLoading ? (
            <div style={S.card}><div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Memuat…</div></div>
          ) : (
            <>
              <PrfListCard prfs={docPrfs} canCreate={false} />
              <div style={S.card}>
                <div style={S.cardHead}>
                  <h3 style={S.cardHeadTitle}>Sales Order</h3>
                  <span style={S.cardHeadSub}>{docSOs.length} SO</span>
                </div>
                {docSOs.length === 0 ? (
                  <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Belum ada Sales Order.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid ' + LINE_SOFT }}>
                          {['No', 'SO No', 'Tanggal', 'Status', 'Tanda Tangan'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: INK_FAINT, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {docSOs.map((so, i) => (
                          <tr key={so.id} style={{ borderBottom: i < docSOs.length - 1 ? '1px solid ' + LINE_SOFT : 'none' }}>
                            <td style={{ padding: '9px 16px', color: INK_FAINT }}>{i + 1}</td>
                            <td style={{ padding: '9px 16px', fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{so.so_no}</td>
                            <td style={{ padding: '9px 16px', color: INK_SOFT, whiteSpace: 'nowrap' }}>{fmtDateShort(so.created_at)}</td>
                            <td style={{ padding: '9px 16px' }}><span style={{ ...S.badge, background: '#E1ECF7', color: '#2563EB', padding: '3px 9px' }}>{String(so.status).toUpperCase()}</span></td>
                            <td style={{ padding: '9px 16px', color: so.signed ? '#1F8B4D' : INK_FAINT, whiteSpace: 'nowrap' }}>{so.signed ? 'Ditandatangani' : 'Belum'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* HISTORY VISIT */}
      {tab === 'visit' && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <h3 style={S.cardHeadTitle}>History Visit</h3>
            <span style={S.cardHeadSub}>{visits.length} kunjungan tercatat</span>
          </div>
          {visitsLoading ? (
            <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Memuat…</div>
          ) : visits.length === 0 ? (
            <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Belum ada riwayat kunjungan.</div>
          ) : (
            <div>{visits.map((v) => <VisitRow key={v.id} v={v} />)}</div>
          )}
        </div>
      )}

      {/* AKTIVITAS — all activity types for this account */}
      {tab === 'aktivitas' && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <h3 style={S.cardHeadTitle}>Aktivitas</h3>
            <span style={S.cardHeadSub}>{activities.length} aktivitas tercatat</span>
          </div>
          {activitiesLoading ? (
            <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Memuat…</div>
          ) : activities.length === 0 ? (
            <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Belum ada aktivitas tercatat.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #EFE6D8' }}>
                    {['Tanggal', 'Tipe', 'Status', 'Sales', 'Catatan / Outcome'].map(h => (
                      <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: INK_FAINT, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: i < activities.length - 1 ? '1px solid #F3ECDF' : 'none' }}>
                      <td style={{ padding: '11px 16px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, color: INK, whiteSpace: 'nowrap' }}>
                        {fmtDateShort(a.scheduled_for)}{a.activity_time ? ` · ${String(a.activity_time).slice(0, 5)}` : ''}
                      </td>
                      <td style={{ padding: '11px 16px' }}><ActBadge meta={ACT_TYPE_META[a.type]} /></td>
                      <td style={{ padding: '11px 16px' }}><ActBadge meta={ACT_STATUS_META[a.status]} /></td>
                      <td style={{ padding: '11px 16px', color: INK_SOFT, whiteSpace: 'nowrap' }}>{a.salesperson_name || '—'}</td>
                      <td style={{ padding: '11px 16px', color: INK_SOFT, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.outcome || a.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* BANT & PIPELINE */}
      {tab === 'bant' && (
        !hasBant ? (
          <div style={S.card}><div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Belum ada data BANT / pipeline untuk account ini.</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...S.card, padding: '18px 22px' }}>
              <BantScoreBar score={prospect.bant_score != null ? prospect.bant_score : calcBantScore(prospect)} />
            </div>
            <div style={S.card}>
              <div style={S.cardHead}>
                <h3 style={S.cardHeadTitle}>Kriteria BANT</h3>
                <span style={S.cardHeadSub}>Budget · Authority · Need · Timeline</span>
              </div>
              <div style={S.bantGrid}>
                {BANT_FIELD_DEFS.map((f, i) => {
                  const lastRowStart = BANT_FIELD_DEFS.length % 2 === 0 ? BANT_FIELD_DEFS.length - 2 : BANT_FIELD_DEFS.length - 1;
                  return (
                    <div key={f.key} style={i >= lastRowStart ? { ...S.bantField, borderBottom: 0 } : S.bantField}>
                      <span style={S.bantIco}><Icon name={f.icon} size={18} strokeWidth={1.9} /></span>
                      <div>
                        <div style={S.bantK}>{f.label}</div>
                        <div style={S.bantV}>{txt(prospect[f.key])}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardHead}>
                <h3 style={S.cardHeadTitle}>Pipeline Stage</h3>
                <span style={S.cardHeadSub}>Status terakhir prospect</span>
              </div>
              <div style={S.pipelineRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ ...S.bantIco, background: '#DEF0E4', color: '#1F8B4D' }}><Icon name="trophy" size={18} strokeWidth={1.9} /></span>
                  <div>
                    <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 14, fontWeight: 700, color: '#16243A' }}>{txt(prospect.pipeline_stage)}</div>
                    <div style={{ fontSize: 12.5, color: INK_FAINT, marginTop: 2 }}>Account: {txt(prospect.name)}</div>
                  </div>
                </div>
                {(prospect.pipeline_stage || '').toUpperCase() === 'WON' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, fontFamily: "'Montserrat', system-ui, sans-serif", letterSpacing: 0.5, padding: '8px 16px', borderRadius: 22, background: '#DEF0E4', color: '#1F8B4D' }}>
                    <Icon name="check" size={15} strokeWidth={2.6} />WON
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* HEALTH SCORE */}
      {tab === 'health' && (() => {
        const { score, components } = computeHealth(customer, prospect, visits);
        const st = healthStatus(score);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={S.banner}>
              <Icon name="alert" size={16} color="#B45309" strokeWidth={2} style={{ marginTop: 1 }} />
              <span>Skor sementara (heuristik) — dihitung dari sinyal yang tersedia: visit, BANT, pipeline & kelengkapan profil. Parameter SOP penuh (Volume Trend, Payment Behavior, NPS, Complaint) menunggu data transaksi & survey. <b>TODO: auto-calculate.</b></span>
            </div>
            <div style={S.card}>
              <div style={S.healthTop}>
                <HealthGauge score={score} color={st.color} />
                <div style={S.healthInfo}>
                  <span style={{ ...S.healthStatusBadge, background: st.bg, color: st.fg }}><Icon name="heartpulse" size={14} strokeWidth={2.2} />{st.key}</span>
                  <h3 style={S.healthTitle}>Customer Health Score</h3>
                  <div style={S.healthSub}>Skor komposit dari sinyal CRM yang tersedia · {txt(customer.code)} · diperbarui {fmtDate(customer.updated_at || customer.created_at)}</div>
                </div>
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardHead}>
                <h3 style={S.cardHeadTitle}>Breakdown Komponen</h3>
                <span style={S.cardHeadSub}>{components.length} parameter berbobot</span>
              </div>
              <div>{components.map((cp) => <HealthComp key={cp.name} comp={cp} />)}</div>
            </div>
            <div style={S.card}>
              <div style={S.cardHead}>
                <h3 style={S.cardHeadTitle}>Rekomendasi Aksi</h3>
                <span style={S.cardHeadSub}>Berdasarkan status {st.key}</span>
              </div>
              <div style={{ ...S.recCard, background: st.bg }}>
                <span style={{ ...S.recIco, background: '#fff', color: st.color }}><Icon name={st.recIcon} size={20} strokeWidth={2} /></span>
                <div>
                  <div style={{ ...S.recTitle, color: st.fg }}>Status {st.key}</div>
                  <div style={{ ...S.recText, color: st.fg }}>{st.rec}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* NOTES */}
      {tab === 'notes' && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <h3 style={S.cardHeadTitle}>Catatan Customer</h3>
            {!editNotes && (
              <button type="button" className="cd-outline" style={{ ...S.outlineBtn, height: 36, fontSize: 12.5 }} onClick={startEditNotes}>
                <Icon name="pencil" size={14} />Edit Notes
              </button>
            )}
          </div>
          {!editNotes ? (
            customer.notes
              ? <div style={S.notesBox}>{customer.notes}</div>
              : <div style={{ padding: '40px 22px', textAlign: 'center', color: INK_FAINT, fontSize: 13 }}>Tidak ada catatan.</div>
          ) : (
            <>
              <textarea style={S.notesArea} value={notesDraft} onChange={e => setNotesDraft(e.target.value)} placeholder="Catatan tambahan…" />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '12px 22px 20px' }}>
                <button type="button" className="cd-outline" style={{ ...S.outlineBtn, height: 38 }} onClick={() => setEditNotes(false)} disabled={savingNotes}>
                  <Icon name="x" size={14} />Batal
                </button>
                <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 18px', borderRadius: 11, border: 'none', background: NAVY, color: '#fff', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: savingNotes ? 'not-allowed' : 'pointer', opacity: savingNotes ? 0.6 : 1 }} onClick={saveNotes} disabled={savingNotes}>
                  <Icon name="save" size={15} color="#fff" />{savingNotes ? 'Menyimpan…' : 'Simpan Notes'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <CustomerFormModal
          initial={customer}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); fetchCustomer(); }}
          showToast={showToast}
        />
      )}

      {/* TOP Request modal */}
      {topOpen && (
        <TOPRequestModal
          account={customer}
          onClose={() => setTopOpen(false)}
          showToast={showToast}
        />
      )}

      {/* Edit Deal modal — stage/value/assignee, jalur tulis sama DealDetailPage */}
      <EditDealModal
        open={dealEditOpen}
        initial={dealSeed
          ? { stage: stageIndex(dealSeed.pipeline_stage), assignedId: dealSeed.assigned_profile || '', value: Number(dealSeed.estimated_value || 0), closeDate: dealSeed.estimated_closing_date || '' }
          : { stage: 0, assignedId: '', value: 0, closeDate: '' }}
        assignees={dealAssignees}
        onClose={() => setDealEditOpen(false)}
        onSave={saveDealEdit}
      />

      {/* Delete confirm */}
      <ConfirmModal
        open={confirmDel}
        title="Hapus Customer?"
        message={`Customer "${customer.name}" akan dihapus (soft delete). Lanjutkan?`}
        confirmLabel={deleting ? 'Menghapus…' : 'Ya, Hapus'}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}

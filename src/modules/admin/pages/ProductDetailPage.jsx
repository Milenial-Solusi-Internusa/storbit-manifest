// src/modules/admin/pages/ProductDetailPage.jsx
// ProductDetailModal — overlay modal for product/service detail
// is_service=true  → ServiceLayout inside modal body
// is_service=false → PhysicalLayout inside modal body
//
// Props: isOpen, onClose, selectedProduct, onDeactivate

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

/* ── brand tokens ──────────────────────────────────────────────────────────── */
const NAVY   = '#1B4D8A';
const ORANGE = '#E85A1E';

/* ── inline lucide paths ───────────────────────────────────────────────────── */
const ICONS = {
  pencil:      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  building:    '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  zap:         '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  box:         '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  tag:         '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  wallet:      '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  ruler:       '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  package:     '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  warehouse:   '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/>',
  globe:       '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  check:       '<path d="M20 6 9 17l-5-5"/>',
  checkcircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  ship:        '<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  plane:       '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  filecheck:   '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
  truck:       '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clipboard:   '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>',
  store:       '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
  forklift:    '<path d="M12 12H5a2 2 0 0 0-2 2v5"/><circle cx="13" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="M8 19h3"/><path d="M11 19V9c0-1.1-.9-2-2-2H6"/><path d="M16 21v-7a2 2 0 0 0-2-2h-3"/><path d="m16 9 4 4h-4"/>',
  monitor:     '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  info:        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alertcircle: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  calendar:    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  layers:      '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  boxes:       '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  wrench:      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  xmark:       '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy:        '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ban:         '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  save:        '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  filetext:    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  shoppingcart:'<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
};

function Icon({ name, size = 18, color, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color || 'currentColor'} strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.info }}
    />
  );
}

/* ── shared lookup maps ────────────────────────────────────────────────────── */
const COMPANIES = {
  MSI: { label: 'PT Milenial Solusi Internusa', short: 'MSI', bg: '#EAF0F8', fg: NAVY       },
  JCI: { label: 'PT Jago Custom Indonesia',     short: 'JCI', bg: '#E5EDF7', fg: '#1E5894'  },
  SOA: { label: 'PT Stuja Orbit Abadi',         short: 'SOA', bg: '#FBE6DA', fg: '#C8521B'  },
};

const CATEGORIES = {
  sea:      { label: 'Sea Freight',             icon: 'ship',      strip: '#2A6FB0', bg: '#E1ECF5', fg: '#1E5894' },
  air:      { label: 'Air Freight',             icon: 'plane',     strip: '#1F8FBA', bg: '#E2F0F7', fg: '#1B7299' },
  customs:  { label: 'Customs',                 icon: 'filecheck', strip: '#8A5FB0', bg: '#ECE3F4', fg: '#6E4B8C' },
  truck:    { label: 'Trucking',                icon: 'truck',     strip: '#D2762B', bg: '#F6E8D6', fg: '#A45A22' },
  wh:       { label: 'Warehousing',             icon: 'warehouse', strip: '#3F8A52', bg: '#E7EFE2', fg: '#2F6B3F' },
  ppjk:     { label: 'PPJK',                    icon: 'clipboard', strip: '#5A60B5', bg: '#E6E7F6', fg: '#44488C' },
  display:  { label: 'Display & Merchandising', icon: 'store',     strip: '#CE5187', bg: '#F8E4ED', fg: '#A63A6B' },
  packaging:{ label: 'Packaging & Shipping',    icon: 'package',   strip: '#C49A1E', bg: '#F7EFD4', fg: '#8A6A12' },
  whequip:  { label: 'Warehouse Equipment',     icon: 'forklift',  strip: '#2C8C8C', bg: '#DCEBEA', fg: '#1F6B6B' },
  itequip:  { label: 'Office & IT Equipment',   icon: 'monitor',   strip: '#7A828E', bg: '#ECEDF1', fg: '#5A626E' },
  general:  { label: 'General',                 icon: 'box',       strip: '#6B7280', bg: '#F3F4F6', fg: '#4B5563' },
  railcard: { label: 'Railcard',                icon: 'tag',       strip: '#E85A1E', bg: '#FBE6DA', fg: '#C8521B' },
  racking:  { label: 'Racking',                 icon: 'layers',    strip: '#0E7490', bg: '#CFFAFE', fg: '#0E7490' },
  tray:     { label: 'Tray',                    icon: 'box',       strip: '#92400E', bg: '#FEF3C7', fg: '#92400E' },
  bundle:   { label: 'Bundle',                  icon: 'package',   strip: '#7C3AED', bg: '#EDE9FE', fg: '#6D28D9' },
  frames:   { label: 'Frames',                  icon: 'monitor',   strip: '#BE185D', bg: '#FCE7F3', fg: '#BE185D' },
  tools:    { label: 'Tools',                   icon: 'wrench',    strip: '#D97706', bg: '#FEF3C7', fg: '#B45309' },
  carton:   { label: 'Carton',                  icon: 'package',   strip: '#6B7280', bg: '#F3F4F6', fg: '#4B5563' },
  stationery:{ label: 'Stationery',             icon: 'pencil',    strip: '#2563EB', bg: '#EFF6FF', fg: '#1D4ED8' },
  other:    { label: 'Other',                   icon: 'box',       strip: '#6B7280', bg: '#F3F4F6', fg: '#4B5563' },
};

const CAT_ALIASES = {
  sea: 'sea', 'sea freight': 'sea', air: 'air', 'air freight': 'air',
  customs: 'customs', ppjk: 'ppjk', truck: 'truck', trucking: 'truck',
  warehouse: 'wh', warehousing: 'wh', display: 'display', packaging: 'packaging',
  'warehouse equipment': 'whequip', 'office & it': 'itequip', 'it equipment': 'itequip',
  railcard: 'railcard', racking: 'racking', tray: 'tray', bundle: 'bundle',
  frames: 'frames', tools: 'tools', carton: 'carton', stationery: 'stationery', other: 'other',
};
function catKey(raw) {
  if (!raw) return 'general';
  const k = raw.toLowerCase().trim();
  return CAT_ALIASES[k] || (CATEGORIES[k] ? k : 'general');
}

const UNITS = {
  container: 'per container', cbm: 'per CBM', cbm_month: 'per CBM/bln',
  kg: 'per kg', trip: 'per trip', shipment: 'per shipment',
  doc: 'per dokumen', unit: 'per unit', pcs: 'per pcs',
  roll: 'per roll', box: 'per dus', lot: 'per lot',
};
function unitLabel(u) { return UNITS[u] || (u ? `per ${u}` : '—'); }
const rp = (n) => (!n ? '–' : 'Rp ' + Number(n).toLocaleString('id-ID'));

const ID_MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function formatIdDate(val) {
  if (!val) return '–';
  const d = new Date(val);
  if (isNaN(d)) return val;
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ── style helpers ────────────────────────────────────────────────────────── */
const card = (extra) => ({
  background: '#fff', border: '1px solid #ECEDF1', borderRadius: 12,
  boxShadow: '0 1px 3px rgba(20,40,70,.06)', ...extra,
});

/* ── badge components ─────────────────────────────────────────────────────── */
function StatusPill({ active }) {
  return active ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 9px 3px 7px', borderRadius: 20, background: '#DEF0E4', color: '#1F8B4D' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1F8B4D' }}/>Aktif
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 9px 3px 7px', borderRadius: 20, background: '#EEF0F3', color: '#9AA0AC' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#B6BCC6' }}/>Nonaktif
    </span>
  );
}

function TypeBadge({ isService }) {
  return isService ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px 3px 7px', borderRadius: 20, background: '#FBE6DA', color: '#C8521B' }}>
      <Icon name="zap" size={11}/>Service
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px 3px 7px', borderRadius: 20, background: '#EEF0F3', color: '#6B7280' }}>
      <Icon name="box" size={11}/>Produk
    </span>
  );
}

/* ── shared sub-components ────────────────────────────────────────────────── */
function SidebarRow({ icon, label, value, iconBg, iconFg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: iconBg || '#EAF0F8', color: iconFg || NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 34px' }}>
        <Icon name={icon} size={16}/>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#16243A', marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}

function RateRow({ label, value, isHighlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', background: isHighlight ? '#F7F9FC' : '#fff', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ fontSize: 13, fontWeight: isHighlight ? 600 : 500, color: isHighlight ? '#16243A' : '#5A626E' }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: isHighlight ? NAVY : '#7A828E' }}>{value}</span>
    </div>
  );
}

function CoverageItem({ icon, label, desc, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', background: '#FAFBFC', border: '1px solid #ECEDF1', borderRadius: 10 }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 32px' }}>
        <Icon name={icon} size={15}/>
      </span>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16243A' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: '#9AA0AC', marginTop: 1 }}>{desc}</div>}
      </div>
      <Icon name="check" size={14} color="#1F8B4D" style={{ marginLeft: 'auto' }}/>
    </div>
  );
}

/* navy-header card */
const cardHead = {
  background: NAVY,
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: '11px 11px 0 0',
};
const cardHeadTitle = {
  fontFamily: "'Montserrat', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 800,
  color: '#fff',
  letterSpacing: .4,
  textTransform: 'uppercase',
};

function NavCard({ icon, title, children }) {
  return (
    <div style={{ ...card({ overflow: 'hidden', padding: 0, borderRadius: 12 }) }}>
      <div style={cardHead}>
        <Icon name={icon} size={13} color="rgba(255,255,255,0.75)"/>
        <span style={cardHeadTitle}>{title}</span>
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderBottom: last ? 'none' : '1px solid #F3F4F6' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#16243A', textAlign: 'right', fontFamily: mono ? "'IBM Plex Mono', ui-monospace, monospace" : 'inherit' }}>
        {value ?? '–'}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SERVICE LAYOUT (modal body)
   ════════════════════════════════════════════════════════════════════════════ */
function ServiceLayout({ product, cat, co }) {
  const applicableEntities = [
    { icon: 'building', label: co.label, desc: co.short, color: co.fg },
  ];
  if (['sea','air','truck','wh'].includes(cat.key)) {
    applicableEntities.push({ icon: 'globe', label: 'International Shipments', desc: 'Export & Import', color: '#2A6FB0' });
  }
  if (['customs','ppjk'].includes(cat.key)) {
    applicableEntities.push({ icon: 'filecheck', label: 'Customs Authority', desc: 'DJBC filing', color: '#8A5FB0' });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 268px', gap: 16, alignItems: 'start' }}>
      {/* main */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Rate Card */}
        <div style={{ ...card({ overflow: 'hidden', padding: 0 }) }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #ECEDF1', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="wallet" size={14} color={NAVY}/>
            <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 12, fontWeight: 800, color: '#16243A', letterSpacing: -.1 }}>Rate Card</span>
          </div>
          <RateRow label="Harga Dasar"   value={product.default_price ? rp(product.default_price) : 'Hubungi tim Sales'} isHighlight/>
          <RateRow label="Satuan"         value={unitLabel(product.unit)}/>
          <RateRow label="Pajak Default"  value="Sesuai perjanjian"/>
          <RateRow label="Mata Uang"      value="IDR"/>
          <div style={{ padding: '11px 16px', background: '#FFFBF7', borderTop: '1px solid #FEE9D6' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <Icon name="info" size={13} color={ORANGE} style={{ marginTop: 1, flexShrink: 0 }}/>
              <p style={{ fontSize: 11, color: '#8A5A22', margin: 0, lineHeight: 1.5 }}>
                Harga dapat berubah sesuai volume, rute, dan kondisi pasar. Hubungi tim Sales untuk penawaran resmi.
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div style={{ ...card({ padding: '16px' }) }}>
            <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 12, fontWeight: 800, color: '#16243A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon name="layers" size={14} color={NAVY}/>Deskripsi Layanan
            </div>
            <p style={{ fontSize: 13, color: '#5A626E', lineHeight: 1.7, margin: 0 }}>{product.description}</p>
          </div>
        )}

        {/* Coverage */}
        <div style={{ ...card({ padding: '16px' }) }}>
          <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 12, fontWeight: 800, color: '#16243A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="globe" size={14} color={NAVY}/>Coverage &amp; Cakupan
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {applicableEntities.map((e, i) => (
              <CoverageItem key={i} icon={e.icon} label={e.label} desc={e.desc} color={e.color}/>
            ))}
            <CoverageItem icon="checkcircle" label="Multi-currency support" desc="IDR, USD, EUR" color="#1F8B4D"/>
            <CoverageItem icon="layers"      label="Dapat dikombinasikan"  desc="Bundled service pricing" color="#7C3AED"/>
          </div>
        </div>
      </div>

      {/* sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card({ padding: '16px' }) }}>
          <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 12, fontWeight: 800, color: '#16243A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="checkcircle" size={14} color={NAVY}/>Quick Stats
          </div>
          <SidebarRow icon="wallet"   label="Harga Dasar" value={product.default_price ? rp(product.default_price) : '–'} iconBg="#EAF0F8" iconFg={NAVY}/>
          <SidebarRow icon="tag"      label="Kategori"    value={(CATEGORIES[cat.key] || CATEGORIES.general).label} iconBg={cat.bg} iconFg={cat.fg}/>
          <SidebarRow icon="ruler"    label="Satuan"      value={unitLabel(product.unit)} iconBg="#F3F4F6" iconFg="#5A626E"/>
          <SidebarRow icon="building" label="Entitas"     value={co.short} iconBg={co.bg} iconFg={co.fg}/>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PHYSICAL LAYOUT (modal body)
   ════════════════════════════════════════════════════════════════════════════ */
function PhysicalLayout({ product, cat, co }) {
  const [copied, setCopied] = useState(false);

  function copySku() {
    navigator.clipboard.writeText(product.code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const unitCost   = product.unit_cost   || null;
  const uomDisplay = product.uom         || product.unit || null;
  const weight     = product.weight      || '–';
  const dims       = product.dimensions  || '–';
  const packaging  = product.packaging   || '–';
  const minOrder   = product.min_order_qty || '–';
  const cogsAcct   = product.cogs_account   || '–';
  const revAcct    = product.revenue_account || '–';
  const showMargin = unitCost > 0 && product.default_price > 0;
  const marginPct  = showMargin
    ? (((product.default_price - unitCost) / product.default_price) * 100).toFixed(1) + '%'
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 268px', gap: 16, alignItems: 'start' }}>

      {/* ── main column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 1 — Informasi Produk */}
        <NavCard icon="layers" title="Informasi Produk">
          {/* SKU row with copy button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', flexShrink: 0, marginRight: 12 }}>SKU / Kode Produk</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={copySku}
                title={copied ? 'Tersalin!' : 'Salin SKU'}
                style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: copied ? '#1F8B4D' : '#9AA0AC', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'all 0.15s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F0F2F5'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Icon name={copied ? 'check' : 'copy'} size={14}/>
              </button>
              <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: '#16243A' }}>
                {product.code || '–'}
              </span>
            </div>
          </div>
          <InfoRow label="UOM / Satuan"          value={uomDisplay ? unitLabel(uomDisplay) : '–'}/>
          <InfoRow label="Kategori"              value={product.category || '–'}/>
          <InfoRow label="Main Group"            value={product.main_group || '–'}/>
          <InfoRow label="Inventory Class"       value={product.inventory_class || '–'}/>
          <InfoRow label="Operational Function"  value={product.operational_function || product.description || '–'} last/>
          {/* Default Price box */}
          <div style={{ marginTop: 12, borderRadius: 10, background: '#EAF0F8', border: `1px solid ${NAVY}20`, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: .5 }}>Default Price</div>
              <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 22, fontWeight: 900, color: NAVY, letterSpacing: -.5, marginTop: 2, lineHeight: 1 }}>
                {product.default_price ? rp(product.default_price) : '–'}
              </div>
              {uomDisplay && <div style={{ fontSize: 11, color: '#5A7AB5', marginTop: 3 }}>{unitLabel(uomDisplay)}</div>}
            </div>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="wallet" size={18} color="#fff"/>
            </span>
          </div>
        </NavCard>

        {/* 2 — Dimensi & Packaging — MOCK pending inventory module */}
        <NavCard icon="package" title="Dimensi & Packaging">
          <InfoRow label="Berat"          value={weight}/>
          <InfoRow label="Dimensi"        value={dims}/>
          <InfoRow label="Packaging"      value={packaging}/>
          <InfoRow label="Min. Order Qty" value={minOrder} last/>
        </NavCard>

        {/* 3 — Harga & Pajak */}
        <NavCard icon="tag" title="Harga & Pajak">
          <InfoRow label="Unit Cost"       value={unitCost ? rp(unitCost) : '–'} mono/>
          <InfoRow label="Pajak"           value="Sesuai perjanjian"/>
          <InfoRow label="COGS Account"    value={cogsAcct} mono/>
          <InfoRow label="Revenue Account" value={revAcct}  mono last/>
          <div style={{ marginTop: 12, borderRadius: 10, background: '#F7F9FC', border: '1px solid #ECEDF1', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .5 }}>Default Price</div>
              <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 20, fontWeight: 900, color: '#16243A', letterSpacing: -.5, marginTop: 2 }}>
                {product.default_price ? rp(product.default_price) : '–'}
              </div>
            </div>
            {showMargin && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .5 }}>Margin</div>
                <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 20, fontWeight: 900, color: '#1F8B4D', letterSpacing: -.5, marginTop: 2 }}>{marginPct}</div>
              </div>
            )}
          </div>
        </NavCard>
      </div>

      {/* ── sidebar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Quick Stats — MOCK pending inventory module */}
        <div style={{ ...card({ padding: '16px' }) }}>
          <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 12, fontWeight: 800, color: '#16243A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="boxes" size={14} color={NAVY}/>Quick Stats
          </div>
          {/* MOCK — pending inventory module */}
          <SidebarRow icon="shoppingcart" label="Quotation Aktif" value="0" iconBg="#EAF0F8" iconFg={NAVY}/>
          <SidebarRow icon="filetext"     label="Sales Order"     value="0" iconBg="#F3F4F6" iconFg="#5A626E"/>
          <SidebarRow icon="building"     label="Entitas"         value={co.short} iconBg={co.bg} iconFg={co.fg}/>
          <SidebarRow
            icon={product.is_active ? 'checkcircle' : 'alertcircle'}
            label="Status"
            value={product.is_active ? 'Aktif' : 'Nonaktif'}
            iconBg={product.is_active ? '#DEF0E4' : '#EEF0F3'}
            iconFg={product.is_active ? '#1F8B4D' : '#9AA0AC'}
          />
        </div>

        {/* Terakhir Diperbarui */}
        <div style={{ ...card({ padding: '14px 16px' }) }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>Terakhir Diperbarui</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: '#EAF0F8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="calendar" size={16}/>
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16243A' }}>
                {product.registered_date ? formatIdDate(product.registered_date) : '–'}
              </div>
              <div style={{ fontSize: 11, color: '#9AA0AC', marginTop: 2 }}>Tgl. Registrasi</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── form field helper ────────────────────────────────────────────────────── */
function FormField({ label, value, onChange, placeholder, type = 'text', readOnly, last }) {
  const lbl = { fontSize: 11, fontWeight: 600, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 };
  return (
    <div style={{ marginBottom: last ? 0 : 12 }}>
      <div style={lbl}>{label}</div>
      {readOnly ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', padding: '4px 0' }}>{value || '–'}</div>
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || ''}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid #D9D9DC', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: '#16243A', outline: 'none', background: '#fff' }}
          onFocus={e => { e.target.style.borderColor = NAVY; e.target.style.boxShadow = `0 0 0 3px ${NAVY}14`; }}
          onBlur={e  => { e.target.style.borderColor = '#D9D9DC'; e.target.style.boxShadow = 'none'; }}
        />
      )}
    </div>
  );
}

function EditForm({ product, editForm, setEditForm }) {
  const set = (key) => (val) => setEditForm(prev => ({ ...prev, [key]: val }));
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid #D9D9DC', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: '#16243A', outline: 'none', background: '#fff', resize: 'vertical' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 268px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <NavCard icon="layers" title="Informasi Produk">
          <FormField label="SKU / Kode Produk" value={product.code}            readOnly/>
          <FormField label="Kategori"           value={product.category}        readOnly/>
          <FormField label="Inventory Class"    value={product.inventory_class} readOnly/>
          <FormField label="UOM / Satuan"       value={product.uom || product.unit} readOnly/>
          <FormField label="Nama Produk"        value={editForm.name}               onChange={set('name')}                placeholder="Nama produk"/>
          <FormField label="Operational Function" value={editForm.operational_function} onChange={set('operational_function')} placeholder="–"/>
          <div>
            <div style={lbl}>Deskripsi</div>
            <textarea value={editForm.description} rows={3} onChange={e => set('description')(e.target.value)} placeholder="Deskripsi produk" style={inputStyle}
              onFocus={e => { e.target.style.borderColor = NAVY; e.target.style.boxShadow = `0 0 0 3px ${NAVY}14`; }}
              onBlur={e  => { e.target.style.borderColor = '#D9D9DC'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </NavCard>

        <NavCard icon="package" title="Dimensi & Packaging">
          <FormField label="Berat"          value={editForm.weight}        onChange={set('weight')}        placeholder="e.g. 2.4 kg"/>
          <FormField label="Dimensi"        value={editForm.dimensions}    onChange={set('dimensions')}    placeholder="e.g. 45 × 30 × 12 cm"/>
          <FormField label="Packaging"      value={editForm.packaging}     onChange={set('packaging')}     placeholder="e.g. Karton Box"/>
          <FormField label="Min. Order Qty" value={editForm.min_order_qty} onChange={set('min_order_qty')} placeholder="e.g. 10 pcs" last/>
        </NavCard>

        <NavCard icon="tag" title="Harga & Pajak">
          <FormField label="Default Price"   value={String(editForm.default_price ?? '')} onChange={set('default_price')} type="number" placeholder="0"/>
          <FormField label="Unit Cost"       value={String(editForm.unit_cost ?? '')}     onChange={set('unit_cost')}     type="number" placeholder="0"/>
          <FormField label="Unit"            value={editForm.unit}         onChange={set('unit')}         placeholder="e.g. pcs"/>
          <FormField label="COGS Account"    value={editForm.cogs_account} onChange={set('cogs_account')} placeholder="–"/>
          <FormField label="Revenue Account" value={editForm.revenue_account} onChange={set('revenue_account')} placeholder="–" last/>
        </NavCard>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card({ padding: '14px 16px' }) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="info" size={14} color={NAVY}/>
            <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 11, fontWeight: 800, color: '#16243A', textTransform: 'uppercase', letterSpacing: .3 }}>Info Edit</span>
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
            SKU, Kategori, Inventory Class, dan UOM tidak dapat diubah dari sini.
          </div>
        </div>
        <div style={{ ...card({ padding: '14px 16px' }) }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>Terakhir Diperbarui</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: '#EAF0F8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="calendar" size={16}/>
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16243A' }}>
                {product.registered_date ? formatIdDate(product.registered_date) : '–'}
              </div>
              <div style={{ fontSize: 11, color: '#9AA0AC', marginTop: 2 }}>Tgl. Registrasi</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT — ProductDetailModal
   ════════════════════════════════════════════════════════════════════════════ */
export default function ProductDetailModal({ isOpen, onClose, selectedProduct, onDeactivate }) {
  const [product, setProduct]         = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [companyCode, setCompanyCode] = useState('MSI');
  const [toggling, setToggling]       = useState(false);
  const [editing, setEditing]         = useState(false);
  const [editForm, setEditForm]       = useState({});
  const [toast, setToast]             = useState('');

  useEffect(() => {
    if (!isOpen || !selectedProduct?.id) return;
    setLoading(true);
    setError(null);
    setProduct(null);

    Promise.all([
      supabase.from('companies').select('id, code').eq('is_active', true),
      supabase
        .from('products')
        .select('id, code, name, category, unit, description, is_service, default_price, company_id, is_active, inventory_class, main_group, registered_date, operational_function, uom, unit_cost, weight, dimensions, packaging, min_order_qty, cogs_account, revenue_account')
        .eq('id', selectedProduct.id)
        .single(),
    ]).then(([{ data: cos }, { data: prod, error: err }]) => {
      if (err) { setError(err.message); setLoading(false); return; }
      const codeById = Object.fromEntries((cos || []).map(c => [c.id, c.code]));
      setCompanyCode(codeById[prod.company_id] || selectedProduct.company || 'MSI');
      setProduct(prod);
      setLoading(false);
    });
  }, [isOpen, selectedProduct?.id]);

  /* close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { editing ? setEditing(false) : onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, editing]);

  /* reset edit state when modal closes */
  useEffect(() => { if (!isOpen) setEditing(false); }, [isOpen]);

  async function toggleActive() {
    if (toggling) return;
    setToggling(true);
    try {
      const { error: err } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);
      if (err) throw err;
      setProduct(prev => ({ ...prev, is_active: !prev.is_active }));
    } catch (err) {
      console.error('Toggle error:', err);
    } finally {
      setToggling(false);
    }
  }

  function startEdit() {
    if (product.is_service) {
      setToast('Edit layanan coming soon');
      setTimeout(() => setToast(''), 2500);
      return;
    }
    setEditForm({
      name: product.name,
      description: product.description || '',
      default_price: product.default_price || '',
      unit: product.unit || '',
      unit_cost: product.unit_cost || '',
      operational_function: product.operational_function || '',
      weight: product.weight || '',
      dimensions: product.dimensions || '',
      packaging: product.packaging || '',
      min_order_qty: product.min_order_qty || '',
      cogs_account: product.cogs_account || '',
      revenue_account: product.revenue_account || '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    try {
      const { error: err } = await supabase
        .from('products')
        .update({
          name: editForm.name,
          description: editForm.description,
          default_price: parseFloat(editForm.default_price) || null,
          unit: editForm.unit,
          unit_cost: parseFloat(editForm.unit_cost) || null,
          operational_function: editForm.operational_function,
          weight: editForm.weight,
          dimensions: editForm.dimensions,
          packaging: editForm.packaging,
          min_order_qty: editForm.min_order_qty,
          cogs_account: editForm.cogs_account,
          revenue_account: editForm.revenue_account,
        })
        .eq('id', product.id);
      if (err) throw err;
      setProduct(prev => ({
        ...prev, ...editForm,
        default_price: parseFloat(editForm.default_price) || prev.default_price,
        unit_cost: parseFloat(editForm.unit_cost) || null,
      }));
      setEditing(false);
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  if (!isOpen) return null;

  const catK        = product ? catKey(product.category) : 'general';
  const cat         = { ...CATEGORIES[catK] || CATEGORIES.general, key: catK };
  const co          = COMPANIES[companyCode] || { label: companyCode, short: companyCode, bg: '#F3F4F6', fg: '#6B7280' };
  const accentColor = cat.strip;

  return (
    <>
      <style>{`
        @keyframes pdm-in { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .pdm-box { animation: pdm-in 200ms ease both; }
        .pdm-close:hover { background: #F0F2F5 !important; }
        .pdm-btn-edit:hover { background: ${NAVY}12 !important; }
        .pdm-btn-deact:hover { background: #FEE2E2 !important; border-color: #F87171 !important; }
      `}</style>

      {/* overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(10,20,40,0.55)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        {/* modal box — stop propagation so clicks inside don't close */}
        <div
          className="pdm-box"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 880,
            maxWidth: 'calc(100vw - 48px)',
            maxHeight: 'calc(100vh - 64px)',
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(10,20,40,0.28)',
            fontFamily: "'Inter', system-ui, sans-serif",
            color: '#1A2330',
          }}
        >
          {/* ── accent strip ── */}
          {product && (
            <div style={{ height: 4, background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor}99 100%)`, borderRadius: '20px 20px 0 0' }}/>
          )}

          {/* ── compact modal header ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #ECEDF1', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderRadius: product ? '0' : '20px 20px 0 0' }}>
            {/* category icon */}
            {product && (
              <span style={{ width: 38, height: 38, borderRadius: 11, background: cat.bg, color: cat.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={cat.icon} size={20}/>
              </span>
            )}

            {/* title + badges */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {product ? (
                <>
                  <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 15, fontWeight: 900, color: '#16243A', letterSpacing: -.3, lineHeight: 1.2, marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {product.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, fontWeight: 700, color: '#6B7280', background: '#F2F3F6', padding: '2px 7px', borderRadius: 5 }}>
                      {product.code}
                    </span>
                    <TypeBadge isService={product.is_service}/>
                    <StatusPill active={product.is_active}/>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: co.bg, color: co.fg }}>
                      <Icon name="building" size={10}/>{co.short}
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 600, color: '#9AA0AC' }}>Memuat detail produk…</div>
              )}
            </div>

            {/* action buttons */}
            {product && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {editing ? (
                  <>
                    <button type="button" onClick={saveEdit}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: NAVY, color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Icon name="save" size={13}/>Simpan
                    </button>
                    <button type="button" onClick={() => setEditing(false)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1.5px solid #D9D9DC', background: '#fff', color: '#6B7280', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Batal
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="pdm-btn-edit" onClick={startEdit}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: `1.5px solid ${NAVY}`, background: 'transparent', color: NAVY, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Icon name="pencil" size={13}/>Edit
                    </button>
                    <button type="button" className="pdm-btn-deact" onClick={toggleActive}
                      disabled={toggling}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: product.is_active ? '1.5px solid #FECACA' : `1.5px solid #BBF7D0`, background: 'transparent', color: product.is_active ? '#DC2626' : '#1F8B4D', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: toggling ? 'not-allowed' : 'pointer', opacity: toggling ? 0.6 : 1 }}>
                      <Icon name={product.is_active ? 'ban' : 'check'} size={13}/>
                      {toggling ? '…' : product.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* X close */}
            <button type="button" className="pdm-close" onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #E3E5EA', background: '#fff', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="xmark" size={16}/>
            </button>
          </div>

          {/* ── modal body ── */}
          <div style={{ padding: '20px 20px 24px' }}>

            {/* Toast */}
            {toast && (
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: '#FEF3C7', border: '1px solid #FDE68A', fontSize: 13, fontWeight: 600, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="info" size={15} color="#D97706"/>
                {toast}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ height: 72, borderRadius: 12, background: '#F2F4F7', animation: 'pulse 1.5s infinite' }}/>
                ))}
              </div>
            )}

            {/* Error */}
            {!loading && (error || (!product && !loading)) && (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <Icon name="alertcircle" size={28} color="#F87171" style={{ display: 'block', margin: '0 auto 10px' }}/>
                <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 15, fontWeight: 800, color: '#16243A' }}>Produk tidak ditemukan</div>
                <p style={{ fontSize: 13, color: '#9AA0AC', marginTop: 4 }}>{error || 'Data tidak tersedia.'}</p>
              </div>
            )}

            {/* Content */}
            {!loading && product && (
              editing
                ? <EditForm product={product} editForm={editForm} setEditForm={setEditForm}/>
                : product.is_service
                ? <ServiceLayout  product={product} cat={cat} co={co}/>
                : <PhysicalLayout product={product} cat={cat} co={co}/>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

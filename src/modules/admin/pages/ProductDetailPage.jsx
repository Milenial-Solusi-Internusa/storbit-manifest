// src/modules/admin/pages/ProductDetailPage.jsx
// Adaptive product/service detail page — Nexus by MSI
// is_service=true  → Service layout: Rate Card, Coverage, Quick Stats sidebar
// is_service=false → Physical layout: Specs grid, Stock placeholder, Warehouse sidebar
//
// Navigation: no React Router — driven by selectedProduct + setActiveMenu props.

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

/* ── brand tokens ──────────────────────────────────────────────────────────── */
const NAVY   = '#144682';
const NAVY_D = '#0f3366';
const ORANGE = '#E85A1E';

/* ── inline lucide paths ───────────────────────────────────────────────────── */
const ICONS = {
  chevleft:    '<path d="m15 18-6-6 6-6"/>',
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
  chevright:   '<path d="m9 18 6-6-6-6"/>',
  wrench:      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  pencil:      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
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

/* ── shared lookup maps (same as ProductsPage) ─────────────────────────────── */
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
  background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14,
  boxShadow: '0 1px 3px rgba(20,40,70,.06)', ...extra,
});
const sectionTitle = { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 13, fontWeight: 800, color: '#16243A', letterSpacing: -.1, marginBottom: 14 };
const labelStyle   = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: '#9AA0AC', marginBottom: 4 };
const valueStyle   = { fontSize: 14, fontWeight: 600, color: '#16243A' };

/* ── small badge components ───────────────────────────────────────────────── */
function StatusPill({ active }) {
  return active ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px 4px 8px', borderRadius: 20, background: '#DEF0E4', color: '#1F8B4D' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1F8B4D' }}/>Aktif
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px 4px 8px', borderRadius: 20, background: '#EEF0F3', color: '#9AA0AC' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B6BCC6' }}/>Nonaktif
    </span>
  );
}

function TypeBadge({ isService }) {
  return isService ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px 4px 8px', borderRadius: 20, background: '#FBE6DA', color: '#C8521B' }}>
      <Icon name="zap" size={12}/>Service
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px 4px 8px', borderRadius: 20, background: '#EEF0F3', color: '#6B7280' }}>
      <Icon name="box" size={12}/>Produk
    </span>
  );
}

/* ── sidebar stat row ─────────────────────────────────────────────────────── */
function SidebarRow({ icon, label, value, valueStyle: vs, iconBg, iconFg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: iconBg || '#EAF0F8', color: iconFg || NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 36px' }}>
        <Icon name={icon} size={17}/>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16243A', marginTop: 2, ...vs }}>{value}</div>
      </div>
    </div>
  );
}

/* ── rate row inside Rate Card ─────────────────────────────────────────────── */
function RateRow({ label, value, isHighlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: isHighlight ? '#F7F9FC' : '#fff', borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ fontSize: 13, fontWeight: isHighlight ? 600 : 500, color: isHighlight ? '#16243A' : '#5A626E' }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13.5, fontWeight: 700, color: isHighlight ? NAVY : '#7A828E', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/* ── spec grid cell ───────────────────────────────────────────────────────── */
function SpecCell({ icon, label, value, iconBg, iconFg }) {
  return (
    <div style={{ background: '#FAFBFC', border: '1px solid #ECEDF1', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: iconBg || '#EAF0F8', color: iconFg || NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 36px' }}>
        <Icon name={icon} size={17}/>
      </span>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#16243A' }}>{value}</div>
      </div>
    </div>
  );
}

/* ── coverage item ────────────────────────────────────────────────────────── */
function CoverageItem({ icon, label, desc, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#FAFBFC', border: '1px solid #ECEDF1', borderRadius: 11 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 34px' }}>
        <Icon name={icon} size={16}/>
      </span>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16243A' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: '#9AA0AC', marginTop: 2 }}>{desc}</div>}
      </div>
      <Icon name="check" size={15} color="#1F8B4D" style={{ marginLeft: 'auto' }}/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SERVICE LAYOUT
   ════════════════════════════════════════════════════════════════════════════ */
function ServiceLayout({ product, cat, co }) {
  // infer applicable companies/entities from product.company and category
  const applicableEntities = [
    { icon: 'building', label: co.label, desc: co.short, color: co.fg },
  ];
  if (cat.key === 'sea' || cat.key === 'air' || cat.key === 'truck' || cat.key === 'wh') {
    applicableEntities.push({ icon: 'globe', label: 'International Shipments', desc: 'Export & Import', color: '#2A6FB0' });
  }
  if (cat.key === 'customs' || cat.key === 'ppjk') {
    applicableEntities.push({ icon: 'filecheck', label: 'Customs Authority', desc: 'DJBC filing', color: '#8A5FB0' });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
      {/* ── left main column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Rate Card */}
        <div style={card({ overflow: 'hidden' })}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #ECEDF1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="wallet" size={16} color={NAVY}/>
            <span style={sectionTitle}>Rate Card</span>
          </div>
          <RateRow label="Harga Dasar"          value={product.default_price ? rp(product.default_price) : 'Hubungi tim Sales'} isHighlight={true}/>
          <RateRow label="Satuan"               value={unitLabel(product.unit)}/>
          <RateRow label="Pajak Default"        value="Sesuai perjanjian"/>
          <RateRow label="Mata Uang"            value="IDR"/>
          <div style={{ padding: '12px 16px', background: '#FFFBF7', borderTop: '1px solid #FEE9D6' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="info" size={14} color={ORANGE} style={{ marginTop: 1, flexShrink: 0 }}/>
              <p style={{ fontSize: 11.5, color: '#8A5A22', margin: 0, lineHeight: 1.5 }}>
                Harga dapat berubah sesuai volume, rute, dan kondisi pasar. Hubungi tim Sales untuk penawaran resmi.
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div style={card({ padding: '18px' })}>
            <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="layers" size={15} color={NAVY}/>Deskripsi Layanan
            </div>
            <p style={{ fontSize: 13.5, color: '#5A626E', lineHeight: 1.7, margin: 0 }}>
              {product.description}
            </p>
          </div>
        )}

        {/* Coverage */}
        <div style={card({ padding: '18px' })}>
          <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon name="globe" size={15} color={NAVY}/>Coverage &amp; Cakupan
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {applicableEntities.map((e, i) => (
              <CoverageItem key={i} icon={e.icon} label={e.label} desc={e.desc} color={e.color}/>
            ))}
            <CoverageItem icon="checkcircle" label="Multi-currency support" desc="IDR, USD, EUR" color="#1F8B4D"/>
            <CoverageItem icon="layers"      label="Dapat dikombinasikan" desc="Bundled service pricing" color="#7C3AED"/>
          </div>
        </div>
      </div>

      {/* ── right sidebar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Quick Stats */}
        <div style={card({ padding: '18px' })}>
          <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="checkcircle" size={15} color={NAVY}/>Quick Stats
          </div>
          <SidebarRow icon="wallet"   label="Harga Dasar"  value={product.default_price ? rp(product.default_price) : '–'} iconBg="#EAF0F8" iconFg={NAVY}/>
          <SidebarRow icon="tag"      label="Kategori"     value={(CATEGORIES[cat.key] || CATEGORIES.general).label} iconBg={cat.bg} iconFg={cat.fg}/>
          <SidebarRow icon="ruler"    label="Satuan"       value={unitLabel(product.unit)} iconBg="#F3F4F6" iconFg="#5A626E"/>
          <SidebarRow icon="building" label="Entitas"      value={co.short} iconBg={co.bg} iconFg={co.fg}/>
          <div style={{ paddingTop: 4 }}>
            <SidebarRow icon="checkcircle" label="Status" value={product.is_active ? 'Aktif' : 'Nonaktif'} iconBg={product.is_active ? '#DEF0E4' : '#EEF0F3'} iconFg={product.is_active ? '#1F8B4D' : '#9AA0AC'}/>
          </div>
        </div>

        {/* Actions placeholder */}
        <div style={card({ padding: '16px' })}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: '#9AA0AC', marginBottom: 12 }}>Aksi</div>
          <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10, border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
            <Icon name="pencil" size={14}/>Edit Layanan
          </button>
          <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="checkcircle" size={14}/>{product.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PHYSICAL PRODUCT LAYOUT
   ════════════════════════════════════════════════════════════════════════════ */
function PhysicalLayout({ product, cat, co }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
      {/* ── left main column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Specs grid */}
        <div style={card({ padding: '18px' })}>
          <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="layers" size={15} color={NAVY}/>Spesifikasi Produk
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            <SpecCell icon="tag"      label="Kategori"    value={(CATEGORIES[cat.key] || CATEGORIES.general).label} iconBg={cat.bg} iconFg={cat.fg}/>
            <SpecCell icon="ruler"    label="Satuan"      value={unitLabel(product.unit)} iconBg="#F3F4F6" iconFg="#5A626E"/>
            <SpecCell icon="wallet"   label="Harga Dasar" value={product.default_price ? rp(product.default_price) : 'Sesuai perjanjian'} iconBg="#EAF0F8" iconFg={NAVY}/>
            <SpecCell icon="building" label="Entitas"     value={co.label} iconBg={co.bg} iconFg={co.fg}/>
            {product.registered_date && (
              <SpecCell icon="calendar" label="Tgl. Registrasi" value={formatIdDate(product.registered_date)} iconBg="#DCFCE7" iconFg="#16A34A"/>
            )}
          </div>
        </div>

        {/* Description */}
        {product.description ? (
          <div style={card({ padding: '18px' })}>
            <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="info" size={15} color={NAVY}/>Deskripsi
            </div>
            <p style={{ fontSize: 13.5, color: '#5A626E', lineHeight: 1.7, margin: 0 }}>{product.description}</p>
          </div>
        ) : (
          <div style={card({ padding: '24px 18px', textAlign: 'center' })}>
            <Icon name="info" size={28} color="#D1D5DB" style={{ display: 'block', margin: '0 auto 8px' }}/>
            <p style={{ fontSize: 13, color: '#9AA0AC', margin: 0 }}>Deskripsi belum diisi.</p>
          </div>
        )}

        {/* Stock info placeholder */}
        <div style={card({ overflow: 'hidden' })}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #ECEDF1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="boxes" size={16} color={NAVY}/>
            <span style={sectionTitle}>Informasi Stok</span>
          </div>
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: '#F2F4F7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="warehouse" size={26} color="#B6BCC6"/>
            </span>
            <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 15, fontWeight: 800, color: '#16243A', letterSpacing: -.2 }}>Modul Inventory belum aktif</div>
            <p style={{ fontSize: 12.5, color: '#9AA0AC', marginTop: 6, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
              Data stok akan tersedia setelah modul Inventory / Warehouse diaktifkan pada fase berikutnya.
            </p>
          </div>
        </div>
      </div>

      {/* ── right sidebar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Compact info list */}
        <div style={card({ padding: '18px' })}>
          <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="wallet" size={15} color={NAVY}/>Info Produk
          </div>
          <SidebarRow icon="wallet"   label="Harga Dasar" value={product.default_price ? rp(product.default_price) : 'Sesuai perjanjian'} iconBg="#EAF0F8" iconFg={NAVY}/>
          <SidebarRow icon="tag"      label="Pajak"       value="Sesuai perjanjian"   iconBg="#F3F4F6" iconFg="#5A626E"/>
          <SidebarRow icon="info"     label="Mata Uang"   value="IDR"                 iconBg="#F3F4F6" iconFg="#5A626E"/>
          <SidebarRow icon="building" label="Entitas"     value={co.short}            iconBg={co.bg}   iconFg={co.fg}/>
          <SidebarRow
            icon={product.is_active ? 'checkcircle' : 'alertcircle'}
            label="Status"
            value={product.is_active ? 'Aktif' : 'Nonaktif'}
            iconBg={product.is_active ? '#DEF0E4' : '#EEF0F3'}
            iconFg={product.is_active ? '#1F8B4D' : '#9AA0AC'}
          />
        </div>

        {/* Gudang & Lokasi placeholder */}
        <div style={card({ padding: '18px' })}>
          <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warehouse" size={15} color={NAVY}/>Gudang &amp; Lokasi
          </div>
          <div style={{ background: '#F7F9FC', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
            <Icon name="forklift" size={24} color="#B6BCC6" style={{ display: 'block', margin: '0 auto 8px' }}/>
            <div style={{ fontSize: 12, color: '#9AA0AC', lineHeight: 1.5 }}>Informasi lokasi stok tersedia saat modul Inventory aktif.</div>
          </div>
        </div>

        {/* Aksi */}
        <div style={card({ padding: '16px' })}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: '#9AA0AC', marginBottom: 12 }}>Aksi</div>
          <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10, border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
            <Icon name="pencil" size={14}/>Edit Produk
          </button>
          <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name="checkcircle" size={14}/>{product.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════════════ */
export default function ProductDetailPage({ selectedProduct, setSelectedProduct, setActiveMenu }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [companyCode, setCompanyCode] = useState('MSI');

  useEffect(() => {
    if (!selectedProduct?.id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      supabase.from('companies').select('id, code').eq('is_active', true),
      supabase
        .from('products')
        .select('id, code, name, category, unit, description, is_service, default_price, company_id, is_active, inventory_class, main_group, registered_date')
        .eq('id', selectedProduct.id)
        .single(),
    ]).then(([{ data: cos }, { data: prod, error: err }]) => {
      if (err) { setError(err.message); setLoading(false); return; }
      const codeById = Object.fromEntries((cos || []).map(c => [c.id, c.code]));
      setCompanyCode(codeById[prod.company_id] || selectedProduct.company || 'MSI');
      setProduct(prod);
      setLoading(false);
    });
  }, [selectedProduct?.id]);

  function handleBack() {
    setSelectedProduct(null);
    setActiveMenu('products');
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <button type="button" onClick={handleBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 20 }}>
          <Icon name="chevleft" size={15}/>Kembali ke Products
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 80, borderRadius: 14, background: '#F2F4F7', animation: 'pulse 1.5s infinite' }}/>)}
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error || !product) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <button type="button" onClick={handleBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 20 }}>
          <Icon name="chevleft" size={15}/>Kembali
        </button>
        <div style={card({ padding: '40px', textAlign: 'center' })}>
          <Icon name="alertcircle" size={32} color="#F87171" style={{ display: 'block', margin: '0 auto 12px' }}/>
          <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 16, fontWeight: 800, color: '#16243A' }}>Produk tidak ditemukan</div>
          <p style={{ fontSize: 13, color: '#9AA0AC', marginTop: 6 }}>{error || 'Data produk tidak tersedia.'}</p>
        </div>
      </div>
    );
  }

  const catK = catKey(product.category);
  const cat  = { ...CATEGORIES[catK] || CATEGORIES.general, key: catK };
  const co   = COMPANIES[companyCode] || { label: companyCode, short: companyCode, bg: '#F3F4F6', fg: '#6B7280' };
  const accentColor = cat.strip;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#1A2330' }}>
      <style>{`
        .pdp-back:hover { background: #F4F6F9 !important; }
        .pdp-action-primary:hover { filter: brightness(1.05); }
        .pdp-action-ghost:hover { background: #F4F6F9 !important; border-color: #C7CBD4 !important; }
      `}</style>

      {/* ── breadcrumb + back ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button type="button" className="pdp-back" onClick={handleBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background .12s' }}>
          <Icon name="chevleft" size={15}/>Kembali
        </button>
        <Icon name="chevright" size={13} color="#C7CBD4"/>
        <span style={{ fontSize: 12.5, color: '#9AA0AC', cursor: 'pointer' }} onClick={handleBack}>Products &amp; Services</span>
        <Icon name="chevright" size={13} color="#C7CBD4"/>
        <span style={{ fontSize: 12.5, color: '#545B66', fontWeight: 600 }}>{product.code}</span>
      </div>

      {/* ── hero header card ── */}
      <div style={{ ...card({ overflow: 'hidden', marginBottom: 20 }) }}>
        {/* accent strip */}
        <div style={{ height: 6, background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor}99 100%)` }}/>

        <div style={{ padding: '22px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            {/* icon + SKU row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: 13, background: cat.bg, color: cat.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={cat.icon} size={22}/>
              </span>
              <div>
                <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: '#6B7280', background: '#F2F3F6', padding: '3px 8px', borderRadius: 6 }}>
                  {product.code}
                </span>
              </div>
            </div>

            {/* product name */}
            <h1 style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 22, fontWeight: 900, color: '#16243A', letterSpacing: -.5, margin: '0 0 10px', lineHeight: 1.25 }}>
              {product.name}
            </h1>

            {/* badges row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TypeBadge isService={product.is_service}/>
              <StatusPill active={product.is_active}/>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: .3, padding: '4px 10px', borderRadius: 20, background: co.bg, color: co.fg }}>
                <Icon name="building" size={11}/>{co.short}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: cat.bg, color: cat.fg }}>
                <Icon name={cat.icon} size={11}/>{cat.label}
              </span>
            </div>
          </div>

          {/* price hero */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9AA0AC', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Harga Dasar</div>
            <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 30, fontWeight: 900, color: product.default_price ? NAVY : '#C2C7D0', letterSpacing: -1, lineHeight: 1 }}>
              {product.default_price ? rp(product.default_price) : '–'}
            </div>
            {product.unit && (
              <div style={{ fontSize: 12, color: '#9AA0AC', marginTop: 4 }}>{unitLabel(product.unit)}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── adaptive layout ── */}
      {product.is_service
        ? <ServiceLayout  product={product} cat={cat} co={co}/>
        : <PhysicalLayout product={product} cat={cat} co={co}/>
      }
    </div>
  );
}

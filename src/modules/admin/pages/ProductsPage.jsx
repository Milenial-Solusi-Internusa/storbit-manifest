// src/modules/admin/pages/ProductsPage.jsx
// Products & Services master data — Nexus by MSI
// Design: Lovable handoff (ro_eqH_zrKelIoxzZtptgA)
// Supabase: fetches from products JOIN companies; falls back to mock data if empty.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useDebounce } from '../../../hooks/useDebounce';

/* ── brand tokens ─────────────────────────────────────────────────────────── */
const NAVY   = '#1B4D8A';
const ORANGE = '#E85A1E';

/* ── inline lucide paths (design-exact icon set) ─────────────────────────── */
const ICONS = {
  chevright:  '<path d="m9 18 6-6-6-6"/>',
  chevdown:   '<path d="m6 9 6 6 6-6"/>',
  search:     '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus:       '<path d="M5 12h14"/><path d="M12 5v14"/>',
  building:   '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  zap:        '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  box:        '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  boxes:      '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  checkcircle:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  grid:       '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  list:       '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  pencil:     '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  eye:        '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  filter:     '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  ship:       '<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  plane:      '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  filecheck:  '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
  truck:      '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  warehouse:  '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/>',
  clipboard:  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>',
  store:      '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
  package:    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  forklift:   '<path d="M12 12H5a2 2 0 0 0-2 2v5"/><circle cx="13" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="M8 19h3"/><path d="M11 19V9c0-1.1-.9-2-2-2H6"/><path d="M16 21v-7a2 2 0 0 0-2-2h-3"/><path d="m16 9 4 4h-4"/>',
  monitor:    '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  info:       '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  check:      '<path d="M20 6 9 17l-5-5"/>',
  refresh:    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
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

/* ── company display map ─────────────────────────────────────────────────── */
const COMPANIES = {
  MSI: { label: 'MSI Group',             short: 'MSI', bg: '#EAF0F8', fg: NAVY       },
  JCI: { label: 'Jago Custom Indonesia', short: 'JCI', bg: '#E5EDF7', fg: '#1E5894'  },
  SOA: { label: 'PT Stuja Orbit Abadi',  short: 'SOA', bg: '#FBE6DA', fg: '#C8521B'  },
};
const COMPANY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'MSI', label: 'MSI Group' },
  { id: 'JCI', label: 'Jago Custom Indonesia' },
  { id: 'SOA', label: 'PT Stuja Orbit Abadi' },
];

/* ── category definitions ─────────────────────────────────────────────────── */
const CATEGORIES = {
  sea:      { label: 'Sea Freight',             icon: 'ship',      strip: '#2A6FB0', bg: '#E1ECF5', fg: '#1E5894'  },
  air:      { label: 'Air Freight',             icon: 'plane',     strip: '#1F8FBA', bg: '#E2F0F7', fg: '#1B7299'  },
  customs:  { label: 'Customs',                 icon: 'filecheck', strip: '#8A5FB0', bg: '#ECE3F4', fg: '#6E4B8C'  },
  truck:    { label: 'Trucking',                icon: 'truck',     strip: '#D2762B', bg: '#F6E8D6', fg: '#A45A22'  },
  wh:       { label: 'Warehousing',             icon: 'warehouse', strip: '#3F8A52', bg: '#E7EFE2', fg: '#2F6B3F'  },
  ppjk:     { label: 'PPJK',                    icon: 'clipboard', strip: '#5A60B5', bg: '#E6E7F6', fg: '#44488C'  },
  display:  { label: 'Display & Merchandising', icon: 'store',     strip: '#CE5187', bg: '#F8E4ED', fg: '#A63A6B'  },
  packaging:{ label: 'Packaging & Shipping',    icon: 'package',   strip: '#C49A1E', bg: '#F7EFD4', fg: '#8A6A12'  },
  whequip:  { label: 'Warehouse Equipment',     icon: 'forklift',  strip: '#2C8C8C', bg: '#DCEBEA', fg: '#1F6B6B'  },
  itequip:  { label: 'Office & IT Equipment',   icon: 'monitor',   strip: '#7A828E', bg: '#ECEDF1', fg: '#5A626E'  },
  general:  { label: 'General',                 icon: 'box',       strip: '#6B7280', bg: '#F3F4F6', fg: '#4B5563'  },
};

/* ── unit labels ─────────────────────────────────────────────────────────── */
const UNITS = {
  container: 'per container', cbm: 'per CBM', cbm_month: 'per CBM/bln',
  kg: 'per kg', trip: 'per trip', shipment: 'per shipment',
  doc: 'per dokumen', unit: 'per unit', pcs: 'per pcs',
  roll: 'per roll', box: 'per dus', lot: 'per lot',
};
function unitLabel(u) { return UNITS[u] || (u ? `per ${u}` : '—'); }

/* ── category key guesser for DB rows ────────────────────────────────────── */
const CAT_ALIASES = {
  sea: 'sea', 'sea freight': 'sea', air: 'air', 'air freight': 'air',
  customs: 'customs', ppjk: 'ppjk', truck: 'truck', trucking: 'truck',
  warehouse: 'wh', warehousing: 'wh', display: 'display', packaging: 'packaging',
  'warehouse equipment': 'whequip', 'office & it': 'itequip', 'it equipment': 'itequip',
};
function catKey(raw) {
  if (!raw) return 'general';
  const k = raw.toLowerCase().trim();
  return CAT_ALIASES[k] || (CATEGORIES[k] ? k : 'general');
}

/* ── type filter chips ───────────────────────────────────────────────────── */
const TYPE_CHIPS = [
  { id: 'all',     label: 'All' },
  { id: 'service', label: 'Services' },
  { id: 'product', label: 'Physical Products' },
];

/* ── price formatter ─────────────────────────────────────────────────────── */
const rp = (n) => (!n ? '–' : 'Rp ' + Number(n).toLocaleString('id-ID'));

/* ── mock fallback data ──────────────────────────────────────────────────── */
const MOCK_PRODUCTS = [
  { sku: 'SEA-FCL-20',   name: 'Sea Freight FCL 20ft (Door to Port)',   cat: 'sea',       company: 'MSI', unit: 'container', price: 8500000,  service: true,  active: true  },
  { sku: 'SEA-FCL-40',   name: 'Sea Freight FCL 40ft (Door to Port)',   cat: 'sea',       company: 'MSI', unit: 'container', price: 14500000, service: true,  active: true  },
  { sku: 'SEA-LCL-CBM',  name: 'Sea Freight LCL Export',                cat: 'sea',       company: 'MSI', unit: 'cbm',       price: 650000,   service: true,  active: true  },
  { sku: 'AIR-EXP-KG',   name: 'Air Freight Export (General Cargo)',    cat: 'air',       company: 'MSI', unit: 'kg',        price: 38000,    service: true,  active: true  },
  { sku: 'AIR-IMP-KG',   name: 'Air Freight Import (General Cargo)',    cat: 'air',       company: 'MSI', unit: 'kg',        price: 42000,    service: true,  active: true  },
  { sku: 'AIR-COR-KG',   name: 'Air Freight Express Courier',           cat: 'air',       company: 'MSI', unit: 'kg',        price: 65000,    service: true,  active: false },
  { sku: 'TRK-CTR-JKT',  name: 'Container Trucking Jakarta–Bandung',    cat: 'truck',     company: 'MSI', unit: 'trip',      price: 2750000,  service: true,  active: true  },
  { sku: 'TRK-LTL-DOM',  name: 'Domestic LTL Trucking',                 cat: 'truck',     company: 'MSI', unit: 'kg',        price: 4500,     service: true,  active: true  },
  { sku: 'WHS-STD-CBM',  name: 'Warehouse Storage (Ambient)',           cat: 'wh',        company: 'MSI', unit: 'cbm_month', price: 145000,   service: true,  active: true  },
  { sku: 'WHS-HDL-CBM',  name: 'Inbound / Outbound Handling',           cat: 'wh',        company: 'MSI', unit: 'cbm',       price: 85000,    service: true,  active: true  },
  { sku: 'CST-IMP-PIB',  name: 'Customs Clearance Import (PIB)',        cat: 'customs',   company: 'JCI', unit: 'doc',       price: 1850000,  service: true,  active: true  },
  { sku: 'CST-EXP-PEB',  name: 'Customs Clearance Export (PEB)',        cat: 'customs',   company: 'JCI', unit: 'doc',       price: 1250000,  service: true,  active: true  },
  { sku: 'PPJK-REG-DOC', name: 'PPJK Document Handling (Reguler)',      cat: 'ppjk',      company: 'JCI', unit: 'doc',       price: 950000,   service: true,  active: true  },
  { sku: 'PPJK-MITA',    name: 'PPJK Priority Lane (MITA)',             cat: 'ppjk',      company: 'JCI', unit: 'doc',       price: 1650000,  service: true,  active: true  },
  { sku: 'SOA-DSP-FSU',  name: 'Floor Standing Display Unit',           cat: 'display',   company: 'SOA', unit: 'unit',      price: 1850000,  service: false, active: true  },
  { sku: 'SOA-DSP-GDL',  name: 'Gondola Shelving Rack 4-Tier',          cat: 'display',   company: 'SOA', unit: 'unit',      price: 2450000,  service: false, active: true  },
  { sku: 'SOA-PKG-BOX',  name: 'Corrugated Carton Box 60×40×40',        cat: 'packaging', company: 'SOA', unit: 'pcs',       price: 12500,    service: false, active: true  },
  { sku: 'SOA-PKG-FLM',  name: 'Stretch Wrap Film 500mm',               cat: 'packaging', company: 'SOA', unit: 'roll',      price: 68000,    service: false, active: true  },
  { sku: 'SOA-EQP-HPT',  name: 'Hand Pallet Truck 3 Ton',               cat: 'whequip',   company: 'SOA', unit: 'unit',      price: 3950000,  service: false, active: true  },
  { sku: 'SOA-ITE-LPT',  name: 'Notebook Business 14" Core i5',         cat: 'itequip',   company: 'SOA', unit: 'unit',      price: 12500000, service: false, active: true  },
  { sku: 'SOA-ITE-PRN',  name: 'Thermal Label Printer',                  cat: 'itequip',   company: 'SOA', unit: 'unit',      price: 3450000,  service: false, active: true  },
];

/* ── style tokens ─────────────────────────────────────────────────────────── */
const P = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", color: '#1A2330' },
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 18, flexWrap: 'wrap' },
  crumbs: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#9AA0AC', marginBottom: 8 },
  crumbCur: { color: '#545B66', fontWeight: 600 },
  title: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: 0 },
  sub: { fontSize: 13, color: '#7A828E', marginTop: 4 },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 17px', borderRadius: 11, border: '1px solid ' + ORANGE, background: ORANGE, color: '#fff', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(232,90,30,.25), 0 6px 16px rgba(232,90,30,.18)', transition: 'filter .15s ease, transform .15s ease' },
  tabsRow: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18, flexWrap: 'wrap' },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s ease' },
  tabActive: { background: NAVY, borderColor: NAVY, color: '#fff', boxShadow: '0 1px 2px rgba(20,70,130,.25), 0 6px 14px rgba(20,70,130,.16)' },
  tabCount: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 20, lineHeight: 1.6 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 20 },
  statCard: { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 2px rgba(20,40,70,.04), 0 4px 14px rgba(20,40,70,.03)' },
  statTop: { display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 },
  statIco: { width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 40px' },
  statLbl: { fontSize: 11.5, fontWeight: 600, color: '#7A828E', letterSpacing: 0.1 },
  statVal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 28, fontWeight: 800, color: '#16243A', letterSpacing: -0.8, lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: 6 },
  statUnit: { fontSize: 13, fontWeight: 600, color: '#9AA0AC' },
  miniSeg: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600 },
  miniCount: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: -0.4 },
  coBadge: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, letterSpacing: 0.3, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' },
  filterBar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  searchWrap: { position: 'relative', flex: '1 1 260px', maxWidth: 360 },
  searchIco: { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' },
  searchInput: { width: '100%', height: 42, borderRadius: 11, border: '1px solid #E3E5EA', background: '#fff', padding: '0 14px 0 40px', fontFamily: 'inherit', fontSize: 13.5, color: '#1A2330', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(20,40,70,.03)' },
  chipGroup: { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #E3E5EA', borderRadius: 11, padding: 4, boxShadow: '0 1px 2px rgba(20,40,70,.03)' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: '#5A626E', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .13s ease' },
  chipActive: { background: '#EAF0F8', color: NAVY, borderColor: '#D3E0F0' },
  selectWrap: { position: 'relative', flex: '0 0 auto' },
  select: { height: 42, borderRadius: 11, border: '1px solid #E3E5EA', background: '#fff', padding: '0 38px 0 40px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#16243A', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', boxShadow: '0 1px 2px rgba(20,40,70,.03)', maxWidth: 240 },
  viewToggle: { display: 'inline-flex', alignItems: 'center', gap: 3, background: '#fff', border: '1px solid #E3E5EA', borderRadius: 11, padding: 4, boxShadow: '0 1px 2px rgba(20,40,70,.03)' },
  viewBtn: { width: 36, height: 34, borderRadius: 8, border: 0, background: 'transparent', color: '#9AA0AC', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .13s ease' },
  viewBtnActive: { background: NAVY, color: '#fff' },
  countLine: { fontSize: 12.5, color: '#7A828E', marginBottom: 14, fontWeight: 500 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(284px, 1fr))', gap: 16 },
  card: { position: 'relative', background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,40,70,.04)', transition: 'box-shadow .18s ease, transform .16s ease, border-color .15s ease', display: 'flex', flexDirection: 'column' },
  cardStrip: { height: 5, width: '100%', flex: '0 0 5px' },
  cardBody: { padding: '15px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 },
  cardTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 },
  skuBadge: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, fontWeight: 700, color: '#6B7280', background: '#F2F3F6', padding: '3px 8px', borderRadius: 6, letterSpacing: 0.2, whiteSpace: 'nowrap' },
  prodName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 15, fontWeight: 800, color: '#16243A', letterSpacing: -0.2, lineHeight: 1.3, minHeight: 39 },
  metaRow: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, flexWrap: 'wrap' },
  catBadge: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 20, whiteSpace: 'nowrap' },
  unitBadge: { display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontWeight: 600, color: '#7A828E', background: '#F4F5F7', padding: '4px 9px', borderRadius: 20, whiteSpace: 'nowrap' },
  priceRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 14 },
  priceVal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 21, fontWeight: 800, color: '#1B4D8A', letterSpacing: -0.6, lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  priceMuted: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 21, fontWeight: 800, color: '#C2C7D0', letterSpacing: -0.6, lineHeight: 1 },
  typeChip: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '4px 9px 4px 7px', borderRadius: 20, whiteSpace: 'nowrap' },
  svcChip: { background: '#FBE6DA', color: '#C8521B' },
  prodChip: { background: '#EEF0F3', color: '#6B7280' },
  quickWrap: { position: 'absolute', top: 13, right: 13, display: 'flex', gap: 6, pointerEvents: 'none' },
  quickBtn: { width: 30, height: 30, borderRadius: 8, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(20,40,70,.12)' },
  inactiveTag: { position: 'absolute', top: 13, left: 13, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#9AA0AC', background: 'rgba(255,255,255,.92)', border: '1px solid #E3E5EA', padding: '3px 8px', borderRadius: 6 },
  tableCard: { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,40,70,.04), 0 4px 14px rgba(20,40,70,.03)' },
  tableScroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 920 },
  th: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9AA0AC', background: '#FAFBFC', borderBottom: '1px solid #F0F1F4', padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '13px 16px', borderBottom: '1px solid #F4F5F7', fontSize: 12.5, color: '#1A2330', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  empty: { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 16, padding: '56px 28px', textAlign: 'center', boxShadow: '0 1px 2px rgba(20,40,70,.04)' },
  emptyIco: { width: 78, height: 78, borderRadius: 22, background: '#F2F4F7', color: '#B6BCC6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 17, fontWeight: 800, color: '#16243A', letterSpacing: -0.3 },
  emptySub: { fontSize: 13, color: '#9AA0AC', marginTop: 7, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 },
  toast: { position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 9, background: '#16243A', color: '#fff', padding: '11px 16px', borderRadius: 11, fontSize: 13, fontWeight: 500, boxShadow: '0 12px 30px rgba(10,20,40,.28)', zIndex: 200, transition: 'opacity .2s ease, transform .2s ease', pointerEvents: 'none' },
};

/* ── small reusable pieces ───────────────────────────────────────────────── */
function StatusPill({ active }) {
  return active ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '3px 9px 3px 7px', borderRadius: 20, background: '#DEF0E4', color: '#1F8B4D' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1F8B4D' }}/>Aktif
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '3px 9px 3px 7px', borderRadius: 20, background: '#EEF0F3', color: '#9AA0AC' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B6BCC6' }}/>Nonaktif
    </span>
  );
}

function TypeChip({ service }) {
  return service ? (
    <span style={{ ...P.typeChip, ...P.svcChip }}><Icon name="zap" size={11}/>Service</span>
  ) : (
    <span style={{ ...P.typeChip, ...P.prodChip }}><Icon name="box" size={11}/>Produk</span>
  );
}

/* ── product card ────────────────────────────────────────────────────────── */
function ProductCard({ p, onAction, onSelect }) {
  const [h, setH] = useState(false);
  const cat = CATEGORIES[p.cat] || CATEGORIES.general;
  const co  = COMPANIES[p.company] || { label: p.company, short: p.company, bg: '#F3F4F6', fg: '#6B7280' };
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={() => onSelect?.(p)}
      style={{ ...P.card, opacity: p.active ? 1 : 0.82, cursor: onSelect ? 'pointer' : 'default',
        borderColor: h ? '#D3DEEC' : '#ECEDF1',
        boxShadow: h ? '0 2px 4px rgba(20,40,70,.06), 0 16px 34px rgba(20,40,70,.12)' : '0 1px 2px rgba(20,40,70,.04)',
        transform: h ? 'translateY(-3px)' : 'none' }}>
      <div style={{ ...P.cardStrip, background: cat.strip }}/>
      {!p.active && <span style={P.inactiveTag}>Nonaktif</span>}
      <div style={{ ...P.quickWrap, opacity: h ? 1 : 0, transform: h ? 'translateY(0)' : 'translateY(-4px)', pointerEvents: h ? 'auto' : 'none' }}>
        <button type="button" title="Edit" style={P.quickBtn} onClick={e => { e.stopPropagation(); onAction('Edit', p); }}><Icon name="pencil" size={15}/></button>
        <button type="button" title="Detail" style={P.quickBtn} onClick={e => { e.stopPropagation(); onSelect?.(p); }}><Icon name="eye" size={15}/></button>
      </div>
      <div style={P.cardBody}>
        <div style={P.cardTopRow}>
          <span style={P.skuBadge}>{p.sku}</span>
          <span style={{ ...P.coBadge, background: co.bg, color: co.fg }}><Icon name="building" size={10}/>{co.short}</span>
        </div>
        <div style={P.prodName}>{p.name}</div>
        <div style={P.metaRow}>
          <span style={{ ...P.catBadge, background: cat.bg, color: cat.fg }}><Icon name={cat.icon} size={12}/>{cat.label}</span>
          <span style={P.unitBadge}>{unitLabel(p.unit)}</span>
        </div>
        <div style={P.priceRow}>
          <span style={p.price ? P.priceVal : P.priceMuted}>{rp(p.price)}</span>
          <TypeChip service={p.service}/>
        </div>
      </div>
    </div>
  );
}

/* ── table row ───────────────────────────────────────────────────────────── */
function TableRow({ p, onAction, onSelect }) {
  const [h, setH] = useState(false);
  const cat = CATEGORIES[p.cat] || CATEGORIES.general;
  const co  = COMPANIES[p.company] || { label: p.company, short: p.company, bg: '#F3F4F6', fg: '#6B7280' };
  return (
    <tr onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={() => onSelect?.(p)}
      style={{ background: h ? '#FAFBFC' : 'transparent', transition: 'background .12s ease', cursor: onSelect ? 'pointer' : 'default' }}>
      <td style={P.td}><span style={P.skuBadge}>{p.sku}</span></td>
      <td style={{ ...P.td, whiteSpace: 'normal', minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, flex: '0 0 8px', background: cat.strip }}/>
          <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 700, fontSize: 13, color: '#16243A', letterSpacing: -0.1 }}>{p.name}</span>
        </div>
      </td>
      <td style={P.td}><span style={{ ...P.catBadge, background: cat.bg, color: cat.fg }}><Icon name={cat.icon} size={12}/>{cat.label}</span></td>
      <td style={{ ...P.td, color: '#6B7280' }}>{unitLabel(p.unit)}</td>
      <td style={{ ...P.td, textAlign: 'right' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 12.5, color: p.price ? '#1B4D8A' : '#C2C7D0', fontVariantNumeric: 'tabular-nums' }}>{rp(p.price)}</span>
      </td>
      <td style={P.td}><TypeChip service={p.service}/></td>
      <td style={P.td}><span style={{ ...P.coBadge, background: co.bg, color: co.fg }}><Icon name="building" size={10}/>{co.short}</span></td>
      <td style={P.td}><StatusPill active={p.active}/></td>
      <td style={{ ...P.td, textAlign: 'right' }}>
        <button type="button" title="Edit" style={P.quickBtn} onClick={e => { e.stopPropagation(); onAction('Edit', p); }}><Icon name="pencil" size={15}/></button>
      </td>
    </tr>
  );
}

/* ── stat card ───────────────────────────────────────────────────────────── */
function StatCard({ icon, iconBg, iconFg, label, children }) {
  return (
    <div style={P.statCard}>
      <div style={P.statTop}>
        <span style={{ ...P.statIco, background: iconBg, color: iconFg }}><Icon name={icon} size={20}/></span>
        <span style={P.statLbl}>{label}</span>
      </div>
      {children}
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────────────── */
export default function ProductsPage({ onSelectProduct }) {
  const [company, setCompany] = useState('all');
  const [searchInput, setSearchInput]   = useState('');
  const search = useDebounce(searchInput, 300);
  const [type, setType]   = useState('all');
  const [cat, setCat]     = useState('all');
  const [view, setView]   = useState('grid');
  const [toast, setToast] = useState({ show: false, msg: '', icon: 'check' });

  // ── Supabase data ──────────────────────────────────────────────────────────
  const [dbProducts, setDbProducts] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Fetch companies first to build a reliable id → code map,
    // then fetch products using company_id directly (no join dependency).
    Promise.all([
      supabase.from('companies').select('id, code').eq('is_active', true),
      supabase
        .from('products')
        .select('id, code, name, category, unit, is_service, default_price, is_active, company_id')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(1000),
    ]).then(([{ data: cos }, { data: prods, error: prodsErr }]) => {
      if (cancelled) return;

      // Build lookup: company uuid → short code (MSI / JCI / SOA)
      const codeById = Object.fromEntries(
        (cos || []).map(c => [c.id, c.code])
      );

      if (!prodsErr && prods && prods.length > 0) {
        const mapped = prods.map(r => ({
          id:      r.id,
          sku:     r.code,
          name:    r.name,
          cat:     catKey(r.category),
          company: codeById[r.company_id] || 'MSI', // match by code, not name
          unit:    r.unit || 'unit',
          price:   Number(r.default_price) || 0,
          service: r.is_service,
          active:  r.is_active,
        }));
        setDbProducts(mapped);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [refreshKey]);

  // use real data if available, else mock
  const PRODUCTS = dbProducts.length > 0 ? dbProducts : MOCK_PRODUCTS;

  // ── helpers ────────────────────────────────────────────────────────────────
  const fireToast = useCallback((msg, icon) => {
    setToast({ show: true, msg, icon: icon || 'check' });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2200);
  }, []);

  const onAction = useCallback((kind, p) => {
    fireToast(`${kind} · ${p.name} (mock)`, kind === 'Edit' ? 'pencil' : 'eye');
  }, [fireToast]);

  // ── stats (full catalog, not filtered) ────────────────────────────────────
  const totalCount  = PRODUCTS.length;
  const activeCount = PRODUCTS.filter(p => p.active).length;
  const byCompany   = useMemo(() => {
    const m = { MSI: 0, JCI: 0, SOA: 0 };
    PRODUCTS.forEach(p => { if (m[p.company] !== undefined) m[p.company]++; });
    return m;
  }, [PRODUCTS]);

  const companyTabCount = (id) => id === 'all' ? PRODUCTS.length : PRODUCTS.filter(p => p.company === id).length;

  // ── filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRODUCTS.filter(p => {
      if (company !== 'all' && p.company !== company) return false;
      if (type === 'service' && !p.service) return false;
      if (type === 'product' && p.service)  return false;
      if (cat !== 'all' && p.cat !== cat)   return false;
      if (!q) return true;
      const catLabel = (CATEGORIES[p.cat] || CATEGORIES.general).label.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || catLabel.includes(q);
    });
  }, [PRODUCTS, company, search, type, cat]);

  const resetFilters = () => { setSearchInput(''); setType('all'); setCat('all'); setCompany('all'); };

  const isMock = dbProducts.length === 0 && !loading;

  return (
    <div style={P.root}>
      <style>{`
        .pp-primary:hover{filter:brightness(1.05);transform:translateY(-1px);}
        .pp-tab:hover{border-color:#C7CBD4;}
        .pp-tab-active:hover{filter:brightness(1.06);}
        .pp-chip:hover{background:#F4F6F9;}
        .pp-view:hover{color:#5A626E;}
        .pp-quick:hover{border-color:${NAVY};color:${NAVY};background:#F3F7FC;}
        select:focus,input[type=text]:focus{outline:none;border-color:${NAVY};box-shadow:0 0 0 3px rgba(20,70,130,.10);}
        @media(max-width:720px){.pp-stats{grid-template-columns:1fr !important;}}
      `}</style>

      {/* header */}
      <div style={P.topRow}>
        <div>
          <nav style={P.crumbs}>
            <span>Home</span><Icon name="chevright" size={13}/>
            <span>Master Data</span><Icon name="chevright" size={13}/>
            <span style={P.crumbCur}>Products &amp; Services</span>
          </nav>
          <h1 style={P.title}>Products &amp; Services</h1>
          <div style={P.sub}>
            Katalog produk dan layanan per entitas bisnis
            {isMock && <span style={{ marginLeft: 10, fontSize: 11, color: '#C49A1E', fontWeight: 600, background: '#FEF9E7', padding: '2px 8px', borderRadius: 6, border: '1px solid #F0DDA0' }}>Mock data — belum ada data di Supabase</span>}
            {loading && <span style={{ marginLeft: 10, fontSize: 11, color: '#9AA0AC' }}>Memuat…</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" title="Refresh" style={{ height: 42, width: 42, borderRadius: 11, border: '1px solid #E3E5EA', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7A828E' }}
            onClick={() => setRefreshKey(k => k + 1)}>
            <Icon name="refresh" size={16}/>
          </button>
          <button type="button" className="pp-primary" style={P.primaryBtn} onClick={() => fireToast('Form tambah produk (mock)', 'plus')}>
            <Icon name="plus" size={17}/>Tambah Produk
          </button>
        </div>
      </div>

      {/* company tabs */}
      <div style={P.tabsRow}>
        {COMPANY_TABS.map(t => {
          const on = company === t.id;
          return (
            <button key={t.id} type="button"
              className={on ? 'pp-tab-active' : 'pp-tab'}
              style={{ ...P.tab, ...(on ? P.tabActive : null) }}
              onClick={() => setCompany(t.id)}>
              {t.id !== 'all' && <Icon name="building" size={13}/>}
              {t.label}
              <span style={{ ...P.tabCount, background: on ? 'rgba(255,255,255,.2)' : '#F0F2F5', color: on ? '#fff' : '#9AA0AC' }}>
                {companyTabCount(t.id)}
              </span>
            </button>
          );
        })}
      </div>

      {/* stats */}
      <div style={P.statsRow} className="pp-stats">
        <StatCard icon="boxes" iconBg="#EAF0F8" iconFg={NAVY} label="Total Produk & Layanan">
          <div style={P.statVal}>{totalCount}<span style={P.statUnit}>item katalog</span></div>
        </StatCard>
        <StatCard icon="checkcircle" iconBg="#DEF0E4" iconFg="#1F8B4D" label="Aktif">
          <div style={P.statVal}>{activeCount}<span style={P.statUnit}>/ {totalCount} aktif</span></div>
        </StatCard>
        <StatCard icon="building" iconBg="#FBE6DA" iconFg="#C8521B" label="Per Entitas Bisnis">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 2 }}>
            {Object.keys(byCompany).map(k => (
              <div key={k} style={P.miniSeg}>
                <span style={{ ...P.miniCount, color: COMPANIES[k].fg }}>{byCompany[k]}</span>
                <span style={{ ...P.coBadge, background: COMPANIES[k].bg, color: COMPANIES[k].fg }}>{COMPANIES[k].short}</span>
              </div>
            ))}
          </div>
        </StatCard>
      </div>

      {/* filter bar */}
      <div style={P.filterBar}>
        <div style={P.searchWrap}>
          <span style={P.searchIco}><Icon name="search" size={17}/></span>
          <input
            type="text"
            style={P.searchInput}
            placeholder="Cari produk atau SKU…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>

        <div style={P.chipGroup}>
          {TYPE_CHIPS.map(c => {
            const on = type === c.id;
            return (
              <button key={c.id} type="button" className="pp-chip"
                style={{ ...P.chip, ...(on ? P.chipActive : null) }}
                onClick={() => setType(c.id)}>
                {c.id === 'service' && <Icon name="zap" size={12}/>}
                {c.id === 'product' && <Icon name="box" size={12}/>}
                {c.label}
              </button>
            );
          })}
        </div>

        <div style={P.selectWrap}>
          <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' }}>
            <Icon name="filter" size={15}/>
          </span>
          <select style={P.select} value={cat} onChange={e => setCat(e.target.value)}>
            <option value="all">Semua Kategori</option>
            {Object.keys(CATEGORIES).map(k => (
              <option key={k} value={k}>{CATEGORIES[k].label}</option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' }}>
            <Icon name="chevdown" size={15}/>
          </span>
        </div>

        <div style={{ flex: 1 }}/>

        <div style={P.viewToggle}>
          <button type="button" className="pp-view" title="Tampilan grid"
            style={{ ...P.viewBtn, ...(view === 'grid' ? P.viewBtnActive : null) }}
            onClick={() => setView('grid')}>
            <Icon name="grid" size={17}/>
          </button>
          <button type="button" className="pp-view" title="Tampilan daftar"
            style={{ ...P.viewBtn, ...(view === 'list' ? P.viewBtnActive : null) }}
            onClick={() => setView('list')}>
            <Icon name="list" size={17}/>
          </button>
        </div>
      </div>

      {/* count line */}
      <div style={P.countLine}>
        Menampilkan <b style={{ color: '#16243A' }}>{filtered.length}</b> dari {PRODUCTS.length} item
        {company !== 'all' && <span> · {COMPANIES[company]?.label || company}</span>}
      </div>

      {/* content */}
      {filtered.length === 0 ? (
        <div style={P.empty}>
          <div style={P.emptyIco}><Icon name="boxes" size={36}/></div>
          <div style={P.emptyTitle}>Tidak ada produk yang cocok</div>
          <div style={P.emptySub}>Coba ubah kata kunci pencarian atau reset filter untuk melihat seluruh katalog produk &amp; layanan.</div>
          <button type="button" className="pp-primary" style={{ ...P.primaryBtn, marginTop: 20 }} onClick={resetFilters}>
            <Icon name="filter" size={16}/>Reset Filter
          </button>
        </div>
      ) : view === 'grid' ? (
        <div style={P.grid}>
          {filtered.map(p => <ProductCard key={p.sku || p.id} p={p} onAction={onAction} onSelect={onSelectProduct}/>)}
        </div>
      ) : (
        <div style={P.tableCard}>
          <div style={P.tableScroll}>
            <table style={P.table}>
              <thead>
                <tr>
                  <th style={P.th}>SKU</th>
                  <th style={P.th}>Nama</th>
                  <th style={P.th}>Kategori</th>
                  <th style={P.th}>Unit</th>
                  <th style={{ ...P.th, textAlign: 'right' }}>Harga</th>
                  <th style={P.th}>Tipe</th>
                  <th style={P.th}>Entitas</th>
                  <th style={P.th}>Status</th>
                  <th style={{ ...P.th, textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => <TableRow key={p.sku || p.id} p={p} onAction={onAction} onSelect={onSelectProduct}/>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* toast */}
      <div style={{ ...P.toast, opacity: toast.show ? 1 : 0, transform: toast.show ? 'translateY(0)' : 'translateY(8px)' }}>
        <Icon name={toast.icon} size={17} color="#8FCB8C"/><span>{toast.msg}</span>
      </div>
    </div>
  );
}

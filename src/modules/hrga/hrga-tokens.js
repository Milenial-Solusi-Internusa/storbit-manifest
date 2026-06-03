// src/modules/hrga/hrga-tokens.js
// Non-component exports: design tokens, configs, formatters, CSS string.
// Imported by HrgaShared.jsx and all HRGA pages.

export const D = {
  bg:          '#F6EFE3',
  bgAlt:       '#EFE6D4',
  surface:     '#FFFDF8',
  surface2:    '#FBF6EC',
  ink:         '#23291E',
  inkSoft:     '#5E6553',
  inkFaint:    '#8A8E7C',
  line:        '#E7DCC8',
  lineSoft:    '#F0E7D6',
  accent:      '#2F6B3F',
  accentInk:   '#235031',
  accentSoft:  '#E7EFE2',
  ok:          '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:        '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:      '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:        '#2A5B8C', infoBg:'#E1ECF5', infoBd:'#BAD2E6',
  neutral:     '#6B6F5E', neutralBg:'#EEE9DC', neutralBd:'#DDD3BE',
  msi:         '#2F6B3F', msiBg:'#E7EFE2',
  jci:         '#2A5B8C', jciBg:'#E1ECF5',
  sbi:         '#9A5B2C', sbiBg:'#F4E7D8',
  shadow:      '0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)',
  shadowSm:    '0 1px 2px rgba(40,34,18,.06)',
};

export const STATUS_HRGA = {
  draft:       { label: 'Draft',       type: 'neutral' },
  submitted:   { label: 'Submitted',   type: 'info'    },
  in_progress: { label: 'In Progress', type: 'warn'    },
  approved:    { label: 'Approved',    type: 'ok'      },
  rejected:    { label: 'Rejected',    type: 'danger'  },
  cancelled:   { label: 'Cancelled',   type: 'neutral' },
  completed:   { label: 'Completed',   type: 'ok'      },
  archived:    { label: 'Arsip',       type: 'neutral' },
};

// Matches DB category_code values from hrga_request_types
// Icons are imported where needed — this file exports only string identifiers
export const CATEGORY_CONFIG_DATA = {
  ADM: { label: 'Administrasi & Dokumen', bg:'#E1ECF5', color:'#2A5B8C', bd:'#BAD2E6' },
  AST: { label: 'Aset & Perlengkapan',   bg:'#ECE3F4', color:'#6E4B8C', bd:'#D6C6E4' },
  FAC: { label: 'Fasilitas & Gedung',    bg:'#DCEBEA', color:'#1F6B6B', bd:'#B6D4D2' },
  FIN: { label: 'Keuangan',              bg:'#F4E6D6', color:'#A45A22', bd:'#E4C9A8' },
  TRV: { label: 'Perjalanan Dinas',      bg:'#ECE1D2', color:'#6B4A2C', bd:'#D9C4A8' },
  HRD: { label: 'HRD',                  bg:'#EEE9DC', color:'#6B6F5E', bd:'#DDD3BE' },
};

export const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
};
export const fmtDateLong = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
};
export const fmtRupiah = (n) => {
  if (n == null || n === '') return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
};
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
};
export const initials = (name) =>
  (name || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const AV_COLORS = ['#2F6B3F','#2A5B8C','#9A5B2C','#6B6F5E','#7A4E8C','#1F6B6B','#8C6B1A'];
export const avatarBg = (name) =>
  AV_COLORS[(initials(name).charCodeAt(0) || 0) % AV_COLORS.length];

export const HRGA_TABLE_CSS = `
  .hg-tbl { width:100%;border-collapse:collapse }
  .hg-tbl th { padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;
    letter-spacing:.4px;color:#8A8E7C;border-bottom:1px solid #E7DCC8;background:#FFFDF8;
    white-space:nowrap;text-align:left }
  .hg-tbl td { padding:9px 12px;font-size:13px;border-bottom:1px solid #F0E7D6;color:#23291E;vertical-align:middle }
  .hg-tbl tr:last-child td { border-bottom:none }
  .hg-tbl tr:hover td { background:#FBF6EC }
  .hg-tbl th.stick-l,.hg-tbl td.stick-l { position:sticky;left:0;z-index:2;background:#FFFDF8 }
  .hg-tbl thead th.stick-l { z-index:3 }
  .hg-tbl tr:hover td.stick-l { background:#FBF6EC }
  .hg-tbl th.stick-r,.hg-tbl td.stick-r { position:sticky;right:0;z-index:2;background:#FFFDF8;box-shadow:-6px 0 10px -8px rgba(40,34,18,.18) }
  .hg-tbl thead th.stick-r { z-index:3 }
  .hg-tbl tr:hover td.stick-r { background:#FBF6EC }
  .keper-cell { display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:260px;font-size:12.5px;line-height:1.4 }
  .due-soon { color:#B23227;font-weight:700 }
  .row-urgent td { background:#FBF1DC!important }
  .row-urgent:hover td { background:#F7EAC9!important }
  .qa-approve { background:#2F6B3F!important;border-color:#2F6B3F!important;color:#fff!important }
  .qa-approve:hover { background:#235031!important }
  .qa-reject { color:#B23227!important;border-color:#E6BBB2!important }
  .qa-reject:hover { background:#F6E0DB!important }
`;

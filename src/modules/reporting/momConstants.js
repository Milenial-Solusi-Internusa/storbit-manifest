// src/modules/reporting/momConstants.js
// Shared MOM option maps + helpers (no JSX). Values match the DB CHECK
// constraints on meeting_moms / mom_action_plans.

export const C = {
  navy: '#144682', navyDark: '#0F3768', navySoft: '#EEF3FB',
  orange: '#E85A1E', orangeDark: '#C94D18', orangeSoft: '#FDF0E9',
  page: '#F8FAFC', card: '#FFFFFF',
  border: '#E2E8F0', borderStrong: '#CBD5E1',
  text: '#0F172A', sub: '#475569', muted: '#94A3B8',
  green: '#16A34A', amber: '#F59E0B', red: '#DC2626',
  blue: '#3B82F6', purple: '#7C3AED', gray: '#94A3B8',
};

// value = DB enum (meeting_moms_mom_type_check); label = display
export const MOM_TYPES = [
  { value: 'weekly',      label: 'Weekly Meeting' },
  { value: 'project',     label: 'Project Meeting' },
  { value: 'probation',   label: 'Probation Review' },
  { value: 'board',       label: 'Board Meeting' },
  { value: 'departmental',label: 'Departmental Meeting' },
  { value: 'adhoc',       label: 'Ad-hoc Meeting' },
];

// row status (mom_action_plans_status_check superset) — subset used in UI
export const STATUS_OPTS = [
  { value: 'done',             label: 'Done',            color: C.green },
  { value: 'on_progress',      label: 'On Progress',     color: C.blue },
  { value: 'pending',          label: 'Pending',         color: C.amber },
  { value: 'high_priority',    label: 'High Priority',   color: C.red },
  { value: 'new_initiative',   label: 'New Initiative',  color: C.purple },
  { value: 'appreciated',      label: 'Appreciated',     color: C.green },
  { value: 'need_improvement', label: 'Need Improvement',color: C.amber },
];

export const PRIORITAS_OPTS = [
  { value: 'high',   label: 'High',   color: C.red },
  { value: 'medium', label: 'Medium', color: C.amber },
  { value: 'low',    label: 'Low',    color: C.green },
];

// MOM document status (meeting_moms_status_check)
export const MOM_STATUS_META = {
  draft:     { label: 'Draft',     color: '#94A3B8' },
  submitted: { label: 'Submitted', color: '#3B82F6' },
  approved:  { label: 'Approved',  color: '#16A34A' },
  rejected:  { label: 'Rejected',  color: '#DC2626' },
};

export const momTypeLabel = (v) => MOM_TYPES.find(o => o.value === v)?.label ?? (v || '—');
export const statusColor = (v) => STATUS_OPTS.find(o => o.value === v)?.color ?? C.muted;
export const statusLabel = (v) => STATUS_OPTS.find(o => o.value === v)?.label ?? (v || '—');
export const prioritasColor = (v) => PRIORITAS_OPTS.find(o => o.value === v)?.color ?? C.muted;
export const prioritasLabel = (v) => PRIORITAS_OPTS.find(o => o.value === v)?.label ?? (v || '—');

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

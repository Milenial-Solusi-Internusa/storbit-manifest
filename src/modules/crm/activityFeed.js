// src/modules/crm/activityFeed.js
// Unified CRM activity feed — merges recent events from accounts (prospect baru),
// inquiries, quotations, activities, and user_login_logs (login) into one
// chronological list (newest first).
// Read-only; scoping mirrors the CRM list pages (company_id always unless
// isAllEntities; sales see only their own via created_by / assigned_to).
// EXCEPTION: user_login_logs has no company_id — it relies entirely on its own
// RLS (manager+/super_admin/own), so NO manual company/owner filter is applied.
//
// ⚠️ FK embed names verified against supabase/schema_snapshot.sql. They keep their
// OWN table prefix (NOT the accounts-table 'prospects_*' legacy names):
//   inquiries_prospect_id_fkey, inquiries_customer_id_fkey,
//   quotations_prospect_id_fkey, quotations_customer_id_fkey,
//   activities_account_id_fkey.
import { supabase } from '../../lib/supabase';

// Activity sub-type → display label (+ 'login' for the user_login_logs source).
export const FEED_ACT_LABEL = {
  call: 'Call', whatsapp: 'WhatsApp', visit: 'Visit',
  meeting: 'Meeting', email: 'Email', followup: 'Follow-up', login: 'Login',
};
// Activity sub-type → Lucide icon name (ActivityLogPage maps name → component).
const FEED_ACT_ICON = {
  call: 'Phone', whatsapp: 'MessageCircle', visit: 'MapPin',
  meeting: 'Users', email: 'Mail', followup: 'CornerUpRight', login: 'LogIn',
};

export function feedTimeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0)     return 'baru saja';
  if (diff < 60)    return `${diff} detik lalu`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}
export function feedFmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Returns unified events sorted newest-first. Each event:
//   { id, timestamp, type, actType, title, subtitle, user_id, user_name, icon }
// type ∈ prospect | inquiry | quotation | activity. Never throws — a failed source
// (e.g. RLS/embed error) just contributes no events.
export async function fetchActivityFeed({ companyId, uid, isAllEntities, isSalesOnly }) {
  const scopeCo = (q) => (isAllEntities ? q : q.eq('company_id', companyId));

  const accountsQ = (() => {
    let q = supabase.from('accounts')
      .select('id, name, created_at, created_by, assigned_to')
      .eq('account_status', 'prospect')
      .is('deleted_at', null);
    q = scopeCo(q);
    if (isSalesOnly) q = q.or(`assigned_to.eq.${uid},created_by.eq.${uid}`);
    return q.order('created_at', { ascending: false }).limit(1000);
  })();

  const inquiriesQ = (() => {
    let q = supabase.from('inquiries')
      .select('id, inquiry_no, created_at, created_by, prospect:accounts!inquiries_prospect_id_fkey(name), customer:accounts!inquiries_customer_id_fkey(name)')
      .is('deleted_at', null);
    q = scopeCo(q);
    if (isSalesOnly) q = q.eq('created_by', uid);
    return q.order('created_at', { ascending: false }).limit(1000);
  })();

  const quotationsQ = (() => {
    let q = supabase.from('quotations')
      .select('id, quotation_no, created_at, created_by, prospect:accounts!quotations_prospect_id_fkey(name), customer:accounts!quotations_customer_id_fkey(name)')
      .is('deleted_at', null);
    q = scopeCo(q);
    if (isSalesOnly) q = q.eq('created_by', uid);
    return q.order('created_at', { ascending: false }).limit(1000);
  })();

  const activitiesQ = (() => {
    let q = supabase.from('activities')
      .select('id, type, scheduled_for, created_at, created_by, assigned_to, contact_name, prospect_name, account:accounts!activities_account_id_fkey(name)')
      .is('deleted_at', null);
    q = scopeCo(q);
    if (isSalesOnly) q = q.or(`assigned_to.eq.${uid},created_by.eq.${uid}`);
    return q.order('created_at', { ascending: false }).limit(1000);
  })();

  // Login source — no company_id column; RLS (manager+/super_admin/own) does the
  // scoping, so NO manual company/owner filter here.
  const loginsQ = supabase.from('user_login_logs')
    .select('*')
    .order('logged_in_at', { ascending: false })
    .limit(1000);

  const [accRes, inqRes, quoRes, actRes, logRes] = await Promise.all([accountsQ, inquiriesQ, quotationsQ, activitiesQ, loginsQ]);

  const events = [];
  (accRes.data || []).forEach(r => events.push({
    id: 'acc-' + r.id, timestamp: r.created_at, type: 'prospect', actType: null,
    title: 'Prospect baru', subtitle: r.name || '(tanpa nama)',
    user_id: r.created_by || r.assigned_to || null, icon: 'UserPlus',
  }));
  (inqRes.data || []).forEach(r => events.push({
    id: 'inq-' + r.id, timestamp: r.created_at, type: 'inquiry', actType: null,
    title: 'Inquiry baru',
    subtitle: [r.inquiry_no, r.customer?.name || r.prospect?.name].filter(Boolean).join(' — ') || '—',
    user_id: r.created_by || null, icon: 'FileText',
  }));
  (quoRes.data || []).forEach(r => events.push({
    id: 'quo-' + r.id, timestamp: r.created_at, type: 'quotation', actType: null,
    title: 'Quotation baru',
    subtitle: [r.quotation_no, r.customer?.name || r.prospect?.name].filter(Boolean).join(' — ') || '—',
    user_id: r.created_by || null, icon: 'FileCheck',
  }));
  (actRes.data || []).forEach(r => events.push({
    id: 'act-' + r.id, timestamp: r.scheduled_for || r.created_at, type: 'activity', actType: r.type,
    title: FEED_ACT_LABEL[r.type] || 'Aktivitas',
    subtitle: r.account?.name || r.contact_name || r.prospect_name || '—',
    user_id: r.assigned_to || r.created_by || null, icon: FEED_ACT_ICON[r.type] || 'Activity',
  }));
  (logRes.data || []).forEach(r => events.push({
    id: 'login-' + r.id, timestamp: r.logged_in_at, type: 'login', actType: null,
    title: 'Login', subtitle: '',   // filled with the user name after nameMap resolves
    user_id: r.user_id || null, icon: 'LogIn',
  }));

  // Resolve user names (no FK to profiles on these columns). All ids, no active
  // filter, so inactive/legacy users still resolve. Login user_ids are included.
  const ids = [...new Set(events.map(e => e.user_id).filter(Boolean))];
  const nameMap = {};
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
  }
  events.forEach(e => {
    e.user_name = e.user_id ? (nameMap[e.user_id] || null) : null;
    if (e.type === 'login') e.subtitle = e.user_name || 'Pengguna';
  });

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events;
}

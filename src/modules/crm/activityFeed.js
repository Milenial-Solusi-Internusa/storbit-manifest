// src/modules/crm/activityFeed.js
// Unified CRM activity feed — merges recent events from accounts (prospect baru),
// inquiries, quotations, activity_logs (activity lifecycle: baru/selesai/
// dibatalkan/diubah), and user_login_logs (login) into one chronological list
// (newest first).
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

// Label tahap untuk judul event 'move'. Sengaja disalin kecil di sini alih-alih
// diimpor dari CRMDashboardPage — modul data tak boleh bergantung pada halaman.
// CANCELLED ikut jalur 'move' karena ACT_META hanya punya won/lost/move.
const FEED_STAGE_LABEL = {
  OPEN: 'Open', IN_REVIEW: 'In Review', QUOTED: 'Quoted',
  NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled',
};

export function feedTimeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0)     return 'just now';
  if (diff < 60)    return `${diff} seconds ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}
export function feedFmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Returns unified events sorted newest-first. Each event:
//   { id, timestamp, type, actType, title, subtitle, user_id, user_name, icon }
// type ∈ prospect | inquiry | quotation | activity | login | won | lost | move.
// Never throws — a failed source (e.g. RLS/embed error) just contributes no events.
//
// ⚠️ MODUL INI DIPAKAI DUA HALAMAN dengan kebutuhan yang berlawanan:
//   • ActivityLogPage — log lengkap, difilter & dipaginasi DI KLIEN di atas
//     seluruh hasil, dan punya filter tipe "Login" tersendiri. Ia butuh banyak
//     baris dan butuh event login.
//   • CRMDashboardPage (kartu Recent Activity) — hanya menampilkan 7 baris
//     teratas, tak mau event login, dan mau event perubahan status.
// Karena itu perbedaannya dijadikan OPSI, bukan diubah sepihak: default di
// bawah = perilaku lama persis, sehingga ActivityLogPage tak berubah sama
// sekali. Hanya pemanggil yang meminta yang mendapat perilaku baru.
export async function fetchActivityFeed({
  companyId, uid, isAllEntities, isSalesOnly,
  limitPerSource = 1000,
  includeLogin = true,
  includeStatusChanges = false,
}) {
  const scopeCo = (q) => (isAllEntities ? q : q.eq('company_id', companyId));

  const accountsQ = (() => {
    let q = supabase.from('accounts')
      .select('id, name, created_at, created_by, assigned_to')
      // Semua akun pra-customer. TODO: hapus 'lead_pool' setelah backfill (AUDIT_CRM_FLOW.md)
      .in('lifecycle_stage', ['lead', 'mql', 'sql', 'prospect', 'lead_pool'])
      .is('deleted_at', null);
    q = scopeCo(q);
    if (isSalesOnly) q = q.or(`assigned_to.eq.${uid},created_by.eq.${uid}`);
    return q.order('created_at', { ascending: false }).limit(limitPerSource);
  })();

  const inquiriesQ = (() => {
    let q = supabase.from('inquiries')
      .select('id, inquiry_no, created_at, created_by, prospect:accounts!inquiries_prospect_id_fkey(name), customer:accounts!inquiries_customer_id_fkey(name)')
      .is('deleted_at', null);
    q = scopeCo(q);
    if (isSalesOnly) q = q.eq('created_by', uid);
    return q.order('created_at', { ascending: false }).limit(limitPerSource);
  })();

  const quotationsQ = (() => {
    let q = supabase.from('quotations')
      .select('id, quotation_no, created_at, created_by, prospect:accounts!quotations_prospect_id_fkey(name), customer:accounts!quotations_customer_id_fkey(name)')
      .is('deleted_at', null);
    q = scopeCo(q);
    if (isSalesOnly) q = q.eq('created_by', uid);
    return q.order('created_at', { ascending: false }).limit(limitPerSource);
  })();

  // Activity lifecycle events come from activity_logs (created / done / cancelled /
  // edited) — NOT the activities row directly. No company_id column → RLS (via the
  // parent activity) does the scoping, like user_login_logs, so no manual filter.
  const activityLogsQ = supabase.from('activity_logs')
    .select(`
      id, activity_id, changed_by, changed_at, from_status, to_status,
      activity:activities(type, contact_name, account:accounts(name))
    `)
    .order('changed_at', { ascending: false })
    .limit(Math.min(200, limitPerSource));

  // Login source — no company_id column; RLS (manager+/super_admin/own) does the
  // scoping, so NO manual company/owner filter here.
  const loginsQ = includeLogin
    ? supabase.from('user_login_logs')
        .select('*')
        .order('logged_in_at', { ascending: false })
        .limit(limitPerSource)
    : null;

  // Perubahan status deal (WON / LOST / pindah tahap). Sumbernya tabel audit
  // inquiry_status_history, yang RLS-nya mendelegasikan ke `inquiries`
  // (USING EXISTS ... FROM inquiries) — jadi scoping company/owner sudah
  // ditangani di DB, sama seperti activity_logs, dan TIDAK boleh ditambahi
  // filter manual di sini.
  const statusQ = includeStatusChanges
    ? supabase.from('inquiry_status_history')
        .select(`
          id, inquiry_id, from_status, to_status, changed_by, changed_at,
          inquiry:inquiries!ish_inquiry_fkey(
            inquiry_no,
            prospect:accounts!inquiries_prospect_id_fkey(name),
            customer:accounts!inquiries_customer_id_fkey(name)
          )
        `)
        .order('changed_at', { ascending: false })
        .limit(limitPerSource)
    : null;

  const [accRes, inqRes, quoRes, actRes, logRes, stsRes] = await Promise.all([
    accountsQ, inquiriesQ, quotationsQ, activityLogsQ,
    loginsQ  || Promise.resolve({ data: [] }),
    statusQ  || Promise.resolve({ data: [] }),
  ]);

  const events = [];
  (accRes.data || []).forEach(r => events.push({
    id: 'acc-' + r.id, timestamp: r.created_at, type: 'prospect', actType: null,
    title: 'New prospect', subtitle: r.name || '(unnamed)',
    user_id: r.created_by || r.assigned_to || null, icon: 'UserPlus',
  }));
  (inqRes.data || []).forEach(r => events.push({
    id: 'inq-' + r.id, timestamp: r.created_at, type: 'inquiry', actType: null,
    title: 'New inquiry',
    subtitle: [r.inquiry_no, r.customer?.name || r.prospect?.name].filter(Boolean).join(' — ') || '—',
    user_id: r.created_by || null, icon: 'FileText',
  }));
  (quoRes.data || []).forEach(r => events.push({
    id: 'quo-' + r.id, timestamp: r.created_at, type: 'quotation', actType: null,
    title: 'New quotation',
    subtitle: [r.quotation_no, r.customer?.name || r.prospect?.name].filter(Boolean).join(' — ') || '—',
    user_id: r.created_by || null, icon: 'FileCheck',
  }));
  (actRes.data || []).forEach(r => {
    const act = r.activity || {};
    const title =
      (r.from_status == null && r.to_status === 'todo') ? 'New activity' :
      r.to_status === 'done'      ? 'Activity completed' :
      r.to_status === 'cancelled' ? 'Activity cancelled' :
      r.to_status === 'edited'    ? 'Activity edited' :
      'Aktivitas';
    events.push({
      id: 'actlog-' + r.id, timestamp: r.changed_at, type: 'activity', actType: act.type,
      title,
      subtitle: act.contact_name || act.account?.name || '—',
      user_id: r.changed_by || null, icon: FEED_ACT_ICON[act.type] || 'Activity',
    });
  });
  (stsRes.data || []).forEach(r => {
    // from_status NULL = baris kelahiran inquiry, bukan perpindahan. Dilewati
    // supaya tidak menduplikasi event 'New inquiry' yang sudah ada di atas.
    if (r.from_status == null) return;
    const to = String(r.to_status || '').toUpperCase();
    const type  = to === 'WON' ? 'won' : to === 'LOST' ? 'lost' : 'move';
    const title = to === 'WON' ? 'Deal won'
                : to === 'LOST' ? 'Deal lost'
                : `Moved to ${FEED_STAGE_LABEL[to] || to}`;
    const inq = r.inquiry || {};
    events.push({
      id: 'ish-' + r.id, timestamp: r.changed_at, type, actType: null,
      title,
      subtitle: [inq.inquiry_no, inq.customer?.name || inq.prospect?.name].filter(Boolean).join(' — ') || '—',
      user_id: r.changed_by || null,
      icon: type === 'won' ? 'CheckCircle' : type === 'lost' ? 'Ban' : 'ArrowRight',
    });
  });
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
    if (e.type === 'login') e.subtitle = e.user_name || 'User';
  });

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events;
}

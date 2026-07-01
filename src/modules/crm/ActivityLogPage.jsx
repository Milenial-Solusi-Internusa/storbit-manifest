// src/modules/crm/ActivityLogPage.jsx
// Activity Log — full chronological CRM feed (prospect / inquiry / quotation /
// activity) from the unified feed (activityFeed.js). Newest first, filterable,
// client-side paginated. Read-only. Visual pattern follows ActivitiesPage.jsx.
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, History, UserPlus, FileText, FileCheck, Phone, MessageCircle,
  MapPin, Users, Mail, CornerUpRight, Activity, LogIn,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { fetchActivityFeed, feedTimeAgo, feedFmtDate } from './activityFeed';

// Resolve active 'sales' users for a company via RBAC (roles.code='sales'),
// never a hardcoded role_id (same pattern as ActivitiesPage / CRMDashboard).
async function fetchSalesProfiles(companyId) {
  const { data: roleRows } = await supabase
    .from('roles').select('id').eq('company_id', companyId).eq('code', 'sales');
  const roleIds = (roleRows || []).map(r => r.id);
  if (!roleIds.length) return [];
  const { data: urs } = await supabase
    .from('user_roles').select('user_id')
    .eq('company_id', companyId).in('role_id', roleIds)
    .eq('is_active', true).is('revoked_at', null);
  const userIds = [...new Set((urs || []).map(u => u.user_id).filter(Boolean))];
  if (!userIds.length) return [];
  const { data: profs } = await supabase
    .from('profiles').select('id, full_name').in('id', userIds)
    .eq('active', true).order('full_name').limit(1000);
  return profs || [];
}

const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  navy:      '#1B4D8A',
  accent:    '#E85A1E',
};

// Lucide icon registry (feed event.icon name → component).
const ICONS = { UserPlus, FileText, FileCheck, Phone, MessageCircle, MapPin, Users, Mail, CornerUpRight, Activity, LogIn };

// Per event-type icon-chip colours (brand tones, no dark green).
const TYPE_TONE = {
  prospect:   { bg: '#EAF0F8', fg: '#1B4D8A' },
  inquiry:    { bg: '#E5EDF7', fg: '#1E5894' },
  quotation:  { bg: '#FBE6DA', fg: '#C8521B' },
  activity:   { bg: '#EFE7F6', fg: '#7C3AED' },
  login:      { bg: '#EEF0F3', fg: '#51607A' },
};
const TYPE_FILTER = [
  { value: 'all',        label: 'Semua' },
  { value: 'prospect',   label: 'Prospect' },
  { value: 'inquiry',    label: 'Inquiry' },
  { value: 'quotation',  label: 'Quotation' },
  { value: 'activity',   label: 'Activity' },
  { value: 'login',      label: 'Login' },
];

const PAGE_SIZE = 25;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthBounds() {
  const d = new Date();
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` };
}
function weekBounds() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;          // 0 = Monday … 6 = Sunday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const f = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: f(monday), end: f(sunday) };
}

export default function ActivityLogPage({ showToast }) {
  const { profile, erpRole } = useAuth();
  const isAllEntities = erpRole === 'super_admin';
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('this_week'); // today | this_week | this_month | custom | all
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterSales, setFilterSales] = useState('all');
  const [salesOpts, setSalesOpts] = useState([]);
  const [page, setPage] = useState(0);

  const fetchFeed = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      const data = await fetchActivityFeed({
        companyId: profile.company_id, uid: profile.id, isAllEntities, isSalesOnly,
      });
      setEvents(data);
    } catch (err) {
      showToast?.('Gagal memuat activity log: ' + err.message, 'error');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, showToast]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);
  useEffect(() => { setPage(0); }, [filterType, filterDate, customFrom, customTo, filterSales]);

  // Manager+ sales dropdown (RBAC sales-only, company-scoped).
  useEffect(() => {
    if (isSalesOnly || !profile?.company_id) return;
    let cancelled = false;
    fetchSalesProfiles(profile.company_id).then(s => { if (!cancelled) setSalesOpts(s); });
    return () => { cancelled = true; };
  }, [isSalesOnly, profile?.company_id]);

  const filtered = useMemo(() => {
    let range = null;
    if (filterDate === 'today')           range = { start: todayStr(), end: todayStr() };
    else if (filterDate === 'this_week')  range = weekBounds();
    else if (filterDate === 'this_month') range = monthBounds();
    else if (filterDate === 'custom')     range = { start: customFrom || '0000-01-01', end: customTo || '9999-12-31' };

    return events.filter(e => {
      if (filterType !== 'all' && e.type !== filterType) return false;
      if (!isSalesOnly && filterSales !== 'all' && e.user_id !== filterSales) return false;
      if (range) {
        const day = (e.timestamp || '').slice(0, 10);
        if (!(day >= range.start && day <= range.end)) return false;
      }
      return true;
    });
  }, [events, filterType, filterDate, customFrom, customTo, filterSales, isSalesOnly]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const selStyle = {
    height: 34, borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.surface, padding: '0 10px', fontSize: 13, color: C.ink,
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EAF0F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <History size={20} color={C.navy} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Activity Log</h1>
          <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>Feed kronologis — prospect, inquiry, quotation &amp; aktivitas terbaru</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selStyle}>
          {TYPE_FILTER.map(o => <option key={o.value} value={o.value}>{o.label === 'Semua' ? 'Semua Tipe' : o.label}</option>)}
        </select>
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={selStyle}>
          <option value="today">Hari Ini</option>
          <option value="this_week">Minggu Ini</option>
          <option value="this_month">Bulan Ini</option>
          <option value="custom">Custom</option>
          <option value="all">Semua Tanggal</option>
        </select>
        {filterDate === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={selStyle} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={selStyle} />
          </>
        )}
        {!isSalesOnly && (
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)} style={selStyle}>
            <option value="all">Semua Sales</option>
            {salesOpts.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.inkFaint }}>
          <Search size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{filtered.length} event
        </span>
      </div>

      {/* Feed list */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint, fontSize: 13.5 }}>Memuat data…</div>
        ) : pageRows.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint, fontSize: 13.5 }}>Belum ada aktivitas pada rentang ini</div>
        ) : pageRows.map((e, i) => {
          const tone = TYPE_TONE[e.type] || TYPE_TONE.activity;
          const Ico = ICONS[e.icon] || Activity;
          return (
            <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', borderBottom: i < pageRows.length - 1 ? `1px solid ${C.lineSoft}` : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: tone.bg, color: tone.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ico size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{e.title}</div>
                <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subtitle}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                <span style={{ fontSize: 12, color: C.inkSoft }}>{feedTimeAgo(e.timestamp)}</span>
                <span style={{ fontSize: 11.5, color: C.inkFaint, fontFamily: "'IBM Plex Mono',monospace" }}>{feedFmtDate(e.timestamp)}</span>
                {e.user_name && <span style={{ fontSize: 11.5, color: C.navy, fontWeight: 600 }}>{e.user_name}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 13, color: C.inkSoft }}>
          <span>Halaman {page + 1} dari {totalPages} ({filtered.length} total)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? C.inkFaint : C.ink, fontSize: 13 }}>
              ← Prev
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? C.inkFaint : C.ink, fontSize: 13 }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

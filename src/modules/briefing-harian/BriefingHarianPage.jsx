// src/modules/briefing-harian/BriefingHarianPage.jsx
// Briefing Harian — daily task/aktivitas/insiden log, open to every logged-in
// user (public:true, same gate philosophy as BNF — see App.jsx's 'bnf' menu
// comment). Separate module from BNF on purpose (product decision): this is
// the everyday entry point every staff fills in; "insiden" entries can later
// be pulled into a BNF report by a head (Layer 2 — NOT built here).
//
// Tokens/helpers/Select/FieldLabel are deliberately copied from
// src/modules/bnf/BNFListPage.jsx rather than shared — matches this
// codebase's established practice of sibling pages duplicating small local
// pieces instead of cross-importing (see BNFOrgRolesPage.jsx's own
// initials()/NAVY/ORANGE copy for precedent).
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sunrise, ChevronDown, ClipboardList, Activity, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import CodeNamePicker from '../../components/CodeNamePicker';

const NAVY = '#0F3A66';
const NAVY_DARK = '#0A2745';
const ORANGE = '#E85A1E';
const LINE = '#E2E8F0';
const DANGER = '#DC2626';
const AMBER = '#D97706';
const SLATE = '#64748B';
const BLUE = '#2563EB';
const PURPLE = '#7C3AED';

const CATEGORIES = ['task', 'aktivitas', 'insiden'];
const CATEGORY_META = {
  task:      { label: 'Task',      color: NAVY,   icon: ClipboardList },
  aktivitas: { label: 'Aktivitas', color: BLUE,   icon: Activity },
  insiden:   { label: 'Insiden',   color: DANGER, icon: AlertTriangle },
};

const INSIDEN_RESOLUTION_LABEL = {
  pending_review: 'Menunggu review',
  resolved_internal: 'Selesai internal',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const inputCls =
  'w-full rounded-md border px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors';

function FieldLabel({ children, required }) {
  return (
    <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      {children} {required && <span style={{ color: ORANGE }}>*</span>}
    </div>
  );
}

function Select({ children, ...props }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={inputCls + ' appearance-none bg-white pr-8'}
        style={{ borderColor: LINE, fontFamily: 'inherit', ...(props.style || {}) }}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function CategoryBadge({ category }) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
    >
      <Icon size={11} strokeWidth={2.5} /> {meta.label}
    </span>
  );
}

function TaskStatusBadge({ status }) {
  const isDone = status === 'selesai';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: isDone ? '#F1F5F9' : '#FEF3E2', color: isDone ? SLATE : AMBER }}
    >
      {isDone ? 'Selesai' : 'Pending'}
    </span>
  );
}

// Status word only (Open/In Progress/Escalated/Closed), never the report
// number — bnf_reports_select RLS (is_bnf_authorized()-gated) blocks a plain
// embed join from resolving report_no for a reporter who isn't themselves
// bnf-authorized (the common case: any staff can log an insiden, but only
// heads/directors/CEO/bnf_authorized_users grantees pass is_bnf_authorized()).
// get_linked_bnf_status() is a SECURITY DEFINER RPC, already live in the DB,
// that safely returns just the linked report's status for the original
// reporter too — see its call in fetchTodayEntries below, which populates
// item.linked_bnf_status. Confirmed with Den, 2026-08-12.
const LINKED_BNF_STATUS_COLOR = { Open: BLUE, 'In Progress': AMBER, Escalated: PURPLE, Closed: SLATE };

function InsidenResolutionBadge({ item }) {
  const res = item.insiden_resolution || 'pending_review';
  if (res === 'pulled_to_bnf') {
    const status = item.linked_bnf_status;
    const color = LINKED_BNF_STATUS_COLOR[status] || NAVY;
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1A`, color }}>
        {status ? `Jadi BNF · ${status}` : 'Jadi Laporan BNF'}
      </span>
    );
  }
  const color = res === 'resolved_internal' ? SLATE : AMBER;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1A`, color }}>
      {INSIDEN_RESOLUTION_LABEL[res] || res}
    </span>
  );
}

// ============================================================================
// Tab 1 — Isi Hari Ini (create form + today's own entries, grouped by category)
// ============================================================================
function EntryRow({ item, onMarkDone, savingId }) {
  return (
    <div className="rounded-md border p-3" style={{ borderColor: LINE }}>
      <p className="text-[13px] leading-relaxed text-slate-700" style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">{item.department?.name || '—'}</span>
        {item.category === 'task' && (
          item.task_status === 'pending' ? (
            <button
              onClick={() => onMarkDone(item)}
              disabled={savingId === item.id}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              <CheckCircle2 size={12} /> {savingId === item.id ? 'Menyimpan…' : 'Selesai'}
            </button>
          ) : <TaskStatusBadge status={item.task_status} />
        )}
        {item.category === 'insiden' && <InsidenResolutionBadge item={item} />}
      </div>
    </div>
  );
}

function IsiHariIniTab({ departments, todayEntries, loading, savingId, formSaving, formError, onMarkDone, onCreate }) {
  const [category, setCategory] = useState('task');
  const [departmentText, setDepartmentText] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    const ok = await onCreate({ category, department_id: departmentId, description });
    if (ok) {
      setCategory('task');
      setDepartmentText('');
      setDepartmentId('');
      setDescription('');
    }
  };

  const grouped = CATEGORIES.map((cat) => ({
    key: cat,
    items: todayEntries.filter((e) => e.category === cat),
  }));

  return (
    <div>
      <div className="mb-6 rounded-lg border bg-white p-5" style={{ borderColor: LINE }}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Kategori</FieldLabel>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="task">Task</option>
              <option value="aktivitas">Aktivitas</option>
              <option value="insiden">Insiden</option>
            </Select>
          </div>
          <div>
            <FieldLabel required>Departemen</FieldLabel>
            <CodeNamePicker
              value={departmentText}
              items={departments}
              inputClassName={inputCls}
              inputStyle={{ borderColor: LINE }}
              placeholder="Cari / pilih departemen…"
              onChangeText={(v) => { setDepartmentText(v); setDepartmentId(''); }}
              onPick={(item) => { setDepartmentText(item.name); setDepartmentId(item.id); }}
            />
          </div>
          <div className="col-span-2">
            <FieldLabel required>Deskripsi</FieldLabel>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rencana / hasil kerja / detail kejadian…"
              className={inputCls}
              style={{ borderColor: LINE }}
            />
          </div>
        </div>

        {formError && <div className="mt-3 rounded-md p-3 text-[13px]" style={{ backgroundColor: '#FEF2F2', color: DANGER }}>{formError}</div>}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={formSaving}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: ORANGE }}
          >
            <Plus size={14} /> {formSaving ? 'Menyimpan…' : 'Tambah Entry'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[13px] text-slate-400">Memuat data…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {grouped.map((g) => (
            <div key={g.key} className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
              <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: LINE }}>
                <CategoryBadge category={g.key} />
                <span className="text-[12px] font-semibold text-slate-400">{g.items.length}</span>
              </div>
              <div className="space-y-2 p-3">
                {g.items.length === 0 ? (
                  <div className="py-6 text-center text-[12.5px] text-slate-400">Belum ada entry</div>
                ) : g.items.map((item) => (
                  <EntryRow key={item.id} item={item} onMarkDone={onMarkDone} savingId={savingId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 2 — Overview (staff: entri sendiri + umur task pending / head: rekap company)
// ============================================================================
function OverviewTab({ isAuthorized, checkingAuth, todayEntries, pendingWithAge, headData, headLoading }) {
  if (checkingAuth) {
    return <div className="py-12 text-center text-[13px] text-slate-400">Memuat…</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border bg-white" style={{ borderColor: LINE }}>
          <div className="border-b px-5 py-3 text-[13px] font-semibold text-slate-700" style={{ borderColor: LINE }}>Entry Hari Ini</div>
          <div className="space-y-2 p-4">
            {todayEntries.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400">Belum ada entry hari ini</div>
            ) : todayEntries.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-3" style={{ borderColor: LINE }}>
                <div className="min-w-0">
                  <div className="mb-1"><CategoryBadge category={item.category} /></div>
                  <p className="text-[13px] text-slate-700" style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>
                  <div className="mt-1 text-[11px] text-slate-400">{item.department?.name || '—'} · {fmtDateTime(item.created_at)}</div>
                </div>
                {item.category === 'task' && <TaskStatusBadge status={item.task_status} />}
                {item.category === 'insiden' && <InsidenResolutionBadge item={item} />}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-white" style={{ borderColor: LINE }}>
          <div className="border-b px-5 py-3 text-[13px] font-semibold text-slate-700" style={{ borderColor: LINE }}>Task Pending</div>
          <div className="space-y-2 p-4">
            {pendingWithAge.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400">Tidak ada task pending</div>
            ) : pendingWithAge.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-3" style={{ borderColor: LINE }}>
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-slate-700">{t.description}</p>
                  <div className="text-[11px] text-slate-400">{t.departmentName}</div>
                </div>
                <span className="shrink-0 text-[12px] font-semibold" style={{ color: t.days >= 3 ? DANGER : AMBER }}>
                  {t.days} hari
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {headLoading ? (
        <div className="py-12 text-center text-[13px] text-slate-400">Memuat rekap…</div>
      ) : headData.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-slate-400">Belum ada entry hari ini</div>
      ) : (
        <div className="space-y-4">
          {headData.map((dept) => (
            <div key={dept.departmentId} className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
              <div className="border-b px-5 py-3 text-[13px] font-semibold text-slate-700" style={{ borderColor: LINE }}>{dept.departmentName}</div>
              <div className="space-y-3 p-4">
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Task Pending per Orang</div>
                  {dept.people.length === 0 ? (
                    <div className="text-[12.5px] text-slate-400">Tidak ada</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dept.people.map((p) => (
                        <span key={p.name} className="rounded-md border px-2.5 py-1 text-[12px] text-slate-700" style={{ borderColor: LINE }}>
                          {p.name} · <strong>{p.count}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
                  Insiden menunggu review:
                  <strong style={{ color: dept.pendingInsiden > 0 ? DANGER : SLATE }}>{dept.pendingInsiden}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Root
// ============================================================================
export default function BriefingHarianPage({ showToast }) {
  const { profile, erpRole } = useAuth();
  const isAllEntities = ['super_admin'].includes(erpRole);
  const today = todayStr();

  const [tab, setTab] = useState('isi'); // isi | overview
  const [departments, setDepartments] = useState([]);
  // All of the user's own category='task' rows (id/entry_date/task_status/
  // description/department_id/carried_from_id only) — doubles as the source
  // for carry-forward chain-end detection AND the Overview "days pending"
  // chain-length walk, so it's fetched once and reused (see class comment
  // on runCarryForward below for the exact algorithm).
  const [myTasksAll, setMyTasksAll] = useState([]);
  const [todayEntries, setTodayEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [headData, setHeadData] = useState([]);
  const [headLoading, setHeadLoading] = useState(false);

  const carryForwardRanRef = useRef(false);

  const fetchMyTasks = useCallback(async () => {
    if (!profile?.id) return [];
    const { data, error } = await supabase
      .from('daily_report_items')
      .select('id, entry_date, task_status, description, department_id, carried_from_id')
      .eq('created_by', profile.id)
      .eq('category', 'task')
      .order('entry_date', { ascending: true })
      .limit(1000);
    if (error) { showToast?.('Gagal memuat data task: ' + error.message, 'error'); return []; }
    return data || [];
  }, [profile, showToast]);

  const fetchTodayEntries = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from('daily_report_items')
      .select(`
        id, category, description, task_status, insiden_resolution, department_id, created_at,
        department:bnf_departments!daily_report_items_department_id_fkey(id, name)
      `)
      .eq('created_by', profile.id)
      .eq('entry_date', today)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) { showToast?.('Gagal memuat entry hari ini: ' + error.message, 'error'); return; }
    const list = data || [];
    // bnf_reports_select RLS blocks a plain embed for non-bnf-authorized
    // reporters (see InsidenResolutionBadge's comment above) — resolve the
    // linked report's live status via RPC instead, one call per pulled-to-bnf
    // item (get_linked_bnf_status takes a single id, no batch variant).
    const pulledItems = list.filter((r) => r.category === 'insiden' && r.insiden_resolution === 'pulled_to_bnf');
    if (pulledItems.length === 0) { setTodayEntries(list); return; }
    const statuses = await Promise.all(pulledItems.map(async (r) => {
      const { data: status, error: rpcErr } = await supabase.rpc('get_linked_bnf_status', { p_daily_report_item_id: r.id });
      if (rpcErr) { console.error('[briefing-harian] get_linked_bnf_status failed for', r.id, rpcErr.message); return null; }
      return status;
    }));
    const statusMap = {};
    pulledItems.forEach((r, i) => { statusMap[r.id] = statuses[i]; });
    setTodayEntries(list.map((r) => (r.id in statusMap ? { ...r, linked_bnf_status: statusMap[r.id] } : r)));
  }, [profile, today, showToast]);

  // Auto carry-forward — runs once before "today" is first shown.
  // 1) carriedFromSet = every carried_from_id already present among the
  //    user's own task rows → ids that already have a successor.
  // 2) chain end = task_status='pending' AND entry_date != today AND its id
  //    is NOT in carriedFromSet (i.e. nothing points back at it yet).
  // 3) insert one new today-dated row per chain end, carried_from_id = old id.
  // Idempotent by construction, no separate "already carried today?" check
  // needed: the moment step 3 runs, the new row's carried_from_id makes the
  // old row show up in carriedFromSet on the next computation, so it stops
  // being a chain end and won't be carried again on a same-day reload.
  const runCarryForward = useCallback(async (tasks) => {
    const carriedFromSet = new Set(tasks.map((t) => t.carried_from_id).filter(Boolean));
    const chainEnds = tasks.filter((t) => t.task_status === 'pending' && t.entry_date !== today && !carriedFromSet.has(t.id));
    if (chainEnds.length === 0) return tasks;
    const payload = chainEnds.map((t) => ({
      company_id: profile.company_id,
      department_id: t.department_id,
      entry_date: today,
      created_by: profile.id,
      category: 'task',
      description: t.description,
      task_status: 'pending',
      carried_from_id: t.id,
    }));
    const { data: inserted, error } = await supabase
      .from('daily_report_items')
      .insert(payload)
      .select('id, entry_date, task_status, description, department_id, carried_from_id');
    if (error) {
      console.error('[briefing-harian] carry-forward insert failed:', error.message);
      showToast?.('Sebagian task dari hari sebelumnya gagal dibawa ke hari ini: ' + error.message, 'error');
      return tasks;
    }
    showToast?.(`${chainEnds.length} task dari hari sebelumnya dibawa ke hari ini`);
    return [...tasks, ...(inserted || [])];
  }, [profile, today, showToast]);

  // No cancelled/cleanup flag here on purpose: carryForwardRanRef already
  // guarantees at most one invocation of this effect ever does real work per
  // mount (subsequent invocations — e.g. React StrictMode's dev-only second
  // effect pass — return immediately at the guard above and start nothing).
  // Since there is never a "newer" invocation left to hand off to, a
  // cancelled-on-cleanup check here can only strand the one authoritative run
  // before it reaches setLoading(false) — which is exactly what happened
  // under StrictMode (cleanup fires immediately, flips cancelled, the run's
  // own async chain then bails at the old cancelled-check and never reaches
  // fetchTodayEntries()/setLoading(false), leaving the tab stuck on "Memuat
  // data..." forever). Matches the no-cancellation-guard convention already
  // used by every other useEffect(() => { fetchX(); }, [fetchX]); in this
  // codebase (e.g. BNFListPage.jsx's fetchReports/loadFormOptions).
  useEffect(() => {
    if (!profile?.id || !profile?.company_id) return;
    if (carryForwardRanRef.current) return;
    carryForwardRanRef.current = true;
    (async () => {
      setLoading(true);
      const tasks = await fetchMyTasks();
      const finalTasks = await runCarryForward(tasks);
      setMyTasksAll(finalTasks);
      await fetchTodayEntries();
      setLoading(false);
    })();
  }, [profile?.id, profile?.company_id, fetchMyTasks, runCarryForward, fetchTodayEntries]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    // No .eq('company_id', ...) filter — bnf_departments_read RLS already
    // returns the home ∪ scope union for a regular user (and everything for
    // super_admin); adding a company filter here would incorrectly strip out
    // scope-only departments that RLS was designed to include.
    supabase
      .from('bnf_departments')
      .select('id, code, name, company_id')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name')
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { showToast?.('Gagal memuat departemen: ' + error.message, 'error'); return; }
        setDepartments(data || []);
      });
    return () => { cancelled = true; };
  }, [profile?.id, showToast]);

  // is_bnf_authorized() gates which Overview is shown; head aggregate is
  // fetched right away once we know the answer is "yes" (cheap query, and
  // only the head-eligible subset of users ever triggers it).
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('is_bnf_authorized');
      if (cancelled) return;
      if (error) {
        console.error('[briefing-harian] is_bnf_authorized failed:', error.message);
        setCheckingAuth(false);
        return;
      }
      const authorized = !!data;
      setIsAuthorized(authorized);
      setCheckingAuth(false);
      if (!authorized) return;

      setHeadLoading(true);
      let query = supabase
        .from('daily_report_items')
        .select(`
          id, category, task_status, insiden_resolution, department_id, created_by,
          department:bnf_departments!daily_report_items_department_id_fkey(id, name)
        `)
        .eq('entry_date', today)
        .limit(1000);
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      const { data: rows, error: rowsErr } = await query;
      if (cancelled) return;
      if (rowsErr) {
        showToast?.('Gagal memuat rekap: ' + rowsErr.message, 'error');
        setHeadLoading(false);
        return;
      }
      const list = rows || [];
      const creatorIds = [...new Set(list.map((r) => r.created_by).filter(Boolean))];
      const nameMap = {};
      if (creatorIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', creatorIds).limit(1000);
        (profs || []).forEach((p) => { nameMap[p.id] = p.full_name; });
      }
      const byDept = {};
      list.forEach((r) => {
        const deptId = r.department_id;
        if (!byDept[deptId]) byDept[deptId] = { departmentId: deptId, departmentName: r.department?.name || 'Tanpa Departemen', peopleMap: {}, pendingInsiden: 0 };
        if (r.category === 'task' && r.task_status === 'pending') {
          const name = nameMap[r.created_by] || 'Tidak diketahui';
          byDept[deptId].peopleMap[name] = (byDept[deptId].peopleMap[name] || 0) + 1;
        }
        if (r.category === 'insiden' && (r.insiden_resolution || 'pending_review') === 'pending_review') {
          byDept[deptId].pendingInsiden += 1;
        }
      });
      const result = Object.values(byDept)
        .map((d) => ({ ...d, people: Object.entries(d.peopleMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) }))
        .sort((a, b) => a.departmentName.localeCompare(b.departmentName));
      if (cancelled) return;
      setHeadData(result);
      setHeadLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, today, showToast]);

  const handleCreate = useCallback(async ({ category, department_id, description }) => {
    if (!department_id) { setFormError('Departemen wajib dipilih.'); return false; }
    if (!description.trim()) { setFormError('Deskripsi wajib diisi.'); return false; }
    setFormSaving(true);
    setFormError(null);
    try {
      const payload = {
        company_id: profile.company_id,
        department_id,
        entry_date: today,
        created_by: profile.id,
        category,
        description: description.trim(),
        task_status: category === 'task' ? 'pending' : null,
        insiden_resolution: category === 'insiden' ? 'pending_review' : null,
      };
      const { error } = await supabase.from('daily_report_items').insert(payload);
      if (error) throw error;
      showToast?.('Entry berhasil ditambahkan');
      await fetchTodayEntries();
      if (category === 'task') setMyTasksAll(await fetchMyTasks());
      return true;
    } catch (err) {
      setFormError('Gagal menyimpan: ' + err.message);
      return false;
    } finally {
      setFormSaving(false);
    }
  }, [profile, today, fetchTodayEntries, fetchMyTasks, showToast]);

  const handleMarkDone = useCallback(async (item) => {
    setSavingId(item.id);
    try {
      const { error } = await supabase.from('daily_report_items').update({ task_status: 'selesai' }).eq('id', item.id);
      if (error) throw error;
      showToast?.('Task ditandai selesai');
      await fetchTodayEntries();
      setMyTasksAll(await fetchMyTasks());
    } catch (err) {
      showToast?.('Gagal menandai selesai: ' + err.message, 'error');
    } finally {
      setSavingId(null);
    }
  }, [fetchTodayEntries, fetchMyTasks, showToast]);

  // Pending "chain tip" tasks (no successor yet) + how many days each has
  // been alive, walked backward through carried_from_id. After carry-forward
  // has run, every chain tip is dated today by construction.
  const pendingWithAge = useMemo(() => {
    const byId = new Map(myTasksAll.map((t) => [t.id, t]));
    const carriedFromSet = new Set(myTasksAll.map((t) => t.carried_from_id).filter(Boolean));
    const tips = myTasksAll.filter((t) => t.task_status === 'pending' && !carriedFromSet.has(t.id));
    return tips
      .map((tip) => {
        let days = 0;
        let cur = tip;
        while (cur) {
          days += 1;
          cur = cur.carried_from_id ? byId.get(cur.carried_from_id) : null;
        }
        return { ...tip, days, departmentName: departments.find((d) => d.id === tip.department_id)?.name || '—' };
      })
      .sort((a, b) => b.days - a.days);
  }, [myTasksAll, departments]);

  return (
    <div className="min-h-full bg-slate-50" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ backgroundColor: NAVY_DARK }} className="-mx-5 -mt-6 px-8 py-5 sm:-mx-7 lg:-mt-7 xl:-mx-9">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <Sunrise size={18} style={{ color: ORANGE }} strokeWidth={2.3} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">Briefing Harian</div>
            <div className="text-[12px] text-slate-300">Rencana &amp; hasil kerja harian</div>
          </div>
        </div>
      </div>

      <div className="py-6">
        <div className="mb-6 flex gap-1 border-b" style={{ borderColor: LINE }}>
          {[['isi', 'Isi Hari Ini'], ['overview', 'Overview']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="relative px-4 py-2.5 text-[13px] font-semibold"
              style={{ color: tab === key ? NAVY : '#94A3B8' }}
            >
              {label}
              {tab === key && <span className="absolute -bottom-px left-0 right-0 h-[2px]" style={{ backgroundColor: ORANGE }} />}
            </button>
          ))}
        </div>

        {tab === 'isi' ? (
          <IsiHariIniTab
            departments={departments}
            todayEntries={todayEntries}
            loading={loading}
            savingId={savingId}
            formSaving={formSaving}
            formError={formError}
            onMarkDone={handleMarkDone}
            onCreate={handleCreate}
          />
        ) : (
          <OverviewTab
            isAuthorized={isAuthorized}
            checkingAuth={checkingAuth}
            todayEntries={todayEntries}
            pendingWithAge={pendingWithAge}
            headData={headData}
            headLoading={headLoading}
          />
        )}
      </div>
    </div>
  );
}

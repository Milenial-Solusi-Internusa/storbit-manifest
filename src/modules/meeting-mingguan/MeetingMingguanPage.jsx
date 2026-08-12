// src/modules/meeting-mingguan/MeetingMingguanPage.jsx
// Meeting Mingguan — weekly department meeting composer + history. New
// top-level menu (2026-08-12), separate from BNF but gated identically
// (isBnfAuthorized from AuthContext, same RPC result reused — see App.jsx).
// Same menu group as BNF/Briefing Harian.
//
// 2 tabs: "Susun dari Minggu Ini" (pull candidates from daily_report_items/
// bnf_reports into this week's weekly_meetings, then annotate them) and
// "Riwayat Meeting" (browse past weekly_meetings for the selected
// department).
//
// Department scope reuses resolveMyDeptScope from src/lib/bnfOrgScope.js
// (extracted out of BNFListPage.jsx's "Tarik dari Insiden" — same function,
// not a duplicate). Unlike BNFListPage's picker (which restricts the
// INSIDEN CANDIDATE LIST to the resolved scope while still offering the
// full company department list on the create-report form), this page's
// department picker itself is restricted to the resolved scope — confirmed
// with Den (2026-08-12) as the intended difference.
//
// Tokens/helpers here are local copies (NAVY/LINE/DANGER etc. match
// BNFListPage.jsx exactly) — matches this codebase's established practice
// of sibling pages duplicating small local pieces instead of cross-importing
// (see BNFOrgRolesPage.jsx's own comment on this for precedent).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Presentation, ClipboardList, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { resolveMyDeptScope } from '../../lib/bnfOrgScope';
import CodeNamePicker from '../../components/CodeNamePicker';
import BnfActionItemsChecklist from '../../components/BnfActionItemsChecklist';

const NAVY = '#0F3A66';
const NAVY_DARK = '#0A2745';
const ORANGE = '#E85A1E';
const LINE = '#E2E8F0';
const DANGER = '#DC2626';
const SLATE = '#64748B';

const inputCls =
  'w-full rounded-md border px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors';

function FieldLabel({ children, required }) {
  return (
    <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      {children} {required && <span style={{ color: ORANGE }}>*</span>}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Monday of the given week, as a plain YYYY-MM-DD string (manual construction,
// not toISOString(), to avoid a UTC-vs-local date shift near midnight — same
// convention as BNFListPage.jsx's/BriefingHarianPage.jsx's own todayStr()).
function mondayOfWeekStr(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const SOURCE_TYPE_META = {
  task_pending:     { label: 'Task Pending',       icon: ClipboardList, color: NAVY },
  insiden_resolved: { label: 'Insiden Selesai Internal', icon: CheckCircle2, color: '#15803D' },
  bnf_report:       { label: 'Laporan BNF',        icon: AlertTriangle,  color: DANGER },
};

function SourceTypeBadge({ sourceType }) {
  const meta = SOURCE_TYPE_META[sourceType];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}>
      <Icon size={11} strokeWidth={2.5} /> {meta.label}
    </span>
  );
}

// ============================================================================
// Meeting-level info form (meeting_date/peserta/keterangan) — reused by both
// tabs (Tugas 2 once a current-week meeting exists, Tugas 3 detail view).
// "bisa diisi/diedit kapan saja oleh head yang mengakses meeting itu" (Den,
// confirmed 2026-08-12): no read-only mode, always editable, explicit
// "Simpan" button (matches DetailPanel's own status-save convention).
// ============================================================================
function MeetingInfoForm({ meeting, onSave, saving }) {
  const [meetingDate, setMeetingDate] = useState(meeting?.meeting_date || '');
  const [peserta, setPeserta] = useState(meeting?.peserta || '');
  const [keterangan, setKeterangan] = useState(meeting?.keterangan || '');

  useEffect(() => {
    // Resets local edit-draft when the meeting prop changes — same shape as
    // BNFListPage.jsx's own DetailPanel newStatus/note/editMode effect
    // (also flagged by this rule, left as-is there too) — not a new pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeetingDate(meeting?.meeting_date || '');
    setPeserta(meeting?.peserta || '');
    setKeterangan(meeting?.keterangan || '');
  }, [meeting?.id, meeting?.meeting_date, meeting?.peserta, meeting?.keterangan]);

  if (!meeting) return null;
  const dirty = meetingDate !== (meeting.meeting_date || '') || peserta !== (meeting.peserta || '') || keterangan !== (meeting.keterangan || '');

  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: LINE }}>
      <div className="mb-3 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        Minggu {fmtDate(meeting.week_start_date)} · Info Meeting
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>Tanggal Rapat</FieldLabel>
          <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className={inputCls} style={{ borderColor: LINE }} />
        </div>
        <div>
          <FieldLabel>Peserta</FieldLabel>
          <input value={peserta} onChange={(e) => setPeserta(e.target.value)} placeholder="Nama peserta rapat…" className={inputCls} style={{ borderColor: LINE, fontFamily: 'inherit' }} />
        </div>
        <div className="col-span-2">
          <FieldLabel>Keterangan</FieldLabel>
          <textarea rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Catatan umum rapat…" className={inputCls} style={{ borderColor: LINE }} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => onSave({ meeting_date: meetingDate || null, peserta: peserta.trim() || null, keterangan: keterangan.trim() || null })}
          disabled={saving || !dirty}
          className="rounded-md px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: NAVY }}
        >
          {saving ? 'Menyimpan…' : 'Simpan Info Meeting'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Candidate list (one of the 3 categories) — checkbox + "sudah pernah
// dibahas" badge (informational only, never blocks re-selection).
// ============================================================================
function CandidateGroup({ sourceType, title, loading, items, checkedKeys, discussedIds, onToggleCheck }) {
  const meta = SOURCE_TYPE_META[sourceType];
  const Icon = meta.icon;
  return (
    <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: LINE }}>
        <Icon size={14} style={{ color: meta.color }} strokeWidth={2.3} />
        <span className="text-[13px] font-semibold text-slate-700">{title}</span>
        <span className="ml-auto text-[11px] text-slate-400">{items.length}</span>
      </div>
      {loading ? (
        <div className="px-4 py-6 text-center text-[13px] text-slate-400">Memuat…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[13px] text-slate-400">Tidak ada kandidat</div>
      ) : (
        <div className="divide-y" style={{ borderColor: LINE }}>
          {items.map((c) => {
            const key = `${sourceType}:${c.id}`;
            const discussed = discussedIds.has(c.id);
            return (
              <label key={key} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checkedKeys.has(key)}
                  onChange={() => onToggleCheck(key)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.report_no && <span className="text-[11px] font-semibold text-slate-400" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{c.report_no}</span>}
                    {discussed && (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: '#F1F5F9', color: SLATE }}>
                        Sudah pernah dibahas
                      </span>
                    )}
                    {sourceType === 'task_pending' && c.days != null && (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: c.days >= 3 ? '#FEF2F2' : '#FEF3E2', color: c.days >= 3 ? DANGER : '#D97706' }}>
                        pending {c.days} hari
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-slate-700" style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {c.reporter_name || '—'} · {fmtDate(c.entry_date || c.target_date)}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// One weekly_meeting_item card (current week — editable). Branches on
// source_type per spec: task_pending/insiden_resolved get a free-text
// action_plan field; bnf_report gets the reused BnfActionItemsChecklist
// widget instead (no action_plan field for that source_type).
// ============================================================================
function MeetingItemCard({ item, saving, onSaveNotes, bnfChecklist, onToggleBnfItem, onAddBnfItem }) {
  const [catatan, setCatatan] = useState(item.catatan_meeting || '');
  const [actionPlan, setActionPlan] = useState(item.action_plan || '');

  useEffect(() => {
    // Same reset-on-prop-change shape as MeetingInfoForm's own effect above
    // (also flagged by this rule, left as-is there too) — not a new pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCatatan(item.catatan_meeting || '');
    setActionPlan(item.action_plan || '');
  }, [item.id, item.catatan_meeting, item.action_plan]);

  const sourceDescription = item.source_type === 'bnf_report'
    ? item.bnf_report?.description
    : item.daily_report_item?.description;
  const dirty = catatan !== (item.catatan_meeting || '') || (item.source_type !== 'bnf_report' && actionPlan !== (item.action_plan || ''));

  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: LINE }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SourceTypeBadge sourceType={item.source_type} />
        {item.source_type === 'bnf_report' && item.bnf_report?.report_no && (
          <span className="text-[11px] font-semibold text-slate-400" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{item.bnf_report.report_no}</span>
        )}
      </div>
      <p className="text-[13px] text-slate-600" style={{ whiteSpace: 'pre-wrap' }}>{sourceDescription || '—'}</p>

      <div className="mt-3">
        <FieldLabel>Catatan Meeting</FieldLabel>
        <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan pembahasan…" className={inputCls} style={{ borderColor: LINE }} />
      </div>

      {item.source_type === 'bnf_report' ? (
        <div className="mt-3 border-t pt-3" style={{ borderColor: LINE }}>
          <BnfActionItemsChecklist
            items={bnfChecklist?.items || []}
            loading={!!bnfChecklist?.loading}
            saving={bnfChecklist?.saving ?? null}
            people={bnfChecklist?.people || []}
            onToggle={(ai) => onToggleBnfItem(item.bnf_report_id, item.bnf_report?.company_id, ai)}
            onAdd={(payload, onSuccess) => onAddBnfItem(item.bnf_report_id, item.bnf_report?.company_id, payload, onSuccess)}
          />
        </div>
      ) : (
        <div className="mt-3">
          <FieldLabel>Rencana Tindakan</FieldLabel>
          <textarea rows={2} value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder="Rencana tindak lanjut…" className={inputCls} style={{ borderColor: LINE }} />
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => onSaveNotes(item, { catatan_meeting: catatan.trim() || null, action_plan: item.source_type === 'bnf_report' ? null : (actionPlan.trim() || null) })}
          disabled={saving === item.id || !dirty}
          className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: NAVY }}
        >
          {saving === item.id ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Read-only version of a meeting item, for Riwayat Meeting detail (Den,
// 2026-08-12: history stays view-only for item content; only peserta/
// keterangan/meeting_date at the meeting level are editable anytime).
// ============================================================================
function MeetingItemReadOnly({ item }) {
  const sourceDescription = item.source_type === 'bnf_report'
    ? item.bnf_report?.description
    : item.daily_report_item?.description;
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: LINE }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SourceTypeBadge sourceType={item.source_type} />
        {item.source_type === 'bnf_report' && item.bnf_report?.report_no && (
          <span className="text-[11px] font-semibold text-slate-400" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{item.bnf_report.report_no}</span>
        )}
      </div>
      <p className="text-[13px] text-slate-600" style={{ whiteSpace: 'pre-wrap' }}>{sourceDescription || '—'}</p>
      <div className="mt-3 rounded-md p-3" style={{ backgroundColor: '#FAFBFC' }}>
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Catatan Meeting</div>
        <p className="mt-1 text-[13px] text-slate-700" style={{ whiteSpace: 'pre-wrap' }}>{item.catatan_meeting || '—'}</p>
      </div>
      {item.source_type === 'bnf_report' ? (
        <div className="mt-2 text-[12px] text-slate-500">
          Rencana tindakan: lihat checklist pada laporan BNF {item.bnf_report?.report_no || ''} (Detail Laporan BNF).
        </div>
      ) : (
        <div className="mt-2 rounded-md p-3" style={{ backgroundColor: '#FAFBFC' }}>
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Rencana Tindakan</div>
          <p className="mt-1 text-[13px] text-slate-700" style={{ whiteSpace: 'pre-wrap' }}>{item.action_plan || '—'}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 1 — Susun dari Minggu Ini
// ============================================================================
function SusunMingguIniTab({ profile, departmentId, showToast }) {
  const [candLoading, setCandLoading] = useState(true);
  const [taskCandidates, setTaskCandidates] = useState([]);
  const [insidenCandidates, setInsidenCandidates] = useState([]);
  const [bnfCandidates, setBnfCandidates] = useState([]);
  const [discussedDailyIds, setDiscussedDailyIds] = useState(new Set());
  const [discussedBnfIds, setDiscussedBnfIds] = useState(new Set());
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [currentMeeting, setCurrentMeeting] = useState(null);
  const [meetingLoading, setMeetingLoading] = useState(true);
  const [meetingInfoSaving, setMeetingInfoSaving] = useState(false);

  const [currentMeetingItems, setCurrentMeetingItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemNotesSaving, setItemNotesSaving] = useState(null);

  const [bnfChecklists, setBnfChecklists] = useState({}); // { [bnf_report_id]: { items, people, loading, saving } }

  const weekStart = useMemo(() => mondayOfWeekStr(), []);

  const fetchCandidates = useCallback(async () => {
    if (!departmentId) return;
    setCandLoading(true);
    try {
      const [taskRes, insidenRes, bnfRes] = await Promise.all([
        supabase.from('daily_report_items')
          .select('id, entry_date, task_status, description, created_by, carried_from_id')
          .eq('category', 'task').eq('department_id', departmentId)
          .order('entry_date', { ascending: true }).limit(1000),
        supabase.from('daily_report_items')
          .select('id, entry_date, description, created_by')
          .eq('category', 'insiden').eq('insiden_resolution', 'resolved_internal').eq('department_id', departmentId)
          .order('entry_date', { ascending: false }).limit(1000),
        supabase.from('bnf_reports')
          .select('id, report_no, description, status, target_date, created_by')
          .eq('department_id', departmentId).in('status', ['Open', 'Escalated']).is('deleted_at', null)
          .order('target_date', { ascending: true }).limit(1000),
      ]);
      if (taskRes.error) throw taskRes.error;
      if (insidenRes.error) throw insidenRes.error;
      if (bnfRes.error) throw bnfRes.error;

      // Chain-end + age computation — same algorithm as
      // BriefingHarianPage.jsx's pendingWithAge, scoped to the whole
      // department's task rows instead of one person's.
      const allTasks = taskRes.data || [];
      const byId = new Map(allTasks.map((t) => [t.id, t]));
      const carriedFromSet = new Set(allTasks.map((t) => t.carried_from_id).filter(Boolean));
      const chainEnds = allTasks.filter((t) => t.task_status === 'pending' && !carriedFromSet.has(t.id));
      const tasksWithAge = chainEnds.map((tip) => {
        let days = 0; let cur = tip;
        while (cur) { days += 1; cur = cur.carried_from_id ? byId.get(cur.carried_from_id) : null; }
        return { ...tip, days };
      }).sort((a, b) => b.days - a.days);

      const insidenList = insidenRes.data || [];
      const bnfList = bnfRes.data || [];

      // Reporter names — created_by FKs to auth.users, resolved via profiles
      // (same pattern as BNFListPage.jsx's reporter_name/BriefingHarianPage's
      // creator nameMap).
      const creatorIds = [...new Set([...tasksWithAge, ...insidenList].map((r) => r.created_by).filter(Boolean))];
      const nameMap = {};
      if (creatorIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', creatorIds).limit(1000);
        (profs || []).forEach((p) => { nameMap[p.id] = p.full_name; });
      }
      setTaskCandidates(tasksWithAge.map((t) => ({ ...t, reporter_name: nameMap[t.created_by] || null })));
      setInsidenCandidates(insidenList.map((t) => ({ ...t, reporter_name: nameMap[t.created_by] || null })));
      setBnfCandidates(bnfList);

      // "Sudah pernah dibahas" — any weekly_meeting_items row ever, any week.
      const dailyIds = [...tasksWithAge.map((c) => c.id), ...insidenList.map((c) => c.id)];
      const bnfIds = bnfList.map((c) => c.id);
      const [dailyDiscussedRes, bnfDiscussedRes] = await Promise.all([
        dailyIds.length ? supabase.from('weekly_meeting_items').select('daily_report_item_id').in('daily_report_item_id', dailyIds).limit(1000) : Promise.resolve({ data: [] }),
        bnfIds.length ? supabase.from('weekly_meeting_items').select('bnf_report_id').in('bnf_report_id', bnfIds).limit(1000) : Promise.resolve({ data: [] }),
      ]);
      setDiscussedDailyIds(new Set((dailyDiscussedRes.data || []).map((r) => r.daily_report_item_id)));
      setDiscussedBnfIds(new Set((bnfDiscussedRes.data || []).map((r) => r.bnf_report_id)));
    } catch (err) {
      showToast?.('Gagal memuat kandidat: ' + err.message, 'error');
    } finally {
      setCandLoading(false);
    }
  }, [departmentId, showToast]);

  const fetchCurrentMeetingItems = useCallback(async (meetingId) => {
    if (!meetingId) { setCurrentMeetingItems([]); return; }
    setItemsLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_meeting_items')
        .select(`
          id, source_type, daily_report_item_id, bnf_report_id, catatan_meeting, action_plan, created_at,
          daily_report_item:daily_report_items!weekly_meeting_items_daily_report_item_id_fkey(id, description),
          bnf_report:bnf_reports!weekly_meeting_items_bnf_report_id_fkey(id, report_no, description, status, company_id)
        `)
        .eq('weekly_meeting_id', meetingId)
        .order('created_at', { ascending: true })
        .limit(1000);
      if (error) throw error;
      setCurrentMeetingItems(data || []);
    } catch (err) {
      showToast?.('Gagal memuat item meeting: ' + err.message, 'error');
    } finally {
      setItemsLoading(false);
    }
  }, [showToast]);

  const fetchCurrentMeeting = useCallback(async () => {
    if (!departmentId) return;
    setMeetingLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_meetings').select('*')
        .eq('department_id', departmentId).eq('week_start_date', weekStart)
        .order('created_at', { ascending: true }).limit(1);
      if (error) throw error;
      const found = data?.[0] || null;
      setCurrentMeeting(found);
      await fetchCurrentMeetingItems(found?.id);
    } catch (err) {
      showToast?.('Gagal memuat meeting minggu ini: ' + err.message, 'error');
    } finally {
      setMeetingLoading(false);
    }
  }, [departmentId, weekStart, fetchCurrentMeetingItems, showToast]);

  // Same accepted fetch/reset-on-mount-or-dependency-change shape as
  // BNFListPage.jsx's fetchReports/loadFormOptions effects (also flagged by
  // this rule, left as-is there too) — not a new pattern, ×3 below.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCurrentMeeting(); }, [fetchCurrentMeeting]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCheckedKeys(new Set()); }, [departmentId]);

  const fetchBnfChecklist = useCallback(async (reportId, companyId) => {
    setBnfChecklists((prev) => ({ ...prev, [reportId]: { ...(prev[reportId] || { items: [], people: [] }), loading: true } }));
    try {
      const [itemsRes, peopleRes] = await Promise.all([
        supabase.from('bnf_report_action_items').select('*').eq('report_id', reportId).order('created_at', { ascending: true }).limit(1000),
        supabase.from('profiles').select('id, full_name, email').eq('company_id', companyId || profile.company_id).eq('active', true).order('full_name').limit(1000),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (peopleRes.error) throw peopleRes.error;
      const people = peopleRes.data || [];
      const nameMap = {};
      people.forEach((p) => { nameMap[p.id] = p.full_name; });
      const items = (itemsRes.data || []).map((it) => ({
        ...it,
        assignee_name: nameMap[it.assigned_to] || null,
        completed_by_name: it.completed_by ? (nameMap[it.completed_by] || null) : null,
      }));
      setBnfChecklists((prev) => ({ ...prev, [reportId]: { items, people, loading: false, saving: null } }));
    } catch (err) {
      showToast?.('Gagal memuat checklist BNF: ' + err.message, 'error');
      setBnfChecklists((prev) => ({ ...prev, [reportId]: { ...(prev[reportId] || { items: [], people: [] }), loading: false } }));
    }
  }, [profile, showToast]);

  // Eagerly load each bnf_report-sourced item's checklist once it appears in
  // the current meeting's item list — keyed on the id list specifically
  // (not on bnfChecklists itself) so an update inside one checklist doesn't
  // re-trigger this effect for every other checklist.
  const bnfReportIdsInMeeting = useMemo(
    () => [...new Set(currentMeetingItems.filter((it) => it.source_type === 'bnf_report' && it.bnf_report_id).map((it) => it.bnf_report_id))],
    [currentMeetingItems]
  );
  useEffect(() => {
    bnfReportIdsInMeeting.forEach((reportId) => {
      const item = currentMeetingItems.find((it) => it.bnf_report_id === reportId);
      fetchBnfChecklist(reportId, item?.bnf_report?.company_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-run only when the id LIST changes, not on every checklist state update (see comment above)
  }, [bnfReportIdsInMeeting]);

  const handleToggleBnfItem = useCallback(async (reportId, companyId, aiItem) => {
    setBnfChecklists((prev) => ({ ...prev, [reportId]: { ...prev[reportId], saving: aiItem.id } }));
    try {
      const payload = aiItem.is_done
        ? { is_done: false, completed_by: null, completed_at: null }
        : { is_done: true, completed_by: profile.id, completed_at: new Date().toISOString() };
      const { error } = await supabase.from('bnf_report_action_items').update(payload).eq('id', aiItem.id);
      if (error) throw error;
      await fetchBnfChecklist(reportId, companyId);
    } catch (err) {
      showToast?.('Gagal mengubah status action item: ' + err.message, 'error');
      setBnfChecklists((prev) => ({ ...prev, [reportId]: { ...prev[reportId], saving: null } }));
    }
  }, [profile, fetchBnfChecklist, showToast]);

  const handleAddBnfItem = useCallback(async (reportId, companyId, { description, assigned_to }, onSuccess) => {
    setBnfChecklists((prev) => ({ ...prev, [reportId]: { ...prev[reportId], saving: 'new' } }));
    try {
      const { error } = await supabase.from('bnf_report_action_items').insert({ report_id: reportId, description, assigned_to, created_by: profile.id });
      if (error) throw error;
      onSuccess?.();
      await fetchBnfChecklist(reportId, companyId);
    } catch (err) {
      showToast?.('Gagal menambah action item: ' + err.message, 'error');
      setBnfChecklists((prev) => ({ ...prev, [reportId]: { ...prev[reportId], saving: null } }));
    }
  }, [profile, fetchBnfChecklist, showToast]);

  const toggleCheck = (key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (checkedKeys.size === 0) return;
    setSubmitting(true);
    try {
      let meeting = currentMeeting;
      if (!meeting) {
        // Re-check right before insert to narrow (not eliminate) the
        // find-or-create race window — no DB unique constraint exists to
        // enforce this (accepted trade-off, confirmed with Den 2026-08-12).
        const { data: existingRows, error: findErr } = await supabase
          .from('weekly_meetings').select('*')
          .eq('department_id', departmentId).eq('week_start_date', weekStart)
          .order('created_at', { ascending: true }).limit(1);
        if (findErr) throw findErr;
        if (existingRows?.length) {
          meeting = existingRows[0];
        } else {
          const { data: created, error: createErr } = await supabase.from('weekly_meetings').insert({
            company_id: profile.company_id,
            department_id: departmentId,
            week_start_date: weekStart,
            created_by: profile.id,
          }).select('*').single();
          if (createErr) throw createErr;
          meeting = created;
        }
        setCurrentMeeting(meeting);
      }

      const payload = [...checkedKeys].map((key) => {
        const sourceType = key.slice(0, key.lastIndexOf(':'));
        const id = key.slice(key.lastIndexOf(':') + 1);
        return sourceType === 'bnf_report'
          ? { weekly_meeting_id: meeting.id, source_type: sourceType, bnf_report_id: id }
          : { weekly_meeting_id: meeting.id, source_type: sourceType, daily_report_item_id: id };
      });
      const { error: insErr } = await supabase.from('weekly_meeting_items').insert(payload);
      if (insErr) throw insErr;

      showToast?.(`${payload.length} item ditambahkan ke meeting minggu ini`);
      setCheckedKeys(new Set());
      await Promise.all([fetchCandidates(), fetchCurrentMeetingItems(meeting.id)]);
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveMeetingInfo = async (payload) => {
    if (!currentMeeting) return;
    setMeetingInfoSaving(true);
    try {
      const { error } = await supabase.from('weekly_meetings').update(payload).eq('id', currentMeeting.id);
      if (error) throw error;
      setCurrentMeeting((prev) => ({ ...prev, ...payload }));
      showToast?.('Info meeting disimpan');
    } catch (err) {
      showToast?.('Gagal menyimpan info meeting: ' + err.message, 'error');
    } finally {
      setMeetingInfoSaving(false);
    }
  };

  const handleSaveItemNotes = async (item, payload) => {
    setItemNotesSaving(item.id);
    try {
      const { error } = await supabase.from('weekly_meeting_items').update(payload).eq('id', item.id);
      if (error) throw error;
      setCurrentMeetingItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...payload } : it)));
      showToast?.('Catatan disimpan');
    } catch (err) {
      showToast?.('Gagal menyimpan catatan: ' + err.message, 'error');
    } finally {
      setItemNotesSaving(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CandidateGroup sourceType="task_pending" title="Task Pending" loading={candLoading} items={taskCandidates} checkedKeys={checkedKeys} discussedIds={discussedDailyIds} onToggleCheck={toggleCheck} />
        <CandidateGroup sourceType="insiden_resolved" title="Insiden Selesai Internal" loading={candLoading} items={insidenCandidates} checkedKeys={checkedKeys} discussedIds={discussedDailyIds} onToggleCheck={toggleCheck} />
        <CandidateGroup sourceType="bnf_report" title="Laporan BNF" loading={candLoading} items={bnfCandidates} checkedKeys={checkedKeys} discussedIds={discussedBnfIds} onToggleCheck={toggleCheck} />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || checkedKeys.size === 0}
          className="rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: ORANGE }}
        >
          {submitting ? 'Menyimpan…' : `Tambahkan ${checkedKeys.size || ''} Item ke Meeting`.trim()}
        </button>
      </div>

      {meetingLoading ? (
        <div className="py-6 text-center text-[13px] text-slate-400">Memuat meeting minggu ini…</div>
      ) : currentMeeting ? (
        <div className="space-y-4 border-t pt-5" style={{ borderColor: LINE }}>
          <MeetingInfoForm meeting={currentMeeting} onSave={handleSaveMeetingInfo} saving={meetingInfoSaving} />
          {itemsLoading ? (
            <div className="py-6 text-center text-[13px] text-slate-400">Memuat item meeting…</div>
          ) : currentMeetingItems.length === 0 ? (
            <div className="rounded-lg border bg-white px-4 py-6 text-center text-[13px] text-slate-400" style={{ borderColor: LINE }}>
              Belum ada item pada meeting minggu ini — pilih kandidat di atas.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Item Meeting Minggu Ini ({currentMeetingItems.length})</div>
              {currentMeetingItems.map((item) => (
                <MeetingItemCard
                  key={item.id}
                  item={item}
                  saving={itemNotesSaving}
                  onSaveNotes={handleSaveItemNotes}
                  bnfChecklist={item.source_type === 'bnf_report' ? bnfChecklists[item.bnf_report_id] : null}
                  onToggleBnfItem={handleToggleBnfItem}
                  onAddBnfItem={handleAddBnfItem}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Tab 2 — Riwayat Meeting
// ============================================================================
function RiwayatMeetingTab({ departmentId, showToast }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);

  const fetchMeetings = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_meetings').select('*')
        .eq('department_id', departmentId)
        .order('week_start_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      showToast?.('Gagal memuat riwayat meeting: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [departmentId, showToast]);

  // Same accepted fetch-on-mount shape as SusunMingguIniTab's own effects
  // above (also flagged by this rule, left as-is there too) — not a new
  // pattern.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchMeetings(); setSelected(null); }, [fetchMeetings]);

  const openDetail = async (meeting) => {
    setSelected(meeting);
    setItemsLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_meeting_items')
        .select(`
          id, source_type, daily_report_item_id, bnf_report_id, catatan_meeting, action_plan, created_at,
          daily_report_item:daily_report_items!weekly_meeting_items_daily_report_item_id_fkey(id, description),
          bnf_report:bnf_reports!weekly_meeting_items_bnf_report_id_fkey(id, report_no, description, status)
        `)
        .eq('weekly_meeting_id', meeting.id)
        .order('created_at', { ascending: true })
        .limit(1000);
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      showToast?.('Gagal memuat item meeting: ' + err.message, 'error');
    } finally {
      setItemsLoading(false);
    }
  };

  const handleSaveMeetingInfo = async (payload) => {
    if (!selected) return;
    setInfoSaving(true);
    try {
      const { error } = await supabase.from('weekly_meetings').update(payload).eq('id', selected.id);
      if (error) throw error;
      setSelected((prev) => ({ ...prev, ...payload }));
      setMeetings((prev) => prev.map((m) => (m.id === selected.id ? { ...m, ...payload } : m)));
      showToast?.('Info meeting disimpan');
    } catch (err) {
      showToast?.('Gagal menyimpan info meeting: ' + err.message, 'error');
    } finally {
      setInfoSaving(false);
    }
  };

  if (selected) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelected(null)} className="text-[13px] font-semibold" style={{ color: NAVY }}>
          ← Kembali ke daftar
        </button>
        <MeetingInfoForm meeting={selected} onSave={handleSaveMeetingInfo} saving={infoSaving} />
        {itemsLoading ? (
          <div className="py-6 text-center text-[13px] text-slate-400">Memuat item…</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border bg-white px-4 py-6 text-center text-[13px] text-slate-400" style={{ borderColor: LINE }}>Belum ada item pada meeting ini.</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => <MeetingItemReadOnly key={item.id} item={item} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
      <div className="border-b px-5 py-3" style={{ borderColor: LINE }}>
        <span className="text-[13px] font-semibold text-slate-700">Riwayat Meeting</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr style={{ backgroundColor: '#FAFBFC' }}>
              {['Minggu', 'Tanggal Rapat', 'Peserta', 'Keterangan', ''].map((h) => (
                <th key={h} className="border-b px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500" style={{ borderColor: LINE }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Memuat…</td></tr>
            ) : meetings.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Belum ada riwayat meeting</td></tr>
            ) : meetings.map((m) => (
              <tr key={m.id} onClick={() => openDetail(m)} className="cursor-pointer transition-colors hover:bg-slate-50" style={{ borderBottom: `1px solid ${LINE}` }}>
                <td className="px-4 py-3 text-slate-600">{fmtDate(m.week_start_date)}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(m.meeting_date)}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">{m.peserta || '—'}</td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-600">{m.keterangan || '—'}</td>
                <td className="px-4 py-3 text-right"><ArrowUpRight size={14} className="ml-auto text-slate-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Root
// ============================================================================
export default function MeetingMingguanPage({ showToast }) {
  const { profile, erpRole } = useAuth();
  const isAllEntities = ['super_admin'].includes(erpRole);

  const [tab, setTab] = useState('susun'); // susun | riwayat
  const [allDepartments, setAllDepartments] = useState([]);
  const [deptScope, setDeptScope] = useState(undefined); // undefined = loading, null = unrestricted, array = restricted
  const [scopeLoading, setScopeLoading] = useState(true);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [departmentText, setDepartmentText] = useState('');

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    supabase.from('bnf_departments').select('id, code, name').eq('company_id', profile.company_id).eq('is_active', true).is('deleted_at', null).order('name').limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { showToast?.('Gagal memuat departemen: ' + error.message, 'error'); return; }
        setAllDepartments(data || []);
      });
    return () => { cancelled = true; };
  }, [profile?.company_id, showToast]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    // Same accepted fetch-on-mount shape as the departments-list effect just
    // above (also flagged by this rule, left as-is there too) — not a new
    // pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScopeLoading(true);
    resolveMyDeptScope({ isAllEntities, profileId: profile.id, companyId: profile.company_id })
      .then((scope) => { if (!cancelled) setDeptScope(scope); })
      .catch((err) => { if (!cancelled) { showToast?.('Gagal memuat scope departemen: ' + err.message, 'error'); setDeptScope(null); } })
      .finally(() => { if (!cancelled) setScopeLoading(false); });
    return () => { cancelled = true; };
  }, [isAllEntities, profile?.id, profile?.company_id, showToast]);

  const pickerOptions = useMemo(() => {
    if (deptScope === undefined) return [];
    if (deptScope === null) return allDepartments;
    return allDepartments.filter((d) => deptScope.includes(d.id));
  }, [allDepartments, deptScope]);

  // Auto-select once options are known — a picker is only shown when there's
  // genuinely more than one option to choose from.
  useEffect(() => {
    if (scopeLoading || selectedDepartmentId) return;
    if (pickerOptions.length >= 1) {
      // Same accepted derive-from-prop shape as the effects above (also
      // flagged by this rule, left as-is there too) — not a new pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDepartmentId(pickerOptions[0].id);
      setDepartmentText(pickerOptions[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately fires once options first resolve, not on every pickerOptions re-derivation
  }, [scopeLoading, pickerOptions]);

  const ready = !scopeLoading && allDepartments.length >= 0;

  return (
    <div className="min-h-full bg-slate-50" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ backgroundColor: NAVY_DARK }} className="-mx-5 -mt-6 px-8 py-5 sm:-mx-7 lg:-mt-7 xl:-mx-9">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <Presentation size={18} style={{ color: ORANGE }} strokeWidth={2.3} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">Meeting Mingguan</div>
            <div className="text-[12px] text-slate-300">Susun &amp; riwayat rapat mingguan per departemen</div>
          </div>
        </div>
      </div>

      <div className="py-6">
        {!ready ? (
          <div className="py-12 text-center text-[13px] text-slate-400">Memuat…</div>
        ) : pickerOptions.length === 0 ? (
          <div className="rounded-lg border bg-white px-4 py-8 text-center text-[13px] text-slate-400" style={{ borderColor: LINE }}>
            Tidak ada departemen yang bisa diakses.
          </div>
        ) : (
          <>
            <div className="mb-5 max-w-md">
              <FieldLabel>Departemen</FieldLabel>
              {pickerOptions.length === 1 ? (
                <div className="rounded-md border bg-white px-3 py-2 text-[13px] font-medium text-slate-700" style={{ borderColor: LINE }}>
                  {pickerOptions[0].name}
                </div>
              ) : (
                <CodeNamePicker
                  value={departmentText}
                  items={pickerOptions}
                  inputClassName={inputCls}
                  inputStyle={{ borderColor: LINE }}
                  placeholder="Cari / pilih departemen…"
                  onChangeText={(v) => { setDepartmentText(v); setSelectedDepartmentId(''); }}
                  onPick={(item) => { setDepartmentText(item.name); setSelectedDepartmentId(item.id); }}
                />
              )}
            </div>

            <div className="mb-6 flex gap-1 border-b" style={{ borderColor: LINE }}>
              {[['susun', 'Susun dari Minggu Ini'], ['riwayat', 'Riwayat Meeting']].map(([key, label]) => (
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

            {!selectedDepartmentId ? (
              <div className="py-12 text-center text-[13px] text-slate-400">Pilih departemen dulu.</div>
            ) : tab === 'susun' ? (
              <SusunMingguIniTab profile={profile} departmentId={selectedDepartmentId} showToast={showToast} />
            ) : (
              <RiwayatMeetingTab departmentId={selectedDepartmentId} showToast={showToast} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

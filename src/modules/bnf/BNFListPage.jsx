// src/modules/bnf/BNFListPage.jsx
// BNF (Bad News First) — cross-division incident reporting. Migrated from a
// standalone Google Apps Script app (old data NOT migrated). Visible to every
// logged-in user regardless of role: anyone may submit, see every report in
// their company, and change status/remark on any report (mirrors the old
// app's openness — see RLS on `bnf_reports`).
//
// Visual redesign (2026-08-03): 2 tabs — "Buat Laporan" (form always visible,
// no modal/trigger button) and "Overview" (KPI strip + per-division breakdown
// + list, one scroll, no separate Dashboard tab anymore). Detail is a
// right-side slide-over instead of a centered modal. All data
// fetch/submit/status-change/email logic below is UNCHANGED from the
// previous version — only JSX/styling and tab structure changed.
//
// Tailwind note: this project's tailwind.config.js remaps `font-sans` to
// "Plus Jakarta Sans" (explicitly deprecated per CLAUDE.md) and `font-mono`
// to "JetBrains Mono" (not the "IBM Plex Mono" convention used everywhere
// else in Nexus for document numbers) — so this file deliberately avoids
// Tailwind's font-family utility classes and sets fontFamily inline instead.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, ChevronDown, Send, Mail, ArrowUpRight, FileText, AlertCircle, Wrench, Target, X, Search, Pencil, Trash2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { resolveMyDeptScope as resolveMyDeptScopeShared } from '../../lib/bnfOrgScope';
import CodeNamePicker from '../../components/CodeNamePicker';
import ConfirmModal from '../../components/ConfirmModal';
import BnfActionItemsChecklist from '../../components/BnfActionItemsChecklist';

// ============================================================================
// Tokens — restrained on purpose: navy carries structure (header bar, key
// actions), everything else stays near-monochrome (Tailwind slate utilities)
// so status/urgency color actually stands out when it appears.
// ============================================================================
const NAVY = '#0F3A66';
const NAVY_DARK = '#0A2745';
const ORANGE = '#E85A1E';
const INK = '#1E293B';
const LINE = '#E2E8F0';
const DANGER = '#DC2626'; // matches urgencyLabel's "Lewat Nh" red, reused for error banners

const STATUS_DOT_COLOR = {
  Open: '#2563EB',
  'In Progress': '#D97706',
  Escalated: '#7C3AED',
  Closed: '#64748B',
};
const STATUS_FORM = ['Open', 'In Progress', 'Escalated', 'Closed'];

const ESCALATION_OPTS = [
  { value: 'manager_direct',   label: 'Manager Direct' },
  { value: 'direktur_divisi',  label: 'Direktur Divisi' },
  { value: 'ceo',              label: 'CEO' },
];
const escalationLabel = (v) => ESCALATION_OPTS.find((o) => o.value === v)?.label || '—';

const PAGE_SIZE = 20;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
// Escape user-controlled text before it lands in the HTML email body sent via
// the `send-email` Edge Function (mirrors InquiryChatter.jsx's escapeHtml).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Days between now and target_date (negative = past due). Same underlying
// comparison as the old computeOverdue (target_date vs today, ignored once
// Closed) — just exposed as a signed day count instead of a plain boolean, to
// drive the 3-tier "Urgensi" text/color (overdue / imminent / normal).
function daysUntilTarget(targetDate) {
  if (!targetDate) return null;
  const target = new Date(targetDate + 'T23:59:59');
  if (isNaN(target.getTime())) return null;
  return Math.floor((target.getTime() - Date.now()) / 86400000);
}
function urgencyLabel(report) {
  if (!report || report.status === 'Closed') return { text: '—', color: '#94A3B8' };
  const daysLeft = daysUntilTarget(report.target_date);
  if (daysLeft === null) return { text: '—', color: '#94A3B8' };
  if (daysLeft < 0) return { text: `Lewat ${Math.abs(daysLeft)}h`, color: DANGER };
  if (daysLeft <= 2) return { text: `${daysLeft}h lagi`, color: '#D97706' };
  return { text: `${daysLeft}h lagi`, color: '#64748B' };
}
function previewReportNo() {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  return `BNF-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-XXX`;
}

// Best-effort notification to a report's department head. Reused by both
// create-time notification (silent-fail) and the manual "Kirim Reminder"
// button (caller surfaces the result via showToast). Mirrors
// InquiryChatter.jsx's resolve-then-invoke pattern. Fase B (2026-08-04):
// replaces the old division-recipients-list broadcast (separate join table,
// dropped) — now a single resolve (report's department_id ->
// bnf_departments.head_profile_id) and a single email, not a fan-out.
async function notifyDepartmentHead({ departmentId, reportNo, description }) {
  const { data: department, error: deptErr } = await supabase
    .from('bnf_departments')
    .select('head_profile_id, profiles(email, full_name)')
    .eq('id', departmentId)
    .maybeSingle();
  if (deptErr) throw deptErr;
  const email = department?.profiles?.email;
  if (!email) {
    console.warn('[bnf] no head_profile_id set for department', departmentId, 'report', reportNo, '— email skipped, report still saved');
    return { sent: 0, total: 0 };
  }
  const subject = `Laporan BNF Baru — ${reportNo}`;
  const html = `<p>Halo,</p><p>Ada laporan BNF baru <strong>${escapeHtml(reportNo)}</strong>:</p><p>${escapeHtml((description || '').slice(0, 300))}</p><p><a href="https://nexus.msigroup.co.id">Buka Nexus</a> untuk melihat detail laporan.</p><p style="color:#7A828E;font-size:12px;margin-top:24px;">Email otomatis dari Nexus by MSI.</p>`;
  try {
    await supabase.functions.invoke('send-email', { body: { to: email, subject, html } });
    return { sent: 1, total: 1 };
  } catch (e) {
    console.error('[bnf] send-email failed for department head, report', reportNo, 'department', departmentId, e?.message || e);
    return { sent: 0, total: 1 };
  }
}

// Best-effort notification to a report's original reporter when its status
// changes, regardless of who changed it (Tier 3 stays open by design) —
// skipped by the caller when the reporter is the one making the change.
// Fase C (2026-08-04). Simpler than notifyDepartmentHead: no join needed,
// the caller already has created_by in hand.
async function notifyReporterOnStatusChange({ createdBy, reportNo, newStatus }) {
  const { data: reporter, error: repErr } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', createdBy)
    .maybeSingle();
  if (repErr) throw repErr;
  const email = reporter?.email;
  if (!email) {
    console.warn('[bnf] reporter', createdBy, 'has no email, report', reportNo, '— status-change notification skipped');
    return;
  }
  const subject = `Status Laporan BNF Berubah — ${reportNo}`;
  const html = `<p>Halo,</p><p>Status laporan BNF <strong>${escapeHtml(reportNo)}</strong> yang Anda laporkan telah berubah menjadi <strong>${escapeHtml(newStatus)}</strong>.</p><p><a href="https://nexus.msigroup.co.id">Buka Nexus</a> untuk melihat detail laporan.</p><p style="color:#7A828E;font-size:12px;margin-top:24px;">Email otomatis dari Nexus by MSI.</p>`;
  try {
    await supabase.functions.invoke('send-email', { body: { to: email, subject, html } });
  } catch (e) {
    console.error('[bnf] send-email failed for reporter, report', reportNo, 'reporter', createdBy, e?.message || e);
  }
}

// Best-effort ADDITIONAL notification when a report's escalation_level is
// direktur_divisi/ceo — sent alongside (never instead of) notifyDepartmentHead
// at the same 2 call sites. No-op for '' / 'manager_direct' (Tier 3 default
// behavior stays exactly as before Fase D). Fase D (2026-08-04).
//
// 'direktur_divisi': single resolve via bnf_divisions.director_profile_id
// (same shape as notifyDepartmentHead's department lookup).
// 'ceo': role resolution (roles -> user_roles, company_id + code='ceo')
// mirrors MOMFormPage.jsx's notifyCEO() — but that function inserts in-app
// `notifications` rows, not email; this file is all-email, so only the
// role-lookup query is reused, delivery is adapted to send-email. A company
// can have multiple CEO-role holders (confirmed by MOM's own Set-dedup) —
// this sends to all of them, not just one.
async function notifyEscalationRecipients({ escalationLevel, divisionId, companyId, reportNo, description }) {
  if (escalationLevel !== 'direktur_divisi' && escalationLevel !== 'ceo') return;

  let emails = [];
  if (escalationLevel === 'direktur_divisi') {
    const { data: division, error: divErr } = await supabase
      .from('bnf_divisions')
      .select('director_profile_id, profiles(email, full_name)')
      .eq('id', divisionId)
      .maybeSingle();
    if (divErr) throw divErr;
    if (division?.profiles?.email) emails = [division.profiles.email];
    else console.warn('[bnf] no director_profile_id set for division', divisionId, 'report', reportNo, '— escalation email skipped');
  } else {
    const { data: roleRows, error: roleErr } = await supabase.from('roles').select('id').eq('company_id', companyId).eq('code', 'ceo');
    if (roleErr) throw roleErr;
    const roleIds = (roleRows || []).map((r) => r.id);
    if (roleIds.length) {
      const { data: urs, error: urErr } = await supabase.from('user_roles').select('user_id').eq('company_id', companyId).in('role_id', roleIds).eq('is_active', true).is('revoked_at', null);
      if (urErr) throw urErr;
      const userIds = [...new Set((urs || []).map((u) => u.user_id).filter(Boolean))];
      if (userIds.length) {
        const { data: profs, error: profErr } = await supabase.from('profiles').select('email').in('id', userIds);
        if (profErr) throw profErr;
        emails = (profs || []).map((p) => p.email).filter(Boolean);
      }
    }
    if (!emails.length) console.warn('[bnf] no CEO found for company', companyId, 'report', reportNo, '— escalation email skipped');
  }

  if (!emails.length) return;

  const levelLabel = escalationLabel(escalationLevel);
  const subject = `[Eskalasi ${levelLabel}] Laporan BNF — ${reportNo}`;
  const html = `<p>Halo,</p><p>Laporan BNF <strong>${escapeHtml(reportNo)}</strong> telah dieskalasi ke level <strong>${escapeHtml(levelLabel)}</strong>:</p><p>${escapeHtml((description || '').slice(0, 300))}</p><p><a href="https://nexus.msigroup.co.id">Buka Nexus</a> untuk melihat detail laporan.</p><p style="color:#7A828E;font-size:12px;margin-top:24px;">Email otomatis dari Nexus by MSI.</p>`;
  await Promise.all(emails.map((email) =>
    supabase.functions.invoke('send-email', { body: { to: email, subject, html } })
      .catch((e) => console.error('[bnf] escalation send-email failed, report', reportNo, 'recipient', email, e?.message || e))
  ));
}

async function generateBnfNo(companyId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const { data, error } = await supabase.rpc('increment_document_sequence', {
    p_company_id: companyId, p_document_type: 'BNF', p_department_code: 'BNF',
    p_year: year, p_month: month, p_day: day,
  });
  if (error) throw new Error('Gagal generate nomor laporan, coba lagi.');
  const pad2 = (n) => String(n).padStart(2, '0');
  return `BNF-${year}${pad2(month)}${pad2(day)}-${String(data).padStart(3, '0')}`;
}

// ============================================================================
// Shared bits
// ============================================================================
function StatusDot({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: INK }}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: STATUS_DOT_COLOR[status] || '#94A3B8' }} />
      {status}
    </span>
  );
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

// Multi-select chip list + picker for Divisi/Dept Irisan (Fase G) —
// generalizes BNFOrgRolesPage.jsx's AssigneeCell (single chip + X-remove,
// swap to picker when empty) into an array: one chip per selected id, with
// the picker always available below to add more. Local to this file — this
// exact composition (CodeNamePicker + chip list) is only used in 2 places,
// both in this file (BuatLaporanTab, DetailPanel edit-mode), unlike
// CodeNamePicker itself which is a cross-module picker.
function RelatedDepartmentsField({ selectedIds, allDepts, onAdd, onRemove }) {
  const [pickText, setPickText] = useState('');
  const selected = selectedIds.map((id) => allDepts.find((d) => d.id === id)).filter(Boolean);
  const pickableDepts = allDepts.filter((d) => !selectedIds.includes(d.id));

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((d) => (
            <span
              key={d.id}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium text-slate-700"
              style={{ borderColor: LINE, backgroundColor: '#FAFBFC' }}
            >
              {d.name}
              <button type="button" onClick={() => onRemove(d.id)} className="text-slate-400 hover:text-red-600">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <CodeNamePicker
        value={pickText}
        items={pickableDepts}
        inputClassName={inputCls}
        inputStyle={{ borderColor: LINE }}
        placeholder="Cari departemen lain yang terdampak (opsional)…"
        emptyText="Tidak ada departemen yang cocok"
        onChangeText={setPickText}
        onPick={(item) => { onAdd(item.id); setPickText(''); }}
      />
    </div>
  );
}

// ============================================================================
// Tab 1 — Buat Laporan (form, always on, no modal)
// ============================================================================
const FORM_SECTIONS = [
  { id: 'dasar',   label: 'Informasi Dasar', icon: FileText },
  { id: 'masalah', label: 'Detail Masalah',  icon: AlertCircle },
  { id: 'solusi',  label: 'Penanganan',      icon: Wrench },
  { id: 'target',  label: 'Target & Eskalasi', icon: Target },
];

function SectionHeading({ id }) {
  const s = FORM_SECTIONS.find((x) => x.id === id);
  const Icon = s.icon;
  return (
    <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: NAVY }}>
      <Icon size={15} strokeWidth={2.3} />
      {s.label}
    </div>
  );
}

const EMPTY_DRAFT = {
  division_id: '', department_id: '', related_department_ids: [],
  description: '', root_cause: '', solution: '',
  target_date: todayStr(), escalation_level: '',
};

function BuatLaporanTab({ profile, draft, setDraft, divisions, departments, saving, error, onReset, onSave }) {
  // Display text for the searchable Divisi/Departemen pickers. draft.division_id/
  // department_id stay the stored source of truth; these hold only what's
  // shown in each input — mirrors InquiryFormPage.jsx's prospectText/
  // customerText pattern for AccountPicker. Irisan (Fase G, multi-select) is
  // handled by RelatedDepartmentsField below, which owns its own picker text.
  const [divisionText, setDivisionText] = useState('');
  const [departmentText, setDepartmentText] = useState('');

  const deptOptions = departments.filter((d) => d.division_id === draft.division_id);
  // All departments, each annotated with its parent division's name as a
  // `category` badge (CodeNamePicker renders it top-right of each row) —
  // replaces the old <optgroup> grouping with a per-row badge instead.
  const allDeptsWithDivision = departments.map((d) => ({
    ...d,
    category: divisions.find((dv) => dv.id === d.division_id)?.name,
  }));

  const upd = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const pickInputCls = 'w-full rounded-md border px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors';

  const handleReset = () => {
    onReset();
    setDivisionText('');
    setDepartmentText('');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border bg-white" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: LINE }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: NAVY }}>
              {initials(profile?.full_name)}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-slate-800">{profile?.full_name || '—'}</div>
              <div className="text-[11px] text-slate-400">Pelapor — otomatis dari sesi login</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">No. Laporan</div>
            <div className="text-[13px] font-semibold" style={{ color: NAVY, fontFamily: "'IBM Plex Mono',monospace" }}>{previewReportNo()}</div>
          </div>
        </div>

        <div className="space-y-7 px-6 py-6">
          <div>
            <SectionHeading id="dasar" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Divisi</FieldLabel>
                <CodeNamePicker
                  value={divisionText}
                  items={divisions}
                  inputClassName={pickInputCls}
                  inputStyle={{ borderColor: LINE }}
                  placeholder="Cari / pilih divisi…"
                  onChangeText={(v) => { setDivisionText(v); setDraft((d) => ({ ...d, division_id: '' })); }}
                  onPick={(item) => {
                    setDivisionText(item.name);
                    // Cascading: changing division invalidates the previously picked department.
                    setDepartmentText('');
                    setDraft((d) => ({ ...d, division_id: item.id, department_id: '' }));
                  }}
                />
              </div>
              <div>
                <FieldLabel required>Departemen</FieldLabel>
                <CodeNamePicker
                  value={departmentText}
                  items={deptOptions}
                  disabled={!draft.division_id}
                  inputClassName={pickInputCls}
                  inputStyle={{ borderColor: LINE }}
                  placeholder={draft.division_id ? 'Cari / pilih departemen…' : 'Pilih divisi dulu'}
                  onChangeText={(v) => { setDepartmentText(v); upd('department_id', ''); }}
                  onPick={(item) => { setDepartmentText(item.name); upd('department_id', item.id); }}
                />
              </div>
              <div className="col-span-2">
                <FieldLabel>Divisi/Dept Irisan (opsional)</FieldLabel>
                <RelatedDepartmentsField
                  selectedIds={draft.related_department_ids}
                  allDepts={allDeptsWithDivision}
                  onAdd={(id) => upd('related_department_ids', [...draft.related_department_ids, id])}
                  onRemove={(id) => upd('related_department_ids', draft.related_department_ids.filter((x) => x !== id))}
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6" style={{ borderColor: LINE }}>
            <SectionHeading id="masalah" />
            <div className="space-y-4">
              <div>
                <FieldLabel required>Deskripsi Masalah (Bad News)</FieldLabel>
                <textarea rows={3} value={draft.description} onChange={(e) => upd('description', e.target.value)} placeholder="Jelaskan detail masalah secara rinci..." className={inputCls} style={{ borderColor: LINE }} />
              </div>
              <div>
                <FieldLabel required>Alasan / Root Cause</FieldLabel>
                <textarea rows={2} value={draft.root_cause} onChange={(e) => upd('root_cause', e.target.value)} placeholder="Penyebab utama timbulnya masalah..." className={inputCls} style={{ borderColor: LINE }} />
              </div>
            </div>
          </div>

          <div className="border-t pt-6" style={{ borderColor: LINE }}>
            <SectionHeading id="solusi" />
            <FieldLabel required>Solusi Penanganan</FieldLabel>
            <textarea rows={2} value={draft.solution} onChange={(e) => upd('solution', e.target.value)} placeholder="Rencana atau tindakan penanganan..." className={inputCls} style={{ borderColor: LINE }} />
          </div>

          <div className="border-t pt-6" style={{ borderColor: LINE }}>
            <SectionHeading id="target" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Target Penyelesaian</FieldLabel>
                <input type="date" value={draft.target_date} onChange={(e) => upd('target_date', e.target.value)} className={inputCls} style={{ borderColor: LINE }} />
              </div>
              <div>
                <FieldLabel>Eskalasi Lanjutan</FieldLabel>
                <Select value={draft.escalation_level} onChange={(e) => upd('escalation_level', e.target.value)}>
                  <option value="">Tidak ada</option>
                  {ESCALATION_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
            </div>
          </div>

          {error && <div className="rounded-md p-3 text-[13px]" style={{ backgroundColor: '#FEF2F2', color: DANGER }}>{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t px-6 py-4" style={{ borderColor: LINE, backgroundColor: '#FAFBFC' }}>
          <button onClick={handleReset} disabled={saving} className="rounded-md border px-4 py-2 text-[13px] font-semibold text-slate-600 disabled:opacity-50" style={{ borderColor: LINE }}>
            Reset
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: ORANGE }}
          >
            <Send size={14} /> {saving ? 'Menyimpan…' : 'Submit Laporan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab 2 — Overview (KPI strip + per-division breakdown + list, one view)
// ============================================================================
function OverviewTab({ loading, filtered, search, setSearch, filterStatus, setFilterStatus, dashboardStats, page, setPage, totalPages, pageRows, onSelect }) {
  return (
    <div>
      {/* compact stat strip */}
      <div className="mb-5 flex flex-wrap overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
        {[
          ['Total', dashboardStats.totals.total, INK],
          ['Open', dashboardStats.totals.Open, STATUS_DOT_COLOR.Open],
          ['In Progress', dashboardStats.totals['In Progress'], STATUS_DOT_COLOR['In Progress']],
          ['Escalated', dashboardStats.totals.Escalated, STATUS_DOT_COLOR.Escalated],
          ['Closed', dashboardStats.totals.Closed, STATUS_DOT_COLOR.Closed],
        ].map(([label, value, color], i) => (
          <div key={label} className="flex-1 px-5 py-3.5" style={{ minWidth: 120, borderLeft: i > 0 ? `1px solid ${LINE}` : 'none' }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color, fontFamily: "'IBM Plex Mono',monospace" }}>{value}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* per-division breakdown — flexible count, not hardcoded to 4 columns
          (seed data has 4 divisions today, but this shouldn't assume that). */}
      {dashboardStats.divisionRows.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-3">
          {dashboardStats.divisionRows.map((d) => (
            <div key={d.name} className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: LINE, flex: '1 1 160px' }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-slate-700">{d.name}</span>
                <span className="text-sm font-bold" style={{ color: NAVY, fontFamily: "'IBM Plex Mono',monospace" }}>{d.total}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">aktif</div>
            </div>
          ))}
        </div>
      )}

      {/* table */}
      <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: LINE }}>
          <span className="text-[13px] font-semibold text-slate-700">Daftar Laporan</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari ID / pelapor / divisi / deskripsi…"
                className="rounded-md border py-1.5 pl-7 pr-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                style={{ borderColor: LINE, width: 220, fontFamily: 'inherit' }}
              />
            </div>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 180 }}>
              <option value="active">Aktif (bukan Closed)</option>
              <option value="all">Semua Status</option>
              {STATUS_FORM.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr style={{ backgroundColor: '#FAFBFC' }}>
                {['ID', 'Pelapor', 'Divisi / Dept', 'Deskripsi', 'Target', 'Status', 'Urgensi', ''].map((h) => (
                  <th key={h} className="border-b px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500" style={{ borderColor: LINE }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Memuat data…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Belum ada laporan BNF</td></tr>
              ) : pageRows.map((r) => {
                const u = urgencyLabel(r);
                return (
                  <tr
                    key={r.id}
                    onClick={() => onSelect(r)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    style={{ borderBottom: `1px solid ${LINE}` }}
                  >
                    <td className="px-4 py-3 text-[12px] text-slate-500" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{r.report_no}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{r.reporter_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.division?.name || '—'} · {r.department?.name || '—'}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">{r.description}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(r.target_date)}</td>
                    <td className="px-4 py-3"><StatusDot status={r.status} /></td>
                    <td className="px-4 py-3 text-[12px] font-semibold" style={{ color: u.color }}>{u.text}</td>
                    <td className="px-4 py-3 text-right"><ArrowUpRight size={14} className="ml-auto text-slate-300" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-[13px] text-slate-500" style={{ borderColor: LINE }}>
            <span>Halaman {page + 1} dari {totalPages} ({filtered.length} total)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="rounded-md border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: LINE }}>
                ← Prev
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="rounded-md border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: LINE }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tab 3 — Tarik dari Insiden (pending_review daily_report_items → 2 actions)
// ============================================================================
function TarikInsidenTab({ items, loading, actionId, onResolveInternal, onOpenPull }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
      <div className="border-b px-5 py-3" style={{ borderColor: LINE }}>
        <span className="text-[13px] font-semibold text-slate-700">Insiden Menunggu Review</span>
        <span className="ml-2 text-[11px] text-slate-400">dari Briefing Harian</span>
      </div>
      {loading ? (
        <div className="px-4 py-12 text-center text-[13px] text-slate-400">Memuat…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-slate-400">Tidak ada insiden menunggu review</div>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 last:border-b-0" style={{ borderColor: LINE }}>
              <div className="min-w-0 flex-1" style={{ minWidth: 240 }}>
                <p className="text-[13px] leading-relaxed text-slate-700" style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>
                <div className="mt-1.5 text-[11px] text-slate-400">
                  {item.department?.name || '—'} · {item.reporter_name || '—'} · {fmtDate(item.entry_date)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onResolveInternal(item)}
                  disabled={actionId === item.id}
                  className="rounded-md border px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 disabled:opacity-50"
                  style={{ borderColor: LINE }}
                >
                  {actionId === item.id ? 'Menyimpan…' : 'Selesai Internal'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPull(item)}
                  disabled={actionId === item.id}
                  className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: ORANGE }}
                >
                  Tarik jadi Laporan BNF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Small centered modal (not the slide-over pattern used by DetailPanel, not
// BuatLaporanTab's always-on inline form) — this is a secondary, one-off
// action triggered from a list row, closer in weight to ConfirmModal than to
// a primary page flow, so a centered modal fits best. description is
// display-only (read from the source insiden item, per spec); division/
// department reuse the same CodeNamePicker pair as BuatLaporanTab/DetailPanel
// edit-mode, prefilled from the item's department but still editable.
function PullToBnfModal({ item, divisions, departments, saving, error, onSubmit, onClose }) {
  const [divisionText, setDivisionText] = useState('');
  const [departmentText, setDepartmentText] = useState('');
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    // Derives local form state from the `item` prop on open/close — same
    // reset-on-prop-change shape as DetailPanel's own pre-existing
    // newStatus/note/editMode effect just below in this file (also flagged,
    // left as-is there).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!item) { setDraft(null); return; }
    const dept = departments.find((d) => d.id === item.department_id) || null;
    const div = dept ? divisions.find((d) => d.id === dept.division_id) || null : null;
    setDraft({
      division_id: div?.id || '',
      department_id: dept?.id || '',
      target_date: todayStr(),
      escalation_level: '',
    });
    setDivisionText(div?.name || '');
    setDepartmentText(dept?.name || '');
  }, [item, departments, divisions]);

  if (!item || !draft) return null;

  const deptOptions = departments.filter((d) => d.division_id === draft.division_id);
  const upd = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const canSubmit = !!draft.division_id && !!draft.department_id && !!draft.target_date;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: LINE }}>
          <span className="text-[15px] font-bold text-slate-800">Tarik jadi Laporan BNF</span>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <FieldLabel>Deskripsi Masalah (dari insiden — tidak bisa diubah)</FieldLabel>
            <div className="rounded-md border p-3 text-[13px] leading-relaxed text-slate-600" style={{ borderColor: LINE, backgroundColor: '#FAFBFC', whiteSpace: 'pre-wrap' }}>
              {item.description}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Divisi</FieldLabel>
              <CodeNamePicker
                value={divisionText}
                items={divisions}
                inputClassName={inputCls}
                inputStyle={{ borderColor: LINE }}
                placeholder="Cari / pilih divisi…"
                onChangeText={(v) => { setDivisionText(v); upd('division_id', ''); }}
                onPick={(it) => { setDivisionText(it.name); setDepartmentText(''); setDraft((d) => ({ ...d, division_id: it.id, department_id: '' })); }}
              />
            </div>
            <div>
              <FieldLabel required>Departemen</FieldLabel>
              <CodeNamePicker
                value={departmentText}
                items={deptOptions}
                disabled={!draft.division_id}
                inputClassName={inputCls}
                inputStyle={{ borderColor: LINE }}
                placeholder={draft.division_id ? 'Cari / pilih departemen…' : 'Pilih divisi dulu'}
                onChangeText={(v) => { setDepartmentText(v); upd('department_id', ''); }}
                onPick={(it) => { setDepartmentText(it.name); upd('department_id', it.id); }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Target Penyelesaian</FieldLabel>
              <input type="date" value={draft.target_date} onChange={(e) => upd('target_date', e.target.value)} className={inputCls} style={{ borderColor: LINE }} />
            </div>
            <div>
              <FieldLabel>Eskalasi Lanjutan</FieldLabel>
              <Select value={draft.escalation_level} onChange={(e) => upd('escalation_level', e.target.value)}>
                <option value="">Tidak ada</option>
                {ESCALATION_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          </div>
          {error && <div className="rounded-md p-3 text-[13px]" style={{ backgroundColor: '#FEF2F2', color: DANGER }}>{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4" style={{ borderColor: LINE, backgroundColor: '#FAFBFC' }}>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-4 py-2 text-[13px] font-semibold text-slate-600 disabled:opacity-50" style={{ borderColor: LINE }}>
            Batal
          </button>
          <button
            type="button"
            onClick={() => onSubmit(draft)}
            disabled={saving || !canSubmit}
            className="rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: ORANGE }}
          >
            {saving ? 'Menyimpan…' : 'Tarik jadi Laporan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ActionItemsSection extracted to src/components/BnfActionItemsChecklist.jsx
// (2026-08-12) — reused as-is by MeetingMingguanPage.jsx for BNF-sourced
// weekly meeting items. See its usage in DetailPanel below.

// ============================================================================
// Detail slide-over (right side panel, replaces the old centered modal)
// ============================================================================
function DetailPanel({ report, logs, logsLoading, saving, error, reminderSending, canEdit, divisions, departments, actionItems, actionItemsLoading, actionItemSaving, actionItemPeople, onToggleActionItem, onAddActionItem, onChangeStatus, onSendReminder, onSaveEdit, onDelete, onClose }) {
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  // Same "picker shows text, draft holds the id" split as BuatLaporanTab.
  // Irisan (Fase G, multi-select) has no single text — RelatedDepartmentsField
  // owns its own picker-input text internally.
  const [divisionText, setDivisionText] = useState('');
  const [departmentText, setDepartmentText] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => { setNewStatus(report?.status || ''); setNote(''); setEditMode(false); }, [report?.id, report?.status]);

  if (!report) return null;
  const u = urgencyLabel(report);
  // Tugas 3 "siap Closed" indicator — pure signal, never gates the status
  // button itself (onChangeStatus/Select above stay untouched).
  const readyToClose = actionItems.length >= 1 && actionItems.every((it) => it.is_done);

  const startEdit = () => {
    setEditDraft({
      division_id: report.division_id,
      department_id: report.department_id,
      related_department_ids: (report.related_departments || []).map((rd) => rd.department?.id).filter(Boolean),
      description: report.description || '',
      root_cause: report.root_cause || '',
      solution: report.solution || '',
      target_date: report.target_date || '',
      escalation_level: report.escalation_level || '',
    });
    setDivisionText(report.division?.name || '');
    setDepartmentText(report.department?.name || '');
    setEditMode(true);
  };
  const cancelEdit = () => { setEditMode(false); setEditDraft(null); };

  const deptOptions = editDraft ? departments.filter((d) => d.division_id === editDraft.division_id) : [];
  const allDeptsWithDivision = departments.map((d) => ({
    ...d,
    category: divisions.find((dv) => dv.id === d.division_id)?.name,
  }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: LINE }}>
          <div>
            <div className="text-[12px] font-semibold text-slate-400" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{report.report_no}</div>
            <div className="mt-0.5 text-[15px] font-bold text-slate-800">{report.division?.name || '—'} · {report.department?.name || '—'}</div>
          </div>
          <div className="flex items-center gap-1">
            {/* Defense-in-depth only — canEdit hides the affordance for
                non-owner/non-admin, but guard_bnf_reports_field_update
                (Fase A trigger, Tier 2) is the real enforcement either way. */}
            {canEdit && !editMode && (
              <>
                <button onClick={startEdit} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit laporan">
                  <Pencil size={16} />
                </button>
                <button onClick={() => setDeleteConfirmOpen(true)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus laporan">
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="flex items-center gap-4 text-[13px]">
            <StatusDot status={report.status} />
            <span className="text-slate-500">Pelapor: <strong className="text-slate-700">{report.reporter_name || '—'}</strong></span>
          </div>

          {editMode ? (
            <div className="space-y-4 rounded-md border p-4" style={{ borderColor: LINE }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Divisi</FieldLabel>
                  <CodeNamePicker
                    value={divisionText}
                    items={divisions}
                    inputClassName={inputCls}
                    inputStyle={{ borderColor: LINE }}
                    placeholder="Cari / pilih divisi…"
                    onChangeText={(v) => { setDivisionText(v); setEditDraft((d) => ({ ...d, division_id: '' })); }}
                    onPick={(item) => {
                      setDivisionText(item.name);
                      setDepartmentText('');
                      setEditDraft((d) => ({ ...d, division_id: item.id, department_id: '' }));
                    }}
                  />
                </div>
                <div>
                  <FieldLabel required>Departemen</FieldLabel>
                  <CodeNamePicker
                    value={departmentText}
                    items={deptOptions}
                    disabled={!editDraft.division_id}
                    inputClassName={inputCls}
                    inputStyle={{ borderColor: LINE }}
                    placeholder={editDraft.division_id ? 'Cari / pilih departemen…' : 'Pilih divisi dulu'}
                    onChangeText={(v) => { setDepartmentText(v); setEditDraft((d) => ({ ...d, department_id: '' })); }}
                    onPick={(item) => { setDepartmentText(item.name); setEditDraft((d) => ({ ...d, department_id: item.id })); }}
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Divisi/Dept Irisan (opsional)</FieldLabel>
                  <RelatedDepartmentsField
                    selectedIds={editDraft.related_department_ids}
                    allDepts={allDeptsWithDivision}
                    onAdd={(id) => setEditDraft((d) => ({ ...d, related_department_ids: [...d.related_department_ids, id] }))}
                    onRemove={(id) => setEditDraft((d) => ({ ...d, related_department_ids: d.related_department_ids.filter((x) => x !== id) }))}
                  />
                </div>
              </div>
              <div>
                <FieldLabel required>Deskripsi Masalah</FieldLabel>
                <textarea rows={3} value={editDraft.description} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} className={inputCls} style={{ borderColor: LINE }} />
              </div>
              <div>
                <FieldLabel>Root Cause</FieldLabel>
                <textarea rows={2} value={editDraft.root_cause} onChange={(e) => setEditDraft((d) => ({ ...d, root_cause: e.target.value }))} className={inputCls} style={{ borderColor: LINE }} />
              </div>
              <div>
                <FieldLabel>Solusi Penanganan</FieldLabel>
                <textarea rows={2} value={editDraft.solution} onChange={(e) => setEditDraft((d) => ({ ...d, solution: e.target.value }))} className={inputCls} style={{ borderColor: LINE }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Target Penyelesaian</FieldLabel>
                  <input type="date" value={editDraft.target_date} onChange={(e) => setEditDraft((d) => ({ ...d, target_date: e.target.value }))} className={inputCls} style={{ borderColor: LINE }} />
                </div>
                <div>
                  <FieldLabel>Eskalasi Lanjutan</FieldLabel>
                  <Select value={editDraft.escalation_level} onChange={(e) => setEditDraft((d) => ({ ...d, escalation_level: e.target.value }))}>
                    <option value="">Tidak ada</option>
                    {ESCALATION_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={cancelEdit} disabled={saving} className="rounded-md border px-4 py-2 text-[13px] font-semibold text-slate-600 disabled:opacity-50" style={{ borderColor: LINE }}>
                  Batal
                </button>
                <button onClick={() => onSaveEdit(editDraft)} disabled={saving} className="rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60" style={{ backgroundColor: ORANGE }}>
                  {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {[
                ['Deskripsi Masalah', report.description],
                ['Root Cause', report.root_cause],
                ['Solusi Penanganan', report.solution],
              ].map(([label, text]) => (
                <div key={label} className="rounded-md border p-4" style={{ borderColor: LINE }}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700" style={{ whiteSpace: 'pre-wrap' }}>{text || '—'}</p>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-4" style={{ borderColor: LINE }}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Divisi/Dept Irisan</div>
                  <div className="mt-1.5 text-[13px] text-slate-700">{report.related_departments?.length ? report.related_departments.map((rd) => rd.department?.name).filter(Boolean).join(', ') : '—'}</div>
                </div>
                <div className="rounded-md border p-4" style={{ borderColor: LINE }}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Eskalasi Lanjutan</div>
                  <div className="mt-1.5 text-[13px] text-slate-700">{report.escalation_level ? escalationLabel(report.escalation_level) : '—'}</div>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-4" style={{ borderColor: LINE }}>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Target</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-700">{fmtDate(report.target_date)}</div>
              <div className="mt-0.5 text-[12px] font-semibold" style={{ color: u.color }}>{u.text}</div>
            </div>
            <div className="rounded-md border p-4" style={{ borderColor: LINE }}>
              <div className="flex items-center gap-1.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Ubah Status</div>
                {/* Pure indicator (Tugas 3) — never blocks the Closed action below,
                    just signals every action item is done before closing. */}
                {readyToClose && (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                    <Check size={10} strokeWidth={3} /> Siap Closed
                  </span>
                )}
              </div>
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={{ marginTop: 4 }}>
                {STATUS_FORM.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Catatan (opsional)…"
                className={inputCls + ' mt-2'}
                style={{ borderColor: LINE, fontFamily: 'inherit' }}
              />
              <button
                onClick={() => onChangeStatus(newStatus, note)}
                disabled={saving || newStatus === report.status}
                className="mt-2 w-full rounded-md py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: NAVY }}
              >
                {saving ? 'Menyimpan…' : 'Simpan Status'}
              </button>
            </div>
          </div>

          {error && <div className="rounded-md p-3 text-[13px]" style={{ backgroundColor: '#FEF2F2', color: DANGER }}>{error}</div>}

          <BnfActionItemsChecklist
            items={actionItems}
            loading={actionItemsLoading}
            saving={actionItemSaving}
            people={actionItemPeople}
            onToggle={onToggleActionItem}
            onAdd={onAddActionItem}
          />

          <div>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Riwayat Status</div>
            {logsLoading ? (
              <div className="text-[13px] text-slate-400">Memuat riwayat…</div>
            ) : logs.length === 0 ? (
              <div className="text-[13px] italic text-slate-400">Belum ada perubahan status.</div>
            ) : (
              <div className="space-y-2">
                {logs.map((l) => (
                  <div key={l.id} className="rounded-md p-3 text-[12.5px] text-slate-600" style={{ backgroundColor: '#FAFBFC' }}>
                    <span className="font-semibold text-slate-800">{l.from_status || 'Baru'} → {l.to_status}</span>
                    {' · '}{l.changed_by_name || 'Seseorang'}{' · '}{fmtDateTime(l.changed_at)}
                    {l.note && <div className="mt-1 italic">{l.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onSendReminder}
            disabled={reminderSending}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 py-2.5 text-[13px] font-semibold disabled:opacity-50"
            style={{ borderColor: NAVY, color: NAVY }}
          >
            <Mail size={14} /> {reminderSending ? 'Mengirim…' : 'Kirim Reminder'}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Hapus laporan?"
        message="Laporan ini akan dihapus dan tidak lagi muncul di daftar. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={() => { setDeleteConfirmOpen(false); onDelete(); }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}

// ============================================================================
// Root
// ============================================================================
export default function BNFListPage({ showToast }) {
  const { profile, erpRole, user } = useAuth();
  const isAllEntities = ['super_admin'].includes(erpRole);

  const [tab, setTab] = useState('form'); // form | insiden | overview

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('active'); // active = bukan Closed
  const [page, setPage] = useState(0);

  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detail, setDetail] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);

  // Tugas 2 — Tarik dari Insiden
  const [pendingInsiden, setPendingInsiden] = useState([]);
  const [insidenLoading, setInsidenLoading] = useState(true);
  const [insidenActionId, setInsidenActionId] = useState(null); // row.id currently being resolved/pulled
  const [pullModalItem, setPullModalItem] = useState(null); // insiden item currently open in PullToBnfModal
  const [pullSaving, setPullSaving] = useState(false);
  const [pullError, setPullError] = useState(null);

  // Tugas 3 — Action Items checklist (scoped to whichever report `detail` is open)
  const [actionItems, setActionItems] = useState([]);
  const [actionItemsLoading, setActionItemsLoading] = useState(false);
  const [actionItemSaving, setActionItemSaving] = useState(null); // 'new' or an item id
  const [actionItemPeople, setActionItemPeople] = useState([]);

  const fetchReports = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('bnf_reports')
        .select(`
          *,
          division:bnf_divisions!bnf_reports_division_id_fkey(name),
          department:bnf_departments!bnf_reports_department_id_fkey(name),
          related_departments:bnf_report_related_departments!bnf_report_related_departments_report_id_fkey(department:bnf_departments!bnf_report_related_departments_department_id_fkey(id, name))
        `)
        // Ascending — insertion order, so chips/list stay in the order the
        // user picked them in (not affected by the outer .order() below,
        // which only sorts bnf_reports itself, not embedded relations).
        .order('created_at', { referencedTable: 'related_departments', ascending: true })
        .is('deleted_at', null);
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;

      const list = data || [];
      // created_by FKs to auth.users, not profiles — resolve names via a
      // second query (same shape as ActivitiesPage.jsx's salesperson nameMap).
      const reporterIds = [...new Set(list.map((r) => r.created_by).filter(Boolean))];
      const nameMap = {};
      if (reporterIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', reporterIds).limit(1000);
        (profs || []).forEach((p) => { nameMap[p.id] = p.full_name; });
      }

      setRows(list.map((r) => ({ ...r, reporter_name: nameMap[r.created_by] || null })));
    } catch (err) {
      showToast?.('Gagal memuat data laporan BNF: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, showToast]);

  useEffect(() => { fetchReports(); }, [fetchReports]);
  useEffect(() => { setPage(0); }, [search, filterStatus]);

  const loadFormOptions = useCallback(async () => {
    if (!profile?.company_id) return;
    const [divRes, depRes] = await Promise.all([
      supabase.from('bnf_divisions').select('id, code, name').eq('company_id', profile.company_id).eq('is_active', true).is('deleted_at', null).order('name').limit(1000),
      supabase.from('bnf_departments').select('id, code, name, division_id').eq('company_id', profile.company_id).eq('is_active', true).is('deleted_at', null).order('name').limit(1000),
    ]);
    setDivisions(divRes.data || []);
    setDepartments(depRes.data || []);
  }, [profile?.company_id]);

  // Form is always visible (no more modal trigger) — load Divisi/Departemen
  // options once on mount instead of on an "open" click.
  useEffect(() => { loadFormOptions(); }, [loadFormOptions]);

  // ==========================================================================
  // Tugas 2 — Tarik dari Insiden
  // ==========================================================================
  // Body extracted to src/lib/bnfOrgScope.js (2026-08-12) so
  // MeetingMingguanPage.jsx's department picker can reuse the exact same
  // resolution — see that file for the full explanation of what this
  // returns. Thin local wrapper kept so the call site below
  // (resolveMyDeptScope()) and its dependency-array shape stay unchanged.
  const resolveMyDeptScope = useCallback(
    () => resolveMyDeptScopeShared({ isAllEntities, profileId: profile?.id, companyId: profile?.company_id }),
    [isAllEntities, profile]
  );

  const fetchPendingInsiden = useCallback(async () => {
    if (!profile?.id) return;
    setInsidenLoading(true);
    try {
      const deptScope = await resolveMyDeptScope();
      let query = supabase
        .from('daily_report_items')
        .select(`
          id, entry_date, description, department_id, created_by,
          department:bnf_departments!daily_report_items_department_id_fkey(id, name, division_id)
        `)
        .eq('category', 'insiden')
        .eq('insiden_resolution', 'pending_review');
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      if (deptScope) query = query.in('department_id', deptScope);

      const { data, error } = await query.order('entry_date', { ascending: true }).limit(1000);
      if (error) throw error;

      const list = data || [];
      const reporterIds = [...new Set(list.map((r) => r.created_by).filter(Boolean))];
      const nameMap = {};
      if (reporterIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', reporterIds).limit(1000);
        (profs || []).forEach((p) => { nameMap[p.id] = p.full_name; });
      }
      setPendingInsiden(list.map((r) => ({ ...r, reporter_name: nameMap[r.created_by] || null })));
    } catch (err) {
      showToast?.('Gagal memuat insiden: ' + err.message, 'error');
    } finally {
      setInsidenLoading(false);
    }
  }, [profile, isAllEntities, resolveMyDeptScope, showToast]);

  // Same accepted fetch-on-mount shape as fetchReports/loadFormOptions above
  // (also flagged by this rule, left as-is there too) — not a new pattern.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchPendingInsiden(); }, [fetchPendingInsiden]);

  // "Selesai Internal" — closes the loop at daily_report_items, no bnf_reports
  // involvement. Passes the guard_daily_report_items_field_update trigger
  // (Fase A, requires is_bnf_authorized()) purely because this page is
  // already gated to authorized users (Tugas 1) — no extra FE check needed.
  const handleResolveInternal = useCallback(async (item) => {
    setInsidenActionId(item.id);
    try {
      const { error } = await supabase.from('daily_report_items').update({
        insiden_resolution: 'resolved_internal',
        resolved_by: profile.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (error) throw error;
      showToast?.('Insiden ditandai selesai internal');
      fetchPendingInsiden();
    } catch (err) {
      showToast?.('Gagal menandai selesai: ' + err.message, 'error');
    } finally {
      setInsidenActionId(null);
    }
  }, [profile, fetchPendingInsiden, showToast]);

  // "Tarik jadi Laporan BNF" — CREATE bnf_reports then UPDATE the source
  // daily_report_items row. Reuses generateBnfNo (already defined above,
  // same as the normal Buat Laporan flow) and ACTION_TYPES.CREATE_BNF_REPORT
  // (same audit action as a normal create, distinguished via `notes`) — no
  // new audit action type added. If the bnf_reports insert succeeds but the
  // daily_report_items update fails, the error message says so explicitly
  // (report already exists, don't retry) rather than presenting a generic
  // failure that could lead to a duplicate report on retry.
  const handlePullToBnf = useCallback(async (draft) => {
    if (!pullModalItem) return;
    setPullSaving(true);
    setPullError(null);
    try {
      const reportNo = await generateBnfNo(profile.company_id);
      const payload = {
        report_no: reportNo,
        company_id: profile.company_id,
        division_id: draft.division_id,
        department_id: draft.department_id,
        description: pullModalItem.description,
        root_cause: null,
        solution: null,
        target_date: draft.target_date,
        escalation_level: draft.escalation_level || null,
        status: 'Open',
        created_by: profile.id,
      };
      const { data: created, error } = await supabase.from('bnf_reports').insert(payload).select('id').single();
      if (error) throw error;

      const { error: updErr } = await supabase.from('daily_report_items').update({
        insiden_resolution: 'pulled_to_bnf',
        pulled_to_bnf_report_id: created.id,
        resolved_by: profile.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', pullModalItem.id);
      if (updErr) {
        throw new Error(`Laporan ${reportNo} berhasil dibuat, tapi gagal menandai insiden asal sebagai "ditarik": ${updErr.message}. Jangan tarik ulang — laporan ${reportNo} sudah ada.`);
      }

      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_BNF_REPORT,
        entityType: ENTITY_TYPES.BNF_REPORT,
        entityId: created?.id ?? null,
        entityLabel: reportNo,
        notes: 'Ditarik dari insiden Briefing Harian',
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });

      // Best-effort notification — same pattern as handleSave's create-time notify.
      notifyDepartmentHead({ departmentId: draft.department_id, reportNo, description: pullModalItem.description })
        .catch((e) => console.error('[bnf] pull-to-bnf notify failed:', e?.message || e));
      notifyEscalationRecipients({ escalationLevel: draft.escalation_level, divisionId: draft.division_id, companyId: profile.company_id, reportNo, description: pullModalItem.description })
        .catch((e) => console.error('[bnf] pull-to-bnf escalation notify failed:', e?.message || e));

      showToast?.(`Laporan ${reportNo} berhasil dibuat dari insiden`);
      setPullModalItem(null);
      fetchPendingInsiden();
      fetchReports();
    } catch (err) {
      setPullError('Gagal menarik ke laporan BNF: ' + err.message);
    } finally {
      setPullSaving(false);
    }
  }, [pullModalItem, profile, user, erpRole, fetchPendingInsiden, fetchReports, showToast]);

  const resetDraft = () => { setDraft({ ...EMPTY_DRAFT, target_date: todayStr() }); setFormError(null); };

  const handleSave = useCallback(async () => {
    if (!draft.division_id)   { setFormError('Divisi wajib dipilih.'); return; }
    if (!draft.department_id) { setFormError('Departemen wajib dipilih.'); return; }
    if (!draft.description.trim()) { setFormError('Deskripsi masalah wajib diisi.'); return; }
    if (!draft.target_date)   { setFormError('Target penyelesaian wajib diisi.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const reportNo = await generateBnfNo(profile.company_id);
      const payload = {
        report_no: reportNo,
        company_id: profile.company_id,
        division_id: draft.division_id,
        department_id: draft.department_id,
        description: draft.description.trim(),
        root_cause: draft.root_cause?.trim() || null,
        solution: draft.solution?.trim() || null,
        target_date: draft.target_date,
        escalation_level: draft.escalation_level || null,
        status: 'Open',
        created_by: profile.id,
      };
      const { data: created, error } = await supabase.from('bnf_reports').insert(payload).select('id').single();
      if (error) throw error;

      // Irisan (Fase G) — separate insert into the junction table, same
      // "console.error and continue" tolerance as the bnf_report_logs insert
      // in handleStatusChange below: the report row itself is already saved
      // and complete (Irisan is optional), so a failure here shouldn't be
      // treated as fatal to the whole submit.
      if (draft.related_department_ids.length) {
        const { error: relErr } = await supabase.from('bnf_report_related_departments').insert(
          draft.related_department_ids.map((department_id) => ({ report_id: created.id, department_id }))
        );
        if (relErr) console.error('[bnf] related-departments insert failed:', relErr.message);
      }

      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_BNF_REPORT,
        entityType: ENTITY_TYPES.BNF_REPORT,
        entityId: created?.id ?? null,
        entityLabel: reportNo,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });

      // Best-effort notification — mirrors InquiryChatter.jsx: never blocks
      // or fails the submit itself, console-only on failure.
      notifyDepartmentHead({ departmentId: draft.department_id, reportNo, description: draft.description })
        .catch((e) => console.error('[bnf] create-time notify failed:', e?.message || e));
      // Escalation add-on (Fase D) — no-op unless escalation_level is
      // direktur_divisi/ceo. companyId = profile.company_id here is correct:
      // a report is always created under the creator's own company.
      notifyEscalationRecipients({ escalationLevel: draft.escalation_level, divisionId: draft.division_id, companyId: profile.company_id, reportNo, description: draft.description })
        .catch((e) => console.error('[bnf] create-time escalation notify failed:', e?.message || e));

      showToast?.(`Laporan ${reportNo} berhasil dibuat`);
      resetDraft();
      setTab('overview');
      fetchReports();
    } catch (err) {
      setFormError('Gagal menyimpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [draft, profile, user, erpRole, fetchReports, showToast]);

  // ==========================================================================
  // Tugas 3 — Action Items checklist
  // ==========================================================================
  // people scoped to the REPORT's own company (row.company_id), not the
  // viewer's — mirrors handleSendReminder's existing detail.company_id note
  // above (a super_admin can be viewing a report from a different company
  // than their own; PICs must come from the report's company either way).
  const fetchActionItems = useCallback(async (row) => {
    setActionItemsLoading(true);
    try {
      const [itemsRes, peopleRes] = await Promise.all([
        supabase.from('bnf_report_action_items').select('*').eq('report_id', row.id).order('created_at', { ascending: true }).limit(1000),
        supabase.from('profiles').select('id, full_name, email').eq('company_id', row.company_id).eq('active', true).order('full_name').limit(1000),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (peopleRes.error) throw peopleRes.error;
      const people = peopleRes.data || [];
      const nameMap = {};
      people.forEach((p) => { nameMap[p.id] = p.full_name; });
      // completed_by references auth.users(id), assigned_to references
      // profiles(id) — same underlying id in this schema (profiles.id IS the
      // auth user id), so one nameMap resolves both, same as reporter_name/
      // changed_by_name elsewhere in this file.
      setActionItems((itemsRes.data || []).map((it) => ({
        ...it,
        assignee_name: nameMap[it.assigned_to] || null,
        completed_by_name: it.completed_by ? (nameMap[it.completed_by] || null) : null,
      })));
      setActionItemPeople(people);
    } catch (err) {
      showToast?.('Gagal memuat action items: ' + err.message, 'error');
    } finally {
      setActionItemsLoading(false);
    }
  }, [showToast]);

  const handleToggleActionItem = useCallback(async (item) => {
    if (!detail) return;
    setActionItemSaving(item.id);
    try {
      const payload = item.is_done
        ? { is_done: false, completed_by: null, completed_at: null }
        : { is_done: true, completed_by: profile.id, completed_at: new Date().toISOString() };
      const { error } = await supabase.from('bnf_report_action_items').update(payload).eq('id', item.id);
      if (error) throw error;
      fetchActionItems(detail);
    } catch (err) {
      showToast?.('Gagal mengubah status action item: ' + err.message, 'error');
    } finally {
      setActionItemSaving(null);
    }
  }, [detail, profile, fetchActionItems, showToast]);

  const handleAddActionItem = useCallback(async ({ description, assigned_to }, onSuccess) => {
    if (!detail) return;
    setActionItemSaving('new');
    try {
      const { error } = await supabase.from('bnf_report_action_items').insert({
        report_id: detail.id,
        description,
        assigned_to,
        created_by: profile.id,
      });
      if (error) throw error;
      onSuccess?.();
      fetchActionItems(detail);
    } catch (err) {
      showToast?.('Gagal menambah action item: ' + err.message, 'error');
    } finally {
      setActionItemSaving(null);
    }
  }, [detail, profile, fetchActionItems, showToast]);

  const openDetail = (row) => {
    setDetail(row);
    setDetailError(null);
    setLogsLoading(true);
    supabase.from('bnf_report_logs').select('*').eq('report_id', row.id).order('changed_at', { ascending: false }).limit(200)
      .then(async ({ data }) => {
        const list = data || [];
        const ids = [...new Set(list.map((l) => l.changed_by).filter(Boolean))];
        const nameMap = {};
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids).limit(1000);
          (profs || []).forEach((p) => { nameMap[p.id] = p.full_name; });
        }
        setLogs(list.map((l) => ({ ...l, changed_by_name: nameMap[l.changed_by] || null })));
        setLogsLoading(false);
      });
    fetchActionItems(row);
  };

  const handleStatusChange = useCallback(async (newStatus, note) => {
    if (!detail || newStatus === detail.status) return;
    setDetailSaving(true);
    setDetailError(null);
    try {
      const payload = { status: newStatus, updated_by: profile.id };
      if (newStatus === 'Closed') payload.closed_at = new Date().toISOString();
      const { error } = await supabase.from('bnf_reports').update(payload).eq('id', detail.id);
      if (error) throw error;

      const { error: logErr } = await supabase.from('bnf_report_logs').insert({
        report_id: detail.id, from_status: detail.status, to_status: newStatus,
        note: note?.trim() || null, changed_by: profile.id,
      });
      if (logErr) console.error('[bnf] status log insert failed:', logErr.message);

      logAudit(supabase, {
        action: ACTION_TYPES.UPDATE_BNF_REPORT,
        entityType: ENTITY_TYPES.BNF_REPORT,
        entityId: detail.id,
        entityLabel: detail.report_no,
        notes: `${detail.status} → ${newStatus}`,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });

      // Best-effort notification to the original reporter — never blocks the
      // status-change itself. Skipped when the reporter is the one making
      // the change (no point notifying yourself).
      if (detail.created_by !== profile.id) {
        notifyReporterOnStatusChange({ createdBy: detail.created_by, reportNo: detail.report_no, newStatus })
          .catch((e) => console.error('[bnf] reporter notify failed:', e?.message || e));
      }

      showToast?.('Status laporan diperbarui');
      setDetail(null);
      fetchReports();
    } catch (err) {
      setDetailError('Gagal mengubah status: ' + err.message);
    } finally {
      setDetailSaving(false);
    }
  }, [detail, profile, user, erpRole, fetchReports, showToast]);

  // Edit isi laporan (Fase C) — FE-side gate is defense-in-depth only;
  // guard_bnf_reports_field_update (DB trigger, Fase A) is the real
  // enforcement (Tier 2: creator or admin_or_above may touch these fields).
  const handleSaveEdit = useCallback(async (editDraft) => {
    if (!detail) return;
    if (!editDraft.division_id)   { setDetailError('Divisi wajib dipilih.'); return; }
    if (!editDraft.department_id) { setDetailError('Departemen wajib dipilih.'); return; }
    if (!editDraft.description.trim()) { setDetailError('Deskripsi masalah wajib diisi.'); return; }
    if (!editDraft.target_date)   { setDetailError('Target penyelesaian wajib diisi.'); return; }
    setDetailSaving(true);
    setDetailError(null);
    try {
      const payload = {
        division_id: editDraft.division_id,
        department_id: editDraft.department_id,
        description: editDraft.description.trim(),
        root_cause: editDraft.root_cause?.trim() || null,
        solution: editDraft.solution?.trim() || null,
        target_date: editDraft.target_date,
        escalation_level: editDraft.escalation_level || null,
      };
      const { error } = await supabase.from('bnf_reports').update(payload).eq('id', detail.id);
      if (error) throw error;

      // Sync Irisan (Fase G) — delete all existing junction rows for this
      // report, then reinsert exactly the current selection. Always converges
      // to editDraft's current state regardless of what was there before;
      // simpler than diffing old-vs-new for a field this small in scale.
      // Not wrapped in one atomic call (2 separate requests) — accepted
      // trade-off (see plan): if insert fails right after delete succeeds,
      // the report loses its Irisan tags until the next save, but the
      // failure is logged, not silent, and no other field is affected.
      const { error: delRelErr } = await supabase.from('bnf_report_related_departments').delete().eq('report_id', detail.id);
      if (delRelErr) {
        console.error('[bnf] related-departments delete failed:', delRelErr.message);
      } else if (editDraft.related_department_ids.length) {
        const { error: relErr } = await supabase.from('bnf_report_related_departments').insert(
          editDraft.related_department_ids.map((department_id) => ({ report_id: detail.id, department_id }))
        );
        if (relErr) console.error('[bnf] related-departments insert failed:', relErr.message);
      }

      logAudit(supabase, {
        action: ACTION_TYPES.UPDATE_BNF_REPORT,
        entityType: ENTITY_TYPES.BNF_REPORT,
        entityId: detail.id,
        entityLabel: detail.report_no,
        notes: 'Edit isi laporan',
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });

      showToast?.('Laporan berhasil diperbarui');
      setDetail(null);
      fetchReports();
    } catch (err) {
      setDetailError('Gagal menyimpan perubahan: ' + err.message);
    } finally {
      setDetailSaving(false);
    }
  }, [detail, profile, user, erpRole, fetchReports, showToast]);

  // Hapus laporan (soft-delete, Fase C) — akses sama seperti edit isi
  // (Tier 2 trigger yang sama menjaga deleted_at juga).
  const handleDeleteReport = useCallback(async () => {
    if (!detail) return;
    setDetailSaving(true);
    setDetailError(null);
    try {
      const { error } = await supabase.from('bnf_reports').update({ deleted_at: new Date().toISOString() }).eq('id', detail.id);
      if (error) throw error;

      logAudit(supabase, {
        action: ACTION_TYPES.UPDATE_BNF_REPORT,
        entityType: ENTITY_TYPES.BNF_REPORT,
        entityId: detail.id,
        entityLabel: detail.report_no,
        notes: 'Hapus laporan (soft-delete)',
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });

      showToast?.('Laporan berhasil dihapus');
      setDetail(null);
      fetchReports();
    } catch (err) {
      setDetailError('Gagal menghapus laporan: ' + err.message);
    } finally {
      setDetailSaving(false);
    }
  }, [detail, profile, user, erpRole, fetchReports, showToast]);

  // Manual reminder — same resolve-and-send as create, but with user-facing
  // feedback (this is an explicit action the user is waiting on, unlike the
  // silent best-effort notify on submit).
  const handleSendReminder = useCallback(async () => {
    if (!detail) return;
    setReminderSending(true);
    try {
      const result = await notifyDepartmentHead({ departmentId: detail.department_id, reportNo: detail.report_no, description: detail.description });
      if (result.total === 0) {
        showToast?.('Belum ada kepala departemen terdaftar — reminder tidak terkirim.', 'error');
      } else if (result.sent === 1) {
        showToast?.('Reminder terkirim ke kepala departemen');
      } else {
        showToast?.('Gagal mengirim reminder', 'error');
      }
      // Escalation add-on (Fase D), silent like the reporter-notify in Fase C
      // — not folded into the toast above. companyId MUST be detail.company_id
      // (the report's own company), not profile.company_id — a super_admin
      // can be viewing a report that belongs to a different company than
      // their own, and using the wrong one would silently notify the wrong
      // company's CEO (or find none).
      notifyEscalationRecipients({ escalationLevel: detail.escalation_level, divisionId: detail.division_id, companyId: detail.company_id, reportNo: detail.report_no, description: detail.description })
        .catch((e) => console.error('[bnf] reminder escalation notify failed:', e?.message || e));
    } catch (e) {
      showToast?.('Gagal mengirim reminder: ' + (e?.message || e), 'error');
    } finally {
      setReminderSending(false);
    }
  }, [detail, showToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus === 'active' && r.status === 'Closed') return false;
      if (filterStatus !== 'all' && filterStatus !== 'active' && r.status !== filterStatus) return false;
      if (q) {
        const hay = `${r.report_no} ${r.reporter_name || ''} ${r.division?.name || ''} ${r.department?.name || ''} ${r.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filterStatus]);

  // Overview aggregation — client-side over the SAME `rows` already fetched
  // for the table (no separate fetch), mirrors CRMDashboardPage.jsx's pattern
  // (pull rows once, reduce/group in JS rather than a SQL view/RPC — dataset
  // is small enough that this is simpler and fast enough).
  const dashboardStats = useMemo(() => {
    const totals = { total: rows.length, Open: 0, 'In Progress': 0, Escalated: 0, Closed: 0 };
    const byDivision = {};
    rows.forEach((r) => {
      if (totals[r.status] !== undefined) totals[r.status] += 1;
      const divName = r.division?.name || 'Tanpa Divisi';
      if (!byDivision[divName]) byDivision[divName] = { total: 0, Open: 0, 'In Progress': 0, Escalated: 0, Closed: 0 };
      byDivision[divName].total += 1;
      if (byDivision[divName][r.status] !== undefined) byDivision[divName][r.status] += 1;
    });
    const divisionRows = Object.entries(byDivision)
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total);
    return { totals, divisionRows };
  }, [rows]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Edit/hapus affordance gate (Fase C) — mirrors InquiryChatter.jsx's
  // `isMine` pattern, extended with the admin_or_above case. FE-only hiding;
  // the trigger (Tier 2) is what actually enforces this.
  const canEditDetail = !!detail && (detail.created_by === profile?.id || erpRole === 'admin' || erpRole === 'super_admin');

  return (
    <div className="min-h-full bg-slate-50" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* header bar — full width of THIS component's own container. Does not
          attempt to break out of App.jsx's page padding via negative margins
          (would need exact parent padding values I can't visually verify
          myself without login — ask if true edge-to-edge is needed). */}
      <div style={{ backgroundColor: NAVY_DARK }} className="-mx-5 -mt-6 px-8 py-5 sm:-mx-7 lg:-mt-7 xl:-mx-9">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <AlertTriangle size={18} style={{ color: ORANGE }} strokeWidth={2.3} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">Bad News First</div>
            <div className="text-[12px] text-slate-300">Reporting &amp; Governance</div>
          </div>
        </div>
      </div>

      <div className="py-6">
        <div className="mb-6 flex gap-1 border-b" style={{ borderColor: LINE }}>
          {[['form', 'Buat Laporan'], ['insiden', 'Tarik dari Insiden'], ['overview', 'Overview']].map(([key, label]) => (
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

        {tab === 'form' ? (
          <BuatLaporanTab
            profile={profile}
            draft={draft}
            setDraft={setDraft}
            divisions={divisions}
            departments={departments}
            saving={saving}
            error={formError}
            onReset={resetDraft}
            onSave={handleSave}
          />
        ) : tab === 'insiden' ? (
          <TarikInsidenTab
            items={pendingInsiden}
            loading={insidenLoading}
            actionId={insidenActionId}
            onResolveInternal={handleResolveInternal}
            onOpenPull={setPullModalItem}
          />
        ) : (
          <OverviewTab
            loading={loading}
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            dashboardStats={dashboardStats}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
            pageRows={pageRows}
            onSelect={openDetail}
          />
        )}
      </div>

      <DetailPanel
        report={detail}
        logs={logs}
        logsLoading={logsLoading}
        saving={detailSaving}
        error={detailError}
        reminderSending={reminderSending}
        canEdit={canEditDetail}
        divisions={divisions}
        departments={departments}
        actionItems={actionItems}
        actionItemsLoading={actionItemsLoading}
        actionItemSaving={actionItemSaving}
        actionItemPeople={actionItemPeople}
        onToggleActionItem={handleToggleActionItem}
        onAddActionItem={handleAddActionItem}
        onChangeStatus={handleStatusChange}
        onSendReminder={handleSendReminder}
        onSaveEdit={handleSaveEdit}
        onDelete={handleDeleteReport}
        onClose={() => { setDetail(null); setDetailError(null); }}
      />

      <PullToBnfModal
        item={pullModalItem}
        divisions={divisions}
        departments={departments}
        saving={pullSaving}
        error={pullError}
        onSubmit={handlePullToBnf}
        onClose={() => { setPullModalItem(null); setPullError(null); }}
      />
    </div>
  );
}

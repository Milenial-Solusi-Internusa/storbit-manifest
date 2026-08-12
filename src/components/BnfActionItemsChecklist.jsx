// src/components/BnfActionItemsChecklist.jsx
// Checklist widget for bnf_report_action_items — extracted from
// BNFListPage.jsx's DetailPanel (Tugas 3, 2026-08-11; originally named
// ActionItemsSection) so MeetingMingguanPage.jsx can reuse the exact same
// list/toggle/add UI for BNF-sourced weekly meeting items (2026-08-12).
// Self-contained tokens/helpers rather than importing from BNFListPage.jsx —
// matches this codebase's established practice of sibling/shared pages
// duplicating small local pieces instead of cross-importing (see
// BNFOrgRolesPage.jsx's own comment on its copied NAVY/initials()/etc. for
// precedent) — also the only sane dependency direction here, since this file
// is imported BY both BNFListPage.jsx and MeetingMingguanPage.jsx, not the
// other way around. Values match BNFListPage.jsx's NAVY/LINE/DANGER exactly.
import { useState } from 'react';
import { ClipboardList, Check } from 'lucide-react';
import ProfilePicker from './ProfilePicker';

const NAVY = '#0F3A66';
const LINE = '#E2E8F0';
const DANGER = '#DC2626';

const inputCls =
  'w-full rounded-md border px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors';

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// items: bnf_report_action_items rows, each pre-joined with assignee_name/
// completed_by_name (same shape the caller already builds for DetailPanel —
// see BNFListPage.jsx's fetchActionItems). saving: null | 'new' | item.id.
export default function BnfActionItemsChecklist({ items, loading, saving, people, onToggle, onAdd }) {
  const [newDescription, setNewDescription] = useState('');
  const [assigneeText, setAssigneeText] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [formError, setFormError] = useState(null);

  const handleAdd = () => {
    if (!newDescription.trim()) { setFormError('Deskripsi wajib diisi.'); return; }
    if (!assigneeId) { setFormError('PIC wajib dipilih.'); return; }
    setFormError(null);
    onAdd({ description: newDescription.trim(), assigned_to: assigneeId }, () => {
      setNewDescription('');
      setAssigneeText('');
      setAssigneeId('');
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        <ClipboardList size={12} /> Action Items
      </div>
      <div className="space-y-2">
        {loading ? (
          <div className="text-[13px] text-slate-400">Memuat…</div>
        ) : items.length === 0 ? (
          <div className="text-[13px] italic text-slate-400">Belum ada action item.</div>
        ) : items.map((it) => (
          <div key={it.id} className="flex items-start gap-3 rounded-md border p-3" style={{ borderColor: LINE }}>
            <button
              type="button"
              onClick={() => onToggle(it)}
              disabled={saving === it.id}
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border disabled:opacity-50"
              style={{ borderColor: it.is_done ? '#15803D' : LINE, backgroundColor: it.is_done ? '#15803D' : 'white' }}
              title={it.is_done ? 'Tandai belum selesai' : 'Tandai selesai'}
            >
              {it.is_done && <Check size={13} color="white" strokeWidth={3} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-slate-700" style={{ whiteSpace: 'pre-wrap', textDecoration: it.is_done ? 'line-through' : 'none' }}>{it.description}</p>
              <div className="mt-1 text-[11px] text-slate-400">
                PIC: {it.assignee_name || '—'}
                {it.is_done && it.completed_at && <> · Selesai {fmtDateTime(it.completed_at)} oleh {it.completed_by_name || '—'}</>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2 rounded-md border p-3" style={{ borderColor: LINE }}>
        <textarea
          rows={2}
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Deskripsi action item baru…"
          className={inputCls}
          style={{ borderColor: LINE }}
        />
        <ProfilePicker
          value={assigneeText}
          people={people}
          inputClassName={inputCls}
          inputStyle={{ borderColor: LINE, fontFamily: 'inherit' }}
          placeholder="Cari PIC…"
          onChangeText={(v) => { setAssigneeText(v); setAssigneeId(''); }}
          onPick={(p) => { setAssigneeText(p.full_name); setAssigneeId(p.id); }}
        />
        {formError && <div className="text-[12px]" style={{ color: DANGER }}>{formError}</div>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving === 'new'}
            className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: NAVY }}
          >
            {saving === 'new' ? 'Menyimpan…' : '+ Tambah Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

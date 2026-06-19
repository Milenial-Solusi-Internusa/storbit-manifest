// src/modules/admin/pages/PositionsPage.jsx
// Positions master data — COMPACT view grouped by `code` (one row per code,
// entity badges inline) instead of one row per (company, code).
// Edit modal re-parents a code across entities via checkboxes:
//  • checked + row exists  → UPDATE name/level + reactivate (is_active=true)
//  • checked + no row       → INSERT
//  • unchecked + active row → UPDATE is_active=false (soft delete; NOT hard delete)
// positions has UNIQUE(company_id, code) → Save pre-checks existing rows (incl.
// inactive/soft-deleted) and reactivates rather than INSERT to avoid violations.
// NOTE: positions RLS scopes non-super admins to their own company — the full
// cross-entity (MSI/JCI/SOA) view + multi-entity save works for super_admin;
// other roles see one badge and cross-entity writes surface an RLS error toast.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, RefreshCw, Check, Plus, RefreshCw as Spinner,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { POSITION_LEVELS } from '../../../hooks/usePositions';
import AdminPageHeader from '../components/AdminPageHeader';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────

const PASTEL = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  mint:         '#C8EFD9',
  mintDeep:     '#7FC9A0',
  rose:         '#F5C8D5',
  roseDeep:     '#D89AB0',
  lavender:     '#D8C5F0',
  lavenderDeep: '#A98FD8',
  sky:          '#C8E4F5',
  skyDeep:      '#8FBCD8',
  peach:        '#FFD4B8',
};

// MSI brand entity palette (keyed by company_id)
const ENTITIES = [
  { id: '0e1840d8-e6fb-4190-bd09-88338e68b492', code: 'MSI', name: 'Milenial Solusi Internusa', color: '#144682' }, // navy
  { id: '42569e7c-531b-4d2b-832a-d5a7268c455b', code: 'JCI', name: 'Jago Custom Indonesia',     color: '#E85A1E' }, // orange
  { id: 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', code: 'SOA', name: 'Stuja Orbit Abadi',          color: '#F08C7D' }, // coral
];
const ENTITY_IDS = ENTITIES.map((e) => e.id);

const LEVEL_STYLE = {
  Staff:      { bg: PASTEL.lineSoft,  color: PASTEL.inkMute },
  Supervisor: { bg: PASTEL.sky,       color: PASTEL.skyDeep },
  Manager:    { bg: PASTEL.lavender,  color: PASTEL.lavenderDeep },
  Head:       { bg: PASTEL.peach,     color: '#C4611E' },
  Director:   { bg: '#F0E0FF',        color: '#7B3FA0' },
};

const GRID_COLS = '90px 1fr 110px 1fr 96px 60px';

// ─────────────────────────────────────────────────────────────
// Badges
// ─────────────────────────────────────────────────────────────

function LevelBadge({ level }) {
  const style = LEVEL_STYLE[level] || { bg: PASTEL.lineSoft, color: PASTEL.inkMute };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {level}
    </span>
  );
}

function EntityPill({ ent, present }) {
  return (
    <span
      className="inline-flex items-center font-mono text-[10px] px-2 py-0.5 rounded-lg font-bold"
      style={
        present
          ? { background: ent.color, color: '#fff' }
          : { background: PASTEL.lineSoft, color: PASTEL.inkMute, opacity: 0.55 }
      }
      title={`${ent.code} — ${ent.name}${present ? '' : ' (tidak tersedia)'}`}
    >
      {ent.code}
    </span>
  );
}

function GroupStatusBadge({ full }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={full ? { background: PASTEL.mint, color: '#1A5C35' } : { background: PASTEL.peach, color: '#C4611E' }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: full ? PASTEL.mintDeep : '#C4611E' }} />
      {full ? 'Active' : 'Partial'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Form primitives
// ─────────────────────────────────────────────────────────────

function FieldLabel({ children, required }) {
  return (
    <div className="text-[11px] font-semibold mb-1.5 uppercase tracking-[0.14em]" style={{ color: PASTEL.inkMute }}>
      {children}
      {required && <span style={{ color: PASTEL.roseDeep }}> *</span>}
    </div>
  );
}

function FieldInput({ value, onChange, disabled, placeholder, maxLength }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50 placeholder:text-[#B8AEA6]"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    />
  );
}

function FieldSelect({ value, onChange, disabled, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50 cursor-pointer"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    >
      {children}
    </select>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.22em] font-bold mb-4" style={{ color: PASTEL.lavenderDeep }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-6" style={{ borderTop: `1px solid ${PASTEL.line}` }} />;
}

function EntityCheckbox({ ent, checked, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle()}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-colors disabled:opacity-50 text-left"
      style={{
        borderColor: checked ? ent.color : PASTEL.line,
        background: checked ? `${ent.color}0F` : 'white',
      }}
    >
      <span
        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          background: checked ? ent.color : 'white',
          border: `1.5px solid ${checked ? ent.color : PASTEL.line}`,
        }}
      >
        {checked && <Check size={13} color="#fff" />}
      </span>
      <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-bold" style={{ background: ent.color, color: '#fff' }}>
        {ent.code}
      </span>
      <span className="text-sm" style={{ color: PASTEL.inkSoft }}>{ent.name}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState('');

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Fetch all active positions (per spec) — grouped client-side by code.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('positions')
      .select('id, company_id, code, name, level, is_active')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(1000)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err); } else { setRows(data || []); setError(null); }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Group by code → one entry per unique code. Representative name/level = first
  // row by name. byCompany maps company_id → active row id.
  const groups = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      if (!map[r.code]) {
        map[r.code] = { code: r.code, name: r.name, level: r.level, byCompany: {} };
      }
      map[r.code].byCompany[r.company_id] = { id: r.id };
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const s = searchInput.trim().toLowerCase();
  const filteredGroups = useMemo(
    () => (s ? groups.filter((g) => g.name.toLowerCase().includes(s) || g.code.toLowerCase().includes(s)) : groups),
    [groups, s]
  );

  // ── Modal state ──
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const openCreate = useCallback(() => {
    setDraft({ mode: 'create', code: '', name: '', level: 'Staff', entities: {} });
    setSaveError(null);
  }, []);

  const openEdit = useCallback((group) => {
    const entities = {};
    ENTITIES.forEach((e) => { entities[e.id] = !!group.byCompany[e.id]; });
    setDraft({ mode: 'edit', code: group.code, name: group.name, level: group.level, entities });
    setSaveError(null);
  }, []);

  const closeModal = useCallback(() => {
    setDraft(null);
    setSaveError(null);
  }, []);

  const toggleEntity = useCallback((id) => {
    setDraft((d) => (d ? { ...d, entities: { ...d.entities, [id]: !d.entities[id] } } : d));
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const code = draft.code.trim().toUpperCase();
    const name = draft.name.trim();
    if (!code) { setSaveError('Code wajib diisi.'); return; }
    if (!name) { setSaveError('Name wajib diisi.'); return; }
    if (!draft.level) { setSaveError('Level wajib dipilih.'); return; }
    const anyChecked = ENTITIES.some((e) => draft.entities[e.id]);
    if (draft.mode === 'create' && !anyChecked) { setSaveError('Pilih minimal satu entitas.'); return; }

    setSaving(true);
    setSaveError(null);
    try {
      // Pre-check existing rows for this code across the 3 entities (incl.
      // inactive / soft-deleted) so we reactivate instead of INSERT — the
      // UNIQUE(company_id, code) constraint covers inactive rows too.
      const { data: existingRows, error: exErr } = await supabase
        .from('positions')
        .select('id, company_id, is_active, deleted_at')
        .eq('code', code)
        .in('company_id', ENTITY_IDS);
      if (exErr) throw exErr;
      const existing = {};
      (existingRows || []).forEach((r) => { existing[r.company_id] = r; });

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      for (const e of ENTITIES) {
        const checked = !!draft.entities[e.id];
        const ex = existing[e.id];
        if (checked) {
          if (ex) {
            const { error: uErr } = await supabase
              .from('positions')
              .update({ name, level: draft.level, is_active: true, deleted_at: null })
              .eq('id', ex.id);
            if (uErr) throw uErr;
          } else {
            const { error: iErr } = await supabase
              .from('positions')
              .insert({ company_id: e.id, code, name, level: draft.level, is_active: true, created_by: userId });
            if (iErr) throw iErr;
          }
        } else if (ex && ex.is_active && !ex.deleted_at) {
          const { error: dErr } = await supabase
            .from('positions')
            .update({ is_active: false })
            .eq('id', ex.id);
          if (dErr) throw dErr;
        }
      }

      setSaving(false);
      closeModal();
      refresh();
      showToast(draft.mode === 'create' ? 'Position dibuat.' : 'Position diperbarui.');
    } catch (err) {
      setSaving(false);
      setSaveError(err.message || 'Gagal menyimpan. Cek izin akses.');
    }
  }, [draft, closeModal, refresh, showToast]);

  const isCreate = draft?.mode === 'create';

  const modalFooter = (
    <div className="flex items-center gap-3">
      <div className="flex-1" />
      <button
        type="button"
        onClick={closeModal}
        disabled={saving}
        className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
        style={{ background: 'white', color: PASTEL.inkSoft, border: `1px solid ${PASTEL.line}` }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
        style={{ background: PASTEL.ink, color: 'white' }}
      >
        {saving
          ? <><Spinner size={13} className="animate-spin" /> Saving…</>
          : <><Check size={13} /> {isCreate ? 'Create Position' : 'Save Changes'}</>}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div>
      <AdminPageHeader
        title="Positions"
        subtitle="Satu baris per kode jabatan, dengan ketersediaan per entitas (MSI / JCI / SOA)."
        count={loading ? undefined : groups.length}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm"
          style={{ background: 'white', borderColor: PASTEL.line }}
        >
          <Search size={14} style={{ color: PASTEL.inkMute }} />
          <input
            type="text"
            placeholder="Search by name or code…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#9C948D]"
            style={{ color: PASTEL.ink }}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-2.5 rounded-xl border transition-opacity hover:opacity-70"
          style={{ background: 'white', borderColor: PASTEL.line }}
          title="Refresh"
        >
          <RefreshCw size={14} style={{ color: PASTEL.inkSoft }} />
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: PASTEL.ink, color: 'white' }}
        >
          <Plus size={14} />
          New Position
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ gridTemplateColumns: GRID_COLS, borderColor: PASTEL.line, background: PASTEL.lineSoft, color: PASTEL.inkMute }}
        >
          <div>Code</div>
          <div>Name</div>
          <div>Level</div>
          <div>Entities</div>
          <div className="text-right">Status</div>
          <div />
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={6} />
        ) : filteredGroups.length === 0 ? (
          <EmptyState message={s ? 'No positions match your search.' : 'No positions found.'} />
        ) : (
          filteredGroups.map((g) => {
            const activeCount = ENTITIES.filter((e) => g.byCompany[e.id]).length;
            return (
              <div
                key={g.code}
                className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
                style={{ gridTemplateColumns: GRID_COLS, borderColor: PASTEL.line }}
                onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}>
                    {g.code}
                  </span>
                </div>
                <div className="font-medium" style={{ color: PASTEL.ink }}>{g.name}</div>
                <div><LevelBadge level={g.level} /></div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ENTITIES.map((e) => (
                    <EntityPill key={e.id} ent={e} present={!!g.byCompany[e.id]} />
                  ))}
                </div>
                <div className="flex justify-end"><GroupStatusBadge full={activeCount === ENTITIES.length} /></div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(g)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Centered modal form ── */}
      <AdminFormModal
        open={!!draft}
        eyebrow={isCreate ? 'New Position' : 'Edit Position'}
        title={isCreate ? 'Create Position' : draft?.name || 'Edit Position'}
        subtitle="Atur nama, level, dan ketersediaan jabatan di tiap entitas."
        onClose={closeModal}
        footer={modalFooter}
      >
        {draft && (
          <div className="space-y-6">

            {/* ── Identity ── */}
            <div>
              <SectionLabel>Identity</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Code</FieldLabel>
                  {isCreate ? (
                    <FieldInput
                      value={draft.code}
                      onChange={(v) => setDraft((d) => ({ ...d, code: v }))}
                      disabled={saving}
                      placeholder="e.g. MGR, SPV"
                      maxLength={20}
                    />
                  ) : (
                    <div
                      className="rounded-2xl border px-4 py-3 text-sm font-mono"
                      style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
                    >
                      {draft.code}
                      <span className="ml-2 text-[10px] uppercase tracking-wide font-sans" style={{ color: PASTEL.inkMute }}>(locked)</span>
                    </div>
                  )}
                </div>
                <div>
                  <FieldLabel required>Name</FieldLabel>
                  <FieldInput
                    value={draft.name}
                    onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
                    disabled={saving}
                    placeholder="e.g. Manager"
                    maxLength={100}
                  />
                </div>
              </div>
            </div>

            <Divider />

            {/* ── Level ── */}
            <div>
              <SectionLabel>Seniority Level</SectionLabel>
              <FieldSelect
                value={draft.level}
                onChange={(v) => setDraft((d) => ({ ...d, level: v }))}
                disabled={saving}
              >
                {POSITION_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </FieldSelect>
              <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>Name &amp; level diterapkan ke semua entitas yang dicentang.</p>
            </div>

            <Divider />

            {/* ── Entities ── */}
            <div>
              <SectionLabel>Tersedia di entitas</SectionLabel>
              <div className="space-y-2.5">
                {ENTITIES.map((e) => (
                  <EntityCheckbox
                    key={e.id}
                    ent={e}
                    checked={!!draft.entities[e.id]}
                    onToggle={() => toggleEntity(e.id)}
                    disabled={saving}
                  />
                ))}
              </div>
              <p className="text-[10px] mt-2.5" style={{ color: PASTEL.inkMute }}>
                Hapus centang → jabatan di entitas itu dinonaktifkan (is_active=false), bukan dihapus permanen.
              </p>
            </div>

            {saveError && (
              <div
                className="rounded-2xl px-4 py-3.5"
                style={{ background: PASTEL.rose, border: `1px solid ${PASTEL.roseDeep}` }}
              >
                <div className="text-xs font-semibold mb-0.5" style={{ color: PASTEL.ink }}>Save failed</div>
                <div className="text-xs" style={{ color: PASTEL.inkSoft }}>{saveError}</div>
              </div>
            )}
          </div>
        )}
      </AdminFormModal>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 z-[60]"
          style={{
            background: toast.type === 'error' ? PASTEL.rose : PASTEL.mint,
            color: PASTEL.ink,
            border: `1px solid ${toast.type === 'error' ? PASTEL.roseDeep : PASTEL.mintDeep}`,
          }}
        >
          <Check size={14} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

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
//
// Migrated to the official admin-settings kit/tokens (2026-08-13) — same
// migration as batch 1/2. handleSave's per-entity loop and the ENTITIES id/
// code/name values are untouched — only the `color` field (hex hardcode) was
// dropped since it was purely presentational. Kit's own EntitySwitcher was
// evaluated and does NOT fit here (single-select sliding pill vs. this page's
// independent multi-select checkboxes, plus code-keyed vs UUID-keyed id) — so
// the local EntityCheckbox/EntityPill components stay, just recolored.
// AdminFormModal itself (shared by 6 other pages) is NOT touched.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, RefreshCw as Spinner } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { POSITION_LEVELS } from '../../../hooks/usePositions';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import {
  Icon, PageHeader, KitStyles, FloatingInput, FloatingSelect,
  PrimaryBtn, OutlineBtn, SectionLabel,
} from '../../../pages/foundation/admin-settings/kit';
import {
  NAVY, ORANGE, ORANGE_DK, CREAM, SURFACE, LINE, ROW_HOVER, INK, INK_SOFT,
  MUTED, DANGER, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO,
} from '../../../pages/foundation/admin-settings/tokens';

// Entity list for the multi-select checkbox group below (keyed by company_id —
// NOT the same id shape as kit's own ENTITIES export, which keys by short
// code like "MSI"). handleSave's per-entity loop and the RLS pre-check query
// both depend on these exact UUIDs — id/code/name values are unchanged from
// before this migration; only the old `color` hex field (display-only) was
// dropped.
const ENTITIES = [
  { id: '0e1840d8-e6fb-4190-bd09-88338e68b492', code: 'MSI', name: 'Milenial Solusi Internusa' },
  { id: '42569e7c-531b-4d2b-832a-d5a7268c455b', code: 'JCI', name: 'Jago Custom Indonesia' },
  { id: 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', code: 'SOA', name: 'Stuja Orbit Abadi' },
];
const ENTITY_IDS = ENTITIES.map((e) => e.id);

// Graduated ORANGE ramp by seniority — one hue family (category badge, per
// the kit mapping rules) but with a lightness step per level so seniority is
// still scannable at a glance instead of collapsing all 5 to one flat tint.
const LEVEL_STYLE = {
  Staff:      { bg: `${ORANGE}14`, color: ORANGE },
  Supervisor: { bg: `${ORANGE}26`, color: ORANGE },
  Manager:    { bg: `${ORANGE}40`, color: ORANGE_DK },
  Head:       { bg: `${ORANGE}66`, color: ORANGE_DK },
  Director:   { bg: ORANGE,        color: '#fff' },
};

const GRID_COLS = '90px 1fr 110px 1fr 96px 60px';

// ─────────────────────────────────────────────────────────────
// Badges
// ─────────────────────────────────────────────────────────────

function LevelBadge({ level }) {
  const style = LEVEL_STYLE[level] || { bg: CREAM, color: MUTED };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] whitespace-nowrap"
      style={{ fontFamily: FONT_HEAD, fontWeight: 700, background: style.bg, color: style.color }}
    >
      {level}
    </span>
  );
}

function EntityPill({ ent, present }) {
  return (
    <span
      className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-lg font-bold"
      style={{
        fontFamily: FONT_MONO,
        ...(present ? { background: NAVY, color: '#fff' } : { background: CREAM, color: MUTED, opacity: 0.55 }),
      }}
      title={`${ent.code} — ${ent.name}${present ? '' : ' (tidak tersedia)'}`}
    >
      {ent.code}
    </span>
  );
}

function GroupStatusBadge({ full }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wide"
      style={{
        fontFamily: FONT_HEAD, fontWeight: 700,
        background: full ? `${GREEN}1A` : `${ORANGE}1A`,
        color: full ? GREEN : ORANGE,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: full ? GREEN : ORANGE }} />
      {full ? 'Active' : 'Partial'}
    </span>
  );
}

function CodeBadge({ children }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ fontFamily: FONT_MONO, background: `${NAVY}1A`, color: NAVY }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Local helpers (checkbox row, divider — no kit equivalent)
// ─────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ borderTop: '1px solid ' + LINE, margin: '24px 0' }} />;
}

function EntityCheckbox({ ent, checked, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle()}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-colors disabled:opacity-50 text-left"
      style={{
        borderColor: checked ? NAVY : LINE,
        background: checked ? `${NAVY}0F` : SURFACE,
      }}
    >
      <span
        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          background: checked ? NAVY : SURFACE,
          border: `1.5px solid ${checked ? NAVY : LINE}`,
        }}
      >
        {checked && <Icon name="check" size={13} color="#fff" />}
      </span>
      <span className="text-[11px] px-2 py-0.5 rounded-lg font-bold" style={{ fontFamily: FONT_MONO, background: NAVY, color: '#fff' }}>
        {ent.code}
      </span>
      <span className="text-sm" style={{ color: INK_SOFT }}>{ent.name}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function PositionsPage({ onHome }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);

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

  // ── Modal footer ── Cancel uses OutlineBtn, which has no `disabled` prop in
  // the kit — the guard lives in the onClick handler instead so the
  // no-double-submit-while-saving behavior is preserved even though the
  // button won't visually dim during that window.
  const modalFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ flex: 1 }} />
      <OutlineBtn onClick={() => { if (!saving) closeModal(); }}>Cancel</OutlineBtn>
      <PrimaryBtn disabled={saving} onClick={handleSave}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {saving ? <Spinner size={15} className="animate-spin" /> : <Icon name="check" size={16} />}
          {saving ? 'Saving…' : (isCreate ? 'Create Position' : 'Save Changes')}
        </span>
      </PrimaryBtn>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: 'Foundation' }, { label: 'Master Data & Admin Settings', onClick: onHome }, { label: 'Positions' }]}
        title="Positions"
        subtitle="Satu baris per kode jabatan, dengan ketersediaan per entitas (MSI / JCI / SOA)."
        onBack={onHome}
        right={!loading && (
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', borderRadius: 20, background: `${NAVY}1A`, color: NAVY, fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700 }}>
            {groups.length.toLocaleString('id-ID')}
          </span>
        )}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm transition-shadow"
          style={{ background: SURFACE, borderColor: searchFocus ? NAVY : LINE, boxShadow: searchFocus ? `0 0 0 3px ${NAVY}29` : 'none' }}
        >
          <Search size={14} style={{ color: MUTED }} />
          <input
            type="text"
            placeholder="Search by name or code…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: INK }}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-2.5 rounded-xl border transition-opacity hover:opacity-70"
          style={{ background: SURFACE, borderColor: LINE }}
          title="Refresh"
        >
          <RefreshCw size={14} style={{ color: INK_SOFT }} />
        </button>
        <PrimaryBtn icon="plus" onClick={openCreate}>New Position</PrimaryBtn>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURFACE, borderColor: LINE }}>
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ gridTemplateColumns: GRID_COLS, borderColor: LINE, background: CREAM, color: MUTED }}
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
          filteredGroups.map((g, i) => {
            const activeCount = ENTITIES.filter((e) => g.byCompany[e.id]).length;
            const zebra = i % 2 === 1 ? `${CREAM}80` : SURFACE;
            return (
              <div
                key={g.code}
                className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
                style={{ gridTemplateColumns: GRID_COLS, borderColor: LINE, background: zebra }}
                onMouseEnter={(e) => (e.currentTarget.style.background = ROW_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = zebra)}
              >
                <div><CodeBadge>{g.code}</CodeBadge></div>
                <div className="font-medium" style={{ color: INK }}>{g.name}</div>
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
                    style={{ background: CREAM, color: INK_SOFT }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Centered modal form (container = AdminFormModal, untouched) ── */}
      <AdminFormModal
        open={!!draft}
        eyebrow={isCreate ? 'New Position' : 'Edit Position'}
        title={isCreate ? 'Create Position' : draft?.name || 'Edit Position'}
        subtitle="Atur nama, level, dan ketersediaan jabatan di tiap entitas."
        onClose={closeModal}
        footer={modalFooter}
      >
        {draft && (
          <div>
            {/* ── Identity ── */}
            <SectionLabel style={{ marginBottom: 16 }}>Identity</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {isCreate ? (
                <FloatingInput half label="Code *" value={draft.code}
                  onChange={(v) => setDraft((d) => ({ ...d, code: v.slice(0, 20) }))}
                  disabled={saving} placeholder="e.g. MGR, SPV" />
              ) : (
                <div style={{ flex: '1 1 calc(50% - 8px)', minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: NAVY, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Code</div>
                  <div style={{ borderRadius: 11, border: '1px solid ' + LINE, background: CREAM, padding: '16px 14px', fontFamily: FONT_MONO, fontSize: 14, color: INK_SOFT }}>
                    {draft.code}
                    <span style={{ marginLeft: 8, fontSize: 10, fontFamily: FONT_BODY, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED }}>(locked)</span>
                  </div>
                </div>
              )}
              <FloatingInput half label="Name *" value={draft.name}
                onChange={(v) => setDraft((d) => ({ ...d, name: v.slice(0, 100) }))}
                disabled={saving} placeholder="e.g. Manager" />
            </div>

            <Divider />

            {/* ── Level ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Seniority Level</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, opacity: saving ? 0.55 : 1, pointerEvents: saving ? 'none' : 'auto', transition: 'opacity .2s' }}>
              <FloatingSelect full label="Level"
                value={draft.level}
                onChange={(v) => setDraft((d) => ({ ...d, level: v }))}
                options={POSITION_LEVELS}
              />
            </div>
            <p style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: MUTED, marginTop: 8 }}>
              Name &amp; level diterapkan ke semua entitas yang dicentang.
            </p>

            <Divider />

            {/* ── Entities ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Tersedia di entitas</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            <p style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: MUTED, marginTop: 10 }}>
              Hapus centang → jabatan di entitas itu dinonaktifkan (is_active=false), bukan dihapus permanen.
            </p>

            {saveError && (
              <div style={{ marginTop: 24, borderRadius: 14, padding: '14px 16px', background: `${DANGER}0F`, border: `1px solid ${DANGER}40` }}>
                <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 2 }}>Save failed</div>
                <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT }}>{saveError}</div>
              </div>
            )}
          </div>
        )}
      </AdminFormModal>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 10,
          background: INK, color: '#fff', padding: '13px 18px', borderRadius: 12,
          fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500,
          boxShadow: '0 14px 34px rgba(10,20,40,.3)', zIndex: 200,
        }}>
          <Icon name={toast.type === 'error' ? 'alert' : 'checkcircle'} size={18} color={toast.type === 'error' ? '#FF9B9B' : '#7FD6A0'} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

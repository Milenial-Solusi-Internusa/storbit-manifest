// src/modules/admin/pages/DcMasterPage.jsx
// DC (Distribution Center) master data — paginated list with create / edit.
// Mirrors BranchesPage.jsx's list+AdminFormModal CRUD pattern. No archive/
// delete — is_active toggle (inside the edit form) is the only deactivation
// mechanism asked for. Customer picker reuses AccountPicker as-is (same
// {id, name, lifecycle_stage} shape it was built for).
//
// Read by src/modules/logistics/InputSPPage.jsx's DC dropdown
// (.eq('is_active', true).is('deleted_at', null)) — untouched by this file,
// it just reads whatever rows this page writes to the same table.
//
// Migrated to the official admin-settings kit/tokens (2026-08-13) — same
// migration as BranchesPage.jsx/DepartmentsPage.jsx. AccountPicker.jsx itself
// is NOT touched (shared by 7 other consumers) — only the local inputStyle
// object passed into it. Fetch/save logic and WILAYAH_OPTIONS values unchanged.

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, X, RefreshCw as Spinner } from 'lucide-react';
import {
  useDcMaster, DC_MASTER_PAGE_SIZE,
  createDcMaster, updateDcMaster,
} from '../../../hooks/useDcMaster';
import { fetchAllCompanies } from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import { supabase } from '../../../lib/supabase';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import AccountPicker from '../../../components/AccountPicker';
import {
  Icon, PageHeader, KitStyles, FloatingInput, FloatingSelect, Toggle,
  PrimaryBtn, OutlineBtn, SectionLabel,
} from '../../../pages/foundation/admin-settings/kit';
import {
  NAVY, ORANGE, CREAM, SURFACE, LINE, ROW_HOVER, INK, INK_SOFT, MUTED, DANGER,
  GREEN, FONT_HEAD, FONT_BODY, FONT_MONO,
} from '../../../pages/foundation/admin-settings/tokens';

// Matches dc_master_wilayah_check exactly (schema_snapshot.sql). DO NOT edit
// these values — the DB CHECK constraint rejects anything else.
const WILAYAH_OPTIONS = ['Jawa', 'Sumatera', 'Sulawesi', 'Kalimantan', 'Bali & Nusa Tenggara', 'Lainnya'];

const EMPTY_DRAFT = {
  id: null,
  company_id: '',
  customer_id: '',
  kode: '',
  nama: '',
  wilayah: '',
  alamat: '',
  is_active: true,
};

// ─────────────────────────────────────────────────────────────
// Table badges
// ─────────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wide"
      style={{
        fontFamily: FONT_HEAD, fontWeight: 700,
        background: active ? `${GREEN}1A` : CREAM,
        color: active ? GREEN : MUTED,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: active ? GREEN : MUTED }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function WilayahBadge({ wilayah }) {
  if (!wilayah) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span
      className="px-2 py-0.5 rounded-lg text-[10px]"
      style={{ fontFamily: FONT_HEAD, fontWeight: 700, background: `${ORANGE}1A`, color: ORANGE }}
    >
      {wilayah}
    </span>
  );
}

function KodeBadge({ children }) {
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
// Local helpers (textarea, small label, divider — no kit equivalent)
// ─────────────────────────────────────────────────────────────

function AreaLabel({ children }) {
  return (
    <div style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 7 }}>
      {children}
    </div>
  );
}

function AreaField({ value, onChange, disabled, placeholder }) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={3}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: '100%', borderRadius: 11, border: '1px solid ' + (focus ? NAVY : LINE),
        background: disabled ? CREAM : SURFACE, padding: '12px 14px', fontFamily: FONT_BODY,
        fontSize: 14, color: INK, outline: 'none', resize: 'none',
        boxShadow: focus ? '0 0 0 3px rgba(20,70,130,.16)' : 'none',
        transition: 'border-color .2s, box-shadow .2s',
      }}
    />
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid ' + LINE, margin: '24px 0' }} />;
}

// AccountPicker takes a plain inputStyle object (no focus-state hook exposed),
// so this stays static rather than reactive like FloatingInput's border.
const pickerInputStyle = {
  width: '100%', borderRadius: 11, border: `1px solid ${LINE}`,
  padding: '12px 16px', fontSize: 13, outline: 'none',
  background: SURFACE, color: INK, fontFamily: FONT_BODY,
};

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function DcMasterPage({ onHome }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const search = useDebounce(searchInput, 300);

  // Toolbar customer filter — AccountPicker-driven, independent of the form.
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterCustomerText, setFilterCustomerText] = useState('');

  const { data, total, loading, error, refresh } = useDcMaster({ page, search, customerId: filterCustomerId });

  const totalPages = Math.max(1, Math.ceil(total / DC_MASTER_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * DC_MASTER_PAGE_SIZE + 1;
  const to = Math.min(page * DC_MASTER_PAGE_SIZE, total);

  const handleSearch = (val) => { setSearchInput(val); setPage(1); };
  const clearCustomerFilter = () => { setFilterCustomerId(''); setFilterCustomerText(''); setPage(1); };
  const handlePickFilterCustomer = (a) => { setFilterCustomerText(a.name); setFilterCustomerId(a.id); setPage(1); };
  const handleFilterCustomerText = (v) => { setFilterCustomerText(v); setFilterCustomerId(''); };

  // ── Accounts, fetched once — shared by the toolbar filter picker and the
  // form's customer picker. RLS already scopes this to what the viewer can see.
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    supabase
      .from('accounts')
      .select('id, name, lifecycle_stage')
      .is('deleted_at', null)
      .order('name')
      .limit(1000)
      .then(({ data: rows }) => setAccounts(rows || []));
  }, []);

  // ── Modal state ──
  const [draft, setDraft] = useState(null);
  const [draftCustomerText, setDraftCustomerText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toast, setToast] = useState(null);
  const [companies, setCompanies] = useState([]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load companies when modal opens (mirrors BranchesPage).
  useEffect(() => {
    if (!draft) return;
    fetchAllCompanies().then(({ data: cos }) => setCompanies(cos || []));
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = useCallback(() => {
    setDraft({ ...EMPTY_DRAFT });
    setDraftCustomerText('');
    setSaveError(null);
  }, []);

  const openEdit = useCallback((row) => {
    setDraft({
      id:          row.id,
      company_id:  row.company_id || '',
      customer_id: row.customer_id || '',
      kode:        row.kode || '',
      nama:        row.nama || '',
      wilayah:     row.wilayah || '',
      alamat:      row.alamat || '',
      is_active:   row.is_active !== false,
    });
    setDraftCustomerText(row.accounts?.name || '');
    setSaveError(null);
  }, []);

  const closeModal = useCallback(() => {
    setDraft(null);
    setDraftCustomerText('');
    setSaveError(null);
    setCompanies([]);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.company_id) { setSaveError('Company wajib dipilih.'); return; }
    if (!draft.nama.trim()) { setSaveError('Nama wajib diisi.'); return; }

    setSaving(true);
    setSaveError(null);

    const { error: saveErr } = draft.id
      ? await updateDcMaster(draft.id, draft)
      : await createDcMaster(draft);

    setSaving(false);
    if (saveErr) { setSaveError(saveErr.message || 'Gagal menyimpan. Cek hak akses kamu.'); return; }

    closeModal();
    refresh();
    showToast(draft.id ? 'DC diperbarui.' : 'DC baru ditambahkan.');
  }, [draft, closeModal, refresh, showToast]);

  const isCreate = !draft?.id;
  const lockFields = saving;

  // ── Modal footer ── Cancel uses OutlineBtn, which has no `disabled` prop
  // in the kit — the guard lives in the onClick handler instead so the
  // no-double-submit-while-saving behavior is preserved even though the
  // button won't visually dim during that window.
  const modalFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ flex: 1 }} />
      <OutlineBtn onClick={() => { if (!saving) closeModal(); }}>Cancel</OutlineBtn>
      <PrimaryBtn disabled={saving} onClick={handleSave}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {saving ? <Spinner size={15} className="animate-spin" /> : <Icon name="check" size={16} />}
          {saving ? 'Saving…' : (isCreate ? 'Create DC' : 'Save Changes')}
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
        crumbs={[{ label: 'Foundation' }, { label: 'Master Data & Admin Settings', onClick: onHome }, { label: 'DC Master' }]}
        title="DC Master"
        subtitle="Titik kirim (Distribution Center) per customer. Dipakai dropdown DC di Input SP."
        onBack={onHome}
        right={!loading && (
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', borderRadius: 20, background: `${NAVY}1A`, color: NAVY, fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700 }}>
            {total.toLocaleString('id-ID')}
          </span>
        )}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm transition-shadow"
          style={{ background: SURFACE, borderColor: searchFocus ? NAVY : LINE, boxShadow: searchFocus ? `0 0 0 3px ${NAVY}29` : 'none' }}
        >
          <Search size={14} style={{ color: MUTED }} />
          <input
            type="text"
            placeholder="Cari nama atau kode…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: INK }}
          />
        </div>

        {/* Customer filter */}
        <div style={{ position: 'relative', width: 240 }}>
          <AccountPicker
            value={filterCustomerText}
            accounts={accounts}
            inputStyle={{
              width: '100%', borderRadius: 11, border: `1px solid ${LINE}`,
              padding: '10.5px 34px 10.5px 14px', fontSize: 13, outline: 'none',
              background: SURFACE, color: INK, fontFamily: FONT_BODY,
            }}
            placeholder="Filter by customer…"
            onChangeText={handleFilterCustomerText}
            onPick={handlePickFilterCustomer}
          />
          {filterCustomerText && (
            <button
              type="button"
              onClick={clearCustomerFilter}
              title="Hapus filter customer"
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: MUTED, display: 'flex',
              }}
            >
              <X size={13} />
            </button>
          )}
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
        <PrimaryBtn icon="plus" onClick={openCreate}>New DC</PrimaryBtn>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURFACE, borderColor: LINE }}>
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{
            gridTemplateColumns: '100px 1fr 160px 1fr 80px 44px',
            borderColor: LINE,
            background: CREAM,
            color: MUTED,
          }}
        >
          <div>Kode</div>
          <div>Nama</div>
          <div>Wilayah</div>
          <div>Customer</div>
          <div className="text-right">Status</div>
          <div />
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={6} />
        ) : data.length === 0 ? (
          <EmptyState message={search || filterCustomerId ? 'Tidak ada DC yang cocok.' : 'Belum ada DC.'} />
        ) : (
          data.map((row, i) => {
            const zebra = i % 2 === 1 ? `${CREAM}80` : SURFACE;
            return (
              <div
                key={row.id}
                className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
                style={{ gridTemplateColumns: '100px 1fr 160px 1fr 80px 44px', borderColor: LINE, background: zebra }}
                onMouseEnter={(e) => (e.currentTarget.style.background = ROW_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = zebra)}
              >
                <div>{row.kode ? <KodeBadge>{row.kode}</KodeBadge> : <span style={{ color: MUTED }}>—</span>}</div>
                <div className="font-medium" style={{ color: INK }}>{row.nama}</div>
                <div><WilayahBadge wilayah={row.wilayah} /></div>
                <div style={{ color: INK_SOFT }}>
                  {row.accounts?.name || <span style={{ color: MUTED }}>— (umum)</span>}
                </div>
                <div className="flex justify-end"><StatusBadge active={row.is_active} /></div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
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

        {/* Pagination */}
        {!error && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
            <span className="text-xs" style={{ color: MUTED }}>
              {total === 0 ? 'Tidak ada data' : `Showing ${from}–${to} of ${total.toLocaleString('id-ID')}`}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: CREAM }}>
                <ChevronLeft size={14} style={{ color: INK_SOFT }} />
              </button>
              <span className="px-3 text-xs font-medium" style={{ color: INK_SOFT }}>{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: CREAM }}>
                <ChevronRight size={14} style={{ color: INK_SOFT }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Centered modal form (container = AdminFormModal, untouched) ── */}
      <AdminFormModal
        open={!!draft}
        eyebrow={isCreate ? 'New DC' : 'Edit DC'}
        title={isCreate ? 'Create DC' : draft?.nama || 'Edit DC'}
        subtitle="Data titik kirim (Distribution Center)."
        onClose={closeModal}
        footer={modalFooter}
      >
        {draft && (
          <div>
            {/* ── Identity ── */}
            <SectionLabel style={{ marginBottom: 16 }}>Identity</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {isCreate ? (
                <div style={{ flex: '1 1 100%', opacity: lockFields ? 0.55 : 1, pointerEvents: lockFields ? 'none' : 'auto', transition: 'opacity .2s' }}>
                  <FloatingSelect full label="Company *"
                    value={draft.company_id}
                    onChange={(v) => setDraft((d) => ({ ...d, company_id: v }))}
                    options={[{ value: '', label: '— Select company —' }, ...companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]}
                  />
                </div>
              ) : (
                <div style={{ flex: '1 1 100%' }}>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: NAVY, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Company</div>
                  <div style={{ borderRadius: 11, border: '1px solid ' + LINE, background: CREAM, padding: '16px 14px', fontFamily: FONT_BODY, fontSize: 14, color: INK_SOFT }}>
                    {companies.find((c) => c.id === draft.company_id)
                      ? `${companies.find((c) => c.id === draft.company_id).code} — ${companies.find((c) => c.id === draft.company_id).name}`
                      : 'Loading…'}
                    <span style={{ marginLeft: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED }}>(locked)</span>
                  </div>
                </div>
              )}

              <FloatingInput half label="Kode" value={draft.kode}
                onChange={(v) => setDraft((d) => ({ ...d, kode: v.slice(0, 50) }))}
                disabled={saving} placeholder="opsional" />
              <FloatingInput half label="Nama *" value={draft.nama}
                onChange={(v) => setDraft((d) => ({ ...d, nama: v.slice(0, 200) }))}
                disabled={saving} placeholder="e.g. DC JAKARTA 1" />

              <div style={{ flex: '1 1 100%', opacity: lockFields ? 0.55 : 1, pointerEvents: lockFields ? 'none' : 'auto', transition: 'opacity .2s' }}>
                <FloatingSelect full label="Wilayah"
                  value={draft.wilayah}
                  onChange={(v) => setDraft((d) => ({ ...d, wilayah: v }))}
                  options={[{ value: '', label: '— Tidak ditentukan —' }, ...WILAYAH_OPTIONS.map((w) => ({ value: w, label: w }))]}
                />
              </div>

              <div style={{ flex: '1 1 100%' }}>
                <AreaLabel>Customer Terkait</AreaLabel>
                <AccountPicker
                  value={draftCustomerText}
                  accounts={accounts}
                  inputStyle={pickerInputStyle}
                  placeholder="Kosongkan untuk DC umum (semua customer)…"
                  onChangeText={(v) => { setDraftCustomerText(v); setDraft((d) => ({ ...d, customer_id: '' })); }}
                  onPick={(a) => { setDraftCustomerText(a.name); setDraft((d) => ({ ...d, customer_id: a.id })); }}
                />
                <p style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: MUTED, marginTop: 8 }}>
                  Kosong = DC umum, muncul untuk semua customer di dropdown Input SP.
                </p>
              </div>

              <div style={{ flex: '1 1 100%' }}>
                <AreaLabel>Alamat</AreaLabel>
                <AreaField value={draft.alamat} onChange={(v) => setDraft((d) => ({ ...d, alamat: v }))} disabled={saving} placeholder="Alamat lengkap (opsional)" />
              </div>
            </div>

            <Divider />

            {/* ── Status ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Status</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Toggle on={draft.is_active} onChange={(v) => setDraft((d) => ({ ...d, is_active: v }))} disabled={saving} />
              <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: draft.is_active ? GREEN : INK_SOFT }}>
                {draft.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: MUTED, marginTop: 8 }}>
              Nonaktif = DC ini tidak lagi muncul di dropdown Input SP, tapi tetap ada di daftar ini.
            </p>

            {/* ── Save error ── */}
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

// src/modules/admin/pages/DcMasterPage.jsx
// DC (Distribution Center) master data — paginated list with create / edit.
// Mirrors BranchesPage.jsx's list+AdminFormModal CRUD pattern. No archive/
// delete — is_active toggle (inside the edit form) is the only deactivation
// mechanism asked for. Customer picker reuses AccountPicker as-is (same
// {id, name, account_status} shape it was built for).
//
// Read by src/modules/logistics/InputSPPage.jsx's DC dropdown
// (.eq('is_active', true).is('deleted_at', null)) — untouched by this file,
// it just reads whatever rows this page writes to the same table.

import { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, Check, Plus, X,
  RefreshCw as Spinner,
} from 'lucide-react';
import {
  useDcMaster, DC_MASTER_PAGE_SIZE,
  createDcMaster, updateDcMaster,
} from '../../../hooks/useDcMaster';
import { fetchAllCompanies } from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import { supabase } from '../../../lib/supabase';
import AdminPageHeader from '../components/AdminPageHeader';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import AccountPicker from '../../../components/AccountPicker';

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
};

// Matches dc_master_wilayah_check exactly (schema_snapshot.sql).
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
// Small display components
// ─────────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={
        active
          ? { background: PASTEL.mint, color: '#1A5C35' }
          : { background: PASTEL.lineSoft, color: PASTEL.inkMute }
      }
    >
      <span className="w-1 h-1 rounded-full" style={{ background: active ? PASTEL.mintDeep : PASTEL.inkMute }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function WilayahBadge({ wilayah }) {
  if (!wilayah) return <span style={{ color: PASTEL.inkMute }}>—</span>;
  return (
    <span
      className="px-2 py-0.5 rounded-lg text-[10px] font-semibold"
      style={{ background: PASTEL.sky, color: PASTEL.skyDeep }}
    >
      {wilayah}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Form field primitives (mirrors BranchesPage's local set)
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

function FieldTextarea({ value, onChange, disabled, placeholder }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={3}
      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50 resize-none placeholder:text-[#B8AEA6]"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    />
  );
}

function FieldToggle({ label, checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span
        className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
        style={{ background: checked ? PASTEL.mintDeep : PASTEL.line }}
      >
        <span
          className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </span>
      <span className="text-sm font-medium" style={{ color: checked ? '#1A5C35' : PASTEL.inkSoft }}>
        {label ?? (checked ? 'Active' : 'Inactive')}
      </span>
    </button>
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

const pickerInputStyle = {
  width: '100%', borderRadius: 16, border: `1px solid ${PASTEL.line}`,
  padding: '12px 16px', fontSize: 13, outline: 'none',
  background: 'white', color: PASTEL.ink,
};

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function DcMasterPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
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
      .select('id, name, account_status')
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

  // ── Modal footer ──
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
          : <><Check size={13} /> {isCreate ? 'Create DC' : 'Save Changes'}</>}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div>
      <AdminPageHeader
        title="DC Master"
        subtitle="Titik kirim (Distribution Center) per customer. Dipakai dropdown DC di Input SP."
        count={loading ? undefined : total}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm"
          style={{ background: 'white', borderColor: PASTEL.line }}
        >
          <Search size={14} style={{ color: PASTEL.inkMute }} />
          <input
            type="text"
            placeholder="Cari nama atau kode…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#9C948D]"
            style={{ color: PASTEL.ink }}
          />
        </div>

        {/* Customer filter */}
        <div style={{ position: 'relative', width: 240 }}>
          <AccountPicker
            value={filterCustomerText}
            accounts={accounts}
            inputStyle={{
              width: '100%', borderRadius: 12, border: `1px solid ${PASTEL.line}`,
              padding: '10.5px 34px 10.5px 14px', fontSize: 13, outline: 'none',
              background: 'white', color: PASTEL.ink,
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
                color: PASTEL.inkMute, display: 'flex',
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
          New DC
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{
            gridTemplateColumns: '100px 1fr 160px 1fr 80px 44px',
            borderColor: PASTEL.line,
            background: PASTEL.lineSoft,
            color: PASTEL.inkMute,
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
          data.map((row) => (
            <div
              key={row.id}
              className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
              style={{ gridTemplateColumns: '100px 1fr 160px 1fr 80px 44px', borderColor: PASTEL.line }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                {row.kode ? (
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}>
                    {row.kode}
                  </span>
                ) : <span style={{ color: PASTEL.inkMute }}>—</span>}
              </div>
              <div className="font-medium" style={{ color: PASTEL.ink }}>{row.nama}</div>
              <div><WilayahBadge wilayah={row.wilayah} /></div>
              <div style={{ color: PASTEL.inkSoft }}>
                {row.accounts?.name || <span style={{ color: PASTEL.inkMute }}>— (umum)</span>}
              </div>
              <div className="flex justify-end"><StatusBadge active={row.is_active} /></div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}

        {/* Pagination */}
        {!error && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${PASTEL.line}` }}>
            <span className="text-xs" style={{ color: PASTEL.inkMute }}>
              {total === 0 ? 'Tidak ada data' : `Showing ${from}–${to} of ${total.toLocaleString('id-ID')}`}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: PASTEL.lineSoft }}>
                <ChevronLeft size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
              <span className="px-3 text-xs font-medium" style={{ color: PASTEL.inkSoft }}>{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: PASTEL.lineSoft }}>
                <ChevronRight size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Centered modal form ── */}
      <AdminFormModal
        open={!!draft}
        eyebrow={isCreate ? 'New DC' : 'Edit DC'}
        title={isCreate ? 'Create DC' : draft?.nama || 'Edit DC'}
        subtitle="Data titik kirim (Distribution Center)."
        onClose={closeModal}
        footer={modalFooter}
      >
        {draft && (
          <div className="space-y-6">

            {/* ── Identity ── */}
            <div>
              <SectionLabel>Identity</SectionLabel>
              <div className="space-y-4">

                {/* Company */}
                <div>
                  <FieldLabel required>Company</FieldLabel>
                  {isCreate ? (
                    <FieldSelect
                      value={draft.company_id}
                      onChange={(v) => setDraft((d) => ({ ...d, company_id: v }))}
                      disabled={saving}
                    >
                      <option value="">— Select company —</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                      ))}
                    </FieldSelect>
                  ) : (
                    <div
                      className="rounded-2xl border px-4 py-3 text-sm"
                      style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
                    >
                      {companies.find((c) => c.id === draft.company_id)
                        ? `${companies.find((c) => c.id === draft.company_id).code} — ${companies.find((c) => c.id === draft.company_id).name}`
                        : 'Loading…'}
                      <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: PASTEL.inkMute }}>(locked)</span>
                    </div>
                  )}
                </div>

                {/* Kode + Nama — 2 col */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Kode</FieldLabel>
                    <FieldInput
                      value={draft.kode}
                      onChange={(v) => setDraft((d) => ({ ...d, kode: v }))}
                      disabled={saving}
                      placeholder="opsional"
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <FieldLabel required>Nama</FieldLabel>
                    <FieldInput
                      value={draft.nama}
                      onChange={(v) => setDraft((d) => ({ ...d, nama: v }))}
                      disabled={saving}
                      placeholder="e.g. DC JAKARTA 1"
                      maxLength={200}
                    />
                  </div>
                </div>

                {/* Wilayah */}
                <div>
                  <FieldLabel>Wilayah</FieldLabel>
                  <FieldSelect
                    value={draft.wilayah}
                    onChange={(v) => setDraft((d) => ({ ...d, wilayah: v }))}
                    disabled={saving}
                  >
                    <option value="">— Tidak ditentukan —</option>
                    {WILAYAH_OPTIONS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </FieldSelect>
                </div>

                {/* Customer terkait */}
                <div>
                  <FieldLabel>Customer Terkait</FieldLabel>
                  <AccountPicker
                    value={draftCustomerText}
                    accounts={accounts}
                    inputStyle={pickerInputStyle}
                    placeholder="Kosongkan untuk DC umum (semua customer)…"
                    onChangeText={(v) => { setDraftCustomerText(v); setDraft((d) => ({ ...d, customer_id: '' })); }}
                    onPick={(a) => { setDraftCustomerText(a.name); setDraft((d) => ({ ...d, customer_id: a.id })); }}
                  />
                  <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                    Kosong = DC umum, muncul untuk semua customer di dropdown Input SP.
                  </p>
                </div>

                {/* Alamat */}
                <div>
                  <FieldLabel>Alamat</FieldLabel>
                  <FieldTextarea
                    value={draft.alamat}
                    onChange={(v) => setDraft((d) => ({ ...d, alamat: v }))}
                    disabled={saving}
                    placeholder="Alamat lengkap (opsional)"
                  />
                </div>
              </div>
            </div>

            <Divider />

            {/* ── Status ── */}
            <div>
              <SectionLabel>Status</SectionLabel>
              <FieldToggle
                checked={draft.is_active}
                onChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
                disabled={saving}
              />
              <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                Nonaktif = DC ini tidak lagi muncul di dropdown Input SP, tapi tetap ada di daftar ini.
              </p>
            </div>

            {/* ── Save error ── */}
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

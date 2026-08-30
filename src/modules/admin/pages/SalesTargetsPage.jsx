// src/modules/admin/pages/SalesTargetsPage.jsx
// Sales Targets master data — target per salesperson per bulan, dengan
// create / edit / soft-delete lewat AdminFormModal.
//
// Klon struktural DepartmentsPage.jsx (yang sendirinya klon BranchesPage.jsx):
// kit/tokens admin-settings resmi, AdminFormModal + LoadingState + EmptyState +
// ErrorState + ConfirmModal yang sama, pola paginasi & toast yang sama.
// Sengaja TIDAK memperkenalkan pola baru.
//
// Gate akses TIDAK ada di file ini — sama seperti halaman master data lain,
// gerbangnya dipegang AdminHub (destinasi "sales-targets" memakai gMaster).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, RefreshCw as Spinner } from 'lucide-react';
import {
  useSalesTargets, SALES_TARGETS_PAGE_SIZE,
  createSalesTarget, updateSalesTarget, softDeleteSalesTarget,
} from '../../../hooks/useSalesTargets';
import { fetchAllCompanies } from '../../../hooks/useUserAccess';
import { fetchOperationalRoster } from '../../crm/salesRoster';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ConfirmModal from '../../../components/ConfirmModal';
import {
  Icon, PageHeader, KitStyles, FloatingInput, FloatingSelect, Toggle,
  PrimaryBtn, OutlineBtn, SectionLabel,
} from '../../../pages/foundation/admin-settings/kit';
import {
  NAVY, CREAM, SURFACE, LINE, ROW_HOVER, INK, INK_SOFT, MUTED, DANGER, GREEN,
  FONT_HEAD, FONT_BODY, FONT_MONO, fmtRp,
} from '../../../pages/foundation/admin-settings/tokens';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const THIS_YEAR = new Date().getFullYear();
// Rentang tahun mengikuti CHECK di DB (2020–2100) tapi dipersempit ke jendela
// yang masuk akal dipakai; menawarkan 80 tahun di dropdown tak menolong siapa pun.
const YEAR_OPTIONS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1];

const EMPTY_DRAFT = {
  id: null,
  company_id: '',
  user_id: '',
  period_year: THIS_YEAR,
  period_month: new Date().getMonth() + 1,
  target_value: '',
  target_deals: '',
  notes: '',
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

function CompanyBadge({ company }) {
  if (!company) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ fontFamily: FONT_MONO, background: `${NAVY}1A`, color: NAVY }}
    >
      {company.code}
    </span>
  );
}

function PeriodBadge({ year, month }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ fontFamily: FONT_MONO, background: `${NAVY}1A`, color: NAVY }}
    >
      {String(month).padStart(2, '0')}/{year}
    </span>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid ' + LINE, margin: '24px 0' }} />;
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function SalesTargetsPage({ onHome }) {
  const [page, setPage] = useState(1);
  const [filterYear, setFilterYear] = useState(THIS_YEAR);
  const [filterUser, setFilterUser] = useState('');
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setConfirmState({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false, onConfirm: null }));

  const { data, total, loading, error, refresh } = useSalesTargets({ page, year: filterYear, userId: filterUser });

  const totalPages = Math.max(1, Math.ceil(total / SALES_TARGETS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * SALES_TARGETS_PAGE_SIZE + 1;
  const to = Math.min(page * SALES_TARGETS_PAGE_SIZE, total);

  /* Opsi filter salesperson diturunkan dari DATA yang tampil, bukan roster
     lintas-entitas: halaman ini menampilkan banyak entitas sekaligus sementara
     fetchOperationalRoster bersifat per-entitas. Untuk FORM (di bawah) roster
     tetap dipakai, karena di sana entitasnya sudah dipilih lebih dulu. */
  const userOptions = useMemo(() => {
    const map = new Map();
    data.forEach((r) => { if (r.user_id && !map.has(r.user_id)) map.set(r.user_id, r.user_name || '(tanpa nama)'); });
    return [...map.entries()].map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'id'));
  }, [data]);

  // ── Modal state ──
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [roster, setRoster] = useState([]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!draft) return;
    fetchAllCompanies().then(({ data: cos }) => setCompanies(cos || []));
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Roster salesperson lewat helper bersama `salesRoster` — sumber daftar sales
     yang sama dengan Pipeline, Dashboard, dan Detail Deal. Helper itu sudah
     kebal jebakan roles.company_id (gotcha #18) yang dulu membuat tiga query
     CRM mati senyap; menyalin query-nya di sini akan menghidupkan jebakan itu
     kembali. */
  // Nol setState sinkron di badan effect (aturan lint set-state-in-effect) —
  // seluruh setState ada di dalam .then(), sama seperti useDepartments dan
  // efek parent-department di DepartmentsPage. Pembersihan roster ditangani
  // closeModal, bukan di sini.
  useEffect(() => {
    let cancelled = false;
    if (draft?.company_id) {
      fetchOperationalRoster(draft.company_id).then((rows) => { if (!cancelled) setRoster(rows || []); });
    }
    return () => { cancelled = true; };
  }, [draft?.company_id]);

  const openCreate = useCallback(() => { setDraft({ ...EMPTY_DRAFT }); setSaveError(null); }, []);

  const openEdit = useCallback((row) => {
    setDraft({
      id:           row.id,
      company_id:   row.company_id || '',
      user_id:      row.user_id || '',
      period_year:  row.period_year,
      period_month: row.period_month,
      target_value: row.target_value == null ? '' : String(row.target_value),
      target_deals: row.target_deals == null ? '' : String(row.target_deals),
      notes:        row.notes || '',
      is_active:    row.is_active !== false,
    });
    setSaveError(null);
  }, []);

  const closeModal = useCallback(() => {
    setDraft(null);
    setSaveError(null);
    setArchiving(false);
    setCompanies([]);
    setRoster([]);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.company_id) { setSaveError('Entitas wajib dipilih.'); return; }
    if (!draft.user_id)    { setSaveError('Salesperson wajib dipilih.'); return; }
    // Cermin CHECK sales_targets_metric_required di DB — divalidasi di sini juga
    // supaya user dapat pesan yang bisa dimengerti, bukan error constraint mentah.
    if (draft.target_value === '' && draft.target_deals === '') {
      setSaveError('Isi minimal salah satu target: nilai (Rp) atau jumlah deal.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    const { error: saveErr } = draft.id
      ? await updateSalesTarget(draft.id, draft)
      : await createSalesTarget(draft);

    setSaving(false);
    if (saveErr) {
      // Pelanggaran unique parsial punya pesan Postgres yang tak ramah — beri
      // terjemahan yang menyebut sebabnya, bukan kode constraint.
      const msg = /sales_targets_unique_active/.test(saveErr.message || '')
        ? 'Target untuk salesperson dan periode ini sudah ada. Edit baris yang sudah ada, bukan membuat baru.'
        : (saveErr.message || 'Gagal menyimpan. Periksa izin Anda.');
      setSaveError(msg);
      return;
    }

    closeModal();
    refresh();
    showToast(draft.id ? 'Target diperbarui.' : 'Target dibuat.');
  }, [draft, closeModal, refresh, showToast]);

  const handleArchive = useCallback(() => {
    if (!draft?.id) return;
    showConfirm(
      'Arsipkan Target',
      'Arsipkan target ini? Ia tidak lagi muncul di daftar aktif, dan periode yang sama bisa dibuat ulang.',
      async () => {
        closeConfirm();
        setArchiving(true);
        setSaveError(null);
        const { error: archErr } = await softDeleteSalesTarget(draft.id);
        setArchiving(false);
        if (archErr) { setSaveError(archErr.message || 'Gagal mengarsipkan. Periksa izin Anda.'); return; }
        closeModal();
        refresh();
        showToast('Target diarsipkan.');
      }
    );
  }, [draft, closeModal, refresh, showToast]);

  const isCreate = !draft?.id;
  const lockFields = saving;

  const modalFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      {!isCreate && (
        <OutlineBtn danger icon="trash" onClick={() => { if (!saving && !archiving) handleArchive(); }}>
          {archiving ? 'Mengarsipkan…' : 'Arsipkan'}
        </OutlineBtn>
      )}
      <div style={{ flex: 1 }} />
      <OutlineBtn onClick={() => { if (!saving && !archiving) closeModal(); }}>Batal</OutlineBtn>
      <PrimaryBtn disabled={saving || archiving} onClick={handleSave}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {saving ? <Spinner size={15} className="animate-spin" /> : <Icon name="check" size={16} />}
          {saving ? 'Menyimpan…' : (isCreate ? 'Buat Target' : 'Simpan Perubahan')}
        </span>
      </PrimaryBtn>
    </div>
  );

  const COLS = '70px 1fr 90px 130px 90px 80px 44px';

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: 'Foundation' }, { label: 'Master Data & Admin Settings', onClick: onHome }, { label: 'Sales Targets' }]}
        title="Sales Targets"
        subtitle="Target penjualan per salesperson per bulan. Dipakai Dashboard CRM untuk menghitung pencapaian kuota."
        onBack={onHome}
        right={!loading && (
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', borderRadius: 20, background: `${NAVY}1A`, color: NAVY, fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700 }}>
            {total.toLocaleString('id-ID')}
          </span>
        )}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div style={{ width: 130 }}>
          <FloatingSelect full label="Tahun"
            value={String(filterYear)}
            onChange={(v) => { setFilterYear(Number(v)); setPage(1); }}
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        <div style={{ width: 220 }}>
          <FloatingSelect full label="Salesperson"
            value={filterUser}
            onChange={(v) => { setFilterUser(v); setPage(1); }}
            options={[{ value: '', label: '— Semua —' }, ...userOptions]}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-2.5 rounded-xl border transition-opacity hover:opacity-70"
          style={{ background: SURFACE, borderColor: LINE }}
          title="Muat ulang"
        >
          <RefreshCw size={14} style={{ color: INK_SOFT }} />
        </button>
        <div style={{ flex: 1 }} />
        <PrimaryBtn icon="plus" onClick={openCreate}>Target Baru</PrimaryBtn>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURFACE, borderColor: LINE }}>
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ gridTemplateColumns: COLS, borderColor: LINE, background: CREAM, color: MUTED }}
        >
          <div>Entitas</div>
          <div>Salesperson</div>
          <div>Periode</div>
          <div className="text-right">Target Nilai</div>
          <div className="text-right">Target Deal</div>
          <div className="text-right">Status</div>
          <div />
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={6} />
        ) : data.length === 0 ? (
          <EmptyState message="Belum ada target untuk filter ini." />
        ) : (
          data.map((row, i) => {
            const zebra = i % 2 === 1 ? `${CREAM}80` : SURFACE;
            return (
              <div
                key={row.id}
                className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
                style={{ gridTemplateColumns: COLS, borderColor: LINE, background: zebra }}
                onMouseEnter={(e) => (e.currentTarget.style.background = ROW_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = zebra)}
              >
                <div><CompanyBadge company={row.companies} /></div>
                <div className="font-medium" style={{ color: row.user_name ? INK : MUTED }}>
                  {row.user_name || '(tanpa nama)'}
                </div>
                <div><PeriodBadge year={row.period_year} month={row.period_month} /></div>
                {/* NULL tampil "—", BUKAN Rp 0 — target belum ditetapkan beda
                    artinya dari target nol. */}
                <div className="text-right" style={{ fontFamily: FONT_MONO, color: row.target_value == null ? MUTED : INK }}>
                  {row.target_value == null ? '—' : fmtRp(Number(row.target_value))}
                </div>
                <div className="text-right" style={{ fontFamily: FONT_MONO, color: row.target_deals == null ? MUTED : INK }}>
                  {row.target_deals == null ? '—' : row.target_deals}
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

        {!error && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
            <span className="text-xs" style={{ color: MUTED }}>
              {total === 0 ? 'Tidak ada data' : `Menampilkan ${from}–${to} dari ${total.toLocaleString('id-ID')}`}
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

      {/* ── Modal form ── */}
      <AdminFormModal
        open={!!draft}
        eyebrow={isCreate ? 'Target Baru' : 'Edit Target'}
        title={isCreate ? 'Buat Target Sales' : (draft?.id ? 'Edit Target Sales' : '')}
        subtitle="Target per salesperson per bulan. Target kuartal/tahun dijumlahkan otomatis dari bulan-bulannya."
        onClose={closeModal}
        footer={modalFooter}
      >
        {draft && (
          <div>
            {/* ── Kepemilikan ── */}
            <SectionLabel style={{ marginBottom: 16 }}>Kepemilikan</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {isCreate ? (
                <div style={{ flex: '1 1 100%', opacity: lockFields ? 0.55 : 1, pointerEvents: lockFields ? 'none' : 'auto', transition: 'opacity .2s' }}>
                  <FloatingSelect full label="Entitas *"
                    value={draft.company_id}
                    onChange={(v) => setDraft((d) => ({ ...d, company_id: v, user_id: '' }))}
                    options={[{ value: '', label: '— Pilih entitas —' }, ...companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]}
                  />
                </div>
              ) : (
                <div style={{ flex: '1 1 100%' }}>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: NAVY, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Entitas</div>
                  <div style={{ borderRadius: 11, border: '1px solid ' + LINE, background: CREAM, padding: '16px 14px', fontFamily: FONT_BODY, fontSize: 14, color: INK_SOFT }}>
                    {companies.find((c) => c.id === draft.company_id)
                      ? `${companies.find((c) => c.id === draft.company_id).code} — ${companies.find((c) => c.id === draft.company_id).name}`
                      : 'Memuat…'}
                    <span style={{ marginLeft: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED }}>(terkunci)</span>
                  </div>
                </div>
              )}

              <div style={{ flex: '1 1 100%', opacity: (lockFields || !draft.company_id || !isCreate) ? 0.55 : 1, pointerEvents: (lockFields || !draft.company_id || !isCreate) ? 'none' : 'auto', transition: 'opacity .2s' }}>
                <FloatingSelect full label="Salesperson *"
                  value={draft.user_id}
                  onChange={(v) => setDraft((d) => ({ ...d, user_id: v }))}
                  options={[{ value: '', label: '— Pilih salesperson —' }, ...roster.map((p) => ({ value: p.id, label: p.full_name }))]}
                />
              </div>
            </div>
            <p style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: MUTED, marginTop: 8 }}>
              {isCreate
                ? 'Daftar salesperson mengikuti entitas yang dipilih.'
                : 'Entitas & salesperson terkunci saat edit — buat baris baru kalau targetnya untuk orang lain.'}
            </p>

            <Divider />

            {/* ── Periode ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Periode</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <FloatingSelect half label="Bulan *"
                value={String(draft.period_month)}
                onChange={(v) => setDraft((d) => ({ ...d, period_month: Number(v) }))}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              />
              <FloatingSelect half label="Tahun *"
                value={String(draft.period_year)}
                onChange={(v) => setDraft((d) => ({ ...d, period_year: Number(v) }))}
                options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
              />
            </div>

            <Divider />

            {/* ── Target ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Target</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <FloatingInput half mono label="Target Nilai (Rp)" value={draft.target_value}
                onChange={(v) => setDraft((d) => ({ ...d, target_value: v.replace(/[^\d]/g, '') }))}
                disabled={saving} placeholder="0"
                hint={draft.target_value !== '' ? fmtRp(Number(draft.target_value)) : 'Kosongkan bila belum ditetapkan'} />
              <FloatingInput half mono label="Target Jumlah Deal" value={draft.target_deals}
                onChange={(v) => setDraft((d) => ({ ...d, target_deals: v.replace(/[^\d]/g, '') }))}
                disabled={saving} placeholder="0"
                hint="Jumlah deal WON. Tidak bergantung nilai deal." />
            </div>
            <p style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: MUTED, marginTop: 8, lineHeight: 1.6 }}>
              Isi minimal salah satu. Dikosongkan berarti <b>belum ditetapkan</b> — bukan target nol,
              dan pencapaiannya akan tampil “—” di Dashboard.
              <br />
              Acuan KPI perusahaan (bukan target per orang, tidak disimpan):
              win rate ≥&nbsp;45% · pencapaian kuota ≥&nbsp;85% · cakupan pipeline ≥&nbsp;3,0×&nbsp;kuota.
            </p>

            <Divider />

            {/* ── Catatan & Status ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Catatan &amp; Status</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
              <FloatingInput full label="Catatan" value={draft.notes}
                onChange={(v) => setDraft((d) => ({ ...d, notes: v.slice(0, 300) }))}
                disabled={saving} placeholder="Opsional — mis. dasar penetapan target" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Toggle on={draft.is_active} onChange={(v) => setDraft((d) => ({ ...d, is_active: v }))} disabled={saving} />
              <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: draft.is_active ? GREEN : INK_SOFT }}>
                {draft.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>

            {saveError && (
              <div style={{ marginTop: 24, borderRadius: 14, padding: '14px 16px', background: `${DANGER}0F`, border: `1px solid ${DANGER}40` }}>
                <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 2 }}>Gagal menyimpan</div>
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

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="Ya, Arsipkan"
        cancelLabel="Batal"
        variant="warning"
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}

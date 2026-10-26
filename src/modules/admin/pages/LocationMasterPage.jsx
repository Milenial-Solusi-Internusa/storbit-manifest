// src/modules/admin/pages/LocationMasterPage.jsx
// Location Master — Inquiry Management Irisan 6 (admin page, kartu AdminHub
// "Commercial" grup, id "locations"). Mockup: design-handoff/mockup/Location
// Master.dc.html — dibaca utuh, grid kolom/warna/teks toast diambil VERBATIM
// dari sana (mockup adalah kontrak).
//
// DUA PENYIMPANGAN DARI MOCKUP, SENGAJA, DILAPORKAN BUKAN DITEBAK (di luar
// lingkup eksekusi Irisan 6 yang disetujui — PLAN §BATAS 1/2):
//   1. Baris sub-judul "Used in N inquiries" (mockup r.sub) TIDAK dibangun —
//      itu butuh menghitung referensi inquiries.pol_location_id/
//      pod_location_id per lokasi, query lintas-tabel yang tak diminta
//      PLAN eksekusi ini.
//   2. Banner agregat "{{ nrOn }}" ("N places have no code, type, or country
//      because they were typed freely on inquiries, quotations, or the Sell
//      Rate Card and match no location in this list") TIDAK dibangun — itu
//      butuh men-scan nilai teks bebas DI TABEL LAIN (inquiries/quotations/
//      Sell Rate Card) yang tak cocok lokasi mana pun, di luar scope "jangan
//      sentuh Quotation" + "seed/backfill bukan tugasmu" (PLAN §BATAS 1/2).
//      Konsekuensinya: chip filter Type mockup punya 6 opsi (termasuk "Not
//      recorded"), di sini hanya 5 (tanpa "Not recorded") — kolom code/type/
//      country di tabel `locations` SELALU terisi (NOT NULL, migrasi
//      20261023000001), jadi badge "Not recorded" di level BARIS memang
//      tidak pernah bisa terpicu untuk tabel ini.
//
// Gate: isSuperAdmin(erpRoles) — role-level langsung, BUKAN hasMenuPermission
// key granular. Mockup rule 108 ("A Manager or above adds, edits, and
// deactivates locations") DIPERSEMPIT ke super_admin SAJA oleh keputusan Den
// (Entri 031 butir 7) dan migrasi 20261026000003_locations_super_admin_only_
// write.sql (RLS locations_insert/locations_update: is_super_admin() OR
// is_manager_or_above() → HANYA is_super_admin()). Gate FE di sini cermin
// RLS itu, BUKAN mockup teks aslinya. Kartu AdminHub sendiri digerbang
// terpisah lewat foundation_master, lihat komentar di AdminHub.jsx.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/useAuth';
import { isSuperAdmin } from '../../../lib/roles';
import { useDebounce } from '../../../hooks/useDebounce';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

import { Icon, PageHeader, OutlineBtn, PrimaryBtn, useToast } from '../../../kit';
import {
  CARD, LINE, LINE_SOFT, INK, INK_SOFT, HEAD_BG, ROW_HOVER, INPUT_BG,
  FOCUS_RING, FONT_HEAD, FONT_BODY, FONT_MONO, SEMANTIC, TONE,
} from '../../../kit/tokens';

// Persis D.LOC_TYPES / CHECK constraint locations_type_check (migrasi
// 20261023000001). JANGAN tambah nilai di sini tanpa migrasi DB mengikuti.
const LOCATION_TYPES = ['Seaport', 'Airport', 'City', 'FTZ'];

const TYPE_CHIPS = [{ value: 'all', label: 'All' }, ...LOCATION_TYPES.map((t) => ({ value: t, label: t }))];
const ACTIVE_CHIPS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

const EMPTY_FORM = { code: '', name: '', type: '', country: '' };

// ─────────────────────────────────────────────────────────────
// Small presentational pieces
// ─────────────────────────────────────────────────────────────

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
        border: '1px solid ' + (active ? INK_SOFT : 'transparent'),
        background: active ? CARD : 'transparent',
        fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: INK,
      }}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>{label}</span>
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: HEAD_BG, border: '1px solid ' + LINE, borderRadius: 10, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}

// Mockup: active -> hijau tinted (SEMANTIC.ok), inactive -> netral (SEMANTIC.neutral).
function ActiveBadge({ active }) {
  const t = active ? SEMANTIC.ok : SEMANTIC.neutral;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-md text-[11.5px]"
      style={{ fontFamily: FONT_HEAD, fontWeight: 700, background: t.bg, border: '1px solid ' + t.bd, color: t.fg, whiteSpace: 'nowrap' }}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function CodeBadge({ children }) {
  return (
    <span className="text-[13px] font-semibold" style={{ fontFamily: FONT_MONO, color: INK }}>
      {children}
    </span>
  );
}

function FieldLabel({ children, required }) {
  return (
    <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT, display: 'block', marginBottom: 8 }}>
      {children} {required && <span style={{ color: SEMANTIC.warn.fg }}>*</span>}
    </span>
  );
}

function ModalInput({ value, onChange, placeholder, invalid, mono, disabled }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height: 44, width: '100%', borderRadius: 10,
        border: '1px solid ' + (invalid ? SEMANTIC.warn.bd : focus ? INK_SOFT : LINE),
        background: disabled ? HEAD_BG : INPUT_BG, padding: '0 12px',
        fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: 13.5, color: INK, outline: 'none',
        boxShadow: focus ? FOCUS_RING : 'none',
      }}
    />
  );
}

function ModalSelect({ value, onChange, options, invalid, disabled }) {
  const [focus, setFocus] = useState(false);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height: 44, width: '100%', borderRadius: 10,
        border: '1px solid ' + (invalid ? SEMANTIC.warn.bd : focus ? INK_SOFT : LINE),
        background: disabled ? HEAD_BG : INPUT_BG, padding: '0 8px',
        fontFamily: FONT_BODY, fontSize: 13.5, color: INK, outline: 'none',
      }}
    >
      <option value="">Select type</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function LocationMasterPage({ onHome }) {
  const { erpRoles } = useAuth();
  const canEdit = isSuperAdmin(erpRoles);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [typeF, setTypeF] = useState('all');
  const [actF, setActF] = useState('Active'); // default mockup: s.actF = 'Active'
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 250);

  const [fireToast, toastNode] = useToast();

  // Pola useDcMaster.js -- SELURUH setState di dalam .then(), nol setState
  // sinkron di badan effect (react-hooks/set-state-in-effect). `refresh()`
  // menaikkan refreshKey supaya effect ini jalan ulang -- pemanggil (tombol
  // Refresh, sesudah save/toggle) tidak memanggil query langsung.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('locations')
      .select('id, code, name, country, type, active')
      .order('name')
      .limit(1000)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err); } else { setRows(data || []); setError(null); }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Filter chain -- persis mockup renderVals() (:95), minus cabang 'nr' (lihat
  // komentar header file soal dua penyimpangan yang disengaja).
  const q = search.trim().toLowerCase();
  const list = rows.filter((x) =>
    (typeF === 'all' || x.type === typeF) &&
    (actF === 'all' || (actF === 'Active') === x.active) &&
    (!q || (x.code + ' ' + x.name + ' ' + x.country).toLowerCase().includes(q))
  );

  // ── Modal state ──
  const [modal, setModal] = useState(null); // { id: null|uuid }
  const [form, setForm] = useState(EMPTY_FORM);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  // Handler pembuka modal trivial -- bukan useCallback, keduanya hanya
  // dipakai onClick langsung, nol konsumen yang perlu identitas stabil.
  const openAdd = () => { setModal({ id: null }); setForm(EMPTY_FORM); setTried(false); };
  const openEdit = (row) => {
    setModal({ id: row.id });
    setForm({ code: row.code, name: row.name, type: row.type, country: row.country });
    setTried(false);
  };
  const closeModal = () => { setModal(null); setForm(EMPTY_FORM); setTried(false); };

  const { miss, dupCode, dupName, err } = useMemo(() => {
    const m = {
      code: !form.code.trim(),
      name: !form.name.trim(),
      type: !form.type,
      country: !form.country.trim(),
    };
    const dCode = form.code.trim() && rows.some((y) =>
      y.code.toLowerCase() === form.code.trim().toLowerCase() && (!modal || y.id !== modal.id));
    const dName = form.name.trim() && rows.some((y) =>
      y.name.toLowerCase() === form.name.trim().toLowerCase() && (!modal || y.id !== modal.id));
    const e = tried
      ? (Object.values(m).some(Boolean)
          ? 'Fill in all fields.'
          : dCode
          ? 'This code already exists in Location Master.'
          : dName
          ? 'This name already exists in Location Master.'
          : '')
      : '';
    return { miss: m, dupCode: dCode, dupName: dName, err: e };
  }, [form, rows, modal, tried]);

  // Plain async functions, bukan useCallback -- hanya dipakai onClick
  // langsung, nol konsumen yang perlu identitas stabil (pola sama
  // openAdd/openEdit/closeModal di atas).
  const handleSave = async () => {
    if (Object.values(miss).some(Boolean) || dupCode || dupName) { setTried(true); return; }
    setSaving(true);
    const v = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type: form.type,
      country: form.country.trim(),
    };
    const { error: saveErr } = modal.id
      ? await supabase.from('locations').update(v).eq('id', modal.id)
      : await supabase.from('locations').insert(v);
    setSaving(false);
    if (saveErr) { fireToast(saveErr.message || 'Gagal menyimpan. Cek hak akses kamu.', 'error'); return; }
    closeModal();
    refresh();
    fireToast(v.name + (modal.id ? ' updated' : ' added. It now appears in the location picker'));
  };

  const handleToggle = async (row) => {
    const next = !row.active;
    const { error: toggleErr } = await supabase.from('locations').update({ active: next }).eq('id', row.id);
    if (toggleErr) { fireToast(toggleErr.message || 'Gagal menyimpan. Cek hak akses kamu.', 'error'); return; }
    refresh();
    fireToast(row.name + (next ? ' activated' : ' deactivated. It no longer appears in the location picker, existing inquiries keep it'));
  };

  const isCreate = !modal?.id;

  const modalFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ flex: 1 }} />
      <OutlineBtn onClick={() => { if (!saving) closeModal(); }}>Cancel</OutlineBtn>
      <PrimaryBtn disabled={saving} onClick={handleSave}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {saving ? <RefreshCw size={15} className="animate-spin" /> : <Icon name="check" size={16} />}
          {saving ? 'Saving…' : 'Save'}
        </span>
      </PrimaryBtn>
    </div>
  );

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <PageHeader
        crumbs={[{ label: 'Foundation' }, { label: 'Master Data & Admin Settings', onClick: onHome }, { label: 'Location Master' }]}
        title={(
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Location Master
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6,
                fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700,
                border: '1px solid ' + TONE.orange.bd, background: TONE.orange.bg, color: TONE.orange.fg,
              }}
            >
              New
            </span>
          </span>
        )}
        subtitle="Master lokasi pelabuhan, bandara, kota, dan FTZ -- lintas entitas. Dipakai picker lokasi POL/POD di Inquiry Management."
        onBack={onHome}
        right={canEdit && (
          <PrimaryBtn icon="plus" onClick={openAdd}>Add location</PrimaryBtn>
        )}
      />

      {!canEdit && (
        <div style={{ padding: '10px 14px', background: HEAD_BG, border: '1px solid ' + LINE_SOFT, borderRadius: 10, color: INK_SOFT, fontSize: 13.5, marginBottom: 16 }}>
          Read only. Only a super admin adds, edits, and deactivates locations.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-end gap-4 mb-5 flex-wrap">
        <ChipGroup label="Type">
          {TYPE_CHIPS.map((c) => (
            <Chip key={c.value} active={typeF === c.value} onClick={() => setTypeF(c.value)}>{c.label}</Chip>
          ))}
        </ChipGroup>
        <ChipGroup label="Active">
          {ACTIVE_CHIPS.map((c) => (
            <Chip key={c.value} active={actF === c.value} onClick={() => setActF(c.value)}>{c.label}</Chip>
          ))}
        </ChipGroup>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px', maxWidth: 320 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>Search</span>
          <div className="flex items-center gap-2 px-3.5 h-10 rounded-xl border" style={{ background: INPUT_BG, borderColor: LINE }}>
            <Search size={14} style={{ color: INK_SOFT }} />
            <input
              type="text"
              placeholder="Code, name, or country"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: INK }}
            />
          </div>
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT, alignSelf: 'center' }}>
          {!loading && `${list.length} of ${rows.length} locations`}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="p-2.5 rounded-xl border transition-opacity hover:opacity-70"
          style={{ background: CARD, borderColor: LINE }}
          title="Refresh"
        >
          <RefreshCw size={14} style={{ color: INK_SOFT }} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: LINE }}>
        <div style={{ overflowX: 'auto' }}>
          <div
            className="grid px-0"
            style={{ gridTemplateColumns: '120px minmax(220px,1.4fr) 130px 160px 100px 210px', minWidth: 940, background: HEAD_BG, borderBottom: '1px solid ' + LINE }}
          >
            {['Code', 'Name', 'Type', 'Country', 'Active', 'Actions'].map((h) => (
              <div key={h} style={{ padding: '10px 12px', fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {h}
              </div>
            ))}
          </div>

          {error ? (
            <ErrorState message={error.message} onRetry={refresh} />
          ) : loading ? (
            <LoadingState rows={6} />
          ) : list.length === 0 ? (
            <EmptyState message="No location in this view." />
          ) : (
            list.map((row, i) => {
              const zebra = i % 2 === 1 ? `${HEAD_BG}80` : CARD;
              return (
                <div
                  key={row.id}
                  className="grid items-center text-sm transition-colors"
                  style={{ gridTemplateColumns: '120px minmax(220px,1.4fr) 130px 160px 100px 210px', minWidth: 940, borderBottom: '1px solid ' + LINE_SOFT, background: zebra, opacity: row.active ? 1 : 0.62 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = ROW_HOVER)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = zebra)}
                >
                  <div style={{ padding: 12 }}><CodeBadge>{row.code}</CodeBadge></div>
                  <div style={{ padding: 12, fontWeight: 600, color: INK }}>{row.name}</div>
                  <div style={{ padding: 12, color: INK }}>{row.type}</div>
                  <div style={{ padding: 12, color: INK }}>{row.country}</div>
                  <div style={{ padding: 12 }}><ActiveBadge active={row.active} /></div>
                  <div style={{ padding: '8px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                          style={{ background: 'transparent', border: '1px solid ' + INK_SOFT, color: INK, fontFamily: FONT_HEAD, fontWeight: 600 }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(row)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                          style={{ background: 'transparent', border: '1px solid ' + INK_SOFT, color: INK, fontFamily: FONT_HEAD, fontWeight: 600 }}
                        >
                          {row.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Modal (Add/Edit location) ── */}
      <AdminFormModal
        open={!!modal}
        title={isCreate ? 'Add location' : 'Edit location'}
        onClose={() => { if (!saving) closeModal(); }}
        footer={modalFooter}
      >
        {modal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <FieldLabel required>Code</FieldLabel>
              <ModalInput
                value={form.code}
                onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase().slice(0, 50) }))}
                placeholder="IDTPP"
                mono
                invalid={tried && (miss.code || dupCode)}
                disabled={saving}
              />
            </div>
            <div>
              <FieldLabel required>Name</FieldLabel>
              <ModalInput
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v.slice(0, 200) }))}
                placeholder="Tanjung Priok"
                invalid={tried && (miss.name || dupName)}
                disabled={saving}
              />
            </div>
            <div>
              <FieldLabel required>Type</FieldLabel>
              <ModalSelect
                value={form.type}
                onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                options={LOCATION_TYPES}
                invalid={tried && miss.type}
                disabled={saving}
              />
            </div>
            <div>
              <FieldLabel required>Country</FieldLabel>
              <ModalInput
                value={form.country}
                onChange={(v) => setForm((f) => ({ ...f, country: v.slice(0, 100) }))}
                placeholder="Indonesia"
                invalid={tried && miss.country}
                disabled={saving}
              />
            </div>
            {err && <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: SEMANTIC.warn.fg }}>{err}</span>}
          </div>
        )}
      </AdminFormModal>

      {toastNode}
    </div>
  );
}

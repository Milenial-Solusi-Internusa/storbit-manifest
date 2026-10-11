// src/modules/crm/lead/pages/LeadCapturePage.jsx
// "Multi-channel Lead Capture" (1.1.1) -- pengganti ProspectListPage.jsx sebagai
// halaman yang dimount di menu crm-prospects (/crm/lead/capture). Konsumen
// PERTAMA src/kit/ untuk halaman non-admin (giliran Lead Management, Batch DS 3).
//
// Acuan visual: design-handoff/crm-2026-10-11/shots/lead/01,02,04,24,25.
// SENGAJA BELUM ADA di irisan ini (aksi butuh modal irisan 5 -- Reassign/
// MarkAsLost/Archive/Assign to Sales): tombol aksi di bulk bar, menu baris
// "⋮". Bulk bar tetap tampil (checkbox + "N selected" + Clear) supaya
// pemilihan baris sudah berfungsi begitu irisan 5 menambah tombol aksinya.
//
// Dua deviasi dari batas awal irisan ini, DIPUTUSKAN Den sesudah verifikasi
// visual (ikut mockup, bukan lagi dicatat sebagai "tidak ada"): filter
// Estimated Value kini pakai Slider BARU di src/kit/Form.jsx (kit memang
// belum punya komponen ini sebelum sesi ini), dan avatar Owner berwarna
// beda per orang lewat avatarToneFor() (src/kit/tokens.js) -- lihat laporan
// akhir untuk rincian + perbedaan visual yang MASIH tersisa.
import { useState, useEffect, useCallback } from 'react';
import { Plus, Upload as UploadIcon, ChevronRight, MoreVertical, UserPlus } from 'lucide-react';
import { PageHeader, Card, EmptyState, Select, SearchInput, Segmented, Slider, Badge, PrimaryBtn, OutlineBtn, IconButton } from '../../../../kit';
import { INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, ROW_HOVER, CARD, FONT_BODY, FONT_HEAD, FONT_MONO, RADIUS, SP, fmtRp, avatarToneFor } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole, isSalesOnly as isSalesOnlyRole, isManagerOrAbove } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { bantScoreMeta, BANT_MAX_SCORE } from '../../lib/bant';
import { SOURCES, SOURCE_LABELS, PRIORITIES } from '../lib/leadOptions';
import { LEAD_STATUSES, LEAD_STATUS_META, deriveLeadStatus, applyLeadStatusFilter } from '../lib/leadStatus';
import CaptureLeadModal from '../components/CaptureLeadModal';
import ImportLeadsModal from '../components/ImportLeadsModal';
import ReassignModal from '../components/ReassignModal';
import MarkAsLostModal from '../components/MarkAsLostModal';
import ArchiveModal from '../components/ArchiveModal';

const PAGE_SIZE = 20;
const ESTIMATED_MAX_JUTA = 600; // slider "Estimated Value, up to" -- mockup: ujung kanan = Rp 600 juta
const DATE_BUCKETS = [
  { value: 'all', label: 'Any time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];
const primaryContactOf = (acc) => (Array.isArray(acc.contacts) ? acc.contacts : []).find((k) => k.is_primary && !k.deleted_at) || null;
const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString();

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Warna avatar BEDA per orang, KONSISTEN untuk orang yang sama (keputusan
// Den, deviasi dari batas awal irisan 4) -- avatarToneFor(id) hash stabil
// dari id (bukan nama, supaya dua orang bernama sama tak pernah bentrok).
function OwnerCell({ id, name }) {
  if (!name) return <span style={{ color: INK_FAINT, fontSize: 13 }}>Unassigned</span>;
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const tone = avatarToneFor(id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 22px' }}>{initials}</span>
      <span style={{ fontSize: 13, color: INK }}>{name}</span>
    </div>
  );
}

function BantCell({ score }) {
  const meta = bantScoreMeta(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: INK, fontWeight: 600 }}>{score}/{BANT_MAX_SCORE}</span>
      <span style={{ width: 40, height: 5, borderRadius: 999, background: HEAD_BG, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${(score / BANT_MAX_SCORE) * 100}%`, background: meta.color, borderRadius: 999 }} />
      </span>
    </div>
  );
}

/**
 * @param {(acc: {id:string}) => void} onSelectProspect
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {boolean} [openCaptureOnMount]
 * @param {string} [captureInitialName]
 * @param {() => void} [onCaptureClosed]
 */
export default function LeadCapturePage({ onSelectProspect, showToast, openCaptureOnMount, captureInitialName, onCaptureClosed }) {
  const { profile, erpRole, erpRoles } = useAuth();
  const isAllEntities = isAllEntitiesRole(erpRoles);
  const isSalesOnly = isSalesOnlyRole(erpRole);
  const canManage = isManagerOrAbove(erpRoles);
  // Baris 'mine' selalu milik sendiri bagi isSalesOnly (query sudah
  // .eq('assigned_to', profile.id) di fetchLeads) -- jadi Mark as Lost di
  // bulk bar/menu baris aman tanpa cek kepemilikan per baris di sini.
  const canMarkLost = isSalesOnly || canManage;

  const [scope, setScope] = useState('all'); // 'mine' | 'all' -- paksa 'mine' kalau isSalesOnly
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [owner, setOwner] = useState('all');
  const [entity, setEntity] = useState('all');
  const [createdBucket, setCreatedBucket] = useState('30');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [industry, setIndustry] = useState('all');
  const [priority, setPriority] = useState('all');
  const [touchedBucket, setTouchedBucket] = useState('all');
  // Ujung kanan slider (Rp 600 juta) = "tanpa batas" (persis posisi default
  // mockup), BUKAN "maksimal persis 600jt" -- filter hanya diterapkan saat
  // digeser di BAWAH ujung kanan. ESTIMATED_MAX_JUTA juga dipakai "Clear all".
  const [estimatedMaxJuta, setEstimatedMaxJuta] = useState(ESTIMATED_MAX_JUTA);
  const [industryOptions, setIndustryOptions] = useState([]);
  const [owners, setOwners] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  // Dibuka langsung dari prop saat mount (lazy initializer) -- BUKAN effect
  // ber-deps-kosong, supaya react-hooks/set-state-in-effect tidak menyala;
  // ini memang hanya perlu berjalan sekali di mount pertama.
  const [captureOpen, setCaptureOpen] = useState(() => !!openCaptureOnMount);
  const [captureName, setCaptureName] = useState(() => (openCaptureOnMount ? (captureInitialName || '') : ''));
  const [importOpen, setImportOpen] = useState(false);
  // Satu state untuk ketiga modal aksi (Reassign/Assign to Sales, Mark as
  // Lost, Archive) -- dipicu DUA jalur: bulk bar (accounts = baris
  // terpilih) dan menu baris "⋮" (accounts = satu baris itu saja). Modal
  // itu sendiri (src/modules/crm/lead/components/) sudah menerima array,
  // jadi satu negara cukup untuk keduanya.
  const [modalAction, setModalAction] = useState(null); // { type:'reassign'|'lost'|'archive', accounts:[...] } | null
  const [rowMenuFor, setRowMenuFor] = useState(null);

  const effectiveScope = isSalesOnly ? 'mine' : scope;

  useEffect(() => {
    const companyId = entity !== 'all' ? entity : profile?.company_id;
    if (!companyId) return; // owners lama dibiarkan -- companyId kosong hanya saat profil belum siap
    supabase.from('profiles').select('id, full_name').eq('company_id', companyId).eq('active', true).limit(1000)
      .then(({ data }) => setOwners(data || []));
  }, [entity, profile?.company_id]);

  useEffect(() => {
    supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lead_industry').eq('is_active', true).is('deleted_at', null)
      .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setIndustryOptions(data || []));
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    // Sengaja TANPA setLoading(true) sinkron di sini (react-hooks/set-state-in-effect
    // -- lihat pola useDaftarTtf, ttfGrouping.js): `loading` mulai `true` lewat
    // useState awal, jadi pemuatan PERTAMA tetap menampilkan "Loading data…";
    // refetch berikutnya (filter berubah) memperbarui baris tanpa kedipan loading,
    // konsekuensi yang diterima (bukan dipertahankan dari ProspectListPage.jsx lama).
    try {
      let query = supabase
        .from('accounts')
        .select(`
          id, code, name, source, industry, priority, lifecycle_stage, qualified_at,
          assigned_to, estimated_value, last_activity_at, created_at, company_id,
          bant_budget, bant_authority, bant_need, bant_timeline,
          assigned_profile:profiles!prospects_assigned_to_fkey(full_name),
          contacts(id, name, is_primary, deleted_at)
        `, { count: 'exact' })
        .neq('lifecycle_stage', 'free_agent')
        .is('deleted_at', null);

      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      else if (entity !== 'all') query = query.eq('company_id', entity);

      if (effectiveScope === 'mine') query = query.eq('assigned_to', profile.id);

      if (status !== 'all') query = applyLeadStatusFilter(query, status);
      if (source !== 'all') query = query.eq('source', source);
      if (owner !== 'all') query = query.eq('assigned_to', owner);
      if (industry !== 'all') query = query.eq('industry', industry);
      if (priority !== 'all') query = query.eq('priority', priority);
      if (createdBucket !== 'all') query = query.gte('created_at', daysAgoIso(Number(createdBucket)));
      if (touchedBucket !== 'all') query = query.gte('last_activity_at', daysAgoIso(Number(touchedBucket)));
      if (estimatedMaxJuta < ESTIMATED_MAX_JUTA) query = query.lte('estimated_value', estimatedMaxJuta * 1_000_000);
      if (search.trim()) query = query.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`);

      query = query.order('last_activity_at', { ascending: false, nullsFirst: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      setLeads(data || []);
      setTotal(count || 0);
      setSelected(new Set()); // baris yang ditampilkan berganti -- pilihan lama tak lagi relevan
    } catch (err) {
      showToast?.('Failed to load leads: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
    // Dep array memakai `profile` UTUH, bukan profile?.id/profile?.company_id --
    // React Compiler menyimpulkan dependensinya sebagai objek `profile` (bukan
    // sub-path-nya), dan menyebut keduanya "kurang spesifik dari sumber" kalau
    // dibiarkan optional-chained (react-hooks/preserve-manual-memoization).
  }, [profile, isAllEntities, effectiveScope, entity, status, source, owner, industry, priority, createdBucket, touchedBucket, estimatedMaxJuta, search, page, showToast]);

  // Promise.resolve().then(...) -- pola yang sudah dipakai di tempat lain
  // (AssetDetailITPage.jsx, useHrgaRequests.js) untuk menghindari
  // react-hooks/set-state-in-effect saat effect memanggil fungsi yang
  // isinya men-setState.
  useEffect(() => { Promise.resolve().then(fetchLeads); }, [fetchLeads]);

  // Halaman kembali ke 0 tiap filter berubah -- pola "adjust state during
  // render" (bukan effect terpisah), sama dengan ImportLeadsModal.previewKey.
  const filterKey = `${effectiveScope}|${status}|${source}|${owner}|${entity}|${industry}|${priority}|${createdBucket}|${touchedBucket}|${estimatedMaxJuta}|${search}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    if (page !== 0) setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allChecked = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(leads.map((l) => l.id)));
  const toggleOne = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const scopeLabel = effectiveScope === 'mine' ? 'showing your leads only' : 'showing all team leads';

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY, whiteSpace: 'nowrap' };
  const td = { padding: '12px', fontSize: 13, color: INK, fontFamily: FONT_BODY };

  return (
    <div>
      {/* TANPA `crumbs`: breadcrumb "Modul > Level 2 > Level 3" sudah dirender
          SEKALI oleh ContextHeader (route-table.jsx, layout bersama seluruh
          halaman Kerangka Bagian 1) -- mengirim crumbs di sini menghasilkan
          breadcrumb GANDA (ditemukan saat verifikasi visual terhadap staging,
          bukan dari pembacaan mockup/kode saja). */}
      <PageHeader
        title="Multi-channel Lead Capture"
        right={(
          <div style={{ display: 'flex', gap: SP.s2 }}>
            <OutlineBtn icon={<UploadIcon size={15} />} onClick={() => setImportOpen(true)}>Import Leads</OutlineBtn>
            <PrimaryBtn icon={<Plus size={15} />} onClick={() => { setCaptureName(''); setCaptureOpen(true); }}>Capture Lead</PrimaryBtn>
          </div>
        )}
      />

      <Card style={{ marginBottom: SP.s4 }} pad={SP.s4}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.s3, alignItems: 'flex-end', marginBottom: SP.s3 }}>
          <Field label="Status"><Select value={status} onChange={setStatus} width={140} options={[{ value: 'all', label: 'All' }, ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label }))]} /></Field>
          <Field label="Source"><Select value={source} onChange={setSource} width={150} options={[{ value: 'all', label: 'All sources' }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))]} /></Field>
          {!isSalesOnly && (
            <Field label="Owner"><Select value={owner} onChange={setOwner} width={160} options={[{ value: 'all', label: 'All' }, ...owners.map((o) => ({ value: o.id, label: o.full_name }))]} /></Field>
          )}
          {isAllEntities && (
            <Field label="Entity"><Select value={entity} onChange={setEntity} width={110} options={[{ value: 'all', label: 'All' }, ...ENTITIES.map((e) => ({ value: e.id, label: e.code }))]} /></Field>
          )}
          <Field label="Created Date"><Select value={createdBucket} onChange={setCreatedBucket} width={150} options={DATE_BUCKETS} /></Field>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Field label="Search"><SearchInput value={search} onChange={setSearch} placeholder="Company name, contact name, or account code" /></Field>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3 }}>
          <button type="button" onClick={() => setAdvancedOpen((o) => !o)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: RADIUS.md,
            border: `1px solid ${LINE}`, background: advancedOpen ? ROW_HOVER : '#fff', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK, cursor: 'pointer',
          }}>Advanced</button>
          {(status !== 'all' || source !== 'all' || owner !== 'all' || entity !== 'all' || industry !== 'all' || priority !== 'all' || touchedBucket !== 'all' || estimatedMaxJuta !== ESTIMATED_MAX_JUTA || search) && (
            <button type="button" onClick={() => { setStatus('all'); setSource('all'); setOwner('all'); setEntity('all'); setIndustry('all'); setPriority('all'); setTouchedBucket('all'); setEstimatedMaxJuta(ESTIMATED_MAX_JUTA); setSearch(''); }}
              style={{ background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 13, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_BODY }}>Clear all</button>
          )}
        </div>

        {advancedOpen && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.s3, marginTop: SP.s3, paddingTop: SP.s3, borderTop: `1px solid ${LINE_SOFT}` }}>
            <Field label="Industry"><Select value={industry} onChange={setIndustry} width={160} options={[{ value: 'all', label: 'All' }, ...industryOptions.map((o) => ({ value: o.value, label: o.label }))]} /></Field>
            <Field label="Priority"><Select value={priority} onChange={setPriority} width={120} options={[{ value: 'all', label: 'All' }, ...PRIORITIES.map((p) => ({ value: p, label: p }))]} /></Field>
            <div style={{ width: 200 }}>
              <Slider
                label="Estimated Value, up to" value={estimatedMaxJuta} onChange={setEstimatedMaxJuta}
                min={0} max={ESTIMATED_MAX_JUTA} step={10}
                formatValue={(v) => `Rp ${v} million`}
              />
            </div>
            <Field label="Last Touched"><Select value={touchedBucket} onChange={setTouchedBucket} width={150} options={DATE_BUCKETS} /></Field>
          </div>
        )}
      </Card>

      {!isSalesOnly && (
        <div style={{ marginBottom: SP.s3 }}>
          <Segmented ariaLabel="Lead scope" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My Leads' }, { value: 'all', label: 'All Leads' }]} />
        </div>
      )}

      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap',
          background: ROW_HOVER, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 16px', marginBottom: SP.s3,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{selected.size} selected</span>
            {canManage && (
              <OutlineBtn size="sm" icon={<UserPlus size={14} />} onClick={() => setModalAction({ type: 'reassign', accounts: leads.filter((l) => selected.has(l.id)) })}>
                Assign to Sales
              </OutlineBtn>
            )}
            {canManage && (
              <OutlineBtn size="sm" onClick={() => setModalAction({ type: 'archive', accounts: leads.filter((l) => selected.has(l.id)) })}>Archive</OutlineBtn>
            )}
            {canMarkLost && (
              <OutlineBtn size="sm" style={{ color: '#B4432A', borderColor: '#B4432A' }} onClick={() => setModalAction({ type: 'lost', accounts: leads.filter((l) => selected.has(l.id)) })}>
                Mark as Lost
              </OutlineBtn>
            )}
          </div>
          <button type="button" onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 13, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_BODY }}>Clear selection</button>
        </div>
      )}

      <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: SP.s2, fontFamily: FONT_BODY }}>{total} lead{total === 1 ? '' : 's'}, {scopeLabel}</div>

      <Card padded={false}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
        ) : leads.length === 0 ? (
          <EmptyState
            icon="inbox" title="No leads match these filters" sub="Change or clear the filters, or capture a new lead."
            action={(
              <div style={{ display: 'flex', gap: SP.s2 }}>
                <OutlineBtn onClick={() => setImportOpen(true)}>Import Leads</OutlineBtn>
                <PrimaryBtn onClick={() => { setCaptureName(''); setCaptureOpen(true); }}>Capture Lead</PrimaryBtn>
              </div>
            )}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
                  <th style={{ ...th, width: 36 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" /></th>
                  <th style={th}>Account Code</th>
                  <th style={th}>Source</th>
                  <th style={th}>Company Name</th>
                  <th style={th}>Primary Contact</th>
                  <th style={th}>Status</th>
                  <th style={th}>BANT Score</th>
                  <th style={th}>Owner</th>
                  <th style={th}>Estimated Value</th>
                  <th style={th}>Last Touched</th>
                  <th style={{ ...th, width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => {
                  const lstatus = deriveLeadStatus(l);
                  const meta = lstatus ? LEAD_STATUS_META[lstatus] : null;
                  const rowCanMarkLost = canMarkLost && lstatus !== 'lost';
                  const rowMenuOpen = rowMenuFor === l.id;
                  return (
                    <tr key={l.id}
                      onClick={() => onSelectProspect?.(l)}
                      style={{ borderBottom: i < leads.length - 1 ? `1px solid ${LINE_SOFT}` : 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = ROW_HOVER; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ ...td, width: 36 }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} aria-label={`Select ${l.name}`} />
                      </td>
                      <td style={{ ...td, fontFamily: FONT_MONO, fontWeight: 600 }}>{l.code || '—'}</td>
                      <td style={td}><Badge tone="neutral">{SOURCE_LABELS[l.source] || l.source || '—'}</Badge></td>
                      <td style={{ ...td, fontWeight: 700 }}>{l.name}</td>
                      <td style={{ ...td, color: INK_SOFT }}>{primaryContactOf(l)?.name || '—'}</td>
                      <td style={td}>{meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : '—'}</td>
                      <td style={td}><BantCell score={calcBantScoreSafe(l)} /></td>
                      <td style={td}><OwnerCell id={l.assigned_to} name={l.assigned_profile?.full_name} /></td>
                      <td style={{ ...td, fontFamily: FONT_MONO }}>{l.estimated_value != null ? fmtRp(l.estimated_value) : '—'}</td>
                      <td style={{ ...td, color: INK_FAINT, fontSize: 12.5 }}>{fmtDate(l.last_activity_at)}</td>
                      <td style={{ ...td, width: 60, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                          {(rowCanMarkLost || canManage) && (
                            <IconButton size="xs" variant="ghost" icon={<MoreVertical size={14} />} label="Row actions" onClick={() => setRowMenuFor(rowMenuOpen ? null : l.id)} />
                          )}
                          {rowMenuOpen && (
                            <>
                              <div onClick={() => setRowMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 150, zIndex: 10, overflow: 'hidden' }}>
                                {canManage && (
                                  <button type="button" onClick={() => { setRowMenuFor(null); setModalAction({ type: 'reassign', accounts: [l] }); }}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK }}>
                                    Reassign
                                  </button>
                                )}
                                {canManage && (
                                  <button type="button" onClick={() => { setRowMenuFor(null); setModalAction({ type: 'archive', accounts: [l] }); }}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK }}>
                                    Archive
                                  </button>
                                )}
                                {rowCanMarkLost && (
                                  <button type="button" onClick={() => { setRowMenuFor(null); setModalAction({ type: 'lost', accounts: [l] }); }}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: '#B4432A' }}>
                                    Mark as Lost
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                          <ChevronRight size={15} color={INK_FAINT} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: SP.s3, fontSize: 13, color: INK_SOFT, fontFamily: FONT_BODY }}>
          <span>Page {page + 1} of {totalPages} ({total} total)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <OutlineBtn size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Prev</OutlineBtn>
            <OutlineBtn size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next ›</OutlineBtn>
          </div>
        </div>
      )}

      <CaptureLeadModal
        open={captureOpen} onClose={() => { setCaptureOpen(false); onCaptureClosed?.(); }}
        initialName={captureName} showToast={showToast}
        onSaved={(account) => { setCaptureOpen(false); showToast?.('Lead captured'); fetchLeads(); onSelectProspect?.(account); }}
      />
      <ImportLeadsModal open={importOpen} onClose={() => setImportOpen(false)} showToast={showToast} onImported={fetchLeads} />

      <ReassignModal open={modalAction?.type === 'reassign'} onClose={() => setModalAction(null)} accounts={modalAction?.type === 'reassign' ? modalAction.accounts : []} showToast={showToast}
        onReassigned={() => { setModalAction(null); setSelected(new Set()); showToast?.('Lead reassigned'); fetchLeads(); }} />
      <MarkAsLostModal open={modalAction?.type === 'lost'} onClose={() => setModalAction(null)} accounts={modalAction?.type === 'lost' ? modalAction.accounts : []} showToast={showToast}
        onMarked={() => { setModalAction(null); setSelected(new Set()); showToast?.('Lead marked as Lost'); fetchLeads(); }} />
      <ArchiveModal open={modalAction?.type === 'archive'} onClose={() => setModalAction(null)} accounts={modalAction?.type === 'archive' ? modalAction.accounts : []} showToast={showToast}
        onArchived={() => { setModalAction(null); setSelected(new Set()); showToast?.('Lead archived'); fetchLeads(); }} />
    </div>
  );
}

// BANT score dari EMPAT kolom dimensi (sama dgn ProspectFormPage) -- bukan
// bant_score tersimpan (kolom lama, bisa basi), dihitung di klien dari nilai
// baris yang sudah di-select. Kolom dimensi BELUM ikut di-select query utama
// (hanya dipakai di sini sbg skor ringkasan tabel) -- lihat catatan irisan di
// laporan akhir: kolom bant_* ditambahkan ke select query, dihitung aman
// kalau salah satu kosong (Number(x)||0).
function calcBantScoreSafe(row) {
  const dims = ['bant_budget', 'bant_authority', 'bant_need', 'bant_timeline'];
  return dims.reduce((sum, k) => sum + (Number(row[k]) || 0), 0);
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>{label}</div>
      {children}
    </div>
  );
}

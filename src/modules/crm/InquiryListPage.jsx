// src/modules/crm/InquiryListPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronRight, FileText, Download } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabase';
import { getTodayWIB } from '../../lib/dateUtils';
import { useAuth } from '../../contexts/useAuth';
import InquiryPDF from './InquiryPDF';
import { STATUS_LABEL } from './v3/tokens';
import ListView from './v3/ListView';
import { fetchOperationalRoster } from './salesRoster';

const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  ok:        '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  warn:      '#9A6B0E', warnBg: '#F8ECCF', warnBd: '#E6CE94',
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
  purple:    '#6E4B8C', purpleBg: '#ECE3F4', purpleBd: '#D6C6E4',
  teal:      '#1F6B6B', tealBg: '#DCEBEA', tealBd: '#B2D4D3',
  orange:    '#A45A22', orangeBg: '#F6E8D6', orangeBd: '#E7CDA9',
};

// Pipeline stage badge palette — mirrors ProspectListPage STAGE_META (same tokens).
const STAGE_META = {
  NEW:         { label: 'New',         bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  CONTACTED:   { label: 'Contacted',   bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  QUALIFIED:   { label: 'Qualified',   bg: C.tealBg,    color: C.teal,    bd: C.tealBd    },
  PROPOSAL:    { label: 'Proposal',    bg: C.warnBg,    color: C.warn,    bd: C.warnBd    },
  NEGOTIATION: { label: 'Negotiation', bg: C.orangeBg,  color: C.orange,  bd: C.orangeBd  },
  WON:         { label: 'Won',         bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  LOST:        { label: 'Lost',        bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
  // Jaring pengaman. NURTURE ada di accounts.pipeline_stage (5 akun per 31 Agu
  // 2026) tapi belum satu pun punya inquiry — begitu ada, tanpa entri ini kolom
  // Stage-nya diam-diam jatuh ke '—' tanpa error. Ungu dipakai karena satu-
  // satunya tone di palet C yang belum terpakai di peta ini, sekaligus membaca
  // sebagai "di luar jalur funnel" — dan NURTURE memang bukan tahap progresif.
  NURTURE:     { label: 'Nurture',     bg: C.purpleBg,  color: C.purple,  bd: C.purpleBd  },
};

// Warna badge status. Teksnya dirujuk dari STATUS_LABEL (v3/tokens.js) yang
// dipakai bareng papan Pipeline — jangan tulis ulang teksnya di sini, itu yang
// dulu bikin dua peta melenceng.
const STATUS_META = {
  OPEN:       { label: STATUS_LABEL.OPEN,      bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  IN_REVIEW:  { label: STATUS_LABEL.IN_REVIEW, bg: C.warnBg,    color: C.warn,    bd: C.warnBd    },
  QUOTED:     { label: STATUS_LABEL.QUOTED,    bg: C.purpleBg,  color: C.purple,  bd: C.purpleBd  },
  WON:        { label: STATUS_LABEL.WON,       bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  LOST:       { label: STATUS_LABEL.LOST,      bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
  CANCELLED:  { label: STATUS_LABEL.CANCELLED, bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
};

const SERVICE_TYPE_LABELS = {
  freight_forwarding: 'Freight Forwarding',
  customs:            'Customs Clearance',
  trading:            'General Trading',
};

// Urutan kanonik chip (progresi status). Status di luar daftar → jatuh ke akhir.
const STATUS_ORDER = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED'];
// Warna fallback utk status yg belum punya entri STATUS_META (mis. NEGOTIATION).

const PAGE_SIZE = 20;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Umur inquiry = jumlah hari sejak created_at s/d hari ini (BUKAN lama di status —
// kolomnya created_at, bukan penanda perubahan status; accounts/inquiries tak punya
// kolom itu). null → tak bisa dihitung.
function ageDays(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function StageBadge({ stage }) {
  const m = STAGE_META[stage];
  if (!m) return <span style={{ color: '#A29684', fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
      letterSpacing: '.3px', border: `1px solid ${m.bd}`,
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.OPEN;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
      letterSpacing: '.3px', border: `1px solid ${m.bd}`,
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  );
}


function InquiryDetailModal({ inquiry, onClose }) {
  if (!inquiry) return null;
  const m = STATUS_META[inquiry.status] || STATUS_META.OPEN;

  const Field = ({ label, value, full }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: value ? C.ink : '#D1D5DB', fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</div>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${C.lineSoft}` }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, maxWidth: 620, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: `1px solid ${C.line}` }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 6 }}>DETAIL INQUIRY</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: C.accent, marginBottom: 10, letterSpacing: -0.5 }}>
                {inquiry.inquiry_no || '—'}
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>
                {m.label}
              </span>
            </div>
            <button onClick={onClose} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={C.inkSoft} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px 28px' }}>
          <Section title="Informasi Inquiry">
            <Field label="Service Type" value={SERVICE_TYPE_LABELS[inquiry.service_type] || inquiry.service_type} />
            <Field label="Status"       value={m.label} />
            <Field label="Route"        value={inquiry.route} />
            <Field label="Created At"   value={fmtDate(inquiry.created_at)} />
          </Section>

          <Section title="Customer / Prospect">
            <Field label="Nama" value={inquiry.prospect?.name || inquiry.customer?.name} full />
          </Section>

          <Section title="Detail Kargo">
            <Field label="Nama Barang"      value={inquiry.goods_name} />
            <Field label="Estimated Volume" value={inquiry.estimated_volume} />
          </Section>

          {inquiry.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.lineSoft}` }}>Notes</div>
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: C.surface2, borderRadius: 8, padding: '10px 14px' }}>{inquiry.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InquiryListPage({ onAddInquiry, onSelectInquiry, showToast }) {
  const { profile, erpRole } = useAuth();
  /* Scope per-baris TIDAK lagi disaring di sini — policy `inquiries_read`
     (migrasi 20260830000003) yang menanganinya di server: manager-ke-atas
     melihat seluruh entitasnya, sales melihat yang `owner_id`-nya dirinya,
     procurement melihat yang punya PRF.
     Filter `created_by` yang dulu ada di sini adalah SUMBU LAMA. Sejak policy
     pindah ke `owner_id`, keduanya ber-AND: sales hanya melihat inquiry yang
     SEKALIGUS ia miliki DAN ia buat — sehingga deal yang DIOPER kepadanya
     lewat "Ganti Pemilik" hilang dari daftar, padahal RLS mengizinkan dan
     Pipeline menampilkannya. Sengaja tidak diganti ke .eq('owner_id', …):
     menyalin aturan RLS ke FE hanya melahirkan sumbu kedua yang bisa melenceng
     lagi persis seperti ini.
     `isAllEntities` TETAP — ia bukan aturan baris, melainkan pilihan apakah
     query dibatasi ke satu entitas. */
  const isAllEntities = ['super_admin'].includes(erpRole);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  /* Nama pemilik TIDAK di-embed dari `profiles`. PipelineKanbanPage:111-121 sudah
     membuktikan embed FK inquiries.owner_id -> profiles ditolak PostgREST walau
     FK-nya valid dan schema cache sudah di-reload. Pola dua langkah: owner_id
     diambil sebagai kolom biasa, namanya diambil sekali per pemuatan halaman. */
  const [ownerNames, setOwnerNames] = useState({});
  const [ownerOptions, setOwnerOptions] = useState([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [detailInquiry, setDetailInquiry] = useState(null);
  // Hitungan per status untuk chip. IKUT menyaring service + search (bukan status),
  // supaya angka chip = jumlah baris yang muncul saat chip itu diklik.
  const [statusCounts, setStatusCounts] = useState({});
  const [countsTotal, setCountsTotal] = useState(0);

  const fetchInquiries = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('inquiries')
        .select(`
          id, inquiry_no, service_type, route, status, created_at, estimated_volume, notes,
          pol, pod, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, dimension,
          cargo_types, un_number, imo_class, has_msds, additional_services, deadline_quote,
          prospect:accounts!inquiries_prospect_id_fkey(name, pipeline_stage),
          customer:accounts!inquiries_customer_id_fkey(name, pipeline_stage),
          owner_id,
          created_by_profile:profiles!inquiries_created_by_fkey(full_name)
        `, { count: 'exact' })
        .is('deleted_at', null);

      // Role-aware scope (see flags above)
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);

      query = query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (filterService !== 'all') query = query.eq('service_type', filterService);
      if (filterOwner !== 'all') query = query.eq('owner_id', filterOwner);
      if (search.trim()) query = query.ilike('inquiry_no', `%${search.trim()}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      const rows = data || [];
      setInquiries(rows);
      setTotal(count || 0);

      /* Langkah 2 pola dua-langkah: SATU query per pemuatan halaman, bukan satu per
         baris. Nama yang tak ketemu sengaja dibiarkan kosong — kolom Owner sendiri
         yang memutuskan menampilkan '(unnamed)'. */
      const ownerIds = [...new Set(rows.map(r => r.owner_id).filter(Boolean))];
      if (ownerIds.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name').in('id', ownerIds).limit(1000);
        const map = {};
        (profs || []).forEach(pr => { map[pr.id] = pr.full_name; });
        setOwnerNames(map);
      } else {
        setOwnerNames({});
      }
    } catch (err) {
      showToast?.('Failed to load inquiries: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, page, filterStatus, filterService, filterOwner, search, showToast]);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);
  useEffect(() => { setPage(0); }, [filterStatus, filterService, filterOwner, search]);

  // Query ringan terpisah untuk chip: ambil kolom status saja (dataset kecil, patuh
  // .limit(1000)), hitung per status di client. Scope RLS + service + search SAMA
  // dgn list, TAPI TANPA filter status & tanpa pagination — chip tak boleh menyusut
  // saat sebuah status dipilih. Tak dijalankan ulang saat filterStatus/page berubah.
  useEffect(() => {
    if (!profile?.id) return undefined;
    if (!isAllEntities && !profile?.company_id) return undefined;
    let cancelled = false;
    (async () => {
      let query = supabase.from('inquiries').select('status').is('deleted_at', null);
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      if (filterService !== 'all') query = query.eq('service_type', filterService);
      if (filterOwner !== 'all') query = query.eq('owner_id', filterOwner);
      if (search.trim())  query = query.ilike('inquiry_no', `%${search.trim()}%`);
      const { data, error } = await query.limit(1000);
      if (cancelled) return;
      // Non-fatal: kalau gagal, chip cukup tak menampilkan angka; list utama tetap jalan.
      if (error) { setStatusCounts({}); setCountsTotal(0); return; }
      const counts = {};
      (data || []).forEach(r => { if (r.status) counts[r.status] = (counts[r.status] || 0) + 1; });
      setStatusCounts(counts);
      setCountsTotal((data || []).length);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, filterService, filterOwner, search]);

  /* Opsi dropdown Owner dari roster OPERASIONAL — sumber yang sama dengan
     CRMDashboardPage, bukan query distinct owner_id sendiri. Roster memuat sales
     yang belum punya inquiry sekalipun; itu disengaja, supaya memilih sales yang
     "kosong" menghasilkan daftar kosong yang jujur, bukan opsinya yang hilang. */
  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    fetchOperationalRoster(profile.company_id)
      .then((rows) => { if (!cancelled) setOwnerOptions(rows || []); })
      .catch(() => { if (!cancelled) setOwnerOptions([]); });
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  /* Chip status lama dipetakan ke savedViews ListView, LENGKAP dengan warna
     per-status lewat field `color` yang baru.
     Nilainya diambil dari STATUS_META — peta yang sama yang dipakai StatusBadge
     di kolom Status, jadi chip dan badge dijamin sewarna untuk status yang sama.
     `C.accent` untuk pil "All" dan `C.neutral` sebagai fallback keduanya nilai
     yang persis dipakai StatusChip lama (chip "Semua" ber-meta C.accent; status
     tanpa entri STATUS_META — mis. NEGOTIATION — jatuh ke CHIP_FALLBACK yang
     warnanya C.neutral). Tak ada warna baru yang dikarang di sini. */
  const statusViews = [
    { id: 'all', label: 'All', count: countsTotal, color: C.accent },
    ...Object.keys(statusCounts)
      .filter((k) => statusCounts[k] > 0)
      .sort((a, b) => {
        const ia = STATUS_ORDER.indexOf(a), ib = STATUS_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
      .map((k) => ({
        id: k, label: STATUS_LABEL[k] || k, count: statusCounts[k],
        color: STATUS_META[k]?.color || C.neutral,
      })),
  ];

  /* Kolom Owner ditaruh SESUDAH Status. Tiga keadaan sengaja dibedakan, mengikuti
     konvensi CRMDashboardPage:2790/:3103 dan DealDetailPage:149 — 'Unassigned'
     (owner_id NULL) tidak sama dengan '(unnamed)' (owner ada, namanya tak ketemu). */
  const ownerCell = (inq) => {
    if (!inq.owner_id) return <span style={{ color: C.inkFaint }}>Unassigned</span>;
    return ownerNames[inq.owner_id] || '(unnamed)';
  };

  const columns = [
    { key: 'inquiry_no', label: 'Inquiry No',
      render: (inq) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: C.accent }}>
          {inq.inquiry_no || '—'}
        </span>
      ) },
    { key: 'account', label: 'Prospect / Customer',
      render: (inq) => (
        <span style={{ fontWeight: 600 }}>{inq.prospect?.name || inq.customer?.name || '—'}</span>
      ) },
    { key: 'service_type', label: 'Service Type',
      render: (inq) => SERVICE_TYPE_LABELS[inq.service_type] || inq.service_type || '—' },
    { key: 'route', label: 'Route', render: (inq) => inq.route || '—' },
    { key: 'stage', label: 'Stage',
      render: (inq) => <StageBadge stage={inq.prospect?.pipeline_stage || inq.customer?.pipeline_stage} /> },
    { key: 'status', label: 'Status', render: (inq) => <StatusBadge status={inq.status} /> },
    { key: 'owner', label: 'Owner', render: ownerCell },
    { key: 'created_at', label: 'Created At', render: (inq) => fmtDate(inq.created_at) },
    { key: 'age', label: 'Inquiry Age',
      render: (inq) => (ageDays(inq.created_at) == null ? '—' : `${ageDays(inq.created_at)} days`) },
    { key: 'actions', label: '', align: 'right',
      render: (inq) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          <PDFDownloadLink
            document={<InquiryPDF inquiry={inq} prospectName={inq.prospect?.name || inq.customer?.name || '—'} salesName={inq.created_by_profile?.full_name || '—'} />}
            fileName={`Inquiry-${inq.inquiry_no?.replace(/\//g, '-') || 'unknown'}-${getTodayWIB()}.pdf`}
            style={{ textDecoration: 'none' }}
          >
            {({ loading: pdfLoading }) => (
              <span
                title="Download PDF"
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', padding: 6, borderRadius: 6, opacity: pdfLoading ? 0.4 : 1, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#EAF0F8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Download size={16} color="#1B4D8A" />
              </span>
            )}
          </PDFDownloadLink>
          <ChevronRight size={15} color={C.inkFaint} />
        </div>
      ) },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const selStyle = {
    height: 34, borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.surface, padding: '0 10px', fontSize: 13, color: C.ink,
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={20} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Deal List</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>{total} inquiry terdaftar</p>
          </div>
        </div>
        <button
          onClick={onAddInquiry}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: C.accent, color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(47,107,63,.25)',
          }}
        >
          <Plus size={16} /> Add Inquiry
        </button>
      </div>

      <ListView
        mode="table"
        loading={loading}
        search={search}
        onSearch={setSearch}
        savedViews={statusViews}
        activeView={filterStatus}
        onSelectView={setFilterStatus}
        filters={
          <>
            <select value={filterService} onChange={e => setFilterService(e.target.value)} style={selStyle}>
              <option value="all">All Services</option>
              {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {/* Filter Owner — SERVER-SIDE (masuk ke query), bukan client-side seperti
                papan Pipeline. Halaman ini berpaginasi 20 baris/halaman, jadi menyaring
                di klien hanya akan menyaring 20 baris yang kebetulan tampil. */}
            <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={selStyle}>
              <option value="all">All Owners</option>
              {ownerOptions.map(o => (
                <option key={o.id} value={o.id}>{o.full_name || '(unnamed)'}</option>
              ))}
            </select>
          </>
        }
        columns={columns}
        rows={inquiries}
        onRowClick={(inq) => (onSelectInquiry ? onSelectInquiry(inq) : setDetailInquiry(inq))}
        emptyTitle="No inquiries yet"
        emptySub="Inquiries created for this entity will appear here."
      />

      <InquiryDetailModal inquiry={detailInquiry} onClose={() => setDetailInquiry(null)} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 13, color: C.inkSoft }}>
          <span>Halaman {page + 1} dari {totalPages} ({total} total)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? C.inkFaint : C.ink, fontSize: 13 }}>
              ← Prev
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? C.inkFaint : C.ink, fontSize: 13 }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

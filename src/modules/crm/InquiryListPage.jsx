// src/modules/crm/InquiryListPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, ChevronRight, FileText, Download } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import InquiryPDF from './InquiryPDF';

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
};

const STATUS_META = {
  OPEN:       { label: 'Open',       bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  IN_REVIEW:  { label: 'In Review',  bg: C.warnBg,    color: C.warn,    bd: C.warnBd    },
  QUOTED:     { label: 'Quoted',     bg: C.purpleBg,  color: C.purple,  bd: C.purpleBd  },
  WON:        { label: 'Won',        bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  LOST:       { label: 'Lost',       bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
  CANCELLED:  { label: 'Cancelled',  bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
};

const SERVICE_TYPE_LABELS = {
  freight_forwarding: 'Freight Forwarding',
  customs:            'Customs Clearance',
  trading:            'General Trading',
};

const PAGE_SIZE = 20;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
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
            <Field label="Commodity"        value={inquiry.commodity} />
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
  // Visibility scope by role (mirrors RLS on `inquiries`):
  //  • super_admin / admin → all entities (no company filter)
  //  • sales / operations  → only inquiries they created
  //  • everyone else (manager, ceo, gm, …) → their own entity
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [detailInquiry, setDetailInquiry] = useState(null);

  const fetchInquiries = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('inquiries')
        .select(`
          id, inquiry_no, service_type, route, status, created_at, commodity, estimated_volume, notes,
          pol, pod, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, dimension,
          cargo_types, un_number, imo_class, has_msds, additional_services, deadline_quote,
          prospect:accounts!inquiries_prospect_id_fkey(name, pipeline_stage),
          customer:accounts!inquiries_customer_id_fkey(name, pipeline_stage),
          created_by_profile:profiles!inquiries_created_by_fkey(full_name)
        `, { count: 'exact' })
        .is('deleted_at', null);

      // Role-aware scope (see flags above)
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      if (isSalesOnly)    query = query.eq('created_by', profile.id);

      query = query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (filterService !== 'all') query = query.eq('service_type', filterService);
      if (search.trim()) query = query.ilike('inquiry_no', `%${search.trim()}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      setInquiries(data || []);
      setTotal(count || 0);
    } catch (err) {
      showToast?.('Gagal memuat inquiry: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, page, filterStatus, filterService, search, showToast]);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);
  useEffect(() => { setPage(0); }, [filterStatus, filterService, search]);

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
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Inquiry List</h1>
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
          <Plus size={16} /> Tambah Inquiry
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nomor inquiry…"
            style={{
              width: '100%', height: 34, borderRadius: 8, border: `1px solid ${C.line}`,
              background: C.surface, paddingLeft: 32, paddingRight: 10, fontSize: 13,
              color: C.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">Semua Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={filterService} onChange={e => setFilterService(e.target.value)} style={selStyle}>
          <option value="all">Semua Service</option>
          {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
              {['Inquiry No', 'Prospect / Customer', 'Service Type', 'Route', 'Stage', 'Status', 'Created At', ''].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Memuat data…</td></tr>
            ) : inquiries.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Belum ada inquiry</td></tr>
            ) : inquiries.map((inq, i) => (
              <tr
                key={inq.id}
                onClick={() => (onSelectInquiry ? onSelectInquiry(inq) : setDetailInquiry(inq))}
                style={{
                  borderBottom: i < inquiries.length - 1 ? `1px solid ${C.lineSoft}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: C.accent }}>{inq.inquiry_no || '—'}</td>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: C.ink }}>
                  {inq.prospect?.name || inq.customer?.name || '—'}
                </td>
                <td style={{ padding: '12px 14px', color: C.inkSoft, fontSize: 12.5 }}>
                  {SERVICE_TYPE_LABELS[inq.service_type] || inq.service_type || '—'}
                </td>
                <td style={{ padding: '12px 14px', color: C.inkSoft }}>{inq.route || '—'}</td>
                <td style={{ padding: '12px 14px' }}><StageBadge stage={inq.prospect?.pipeline_stage || inq.customer?.pipeline_stage} /></td>
                <td style={{ padding: '12px 14px' }}><StatusBadge status={inq.status} /></td>
                <td style={{ padding: '12px 14px', color: C.inkFaint, fontSize: 12.5 }}>{fmtDate(inq.created_at)}</td>
                <td style={{ padding: '12px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    <PDFDownloadLink
                      document={<InquiryPDF inquiry={inq} prospectName={inq.prospect?.name || inq.customer?.name || '—'} salesName={inq.created_by_profile?.full_name || '—'} />}
                      fileName={`Inquiry-${inq.inquiry_no?.replace(/\//g, '-') || 'unknown'}-${new Date().toISOString().slice(0, 10)}.pdf`}
                      style={{ textDecoration: 'none' }}
                    >
                      {({ loading }) => (
                        <span
                          title="Download PDF"
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'inline-flex', alignItems: 'center', padding: 6, borderRadius: 6, opacity: loading ? 0.4 : 1, cursor: 'pointer' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#EAF0F8'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <Download size={16} color="#144682" />
                        </span>
                      )}
                    </PDFDownloadLink>
                    <ChevronRight size={15} color={C.inkFaint} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

// src/modules/hrga/pages/MyRequestsPage.jsx
// List of HRGA requests submitted by the current user.
// Server-side paginated, debounced search.
// "+ New Request" button opens request type picker → HrgaRequestForm.

import { useState, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight,
  Plus, ClipboardList,
} from 'lucide-react';
import { useMyHrgaRequests, useHrgaRequestTypes, HRGA_PAGE_SIZE } from '../../../hooks/useHrgaRequests';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../contexts/useAuth';
import HrgaRequestForm from '../components/HrgaRequestForm';
import HrgaRequestDetail from '../components/HrgaRequestDetail';
import LoadingState from '../../admin/components/LoadingState';
import ErrorState from '../../admin/components/ErrorState';

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────
const P = {
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
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
  sky:          '#C8E4F5',
  skyDeep:      '#8FBCD8',
  peach:        '#FFD4B8',
  peachDeep:    '#F5A78F',
};

// ─────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft:              { label: 'Draft',            bg: P.lineSoft,  color: P.inkMute   },
  submitted:          { label: 'Submitted',        bg: P.sky,       color: P.skyDeep   },
  under_review:       { label: 'In Review',        bg: P.butter,    color: '#7A5C10'   },
  revision_requested: { label: 'Revision Needed',  bg: P.rose,      color: P.roseDeep  },
  revised:            { label: 'Revised',          bg: P.butter,    color: '#7A5C10'   },
  approved:           { label: 'Approved',         bg: P.mint,      color: '#1A5C35'   },
  rejected:           { label: 'Rejected',         bg: P.rose,      color: P.roseDeep  },
  cancelled:          { label: 'Cancelled',        bg: P.lineSoft,  color: P.inkMute   },
  completed:          { label: 'Completed',        bg: P.mint,      color: '#1A5C35'   },
  archived:           { label: 'Archived',         bg: P.lineSoft,  color: P.inkMute   },
};

const CATEGORY_COLOR = {
  ADM: { bg: P.lavender,  color: P.lavenderDeep },
  AST: { bg: P.sky,       color: P.skyDeep      },
  FAC: { bg: P.mint,      color: '#1A5C35'      },
  TRV: { bg: P.butter,    color: '#7A5C10'      },
  FIN: { bg: P.peach,     color: '#8C4A18'      },
  OFF: { bg: P.rose,      color: P.roseDeep     },
};

// ─────────────────────────────────────────────────────────────
// Badges
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: P.lineSoft, color: P.inkMute };
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function CategoryBadge({ categoryCode }) {
  const cfg = CATEGORY_COLOR[categoryCode] || { bg: P.lineSoft, color: P.inkMute };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {categoryCode}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Request type picker (grid before form opens)
// ─────────────────────────────────────────────────────────────
const CATEGORY_ORDER = ['ADM', 'AST', 'FAC', 'TRV', 'FIN', 'OFF'];

function RequestTypePicker({ types, onSelect, onClose }) {
  const grouped = CATEGORY_ORDER.map(code => ({
    code,
    name: types.find(t => t.category_code === code)?.category_name || code,
    items: types.filter(t => t.category_code === code),
  })).filter(g => g.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(45,42,40,0.32)', backdropFilter: 'blur(4px)' }}
      />

      {/* Sheet */}
      <div
        className="relative z-10 w-full flex flex-col"
        style={{
          maxWidth: 720,
          maxHeight: 'calc(100svh - 48px)',
          background: 'white',
          borderRadius: 28,
          border: `1px solid ${P.line}`,
          boxShadow: '0 32px 80px rgba(45,42,40,0.22)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-7 pt-7 pb-5 flex-shrink-0">
          <p
            className="text-[10px] uppercase tracking-[0.24em] font-bold mb-1.5"
            style={{ color: P.inkMute }}
          >
            HRGA Request
          </p>
          <h2
            className="font-display text-2xl font-semibold tracking-tight"
            style={{ color: P.ink }}
          >
            Pilih Jenis Request
          </h2>
          <p className="mt-1 text-sm" style={{ color: P.inkSoft }}>
            Pilih kategori yang sesuai dengan kebutuhanmu.
          </p>
        </div>

        <div style={{ borderTop: `1px solid ${P.line}` }} />

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0 px-7 py-6">
          <div className="flex flex-col gap-6">
            {grouped.map(group => {
              const catColor = CATEGORY_COLOR[group.code] || { bg: P.lineSoft, color: P.inkMute };
              return (
                <div key={group.code}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: catColor.bg, color: catColor.color }}
                    >
                      {group.code}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: P.inkSoft }}>
                      {group.name}
                    </span>
                  </div>

                  {/* Type buttons */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {group.items.map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => onSelect(type)}
                        className="flex items-start gap-3 px-4 py-3.5 rounded-2xl text-left transition-all hover:shadow-sm"
                        style={{
                          background: P.lineSoft,
                          border: `1.5px solid ${P.line}`,
                          color: P.ink,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = catColor.color; e.currentTarget.style.background = catColor.bg + '55'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = P.line; e.currentTarget.style.background = P.lineSoft; }}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-snug">{type.type_name}</div>
                          <div className="text-[11px] mt-1" style={{ color: P.inkMute }}>
                            {type.approval_levels === 1 ? 'HRGA' :
                              type.approval_levels === 2 ? '2 level approval' :
                                '3 level approval'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${P.line}` }} />
        <div className="px-7 py-4 flex-shrink-0" style={{ background: P.lineSoft, borderRadius: '0 0 28px 28px' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl text-sm font-semibold hover:opacity-70 transition-opacity"
            style={{ background: 'white', color: P.inkSoft, border: `1.5px solid ${P.line}` }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function MyRequestsPage() {
  const { profile } = useAuth();
  const [rawSearch, setRawSearch] = useState('');
  const [page, setPage]           = useState(1);
  const search = useDebounce(rawSearch, 300);

  // Reset page when search changes
  const handleSearch = useCallback((v) => {
    setRawSearch(v);
    setPage(1);
  }, []);

  const { data, total, loading, error, refresh } = useMyHrgaRequests({ page, search });
  const { data: requestTypes, loading: typesLoading } = useHrgaRequestTypes(profile?.company_id);

  const [showPicker, setShowPicker]         = useState(false);
  const [selectedType, setSelectedType]     = useState(null);
  const [showForm, setShowForm]             = useState(false);
  const [successBanner, setSuccessBanner]   = useState(null);
  const [detailId, setDetailId]             = useState(null);

  const totalPages = Math.ceil(total / HRGA_PAGE_SIZE);

  const handleTypeSelect = useCallback((type) => {
    setSelectedType(type);
    setShowPicker(false);
    setShowForm(true);
  }, []);

  const handleFormSuccess = useCallback(({ document_no }) => {
    setShowForm(false);
    setSelectedType(null);
    setSuccessBanner(document_no);
    refresh();
    setTimeout(() => setSuccessBanner(null), 6000);
  }, [refresh]);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setSelectedType(null);
  }, []);

  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-7 pb-5 border-b" style={{ borderColor: P.line }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[10px] uppercase tracking-[0.22em] font-semibold"
            style={{ color: P.inkMute }}
          >
            Service Management
          </span>
          {total > 0 && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
              style={{ background: P.lavender, color: P.lavenderDeep }}
            >
              {total.toLocaleString('id-ID')}
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="font-display text-3xl font-semibold tracking-tight"
              style={{ color: P.ink }}
            >
              HRGA Request
            </h1>
            <p className="mt-1 text-sm" style={{ color: P.inkSoft }}>
              Permintaan layanan HRGA yang kamu ajukan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            disabled={typesLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all hover:opacity-90 flex-shrink-0"
            style={{ background: P.ink, color: 'white' }}
          >
            <Plus size={15} />
            Buat Request
          </button>
        </div>
      </div>

      {/* ── Success banner ── */}
      {successBanner && (
        <div
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl mb-5 text-sm font-semibold"
          style={{ background: P.mint, color: '#1A5C35' }}
        >
          <ClipboardList size={16} />
          Request <strong>{successBanner}</strong> berhasil disubmit! Menunggu approval dari Supervisor.
        </div>
      )}

      {/* ── Search + refresh ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: P.inkMute }} />
          <input
            type="text"
            value={rawSearch}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Cari request…"
            className="w-full pl-9 pr-4 py-2.5 rounded-2xl text-sm outline-none"
            style={{ border: `1.5px solid ${P.line}`, background: 'white', color: P.ink }}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-2.5 rounded-2xl transition-opacity hover:opacity-70"
          style={{ background: P.lineSoft, border: `1.5px solid ${P.line}` }}
          aria-label="Refresh"
        >
          <RefreshCw size={14} style={{ color: P.inkSoft }} />
        </button>
      </div>

      {/* ── Content ── */}
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error.message} onRetry={refresh} />}

      {!loading && !error && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList size={40} style={{ color: P.inkMute, marginBottom: 16 }} />
          <p className="font-semibold text-base" style={{ color: P.inkSoft }}>
            {search ? 'Tidak ada request yang cocok' : 'Belum ada request'}
          </p>
          <p className="text-sm mt-1" style={{ color: P.inkMute }}>
            {search ? 'Coba kata kunci lain.' : 'Klik "Buat Request" untuk mengajukan permintaan pertamamu.'}
          </p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          {/* Table */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{ border: `1px solid ${P.line}` }}
          >
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: P.lineSoft, borderBottom: `1px solid ${P.line}` }}>
                  {['No. Dokumen', 'Tipe', 'Keperluan', 'Tgl Dibutuhkan', 'Status', 'Diajukan'].map(h => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-[10px] uppercase tracking-widest font-bold"
                      style={{ color: P.inkMute }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((req, idx) => {
                  const rt = req.hrga_request_types;
                  return (
                    <tr
                      key={req.id}
                      onClick={() => setDetailId(req.id)}
                      style={{
                        borderBottom: idx < data.length - 1 ? `1px solid ${P.lineSoft}` : 'none',
                        background: 'white',
                        cursor: 'pointer',
                      }}
                      className="transition-colors hover:bg-stone-50"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-semibold" style={{ color: P.skyDeep }}>
                          {req.document_no}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <CategoryBadge categoryCode={rt?.category_code} categoryName={rt?.category_name} />
                          <span className="text-xs" style={{ color: P.inkSoft }}>{rt?.type_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 max-w-[220px]">
                        <span
                          className="block truncate text-sm"
                          style={{ color: P.ink }}
                          title={req.subject}
                        >
                          {req.subject}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: P.inkSoft }}>
                        {formatDate(req.requested_date)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="px-5 py-3.5 text-xs whitespace-nowrap" style={{ color: P.inkMute }}>
                        {formatDate(req.submitted_at || req.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5 px-1">
              <span className="text-xs" style={{ color: P.inkMute }}>
                {((page - 1) * HRGA_PAGE_SIZE) + 1}–{Math.min(page * HRGA_PAGE_SIZE, total)} dari {total.toLocaleString('id-ID')} request
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-xl transition-opacity disabled:opacity-30"
                  style={{ background: P.lineSoft, border: `1.5px solid ${P.line}` }}
                >
                  <ChevronLeft size={14} style={{ color: P.inkSoft }} />
                </button>
                <span className="text-xs tabular-nums px-2" style={{ color: P.inkSoft }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-xl transition-opacity disabled:opacity-30"
                  style={{ background: P.lineSoft, border: `1.5px solid ${P.line}` }}
                >
                  <ChevronRight size={14} style={{ color: P.inkSoft }} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Type picker overlay ── */}
      {showPicker && (
        <RequestTypePicker
          types={requestTypes}
          onSelect={handleTypeSelect}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* ── Request form modal ── */}
      {selectedType && (
        <HrgaRequestForm
          open={showForm}
          requestType={selectedType}
          profile={profile}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* ── Request detail modal ── */}
      <HrgaRequestDetail
        open={!!detailId}
        requestId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

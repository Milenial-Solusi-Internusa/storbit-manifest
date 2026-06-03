// src/modules/hrga/pages/AllRequestsPage.jsx
// All HRGA requests in the user's company — view only, no action buttons.
// Paginated + debounced search. Click row → HrgaRequestDetail modal.
// Intended for HRGA admin / super admin.

import { useState, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, ClipboardList,
} from 'lucide-react';
import { useAllHrgaRequests, HRGA_PAGE_SIZE } from '../../../hooks/useHrgaRequests';
import { useDebounce } from '../../../hooks/useDebounce';
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
  sky:          '#C8E4F5',
  skyDeep:      '#8FBCD8',
  peach:        '#FFD4B8',
  peachDeep:    '#F5A78F',
};

const STATUS_CONFIG = {
  draft:              { label: 'Draft',           bg: P.lineSoft, color: P.inkMute  },
  submitted:          { label: 'Submitted',       bg: P.sky,      color: P.skyDeep  },
  under_review:       { label: 'In Review',       bg: P.butter,   color: '#7A5C10'  },
  revision_requested: { label: 'Revision Needed', bg: P.rose,     color: P.roseDeep },
  revised:            { label: 'Revised',         bg: P.butter,   color: '#7A5C10'  },
  approved:           { label: 'Approved',        bg: P.mint,     color: '#1A5C35'  },
  rejected:           { label: 'Rejected',        bg: P.rose,     color: P.roseDeep },
  cancelled:          { label: 'Cancelled',       bg: P.lineSoft, color: P.inkMute  },
  completed:          { label: 'Completed',       bg: P.mint,     color: '#1A5C35'  },
  archived:           { label: 'Archived',        bg: P.lineSoft, color: P.inkMute  },
};

const CATEGORY_COLOR = {
  ADM: { bg: P.lavender, color: P.lavenderDeep },
  AST: { bg: P.sky,      color: P.skyDeep      },
  FAC: { bg: P.mint,     color: '#1A5C35'      },
  TRV: { bg: P.butter,   color: '#7A5C10'      },
  FIN: { bg: P.peach,    color: '#8C4A18'      },
  OFF: { bg: P.rose,     color: P.roseDeep     },
};

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

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function AllRequestsPage() {
  const [rawSearch, setRawSearch] = useState('');
  const [page, setPage]           = useState(1);
  const search = useDebounce(rawSearch, 300);

  const handleSearch = useCallback((v) => { setRawSearch(v); setPage(1); }, []);

  const { data, total, loading, error, refresh } = useAllHrgaRequests({ page, search });

  const [detailId, setDetailId] = useState(null);

  const totalPages = Math.ceil(total / HRGA_PAGE_SIZE);

  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-7 pb-5 border-b" style={{ borderColor: P.line }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-[0.22em] font-semibold" style={{ color: P.inkMute }}>
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
        <h1 className="font-display text-3xl font-semibold tracking-tight" style={{ color: P.ink }}>
          Semua Request
        </h1>
        <p className="mt-1 text-sm" style={{ color: P.inkSoft }}>
          Semua pengajuan HRGA di perusahaan ini.
        </p>
      </div>

      {/* ── Search + refresh ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: P.inkMute }} />
          <input
            type="text"
            value={rawSearch}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Cari request, dokumen…"
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
            {search ? 'Coba kata kunci lain.' : 'Belum ada pengajuan dari karyawan di perusahaan ini.'}
          </p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <div className="rounded-3xl overflow-hidden" style={{ border: `1px solid ${P.line}` }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: P.lineSoft, borderBottom: `1px solid ${P.line}` }}>
                  {['No. Dokumen', 'Requester', 'Tipe', 'Keperluan', 'Status', 'Tanggal'].map(h => (
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
                      className="cursor-pointer transition-colors hover:bg-stone-50"
                      style={{ borderBottom: idx < data.length - 1 ? `1px solid ${P.lineSoft}` : 'none' }}
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-semibold" style={{ color: P.skyDeep }}>
                          {req.document_no}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: P.inkSoft }}>
                        {req.requester_name || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <CategoryBadge categoryCode={rt?.category_code} />
                          <span className="text-xs" style={{ color: P.inkSoft }}>{rt?.type_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 max-w-[200px]">
                        <span className="block truncate text-sm" style={{ color: P.ink }} title={req.subject}>
                          {req.subject}
                        </span>
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

      {/* Detail modal */}
      <HrgaRequestDetail
        open={!!detailId}
        requestId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

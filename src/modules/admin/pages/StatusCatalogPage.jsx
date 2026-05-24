// src/modules/admin/pages/StatusCatalogPage.jsx
// Read-only list view for the global status catalog.
// Global table — no company_id. Ordered by sort_order.
// No create/edit/delete in Phase 1.0E.

import { useState } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStatusCatalog, STATUS_CATALOG_PAGE_SIZE } from '../../../hooks/useStatusCatalog';
import { useDebounce } from '../../../hooks/useDebounce';
import AdminPageHeader from '../components/AdminPageHeader';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const PASTEL = {
  ink: '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  line: '#EDE6DC',
  lineSoft: '#F5EFE5',
  mint: '#C8EFD9',
  mintDeep: '#7FC9A0',
  rose: '#F5C8D5',
  roseDeep: '#D89AB0',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
  peach: '#FFD4B8',
  peachDeep: '#F5A78F',
};

// Maps known color_class values from the seed to a readable swatch color.
// Falls back to a neutral style for any unknown value.
const COLOR_SWATCH = {
  'bg-gray-100':    '#F3F4F6',
  'bg-blue-100':    '#DBEAFE',
  'bg-indigo-100':  '#E0E7FF',
  'bg-orange-100':  '#FFEDD5',
  'bg-yellow-100':  '#FEF9C3',
  'bg-green-100':   '#DCFCE7',
  'bg-red-100':     '#FEE2E2',
  'bg-red-50':      '#FFF1F2',
  'bg-sky-100':     '#E0F2FE',
  'bg-emerald-100': '#D1FAE5',
  'bg-slate-100':   '#F1F5F9',
  'bg-amber-100':   '#FEF3C7',
  'bg-rose-100':    '#FFE4E6',
};

function extractSwatchBg(colorClass) {
  if (!colorClass) return '#F5EFE5';
  const bgToken = colorClass.split(' ').find((t) => t.startsWith('bg-'));
  return COLOR_SWATCH[bgToken] || '#F5EFE5';
}

function TerminalBadge({ terminal }) {
  if (!terminal) return null;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: PASTEL.rose, color: '#7A2240' }}
    >
      Terminal
    </span>
  );
}

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

export default function StatusCatalogPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  const { data, total, loading, error, refresh } = useStatusCatalog({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / STATUS_CATALOG_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * STATUS_CATALOG_PAGE_SIZE + 1;
  const to = Math.min(page * STATUS_CATALOG_PAGE_SIZE, total);

  const handleSearch = (val) => {
    setSearchInput(val);
    setPage(1);
  };

  return (
    <div>
      <AdminPageHeader
        title="Status Catalog"
        subtitle="Global status registry for all document workflows. Ordered by workflow progression."
        count={loading ? undefined : total}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm"
          style={{ background: 'white', borderColor: PASTEL.line }}
        >
          <Search size={14} style={{ color: PASTEL.inkMute }} />
          <input
            type="text"
            placeholder="Search by code or label…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#9C948D]"
            style={{ color: PASTEL.ink }}
          />
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
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'white', borderColor: PASTEL.line }}
      >
        {/* Header */}
        <div
          className="grid px-4 py-2.5 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{
            gridTemplateColumns: '24px 120px 1fr 80px 70px 80px',
            borderColor: PASTEL.line,
            background: PASTEL.lineSoft,
            color: PASTEL.inkMute,
          }}
        >
          <div>#</div>
          <div>Code</div>
          <div>Label / Description</div>
          <div>Color</div>
          <div>Terminal</div>
          <div className="text-right">Status</div>
        </div>

        {/* Body */}
        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={8} />
        ) : data.length === 0 ? (
          <EmptyState
            message={search ? 'No statuses match your search.' : 'No status entries found.'}
          />
        ) : (
          data.map((row) => (
            <div
              key={row.id}
              className="grid px-4 py-3 border-b items-center text-sm transition-colors"
              style={{
                gridTemplateColumns: '24px 120px 1fr 80px 70px 80px',
                borderColor: PASTEL.line,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* sort order */}
              <div className="text-xs font-mono" style={{ color: PASTEL.inkMute }}>
                {row.sort_order}
              </div>
              {/* code badge */}
              <div>
                <span
                  className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                  style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
                >
                  {row.code}
                </span>
              </div>
              {/* label + description */}
              <div>
                <div className="font-medium" style={{ color: PASTEL.ink }}>
                  {row.label}
                </div>
                {row.description && (
                  <div
                    className="text-xs mt-0.5 truncate max-w-[340px]"
                    style={{ color: PASTEL.inkMute }}
                  >
                    {row.description}
                  </div>
                )}
              </div>
              {/* color swatch */}
              <div className="flex items-center gap-1.5">
                <span
                  className="w-4 h-4 rounded-md flex-shrink-0 border"
                  style={{
                    background: extractSwatchBg(row.color_class),
                    borderColor: PASTEL.line,
                  }}
                />
                <span className="text-[10px] font-mono truncate max-w-[44px]" style={{ color: PASTEL.inkMute }}>
                  {row.color_class?.split(' ')[0]?.replace('bg-', '') || '—'}
                </span>
              </div>
              {/* terminal */}
              <div>
                {row.is_terminal ? (
                  <TerminalBadge terminal />
                ) : (
                  <span className="text-xs" style={{ color: PASTEL.inkMute }}>—</span>
                )}
              </div>
              {/* status */}
              <div className="flex justify-end">
                <StatusBadge active={row.is_active} />
              </div>
            </div>
          ))
        )}

        {/* Pagination */}
        {!error && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: `1px solid ${PASTEL.line}` }}
          >
            <span className="text-xs" style={{ color: PASTEL.inkMute }}>
              {total === 0
                ? 'No records'
                : `Showing ${from}–${to} of ${total.toLocaleString('id-ID')}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ background: PASTEL.lineSoft }}
              >
                <ChevronLeft size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
              <span className="px-3 text-xs font-medium" style={{ color: PASTEL.inkSoft }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ background: PASTEL.lineSoft }}
              >
                <ChevronRight size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

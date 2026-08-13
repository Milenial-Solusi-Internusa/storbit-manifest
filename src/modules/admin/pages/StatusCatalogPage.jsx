// src/modules/admin/pages/StatusCatalogPage.jsx
// Read-only list view for the global status catalog.
// Global table — no company_id. Ordered by sort_order.
// No create/edit/delete in Phase 1.0E.
//
// Migrated to the official admin-settings kit/tokens (2026-08-13) — breadcrumb,
// heading, table and badges now source from ../../../pages/foundation/
// admin-settings/{kit,tokens} instead of a page-local PASTEL object. Fetch/
// pagination/search logic (incl. extractSwatchBg's DB color_class mapping)
// is unchanged from before the migration — only its neutral fallback color
// now points at the CREAM token instead of a hardcoded hex.

import { useState } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStatusCatalog, STATUS_CATALOG_PAGE_SIZE } from '../../../hooks/useStatusCatalog';
import { useDebounce } from '../../../hooks/useDebounce';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { PageHeader } from '../../../pages/foundation/admin-settings/kit';
import {
  NAVY, CREAM, SURFACE, LINE, ROW_HOVER, INK, INK_SOFT, MUTED, DANGER, GREEN,
  FONT_BODY, FONT_HEAD, FONT_MONO,
} from '../../../pages/foundation/admin-settings/tokens';

// Maps known color_class values from the seed to a readable swatch color.
// Falls back to a neutral style (CREAM token) for any unknown value.
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
  if (!colorClass) return CREAM;
  const bgToken = colorClass.split(' ').find((t) => t.startsWith('bg-'));
  return COLOR_SWATCH[bgToken] || CREAM;
}

function TerminalBadge({ terminal }) {
  if (!terminal) return null;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide"
      style={{ fontFamily: FONT_HEAD, fontWeight: 700, background: `${DANGER}1A`, color: DANGER }}
    >
      Terminal
    </span>
  );
}

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

function CodeBadge({ children }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ fontFamily: FONT_MONO, background: `${NAVY}1A`, color: NAVY }}
    >
      {children}
    </span>
  );
}

export default function StatusCatalogPage({ onHome }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [searchFocus, setSearchFocus] = useState(false);

  const { data, total, loading, error, refresh } = useStatusCatalog({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / STATUS_CATALOG_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * STATUS_CATALOG_PAGE_SIZE + 1;
  const to = Math.min(page * STATUS_CATALOG_PAGE_SIZE, total);

  const handleSearch = (val) => {
    setSearchInput(val);
    setPage(1);
  };

  const gridCols = '24px 120px 1fr 80px 70px 80px';

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <PageHeader
        crumbs={[{ label: 'Foundation' }, { label: 'Master Data & Admin Settings', onClick: onHome }, { label: 'Status Catalog' }]}
        title="Status Catalog"
        subtitle="Global status registry for all document workflows. Ordered by workflow progression."
        onBack={onHome}
        right={!loading && (
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', borderRadius: 20, background: `${NAVY}1A`, color: NAVY, fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700 }}>
            {total.toLocaleString('id-ID')}
          </span>
        )}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm transition-shadow"
          style={{ background: SURFACE, borderColor: searchFocus ? NAVY : LINE, boxShadow: searchFocus ? `0 0 0 3px ${NAVY}29` : 'none' }}
        >
          <Search size={14} style={{ color: MUTED }} />
          <input
            type="text"
            placeholder="Search by code or label…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: INK }}
          />
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
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURFACE, borderColor: LINE }}>
        {/* Header */}
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ gridTemplateColumns: gridCols, borderColor: LINE, background: CREAM, color: MUTED }}
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
          <EmptyState message={search ? 'No statuses match your search.' : 'No status entries found.'} />
        ) : (
          data.map((row, i) => {
            const zebra = i % 2 === 1 ? `${CREAM}80` : SURFACE;
            return (
              <div
                key={row.id}
                className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
                style={{ gridTemplateColumns: gridCols, borderColor: LINE, background: zebra }}
                onMouseEnter={(e) => (e.currentTarget.style.background = ROW_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = zebra)}
              >
                {/* sort order */}
                <div className="text-xs font-mono" style={{ color: MUTED }}>
                  {row.sort_order}
                </div>
                {/* code badge */}
                <div><CodeBadge>{row.code}</CodeBadge></div>
                {/* label + description */}
                <div>
                  <div className="font-medium" style={{ color: INK }}>{row.label}</div>
                  {row.description && (
                    <div className="text-xs mt-0.5 truncate max-w-[340px]" style={{ color: MUTED }}>
                      {row.description}
                    </div>
                  )}
                </div>
                {/* color swatch — extractSwatchBg() logic untouched */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-4 h-4 rounded-md flex-shrink-0 border"
                    style={{ background: extractSwatchBg(row.color_class), borderColor: LINE }}
                  />
                  <span className="text-[10px] font-mono truncate max-w-[44px]" style={{ color: MUTED }}>
                    {row.color_class?.split(' ')[0]?.replace('bg-', '') || '—'}
                  </span>
                </div>
                {/* terminal */}
                <div>
                  {row.is_terminal ? (
                    <TerminalBadge terminal />
                  ) : (
                    <span className="text-xs" style={{ color: MUTED }}>—</span>
                  )}
                </div>
                {/* status */}
                <div className="flex justify-end">
                  <StatusBadge active={row.is_active} />
                </div>
              </div>
            );
          })
        )}

        {/* Pagination */}
        {!error && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
            <span className="text-xs" style={{ color: MUTED }}>
              {total === 0 ? 'No records' : `Showing ${from}–${to} of ${total.toLocaleString('id-ID')}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ background: CREAM }}
              >
                <ChevronLeft size={14} style={{ color: INK_SOFT }} />
              </button>
              <span className="px-3 text-xs font-medium" style={{ color: INK_SOFT }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ background: CREAM }}
              >
                <ChevronRight size={14} style={{ color: INK_SOFT }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

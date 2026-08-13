// src/modules/admin/pages/TaxesPage.jsx
// Read-only list view for tax codes master data.
// Company-scoped. Has deleted_at (soft delete). Ordered by name.
// No create/edit/delete in Phase 1.0E.
//
// Migrated to the official admin-settings kit/tokens (2026-08-13) — breadcrumb,
// heading, table and badges now source from ../../../pages/foundation/
// admin-settings/{kit,tokens} instead of a page-local PASTEL object. Fetch/
// pagination/search logic (incl. formatRate) is unchanged from before the
// migration.

import { useState } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTaxes, TAXES_PAGE_SIZE } from '../../../hooks/useTaxes';
import { useDebounce } from '../../../hooks/useDebounce';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { PageHeader } from '../../../pages/foundation/admin-settings/kit';
import {
  NAVY, ORANGE_DK, CREAM, SURFACE, LINE, ROW_HOVER, INK, INK_SOFT, MUTED,
  GREEN, FONT_BODY, FONT_HEAD, FONT_MONO,
} from '../../../pages/foundation/admin-settings/tokens';

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

function formatRate(rate, taxType) {
  if (rate === null || rate === undefined) return '—';
  const num = parseFloat(rate);
  if (taxType === 'percentage') {
    return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)}%`;
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(num);
}

export default function TaxesPage({ onHome }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [searchFocus, setSearchFocus] = useState(false);

  const { data, total, loading, error, refresh } = useTaxes({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / TAXES_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * TAXES_PAGE_SIZE + 1;
  const to = Math.min(page * TAXES_PAGE_SIZE, total);

  const handleSearch = (val) => {
    setSearchInput(val);
    setPage(1);
  };

  const gridCols = '70px 100px 1fr 80px 80px 70px 80px';

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <PageHeader
        crumbs={[{ label: 'Foundation' }, { label: 'Master Data & Admin Settings', onClick: onHome }, { label: 'Taxes' }]}
        title="Taxes"
        subtitle="Company-scoped tax codes. Indonesian context: PPN, PPh23, PPh21."
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
            placeholder="Search by code or name…"
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
          <div>Company</div>
          <div>Code</div>
          <div>Name</div>
          <div className="text-right">Rate</div>
          <div>Type</div>
          <div>Inclusive</div>
          <div className="text-right">Status</div>
        </div>

        {/* Body */}
        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={6} />
        ) : data.length === 0 ? (
          <EmptyState message={search ? 'No tax codes match your search.' : 'No tax codes found.'} />
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
                <div><CompanyBadge company={row.companies} /></div>
                <div><CodeBadge>{row.code}</CodeBadge></div>
                <div className="font-medium" style={{ color: INK }}>{row.name}</div>
                <div className="text-right font-mono font-semibold text-sm" style={{ color: INK }}>
                  {formatRate(row.rate, row.tax_type)}
                </div>
                <div>
                  <span
                    className="px-2 py-0.5 rounded-lg text-[10px] capitalize"
                    style={{ fontFamily: FONT_HEAD, fontWeight: 700, background: `${ORANGE_DK}1A`, color: ORANGE_DK }}
                  >
                    {row.tax_type}
                  </span>
                </div>
                <div className="text-xs" style={{ color: row.is_inclusive ? INK_SOFT : MUTED }}>
                  {row.is_inclusive ? 'Yes' : 'No'}
                </div>
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

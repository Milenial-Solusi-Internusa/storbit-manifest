// src/modules/admin/pages/PaymentTermsPage.jsx
// Read-only list view for payment terms master data.
// Company-scoped. Has deleted_at (soft delete). Ordered by days_due ascending.
// No create/edit/delete in Phase 1.0E.

import { useState } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePaymentTerms, PAYMENT_TERMS_PAGE_SIZE } from '../../../hooks/usePaymentTerms';
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
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
  sky: '#C8E4F5',
  skyDeep: '#8FBCD8',
};

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

function CompanyBadge({ company }) {
  if (!company) return <span style={{ color: PASTEL.inkMute }}>—</span>;
  return (
    <span
      className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ background: PASTEL.sky, color: PASTEL.skyDeep }}
    >
      {company.code}
    </span>
  );
}

function DaysBadge({ days }) {
  if (days === 0) {
    return (
      <span
        className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
        style={{ background: PASTEL.mint, color: '#1A5C35' }}
      >
        COD
      </span>
    );
  }
  return (
    <span className="font-mono text-sm font-semibold" style={{ color: PASTEL.ink }}>
      {days}
      <span className="text-xs font-normal ml-1" style={{ color: PASTEL.inkMute }}>days</span>
    </span>
  );
}

export default function PaymentTermsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  const { data, total, loading, error, refresh } = usePaymentTerms({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / PAYMENT_TERMS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAYMENT_TERMS_PAGE_SIZE + 1;
  const to = Math.min(page * PAYMENT_TERMS_PAGE_SIZE, total);

  const handleSearch = (val) => {
    setSearchInput(val);
    setPage(1);
  };

  return (
    <div>
      <AdminPageHeader
        title="Payment Terms"
        subtitle="Company-scoped payment term templates. Standardizes due-date calculation for customers and invoices."
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
            placeholder="Search by code or name…"
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
            gridTemplateColumns: '70px 100px 1fr 80px 1fr 80px',
            borderColor: PASTEL.line,
            background: PASTEL.lineSoft,
            color: PASTEL.inkMute,
          }}
        >
          <div>Company</div>
          <div>Code</div>
          <div>Name</div>
          <div>Due</div>
          <div>Description</div>
          <div className="text-right">Status</div>
        </div>

        {/* Body */}
        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={6} />
        ) : data.length === 0 ? (
          <EmptyState
            message={search ? 'No payment terms match your search.' : 'No payment terms found.'}
          />
        ) : (
          data.map((row) => (
            <div
              key={row.id}
              className="grid px-4 py-3 border-b items-center text-sm transition-colors"
              style={{
                gridTemplateColumns: '70px 100px 1fr 80px 1fr 80px',
                borderColor: PASTEL.line,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div><CompanyBadge company={row.companies} /></div>
              <div>
                <span
                  className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                  style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
                >
                  {row.code}
                </span>
              </div>
              <div className="font-medium" style={{ color: PASTEL.ink }}>{row.name}</div>
              <div><DaysBadge days={row.days_due} /></div>
              <div
                className="text-xs truncate max-w-[220px]"
                style={{ color: PASTEL.inkSoft }}
                title={row.description || ''}
              >
                {row.description || <span style={{ color: PASTEL.inkMute }}>—</span>}
              </div>
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

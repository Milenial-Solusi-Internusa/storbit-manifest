// src/modules/admin/components/AdminPageHeader.jsx
// Page-level header for ERP admin screens.
// Shows breadcrumb label, page title, and an optional total count badge.

const PASTEL = {
  ink: '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  line: '#EDE6DC',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
};

export default function AdminPageHeader({ title, subtitle, count }) {
  return (
    <div className="mb-7 pb-5 border-b" style={{ borderColor: PASTEL.line }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[10px] uppercase tracking-[0.22em] font-semibold"
          style={{ color: PASTEL.inkMute }}
        >
          Master Data
        </span>
        {count !== undefined && count !== null && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
            style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
          >
            {count.toLocaleString('id-ID')}
          </span>
        )}
      </div>
      <h1
        className="font-display text-3xl font-semibold tracking-tight"
        style={{ color: PASTEL.ink }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: PASTEL.inkSoft }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

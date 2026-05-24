// src/modules/admin/components/LoadingState.jsx
// Skeleton placeholder shown while a list is fetching.

const PASTEL = {
  lineSoft: '#F5EFE5',
  line: '#EDE6DC',
};

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: PASTEL.line }}>
      <div className="h-3 w-16 rounded-full animate-pulse" style={{ background: PASTEL.lineSoft }} />
      <div className="h-3 flex-1 rounded-full animate-pulse" style={{ background: PASTEL.lineSoft }} />
      <div className="h-3 w-24 rounded-full animate-pulse" style={{ background: PASTEL.lineSoft }} />
      <div className="h-3 w-12 rounded-full animate-pulse" style={{ background: PASTEL.lineSoft }} />
    </div>
  );
}

export default function LoadingState({ rows = 8 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

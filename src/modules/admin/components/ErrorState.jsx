// src/modules/admin/components/ErrorState.jsx
// Shown when a list query fails. Offers a retry callback.

const PASTEL = {
  ink: '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  cream: '#FAF6F0',
  rose: '#F5C8D5',
  roseDeep: '#D89AB0',
  line: '#EDE6DC',
};

export default function ErrorState({ message, onRetry }) {
  return (
    <div
      className="m-4 rounded-2xl border p-8 text-center"
      style={{ background: 'white', borderColor: PASTEL.line }}
    >
      <div
        className="mx-auto mb-4 w-10 h-10 rounded-2xl flex items-center justify-center font-bold"
        style={{ background: PASTEL.rose, color: PASTEL.roseDeep }}
      >
        !
      </div>
      <p className="text-sm font-medium mb-1" style={{ color: PASTEL.ink }}>
        Failed to load data
      </p>
      <p className="text-xs mb-5" style={{ color: PASTEL.inkMute }}>
        {message || 'An unexpected error occurred. Check your connection and try again.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: PASTEL.ink, color: PASTEL.cream }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

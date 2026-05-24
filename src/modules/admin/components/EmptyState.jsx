// src/modules/admin/components/EmptyState.jsx
// Shown when a list query returns zero rows.

const PASTEL = {
  inkMute: '#9C948D',
  lineSoft: '#F5EFE5',
};

export default function EmptyState({ message = 'No records found.' }) {
  return (
    <div className="py-20 flex flex-col items-center text-center">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-2xl"
        style={{ background: PASTEL.lineSoft }}
      >
        ·
      </div>
      <p className="text-sm font-medium" style={{ color: PASTEL.inkMute }}>
        {message}
      </p>
    </div>
  );
}

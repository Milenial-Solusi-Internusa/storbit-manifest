// src/modules/admin/components/EmptyState.jsx
// Shown when a list query returns zero rows.

import { Inbox } from 'lucide-react';

const PASTEL = {
  inkMute: '#9C948D',
  lineSoft: '#F5EFE5',
  line: '#EDE6DC',
};

export default function EmptyState({ message = 'No records found.' }) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: PASTEL.lineSoft, border: `1px solid ${PASTEL.line}` }}
      >
        <Inbox size={20} strokeWidth={1.5} style={{ color: PASTEL.inkMute }} />
      </div>
      <p className="text-sm font-medium" style={{ color: PASTEL.inkMute }}>
        {message}
      </p>
    </div>
  );
}

// src/modules/admin/components/AdminFormModal.jsx
// Reusable centered modal for admin create/edit forms.
//
// Props:
//   open        boolean   — controls visibility
//   eyebrow     string    — small uppercase label above title, e.g. "NEW BRANCH"
//   title       string    — modal heading, e.g. "Create Branch"
//   subtitle    string    — short helper text below the title
//   onClose     fn        — called by X button and ESC key
//   children    ReactNode — scrollable form body
//   footer      ReactNode — sticky bottom area (Cancel + Save + optional Archive)
//   maxWidth    string    — CSS value, default '620px'
//
// Backdrop does NOT close the modal — no unsaved-change detection is present.
// ESC key calls onClose directly (safe because callers clear state on close).

import { useEffect } from 'react';
import { X } from 'lucide-react';

const PASTEL = {
  ink:     '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  line:    '#EDE6DC',
  lineSoft:'#F5EFE5',
};

export default function AdminFormModal({
  open,
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = '620px',
}) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop — does not close modal */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(45,42,40,0.38)', backdropFilter: 'blur(3px)' }}
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full flex flex-col"
        style={{
          maxWidth,
          maxHeight: 'calc(100svh - 48px)',
          background: 'white',
          borderRadius: 28,
          border: `1px solid ${PASTEL.line}`,
          boxShadow:
            '0 32px 80px rgba(45,42,40,0.20), 0 8px 24px rgba(45,42,40,0.10)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-start justify-between gap-4 px-8 pt-8 pb-6 flex-shrink-0"
        >
          <div className="min-w-0">
            {eyebrow && (
              <div
                className="text-[10px] uppercase tracking-[0.24em] font-bold mb-2"
                style={{ color: PASTEL.inkMute }}
              >
                {eyebrow}
              </div>
            )}
            <div
              className="font-display text-2xl font-semibold tracking-tight"
              style={{ color: PASTEL.ink }}
            >
              {title}
            </div>
            {subtitle && (
              <p className="mt-1.5 text-sm leading-snug" style={{ color: PASTEL.inkSoft }}>
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-2xl transition-opacity hover:opacity-70"
            style={{ background: PASTEL.lineSoft }}
            aria-label="Close"
          >
            <X size={16} style={{ color: PASTEL.inkSoft }} />
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${PASTEL.line}`, flexShrink: 0 }} />

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-8 py-7 min-h-0">
          {children}
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${PASTEL.line}`, flexShrink: 0 }} />

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 px-8 py-5"
          style={{
            background: PASTEL.lineSoft,
            borderRadius: '0 0 28px 28px',
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

// src/components/ConfirmModal.jsx
// Reusable confirm dialog — replaces window.confirm across the codebase.
// Supports Escape key to cancel.
import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({
  open,
  title = 'Konfirmasi',
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const colors = {
    danger:  { bg: '#FEE2E2', icon: '#DC2626', btn: '#DC2626', btnHover: '#B91C1C' },
    warning: { bg: '#FEF3C7', icon: '#D97706', btn: '#D97706', btnHover: '#B45309' },
    info:    { bg: '#EFF6FF', icon: '#2563EB', btn: '#144682', btnHover: '#0f3366' },
  };
  const c = colors[variant] || colors.danger;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: 32,
        maxWidth: 420, width: '100%', textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={onCancel}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: '#F3F4F6', border: 'none', borderRadius: 8,
            width: 32, height: 32, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={16} color="#6B7280" />
        </button>

        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: c.bg, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <AlertTriangle size={28} color={c.icon} />
        </div>

        {/* Title */}
        <h2 style={{
          fontFamily: "'Montserrat', sans-serif",
          fontSize: 18, fontWeight: 800, color: '#1A1A1E',
          margin: '0 0 10px',
        }}>{title}</h2>

        {/* Message */}
        <p style={{
          fontSize: 14, color: '#4B5563', lineHeight: 1.6,
          margin: '0 0 28px',
        }}>{message}</p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 24px', borderRadius: 10,
              border: '1.5px solid #D1D5DB', background: 'white',
              color: '#374151', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 24px', borderRadius: 10,
              border: 'none', background: c.btn,
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

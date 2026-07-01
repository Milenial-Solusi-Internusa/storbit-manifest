// src/modules/crm/WinLossModal.jsx
// Shared Win/Loss capture modal — opened when a prospect moves to stage WON or LOST.
// Used by PipelineKanbanPage (drag-drop) and ProspectFormPage (stage dropdown).
//
// Contract:
//   props.mode   = 'won' | 'lost'
//   props.onSave(values) — values is { won_reason } for won, { lost_reason } for lost
//   props.onCancel()     — caller must revert the stage change (no DB write)
//
// The modal only collects + composes the reason text. The caller performs the DB update
// (so it can do optimistic UI, set converted_at, and refresh).
//
// NOTE: callers must pass a `key` that changes on each open (e.g. `${mode}-${id}`) so the
// component remounts with fresh field state — that avoids a reset effect.
import { useState } from 'react';

const LOST_CATEGORIES = [
  { id: 'price',       label: 'Harga tidak kompetitif' },
  { id: 'competitor',  label: 'Kalah dari kompetitor' },
  { id: 'no_need',     label: 'Customer tidak jadi butuh' },
  { id: 'no_response', label: 'Tidak ada response' },
  { id: 'budget_cut',  label: 'Budget cut' },
  { id: 'other',       label: 'Lainnya' },
];

export default function WinLossModal({ open, mode, prospectName, saving, onSave, onCancel }) {
  const [wonReason, setWonReason]   = useState('');
  const [wonProduct, setWonProduct] = useState('');
  const [lostCat, setLostCat]       = useState('');
  const [lostDetail, setLostDetail] = useState('');
  const [err, setErr]               = useState('');

  if (!open) return null;

  const isWon = mode === 'won';

  const handleSubmit = () => {
    if (isWon) {
      if (!wonReason.trim()) { setErr('Alasan Won wajib diisi.'); return; }
      const reason = wonProduct.trim()
        ? `${wonReason.trim()}\n\nProduk/Service: ${wonProduct.trim()}`
        : wonReason.trim();
      onSave({ won_reason: reason });
    } else {
      if (!lostCat) { setErr('Kategori alasan lost wajib dipilih.'); return; }
      if (lostCat === 'other' && !lostDetail.trim()) { setErr('Detail alasan wajib diisi untuk kategori Lainnya.'); return; }
      const catLabel = LOST_CATEGORIES.find(c => c.id === lostCat)?.label || lostCat;
      const reason = lostDetail.trim()
        ? (lostCat === 'other' ? lostDetail.trim() : `${catLabel}: ${lostDetail.trim()}`)
        : catLabel;
      onSave({ lost_reason: reason });
    }
  };

  const accent = isWon ? '#1B4D8A' : '#C0392B';

  const lbl = (text, req) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
      {text}{req && <span style={{ color: '#EF4444' }}> *</span>}
    </div>
  );
  const inpStyle = {
    width: '100%', height: 38, borderRadius: 8, border: '1px solid #E5E7EB',
    padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'white',
  };
  const taStyle = {
    width: '100%', borderRadius: 8, border: '1px solid #E5E7EB', padding: '8px 12px',
    fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 18, padding: 28, maxWidth: 460, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.20)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800, color: '#111827', fontFamily: "'Montserrat',sans-serif" }}>
            {isWon ? '🎉 Deal Closed Won!' : 'Deal Closed Lost'}
          </h2>
          {prospectName && (
            <div style={{ fontSize: 12.5, color: '#6B7280' }}>{prospectName}</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isWon ? (
            <>
              <div>
                {lbl('Alasan Won', true)}
                <textarea
                  value={wonReason}
                  onChange={e => setWonReason(e.target.value)}
                  placeholder="Apa yang membuat customer memilih MSI?"
                  rows={3}
                  style={taStyle}
                />
              </div>
              <div>
                {lbl('Produk/Service yang di-close')}
                <input
                  type="text"
                  value={wonProduct}
                  onChange={e => setWonProduct(e.target.value)}
                  placeholder="Opsional — cth: Sea Freight FCL Jakarta–Surabaya"
                  style={inpStyle}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                {lbl('Kategori alasan lost', true)}
                <select
                  value={lostCat}
                  onChange={e => setLostCat(e.target.value)}
                  style={{ ...inpStyle, cursor: 'pointer' }}
                >
                  <option value="">— Pilih kategori —</option>
                  {LOST_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                {lbl('Detail alasan', lostCat === 'other')}
                <textarea
                  value={lostDetail}
                  onChange={e => setLostDetail(e.target.value)}
                  placeholder={lostCat === 'other' ? 'Wajib — jelaskan alasan lost…' : 'Opsional — detail tambahan…'}
                  rows={3}
                  style={taStyle}
                />
              </div>
            </>
          )}

          {err && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '9px 13px', borderRadius: 8, fontSize: 13 }}>{err}</div>}

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button
              onClick={onCancel}
              disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #D1D5DB', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: accent, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Menyimpan…' : (isWon ? 'Simpan & Konfirmasi' : 'Simpan')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

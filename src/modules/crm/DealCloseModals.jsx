// src/modules/crm/DealCloseModals.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Modal penutupan deal — CRM v3 Batch Pipeline (B3), TASK 4.
//   LostReasonModal   — Tandai Kalah (alasan dari MASTER loss_reasons)
//   CancelReasonModal — Batalkan (alasan teks bebas)
//
// ⚠️ SENGAJA FILE BARU, bukan menambah mode ke WinLossModal.jsx.
//   WinLossModal masih dipakai ProspectFormPage (sumbu pipeline_stage AKUN,
//   dengan LOST_CATEGORIES hardcoded miliknya sendiri). Menambah mode di sana
//   akan mengikat dua sumbu berbeda — lifecycle akun dan status deal — ke satu
//   komponen yang kosakata alasannya kini datang dari dua sumber berbeda
//   (hardcode vs tabel master). WinLossModal.jsx TIDAK disentuh sama sekali.
//
// KENAPA ALASAN KALAH DARI MASTER, ALASAN BATAL TIDAK:
//   Alasan KALAH ikut menghitung win-rate dan dibandingkan antar periode —
//   ia butuh taksonomi tetap yang bisa di-GROUP BY, karena itu FK ke
//   loss_reasons. Alasan BATAL adalah catatan operasional satu kali
//   (customer menarik diri, proyek ditunda, salah input) — memaksanya ke
//   taksonomi tetap akan melahirkan kategori "Lainnya" yang menampung
//   mayoritas isinya, yaitu taksonomi yang tak memberi tahu apa pun.
//
// Pemanggil WAJIB mengoper `key` yang berubah tiap kali dibuka supaya
// komponen remount dengan field bersih — pola sama WinLossModal.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { AlertTriangle, XCircle, Ban } from 'lucide-react';
import { C, HEAD, BODY } from './DealPanels';

/* Kode alasan yang mewajibkan data pesaing. Ini SATU-SATUNYA tempat aturan itu
   tinggal — kalau kelak berubah, ubah di sini, bukan menyebar ke pemanggil.
   Kedua kode diverifikasi ada di seed master (migrasi 20260827000001):
   PRICE = "Harga tidak kompetitif", COMPETITOR = "Menang ke kompetitor". */
// Tidak di-export: dipakai hanya di dalam file ini. Meng-export konstanta
// berdampingan dengan komponen melanggar react-refresh/only-export-components.
const COMPETITOR_REQUIRED_CODES = ['PRICE', 'COMPETITOR'];

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(22,36,58,.45)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16,
};
const sheet = {
  width: '100%', maxWidth: 480, background: '#fff',
  border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
};
const label = {
  display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 700,
  color: C.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5,
};
const field = {
  width: '100%', padding: '9px 11px', borderRadius: 9,
  border: `1px solid ${C.border}`, background: '#fff',
  fontFamily: BODY, fontSize: 13.5, color: C.text, outline: 'none',
};
const btnGhost = {
  height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.border}`,
  background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 12.5,
  fontWeight: 600, cursor: 'pointer',
};
const btnDanger = (disabled) => ({
  height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.redBd}`,
  background: C.red, color: '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

function Shell({ icon, title, subtitle, err, children, onCancel, onSubmit, saving, submitLabel }) {
  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={sheet}>
        <header style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {icon}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15.5, fontWeight: 700, color: C.text }}>{title}</h3>
            {subtitle && (
              <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>{subtitle}</div>
            )}
          </div>
        </header>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
          {err && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '9px 11px', borderRadius: 9,
              background: C.redBg, border: `1px solid ${C.redBd}`,
              fontFamily: BODY, fontSize: 12.5, color: C.red,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {err}
            </div>
          )}
        </div>

        <footer style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" style={btnDanger(saving)} onClick={onSubmit} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LostReasonModal
   onSave({ loss_reason_id, competitor_name, competitor_price })
   `reasons` = baris loss_reasons yang sudah difilter+diurut oleh pemanggil.
   ═══════════════════════════════════════════════════════════════════════════ */
export function LostReasonModal({ open, inquiryNo, reasons = [], saving, onSave, onCancel }) {
  const [reasonId, setReasonId] = useState('');
  const [compName, setCompName] = useState('');
  const [compPrice, setCompPrice] = useState('');
  const [err, setErr] = useState('');

  const selected = useMemo(() => reasons.find((r) => r.id === reasonId) || null, [reasons, reasonId]);
  const needCompetitor = !!selected && COMPETITOR_REQUIRED_CODES.includes(selected.code);

  if (!open) return null;

  const submit = () => {
    if (!reasonId) { setErr('A loss reason is required.'); return; }
    if (needCompetitor) {
      if (!compName.trim()) { setErr('Competitor name is required for this reason.'); return; }
      if (compPrice === '' || Number.isNaN(Number(compPrice))) {
        setErr('Competitor price must be a number for this reason.'); return;
      }
      if (Number(compPrice) < 0) { setErr('Competitor price cannot be negative.'); return; }
    }
    setErr('');
    onSave?.({
      loss_reason_id: reasonId,
      // Field pesaing HANYA dikirim bila memang relevan. Kalau alasannya
      // berubah dari PRICE ke alasan lain sebelum submit, sisa ketikan lama
      // tidak ikut tersimpan — kolomnya tetap NULL, sesuai prinsip
      // "belum diisi harus beda dari diisi kosong".
      competitor_name:  needCompetitor ? compName.trim() : null,
      competitor_price: needCompetitor ? Number(compPrice) : null,
    });
  };

  return (
    <Shell
      icon={<XCircle size={18} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />}
      title="Mark as Lost"
      subtitle={inquiryNo ? `Inquiry ${inquiryNo}` : undefined}
      err={err} onCancel={onCancel} onSubmit={submit} saving={saving}
      submitLabel="Mark as Lost"
    >
      <div>
        <label style={label} htmlFor="lost-reason">Loss reason</label>
        <select
          id="lost-reason" style={field} value={reasonId}
          onChange={(e) => { setReasonId(e.target.value); setErr(''); }}
        >
          <option value="">— Select a reason —</option>
          {reasons.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {reasons.length === 0 && (
          <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 12, color: C.textFaint }}>
            No loss reasons defined yet. Ask an admin to populate Loss Reasons.
          </div>
        )}
      </div>

      {needCompetitor && (
        <>
          <div>
            <label style={label} htmlFor="comp-name">Competitor name</label>
            <input
              id="comp-name" style={field} value={compName}
              onChange={(e) => { setCompName(e.target.value); setErr(''); }}
              placeholder="Competitor company name"
            />
          </div>
          <div>
            <label style={label} htmlFor="comp-price">Competitor price</label>
            <input
              id="comp-price" style={field} value={compPrice} type="number" min="0"
              onChange={(e) => { setCompPrice(e.target.value); setErr(''); }}
              placeholder="0"
            />
          </div>
        </>
      )}
    </Shell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CancelReasonModal — onSave({ cancel_reason })
   ═══════════════════════════════════════════════════════════════════════════ */
export function CancelReasonModal({ open, inquiryNo, saving, onSave, onCancel }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  if (!open) return null;

  const submit = () => {
    if (!reason.trim()) { setErr('A cancellation reason is required.'); return; }
    setErr('');
    onSave?.({ cancel_reason: reason.trim() });
  };

  return (
    <Shell
      icon={<Ban size={18} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />}
      title="Cancel Deal"
      subtitle={inquiryNo ? `Inquiry ${inquiryNo}` : undefined}
      err={err} onCancel={onCancel} onSubmit={submit} saving={saving}
      submitLabel="Cancel Deal"
    >
      <div>
        <label style={label} htmlFor="cancel-reason">Cancellation reason</label>
        <textarea
          id="cancel-reason" rows={4}
          style={{ ...field, resize: 'vertical' }}
          value={reason}
          onChange={(e) => { setReason(e.target.value); setErr(''); }}
          placeholder="Mis. customer menunda proyek, salah input, pengiriman dialihkan…"
        />
        <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 12, color: C.textFaint }}>
          An operational note, not a loss taxonomy — write it as-is.
        </div>
      </div>
    </Shell>
  );
}

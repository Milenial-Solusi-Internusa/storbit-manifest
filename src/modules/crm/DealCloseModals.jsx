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
//
// Putaran 11 Tahap C -- diselaraskan ke mockup Inquiry Management.dc.html:
//   - CancelReasonModal: title "Cancel this inquiry?" (bukan "Cancel
//     Inquiry"), tombol sekunder "Back" (bukan "Cancel", lihat `cancelLabel`
//     Shell), helper teks menjelaskan KAPAN memakai Cancel vs Mark as Lost.
//   - Kedua modal: blok `AffectedDocuments` baru (quotation DRAFT/SUBMITTED/
//     SENT -- SATU teks "will be marked Rejected" sesuai trigger live
//     trg_fn_quotation_auto_close_on_inquiry_closed, BUKAN dua cabang teks
//     seperti draf mockup; PRF/rate request HANYA status, TANPA klaim
//     "akan dibatalkan" -- nol trigger otomatis membatalkan PRF, lihat
//     komentar AffectedDocuments di bawah).
//   - LostReasonModal: field "Notes" mockup SENGAJA TIDAK dibangun
//     (keputusan Den) -- nol kolom DB utk notes khusus Lost.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { AlertTriangle, XCircle, Ban } from 'lucide-react';
import { DEAL_C as C } from './inquiryTheme';
import { HEAD, BODY } from './DealPanels';

/* Kode alasan yang mewajibkan data pesaing. Ini SATU-SATUNYA tempat aturan itu
   tinggal — kalau kelak berubah, ubah di sini, bukan menyebar ke pemanggil.
   Kedua kode diverifikasi ada di seed master (migrasi 20260827000001):
   PRICE = "Harga tidak kompetitif", COMPETITOR = "Menang ke kompetitor". */
// Tidak di-export: dipakai hanya di dalam file ini. Meng-export konstanta
// berdampingan dengan komponen melanggar react-refresh/only-export-components.
const COMPETITOR_REQUIRED_CODES = ['PRICE', 'COMPETITOR'];

// [Putaran 16a Tahap 1] Chrome overlay/sheet diukur mockup
// data-screen-label="Modal/MarkLost"/"Modal/CancelInquiry": backdrop INK
// rgba(51,66,43,.35) + sheet NOL border, box-shadow rgba(51,66,43,.22),
// radius 18.
const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: C.backdrop, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16,
};
const sheet = {
  width: '100%', maxWidth: 480, background: C.surface,
  borderRadius: 18, boxShadow: C.shadowModal, overflow: 'hidden',
};
// [Putaran 16a Tahap 1] label field diukur mockup: INK_SOFT (textMute),
// bukan INK_FAINT (textFaint).
const label = {
  display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 700,
  color: C.textMute, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5,
};
// [Putaran 16a Tahap 1] field diukur mockup: background BG (C.bg), bukan putih solid.
const field = {
  width: '100%', padding: '9px 11px', borderRadius: 10,
  border: `1px solid ${C.border}`, background: C.bg,
  fontFamily: BODY, fontSize: 13.5, color: C.text, outline: 'none',
};
// [Putaran 16 Tahap 4] tinggi/padding/radius/fontSize diukur ULANG langsung
// di mockup (Modal/MarkLost DAN Modal/MarkWon, dua kali, hasil identik):
// tombol footer 40px tinggi, padding '0 16px', radius 10, Montserrat 600
// 13.5px -- mengoreksi nilai 34/14/9/12.5 yang sebelumnya diklaim "diukur
// mockup" (komentar Tahap 1) tapi tidak cocok hasil ukur hari ini.
const btnGhost = {
  height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.borderStrong}`,
  background: 'transparent', color: C.navy, fontFamily: HEAD, fontSize: 13.5,
  fontWeight: 600, cursor: 'pointer',
};
const btnDanger = (disabled) => ({
  height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.redBd}`,
  background: C.redBg, color: C.red, fontFamily: HEAD, fontSize: 13.5, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

function Shell({ icon, title, subtitle, err, children, onCancel, onSubmit, saving, submitLabel, cancelLabel = 'Cancel' }) {
  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={sheet}>
        {/* border-bottom diukur mockup: LINE_SOFT, bukan LINE (C.border). */}
        <header style={{ padding: '16px 20px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {icon}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: C.text }}>{title}</h3>
            {subtitle && (
              <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>{subtitle}</div>
            )}
          </div>
        </header>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
          {/* [Putaran 16a Tahap 1, GAGAL ditutup] diukur mockup (pesan
              validasi "X Reason is required"): amber (warn), BUKAN
              merah/danger. */}
          {err && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '9px 11px', borderRadius: 9,
              background: C.amberBg, border: `1px solid ${C.amberBd}`,
              fontFamily: BODY, fontSize: 12.5, color: C.amber,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {err}
            </div>
          )}
        </div>

        <footer style={{ padding: '14px 20px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={onCancel} disabled={saving}>{cancelLabel}</button>
          <button type="button" style={btnDanger(saving)} onClick={onSubmit} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AffectedDocuments -- Putaran 11 Tahap C, dipakai LostReasonModal DAN
   CancelReasonModal. `activeQuotation` = quotation (atau null/undefined)
   berstatus DRAFT/SUBMITTED/SENT milik inquiry ini -- SATU-SATUNYA yang
   DIJAMIN akan disentuh trigger `trg_fn_quotation_auto_close_on_inquiry_
   closed` (LIVE, migrasi 20261022000002) begitu inquiry jadi LOST/CANCELLED:
   trigger itu WHERE status IN ('DRAFT','SUBMITTED','SENT') -> REJECTED
   TANPA SYARAT (LOST) atau REJECTED biasa (CANCELLED, bukan duplikat) --
   SATU teks "will be marked Rejected", BUKAN dua cabang seperti draf mockup
   ("Sent" vs lainnya) karena trigger memperlakukan ketiga status itu SAMA.
   `openPrfs` ditampilkan HANYA sebagai status saat ini -- TANPA klaim
   "will be cancelled": diverifikasi TIDAK ADA trigger otomatis yang
   membatalkan PRF saat inquiry LOST/CANCELLED (satu-satunya RPC cancel PRF,
   prf_cancel_request, manual dari tombol tersendiri tab Procurement).
   Menulis klaim itu akan menjanjikan sesuatu yang tidak terjadi.
   ═══════════════════════════════════════════════════════════════════════════ */
function AffectedDocuments({ activeQuotation, openPrfs = [] }) {
  const hasAny = !!activeQuotation || openPrfs.length > 0;
  return (
    <div>
      <span style={label}>Affected documents</span>
      {!hasAny ? (
        <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>
          No linked quotations or rate requests.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {activeQuotation && (
            <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.text }}>
              {activeQuotation.quotation_no} — will be marked Rejected with the same reason.
            </div>
          )}
          {/* [Putaran 16a Tahap 1, GAGAL ditutup] diukur mockup (affL,
              baris PRF/rate-request fg:'#5C6B52'): INK_SOFT (textMute),
              BUKAN INK (text) -- beda dari baris quotation di atas yang
              memang fg:'#33422B' (text). */}
          {openPrfs.map((p) => (
            <div key={p.id} style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>
              {p.prf_no} — currently {String(p.status || '').toUpperCase()}.
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LostReasonModal
   onSave({ loss_reason_id, competitor_name, competitor_price })
   `reasons` = baris loss_reasons yang sudah difilter+diurut oleh pemanggil.
   Putaran 11 Tahap C -- `activeQuotation`/`openPrfs` baru (lihat
   AffectedDocuments di atas). Field "Notes" mockup SENGAJA TIDAK dibangun
   (keputusan Den) -- nol kolom DB utk notes khusus Lost, dan menulis ke
   `inquiries.notes` yang sama dengan section Overview berisiko menimpa
   catatan yang sudah ada di sana. Dilaporkan sebagai selisih mockup, bukan
   dibangun sebagai placeholder tanpa kolom (aturan "field tanpa kolom DB
   tidak dibangun").
   ═══════════════════════════════════════════════════════════════════════════ */
export function LostReasonModal({ open, inquiryNo, reasons = [], saving, onSave, onCancel, activeQuotation, openPrfs }) {
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
          id="lost-reason" style={{ ...field, height: 44, padding: '0 12px' }} value={reasonId}
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
              id="comp-name" style={{ ...field, height: 44, padding: '0 12px' }} value={compName}
              onChange={(e) => { setCompName(e.target.value); setErr(''); }}
              placeholder="Competitor company name"
            />
          </div>
          <div>
            <label style={label} htmlFor="comp-price">Competitor price</label>
            <input
              id="comp-price" style={{ ...field, height: 44, padding: '0 12px' }} value={compPrice} type="number" min="0"
              onChange={(e) => { setCompPrice(e.target.value); setErr(''); }}
              placeholder="0"
            />
          </div>
        </>
      )}

      <AffectedDocuments activeQuotation={activeQuotation} openPrfs={openPrfs} />
    </Shell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CancelReasonModal — onSave({ cancel_reason })
   Putaran 11 Tahap C -- title/helper/tombol sekunder diselaraskan ke mockup
   (title "Cancel this inquiry?" bukan "Cancel Inquiry"; tombol sekunder
   "Back" bukan "Cancel" -- lihat `cancelLabel` di Shell; helper menjelaskan
   KAPAN memakai Cancel, bukan sekadar "catatan operasional"). `activeQuotation`/
   `openPrfs` baru -- lihat AffectedDocuments.
   ═══════════════════════════════════════════════════════════════════════════ */
export function CancelReasonModal({ open, inquiryNo, saving, onSave, onCancel, activeQuotation, openPrfs }) {
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
      title="Cancel this inquiry?"
      subtitle={inquiryNo ? `Inquiry ${inquiryNo}` : undefined}
      err={err} onCancel={onCancel} onSubmit={submit} saving={saving}
      submitLabel="Cancel Inquiry" cancelLabel="Back"
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
          Use this when the customer withdraws the request, not when we lose to a competitor.
        </div>
      </div>

      <AffectedDocuments activeQuotation={activeQuotation} openPrfs={openPrfs} />
    </Shell>
  );
}

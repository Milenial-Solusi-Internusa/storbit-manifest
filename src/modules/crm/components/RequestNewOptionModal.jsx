// src/modules/crm/components/RequestNewOptionModal.jsx
// "Request new option" -- Modal/RequestNewOption,
// design-handoff/mockup/Lead Management.dc.html:414-422 + MasterSelect.dc.html
// (dipanggil lewat MasterSelect `onRequestNew(label)`, "Request new option"
// di popovernya -- rule 5 "sales mengajukan").
//
// TD-318 Irisan 3 (16 Okt 2026): SALES-ONLY -- jalur manager/`canAddDirect`
// yang dulu hidup DI DALAM modal ini DICABUT. Sejak MasterSelect dibangun
// ulang (src/kit/MasterSelect.jsx), manager menambah LANGSUNG dari popover
// lewat `onAdd` (optimistik, RPC add_dropdown_option_direct dipanggil di
// PEMANGGIL -- lihat CaptureLeadModal.jsx/LeadDetailPage.jsx/
// MarkAsLostModal.jsx) -- modal ini TIDAK PERNAH lagi dibuka untuk manager
// (ketiga pemanggil hanya memasang `onRequestNew` ke MasterSelect untuk
// peran NON-manager; diverifikasi: nol pemanggil lain di seluruh `src/`).
// Diperiksa dulu sebelum mencabut (REVISI 1 §7): grep `RequestNewOptionModal`
// = persis 2 pemanggil (CaptureLeadModal, LeadDetailPage) + 1 yang baru
// ditambah (MarkAsLostModal) -- ketiganya SUDAH migrasi ke `onAdd`/
// `onRequestNew`, nol sisa pemanggil lama yang membuka modal ini dengan
// asumsi "mungkin manager".
//
// Teks Inggris persis mockup (TD-318 Irisan 3, #15) -- title STATIS
// "Request new option" (TIDAK menyebut nama field, beda dari versi lama
// yang menaruh field di title); field disebut di BODY: "Your request goes
// to the data owner of {label}." (:419).
//
// Validasi (REVISI 2 Irisan 3, §1): tombol SELALU aktif, persis mockup
// `sendReq`. Klik dengan Option Name kosong -> flag touched -> span
// "Option Name is required" (400 12px Inter #8E620D = SEMANTIC.warn.fg) +
// border kotak #E6CE94 = SEMANTIC.warn.bd. ⭐ Reason TIDAK divalidasi wajib
// (mockup sendiri: `<span>Reason</span>` TANPA asterisk, `sendReq` tidak
// mengeceknya) -- DEVIASI SADAR dari kode lama yang mewajibkan Reason;
// diputuskan Den 16 Okt 2026 (REVISI 2: "DITOLAK, semuanya ikut mockup"),
// bukan kelupaan. Placeholder Option Name DICABUT (REVISI 2 §5, mockup
// tak punya placeholder di field itu -- :420).
//
// Ronde FE kedua Irisan 5 (20 Okt 2026): handleSave dipindah dari INSERT
// langsung ke RPC `submit_dropdown_option_request` (migrasi 20261020000001,
// LIVE staging -- notifikasi ke manager kini terkirim saat submit, bukan
// hanya saat approve/reject). RPC mengembalikan uuid polos (bukan baris
// {id,label} seperti `.select().single()` lama) -- `onSubmitted` dibangun
// ulang dari uuid + `trimmedLabel` yang sudah ada di closure, supaya bentuk
// propnya tetap {id,label} untuk pemanggil mana pun (hari ini nol pemanggil
// yang memakai prop ini -- diverifikasi grep `onSubmitted=` di
// CaptureLeadModal/LeadDetailPage/MarkAsLostModal, nol hasil -- tapi
// kontraknya dipertahankan, bukan diam-diam disederhanakan jadi string).
import { useState } from 'react';
import { Modal, FloatingInput, Textarea, SaveButton, OutlineBtn, useToast } from '../../../kit';
import { INK_SOFT, FONT_BODY } from '../../../kit/tokens';
import { supabase } from '../../../lib/supabase';

/**
 * @param {Object}   props
 * @param {boolean}  props.open
 * @param {() => void} props.onClose
 * @param {string}   props.listKey      - mis. 'lead_industry' / 'lead_category' / 'lost_reason'
 * @param {string}   [props.listLabel]  - label manusiawi, mis. 'Industry' -- dipakai di body paragraf ("data owner of {listLabel}")
 * @param {string|null} [props.companyId] - NULL -> opsi global (semua entitas)
 * @param {(result: Object) => void} [props.onSubmitted] - dipanggil dengan { mode:'request', request:{id,label} }
 */
export default function RequestNewOptionModal({ open, onClose, listKey, listLabel, companyId = null, onSubmitted }) {
  const [toast, toastNode] = useToast();
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const nameInvalid = nameTouched && !label.trim();

  function reset() {
    setLabel('');
    setReason('');
    setNameTouched(false);
  }

  async function handleSave() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) { setNameTouched(true); return false; } // persis sendReq: set({reqT:true}), TIDAK menyentuh network

    // requested_by diisi RPC lewat auth.uid() -- `profile.id` yang dulu
    // dikirim manual (INSERT langsung) sudah tidak dibutuhkan, import
    // useAuth dicabut.
    const { data: newId, error } = await supabase.rpc('submit_dropdown_option_request', {
      p_list_key: listKey,
      p_label: trimmedLabel,
      p_reason: reason.trim() || null,
      p_company_id: companyId,
    });
    if (error) return { error };

    toast(`Request for ${trimmedLabel} sent to the data owner`);
    onSubmitted?.({ mode: 'request', request: { id: newId, label: trimmedLabel } });
    reset();
    onClose?.();
    return undefined;
  }

  return (
    <>
      <Modal
        open={open}
        onClose={() => { reset(); onClose?.(); }}
        title="Request new option"
        width={440}
        footer={(
          <>
            <OutlineBtn onClick={() => { reset(); onClose?.(); }}>Cancel</OutlineBtn>
            <SaveButton onSave={handleSave} label="Send Request" savedLabel="Sent!" />
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 13.5 }}>
            Your request goes to the data owner of {listLabel || 'this field'}.
          </p>
          <FloatingInput
            label="Option Name" required value={label} onChange={setLabel} full autoFocus
            error={nameInvalid ? 'Option Name is required' : undefined}
          />
          <Textarea
            label="Reason" value={reason} onChange={setReason} full rows={3}
            placeholder="Why is this option needed?"
          />
        </div>
      </Modal>
      {toastNode}
    </>
  );
}

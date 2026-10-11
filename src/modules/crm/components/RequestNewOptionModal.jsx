// src/modules/crm/components/RequestNewOptionModal.jsx
// Modal "+ Ajukan pilihan baru…" — pasangan MasterSelect (src/kit/) untuk
// rule 5 mockup Lead Management: "manager menambah langsung, sales
// mengajukan, peran lain hanya membaca".
//
// Batch DS 3 Lead Management, Paket 1 irisan 3. Ditaruh di
// modules/crm/components/ (bukan modules/crm/lead/components/) karena
// mekanismenya generik untuk list_key APA PUN di dropdown_options — belum
// ada sub-fitur "lead/" yang berdiri sendiri pada irisan ini (menyusul
// Paket 1 irisan 4+ bersama LeadDetailPage/LeadCapturePage); kalau nanti
// kebutuhan lead berbeda dari kebutuhan master-data CRM lain, pindahkan
// turunannya ke lead/components/ saat itu — aturan Batch_FS_Fase_0 §5.
//
// Dua jalur tulis, sumbunya SAMA dengan migrasi
// 20261011000002_crm_lead_master_data_requests.sql:
//   - manager ke atas / super_admin → RPC add_dropdown_option_direct
//     (opsi langsung aktif, tanpa alasan).
//   - role lain (sales dkk)         → INSERT dropdown_option_requests
//     (status 'pending', menunggu disetujui lewat LeadPoolApprovalPage atau
//     halaman approval master-data — BELUM ADA, irisan berikutnya). Alasan
//     wajib diisi supaya manager tahu konteksnya saat menyetujui/menolak.
//
// onSubmitted(result) dipanggil sesudah sukses dengan
// { mode: 'direct', option: { id, label, value } } ATAU
// { mode: 'request', request: { id, label } } — pemanggil (MasterSelect's
// pemilik) memutuskan sendiri apa yang dilakukan dengan hasil itu (refetch
// options, tampilkan label baru optimis, dst).

import { useState } from 'react';
import { Modal, FloatingInput, Textarea, SaveButton, OutlineBtn, useToast } from '../../../kit';
import { INK_SOFT, FONT_BODY } from '../../../kit/tokens';
import { useAuth } from '../../../contexts/useAuth';
import { isManagerOrAbove } from '../../../lib/roles';
import { supabase } from '../../../lib/supabase';

/**
 * @param {Object}   props
 * @param {boolean}  props.open
 * @param {() => void} props.onClose
 * @param {string}   props.listKey      - mis. 'lead_industry' / 'lead_category' / 'lost_reason'
 * @param {string}   [props.listLabel]  - label manusiawi untuk judul modal, mis. 'Industry'
 * @param {string|null} [props.companyId] - NULL → opsi global (semua entitas)
 * @param {(result: Object) => void} [props.onSubmitted]
 */
export default function RequestNewOptionModal({ open, onClose, listKey, listLabel, companyId = null, onSubmitted }) {
  const { erpRoles, profile } = useAuth();
  const [toast, toastNode] = useToast();
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');

  const canAddDirect = isManagerOrAbove(erpRoles, { companyId: companyId ?? undefined });
  const title = listLabel ? `Ajukan pilihan baru — ${listLabel}` : 'Ajukan pilihan baru';

  function reset() {
    setLabel('');
    setReason('');
  }

  async function handleSave() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return { error: new Error('Nama pilihan wajib diisi') };
    if (!canAddDirect && !reason.trim()) return { error: new Error('Alasan wajib diisi untuk pengajuan') };

    if (canAddDirect) {
      const { data, error } = await supabase.rpc('add_dropdown_option_direct', {
        p_list_key: listKey, p_label: trimmedLabel, p_company_id: companyId,
      });
      if (error) return { error };
      onSubmitted?.({ mode: 'direct', option: { id: data, label: trimmedLabel } });
    } else {
      const { data, error } = await supabase
        .from('dropdown_option_requests')
        .insert({
          list_key: listKey, label: trimmedLabel, reason: reason.trim(),
          company_id: companyId, requested_by: profile.id,
        })
        .select('id, label')
        .single();
      if (error) return { error };
      onSubmitted?.({ mode: 'request', request: data });
    }

    toast(canAddDirect ? 'Pilihan baru ditambahkan' : 'Pengajuan terkirim, menunggu persetujuan');
    reset();
    onClose?.();
    return undefined;
  }

  return (
    <>
      <Modal
        open={open}
        onClose={() => { reset(); onClose?.(); }}
        title={title}
        subtitle={canAddDirect
          ? 'Opsi akan aktif langsung begitu disimpan.'
          : 'Pengajuan ini menunggu persetujuan manager sebelum muncul sebagai pilihan.'}
        footer={(
          <>
            <OutlineBtn onClick={() => { reset(); onClose?.(); }}>Batal</OutlineBtn>
            <SaveButton onSave={handleSave} label={canAddDirect ? 'Tambahkan' : 'Ajukan'} savedLabel={canAddDirect ? 'Ditambahkan!' : 'Terkirim!'} />
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FloatingInput
            label="Nama pilihan" value={label} onChange={setLabel} full
            placeholder="mis. Pharmaceutical" autoFocus
          />
          {!canAddDirect && (
            <Textarea
              label="Alasan pengajuan" value={reason} onChange={setReason} full rows={3}
              placeholder="Kenapa pilihan ini perlu ditambahkan?"
            />
          )}
          {companyId == null && (
            <div style={{ fontSize: 11.5, color: INK_SOFT, fontFamily: FONT_BODY }}>
              Pilihan ini berlaku untuk semua entitas (global).
            </div>
          )}
        </div>
      </Modal>
      {toastNode}
    </>
  );
}

// src/modules/crm/lead/components/ContactModal.jsx
// "Add Contact" / edit kontak -- design-handoff/crm-2026-10-11/shots/lead/
// 17-detail-contacts.png. Batch DS 3 Lead Management, Paket 1 irisan 5
// (koreksi Den: Contacts tab semula read-only-only, sekarang Add + Edit).
//
// Field & aturan isian SAMA PERSIS dengan CaptureLeadModal: Name/Position/
// Phone/WhatsApp/Email, ditambah Role (contacts.role_type, CHECK 5 nilai)
// dan Preferred Channel (contacts.whatsapp/preferred_channel, migrasi
// 20261011000001) yang tak ada di form Capture ringkas. WhatsApp mengikuti
// Phone sampai disentuh langsung -- pola identik CaptureLeadModal.setPhone/
// setWhatsapp, disalin apa adanya supaya "aturan isian yang sama" itu
// benar-benar satu aturan, bukan dua implementasi yang bisa melenceng.
//
// `contact` null = mode Create; object = mode Edit (prefill dari baris
// `contacts` yang sudah ada).
import { useState } from 'react';
import { Modal, FloatingInput, FloatingSelect, SaveButton, OutlineBtn } from '../../../../kit';
import { SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { PREFERRED_CHANNELS, PREFERRED_CHANNEL_LABELS, ROLE_TYPES, ROLE_TYPE_LABELS } from '../lib/leadOptions';

const emptyForm = () => ({
  name: '', position: '', role_type: '', phone: '', whatsapp: '', email: '', preferred_channel: '',
});

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} accountId
 * @param {string} companyId
 * @param {Object|null} [contact] - baris `contacts` untuk mode edit, null untuk Create
 * @param {boolean} [makePrimaryDefault] - true kalau ini kontak PERTAMA akun ini (belum ada primary)
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onSaved
 */
export default function ContactModal({ open, onClose, accountId, companyId, contact = null, makePrimaryDefault = false, showToast, onSaved }) {
  const isEdit = !!contact;
  const [form, setForm] = useState(() => (contact
    ? { name: contact.name || '', position: contact.position || '', role_type: contact.role_type || '', phone: contact.phone || '', whatsapp: contact.whatsapp || '', email: contact.email || '', preferred_channel: contact.preferred_channel || '' }
    : emptyForm()));
  const [whatsappTouched, setWhatsappTouched] = useState(isEdit); // edit: jangan timpa whatsapp yg sudah ada saat Phone disunting

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(contact
        ? { name: contact.name || '', position: contact.position || '', role_type: contact.role_type || '', phone: contact.phone || '', whatsapp: contact.whatsapp || '', email: contact.email || '', preferred_channel: contact.preferred_channel || '' }
        : emptyForm());
      setWhatsappTouched(isEdit);
    }
  }

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setPhone = (v) => setForm((f) => ({ ...f, phone: v, whatsapp: whatsappTouched ? f.whatsapp : v }));
  const setWhatsapp = (v) => { setWhatsappTouched(true); setForm((f) => ({ ...f, whatsapp: v })); };

  const canSave = form.name.trim().length > 0;

  async function handleSave() {
    if (!canSave) return { error: new Error('Nama kontak wajib diisi') };
    const payload = {
      name: form.name.trim(), position: form.position.trim() || null, role_type: form.role_type || null,
      phone: form.phone.trim() || null, whatsapp: form.whatsapp.trim() || null,
      email: form.email.trim() || null, preferred_channel: form.preferred_channel || null,
    };
    if (isEdit) {
      const { error } = await supabase.from('contacts').update(payload).eq('id', contact.id);
      if (error) return { error };
    } else {
      const { error } = await supabase.from('contacts').insert({
        ...payload, account_id: accountId, company_id: companyId, is_primary: makePrimaryDefault,
      });
      if (error) return { error };
    }
    onSaved?.();
    return undefined;
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Contact' : 'Add Contact'} width={560} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} disabled={!canSave} label={isEdit ? 'Save' : 'Add Contact'} savedLabel="Saved!"
          onError={(err) => showToast?.('Failed to save contact: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 }}>
          <FloatingInput label="Contact Name" value={form.name} onChange={set('name')} />
          <FloatingInput label="Position" value={form.position} onChange={set('position')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 }}>
          <FloatingSelect label="Role" value={form.role_type} onChange={set('role_type')}
            options={ROLE_TYPES.map((r) => ({ value: r, label: ROLE_TYPE_LABELS[r] }))} />
          <FloatingSelect label="Preferred Channel" value={form.preferred_channel} onChange={set('preferred_channel')}
            options={PREFERRED_CHANNELS.map((c) => ({ value: c, label: PREFERRED_CHANNEL_LABELS[c] }))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 }}>
          <FloatingInput label="Phone" value={form.phone} onChange={setPhone} />
          <FloatingInput label="WhatsApp" value={form.whatsapp} onChange={setWhatsapp} />
        </div>
        <FloatingInput label="Email" type="email" value={form.email} onChange={set('email')} />
      </div>
    </Modal>
  );
}

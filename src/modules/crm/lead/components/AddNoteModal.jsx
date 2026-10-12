// src/modules/crm/lead/components/AddNoteModal.jsx
// "Add Note" dari menu baris "⋮" Multi-channel Lead Capture --
// design-handoff/crm-2026-10-11/shots/lead/03-capture-row-context-menu-sales.png.
// Mockup HANYA menampilkan labelnya di menu; tak ada acuan visual tersendiri
// untuk isi modalnya -- dibangun memakai mekanisme "Add Note" yang SUDAH ADA
// (addLeadNote, src/modules/crm/lead/lib/leadActivity.js; satu baris tabel
// `activities` type='note', dipakai juga oleh Activity/Notes tab di
// LeadDetailPage), bukan tabel atau RPC baru.
import { useState } from 'react';
import { Modal, Textarea, SaveButton, OutlineBtn } from '../../../../kit';
import { addLeadNote } from '../lib/leadActivity';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, company_id:string}|null} account
 * @param {string} userId
 * @param {() => void} onSaved
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function AddNoteModal({ open, onClose, account, userId, onSaved, showToast }) {
  const [text, setText] = useState('');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setText('');
  }

  async function handleSave() {
    if (!text.trim()) return { error: new Error('Enter a note') };
    const { error } = await addLeadNote({ accountId: account.id, companyId: account.company_id, userId, text: text.trim() });
    if (error) return { error };
    onSaved?.();
    return undefined;
  }

  return (
    <Modal open={open} onClose={onClose} title={account ? `Add Note — ${account.name}` : 'Add Note'} width={480} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label="Add Note" savedLabel="Note added!" disabled={!text.trim()}
          onError={(err) => showToast?.('Failed to add note: ' + err.message, 'error')} />
      </>
    )}>
      <Textarea label="Note" value={text} onChange={setText} rows={4} />
    </Modal>
  );
}

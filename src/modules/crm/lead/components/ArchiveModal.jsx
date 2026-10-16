// src/modules/crm/lead/components/ArchiveModal.jsx
// "Archive this lead?" -- design-handoff/crm-2026-10-11/shots/lead/32-modal-archive-supervisor.png.
// Batch DS 3 Lead Management, Paket 1 irisan 5. Supervisor ke atas saja
// (gate di pemanggil -- LeadDetailPage/LeadCapturePage).
//
// Prop `accounts` SELALU array -- satu elemen dari header/menu baris, >1
// dari bulk bar (tombol bulk bar "Archive" sama persis).
//
// TD-318 Irisan 3, REVISI 2 §3: title SELALU statis "Archive this lead?"
// (mockup TIDAK punya varian jumlah, :392 -- sebelumnya "Archive {N}
// leads?" saat bulk). Body = paragraf statis mockup (TIDAK dipluralkan
// jadi "leads", :393) + tgtLabel teks POLOS #5C6B52 (bulk "N leads
// selected", persis :606 `Lead Management.dc.html` -- sebelumnya daftar
// nama dipisah koma, kelas bug yang sama sudah ditambal di ReassignModal
// Irisan 2).
//
// TIDAK ADA MIGRASI BARU di irisan ini untuk fitur ini -- diperiksa dulu
// (instruksi Den): soft-delete `accounts.deleted_at` yang SUDAH ADA (dipakai
// ProspectListPage.jsx untuk delete lead lama) sudah PERSIS memenuhi arti
// mockup "The lead will be hidden from all lists and can be restored by an
// admin" -- LeadCapturePage.fetchLeads() sudah `.is('deleted_at', null)`
// (tersembunyi dari semua daftar begitu diisi), dan "dipulihkan admin" =
// UPDATE deleted_at=NULL manual (pola yang sama dengan soft-delete lain di
// seluruh app, lihat CLAUDE.md "Soft delete (deleted_at/is_active=false),
// jangan hard-delete data business" -- tak ada halaman "Restore" khusus di
// mana pun di app untuk soft-delete sejenis, jadi tak membangun satu di sini
// bukan penyimpangan dari pola yang ada). Kalau Den menilai kelak perlu
// kolom tambahan (mis. archived_by/archived_reason terpisah dari delete
// biasa), itu migrasi BARU yang belum ditulis di sini.
import { useState } from 'react';
import { Modal, Button, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, FONT_BODY, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Array<{id:string, name:string, code?:string}>} accounts
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onArchived
 */
export default function ArchiveModal({ open, onClose, accounts = [], showToast, onArchived }) {
  const [saving, setSaving] = useState(false);
  const bulk = accounts.length > 1;

  async function handleConfirm() {
    setSaving(true);
    const { error } = await supabase.from('accounts').update({ deleted_at: new Date().toISOString() }).in('id', accounts.map((a) => a.id));
    setSaving(false);
    if (error) { showToast?.('Failed to archive: ' + error.message, 'error'); return; }
    onArchived?.();
  }

  if (!accounts.length) return null;

  return (
    <Modal open={open} onClose={onClose} title="Archive this lead?" width={440} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <Button variant="danger" loading={saving} onClick={handleConfirm}>Archive</Button>
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
        <div style={{ fontSize: 14, color: INK, fontFamily: FONT_BODY, lineHeight: 1.5 }}>
          The lead will be hidden from all lists and can be restored by an admin.
        </div>
        <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: INK_SOFT }}>
          {bulk ? `${accounts.length} leads selected` : `${accounts[0].code ? `${accounts[0].code}, ` : ''}${accounts[0].name}`}
        </span>
      </div>
    </Modal>
  );
}

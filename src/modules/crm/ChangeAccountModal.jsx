// src/modules/crm/ChangeAccountModal.jsx
// Ganti akun (prospect_id/customer_id) + kontak wajib -- Putaran 15, Task 4.
//
// SENGAJA FILE BARU (pola sama DealCloseModals.jsx/DealWonModals.jsx) --
// bukan menambah mode ke modal lain, supaya pencarian akun + kontak wajib +
// alasan opsional tidak bercampur dengan komponen konfirmasi/alasan-tunggal
// yang dipakai di banyak tempat.
//
// SATU AKUN GABUNGAN (koreksi wajib Den) -- TIDAK ADA toggle Prospect/
// Customer di sini. inquiries.customer_id SELALU NULL; id akun SELALU ke
// prospect_id, persis pola InquiryIntakeWizardPage.jsx (D1 -- toggle itu
// sudah DICABUT di sana juga). Pemilih akun mengikuti pola step "Customer"
// wizard -- AccountPicker + badge lifecycle_stage -- BUKAN pola dua-field
// InquiryFormPage.jsx (sedang dipensiunkan).
//
// Pemilih DIBATASI company_id inquiry (prop `companyId`) -- akun baru wajib
// satu entitas dengan inquiry ini (lihat migrasi 20261027000007, temuan (1):
// assign_inquiry_no() mengambil kode entitas dari inquiries.company_id, bukan
// dari akun). RPC change_inquiry_account sendiri yang menjadi penjaga
// sebenarnya (entitas/status/Lost/Lead Pool/kontak-milik-akun/Quotation-PRF
// hidup) -- filter di sini murni UX, mempersempit daftar supaya kecil
// kemungkinan user memilih sesuatu yang bakal ditolak RPC.
//
// "Add new contact" (ada di wizard) SENGAJA TIDAK dibangun di sini --
// instruksi Task 4 hanya meminta pemilih kontak dari akun yang sudah ada;
// menambah jalur INSERT contacts baru di dalam modal ini memperbesar
// cakupan di luar yang direview. Akun tanpa kontak menampilkan pesan + modal
// tetap terbuka (user menambah kontak dari halaman akun itu dulu).
//
// Pemanggil WAJIB mengoper `key` yang berubah tiap kali dibuka supaya
// komponen remount dengan field bersih -- pola sama DealCloseModals/
// DealWonModals.

import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { C, HEAD, BODY } from './DealPanels';
import AccountPicker from '../../components/AccountPicker';

// Mirror SENGAJA, bukan impor -- InquiryIntakeWizardPage.jsx:113 (LIFECYCLE_LABEL)
// secara eksplisit TIDAK dipindah ke inquiryOptions.js (Task 2, Putaran 15:
// instruksi Den "TIDAK dipindah" utk konstanta ini). 'lost' sengaja TIDAK ada
// di sini -- akun Lost dikeluarkan dari daftar pilihan (lihat fetch di bawah),
// jadi labelnya tidak akan pernah terpakai.
const LIFECYCLE_LABEL = { lead: 'Lead', mql: 'MQL', sql: 'SQL', prospect: 'Prospect', customer: 'Customer', free_agent: 'Free Agent' };
const lifecycleLabel = (s) => LIFECYCLE_LABEL[s] || s || '';

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
// Navy solid -- pola IDENTIK tombol Save panel "Reassign Owner" inline
// (DealDetailPage.jsx, ownerOpen). Change Account adalah aksi edit data,
// bukan destruktif (merah, Lost/Cancel) atau penutup sukses (hijau, Won) --
// navy dipilih supaya tak menambah kosakata warna baru ke keluarga modal ini.
const btnPrimary = (disabled) => ({
  height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.navy}`,
  background: C.navy, color: '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

export default function ChangeAccountModal({
  open, inquiryNo, companyId, currentAccountName, currentContactName,
  saving, onSave, onCancel,
}) {
  const [accounts, setAccounts] = useState([]);
  const [accountText, setAccountText] = useState('');
  const [accountId, setAccountId] = useState('');
  // `contactsFor` + `contactsLoaded` turunan -- pola IDENTIK
  // InquiryIntakeWizardPage.jsx:481-482 (contactsFor/contactsLoaded), BUKAN
  // flag "loading" terpisah yang harus di-reset manual: "loaded" adalah
  // PERBANDINGAN accountId sekarang vs accountId milik hasil fetch terakhir,
  // jadi berganti akun membuatnya otomatis false (nol setState tambahan di
  // badan effect -- react-hooks/set-state-in-effect menolak setState
  // SINKRON di awal effect, lihat review eslint saat menulis berkas ini).
  const [contactsFor, setContactsFor] = useState({ accountId: null, list: [] });
  const contactsLoaded = contactsFor.accountId === accountId;
  const contacts = contactsLoaded ? contactsFor.list : [];
  const [contactId, setContactId] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  // Daftar akun -- satu entitas (companyId), bukan Lost, bukan Lead Pool.
  // Filter UX saja; RPC adalah penjaga sebenarnya (lihat header berkas).
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    supabase.from('accounts').select('id, name, lifecycle_stage')
      .eq('company_id', companyId).neq('lifecycle_stage', 'lost')
      .eq('is_in_lead_pool', false).is('deleted_at', null)
      .order('name').limit(1000)
      .then(({ data }) => { if (!cancelled) setAccounts(data || []); });
    return () => { cancelled = true; };
  }, [open, companyId]);

  // Kontak akun terpilih -- pola IDENTIK InquiryIntakeWizardPage.jsx:526-540.
  // `contactId` DIKOSONGKAN di handler AccountPicker (onChangeText/onPick di
  // bawah, BUKAN di sini) setiap kali akun berganti (instruksi eksplisit
  // Task 4) -- setState sinkron di badan effect ditolak eslint
  // react-hooks/set-state-in-effect; mengosongkannya di event handler (yang
  // SELALU mendahului perubahan `accountId` ini) mencapai hasil yang sama
  // tanpa melanggar aturan itu.
  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    supabase.from('contacts').select('id, name, position, is_primary, is_active')
      .eq('account_id', accountId).is('deleted_at', null)
      .order('is_primary', { ascending: false }).order('name').limit(1000)
      .then(({ data }) => {
        if (cancelled) return;
        const list = data || [];
        setContactsFor({ accountId, list });
        setContactId((prev) => {
          if (prev) return prev;
          const auto = list.find((c) => c.is_primary) || (list.length === 1 ? list[0] : null);
          return auto ? auto.id : prev;
        });
      });
    return () => { cancelled = true; };
  }, [accountId]);

  if (!open) return null;

  const submit = () => {
    if (!accountId) { setErr('A new account is required.'); return; }
    if (!contactId) { setErr('A contact is required.'); return; }
    setErr('');
    onSave?.({ newAccountId: accountId, newContactId: contactId, reason: reason.trim() || null });
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={sheet}>
        <header style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <RefreshCcw size={18} style={{ color: C.navy, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15.5, fontWeight: 700, color: C.text }}>Change Account</h3>
            {inquiryNo && (
              <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>Inquiry {inquiryNo}</div>
            )}
          </div>
        </header>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(currentAccountName || currentContactName) && (
            <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>
              Currently: {currentAccountName || '—'}{currentContactName ? ` / ${currentContactName}` : ''}
            </div>
          )}

          <div>
            <label style={label}>New account</label>
            <AccountPicker
              value={accountText}
              accounts={accounts}
              statusLabel={lifecycleLabel}
              inputStyle={field}
              placeholder="Search account name…"
              onChangeText={(v) => { setAccountText(v); setAccountId(''); setContactId(''); setErr(''); }}
              onPick={(a) => { setAccountText(a.name); setAccountId(a.id); setContactId(''); setErr(''); }}
            />
          </div>

          {accountId && (
            <div>
              <label style={label}>Contact</label>
              {!contactsLoaded ? (
                <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>Loading contacts…</span>
              ) : contacts.length === 0 ? (
                <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>
                  This account has no contacts yet. Add one from the account's record before changing the inquiry to it.
                </div>
              ) : (
                <select value={contactId} onChange={(e) => { setContactId(e.target.value); setErr(''); }} style={field}>
                  <option value="">— Select contact —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.position ? ` — ${c.position}` : ''}{c.is_primary ? ' (Primary)' : ''}{c.is_active === false ? ' (Inactive)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label style={label}>Reason (optional)</label>
            <textarea
              rows={3}
              style={{ ...field, resize: 'vertical' }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g. wrong account linked at intake, customer merged with another account…"
            />
          </div>

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
          <button type="button" style={btnPrimary(saving || !accountId || !contactId)} onClick={submit} disabled={saving || !accountId || !contactId}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}

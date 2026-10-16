// src/modules/crm/lead/components/MarkAsLostModal.jsx
// "Mark as Lost" -- design-handoff/crm-2026-10-11/shots/lead/23-modal-mark-as-lost.png.
// Batch DS 3 Lead Management, Paket 1 irisan 5. Gate (pemilik lead ATAU
// supervisor ke atas) diputuskan oleh pemanggil (LeadDetailPage/
// LeadCapturePage), modal ini hanya dirender.
//
// Prop `accounts` SELALU array -- satu elemen dari header/menu baris, >1
// dari bulk bar (tombol bulk bar JUGA berlabel "Mark as Lost", mekanisme
// sama persis).
//
// lifecycle_stage -> 'lost'; lost_reason dari MasterSelect (list_key
// 'lost_reason', 6 nilai global, migrasi 20261011000002) -- kolom
// accounts.lost_reason SUDAH ADA (pre-existing, bukan baru). Competitor
// Name + Competitor Price (accounts.competitor_name/competitor_price,
// migrasi 20261011000001) muncul saat `needComp` -- TD-318 Irisan 3, #10:
// PERSIS mockup `needComp: lostReason === 'Price' || lostReason ===
// 'Lost to Competitor'` (:761) -- DUA kondisi, bukan satu; slug-nya
// 'price'/'lost_to_competitor' (20261011000002:185-186).
//
// TD-318 Irisan 3, #11: Lost Reason kini punya onAdd (manager menambah
// opsi global langsung, RPC add_dropdown_option_direct) / onRequestNew
// (peran lain mengajukan lewat RequestNewOptionModal) -- rule 5 mockup,
// pola identik CaptureLeadModal.jsx/LeadDetailPage.jsx.
//
// REVISI 2 (TD-318 Irisan 3): tombol "Mark as Lost" SELALU aktif, persis
// mockup `saveLost`. Klik dengan Lost Reason kosong -> flag `lostTouched`
// -> span "Lost Reason is required" (SEMANTIC.warn.fg) + border MasterSelect
// amber (prop `error`) -- bukan lagi tombol ter-disable tanpa pesan.
import { useState } from 'react';
import { Modal, Textarea, FloatingInput, MasterSelect, Button, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, LINE, SEMANTIC, FONT_BODY, FONT_MONO, RADIUS, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isManagerOrAbove } from '../../../../lib/roles';
import { formatIdNumber, readMoneyInput } from '../../../../lib/numberFormat';
import RequestNewOptionModal from '../../components/RequestNewOptionModal';

const COMPETITOR_VALUE = 'lost_to_competitor';
const PRICE_REASON_VALUE = 'price';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Array<{id:string, name:string, code?:string, company_id:string}>} accounts
 * @param {number} [skippedCount=0] - baris terpilih yang DIKELUARKAN sebelum sampai ke sini (mis. sudah Customer)
 * @param {string} [skippedReason] - alasan manusiawi, ditampilkan apa adanya
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onMarked
 */
export default function MarkAsLostModal({ open, onClose, accounts = [], skippedCount = 0, skippedReason, showToast, onMarked }) {
  const { profile, erpRoles } = useAuth();
  const canAddLostReason = isManagerOrAbove(erpRoles); // lost_reason global, nol scope company
  const [reasonOptions, setReasonOptions] = useState([]);
  const [lostReason, setLostReason] = useState('');
  const [lostTouched, setLostTouched] = useState(false);
  const [competitorName, setCompetitorName] = useState('');
  const [competitorPrice, setCompetitorPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [requestReasonOpen, setRequestReasonOpen] = useState(false);
  const bulk = accounts.length > 1;
  const needComp = lostReason === PRICE_REASON_VALUE || lostReason === COMPETITOR_VALUE;

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLostReason(''); setLostTouched(false); setCompetitorName(''); setCompetitorPrice(''); setNotes('');
      supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lost_reason').eq('is_active', true).is('deleted_at', null)
        .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setReasonOptions(data || []));
    }
  }

  function handleCompPriceBlur() {
    const { value, unrecognized } = readMoneyInput(competitorPrice);
    if (unrecognized) return;
    setCompetitorPrice(competitorPrice.trim() === '' ? '' : formatIdNumber(value));
  }

  // TD-318 Irisan 3, #11: manager menambah opsi Lost Reason LANGSUNG dari
  // popover MasterSelect -- pola identik CaptureLeadModal.jsx/
  // LeadDetailPage.jsx handleAddOption, optimistik (popover sudah tertutup
  // saat ini jalan).
  async function handleAddLostReason(name) {
    const trimmed = name.trim();
    const { data, error } = await supabase.rpc('add_dropdown_option_direct', {
      p_list_key: 'lost_reason', p_label: trimmed, p_company_id: null,
    });
    if (error) { showToast?.(`Failed to add option: ${error.message}`, 'error'); return; }
    const slug = trimmed.toLowerCase().replace(/\s+/g, '_');
    setReasonOptions((o) => [...o, { id: data, value: slug, label: trimmed }]);
    setLostReason(slug);
    showToast?.(`${trimmed} added to Lost Reason`);
  }

  // REVISI 2 (TD-318 Irisan 3): persis mockup `saveLost` -- klik tanpa Lost
  // Reason HANYA menyalakan flag touched, TIDAK menyentuh network.
  function handleConfirmClick() {
    if (!lostReason) { setLostTouched(true); return; }
    handleConfirm();
  }

  async function handleConfirm() {
    if (!accounts.length) return;
    setSaving(true);
    const reasonLabel = reasonOptions.find((o) => o.value === lostReason)?.label || lostReason;
    const { value: compPriceVal, unrecognized: compPriceUnrecognized } = readMoneyInput(competitorPrice);
    const { error } = await supabase.from('accounts').update({
      lifecycle_stage: 'lost',
      lost_reason: lostReason,
      competitor_name: needComp ? (competitorName.trim() || null) : null,
      competitor_price: needComp && !compPriceUnrecognized && competitorPrice.trim() ? compPriceVal : null,
      last_activity_at: new Date().toISOString(),
    }).in('id', accounts.map((a) => a.id));
    if (error) {
      setSaving(false);
      showToast?.('Failed to mark as lost: ' + error.message, 'error');
      return;
    }
    const logNotes = [`Marked as Lost. Reason: ${reasonLabel}.`];
    if (needComp && competitorName.trim()) logNotes.push(`Competitor: ${competitorName.trim()}.`);
    if (notes.trim()) logNotes.push(notes.trim());
    const logRows = accounts.map((a) => ({
      account_id: a.id, company_id: a.company_id, type: 'lead_lost', status: 'done',
      notes: logNotes.join(' '), created_by: profile.id, completed_at: new Date().toISOString(),
    }));
    const { error: logErr } = await supabase.from('activities').insert(logRows);
    if (logErr) console.error('[lead] mark-as-lost activity log failed:', logErr.message);
    setSaving(false);
    onMarked?.();
  }

  // `accounts` boleh kosong SAAT `open` -- itu berarti seluruh baris
  // terpilih dikeluarkan pemanggil (mis. semuanya sudah Customer); modal
  // tetap dirender supaya skippedCount di bawah terlihat, bukan diam-diam
  // tak terjadi apa-apa. Hanya bail kalau `open` sendiri false.
  if (!open && !accounts.length) return null;
  const noneEligible = accounts.length === 0;

  return (
    <>
    <Modal open={open} onClose={onClose} title="Mark as Lost" width={500} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        {!noneEligible && <Button variant="danger" loading={saving} onClick={handleConfirmClick}>Mark as Lost</Button>}
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        {skippedCount > 0 && (
          <div style={{
            background: SEMANTIC.warn.bg, border: `1px solid ${SEMANTIC.warn.bd}`, borderRadius: RADIUS.md,
            padding: '10px 14px', fontSize: 12.5, color: SEMANTIC.warn.fg, fontFamily: FONT_BODY,
          }}>
            {skippedCount} {skippedCount === 1 ? 'lead' : 'leads'} skipped{skippedReason ? ` (${skippedReason})` : ''}.
          </div>
        )}

        {noneEligible ? (
          <div style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY }}>No eligible leads left to mark as lost.</div>
        ) : (
          <>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px' }}>
              {bulk ? `${accounts.length} leads selected` : `${accounts[0].code ? `${accounts[0].code}, ` : ''}${accounts[0].name}`}
            </div>

            <div>
              <MasterSelect label="Lost Reason" required value={lostReason} onChange={setLostReason}
                options={reasonOptions.map((o) => ({ value: o.value, label: o.label }))}
                error={lostTouched && !lostReason}
                onAdd={canAddLostReason ? handleAddLostReason : undefined}
                onRequestNew={canAddLostReason ? undefined : () => setRequestReasonOpen(true)} />
              {lostTouched && !lostReason && (
                <div style={{ fontSize: 12, color: SEMANTIC.warn.fg, fontFamily: FONT_BODY, marginTop: 5, marginLeft: 3 }}>
                  Lost Reason is required
                </div>
              )}
            </div>

            {needComp && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 }}>
                <FloatingInput label="Competitor Name" value={competitorName} onChange={setCompetitorName} />
                <FloatingInput label="Competitor Price" placeholder="Rp" value={competitorPrice}
                  onChange={setCompetitorPrice} onBlur={handleCompPriceBlur} inputMode="numeric" />
              </div>
            )}

            <Textarea label="Notes" value={notes} onChange={setNotes} rows={3} hint="Optional" />
          </>
        )}
      </div>
    </Modal>
    <RequestNewOptionModal
      open={requestReasonOpen} onClose={() => setRequestReasonOpen(false)}
      listKey="lost_reason" listLabel="Lost Reason" companyId={null}
    />
    </>
  );
}

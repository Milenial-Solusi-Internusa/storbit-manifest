// src/modules/procurement/PRFVendorOfferModal.jsx
// Form tambah/edit satu "Penawaran Vendor" (prf_vendor_offers) + rincian
// biayanya (prf_cost_items, offer_id + prf_id keduanya WAJIB terisi — RLS
// prf_cost_items mencari induk lewat prf_id, BUKAN offer_id).
//
// Dipanggil dari PRFDetailPage.jsx (kartu "Penawaran Vendor"). Modal ini
// menangani INSERT/UPDATE-nya SENDIRI (bukan sekadar kumpulkan form lalu
// serahkan ke parent) — vendors/currencyCodes diterima sbg props (sudah
// di-fetch PRFDetailPage, tak fetch ulang). Setelah sukses, panggil
// onSaved() supaya parent refetch (load()) + tutup modal.
//
// Gate render (siapa yang BOLEH membuka modal ini) sepenuhnya tanggung jawab
// PRFDetailPage — modal ini tidak mengecek izin sendiri, hanya menjalankan RPC
// biasa (bukan RPC SECURITY DEFINER) sehingga RLS prf_vendor_offers_insert/
// update (syarat: procurement + prf.acknowledged_by = auth.uid() PERSIS) tetap
// jadi penegak sebenarnya.
//
// Cost items REPLACE-on-save (DELETE semua milik offer ini, lalu INSERT ulang
// dari form) — bukan diff per-baris. Ini non-atomik (tak ada RPC baru sesuai
// instruksi task); lihat komentar di handleSave soal penanganan gagal-sebagian.
//
// is_awarded pada baris baru SENGAJA di-set false (bukan default kolom TRUE)
// — kalau dibiarkan default, tiap penawaran baru ikut kehitung di kalkulasi
// "Buat Quotation" (savedModalByCurrency, PRFDetailPage.jsx) yang masih pakai
// model lama; makin banyak penawaran, makin membengkak modal yang terhitung.
// Netral sampai batch 3C memindahkan dasar hitung ke prf.selected_offer_id.
import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const BORDER = '#E8ECF2';
const INK = '#16243A';
const MUTE = '#7E8899';
const HEAD = "'Montserrat',sans-serif";
const BODY = "'Inter',system-ui,sans-serif";
const DANGER = '#C0392B';

// Sama persis daftar di PRFDetailPage.jsx (tidak diekspor dari sana) — aturan
// bisnis utk kolom item_group, bukan CHECK di DB.
const ITEM_GROUPS = ['Origin Charges', 'Freight Charges', 'Destination Charges'];

const num = (v) => (Number(v) || 0);
const uid = () => crypto.randomUUID();
const freshRow = () => ({ key: uid(), item_group: '', component: '', amount: '0', currency: 'IDR' });

const label = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTE, marginBottom: 4 };
const input = { height: 38, width: '100%', borderRadius: 9, border: `1px solid ${BORDER}`, padding: '0 10px', fontSize: 13, fontFamily: BODY, color: INK, boxSizing: 'border-box', outline: 'none', background: '#fff' };
const textarea = { ...input, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 };
const th = { textAlign: 'left', padding: '9px 10px', fontFamily: HEAD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: MUTE, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const td = { padding: '7px 10px', fontSize: 13, color: INK, borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' };
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer' };
const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };

// Parent WAJIB memberi `key` yang berubah tiap kali offer target berbeda (mis.
// `key={editingOffer?.id || 'new'}`) dan hanya me-render komponen ini saat
// benar-benar terbuka (`{offerModalOpen && <PRFVendorOfferModal .../>}`) —
// itulah yang membuat field form di bawah selalu mulai dari data yang benar
// tanpa perlu useEffect+setState (React remount penuh tiap target berganti,
// bukan reuse instance lama). Pola "reset state pakai key", bukan hilang
// disengaja — hindari useEffect yang isinya cuma copy props→state sinkron.
export default function PRFVendorOfferModal({
  offer, prfId, prfNo, companyId, vendors, currencyCodes, actor, onClose, onSaved, showToast,
}) {
  const isEdit = !!offer;

  const [vendorId, setVendorId] = useState(offer?.vendor_id || '');
  const [currency, setCurrency] = useState(offer?.currency || '');
  const [validFrom, setValidFrom] = useState(offer?.valid_from || '');
  const [validUntil, setValidUntil] = useState(offer?.valid_until || '');
  const [pros, setPros] = useState(offer?.pros || '');
  const [cons, setCons] = useState(offer?.cons || '');
  const [notes, setNotes] = useState(offer?.notes || '');
  const [rows, setRows] = useState(() => (offer?.costItems || []).map((r) => ({
    key: uid(),
    item_group: r.item_group || '',
    component: r.component || '',
    amount: r.amount != null ? String(r.amount) : '0',
    currency: r.currency || 'IDR',
  })));
  const [saving, setSaving] = useState(false);

  const addRow = () => setRows((rs) => [...rs, freshRow()]);
  const patchRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));

  const keptRows = () => rows.filter((r) => r.component.trim() !== '' || num(r.amount) !== 0);

  const validate = () => {
    if (!vendorId) return 'Vendor wajib dipilih.';
    if (!pros.trim()) return 'Kelebihan wajib diisi.';
    if (!cons.trim()) return 'Kekurangan wajib diisi.';
    if (keptRows().length === 0) return 'Minimal satu baris biaya.';
    return null;
  };

  const handleSave = async () => {
    const vErr = validate();
    if (vErr) { showToast?.(vErr, 'error'); return; }

    const vendorName = vendors.find((v) => v.id === vendorId)?.name || vendorId;
    const kept = keptRows();
    setSaving(true);
    // Dideklarasikan di luar kedua blok try — Fase 2 butuh id offer yang baru
    // dibuat Fase 1 (create) atau id offer yang sedang diedit (edit).
    let offerId = offer?.id || null;
    try {
      // ── Fase 1: baris offer itu sendiri. Gagal di sini → modal TETAP TERBUKA
      // (belum ada yang tersimpan, aman untuk dicoba ulang tanpa kehilangan isian).
      if (isEdit) {
        const { error: eUpd } = await supabase.from('prf_vendor_offers').update({
          vendor_id: vendorId,
          currency: currency || null,
          valid_from: validFrom || null,
          valid_until: validUntil || null,
          pros: pros.trim(),
          cons: cons.trim(),
          notes: notes.trim() || null,
        }).eq('id', offer.id);
        if (eUpd) throw eUpd;
      } else {
        const { data: created, error: eIns } = await supabase.from('prf_vendor_offers').insert({
          prf_id: prfId,
          company_id: companyId,
          vendor_id: vendorId,
          currency: currency || null,
          valid_from: validFrom || null,
          valid_until: validUntil || null,
          pros: pros.trim(),
          cons: cons.trim(),
          notes: notes.trim() || null,
          created_by: actor?.id || null,
        }).select('id').single();
        if (eIns) throw eIns;
        offerId = created.id;
      }
    } catch (err) {
      showToast?.(err.message, 'error');
      setSaving(false);
      return;
    }

    // ── Fase 2: rincian biaya — REPLACE (delete semua milik offer ini, lalu
    // insert ulang dari form). Non-atomik (nol RPC baru diizinkan task ini).
    // Gagal di fase ini: offer di Fase 1 SUDAH tersimpan — jangan pura-pura
    // gagal total. Tampilkan error apa adanya, tetap refetch (onSaved) supaya
    // kartu mencerminkan DB sebenarnya (offer ada, rincian mungkin timpang),
    // user bisa buka Edit lagi utk membetulkan.
    try {
      const { error: eDel } = await supabase.from('prf_cost_items').delete().eq('offer_id', offerId);
      if (eDel) throw eDel;

      if (kept.length > 0) {
        const payload = kept.map((r, i) => ({
          prf_id: prfId,
          offer_id: offerId,
          component: r.component.trim(),
          cost_type: 'vendor',
          amount: num(r.amount),
          currency: r.currency || 'IDR',
          sort_order: i,
          item_group: r.item_group || null,
          is_awarded: false,
        }));
        const { error: eInsRows } = await supabase.from('prf_cost_items').insert(payload);
        if (eInsRows) throw eInsRows;
      }

      showToast?.(isEdit ? 'Penawaran berhasil diperbarui.' : 'Penawaran berhasil ditambahkan.');
      logAudit(supabase, {
        action: isEdit ? ACTION_TYPES.UPDATE_VENDOR_OFFER : ACTION_TYPES.CREATE_VENDOR_OFFER,
        entityType: ENTITY_TYPES.PRF,
        entityId: prfId,
        entityLabel: prfNo,
        notes: `${isEdit ? 'Penawaran diperbarui' : 'Penawaran baru ditambahkan'}: ${vendorName} (offer ${offerId})`,
      }, actor);
    } catch (err) {
      showToast?.('Penawaran tersimpan, tapi rincian biaya gagal disimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
      onSaved?.();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', position: 'relative' }}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} color="#6B7280" />
        </button>

        <h2 style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>
          {isEdit ? 'Edit Penawaran Vendor' : 'Tambah Penawaran Vendor'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={label}>Vendor *</div>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">— Pilih Vendor —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
            </select>
          </div>
          <div>
            <div style={label}>Currency</div>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">— Tidak diisi —</option>
              {currencyCodes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={label}>Berlaku Dari</div>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} style={input} />
          </div>
          <div>
            <div style={label}>Berlaku Sampai</div>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={input} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={label}>Kelebihan *</div>
            <textarea value={pros} onChange={(e) => setPros(e.target.value)} rows={3} style={textarea} placeholder="mis. Transit time lebih cepat, harga kompetitif…" />
          </div>
          <div>
            <div style={label}>Kekurangan *</div>
            <textarea value={cons} onChange={(e) => setCons(e.target.value)} rows={3} style={textarea} placeholder="mis. Minimal booking 2 minggu sebelumnya…" />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={label}>Catatan</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={textarea} placeholder="Opsional…" />
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ ...label, marginBottom: 10 }}>Rincian Biaya *</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 170 }}>Kategori</th>
                  <th style={th}>Komponen</th>
                  <th style={{ ...th, textAlign: 'right', width: 150 }}>Amount</th>
                  <th style={{ ...th, width: 110 }}>Currency</th>
                  <th style={{ ...th, textAlign: 'center', width: 50 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td style={{ ...td, color: MUTE, textAlign: 'center' }} colSpan={5}>Belum ada baris biaya.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td style={td}>
                      <select value={r.item_group} onChange={(e) => patchRow(r.key, 'item_group', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                        <option value="">— Pilih —</option>
                        {ITEM_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <input value={r.component} onChange={(e) => patchRow(r.key, 'component', e.target.value)} style={input} placeholder="mis. Ocean Freight" />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input value={r.amount} onChange={(e) => patchRow(r.key, 'amount', e.target.value.replace(/[^\d.]/g, ''))} onWheel={(e) => e.currentTarget.blur()} inputMode="decimal" style={{ ...input, textAlign: 'right' }} placeholder="0" />
                    </td>
                    <td style={td}>
                      <select value={r.currency} onChange={(e) => patchRow(r.key, 'currency', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                        {currencyCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button type="button" onClick={() => removeRow(r.key)} style={{ ...iconBtn, color: DANGER, borderColor: '#F0D2D2' }} title="Hapus baris"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addRow} style={{ ...ghostBtn, marginTop: 10 }}><Plus size={14} />Tambah Baris</button>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 10, border: '1.5px solid #D1D5DB', background: 'white', color: '#374151', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            Batal
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: ORANGE, color: 'white', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

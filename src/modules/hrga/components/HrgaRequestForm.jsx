// src/modules/hrga/components/HrgaRequestForm.jsx
// HRGA Request form modal — supports line items (ATK etc.)
// Opens via AdminFormModal. Submits via submitHrgaRequest().
//
// Props:
//   open            boolean
//   requestType     { id, type_code, type_name, category_name,
//                     requires_amount, requires_date_range,
//                     requires_attachment, approval_levels }
//   profile         from useAuth()
//   onClose         fn
//   onSuccess       fn({ document_no })

import { useState, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import AdminFormModal from '../../admin/components/AdminFormModal';
import { submitHrgaRequest } from '../../../hooks/useHrgaRequests';

// ─────────────────────────────────────────────────────────────
// Design tokens (mirrors project PASTEL palette)
// ─────────────────────────────────────────────────────────────
const P = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  mint:         '#C8EFD9',
  mintDeep:     '#7FC9A0',
  rose:         '#F5C8D5',
  roseDeep:     '#D89AB0',
  lavender:     '#D8C5F0',
  lavenderDeep: '#A98FD8',
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
};

const EMPTY_ITEM = () => ({ item_description: '', quantity: '1', unit: 'pcs', notes: '' });

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: P.inkSoft }}>
      {children}{required && <span style={{ color: P.roseDeep }} className="ml-1">*</span>}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = 'text', readOnly, ...rest }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      className="w-full px-3.5 py-2.5 rounded-2xl text-sm outline-none transition-all"
      style={{
        border: `1.5px solid ${P.line}`,
        background: readOnly ? P.lineSoft : 'white',
        color: readOnly ? P.inkMute : P.ink,
      }}
      {...rest}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3.5 py-2.5 rounded-2xl text-sm outline-none transition-all resize-none"
      style={{
        border: `1.5px solid ${P.line}`,
        background: 'white',
        color: P.ink,
      }}
    />
  );
}

function ApprovalBadge({ approvalLevels }) {
  const labels = {
    1: 'HRGA',
    2: 'Supervisor → HRGA',
    3: 'Supervisor → HRGA → Finance',
  };
  const label = labels[approvalLevels] || `${approvalLevels} level`;
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold"
      style={{ background: P.lavender, color: P.lavenderDeep }}
    >
      <CheckCircle2 size={13} />
      Approval: {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Line Items table
// ─────────────────────────────────────────────────────────────

function LineItemsTable({ items, onChange }) {
  const updateItem = useCallback((idx, field, value) => {
    onChange(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }, [items, onChange]);

  const removeItem = useCallback((idx) => {
    onChange(items.filter((_, i) => i !== idx));
  }, [items, onChange]);

  const addItem = useCallback(() => {
    onChange([...items, EMPTY_ITEM()]);
  }, [items, onChange]);

  return (
    <div>
      {/* Header row */}
      <div
        className="grid text-[10px] font-bold uppercase tracking-widest mb-1 px-1"
        style={{
          gridTemplateColumns: '1fr 80px 72px 1fr 32px',
          gap: '8px',
          color: P.inkMute,
        }}
      >
        <span>Nama Barang</span>
        <span>Jumlah</span>
        <span>Satuan</span>
        <span>Keterangan</span>
        <span />
      </div>

      {/* Item rows */}
      <div className="flex flex-col gap-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="grid items-center"
            style={{ gridTemplateColumns: '1fr 80px 72px 1fr 32px', gap: '8px' }}
          >
            <input
              type="text"
              value={item.item_description}
              onChange={e => updateItem(idx, 'item_description', e.target.value)}
              placeholder="e.g. Ballpoint, Kertas A4"
              className="px-3 py-2 rounded-xl text-sm outline-none"
              style={{ border: `1.5px solid ${P.line}`, color: P.ink }}
            />
            <input
              type="number"
              value={item.quantity}
              onChange={e => updateItem(idx, 'quantity', e.target.value)}
              min="1"
              className="px-3 py-2 rounded-xl text-sm outline-none text-center"
              style={{ border: `1.5px solid ${P.line}`, color: P.ink }}
            />
            <input
              type="text"
              value={item.unit}
              onChange={e => updateItem(idx, 'unit', e.target.value)}
              placeholder="pcs"
              className="px-3 py-2 rounded-xl text-sm outline-none"
              style={{ border: `1.5px solid ${P.line}`, color: P.ink }}
            />
            <input
              type="text"
              value={item.notes}
              onChange={e => updateItem(idx, 'notes', e.target.value)}
              placeholder="Warna, merk, spek…"
              className="px-3 py-2 rounded-xl text-sm outline-none"
              style={{ border: `1.5px solid ${P.line}`, color: P.ink }}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              disabled={items.length === 1}
              className="flex items-center justify-center w-8 h-8 rounded-xl transition-opacity"
              style={{
                background: items.length === 1 ? P.lineSoft : P.rose,
                opacity: items.length === 1 ? 0.4 : 1,
              }}
              aria-label="Hapus item"
            >
              <Trash2 size={13} style={{ color: items.length === 1 ? P.inkMute : P.roseDeep }} />
            </button>
          </div>
        ))}
      </div>

      {/* Add row button */}
      <button
        type="button"
        onClick={addItem}
        className="mt-3 flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all hover:opacity-80"
        style={{ background: P.lineSoft, color: P.inkSoft, border: `1.5px dashed ${P.line}` }}
      >
        <Plus size={13} />
        Tambah Barang
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main form
// ─────────────────────────────────────────────────────────────

export default function HrgaRequestForm({ open, requestType, profile, onClose, onSuccess }) {
  const [subject, setSubject]           = useState('');
  const [description, setDescription]   = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [items, setItems]               = useState([EMPTY_ITEM()]);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState(null);

  const handleClose = useCallback(() => {
    if (saving) return;
    setSubject('');
    setDescription('');
    setRequestedDate('');
    setItems([EMPTY_ITEM()]);
    setError(null);
    onClose();
  }, [saving, onClose]);

  const handleSubmit = useCallback(async () => {
    // Inline validation (validate fn is not memoised — inlined to satisfy exhaustive-deps)
    let validationError = null;
    if (!subject.trim()) validationError = 'Keperluan / subjek harus diisi.';
    else {
      const validItems = items.filter(it => it.item_description.trim());
      if (validItems.length === 0) validationError = 'Minimal satu nama barang harus diisi.';
      else {
        for (const it of validItems) {
          const qty = parseFloat(it.quantity);
          if (!qty || qty <= 0) { validationError = 'Jumlah barang harus lebih dari 0.'; break; }
        }
      }
    }
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError(null);

    const cleanItems = items
      .filter(it => it.item_description.trim())
      .map(it => ({
        item_description: it.item_description.trim(),
        quantity:         parseFloat(it.quantity) || 1,
        unit:             it.unit.trim() || 'pcs',
        notes:            it.notes.trim() || null,
      }));

    let result;
    try {
      result = await submitHrgaRequest({
        requestTypeId: requestType?.id,
        subject:       subject.trim(),
        description:   description.trim() || null,
        requestedDate: requestedDate || null,
        items:         cleanItems,
        profile,
      });
    } catch (err) {
      // Catch uncaught throws (e.g. TypeError in non-critical steps) so
      // setSaving(false) is always reached and the form never gets stuck.
      result = { data: null, error: { message: err?.message || 'Terjadi kesalahan saat submit. Coba lagi.' } };
    }

    setSaving(false);

    const { data, error: submitError } = result;
    if (submitError) {
      setError(submitError.message || 'Gagal submit request. Coba lagi.');
      return;
    }

    // Reset form
    setSubject('');
    setDescription('');
    setRequestedDate('');
    setItems([EMPTY_ITEM()]);
    setError(null);

    onSuccess?.(data);
  }, [subject, description, requestedDate, items, requestType, profile, onSuccess]);

  if (!requestType) return null;

  const footerContent = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={handleClose}
        disabled={saving}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-70"
        style={{ background: 'white', color: P.inkSoft, border: `1.5px solid ${P.line}` }}
      >
        Batal
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all hover:opacity-90"
        style={{ background: P.ink, color: 'white' }}
      >
        {saving && <RefreshCw size={14} className="animate-spin" />}
        {saving ? 'Mengirim…' : 'Submit Request'}
      </button>
    </div>
  );

  return (
    <AdminFormModal
      open={open}
      eyebrow={`${requestType.category_name} · ${requestType.type_code}`}
      title={requestType.type_name}
      subtitle="Isi form di bawah lalu klik Submit Request. Request akan dikirim ke approver pertama."
      onClose={handleClose}
      footer={footerContent}
      maxWidth="720px"
    >
      <div className="flex flex-col gap-5">

        {/* Approval chain info */}
        <ApprovalBadge approvalLevels={requestType.approval_levels} />

        {/* Error banner */}
        {error && (
          <div
            className="flex items-start gap-2.5 px-4 py-3 rounded-2xl text-sm"
            style={{ background: P.rose, color: P.roseDeep }}
          >
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Keperluan / Subject */}
        <div>
          <Label required>Keperluan / Alasan Request</Label>
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g. Kebutuhan ATK untuk tim Sales bulan Juni"
          />
        </div>

        {/* Tanggal dibutuhkan */}
        <div>
          <Label>Tanggal Dibutuhkan</Label>
          <Input
            type="date"
            value={requestedDate}
            onChange={e => setRequestedDate(e.target.value)}
          />
        </div>

        {/* Line items */}
        <div>
          <Label required>Daftar Barang</Label>
          <LineItemsTable items={items} onChange={setItems} />
        </div>

        {/* Catatan tambahan */}
        <div>
          <Label>Catatan Tambahan</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Informasi tambahan yang perlu diketahui approver (opsional)"
          />
        </div>

        {/* Attachment notice */}
        {requestType.requires_attachment && (
          <div
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs"
            style={{ background: P.butter, color: '#7A5C10' }}
          >
            <AlertCircle size={13} />
            Tipe request ini memerlukan lampiran. Upload dokumen pendukung setelah request dibuat.
          </div>
        )}

      </div>
    </AdminFormModal>
  );
}

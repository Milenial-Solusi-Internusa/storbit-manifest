// src/modules/logistics/DeliveryNoteDetailPage.jsx
// Fase 3 — Surat Jalan (detail). Mirrors PickingListDetailPage.
// Armada + packing editable; status flow draft → in_transit → delivered;
// cancel (draft/in_transit); Cetak PDF (DeliveryNotePDF).

import { useState, useEffect, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  Truck, User, MapPin, Calendar, FileText, Send, CheckCircle2,
  AlertTriangle, Printer, ArrowLeft, Home, ChevronRight, Ban, Save, Plus, Trash2,
} from 'lucide-react';
import {
  getDeliveryNoteDetail, updateDeliveryArmada, setDeliveryStatus, cancelDelivery,
  updateDeliveryItemQty, deleteDeliveryItem, addDeliveryItem,
} from '../../lib/db';
import { useProducts } from '../../hooks/useProducts';
import ConfirmModal from '../../components/ConfirmModal';
import ProductPicker from '../../components/ProductPicker';
import DeliveryNotePDF from './DeliveryNotePDF';

const C = {
  navy: '#1B4D8A', ink: '#212A37', mute: '#7E8899', faint: '#A6AEBD',
  orange: '#E8703D', bg: '#F2F5F9', card: '#FFFFFF', line: '#E8ECF2',
  teal: '#E5F2F4', tealI: '#3F8E9E',
  slate: '#EDF0F4', slateI: '#525E70',
  green: '#E7F4ED', greenI: '#479467',
  amber: '#FCF2E3', amberI: '#C0863A',
  rose: '#F9EBF2', roseI: '#B25E94',
};

const STATUS_MAP = {
  draft:      { label: 'Draft',            bg: C.slate, fg: C.slateI, icon: FileText },
  in_transit: { label: 'Dalam Pengiriman',  bg: C.amber, fg: C.amberI, icon: Send },
  delivered:  { label: 'Terkirim',          bg: C.green, fg: C.greenI, icon: CheckCircle2 },
  cancelled:  { label: 'Dibatalkan',        bg: C.rose,  fg: C.roseI,  icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const st = STATUS_MAP[status] || STATUS_MAP.draft;
  const Icon = st.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st.bg, color: st.fg, fontWeight: 700, fontSize: 11.5, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      <Icon size={12} strokeWidth={2.5} /> {st.label}
    </span>
  );
}

function TopBar({ crumbs }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, marginBottom: 4 }}>
      <Home size={13} />
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ChevronRight size={12} style={{ color: C.faint }} />
          <span style={{ color: i === crumbs.length - 1 ? C.ink : C.mute, fontWeight: i === crumbs.length - 1 ? 600 : 500 }}>{c}</span>
        </span>
      ))}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const inputStyle = { width: '100%', height: 38, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' };
const lblStyle = { fontSize: 11, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 5, display: 'block' };

export default function DeliveryNoteDetailPage({ deliveryNoteId, onBack, showToast, onGoToPicking }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [form, setForm] = useState({});
  // Surat Jalan selalu entity Storbit (SOA) → pin katalog produk ke SOA,
  // bukan company home user (super_admin/MSI pun dapat katalog yang benar).
  const { products } = useProducts({ companyId: 'd2e5e565-5f67-4954-b8d9-5979a2a0c697' });
  const [newItem, setNewItem] = useState({ product_id: null, product_name: '', sku: '', qty: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getDeliveryNoteDetail(deliveryNoteId);
    if (error) { showToast?.(error.message || 'Gagal memuat surat jalan', 'error'); setDetail(null); }
    else {
      setDetail(data);
      setForm({
        driver_name: data.driver_name || '', driver_phone: data.driver_phone || '',
        vehicle_no: data.vehicle_no || '', ship_date: data.ship_date || '',
        total_koli: data.total_koli ?? '', total_weight: data.total_weight ?? '',
        destination_address: data.destination_address || '',
      });
    }
    setLoading(false);
  }, [deliveryNoteId, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const status = detail?.status;
  const items = detail?.items || [];
  const locked = status === 'delivered' || status === 'cancelled';
  const editable = status === 'draft';   // item edit hanya saat draft
  const canDispatch = !!(form.driver_name?.trim() && form.vehicle_no?.trim());

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSaveArmada = useCallback(async () => {
    setBusy(true);
    const patch = {
      driver_name: form.driver_name?.trim() || null,
      driver_phone: form.driver_phone?.trim() || null,
      vehicle_no: form.vehicle_no?.trim() || null,
      ship_date: form.ship_date || null,
      total_koli: form.total_koli === '' || form.total_koli == null ? null : Number(form.total_koli),
      total_weight: form.total_weight === '' || form.total_weight == null ? null : Number(form.total_weight),
      destination_address: form.destination_address?.trim() || null,
    };
    const { error } = await updateDeliveryArmada(deliveryNoteId, patch);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal menyimpan info armada', 'error'); return; }
    showToast?.('Info armada disimpan ✓');
    load();
  }, [form, deliveryNoteId, showToast, load]);

  const handleStatus = useCallback(async (next) => {
    setBusy(true);
    const { error } = await setDeliveryStatus(deliveryNoteId, next);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal memperbarui status', 'error'); return; }
    showToast?.(next === 'in_transit' ? 'Surat jalan diberangkatkan.' : 'Surat jalan ditandai terkirim.');
    load();
  }, [deliveryNoteId, showToast, load]);

  const handleCancel = useCallback(async () => {
    setConfirmCancelOpen(false);
    setBusy(true);
    const { error } = await cancelDelivery(deliveryNoteId);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal membatalkan surat jalan', 'error'); return; }
    showToast?.('Surat jalan dibatalkan.');
    load();
  }, [deliveryNoteId, showToast, load]);

  // --- Item edits (Opsi C) — hanya saat draft ---
  const handleItemQty = useCallback(async (itemId, qty) => {
    setDetail(prev => prev && ({ ...prev, items: prev.items.map(x => x.id === itemId ? { ...x, qty } : x) }));
    const { error } = await updateDeliveryItemQty(itemId, qty);
    if (error) { showToast?.(error.message || 'Gagal memperbarui qty', 'error'); load(); }
  }, [showToast, load]);

  const handleDeleteItem = useCallback(async (itemId) => {
    const { error } = await deleteDeliveryItem(itemId);
    if (error) { showToast?.(error.message || 'Gagal menghapus item', 'error'); return; }
    setDetail(prev => prev && ({ ...prev, items: prev.items.filter(x => x.id !== itemId) }));
  }, [showToast]);

  const handleAddItem = useCallback(async () => {
    if (!newItem.product_name.trim()) { showToast?.('Pilih atau isi produk dulu', 'error'); return; }
    const { data, error } = await addDeliveryItem(deliveryNoteId, {
      product_id: newItem.product_id,
      product_name: newItem.product_name.trim(),
      sku: newItem.sku || '',
      qty: newItem.qty,
    });
    if (error) { showToast?.(error.message || 'Gagal menambah item', 'error'); return; }
    setDetail(prev => prev && ({ ...prev, items: [...prev.items, data] }));
    setNewItem({ product_id: null, product_name: '', sku: '', qty: '' });
    showToast?.('Item ditambahkan ✓');
  }, [newItem, deliveryNoteId, showToast]);

  const handlePrint = useCallback(async () => {
    if (!detail) return;
    try {
      const blob = await pdf(<DeliveryNotePDF dn={detail} generatedAt={new Date().toISOString()} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SuratJalan-${(detail.do_no || 'SJ').replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast?.('Gagal membuat PDF: ' + (e?.message || e), 'error');
    }
  }, [detail, showToast]);

  if (loading) {
    return <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
      <div style={{ padding: '48px 24px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Memuat…</div>
    </div>;
  }
  if (!detail) {
    return <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.mute, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', padding: '6px 0', marginBottom: 12 }}><ArrowLeft size={14} /> Kembali</button>
      <div style={{ padding: '48px 24px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Surat jalan tidak ditemukan.</div>
    </div>;
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
      <TopBar crumbs={['Daftar Pesanan (Storbit)', 'Surat Jalan', detail.do_no]} />
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.mute, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', padding: '6px 0', marginBottom: 12 }}>
        <ArrowLeft size={14} /> Kembali ke daftar
      </button>

      {/* Header card */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, boxShadow: '0 1px 2px rgba(27,77,138,.04)', marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Truck size={22} color={C.tealI} />
          </div>
          <div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 18, color: C.ink }}>{detail.do_no}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}><User size={13} /> Customer: <b style={{ color: C.ink }}>{detail.customer_name || '—'}</b></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}><FileText size={13} /> SP: <b style={{ color: C.ink, fontFamily: 'IBM Plex Mono, monospace' }}>{detail.sp_no}</b></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}><Calendar size={13} /> Kirim: <b style={{ color: C.ink }}>{fmtDate(detail.ship_date)}</b></span>
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Armada & pengiriman */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(27,77,138,.04)', marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.ink }}>Armada & Pengiriman</span>
        </div>
        <div style={{ padding: 20 }}>
          {locked ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              {[['Driver', detail.driver_name], ['Telp Driver', detail.driver_phone], ['No. Kendaraan', detail.vehicle_no], ['Tanggal Kirim', fmtDate(detail.ship_date)], ['Koli', detail.total_koli], ['Berat (kg)', detail.total_weight], ['Alamat Tujuan', detail.destination_address]].map(([l, v]) => (
                <div key={l}><span style={lblStyle}>{l}</span><div style={{ fontSize: 13, color: C.ink }}>{v ?? '—'}</div></div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div><span style={lblStyle}>Nama Driver</span><input style={inputStyle} value={form.driver_name} onChange={e => setField('driver_name', e.target.value)} placeholder="cth: Budi" /></div>
                <div><span style={lblStyle}>Telp Driver</span><input style={inputStyle} value={form.driver_phone} onChange={e => setField('driver_phone', e.target.value)} placeholder="08xx" /></div>
                <div><span style={lblStyle}>No. Kendaraan</span><input style={inputStyle} value={form.vehicle_no} onChange={e => setField('vehicle_no', e.target.value)} placeholder="B 1234 XYZ" /></div>
                <div><span style={lblStyle}>Tanggal Kirim</span><input type="date" style={inputStyle} value={form.ship_date || ''} onChange={e => setField('ship_date', e.target.value)} /></div>
                <div><span style={lblStyle}>Koli</span><input type="number" style={inputStyle} value={form.total_koli} onChange={e => setField('total_koli', e.target.value)} placeholder="0" /></div>
                <div><span style={lblStyle}>Berat (kg)</span><input type="number" style={inputStyle} value={form.total_weight} onChange={e => setField('total_weight', e.target.value)} placeholder="0" /></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <span style={lblStyle}><MapPin size={11} style={{ verticalAlign: 'middle' }} /> Alamat Tujuan</span>
                <textarea value={form.destination_address} onChange={e => setField('destination_address', e.target.value)} rows={2}
                  style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical' }} placeholder="Alamat pengiriman customer" />
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleSaveArmada} disabled={busy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.navy}55`, color: C.navy, fontWeight: 700, fontSize: 13, padding: '9px 16px', borderRadius: 10, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                  <Save size={14} /> Simpan Info Armada
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(27,77,138,.04)', overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.ink }}>Item Dikirim</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFC' }}>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4 }}>Produk</th>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4 }}>SKU</th>
              <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4 }}>Qty</th>
              {editable && <th style={{ width: 64, padding: '10px 16px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: '12px 16px', fontSize: 13, color: C.ink, fontWeight: 500 }}>{it.product_name || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: C.mute }}>{it.sku || '—'}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {editable ? (
                    <input type="number" min="0" value={it.qty ?? 0}
                      onChange={e => handleItemQty(it.id, e.target.value === '' ? 0 : Number(e.target.value))}
                      style={{ width: 90, height: 34, textAlign: 'right', padding: '0 8px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }} />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{Number(it.qty || 0).toLocaleString('id-ID')}</span>
                  )}
                </td>
                {editable && (
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => handleDeleteItem(it.id)} title="Hapus item"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.roseI, padding: 4, display: 'inline-flex' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={editable ? 4 : 3} style={{ padding: '32px 16px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Tidak ada item.</td></tr>}
            {editable && (
              <tr style={{ borderTop: `1px solid ${C.line}`, background: '#FCFDFE' }}>
                <td style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                  <ProductPicker
                    value={newItem.product_name}
                    products={products}
                    inputStyle={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
                    placeholder="Cari produk untuk ditambahkan…"
                    onChangeText={(v) => setNewItem(p => ({ ...p, product_name: v, product_id: null, sku: '' }))}
                    onPick={(p) => setNewItem(prev => ({ ...prev, product_id: p.id, product_name: p.name, sku: p.code || '' }))}
                  />
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: C.mute, verticalAlign: 'top' }}>{newItem.sku || '—'}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', verticalAlign: 'top' }}>
                  <input type="number" min="0" value={newItem.qty} placeholder="0"
                    onChange={e => setNewItem(p => ({ ...p, qty: e.target.value }))}
                    style={{ width: 90, height: 34, textAlign: 'right', padding: '0 8px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }} />
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', verticalAlign: 'top' }}>
                  <button onClick={handleAddItem} title="Tambah item"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> Tambah
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.line}`, color: C.mute, fontWeight: 600, fontSize: 13, padding: '10px 18px', borderRadius: 11, cursor: 'pointer' }}>
          <Printer size={15} /> Cetak PDF
        </button>

        {status === 'draft' && (
          <button onClick={() => handleStatus('in_transit')} disabled={busy || !canDispatch}
            title={!canDispatch ? 'Isi & simpan nama driver + no. kendaraan dulu' : ''}
            style={{ background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: (busy || !canDispatch) ? 'not-allowed' : 'pointer', opacity: (busy || !canDispatch) ? 0.5 : 1 }}>
            {busy ? 'Memproses…' : 'Berangkatkan'}
          </button>
        )}
        {status === 'in_transit' && (
          <button onClick={() => handleStatus('delivered')} disabled={busy}
            style={{ background: C.greenI, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Memproses…' : 'Tandai Terkirim'}
          </button>
        )}
        {(status === 'draft' || status === 'in_transit') && (
          <button onClick={() => setConfirmCancelOpen(true)} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.roseI}55`, color: C.roseI, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 11, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            <Ban size={15} /> Batalkan
          </button>
        )}
        {status === 'delivered' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.green, color: C.greenI, fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11 }}>
            <CheckCircle2 size={15} /> Terkirim
          </span>
        )}
        {status === 'cancelled' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.rose, color: C.roseI, fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11 }}>
            <Ban size={15} /> Dibatalkan
          </span>
        )}
        {status === 'cancelled' && detail.picking_list_id && (
          <button
            onClick={() => onGoToPicking?.(detail.picking_list_id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.navy}55`, color: C.navy, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 11, cursor: 'pointer' }}
          >
            <ArrowLeft size={15} /> Lihat Picking List
          </button>
        )}
      </div>

      {status === 'cancelled' && (
        <p style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: C.mute }}>
          Surat jalan ini dibatalkan. Buat surat jalan baru dari <b style={{ color: C.ink }}>Picking List</b> terkait bila diperlukan.
        </p>
      )}

      <ConfirmModal
        open={confirmCancelOpen}
        title="Batalkan Surat Jalan"
        message="Yakin batalkan surat jalan ini?"
        confirmLabel="Ya, Batalkan"
        cancelLabel="Tidak"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </div>
  );
}

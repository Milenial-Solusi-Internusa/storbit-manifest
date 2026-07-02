// src/modules/logistics/PickingListDetailPage.jsx
// Fase 2 — Picking List (detail view). Design source: picking-list-mockup.jsx.
// Real data: getPickingListDetail() + setPickingItemPicked/startPicking/completePicking.
//
// Status flow (picking_lists.status): pending → in_progress → done.
//   - "Mulai Pengambilan" (pending → in_progress, sets started_at)
//   - toggle item picked/unpicked (picking_list_items.status + qty_picked)
//   - once every item picked → "Selesaikan" (in_progress → done, sets completed_at)

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, MapPin, User, Warehouse, Calendar, CheckCircle2, Circle,
  Package, AlertTriangle, Printer, ArrowLeft, Truck, Home, ChevronRight, Ban,
} from 'lucide-react';
import {
  getPickingListDetail, setPickingItemPicked, startPicking, completePicking, cancelPicking,
} from '../../lib/db';
import ConfirmModal from '../../components/ConfirmModal';

const C = {
  navy: '#1B4D8A', navyD: '#143C6E',
  ink: '#212A37', mute: '#7E8899', faint: '#A6AEBD',
  orange: '#E8703D', bg: '#F2F5F9', card: '#FFFFFF', line: '#E8ECF2',
  teal: '#E5F2F4', tealI: '#3F8E9E',
  slate: '#EDF0F4', slateI: '#525E70',
  green: '#E7F4ED', greenI: '#479467',
  amber: '#FCF2E3', amberI: '#C0863A',
  rose: '#F9EBF2', roseI: '#B25E94',
};

const STATUS_MAP = {
  pending:     { label: 'Menunggu',       bg: C.slate, fg: C.slateI, icon: Circle },
  in_progress: { label: 'Sedang Diambil',  bg: C.amber, fg: C.amberI, icon: Package },
  done:        { label: 'Selesai',         bg: C.green, fg: C.greenI, icon: CheckCircle2 },
  cancelled:   { label: 'Dibatalkan',      bg: C.rose,  fg: C.roseI,  icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  const Icon = s.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.fg, fontWeight: 700, fontSize: 11.5,
      padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      <Icon size={12} strokeWidth={2.5} />
      {s.label}
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

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function PickingListDetailPage({ pickingListId, onBack, showToast, onCreateDelivery, onGoToSp }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getPickingListDetail(pickingListId);
    if (error) {
      showToast?.(error.message || 'Gagal memuat picking list', 'error');
      setDetail(null);
    } else {
      setDetail(data);
    }
    setLoading(false);
  }, [pickingListId, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const status = detail?.status;
  const items = detail?.items || [];
  const pickedCount = items.filter(it => it.status === 'picked').length;
  const allPicked = items.length > 0 && pickedCount === items.length;
  const shortCount = items.filter(it => (it.qty_short || 0) > 0).length;   // ter-reserve sebagian (stok kurang)
  const locked = status === 'done' || status === 'cancelled';

  const togglePicked = useCallback(async (it) => {
    if (busy || locked) return;
    const next = it.status !== 'picked';
    setBusy(true);
    const { error } = await setPickingItemPicked(it.id, next, it.qty_requested);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal memperbarui item', 'error'); return; }
    setDetail(prev => prev && ({
      ...prev,
      items: prev.items.map(x => x.id === it.id
        ? { ...x, status: next ? 'picked' : 'pending', qty_picked: next ? x.qty_requested : 0 }
        : x),
    }));
  }, [busy, locked, showToast]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    const { error } = await startPicking(pickingListId);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal memulai pengambilan', 'error'); return; }
    showToast?.('Pengambilan dimulai.');
    load();
  }, [pickingListId, showToast, load]);

  const handleComplete = useCallback(async () => {
    setBusy(true);
    const { error } = await completePicking(pickingListId);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal menyelesaikan picking', 'error'); return; }
    showToast?.('Picking list selesai.');
    load();
  }, [pickingListId, showToast, load]);

  const handleCancel = useCallback(async () => {
    setConfirmCancelOpen(false);
    setBusy(true);
    const { error } = await cancelPicking(pickingListId);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal membatalkan picking list', 'error'); return; }
    showToast?.('Picking list dibatalkan.');
    load();
  }, [pickingListId, showToast, load]);

  if (loading) {
    return (
      <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
        <div style={{ padding: '48px 24px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Memuat…</div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.mute, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', padding: '6px 0', marginBottom: 12 }}>
          <ArrowLeft size={14} /> Kembali ke daftar
        </button>
        <div style={{ padding: '48px 24px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Picking list tidak ditemukan.</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
      <TopBar crumbs={['Daftar Pesanan (Storbit)', 'Picking List', detail.picking_no]} />

      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.mute, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', padding: '6px 0', marginBottom: 12 }}
      >
        <ArrowLeft size={14} /> Kembali ke daftar
      </button>

      {/* Header card */}
      <div style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22,
        boxShadow: '0 1px 2px rgba(27,77,138,.04)', marginBottom: 18,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ClipboardList size={22} color={C.tealI} />
          </div>
          <div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 18, color: C.ink }}>
              {detail.picking_no}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}>
                <Truck size={13} /> SP: <b style={{ color: C.ink, fontFamily: 'IBM Plex Mono, monospace' }}>{detail.sp_no}</b>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}>
                <User size={13} /> {detail.customer_name || '—'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}>
                <Warehouse size={13} /> {detail.warehouse_name || 'Belum ditentukan'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.mute }}>
                <Calendar size={13} /> {fmtDateTime(detail.created_at)}
              </span>
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Items */}
      <div style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
        boxShadow: '0 1px 2px rgba(27,77,138,.04)', overflow: 'hidden', marginBottom: 18,
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.ink }}>
            Item yang Diambil
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {shortCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: C.roseI, background: C.rose, padding: '3px 10px', borderRadius: 9 }}>
                <AlertTriangle size={12} strokeWidth={2.5} /> {shortCount} item stok kurang
              </span>
            )}
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.tealI, background: C.teal, padding: '3px 10px', borderRadius: 9 }}>
              {pickedCount} / {items.length} selesai
            </span>
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFC' }}>
              {['', 'Produk', 'SKU', 'Lokasi', 'Qty Diminta', 'Qty Diambil', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const picked = it.status === 'picked';
              return (
                <tr key={it.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '14px 16px', width: 36 }}>
                    <button
                      onClick={() => togglePicked(it)}
                      disabled={busy || locked}
                      title={locked ? 'Picking sudah selesai' : (picked ? 'Batalkan' : 'Tandai sudah diambil')}
                      style={{ background: 'none', border: 'none', cursor: (busy || locked) ? 'not-allowed' : 'pointer', padding: 0, display: 'flex', opacity: locked ? 0.6 : 1 }}
                    >
                      {picked ? <CheckCircle2 size={20} color={C.greenI} /> : <Circle size={20} color={C.faint} />}
                    </button>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: C.ink, fontWeight: 500 }}>
                    {it.product_name || '—'}
                    {(it.qty_short || 0) > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: C.roseI, background: C.rose, padding: '2px 7px', borderRadius: 7, verticalAlign: 'middle' }}>
                        <AlertTriangle size={11} strokeWidth={2.5} /> Kurang {Number(it.qty_short).toLocaleString('id-ID')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: C.mute }}>{it.sku || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 12.5, color: C.mute }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} color={C.faint} /> {it.location_detail || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: C.ink }}>{it.qty_requested}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: picked ? C.greenI : C.faint }}>{it.qty_picked}</td>
                  <td style={{ padding: '14px 16px' }}><StatusBadge status={picked ? 'done' : 'pending'} /></td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Tidak ada item.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={() => showToast?.('Cetak picking list akan tersedia (Fase 3).')}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.line}`, color: C.mute, fontWeight: 600, fontSize: 13, padding: '10px 18px', borderRadius: 11, cursor: 'pointer' }}
        >
          <Printer size={15} /> Cetak Picking List
        </button>

        {status === 'pending' && (
          <button
            onClick={handleStart}
            disabled={busy}
            style={{ background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Memproses…' : 'Mulai Pengambilan'}
          </button>
        )}

        {status === 'in_progress' && !allPicked && (
          <button disabled style={{ background: C.slate, color: C.slateI, fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: 'not-allowed' }}>
            Centang semua item untuk selesai
          </button>
        )}

        {status === 'in_progress' && allPicked && (
          <button
            onClick={handleComplete}
            disabled={busy}
            style={{ background: C.greenI, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Memproses…' : 'Selesaikan Picking'}
          </button>
        )}

        {status === 'done' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.green, color: C.greenI, fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11 }}>
            <CheckCircle2 size={15} /> Picking selesai
          </span>
        )}

        {/* Buat Surat Jalan — hanya saat picking sudah 'done' */}
        {status === 'done' && (
          <button
            onClick={async () => { if (busy) return; setBusy(true); await onCreateDelivery?.(detail); setBusy(false); }}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            <Truck size={15} /> {busy ? 'Memproses…' : 'Buat Surat Jalan'}
          </button>
        )}

        {/* Batalkan — hanya saat masih pending / in_progress (tidak untuk done) */}
        {(status === 'pending' || status === 'in_progress') && (
          <button
            onClick={() => setConfirmCancelOpen(true)}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.roseI}55`, color: C.roseI, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 11, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            <Ban size={15} /> Batalkan Picking List
          </button>
        )}

        {/* Indikator saat sudah dibatalkan + jalan pintas regenerate */}
        {status === 'cancelled' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.rose, color: C.roseI, fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11 }}>
            <Ban size={15} /> Dibatalkan
          </span>
        )}
        {status === 'cancelled' && detail.sp_no && (
          <button
            onClick={() => onGoToSp?.(detail.sp_no)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: 'pointer' }}
          >
            <ClipboardList size={15} /> Buat Picking Baru
          </button>
        )}
      </div>

      {/* Catatan bila dibatalkan: SP bisa di-generate ulang */}
      {status === 'cancelled' && (
        <p style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: C.mute }}>
          Picking list ini dibatalkan. SP <b style={{ fontFamily: 'IBM Plex Mono, monospace', color: C.ink }}>{detail.sp_no}</b> bisa di-generate ulang picking list baru bila diperlukan.
        </p>
      )}

      <ConfirmModal
        open={confirmCancelOpen}
        title="Batalkan Picking List"
        message="Yakin batalkan picking list ini? SP terkait bisa di-generate ulang picking list baru setelah dibatalkan."
        confirmLabel="Ya, Batalkan"
        cancelLabel="Tidak"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </div>
  );
}

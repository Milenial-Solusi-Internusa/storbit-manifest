// src/modules/logistics/PickingListDetailPage.jsx
// Fase 2 — Picking List (detail view). Design source: picking-list-mockup.jsx.
// Real data: getPickingListDetail() + setPickingItemPicked/startPicking/completePicking.
//
// Status flow (picking_lists.status): pending → in_progress → done.
//   - "Mulai Pengambilan" (pending → in_progress, sets started_at)
//   - input qty_picked per item (0..qty_requested); status diturunkan otomatis
//     (0 → pending, sebagian → short, penuh → picked) — partial picking.
//   - "Selesaikan Picking" selalu aktif saat in_progress; kalau masih ada item
//     pending/short, lewat dialog konfirmasi dulu. Kalau SEMUA item masih 0,
//     ditolak dengan toast (jalan buntu — lihat allItemsZero / TD-206).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  ClipboardList, MapPin, User, Warehouse, Calendar, CheckCircle2, Circle,
  Package, AlertTriangle, Printer, ArrowLeft, Truck, Home, ChevronRight, Ban,
  Boxes, Plus, Trash2,
} from 'lucide-react';
import {
  getPickingListDetail, setPickingItemPicked, derivePickingItemStatus,
  startPicking, completePicking, cancelPicking,
  addPickingMaterial, deletePickingMaterial, getStockForProducts,
} from '../../lib/db';
import useProducts from '../../hooks/useProducts';
import { useAuth } from '../../contexts/useAuth';
import ProductPicker from '../../components/ProductPicker';
import ConfirmModal from '../../components/ConfirmModal';
import PickingListPDF from './PickingListPDF';

const SOA_COMPANY_ID = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';

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

// Status per BARIS ITEM (picking_list_items.status) — namespace BERBEDA dari
// STATUS_MAP di bawah yang untuk picking_lists.status. Dipisah supaya 'short'
// (baru terpakai sejak partial picking) tidak tertukar label dengan
// 'in_progress' milik header. Token warna memakai C.* yang sudah ada.
const ITEM_STATUS_MAP = {
  pending: { label: 'Belum Diambil', bg: C.slate, fg: C.slateI, icon: Circle },
  short:   { label: 'Sebagian',      bg: C.amber, fg: C.amberI, icon: AlertTriangle },
  picked:  { label: 'Lengkap',       bg: C.green, fg: C.greenI, icon: CheckCircle2 },
};

const STATUS_MAP = {
  pending:     { label: 'Menunggu',       bg: C.slate, fg: C.slateI, icon: Circle },
  in_progress: { label: 'Sedang Diambil',  bg: C.amber, fg: C.amberI, icon: Package },
  done:        { label: 'Selesai',         bg: C.green, fg: C.greenI, icon: CheckCircle2 },
  cancelled:   { label: 'Dibatalkan',      bg: C.rose,  fg: C.roseI,  icon: AlertTriangle },
};

function ItemStatusBadge({ status }) {
  const s = ITEM_STATUS_MAP[status] || ITEM_STATUS_MAP.pending;
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
  const { erpRoles } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  // Nilai input qty yang SEDANG diketik, per item id. Hanya berisi baris yang
  // sedang disentuh user; sisanya jatuh balik ke qty_picked dari server, jadi
  // tak ada draft basi setelah load() ulang.
  const [qtyDraft, setQtyDraft] = useState({});

  // Material Packing (Fase 3.x) — kardus/lakban/dll (inventory_class='Inventory').
  // Katalog di-pin ke Storbit/SOA (halaman ini selalu SOA), apapun home user.
  const { products } = useProducts({ companyId: SOA_COMPANY_ID });
  const materialProducts = useMemo(
    () => (products || []).filter((p) => p.inventory_class === 'Inventory'),
    [products],
  );
  const [matStockMap, setMatStockMap] = useState({});
  const [stockTick, setStockTick] = useState(0);
  const [newMat, setNewMat] = useState({ productId: null, text: '', sku: '', qty: '' });

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
  // useMemo supaya identitasnya stabil antar-render: handleStart menutup atas
  // `items` untuk prefill, dan tanpa ini dep array-nya berubah tiap render.
  const items = useMemo(() => detail?.items || [], [detail]);
  const pickedCount = items.filter(it => it.status === 'picked').length;
  const shortCount = items.filter(it => (it.qty_short || 0) > 0).length;   // ter-reserve sebagian (stok kurang)
  // DUA konsep "kurang" yang beda, jangan tertukar: shortCount di atas = stok
  // gudang tak cukup saat picking dibuat (qty_short, dihitung server). Dua di
  // bawah = hasil pengambilan nyata (picking_list_items.status).
  const pendingItemCount = items.filter(it => it.status === 'pending').length;
  const shortPickedCount = items.filter(it => it.status === 'short').length;
  const hasIncompleteItems = pendingItemCount > 0 || shortPickedCount > 0;
  // Semua baris masih 0 (mis. SP berstok nol: prefill qty_requested - qty_short
  // menghasilkan 0 di setiap baris). Menyelesaikan picking dalam keadaan ini
  // menciptakan jalan buntu: generate_delivery_from_picking menolak picking yang
  // nol item ter-pick, jadi dispatched_at tak pernah terisi, guard
  // generate_picking_from_sp memblokir picking baru selamanya, dan cancel_picking
  // menolak status 'done'. Lihat 08_TECH_DEBT.md TD-206.
  const allItemsZero = items.length > 0 && items.every(it => (Number(it.qty_picked) || 0) === 0);
  const locked = status === 'done' || status === 'cancelled';
  // CERMIN guard server RPC picking (migrasi 20260821000004):
  //   is_super_admin() OR (company ∈ get_user_company_ids()
  //                        AND (is_manager_or_above() OR has_role('operations')))
  // Halaman ini sebelumnya NOL referensi peran — siapa pun yang bisa membukanya
  // dapat memulai/menyelesaikan/membatalkan picking (yang mereservasi &
  // melepas stok). Dibaca dari erpRoles (SELURUH role aktif), bukan role primer.
  const canWarehouseOps = (erpRoles || [])
    .map(r => r.roles?.code)
    .some(c => ['super_admin', 'admin', 'ceo', 'gm', 'gm_bd', 'manager', 'supervisor', 'operations'].includes(c));
  // Input qty ikut mati kalau tak berhak — tanpa ini tombolnya hilang tapi
  // kolom qty masih bisa diketik lalu ditolak server.
  const readOnly = locked || !canWarehouseOps;

  // Material Packing hanya dicatat saat picking sudah 'done'; bisa diedit selama
  // Surat Jalan belum dibuat (has_delivery=false), read-only setelahnya.
  const materials = detail?.materials || [];
  const matEditable = status === 'done' && !detail?.has_delivery;

  // Commit qty_picked satu baris. Dipanggil onBlur (BUKAN tiap keystroke).
  // Pola tulisnya sama persis dengan togglePicked lama: await dulu, error →
  // toast + return, sukses → perbarui state lokal tanpa refetch.
  const handleQtyCommit = useCallback(async (it, raw) => {
    if (locked || !canWarehouseOps) return;
    const req = Math.max(0, Math.floor(Number(it.qty_requested) || 0));
    const qty = Math.min(Math.max(0, Math.floor(Number(raw) || 0)), req);
    setQtyDraft(prev => {
      if (!(it.id in prev)) return prev;
      const next = { ...prev };
      delete next[it.id];
      return next;
    });
    if (qty === (Number(it.qty_picked) || 0)) return;   // tak berubah → jangan tulis
    setBusy(true);
    const { error } = await setPickingItemPicked(it.id, qty, req);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal memperbarui item', 'error'); return; }
    setDetail(prev => prev && ({
      ...prev,
      items: prev.items.map(x => x.id === it.id
        ? { ...x, status: derivePickingItemStatus(qty, req), qty_picked: qty }
        : x),
    }));
  }, [locked, canWarehouseOps, showToast]);

  const handleStart = useCallback(async () => {
    if (!canWarehouseOps) return;
    setBusy(true);
    const { error } = await startPicking(pickingListId);
    if (error) {
      setBusy(false);
      showToast?.(error.message || 'Gagal memulai pengambilan', 'error');
      return;
    }
    // Prefill qty_picked = qty_requested − qty_short (jumlah yang realistis bisa
    // diambil dari stok yang ter-reserve). Ditulis DI SINI — aksi user eksplisit
    // "Mulai Pengambilan" — bukan di useEffect on-mount, supaya tidak ada tulis
    // data tanpa aksi user. load() di bawah menyegarkan seluruh baris, jadi tak
    // perlu optimistic update di sini.
    const prefill = items
      .filter(it => (Number(it.qty_picked) || 0) === 0)
      .map(it => {
        const req = Math.max(0, Math.floor(Number(it.qty_requested) || 0));
        const qty = Math.max(0, req - Math.max(0, Math.floor(Number(it.qty_short) || 0)));
        return { id: it.id, qty, req };
      })
      .filter(x => x.qty > 0);
    const failed = prefill.length
      ? (await Promise.all(prefill.map(x => setPickingItemPicked(x.id, x.qty, x.req))))
          .filter(r => r.error).length
      : 0;
    setBusy(false);
    if (failed > 0) {
      showToast?.(`Pengambilan dimulai, tapi ${failed} item gagal diisi otomatis — isi manual.`, 'error');
    } else {
      showToast?.('Pengambilan dimulai.');
    }
    load();
  }, [pickingListId, showToast, load, items, canWarehouseOps]);

  const handleComplete = useCallback(async () => {
    if (!canWarehouseOps) return;
    setBusy(true);
    const { error } = await completePicking(pickingListId);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal menyelesaikan picking', 'error'); return; }
    showToast?.('Picking list selesai.');
    load();
  }, [pickingListId, showToast, load, canWarehouseOps]);

  // Gate penyelesaian, tiga cabang:
  //   semua item 0     → TOLAK (jalan buntu, lihat allItemsZero di atas)
  //   ada pending/short → konfirmasi dulu, baru complete_picking
  //   semua lengkap     → langsung proses (perilaku lama)
  const handleCompleteClick = useCallback(() => {
    if (allItemsZero) {
      showToast?.('Semua item masih 0, picking ini tidak bisa diselesaikan. Batalkan picking ini kalau stok memang tidak tersedia.', 'error');
      return;
    }
    if (hasIncompleteItems) { setConfirmCompleteOpen(true); return; }
    handleComplete();
  }, [allItemsZero, hasIncompleteItems, handleComplete, showToast]);

  const handleConfirmComplete = useCallback(() => {
    setConfirmCompleteOpen(false);
    handleComplete();
  }, [handleComplete]);

  const handleCancel = useCallback(async () => {
    if (!canWarehouseOps) return;
    setConfirmCancelOpen(false);
    setBusy(true);
    const { error } = await cancelPicking(pickingListId);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal membatalkan picking list', 'error'); return; }
    showToast?.('Picking list dibatalkan.');
    load();
  }, [pickingListId, showToast, load, canWarehouseOps]);

  const handlePrint = useCallback(async () => {
    if (!detail) return;
    try {
      const blob = await pdf(<PickingListPDF pl={detail} generatedAt={new Date().toISOString()} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PickingList-${(detail.picking_no || 'PICK').replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast?.('Gagal membuat PDF: ' + (e?.message || e), 'error');
    }
  }, [detail, showToast]);

  // Company-level availability for the material catalog (refreshes after add/delete
  // via stockTick). setState lives inside .then() → not flagged by set-state-in-effect.
  useEffect(() => {
    const ids = materialProducts.map((p) => p.id);
    if (ids.length === 0) return undefined;
    let cancelled = false;
    getStockForProducts(ids).then(({ data }) => {
      if (!cancelled) setMatStockMap(data || {});
    });
    return () => { cancelled = true; };
  }, [materialProducts, stockTick]);

  const selMatAvail = newMat.productId ? (matStockMap[newMat.productId]?.available ?? 0) : null;
  const matQtyNum = Number(newMat.qty) || 0;

  const handleAddMaterial = useCallback(async () => {
    if (!canWarehouseOps) return;
    if (busy) return;
    if (!newMat.productId) { showToast?.('Pilih material dulu.', 'error'); return; }
    if (matQtyNum <= 0) { showToast?.('Qty harus lebih dari 0.', 'error'); return; }
    setBusy(true);
    const { error } = await addPickingMaterial(pickingListId, newMat.productId, matQtyNum);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal menambah material', 'error'); return; }
    showToast?.('Material ditambahkan.');
    setNewMat({ productId: null, text: '', sku: '', qty: '' });
    setStockTick((t) => t + 1);
    load();
  }, [busy, newMat, matQtyNum, pickingListId, showToast, load, canWarehouseOps]);

  const handleDeleteMaterial = useCallback(async (materialId) => {
    if (!canWarehouseOps) return;
    if (busy) return;
    setBusy(true);
    const { error } = await deletePickingMaterial(materialId);
    setBusy(false);
    if (error) { showToast?.(error.message || 'Gagal menghapus material', 'error'); return; }
    showToast?.('Material dihapus.');
    setStockTick((t) => t + 1);
    load();
  }, [busy, showToast, load, canWarehouseOps]);

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
              {['Produk', 'SKU', 'Lokasi', 'Qty Diminta', 'Qty Diambil', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              return (
                <tr key={it.id} style={{ borderTop: `1px solid ${C.line}` }}>
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
                  <td style={{ padding: '14px 16px' }}>
                    <input
                      type="number"
                      min={0}
                      max={it.qty_requested}
                      step={1}
                      disabled={readOnly}
                      value={qtyDraft[it.id] ?? String(it.qty_picked ?? 0)}
                      onChange={(e) => setQtyDraft(prev => ({ ...prev, [it.id]: e.target.value }))}
                      onBlur={(e) => handleQtyCommit(it, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      title={!canWarehouseOps ? 'Hanya Operations / Manager ke atas yang boleh mengambil'
                        : locked ? 'Picking sudah selesai' : `Maksimal ${it.qty_requested}`}
                      style={{
                        width: 84, padding: '7px 10px', borderRadius: 9,
                        border: `1px solid ${C.line}`, background: readOnly ? C.bg : C.card,
                        color: C.ink, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                        cursor: readOnly ? 'not-allowed' : 'text',
                      }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px' }}><ItemStatusBadge status={it.status} /></td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Tidak ada item.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Material Packing — hanya saat picking sudah 'done' */}
      {status === 'done' && (
        <div style={{
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
          boxShadow: '0 1px 2px rgba(27,77,138,.04)', overflow: 'hidden', marginBottom: 18,
        }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.ink }}>
              <Boxes size={16} color={C.slateI} /> Material Packing
            </span>
            {!matEditable && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.slateI, background: C.slate, padding: '3px 10px', borderRadius: 9 }}>
                Terkunci (Surat Jalan sudah dibuat)
              </span>
            )}
          </div>

          {/* Baris tambah — hanya selama editable (sebelum Surat Jalan) */}
          {matEditable && (
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.line}`, background: '#FAFBFC', display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px', minWidth: 220 }}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Material</label>
                <ProductPicker
                  value={newMat.text}
                  products={materialProducts}
                  placeholder="Cari material (kardus, lakban, …)"
                  onChangeText={(t) => setNewMat((m) => ({ ...m, text: t, productId: null, sku: '' }))}
                  onPick={(p) => setNewMat((m) => ({ ...m, text: p.name, productId: p.id, sku: p.code }))}
                  inputStyle={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 13, fontFamily: 'inherit', color: C.ink, background: C.card }}
                />
                {newMat.productId && (
                  <div style={{ marginTop: 6, fontSize: 11.5 }}>
                    {matQtyNum > selMatAvail ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.roseI, fontWeight: 700 }}>
                        <AlertTriangle size={12} strokeWidth={2.5} /> Tersedia: {Number(selMatAvail).toLocaleString('id-ID')} — kurang dari qty diminta
                      </span>
                    ) : (
                      <span style={{ color: C.mute }}>Tersedia: <b style={{ color: C.ink }}>{Number(selMatAvail).toLocaleString('id-ID')}</b></span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ flex: '0 0 110px' }}>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Qty</label>
                <input
                  type="number" min={1} step={1}
                  value={newMat.qty}
                  onChange={(e) => setNewMat((m) => ({ ...m, qty: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', color: C.ink }}
                />
              </div>
              <div style={{ flex: '0 0 auto', alignSelf: 'stretch', display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={handleAddMaterial}
                  disabled={busy || !newMat.productId || matQtyNum <= 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: (busy || !newMat.productId || matQtyNum <= 0) ? 'not-allowed' : 'pointer', opacity: (busy || !newMat.productId || matQtyNum <= 0) ? 0.55 : 1 }}
                >
                  <Plus size={15} /> Tambah
                </button>
              </div>
            </div>
          )}

          {/* Daftar material tercatat */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFC' }}>
                {['Material', 'SKU', 'Qty', matEditable ? '' : null].filter(h => h !== null).map((h, i) => (
                  <th key={i} style={{ textAlign: h === 'Qty' ? 'right' : 'left', padding: '10px 16px', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: C.ink, fontWeight: 500 }}>{m.product_name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: C.mute }}>{m.sku || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.ink, textAlign: 'right' }}>{Number(m.qty || 0).toLocaleString('id-ID')}</td>
                  {matEditable && (
                    <td style={{ padding: '12px 16px', width: 44, textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteMaterial(m.id)}
                        disabled={busy}
                        title="Hapus material"
                        style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 4, display: 'inline-flex', color: C.roseI, opacity: busy ? 0.5 : 1 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {materials.length === 0 && (
                <tr><td colSpan={matEditable ? 4 : 3} style={{ padding: '24px 16px', textAlign: 'center', color: C.mute, fontSize: 12.5 }}>Belum ada material packing dicatat.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.line}`, color: C.mute, fontWeight: 600, fontSize: 13, padding: '10px 18px', borderRadius: 11, cursor: 'pointer' }}
        >
          <Printer size={15} /> Cetak Picking List
        </button>

        {status === 'pending' && canWarehouseOps && (
          <button
            onClick={handleStart}
            disabled={busy}
            style={{ background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Memproses…' : 'Mulai Pengambilan'}
          </button>
        )}

        {/* Selalu aktif selama in_progress (partial picking). Kalau masih ada
            item pending/short, handleCompleteClick membuka dialog konfirmasi
            dulu; kalau semua sudah lengkap, langsung proses (perilaku lama). */}
        {status === 'in_progress' && canWarehouseOps && (
          <button
            onClick={handleCompleteClick}
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
            onClick={() => onGoToSp?.(detail.sp_no, detail.customer_id)}
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
        open={confirmCompleteOpen}
        title="Selesaikan Picking Belum Lengkap"
        message={`${pendingItemCount} item belum diambil sama sekali dan ${shortPickedCount} item diambil sebagian. Picking akan ditandai selesai dengan qty apa adanya, dan Surat Jalan hanya membawa item yang qty-nya lebih dari 0. Sisa outstanding tetap bisa dibuatkan picking baru setelah Surat Jalan ini diberangkatkan.`}
        confirmLabel="Lanjutkan"
        cancelLabel="Batal"
        variant="warning"
        onConfirm={handleConfirmComplete}
        onCancel={() => setConfirmCompleteOpen(false)}
      />

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

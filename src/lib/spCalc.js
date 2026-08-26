// src/lib/spCalc.js
// Single source of truth for SP item calculations.
//
// Official formula (Opsi B — confirmed by Koh Denny):
//   subtotal  = unitPrice × qty
//   ppnBase   = subtotal + shippingPrice  — shipping IS subject to PPN
//   ppn       = round(ppnBase × 0.11)
//   grandTotal = subtotal + shippingPrice + ppn

import { PPN_RATE } from './taxConstants';

/**
 * Calculate derived fields for a single SP item.
 * @param {Object} item - app-side SP item (camelCase fields)
 * @returns {{ subtotal, ppn, grandTotal, outstandingQty, status, isOverdue }}
 */
export function calcItem(item) {
  const qty           = Number(item.qty)          || 0;
  const unitPrice     = Number(item.unitPrice)     || 0;
  const shippingPrice = Number(item.shippingPrice) || 0;
  const subtotal      = unitPrice * qty;
  const ppnBase       = subtotal + shippingPrice;
  const ppn           = Math.round(ppnBase * PPN_RATE);
  const grandTotal    = subtotal + shippingPrice + ppn;
  const shippedQty    = Number(item.shippedQty)   || 0;
  const outstandingQty = qty - shippedQty;

  let status = 'Open';
  if (outstandingQty === 0 && qty > 0) status = 'Closed';
  else if (shippedQty > 0 && outstandingQty > 0) status = 'Partial';

  const today = new Date();
  let isOverdue = false;
  const deadlineField = item.expired_date || item.deadline;
  if (deadlineField && status !== 'Closed') {
    const dl = new Date(deadlineField);
    if (!isNaN(dl.getTime()) && dl < today) isOverdue = true;
  }

  return { subtotal, ppn, grandTotal, outstandingQty, status, isOverdue };
}

/**
 * Status pengiriman satu baris SP yang SADAR konfirmasi surat jalan.
 *
 * SENGAJA TERPISAH dari calcItem() — bukan duplikasi yang kelupaan digabung.
 * calcItem() dipakai di seluruh aplikasi (App.jsx groupBySP, ekspor CSV, kartu
 * total) dan hanya boleh bergantung pada baris sp_items itu sendiri; ia murni
 * sinkron, tanpa I/O. Fungsi ini butuh data SATU FETCH LEBIH JAUH (surat jalan
 * mana yang sudah dikonfirmasi DC), jadi menaruhnya di calcItem() akan memaksa
 * SETIAP pemakai calcItem ikut mengambil data itu — atau diam-diam menerima
 * `breakdown` undefined dan kembali berbohong.
 *
 * KENAPA PERLU: sp_items.shipped_qty naik saat surat jalan BERANGKAT
 * (dispatch_delivery), bukan saat tim DC customer mengonfirmasi barang SAMPAI
 * (mark_delivery_delivered). Baris dengan shipped_qty penuh karena itu bisa
 * berarti dua hal yang sangat berbeda, dan sebelum ini keduanya sama-sama
 * tampil "Shipped". Ini padanan per-item dari state MENUNGGU_KONFIRMASI_DC di
 * level header SP (migrasi 20260826000002).
 *
 * Kosakata nilai baliknya MENGIKUTI calcItem() ('Open'/'Partial'/'Closed')
 * ditambah SATU nilai baru, supaya itemStatusMeta() cukup ditambah satu cabang
 * dan pemetaan label lama tak perlu ditulis ulang.
 *
 * @param {Object} item - baris SP (camelCase: qty, shippedQty)
 * @param {{qtyDelivered?:number, qtyInTransit?:number}} [breakdown] - satu entri
 *        dari getSpItemDeliveryBreakdown (db.js). Boleh undefined: SP hasil
 *        import lama tak punya surat jalan sama sekali, dan itu BUKAN keadaan
 *        error — tanpa SJ 'in_transit' baris qty-penuh memang 'Closed'.
 * @returns {'Open'|'Partial'|'AwaitingDC'|'Closed'}
 */
export function deriveItemShipStatus(item, breakdown) {
  const qty        = Number(item?.qty)        || 0;
  const shippedQty = Number(item?.shippedQty) || 0;
  if (shippedQty <= 0)  return 'Open';
  if (shippedQty < qty) return 'Partial';
  const qtyInTransit = Number(breakdown?.qtyInTransit) || 0;
  return qtyInTransit > 0 ? 'AwaitingDC' : 'Closed';
}

/**
 * Group a flat array of SP item rows by SP number.
 * Returns one summary object per SP — suitable for list/card views.
 * Note: App.jsx uses a richer internal groupBySP with items[], financePct, etc.
 * This lightweight version is for components that only need aggregate totals.
 * @param {Object[]} rows - enriched SP item rows
 * @returns {Object[]} - array of SP summaries
 */
export function groupBySP(rows) {
  const map = {};
  rows.forEach(r => {
    const calc = calcItem(r);
    const k = r.spNo;
    if (!map[k]) {
      map[k] = {
        spNo: r.spNo, spDate: r.spDate, customer: r.customer,
        itemCount: 0, totalQty: 0,
        totalAmount: 0, totalPPN: 0, grandTotal: 0,
      };
    }
    map[k].itemCount   += 1;
    map[k].totalQty    += Number(r.qty) || 0;
    map[k].totalAmount += calc.subtotal;
    map[k].totalPPN    += calc.ppn;
    map[k].grandTotal  += calc.grandTotal;
  });
  return Object.values(map);
}

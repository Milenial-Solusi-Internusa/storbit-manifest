// src/lib/spCalc.js
// Single source of truth for SP item calculations.
//
// Official formula:
//   subtotal  = unitPrice × qty
//   ppn       = round(subtotal × 0.11)   — shipping is NOT subject to PPN
//   grandTotal = subtotal + ppn + shippingPrice

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
  const ppn           = Math.round(subtotal * 0.11);
  const grandTotal    = subtotal + ppn + shippingPrice;
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

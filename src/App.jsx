import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, FileText, Plus, Truck, Wallet, Clock,
  Search, Download, Upload, Eye, Edit3, Trash2, X, Check,
  TrendingUp, Package, AlertTriangle, CheckCircle2, Filter,
  ChevronRight, Save, RefreshCw, Calendar, Building2, User,
  ArrowUpDown, ArrowUp, ArrowDown, Sparkles, ChevronLeft, LogOut
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { useAuth } from './contexts/AuthContext';

// ============================
// PASTEL PALETTE
// ============================
const PASTEL = {
  peach: '#FFD4B8',
  peachDeep: '#F5A78F',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
  mint: '#C8EFD9',
  mintDeep: '#7FC9A0',
  butter: '#FFE9B8',
  butterDeep: '#E8C168',
  rose: '#F5C8D5',
  roseDeep: '#D89AB0',
  sky: '#C8E4F5',
  skyDeep: '#8FBCD8',
  cream: '#FAF6F0',
  ink: '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  line: '#EDE6DC',
  lineSoft: '#F5EFE5',
};

// ============================
// Sample seed data - multiple items per SP
// ============================
const SEED_DATA = [
  // SP 2020577 - 1 item, closed
  {
    id: 'seed-1',
    spDate: '2026-01-14', spNo: '2020577', customer: 'INDOMARCO',
    productName: 'STORBIT LOYANG 46 X 33 CM ( SAYBREAD )',
    sku: 'BKT-SB43-00001',
    qty: 10, shippedQty: 10,
    expDate: '2026-06-11', deadline: '',
    dc: 'DC BOGOR', shippingDate: '2026-04-29', btbNo: '2015214',
    unitPrice: 120000, shippingPrice: 600000,
    inv: true, fp: true, submit: true, kirim: true,
    submitDate: '2026-05-07', emailStatus: '2026-05-07',
    notes: ''
  },
  // SP 2020611 - 3 items, mixed statuses
  {
    id: 'seed-2a',
    spDate: '2026-02-03', spNo: '2020611', customer: 'INDOMARCO',
    productName: 'STORBIT CONTAINER 30L CLEAR',
    sku: 'CNT-CL30-00012',
    qty: 50, shippedQty: 30,
    expDate: '', deadline: '2026-05-15',
    dc: 'DC JAKARTA', shippingDate: '2026-04-20', btbNo: '2015301',
    unitPrice: 85000, shippingPrice: 400000,
    inv: true, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: 'Partial shipment, sisa nyusul minggu depan'
  },
  {
    id: 'seed-2b',
    spDate: '2026-02-03', spNo: '2020611', customer: 'INDOMARCO',
    productName: 'STORBIT CONTAINER 50L CLEAR',
    sku: 'CNT-CL50-00013',
    qty: 30, shippedQty: 30,
    expDate: '', deadline: '2026-05-15',
    dc: 'DC JAKARTA', shippingDate: '2026-04-18', btbNo: '2015302',
    unitPrice: 125000, shippingPrice: 0,
    inv: true, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: ''
  },
  {
    id: 'seed-2c',
    spDate: '2026-02-03', spNo: '2020611', customer: 'INDOMARCO',
    productName: 'STORBIT TUTUP CONTAINER UNIVERSAL',
    sku: 'CNT-LID-00001',
    qty: 80, shippedQty: 60,
    expDate: '', deadline: '2026-05-15',
    dc: 'DC JAKARTA', shippingDate: '2026-04-20', btbNo: '2015301',
    unitPrice: 25000, shippingPrice: 0,
    inv: true, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: ''
  },
  // SP 2020688 - 2 items, all open
  {
    id: 'seed-3a',
    spDate: '2026-02-18', spNo: '2020688', customer: 'INDOGROSIR',
    productName: 'STORBIT TRAY ROTI ALU 60X40',
    sku: 'TRY-AL60-00003',
    qty: 25, shippedQty: 0,
    expDate: '', deadline: '2026-05-10',
    dc: 'DC SURABAYA', shippingDate: '', btbNo: '',
    unitPrice: 95000, shippingPrice: 750000,
    inv: false, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: 'Menunggu produksi'
  },
  {
    id: 'seed-3b',
    spDate: '2026-02-18', spNo: '2020688', customer: 'INDOGROSIR',
    productName: 'STORBIT TRAY ROTI ALU 80X40',
    sku: 'TRY-AL80-00004',
    qty: 15, shippedQty: 0,
    expDate: '', deadline: '2026-05-10',
    dc: 'DC SURABAYA', shippingDate: '', btbNo: '',
    unitPrice: 135000, shippingPrice: 0,
    inv: false, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: ''
  },
  // SP 2020734 - 1 item, closed but waiting kirim
  {
    id: 'seed-4',
    spDate: '2026-03-05', spNo: '2020734', customer: 'INDOGROSIR',
    productName: 'STORBIT LOYANG 60 X 40 CM',
    sku: 'BKT-LY60-00007',
    qty: 15, shippedQty: 15,
    expDate: '2026-09-05', deadline: '',
    dc: 'DC BOGOR', shippingDate: '2026-04-15', btbNo: '2015245',
    unitPrice: 145000, shippingPrice: 500000,
    inv: true, fp: true, submit: true, kirim: false,
    submitDate: '2026-05-01', emailStatus: '',
    notes: 'Faktur sudah dibuat, belum dikirim ke customer'
  },
  // SP 2020812 - 2 items, overdue
  {
    id: 'seed-5a',
    spDate: '2026-03-22', spNo: '2020812', customer: 'INDOMARCO',
    productName: 'STORBIT BUCKET 20L FOOD GRADE',
    sku: 'BKT-FD20-00021',
    qty: 100, shippedQty: 60,
    expDate: '', deadline: '2026-04-30',
    dc: 'DC JAKARTA', shippingDate: '2026-04-10', btbNo: '2015277',
    unitPrice: 65000, shippingPrice: 850000,
    inv: false, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: 'OVERDUE - perlu follow up urgent'
  },
  {
    id: 'seed-5b',
    spDate: '2026-03-22', spNo: '2020812', customer: 'INDOMARCO',
    productName: 'STORBIT BUCKET 10L FOOD GRADE',
    sku: 'BKT-FD10-00020',
    qty: 50, shippedQty: 50,
    expDate: '', deadline: '2026-04-30',
    dc: 'DC JAKARTA', shippingDate: '2026-04-08', btbNo: '2015276',
    unitPrice: 45000, shippingPrice: 0,
    inv: false, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: ''
  },
  // April SPs
  {
    id: 'seed-6',
    spDate: '2026-04-08', spNo: '2020901', customer: 'INTERNAL',
    productName: 'STORBIT LOYANG ALU 30 X 20',
    sku: 'BKT-AL30-00009',
    qty: 40, shippedQty: 40,
    expDate: '2026-10-08', deadline: '',
    dc: 'DC BANDUNG', shippingDate: '2026-04-25', btbNo: '2015350',
    unitPrice: 75000, shippingPrice: 450000,
    inv: true, fp: true, submit: true, kirim: true,
    submitDate: '2026-05-02', emailStatus: '2026-05-03',
    notes: ''
  },
  {
    id: 'seed-7a',
    spDate: '2026-04-15', spNo: '2020945', customer: 'INDOGROSIR',
    productName: 'STORBIT BOX SAYUR 40L',
    sku: 'BOX-VG40-00031',
    qty: 60, shippedQty: 60,
    expDate: '', deadline: '2026-05-30',
    dc: 'DC BOGOR', shippingDate: '2026-05-02', btbNo: '2015389',
    unitPrice: 55000, shippingPrice: 600000,
    inv: true, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: ''
  },
  {
    id: 'seed-7b',
    spDate: '2026-04-15', spNo: '2020945', customer: 'INDOGROSIR',
    productName: 'STORBIT BOX SAYUR 60L',
    sku: 'BOX-VG60-00032',
    qty: 30, shippedQty: 30,
    expDate: '', deadline: '2026-05-30',
    dc: 'DC BOGOR', shippingDate: '2026-05-02', btbNo: '2015389',
    unitPrice: 78000, shippingPrice: 0,
    inv: true, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '',
    notes: ''
  },
];

// ============================
// Utils
// ============================
const formatRupiah = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
};

const formatRupiahShort = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (n >= 1_000_000_000) return `Rp ${(n/1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n/1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n/1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
};

const formatNumber = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return new Intl.NumberFormat('id-ID').format(n);
};

const formatDateID = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const monthYearKey = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

const monthLabel = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m)-1, 1);
  return date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
};

const monthLabelShort = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m)-1, 1);
  return date.toLocaleDateString('id-ID', { month: 'short' });
};

const calcRow = (row) => {
  const qty = Number(row.qty) || 0;
  const shippedQty = Number(row.shippedQty) || 0;
  const unitPrice = Number(row.unitPrice) || 0;
  const shippingPrice = Number(row.shippingPrice) || 0;

  const outstandingQty = qty - shippedQty;
  const total = unitPrice * qty + shippingPrice;
  const ppn = Math.round(total * 0.11);
  const grandTotal = total + ppn;

  let status = 'Open';
  if (outstandingQty === 0 && qty > 0) status = 'Closed';
  else if (shippedQty > 0 && outstandingQty > 0) status = 'Partial';
  else status = 'Open';

  const today = new Date();
  let isOverdue = false;
  if (row.deadline && status !== 'Closed') {
    const dl = new Date(row.deadline);
    if (!isNaN(dl.getTime()) && dl < today) isOverdue = true;
  }

  return { outstandingQty, total, ppn, grandTotal, status, isOverdue };
};

// Group items by SP No → returns 1 SP summary per row
const groupBySP = (rows) => {
  const enriched = rows.map(r => ({ ...r, ...calcRow(r) }));
  const groups = {};
  enriched.forEach(r => {
    if (!groups[r.spNo]) {
      groups[r.spNo] = {
        spNo: r.spNo,
        spDate: r.spDate,
        dc: r.dc,
        customer: r.customer || '',
        deadline: r.deadline,
        items: [],
        totalQty: 0, totalShipped: 0, totalOutstanding: 0,
        totalAmount: 0, totalPPN: 0, grandTotal: 0,
        invDone: 0, fpDone: 0, submitDone: 0, kirimDone: 0,
        submitDates: [], emailDates: []
      };
    }
    const g = groups[r.spNo];
    g.items.push(r);
    g.totalQty += r.qty;
    g.totalShipped += r.shippedQty;
    g.totalOutstanding += r.outstandingQty;
    g.totalAmount += r.total;
    g.totalPPN += r.ppn;
    g.grandTotal += r.grandTotal;
    if (r.inv) g.invDone++;
    if (r.fp) g.fpDone++;
    if (r.submit) g.submitDone++;
    if (r.kirim) g.kirimDone++;
    if (r.submitDate) g.submitDates.push(r.submitDate);
    if (r.emailStatus) g.emailDates.push(r.emailStatus);
  });

  // Compute overall status per SP
  return Object.values(groups).map(g => {
    const itemCount = g.items.length;
    const closedCount = g.items.filter(i => i.status === 'Closed').length;
    const openCount = g.items.filter(i => i.status === 'Open').length;
    let status = 'Partial';
    if (closedCount === itemCount) status = 'Closed';
    else if (openCount === itemCount) status = 'Open';
    const isOverdue = g.items.some(i => i.isOverdue);

    // Finance progress (% across all 4 doc types)
    const totalDocs = itemCount * 4;
    const doneDocs = g.invDone + g.fpDone + g.submitDone + g.kirimDone;
    const financePct = totalDocs > 0 ? (doneDocs / totalDocs) * 100 : 0;

    return { ...g, status, isOverdue, itemCount, financePct };
  });
};

// ============================
// AR Tracker helpers
// ============================
const calcAR = (ttf) => {
  const btbs = (ttf.btbs || []).map(b => {
    const dpp = Number(b.dppPPN) || 0;
    const pph = Number(b.pph) || 0;
    const total = dpp + pph;
    const pay = Number(b.payment) || 0;
    const os = total - pay;
    return { ...b, total, os };
  });
  const totalInvoice = btbs.reduce((s, b) => s + b.total, 0);
  const totalPayment = btbs.reduce((s, b) => s + b.payment, 0);
  const totalOS = totalInvoice - totalPayment;

  // Jarak hari
  let jarakTgl = null;
  if (ttf.tanggalMenerima) {
    const dStart = new Date(ttf.tanggalMenerima);
    const dEnd = ttf.tglPembayaran ? new Date(ttf.tglPembayaran) : new Date();
    if (!isNaN(dStart.getTime()) && !isNaN(dEnd.getTime())) {
      jarakTgl = Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24));
    }
  }

  // Status
  let status = 'Belum Bayar';
  const TOLERANCE = 1; // ±1 rupiah dianggap lunas (rounding)
  if (Math.abs(totalOS) <= TOLERANCE && totalPayment > 0) status = 'Lunas';
  else if (totalOS < -TOLERANCE) status = 'Lebih Bayar';
  else if (totalPayment > 0 && totalOS > TOLERANCE) status = 'Partial';
  else status = 'Belum Bayar';

  // Overdue: belum lunas + jarak > 30 hari (kalau belum bayar pakai today vs tanggalMenerima)
  let isOverdue = false;
  if (status !== 'Lunas' && status !== 'Lebih Bayar' && jarakTgl !== null && !ttf.tglPembayaran && jarakTgl > 30) {
    isOverdue = true;
  }

  return { btbs, totalInvoice, totalPayment, totalOS, jarakTgl, status, isOverdue };
};

const ROLES = [
  { id: 'super', label: 'Super Admin' },
  { id: 'logistic', label: 'Admin Logistic' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'finance', label: 'Finance' },
  { id: 'management', label: 'Management' },
];

const can = (role, action) => {
  const matrix = {
    super: ['view', 'create', 'edit', 'delete', 'shipment', 'finance', 'export', 'import', 'master'],
    logistic: ['view', 'shipment', 'export', 'create', 'edit'],
    procurement: ['view', 'export', 'edit'],
    finance: ['view', 'finance', 'export'],
    management: ['view', 'export'],
  };
  return matrix[role]?.includes(action);
};

const STORAGE_KEY = 'storbit-manifest:rows-v2';
const CUSTOMERS_KEY = 'storbit-manifest:customers-v1';
const AR_KEY = 'storbit-manifest:ar-v1';

const SEED_CUSTOMERS = [
  { id: 'cust-im', code: 'IM', name: 'INDOMARCO', defaultDC: 'DC JAKARTA', picName: '', picEmail: '', active: true },
  { id: 'cust-ig', code: 'IG', name: 'INDOGROSIR', defaultDC: 'DC BOGOR', picName: '', picEmail: '', active: true },
  { id: 'cust-imt', code: 'IMT', name: 'INDOMARET', defaultDC: '', picName: '', picEmail: '', active: true },
  { id: 'cust-mac', code: 'MAC', name: 'MAC', defaultDC: '', picName: '', picEmail: '', active: true },
  { id: 'cust-int', code: 'INT', name: 'INTERNAL', defaultDC: '', picName: '', picEmail: '', active: true },
];

const SEED_AR = [
  {
    id: 'ar-1', noTTF: '25E0011001163', tanggalTTF: '2025-10-21', tanggalMenerima: '2025-10-24',
    noINV: 'JKT-251001', noSP: '1881279', customer: 'INDOMARET',
    tglPembayaran: '2025-12-10', notes: '',
    btbs: [
      { id: 'btb-1', noBTB: '2025-BTB-1773702-NEW', dppPPN: 7988392.50, pph: 0, payment: 7988392.50 },
      { id: 'btb-2', noBTB: '2025-BTB-1774099-NEW', dppPPN: 14224261.50, pph: 0, payment: 14224261.50 },
      { id: 'btb-3', noBTB: '2025-BTB-1781382-NEW', dppPPN: 5863797, pph: 0, payment: 5863797 },
      { id: 'btb-4', noBTB: '2025-BTB-1785309-NEW', dppPPN: 9441882, pph: 0, payment: 9441882 },
      { id: 'btb-5', noBTB: '2025-BTB-1798736-NEW', dppPPN: 6739251.75, pph: 0, payment: 6739251.75 },
    ]
  },
  {
    id: 'ar-2', noTTF: '25E0011003859', tanggalTTF: '2025-10-27', tanggalMenerima: '2025-10-30',
    noINV: 'JKT-251007', noSP: '1908017', customer: 'INDOMARET',
    tglPembayaran: '2025-12-17', notes: 'Selisih rounding kecil',
    btbs: [
      { id: 'btb-6', noBTB: '2025-BTB-1803540-NEW', dppPPN: 3159338, pph: 0, payment: 3159337.50 },
      { id: 'btb-7', noBTB: '2025-BTB-1803532-NEW', dppPPN: 19259277, pph: 0, payment: 19259277 },
      { id: 'btb-8', noBTB: '2025-BTB-1788518-NEW', dppPPN: 11516639, pph: 0, payment: 11516638.50 },
    ]
  },
  {
    id: 'ar-3', noTTF: '25E0011015568', tanggalTTF: '2025-11-21', tanggalMenerima: '2025-11-24',
    noINV: 'JKT-251108', noSP: '1881821', customer: 'INDOMARET',
    tglPembayaran: '', notes: 'Belum dibayar',
    btbs: [
      { id: 'btb-9', noBTB: '2025-BTB-1835501-NEW', dppPPN: 18168480, pph: 0, payment: 0 },
      { id: 'btb-10', noBTB: '2025-BTB-1835502-NEW', dppPPN: 353047, pph: 6361, payment: 0 },
    ]
  },
  {
    id: 'ar-4', noTTF: '25E0011018825', tanggalTTF: '2025-11-26', tanggalMenerima: '2025-12-03',
    noINV: 'JKT-251111', noSP: '1881825', customer: 'INDOGROSIR',
    tglPembayaran: '2026-01-14', notes: '',
    btbs: [
      { id: 'btb-11', noBTB: '2025-BTB-1841781-NEW', dppPPN: 33894940, pph: 0, payment: 33894960 },
      { id: 'btb-12', noBTB: '2025-BTB-1841782-NEW', dppPPN: 695232, pph: 12527, payment: 682705.15 },
    ]
  },
  {
    id: 'ar-5', noTTF: '25E0011022695', tanggalTTF: '2025-12-07', tanggalMenerima: '2025-12-10',
    noINV: 'JKT-251202', noSP: '1942534', customer: 'INDOMARCO',
    tglPembayaran: '', notes: '',
    btbs: [
      { id: 'btb-13', noBTB: '2025-BTB-1846675-NEW', dppPPN: 74680249, pph: 0, payment: 0 },
      { id: 'btb-14', noBTB: '2025-BTB-1848953-NEW', dppPPN: 70818000, pph: 0, payment: 0 },
    ]
  },
];

// ============================
// Main App
// ============================
export default function StorbitManifest() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [arData, setArData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const { role: authRole, profile, signOut } = useAuth();
  const role = authRole || 'management';
  const [editingRow, setEditingRow] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingAR, setEditingAR] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddAR, setShowAddAR] = useState(false);
  const [viewingSP, setViewingSP] = useState(null);
  const [viewingAR, setViewingAR] = useState(null);
  const [shipmentRow, setShipmentRow] = useState(null);
  const [financeRow, setFinanceRow] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDC, setFilterDC] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [sortBy, setSortBy] = useState({ field: 'spDate', dir: 'desc' });

  // AR-specific filters
  const [arFilterCustomer, setArFilterCustomer] = useState('all');
  const [arFilterStatus, setArFilterStatus] = useState('all');
  const [arSearch, setArSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [rowsResult, custResult, arResult] = await Promise.all([
          window.storage.get(STORAGE_KEY).catch(() => null),
          window.storage.get(CUSTOMERS_KEY).catch(() => null),
          window.storage.get(AR_KEY).catch(() => null),
        ]);

        if (rowsResult && rowsResult.value) {
          setRows(JSON.parse(rowsResult.value));
        } else {
          setRows(SEED_DATA);
          await window.storage.set(STORAGE_KEY, JSON.stringify(SEED_DATA)).catch(()=>{});
        }

        if (custResult && custResult.value) {
          setCustomers(JSON.parse(custResult.value));
        } else {
          setCustomers(SEED_CUSTOMERS);
          await window.storage.set(CUSTOMERS_KEY, JSON.stringify(SEED_CUSTOMERS)).catch(()=>{});
        }

        if (arResult && arResult.value) {
          setArData(JSON.parse(arResult.value));
        } else {
          setArData(SEED_AR);
          await window.storage.set(AR_KEY, JSON.stringify(SEED_AR)).catch(()=>{});
        }
      } catch (e) {
        setRows(SEED_DATA);
        setCustomers(SEED_CUSTOMERS);
        setArData(SEED_AR);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (newRows) => {
    setRows(newRows);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(newRows)); }
    catch (e) { showToast('Gagal menyimpan data', 'error'); }
  };

  const persistCustomers = async (newCust) => {
    setCustomers(newCust);
    try { await window.storage.set(CUSTOMERS_KEY, JSON.stringify(newCust)); }
    catch (e) { showToast('Gagal menyimpan customer', 'error'); }
  };

  const persistAR = async (newAR) => {
    setArData(newAR);
    try { await window.storage.set(AR_KEY, JSON.stringify(newAR)); }
    catch (e) { showToast('Gagal menyimpan AR', 'error'); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // ============================
  // Derived
  // ============================
  const enrichedRows = useMemo(() =>
    rows.map(r => ({ ...r, ...calcRow(r) }))
  , [rows]);

  const groupedSP = useMemo(() => groupBySP(rows), [rows]);

  const dcList = useMemo(() => {
    const set = new Set(rows.map(r => r.dc).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const monthList = useMemo(() => {
    const set = new Set(rows.map(r => monthYearKey(r.spDate)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [rows]);

  const filteredSP = useMemo(() => {
    let out = groupedSP;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(g =>
        g.spNo.toLowerCase().includes(q) ||
        g.items.some(i =>
          i.productName?.toLowerCase().includes(q) ||
          i.sku?.toLowerCase().includes(q) ||
          i.btbNo?.toLowerCase().includes(q)
        )
      );
    }
    if (filterStatus !== 'all') out = out.filter(g => g.status === filterStatus);
    if (filterDC !== 'all') out = out.filter(g => g.dc === filterDC);
    if (filterCustomer !== 'all') out = out.filter(g => g.customer === filterCustomer);
    if (filterMonth !== 'all') out = out.filter(g => monthYearKey(g.spDate) === filterMonth);
    if (filterOverdue) out = out.filter(g => g.isOverdue);

    out = [...out].sort((a, b) => {
      const av = a[sortBy.field] ?? '';
      const bv = b[sortBy.field] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortBy.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortBy.dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [groupedSP, search, filterStatus, filterDC, filterCustomer, filterMonth, filterOverdue, sortBy]);

  const filteredRows = useMemo(() => {
    if (filterMonth === 'all') return enrichedRows;
    return enrichedRows.filter(r => monthYearKey(r.spDate) === filterMonth);
  }, [enrichedRows, filterMonth]);

  // ============================
  // Stats
  // ============================
  const stats = useMemo(() => {
    const filteredGrouped = filterMonth === 'all'
      ? groupedSP
      : groupedSP.filter(g => monthYearKey(g.spDate) === filterMonth);

    const totalSP = filteredGrouped.length;
    const open = filteredGrouped.filter(g => g.status === 'Open').length;
    const partial = filteredGrouped.filter(g => g.status === 'Partial').length;
    const closed = filteredGrouped.filter(g => g.status === 'Closed').length;
    const overdue = filteredGrouped.filter(g => g.isOverdue).length;

    const targetRows = filterMonth === 'all'
      ? enrichedRows
      : enrichedRows.filter(r => monthYearKey(r.spDate) === filterMonth);

    const outstandingQty = targetRows.reduce((s, r) => s + r.outstandingQty, 0);
    const totalTrx = targetRows.reduce((s, r) => s + r.total, 0);
    const totalPPN = targetRows.reduce((s, r) => s + r.ppn, 0);
    const grandTotal = targetRows.reduce((s, r) => s + r.grandTotal, 0);

    const finPending = targetRows.filter(r => !r.inv || !r.fp || !r.submit || !r.kirim).length;
    const invPending = targetRows.filter(r => !r.inv).length;
    const fpPending = targetRows.filter(r => !r.fp).length;
    const submitPending = targetRows.filter(r => !r.submit).length;
    const kirimPending = targetRows.filter(r => !r.kirim).length;

    const byDC = {};
    filteredGrouped.forEach(g => {
      const k = g.dc || 'Unknown';
      byDC[k] = (byDC[k] || 0) + 1;
    });

    const byCustomer = {};
    filteredGrouped.forEach(g => {
      const k = g.customer || 'Unassigned';
      if (!byCustomer[k]) byCustomer[k] = { count: 0, value: 0 };
      byCustomer[k].count++;
      byCustomer[k].value += g.grandTotal;
    });

    // Monthly trend (always full data, regardless of filter)
    const monthly = {};
    enrichedRows.forEach(r => {
      const k = monthYearKey(r.spDate);
      if (!k) return;
      if (!monthly[k]) monthly[k] = { month: k, transaksi: 0, ppn: 0, grandTotal: 0, count: 0 };
      monthly[k].transaksi += r.total;
      monthly[k].ppn += r.ppn;
      monthly[k].grandTotal += r.grandTotal;
    });
    // Count unique SPs per month
    const monthlySPSet = {};
    groupedSP.forEach(g => {
      const k = monthYearKey(g.spDate);
      if (!k) return;
      if (!monthlySPSet[k]) monthlySPSet[k] = 0;
      monthlySPSet[k]++;
    });
    Object.keys(monthly).forEach(k => { monthly[k].count = monthlySPSet[k] || 0; });
    const monthlyArr = Object.values(monthly).sort((a,b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, label: monthLabelShort(m.month) }));

    return {
      totalSP, open, partial, closed, overdue, outstandingQty,
      totalTrx, totalPPN, grandTotal,
      finPending, invPending, fpPending, submitPending, kirimPending,
      byDC, byCustomer, monthly: monthlyArr
    };
  }, [groupedSP, enrichedRows, filterMonth]);

  // ============================
  // Handlers
  // ============================
  const handleSave = async (data) => {
    let newRows;
    if (data.id && rows.find(r => r.id === data.id)) {
      newRows = rows.map(r => r.id === data.id ? { ...r, ...data } : r);
      showToast('Data berhasil diupdate ✨');
    } else {
      const newRow = { ...data, id: data.id || `row-${Date.now()}-${Math.random().toString(36).slice(2,7)}` };
      newRows = [newRow, ...rows];
      showToast('Data berhasil ditambahkan ✨');
    }
    await persist(newRows);
    setEditingRow(null);
    setShipmentRow(null);
    setFinanceRow(null);
    setShowAdd(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Yakin hapus item ini?')) return;
    const newRows = rows.filter(r => r.id !== id);
    await persist(newRows);
    showToast('Item dihapus');
  };

  const handleDeleteSP = async (spNo) => {
    if (!confirm(`Yakin hapus seluruh SP ${spNo}? Semua item akan terhapus.`)) return;
    const newRows = rows.filter(r => r.spNo !== spNo);
    await persist(newRows);
    setViewingSP(null);
    showToast(`SP ${spNo} dihapus`);
  };

  const handleImport = async (importedRows) => {
    const withIds = importedRows.map(r => ({ ...r, id: `imp-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }));
    await persist([...withIds, ...rows]);
    showToast(`${withIds.length} baris berhasil diimport`);
    setShowImport(false);
  };

  const handleSaveCustomer = async (data) => {
    let next;
    if (data.id && customers.find(c => c.id === data.id)) {
      next = customers.map(c => c.id === data.id ? { ...c, ...data } : c);
      showToast('Customer berhasil diupdate ✨');
    } else {
      const newC = { ...data, id: data.id || `cust-${Date.now()}-${Math.random().toString(36).slice(2,5)}` };
      next = [...customers, newC];
      showToast('Customer berhasil ditambahkan ✨');
    }
    await persistCustomers(next);
    setEditingCustomer(null);
    setShowAddCustomer(false);
  };

  const handleDeleteCustomer = async (id) => {
    const cust = customers.find(c => c.id === id);
    if (!cust) return;
    const used = rows.some(r => r.customer === cust.name);
    if (used) {
      alert(`Customer "${cust.name}" masih dipakai di SP. Tidak bisa dihapus.`);
      return;
    }
    if (!confirm(`Yakin hapus customer "${cust.name}"?`)) return;
    await persistCustomers(customers.filter(c => c.id !== id));
    showToast('Customer dihapus');
  };

  const handleSaveAR = async (data) => {
    let next;
    if (data.id && arData.find(a => a.id === data.id)) {
      next = arData.map(a => a.id === data.id ? { ...a, ...data } : a);
      showToast('AR data berhasil diupdate ✨');
    } else {
      const newAR = { ...data, id: data.id || `ar-${Date.now()}-${Math.random().toString(36).slice(2,5)}` };
      next = [newAR, ...arData];
      showToast('AR data berhasil ditambahkan ✨');
    }
    await persistAR(next);
    setEditingAR(null);
    setShowAddAR(false);
  };

  const handleDeleteAR = async (id) => {
    const ttf = arData.find(a => a.id === id);
    if (!ttf) return;
    if (!confirm(`Yakin hapus TTF ${ttf.noTTF}? Beserta ${ttf.btbs?.length || 0} BTB items.`)) return;
    await persistAR(arData.filter(a => a.id !== id));
    setViewingAR(null);
    showToast('TTF dihapus');
  };

  const handleResetData = async () => {
    if (!confirm('Reset semua data ke contoh awal?')) return;
    await persist(SEED_DATA);
    showToast('Data direset ke contoh awal');
  };

  const handleClearAll = async () => {
    if (!confirm('Hapus SEMUA data? Tindakan ini tidak bisa dibatalkan.')) return;
    await persist([]);
    showToast('Semua data terhapus');
  };

  const exportCSV = () => {
    const headers = ['SP DATE','SP NO','Product Name','SKU','QTY','SHIPPED QTY','OUTSTANDING QTY','EXP Date','Deadline','STATUS','DC','Shipping Date','BTB NO','Unit Price','Shipping Price','TOTAL','PPN','GRAND TOTAL','INV','FP','SUBMIT','KIRIM','SUBMIT DATE','Email Status','Notes'];
    const lines = [headers.join(',')];
    enrichedRows.forEach(r => {
      const cells = [
        r.spDate, r.spNo, `"${r.productName||''}"`, r.sku, r.qty, r.shippedQty, r.outstandingQty,
        r.expDate||'', r.deadline||'', r.status, r.dc||'', r.shippingDate||'', r.btbNo||'',
        r.unitPrice, r.shippingPrice, r.total, r.ppn, r.grandTotal,
        r.inv?'TRUE':'FALSE', r.fp?'TRUE':'FALSE', r.submit?'TRUE':'FALSE', r.kirim?'TRUE':'FALSE',
        r.submitDate||'', r.emailStatus||'', `"${(r.notes||'').replace(/"/g,'""')}"`
      ];
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storbit-manifest-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV berhasil diexport ⬇');
  };

  const viewingSPGroup = viewingSP ? groupedSP.find(g => g.spNo === viewingSP) : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PASTEL.cream }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: PASTEL.peach }}>
            <Sparkles size={28} style={{ color: PASTEL.peachDeep }}/>
          </div>
          <div className="text-sm tracking-wider" style={{ fontFamily: 'Fraunces, serif', color: PASTEL.inkSoft }}>Loading manifest...</div>
        </div>
      </div>
    );
  }

  const menus = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'manifest', label: 'SP Manifest', icon: FileText },
    { id: 'input', label: 'Input', icon: Plus, role: ['super','logistic'] },
    { id: 'shipment', label: 'Shipment', icon: Truck, role: ['super','logistic'] },
    { id: 'finance', label: 'Finance', icon: Wallet, role: ['super','finance'] },
    { id: 'outstanding', label: 'Outstanding', icon: Clock, role: ['super','finance','management'] },
    { id: 'ar', label: 'AR Tracker', icon: Wallet, role: ['super','finance'] },
    { id: 'customers', label: 'Customers', icon: Building2, role: ['super'] },
  ];

  const visibleMenus = menus.filter(m => !m.role || m.role.includes(role));

  return (
    <div className="min-h-screen" style={{ background: PASTEL.cream, color: PASTEL.ink, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        .font-display { font-family: 'Fraunces', serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
        .font-numeric { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.025em; font-feature-settings: 'tnum'; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: ${PASTEL.lineSoft}; }
        ::-webkit-scrollbar-thumb { background: ${PASTEL.line}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${PASTEL.inkMute}; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-in { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>

      {/* LAYOUT: Sidebar + Content */}
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden md:flex flex-col w-64 sticky top-0 h-screen border-r" style={{ background: 'white', borderColor: PASTEL.line }}>
          {/* Brand */}
          <div className="px-6 py-6 border-b" style={{ borderColor: PASTEL.line }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${PASTEL.peach}, ${PASTEL.rose})` }}>
                <Package size={20} style={{ color: PASTEL.ink }} strokeWidth={2}/>
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-xl font-semibold tracking-tight">storbit</h1>
                <p className="text-[9px] tracking-[0.18em] uppercase font-medium truncate" style={{ color: PASTEL.inkMute }}>manifest · ops</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto">
            <div className="text-[9px] uppercase tracking-[0.2em] font-semibold px-3 mb-2" style={{ color: PASTEL.inkMute }}>Menu</div>
            {visibleMenus.map(m => {
              const Icon = m.icon;
              const active = activeMenu === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveMenu(m.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-0.5 transition-all"
                  style={{
                    background: active ? PASTEL.peach : 'transparent',
                    color: active ? PASTEL.ink : PASTEL.inkSoft,
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = PASTEL.lineSoft; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon size={16} strokeWidth={active ? 2.4 : 2}/>
                  <span className="flex-1 text-left">{m.label}</span>
                  {active && <div className="w-1.5 h-1.5 rounded-full" style={{ background: PASTEL.peachDeep }}/>}
                </button>
              );
            })}

            {/* Quick stats in sidebar */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: PASTEL.line }}>
              <div className="text-[9px] uppercase tracking-[0.2em] font-semibold px-3 mb-2" style={{ color: PASTEL.inkMute }}>Quick Stats</div>
              <div className="px-3 py-3 rounded-2xl space-y-2.5" style={{ background: PASTEL.lineSoft }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: PASTEL.inkSoft }}>Total SP</span>
                  <span className="font-numeric text-sm font-bold">{groupedSP.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: PASTEL.inkSoft }}>Items</span>
                  <span className="font-numeric text-sm font-bold">{rows.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: PASTEL.inkSoft }}>Open</span>
                  <span className="font-numeric text-sm font-bold" style={{ color: PASTEL.skyDeep }}>{groupedSP.filter(g=>g.status==='Open').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: PASTEL.inkSoft }}>Overdue</span>
                  <span className="font-numeric text-sm font-bold" style={{ color: groupedSP.filter(g=>g.isOverdue).length > 0 ? PASTEL.roseDeep : PASTEL.inkMute }}>{groupedSP.filter(g=>g.isOverdue).length}</span>
                </div>
              </div>
            </div>
          </nav>

          {/* Footer: User + logout */}
          <div className="px-4 py-4 border-t" style={{ borderColor: PASTEL.line }}>
            <div className="text-[9px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: PASTEL.inkMute }}>Logged in as</div>
            <div className="rounded-2xl p-3" style={{ background: PASTEL.lineSoft }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: PASTEL.lavender }}>
                  <User size={13} style={{ color: PASTEL.lavenderDeep }}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: PASTEL.ink }}>
                    {profile?.full_name || 'User'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: PASTEL.inkMute }}>
                    {ROLES.find(r => r.id === role)?.label || role}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: PASTEL.inkSoft }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: PASTEL.mintDeep }}/>
                  Active
                </div>
                <button
                  onClick={signOut}
                  className="text-[10px] font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity"
                  style={{ color: PASTEL.roseDeep }}
                  title="Logout"
                >
                  <LogOut size={11}/>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* MOBILE TOPBAR */}
        <header className="md:hidden sticky top-0 z-30 border-b backdrop-blur w-full" style={{ borderColor: PASTEL.line, background: 'rgba(250, 246, 240, 0.92)' }}>
          <div className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${PASTEL.peach}, ${PASTEL.rose})` }}>
                <Package size={18} style={{ color: PASTEL.ink }} strokeWidth={2}/>
              </div>
              <h1 className="font-display text-lg font-semibold">storbit</h1>
            </div>
            <button
              onClick={signOut}
              className="border rounded-full px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5"
              style={{ background: 'white', borderColor: PASTEL.line, color: PASTEL.ink }}
              title={`${profile?.full_name || 'User'} · ${ROLES.find(r => r.id === role)?.label || role}`}
            >
              <LogOut size={11}/>
              Logout
            </button>
          </div>
          <nav className="px-3 pb-2 flex items-center gap-1 overflow-x-auto">
            {visibleMenus.map(m => {
              const Icon = m.icon;
              const active = activeMenu === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveMenu(m.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
                  style={{
                    background: active ? PASTEL.peach : 'transparent',
                    color: active ? PASTEL.ink : PASTEL.inkSoft,
                  }}
                >
                  <Icon size={13}/>{m.label}
                </button>
              );
            })}
          </nav>
        </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0 px-6 md:px-10 py-8 max-w-[1400px]">
          {/* Page section header with month filter */}
          {(activeMenu === 'dashboard' || activeMenu === 'manifest') && (
            <div className="mb-6 flex items-center gap-2 flex-wrap">
              <Calendar size={14} style={{ color: PASTEL.inkMute }}/>
              <span className="text-xs uppercase tracking-widest font-medium" style={{ color: PASTEL.inkMute }}>Period:</span>
              <button
                onClick={() => setFilterMonth('all')}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: filterMonth === 'all' ? PASTEL.ink : 'white',
                  color: filterMonth === 'all' ? PASTEL.cream : PASTEL.ink,
                  border: `1px solid ${filterMonth === 'all' ? PASTEL.ink : PASTEL.line}`
                }}
              >
              All Time
            </button>
            {monthList.map(m => (
              <button
                key={m}
                onClick={() => setFilterMonth(m)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: filterMonth === m ? PASTEL.ink : 'white',
                  color: filterMonth === m ? PASTEL.cream : PASTEL.ink,
                  border: `1px solid ${filterMonth === m ? PASTEL.ink : PASTEL.line}`
                }}
              >
                {monthLabel(m)}
              </button>
            ))}
          </div>
        )}

          {activeMenu === 'dashboard' && <Dashboard stats={stats} groupedSP={filterMonth === 'all' ? groupedSP : groupedSP.filter(g => monthYearKey(g.spDate) === filterMonth)} filterMonth={filterMonth}/>}
          {activeMenu === 'manifest' && (
            <Manifest
              grouped={filteredSP}
              allCount={groupedSP.length}
              search={search} setSearch={setSearch}
              filterStatus={filterStatus} setFilterStatus={setFilterStatus}
              filterDC={filterDC} setFilterDC={setFilterDC}
              filterCustomer={filterCustomer} setFilterCustomer={setFilterCustomer}
              filterOverdue={filterOverdue} setFilterOverdue={setFilterOverdue}
              dcList={dcList}
              customers={customers}
              sortBy={sortBy} setSortBy={setSortBy}
              onView={(spNo) => setViewingSP(spNo)}
              onExport={exportCSV}
            />
          )}
          {activeMenu === 'input' && (
            <InputPage
              onAdd={() => setShowAdd(true)}
              onImport={() => setShowImport(true)}
              onReset={handleResetData}
              onClear={handleClearAll}
              rowCount={rows.length}
              spCount={groupedSP.length}
            />
          )}
          {activeMenu === 'shipment' && (
            <ShipmentPage rows={enrichedRows} onUpdate={(r) => can(role,'shipment') && setShipmentRow(r)} role={role}/>
          )}
          {activeMenu === 'finance' && (
            <FinancePage rows={enrichedRows} onUpdate={(r) => can(role,'finance') && setFinanceRow(r)} role={role}/>
          )}
          {activeMenu === 'outstanding' && (
            <OutstandingPage rows={enrichedRows} onUpdate={(r) => can(role,'finance') && setFinanceRow(r)} role={role}/>
          )}
          {activeMenu === 'customers' && (
            <CustomersPage
              customers={customers}
              rows={rows}
              dcList={dcList}
              onAdd={() => setShowAddCustomer(true)}
              onEdit={(c) => setEditingCustomer(c)}
              onDelete={handleDeleteCustomer}
              role={role}
            />
          )}
          {activeMenu === 'ar' && (
            <ARTrackerPage
              arData={arData}
              customers={customers}
              filterCustomer={arFilterCustomer} setFilterCustomer={setArFilterCustomer}
              filterStatus={arFilterStatus} setFilterStatus={setArFilterStatus}
              search={arSearch} setSearch={setArSearch}
              onAdd={() => setShowAddAR(true)}
              onView={(ttf) => setViewingAR(ttf)}
              role={role}
            />
          )}
        </main>
      </div>

      {/* SIDE PANEL - SP Detail */}
      {viewingSPGroup && (
        <SPSidePanel
          group={viewingSPGroup}
          onClose={() => setViewingSP(null)}
          onEditItem={(item) => can(role,'edit') && setEditingRow(item)}
          onDeleteItem={(id) => can(role,'delete') && handleDelete(id)}
          onDeleteSP={() => can(role,'delete') && handleDeleteSP(viewingSP)}
          onShipment={(item) => can(role,'shipment') && setShipmentRow(item)}
          onFinance={(item) => can(role,'finance') && setFinanceRow(item)}
          role={role}
        />
      )}

      {/* MODALS */}
      {(editingRow || showAdd) && (
        <FormModal
          initial={editingRow}
          customers={customers}
          onClose={() => { setEditingRow(null); setShowAdd(false); }}
          onSave={handleSave}
        />
      )}
      {(editingCustomer || showAddCustomer) && (
        <CustomerModal
          initial={editingCustomer}
          existingCustomers={customers}
          dcList={dcList}
          onClose={() => { setEditingCustomer(null); setShowAddCustomer(false); }}
          onSave={handleSaveCustomer}
        />
      )}
      {viewingAR && (
        <ARSidePanel
          ttf={viewingAR}
          onClose={() => setViewingAR(null)}
          onEdit={() => { setEditingAR(viewingAR); setViewingAR(null); }}
          onDelete={() => handleDeleteAR(viewingAR.id)}
          role={role}
        />
      )}
      {(editingAR || showAddAR) && (
        <ARModal
          initial={editingAR}
          customers={customers}
          onClose={() => { setEditingAR(null); setShowAddAR(false); }}
          onSave={handleSaveAR}
        />
      )}
      {shipmentRow && <ShipmentModal row={shipmentRow} onClose={() => setShipmentRow(null)} onSave={handleSave}/>}
      {financeRow && <FinanceModal row={financeRow} onClose={() => setFinanceRow(null)} onSave={handleSave}/>}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport}/>}

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] px-5 py-3 rounded-2xl shadow-xl text-sm font-medium animate-slide-up"
          style={{
            background: toast.type === 'error' ? PASTEL.rose : PASTEL.mint,
            color: PASTEL.ink,
            border: `1px solid ${toast.type === 'error' ? PASTEL.roseDeep : PASTEL.mintDeep}`
          }}>
          <div className="flex items-center gap-2">
            {toast.type === 'error' ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================
// Dashboard
// ============================
function Dashboard({ stats, groupedSP, filterMonth }) {
  const recent = [...groupedSP].sort((a,b) => (b.spDate||'').localeCompare(a.spDate||'')).slice(0,5);

  // Pie data for status
  const pieData = [
    { name: 'Open', value: stats.open, color: PASTEL.skyDeep },
    { name: 'Partial', value: stats.partial, color: PASTEL.butterDeep },
    { name: 'Closed', value: stats.closed, color: PASTEL.mintDeep },
  ].filter(d => d.value > 0);

  // Pie data for finance
  const financePieData = [
    { name: 'Invoice Pending', value: stats.invPending, color: PASTEL.peachDeep },
    { name: 'FP Pending', value: stats.fpPending, color: PASTEL.lavenderDeep },
    { name: 'Submit Pending', value: stats.submitPending, color: PASTEL.butterDeep },
    { name: 'Kirim Pending', value: stats.kirimPending, color: PASTEL.roseDeep },
  ].filter(d => d.value > 0);

  // DC bar data
  const dcData = Object.entries(stats.byDC).sort((a,b) => b[1]-a[1]).map(([name, value]) => ({ name, value }));

  const customerColors = [PASTEL.peachDeep, PASTEL.lavenderDeep, PASTEL.mintDeep, PASTEL.butterDeep, PASTEL.roseDeep, PASTEL.skyDeep];
  const customerCountData = Object.entries(stats.byCustomer || {})
    .sort((a,b) => b[1].count - a[1].count)
    .map(([name, v], i) => ({ name, value: v.count, color: customerColors[i % customerColors.length] }));
  const customerValueData = Object.entries(stats.byCustomer || {})
    .sort((a,b) => b[1].value - a[1].value)
    .map(([name, v], i) => ({ name, value: v.value, color: customerColors[i % customerColors.length] }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Operations Overview</h2>
          <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>
            {filterMonth === 'all' ? 'Showing all-time data' : `Showing ${monthLabel(filterMonth)}`} · monitoring SP, shipment, finance
          </p>
        </div>
      </div>

      {/* TOP KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total SP" value={stats.totalSP} icon={FileText} color={PASTEL.peach} accent={PASTEL.peachDeep}/>
        <KPICard label="Open" value={stats.open} icon={Package} color={PASTEL.sky} accent={PASTEL.skyDeep}/>
        <KPICard label="Partial" value={stats.partial} icon={Clock} color={PASTEL.butter} accent={PASTEL.butterDeep}/>
        <KPICard label="Closed" value={stats.closed} icon={CheckCircle2} color={PASTEL.mint} accent={PASTEL.mintDeep}/>
      </div>

      {/* Financial cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FinancialCard label="Total Transaksi" value={stats.totalTrx} bg={PASTEL.lavender}/>
        <FinancialCard label="Total PPN (11%)" value={stats.totalPPN} bg={PASTEL.sky}/>
        <FinancialCard label="Grand Total" value={stats.grandTotal} bg={PASTEL.mint} highlight/>
      </div>

      {/* Charts row 1: Pie status + Pie finance + DC bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Status Distribution" subtitle="Breakdown SP berdasarkan status">
          {pieData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip content={<CustomTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }}/>
                <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                <span className="font-mono font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Finance Pending" subtitle="Dokumen yang masih outstanding">
          {financePieData.length === 0 ? (
            <div className="h-[240px] flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-2" style={{ background: PASTEL.mint }}>
                <CheckCircle2 size={24} style={{ color: PASTEL.mintDeep }}/>
              </div>
              <div className="text-sm" style={{ color: PASTEL.inkSoft }}>All documents complete ✨</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={financePieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {financePieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip content={<CustomTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {financePieData.map(d => (
              <div key={d.name} className="flex items-center gap-1 text-[11px]">
                <div className="w-2 h-2 rounded-full" style={{ background: d.color }}/>
                <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                <span className="font-mono font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Order by DC" subtitle="Distribusi order per distribution center">
          {dcData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dcData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} horizontal={false}/>
                <XAxis type="number" stroke={PASTEL.inkMute} fontSize={10} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" stroke={PASTEL.inkSoft} fontSize={10} width={80} tickLine={false} axisLine={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="value" fill={PASTEL.peachDeep} radius={[0, 8, 8, 0]} barSize={18}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Customer charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Order by Customer" subtitle="Jumlah SP per customer">
          {customerCountData.length === 0 ? <EmptyChart text="No data"/> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={customerCountData} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} vertical={false}/>
                <XAxis dataKey="name" stroke={PASTEL.inkSoft} fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis stroke={PASTEL.inkMute} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="value" fill={PASTEL.lavenderDeep} radius={[8, 8, 0, 0]} barSize={48}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue by Customer" subtitle="Total grand total per customer">
          {customerValueData.length === 0 ? <EmptyChart text="No data"/> : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={customerValueData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                  {customerValueData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip content={<CustomTooltip currency/>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {customerValueData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }}/>
                <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                <span className="font-numeric font-bold">{formatRupiahShort(d.value)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Monthly trend chart - full width */}
      <ChartCard title="Monthly Transaction Trend" subtitle="Trend nilai transaksi & PPN per bulan">
        {stats.monthly.length === 0 ? <EmptyChart text="No data"/> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stats.monthly} margin={{ left: 0, right: 10, top: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="grad-trx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PASTEL.lavenderDeep} stopOpacity={0.45}/>
                  <stop offset="100%" stopColor={PASTEL.lavenderDeep} stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="grad-grand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PASTEL.mintDeep} stopOpacity={0.45}/>
                  <stop offset="100%" stopColor={PASTEL.mintDeep} stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} vertical={false}/>
              <XAxis dataKey="label" stroke={PASTEL.inkMute} fontSize={11} tickLine={false} axisLine={false}/>
              <YAxis stroke={PASTEL.inkMute} fontSize={10} tickFormatter={formatRupiahShort} tickLine={false} axisLine={false}/>
              <Tooltip content={<CustomTooltip currency/>}/>
              <Area type="monotone" dataKey="transaksi" name="Total Transaksi" stroke={PASTEL.lavenderDeep} fillOpacity={1} fill="url(#grad-trx)" strokeWidth={2.5}/>
              <Area type="monotone" dataKey="grandTotal" name="Grand Total" stroke={PASTEL.mintDeep} fillOpacity={1} fill="url(#grad-grand)" strokeWidth={2.5}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Alerts & recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AlertCard
          label="Outstanding QTY" value={formatNumber(stats.outstandingQty)} sub="units belum terkirim"
          icon={Truck} bg={PASTEL.peach} accent={PASTEL.peachDeep}
        />
        <AlertCard
          label="Overdue SP" value={stats.overdue} sub="melewati deadline"
          icon={AlertTriangle}
          bg={stats.overdue > 0 ? PASTEL.rose : PASTEL.line}
          accent={stats.overdue > 0 ? PASTEL.roseDeep : PASTEL.inkMute}
        />
        <AlertCard
          label="Finance Pending" value={stats.finPending} sub="items perlu di-process"
          icon={Wallet} bg={PASTEL.lavender} accent={PASTEL.lavenderDeep}
        />
      </div>

      {/* Recent SP */}
      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: PASTEL.line }}>
          <div>
            <h3 className="font-display text-xl font-semibold">Recent SP</h3>
            <p className="text-xs mt-0.5" style={{ color: PASTEL.inkMute }}>5 SP terakhir</p>
          </div>
        </div>
        <div className="divide-y" style={{ borderColor: PASTEL.line }}>
          {recent.length === 0 && <div className="p-8 text-center text-sm" style={{ color: PASTEL.inkMute }}>Belum ada data</div>}
          {recent.map(g => (
            <div key={g.spNo} className="px-6 py-4 flex items-center gap-4 transition-colors hover:bg-opacity-50" style={{ background: 'white' }}>
              <StatusBadge status={g.status} overdue={g.isOverdue}/>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-medium">SP-{g.spNo}</div>
                <div className="text-xs truncate" style={{ color: PASTEL.inkMute }}>
                  {g.itemCount} {g.itemCount > 1 ? 'items' : 'item'} · {g.dc || 'No DC'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{formatRupiah(g.grandTotal)}</div>
                <div className="text-xs font-mono" style={{ color: PASTEL.inkMute }}>{formatDateID(g.spDate)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================
// Cards & atoms
// ============================
function KPICard({ label, value, icon: Icon, color, accent }) {
  return (
    <div className="rounded-3xl p-5 border transition-all hover:shadow-lg" style={{ background: 'white', borderColor: PASTEL.line }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>{label}</div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color }}>
          <Icon size={16} style={{ color: accent }}/>
        </div>
      </div>
      <div className="font-numeric text-4xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function FinancialCard({ label, value, bg, highlight }) {
  return (
    <div className="rounded-3xl p-6 border transition-all" style={{
      background: highlight ? `linear-gradient(135deg, ${bg}, white)` : 'white',
      borderColor: PASTEL.line,
      ...(highlight && { boxShadow: `0 0 0 1px ${PASTEL.mintDeep}40` })
    }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ background: bg }}/>
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>{label}</div>
      </div>
      <div className="font-numeric text-3xl font-bold tracking-tight">{formatRupiah(value)}</div>
    </div>
  );
}

function AlertCard({ label, value, sub, icon: Icon, bg, accent }) {
  return (
    <div className="rounded-3xl p-5 border" style={{ background: bg, borderColor: 'transparent' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold opacity-80" style={{ color: PASTEL.ink }}>{label}</div>
          <div className="font-numeric text-3xl font-bold mt-1.5" style={{ color: PASTEL.ink }}>{value}</div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.6)' }}>
          <Icon size={18} style={{ color: accent }}/>
        </div>
      </div>
      <div className="text-xs font-medium opacity-75" style={{ color: PASTEL.ink }}>{sub}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl p-5 border" style={{ background: 'white', borderColor: PASTEL.line }}>
      <div className="mb-3">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: PASTEL.inkMute }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ text }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm" style={{ color: PASTEL.inkMute }}>
      {text}
    </div>
  );
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="px-3 py-2 rounded-xl shadow-lg border text-xs" style={{ background: 'white', borderColor: PASTEL.line }}>
      {label && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }}/>
          <span style={{ color: PASTEL.inkSoft }}>{p.name}:</span>
          <span className="font-mono font-semibold">{currency ? formatRupiah(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status, overdue, large }) {
  const styles = {
    Open: { bg: PASTEL.sky, color: '#1F4D6B' },
    Partial: { bg: PASTEL.butter, color: '#7A5B12' },
    Closed: { bg: PASTEL.mint, color: '#1B5739' },
  };
  const s = styles[status] || styles.Open;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-full font-semibold tracking-wide ${large ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]'}`}
        style={{ background: s.bg, color: s.color }}
      >
        {status}
      </span>
      {overdue && (
        <span
          className={`rounded-full font-semibold tracking-wide ${large ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]'}`}
          style={{ background: PASTEL.rose, color: '#7A2240' }}
        >
          Overdue
        </span>
      )}
    </div>
  );
}

// ============================
// Manifest (grouped table)
// ============================
function Manifest({ grouped, allCount, search, setSearch, filterStatus, setFilterStatus, filterDC, setFilterDC, filterCustomer, setFilterCustomer, filterOverdue, setFilterOverdue, dcList, customers, sortBy, setSortBy, onView, onExport }) {
  const toggleSort = (field) => {
    if (sortBy.field === field) setSortBy({ field, dir: sortBy.dir === 'asc' ? 'desc' : 'asc' });
    else setSortBy({ field, dir: 'asc' });
  };

  const SortIcon = ({field}) => {
    if (sortBy.field !== field) return <ArrowUpDown size={11} style={{ opacity: 0.3 }}/>;
    return sortBy.dir === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/>;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">SP Manifest</h2>
          <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>{grouped.length} dari {allCount} SP</p>
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
          style={{ background: PASTEL.ink, color: PASTEL.cream }}
        >
          <Download size={14}/> Export CSV
        </button>
      </div>

      {/* Customer tabs (kategori SP) */}
      <div className="flex items-center gap-2 flex-wrap pb-1">
        <button
          onClick={() => setFilterCustomer('all')}
          className="px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all"
          style={{
            background: filterCustomer === 'all' ? PASTEL.ink : 'white',
            color: filterCustomer === 'all' ? PASTEL.cream : PASTEL.inkSoft,
            border: `1px solid ${filterCustomer === 'all' ? PASTEL.ink : PASTEL.line}`
          }}
        >
          All Customers
        </button>
        {customers.filter(c => c.active !== false).map(c => {
          const active = filterCustomer === c.name;
          const count = grouped.filter(g => g.customer === c.name).length;
          const allCount = c.name; // placeholder
          return (
            <button
              key={c.id}
              onClick={() => setFilterCustomer(c.name)}
              className="px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2"
              style={{
                background: active ? PASTEL.peach : 'white',
                color: active ? PASTEL.ink : PASTEL.inkSoft,
                border: `1px solid ${active ? PASTEL.peachDeep : PASTEL.line}`
              }}
            >
              <span>SP {c.name}</span>
              <span className="font-numeric font-bold px-1.5 py-0.5 rounded-md text-[10px]" style={{ background: active ? PASTEL.cream : PASTEL.lineSoft }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-3xl p-4 border flex flex-wrap items-center gap-3" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="relative flex-1 min-w-[260px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: PASTEL.inkMute }}/>
          <input
            type="text"
            placeholder="Cari SP, product, SKU, BTB..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none"
            style={{ background: PASTEL.cream, border: `1px solid ${PASTEL.line}` }}
          />
        </div>
        <FilterPill label="Status" value={filterStatus} onChange={setFilterStatus} options={[
          { v: 'all', l: 'All Status' },
          { v: 'Open', l: 'Open' },
          { v: 'Partial', l: 'Partial' },
          { v: 'Closed', l: 'Closed' },
        ]}/>
        <FilterPill label="DC" value={filterDC} onChange={setFilterDC} options={[
          { v: 'all', l: 'All DC' },
          ...dcList.map(d => ({ v: d, l: d }))
        ]}/>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-3 py-2">
          <input type="checkbox" checked={filterOverdue} onChange={e=>setFilterOverdue(e.target.checked)} className="rounded" style={{ accentColor: PASTEL.roseDeep }}/>
          <span>Overdue only</span>
        </label>
        {(search || filterStatus !== 'all' || filterDC !== 'all' || filterCustomer !== 'all' || filterOverdue) && (
          <button onClick={() => { setSearch(''); setFilterStatus('all'); setFilterDC('all'); setFilterCustomer('all'); setFilterOverdue(false); }}
            className="text-xs underline" style={{ color: PASTEL.inkMute }}>
            Clear
          </button>
        )}
      </div>

      {/* Table - 1 row per SP */}
      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: PASTEL.lineSoft }}>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold cursor-pointer" style={{ color: PASTEL.inkSoft }} onClick={()=>toggleSort('spDate')}>
                  <div className="flex items-center gap-1">SP Date <SortIcon field="spDate"/></div>
                </th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold cursor-pointer" style={{ color: PASTEL.inkSoft }} onClick={()=>toggleSort('spNo')}>
                  <div className="flex items-center gap-1">SP No <SortIcon field="spNo"/></div>
                </th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Customer</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Items</th>
                <th className="px-5 py-3.5 text-right text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Total Qty</th>
                <th className="px-5 py-3.5 text-right text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Outstanding</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Status</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>DC</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold cursor-pointer" style={{ color: PASTEL.inkSoft }} onClick={()=>toggleSort('deadline')}>
                  <div className="flex items-center gap-1">Deadline <SortIcon field="deadline"/></div>
                </th>
                <th className="px-5 py-3.5 text-right text-[10px] uppercase tracking-[0.15em] font-semibold cursor-pointer" style={{ color: PASTEL.inkSoft }} onClick={()=>toggleSort('grandTotal')}>
                  <div className="flex items-center justify-end gap-1">Grand Total <SortIcon field="grandTotal"/></div>
                </th>
                <th className="px-5 py-3.5 text-center text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Finance</th>
                <th className="px-5 py-3.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 && (
                <tr><td colSpan={12} className="text-center py-16 text-sm" style={{ color: PASTEL.inkMute }}>Tidak ada SP yang cocok</td></tr>
              )}
              {grouped.map(g => (
                <tr
                  key={g.spNo}
                  onClick={() => onView(g.spNo)}
                  className="cursor-pointer transition-colors border-t"
                  style={{
                    borderColor: PASTEL.line,
                    background: g.isOverdue ? `${PASTEL.rose}25` : 'white'
                  }}
                  onMouseEnter={(e) => { if (!g.isOverdue) e.currentTarget.style.background = PASTEL.lineSoft; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = g.isOverdue ? `${PASTEL.rose}25` : 'white'; }}
                >
                  <td className="px-5 py-4 text-xs font-mono whitespace-nowrap" style={{ color: PASTEL.inkSoft }}>{formatDateID(g.spDate)}</td>
                  <td className="px-5 py-4 font-mono font-semibold whitespace-nowrap">{g.spNo}</td>
                  <td className="px-5 py-4">
                    {g.customer ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>
                        {g.customer}
                      </span>
                    ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>
                      {g.itemCount} {g.itemCount > 1 ? 'items' : 'item'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-mono">{formatNumber(g.totalQty)}</td>
                  <td className="px-5 py-4 text-right font-mono font-semibold" style={{ color: g.totalOutstanding > 0 ? PASTEL.peachDeep : PASTEL.mintDeep }}>
                    {formatNumber(g.totalOutstanding)}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={g.status} overdue={g.isOverdue}/></td>
                  <td className="px-5 py-4 text-xs" style={{ color: PASTEL.inkSoft }}>{g.dc || '-'}</td>
                  <td className="px-5 py-4 text-xs font-mono whitespace-nowrap" style={{ color: PASTEL.inkSoft }}>{formatDateID(g.deadline)}</td>
                  <td className="px-5 py-4 text-right font-semibold whitespace-nowrap">{formatRupiah(g.grandTotal)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: PASTEL.line }}>
                        <div className="h-full transition-all" style={{ width: `${g.financePct}%`, background: g.financePct === 100 ? PASTEL.mintDeep : PASTEL.lavenderDeep }}/>
                      </div>
                      <span className="text-[10px] font-mono w-8" style={{ color: PASTEL.inkMute }}>{Math.round(g.financePct)}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <ChevronRight size={16} style={{ color: PASTEL.inkMute }}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px]" style={{ color: PASTEL.inkMute }}>
        Klik baris SP untuk melihat detail item · status overall: All closed → Closed · All open → Open · Mix → Partial
      </div>
    </div>
  );
}

function FilterPill({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded-full px-4 py-2 text-sm font-medium cursor-pointer focus:outline-none"
      style={{ background: PASTEL.cream, border: `1px solid ${PASTEL.line}`, color: PASTEL.ink }}
    >
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

// ============================
// SP Side Panel (slide-in)
// ============================
function SPSidePanel({ group, onClose, onEditItem, onDeleteItem, onDeleteSP, onShipment, onFinance, role }) {
  return (
    <>
      <div className="fixed inset-0 z-40 animate-fade-in" style={{ background: 'rgba(45, 42, 40, 0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}/>
      <div className="fixed top-0 right-0 bottom-0 w-full md:w-[640px] z-50 overflow-y-auto animate-slide-in shadow-2xl" style={{ background: PASTEL.cream }}>
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-5 border-b backdrop-blur" style={{ borderColor: PASTEL.line, background: 'rgba(250, 246, 240, 0.92)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={onClose} className="p-1 -ml-1 rounded hover:bg-black/5 transition-colors">
                  <ChevronLeft size={18}/>
                </button>
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: PASTEL.inkMute }}>SP Detail</span>
              </div>
              <h2 className="font-numeric text-4xl font-bold tracking-tight">SP-{group.spNo}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge status={group.status} overdue={group.isOverdue} large/>
                {group.customer && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1" style={{ background: PASTEL.peach, color: '#5C2F12' }}>
                    <User size={11}/>{group.customer}
                  </span>
                )}
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>
                  {group.itemCount} {group.itemCount > 1 ? 'items' : 'item'}
                </span>
                {group.dc && (
                  <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>
                    <Building2 size={11}/>{group.dc}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryStat label="SP Date" value={formatDateID(group.spDate)} bg={PASTEL.peach}/>
            <SummaryStat label="Deadline" value={formatDateID(group.deadline)} bg={PASTEL.butter}/>
            <SummaryStat label="Finance Progress" value={`${Math.round(group.financePct)}%`} bg={group.financePct === 100 ? PASTEL.mint : PASTEL.lavender}/>
          </div>

          {/* Money summary */}
          <div className="rounded-2xl p-5" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}>
            <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: PASTEL.inkMute }}>Financial Summary</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span style={{ color: PASTEL.inkSoft }}>Total Items</span><span className="font-mono">{group.itemCount}</span></div>
              <div className="flex justify-between"><span style={{ color: PASTEL.inkSoft }}>Total QTY</span><span className="font-mono">{formatNumber(group.totalQty)}</span></div>
              <div className="flex justify-between"><span style={{ color: PASTEL.inkSoft }}>Shipped</span><span className="font-mono" style={{ color: PASTEL.mintDeep }}>{formatNumber(group.totalShipped)}</span></div>
              <div className="flex justify-between"><span style={{ color: PASTEL.inkSoft }}>Outstanding</span><span className="font-mono" style={{ color: PASTEL.peachDeep }}>{formatNumber(group.totalOutstanding)}</span></div>
              <div className="flex justify-between pt-2 border-t" style={{ borderColor: PASTEL.line }}>
                <span style={{ color: PASTEL.inkSoft }}>Subtotal</span><span className="font-mono">{formatRupiah(group.totalAmount)}</span>
              </div>
              <div className="flex justify-between"><span style={{ color: PASTEL.inkSoft }}>PPN (11%)</span><span className="font-mono">{formatRupiah(group.totalPPN)}</span></div>
              <div className="flex justify-between pt-2 border-t" style={{ borderColor: PASTEL.line }}>
                <span className="font-semibold">Grand Total</span>
                <span className="font-numeric text-xl font-bold" style={{ color: PASTEL.mintDeep }}>{formatRupiah(group.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Finance dots overview */}
          <div className="rounded-2xl p-5" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}>
            <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: PASTEL.inkMute }}>Finance Status</div>
            <div className="grid grid-cols-4 gap-2">
              <FinTile label="Invoice" done={group.invDone} total={group.itemCount} bg={PASTEL.peach}/>
              <FinTile label="Faktur Pajak" done={group.fpDone} total={group.itemCount} bg={PASTEL.lavender}/>
              <FinTile label="Submit" done={group.submitDone} total={group.itemCount} bg={PASTEL.butter}/>
              <FinTile label="Kirim" done={group.kirimDone} total={group.itemCount} bg={PASTEL.rose}/>
            </div>
          </div>

          {/* Items list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xl font-semibold">Items</h3>
              <span className="text-xs" style={{ color: PASTEL.inkMute }}>{group.itemCount} produk</span>
            </div>
            <div className="space-y-3">
              {group.items.map((item, idx) => (
                <div key={item.id} className="rounded-2xl p-4 transition-all" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-semibold flex-shrink-0 mt-0.5" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>
                      {idx+1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm leading-snug">{item.productName}</div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: PASTEL.inkMute }}>
                        <span className="font-sans uppercase tracking-wider text-[9px] font-semibold mr-1">SKU:</span>
                        {item.sku || '—'}
                      </div>
                    </div>
                    <StatusBadge status={item.status} overdue={item.isOverdue}/>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <MiniStat label="Qty" value={formatNumber(item.qty)}/>
                    <MiniStat label="Shipped" value={formatNumber(item.shippedQty)} color={PASTEL.mintDeep}/>
                    <MiniStat label="Outstanding" value={formatNumber(item.outstandingQty)} color={item.outstandingQty > 0 ? PASTEL.peachDeep : PASTEL.inkSoft}/>
                    <MiniStat label="Grand Total" value={formatRupiahShort(item.grandTotal)}/>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <MiniStat label="Unit Price" value={formatRupiah(item.unitPrice)}/>
                    <MiniStat label="Shipping" value={formatRupiah(item.shippingPrice)}/>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <DocChip label="INV" active={item.inv}/>
                    <DocChip label="FP" active={item.fp}/>
                    <DocChip label="SUB" active={item.submit}/>
                    <DocChip label="KRM" active={item.kirim}/>
                    {item.btbNo && <span className="px-2 py-0.5 rounded-md text-[10px] font-mono" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>BTB: {item.btbNo}</span>}
                  </div>

                  {item.notes && (
                    <div className="text-xs p-2 rounded-lg mb-3" style={{ background: PASTEL.butter, color: '#5C4416' }}>
                      💡 {item.notes}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-2 border-t" style={{ borderColor: PASTEL.line }}>
                    {can(role,'shipment') && (
                      <button onClick={() => onShipment(item)} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: PASTEL.peach, color: '#5C2F12' }}>
                        <Truck size={12} className="inline mr-1"/> Shipment
                      </button>
                    )}
                    {can(role,'finance') && (
                      <button onClick={() => onFinance(item)} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: PASTEL.mint, color: '#1B5739' }}>
                        <Wallet size={12} className="inline mr-1"/> Finance
                      </button>
                    )}
                    {can(role,'edit') && (
                      <button onClick={() => onEditItem(item)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>
                        <Edit3 size={12}/>
                      </button>
                    )}
                    {can(role,'delete') && (
                      <button onClick={() => onDeleteItem(item.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: PASTEL.rose, color: '#7A2240' }}>
                        <Trash2 size={12}/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          {can(role, 'delete') && (
            <div className="pt-4 border-t" style={{ borderColor: PASTEL.line }}>
              <button onClick={onDeleteSP} className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-colors" style={{ background: PASTEL.rose, color: '#7A2240' }}>
                <Trash2 size={14} className="inline mr-2"/> Delete entire SP-{group.spNo}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SummaryStat({ label, value, bg }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: bg }}>
      <div className="text-[9px] uppercase tracking-[0.18em] font-semibold opacity-75" style={{ color: PASTEL.ink }}>{label}</div>
      <div className="text-sm font-semibold mt-1" style={{ color: PASTEL.ink }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>{label}</div>
      <div className="text-sm font-mono font-semibold mt-0.5" style={{ color: color || PASTEL.ink }}>{value}</div>
    </div>
  );
}

function DocChip({ label, active }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold" style={{
      background: active ? PASTEL.mint : PASTEL.lineSoft,
      color: active ? '#1B5739' : PASTEL.inkMute
    }}>
      {active ? '✓' : '○'} {label}
    </span>
  );
}

function FinTile({ label, done, total, bg }) {
  const pct = total > 0 ? (done/total) * 100 : 0;
  const complete = done === total && total > 0;
  return (
    <div className="rounded-xl p-3" style={{ background: complete ? bg : PASTEL.lineSoft }}>
      <div className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: complete ? PASTEL.ink : PASTEL.inkMute }}>{label}</div>
      <div className="font-mono text-base font-semibold" style={{ color: complete ? PASTEL.ink : PASTEL.inkSoft }}>
        {done}/{total}
      </div>
      <div className="h-1 mt-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
        <div className="h-full" style={{ width: `${pct}%`, background: complete ? PASTEL.ink : PASTEL.inkMute }}/>
      </div>
    </div>
  );
}

// ============================
// Input page
// ============================
function InputPage({ onAdd, onImport, onReset, onClear, rowCount, spCount }) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Input Data</h2>
        <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>Tambah SP secara manual atau bulk import dari spreadsheet</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          icon={Plus}
          title="Manual Input"
          desc="Tambah 1 baris SP dengan form lengkap. Auto-calculate total, PPN, grand total, dan status."
          buttonLabel="Add New SP"
          onClick={onAdd}
          bg={PASTEL.peach}
          accent={PASTEL.peachDeep}
        />
        <ActionCard
          icon={Upload}
          title="Bulk Import"
          desc="Paste data dari Excel atau Google Sheets. Sistem auto-deteksi kolom dan validasi format."
          buttonLabel="Import from Excel"
          onClick={onImport}
          bg={PASTEL.lavender}
          accent={PASTEL.lavenderDeep}
        />
      </div>

      <div className="rounded-3xl p-5 border" style={{ background: 'white', borderColor: PASTEL.line }}>
        <h3 className="font-display text-lg font-semibold mb-4">Data Management</h3>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm" style={{ color: PASTEL.inkSoft }}>
            <span className="font-mono font-semibold" style={{ color: PASTEL.ink }}>{spCount}</span> SP · <span className="font-mono font-semibold" style={{ color: PASTEL.ink }}>{rowCount}</span> items di local storage
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onReset} className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium" style={{ background: PASTEL.cream, border: `1px solid ${PASTEL.line}` }}>
              <RefreshCw size={12}/> Reset to Sample
            </button>
            <button onClick={onClear} className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium" style={{ background: PASTEL.rose, color: '#7A2240' }}>
              <Trash2 size={12}/> Clear All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, title, desc, buttonLabel, onClick, bg, accent }) {
  return (
    <div className="rounded-3xl p-6 border transition-all hover:shadow-lg" style={{ background: 'white', borderColor: PASTEL.line }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: bg }}>
        <Icon size={22} style={{ color: accent }}/>
      </div>
      <h3 className="font-display text-xl font-semibold mb-1.5">{title}</h3>
      <p className="text-sm mb-5" style={{ color: PASTEL.inkSoft }}>{desc}</p>
      <button onClick={onClick} className="px-5 py-2.5 rounded-full text-sm font-semibold transition-colors" style={{ background: PASTEL.ink, color: PASTEL.cream }}>
        {buttonLabel} →
      </button>
    </div>
  );
}

// ============================
// Shipment page
// ============================
function ShipmentPage({ rows, onUpdate, role }) {
  const pending = rows.filter(r => r.status !== 'Closed');
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Shipment & Fulfillment</h2>
        <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>{pending.length} item perlu update shipment</p>
      </div>

      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: PASTEL.lineSoft }}>
                {['SP No','Customer','Product','Qty','Shipped','Outstanding','Status','DC','BTB','Shipping Date','Action'].map((h,i) => (
                  <th key={h} className={`px-4 py-3.5 text-[10px] uppercase tracking-[0.15em] font-semibold ${i>=3 && i<=5 ? 'text-right' : i===10 ? 'text-right' : 'text-left'}`} style={{ color: PASTEL.inkSoft }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan={11} className="text-center py-12 text-sm" style={{ color: PASTEL.inkMute }}>Semua item sudah Closed 🎉</td></tr>}
              {pending.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: PASTEL.line, background: r.isOverdue ? `${PASTEL.rose}25` : 'white' }}>
                  <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{r.spNo}</td>
                  <td className="px-4 py-3">
                    {r.customer ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>{r.customer}</span>
                    ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                  </td>
                  <td className="px-4 py-3"><div className="max-w-[240px] truncate">{r.productName}</div><div className="text-[11px] font-mono" style={{ color: PASTEL.inkMute }}><span className="font-sans uppercase tracking-wider text-[9px] font-semibold mr-1">SKU:</span>{r.sku || '—'}</div></td>
                  <td className="px-4 py-3 text-right font-mono">{formatNumber(r.qty)}</td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: PASTEL.mintDeep }}>{formatNumber(r.shippedQty)}</td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: PASTEL.peachDeep }}>{formatNumber(r.outstandingQty)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} overdue={r.isOverdue}/></td>
                  <td className="px-4 py-3 text-xs" style={{ color: PASTEL.inkSoft }}>{r.dc || '-'}</td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: PASTEL.inkSoft }}>{r.btbNo || '-'}</td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: PASTEL.inkSoft }}>{formatDateID(r.shippingDate)}</td>
                  <td className="px-4 py-3 text-right">
                    {can(role,'shipment') ? (
                      <button onClick={()=>onUpdate(r)} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: PASTEL.peach, color: '#5C2F12' }}>
                        Update
                      </button>
                    ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================
// Finance page
// ============================
function FinancePage({ rows, onUpdate, role }) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Finance & Documents</h2>
        <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>Update invoice, faktur pajak, submit, kirim, dan email status</p>
      </div>

      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: PASTEL.lineSoft }}>
                {['SP No','Customer','Product','Grand Total','INV','FP','Submit','Kirim','Submit Date','Email','Action'].map((h,i) => (
                  <th key={h} className={`px-4 py-3.5 text-[10px] uppercase tracking-[0.15em] font-semibold ${i===3 ? 'text-right' : i>=4 && i<=7 ? 'text-center' : i===10 ? 'text-right' : 'text-left'}`} style={{ color: PASTEL.inkSoft }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={11} className="text-center py-12 text-sm" style={{ color: PASTEL.inkMute }}>Belum ada data</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: PASTEL.line, background: 'white' }}>
                  <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{r.spNo}</td>
                  <td className="px-4 py-3">
                    {r.customer ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>{r.customer}</span>
                    ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                  </td>
                  <td className="px-4 py-3"><div className="max-w-[240px] truncate">{r.productName}</div></td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{formatRupiah(r.grandTotal)}</td>
                  <td className="px-4 py-3 text-center"><DocChip label="" active={r.inv}/></td>
                  <td className="px-4 py-3 text-center"><DocChip label="" active={r.fp}/></td>
                  <td className="px-4 py-3 text-center"><DocChip label="" active={r.submit}/></td>
                  <td className="px-4 py-3 text-center"><DocChip label="" active={r.kirim}/></td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: PASTEL.inkSoft }}>{formatDateID(r.submitDate)}</td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: PASTEL.inkSoft }}>{formatDateID(r.emailStatus)}</td>
                  <td className="px-4 py-3 text-right">
                    {can(role,'finance') ? (
                      <button onClick={()=>onUpdate(r)} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: PASTEL.mint, color: '#1B5739' }}>
                        Update
                      </button>
                    ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================
// Outstanding page
// ============================
function OutstandingPage({ rows, onUpdate, role }) {
  const pending = rows.filter(r => !r.inv || !r.fp || !r.submit || !r.kirim);
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Outstanding Finance</h2>
        <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>{pending.length} item dengan dokumen pending</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Invoice" value={rows.filter(r=>!r.inv).length} icon={FileText} color={PASTEL.peach} accent={PASTEL.peachDeep}/>
        <KPICard label="FP Pending" value={rows.filter(r=>!r.fp).length} icon={FileText} color={PASTEL.lavender} accent={PASTEL.lavenderDeep}/>
        <KPICard label="Submit" value={rows.filter(r=>!r.submit).length} icon={FileText} color={PASTEL.butter} accent={PASTEL.butterDeep}/>
        <KPICard label="Kirim" value={rows.filter(r=>!r.kirim).length} icon={FileText} color={PASTEL.rose} accent={PASTEL.roseDeep}/>
      </div>

      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: PASTEL.lineSoft }}>
                {['SP No','Customer','Product','SP Date','Grand Total','Pending Docs','Action'].map((h,i) => (
                  <th key={h} className={`px-4 py-3.5 text-[10px] uppercase tracking-[0.15em] font-semibold ${i===4 ? 'text-right' : i===5 ? 'text-center' : i===6 ? 'text-right' : 'text-left'}`} style={{ color: PASTEL.inkSoft }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: PASTEL.inkMute }}>Semua dokumen complete ✨</td></tr>}
              {pending.map(r => {
                const missing = [];
                if (!r.inv) missing.push('INV');
                if (!r.fp) missing.push('FP');
                if (!r.submit) missing.push('SUB');
                if (!r.kirim) missing.push('KRM');
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: PASTEL.line, background: 'white' }}>
                    <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{r.spNo}</td>
                    <td className="px-4 py-3">
                      {r.customer ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>{r.customer}</span>
                      ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                    </td>
                    <td className="px-4 py-3"><div className="max-w-[280px] truncate">{r.productName}</div></td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: PASTEL.inkSoft }}>{formatDateID(r.spDate)}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{formatRupiah(r.grandTotal)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-center gap-1">
                        {missing.map(m => <span key={m} className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold" style={{ background: PASTEL.peach, color: '#5C2F12' }}>{m}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {can(role,'finance') ? (
                        <button onClick={()=>onUpdate(r)} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: PASTEL.mint, color: '#1B5739' }}>
                          Process
                        </button>
                      ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================
// Modals
// ============================
function ModalShell({ title, subtitle, onClose, children, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto animate-fade-in" style={{ background: 'rgba(45, 42, 40, 0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`rounded-3xl w-full ${maxWidth} my-8 shadow-2xl animate-slide-up`} style={{ background: PASTEL.cream }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: PASTEL.line }}>
          <div>
            <h3 className="font-display text-2xl font-semibold tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: PASTEL.inkMute }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 transition-colors"><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormModal({ initial, customers = [], onClose, onSave }) {
  const [data, setData] = useState(initial || {
    spDate: '', spNo: '', customer: '', productName: '', sku: '',
    qty: 0, shippedQty: 0, expDate: '', deadline: '',
    dc: '', shippingDate: '', btbNo: '',
    unitPrice: 0, shippingPrice: 0,
    inv: false, fp: false, submit: false, kirim: false,
    submitDate: '', emailStatus: '', notes: ''
  });

  const calc = calcRow(data);
  const update = (field, val) => setData({ ...data, [field]: val });

  // When picking customer, auto-fill DC if customer has a default
  const onPickCustomer = (custName) => {
    const c = customers.find(x => x.name === custName);
    setData(prev => ({
      ...prev,
      customer: custName,
      dc: prev.dc || (c?.defaultDC || '')
    }));
  };

  const handleSubmit = () => {
    if (!data.spNo || !data.productName) {
      alert('SP No dan Product Name wajib diisi');
      return;
    }
    if (!data.customer) {
      alert('Customer wajib dipilih');
      return;
    }
    onSave(data);
  };

  const activeCustomers = customers.filter(c => c.active !== false);

  return (
    <ModalShell title={initial ? 'Edit Item' : 'Add New Item'} subtitle="Field dengan asterisk wajib diisi" onClose={onClose}>
      <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
        <FormSection label="SP Information">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input label="SP Date" type="date" value={data.spDate} onChange={v=>update('spDate',v)}/>
            <Input label="SP No *" value={data.spNo} onChange={v=>update('spNo',v)} placeholder="2020577"/>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>Customer *</label>
              <select
                value={data.customer}
                onChange={e => onPickCustomer(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-colors"
                style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}
              >
                <option value="">— Pilih customer —</option>
                {activeCustomers.map(c => <option key={c.id} value={c.name}>{c.code} · {c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <Input label="DC" value={data.dc} onChange={v=>update('dc',v)} placeholder="DC BOGOR"/>
            <Input label="Product Name *" value={data.productName} onChange={v=>update('productName',v)} placeholder="STORBIT LOYANG..."/>
            <Input label="SKU" value={data.sku} onChange={v=>update('sku',v)} placeholder="BKT-SB43-00001"/>
          </div>
        </FormSection>

        <FormSection label="Quantity">
          <div className="grid grid-cols-3 gap-3">
            <Input label="QTY" type="number" value={data.qty} onChange={v=>update('qty', Number(v))}/>
            <Input label="Shipped QTY" type="number" value={data.shippedQty} onChange={v=>update('shippedQty', Number(v))}/>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>Outstanding</label>
              <div className="rounded-xl px-3.5 py-2.5 text-sm font-mono font-semibold" style={{ background: PASTEL.peach, color: '#5C2F12' }}>{formatNumber(calc.outstandingQty)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Input label="EXP Date" type="date" value={data.expDate} onChange={v=>update('expDate',v)}/>
            <Input label="Deadline" type="date" value={data.deadline} onChange={v=>update('deadline',v)}/>
          </div>
        </FormSection>

        <FormSection label="Shipping">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Shipping Date" type="date" value={data.shippingDate} onChange={v=>update('shippingDate',v)}/>
            <Input label="BTB No" value={data.btbNo} onChange={v=>update('btbNo',v)}/>
          </div>
        </FormSection>

        <FormSection label="Pricing">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unit Price (Rp)" type="number" value={data.unitPrice} onChange={v=>update('unitPrice', Number(v))}/>
            <Input label="Shipping Price (Rp)" type="number" value={data.shippingPrice} onChange={v=>update('shippingPrice', Number(v))}/>
          </div>
          <div className="mt-3 p-4 rounded-2xl space-y-1.5" style={{ background: PASTEL.lineSoft }}>
            <CalcRow label="Total = (Unit Price × QTY) + Shipping" value={calc.total}/>
            <CalcRow label="PPN (11%)" value={calc.ppn}/>
            <CalcRow label="Grand Total" value={calc.grandTotal} highlight/>
            <div className="pt-2 mt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: PASTEL.line }}>
              <span style={{ color: PASTEL.inkMute }}>Auto Status:</span>
              <StatusBadge status={calc.status} overdue={calc.isOverdue}/>
            </div>
          </div>
        </FormSection>

        <FormSection label="Finance & Documents">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Toggle label="INV" value={data.inv} onChange={v=>update('inv',v)}/>
            <Toggle label="FP" value={data.fp} onChange={v=>update('fp',v)}/>
            <Toggle label="SUBMIT" value={data.submit} onChange={v=>update('submit',v)}/>
            <Toggle label="KIRIM" value={data.kirim} onChange={v=>update('kirim',v)}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Submit Date" type="date" value={data.submitDate} onChange={v=>update('submitDate',v)}/>
            <Input label="Email Status" type="date" value={data.emailStatus} onChange={v=>update('emailStatus',v)}/>
          </div>
        </FormSection>

        <FormSection label="Notes">
          <textarea value={data.notes || ''} onChange={e => update('notes', e.target.value)} rows={2}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
            style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}
            placeholder="Catatan tambahan..."
          />
        </FormSection>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>Cancel</button>
          <button type="button" onClick={handleSubmit} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: PASTEL.ink, color: PASTEL.cream }}>
            <Save size={14}/> Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function FormSection({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3 pb-1.5 border-b" style={{ color: PASTEL.inkMute, borderColor: PASTEL.line }}>{label}</div>
      {children}
    </div>
  );
}

function Input({ label, type='text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>{label}</label>
      <input
        type={type} value={value ?? ''}
        onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-colors"
        style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}
        onFocus={e => e.currentTarget.style.borderColor = PASTEL.peachDeep}
        onBlur={e => e.currentTarget.style.borderColor = PASTEL.line}
      />
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className="px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
      style={{
        background: value ? PASTEL.mint : 'white',
        color: value ? '#1B5739' : PASTEL.inkMute,
        border: `1px solid ${value ? PASTEL.mintDeep : PASTEL.line}`,
      }}
    >
      {value ? '✓ ' : '○ '}{label}
    </button>
  );
}

function CalcRow({ label, value, highlight }) {
  return (
    <div className={`flex items-center justify-between text-sm ${highlight ? 'pt-2 mt-1 border-t font-semibold' : ''}`} style={highlight ? { borderColor: PASTEL.line } : {}}>
      <span className="text-xs" style={{ color: PASTEL.inkSoft }}>{label}</span>
      <span className={`font-mono ${highlight ? 'text-base' : ''}`} style={{ color: highlight ? PASTEL.mintDeep : PASTEL.ink }}>{formatRupiah(value)}</span>
    </div>
  );
}

function ShipmentModal({ row, onClose, onSave }) {
  const [data, setData] = useState({
    shippedQty: row.shippedQty,
    shippingDate: row.shippingDate || '',
    btbNo: row.btbNo || '',
    dc: row.dc || '',
    notes: row.notes || ''
  });
  const submit = () => onSave({ ...row, ...data });
  const newOutstanding = row.qty - Number(data.shippedQty || 0);

  return (
    <ModalShell title="Update Shipment" subtitle={`SP-${row.spNo} • ${row.productName}`} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-4">
        <div className="rounded-2xl p-4 grid grid-cols-3 gap-3 text-center" style={{ background: PASTEL.lineSoft }}>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: PASTEL.inkMute }}>QTY</div>
            <div className="font-mono font-semibold mt-1">{formatNumber(row.qty)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: PASTEL.inkMute }}>Shipped</div>
            <div className="font-mono font-semibold mt-1" style={{ color: PASTEL.mintDeep }}>{formatNumber(data.shippedQty)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: PASTEL.inkMute }}>Outstanding</div>
            <div className="font-mono font-semibold mt-1" style={{ color: newOutstanding === 0 ? PASTEL.mintDeep : PASTEL.peachDeep }}>{formatNumber(newOutstanding)}</div>
          </div>
        </div>

        <Input label="Shipped QTY" type="number" value={data.shippedQty} onChange={v=>setData({...data, shippedQty: Number(v)})}/>
        <Input label="Shipping Date" type="date" value={data.shippingDate} onChange={v=>setData({...data, shippingDate: v})}/>
        <Input label="BTB No" value={data.btbNo} onChange={v=>setData({...data, btbNo: v})}/>
        <Input label="DC" value={data.dc} onChange={v=>setData({...data, dc: v})}/>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>Notes</label>
          <textarea value={data.notes} onChange={e=>setData({...data, notes: e.target.value})} rows={2}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
            style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}/>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>Cancel</button>
          <button onClick={submit} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: PASTEL.peachDeep, color: 'white' }}>
            <Save size={14}/> Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function FinanceModal({ row, onClose, onSave }) {
  const [data, setData] = useState({
    inv: row.inv, fp: row.fp, submit: row.submit, kirim: row.kirim,
    submitDate: row.submitDate || '', emailStatus: row.emailStatus || '',
    notes: row.notes || ''
  });
  const submit = () => onSave({ ...row, ...data });

  return (
    <ModalShell title="Update Finance Status" subtitle={`SP-${row.spNo} • ${formatRupiah(row.grandTotal)}`} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: PASTEL.inkMute }}>Document Status</div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Invoice" value={data.inv} onChange={v=>setData({...data, inv: v})}/>
            <Toggle label="Faktur Pajak" value={data.fp} onChange={v=>setData({...data, fp: v})}/>
            <Toggle label="Submit" value={data.submit} onChange={v=>setData({...data, submit: v})}/>
            <Toggle label="Kirim" value={data.kirim} onChange={v=>setData({...data, kirim: v})}/>
          </div>
        </div>

        <Input label="Submit Date" type="date" value={data.submitDate} onChange={v=>setData({...data, submitDate: v})}/>
        <Input label="Email Status" type="date" value={data.emailStatus} onChange={v=>setData({...data, emailStatus: v})}/>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>Notes</label>
          <textarea value={data.notes} onChange={e=>setData({...data, notes: e.target.value})} rows={2}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
            style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}/>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>Cancel</button>
          <button onClick={submit} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: PASTEL.mintDeep, color: 'white' }}>
            <Save size={14}/> Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ImportModal({ onClose, onImport }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const parseDate = (s) => {
    if (!s || s === '-') return '';
    s = s.trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  };
  const parseNumber = (s) => {
    if (!s) return 0;
    const cleaned = String(s).replace(/[.\s]/g,'').replace(/,/g,'.');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  };
  const parseBool = (s) => {
    if (!s) return false;
    const v = String(s).trim().toUpperCase();
    return v === 'TRUE' || v === 'YES' || v === '1' || v === '✓';
  };

  const handleParse = () => {
    setError('');
    try {
      const lines = text.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) { setError('Minimal harus ada header + 1 baris data'); setPreview(null); return; }
      const sep = lines[0].includes('\t') ? '\t' : ',';
      const splitLine = (line) => {
        if (sep === '\t') return line.split('\t');
        const result = []; let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') inQ = !inQ;
          else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
          else cur += ch;
        }
        result.push(cur);
        return result;
      };
      const headers = splitLine(lines[0]).map(h => h.trim().toLowerCase());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = splitLine(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => obj[h] = (cells[idx] || '').trim());
        rows.push({
          spDate: parseDate(obj['sp date']),
          spNo: obj['sp no'] || '',
          productName: obj['product name'] || '',
          sku: obj['sku'] || '',
          qty: parseNumber(obj['qty']),
          shippedQty: parseNumber(obj['shipped qty']),
          expDate: parseDate(obj['exp date']),
          deadline: parseDate(obj['deadline']),
          dc: obj['dc'] || '',
          shippingDate: parseDate(obj['shipping date']),
          btbNo: obj['btb no'] || '',
          unitPrice: parseNumber(obj['unit price']),
          shippingPrice: parseNumber(obj['shipping price']),
          inv: parseBool(obj['inv']),
          fp: parseBool(obj['fp']),
          submit: parseBool(obj['submit']),
          kirim: parseBool(obj['kirim']),
          submitDate: parseDate(obj['submit date']),
          emailStatus: parseDate(obj['email status']) || obj['email status'] || '',
          notes: obj['notes'] || ''
        });
      }
      setPreview(rows);
    } catch (e) { setError('Gagal parse data: ' + e.message); }
  };

  const sampleData = `SP DATE\tSP NO\tProduct Name\tSKU\tQTY\tSHIPPED QTY\tOUTSTANDING QTY\tEXP Date\tDeadline\tSTATUS\tDC\tShipping Date\tBTB NO\tUnit Price\tShipping Price\tTOTAL\tPPN\tGRAND TOTAL\tINV\tFP\tSUBMIT\tKIRIM\tSUBMIT DATE\tEmail Status
14/1/26\t2020577\tSTORBIT LOYANG 46 X 33 CM ( SAYBREAD )\tBKT-SB43-00001\t10\t10\t0\t11/6/26\t-\tClosed\tDC BOGOR\t29/4/26\t2015214\t120.000\t600.000\t1.800.000\t198.000\t1.998.000\tTRUE\tTRUE\tTRUE\tTRUE\t07/05/2026\t`;

  return (
    <ModalShell title="Bulk Import" subtitle="Paste data dari Excel atau CSV" onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6 space-y-4">
        <div className="rounded-2xl p-4 text-xs" style={{ background: PASTEL.lavender }}>
          <div className="font-semibold mb-2" style={{ color: '#3D2B5C' }}>Cara import:</div>
          <ol className="list-decimal ml-4 space-y-1" style={{ color: '#3D2B5C' }}>
            <li>Buka Excel/Google Sheet, copy seluruh data termasuk header</li>
            <li>Paste ke textarea di bawah</li>
            <li>Klik "Parse & Preview" untuk validasi</li>
            <li>Klik "Import" jika preview sudah benar</li>
          </ol>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkMute }}>Data (paste here)</label>
          <button onClick={()=>setText(sampleData)} className="text-xs underline font-medium" style={{ color: PASTEL.peachDeep }}>Load sample</button>
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={8}
          placeholder="Paste data dari Excel di sini..."
          className="w-full rounded-2xl px-4 py-3 text-xs font-mono focus:outline-none"
          style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}
        />

        <div className="flex items-center gap-2">
          <button onClick={handleParse} disabled={!text.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold disabled:opacity-50"
            style={{ background: PASTEL.lavenderDeep, color: 'white' }}>
            <Eye size={14}/> Parse & Preview
          </button>
          {error && <span className="text-xs" style={{ color: PASTEL.roseDeep }}>{error}</span>}
        </div>

        {preview && (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: PASTEL.line }}>
            <div className="px-4 py-2.5 text-xs flex items-center justify-between border-b" style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft }}>
              <span className="font-semibold">Preview: {preview.length} rows</span>
            </div>
            <div className="max-h-[260px] overflow-auto" style={{ background: 'white' }}>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: PASTEL.inkMute, background: PASTEL.lineSoft }}>
                  <tr>
                    <th className="px-3 py-2 text-left">SP No</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">QTY</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-left">DC</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0,20).map((r,i) => (
                    <tr key={i} className="border-t" style={{ borderColor: PASTEL.line }}>
                      <td className="px-3 py-2 font-mono">{r.spNo}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{r.productName}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.qty}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatRupiah(r.unitPrice)}</td>
                      <td className="px-3 py-2">{r.dc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>Cancel</button>
          <button onClick={() => preview && onImport(preview)} disabled={!preview}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold disabled:opacity-50"
            style={{ background: PASTEL.ink, color: PASTEL.cream }}>
            <Upload size={14}/> Import {preview && `(${preview.length})`}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================
// Customers Page
// ============================
function CustomersPage({ customers, rows, dcList, onAdd, onEdit, onDelete, role }) {
  const usageCount = (custName) => rows.filter(r => r.customer === custName).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Master Customer</h2>
          <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>{customers.length} customer terdaftar · digunakan di SP & filter</p>
        </div>
        {can(role, 'master') && (
          <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold" style={{ background: PASTEL.ink, color: PASTEL.cream }}>
            <Plus size={14}/> Add Customer
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 text-center py-16 rounded-3xl border" style={{ background: 'white', borderColor: PASTEL.line, color: PASTEL.inkMute }}>
            Belum ada customer. Klik "Add Customer" untuk menambah.
          </div>
        )}
        {customers.map(c => {
          const usage = usageCount(c.name);
          return (
            <div key={c.id} className="rounded-3xl p-5 border transition-all hover:shadow-lg" style={{ background: 'white', borderColor: PASTEL.line, opacity: c.active === false ? 0.55 : 1 }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 font-numeric font-bold text-base" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>
                    {c.code || c.name.slice(0,2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold truncate">{c.name}</h3>
                    <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>
                      Code · {c.code || '-'}
                    </div>
                  </div>
                </div>
                {c.active === false && (
                  <span className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: PASTEL.lineSoft, color: PASTEL.inkMute }}>Inactive</span>
                )}
              </div>

              <div className="space-y-1.5 text-xs mb-4">
                <CustRow label="Default DC" value={c.defaultDC || '—'}/>
                <CustRow label="PIC" value={c.picName || '—'}/>
                <CustRow label="Email" value={c.picEmail || '—'} mono={!!c.picEmail}/>
                <CustRow label="Used in SP" value={`${usage} ${usage === 1 ? 'item' : 'items'}`} highlight={usage > 0}/>
              </div>

              {can(role, 'master') && (
                <div className="flex items-center gap-1.5 pt-3 border-t" style={{ borderColor: PASTEL.line }}>
                  <button onClick={() => onEdit(c)} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>
                    <Edit3 size={12} className="inline mr-1"/> Edit
                  </button>
                  <button onClick={() => onDelete(c.id)} disabled={usage > 0} className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40" style={{ background: PASTEL.rose, color: '#7A2240' }}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl p-4 text-xs flex items-start gap-2" style={{ background: PASTEL.butter, color: '#5C4416' }}>
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
        <div>Customer yang sudah dipakai di SP tidak bisa dihapus. Jika perlu nonaktifkan, edit customer dan set status menjadi <strong>Inactive</strong>.</div>
      </div>
    </div>
  );
}

function CustRow({ label, value, mono, highlight }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: PASTEL.inkMute }}>{label}</span>
      <span className={mono ? 'font-mono' : ''} style={{ color: highlight ? PASTEL.peachDeep : PASTEL.ink, fontWeight: highlight ? 600 : 500 }}>{value}</span>
    </div>
  );
}

// ============================
// Customer Modal
// ============================
function CustomerModal({ initial, existingCustomers, dcList, onClose, onSave }) {
  const [data, setData] = useState(initial || {
    code: '', name: '', defaultDC: '', picName: '', picEmail: '', active: true
  });
  const update = (k, v) => setData({ ...data, [k]: v });

  const submit = () => {
    if (!data.code.trim() || !data.name.trim()) {
      alert('Code dan Name wajib diisi');
      return;
    }
    // Check duplicate name (case insensitive)
    const dupName = existingCustomers.find(c => c.id !== initial?.id && c.name.toUpperCase() === data.name.trim().toUpperCase());
    if (dupName) {
      alert(`Customer dengan nama "${data.name}" sudah ada`);
      return;
    }
    const dupCode = existingCustomers.find(c => c.id !== initial?.id && c.code.toUpperCase() === data.code.trim().toUpperCase());
    if (dupCode) {
      alert(`Code "${data.code}" sudah dipakai customer lain`);
      return;
    }
    onSave({ ...data, code: data.code.trim().toUpperCase(), name: data.name.trim().toUpperCase() });
  };

  return (
    <ModalShell title={initial ? 'Edit Customer' : 'Add New Customer'} subtitle="Master data customer untuk SP" onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Input label="Code *" value={data.code} onChange={v=>update('code', v.toUpperCase())} placeholder="IM"/>
          <div className="col-span-2">
            <Input label="Name *" value={data.name} onChange={v=>update('name', v)} placeholder="INDOMARCO"/>
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>Default DC</label>
          <input
            list="dc-list"
            value={data.defaultDC}
            onChange={e => update('defaultDC', e.target.value)}
            placeholder="DC JAKARTA (auto-fill saat input SP)"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
            style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}
          />
          <datalist id="dc-list">
            {dcList.map(d => <option key={d} value={d}/>)}
          </datalist>
        </div>

        <Input label="PIC Name" value={data.picName} onChange={v=>update('picName', v)} placeholder="Nama PIC dari customer"/>
        <Input label="PIC Email" value={data.picEmail} onChange={v=>update('picEmail', v)} placeholder="pic@customer.com"/>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-2" style={{ color: PASTEL.inkMute }}>Status</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => update('active', true)}
              className="flex-1 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
              style={{
                background: data.active ? PASTEL.mint : 'white',
                color: data.active ? '#1B5739' : PASTEL.inkMute,
                border: `1px solid ${data.active ? PASTEL.mintDeep : PASTEL.line}`,
              }}>
              ✓ Active
            </button>
            <button type="button" onClick={() => update('active', false)}
              className="flex-1 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
              style={{
                background: !data.active ? PASTEL.rose : 'white',
                color: !data.active ? '#7A2240' : PASTEL.inkMute,
                border: `1px solid ${!data.active ? PASTEL.roseDeep : PASTEL.line}`,
              }}>
              ○ Inactive
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>Cancel</button>
          <button type="button" onClick={submit} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: PASTEL.ink, color: PASTEL.cream }}>
            <Save size={14}/> Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================
// AR Tracker Page
// ============================
function ARTrackerPage({ arData, customers, filterCustomer, setFilterCustomer, filterStatus, setFilterStatus, search, setSearch, onAdd, onView, role }) {
  const enriched = arData.map(t => ({ ...t, ...calcAR(t) }));

  const filtered = enriched.filter(t => {
    if (filterCustomer !== 'all' && t.customer !== filterCustomer) return false;
    if (filterStatus !== 'all') {
      if (filterStatus === 'overdue' && !t.isOverdue) return false;
      if (filterStatus !== 'overdue' && t.status !== filterStatus) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const inHeader = (t.noTTF || '').toLowerCase().includes(q) || (t.noINV || '').toLowerCase().includes(q) || (t.noSP || '').toLowerCase().includes(q);
      const inBTB = (t.btbs || []).some(b => (b.noBTB || '').toLowerCase().includes(q));
      if (!inHeader && !inBTB) return false;
    }
    return true;
  }).sort((a, b) => (b.tanggalTTF || '').localeCompare(a.tanggalTTF || ''));

  // Stats
  const totalInvoice = enriched.reduce((s, t) => s + t.totalInvoice, 0);
  const totalPayment = enriched.reduce((s, t) => s + t.totalPayment, 0);
  const totalOS = enriched.reduce((s, t) => s + t.totalOS, 0);
  const lunasCount = enriched.filter(t => t.status === 'Lunas').length;
  const overdueCount = enriched.filter(t => t.isOverdue).length;
  const avgJarak = enriched.filter(t => t.status === 'Lunas' && t.jarakTgl !== null).reduce((s, t, _, arr) => s + t.jarakTgl/arr.length, 0);

  // Aging buckets
  const aging = { b1: 0, b2: 0, b3: 0, b4: 0 };
  enriched.forEach(t => {
    if (t.status === 'Lunas' || t.status === 'Lebih Bayar') return;
    if (t.jarakTgl === null) return;
    if (t.jarakTgl <= 30) aging.b1 += t.totalOS;
    else if (t.jarakTgl <= 60) aging.b2 += t.totalOS;
    else if (t.jarakTgl <= 90) aging.b3 += t.totalOS;
    else aging.b4 += t.totalOS;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">AR Tracker</h2>
          <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>{enriched.length} TTF · {filtered.length} after filter · monitoring outstanding receivables</p>
        </div>
        {can(role, 'finance') && (
          <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold" style={{ background: PASTEL.ink, color: PASTEL.cream }}>
            <Plus size={14}/> Add TTF
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Total Invoice" value={formatRupiahShort(totalInvoice)} icon={FileText} color={PASTEL.lavender} accent={PASTEL.lavenderDeep}/>
        <KPICard label="Total Paid" value={formatRupiahShort(totalPayment)} icon={CheckCircle2} color={PASTEL.mint} accent={PASTEL.mintDeep}/>
        <KPICard label="Outstanding" value={formatRupiahShort(totalOS)} icon={Clock} color={PASTEL.peach} accent={PASTEL.peachDeep}/>
        <KPICard label="Overdue TTF" value={overdueCount} icon={AlertTriangle} color={overdueCount > 0 ? PASTEL.rose : PASTEL.lineSoft} accent={overdueCount > 0 ? PASTEL.roseDeep : PASTEL.inkMute}/>
      </div>

      {/* Aging buckets */}
      <div className="rounded-3xl p-5 border" style={{ background: 'white', borderColor: PASTEL.line }}>
        <h3 className="font-display text-lg font-semibold mb-3">Aging Buckets</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AgingBucket label="0–30 days" value={aging.b1} bg={PASTEL.mint}/>
          <AgingBucket label="31–60 days" value={aging.b2} bg={PASTEL.butter}/>
          <AgingBucket label="61–90 days" value={aging.b3} bg={PASTEL.peach}/>
          <AgingBucket label="90+ days" value={aging.b4} bg={PASTEL.rose}/>
        </div>
        {avgJarak > 0 && (
          <div className="text-xs mt-3" style={{ color: PASTEL.inkMute }}>
            Avg payment time (lunas): <span className="font-numeric font-bold" style={{ color: PASTEL.ink }}>{Math.round(avgJarak)} hari</span>
          </div>
        )}
      </div>

      {/* Customer tabs */}
      <div className="flex items-center gap-2 flex-wrap pb-1">
        <button
          onClick={() => setFilterCustomer('all')}
          className="px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all"
          style={{
            background: filterCustomer === 'all' ? PASTEL.ink : 'white',
            color: filterCustomer === 'all' ? PASTEL.cream : PASTEL.inkSoft,
            border: `1px solid ${filterCustomer === 'all' ? PASTEL.ink : PASTEL.line}`
          }}
        >
          All Customers
        </button>
        {customers.filter(c => c.active !== false).map(c => {
          const active = filterCustomer === c.name;
          const count = enriched.filter(t => t.customer === c.name).length;
          if (count === 0) return null;
          return (
            <button
              key={c.id}
              onClick={() => setFilterCustomer(c.name)}
              className="px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2"
              style={{
                background: active ? PASTEL.peach : 'white',
                color: active ? PASTEL.ink : PASTEL.inkSoft,
                border: `1px solid ${active ? PASTEL.peachDeep : PASTEL.line}`
              }}
            >
              <span>{c.name}</span>
              <span className="font-numeric font-bold px-1.5 py-0.5 rounded-md text-[10px]" style={{ background: active ? PASTEL.cream : PASTEL.lineSoft }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-3xl p-4 border flex flex-wrap items-center gap-3" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="relative flex-1 min-w-[260px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: PASTEL.inkMute }}/>
          <input type="text" placeholder="Cari TTF, INV, SP, BTB..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none"
            style={{ background: PASTEL.cream, border: `1px solid ${PASTEL.line}` }}/>
        </div>
        <FilterPill label="Status" value={filterStatus} onChange={setFilterStatus} options={[
          { v: 'all', l: 'All Status' },
          { v: 'Belum Bayar', l: 'Belum Bayar' },
          { v: 'Partial', l: 'Partial' },
          { v: 'Lunas', l: 'Lunas' },
          { v: 'Lebih Bayar', l: 'Lebih Bayar' },
          { v: 'overdue', l: 'Overdue Only' },
        ]}/>
      </div>

      {/* Table */}
      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: PASTEL.lineSoft }}>
                {['No. TTF','Customer','Tgl TTF','Tgl Terima','No. INV','No. SP','Total Inv','Payment','OS','Tgl Bayar','Jarak','Status'].map((h, i) => (
                  <th key={h} className={`px-4 py-3.5 text-[10px] uppercase tracking-[0.15em] font-semibold ${[6,7,8,10].includes(i) ? 'text-right' : 'text-left'}`} style={{ color: PASTEL.inkSoft }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="text-center py-16 text-sm" style={{ color: PASTEL.inkMute }}>Tidak ada TTF yang cocok</td></tr>
              )}
              {filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => onView(t)}
                  className="cursor-pointer transition-colors border-t"
                  style={{ borderColor: PASTEL.line, background: t.isOverdue ? `${PASTEL.rose}25` : 'white' }}
                  onMouseEnter={(e) => { if (!t.isOverdue) e.currentTarget.style.background = PASTEL.lineSoft; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = t.isOverdue ? `${PASTEL.rose}25` : 'white'; }}
                >
                  <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap text-xs">{t.noTTF}</td>
                  <td className="px-4 py-3">
                    {t.customer ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>{t.customer}</span>
                    ) : <span className="text-xs" style={{ color: PASTEL.inkMute }}>-</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: PASTEL.inkSoft }}>{formatDateID(t.tanggalTTF)}</td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: PASTEL.inkSoft }}>{formatDateID(t.tanggalMenerima)}</td>
                  <td className="px-4 py-3 text-xs font-mono">{t.noINV || '-'}</td>
                  <td className="px-4 py-3 text-xs font-mono">{t.noSP || '-'}</td>
                  <td className="px-4 py-3 text-right font-numeric font-semibold whitespace-nowrap text-xs">{formatRupiah(t.totalInvoice)}</td>
                  <td className="px-4 py-3 text-right font-numeric whitespace-nowrap text-xs" style={{ color: PASTEL.mintDeep }}>{formatRupiah(t.totalPayment)}</td>
                  <td className="px-4 py-3 text-right font-numeric font-semibold whitespace-nowrap text-xs" style={{ color: Math.abs(t.totalOS) <= 1 ? PASTEL.mintDeep : t.totalOS > 0 ? PASTEL.peachDeep : PASTEL.roseDeep }}>{formatRupiah(t.totalOS)}</td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: PASTEL.inkSoft }}>{formatDateID(t.tglPembayaran)}</td>
                  <td className="px-4 py-3 text-right font-numeric text-xs" style={{ color: t.isOverdue ? PASTEL.roseDeep : PASTEL.inkSoft }}>{t.jarakTgl !== null ? `${t.jarakTgl}d` : '-'}</td>
                  <td className="px-4 py-3"><ARStatusBadge status={t.status} overdue={t.isOverdue}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px]" style={{ color: PASTEL.inkMute }}>
        Klik baris TTF untuk melihat detail BTB · Toleransi rounding ±1 dianggap Lunas · Overdue jika belum lunas + jarak {'>'} 30 hari
      </div>
    </div>
  );
}

function AgingBucket({ label, value, bg }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: bg }}>
      <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: PASTEL.ink }}>{label}</div>
      <div className="font-numeric text-xl font-bold" style={{ color: PASTEL.ink }}>{formatRupiahShort(value)}</div>
    </div>
  );
}

function ARStatusBadge({ status, overdue }) {
  const styles = {
    'Lunas': { bg: PASTEL.mint, color: '#1B5739' },
    'Partial': { bg: PASTEL.butter, color: '#7A5B12' },
    'Belum Bayar': { bg: PASTEL.sky, color: '#1F4D6B' },
    'Lebih Bayar': { bg: PASTEL.lavender, color: '#3D2B5C' },
  };
  const s = styles[status] || styles['Belum Bayar'];
  return (
    <div className="flex items-center gap-1.5">
      <span className="px-2.5 py-0.5 text-[10px] rounded-full font-semibold tracking-wide whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
        {status}
      </span>
      {overdue && (
        <span className="px-2.5 py-0.5 text-[10px] rounded-full font-semibold tracking-wide" style={{ background: PASTEL.rose, color: '#7A2240' }}>
          Overdue
        </span>
      )}
    </div>
  );
}

// ============================
// AR Side Panel
// ============================
function ARSidePanel({ ttf, onClose, onEdit, onDelete, role }) {
  const calc = calcAR(ttf);

  return (
    <>
      <div className="fixed inset-0 z-40 animate-fade-in" style={{ background: 'rgba(45, 42, 40, 0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}/>
      <div className="fixed top-0 right-0 bottom-0 w-full md:w-[680px] z-50 overflow-y-auto animate-slide-in shadow-2xl" style={{ background: PASTEL.cream }}>
        <div className="sticky top-0 z-10 px-6 py-5 border-b backdrop-blur" style={{ borderColor: PASTEL.line, background: 'rgba(250, 246, 240, 0.92)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={onClose} className="p-1 -ml-1 rounded hover:bg-black/5 transition-colors">
                  <ChevronLeft size={18}/>
                </button>
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: PASTEL.inkMute }}>TTF Detail</span>
              </div>
              <h2 className="font-numeric text-3xl font-bold tracking-tight">{ttf.noTTF}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <ARStatusBadge status={calc.status} overdue={calc.isOverdue}/>
                {ttf.customer && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1" style={{ background: PASTEL.peach, color: '#5C2F12' }}>
                    <User size={11}/>{ttf.customer}
                  </span>
                )}
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>
                  {(ttf.btbs || []).length} BTB
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <SummaryStat label="Tgl TTF" value={formatDateID(ttf.tanggalTTF)} bg={PASTEL.peach}/>
            <SummaryStat label="Tgl Menerima" value={formatDateID(ttf.tanggalMenerima)} bg={PASTEL.butter}/>
            <SummaryStat label="No. INV" value={ttf.noINV || '—'} bg={PASTEL.lavender}/>
            <SummaryStat label="No. SP" value={ttf.noSP || '—'} bg={PASTEL.sky}/>
            <SummaryStat label="Tgl Pembayaran" value={formatDateID(ttf.tglPembayaran)} bg={calc.status === 'Lunas' ? PASTEL.mint : PASTEL.lineSoft}/>
            <SummaryStat label="Jarak Tgl" value={calc.jarakTgl !== null ? `${calc.jarakTgl} hari` : '—'} bg={calc.isOverdue ? PASTEL.rose : PASTEL.lineSoft}/>
          </div>

          {/* Money summary */}
          <div className="rounded-2xl p-5" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}>
            <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: PASTEL.inkMute }}>Financial Summary</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span style={{ color: PASTEL.inkSoft }}>Total Invoice</span><span className="font-numeric font-semibold">{formatRupiah(calc.totalInvoice)}</span></div>
              <div className="flex justify-between"><span style={{ color: PASTEL.inkSoft }}>Total Payment</span><span className="font-numeric font-semibold" style={{ color: PASTEL.mintDeep }}>{formatRupiah(calc.totalPayment)}</span></div>
              <div className="flex justify-between pt-2 border-t" style={{ borderColor: PASTEL.line }}>
                <span className="font-semibold">Outstanding (OS)</span>
                <span className="font-numeric text-xl font-bold" style={{ color: Math.abs(calc.totalOS) <= 1 ? PASTEL.mintDeep : calc.totalOS > 0 ? PASTEL.peachDeep : PASTEL.roseDeep }}>{formatRupiah(calc.totalOS)}</span>
              </div>
            </div>
          </div>

          {/* BTB Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xl font-semibold">BTB Items</h3>
              <span className="text-xs" style={{ color: PASTEL.inkMute }}>{(ttf.btbs || []).length} items</span>
            </div>
            <div className="rounded-2xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: PASTEL.lineSoft }}>
                    <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkMute }}>No. BTB</th>
                    <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkMute }}>DPP+PPN</th>
                    <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkMute }}>PPH</th>
                    <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkMute }}>Total</th>
                    <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkMute }}>Payment</th>
                    <th className="px-3 py-2 text-right text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkMute }}>OS</th>
                  </tr>
                </thead>
                <tbody>
                  {(calc.btbs || []).map(b => (
                    <tr key={b.id} className="border-t" style={{ borderColor: PASTEL.line }}>
                      <td className="px-3 py-2 font-mono text-[11px]">{b.noBTB}</td>
                      <td className="px-3 py-2 text-right font-numeric">{formatRupiah(b.dppPPN)}</td>
                      <td className="px-3 py-2 text-right font-numeric" style={{ color: PASTEL.inkMute }}>{b.pph ? formatRupiah(b.pph) : '-'}</td>
                      <td className="px-3 py-2 text-right font-numeric font-semibold">{formatRupiah(b.total)}</td>
                      <td className="px-3 py-2 text-right font-numeric" style={{ color: PASTEL.mintDeep }}>{formatRupiah(b.payment)}</td>
                      <td className="px-3 py-2 text-right font-numeric font-semibold" style={{ color: Math.abs(b.os) <= 1 ? PASTEL.mintDeep : b.os > 0 ? PASTEL.peachDeep : PASTEL.roseDeep }}>{formatRupiah(b.os)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t" style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft }}>
                    <td className="px-3 py-2 font-semibold">Total</td>
                    <td colSpan={2}></td>
                    <td className="px-3 py-2 text-right font-numeric font-bold">{formatRupiah(calc.totalInvoice)}</td>
                    <td className="px-3 py-2 text-right font-numeric font-bold" style={{ color: PASTEL.mintDeep }}>{formatRupiah(calc.totalPayment)}</td>
                    <td className="px-3 py-2 text-right font-numeric font-bold" style={{ color: Math.abs(calc.totalOS) <= 1 ? PASTEL.mintDeep : calc.totalOS > 0 ? PASTEL.peachDeep : PASTEL.roseDeep }}>{formatRupiah(calc.totalOS)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {ttf.notes && (
            <div className="rounded-2xl p-4" style={{ background: PASTEL.butter, color: '#5C4416' }}>
              <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-1">Notes</div>
              <p className="text-sm whitespace-pre-wrap">{ttf.notes}</p>
            </div>
          )}

          {can(role, 'finance') && (
            <div className="flex items-center gap-2 pt-4 border-t" style={{ borderColor: PASTEL.line }}>
              <button onClick={onEdit} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>
                <Edit3 size={14} className="inline mr-2"/> Edit TTF
              </button>
              <button onClick={onDelete} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: PASTEL.rose, color: '#7A2240' }}>
                <Trash2 size={14}/>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================
// AR Modal
// ============================
function ARModal({ initial, customers, onClose, onSave }) {
  const [data, setData] = useState(initial || {
    noTTF: '', tanggalTTF: '', tanggalMenerima: '',
    noINV: '', noSP: '', customer: '',
    tglPembayaran: '', notes: '',
    btbs: [{ id: `tmp-${Date.now()}`, noBTB: '', dppPPN: 0, pph: 0, payment: 0 }]
  });

  const update = (k, v) => setData({ ...data, [k]: v });
  const updateBTB = (idx, k, v) => {
    const next = [...data.btbs];
    next[idx] = { ...next[idx], [k]: k === 'noBTB' ? v : Number(v) || 0 };
    setData({ ...data, btbs: next });
  };
  const addBTB = () => {
    setData({ ...data, btbs: [...data.btbs, { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, noBTB: '', dppPPN: 0, pph: 0, payment: 0 }] });
  };
  const removeBTB = (idx) => {
    if (data.btbs.length === 1) {
      alert('Minimal harus ada 1 BTB');
      return;
    }
    setData({ ...data, btbs: data.btbs.filter((_, i) => i !== idx) });
  };

  const calc = calcAR(data);
  const activeCustomers = customers.filter(c => c.active !== false);

  const submit = () => {
    if (!data.noTTF.trim()) { alert('No. TTF wajib diisi'); return; }
    if (!data.customer) { alert('Customer wajib dipilih'); return; }
    if (data.btbs.length === 0 || data.btbs.every(b => !b.noBTB.trim())) {
      alert('Minimal harus ada 1 BTB dengan nomor');
      return;
    }
    onSave(data);
  };

  return (
    <ModalShell title={initial ? 'Edit TTF' : 'Add New TTF'} subtitle="Master data Tanda Terima Faktur" onClose={onClose} maxWidth="max-w-4xl">
      <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
        <FormSection label="TTF Information">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input label="No. TTF *" value={data.noTTF} onChange={v=>update('noTTF', v)} placeholder="25E0011001163"/>
            <Input label="Tanggal TTF" type="date" value={data.tanggalTTF} onChange={v=>update('tanggalTTF', v)}/>
            <Input label="Tanggal Menerima" type="date" value={data.tanggalMenerima} onChange={v=>update('tanggalMenerima', v)}/>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Input label="No. INV" value={data.noINV} onChange={v=>update('noINV', v)} placeholder="JKT-251001"/>
            <Input label="No. SP" value={data.noSP} onChange={v=>update('noSP', v)} placeholder="1881279"/>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>Customer *</label>
              <select value={data.customer} onChange={e => update('customer', e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
                style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}>
                <option value="">— Pilih customer —</option>
                {activeCustomers.map(c => <option key={c.id} value={c.name}>{c.code} · {c.name}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection label="Payment">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tanggal Pembayaran" type="date" value={data.tglPembayaran} onChange={v=>update('tglPembayaran', v)}/>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>Status (Auto)</label>
              <div className="rounded-xl px-3.5 py-2.5 text-sm" style={{ background: PASTEL.lineSoft }}>
                <ARStatusBadge status={calc.status} overdue={calc.isOverdue}/>
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection label="BTB Items">
          <div className="space-y-2">
            <div className="grid gap-2 items-center text-[10px] uppercase tracking-wider font-semibold px-2" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1.2fr 1.2fr 1.2fr 32px', color: PASTEL.inkMute }}>
              <div>No. BTB</div>
              <div className="text-right">DPP+PPN</div>
              <div className="text-right">PPH</div>
              <div className="text-right">Total (auto)</div>
              <div className="text-right">Payment</div>
              <div className="text-right">OS (auto)</div>
              <div></div>
            </div>
            {data.btbs.map((b, idx) => {
              const total = (Number(b.dppPPN)||0) + (Number(b.pph)||0);
              const os = total - (Number(b.payment)||0);
              return (
                <div key={b.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: '2fr 1.2fr 1fr 1.2fr 1.2fr 1.2fr 32px' }}>
                  <input value={b.noBTB} onChange={e=>updateBTB(idx,'noBTB',e.target.value)} placeholder="2025-BTB-..."
                    className="rounded-lg px-2.5 py-2 text-xs font-mono focus:outline-none" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}/>
                  <input type="number" value={b.dppPPN} onChange={e=>updateBTB(idx,'dppPPN',e.target.value)}
                    className="rounded-lg px-2.5 py-2 text-xs font-numeric text-right focus:outline-none" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}/>
                  <input type="number" value={b.pph} onChange={e=>updateBTB(idx,'pph',e.target.value)}
                    className="rounded-lg px-2.5 py-2 text-xs font-numeric text-right focus:outline-none" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}/>
                  <div className="rounded-lg px-2.5 py-2 text-xs font-numeric font-semibold text-right" style={{ background: PASTEL.lineSoft }}>
                    {formatRupiah(total)}
                  </div>
                  <input type="number" value={b.payment} onChange={e=>updateBTB(idx,'payment',e.target.value)}
                    className="rounded-lg px-2.5 py-2 text-xs font-numeric text-right focus:outline-none" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}/>
                  <div className="rounded-lg px-2.5 py-2 text-xs font-numeric font-semibold text-right" style={{ background: Math.abs(os) <= 1 ? PASTEL.mint : os > 0 ? PASTEL.peach : PASTEL.rose, color: PASTEL.ink }}>
                    {formatRupiahShort(os)}
                  </div>
                  <button type="button" onClick={() => removeBTB(idx)} className="rounded-lg p-1.5 flex items-center justify-center" style={{ background: PASTEL.rose, color: '#7A2240' }}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addBTB} className="mt-3 px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2" style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>
            <Plus size={13}/> Add BTB
          </button>
          <div className="mt-4 p-4 rounded-2xl space-y-1.5" style={{ background: PASTEL.lineSoft }}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs" style={{ color: PASTEL.inkSoft }}>Total Invoice</span>
              <span className="font-numeric font-semibold">{formatRupiah(calc.totalInvoice)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs" style={{ color: PASTEL.inkSoft }}>Total Payment</span>
              <span className="font-numeric font-semibold" style={{ color: PASTEL.mintDeep }}>{formatRupiah(calc.totalPayment)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t font-semibold" style={{ borderColor: PASTEL.line }}>
              <span className="text-sm">Outstanding</span>
              <span className="font-numeric text-base" style={{ color: Math.abs(calc.totalOS) <= 1 ? PASTEL.mintDeep : calc.totalOS > 0 ? PASTEL.peachDeep : PASTEL.roseDeep }}>{formatRupiah(calc.totalOS)}</span>
            </div>
          </div>
        </FormSection>

        <FormSection label="Notes">
          <textarea value={data.notes} onChange={e=>update('notes', e.target.value)} rows={2}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
            style={{ background: 'white', border: `1px solid ${PASTEL.line}` }} placeholder="Catatan tambahan..."/>
        </FormSection>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-medium" style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}>Cancel</button>
          <button type="button" onClick={submit} className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold" style={{ background: PASTEL.ink, color: PASTEL.cream }}>
            <Save size={14}/> Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

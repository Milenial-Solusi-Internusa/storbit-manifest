import { useState, useMemo, useEffect, useCallback, Suspense, lazy } from 'react';
import {
  LayoutDashboard, FileText, Plus, Truck, Wallet, Clock,
  Search, Download, Upload, Eye, Edit3, Trash2, X,
  Package, AlertTriangle, CheckCircle2,
  ChevronRight, Save, RefreshCw, Calendar, Building2, User,
  ArrowUpDown, ArrowUp, ArrowDown, Sparkles, ChevronLeft, LogOut,
  Database, Bell, ClipboardCheck, BriefcaseBusiness, Landmark, ShoppingCart,
  Boxes, UsersRound, Laptop, BarChart3, Settings, ChevronsUpDown,
  Users, Ship, Receipt, Globe, Link2, Zap, ScrollText, Shield, FolderOpen,
  ChevronDown, Car, Monitor, Sofa, BarChart2, Wrench, FileX, MapPin, Tag,
  ClipboardList, LayoutList, Archive,
} from 'lucide-react';
import { useAuth } from './contexts/useAuth';
import { useCustomers } from './hooks/useCustomers';
import { useSpItems } from './hooks/useSpItems';
import { useTtfs } from './hooks/useTtfs';
import ErrorBoundary from './components/ErrorBoundary';
import { useCustomFields, STANDARD_COLUMNS } from './hooks/useCustomFields';
import CustomFieldsSection from './components/CustomFieldsSection';
const Dashboard      = lazy(() => import('./modules/dashboard/Dashboard'));
const AdminShell        = lazy(() => import('./modules/admin/AdminShell'));
const SchemaManagerPage = lazy(() => import('./modules/admin/pages/SchemaManagerPage'));
const AppLauncher    = lazy(() => import('./modules/launcher/AppLauncher'));
const AssetShell     = lazy(() => import('./modules/assets/AssetShell'));
const HrgaShell      = lazy(() => import('./modules/hrga/HrgaShell'));
const SalesOrderPage       = lazy(() => import('./modules/logistics/SalesOrderPage'));
const SalesOrderDetailPage = lazy(() => import('./modules/logistics/SalesOrderDetailPage'));
const InputSPPage          = lazy(() => import('./modules/logistics/InputSPPage'));
const ProspectListPage     = lazy(() => import('./modules/crm/ProspectListPage'));
const ProspectFormPage     = lazy(() => import('./modules/crm/ProspectFormPage'));
const InquiryListPage      = lazy(() => import('./modules/crm/InquiryListPage'));
const InquiryFormPage      = lazy(() => import('./modules/crm/InquiryFormPage'));
const QuotationFormPage    = lazy(() => import('./modules/crm/QuotationFormPage'));
const QuotationListPage    = lazy(() => import('./modules/crm/QuotationListPage'));
const QuotationDetailPage  = lazy(() => import('./modules/crm/QuotationDetailPage'));
const PipelineKanbanPage   = lazy(() => import('./modules/crm/PipelineKanbanPage'));
const CRMDashboardPage     = lazy(() => import('./modules/crm/CRMDashboardPage'));

// ============================
// PASTEL PALETTE
// ============================
const PASTEL = {
  peach: '#FFD4B8',
  peachDeep: '#F5A78F',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
  mint: '#FFB899',
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

  // Overdue: belum lunas + jarak > 30 hari (kalau belum bayar pakai today vs tanggalMenerima)
  let isOverdue = false;
  if (status !== 'Lunas' && status !== 'Lebih Bayar' && jarakTgl !== null && !ttf.tglPembayaran && jarakTgl > 30) {
    isOverdue = true;
  }

  return { btbs, totalInvoice, totalPayment, totalOS, jarakTgl, status, isOverdue };
};

const ROLES = [
  { id: 'super', label: 'Super Admin' },
  { id: 'operations', label: 'Operations' },   // renamed from 'logistic'
  { id: 'procurement', label: 'Procurement' },
  { id: 'finance', label: 'Finance' },
  { id: 'management', label: 'Management' },
];

const can = (role, action) => {
  const matrix = {
    super: ['view', 'create', 'edit', 'delete', 'shipment', 'finance', 'export', 'import', 'master'],
    operations: ['view', 'shipment', 'export', 'create', 'edit'],   // renamed from 'logistic'
    logistic:   ['view', 'shipment', 'export', 'create', 'edit'],   // legacy alias — keep during transition
    procurement: ['view', 'export', 'edit'],
    finance: ['view', 'finance', 'export'],
    management: ['view', 'export'],
  };
  return matrix[role]?.includes(action);
};

const PLANNED_MODULES = {
  // ── Commercial & CRM ──────────────────────────────────────────────────────
  // Note: 'crm' intentionally NOT in PLANNED_MODULES — CRM pages are live (Phase 2.0C+).
  // Parent click expands the submenu dropdown; no dedicated page for the parent id.
  quotation: {
    title: 'Quotation Management',
    description: 'Build, version, and approve formal quotations with line-item detail, margin visibility, and customer delivery. Linked to inquiry and convertible to Sales Order.',
    capabilities: ['Quotation builder with line items', 'Version and revision control', 'Approval flow per entity', 'Convert to Sales Order'],
  },
  // ── Logistics ─────────────────────────────────────────────────────────────
  job: {
    title: 'Job / Operation Management',
    description: 'Unified job control center for all operational entities. Track job status, milestones, document checklist, and team assignment across MSI, JCI, and Storbit operations.',
    capabilities: ['Job card creation from SP', 'Milestone and status tracking', 'Entity-aware operation queues', 'Document checklist per job'],
  },
  freight: {
    title: 'Freight Forwarding',
    description: 'End-to-end forwarding shipment execution workspace for MSI. Manage booking, BL, cargo tracking, port schedule, and customer shipment notifications in one place.',
    capabilities: ['Booking and BL management', 'Port and carrier schedule', 'Shipment milestone tracking', 'Customer notification automation'],
  },
  ppjk: {
    title: 'PPJK / Customs Clearance',
    description: 'Customs clearance operational control for JCI. Handle PIB/PEB document preparation, duty calculation, customs filing status, and clearance milestone tracking.',
    capabilities: ['PIB / PEB document workspace', 'Duty and levy calculation', 'Customs filing status board', 'Clearance milestone timeline'],
  },
  trading: {
    title: 'General Trading',
    description: 'Trading order and fulfillment workspace for Storbit / SBI. Manage purchase-to-sale flow, order fulfillment, inventory linkage, and customer delivery from a single view.',
    capabilities: ['Order intake and confirmation', 'Purchase-to-sale linkage', 'Fulfillment and delivery tracking', 'Inventory drawdown per order'],
  },
  docHandoff: {
    title: 'Document Handoff',
    description: 'Structured document handoff control between operations, finance, and customer-facing teams. Track document status, acknowledge receipt, and flag missing documents.',
    capabilities: ['Handoff checklist per job', 'Team acknowledgement workflow', 'Missing document alert', 'Digital handoff record'],
  },
  // ── Procurement & Vendor ──────────────────────────────────────────────────
  procRequest: {
    title: 'Procurement Request',
    description: 'Internal purchase request intake with department, budget category, and approval routing. Converts to Purchase Order after approval across all MSI Group entities.',
    capabilities: ['Request form per department', 'Budget category tagging', 'Approval routing by amount', 'Convert approved PR to PO'],
  },
  purchaseOrder: {
    title: 'Purchase Order',
    description: 'Formal PO issuance, vendor confirmation, and goods receipt tracking. Linked to procurement request and vendor invoice for end-to-end procurement visibility.',
    capabilities: ['PO creation from approved PR', 'Vendor confirmation workflow', 'Goods receipt recording', 'Link to vendor invoice'],
  },
  vendors: {
    title: 'Vendor Management',
    description: 'Centralized vendor registry with qualification status, payment terms, contact information, and performance history across procurement and AP workflows.',
    capabilities: ['Vendor registration and profile', 'Qualification and rating', 'Payment terms per vendor', 'Procurement performance history'],
  },
  // ── Inventory & Asset ─────────────────────────────────────────────────────
  inventory: {
    title: 'Inventory / Warehouse',
    description: 'Stock management and warehouse visibility for Storbit / SBI trading operations. Track stock levels, movements, location mapping, and reorder triggers.',
    capabilities: ['Stock balance and location', 'Inbound and outbound movements', 'Reorder point alerts', 'Warehouse location mapping'],
  },
  // Note: 'assets' intentionally NOT in PLANNED_MODULES — AssetShell is live (Phase 2).
  // ── Finance & Accounting ──────────────────────────────────────────────────
  jobCosting: {
    title: 'Job Costing',
    description: 'Cost and revenue ledger per job, shipment, or trading order. Compare budgeted vs actual cost, track profitability per entity, and feed accounting entries automatically.',
    capabilities: ['Cost input per job', 'Revenue vs cost comparison', 'Profitability per entity', 'Accounting entry generation'],
  },
  billing: {
    title: 'Billing / Invoice',
    description: 'Customer invoice generation from approved jobs or sales orders. Manage invoice status, payment tracking, and customer acknowledgement across all entities.',
    capabilities: ['Invoice from job or SP', 'Invoice approval flow', 'Payment status tracking', 'Customer acknowledgement'],
  },
  ap: {
    title: 'AP / Vendor Invoice',
    description: 'Vendor invoice processing, PO matching, and payment approval workflow. Tracks payables aging, payment schedule, and vendor remittance across MSI Group.',
    capabilities: ['Vendor invoice intake', 'PO and GR matching', 'Payment approval workflow', 'Payables aging report'],
  },
  cashBank: {
    title: 'Cash / Bank',
    description: 'Cash and bank transaction register for all MSI Group accounts. Record receipts, payments, reconcile bank statements, and manage petty cash per entity.',
    capabilities: ['Bank account register', 'Receipt and payment recording', 'Bank statement reconciliation', 'Petty cash management'],
  },
  accounting: {
    title: 'Accounting',
    description: 'General ledger, journal entries, trial balance, and financial statement preparation for MSI Group. Linked to AR, AP, payroll, and asset depreciation modules.',
    capabilities: ['Journal entry workspace', 'General ledger view', 'Trial balance report', 'Period-end closing workflow'],
  },
  // ── Service Management ────────────────────────────────────────────────────
  // Note: 'hrga' intentionally NOT in PLANNED_MODULES — HrgaShell is live (Phase 2.0A).
  it: {
    title: 'IT Service Management',
    description: 'IT service management for support tickets, access requests, device inventory, and incident follow-up across MSI Group offices and systems.',
    capabilities: ['Ticket queue and escalation', 'Access request workflow', 'Device inventory linkage', 'Incident timeline'],
  },
  // ── Workflow & Document ───────────────────────────────────────────────────
  approvals: {
    title: 'Approval Center',
    description: 'Reusable approval cockpit for all documents, exceptions, revisions, and delegated approvals across MSI Group. Inbox-style interface with full history.',
    capabilities: ['Pending approval inbox', 'Approval and revision history', 'Delegation and backup approvers', 'Revision request flow'],
  },
  docMgmt: {
    title: 'Document Management',
    description: 'Centralized document storage, version control, and access management for all operational, legal, and finance documents across MSI Group entities.',
    capabilities: ['Document repository', 'Version and revision control', 'Access permission per document', 'Linked to jobs and transactions'],
  },
  // ── Portal & Integration ──────────────────────────────────────────────────
  apiCenter: {
    title: 'API & Integration Center',
    description: 'Internal and external API management for Nexus by MSI. Configure integrations, manage API keys, monitor usage, and review webhook delivery logs.',
    capabilities: ['API key management', 'Webhook configuration', 'Integration health monitor', 'Usage and rate limit dashboard'],
  },
  publicTracking: {
    title: 'Public Tracking API',
    description: 'Secure public shipment tracking endpoint for customers and partners. Returns masked data via token-based access with no internal data exposure.',
    capabilities: ['Token-based tracking access', 'Masked public shipment view', 'Rate limiting per token', 'Tracking request audit log'],
  },
  customerPortal: {
    title: 'Customer Portal',
    description: 'Self-service web portal for customers to track shipments, view invoice status, download documents, and submit inquiries without staff involvement.',
    capabilities: ['Shipment status tracking', 'Invoice and payment view', 'Document download center', 'Inquiry submission'],
  },
  vendorPortal: {
    title: 'Vendor Portal',
    description: 'Self-service portal for vendors to submit invoices, view PO status, confirm deliveries, and manage their profile and payment terms directly.',
    capabilities: ['Invoice submission', 'PO and GR confirmation', 'Payment status view', 'Vendor profile management'],
  },
  // ── Reporting & Governance ────────────────────────────────────────────────
  reports: {
    title: 'Reporting & Dashboard',
    description: 'Consolidated reporting workspace for operations, finance, master data, and management review across all MSI Group entities with role-scoped access.',
    capabilities: ['Cross-entity dashboards', 'Scheduled report packs', 'Export approval control', 'KPI drilldowns'],
  },
  performance: {
    title: 'Performance & Cache Layer',
    description: 'Internal platform performance monitoring for Nexus by MSI. Review query performance, cache hit rates, background job health, and API response benchmarks.',
    capabilities: ['Query performance dashboard', 'Cache hit rate monitoring', 'Background job status', 'API response benchmarks'],
  },
  audit: {
    title: 'Audit & Compliance',
    description: 'Tamper-proof audit trail for all critical actions across Nexus by MSI. Review user activity, data changes, approval history, and export logs per retention policy.',
    capabilities: ['User activity audit trail', 'Data change history', 'Export and download logs', 'Compliance review board'],
  },
  // ── Foundation ────────────────────────────────────────────────────────────
  adminSettings: {
    title: 'Admin Settings',
    description: 'System-wide configuration for Nexus by MSI including notifications, security policies, integration settings, and platform preferences per entity.',
    capabilities: ['Notification configuration', 'Security policy settings', 'Integration setup', 'Platform preferences per entity'],
  },
};

const ERP_MENU_GROUPS = [
  // ── CORE ──────────────────────────────────────────────────────────────────
  {
    label: 'Core',
    items: [
      {
        id: 'dashboard', label: 'Command Center', icon: LayoutDashboard,
        children: [
          { id: 'dashboard',               label: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'dashboard-tasks',         label: 'My Tasks',           icon: ClipboardList   },
          { id: 'dashboard-notifications', label: 'Notifications',      icon: Bell            },
          { id: 'dashboard-activity',      label: 'Recent Activity',    icon: Clock           },
        ],
      },
    ],
  },
  // ── COMMERCIAL & CRM ──────────────────────────────────────────────────────
  {
    label: 'Commercial & CRM',
    items: [
      {
        id: 'crm', label: 'CRM & Inquiry', icon: Users,
        children: [
          { id: 'crm-dashboard', label: 'Dashboard',      icon: BarChart2 },
          { id: 'crm-pipeline',  label: 'Pipeline / Leads', icon: Users   },
          { id: 'crm-inquiry',   label: 'Inquiry',          icon: FileText },
          { id: 'quotation-draft', label: 'Quotation',      icon: Receipt  },
        ],
      },
    ],
  },
  // ── LOGISTICS ─────────────────────────────────────────────────────────────
  {
    label: 'Logistics',
    items: [
      { section: 'Storbit — Trading' },
      {
        id: 'manifest', label: 'Sales Order / SP', icon: Receipt,
        children: [
          { id: 'manifest', label: 'SP Manifest', icon: LayoutList },
          { id: 'input',    label: 'Input SP',    icon: Plus, role: ['super', 'operations', 'logistic'] },
        ],
      },
      {
        id: 'trading', label: 'General Trading', icon: ShoppingCart,
        children: [
          { id: 'trading-transaksi', label: 'Transaksi',     icon: FileText  },
          { id: 'trading-rekap',     label: 'Rekap Trading', icon: BarChart2 },
        ],
      },
      {
        id: 'customers', label: 'Customer Storbit', icon: Building2, role: ['super'],
        children: [
          { id: 'customers',                label: 'Daftar Customer',      icon: Users    },
          { id: 'customer-storbit-kontrak', label: 'Kontrak & Perjanjian', icon: FileText },
          { id: 'customer-storbit-history', label: 'History Transaksi',    icon: Clock    },
        ],
      },
      { section: 'MSI — Freight Forwarding' },
      {
        id: 'job', label: 'Job Management', icon: BriefcaseBusiness,
        children: [
          { id: 'job-semua',   label: 'Semua Job',    icon: LayoutList },
          { id: 'job-aktif',   label: 'Job Aktif',    icon: Clock      },
          { id: 'job-buat',    label: 'Buat Job Baru',icon: Plus       },
          { id: 'job-history', label: 'Job History',  icon: Archive    },
        ],
      },
      {
        id: 'freight', label: 'Freight Forwarding', icon: Ship,
        children: [
          { id: 'freight-fcl', label: 'FCL (Full Container)', icon: Package },
          { id: 'freight-lcl', label: 'LCL (Less Container)', icon: Package },
          { id: 'freight-air', label: 'Air Freight',           icon: Package },
        ],
      },
      {
        id: 'shipment', label: 'Shipment Management', icon: Truck, role: ['super', 'operations', 'logistic'],
        children: [
          { id: 'shipment',         label: 'Tracking Aktif',     icon: Truck    },
          { id: 'shipment-jadwal',  label: 'Jadwal Pengiriman',  icon: Calendar },
          { id: 'shipment-riwayat', label: 'Riwayat Pengiriman', icon: Clock    },
        ],
      },
      {
        id: 'customer-msi', label: 'Customer MSI', icon: Building2,
        children: [
          { id: 'customer-msi-daftar',  label: 'Daftar Customer',      icon: Users    },
          { id: 'customer-msi-kontrak', label: 'Kontrak & Perjanjian', icon: FileText },
          { id: 'customer-msi-history', label: 'History Transaksi',    icon: Clock    },
        ],
      },
      { section: 'JCI — PPJK / Customs' },
      {
        id: 'ppjk-impor', label: 'Pengurusan Impor', icon: ClipboardCheck,
        children: [
          { id: 'ppjk-pib',            label: 'PIB',            icon: FileText },
          { id: 'ppjk-bc23',           label: 'BC 2.3',         icon: FileText },
          { id: 'ppjk-impor-tracking', label: 'Tracking Impor', icon: Truck    },
        ],
      },
      {
        id: 'ppjk-ekspor', label: 'Pengurusan Ekspor', icon: ClipboardCheck,
        children: [
          { id: 'ppjk-peb',             label: 'PEB',             icon: FileText },
          { id: 'ppjk-bc30',            label: 'BC 3.0',          icon: FileText },
          { id: 'ppjk-ekspor-tracking', label: 'Tracking Ekspor', icon: Truck    },
        ],
      },
      {
        id: 'ppjk', label: 'Manifest & BCF', icon: ClipboardCheck,
        children: [
          { id: 'ppjk-bc11',     label: 'BC 1.1',       icon: FileText   },
          { id: 'ppjk-manifest', label: 'Manifest List', icon: LayoutList },
        ],
      },
      {
        id: 'ppjk-trucking', label: 'Jasa Trucking', icon: Truck,
        children: [
          { id: 'ppjk-trucking-order',   label: 'Order Trucking',   icon: ShoppingCart },
          { id: 'ppjk-trucking-jadwal',  label: 'Jadwal Trucking',  icon: Calendar     },
          { id: 'ppjk-trucking-riwayat', label: 'Riwayat Trucking', icon: Clock        },
        ],
      },
      {
        id: 'customer-jci', label: 'Customer JCI', icon: Building2,
        children: [
          { id: 'customer-jci-daftar',  label: 'Daftar Customer',      icon: Users    },
          { id: 'customer-jci-kontrak', label: 'Kontrak & Perjanjian', icon: FileText },
          { id: 'customer-jci-history', label: 'History Transaksi',    icon: Clock    },
        ],
      },
    ],
  },
  // ── PROCUREMENT & VENDOR ──────────────────────────────────────────────────
  {
    label: 'Procurement & Vendor',
    items: [
      { section: 'Direct Procurement' },
      {
        id: 'procRequest', label: 'Procurement Request', icon: ClipboardCheck,
        children: [
          { id: 'procRequest-semua',   label: 'Semua Request',   icon: LayoutList },
          { id: 'procRequest-buat',    label: 'Buat Request',    icon: Plus       },
          { id: 'procRequest-pending', label: 'Pending Approval',icon: Clock      },
          { id: 'procRequest-arsip',   label: 'Arsip',           icon: Archive    },
        ],
      },
      {
        id: 'purchaseOrder', label: 'Purchase Order', icon: ShoppingCart,
        children: [
          { id: 'purchaseOrder-semua',   label: 'Semua PO',        icon: LayoutList },
          { id: 'purchaseOrder-buat',    label: 'Buat PO',         icon: Plus       },
          { id: 'purchaseOrder-pending', label: 'Pending Approval',icon: Clock      },
          { id: 'purchaseOrder-history', label: 'PO History',      icon: Archive    },
        ],
      },
      { section: 'Indirect Procurement' },
      {
        id: 'vendors', label: 'Vendor Management', icon: Users,
        children: [
          { id: 'vendors-daftar',    label: 'Daftar Vendor',   icon: Users    },
          { id: 'vendors-evaluasi',  label: 'Evaluasi Vendor', icon: BarChart2},
          { id: 'vendors-kontrak',   label: 'Kontrak Vendor',  icon: FileText },
          { id: 'vendors-blacklist', label: 'Blacklist Vendor',icon: FileX    },
        ],
      },
    ],
  },
  // ── INVENTORY & ASSET ─────────────────────────────────────────────────────
  {
    label: 'Inventory & Asset',
    items: [
      { section: 'Inventory / Warehouse' },
      {
        id: 'inventory', label: 'Inventory / Warehouse', icon: Boxes,
        children: [
          { id: 'inventory-dashboard',   label: 'Dashboard Inventory',   icon: LayoutDashboard },
          { id: 'inventory-stok',        label: 'Stok Barang',           icon: Package         },
          { id: 'inventory-penerimaan',  label: 'Penerimaan Barang',     icon: Download        },
          { id: 'inventory-pengeluaran', label: 'Pengeluaran Barang',    icon: Upload          },
          { id: 'inventory-transfer',    label: 'Transfer Stok',         icon: ArrowUpDown     },
          { id: 'inventory-opname',      label: 'Opname / Adjustment',   icon: ClipboardCheck  },
          { id: 'inventory-kategori',    label: 'Kategori & Master Item',icon: Tag             },
        ],
      },
      { section: 'Asset Management' },
      {
        id: 'assets', label: 'Asset Management', icon: Package,
        children: [
          { id: 'assets',             label: 'Dashboard',           icon: LayoutDashboard },
          { id: 'assets-analytics',   label: 'Analytics & Reports', icon: BarChart2       },
          { section: 'Assets' },
          { id: 'assets-kendaraan',   label: 'Kendaraan',           icon: Car              },
          { id: 'assets-it',          label: 'IT Equipment',        icon: Monitor, badge: '128' },
          { id: 'assets-furniture',   label: 'Furniture & Office',  icon: Sofa             },
          { id: 'assets-properti',    label: 'Properti',            icon: Building2        },
          { section: 'Maintenance' },
          { id: 'assets-maint',       label: 'Jadwal Maintenance',  icon: Wrench           },
          { id: 'assets-hist',        label: 'History Maintenance', icon: Clock            },
          { id: 'assets-workorders',  label: 'Work Orders',         icon: FolderOpen, badge: '6' },
          { section: 'Dokumen' },
          { id: 'assets-docs',        label: 'Semua Dokumen',       icon: FolderOpen       },
          { id: 'assets-expiring',    label: 'Akan Expired',        icon: Clock,  badge: '9' },
          { id: 'assets-expired',     label: 'Sudah Expired',       icon: FileX,  badge: '4' },
          { section: 'Administration' },
          { id: 'assets-kategori',    label: 'Kategori Aset',       icon: Tag              },
          { id: 'assets-lokasi',      label: 'Lokasi & Ruangan',    icon: MapPin           },
          { id: 'assets-vendor',      label: 'Vendor & Supplier',   icon: Truck            },
          { id: 'assets-settings',    label: 'Settings',            icon: Settings         },
        ],
      },
    ],
  },
  // ── FINANCE & ACCOUNTING ──────────────────────────────────────────────────
  {
    label: 'Finance & Accounting',
    items: [
      { section: 'Transaksi' },
      { id: 'jobCosting',  label: 'Job Costing',         icon: Receipt                                              },
      { id: 'billing',     label: 'Billing / Invoice',   icon: FileText                                             },
      { id: 'ar',          label: 'AR / Collection',     icon: Wallet,   role: ['super', 'finance']                 },
      { id: 'ap',          label: 'AP / Vendor Invoice', icon: Wallet                                               },
      { section: 'Keuangan' },
      { id: 'cashBank',    label: 'Cash / Bank',         icon: Landmark                                             },
      { id: 'accounting',  label: 'Accounting',          icon: BarChart3                                            },
      { id: 'outstanding', label: 'Outstanding',         icon: Clock,    role: ['super', 'finance', 'management']   },
      { section: 'Dokumen' },
      { id: 'finance',     label: 'Finance Docs',        icon: FileText, role: ['super', 'finance']                 },
    ],
  },
  // ── SERVICE MANAGEMENT ────────────────────────────────────────────────────
  {
    label: 'Service Management',
    items: [
      { section: 'HRGA Request' },
      {
        id: 'hrga', label: 'HRGA Request', icon: UsersRound,
        children: [
          { id: 'hrga',                  label: 'My Requests',      icon: ClipboardList        },
          { id: 'hrga-buat-request',     label: 'Buat Request',     icon: Plus                 },
          { section: 'Management' },
          { id: 'hrga-semua-request',    label: 'Semua Request',    icon: LayoutList           },
          { id: 'hrga-pending-approval', label: 'Pending Approval', icon: Clock,    badge: '' },
          { id: 'hrga-arsip',            label: 'Arsip',            icon: Archive              },
        ],
      },
      { section: 'IT Service Mgmt' },
      {
        id: 'it', label: 'IT Service Mgmt', icon: Laptop,
        children: [
          { section: 'Karyawan' },
          { id: 'it-tickets',  label: 'My Tickets',      icon: ClipboardList },
          { id: 'it-buat',     label: 'Buat Tiket',      icon: Plus          },
          { section: 'Management' },
          { id: 'it-semua',    label: 'Semua Tiket',     icon: LayoutList    },
          { id: 'it-pending',  label: 'Pending Approval',icon: Clock         },
          { id: 'it-arsip',    label: 'Arsip',           icon: Archive       },
          { section: 'Master Data' },
          { id: 'it-kategori', label: 'Kategori Tiket',  icon: Tag           },
          { id: 'it-sla',      label: 'SLA & Assignment',icon: Settings      },
        ],
      },
    ],
  },
  // ── WORKFLOW & DOCUMENT ───────────────────────────────────────────────────
  {
    label: 'Workflow & Document',
    items: [
      { section: 'Approval' },
      {
        id: 'approvals', label: 'Approval Center', icon: ClipboardCheck,
        children: [
          { section: 'Approval Center' },
          { id: 'approvals-pending',       label: 'Pending Approval',  icon: Clock        },
          { id: 'approvals-processed',     label: 'Sudah Diproses',    icon: CheckCircle2 },
          { id: 'approvals-delegasi',      label: 'Delegasi Approval', icon: Users        },
          { section: 'Template' },
          { id: 'approvals-template',      label: 'Semua Template',    icon: LayoutList   },
          { id: 'approvals-template-buat', label: 'Buat Template',     icon: Plus         },
        ],
      },
      { section: 'Dokumen' },
      {
        id: 'docMgmt', label: 'Document Management', icon: FolderOpen,
        children: [
          { id: 'docMgmt-semua',    label: 'Semua Dokumen',   icon: FolderOpen },
          { id: 'docMgmt-upload',   label: 'Upload Dokumen',  icon: Upload     },
          { id: 'docMgmt-kategori', label: 'Kategori Dokumen',icon: Tag        },
          { id: 'docMgmt-arsip',    label: 'Arsip',           icon: Archive    },
        ],
      },
    ],
  },
  // ── PORTAL & INTEGRATION ──────────────────────────────────────────────────
  {
    label: 'Portal & Integration',
    items: [
      { section: 'Portal' },
      {
        id: 'customerPortal', label: 'Customer Portal', icon: Globe,
        children: [
          { id: 'customerPortal-dashboard', label: 'Dashboard Customer', icon: LayoutDashboard },
          { id: 'customerPortal-tracking',  label: 'Tracking Order',     icon: Truck           },
          { id: 'customerPortal-history',   label: 'History Transaksi',  icon: Clock           },
        ],
      },
      {
        id: 'vendorPortal', label: 'Vendor Portal', icon: Users,
        children: [
          { id: 'vendorPortal-dashboard', label: 'Dashboard Vendor',  icon: LayoutDashboard },
          { id: 'vendorPortal-po',        label: 'PO Masuk',          icon: ShoppingCart    },
          { id: 'vendorPortal-invoice',   label: 'Invoice Submission',icon: Receipt         },
        ],
      },
      { section: 'Integration' },
      {
        id: 'apiCenter', label: 'API & Integration', icon: Link2,
        children: [
          { id: 'apiCenter-keys',    label: 'API Keys',      icon: Settings   },
          { id: 'apiCenter-webhook', label: 'Webhook',       icon: Zap        },
          { id: 'apiCenter-log',     label: 'Log Integrasi', icon: ScrollText },
        ],
      },
      {
        id: 'publicTracking', label: 'Public Tracking', icon: Globe,
        children: [
          { id: 'publicTracking-page',     label: 'Tracking Page',     icon: Globe    },
          { id: 'publicTracking-settings', label: 'Settings Tracking', icon: Settings },
        ],
      },
    ],
  },
  // ── REPORTING & GOVERNANCE ────────────────────────────────────────────────
  {
    label: 'Reporting & Governance',
    items: [
      { section: 'Reporting' },
      {
        id: 'reports', label: 'Reporting & Dashboard', icon: BarChart3,
        children: [
          { id: 'reports-executive',   label: 'Executive Dashboard', icon: LayoutDashboard },
          { id: 'reports-operasional', label: 'Laporan Operasional', icon: BarChart2       },
          { id: 'reports-keuangan',    label: 'Laporan Keuangan',    icon: Wallet          },
          { id: 'reports-custom',      label: 'Custom Report',       icon: FileText        },
        ],
      },
      {
        id: 'performance', label: 'Performance & Cache', icon: Zap,
        children: [
          { id: 'performance-system', label: 'System Performance', icon: Zap      },
          { id: 'performance-cache',  label: 'Cache Management',   icon: Database },
        ],
      },
      { section: 'Governance' },
      {
        id: 'audit', label: 'Audit & Compliance', icon: ScrollText,
        children: [
          { id: 'audit-log',        label: 'Audit Log',         icon: ScrollText },
          { id: 'audit-activity',   label: 'User Activity',     icon: Users      },
          { id: 'audit-compliance', label: 'Compliance Report', icon: Shield     },
        ],
      },
    ],
  },
  // ── FOUNDATION ────────────────────────────────────────────────────────────
  {
    label: 'Foundation',
    items: [
      { section: 'Master Data' },
      { id: 'admin',         label: 'Master Data',    icon: Database, role: ['super'] },
      { id: 'schema-manager',label: 'Schema Manager', icon: Database, role: ['super', 'super_admin'] },
      { section: 'Admin Settings' },
      { id: 'adminSettings', label: 'Admin Settings', icon: Settings, role: ['super'] },
    ],
  },
];

const canSeeMenuItem = (item, role) => item.section || !item.role || item.role.includes(role);


// ============================
// Sidebar Helper Components
// ============================
function SidebarItem({ item, activeMenu, setActiveMenu }) {
  const Icon = item.icon;
  const active = activeMenu === item.id;
  // Item is "parent-active" when it has children and any child (or itself) matches
  const childActive = item.children?.some(c => !c.section && activeMenu === c.id);
  const expanded = item.children && (active || childActive);

  if (item.children) {
    // Parent item with expandable children
    return (
      <div>
        <button
          onClick={() => setActiveMenu(item.id)}
          className="w-full flex items-center gap-3 px-3.5 py-[10px] rounded-2xl text-sm font-medium mb-0.5 transition-all"
          style={{
            background: (active || childActive) ? 'rgba(255,255,255,0.10)' : 'transparent',
            color: (active || childActive) ? '#FFFDF7' : 'rgba(248,245,237,0.76)',
            fontWeight: (active || childActive) ? 600 : 400,
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => { if (!active && !childActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
          onMouseLeave={(e) => { if (!active && !childActive) e.currentTarget.style.background = 'transparent'; }}
        >
          <Icon size={17} strokeWidth={(active || childActive) ? 2.1 : 1.8} style={{ color: (active || childActive) ? '#FFB899' : 'rgba(248,245,237,0.54)', flexShrink: 0 }}/>
          <span className="flex-1 text-left leading-snug">{item.label}</span>
          <ChevronDown size={13} strokeWidth={2} style={{
            color: 'rgba(248,245,237,0.40)', flexShrink: 0,
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform .15s',
          }}/>
        </button>
        {expanded && (
          <div style={{
            marginLeft: 14, paddingLeft: 10,
            marginBottom: 4,
          }}>
            {item.children.map((child, ci) => {
              if (child.section) {
                return (
                  <div key={`sec-${ci}`} style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '.7px',
                    textTransform: 'uppercase', color: 'rgba(248,245,237,0.35)',
                    padding: '10px 8px 4px',
                  }}>
                    {child.section}
                  </div>
                );
              }
              const ChildIcon = child.icon;
              const childIsActive = activeMenu === child.id;
              return (
                <button
                  key={child.id}
                  onClick={() => setActiveMenu(child.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-[13px] font-medium mb-[1px] transition-all"
                  style={{
                    background: childIsActive ? 'rgba(255,255,255,0.13)' : 'transparent',
                    color: childIsActive ? '#FFFDF7' : 'rgba(248,245,237,0.65)',
                    fontWeight: childIsActive ? 600 : 400,
                    boxShadow: childIsActive ? 'inset 2px 0 0 rgba(255,212,184,0.7)' : 'none',
                    border: childIsActive ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { if (!childIsActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { if (!childIsActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {ChildIcon
                    ? <ChildIcon size={14} strokeWidth={childIsActive ? 2.1 : 1.7} style={{ color: childIsActive ? '#FFB899' : 'rgba(248,245,237,0.45)', flexShrink: 0 }} />
                    : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: childIsActive ? 1 : .45, flexShrink: 0 }} />
                  }
                  <span className="flex-1 truncate">{child.label}</span>
                  {child.badge && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 20,
                      background: 'rgba(143,203,140,.18)', color: 'rgba(168,214,168,.9)',
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}>{child.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Regular item (no children)
  return (
    <button
      onClick={() => setActiveMenu(item.id)}
      className="w-full flex items-center gap-3 px-3.5 py-[10px] rounded-2xl text-sm font-medium mb-0.5 transition-all"
      style={{
        background: active ? 'rgba(255,255,255,0.13)' : 'transparent',
        color: active ? '#FFFDF7' : 'rgba(248,245,237,0.76)',
        fontWeight: active ? 600 : 400,
        boxShadow: active ? 'inset 2px 0 0 rgba(255,212,184,0.8), 0 8px 20px rgba(0,0,0,0.12)' : 'none',
        border: active ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} style={{ color: active ? '#FFB899' : 'rgba(248,245,237,0.54)', flexShrink: 0 }}/>
      <span className="flex-1 text-left leading-snug">{item.label}</span>
    </button>
  );
}




// ─────────────────────────────────────────────────────────────────────────────
// ModuleSidebar — shown inside a module (Option B layout).
// Replaces the global accordion sidebar. Renders only the active module's items
// plus a "← Apps" button to return to the launcher.
// ─────────────────────────────────────────────────────────────────────────────
function ModuleSidebar({ moduleGroup, activeMenu, onNavigate, onBackToApps, role }) {
  const visibleItems = (moduleGroup?.items || []).filter(item => canSeeMenuItem(item, role));
  const Icon = moduleGroup?.items[0]?.icon;

  return (
    <aside
      className="hidden lg:flex flex-col w-[260px] flex-shrink-0 sticky top-0 h-screen border-r"
      style={{
        background: 'linear-gradient(165deg, #144682 0%, #0f3366 100%)',
        borderColor: 'rgba(255,255,255,0.12)',
        color: '#F8F5ED',
      }}
    >
      {/* Back to Apps */}
      <button
        onClick={onBackToApps}
        className="flex items-center gap-2 mx-3 mt-4 mb-1 px-3 py-2.5 rounded-xl transition-all text-sm font-medium flex-shrink-0"
        style={{ color: 'rgba(248,245,237,0.60)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#FFFDF7'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(248,245,237,0.60)'; }}
      >
        <LayoutDashboard size={14} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <span className="text-xs uppercase tracking-[0.14em] font-semibold">Apps</span>
      </button>

      {/* Module identity */}
      <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
        <div className="flex items-center gap-2.5">
          {Icon && <Icon size={16} strokeWidth={1.8} style={{ color: 'rgba(200,239,217,0.70)', flexShrink: 0 }} />}
          <span className="text-sm font-semibold leading-snug" style={{ color: '#FFFDF7' }}>
            {moduleGroup?.label}
          </span>
        </div>
      </div>

      {/* Module items */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {visibleItems.map((item, i) => {
          if (item.section) {
            return (
              <div key={`sec-${i}`} style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '.7px',
                textTransform: 'uppercase', color: 'rgba(248,245,237,0.35)',
                padding: '10px 8px 4px',
              }}>
                {item.section}
              </div>
            );
          }
          return (
            <SidebarItem
              key={item.id}
              item={item}
              activeMenu={activeMenu}
              setActiveMenu={onNavigate}
            />
          );
        })}
      </nav>
    </aside>
  );
}

// ============================
// Main App
// ============================
export default function StorbitManifest() {
  const { customers, saveCustomer: dbSaveCustomer, removeCustomer: dbRemoveCustomer } = useCustomers();
  const {
    rows,
    saveRow: dbSaveRow,
    removeRow: dbRemoveRow,
    removeRowsBySp: dbRemoveRowsBySp,
    bulkAdd: dbBulkAdd,
  } = useSpItems({ customers });
  const { arData, saveTtf: dbSaveTtf, removeTtf: dbRemoveTtf } = useTtfs({ customers });
  const loading = false;
  const [activeModule, setActiveModule] = useState(null); // null = app launcher
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [activeAssetId, setActiveAssetId] = useState(null);  // for assets-detail page
  const [selectedSpId, setSelectedSpId]   = useState(null);  // SP detail page
  const [showInputSP,  setShowInputSP]    = useState(false); // Input SP form
  const [prevAssetMenu, setPrevAssetMenu] = useState('assets-it'); // where to go back from detail
  // CRM module state
  const [showProspectForm,  setShowProspectForm]  = useState(false);
  const [editingProspect,   setEditingProspect]   = useState(null);
  const [showInquiryForm,   setShowInquiryForm]   = useState(false);
  const [showQuotationForm,   setShowQuotationForm]   = useState(false);
  const [crmQuotationDetail, setCrmQuotationDetail] = useState(null);  // quotation row for detail page
  const [editingQuotation,   setEditingQuotation]   = useState(null);  // quotation row for edit mode
  const { role: authRole, profile, signOut } = useAuth();
  const role = authRole || 'management';

  // Navigate to a specific menu item, auto-detecting which module group it belongs to.
  // This keeps activeModule in sync when navigating from topbar buttons / deep links.
  const navigateTo = useCallback((menuId) => {
    const group = ERP_MENU_GROUPS.find(g =>
      g.items.some(i => i.id === menuId || i.children?.some(c => c.id === menuId))
    );
    if (group) setActiveModule(group.label);
    setActiveMenu(menuId);
    // Reset CRM sub-page state when navigating to a different menu
    setShowProspectForm(false);
    setEditingProspect(null);
    setShowInquiryForm(false);
    setShowQuotationForm(false);
    setCrmQuotationDetail(null);
    setEditingQuotation(null);
  }, []);

  // Navigate to asset detail — called by list pages on row click.
  const navigateToAssetDetail = useCallback((assetId) => {
    setPrevAssetMenu(activeMenu);
    setActiveAssetId(assetId);
    const group = ERP_MENU_GROUPS.find(g =>
      g.items.some(i => i.id === 'assets' || i.id?.startsWith('assets-') ||
        i.children?.some(c => c.id === 'assets' || c.id?.startsWith('assets-')))
    );
    if (group) setActiveModule(group.label);
    setActiveMenu('assets-detail');
  }, [activeMenu]);

  // Go back from asset detail to the previous asset list page.
  const backFromAssetDetail = useCallback(() => {
    setActiveAssetId(null);
    setActiveMenu(prevAssetMenu);
  }, [prevAssetMenu]);

  // Return to app launcher.
  const goToLauncher = useCallback(() => setActiveModule(null), []);

  // Enter a module group — select the first visible non-section item in that group.
  const enterModule = useCallback((group) => {
    const first = group.items.find(item => !item.section && canSeeMenuItem(item, role));
    if (!first) return;
    setActiveModule(group.label);
    setActiveMenu(first.id);
  }, [role]);
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

  // SP list filters — setters kept for future SP detail / legacy support (SalesOrderPage handles its own state)
  // eslint-disable-next-line no-unused-vars
  const [search, setSearch] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [filterStatus, setFilterStatus] = useState('all');
  // eslint-disable-next-line no-unused-vars
  const [filterDC, setFilterDC] = useState('all');
  // eslint-disable-next-line no-unused-vars
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  // eslint-disable-next-line no-unused-vars
  const [filterOverdue, setFilterOverdue] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [sortBy, setSortBy] = useState({ field: 'spDate', dir: 'desc' });

  // AR-specific filters
  const [arFilterCustomer, setArFilterCustomer] = useState('all');
  const [arFilterStatus, setArFilterStatus] = useState('all');
  const [arSearch, setArSearch] = useState('');
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  // Close profile dropdown on Escape
  useEffect(() => {
    if (!profileDropdownOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setProfileDropdownOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [profileDropdownOpen]);

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

  // filteredSP kept for potential reuse; SalesOrderPage handles its own filtering
  // eslint-disable-next-line no-unused-vars
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
    try {
      const isUpdate = data.id && rows.find(r => r.id === data.id);
      await dbSaveRow(data);
      showToast(isUpdate ? 'Data berhasil diupdate ✨' : 'Data berhasil ditambahkan ✨');
      setEditingRow(null);
      setShipmentRow(null);
      setFinanceRow(null);
      setShowAdd(false);
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err.message || 'unknown error'), 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Yakin hapus item ini?')) return;
    try {
      await dbRemoveRow(id);
      showToast('Item dihapus');
    } catch (err) {
      showToast('Gagal hapus: ' + (err.message || 'unknown error'), 'error');
    }
  };

  const handleDeleteSP = async (spNo) => {
    if (!confirm(`Yakin hapus seluruh SP ${spNo}? Semua item akan terhapus.`)) return;
    try {
      await dbRemoveRowsBySp(spNo);
      setViewingSP(null);
      showToast(`SP ${spNo} dihapus`);
    } catch (err) {
      showToast('Gagal hapus SP: ' + (err.message || 'unknown error'), 'error');
    }
  };

  const handleImport = async (importedRows) => {
    try {
      await dbBulkAdd(importedRows);
      showToast(`${importedRows.length} baris berhasil diimport`);
      setShowImport(false);
    } catch (err) {
      showToast('Gagal import: ' + (err.message || 'unknown error'), 'error');
    }
  };

  const handleSaveCustomer = async (data) => {
    try {
      const isUpdate = data.id && customers.find(c => c.id === data.id);
      await dbSaveCustomer(data);
      showToast(isUpdate ? 'Customer berhasil diupdate ✨' : 'Customer berhasil ditambahkan ✨');
      setEditingCustomer(null);
      setShowAddCustomer(false);
    } catch (err) {
      showToast('Gagal menyimpan customer: ' + (err.message || 'unknown error'), 'error');
    }
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
    try {
      await dbRemoveCustomer(id);
      showToast('Customer dihapus');
    } catch (err) {
      showToast('Gagal hapus customer: ' + (err.message || 'unknown error'), 'error');
    }
  };

  const handleSaveAR = async (data) => {
    try {
      const isUpdate = data.id && arData.find(a => a.id === data.id);
      await dbSaveTtf(data);
      showToast(isUpdate ? 'AR data berhasil diupdate ✨' : 'AR data berhasil ditambahkan ✨');
      setEditingAR(null);
      setShowAddAR(false);
    } catch (err) {
      showToast('Gagal menyimpan AR: ' + (err.message || 'unknown error'), 'error');
    }
  };

  const handleDeleteAR = async (id) => {
    const ttf = arData.find(a => a.id === id);
    if (!ttf) return;
    if (!confirm(`Yakin hapus TTF ${ttf.noTTF}? Beserta ${ttf.btbs?.length || 0} BTB items.`)) return;
    try {
      await dbRemoveTtf(id);
      setViewingAR(null);
      showToast('TTF dihapus');
    } catch (err) {
      showToast('Gagal hapus TTF: ' + (err.message || 'unknown error'), 'error');
    }
  };

  const handleResetData = async () => {
    showToast('Reset data tidak tersedia di mode multi-user. Hubungi admin.', 'error');
  };

  const handleClearAll = async () => {
    showToast('Clear all tidak tersedia di mode multi-user. Hubungi admin.', 'error');
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

  const visibleMenuGroups = ERP_MENU_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => canSeeMenuItem(item, role)) }))
    .filter(group => group.items.some(i => !i.section));
  const visibleMenus = visibleMenuGroups.flatMap(group => group.items.filter(i => !i.section));
  // eslint-disable-next-line no-unused-vars
  const activeMenuItem = visibleMenus.find(item => item.id === activeMenu) || visibleMenus[0];
  // The group corresponding to the currently active module (null in launcher mode).
  const activeModuleGroup = activeModule
    ? visibleMenuGroups.find(g => g.label === activeModule) ?? null
    : null;
  const currentRoleLabel = ROLES.find(r => r.id === role)?.label || role;

  return (
    <div className="min-h-screen" style={{ background: PASTEL.cream, color: PASTEL.ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        body { font-family: 'Inter', system-ui, sans-serif; }
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
        .nexus-main-surface .rounded-3xl {
          box-shadow: 0 14px 34px rgba(15, 42, 35, 0.045);
        }
        .nexus-main-surface table {
          min-width: 100%;
        }
        .nexus-command-button {
          box-shadow: 0 10px 24px rgba(15, 42, 35, 0.055);
        }
        .nexus-cmd-btn {
          transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.1s ease;
        }
        .nexus-cmd-btn:hover {
          background: ${PASTEL.line} !important;
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(15,42,35,0.08) !important;
        }
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-dropdown { animation: dropdownIn 0.14s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes accordionDown {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .nexus-sidebar-children { animation: accordionDown 0.14s ease-out; }
        .nexus-shell-bg {
          background:
            radial-gradient(circle at top left, rgba(200, 239, 217, 0.26), transparent 34rem),
            linear-gradient(135deg, #FBF7EF 0%, #F6F1E8 42%, #F8FAF7 100%);
        }
      `}</style>

      {/* LAYOUT: Sidebar + Content */}
      <div className="flex min-h-screen">
        {/* SIDEBAR — only visible when inside a module (Option B: sidebar-after-launcher) */}
        {activeModule && (
          <ModuleSidebar
            moduleGroup={activeModuleGroup}
            activeMenu={activeMenu}
            onNavigate={navigateTo}
            onBackToApps={goToLauncher}
            role={role}
          />
        )}

        {/* MOBILE TOPBAR */}
        <header className="lg:hidden sticky top-0 z-30 border-b backdrop-blur w-full" style={{ borderColor: 'rgba(15,42,35,0.12)', background: 'rgba(250, 246, 240, 0.94)' }}>
          <div className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: PASTEL.ink }}>
                <Package size={17} style={{ color: 'white' }} strokeWidth={2}/>
              </div>
              <div>
                <h1 className="font-display text-lg font-semibold leading-tight">Nexus by MSI</h1>
                <p className="text-[8px] uppercase tracking-[0.14em] font-semibold leading-tight" style={{ color: PASTEL.inkMute }}>Unified Business Core</p>
              </div>
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
                  onClick={() => navigateTo(m.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
                  style={{
                    background: active ? PASTEL.ink : 'transparent',
                    color: active ? PASTEL.ink : PASTEL.inkSoft,
                  }}
                >
                  <Icon size={13} style={{ color: active ? 'white' : PASTEL.inkSoft }}/><span style={{ color: active ? 'white' : PASTEL.inkSoft }}>{m.label}</span>
                </button>
              );
            })}
          </nav>
        </header>

        {/* MAIN CONTENT */}
        <main className="nexus-shell-bg flex-1 min-w-0 w-full overflow-x-hidden">
          {/* ── DESKTOP STICKY TOPBAR ── */}
          <header className="hidden lg:block sticky top-0 z-20 border-b"
            style={{ borderColor: '#E8E0D4', background: '#FAFAF8', boxShadow: '0 1px 4px rgba(20,32,28,0.06)' }}
          >
            <div className="flex min-h-[68px] items-center gap-3 px-5 sm:px-7 xl:px-9">

              {/* ── LEFT: MSI logo ── */}
              <div className="lg:shrink-0">
                <img
                  src="https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png"
                  height="36"
                  alt="MSI"
                  style={{ height: '36px', width: 'auto', objectFit: 'contain', maxWidth: '120px', display: 'block' }}
                />
              </div>

              {/* ── CENTER: search ── */}
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: PASTEL.inkMute }}/>
                  <input
                    type="text"
                    placeholder="Search SP, shipment, invoice, customer, asset, ticket..."
                    className="w-full pl-10 pr-4 text-sm outline-none transition-all"
                    style={{
                      height: '42px',
                      background: PASTEL.lineSoft,
                      border: '1px solid transparent',
                      borderRadius: '12px',
                      color: PASTEL.ink,
                    }}
                    onFocus={e => {
                      e.currentTarget.style.background = 'white';
                      e.currentTarget.style.borderColor = '#E8DED0';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,32,28,0.06)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.background = PASTEL.lineSoft;
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* ── RIGHT: actions ── */}
              <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:shrink-0">

                {/* Entity selector */}
                <button type="button"
                  className="nexus-cmd-btn inline-flex items-center gap-1.5 rounded-[10px] border px-3 text-xs font-semibold shrink-0"
                  style={{ background: PASTEL.lineSoft, borderColor: '#E8DED0', color: PASTEL.inkSoft, height: '36px' }}>
                  <Building2 size={13} style={{ color: PASTEL.inkMute }}/>
                  <span className="hidden xl:inline">MSI / JCI / Storbit</span>
                  <span className="xl:hidden">Entity</span>
                  <ChevronsUpDown size={11} style={{ color: PASTEL.inkMute }}/>
                </button>

                {/* Pending Approval */}
                <button type="button" onClick={() => navigateTo('approvals')}
                  className="nexus-cmd-btn inline-flex items-center gap-1.5 rounded-[10px] border px-3 text-xs font-semibold shrink-0"
                  style={{ background: PASTEL.lineSoft, borderColor: '#E8DED0', color: PASTEL.inkSoft, height: '36px' }}>
                  <ClipboardCheck size={13} style={{ color: PASTEL.inkMute }}/>
                  <span className="hidden xl:inline">Pending Approval</span>
                  <span className="xl:hidden">Approvals</span>
                </button>

                {/* Notifications */}
                <button type="button" title="Notifications"
                  className="nexus-cmd-btn inline-flex items-center justify-center rounded-[10px] border shrink-0"
                  style={{ background: PASTEL.lineSoft, borderColor: '#E8DED0', width: '36px', height: '36px' }}>
                  <Bell size={14} style={{ color: PASTEL.inkSoft }}/>
                </button>

                {/* Profile dropdown trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProfileDropdownOpen(o => !o)}
                    className="nexus-cmd-btn inline-flex items-center gap-2 rounded-[10px] border px-2.5 max-w-[190px]"
                    style={{
                      background: profileDropdownOpen ? PASTEL.line : PASTEL.lineSoft,
                      borderColor: profileDropdownOpen ? 'rgba(15,42,35,0.2)' : '#E8DED0',
                      boxShadow: profileDropdownOpen ? '0 0 0 3px rgba(15,42,35,0.06)' : undefined,
                      height: '36px',
                    }}
                  >
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{ background: 'linear-gradient(135deg, #144682, #1a5299)', color: '#FFB899' }}>
                      {(profile?.full_name || 'U')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 hidden sm:block text-left overflow-hidden">
                      <div className="text-[11px] font-semibold truncate" style={{ color: PASTEL.ink }}>
                        {profile?.full_name || 'User'}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider truncate" style={{ color: PASTEL.inkMute }}>
                        {currentRoleLabel}
                      </div>
                    </div>
                    <ChevronRight size={12} className="shrink-0 hidden sm:block ml-auto"
                      style={{ color: PASTEL.inkMute, transform: profileDropdownOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}/>
                  </button>

                  {/* Dropdown */}
                  {profileDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)}/>
                      <div
                        className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-2xl border animate-dropdown"
                        style={{
                          background: 'white',
                          borderColor: PASTEL.line,
                          boxShadow: '0 24px 64px rgba(15,42,35,0.13), 0 4px 14px rgba(15,42,35,0.07)',
                        }}
                      >
                        <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: PASTEL.line }}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                              style={{ background: 'linear-gradient(135deg, #144682, #1a5299)', color: '#FFB899' }}>
                              {(profile?.full_name || 'U')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate" style={{ color: PASTEL.ink }}>
                                {profile?.full_name || 'User'}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider" style={{ color: PASTEL.inkMute }}>
                                {currentRoleLabel}
                              </div>
                              <div className="text-[10px]" style={{ color: PASTEL.inkMute }}>MSI Group</div>
                            </div>
                          </div>
                        </div>
                        <div className="p-1.5">
                          {[
                            { label: 'My Profile',       icon: User,     action: () => setProfileDropdownOpen(false) },
                            { label: 'Account Settings', icon: Settings, action: () => setProfileDropdownOpen(false) },
                            { label: 'Admin Settings',   icon: Shield,   action: () => { navigateTo('adminSettings'); setProfileDropdownOpen(false); } },
                          ].map(({ label, icon: Icon, action }) => (
                            <button key={label} type="button" onClick={action}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors"
                              style={{ color: PASTEL.ink }}
                              onMouseEnter={e => e.currentTarget.style.background = PASTEL.lineSoft}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <Icon size={14} style={{ color: PASTEL.inkSoft }}/>
                              {label}
                            </button>
                          ))}
                          <div className="my-1.5 border-t" style={{ borderColor: PASTEL.line }}/>
                          <button type="button"
                            onClick={() => { setProfileDropdownOpen(false); signOut(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors"
                            style={{ color: '#B83A2E' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#FFF1EE'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <LogOut size={14} style={{ color: '#B83A2E' }}/>
                            Logout
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* ── APP LAUNCHER (no sidebar, full width) ── */}
          {!activeModule && (
            <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: '#9C948D' }}>Loading…</div>}>
              <AppLauncher
                moduleGroups={visibleMenuGroups}
                onSelect={enterModule}
                profile={profile}
              />
            </Suspense>
          )}

          <div className={`nexus-main-surface w-full min-w-0 ${(activeMenu === 'assets' || activeMenu?.startsWith('assets-')) ? 'px-5 sm:px-7 xl:px-9 py-6 lg:py-7' : 'px-5 sm:px-7 xl:px-9 py-6 lg:py-7'}`} style={{ display: activeModule ? undefined : 'none' }}>

          {/* Page section header with month filter */}
          {activeMenu === 'dashboard' && (
            <div className="mb-7 flex items-center gap-2 flex-wrap rounded-2xl border px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.58)', borderColor: 'rgba(15,42,35,0.08)' }}>
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

          {activeMenu === 'dashboard' && (
            <ErrorBoundary title="Dashboard temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <Dashboard stats={stats} groupedSP={filterMonth === 'all' ? groupedSP : groupedSP.filter(g => monthYearKey(g.spDate) === filterMonth)} filterMonth={filterMonth}/>
              </Suspense>
            </ErrorBoundary>
          )}
          {PLANNED_MODULES[activeMenu] && (
            <ComingSoonPage
              title={PLANNED_MODULES[activeMenu].title}
              description={PLANNED_MODULES[activeMenu].description}
              capabilities={PLANNED_MODULES[activeMenu].capabilities}
            />
          )}
          {/* Catch-all for sub-menu items not yet assigned to a page */}
          {activeModule && !PLANNED_MODULES[activeMenu] && activeMenu &&
           !['dashboard','manifest','input','shipment','finance','outstanding','customers','ar','users','admin','schema-manager','crm'].includes(activeMenu) &&
           !activeMenu?.startsWith('assets') && !activeMenu?.startsWith('hrga') &&
           !activeMenu?.startsWith('crm-') && !activeMenu?.startsWith('quotation-') && (
            <ComingSoonPage
              title="Coming Soon"
              description="This section is planned on the Nexus ERP roadmap and will be available in a future phase."
              capabilities={['Planned for a future ERP phase', 'Part of the Nexus roadmap']}
            />
          )}
          {activeMenu === 'manifest' && !selectedSpId && !showInputSP && (
            <ErrorBoundary title="Sales Order section temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <SalesOrderPage
                  groupedSP={groupedSP}
                  customers={customers}
                  dcList={dcList}
                  role={role}
                  onSelectSP={(spNo) => setSelectedSpId(spNo)}
                  onAddSP={() => setShowInputSP(true)}
                  onExport={exportCSV}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeMenu === 'manifest' && !selectedSpId && showInputSP && (
            <ErrorBoundary title="Input SP section temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <InputSPPage
                  onBack={() => setShowInputSP(false)}
                  customers={customers}
                  dcList={dcList}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeMenu === 'manifest' && selectedSpId && (
            <ErrorBoundary title="SP Detail section temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <SalesOrderDetailPage
                  spNo={selectedSpId}
                  items={enrichedRows.filter(r => r.spNo === selectedSpId)}
                  group={groupedSP.find(g => g.spNo === selectedSpId) || null}
                  onBack={() => setSelectedSpId(null)}
                  onSaveItem={dbSaveRow}
                  onDeleteItem={handleDelete}
                  onDeleteSP={async (spNo) => {
                    await dbRemoveRowsBySp(spNo);
                    setSelectedSpId(null);
                    showToast(`SP ${spNo} dihapus`);
                  }}
                  showToast={showToast}
                  role={role}
                />
              </Suspense>
            </ErrorBoundary>
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
          {activeMenu === 'users' && (
            // Legacy 'Org & Access Control' nav item removed — redirect to Master Data (AdminShell).
            // Handles any stale state or bookmarks pointing to the old menu id.
            (() => { navigateTo('admin'); return null; })()
          )}
          {activeMenu === 'admin' && (
            <ErrorBoundary title="Master Data section temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <AdminShell />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeMenu === 'schema-manager' && (role === 'super' || role === 'super_admin') && (
            <ErrorBoundary title="Schema Manager temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <SchemaManagerPage showToast={showToast} />
              </Suspense>
            </ErrorBoundary>
          )}
          {(activeMenu === 'assets' || activeMenu?.startsWith('assets-')) && (
            <ErrorBoundary title="Asset Management section temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <AssetShell
                  activePage={activeMenu}
                  assetId={activeAssetId}
                  onSelectAsset={navigateToAssetDetail}
                  onBack={backFromAssetDetail}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {(activeMenu === 'hrga' || activeMenu?.startsWith('hrga-')) && (
            <ErrorBoundary title="HRGA Request section temporarily unavailable">
              <Suspense fallback={
                <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
                  Loading...
                </div>
              }>
                <HrgaShell activePage={activeMenu} />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* ── CRM: Prospect List ──────────────────────────────────────────── */}
          {activeMenu === 'crm-prospects' && !showProspectForm && (
            <ErrorBoundary title="CRM Prospects temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <ProspectListPage
                  onAddProspect={() => { setEditingProspect(null); setShowProspectForm(true); }}
                  onEditProspect={(p) => { setEditingProspect(p); setShowProspectForm(true); }}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeMenu === 'crm-prospects' && showProspectForm && (
            <ErrorBoundary title="Prospect Form temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <ProspectFormPage
                  prospect={editingProspect}
                  onBack={() => { setShowProspectForm(false); setEditingProspect(null); }}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* ── CRM: Inquiry List ───────────────────────────────────────────── */}
          {activeMenu === 'crm-inquiry' && !showInquiryForm && (
            <ErrorBoundary title="CRM Inquiry temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <InquiryListPage
                  onAddInquiry={() => setShowInquiryForm(true)}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeMenu === 'crm-inquiry' && showInquiryForm && (
            <ErrorBoundary title="Inquiry Form temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <InquiryFormPage
                  onBack={() => setShowInquiryForm(false)}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* ── CRM: Dashboard ──────────────────────────────────────────────── */}
          {activeMenu === 'crm-dashboard' && (
            <ErrorBoundary title="CRM Dashboard temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <CRMDashboardPage />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* ── CRM: Pipeline Kanban ────────────────────────────────────────── */}
          {activeMenu === 'crm-pipeline' && (
            <ErrorBoundary title="Pipeline Kanban temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <PipelineKanbanPage showToast={showToast} />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* ── CRM: Quotation List ─────────────────────────────────────────── */}
          {activeMenu === 'quotation-draft' && !crmQuotationDetail && !showQuotationForm && (
            <ErrorBoundary title="Quotation List temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <QuotationListPage
                  onAddQuotation={() => { setEditingQuotation(null); setShowQuotationForm(true); }}
                  onSelectQuotation={(q) => setCrmQuotationDetail(q)}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {/* ── CRM: Quotation Detail ───────────────────────────────────────── */}
          {activeMenu === 'quotation-draft' && crmQuotationDetail && !showQuotationForm && (
            <ErrorBoundary title="Quotation Detail temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <QuotationDetailPage
                  quotationId={crmQuotationDetail.id}
                  onBack={() => setCrmQuotationDetail(null)}
                  onEdit={(q) => { setEditingQuotation(q); setShowQuotationForm(true); }}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {/* ── CRM: Quotation Form (create + edit) ────────────────────────── */}
          {activeMenu === 'quotation-draft' && showQuotationForm && (
            <ErrorBoundary title="Quotation Form temporarily unavailable">
              <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>Loading...</div>}>
                <QuotationFormPage
                  quotation={editingQuotation}
                  onBack={() => { setShowQuotationForm(false); setEditingQuotation(null); }}
                  showToast={showToast}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          </div>
        </main>
      </div>

      {/* SIDE PANEL - SP Detail (legacy; suppressed when new SalesOrderDetailPage is open) */}
      {viewingSPGroup && !selectedSpId && (
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
// ============================
// Cards & atoms
// ============================
function KPICard({ label, value, icon: Icon, color, accent }) {
  return (
    <div
      className="rounded-3xl p-5 border transition-all hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FBFCFA 100%)',
        borderColor: 'rgba(15,42,35,0.1)',
        boxShadow: '0 14px 34px rgba(15,42,35,0.05)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>{label}</div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: color, borderColor: 'rgba(255,255,255,0.65)' }}>
          <Icon size={16} style={{ color: accent }}/>
        </div>
      </div>
      <div className="font-numeric text-4xl font-bold tracking-tight">{value}</div>
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

function ComingSoonPage({ title, description, capabilities }) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div
        className="rounded-3xl border overflow-hidden"
        style={{ background: 'white', borderColor: 'rgba(15,42,35,0.09)', boxShadow: '0 20px 52px rgba(15,42,35,0.07)' }}
      >
        {/* Hero */}
        <div
          className="px-7 pt-7 pb-6 border-b"
          style={{
            borderColor: 'rgba(15,42,35,0.07)',
            background: 'linear-gradient(135deg, #F3F9F6 0%, #F8F5EE 55%, #FDFBF7 100%)',
          }}
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ background: '#DCF0E6', color: '#0F5132' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#2A9C65' }}/>
                  Planned — ERP Roadmap
                </span>
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight leading-tight mb-2.5">{title}</h2>
              <p className="text-sm max-w-2xl" style={{ color: PASTEL.inkSoft, lineHeight: '1.7' }}>{description}</p>
            </div>
            <div
              className="shrink-0 rounded-2xl border px-4 py-4 min-w-[160px] self-start"
              style={{ background: 'rgba(255,255,255,0.82)', borderColor: 'rgba(15,42,35,0.09)' }}
            >
              <div className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>
                Phase Status
              </div>
              <div className="font-numeric text-xl font-bold mb-2" style={{ color: PASTEL.ink }}>Roadmap</div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#7FC9A0' }}/>
                <span className="text-[11px]" style={{ color: PASTEL.inkSoft }}>Awaiting phase sign-off</span>
              </div>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="px-7 py-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>
              Planned Capabilities
            </span>
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: '#DCF0E6', color: '#0F5132' }}
            >
              {capabilities.length} features
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {capabilities.map((capability, index) => (
              <div
                key={capability}
                className="rounded-2xl border p-4 transition-all hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(180deg, #FAFCFB 0%, #F7F8F6 100%)',
                  borderColor: 'rgba(15,42,35,0.08)',
                  boxShadow: '0 2px 8px rgba(15,42,35,0.03)',
                }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-3 font-mono text-xs font-bold"
                  style={{ background: '#DCF0E6', color: '#1A5C3A' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </div>
                <h3 className="text-sm font-semibold leading-snug mb-1.5">{capability}</h3>
                <p className="text-xs leading-relaxed" style={{ color: PASTEL.inkMute }}>
                  Reserved for the ERP foundation roadmap.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================
// Manifest (grouped table)
// ============================
function SortIcon({ field, sortBy }) {
  if (sortBy.field !== field) return <ArrowUpDown size={11} style={{ opacity: 0.3 }}/>;
  return sortBy.dir === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/>;
}

// Manifest kept for backward compatibility — replaced in render by SalesOrderPage.
// eslint-disable-next-line no-unused-vars
function Manifest({ grouped, allCount, search, setSearch, filterStatus, setFilterStatus, filterDC, setFilterDC, filterCustomer, setFilterCustomer, filterOverdue, setFilterOverdue, dcList, customers, sortBy, setSortBy, onView, onExport }) {
  const toggleSort = (field) => {
    if (sortBy.field === field) setSortBy({ field, dir: sortBy.dir === 'asc' ? 'desc' : 'asc' });
    else setSortBy({ field, dir: 'asc' });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ background: PASTEL.sky, color: '#1F4D6B' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: PASTEL.skyDeep }}/>
              Logistics · Sales Order
            </span>
          </div>
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
                  <div className="flex items-center gap-1">SP Date <SortIcon field="spDate" sortBy={sortBy}/></div>
                </th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold cursor-pointer" style={{ color: PASTEL.inkSoft }} onClick={()=>toggleSort('spNo')}>
                  <div className="flex items-center gap-1">SP No <SortIcon field="spNo" sortBy={sortBy}/></div>
                </th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Customer</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Items</th>
                <th className="px-5 py-3.5 text-right text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Total Qty</th>
                <th className="px-5 py-3.5 text-right text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Outstanding</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>Status</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: PASTEL.inkSoft }}>DC</th>
                <th className="px-5 py-3.5 text-left text-[10px] uppercase tracking-[0.15em] font-semibold cursor-pointer" style={{ color: PASTEL.inkSoft }} onClick={()=>toggleSort('deadline')}>
                  <div className="flex items-center gap-1">Deadline <SortIcon field="deadline" sortBy={sortBy}/></div>
                </th>
                <th className="px-5 py-3.5 text-right text-[10px] uppercase tracking-[0.15em] font-semibold cursor-pointer" style={{ color: PASTEL.inkSoft }} onClick={()=>toggleSort('grandTotal')}>
                  <div className="flex items-center justify-end gap-1">Grand Total <SortIcon field="grandTotal" sortBy={sortBy}/></div>
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

function FilterPill({ value, onChange, options }) {
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
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ background: PASTEL.peach, color: '#5C2F12' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: PASTEL.peachDeep }}/>
            Logistics · Input SP
          </span>
        </div>
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
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ background: PASTEL.peach, color: '#5C2F12' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: PASTEL.peachDeep }}/>
            Logistics · Shipment
          </span>
        </div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Shipment & Fulfillment</h2>
        <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>{pending.length} item perlu update shipment</p>
      </div>

      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between"
          style={{ borderColor: PASTEL.line, background: 'linear-gradient(135deg, #F8F5EE 0%, #F3F9F6 100%)' }}>
          <span className="text-sm font-semibold" style={{ color: PASTEL.ink }}>Pending Shipment Items</span>
          <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full"
            style={{ background: pending.length > 0 ? PASTEL.peach : PASTEL.mint, color: pending.length > 0 ? '#5C2F12' : '#0F5132' }}>
            {pending.length} items
          </span>
        </div>
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
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ background: PASTEL.mint, color: '#0F5132' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: PASTEL.mintDeep }}/>
            Finance · Documents
          </span>
        </div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Finance & Documents</h2>
        <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>Update invoice, faktur pajak, submit, kirim, dan email status</p>
      </div>

      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between"
          style={{ borderColor: PASTEL.line, background: 'linear-gradient(135deg, #F8F5EE 0%, #F3FAF7 100%)' }}>
          <span className="text-sm font-semibold" style={{ color: PASTEL.ink }}>Finance Document Status</span>
          <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full"
            style={{ background: PASTEL.mint, color: '#0F5132' }}>
            {rows.length} items
          </span>
        </div>
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
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ background: PASTEL.butter, color: '#5C4416' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: PASTEL.butterDeep }}/>
            Finance · Outstanding
          </span>
        </div>
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
        <div className="px-5 py-3.5 border-b flex items-center justify-between"
          style={{ borderColor: PASTEL.line, background: 'linear-gradient(135deg, #F8F5EE 0%, #FEFAF0 100%)' }}>
          <span className="text-sm font-semibold" style={{ color: PASTEL.ink }}>Items with Pending Documents</span>
          <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full"
            style={{ background: pending.length > 0 ? PASTEL.peach : PASTEL.mint, color: pending.length > 0 ? '#5C2F12' : '#0F5132' }}>
            {pending.length} items
          </span>
        </div>
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
    dc: '', shippingDate: '',
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
function CustomersPage({ customers, rows, onAdd, onEdit, onDelete, role }) {
  const usageCount = (custName) => rows.filter(r => r.customer === custName).length;
  const { customFields } = useCustomFields('customers');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ background: PASTEL.lavender, color: '#3D2B5C' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: PASTEL.lavenderDeep }}/>
              Logistics · Customers
            </span>
          </div>
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

              {/* Read-only custom fields */}
              {customFields.length > 0 && (
                <CustomFieldsSection
                  customFields={customFields}
                  values={c}
                  readOnly
                />
              )}

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

  // ── Custom fields ────────────────────────────────────────────────────────
  const { customFields } = useCustomFields('customers');
  const [customValues, setCustomValues] = useState({});

  // Populate custom values from existing customer data (edit mode)
  useEffect(() => {
    if (!initial) return;
    const standard = new Set(STANDARD_COLUMNS.customers);
    const custom = Object.fromEntries(
      Object.entries(initial).filter(([k]) => !standard.has(k))
    );
    setCustomValues(custom);
  }, [initial]);

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
    // Merge standard fields + custom fields into save payload
    onSave({
      ...data,
      ...customValues,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim().toUpperCase(),
    });
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

        {/* Custom Fields — dynamic columns added via Schema Manager */}
        <CustomFieldsSection
          customFields={customFields}
          values={customValues}
          onChange={(key, val) => setCustomValues(prev => ({ ...prev, [key]: val }))}
        />

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
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ background: PASTEL.sky, color: '#1F4D6B' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: PASTEL.skyDeep }}/>
              Finance · AR Collection
            </span>
          </div>
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
  const [data, setData] = useState(() => initial || {
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

// src/modules/admin/AdminShell.jsx
// ERP Master Data admin section.
// Layout: vertical sidebar (left) + content (right).
// Sidebar has three section groups: Organization, Access Control, Configuration.
// Phase 1.0J: CRUD on Branches, Departments, Positions; Add User via Edge Function.

import { useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import {
  Building2, MapPin, Network, Briefcase,
  ShieldCheck, Users,
  FileText, Tag, Percent, CreditCard,
} from 'lucide-react';
import ErrorBoundary from '../../components/ErrorBoundary';
import CompaniesPage from './pages/CompaniesPage';
import BranchesPage from './pages/BranchesPage';
import DepartmentsPage from './pages/DepartmentsPage';
import PositionsPage from './pages/PositionsPage';
import RolesPage from './pages/RolesPage';
import DocumentTypesPage from './pages/DocumentTypesPage';
import StatusCatalogPage from './pages/StatusCatalogPage';
import TaxesPage from './pages/TaxesPage';
import PaymentTermsPage from './pages/PaymentTermsPage';
import UserAccessPage from './pages/UserAccessPage';

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────

const PASTEL = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  lavender:     '#D8C5F0',
  lavenderDeep: '#A98FD8',
};

// ─────────────────────────────────────────────────────────────
// Nav definition — section → items
// ─────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    label: 'Organization',
    items: [
      { id: 'companies',   label: 'Companies',   icon: Building2 },
      { id: 'branches',    label: 'Branches',    icon: MapPin    },
      { id: 'departments', label: 'Departments', icon: Network   },
      { id: 'positions',   label: 'Positions',   icon: Briefcase },
    ],
  },
  {
    label: 'Access Control',
    items: [
      { id: 'roles',       label: 'Roles',       icon: ShieldCheck, permission: { module: 'admin', action: 'edit' } },
      { id: 'user-access', label: 'User Access', icon: Users,       permission: { module: 'admin', action: 'view' } },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { id: 'document-types', label: 'Document Types', icon: FileText  },
      { id: 'status-catalog', label: 'Status Catalog', icon: Tag       },
      { id: 'taxes',          label: 'Taxes',           icon: Percent   },
      { id: 'payment-terms',  label: 'Payment Terms',  icon: CreditCard},
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────

function Sidebar({ active, onSelect, hasPermission }) {
  return (
    <aside
      className="flex-shrink-0 flex flex-col"
      style={{
        width: 216,
        background: 'white',
        borderRight: `1px solid ${PASTEL.line}`,
        borderRadius: 20,
        padding: '16px 10px',
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 24,
      }}
    >
      {/* Phase badge */}
      <div className="flex items-center gap-2 px-2 mb-5">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ background: '#DCF0E6', color: '#0F5132' }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#2A9C65' }} />
          1.0J
        </span>
        <span className="text-[10px] font-medium" style={{ color: PASTEL.inkMute }}>
          Master Data
        </span>
      </div>

      {/* Section groups */}
      {NAV_SECTIONS.map((section, sIdx) => (
        <div key={section.label} className={sIdx > 0 ? 'mt-5' : ''}>
          {/* Section label */}
          <div
            className="px-2 mb-1 text-[9px] uppercase tracking-[0.20em] font-bold select-none"
            style={{ color: PASTEL.inkMute }}
          >
            {section.label}
          </div>

          {/* Items */}
          {section.items.filter(item => {
            if (!item.permission) return true;
            if (typeof hasPermission !== 'function') return true;
            return hasPermission(item.permission.module, item.permission.action);
          }).map((item) => {
            const isActive = active === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left"
                style={{
                  background:  isActive ? PASTEL.lavender : 'transparent',
                  color:       isActive ? PASTEL.lavenderDeep : PASTEL.inkSoft,
                  fontWeight:  isActive ? 600 : 450,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = PASTEL.lineSoft;
                    e.currentTarget.style.color = PASTEL.ink;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = PASTEL.inkSoft;
                  }
                }}
              >
                <Icon size={14} style={{ flexShrink: 0 }} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// Page map
// ─────────────────────────────────────────────────────────────

const PAGE_MAP = {
  'companies':      <ErrorBoundary title="Companies unavailable"><CompaniesPage /></ErrorBoundary>,
  'branches':       <ErrorBoundary title="Branches unavailable"><BranchesPage /></ErrorBoundary>,
  'departments':    <ErrorBoundary title="Departments unavailable"><DepartmentsPage /></ErrorBoundary>,
  'positions':      <ErrorBoundary title="Positions unavailable"><PositionsPage /></ErrorBoundary>,
  'roles':          <ErrorBoundary title="Roles unavailable"><RolesPage /></ErrorBoundary>,
  'user-access':    <ErrorBoundary title="User Access unavailable"><UserAccessPage /></ErrorBoundary>,
  'document-types': <ErrorBoundary title="Document Types unavailable"><DocumentTypesPage /></ErrorBoundary>,
  'status-catalog': <ErrorBoundary title="Status Catalog unavailable"><StatusCatalogPage /></ErrorBoundary>,
  'taxes':          <ErrorBoundary title="Taxes unavailable"><TaxesPage /></ErrorBoundary>,
  'payment-terms':  <ErrorBoundary title="Payment Terms unavailable"><PaymentTermsPage /></ErrorBoundary>,
};

// ─────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────

export default function AdminShell() {
  const [activeTab, setActiveTab] = useState('companies');
  const { hasPermission } = useAuth();

  return (
    <div className="flex gap-5 items-start">
      <Sidebar active={activeTab} onSelect={setActiveTab} hasPermission={hasPermission} />
      <div className="flex-1 min-w-0">
        {PAGE_MAP[activeTab] ?? null}
      </div>
    </div>
  );
}

// src/modules/admin/AdminShell.jsx
// ERP Master Data admin section.
// Provides sub-navigation between all master data admin tabs.
// This component is lazy-loaded from App.jsx — no nested lazy here.
// Phase 1.0I: Branches, Departments, Positions have full CRUD.

import { useState } from 'react';
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

const PASTEL = {
  ink: '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  line: '#EDE6DC',
  lineSoft: '#F5EFE5',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
};

const ADMIN_TABS = [
  { id: 'companies',      label: 'Companies' },
  { id: 'branches',       label: 'Branches' },
  { id: 'departments',    label: 'Departments' },
  { id: 'positions',      label: 'Positions' },
  { id: 'roles',          label: 'Roles' },
  { id: 'document-types', label: 'Document Types' },
  { id: 'status-catalog', label: 'Status Catalog' },
  { id: 'taxes',          label: 'Taxes' },
  { id: 'payment-terms',  label: 'Payment Terms' },
  { id: 'user-access',    label: 'User Access' },
];

function TabNav({ active, onSelect }) {
  return (
    <div
      className="nexus-admin-tabs flex items-center gap-0.5 p-1 rounded-2xl border"
      style={{
        background: PASTEL.lineSoft,
        borderColor: PASTEL.line,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {ADMIN_TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className="flex-shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-sm transition-all"
            style={{
              background: isActive ? 'white' : 'transparent',
              color: isActive ? PASTEL.ink : PASTEL.inkSoft,
              fontWeight: isActive ? 600 : 450,
              boxShadow: isActive
                ? '0 1px 3px rgba(45,42,40,0.09), 0 0 0 1px rgba(237,230,220,0.7)'
                : 'none',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'rgba(45,42,40,0.04)';
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
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminShell() {
  const [activeTab, setActiveTab] = useState('companies');

  return (
    <div>
      {/* Hide webkit scrollbar on the tab strip */}
      <style>{`.nexus-admin-tabs::-webkit-scrollbar { display: none; }`}</style>

      {/* Section identity */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ background: '#DCF0E6', color: '#0F5132' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
              style={{ background: '#2A9C65' }}
            />
            Phase 1.0I
          </span>
          <span className="text-[11px] font-medium" style={{ color: PASTEL.inkMute }}>
            Foundation · Master Data
          </span>
        </div>
        <span
          className="hidden sm:block text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: PASTEL.inkMute }}
        >
          CRUD enabled
        </span>
      </div>

      {/* Tab navigation */}
      <div className="mb-7">
        <TabNav active={activeTab} onSelect={setActiveTab} />
      </div>

      {/* Page content */}
      {activeTab === 'companies' && (
        <ErrorBoundary title="Companies section temporarily unavailable">
          <CompaniesPage />
        </ErrorBoundary>
      )}
      {activeTab === 'branches' && (
        <ErrorBoundary title="Branches section temporarily unavailable">
          <BranchesPage />
        </ErrorBoundary>
      )}
      {activeTab === 'departments' && (
        <ErrorBoundary title="Departments section temporarily unavailable">
          <DepartmentsPage />
        </ErrorBoundary>
      )}
      {activeTab === 'positions' && (
        <ErrorBoundary title="Positions section temporarily unavailable">
          <PositionsPage />
        </ErrorBoundary>
      )}
      {activeTab === 'roles' && (
        <ErrorBoundary title="Roles section temporarily unavailable">
          <RolesPage />
        </ErrorBoundary>
      )}
      {activeTab === 'document-types' && (
        <ErrorBoundary title="Document Types section temporarily unavailable">
          <DocumentTypesPage />
        </ErrorBoundary>
      )}
      {activeTab === 'status-catalog' && (
        <ErrorBoundary title="Status Catalog section temporarily unavailable">
          <StatusCatalogPage />
        </ErrorBoundary>
      )}
      {activeTab === 'taxes' && (
        <ErrorBoundary title="Taxes section temporarily unavailable">
          <TaxesPage />
        </ErrorBoundary>
      )}
      {activeTab === 'payment-terms' && (
        <ErrorBoundary title="Payment Terms section temporarily unavailable">
          <PaymentTermsPage />
        </ErrorBoundary>
      )}
      {activeTab === 'user-access' && (
        <ErrorBoundary title="User Access section temporarily unavailable">
          <UserAccessPage />
        </ErrorBoundary>
      )}
    </div>
  );
}

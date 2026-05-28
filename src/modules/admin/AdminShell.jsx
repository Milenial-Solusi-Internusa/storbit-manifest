// src/modules/admin/AdminShell.jsx
// ERP Master Data admin section.
// Provides sub-navigation between Companies, Branches, Departments, Roles.
// This component is lazy-loaded from App.jsx — no nested lazy here.
// Phase 1.0E: read-only list views. Create/edit/delete comes in later phases.

import { useState } from 'react';
import ErrorBoundary from '../../components/ErrorBoundary';
import CompaniesPage from './pages/CompaniesPage';
import BranchesPage from './pages/BranchesPage';
import DepartmentsPage from './pages/DepartmentsPage';
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
      className="flex items-center gap-1 mb-8 p-1 rounded-2xl overflow-x-auto"
      style={{ background: PASTEL.lineSoft, maxWidth: '100%' }}
    >
      {ADMIN_TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap"
            style={{
              background: isActive ? 'white' : 'transparent',
              color: isActive ? PASTEL.ink : PASTEL.inkSoft,
              fontWeight: isActive ? 600 : 500,
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
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
      <TabNav active={activeTab} onSelect={setActiveTab} />

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

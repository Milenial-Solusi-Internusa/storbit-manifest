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
  { id: 'companies',   label: 'Companies' },
  { id: 'branches',    label: 'Branches' },
  { id: 'departments', label: 'Departments' },
  { id: 'roles',       label: 'Roles' },
];

function TabNav({ active, onSelect }) {
  return (
    <div
      className="flex items-center gap-1 mb-8 p-1 rounded-2xl w-fit"
      style={{ background: PASTEL.lineSoft }}
    >
      {ADMIN_TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
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
    </div>
  );
}

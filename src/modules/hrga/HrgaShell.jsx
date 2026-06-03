// src/modules/hrga/HrgaShell.jsx
// Service Management — HRGA Request module shell.
// Layout: vertical sidebar (left) + content (right).
// Mirrors AdminShell layout pattern.
// Phase 2: My Requests only. Approval queue added in next phase.

import { useState } from 'react';
import { ClipboardList, LayoutList } from 'lucide-react';
import ErrorBoundary from '../../components/ErrorBoundary';
import MyRequestsPage from './pages/MyRequestsPage';
import AllRequestsPage from './pages/AllRequestsPage';

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────
const P = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  peach:        '#FFD4B8',
  peachDeep:    '#F5A78F',
};

// ─────────────────────────────────────────────────────────────
// Nav definition
// ─────────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Karyawan',
    items: [
      { id: 'my-requests', label: 'My Requests',   icon: ClipboardList },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'all-requests', label: 'Semua Request', icon: LayoutList },
    ],
  },
  // Future: Approver Queue, HRGA Dashboard, Offboarding
];

// ─────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────
function Sidebar({ active, onSelect }) {
  return (
    <aside
      className="flex-shrink-0 flex flex-col"
      style={{
        width: 216,
        minHeight: 0,
        background: 'white',
        borderRight: `1px solid ${P.line}`,
        paddingTop: 28,
        paddingBottom: 24,
      }}
    >
      {/* Module title */}
      <div className="px-5 mb-6 flex-shrink-0">
        <div
          className="text-[9px] uppercase tracking-[0.28em] font-bold mb-1"
          style={{ color: P.inkMute }}
        >
          Service Management
        </div>
        <div
          className="font-display text-base font-semibold tracking-tight"
          style={{ color: P.ink }}
        >
          HRGA Request
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex flex-col gap-5 px-3 flex-1 min-h-0 overflow-y-auto">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <div
              className="px-3 mb-2 text-[9px] uppercase tracking-[0.28em] font-bold"
              style={{ color: P.inkMute }}
            >
              {section.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map(item => {
                const isActive = active === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-2xl text-sm font-medium text-left transition-all"
                    style={
                      isActive
                        ? { background: P.peach, color: '#8C4A18', fontWeight: 600 }
                        : { background: 'transparent', color: P.inkSoft }
                    }
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = P.lineSoft; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon size={15} />
                    {item.label}
                    {item.badge && (
                      <span
                        className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                        style={{ background: P.peachDeep, color: 'white' }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Phase badge */}
      <div className="px-5 mt-4 flex-shrink-0">
        <span
          className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest"
          style={{ background: P.peach, color: '#8C4A18' }}
        >
          Phase 2 · HRGA
        </span>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────
export default function HrgaShell() {
  const [active, setActive] = useState('my-requests');

  return (
    <div
      className="flex"
      style={{
        minHeight: 'calc(100svh - 64px)',
        background: P.lineSoft,
      }}
    >
      <Sidebar active={active} onSelect={setActive} />

      <main
        className="flex-1 min-w-0 overflow-y-auto px-7 xl:px-10 py-8"
        style={{ background: 'transparent' }}
      >
        <ErrorBoundary title="HRGA Request section temporarily unavailable">
          {active === 'my-requests'  && <MyRequestsPage />}
          {active === 'all-requests' && <AllRequestsPage />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

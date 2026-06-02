// src/modules/launcher/AppLauncher.jsx
// Odoo-style app launcher — shown immediately after login, before any module is selected.
// Renders a grid of module cards derived from the filtered ERP_MENU_GROUPS.
// Clicking a card calls onSelect(group) which transitions to module mode.

const PASTEL = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  mint:         '#C8EFD9',
  mintDeep:     '#7FC9A0',
  rose:         '#F5C8D5',
  roseDeep:     '#D89AB0',
  lavender:     '#D8C5F0',
  lavenderDeep: '#A98FD8',
  sky:          '#C8E4F5',
  skyDeep:      '#8FBCD8',
  peach:        '#FFD4B8',
  peachDeep:    '#F5A78F',
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
};

// Accent color per module group — determines card icon circle color.
const GROUP_ACCENT = {
  'Core':                   { bg: PASTEL.lavender,  icon: PASTEL.lavenderDeep },
  'Commercial & CRM':       { bg: PASTEL.peach,     icon: PASTEL.peachDeep    },
  'Operations':             { bg: PASTEL.sky,       icon: PASTEL.skyDeep      },
  'Procurement & Vendor':   { bg: PASTEL.mint,      icon: PASTEL.mintDeep     },
  'Inventory & Asset':      { bg: PASTEL.butter,    icon: PASTEL.butterDeep   },
  'Finance & Accounting':   { bg: PASTEL.rose,      icon: PASTEL.roseDeep     },
  'Service Management':     { bg: PASTEL.lavender,  icon: PASTEL.lavenderDeep },
  'Workflow & Document':    { bg: PASTEL.sky,       icon: PASTEL.skyDeep      },
  'Portal & Integration':   { bg: PASTEL.peach,     icon: PASTEL.peachDeep    },
  'Reporting & Governance': { bg: PASTEL.mint,      icon: PASTEL.mintDeep     },
  'Foundation':             { bg: '#EDE6DC',        icon: '#5C5550'           },
};

function ModuleCard({ group, onClick }) {
  const Icon = group.items[0]?.icon;
  const accent = GROUP_ACCENT[group.label] ?? { bg: PASTEL.lineSoft, icon: PASTEL.inkSoft };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 p-5 rounded-3xl border text-center transition-all duration-150 group"
      style={{ background: 'white', borderColor: PASTEL.line }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent.icon;
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(45,42,40,0.10), 0 0 0 2px ${accent.bg}`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = PASTEL.line;
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Icon circle */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ background: accent.bg }}
      >
        {Icon && <Icon size={24} style={{ color: accent.icon }} strokeWidth={1.8} />}
      </div>

      {/* Label */}
      <div className="text-xs font-semibold leading-snug" style={{ color: PASTEL.ink }}>
        {group.label}
      </div>

      {/* Item count chip */}
      <div
        className="text-[9px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
        style={{ background: PASTEL.lineSoft, color: PASTEL.inkMute }}
      >
        {group.items.length} {group.items.length === 1 ? 'module' : 'modules'}
      </div>
    </button>
  );
}

export default function AppLauncher({ moduleGroups, onSelect, profile }) {
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-[calc(100vh-68px)] flex flex-col items-center pt-14 pb-16 px-6">

      {/* Greeting */}
      <div className="mb-12 text-center">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.16em] mb-4"
          style={{ background: PASTEL.mint, color: '#0F5132' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2A9C65' }} />
          Nexus by MSI
        </div>
        <h1
          className="font-display text-3xl font-semibold tracking-tight mb-2"
          style={{ color: PASTEL.ink }}
        >
          {greeting}, {firstName}.
        </h1>
        <p className="text-sm" style={{ color: PASTEL.inkSoft }}>
          Select a module to get started.
        </p>
      </div>

      {/* Module grid */}
      <div
        className="grid gap-4 w-full"
        style={{
          maxWidth: 880,
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        }}
      >
        {moduleGroups.map((group) => (
          <ModuleCard
            key={group.label}
            group={group}
            onClick={() => onSelect(group)}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-14 text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>
        MSI Group · Unified Business Core Platform
      </p>
    </div>
  );
}

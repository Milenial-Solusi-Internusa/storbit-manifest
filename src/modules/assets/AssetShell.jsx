// src/modules/assets/AssetShell.jsx
// Asset Management — content shell only.
// Navigation is handled entirely by App.jsx's ModuleSidebar (dark green sidebar).
// This component receives activePage + assetId from App.jsx and renders the matching page.
// No secondary sidebar here.

import { useState, useEffect } from 'react';
import { LayoutDashboard } from 'lucide-react';
import ErrorBoundary from '../../components/ErrorBoundary';
import AssetDashboardPage from './pages/AssetDashboardPage';
import AssetITPage from './pages/AssetITPage';
import AssetDetailPage from './pages/AssetDetailPage';
import AddAssetPage from './pages/AddAssetPage';

// ─────────────────────────────────────────────────────────────
// Coming-soon stub
// ─────────────────────────────────────────────────────────────
function ComingSoon({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 340, gap: 14,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: '#FEF2EC', color: '#E85A1E',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <LayoutDashboard size={24} strokeWidth={1.5} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#23291E' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: 13.5, color: '#5E6553' }}>
          Halaman ini sedang dalam pengembangan.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page label map
// ─────────────────────────────────────────────────────────────
const PAGE_LABELS = {
  'assets-analytics':  'Analytics & Reports',
  'assets-kendaraan':  'Kendaraan',
  'assets-it':         'IT Equipment',
  'assets-furniture':  'Furniture & Office',
  'assets-properti':   'Properti',
  'assets-maint':      'Jadwal Maintenance',
  'assets-hist':       'History Maintenance',
  'assets-workorders': 'Work Orders',
  'assets-docs':       'Semua Dokumen',
  'assets-expiring':   'Akan Expired',
  'assets-expired':    'Sudah Expired',
  'assets-kategori':   'Kategori Aset',
  'assets-lokasi':     'Lokasi & Ruangan',
  'assets-vendor':     'Vendor & Supplier',
  'assets-settings':   'Settings',
};

// ─────────────────────────────────────────────────────────────
// Page router
// ─────────────────────────────────────────────────────────────
// Maps sidebar menu ID → asset_categories.code on the database
const PAGE_CATEGORY = {
  'assets-it':        'IT-EQP',
  'assets-kendaraan': 'VEH',
  'assets-furniture': 'FURN',
  'assets-properti':  'BLDG',
};

function renderPage({ activePage, assetId, onSelectAsset, onBack, onAddAsset }) {
  if (!activePage || activePage === 'assets') return <AssetDashboardPage />;

  const categoryCode = PAGE_CATEGORY[activePage];
  if (categoryCode) {
    return (
      <AssetITPage
        categoryCode={categoryCode}
        onSelectAsset={onSelectAsset}
        onAddAsset={() => onAddAsset(categoryCode)}
      />
    );
  }

  if (activePage === 'assets-detail') {
    return (
      <AssetDetailPage
        id={assetId}
        onBack={onBack}
        onNavigate={onSelectAsset}
      />
    );
  }
  const label = PAGE_LABELS[activePage] || activePage;
  return <ComingSoon label={label} />;
}

// ─────────────────────────────────────────────────────────────
// Shell — content only, no sidebar
//   addCategory : local state for the "Tambah Aset" wizard overlay.
//     Opened from a list page's "+ Tambah Aset" → AddAssetPage(categoryCode).
//     Reset whenever the sidebar (activePage) changes, on cancel, or on save.
// ─────────────────────────────────────────────────────────────
export default function AssetShell({ activePage, assetId, onSelectAsset, onBack }) {
  const [addCategory, setAddCategory] = useState(null);

  // Close the add-asset overlay if the user navigates via the sidebar.
  useEffect(() => { setAddCategory(null); }, [activePage]);

  let content;
  if (addCategory) {
    content = (
      <AddAssetPage
        categoryCode={addCategory}
        onBack={() => setAddCategory(null)}
        onSuccess={() => setAddCategory(null)}
      />
    );
  } else {
    content = renderPage({ activePage, assetId, onSelectAsset, onBack, onAddAsset: setAddCategory });
  }

  return (
    <ErrorBoundary title="Asset Management section temporarily unavailable">
      {content}
    </ErrorBoundary>
  );
}

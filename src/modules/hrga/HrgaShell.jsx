// src/modules/hrga/HrgaShell.jsx
// Service Management — HRGA Request module shell.
// No separate sidebar rendered here — App.jsx ModuleSidebar handles sidebar.
// This shell receives activePage from App.jsx and renders the matching page.
// Routing for detail views is handled internally via selectedRequestId state.

import { useState, lazy, Suspense } from 'react';
import ErrorBoundary from '../../components/ErrorBoundary';
import { D } from './HrgaShared';

const MyRequestsPage     = lazy(() => import('./pages/MyRequestsPage'));
const AllRequestsPage    = lazy(() => import('./pages/AllRequestsPage'));
const BuatRequestPage    = lazy(() => import('./pages/BuatRequestPage'));
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'));
const ArsipPage          = lazy(() => import('./pages/ArsipPage'));
const HrgaDetailPage     = lazy(() => import('./pages/HrgaDetailPage'));

function Fallback() {
  return (
    <div style={{ padding:'3rem', textAlign:'center', color:D.inkFaint, fontSize:13 }}>
      Memuat…
    </div>
  );
}

export default function HrgaShell({ activePage }) {
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [, setDetailBackPage] = useState('hrga');

  const openDetail = (id, fromPage) => {
    setSelectedRequestId(id);
    setDetailBackPage(fromPage || activePage || 'hrga');
  };
  const closeDetail = () => setSelectedRequestId(null);

  // Detail page takes priority over active page
  if (selectedRequestId) {
    return (
      <ErrorBoundary title="Detail request tidak dapat ditampilkan">
        <Suspense fallback={<Fallback />}>
          <HrgaDetailPage
            requestId={selectedRequestId}
            onBack={closeDetail}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  const page = activePage || 'hrga';

  const renderPage = () => {
    if (page === 'hrga' || page === 'hrga-my-requests') {
      return <MyRequestsPage onOpenDetail={(id) => openDetail(id, page)} />;
    }
    if (page === 'hrga-buat-request') {
      return <BuatRequestPage onSuccess={(id) => openDetail(id, page)} onCancel={() => {}} />;
    }
    if (page === 'hrga-semua-request') {
      return <AllRequestsPage onOpenDetail={(id) => openDetail(id, page)} />;
    }
    if (page === 'hrga-pending-approval') {
      return <PendingApprovalPage onOpenDetail={(id) => openDetail(id, page)} />;
    }
    if (page === 'hrga-arsip') {
      return <ArsipPage onOpenDetail={(id) => openDetail(id, page)} />;
    }
    // Default: My Requests
    return <MyRequestsPage onOpenDetail={(id) => openDetail(id, page)} />;
  };

  return (
    <ErrorBoundary title="HRGA Request section temporarily unavailable">
      <Suspense fallback={<Fallback />}>
        {renderPage()}
      </Suspense>
    </ErrorBoundary>
  );
}

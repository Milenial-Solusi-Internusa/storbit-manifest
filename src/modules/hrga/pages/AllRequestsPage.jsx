// src/modules/hrga/pages/AllRequestsPage.jsx
// HRGA Request — Semua Request — management view.
// Design: hrga-semua.html — stat cards + full table (13 cols, includes submitter).

import { useState, useCallback } from 'react';
import { Inbox, Clock, CheckCircle2, Ban, Eye, Download } from 'lucide-react';
import {
  D, Card, HrgaStatusBadge, TypePill, Avatar, Btn, StatCard,
  FilterBar, FilterDropdown, Pager, EmptyRow, LoadingRow,
  daysUntil, fmtDate, fmtRupiah, HRGA_TABLE_CSS,
} from '../HrgaShared';
import { useAllHrgaRequests, useHrgaStats, HRGA_PAGE_SIZE } from '../../../hooks/useHrgaRequests';
import { useDebounce } from '../../../hooks/useDebounce';

const STATUS_OPTS = [
  { value: null,          label: 'Semua Status'  },
  { value: 'submitted',   label: 'Submitted'     },
  { value: 'in_progress', label: 'In Progress'   },
  { value: 'approved',    label: 'Approved'      },
  { value: 'rejected',    label: 'Rejected'      },
  { value: 'cancelled',   label: 'Cancelled'     },
];

export default function AllRequestsPage({ onOpenDetail }) {
  const [page,         setPage]         = useState(1);
  const [rawSearch,    setRawSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const search = useDebounce(rawSearch, 300);
  const handleSearch = useCallback((v) => { setRawSearch(v); setPage(1); }, []);

  const { data, total, loading, error, refresh } = useAllHrgaRequests({ page, search });
  const { total: statTotal, pending, approved, rejected } = useHrgaStats();

  const rows = statusFilter ? data.filter(r => r.status === statusFilter) : data;

  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans', system-ui, sans-serif", color:D.ink }}>
      <style>{HRGA_TABLE_CSS}</style>

      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <nav style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:D.inkFaint, marginBottom:8 }}>
            <span>Home</span><span>›</span><span>Service Management</span><span>›</span>
            <span style={{ color:D.inkSoft, fontWeight:600 }}>Semua Request</span>
          </nav>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.4px', margin:0 }}>Semua Request</h1>
          <div style={{ fontSize:13.5, color:D.inkSoft, marginTop:4 }}>
            Seluruh permintaan layanan HRGA lintas department · tampilan manajemen
          </div>
        </div>
        <Btn icon={Download}>Export CSV</Btn>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        <StatCard label="Total Request"       icon={Inbox}        value={statTotal} sub="sepanjang 2026" />
        <StatCard label="Pending Bulan Ini"   icon={Clock}        value={pending}   tone="warn" />
        <StatCard label="Approved Bulan Ini"  icon={CheckCircle2} value={approved}  tone="ok"   />
        <StatCard label="Rejected Bulan Ini"  icon={Ban}          value={rejected}  tone="danger" />
      </div>

      {/* Table card */}
      <Card>
        <FilterBar search={rawSearch} onSearch={handleSearch}
          placeholder="Cari no. dokumen, keperluan, nama pengaju…" onRefresh={refresh}>
          <FilterDropdown label="Semua Status" options={STATUS_OPTS}
            value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} />
        </FilterBar>

        {error && (
          <div style={{ padding:'1.5rem', textAlign:'center', color:D.danger, fontSize:13 }}>
            Gagal memuat: {error.message}
          </div>
        )}

        {!error && (
          <div style={{ overflowX:'auto' }}>
            <table className="hg-tbl">
              <thead>
                <tr>
                  <th className="stick-l" style={{ width:34, left:0 }}>
                    <input type="checkbox" style={{ width:15, height:15, cursor:'pointer', accentColor:D.accent }} />
                  </th>
                  <th className="stick-l" style={{ left:34 }}>No. Dokumen</th>
                  <th>Tipe</th>
                  <th>Keperluan</th>
                  <th>Diajukan Oleh</th>
                  <th>Tgl Diajukan</th>
                  <th>Tgl Dibutuhkan</th>
                  <th style={{ textAlign:'right' }}>Estimasi Biaya</th>
                  <th>Status</th>
                  <th className="stick-r" style={{ width:60, right:0 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRow colspan={10} />}
                {!loading && rows.length === 0 && <EmptyRow colspan={10} message="Belum ada request." />}
                {!loading && rows.map(row => {
                  const days   = daysUntil(row.requested_date);
                  const urgent = days !== null && days < 2;
                  return (
                    <tr key={row.id} style={{ cursor:'pointer' }}
                      onClick={() => onOpenDetail?.(row.id)}>
                      <td className="stick-l" style={{ left:0 }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" style={{ width:15, height:15, cursor:'pointer', accentColor:D.accent }} />
                      </td>
                      <td className="stick-l" style={{ left:34 }}>
                        <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:12.5, fontWeight:600, color:D.accent }}>
                          {row.document_no}
                        </span>
                      </td>
                      <td>
                        <TypePill categoryCode={row.hrga_request_types?.category_code}
                          typeName={row.hrga_request_types?.type_name} />
                      </td>
                      <td><div className="keper-cell">{row.subject || '—'}</div></td>
                      <td>
                        {row.requester_name
                          ? <Avatar name={row.requester_name} size={24} />
                          : <span style={{ color:D.inkFaint, fontSize:12.5 }}>—</span>}
                      </td>
                      <td style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:12.5, color:D.inkSoft, whiteSpace:'nowrap' }}>
                        {fmtDate(row.submitted_at || row.created_at)}
                      </td>
                      <td>
                        <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:12.5,
                          color:urgent?D.danger:D.ink, fontWeight:urgent?700:400 }}>
                          {row.requested_date ? fmtDate(row.requested_date) : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign:'right', fontFamily:"'IBM Plex Mono', monospace", fontSize:12.5, color:D.inkSoft }}>
                        {fmtRupiah(row.amount)}
                      </td>
                      <td><HrgaStatusBadge status={row.status} /></td>
                      <td className="stick-r" style={{ right:0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => onOpenDetail?.(row.id)} title="Lihat"
                          style={{ width:28, height:28, borderRadius:7, border:`1px solid ${D.line}`,
                            background:D.surface, cursor:'pointer', display:'flex', alignItems:'center',
                            justifyContent:'center', color:D.inkSoft }}>
                          <Eye size={14} strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pager page={page} total={statusFilter ? rows.length : total}
          pageSize={HRGA_PAGE_SIZE} onPage={setPage} />
      </Card>
    </div>
  );
}

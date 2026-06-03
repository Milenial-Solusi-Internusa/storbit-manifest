// src/modules/hrga/pages/PendingApprovalPage.jsx
// HRGA Request — Pending Approval page.
// Design: hrga-pending.html — urgent banner + table with inline Approve/Reject buttons.

import { useState, useCallback } from 'react';
import { AlertTriangle, Eye, Check, Ban } from 'lucide-react';
import {
  D, Card, HrgaStatusBadge, TypePill, Avatar, Btn, Banner,
  FilterBar, Pager, EmptyRow, LoadingRow,
  daysUntil, fmtDate, fmtRupiah, HRGA_TABLE_CSS,
} from '../HrgaShared';
import { usePendingApprovals, submitApproval, HRGA_PAGE_SIZE } from '../../../hooks/useHrgaRequests';
import { useAuth } from '../../../contexts/useAuth';
import { useDebounce } from '../../../hooks/useDebounce';

export default function PendingApprovalPage({ onOpenDetail }) {
  const [page,      setPage]      = useState(1);
  const [rawSearch, setRawSearch] = useState('');
  const [acting,    setActing]    = useState(null); // { id, action }
  const [comment,   setComment]   = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const search = useDebounce(rawSearch, 300);
  const { profile } = useAuth();

  const { data, total, loading, error, refresh } = usePendingApprovals({ page, search });

  // Urgent count
  const urgentCount = data.filter(r => {
    const d = daysUntil(r.requested_date);
    return d !== null && d < 3;
  }).length;

  const handleApproveClick = useCallback((id, e) => {
    e.stopPropagation();
    setConfirmId(id);
    setConfirmAction('approved');
    setComment('');
  }, []);

  const handleRejectClick = useCallback((id, e) => {
    e.stopPropagation();
    setConfirmId(id);
    setConfirmAction('rejected');
    setComment('');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!confirmId || !confirmAction) return;
    setActing({ id: confirmId, action: confirmAction });
    const { error: err } = await submitApproval({
      requestId: confirmId,
      action:    confirmAction,
      comment,
      profile,
    });
    setActing(null);
    setConfirmId(null);
    setConfirmAction(null);
    setComment('');
    if (!err) refresh();
  }, [confirmId, confirmAction, comment, profile, refresh]);

  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans', system-ui, sans-serif", color:D.ink }}>
      <style>{HRGA_TABLE_CSS}</style>

      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <nav style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:D.inkFaint, marginBottom:8 }}>
            <span>Home</span><span>›</span><span>Service Management</span><span>›</span>
            <span style={{ color:D.inkSoft, fontWeight:600 }}>Pending Approval</span>
          </nav>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.4px', margin:0 }}>Pending Approval</h1>
          <div style={{ fontSize:13.5, color:D.inkSoft, marginTop:4 }}>
            Request yang menunggu persetujuanmu · tindak langsung dari sini
          </div>
        </div>
      </div>

      {urgentCount > 0 && (
        <Banner tone="warn" icon={AlertTriangle}>
          Ada <b>{urgentCount} request</b> dengan tenggat kurang dari 3 hari. Mohon prioritaskan persetujuan agar tidak melewati SLA.
        </Banner>
      )}

      {/* Confirm modal */}
      {confirmId && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:40, background:'rgba(0,0,0,.35)' }}
            onClick={() => { setConfirmId(null); setConfirmAction(null); }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            zIndex:50, background:D.surface, borderRadius:12, boxShadow:'0 16px 48px rgba(0,0,0,.18)',
            padding:24, width:400, maxWidth:'90vw' }}>
            <h3 style={{ margin:'0 0 10px', fontSize:16, fontWeight:700 }}>
              {confirmAction === 'approved' ? 'Approve Request?' : 'Reject Request?'}
            </h3>
            <p style={{ fontSize:13, color:D.inkSoft, margin:'0 0 14px' }}>
              {confirmAction === 'approved'
                ? 'Request akan dilanjutkan ke tahap berikutnya atau ditandai approved.'
                : 'Request akan ditolak. Kamu dapat menambahkan alasan penolakan.'}
            </p>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder={confirmAction === 'approved' ? 'Catatan (opsional)…' : 'Alasan penolakan (opsional)…'}
              rows={3}
              style={{ width:'100%', borderRadius:8, border:`1px solid ${D.line}`, padding:'8px 10px',
                fontSize:13, fontFamily:'inherit', resize:'vertical', outline:'none',
                background:D.surface2, color:D.ink, boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:10, marginTop:14, justifyContent:'flex-end' }}>
              <Btn onClick={() => { setConfirmId(null); setConfirmAction(null); }}>Batal</Btn>
              <Btn primary={confirmAction === 'approved'} danger={confirmAction === 'rejected'}
                onClick={handleConfirm} disabled={!!acting}
                icon={confirmAction === 'approved' ? Check : Ban}>
                {acting ? 'Memproses…' : confirmAction === 'approved' ? 'Approve' : 'Reject'}
              </Btn>
            </div>
          </div>
        </>
      )}

      {/* Table card */}
      <Card>
        <FilterBar search={rawSearch} onSearch={v => { setRawSearch(v); setPage(1); }}
          placeholder="Cari no. dokumen, keperluan, nama pengaju…" onRefresh={refresh} />

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
                  <th>Tgl Dibutuhkan</th>
                  <th style={{ textAlign:'right' }}>Estimasi Biaya</th>
                  <th>Status</th>
                  <th className="stick-r" style={{ width:210, right:0 }}>Aksi Cepat</th>
                </tr>
              </thead>
              <tbody>
                {loading && <LoadingRow colspan={9} />}
                {!loading && data.length === 0 && <EmptyRow colspan={9} message="Tidak ada request menunggu approval." />}
                {!loading && data.map(row => {
                  const days   = daysUntil(row.requested_date);
                  const urgent = days !== null && days < 3;
                  const isActing = acting?.id === row.id;
                  return (
                    <tr key={row.id} className={urgent ? 'row-urgent' : ''}
                      style={{ cursor:'pointer' }}
                      onClick={() => onOpenDetail?.(row.id)}>
                      <td className="stick-l" style={{ left:0 }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" style={{ width:15, height:15, cursor:'pointer', accentColor:D.accent }} />
                      </td>
                      <td className="stick-l" style={{ left:34 }}>
                        <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:12.5, fontWeight:600, color:D.accent }}>
                          {row.document_no}
                        </span>
                        {urgent && (
                          <span style={{ marginLeft:6, display:'inline-flex', alignItems:'center', gap:3,
                            fontSize:10.5, fontWeight:700, padding:'1px 6px', borderRadius:20,
                            background:D.dangerBg, color:D.danger, border:`1px solid ${D.dangerBd}` }}>
                            {days}h
                          </span>
                        )}
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
                        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                          <button className="btn-sm qa-approve" disabled={!!acting}
                            onClick={(e) => handleApproveClick(row.id, e)}
                            style={{ display:'inline-flex', alignItems:'center', gap:5, height:28, padding:'0 9px',
                              borderRadius:7, border:'none', cursor:acting?'not-allowed':'pointer',
                              fontSize:11.5, fontWeight:600, fontFamily:'inherit', opacity:isActing?.6:1 }}>
                            <Check size={13} strokeWidth={2} />Approve
                          </button>
                          <button className="btn-sm qa-reject" disabled={!!acting}
                            onClick={(e) => handleRejectClick(row.id, e)}
                            style={{ display:'inline-flex', alignItems:'center', gap:5, height:28, padding:'0 9px',
                              borderRadius:7, border:`1px solid ${D.dangerBd}`, background:D.surface,
                              cursor:acting?'not-allowed':'pointer', fontSize:11.5, fontWeight:600, fontFamily:'inherit',
                              color:D.danger, opacity:isActing?.6:1 }}>
                            <Ban size={13} strokeWidth={2} />Reject
                          </button>
                          <button onClick={() => onOpenDetail?.(row.id)} title="Lihat"
                            style={{ width:28, height:28, borderRadius:7, border:`1px solid ${D.line}`,
                              background:D.surface, cursor:'pointer', display:'flex', alignItems:'center',
                              justifyContent:'center', color:D.inkSoft }}>
                            <Eye size={13} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pager page={page} total={total} pageSize={HRGA_PAGE_SIZE} onPage={setPage} />
      </Card>
    </div>
  );
}

// src/modules/hrga/pages/HrgaDetailPage.jsx
// HRGA Request — Detail page.
// Design: hrga-detail.html — header card + 2-col grid (info + approval timeline) + activity feed.

import { useState, useCallback } from 'react';
import {
  ArrowLeft, ChevronRight, Check, Ban, HelpCircle,
  User, Calendar, Clock,
  Send, CheckCircle2,
} from 'lucide-react';
import {
  D, Card, HrgaStatusBadge, TypePill, Btn,
  fmtDate, fmtDateLong, fmtRupiah, daysUntil, initials, avatarBg,
  HRGA_TABLE_CSS,
} from '../HrgaShared';
import { useHrgaRequestDetail, submitApproval } from '../../../hooks/useHrgaRequests';
import { useAuth } from '../../../contexts/useAuth';

// Approval timeline node
function ApprovalNode({ node, isLast }) {
  const stateClass = node.action === 'approved' ? 'done'
    : node.action === 'rejected' ? 'reject'
    : node.isPending ? 'pending'
    : 'wait';

  const dotBg    = stateClass === 'done' ? D.accent : stateClass === 'reject' ? D.danger : D.surface;
  const dotBd    = stateClass === 'done' ? D.accent : stateClass === 'reject' ? D.danger
    : stateClass === 'pending' ? D.warn : D.line;
  const dotColor = stateClass === 'done' ? '#fff' : stateClass === 'reject' ? '#fff'
    : stateClass === 'pending' ? D.warn : D.inkFaint;
  const stateColor = stateClass === 'done' ? D.accent : stateClass === 'reject' ? D.danger
    : stateClass === 'pending' ? D.warn : D.inkFaint;
  const stateLabel = node.action === 'approved' ? 'Disetujui'
    : node.action === 'rejected' ? 'Ditolak'
    : node.isPending ? 'Menunggu approval'
    : 'Belum diproses';

  return (
    <div style={{ display:'flex', gap:0, position:'relative', paddingBottom: isLast?0:20 }}>
      {/* Vertical line */}
      {!isLast && (
        <div style={{ position:'absolute', left:15, top:32, bottom:0, width:2, background:D.lineSoft }} />
      )}
      {/* Node dot */}
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        border:`2px solid ${dotBd}`, background:dotBg, color:dotColor,
        fontSize:11, fontWeight:700, zIndex:1 }}>
        {node.avatarInitials}
      </div>
      {/* Content */}
      <div style={{ flex:1, paddingLeft:12 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:6, flexWrap:'wrap' }}>
          <b style={{ fontSize:13.5 }}>{node.name}</b>
          <span style={{ fontSize:12, color:D.inkFaint }}>{node.role}</span>
          <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:11, color:D.inkFaint, marginLeft:'auto' }}>
            {node.when || 'menunggu'}
          </span>
        </div>
        <div style={{ fontSize:12, marginTop:2, fontWeight:600, color:stateColor }}>{stateLabel}</div>
        {node.comment && (
          <div style={{ marginTop:7, fontSize:12, color:D.inkSoft,
            background:D.surface2, border:`1px solid ${D.lineSoft}`, borderRadius:8,
            padding:'9px 11px', lineHeight:1.45 }}>
            {node.comment}
          </div>
        )}
      </div>
    </div>
  );
}

// Activity feed item
function FeedItem({ item }) {
  const isSystem = !item.actor_name;
  const av = isSystem
    ? <span style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex',
        alignItems:'center', justifyContent:'center', background:D.bgAlt, color:D.inkSoft }}>
        <CheckCircle2 size={15} strokeWidth={1.8} />
      </span>
    : <span style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex',
        alignItems:'center', justifyContent:'center', background:avatarBg(item.actor_name),
        color:'#fff', fontSize:11, fontWeight:700 }}>
        {initials(item.actor_name)}
      </span>;

  return (
    <div style={{ display:'flex', gap:12, padding:'13px 0', borderBottom:`1px solid ${D.lineSoft}` }}>
      {av}
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:7, flexWrap:'wrap' }}>
          <b style={{ fontSize:13 }}>{item.actor_name || 'Sistem'}</b>
          {item.isAction && <span style={{ fontSize:12.5, color:D.inkSoft }}>{item.text}</span>}
          <span style={{ fontSize:11.5, color:D.inkFaint, marginLeft:'auto' }}>{item.time}</span>
        </div>
        {!item.isAction && <div style={{ fontSize:13, color:D.ink, lineHeight:1.5, marginTop:3 }}>{item.text}</div>}
      </div>
    </div>
  );
}

export default function HrgaDetailPage({ requestId, onBack }) {
  const { data: req, loading, error, refresh } = useHrgaRequestDetail(requestId);
  const { profile } = useAuth();
  const [comment, setComment] = useState('');
  const [acting,  setActing]  = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const handleApprove = useCallback(async () => {
    if (confirmAction !== 'approved') { setConfirmAction('approved'); return; }
    setActing('approved');
    const { error: err } = await submitApproval({ requestId, action:'approved', comment, profile });
    setActing(null); setConfirmAction(null); setComment('');
    if (!err) refresh();
  }, [confirmAction, requestId, comment, profile, refresh]);

  const handleReject = useCallback(async () => {
    if (confirmAction !== 'rejected') { setConfirmAction('rejected'); return; }
    setActing('rejected');
    const { error: err } = await submitApproval({ requestId, action:'rejected', comment, profile });
    setActing(null); setConfirmAction(null); setComment('');
    if (!err) refresh();
  }, [confirmAction, requestId, comment, profile, refresh]);

  if (loading) {
    return <div style={{ padding:'3rem', textAlign:'center', color:D.inkFaint, fontSize:13 }}>Memuat detail…</div>;
  }
  if (error || !req) {
    return <div style={{ padding:'3rem', textAlign:'center', color:D.danger, fontSize:13 }}>
      {error ? `Gagal memuat: ${error.message}` : 'Request tidak ditemukan.'}</div>;
  }

  const days        = daysUntil(req.requested_date);
  const dueSoon     = days !== null && days >= 0 && days < 3;
  const isPending   = req.status === 'submitted' || req.status === 'in_progress';
  const canApprove  = isPending && profile?.id;
  const categoryCode = req.hrga_request_types?.category_code;
  const typeName     = req.hrga_request_types?.type_name;

  // Build approval timeline nodes
  const nodes = [];
  // Requester (always first)
  nodes.push({
    avatarInitials: initials(req.requester_name || 'User'),
    name: req.requester_name || 'User',
    role: 'Pengaju',
    when: req.submitted_at ? fmtDateLong(req.submitted_at) : null,
    action: 'submitted',
    isAction: true,
    comment: null,
  });
  // Past approvals
  (req.approvals || []).forEach(a => {
    nodes.push({
      avatarInitials: initials(a.approver_name || a.approver_role || 'A'),
      name: a.approver_name || a.approver_role || `Level ${a.level} Approver`,
      role: a.approver_role || '',
      when: a.actioned_at ? fmtDateLong(a.actioned_at) : null,
      action: a.action,
      comment: a.comment,
    });
  });
  // Current pending level
  const approvedLevels = (req.approvals || []).filter(a => a.action === 'approved').length;
  if (isPending && approvedLevels < (req.total_levels || 1)) {
    const nextRole = req.level_roles?.[req.current_level];
    nodes.push({
      avatarInitials: (nextRole || 'A')[0].toUpperCase(),
      name: nextRole || `Level ${req.current_level} Approver`,
      role: nextRole || '',
      when: null,
      action: null,
      isPending: true,
      comment: null,
    });
  }
  // HRGA team execution (last)
  if (req.status !== 'draft' && req.status !== 'cancelled' && req.status !== 'rejected') {
    nodes.push({
      avatarInitials: 'HR',
      name: 'HRGA Team',
      role: 'Pelaksana',
      when: null,
      action: req.status === 'completed' ? 'approved' : null,
      isPending: false,
      comment: null,
    });
  }

  // Activity log (built from approval actions)
  const activityLog = [
    { actor_name: req.requester_name, isAction:true, text:'membuat request ini',
      time: req.submitted_at ? fmtDate(req.submitted_at) : '' },
    { actor_name: null, isAction:true, text:'Status berubah menjadi Submitted',
      time: req.submitted_at ? fmtDate(req.submitted_at) : '' },
    ...(req.approvals || []).map(a => ({
      actor_name: a.approver_name || a.approver_role,
      isAction: false,
      text: a.comment || `Request ${a.action === 'approved' ? 'disetujui' : 'ditolak'}.`,
      time: a.actioned_at ? fmtDate(a.actioned_at) : '',
    })),
  ];

  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans', system-ui, sans-serif", color:D.ink }}>
      <style>{HRGA_TABLE_CSS}</style>

      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom:18, flexWrap:'wrap' }}>
        <div>
          <nav style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:D.inkFaint, marginBottom:8 }}>
            {onBack && (
              <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:4,
                background:'none', border:'none', cursor:'pointer', color:D.inkFaint,
                fontFamily:'inherit', fontSize:12.5, padding:0 }}>
                <ArrowLeft size={13} />
              </button>
            )}
            <span>Home</span><ChevronRight size={12} />
            <span>HRGA Request</span><ChevronRight size={12} />
            <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontWeight:600, color:D.inkSoft }}>
              {req.document_no}
            </span>
          </nav>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.4px', margin:0 }}>Detail Request</h1>
        </div>
        <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:7, height:36,
          padding:'0 14px', borderRadius:8, border:`1px solid ${D.line}`, background:D.surface,
          cursor:'pointer', fontSize:13, fontWeight:600, color:D.inkSoft, fontFamily:'inherit' }}>
          <ArrowLeft size={14} strokeWidth={1.8} />Kembali
        </button>
      </div>

      {/* Header card */}
      <Card style={{ marginBottom:14 }}>
        <div style={{ display:'flex', gap:20, padding:22, flexWrap:'wrap', alignItems:'flex-start' }}>
          <div style={{ flex:1, minWidth:280 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8, flexWrap:'wrap' }}>
              <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:20, fontWeight:600, letterSpacing:.5 }}>
                {req.document_no}
              </span>
              <HrgaStatusBadge status={req.status} />
            </div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:10, lineHeight:1.45, maxWidth:560 }}>
              {req.subject}
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
              <TypePill categoryCode={categoryCode} typeName={typeName} />
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 20px', fontSize:12.5, color:D.inkSoft }}>
              {req.requester_name && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <User size={13} color={D.inkFaint} />
                  Diajukan oleh <b style={{ color:D.ink }}>{req.requester_name}</b>
                </span>
              )}
              {req.submitted_at && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <Calendar size={13} color={D.inkFaint} />
                  Diajukan <b style={{ color:D.ink }}>{fmtDateLong(req.submitted_at)}</b>
                </span>
              )}
              {req.requested_date && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <Clock size={13} color={D.inkFaint} />
                  Dibutuhkan{' '}
                  <b style={{ color:dueSoon?D.danger:D.ink, fontWeight:dueSoon?700:600 }}>
                    {fmtDateLong(req.requested_date)}
                  </b>
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {canApprove && (
            <div style={{ display:'flex', flexDirection:'column', gap:9, minWidth:180 }}>
              {confirmAction === 'approved' ? (
                <>
                  <div style={{ fontSize:12.5, color:D.inkSoft, marginBottom:2 }}>Catatan (opsional):</div>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    rows={2} placeholder="Tulis catatan…"
                    style={{ width:'100%', borderRadius:8, border:`1px solid ${D.line}`,
                      padding:'7px 9px', fontSize:12.5, fontFamily:'inherit', resize:'none',
                      background:D.surface2, color:D.ink, outline:'none', boxSizing:'border-box' }} />
                  <div style={{ display:'flex', gap:8 }}>
                    <Btn primary icon={Check} onClick={handleApprove} disabled={!!acting}>
                      {acting==='approved' ? 'Memproses…' : 'Konfirmasi Approve'}
                    </Btn>
                    <Btn onClick={() => setConfirmAction(null)}>Batal</Btn>
                  </div>
                </>
              ) : confirmAction === 'rejected' ? (
                <>
                  <div style={{ fontSize:12.5, color:D.inkSoft, marginBottom:2 }}>Alasan penolakan:</div>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    rows={2} placeholder="Tulis alasan…"
                    style={{ width:'100%', borderRadius:8, border:`1px solid ${D.dangerBd}`,
                      padding:'7px 9px', fontSize:12.5, fontFamily:'inherit', resize:'none',
                      background:D.dangerBg, color:D.ink, outline:'none', boxSizing:'border-box' }} />
                  <div style={{ display:'flex', gap:8 }}>
                    <Btn danger icon={Ban} onClick={handleReject} disabled={!!acting}>
                      {acting==='rejected' ? 'Memproses…' : 'Konfirmasi Reject'}
                    </Btn>
                    <Btn onClick={() => setConfirmAction(null)}>Batal</Btn>
                  </div>
                </>
              ) : (
                <>
                  <Btn primary icon={Check} onClick={handleApprove}>Approve</Btn>
                  <Btn danger icon={Ban} onClick={handleReject}>Reject</Btn>
                  <Btn icon={HelpCircle} onClick={() => {}}>Minta Info</Btn>
                </>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* 2-column grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:14, alignItems:'start' }}>
        {/* LEFT */}
        <div>
          {/* Info card */}
          <Card style={{ marginBottom:14, padding:'4px 20px 16px' }}>
            <dl style={{ margin:0 }}>
              {/* Info Dasar */}
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:D.inkFaint, padding:'14px 0 6px' }}>
                Informasi Dasar
              </div>
              {[
                ['No. Dokumen', req.document_no, true],
                ['Tipe Request', typeName],
                ['Keperluan / Tujuan', req.subject],
              ].map(([k, v, mono]) => (
                <div key={k} style={{ display:'grid', gridTemplateColumns:'160px 1fr', padding:'7px 0',
                  borderBottom:`1px solid ${D.lineSoft}`, gap:12 }}>
                  <dt style={{ fontSize:12.5, color:D.inkFaint, fontWeight:600 }}>{k}</dt>
                  <dd style={{ margin:0, fontSize:13.5, color:D.ink, fontWeight:500,
                    fontFamily:mono?"'IBM Plex Mono', monospace":undefined }}>{v || '—'}</dd>
                </div>
              ))}

              {/* Items */}
              {(req.items || []).length > 0 && (
                <>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:D.inkFaint, padding:'14px 0 6px' }}>
                    Detail Item
                  </div>
                  {req.items.map(item => (
                    <div key={item.id} style={{ display:'grid', gridTemplateColumns:'160px 1fr', padding:'7px 0',
                      borderBottom:`1px solid ${D.lineSoft}`, gap:12 }}>
                      <dt style={{ fontSize:12.5, color:D.inkFaint, fontWeight:600 }}>{item.item_description}</dt>
                      <dd style={{ margin:0, fontSize:13, color:D.ink, fontFamily:"'IBM Plex Mono', monospace", fontWeight:500 }}>
                        {item.quantity} {item.unit || ''}
                        {item.notes ? ` · ${item.notes}` : ''}
                      </dd>
                    </div>
                  ))}
                  {req.amount && (
                    <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', padding:'9px 0 9px',
                      background:D.accentSoft, borderRadius:6, marginTop:4, gap:12, paddingLeft:8 }}>
                      <dt style={{ fontSize:12.5, color:D.accentInk, fontWeight:700 }}>Total Estimasi Biaya</dt>
                      <dd style={{ margin:0, fontSize:15, color:D.accentInk, fontFamily:"'IBM Plex Mono', monospace", fontWeight:700 }}>
                        {fmtRupiah(req.amount)}
                      </dd>
                    </div>
                  )}
                </>
              )}

              {/* Waktu */}
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:D.inkFaint, padding:'14px 0 6px' }}>
                Waktu &amp; Prioritas
              </div>
              {[
                ['Tgl Diajukan',  fmtDateLong(req.submitted_at), true],
                ['Tgl Dibutuhkan', fmtDateLong(req.requested_date), true],
              ].map(([k, v, mono]) => (
                <div key={k} style={{ display:'grid', gridTemplateColumns:'160px 1fr', padding:'7px 0',
                  borderBottom:`1px solid ${D.lineSoft}`, gap:12 }}>
                  <dt style={{ fontSize:12.5, color:D.inkFaint, fontWeight:600 }}>{k}</dt>
                  <dd style={{ margin:0, fontSize:13.5, color:dueSoon&&k==='Tgl Dibutuhkan'?D.danger:D.ink, fontWeight:500,
                    fontFamily:mono?"'IBM Plex Mono', monospace":undefined }}>{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Activity log + comment */}
          <Card>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'14px 16px', borderBottom:`1px solid ${D.lineSoft}` }}>
              <span style={{ fontWeight:700, fontSize:14 }}>Activity Log &amp; Komentar</span>
            </div>
            <div style={{ padding:'0 16px' }}>
              {activityLog.map((item, i) => <FeedItem key={i} item={item} />)}
            </div>
            {/* Comment input */}
            <div style={{ padding:'14px 16px', display:'flex', gap:10, alignItems:'flex-start',
              borderTop:`1px solid ${D.lineSoft}` }}>
              <span style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex',
                alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700,
                color:'#fff', background:profile?.full_name ? avatarBg(profile.full_name) : D.accent }}>
                {initials(profile?.full_name || 'U')}
              </span>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Tulis komentar…" rows={2}
                style={{ flex:1, borderRadius:8, border:`1px solid ${D.line}`, padding:'8px 10px',
                  fontSize:13, fontFamily:'inherit', resize:'none', outline:'none',
                  background:D.surface2, color:D.ink }}
                onFocus={e => e.target.style.borderColor=D.accent}
                onBlur={e => e.target.style.borderColor=D.line} />
              <Btn primary icon={Send} small>Kirim</Btn>
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Approval timeline */}
          <Card>
            <div style={{ padding:'14px 16px', borderBottom:`1px solid ${D.lineSoft}` }}>
              <span style={{ fontWeight:700, fontSize:14 }}>Approval Timeline</span>
            </div>
            <div style={{ padding:'16px 16px 16px 50px', position:'relative' }}>
              {nodes.map((node, i) => (
                <ApprovalNode key={i} node={node} isLast={i === nodes.length - 1} />
              ))}
            </div>
          </Card>

          {/* Summary card */}
          <Card style={{ padding:16 }}>
            <div style={{ fontWeight:700, fontSize:13.5, marginBottom:12 }}>Ringkasan</div>
            {[
              ['Status', <HrgaStatusBadge key="s" status={req.status} />],
              ['Approver Saat Ini', req.level_roles?.[req.current_level] || '—'],
              ['Estimasi Selesai', '3–5 hari kerja'],
              ['Total Biaya', fmtRupiah(req.amount)],
            ].map(([k, v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:8,
                fontSize:12.5, marginBottom:10, alignItems:'center' }}>
                <span style={{ color:D.inkFaint, fontWeight:600, whiteSpace:'nowrap' }}>{k}</span>
                <span style={{ fontWeight:600, textAlign:'right' }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

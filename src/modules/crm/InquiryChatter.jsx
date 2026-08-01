// src/modules/crm/InquiryChatter.jsx
// Chatter — komentar bebas + @mention untuk satu inquiry (kolom kanan persisten
// DealDetailPage.jsx). Tabel `inquiry_comments`/`inquiry_comment_mentions` sudah
// dibuat manual di Supabase (skema+RLS final) — file ini murni UI baca/tulis,
// TIDAK ada perubahan skema/RLS.
//
// Props:
//   inquiryId        : string — inquiry yang komentarnya ditampilkan
//   companyId        : string — scope query daftar orang yang bisa di-tag
//   inquiryNo        : string — dipakai di teks notifikasi mention
//   priorityUserIds  : string[] — id assigned_profile/assigned_to/created_by
//                       (dihitung DealDetailPage.jsx), tampil duluan di dropdown mention
//   showToast        : (msg, type?) => void — dari DealDetailPage.jsx, dipanggil di
//                       tiap jalur tulis yang gagal (TD-164)
//
// FK `inquiry_comments.created_by` belum terverifikasi di schema_snapshot.sql (tabel
// baru, pg_dump belum jalan) — sengaja TIDAK pakai PostgREST embed (nama constraint
// bisa salah tebak), pakai fetch 2-langkah (pola sama profMap di DealDetailPage.jsx).
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Send, Pencil, Trash2, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ConfirmModal from '../../components/ConfirmModal';
import { C, HEAD, BODY, Card } from './DealPanels';

function initialsOf(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

// Waktu relatif — wording sama gaya notifTimeAgo (App.jsx), yang tak diekspor
// (closure lokal di komponen App) jadi disalin di sini, bukan diimpor.
function timeAgo(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return 'baru saja';
  if (d < 3600) return `${Math.floor(d / 60)} menit lalu`;
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
  return `${Math.floor(d / 86400)} hari lalu`;
}

// Cari token "@query" yang sedang diketik tepat sebelum cursor. Match hanya
// dipicu bila "@" didahului awal-string atau spasi (supaya "email@domain.com"
// tak ikut memicu), dan query-nya berhenti di whitespace pertama.
function findActiveMention(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const m = before.match(/(^|\s)(@[^\s@]*)$/);
  if (!m) return null;
  const atToken = m[2];
  return { atStart: before.length - atToken.length, query: atToken.slice(1) };
}

const ghostBtn = (danger) => ({
  height: 28, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${danger ? C.redBd : C.border}`, background: '#fff',
  color: danger ? C.red : C.navy, fontFamily: HEAD, fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
});

export default function InquiryChatter({ inquiryId, companyId, inquiryNo, priorityUserIds, showToast }) {
  const { profile, user } = useAuth();
  const currentUserId = user?.id || profile?.id;

  const [comments, setComments] = useState([]);
  const [authorMap, setAuthorMap] = useState({});
  const [loadingComments, setLoadingComments] = useState(false);
  const [taggableList, setTaggableList] = useState([]);

  const [newBody, setNewBody] = useState('');
  const [mentions, setMentions] = useState([]); // [{userId, name}] — dari seleksi eksplisit
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAtStart, setMentionAtStart] = useState(0);
  const [mentionCoords, setMentionCoords] = useState(null);

  const textareaRef = useRef(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const refetchComments = useCallback(async () => {
    if (!inquiryId) return;
    setLoadingComments(true);
    const { data: rows, error } = await supabase
      .from('inquiry_comments')
      .select('id, body, created_at, updated_at, created_by')
      .eq('inquiry_id', inquiryId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[chatter] fetch comments failed:', error.message);
      showToast?.('Gagal memuat komentar: ' + error.message, 'error');
      setLoadingComments(false);
      return;
    }
    const list = rows || [];
    const authorIds = [...new Set(list.map((r) => r.created_by).filter(Boolean))];
    let map = {};
    if (authorIds.length) {
      const { data: authors } = await supabase
        .from('profiles').select('id, full_name, avatar_url').in('id', authorIds).limit(1000);
      (authors || []).forEach((a) => { map[a.id] = a; });
    }
    setAuthorMap(map);
    setComments(list);
    setLoadingComments(false);
  }, [inquiryId, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refetchComments(); }, [refetchComments]);

  // Daftar orang yang bisa di-tag — company-scoped (bukan role-scoped seperti
  // fetchAssignees; tag lebih inklusif dari sekadar "pemilik deal").
  useEffect(() => {
    if (!companyId) return undefined;
    let cancelled = false;
    supabase.from('profiles')
      .select('id, full_name, avatar_url')
      .eq('company_id', companyId).eq('active', true)
      .order('full_name').limit(1000)
      .then(({ data }) => { if (!cancelled) setTaggableList(data || []); });
    return () => { cancelled = true; };
  }, [companyId]);

  // Posisi dropdown mention — anchor ke bounding rect textarea (pola AccountPicker/InquiryPicker).
  useEffect(() => {
    if (!mentionOpen) return undefined;
    const update = () => {
      const el = textareaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dropdownHeight = 220;
      const spaceBelow = window.innerHeight - r.bottom;
      const flipUp = spaceBelow < dropdownHeight && r.top > dropdownHeight;
      setMentionCoords({ top: flipUp ? r.top - dropdownHeight : r.bottom, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [mentionOpen]);

  useEffect(() => {
    if (!mentionOpen) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setMentionOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMentionOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocDown); document.removeEventListener('keydown', onKey); };
  }, [mentionOpen]);

  const mentionMatches = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const filtered = q.length === 0 ? taggableList : taggableList.filter((p) => p.full_name?.toLowerCase().includes(q));
    const priority = filtered.filter((p) => priorityUserIds?.includes(p.id)).slice(0, 5);
    const rest = filtered.filter((p) => !priorityUserIds?.includes(p.id)).slice(0, 8);
    return { priority, rest };
  }, [mentionQuery, taggableList, priorityUserIds]);
  const hasMentionMatches = mentionMatches.priority.length > 0 || mentionMatches.rest.length > 0;

  const handleComposerChange = (e) => {
    const value = e.target.value;
    setNewBody(value);
    const cursorPos = e.target.selectionStart;
    const active = findActiveMention(value, cursorPos);
    if (active) {
      setMentionQuery(active.query);
      setMentionAtStart(active.atStart);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const pickMention = (person) => {
    const el = textareaRef.current;
    const cursorPos = el ? el.selectionStart : newBody.length;
    const before = newBody.slice(0, mentionAtStart);
    const after = newBody.slice(cursorPos);
    const insertion = `@${person.full_name} `;
    setNewBody(before + insertion + after);
    setMentions((prev) => (prev.some((m) => m.userId === person.id) ? prev : [...prev, { userId: person.id, name: person.full_name }]));
    setMentionOpen(false);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSubmit = async () => {
    const body = newBody.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const { data: inserted, error: insErr } = await supabase
        .from('inquiry_comments')
        .insert({ inquiry_id: inquiryId, company_id: companyId, created_by: currentUserId, body })
        .select('id').single();
      if (insErr) throw insErr;
      const newCommentId = inserted.id;

      // Tag final — hanya yang teksnya masih ada di body (user mungkin sudah
      // menghapus sebagian mention setelah insert), dedupe by userId.
      const seen = new Set();
      const finalTags = mentions.filter((m) => body.includes(`@${m.name}`) && !seen.has(m.userId) && seen.add(m.userId));

      if (finalTags.length) {
        try {
          await supabase.from('inquiry_comment_mentions')
            .insert(finalTags.map((m) => ({ comment_id: newCommentId, user_id: m.userId })));
        } catch (e) {
          console.error('[chatter] insert mentions failed:', e?.message || e);
          showToast?.('Komentar terkirim, tapi menandai beberapa orang gagal.', 'error');
        }

        const taggerName = profile?.full_name || user?.email || 'Seseorang';
        const notifRows = finalTags
          .filter((m) => m.userId !== currentUserId) // jangan notif diri sendiri
          .map((m) => ({
            company_id: companyId,
            user_id: m.userId,
            event_type: 'inquiry_mention',
            title: 'Anda di-tag di komentar',
            body: `${taggerName} men-tag Anda di komentar pada inquiry ${inquiryNo || ''}`.trim(),
            reference_type: 'inquiry',
            reference_id: inquiryId,
          }));
        if (notifRows.length) {
          try { await supabase.from('notifications').insert(notifRows); }
          catch (e) {
            console.error('[chatter] notify mentions failed:', e?.message || e);
            showToast?.('Komentar terkirim, tapi notifikasi ke beberapa orang gagal terkirim.', 'error');
          }
        }
      }

      setNewBody('');
      setMentions([]);
      await refetchComments();
    } catch (e) {
      console.error('[chatter] submit comment failed:', e?.message || e);
      showToast?.('Gagal mengirim komentar: ' + (e?.message || e), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (c) => { setEditingId(c.id); setEditBody(c.body); };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); };
  const saveEdit = async (commentId) => {
    const body = editBody.trim();
    if (!body || savingEdit) return;
    setSavingEdit(true);
    try {
      const { data, error } = await supabase
        .from('inquiry_comments')
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Tidak ada izin mengubah komentar ini.');
      setEditingId(null);
      setEditBody('');
      await refetchComments();
    } catch (e) {
      console.error('[chatter] edit comment failed:', e?.message || e);
      showToast?.('Gagal menyimpan perubahan komentar: ' + (e?.message || e), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase
        .from('inquiry_comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteTarget.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Tidak ada izin menghapus komentar ini.');
      setDeleteTarget(null);
      await refetchComments();
    } catch (e) {
      console.error('[chatter] delete comment failed:', e?.message || e);
      showToast?.('Gagal menghapus komentar: ' + (e?.message || e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card title="Chatter" icon={<MessageCircle size={17} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loadingComments ? (
          <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Memuat komentar…</div>
        ) : comments.length === 0 ? (
          <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Belum ada komentar</div>
        ) : (
          comments.map((c) => {
            const author = authorMap[c.created_by];
            const isMine = c.created_by === currentUserId;
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                {author?.avatar_url ? (
                  <img src={author.avatar_url} alt={author.full_name} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
                ) : (
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: C.navySoft, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontFamily: HEAD, fontSize: 11, fontWeight: 700 }}>
                    {initialsOf(author?.full_name)}
                  </span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, color: C.text }}>{author?.full_name || '—'}</span>
                    <span style={{ fontFamily: BODY, fontSize: 11, color: C.textFaint }}>
                      {timeAgo(c.created_at)}{c.updated_at ? ' · (diedit)' : ''}
                    </span>
                  </div>
                  {isEditing ? (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 9, border: `1px solid ${C.borderStrong}`, padding: '8px 10px', fontFamily: BODY, fontSize: 13, color: C.text, resize: 'vertical', outline: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => saveEdit(c.id)} disabled={savingEdit} style={ghostBtn(false)}><Check size={13} />{savingEdit ? 'Menyimpan…' : 'Simpan'}</button>
                        <button type="button" onClick={cancelEdit} disabled={savingEdit} style={ghostBtn(false)}><X size={13} />Batal</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ marginTop: 3, fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
                      {isMine && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                          <button type="button" onClick={() => startEdit(c)} style={ghostBtn(false)}><Pencil size={12} />Edit</button>
                          <button type="button" onClick={() => setDeleteTarget(c)} style={ghostBtn(true)}><Trash2 size={12} />Hapus</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div ref={wrapRef} style={{ position: 'relative', borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <textarea
            ref={textareaRef}
            value={newBody}
            onChange={handleComposerChange}
            placeholder="Tulis komentar… ketik @ untuk tag seseorang"
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${C.borderStrong}`, padding: '9px 11px', fontFamily: BODY, fontSize: 13, color: C.text, resize: 'vertical', outline: 'none' }}
          />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !newBody.trim()}
              style={{ height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: submitting || !newBody.trim() ? C.grayBg : C.orange, color: submitting || !newBody.trim() ? C.gray : '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, cursor: submitting || !newBody.trim() ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={13} />{submitting ? 'Mengirim…' : 'Kirim'}
            </button>
          </div>

          {mentionOpen && mentionCoords && hasMentionMatches && createPortal(
            <div
              ref={menuRef}
              style={{
                position: 'fixed', top: mentionCoords.top, left: mentionCoords.left, width: mentionCoords.width, marginTop: 2,
                background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
                boxShadow: '0 6px 20px rgba(15,23,42,.16)', zIndex: 9999,
                maxHeight: 220, overflowY: 'auto',
              }}
            >
              {mentionMatches.priority.length > 0 && (
                <>
                  <div style={{ padding: '6px 10px', fontFamily: HEAD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.textFaint }}>Terkait deal ini</div>
                  {mentionMatches.priority.map((p) => (
                    <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceAlt)} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      <span style={{ fontSize: 13, color: C.text }}>{p.full_name}</span>
                    </button>
                  ))}
                </>
              )}
              {mentionMatches.rest.length > 0 && (
                <>
                  <div style={{ padding: '6px 10px', fontFamily: HEAD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.textFaint }}>Lainnya</div>
                  {mentionMatches.rest.map((p) => (
                    <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceAlt)} onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      <span style={{ fontSize: 13, color: C.text }}>{p.full_name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>,
            document.body
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Hapus komentar?"
        message="Komentar ini akan dihapus dari chatter. Tindakan ini tidak bisa dibatalkan."
        confirmLabel={deleting ? 'Menghapus…' : 'Hapus'}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}

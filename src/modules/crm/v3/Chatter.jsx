/* =========================================================================
   Chatter — generalisasi `src/modules/crm/InquiryChatter.jsx`.

   APA YANG BERUBAH: hanya KONTRAK PROPS. Logic komentar/mention/notifikasi
   disalin apa adanya dari InquiryChatter (fetch 2-langkah untuk author,
   dropdown mention ber-portal, tag final difilter ulang dari body, notifikasi
   in-app + email fan-out best-effort). Tidak ada perilaku baru.

   ⚠️ INI FE-ONLY. Tabel `inquiry_comments.inquiry_id` masih `NOT NULL` FK ke
   `inquiries`, jadi satu-satunya `entityType` yang dilayani sekarang adalah
   'inquiry'. Props `entityType`/`entityId` ada supaya batch berikutnya
   (Account / Quotation / SO / Contract / TOP Request) sudah punya kontrak API
   yang stabil untuk dipanggil — TAPI komponen ini akan MENOLAK entity lain
   secara eksplisit, bukan gagal senyap.

   Migrasi skema (entity_type/entity_id + backfill + inquiry_id nullable +
   revisi RLS) SENGAJA ditunda ke batch yang pertama kali benar-benar memasang
   Chatter ke entity kedua — supaya ada test case nyata yang membuktikan
   skemanya benar, bukan dibangun spekulatif (keputusan Den, batch persiapan).

   InquiryChatter.jsx yang lama TIDAK disentuh dan tetap dipakai
   DealDetailPage. File ini belum dipasang ke layar produksi mana pun.
   ========================================================================= */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Send, Pencil, Trash2, Check, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/useAuth';
import ConfirmModal from '../../../components/ConfirmModal';
import { NAVY, INK, INK_SOFT, FAINT, LINE, LINE_SOFT, SURFACE, SURFACE_2,
         DANGER, FONT_HEAD, FONT_BODY, SP, RADIUS } from './tokens';

/* =========================================================================
   ADAPTER ENTITY — satu-satunya tempat yang tahu tabel/kolom per entity.
   Menambah entity baru nanti = menambah satu entri di sini + migrasi DB-nya,
   BUKAN menyebar `if (entityType === ...)` ke seluruh badan komponen.
   ========================================================================= */
const ENTITY_ADAPTERS = {
  inquiry: {
    table: 'inquiry_comments',
    mentionTable: 'inquiry_comment_mentions',
    fkColumn: 'inquiry_id',
    notifEvent: 'inquiry_mention',
    refType: 'inquiry',
    noun: 'inquiry',
  },
};

function initialsOf(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

// Escape teks yang dikendalikan user sebelum masuk body email HTML
// (Edge Function `send-email`).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} minutes ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hours ago`;
  return `${Math.floor(d / 86400)} days ago`;
}

// Token "@query" tepat sebelum cursor. "@" harus didahului awal-string atau
// spasi supaya "email@domain.com" tak ikut memicu.
function findActiveMention(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const m = before.match(/(^|\s)(@[^\s@]*)$/);
  if (!m) return null;
  const atToken = m[2];
  return { atStart: before.length - atToken.length, query: atToken.slice(1) };
}

const ghostBtn = (danger) => ({
  height: 28, padding: '0 10px', borderRadius: RADIUS.sm,
  border: `1px solid ${danger ? '#E3C4BB' : LINE}`, background: SURFACE,
  color: danger ? DANGER : NAVY, fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
});

/**
 * @param {Object}   props
 * @param {string}   props.entityType      - 'inquiry' (satu-satunya yang dilayani sekarang)
 * @param {string}   props.entityId        - id entity
 * @param {string}   props.companyId       - scope daftar orang yang bisa di-tag
 * @param {string}   [props.entityLabel]   - dipakai di teks notifikasi/email (mis. nomor inquiry)
 * @param {string[]} [props.priorityUserIds] - tampil duluan di dropdown mention
 * @param {Function} [props.showToast]     - (message, type) — urutan message dulu
 */
export default function Chatter({
  entityType, entityId, companyId, entityLabel,
  priorityUserIds, showToast,
}) {
  const { profile, user } = useAuth();
  const currentUserId = user?.id || profile?.id;
  const adapter = ENTITY_ADAPTERS[entityType];

  const [comments, setComments] = useState([]);
  const [authorMap, setAuthorMap] = useState({});
  const [loadingComments, setLoadingComments] = useState(false);
  const [taggableList, setTaggableList] = useState([]);

  const [newBody, setNewBody] = useState('');
  const [mentions, setMentions] = useState([]);
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
    if (!adapter || !entityId) return;
    setLoadingComments(true);
    const { data: rows, error } = await supabase
      .from(adapter.table)
      .select('id, body, created_at, updated_at, created_by')
      .eq(adapter.fkColumn, entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[chatter-v3] fetch comments failed:', error.message);
      showToast?.('Gagal memuat komentar: ' + error.message, 'error');
      setLoadingComments(false);
      return;
    }
    const list = rows || [];
    const authorIds = [...new Set(list.map((r) => r.created_by).filter(Boolean))];
    const map = {};
    if (authorIds.length) {
      const { data: authors } = await supabase
        .from('profiles').select('id, full_name, avatar_url').in('id', authorIds).limit(1000);
      (authors || []).forEach((a) => { map[a.id] = a; });
    }
    setAuthorMap(map);
    setComments(list);
    setLoadingComments(false);
  }, [adapter, entityId, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refetchComments(); }, [refetchComments]);

  // Daftar orang yang bisa di-tag — company-scoped, sengaja lebih inklusif
  // daripada daftar pemilik deal.
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

  // Posisi dropdown mention — anchor ke bounding rect textarea.
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
    const active = findActiveMention(value, e.target.selectionStart);
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
    if (!body || submitting || !adapter) return;
    setSubmitting(true);
    try {
      const { data: inserted, error: insErr } = await supabase
        .from(adapter.table)
        .insert({ [adapter.fkColumn]: entityId, company_id: companyId, created_by: currentUserId, body })
        .select('id').single();
      if (insErr) throw insErr;
      const newCommentId = inserted.id;

      // Tag final — hanya yang teksnya masih ada di body (user bisa saja sudah
      // menghapus sebagian mention sebelum kirim), dedupe by userId.
      const seen = new Set();
      const finalTags = mentions.filter((m) => body.includes(`@${m.name}`) && !seen.has(m.userId) && seen.add(m.userId));

      if (finalTags.length) {
        try {
          await supabase.from(adapter.mentionTable)
            .insert(finalTags.map((m) => ({ comment_id: newCommentId, user_id: m.userId })));
        } catch (e) {
          console.error('[chatter-v3] insert mentions failed:', e?.message || e);
          showToast?.('Komentar terkirim, tapi menandai beberapa orang gagal.', 'error');
        }

        const taggerName = profile?.full_name || user?.email || 'Seseorang';
        const notifRows = finalTags
          .filter((m) => m.userId !== currentUserId) // jangan notif diri sendiri
          .map((m) => ({
            company_id: companyId,
            user_id: m.userId,
            event_type: adapter.notifEvent,
            title: 'Anda di-tag di komentar',
            body: `${taggerName} men-tag Anda di komentar pada ${adapter.noun} ${entityLabel || ''}`.trim(),
            reference_type: adapter.refType,
            reference_id: entityId,
          }));

        if (notifRows.length) {
          try { await supabase.from('notifications').insert(notifRows); }
          catch (e) {
            console.error('[chatter-v3] notify mentions failed:', e?.message || e);
            showToast?.('Komentar terkirim, tapi notifikasi ke beberapa orang gagal terkirim.', 'error');
          }

          // Email fan-out best-effort — kanal sekunder. Kegagalan di sini
          // sengaja console-only (tanpa showToast): email bonus, bukan aksi
          // inti, jadi tak boleh berebut perhatian dengan hasil notif in-app.
          try {
            const { data: recipients } = await supabase
              .from('profiles').select('id, email').in('id', notifRows.map((n) => n.user_id));
            const emailOf = {};
            (recipients || []).forEach((p) => { if (p.email) emailOf[p.id] = p.email; });
            await Promise.all(notifRows.map((n) => {
              const to = emailOf[n.user_id];
              if (!to) return null; // tak punya email — lewati orangnya, bukan seluruhnya
              const subject = entityLabel
                ? `Anda di-tag di komentar — ${adapter.noun} ${entityLabel}`
                : 'Anda di-tag di komentar';
              const html = `<p>Halo,</p><p><strong>${escapeHtml(taggerName)}</strong> men-tag Anda di komentar pada ${escapeHtml(adapter.noun)} <strong>${escapeHtml(entityLabel || '')}</strong> di Nexus.</p><p><a href="https://nexus.msigroup.co.id">Buka Nexus</a> untuk melihat komentar selengkapnya.</p><p style="color:#7A828E;font-size:12px;margin-top:24px;">Email otomatis dari Nexus by MSI — balas lewat aplikasi, bukan email ini.</p>`;
              return supabase.functions.invoke('send-email', { body: { to, subject, html } })
                .catch((e) => console.error('[chatter-v3] send-email failed for', n.user_id, e?.message || e));
            }));
          } catch (e) {
            console.error('[chatter-v3] email fan-out failed:', e?.message || e);
          }
        }
      }

      setNewBody('');
      setMentions([]);
      await refetchComments();
    } catch (e) {
      console.error('[chatter-v3] submit comment failed:', e?.message || e);
      showToast?.('Gagal mengirim komentar: ' + (e?.message || e), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (c) => { setEditingId(c.id); setEditBody(c.body); };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); };

  const saveEdit = async (commentId) => {
    const body = editBody.trim();
    if (!body || savingEdit || !adapter) return;
    setSavingEdit(true);
    try {
      const { data, error } = await supabase
        .from(adapter.table)
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select('id');
      if (error) throw error;
      // RLS bisa menyaring baris tanpa error → 0 baris = gagal senyap (TD-161).
      if (!data || data.length === 0) throw new Error('Tidak ada izin mengubah komentar ini.');
      setEditingId(null);
      setEditBody('');
      await refetchComments();
    } catch (e) {
      console.error('[chatter-v3] edit comment failed:', e?.message || e);
      showToast?.('Gagal menyimpan perubahan komentar: ' + (e?.message || e), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !adapter) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase
        .from(adapter.table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteTarget.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Tidak ada izin menghapus komentar ini.');
      setDeleteTarget(null);
      await refetchComments();
    } catch (e) {
      console.error('[chatter-v3] delete comment failed:', e?.message || e);
      showToast?.('Gagal menghapus komentar: ' + (e?.message || e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ── Entity yang belum didukung: tolak EKSPLISIT, jangan gagal senyap. ── */
  if (!adapter) {
    return (
      <div style={{ padding: SP.s4, fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT }}>
        <strong style={{ fontFamily: FONT_HEAD }}>Chatter belum tersedia untuk entity ini.</strong>
        <div style={{ marginTop: SP.s1, color: FAINT, fontSize: 12.5 }}>
          {`entityType "${entityType}" belum punya adapter. Sekarang baru `}
          {Object.keys(ENTITY_ADAPTERS).join(', ')}
          {' — entity lain menyusul setelah migrasi entity_type/entity_id dijalankan.'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <header style={{
        display: 'flex', alignItems: 'center', gap: SP.s2,
        padding: `${SP.s3}px ${SP.s4}px`, borderBottom: `1px solid ${LINE_SOFT}`, background: SURFACE_2,
      }}>
        <MessageCircle size={17} style={{ color: NAVY }} />
        <h3 style={{ margin: 0, flex: 1, fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 700, color: INK }}>
          Chatter
        </h3>
      </header>

      <div style={{ padding: SP.s4, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        {/* ── Composer ── */}
        <div ref={wrapRef}>
          <textarea
            ref={textareaRef}
            value={newBody}
            onChange={handleComposerChange}
            placeholder="Tulis komentar… ketik @ untuk menandai orang"
            rows={3}
            style={{
              width: '100%', padding: SP.s3, borderRadius: RADIUS.md,
              border: `1px solid ${LINE}`, background: SURFACE, resize: 'vertical',
              fontFamily: FONT_BODY, fontSize: 13.5, color: INK, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SP.s2 }}>
            <button
              type="button" onClick={handleSubmit} disabled={!newBody.trim() || submitting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: RADIUS.md, border: `1px solid ${NAVY}`,
                background: NAVY, color: '#FFFFFF', fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600,
                cursor: (!newBody.trim() || submitting) ? 'not-allowed' : 'pointer',
                opacity: (!newBody.trim() || submitting) ? 0.6 : 1,
              }}
            >
              <Send size={13} /> {submitting ? 'Mengirim…' : 'Kirim'}
            </button>
          </div>
        </div>

        {/* ── Daftar komentar ── */}
        {loadingComments ? (
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: FAINT }}>Memuat komentar…</div>
        ) : comments.length === 0 ? (
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: FAINT }}>Belum ada komentar.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            {comments.map((c) => {
              const a = authorMap[c.created_by];
              const mine = c.created_by === currentUserId;
              const editing = editingId === c.id;
              return (
                <article key={c.id} style={{ display: 'flex', gap: SP.s3 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: LINE_SOFT, color: INK_SOFT, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700,
                  }}>
                    {initialsOf(a?.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s2, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, color: INK }}>
                        {a?.full_name || 'Pengguna'}
                      </span>
                      <span style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: FAINT }}>
                        {timeAgo(c.created_at)}{c.updated_at && c.updated_at !== c.created_at ? ' · disunting' : ''}
                      </span>
                    </div>

                    {editing ? (
                      <div style={{ marginTop: SP.s2 }}>
                        <textarea
                          value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3}
                          style={{
                            width: '100%', padding: SP.s2, borderRadius: RADIUS.sm,
                            border: `1px solid ${LINE}`, fontFamily: FONT_BODY, fontSize: 13, color: INK,
                            resize: 'vertical', outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', gap: SP.s1, marginTop: SP.s2 }}>
                          <button type="button" style={ghostBtn(false)} onClick={() => saveEdit(c.id)} disabled={savingEdit}>
                            <Check size={12} /> Simpan
                          </button>
                          <button type="button" style={ghostBtn(false)} onClick={cancelEdit}>
                            <X size={12} /> Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{
                        margin: `${SP.s1}px 0 0`, fontFamily: FONT_BODY, fontSize: 13.5,
                        color: INK, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {c.body}
                      </p>
                    )}

                    {mine && !editing && (
                      <div style={{ display: 'flex', gap: SP.s1, marginTop: SP.s2 }}>
                        <button type="button" style={ghostBtn(false)} onClick={() => startEdit(c)}>
                          <Pencil size={12} /> Sunting
                        </button>
                        <button type="button" style={ghostBtn(true)} onClick={() => setDeleteTarget(c)}>
                          <Trash2 size={12} /> Hapus
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Dropdown mention (portal — sama seperti InquiryChatter) ── */}
      {mentionOpen && hasMentionMatches && mentionCoords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: mentionCoords.top, left: mentionCoords.left,
            width: mentionCoords.width, maxHeight: 220, overflowY: 'auto', zIndex: 9999,
            background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.md,
            boxShadow: '0 8px 24px rgba(20,36,58,.12)',
          }}
        >
          {[...mentionMatches.priority, ...mentionMatches.rest].map((p) => (
            <button
              key={p.id} type="button" onClick={() => pickMention(p)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: SP.s2,
                padding: `${SP.s2}px ${SP.s3}px`, border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: FONT_BODY, fontSize: 13, color: INK,
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: '50%', background: LINE_SOFT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: INK_SOFT,
              }}>
                {initialsOf(p.full_name)}
              </span>
              {p.full_name}
            </button>
          ))}
        </div>,
        document.body,
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Hapus komentar?"
        message="Komentar akan disembunyikan dari daftar. Tindakan ini tidak bisa dibatalkan dari UI."
        confirmLabel={deleting ? 'Deleting…' : 'Hapus'}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  );
}

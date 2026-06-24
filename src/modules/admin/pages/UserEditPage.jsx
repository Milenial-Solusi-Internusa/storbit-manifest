// src/modules/admin/pages/UserEditPage.jsx
// Full-page Edit User (replaces the former Edit modal in UserAccessPage).
// Reached via state-swap in AdminShell (mirror of AssetDetailPage / CustomerDetailPage).
//
// Layout:
//   - Action bar: ← Kembali | Admin › User Access › [name]  ·  [Ubah Password] [Hapus User] [Save Changes]
//   - Header card: avatar, name, id, role badge, status badge
//   - Tabs: Profile (business identity + access control) | Permissions (matrix)
//
// Super-admin-only destructive actions:
//   - Hapus User → ConfirmModal → deleteUser() Edge Function. Hidden for own account.
//   - Ubah Password → small modal → resetUserPassword() Edge Function.
//
// All profile/permission save logic is preserved verbatim from the former modal.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, ChevronRight, Check, Trash2, KeyRound, X, Camera,
  RefreshCw as Spinner,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  fetchAllCompanies,
  fetchBranchesForCompany,
  fetchDepartmentsForCompany,
  fetchPositionsForCompany,
  fetchRolesForCompany,
  saveUserAccess,
  deleteUser,
  resetUserPassword,
} from '../../../hooks/useUserAccess';
import { useAuth } from '../../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../../lib/auditLogger';
import ConfirmModal from '../../../components/ConfirmModal';
import { PASTEL, NAVY, RED, getPrimaryErpRole, ACTION_ORDER } from './userAccessTokens';
import {
  Avatar, RoleBadge, StatusBadge,
  FieldLabel, FieldInput, FieldSelect, FieldToggle,
  SectionLabel, Divider, SaveError,
  PermissionMatrix,
} from './userAccessShared';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Allowed avatar mime types → file extension. Bucket 'avatars': public, max 2MB, image only.
const AVATAR_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function buildDraft(r) {
  const primary = getPrimaryErpRole(r.user_roles);
  return {
    id:                 r.id,
    full_name:          r.full_name || '',
    company_id:         r.company_id || '',
    branch_id:          r.branch_id || '',
    department_id:      r.department_id || '',
    position_id:        r.position_id || '',
    active:             r.active !== false,
    mfa_required:       !!r.mfa_required,
    erp_role_id:        primary?.role_id || '',
    _originalErpRoleId: primary?.role_id || '',
  };
}

// ─────────────────────────────────────────────────────────────
// Change Password modal
// ─────────────────────────────────────────────────────────────

// Fields reset via key-based remount from the parent (no reset effect → lint clean).
function ChangePasswordModal({ open, userName, onClose, onSubmit }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (pw1.length < 8) { setError('Password minimal 8 karakter.'); return; }
    if (pw1 !== pw2)    { setError('Konfirmasi password tidak cocok.'); return; }
    setSaving(true);
    setError(null);
    const ok = await onSubmit(pw1);
    setSaving(false);
    if (ok !== true) setError(typeof ok === 'string' ? ok : 'Gagal mengubah password.');
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(20,20,28,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6"
        style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl flex-shrink-0" style={{ background: `${NAVY}14`, color: NAVY }}>
            <KeyRound size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold" style={{ color: PASTEL.ink, fontFamily: 'Montserrat, sans-serif' }}>Ubah Password</h3>
            <p className="text-xs mt-0.5" style={{ color: PASTEL.inkMute }}>
              Set password baru untuk <span className="font-medium" style={{ color: PASTEL.inkSoft }}>{userName || 'user ini'}</span>.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg transition-opacity hover:opacity-60" style={{ color: PASTEL.inkMute }}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <FieldLabel required>Password Baru</FieldLabel>
            <FieldInput type="password" value={pw1} onChange={setPw1} disabled={saving} placeholder="Min. 8 karakter" />
          </div>
          <div>
            <FieldLabel required>Konfirmasi Password</FieldLabel>
            <FieldInput type="password" value={pw2} onChange={setPw2} disabled={saving} placeholder="Ulangi password baru" />
          </div>
          <SaveError message={error} />
        </div>

        <div className="flex items-center gap-3 mt-6">
          <div className="flex-1" />
          <button
            type="button" onClick={onClose} disabled={saving}
            className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{ background: 'white', color: PASTEL.inkSoft, border: `1px solid ${PASTEL.line}` }}
          >
            Batal
          </button>
          <button
            type="button" onClick={handleSubmit} disabled={saving}
            className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
            style={{ background: NAVY, color: 'white' }}
          >
            {saving ? <><Spinner size={13} className="animate-spin" /> Menyimpan…</> : <><Check size={13} /> Simpan Password</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function UserEditPage({ userId, initialRow, onBack, showToast }) {
  const { profile: myProfile, erpRole, user } = useAuth();
  const isSuperAdmin = erpRole === 'super_admin';
  const isSelf = userId === myProfile?.id;

  // ── Draft + load state ───────────────────────────────────────
  const [draft, setDraft] = useState(() => (initialRow ? buildDraft(initialRow) : null));
  const [companyId, setCompanyId] = useState(initialRow?.company_id || '');
  const [rowMeta, setRowMeta] = useState(initialRow || null); // for header badges (companies/role)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('profile'); // 'profile' | 'permissions'

  // ── Avatar upload ────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState(initialRow?.avatar_url || null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Fallback fetch when no initialRow was passed (e.g. deep navigation)
  useEffect(() => {
    if (initialRow || !userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select(`id, full_name, active, mfa_required, avatar_url,
               company_id, branch_id, department_id, position_id,
               companies(id, code, name), branches(id, code, name),
               departments(id, code, name), positions(id, code, name)`)
      .eq('id', userId)
      .single()
      .then(({ data: prof }) => {
        if (cancelled || !prof) return;
        supabase
          .from('user_roles')
          .select('id, user_id, role_id, is_active, company_id, roles(id, code, name)')
          .eq('user_id', userId)
          .then(({ data: roles }) => {
            if (cancelled) return;
            const merged = { ...prof, user_roles: roles || [] };
            setRowMeta(merged);
            setDraft(buildDraft(merged));
            setCompanyId(merged.company_id || '');
            setAvatarUrl(merged.avatar_url || null);
          });
      });
    return () => { cancelled = true; };
  }, [userId, initialRow]);

  // ── Form options (cascade) ───────────────────────────────────
  const [formOptions, setFormOptions] = useState({
    companies: [], branches: [], departments: [], positions: [], erpRoles: [],
  });

  useEffect(() => {
    if (!draft?.id) return;
    let cancelled = false;
    Promise.all([
      fetchAllCompanies(),
      fetchBranchesForCompany(companyId),
      fetchDepartmentsForCompany(companyId),
      fetchPositionsForCompany(companyId),
      fetchRolesForCompany(companyId),
    ]).then(([cos, branches, depts, positions, erpRoles]) => {
      if (cancelled) return;
      setFormOptions({
        companies:   cos.data,
        branches:    branches.data,
        departments: depts.data,
        positions:   positions.data,
        erpRoles:    erpRoles.data,
      });
    });
    return () => { cancelled = true; };
  }, [draft?.id, companyId]);

  const handleCompanyChange = useCallback((newCo) => {
    setDraft((d) => ({ ...d, company_id: newCo, branch_id: '', department_id: '', position_id: '', erp_role_id: '' }));
    setCompanyId(newCo);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (draft.id === myProfile?.id && !draft.active) {
      setError('You cannot deactivate your own account.');
      return;
    }
    setSaving(true);
    setError(null);

    const erpRoleChanged = draft.erp_role_id !== draft._originalErpRoleId;
    const { error: saveErr } = await saveUserAccess({
      profileId:    draft.id,
      profilePatch: {
        company_id:    draft.company_id    || null,
        branch_id:     draft.branch_id     || null,
        department_id: draft.department_id || null,
        position_id:   draft.position_id   || null,
        active:        draft.active,
        mfa_required:  draft.mfa_required,
      },
      newErpRoleId: erpRoleChanged ? (draft.erp_role_id || null) : undefined,
      companyId:    draft.company_id || null,
    });

    setSaving(false);
    if (saveErr) {
      setError(saveErr.message ? `Save failed: ${saveErr.message}` : 'Save failed. Check your permissions.');
      return;
    }
    const audUser = { id: myProfile?.id, email: user?.email, role: erpRole, companyId: myProfile?.company_id };
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: draft.id,
      entityLabel: draft.full_name || null,
    }, audUser);
    if (erpRoleChanged) {
      logAudit(supabase, {
        action: ACTION_TYPES.CHANGE_ROLE,
        entityType: ENTITY_TYPES.USER,
        entityId: draft.id,
        entityLabel: draft.full_name || null,
        notes: 'erp_role_id → ' + (draft.erp_role_id || 'none'),
      }, audUser);
    }
    showToast?.('User updated.');
    onBack?.();
  }, [draft, myProfile?.id, myProfile?.company_id, erpRole, user, showToast, onBack]);

  // ── Permission matrix ────────────────────────────────────────
  const [matrixModules, setMatrixModules] = useState([]);
  const [matrixActions, setMatrixActions] = useState([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [permDraft, setPermDraft] = useState({});
  const [originalPerms, setOriginalPerms] = useState([]);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState(null);

  const fetchMatrixData = useCallback(async (uid, coId) => {
    setMatrixLoading(true);
    const [modsRes, menusRes, existingRes] = await Promise.all([
      supabase.from('modules')
        .select('id, key, label, sort_order, module_actions(id, action)')
        .eq('is_active', true).order('sort_order').limit(100),
      supabase.from('module_menus')
        .select('id, key, label, sort_order, module_id, menu_actions(id, action)')
        .eq('is_active', true).order('sort_order').limit(1000),
      supabase.from('user_menu_permissions')
        .select('id, module_action_id, menu_action_id')
        .eq('user_id', uid).eq('company_id', coId).limit(1000),
    ]);

    const mods     = modsRes.data  || [];
    const menus    = menusRes.data || [];
    const existing = existingRes.data || [];

    const actionSet = new Set();
    mods.forEach(m  => (m.module_actions || []).forEach(a => actionSet.add(a.action)));
    menus.forEach(m => (m.menu_actions   || []).forEach(a => actionSet.add(a.action)));
    const sorted = ACTION_ORDER.filter(a => actionSet.has(a))
      .concat([...actionSet].filter(a => !ACTION_ORDER.includes(a)).sort());
    setMatrixActions(sorted);

    const menusByMod = {};
    menus.forEach(m => {
      if (!menusByMod[m.module_id]) menusByMod[m.module_id] = [];
      menusByMod[m.module_id].push(m);
    });
    setMatrixModules(mods.map(mod => ({ ...mod, menus: menusByMod[mod.id] || [] })));

    setOriginalPerms(existing);

    const pdraft = {};
    existing.forEach(p => {
      if (p.module_action_id) pdraft[`ma_${p.module_action_id}`]   = true;
      if (p.menu_action_id)   pdraft[`mea_${p.menu_action_id}`]    = true;
    });
    setPermDraft(pdraft);
    setMatrixLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'permissions' && draft?.id && draft?.company_id) {
      fetchMatrixData(draft.id, draft.company_id);
    }
  }, [tab, draft?.id, draft?.company_id, fetchMatrixData]);

  const handlePermToggle = useCallback((updates) => {
    setPermDraft(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSavePermissions = useCallback(async () => {
    if (!draft) return;
    setPermSaving(true);
    setPermError(null);

    const originalKeys = new Set();
    const keyToRowId = {};
    originalPerms.forEach(p => {
      if (p.module_action_id) {
        const k = `ma_${p.module_action_id}`;
        originalKeys.add(k);
        keyToRowId[k] = p.id;
      }
      if (p.menu_action_id) {
        const k = `mea_${p.menu_action_id}`;
        originalKeys.add(k);
        keyToRowId[k] = p.id;
      }
    });

    const newKeys = new Set(Object.entries(permDraft).filter(([, v]) => v).map(([k]) => k));
    const addedKeys   = [...newKeys].filter(k => !originalKeys.has(k));
    const removedKeys = [...originalKeys].filter(k => !newKeys.has(k));

    if (removedKeys.length) {
      const ids = removedKeys.map(k => keyToRowId[k]).filter(Boolean);
      if (ids.length) {
        const { error: delErr } = await supabase.from('user_menu_permissions').delete().in('id', ids);
        if (delErr) { setPermError(`Delete failed: ${delErr.message}`); setPermSaving(false); return; }
      }
    }

    if (addedKeys.length) {
      const rows = addedKeys.map(k => {
        const r = { user_id: draft.id, company_id: draft.company_id };
        if (k.startsWith('ma_'))  r.module_action_id = k.slice(3);
        else                      r.menu_action_id   = k.slice(4);
        return r;
      });
      const { error: insErr } = await supabase.from('user_menu_permissions').insert(rows);
      if (insErr) { setPermError(`Insert failed: ${insErr.message}`); setPermSaving(false); return; }
    }

    setPermSaving(false);
    showToast?.('Permissions updated.');
    // Re-sync original rows so subsequent diffs are accurate (stay on page)
    fetchMatrixData(draft.id, draft.company_id);
  }, [draft, originalPerms, permDraft, showToast, fetchMatrixData]);

  // ── Delete user ──────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setConfirmOpen(false);
    setDeleting(true);
    const { error: delErr } = await deleteUser(userId);
    setDeleting(false);
    if (delErr) {
      showToast?.(delErr.message || 'Gagal menghapus user.', 'error');
      return;
    }
    showToast?.('User berhasil dihapus.');
    onBack?.();
  }, [userId, showToast, onBack]);

  // ── Change password ──────────────────────────────────────────
  const [pwOpen, setPwOpen] = useState(false);

  const handleResetPassword = useCallback(async (newPassword) => {
    const { error: pwErr } = await resetUserPassword(userId, newPassword);
    if (pwErr) return pwErr.message || 'Gagal mengubah password.';
    showToast?.('Password berhasil diubah.');
    setPwOpen(false);
    return true;
  }, [userId, showToast]);

  // ── Avatar upload / remove ───────────────────────────────────
  const handlePickFile = useCallback(() => {
    if (!uploading) fileInputRef.current?.click();
  }, [uploading]);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-selected later
    if (!file) return;

    // Client-side validation: type + size (bucket allows image only, max 2MB)
    const ext = AVATAR_TYPES[file.type];
    if (!ext) { showToast?.('Format foto harus PNG, JPEG, atau WEBP.', 'error'); return; }
    if (file.size > AVATAR_MAX_BYTES) { showToast?.('Ukuran foto maksimal 2MB.', 'error'); return; }

    setUploading(true);

    const fileName = `${userId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      showToast?.(upErr.message || 'Gagal mengupload foto.', 'error');
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const url = urlData?.publicUrl || null;

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', userId);
    setUploading(false);
    if (updErr) {
      showToast?.(updErr.message || 'Gagal menyimpan foto.', 'error');
      return;
    }

    setAvatarUrl(url);
    showToast?.('Foto berhasil diupload.');
  }, [userId, showToast]);

  const handleRemoveAvatar = useCallback(async () => {
    if (uploading) return;
    setUploading(true);
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', userId);
    setUploading(false);
    if (updErr) {
      showToast?.(updErr.message || 'Gagal menghapus foto.', 'error');
      return;
    }
    setAvatarUrl(null);
    showToast?.('Foto dihapus.');
  }, [userId, uploading, showToast]);

  // ── Render ───────────────────────────────────────────────────
  const userName = draft?.full_name || rowMeta?.full_name || '(unnamed)';
  const primaryErpRole = getPrimaryErpRole(rowMeta?.user_roles);

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          type="button" onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-70"
          style={{ background: 'white', color: PASTEL.inkSoft, border: `1px solid ${PASTEL.line}` }}
        >
          <ArrowLeft size={14} /> Kembali
        </button>
        <div className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: PASTEL.inkMute }}>
          <span>Admin</span>
          <ChevronRight size={12} />
          <span>User Access</span>
          <ChevronRight size={12} />
          <span className="font-medium truncate" style={{ color: PASTEL.inkSoft }}>{userName}</span>
        </div>

        <div className="flex-1" />

        {/* Super-admin destructive actions */}
        {isSuperAdmin && (
          <button
            type="button" onClick={() => setPwOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-70"
            style={{ background: 'white', color: NAVY, border: `1px solid ${NAVY}55` }}
          >
            <KeyRound size={14} /> Ubah Password
          </button>
        )}
        {isSuperAdmin && !isSelf && (
          <button
            type="button" onClick={() => setConfirmOpen(true)} disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: `${RED}12`, color: RED, border: `1px solid ${RED}40` }}
          >
            {deleting ? <Spinner size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Hapus User
          </button>
        )}
        {tab === 'profile' && (
          <button
            type="button" onClick={handleSave} disabled={saving || !draft}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: PASTEL.ink, color: 'white' }}
          >
            {saving ? <><Spinner size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Changes</>}
          </button>
        )}
      </div>

      {/* Header card */}
      <div
        className="rounded-2xl border p-5 mb-5 flex items-center gap-4"
        style={{ background: 'white', borderColor: PASTEL.line }}
      >
        {/* Avatar with upload overlay */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploading}
            title="Ubah Foto"
            className="group relative rounded-full overflow-hidden disabled:cursor-wait"
            style={{ width: 56, height: 56 }}
          >
            <Avatar name={userName} size={56} avatarUrl={avatarUrl} />
            <span
              className={`absolute inset-0 rounded-full flex items-center justify-center transition-opacity ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              style={{ background: 'rgba(20,70,130,0.55)' }}
            >
              {uploading
                ? <Spinner size={18} className="animate-spin" style={{ color: 'white' }} />
                : <Camera size={18} style={{ color: 'white' }} />}
            </span>
          </button>
          {avatarUrl && !uploading && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="inline-flex items-center gap-1 text-[10px] font-medium transition-opacity hover:opacity-70"
              style={{ color: RED }}
            >
              <Trash2 size={10} /> Hapus Foto
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold truncate" style={{ color: PASTEL.ink, fontFamily: 'Montserrat, sans-serif' }}>
            {userName}
          </div>
          <div className="font-mono text-[11px] mt-0.5 truncate" style={{ color: PASTEL.inkMute, fontFamily: '"IBM Plex Mono", monospace' }}>
            {rowMeta?.email || userId}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <RoleBadge erpRole={primaryErpRole} legacyRole={null} />
            <StatusBadge active={draft?.active !== false} />
            {rowMeta?.companies && (
              <span
                className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                style={{ background: PASTEL.sky, color: PASTEL.skyDeep }}
              >
                {rowMeta.companies.code}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body card */}
      <div className="rounded-2xl border p-6" style={{ background: 'white', borderColor: PASTEL.line }}>
        {!draft ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: PASTEL.inkMute, fontSize: 13 }}>
            Memuat data user…
          </div>
        ) : (
          <div>
            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${PASTEL.line}` }}>
              {['profile', 'permissions'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 18px',
                    border: 'none', borderBottom: tab === t ? `2px solid ${NAVY}` : '2px solid transparent',
                    background: 'transparent',
                    color: tab === t ? NAVY : PASTEL.inkSoft,
                    fontSize: 13, fontWeight: tab === t ? 700 : 400,
                    cursor: 'pointer', marginBottom: -1,
                    transition: 'color .12s',
                  }}
                >
                  {t === 'profile' ? 'Profile' : 'Permissions'}
                </button>
              ))}
            </div>

            {/* Profile tab */}
            {tab === 'profile' && (
              <div className="space-y-6">

                {/* Business Identity */}
                <div>
                  <SectionLabel>Business Identity</SectionLabel>
                  <div className="space-y-4">
                    <div>
                      <FieldLabel>Company</FieldLabel>
                      <FieldSelect value={draft.company_id} onChange={handleCompanyChange} disabled={saving}>
                        <option value="">— Select company —</option>
                        {formOptions.companies.map((c) => (
                          <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                        ))}
                      </FieldSelect>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <FieldLabel>Branch</FieldLabel>
                        <FieldSelect value={draft.branch_id} onChange={(v) => setDraft((d) => ({ ...d, branch_id: v }))} disabled={saving || !draft.company_id}>
                          <option value="">— None —</option>
                          {formOptions.branches.map((b) => (
                            <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                          ))}
                        </FieldSelect>
                      </div>
                      <div>
                        <FieldLabel>Department</FieldLabel>
                        <FieldSelect value={draft.department_id} onChange={(v) => setDraft((d) => ({ ...d, department_id: v }))} disabled={saving || !draft.company_id}>
                          <option value="">— None —</option>
                          {formOptions.departments.map((dep) => (
                            <option key={dep.id} value={dep.id}>{dep.code} — {dep.name}</option>
                          ))}
                        </FieldSelect>
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Position</FieldLabel>
                      <FieldSelect value={draft.position_id} onChange={(v) => setDraft((d) => ({ ...d, position_id: v }))} disabled={saving || !draft.company_id}>
                        <option value="">— None —</option>
                        {formOptions.positions.map((pos) => (
                          <option key={pos.id} value={pos.id}>{pos.code} — {pos.name}</option>
                        ))}
                      </FieldSelect>
                    </div>
                  </div>
                </div>

                <Divider />

                {/* Access Control */}
                <div>
                  <SectionLabel>Access Control</SectionLabel>
                  <div className="space-y-5">
                    <div>
                      <FieldLabel>ERP Role</FieldLabel>
                      <FieldSelect value={draft.erp_role_id} onChange={(v) => setDraft((d) => ({ ...d, erp_role_id: v }))} disabled={saving || !draft.company_id}>
                        <option value="">— No ERP role —</option>
                        {formOptions.erpRoles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                        ))}
                      </FieldSelect>
                      {!draft.company_id && (
                        <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>Select a company first.</p>
                      )}
                    </div>

                    <FieldToggle
                      label={draft.active ? 'Account active' : 'Account inactive'}
                      checked={draft.active}
                      onChange={(v) => setDraft((d) => ({ ...d, active: v }))}
                      disabled={saving || isSelf}
                      helpText={isSelf ? 'You cannot deactivate your own account.' : undefined}
                    />

                    <FieldToggle
                      label={draft.mfa_required ? 'MFA required' : 'MFA not required'}
                      checked={draft.mfa_required}
                      onChange={(v) => setDraft((d) => ({ ...d, mfa_required: v }))}
                      disabled={saving}
                      helpText="Recommended for admin, finance controller, BOD, and head-level roles."
                    />
                  </div>
                </div>

                <SaveError message={error} />
              </div>
            )}

            {/* Permissions tab */}
            {tab === 'permissions' && (
              <PermissionMatrix
                matrixModules={matrixModules}
                matrixActions={matrixActions}
                permDraft={permDraft}
                onToggle={handlePermToggle}
                loading={matrixLoading}
                saving={permSaving}
                onSave={handleSavePermissions}
                onCancel={onBack}
                permError={permError}
              />
            )}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <ConfirmModal
        open={confirmOpen}
        title="Hapus User"
        message={`Hapus ${userName} permanen? Akun login dan semua data akses akan dihapus. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Ya, Hapus Permanen"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Change password — keyed so fields reset on each open (no reset effect) */}
      <ChangePasswordModal
        key={pwOpen ? 'pw-open' : 'pw-closed'}
        open={pwOpen}
        userName={userName}
        onClose={() => setPwOpen(false)}
        onSubmit={handleResetPassword}
      />
    </div>
  );
}

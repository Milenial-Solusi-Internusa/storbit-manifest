// LEGACY — not imported/routed anywhere. Superseded by UserAccessPage +
// UserEditPage (Admin → User Access). Still reads/writes the deprecated
// legacy profiles.role column (p.role, updateProfile({ role })) — kept only as
// reference; do NOT wire this back in. Role management now lives in user_roles.
//
// src/components/UserManagement.legacy.jsx (was UserManagement.jsx)
// Admin-only page: list semua users, edit role, toggle active status.
// Invite user baru = manual via Supabase Dashboard (Pendekatan A).

import { useState, useEffect, useCallback } from 'react';
import {
  Users, ShieldCheck, ShieldOff, RefreshCw, AlertCircle,
  Check, X, Info, ExternalLink,
} from 'lucide-react';
import { listProfiles, updateProfile } from '../lib/db';

const PASTEL = {
  peach: '#FFD4B8',
  peachDeep: '#F5A78F',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
  mint: '#C8EFD9',
  mintDeep: '#7FC9A0',
  butter: '#FFE9B8',
  butterDeep: '#E8C168',
  rose: '#F5C8D5',
  roseDeep: '#D89AB0',
  sky: '#C8E4F5',
  skyDeep: '#8FBCD8',
  cream: '#FAF6F0',
  ink: '#2D2A26',
  inkSoft: '#6B6660',
  inkMute: '#9A948C',
  line: '#E8E0D5',
  lineSoft: '#F2EBE0',
};

const ROLES = [
  { id: 'super',       label: 'Super Admin',            color: PASTEL.peachDeep },
  { id: 'operations',  label: 'Operations',             color: PASTEL.skyDeep },    // renamed from 'logistic'
  { id: 'logistic',    label: 'Admin Logistic (legacy)',color: PASTEL.skyDeep },    // keep during DB transition
  { id: 'procurement', label: 'Procurement',            color: PASTEL.lavenderDeep },
  { id: 'finance',     label: 'Finance',                color: PASTEL.mintDeep },
  { id: 'management',  label: 'Management',             color: PASTEL.butterDeep },
];

const ROLE_DESCRIPTIONS = {
  super:       'Akses penuh: semua fitur + user management',
  operations:  'Input SP & shipment, view all',   // renamed from 'logistic'
  logistic:    'Input SP & shipment, view all (legacy)',
  procurement: 'View + edit SP, manage customers',
  finance:     'Finance fields, AR Tracker, outstanding',
  management:  'Read-only + export reports',
};

export default function UserManagement({ currentUserId }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const { data, error: err } = await listProfiles();
    if (err) {
      console.error('[UserMgmt] load error:', err);
      setError(err.message || 'Gagal memuat user');
    } else {
      setProfiles(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    listProfiles().then(({ data, error: err }) => {
      if (err) {
        console.error('[UserMgmt] load error:', err);
        setError(err.message || 'Gagal memuat user');
      } else {
        setError(null);
        setProfiles(data || []);
      }
      setLoading(false);
    });
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRoleChange = async (id, newRole) => {
    if (id === currentUserId && newRole !== 'super') {
      if (!confirm('Anda akan mengubah role diri sendiri menjadi non-super. Yakin? Anda akan kehilangan akses ke halaman ini.')) {
        return;
      }
    }
    setSavingId(id);
    const { error: err } = await updateProfile(id, { role: newRole });
    setSavingId(null);
    if (err) {
      showToast('Gagal update role: ' + err.message, 'error');
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, role: newRole } : p))
    );
    showToast('Role berhasil diupdate ✨');
  };

  const handleToggleActive = async (id, newActive) => {
    if (id === currentUserId && !newActive) {
      alert('Tidak bisa menonaktifkan akun sendiri.');
      return;
    }
    setSavingId(id);
    const { error: err } = await updateProfile(id, { active: newActive });
    setSavingId(null);
    if (err) {
      showToast('Gagal update status: ' + err.message, 'error');
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: newActive } : p))
    );
    showToast(newActive ? 'User diaktifkan' : 'User dinonaktifkan');
  };

  const handleNameUpdate = async (id, newName) => {
    setSavingId(id);
    const { error: err } = await updateProfile(id, { full_name: newName });
    setSavingId(null);
    if (err) {
      showToast('Gagal update nama: ' + err.message, 'error');
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, full_name: newName } : p))
    );
    showToast('Nama berhasil diupdate');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold mb-1" style={{ color: PASTEL.ink }}>
            User Management
          </h1>
          <p className="text-sm" style={{ color: PASTEL.inkSoft }}>
            {profiles.length} user terdaftar · kelola role & akses
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
          style={{ background: 'white', borderColor: PASTEL.line, color: PASTEL.ink }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Invite Info Box */}
      <div
        className="rounded-2xl p-4 flex gap-3 items-start"
        style={{ background: PASTEL.lineSoft, border: `1px solid ${PASTEL.line}` }}
      >
        <Info size={18} style={{ color: PASTEL.lavenderDeep, flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1 text-sm" style={{ color: PASTEL.ink }}>
          <div className="font-semibold mb-1">Cara invite user baru</div>
          <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: PASTEL.inkSoft }}>
            <li>Buka <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="font-semibold inline-flex items-center gap-1 hover:opacity-70" style={{ color: PASTEL.lavenderDeep }}>Supabase Dashboard <ExternalLink size={11}/></a></li>
            <li>Authentication → Users → Add user → Create new user</li>
            <li>Isi email + password, centang <strong>Auto Confirm User</strong></li>
            <li>Balik ke halaman ini, refresh, set role user baru di list bawah</li>
          </ol>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          className="rounded-2xl p-4 flex gap-3 items-start"
          style={{ background: PASTEL.rose, color: PASTEL.ink }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1 text-sm">
            <div className="font-semibold mb-1">Gagal memuat user</div>
            <div className="text-xs">{error}</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && profiles.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}>
          <RefreshCw size={20} className="animate-spin mx-auto mb-3" style={{ color: PASTEL.inkMute }} />
          <div className="text-sm" style={{ color: PASTEL.inkSoft }}>Memuat user...</div>
        </div>
      )}

      {/* User List */}
      {!loading && profiles.length === 0 && !error && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'white', border: `1px solid ${PASTEL.line}` }}>
          <Users size={28} className="mx-auto mb-3" style={{ color: PASTEL.inkMute }} />
          <div className="text-sm" style={{ color: PASTEL.inkSoft }}>Belum ada user terdaftar.</div>
        </div>
      )}

      {profiles.length > 0 && (
        <div className="space-y-3">
          {profiles.map((p) => {
            const isMe = p.id === currentUserId;
            const isSaving = savingId === p.id;
            const roleObj = ROLES.find((r) => r.id === p.role);

            return (
              <div
                key={p.id}
                className="rounded-2xl p-5 transition-opacity"
                style={{
                  background: 'white',
                  border: `1px solid ${PASTEL.line}`,
                  opacity: p.active ? 1 : 0.6,
                }}
              >
                <div className="flex items-start gap-4 flex-wrap">
                  {/* Avatar + Identity */}
                  <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-display text-lg font-semibold"
                      style={{
                        background: roleObj?.color ? `${roleObj.color}33` : PASTEL.lineSoft,
                        color: roleObj?.color || PASTEL.ink,
                      }}
                    >
                      {(p.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <EditableName
                          key={p.full_name || ''}
                          value={p.full_name || ''}
                          onSave={(val) => handleNameUpdate(p.id, val)}
                          disabled={isSaving}
                        />
                        {isMe && (
                          <span
                            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: PASTEL.peach, color: PASTEL.ink }}
                          >
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: PASTEL.inkMute }}>
                        {p.id}
                      </div>
                    </div>
                  </div>

                  {/* Role + Active */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Role Dropdown */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: PASTEL.inkMute }}>
                        Role
                      </div>
                      <select
                        value={p.role}
                        onChange={(e) => handleRoleChange(p.id, e.target.value)}
                        disabled={isSaving}
                        className="rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer focus:outline-none disabled:opacity-50"
                        style={{
                          background: roleObj?.color ? `${roleObj.color}22` : 'white',
                          borderColor: roleObj?.color || PASTEL.line,
                          color: PASTEL.ink,
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                      <div className="text-[10px] mt-1 max-w-[200px]" style={{ color: PASTEL.inkMute }}>
                        {ROLE_DESCRIPTIONS[p.role]}
                      </div>
                    </div>

                    {/* Active Toggle */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: PASTEL.inkMute }}>
                        Status
                      </div>
                      <button
                        onClick={() => handleToggleActive(p.id, !p.active)}
                        disabled={isSaving || isMe}
                        className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: p.active ? PASTEL.mint : PASTEL.rose,
                          color: PASTEL.ink,
                        }}
                        title={isMe ? 'Tidak bisa menonaktifkan akun sendiri' : ''}
                      >
                        {p.active ? <ShieldCheck size={13}/> : <ShieldOff size={13}/>}
                        {p.active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Saving indicator */}
                {isSaving && (
                  <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: PASTEL.inkMute }}>
                    <RefreshCw size={11} className="animate-spin" />
                    Menyimpan...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 z-50"
          style={{
            background: toast.type === 'error' ? PASTEL.rose : PASTEL.mint,
            color: PASTEL.ink,
            border: `1px solid ${toast.type === 'error' ? PASTEL.roseDeep : PASTEL.mintDeep}`,
          }}
        >
          {toast.type === 'error' ? <X size={14}/> : <Check size={14}/>}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// Inline-editable name field
function EditableName({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    if (draft.trim() && draft !== value) {
      onSave(draft.trim());
    } else {
      setDraft(value);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        disabled={disabled}
        className="font-semibold text-sm rounded px-1 -mx-1 focus:outline-none border"
        style={{ background: PASTEL.lineSoft, borderColor: PASTEL.line, color: PASTEL.ink, minWidth: 120 }}
      />
    );
  }

  return (
    <button
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      className="font-semibold text-sm hover:opacity-70 cursor-pointer text-left"
      style={{ color: PASTEL.ink }}
      title="Klik untuk edit nama"
    >
      {value || '(no name)'}
    </button>
  );
}

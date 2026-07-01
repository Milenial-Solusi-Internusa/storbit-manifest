// src/pages/profile/MyProfilePage.jsx
// Profil Saya — full-page profile editor (overlay), opened from the top-bar
// "My Profile" dropdown item. Ported from the Claude Design bundle.
//
// Props: { onClose } — navigates back (closes the overlay).
//
// Self-contained: local brand tokens, a lucide-react Icon wrapper, inline
// styles (the design's Tailwind theme tokens aren't configured in this app).
// Wired to Supabase: profiles, auth.users (email), user_roles→roles (role),
// companies (name), Storage 'avatars' (avatar), auth.updateUser (password).

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import {
  User, Shield, Bell, Settings, Check, ChevronLeft, ChevronRight, ChevronDown,
  WifiOff, RotateCw, Camera, UploadCloud, X, CircleAlert, Building2, Hash,
  Briefcase, Mail, Clock, Phone, KeyRound, ShieldCheck, CheckCircle2, Smartphone,
  ShieldOff, ShieldPlus, MonitorSmartphone, Monitor, LogOut, AlertTriangle, Info,
  Eye, EyeOff, FileText, GitBranch, Users, ClipboardList, Globe, LayoutDashboard,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

/* ---------- brand tokens ---------- */
const T = {
  navy: '#1B4D8A', navySoft: 'rgba(20,70,130,0.06)', navyRing: 'rgba(20,70,130,0.20)',
  orange: '#E85A1E', orangeDk: '#D14E18',
  cream: '#F6EFE3', surface: '#FFFDF8', line: '#E5E0D8',
  ink: '#1f2937', inkSoft: '#6b7280', faint: '#9ca3af',
  green: '#10b981', greenDk: '#059669', greenBg: '#d1fae5', greenBd: '#a7f3d0',
  red: '#dc2626', redBg: '#fef2f2', blue: '#2563eb', blueBg: '#eff6ff', blueBd: '#bfdbfe',
};
const HEAD = "'Montserrat', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const RING = `0 0 0 3px ${T.navyRing}`;

/* ---------- lucide icon wrapper (name → component) ---------- */
const ICONS = {
  User, Shield, Bell, Settings, Check, ChevronLeft, ChevronRight, ChevronDown,
  WifiOff, RotateCw, Camera, UploadCloud, X, CircleAlert, Building2, Hash,
  Briefcase, Mail, Clock, Phone, KeyRound, ShieldCheck, CheckCircle2, Smartphone,
  ShieldOff, ShieldPlus, MonitorSmartphone, Monitor, LogOut, AlertTriangle, Info,
  Eye, EyeOff, FileText, GitBranch, Users, ClipboardList, Globe, LayoutDashboard,
};
function Icon({ name, size = 18, strokeWidth = 2, color, style }) {
  const Cmp = ICONS[name] || Info;
  return <Cmp size={size} strokeWidth={strokeWidth} color={color || 'currentColor'} style={{ flex: '0 0 auto', ...style }} />;
}

/* ---------- helpers ---------- */
const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tzAbbrev = (tz) => ({ 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' }[tz] || 'WIB');
function formatLastLogin(iso, tz) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm} ${tzAbbrev(tz)}`;
}
function initialsOf(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/* ---------- style block (animations + skeleton shimmer) ---------- */
function MPStyles() {
  return (
    <style>{`
      @keyframes mp-pop { 0% { transform: scale(.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      @keyframes mp-fadeUp { 0% { transform: translateY(8px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
      @keyframes mp-shimmer { 0% { background-position: -480px 0; } 100% { background-position: 480px 0; } }
      .mp-skel { background: linear-gradient(90deg,#ece6da 0px,#f4efe6 80px,#ece6da 160px); background-size: 480px 100%; animation: mp-shimmer 1.3s linear infinite; }
      .mp-fade { animation: mp-fadeUp .28s cubic-bezier(.2,.7,.3,1); }
      .mp-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
      .mp-scroll::-webkit-scrollbar-thumb { background: #d8d0c2; border-radius: 8px; border: 2px solid ${T.cream}; }
    `}</style>
  );
}

/* ========================================================================= */
/* PRIMITIVES                                                                 */
/* ========================================================================= */
function Card({ children, pad = true, style }) {
  return <div style={{ borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, padding: pad ? 22 : 0, ...style }}>{children}</div>;
}
function SectionHeader({ icon, children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={15} strokeWidth={2.4} color={T.navy} />}
        <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: T.navy }}>{children}</h3>
      </div>
      {right}
    </div>
  );
}
function Btn({ variant = 'primary', size = 'md', icon, iconRight, children, onClick, disabled, full, style }) {
  const [h, setH] = useState(false);
  const sizes = size === 'sm' ? { padding: '8px 12px', fontSize: 12.5 } : { padding: '10px 16px', fontSize: 13.5 };
  const V = {
    primary: { background: h && !disabled ? T.orangeDk : T.orange, color: '#fff', border: '1px solid transparent', boxShadow: '0 1px 2px rgba(232,90,30,.3)' },
    outline: { background: h ? T.navySoft : 'transparent', color: T.navy, border: `2px solid ${T.navy}` },
    danger: { background: h ? 'rgba(220,38,38,.06)' : 'transparent', color: T.red, border: `2px solid ${T.red}` },
    ghost: { background: h ? 'rgba(0,0,0,.04)' : 'transparent', color: T.inkSoft, border: '1px solid transparent' },
    'orange-outline': { background: h ? 'rgba(232,90,30,.07)' : 'transparent', color: T.orange, border: `2px solid ${T.orange}` },
  }[variant];
  return (
    <button type="button" onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, fontFamily: HEAD, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, width: full ? '100%' : 'auto', transition: 'all .15s', ...sizes, ...V, ...style }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} strokeWidth={2.2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 17} strokeWidth={2.2} />}
    </button>
  );
}
function Field({ label, value, onChange, type = 'text', mono, required, prefix, inputMode, maxLength }) {
  const [f, setF] = useState(false);
  const up = f || (value != null && String(value).length > 0) || type === 'date';
  return (
    <div style={{ position: 'relative' }}>
      {prefix && <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontFamily: MONO, fontSize: 13, color: T.faint, pointerEvents: 'none' }}>{prefix}</span>}
      <input type={type} value={value || ''} inputMode={inputMode} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: '100%', height: 52, borderRadius: 12, border: `1px solid ${f ? T.navy : T.line}`, background: '#fff',
          padding: prefix ? '18px 13px 6px 44px' : '18px 13px 6px', fontSize: 14, color: T.ink, fontFamily: mono ? MONO : BODY,
          outline: 'none', boxShadow: f ? RING : 'none', transition: 'border-color .15s, box-shadow .15s', colorScheme: 'light' }} />
      <label style={{ position: 'absolute', left: prefix ? 44 : 13, top: up ? 7 : '50%', transform: up ? 'none' : 'translateY(-50%)',
        fontSize: up ? 11 : 14, fontWeight: 500, color: f ? T.navy : T.faint, pointerEvents: 'none', transition: 'all .15s' }}>
        {label}{required && <span style={{ color: T.orange }}> *</span>}
      </label>
    </div>
  );
}
function TextArea({ label, value, onChange, rows = 3, maxLength, counter }) {
  const [f, setF] = useState(false);
  const v = value || '';
  const up = f || v.length > 0;
  return (
    <div style={{ position: 'relative' }}>
      <textarea rows={rows} value={v} maxLength={maxLength} onChange={(e) => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ display: 'block', width: '100%', resize: 'none', borderRadius: 12, border: `1px solid ${f ? T.navy : T.line}`, background: '#fff',
          padding: '20px 13px 8px', fontSize: 14, lineHeight: 1.55, color: T.ink, fontFamily: BODY, outline: 'none', boxShadow: f ? RING : 'none', transition: 'border-color .15s, box-shadow .15s' }} />
      <label style={{ position: 'absolute', left: 13, top: up ? 8 : 16, fontSize: up ? 11 : 14, color: f ? T.navy : T.faint, pointerEvents: 'none', transition: 'all .15s' }}>{label}</label>
      {counter && maxLength && (
        <span style={{ position: 'absolute', bottom: 8, right: 12, fontFamily: MONO, fontSize: 11, color: v.length >= maxLength ? T.orange : T.faint }}>{v.length}/{maxLength}</span>
      )}
    </div>
  );
}
function RadioPills({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{ borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
              border: active ? '1px solid transparent' : `1px solid ${T.line}`, background: active ? T.navy : '#fff', color: active ? '#fff' : T.inkSoft }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => !disabled && onChange(!checked)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: 24, width: 44, flex: '0 0 44px', borderRadius: 999, border: 'none',
        background: checked ? T.orange : '#d1d5db', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background .2s', padding: 0 }}>
      <span style={{ display: 'inline-block', height: 20, width: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transform: checked ? 'translateX(22px)' : 'translateX(2px)', transition: 'transform .2s' }} />
    </button>
  );
}
function Badge({ children, color = 'navy', icon }) {
  const C = {
    navy: { background: T.navy, color: '#fff', border: '1px solid transparent' },
    green: { background: T.greenBg, color: T.greenDk, border: `1px solid ${T.greenBd}` },
    gray: { background: '#f3f4f6', color: T.inkSoft, border: '1px solid #e5e7eb' },
  }[color];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '4px 12px', fontFamily: HEAD, fontSize: 11, fontWeight: 600, ...C }}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}{children}
    </span>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <div style={{ position: 'relative' }}>
      <label style={{ position: 'absolute', left: 13, top: 7, fontSize: 11, color: T.inkSoft, zIndex: 1, pointerEvents: 'none' }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ display: 'block', width: '100%', appearance: 'none', WebkitAppearance: 'none', borderRadius: 12, border: `1px solid ${T.line}`, background: '#fff',
          padding: '24px 38px 8px 13px', fontSize: 14, color: T.ink, fontFamily: BODY, outline: 'none', cursor: 'pointer' }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: T.faint, pointerEvents: 'none' }}><Icon name="ChevronDown" size={18} /></span>
    </div>
  );
}
function PasswordInput({ label, value, onChange }) {
  const [f, setF] = useState(false);
  const [show, setShow] = useState(false);
  const up = f || (value && value.length > 0);
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value || ''} onChange={(e) => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: '100%', height: 52, borderRadius: 12, border: `1px solid ${f ? T.navy : T.line}`, background: '#fff',
          padding: '18px 44px 6px 13px', fontSize: 14, color: T.ink, fontFamily: BODY, outline: 'none', boxShadow: f ? RING : 'none', transition: 'border-color .15s, box-shadow .15s' }} />
      <label style={{ position: 'absolute', left: 13, top: up ? 7 : '50%', transform: up ? 'none' : 'translateY(-50%)', fontSize: up ? 11 : 14, color: f ? T.navy : T.faint, pointerEvents: 'none', transition: 'all .15s' }}>{label}</label>
      <button type="button" onClick={() => setShow((s) => !s)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: T.faint, cursor: 'pointer', padding: 6, display: 'flex' }}>
        <Icon name={show ? 'EyeOff' : 'Eye'} size={17} />
      </button>
    </div>
  );
}
function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel, danger = true }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(20,70,130,.3)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 380, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, padding: 24, boxShadow: '0 24px 60px rgba(20,40,70,.3)', animation: 'mp-pop .22s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ marginBottom: 16, display: 'inline-flex', height: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: danger ? T.redBg : T.navySoft, color: danger ? T.red : T.navy }}>
          <Icon name={danger ? 'AlertTriangle' : 'Info'} size={22} />
        </div>
        <h4 style={{ margin: '0 0 6px', fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: '#111827' }}>{title}</h4>
        <p style={{ margin: '0 0 24px', fontSize: 13.5, lineHeight: 1.55, color: T.inkSoft }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="ghost" size="sm" onClick={onCancel}>Batal</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
function DirtyBar({ visible, onDiscard, onSave, saving }) {
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', justifyContent: 'center', padding: '0 16px 20px',
      pointerEvents: 'none', transform: visible ? 'translateY(0)' : 'translateY(120%)', opacity: visible ? 1 : 0, transition: 'all .3s' }}>
      <div style={{ pointerEvents: 'auto', display: 'flex', width: '100%', maxWidth: 860, alignItems: 'center', justifyContent: 'space-between', gap: 16, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, padding: '14px 20px', boxShadow: '0 8px 30px rgba(20,70,130,0.16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.inkSoft }}>
          <span style={{ height: 8, width: 8, borderRadius: '50%', background: T.orange }} />
          <span style={{ fontWeight: 500 }}>Anda memiliki perubahan yang belum disimpan</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn variant="ghost" size="sm" onClick={onDiscard}>Buang</Btn>
          <Btn variant="primary" size="sm" icon={saving ? undefined : 'Check'} onClick={onSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</Btn>
        </div>
      </div>
    </div>
  );
}
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: 'fixed', left: '50%', top: 20, zIndex: 70, transform: 'translateX(-50%)', animation: 'mp-fadeUp .3s cubic-bezier(.2,.7,.3,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999, border: `1px solid ${T.greenBd}`, background: '#fff', padding: '10px 16px', boxShadow: '0 8px 30px rgba(20,70,130,0.14)' }}>
        <span style={{ display: 'flex', height: 20, width: 20, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: T.green, color: '#fff' }}><Icon name="Check" size={13} strokeWidth={3} /></span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{toast}</span>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* DATA LAYER                                                                 */
/* ========================================================================= */
async function loadProfile() {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const authUser = auth?.user;
  if (!authUser) throw new Error('Sesi tidak ditemukan. Silakan login ulang.');
  const uid = authUser.id;

  const [profRes, roleRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('user_roles').select('roles(name)').eq('user_id', uid).limit(1),
  ]);
  if (profRes.error) throw profRes.error;
  const p = profRes.data || {};

  let company_name = '';
  if (p.company_id) {
    const { data: co } = await supabase.from('companies').select('name').eq('id', p.company_id).maybeSingle();
    company_name = co?.name || '';
  }
  const roleName = roleRes.data?.[0]?.roles?.name || '';

  const dp = p.display_preferences || {};
  return {
    id: uid,
    email: authUser.email || '',
    full_name: p.full_name || '',
    avatar_url: p.avatar_url || '',
    role: roleName || '—',
    company_name: company_name || 'MSI Group',
    phone: p.phone || '',
    bio: p.bio || '',
    job_title: p.job_title || '',
    employee_id: p.employee_id || '',
    date_of_birth: p.date_of_birth || '',
    gender: p.gender || 'tidak-disebutkan',
    address: p.address || '',
    emergency_contact_name: p.emergency_contact_name || '',
    emergency_contact_phone: p.emergency_contact_phone || '',
    last_login_at: authUser.last_sign_in_at || p.last_login_at || '',
    mfa_required: !!p.mfa_required,
    company_id: p.company_id || null,
    notification_preferences: p.notification_preferences || {},
    display_preferences: {
      bahasa: dp.bahasa || 'id', timezone: dp.timezone || 'Asia/Jakarta',
      date_format: dp.date_format || 'DD/MM/YYYY', number_format: dp.number_format || 'id',
      landing_module: dp.landing_module || 'dashboard', sidebar: dp.sidebar || 'expanded',
      density: dp.density || 'comfortable',
    },
  };
}

/* ========================================================================= */
/* TAB 1 — PROFIL                                                             */
/* ========================================================================= */
function AvatarUpload({ uid, onUploaded, onToast }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { file, url }
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const MAX = 2 * 1024 * 1024;
  const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  const handleFiles = (files) => {
    setError('');
    const file = files && files[0];
    if (!file) return;
    if (!TYPES.includes(file.type)) { setError('Format harus PNG, JPEG, atau WebP.'); return; }
    if (file.size > MAX) { setError('Ukuran file melebihi 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => setPending({ file, url: e.target.result });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const ext = (pending.file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${uid}/avatar.${ext}`;
      const up = await supabase.storage.from('avatars').upload(path, pending.file, { upsert: true, contentType: pending.file.type });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = data.publicUrl + '?t=' + Date.now();
      const { error: uerr } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', uid);
      if (uerr) throw uerr;
      onUploaded(url);
      setPending(null); setOpen(false);
      onToast('Foto profil berhasil diperbarui');
    } catch (e) {
      setError('Gagal mengunggah: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <Btn variant="orange-outline" size="sm" icon="Camera" full onClick={() => setOpen((o) => !o)}>Ganti Foto</Btn>
      {open && (
        <div className="mp-fade" style={{ marginTop: 12 }}>
          {!pending ? (
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, borderRadius: 12, border: `2px dashed ${drag ? T.orange : T.line}`, background: drag ? 'rgba(232,90,30,.06)' : '#fff', padding: '20px 12px', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}>
              <Icon name="UploadCloud" size={22} color={drag ? T.orange : T.faint} />
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: T.inkSoft }}><span style={{ fontWeight: 600, color: T.navy }}>Klik untuk unggah</span> atau seret ke sini</p>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, color: T.faint }}>PNG · JPG · WebP · maks 2MB</p>
            </div>
          ) : (
            <div style={{ position: 'relative', width: 'fit-content', margin: '0 auto' }}>
              <img src={pending.url} alt="preview" style={{ height: 96, width: 96, borderRadius: '50%', border: `1px solid ${T.line}`, objectFit: 'cover' }} />
              <button onClick={() => setPending(null)} aria-label="Hapus"
                style={{ position: 'absolute', right: -4, top: -4, display: 'flex', height: 28, width: 28, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: T.red, color: '#fff', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }}>
                <Icon name="X" size={15} />
              </button>
            </div>
          )}
          {error && <p style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: T.red }}><Icon name="CircleAlert" size={14} /> {error}</p>}
          {pending && <Btn variant="primary" size="sm" icon="Check" full style={{ marginTop: 12 }} disabled={busy} onClick={save}>{busy ? 'Mengunggah…' : 'Simpan Foto'}</Btn>}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, mono, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: T.inkSoft }}>
      <Icon name={icon} size={15} color={T.faint} style={{ marginTop: 2 }} />
      <span style={{ lineHeight: 1.4, wordBreak: 'break-word', fontFamily: mono ? MONO : BODY, fontSize: mono ? 12.5 : 13, color: mono ? '#4b5563' : T.inkSoft }}>{children || '—'}</span>
    </div>
  );
}

function IdentityCard({ user, avatar, uid, onUploaded, onToast }) {
  return (
    <Card style={{ position: 'sticky', top: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ position: 'relative' }}>
          {avatar ? (
            <img src={avatar} alt={user.full_name} style={{ height: 80, width: 80, borderRadius: '50%', border: `1px solid ${T.line}`, objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', height: 80, width: 80, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: T.navy, fontFamily: HEAD, fontSize: 24, fontWeight: 700, color: '#fff' }}>{initialsOf(user.full_name)}</div>
          )}
          <span title="Aktif" style={{ position: 'absolute', bottom: 2, right: 2, height: 16, width: 16, borderRadius: '50%', border: `2.5px solid ${T.surface}`, background: T.green }} />
        </div>
        <div style={{ marginTop: 16, width: '100%' }}>
          <AvatarUpload uid={uid} onUploaded={onUploaded} onToast={onToast} />
        </div>
        <h2 style={{ margin: '20px 0 0', fontFamily: HEAD, fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: T.navy }}>{user.full_name || '—'}</h2>
        <div style={{ marginTop: 8 }}><Badge color="navy">{user.role}</Badge></div>
      </div>
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${T.line}`, paddingTop: 20 }}>
        <InfoRow icon="Building2">{user.company_name}</InfoRow>
        <InfoRow icon="Hash" mono>{user.employee_id}</InfoRow>
        <InfoRow icon="Briefcase">{user.job_title}</InfoRow>
        <InfoRow icon="Mail">{user.email}</InfoRow>
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${T.line}`, paddingTop: 16, fontSize: 11.5, color: T.faint }}>
        <Icon name="Clock" size={13} /><span>Terakhir login: {formatLastLogin(user.last_login_at, user.display_preferences.timezone)}</span>
      </div>
    </Card>
  );
}

function ProfilTab({ user, onToast, onPatch }) {
  const initial = {
    full_name: user.full_name, job_title: user.job_title, employee_id: user.employee_id,
    phone: user.phone, date_of_birth: user.date_of_birth, gender: user.gender,
    bio: user.bio, address: user.address,
    emergency_contact_name: user.emergency_contact_name, emergency_contact_phone: user.emergency_contact_phone,
  };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState(user.avatar_url || '');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const onSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name, job_title: form.job_title, employee_id: form.employee_id,
      phone: form.phone, date_of_birth: form.date_of_birth || null, gender: form.gender,
      bio: form.bio, address: form.address,
      emergency_contact_name: form.emergency_contact_name, emergency_contact_phone: form.emergency_contact_phone,
    }).eq('id', user.id);
    setSaving(false);
    if (error) { onToast('Gagal menyimpan: ' + error.message); return; }
    setSaved(form);
    onPatch({ full_name: form.full_name, job_title: form.job_title, employee_id: form.employee_id });
    onToast('Profil berhasil diperbarui');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24 }} className="mp-grid-3">
      <div className="mp-col-1">
        <IdentityCard user={user} avatar={avatar} uid={user.id} onUploaded={(u) => { setAvatar(u); onPatch({ avatar_url: u }); }} onToast={onToast} />
      </div>
      <div className="mp-col-2" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card>
          <SectionHeader icon="User">Informasi Pribadi</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Nama Lengkap" value={form.full_name} onChange={set('full_name')} required /></div>
            <Field label="Jabatan" value={form.job_title} onChange={set('job_title')} />
            <Field label="Employee ID" value={form.employee_id} onChange={set('employee_id')} mono />
            <Field label="Nomor Telepon" value={form.phone} onChange={set('phone')} prefix="+62" inputMode="tel" mono />
            <Field label="Tanggal Lahir" value={form.date_of_birth} onChange={set('date_of_birth')} type="date" />
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: T.inkSoft }}>Jenis Kelamin</p>
              <RadioPills value={form.gender} onChange={set('gender')} options={[{ value: 'laki-laki', label: 'Laki-laki' }, { value: 'perempuan', label: 'Perempuan' }, { value: 'tidak-disebutkan', label: 'Tidak Disebutkan' }]} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}><TextArea label="Bio" value={form.bio} onChange={set('bio')} rows={3} maxLength={200} counter /></div>
            <div style={{ gridColumn: '1 / -1' }}><TextArea label="Alamat" value={form.address} onChange={set('address')} rows={2} /></div>
          </div>
        </Card>
        <Card>
          <SectionHeader icon="Phone">Kontak Darurat</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <Field label="Nama Kontak Darurat" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} />
            <Field label="Telepon Kontak Darurat" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} prefix="+62" inputMode="tel" mono />
          </div>
        </Card>
      </div>
      <DirtyBar visible={dirty} saving={saving} onDiscard={() => setForm(saved)} onSave={onSave} />
    </div>
  );
}

/* ========================================================================= */
/* TAB 2 — KEAMANAN                                                           */
/* ========================================================================= */
function strengthOf(pw) {
  if (!pw) return { score: 0, label: '', color: '', width: '0%' };
  let s = 0;
  if (pw.length >= 8) s++; if (/[A-Z]/.test(pw)) s++; if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  const map = {
    1: { label: 'Lemah', color: T.red, width: '25%' },
    2: { label: 'Cukup', color: T.orange, width: '50%' },
    3: { label: 'Baik', color: T.blue, width: '75%' },
    4: { label: 'Kuat', color: T.green, width: '100%' },
  };
  return { score: s, ...(map[s] || map[1]) };
}
function ChangePassword({ onToast }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const st = strengthOf(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 8;
  const canSubmit = cur && next.length >= 8 && next === confirm && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) { onToast('Gagal mengubah password: ' + error.message); return; }
    onToast('Password berhasil diubah');
    setCur(''); setNext(''); setConfirm('');
  };

  return (
    <Card>
      <SectionHeader icon="KeyRound">Ubah Password</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 420 }}>
        <PasswordInput label="Password Saat Ini" value={cur} onChange={setCur} />
        <div>
          <PasswordInput label="Password Baru" value={next} onChange={setNext} />
          {next && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 6, width: '100%', overflow: 'hidden', borderRadius: 999, background: '#e5e7eb' }}>
                <div style={{ height: '100%', borderRadius: 999, background: st.color, width: st.width, transition: 'all .3s' }} />
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: HEAD, fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span>
                {tooShort && <span style={{ fontSize: 11, color: T.faint }}>Minimal 8 karakter</span>}
              </div>
            </div>
          )}
        </div>
        <div>
          <PasswordInput label="Konfirmasi Password Baru" value={confirm} onChange={setConfirm} />
          {mismatch && <p style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: T.red }}><Icon name="CircleAlert" size={13} /> Password tidak cocok</p>}
        </div>
        <div style={{ paddingTop: 4 }}>
          <Btn variant="primary" icon="ShieldCheck" disabled={!canSubmit} onClick={submit}>{busy ? 'Menyimpan…' : 'Ubah Password'}</Btn>
        </div>
      </div>
    </Card>
  );
}
function TwoFactor({ user }) {
  const [active, setActive] = useState(!!user.mfa_required);
  return (
    <Card style={{ position: 'relative', overflow: 'hidden' }}>
      <SectionHeader icon="Smartphone" right={<Badge color={active ? 'green' : 'gray'}>{active ? 'Aktif' : 'Tidak Aktif'}</Badge>}>Two-Factor Authentication</SectionHeader>
      <p style={{ margin: 0, maxWidth: 420, fontSize: 13.5, lineHeight: 1.55, color: T.inkSoft }}>Tambahkan lapisan keamanan ekstra pada akun Anda dengan verifikasi dua langkah saat login.</p>
      <div style={{ marginTop: 16 }}>
        {active ? <Btn variant="danger" size="sm" icon="ShieldOff" onClick={() => setActive(false)}>Nonaktifkan 2FA</Btn> : <Btn variant="outline" size="sm" icon="ShieldPlus" onClick={() => setActive(true)}>Aktifkan 2FA</Btn>}
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,253,248,.8)', backdropFilter: 'blur(3px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 999, border: `1px solid ${T.line}`, background: '#fff', padding: '8px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <Icon name="Clock" size={15} color={T.orange} /><span style={{ fontFamily: HEAD, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: T.inkSoft }}>Segera Hadir</span>
        </div>
      </div>
    </Card>
  );
}
function ActiveSessions({ user, onLogoutAll }) {
  return (
    <Card>
      <SectionHeader icon="MonitorSmartphone">Sesi Aktif</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 12, border: `1px solid ${T.line}`, background: '#fff', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: T.navySoft, color: T.navy }}><Icon name="Monitor" size={18} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#374151' }}>Sesi browser ini</p>
              <span style={{ borderRadius: 999, background: T.greenBg, padding: '2px 8px', fontSize: 10, fontWeight: 600, color: T.greenDk }}>Perangkat ini</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: T.faint }}>Terakhir login: {formatLastLogin(user.last_login_at, user.display_preferences.timezone)}</p>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}><Btn variant="danger" size="sm" icon="LogOut" onClick={onLogoutAll}>Keluar Semua Sesi</Btn></div>
    </Card>
  );
}
function KeamananTab({ user, onToast }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ChangePassword onToast={onToast} />
      <TwoFactor user={user} />
      <ActiveSessions user={user} onLogoutAll={() => setConfirm(true)} />
      <ConfirmModal open={confirm} title="Keluar dari semua sesi?" message="Ini akan logout akun Anda dari semua perangkat. Anda perlu login kembali di setiap perangkat."
        confirmLabel="Keluar Semua" onCancel={() => setConfirm(false)} onConfirm={async () => { setConfirm(false); await supabase.auth.signOut({ scope: 'global' }).catch(() => {}); onToast('Berhasil keluar dari semua sesi'); }} />
    </div>
  );
}

/* ========================================================================= */
/* TAB 3 — NOTIFIKASI                                                         */
/* ========================================================================= */
const NOTIF_GROUPS = [
  { title: 'SP & Dokumen', icon: 'FileText', items: [
    { key: 'sp_baru', label: 'SP Baru Dibuat', desc: 'Notifikasi saat Surat Perintah baru dibuat' },
    { key: 'sp_disetujui', label: 'SP Disetujui', desc: 'Saat SP Anda telah disetujui' },
    { key: 'sp_ditolak', label: 'SP Ditolak', desc: 'Saat SP Anda ditolak oleh approver' },
  ]},
  { title: 'Approval', icon: 'GitBranch', items: [
    { key: 'appr_menunggu', label: 'Dokumen Menunggu Persetujuan', desc: 'Saat ada dokumen menunggu persetujuan Anda' },
    { key: 'appr_disetujui', label: 'Dokumen Disetujui', desc: 'Saat dokumen dalam alur Anda disetujui' },
    { key: 'appr_ditolak', label: 'Dokumen Ditolak', desc: 'Saat dokumen dalam alur Anda ditolak' },
  ]},
  { title: 'CRM', icon: 'Users', items: [
    { key: 'crm_won', label: 'Deal WON', desc: 'Saat sebuah deal berhasil dimenangkan' },
    { key: 'crm_lead_inactive', label: 'Lead Tidak Aktif', desc: 'Saat lead tidak ada aktivitas dalam periode tertentu' },
  ]},
  { title: 'HRGA', icon: 'ClipboardList', items: [
    { key: 'hrga_disetujui', label: 'Request HRGA Disetujui', desc: 'Saat permintaan HRGA Anda disetujui' },
    { key: 'hrga_ditolak', label: 'Request HRGA Ditolak', desc: 'Saat permintaan HRGA Anda ditolak' },
  ]},
];
function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '14px 0' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#374151' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.4, color: T.faint }}>{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
function NotifikasiTab({ user, onToast }) {
  // Default toggles ON unless the user has saved a preference. (notification_rules
  // is fetched for context but personal prefs are stored on profiles.)
  const seed = {};
  NOTIF_GROUPS.forEach((g) => g.items.forEach((it) => { seed[it.key] = user.notification_preferences?.[it.key] ?? true; }));
  const [prefs, setPrefs] = useState(seed);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setPrefs((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ notification_preferences: prefs }).eq('id', user.id);
    setSaving(false);
    if (error) { onToast('Gagal menyimpan: ' + error.message); return; }
    onToast('Preferensi notifikasi disimpan');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: '#111827' }}>Atur preferensi notifikasi Anda</h3>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: T.inkSoft }}>Pilih peristiwa mana yang ingin Anda terima notifikasinya.</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 12, border: `1px solid ${T.blueBd}`, background: T.blueBg, padding: '12px 16px' }}>
        <Icon name="Info" size={17} color={T.blue} style={{ marginTop: 2 }} />
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#1e40af' }}>Pengaturan ini akan <span style={{ fontWeight: 600 }}>override</span> aturan notifikasi global yang ditetapkan administrator.</p>
      </div>
      {NOTIF_GROUPS.map((g) => (
        <Card key={g.title}>
          <SectionHeader icon={g.icon}>{g.title}</SectionHeader>
          <div>
            {g.items.map((it, i) => (
              <div key={it.key} style={{ borderTop: i === 0 ? 'none' : `1px solid ${T.line}` }}>
                <ToggleRow label={it.label} desc={it.desc} checked={!!prefs[it.key]} onChange={set(it.key)} />
              </div>
            ))}
          </div>
        </Card>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="primary" icon={saving ? undefined : 'Check'} onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Preferensi'}</Btn>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* TAB 4 — PREFERENSI                                                         */
/* ========================================================================= */
function FieldLabel({ children }) { return <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 500, color: T.inkSoft }}>{children}</p>; }
function PreferensiTab({ user, onToast }) {
  const [prefs, setPrefs] = useState(user.display_preferences);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setPrefs((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ display_preferences: prefs }).eq('id', user.id);
    setSaving(false);
    if (error) { onToast('Gagal menyimpan: ' + error.message); return; }
    onToast('Preferensi disimpan');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card>
        <SectionHeader icon="Globe">Tampilan &amp; Regional</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div><FieldLabel>Bahasa</FieldLabel><RadioPills value={prefs.bahasa} onChange={set('bahasa')} options={[{ value: 'id', label: 'Indonesia' }, { value: 'en', label: 'English' }]} /></div>
          <div style={{ maxWidth: 360 }}><Select label="Timezone" value={prefs.timezone} onChange={set('timezone')} options={[{ value: 'Asia/Jakarta', label: 'Asia/Jakarta  (WIB · GMT+7)' }, { value: 'Asia/Makassar', label: 'Asia/Makassar  (WITA · GMT+8)' }, { value: 'Asia/Jayapura', label: 'Asia/Jayapura  (WIT · GMT+9)' }]} /></div>
          <div><FieldLabel>Format Tanggal</FieldLabel><RadioPills value={prefs.date_format} onChange={set('date_format')} options={[{ value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }]} /></div>
          <div><FieldLabel>Format Angka</FieldLabel><RadioPills value={prefs.number_format} onChange={set('number_format')} options={[{ value: 'id', label: '1.000.000,00  (ID)' }, { value: 'en', label: '1,000,000.00  (EN)' }]} /></div>
        </div>
      </Card>
      <Card>
        <SectionHeader icon="LayoutDashboard">Tampilan Aplikasi</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ maxWidth: 360 }}><Select label="Default Landing Module" value={prefs.landing_module} onChange={set('landing_module')} options={[{ value: 'dashboard', label: 'Dashboard' }, { value: 'sp', label: 'Surat Perintah (SP)' }, { value: 'approval', label: 'Approval' }, { value: 'crm', label: 'CRM' }, { value: 'hrga', label: 'HRGA' }]} /></div>
          <div><FieldLabel>Sidebar Default</FieldLabel><RadioPills value={prefs.sidebar} onChange={set('sidebar')} options={[{ value: 'expanded', label: 'Expanded' }, { value: 'collapsed', label: 'Collapsed' }]} /></div>
          <div><FieldLabel>Density</FieldLabel><RadioPills value={prefs.density} onChange={set('density')} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></div>
        </div>
      </Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="primary" icon={saving ? undefined : 'Check'} onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Preferensi'}</Btn>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* SHELL — tabs, skeleton, error                                             */
/* ========================================================================= */
const TABS = [
  { id: 'profil', label: 'Profil', icon: 'User' },
  { id: 'keamanan', label: 'Keamanan', icon: 'Shield' },
  { id: 'notifikasi', label: 'Notifikasi', icon: 'Bell' },
  { id: 'preferensi', label: 'Preferensi', icon: 'Settings' },
];
function TabBar({ active, onChange }) {
  const refs = useRef({});
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const measure = useCallback(() => { const el = refs.current[active]; if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth }); }, [active]);
  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, [measure]);
  return (
    <div style={{ position: 'relative', borderBottom: `1px solid ${T.line}` }}>
      <div className="mp-scroll" style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button key={t.id} ref={(el) => (refs.current[t.id] = el)} onClick={() => onChange(t.id)}
              style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 8, padding: '12px 16px', border: 'none', background: 'transparent',
                fontFamily: HEAD, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: on ? T.navy : T.faint, transition: 'color .15s' }}>
              <Icon name={t.icon} size={16} strokeWidth={2.2} />{t.label}
            </button>
          );
        })}
      </div>
      <span style={{ position: 'absolute', bottom: -1, height: 2.5, borderRadius: 999, background: T.navy, left: ind.left, width: ind.width, transition: 'left .3s cubic-bezier(.4,0,.2,1), width .3s cubic-bezier(.4,0,.2,1)' }} />
    </div>
  );
}
function Skeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 24 }} className="mp-grid-3">
      <div className="mp-col-1"><Card><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="mp-skel" style={{ height: 80, width: 80, borderRadius: '50%' }} />
        <div className="mp-skel" style={{ marginTop: 16, height: 32, width: '100%', borderRadius: 8 }} />
        <div className="mp-skel" style={{ marginTop: 20, height: 16, width: 160, borderRadius: 4 }} />
        <div className="mp-skel" style={{ marginTop: 12, height: 24, width: 96, borderRadius: 999 }} />
      </div><div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${T.line}`, paddingTop: 20 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="mp-skel" style={{ height: 16, width: '100%', borderRadius: 4 }} />)}
      </div></Card></div>
      <div className="mp-col-2" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {[0, 1].map((c) => <Card key={c}><div className="mp-skel" style={{ height: 12, width: 128, borderRadius: 4 }} />
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[...Array(c === 0 ? 6 : 2)].map((_, i) => <div key={i} className="mp-skel" style={{ height: 48, borderRadius: 12 }} />)}
          </div></Card>)}
      </div>
    </div>
  );
}
function ErrorState({ onRetry }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
      <div style={{ display: 'flex', height: 48, width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: T.redBg, color: T.red }}><Icon name="WifiOff" size={22} /></div>
      <h3 style={{ margin: '16px 0 0', fontFamily: HEAD, fontSize: 16, fontWeight: 700, color: '#111827' }}>Gagal memuat profil</h3>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: T.inkSoft }}>Terjadi kesalahan saat mengambil data Anda.</p>
      <div style={{ marginTop: 20 }}><Btn variant="outline" size="sm" icon="RotateCw" onClick={onRetry}>Coba Lagi</Btn></div>
    </Card>
  );
}

/* ========================================================================= */
/* MAIN                                                                       */
/* ========================================================================= */
export default function MyProfilePage({ onClose }) {
  const [tab, setTab] = useState('profil');
  const [status, setStatus] = useState('loading'); // loading | error | ready
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const load = useCallback(() => {
    let cancelled = false;
    setStatus('loading');
    loadProfile()
      .then((u) => { if (!cancelled) { setUser(u); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => load(), [load]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);
  const patchUser = useCallback((patch) => setUser((u) => (u ? { ...u, ...patch } : u)), []);

  return (
    <div className="mp-scroll" style={{ minHeight: '100vh', width: '100%', background: T.cream, paddingBottom: 112, fontFamily: BODY, color: T.ink }}>
      <MPStyles />
      <style>{`@media (min-width: 1024px) { .mp-grid-3 { grid-template-columns: repeat(3, minmax(0,1fr)) !important; } .mp-col-1 { grid-column: span 1; } .mp-col-2 { grid-column: span 2; } }`}</style>
      <Toast toast={toast} />

      <div style={{ margin: '0 auto', maxWidth: 900, padding: '32px 24px' }}>
        {/* header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} aria-label="Kembali" style={{ display: 'flex', height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: T.inkSoft, cursor: 'pointer' }}>
            <Icon name="ChevronLeft" size={20} />
          </button>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: T.faint, cursor: 'pointer', padding: 0 }}>Beranda</button>
            <Icon name="ChevronRight" size={14} color="#d1d5db" />
            <span style={{ fontFamily: HEAD, fontWeight: 600, color: T.navy }}>Profil Saya</span>
          </nav>
        </div>
        <h1 style={{ margin: '0 0 20px', fontFamily: HEAD, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#111827' }}>Profil Saya</h1>

        <TabBar active={tab} onChange={setTab} />

        <div style={{ marginTop: 24 }}>
          {status === 'loading' && <Skeleton />}
          {status === 'error' && <ErrorState onRetry={load} />}
          {status === 'ready' && user && (
            <div key={tab} className="mp-fade">
              {tab === 'profil' && <ProfilTab user={user} onToast={showToast} onPatch={patchUser} />}
              {tab === 'keamanan' && <KeamananTab user={user} onToast={showToast} />}
              {tab === 'notifikasi' && <NotifikasiTab user={user} onToast={showToast} />}
              {tab === 'preferensi' && <PreferensiTab user={user} onToast={showToast} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

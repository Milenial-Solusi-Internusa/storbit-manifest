// src/components/ProfileMiniView.jsx
// Mini profil READ-ONLY untuk melihat rekan kerja lain (mis. klik nama sales di
// Header DealDetailPage). SENGAJA terpisah total dari MyProfilePage.jsx — file
// itu hardcode ke sesi auth yang login + berisi kontrol session-level (ubah
// password, keluar semua sesi) yang lepas dari userId, jadi tidak aman direuse
// untuk melihat profil ORANG LAIN. Komponen ini murni `.select()` — nol
// `.update()`/`.insert()`/`supabase.auth.*` di file ini, by construction.
import { useEffect, useState } from 'react';
import { X, Building2, Briefcase, Phone, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

const T = {
  navy: '#1B4D8A', navySoft: 'rgba(20,70,130,0.06)',
  ink: '#1f2937', inkSoft: '#6b7280', faint: '#9ca3af',
  line: '#E5E0D8', surface: '#FFFDF8',
};
const HEAD = "'Montserrat', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

function initialsOf(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function InfoRow({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: T.inkSoft, padding: '8px 0' }}>
      <Icon size={15} color={T.faint} style={{ flex: '0 0 auto' }} />
      <span style={{ fontFamily: BODY, lineHeight: 1.4, wordBreak: 'break-word' }}>{children}</span>
    </div>
  );
}

export default function ProfileMiniView({ userId, onClose }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading');
    setData(null);
    (async () => {
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone, email, job_title, company_id')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !prof) { setStatus('error'); return; }

      // Role — best-effort. RLS `user_roles_read` hanya izinkan baris sendiri,
      // ATAU manager-or-above, ATAU super_admin membaca baris user LAIN. Klik
      // sesama non-manager (peer-to-peer) akan balik 0 baris di sini — itu
      // bukan error, cuma berarti role tidak ditampilkan (lihat InfoRow guard).
      const rolePromise = supabase
        .from('user_roles').select('roles(name)').eq('user_id', userId).limit(1);

      // Company — best-effort. RLS `companies_read_own` scoped ke company sendiri;
      // lintas-entitas bisa balik kosong juga.
      const companyPromise = prof.company_id
        ? supabase.from('companies').select('name').eq('id', prof.company_id).maybeSingle()
        : Promise.resolve({ data: null });

      const [{ data: urRows }, { data: co }] = await Promise.all([rolePromise, companyPromise]);
      if (cancelled) return;

      setData({ ...prof, roleName: urRows?.[0]?.roles?.name || '', companyName: co?.name || '' });
      setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [userId, onClose]);

  if (!userId) return null;

  return (
    <div
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(20,70,130,.3)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: 'min(360px, 100%)', borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface, boxShadow: '0 24px 64px rgba(20,40,70,.3)' }}
      >
        <button
          onClick={onClose}
          aria-label="Tutup"
          style={{ position: 'absolute', top: 12, right: 12, display: 'flex', height: 30, width: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: '#F3F4F6', color: T.inkSoft, cursor: 'pointer' }}
        >
          <X size={15} />
        </button>

        <div style={{ padding: '32px 24px 24px' }}>
          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: BODY, fontSize: 13, color: T.faint }}>Memuat…</div>
          )}
          {status === 'error' && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: BODY, fontSize: 13, color: '#B23227' }}>Gagal memuat profil.</div>
          )}
          {status === 'ready' && data && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              {data.avatar_url ? (
                <img src={data.avatar_url} alt={data.full_name} style={{ height: 72, width: 72, borderRadius: '50%', border: `1px solid ${T.line}`, objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', height: 72, width: 72, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: T.navy, fontFamily: HEAD, fontSize: 22, fontWeight: 700, color: '#fff' }}>
                  {initialsOf(data.full_name)}
                </div>
              )}
              <h3 style={{ margin: '14px 0 0', fontFamily: HEAD, fontSize: 17, fontWeight: 700, color: T.navy }}>{data.full_name || '—'}</h3>
              {data.roleName && (
                <span style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '4px 12px', fontFamily: HEAD, fontSize: 11, fontWeight: 600, background: T.navy, color: '#fff' }}>
                  {data.roleName}
                </span>
              )}
              <div style={{ marginTop: 16, width: '100%', borderTop: `1px solid ${T.line}`, paddingTop: 4 }}>
                <InfoRow icon={Building2}>{data.companyName}</InfoRow>
                <InfoRow icon={Briefcase}>{data.job_title}</InfoRow>
                <InfoRow icon={Phone}>{data.phone}</InfoRow>
                <InfoRow icon={Mail}>{data.email}</InfoRow>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

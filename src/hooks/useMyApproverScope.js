// src/hooks/useMyApproverScope.js
// Scope approver HRGA milik user yang sedang login: pasangan
// (request_type_id, level) yang boleh ia approve/reject.
//
// Diangkat dari logika badge "Pending Approval" di App.jsx supaya SATU sumber
// dipakai bertiga — badge topbar, halaman Pending Approval (usePendingApprovals),
// dan gate tombol di HrgaDetailPage. Sebelumnya badge menghitung dengan cara ini
// sementara halaman inbox tidak memfilter sama sekali, jadi keduanya bisa
// menampilkan angka yang berbeda untuk user yang sama.
//
// Cocokkan DUA jalur (sengaja, bukan salah satu):
//   • approver_role ada di antara role aktif user, ATAU
//   • approver_user_id menunjuk user ini secara spesifik
// Badge lama hanya memeriksa jalur pertama, sehingga approver yang ditunjuk
// per-user tidak pernah terhitung.
//
// Pola: setState hanya di dalam .then()/async, tidak pernah sinkron di body
// effect — sama seperti useDepartments.js / useHrgaRequests.js.

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';

/** Status hrga_requests yang masih menunggu keputusan approver. */
export const HRGA_PENDING_STATUSES = ['submitted', 'under_review'];

/** Kunci Set: satu pasangan tipe-request + level. */
export const approverKey = (requestTypeId, level) => `${requestTypeId}|${level}`;

export default function useMyApproverScope() {
  const { profile, erpRoles, role } = useAuth();
  const [keys, setKeys] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  // Gate dibaca dari erpRoles (SELURUH role aktif), bukan prop `role` —
  // pickPrimaryErpRole hanya mengembalikan satu role berprioritas tertinggi,
  // jadi user yang punya role approver sebagai role SEKUNDER akan kehilangan
  // scope-nya kalau kita membaca prop itu. Pola sama SalesOrderDetailPage:880.
  const myRoleCodesKey = useMemo(
    () => (erpRoles || []).map((r) => r.roles?.code).filter(Boolean).sort().join(','),
    [erpRoles],
  );

  const userId = profile?.id || null;
  const companyId = profile?.company_id || null;
  const isSuper = role === 'super_admin';

  useEffect(() => {
    // Pola reset-lalu-fetch yang sama dipakai fetchMenuPermissions /
    // fetchBnfAuthorized di AuthContext.jsx — bukan pola baru.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!userId) { setKeys(new Set()); setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);

    const myRoles = myRoleCodesKey ? myRoleCodesKey.split(',') : [];

    let q = supabase
      .from('hrga_approval_configs')
      .select('request_type_id, level, approver_role, approver_user_id')
      .eq('is_active', true)
      .limit(1000);
    if (!isSuper) q = q.eq('company_id', companyId);

    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.debug('[useMyApproverScope] gagal memuat konfigurasi:', error.message);
        setKeys(new Set());
      } else {
        const next = new Set();
        (data || []).forEach((c) => {
          const byRole = c.approver_role && myRoles.includes(c.approver_role);
          const byUser = c.approver_user_id && c.approver_user_id === userId;
          if (isSuper || byRole || byUser) next.add(approverKey(c.request_type_id, c.level));
        });
        setKeys(next);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId, companyId, myRoleCodesKey, isSuper]);

  return { approverKeys: keys, approverScopeLoading: loading, isSuperApprover: isSuper };
}

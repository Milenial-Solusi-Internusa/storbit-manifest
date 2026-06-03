// src/hooks/useHrgaRequests.js
// Data layer for HRGA Request module.
//
// Exports:
//   useHrgaRequestTypes()    — fetch active request types for a company
//   useMyHrgaRequests()      — paginated list of current user's own requests
//   useHrgaRequestDetail()   — single request with items + approval trail
//   useAllHrgaRequests()     — paginated list of all requests in company (view only)
//   submitHrgaRequest()      — create header + items + queue first notification
//   cancelHrgaRequest()      — requester cancels a submitted request
//
// Patterns:
//   - All setState in .then() — never synchronously in effect body
//   - deleted_at IS NULL on all list queries
//   - company_id always from profile (RLS-enforced, client-side guard)
//   - No SELECT * — only required columns selected

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const HRGA_PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────
// useHrgaRequestTypes
// Returns active request types scoped to the user's company.
// Accepts companyId (uuid string) from caller — taken from
// profile.company_id which is already in AuthContext.
// Without companyId the hook returns empty and skips the query.
// ─────────────────────────────────────────────────────────────
export function useHrgaRequestTypes(companyId) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!companyId) {
      Promise.resolve().then(() => { setData([]); setLoading(false); });
      return;
    }

    let cancelled = false;

    supabase
      .from('hrga_request_types')
      .select(
        'id, category_code, category_name, type_code, type_name, ' +
        'requires_attachment, requires_amount, requires_date_range, ' +
        'approval_levels, sort_order'
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) setError(err);
        else { setData(rows || []); setError(null); }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [companyId]);

  return { data, loading, error };
}

// ─────────────────────────────────────────────────────────────
// useMyHrgaRequests
// Paginated list of requests submitted by the current user.
// Joins request_type for display.
// ─────────────────────────────────────────────────────────────
export function useMyHrgaRequests({ page = 1, search = '' } = {}) {
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * HRGA_PAGE_SIZE;
    const to   = from + HRGA_PAGE_SIZE - 1;

    let query = supabase
      .from('hrga_requests')
      .select(
        'id, document_no, subject, status, current_level, total_levels, ' +
        'amount, currency_code, requested_date, submitted_at, created_at, ' +
        'hrga_request_types(type_code, type_name, category_code, category_name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search.trim()) {
      query = query.or(
        `subject.ilike.%${search.trim()}%,document_no.ilike.%${search.trim()}%`
      );
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) setError(err);
      else { setData(rows || []); setTotal(count ?? 0); setError(null); }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [page, search, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  return { data, total, loading, error, refresh };
}

// ─────────────────────────────────────────────────────────────
// submitHrgaRequest
// Creates hrga_requests header + hrga_request_items in sequence.
// Inserts one hrga_notification_queue row for the supervisor approver.
//
// params:
//   requestTypeId  string (uuid)
//   subject        string
//   description    string
//   requestedDate  string (YYYY-MM-DD)
//   items          [{ item_description, quantity, unit, notes }]
//   profile        { id, company_id, full_name, email }
//
// Returns { data, error }
// ─────────────────────────────────────────────────────────────
export async function submitHrgaRequest({
  requestTypeId,
  subject,
  description,
  requestedDate,
  items,
  profile,
}) {
  if (!profile?.company_id) {
    return { data: null, error: { message: 'Profil user tidak memiliki company_id. Hubungi admin.' } };
  }
  if (!requestTypeId) {
    return { data: null, error: { message: 'Tipe request tidak valid. Tutup form dan coba lagi.' } };
  }

  console.debug('[submitHrgaRequest] START', { requestTypeId, company_id: profile.company_id });

  // ── Step 1a: Fetch company code ───────────────────────────────────────────
  const year = new Date().getFullYear();

  const { data: companyRow, error: companyErr } = await supabase
    .from('companies')
    .select('code')
    .eq('id', profile.company_id)
    .single();

  console.debug('[submitHrgaRequest] Step 1a company', { companyRow, companyErr });
  if (companyErr) return { data: null, error: companyErr };
  const entityCode = companyRow.code;

  // Step 1b skipped — increment_document_sequence() RPC handles INSERT if
  // no row exists (SECURITY DEFINER, atomic upsert inside the function).

  // ── Step 1c: Atomic increment via RPC, fallback to read-update ────────────
  const { data: seqData, error: seqRpcErr } = await supabase.rpc(
    'increment_document_sequence',
    { p_company_id: profile.company_id, p_document_type: 'HRG', p_department_code: 'HR', p_year: year, p_month: 0 }
  );

  console.debug('[submitHrgaRequest] Step 1c rpc', { seqData, seqRpcErr });

  let sequenceNumber;
  if (seqRpcErr) {
    const { data: currentSeq, error: readErr } = await supabase
      .from('document_sequences')
      .select('last_sequence')
      .eq('company_id', profile.company_id)
      .eq('document_type', 'HRG')
      .eq('department_code', 'HR')
      .eq('year', year)
      .eq('month', 0)
      .single();

    console.debug('[submitHrgaRequest] Step 1c fallback read', { currentSeq, readErr });
    if (readErr) return { data: null, error: readErr };

    const nextSeq = (currentSeq?.last_sequence ?? 0) + 1;
    const { error: updateErr } = await supabase
      .from('document_sequences')
      .update({ last_sequence: nextSeq })
      .eq('company_id', profile.company_id)
      .eq('document_type', 'HRG')
      .eq('department_code', 'HR')
      .eq('year', year)
      .eq('month', 0);

    console.debug('[submitHrgaRequest] Step 1c fallback update', { nextSeq, updateErr });
    if (updateErr) return { data: null, error: updateErr };
    sequenceNumber = nextSeq;
  } else {
    sequenceNumber = seqData;
  }

  const documentNo = `HRG/${entityCode}/${year}/${String(sequenceNumber).padStart(4, '0')}`;
  console.debug('[submitHrgaRequest] Step 1 done', { documentNo });

  // ── Step 2: Fetch approval config level 1 ────────────────────────────────
  const { data: approvalCfg, error: cfgErr } = await supabase
    .from('hrga_approval_configs')
    .select('approver_role, level')
    .eq('company_id', profile.company_id)
    .eq('request_type_id', requestTypeId)
    .eq('level', 1)
    .eq('is_active', true)
    .single();

  console.debug('[submitHrgaRequest] Step 2 approval_cfg', { approvalCfg, cfgErr });
  if (cfgErr) return { data: null, error: cfgErr };

  // ── Step 3: Fetch total levels from request type ──────────────────────────
  const { data: rtRow, error: rtErr } = await supabase
    .from('hrga_request_types')
    .select('approval_levels')
    .eq('id', requestTypeId)
    .single();

  console.debug('[submitHrgaRequest] Step 3 request_type', { rtRow, rtErr });
  if (rtErr) return { data: null, error: rtErr };

  // ── Step 4: Insert hrga_requests header ──────────────────────────────────
  const { data: requestRow, error: reqErr } = await supabase
    .from('hrga_requests')
    .insert({
      company_id:      profile.company_id,
      document_no:     documentNo,
      request_type_id: requestTypeId,
      requester_id:    profile.id,
      subject,
      description:     description || null,
      requested_date:  requestedDate || null,
      status:          'submitted',
      current_level:   1,
      total_levels:    rtRow.approval_levels,
      submitted_at:    new Date().toISOString(),
      created_by:      profile.id,
      updated_by:      profile.id,
    })
    .select('id, document_no')
    .single();

  console.debug('[submitHrgaRequest] Step 4 insert request', { requestRow, reqErr });
  if (reqErr) return { data: null, error: reqErr };

  // ── Step 5: Insert hrga_request_items ────────────────────────────────────
  if (items && items.length > 0) {
    const itemRows = items.map((item, idx) => ({
      request_id:       requestRow.id,
      line_no:          idx + 1,
      item_description: item.item_description,
      quantity:         parseFloat(item.quantity) || 1,
      unit:             item.unit || null,
      notes:            item.notes || null,
    }));

    const { error: itemsErr } = await supabase
      .from('hrga_request_items')
      .insert(itemRows);

    console.debug('[submitHrgaRequest] Step 5 insert items', { count: itemRows.length, itemsErr });
    if (itemsErr) return { data: null, error: itemsErr };
  }

  // ── Step 6: Queue notification to requester (submitted confirmation) ─────
  console.debug('[submitHrgaRequest] Step 6 notification requester', { email: profile.email });
  if (profile.email) {
    await supabase
      .from('hrga_notification_queue')
      .insert({
        company_id:        profile.company_id,
        request_id:        requestRow.id,
        recipient_id:      profile.id,
        recipient_email:   profile.email,
        notification_type: 'request_submitted',
        payload: {
          document_no: requestRow.document_no,
          subject,
          request_type_name: null, // enriched by Edge Function worker
        },
        status: 'pending',
      });
    // Non-critical — ignore error
  }

  // ── Step 7: Queue notification to level-1 approver role ─────────────────
  // Non-critical — errors here must not block the submit response.
  // Fix: .in() requires a plain array, not a query builder.
  //      Execute the role sub-query first, then pass the id array.
  console.debug('[submitHrgaRequest] Step 7 notify approvers, role=', approvalCfg.approver_role);
  try {
    const { data: roleRows } = await supabase
      .from('roles')
      .select('id')
      .eq('company_id', profile.company_id)
      .eq('code', approvalCfg.approver_role);

    const roleIds = (roleRows || []).map(r => r.id);

    if (roleIds.length > 0) {
      const { data: approverUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .in('role_id', roleIds);

      const recipientIds = (approverUsers || []).map(u => u.user_id).filter(Boolean);

      if (recipientIds.length > 0) {
        const notifications = recipientIds.map(uid => ({
          company_id:        profile.company_id,
          request_id:        requestRow.id,
          recipient_id:      uid,
          recipient_email:   '',  // Edge Function resolves email from auth.users
          notification_type: 'approval_pending',
          payload: {
            document_no:    requestRow.document_no,
            subject,
            requester_name: profile.full_name,
            level:          1,
            approver_role:  approvalCfg.approver_role,
          },
          status: 'pending',
        }));
        await supabase.from('hrga_notification_queue').insert(notifications);
      }
    }
  } catch (notifyErr) {
    // Non-critical — log but do not surface to user
    console.debug('[submitHrgaRequest] Step 7 notification error (non-critical):', notifyErr);
  }

  console.debug('[submitHrgaRequest] DONE ✅', { document_no: requestRow.document_no });
  return { data: requestRow, error: null };
}

// ─────────────────────────────────────────────────────────────
// useHrgaRequestDetail
// Fetches a single request with its line items and approval trail.
// Re-fetches when requestId changes or refreshKey increments.
// ─────────────────────────────────────────────────────────────
export function useHrgaRequestDetail(requestId) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!requestId) {
      Promise.resolve().then(() => { setData(null); setLoading(false); });
      return;
    }

    let cancelled = false;

    // hrga_requests.requester_id and hrga_request_approvals.approver_id both
    // reference auth.users(id), NOT profiles. PostgREST cannot auto-join
    // profiles via a cross-schema FK (auth → public). Fetch profiles separately
    // and merge client-side — same pattern as useUserAccess.js.
    Promise.all([
      // Header + type (no profiles join)
      supabase
        .from('hrga_requests')
        .select(
          'id, document_no, subject, description, status, current_level, total_levels, ' +
          'amount, currency_code, requested_date, submitted_at, approved_at, ' +
          'rejected_at, completed_at, created_at, requester_id, ' +
          'hrga_request_types(type_code, type_name, category_code, category_name, approval_levels)'
        )
        .eq('id', requestId)
        .is('deleted_at', null)
        .single(),

      // Line items
      supabase
        .from('hrga_request_items')
        .select('id, line_no, item_description, quantity, unit, notes')
        .eq('request_id', requestId)
        .order('line_no', { ascending: true }),

      // Approval trail (no profiles join — approver_id only)
      supabase
        .from('hrga_request_approvals')
        .select('id, level, approver_id, approver_role, action, comment, actioned_at')
        .eq('request_id', requestId)
        .order('actioned_at', { ascending: true }),

      // Approval config — role per level (needed for progress indicator labels)
      // Fetched after we have the header's request_type_id + company_id below
    ]).then(([headerRes, itemsRes, approvalsRes]) => {
      if (cancelled) return;
      if (headerRes.error) { setError(headerRes.error); setLoading(false); return; }

      const header    = headerRes.data;
      const items     = itemsRes.data     || [];
      const approvals = approvalsRes.data || [];

      if (itemsRes.error)    console.debug('[useHrgaRequestDetail] items error:', itemsRes.error);
      if (approvalsRes.error) console.debug('[useHrgaRequestDetail] approvals error:', approvalsRes.error);

      // Collect all user IDs that need a name lookup
      const userIds = [
        header.requester_id,
        ...approvals.map(a => a.approver_id),
      ].filter(Boolean);

      const uniqueIds = [...new Set(userIds)];

      // Fetch profiles + approval configs in parallel
      Promise.all([
        uniqueIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', uniqueIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from('hrga_approval_configs')
          .select('level, approver_role')
          .eq('company_id', header.company_id)
          .eq('request_type_id', header.request_type_id)
          .eq('is_active', true)
          .order('level', { ascending: true }),
      ]).then(([profilesRes, cfgRes]) => {
        if (cancelled) return;
        const nameMap = Object.fromEntries(
          (profilesRes.data || []).map(p => [p.id, p.full_name])
        );
        // level_roles: { 1: 'supervisor', 2: 'hrga', 3: 'finance' }
        const levelRoles = Object.fromEntries(
          (cfgRes.data || []).map(c => [c.level, c.approver_role])
        );
        setData({
          ...header,
          requester_name: nameMap[header.requester_id] || null,
          level_roles: levelRoles,
          items,
          approvals: approvals.map(a => ({
            ...a,
            approver_name: nameMap[a.approver_id] || null,
          })),
        });
        setError(null);
        setLoading(false);
      });
    });

    return () => { cancelled = true; };
  }, [requestId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { data, loading, error, refresh };
}

// ─────────────────────────────────────────────────────────────
// useAllHrgaRequests
// Paginated list of ALL requests in the user's company.
// For HRGA admin / super admin view — read-only.
// ─────────────────────────────────────────────────────────────
export function useAllHrgaRequests({ page = 1, search = '' } = {}) {
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * HRGA_PAGE_SIZE;
    const to   = from + HRGA_PAGE_SIZE - 1;

    let query = supabase
      .from('hrga_requests')
      .select(
        'id, document_no, subject, status, current_level, total_levels, ' +
        'submitted_at, created_at, requester_id, ' +
        'hrga_request_types(type_code, type_name, category_code, category_name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search.trim()) {
      query = query.or(
        `subject.ilike.%${search.trim()}%,document_no.ilike.%${search.trim()}%`
      );
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) { setError(err); setLoading(false); return; }

      const list = rows || [];
      setTotal(count ?? 0);

      if (list.length === 0) {
        setData([]); setError(null); setLoading(false);
        return;
      }

      // Fetch requester names in one round-trip
      const uniqueIds = [...new Set(list.map(r => r.requester_id).filter(Boolean))];
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', uniqueIds)
        .then(({ data: profiles }) => {
          if (cancelled) return;
          const nameMap = Object.fromEntries(
            (profiles || []).map(p => [p.id, p.full_name])
          );
          setData(list.map(r => ({
            ...r,
            requester_name: nameMap[r.requester_id] || null,
          })));
          setError(null);
          setLoading(false);
        });
    });

    return () => { cancelled = true; };
  }, [page, search, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { data, total, loading, error, refresh };
}

// ─────────────────────────────────────────────────────────────
// cancelHrgaRequest
// Requester cancels their own submitted request.
// Only allowed if status = 'submitted'.
// ─────────────────────────────────────────────────────────────
export async function cancelHrgaRequest(requestId) {
  const { error } = await supabase
    .from('hrga_requests')
    .update({
      status:       'cancelled',
      updated_by:   (await supabase.auth.getUser()).data?.user?.id,
    })
    .eq('id', requestId)
    .eq('status', 'submitted'); // guard: only cancel if still submitted

  return { error };
}

// ─────────────────────────────────────────────────────────────
// useHrgaStats
// Counts of the current user's requests by status.
// Returns { total, pending, approved, rejected, loading }
// ─────────────────────────────────────────────────────────────
export function useHrgaStats() {
  const [stats, setStats]   = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from('hrga_requests')
      .select('status')
      .is('deleted_at', null)
      .then(({ data: rows }) => {
        if (cancelled || !rows) return;
        const total    = rows.length;
        const pending  = rows.filter(r => r.status === 'submitted' || r.status === 'in_progress').length;
        const approved = rows.filter(r => r.status === 'approved' || r.status === 'completed').length;
        const rejected = rows.filter(r => r.status === 'rejected').length;
        setStats({ total, pending, approved, rejected });
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { ...stats, loading, refresh };
}

// ─────────────────────────────────────────────────────────────
// usePendingApprovals
// Paginated list of requests currently awaiting approval
// (status = submitted or in_progress), scoped by company RLS.
// Used by the Pending Approval page — approvers see requests
// in their queue.
// ─────────────────────────────────────────────────────────────
export function usePendingApprovals({ page = 1, search = '' } = {}) {
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * HRGA_PAGE_SIZE;
    const to   = from + HRGA_PAGE_SIZE - 1;

    let query = supabase
      .from('hrga_requests')
      .select(
        'id, document_no, subject, status, current_level, total_levels, ' +
        'amount, requested_date, submitted_at, requester_id, ' +
        'hrga_request_types(type_code, type_name, category_code, category_name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .in('status', ['submitted', 'in_progress'])
      .order('requested_date', { ascending: true })
      .range(from, to);

    if (search.trim()) {
      query = query.or(
        `subject.ilike.%${search.trim()}%,document_no.ilike.%${search.trim()}%`
      );
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) { setError(err); setLoading(false); return; }

      const list = rows || [];
      setTotal(count ?? 0);
      if (list.length === 0) { setData([]); setError(null); setLoading(false); return; }

      const uniqueIds = [...new Set(list.map(r => r.requester_id).filter(Boolean))];
      supabase.from('profiles').select('id, full_name').in('id', uniqueIds)
        .then(({ data: profiles }) => {
          if (cancelled) return;
          const nameMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));
          setData(list.map(r => ({ ...r, requester_name: nameMap[r.requester_id] || null })));
          setError(null);
          setLoading(false);
        });
    });

    return () => { cancelled = true; };
  }, [page, search, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { data, total, loading, error, refresh };
}

// ─────────────────────────────────────────────────────────────
// submitApproval
// Inserts an approval record and updates the request status.
// action: 'approved' | 'rejected'
// ─────────────────────────────────────────────────────────────
export async function submitApproval({ requestId, action, comment, profile }) {
  if (!requestId || !profile?.id) return { error: { message: 'Parameter tidak valid.' } };

  // Fetch current request state
  const { data: req, error: reqErr } = await supabase
    .from('hrga_requests')
    .select('id, status, current_level, total_levels, company_id, request_type_id')
    .eq('id', requestId)
    .single();

  if (reqErr) return { error: reqErr };
  if (!['submitted','in_progress'].includes(req.status)) {
    return { error: { message: 'Request sudah tidak bisa di-approve/reject.' } };
  }

  // Insert approval record
  const { error: approvalErr } = await supabase
    .from('hrga_request_approvals')
    .insert({
      request_id:    requestId,
      level:         req.current_level,
      approver_id:   profile.id,
      approver_role: null, // role enriched by trigger if needed
      action,
      comment:       comment || null,
      actioned_at:   new Date().toISOString(),
    });

  if (approvalErr) return { error: approvalErr };

  // Determine new status
  let newStatus;
  if (action === 'rejected') {
    newStatus = 'rejected';
  } else if (req.current_level >= req.total_levels) {
    newStatus = 'approved';
  } else {
    newStatus = 'in_progress';
  }

  const updatePayload = {
    status:     newStatus,
    updated_by: profile.id,
    ...(newStatus === 'approved' ? { approved_at: new Date().toISOString() } : {}),
    ...(newStatus === 'rejected' ? { rejected_at: new Date().toISOString() } : {}),
    ...(newStatus === 'in_progress' ? { current_level: req.current_level + 1 } : {}),
  };

  const { error: updateErr } = await supabase
    .from('hrga_requests')
    .update(updatePayload)
    .eq('id', requestId);

  return { error: updateErr || null };
}

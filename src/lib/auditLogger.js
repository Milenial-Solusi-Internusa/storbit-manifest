// src/lib/auditLogger.js
// Audit logging helper. Inserts a row into `audit_logs` for important business
// events (19 mandatory events per AGENTS.md / security-baseline).
//
// Usage (call AFTER the main DB operation succeeds):
//   import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
//   logAudit(supabase, {
//     action: ACTION_TYPES.CREATE_INQUIRY,
//     entityType: ENTITY_TYPES.INQUIRY,
//     entityId: row?.id ?? null,
//     entityLabel: inquiry_no,
//     notes: '…',
//   }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
//
// Contract:
//   - Fire-and-forget: never throws (try/catch inside). A failed audit insert
//     must NOT block or break the main operation. Returns a promise (await
//     optional — only await where the caller must stay authenticated, e.g. logout).
//   - ip_address: always null (cannot get the real client IP reliably from FE).
//   - user_agent: navigator.userAgent.
//   - audit_logs RLS: insert = any authenticated; read = is_admin_or_above().

export const ACTION_TYPES = {
  LOGIN:               'LOGIN',
  LOGOUT:              'LOGOUT',
  CREATE_PROSPECT:     'CREATE_PROSPECT',
  UPDATE_PROSPECT:     'UPDATE_PROSPECT',
  DELETE_PROSPECT:     'DELETE_PROSPECT',
  CREATE_INQUIRY:      'CREATE_INQUIRY',
  UPDATE_INQUIRY:      'UPDATE_INQUIRY',
  DELETE_INQUIRY:      'DELETE_INQUIRY',
  CREATE_QUOTATION:    'CREATE_QUOTATION',
  UPDATE_QUOTATION:    'UPDATE_QUOTATION',
  DELETE_QUOTATION:    'DELETE_QUOTATION',
  APPROVE_QUOTATION:   'APPROVE_QUOTATION',
  REJECT_QUOTATION:    'REJECT_QUOTATION',
  CREATE_ACTIVITY:     'CREATE_ACTIVITY',
  UPDATE_ACTIVITY:     'UPDATE_ACTIVITY',
  DELETE_ACTIVITY:     'DELETE_ACTIVITY',
  CONVERT_LEAD:        'CONVERT_LEAD',
  CHANGE_PIPELINE_STAGE: 'CHANGE_PIPELINE_STAGE',
  CREATE_USER:         'CREATE_USER',
  UPDATE_USER:         'UPDATE_USER',
  DEACTIVATE_USER:     'DEACTIVATE_USER',
  CHANGE_ROLE:         'CHANGE_ROLE',
  CREATE_ASSET:        'CREATE_ASSET',
  CREATE_MOM:          'CREATE_MOM',
  UPDATE_MOM:          'UPDATE_MOM',
  DELETE_MOM:          'DELETE_MOM',
};

export const ENTITY_TYPES = {
  PROSPECT:  'PROSPECT',
  INQUIRY:   'INQUIRY',
  QUOTATION: 'QUOTATION',
  ACTIVITY:  'ACTIVITY',
  USER:      'USER',
  LEAD:      'LEAD',
  DEAL:      'DEAL',
  ASSET:     'ASSET',
  MOM:       'MOM',
};

/**
 * Insert one audit_logs row. Never throws.
 * @param supabase  the shared supabase client
 * @param payload   { action, entityType, entityId, entityLabel, oldData, newData, notes }
 * @param user      { id, email, role, companyId } (from useAuth)
 */
export async function logAudit(supabase, payload = {}, user = {}) {
  try {
    if (!supabase || !payload.action) return;
    const {
      action,
      entityType = null,
      entityId = null,
      entityLabel = null,
      oldData = null,
      newData = null,
      notes = null,
    } = payload;

    const { error } = await supabase.from('audit_logs').insert({
      user_id:     user?.id ?? null,
      user_email:  user?.email ?? null,
      user_role:   user?.role ?? null,
      company_id:  user?.companyId ?? null,
      action,
      entity_type: entityType,
      entity_id:   entityId,
      entity_label: entityLabel,
      old_data:    oldData,
      new_data:    newData,
      ip_address:  null,
      user_agent:  (typeof navigator !== 'undefined' ? navigator.userAgent : null),
      notes,
    });
    if (error) console.error('[audit] insert failed:', error.message);
  } catch (e) {
    console.error('[audit] unexpected error:', e?.message || e);
  }
}

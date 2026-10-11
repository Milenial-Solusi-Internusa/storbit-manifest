// src/modules/crm/lead/lib/leadActivity.js
// Logika murni (nol JSX) untuk tab Activity dan Notes LeadDetailPage -- KEDUA
// tab membaca/menulis tabel `activities` YANG SUDAH ADA (account_id, type,
// status, notes, created_by, completed_at), bukan tabel baru. Instruksi
// eksplisit: "Tab Notes memakai pola catatan aktivitas yang sudah ada (Add
// Note), JANGAN tabel baru" -- satu mekanisme tulis dipakai KEDUA tab, beda
// hanya pada FILTER baca (Notes = type 'note' saja, Activity = semua type).
//
// `type` kolom accounts TANPA CHECK constraint (bebas teks) -- 'note' aman
// ditambahkan sebagai nilai baru, sejalan dengan nilai yang sudah dipakai
// ActivitiesPage.jsx (call/visit/meeting/whatsapp/email/followup, lihat
// activityFeed.js FEED_ACT_LABEL).
import { supabase } from '../../../../lib/supabase';

export const ACTIVITY_TYPE_LABEL = {
  note: 'Note', call: 'Call', whatsapp: 'WhatsApp', visit: 'Visit',
  meeting: 'Meeting', email: 'Email', followup: 'Follow-up',
};

/** Seluruh activities untuk satu akun, terbaru dulu. `created_by`/`assigned_to`
 *  TANPA FK bernama (diverifikasi schema_snapshot.sql: activities punya FK
 *  account/company/contact/inquiry/quotation, TIDAK ke profiles) -- embed
 *  PostgREST tak bisa dipakai, nama pembuat diselesaikan pemanggil lewat peta
 *  profiles terpisah (sama seperti yang sudah dimuat untuk Owner select). */
export async function listLeadActivities(accountId) {
  return supabase
    .from('activities')
    .select('id, type, status, notes, outcome, next_action, scheduled_for, activity_time, completed_at, created_at, created_by')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
}

/** "Add Note" -- satu baris activities, type='note', selesai seketika (bukan
 *  tugas terjadwal). Dipakai Activity tab DAN Notes tab, sumber yang sama. */
export async function addLeadNote({ accountId, companyId, userId, text }) {
  const now = new Date().toISOString();
  return supabase.from('activities').insert({
    account_id: accountId, company_id: companyId, type: 'note', status: 'done',
    notes: text, created_by: userId, completed_at: now,
  });
}

/** "Schedule Follow Up" -- activities type='followup', status 'todo', tanggal
 *  wajib. Jalur terjadwal yang sama dengan ActivitiesPage.jsx. */
export async function scheduleLeadFollowUp({ accountId, companyId, userId, assignedTo, date, time, notes }) {
  return supabase.from('activities').insert({
    account_id: accountId, company_id: companyId, type: 'followup', status: 'todo',
    scheduled_for: date, activity_time: time || null, notes: notes || null,
    assigned_to: assignedTo || userId, created_by: userId,
  });
}

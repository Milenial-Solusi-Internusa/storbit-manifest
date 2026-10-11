// src/modules/crm/lead/lib/leadStatus.js
// Status layar Lead Management (Raw/Qualified/Converted/Customer/Lost) --
// turunan dari accounts.lifecycle_stage + accounts.qualified_at, BUKAN satu
// kolom. Pemetaan FINAL disetujui Den (menggantikan draft awal yang memakai
// converted_to -- kolom itu kosong di semua akun, dikonfirmasi):
//
//   Raw       <- lifecycle_stage IN ('lead','mql') AND qualified_at IS NULL
//   Qualified <- lifecycle_stage IN ('lead','mql') AND qualified_at IS NOT NULL
//   Converted <- lifecycle_stage IN ('prospect','sql')
//   Customer  <- lifecycle_stage = 'customer'
//   Lost      <- lifecycle_stage = 'lost'
//   (lifecycle_stage = 'free_agent' TIDAK masuk sini -- tabel Free Agent
//    Customers tersendiri, LeadAssignmentPage, Paket 2 -- belum ada di irisan
//    ini sama sekali)
//
// Satu sumber dipakai BERSAMA oleh LeadCapturePage (kolom + filter Status) dan
// nanti LeadDetailPage/LeadQualificationPage (irisan 5+) supaya definisi
// "status apa" tidak bisa melenceng antar halaman.

export const LEAD_STATUSES = ['raw', 'qualified', 'converted', 'customer', 'lost'];

// Tone HARUS salah satu key SEMANTIC (ok/warn/danger/info/neutral) atau TONE
// (slate/orange/navy/brick) dari src/kit/tokens.js -- toneOf() jatuh ke
// 'slate' diam-diam untuk key lain, jadi dicocokkan eksplisit di sini.
export const LEAD_STATUS_META = {
  raw:       { label: 'Raw',       tone: 'slate'  },
  qualified: { label: 'Qualified', tone: 'info'   },
  converted: { label: 'Converted', tone: 'navy'   },
  customer:  { label: 'Customer',  tone: 'ok'     },
  lost:      { label: 'Lost',      tone: 'danger' },
};

/** Turunkan status 5-nilai dari satu baris `accounts` (butuh lifecycle_stage
 *  + qualified_at di-select). `null` untuk free_agent/nilai tak dikenal --
 *  pemanggil memutuskan sendiri cara menampilkannya (tidak seharusnya terjadi
 *  di LeadCapturePage karena query sudah mengecualikan free_agent). */
export function deriveLeadStatus(account) {
  const stage = account?.lifecycle_stage;
  if (stage === 'lost') return 'lost';
  if (stage === 'customer') return 'customer';
  if (stage === 'prospect' || stage === 'sql') return 'converted';
  if (stage === 'lead' || stage === 'mql') return account?.qualified_at ? 'qualified' : 'raw';
  return null;
}

/** Terapkan filter Status (salah satu LEAD_STATUSES) ke query Supabase yang
 *  sudah di-`.from('accounts')`. Dipanggil HANYA kalau status !== 'all'. */
export function applyLeadStatusFilter(query, status) {
  switch (status) {
    case 'raw':
      return query.in('lifecycle_stage', ['lead', 'mql']).is('qualified_at', null);
    case 'qualified':
      return query.in('lifecycle_stage', ['lead', 'mql']).not('qualified_at', 'is', null);
    case 'converted':
      return query.in('lifecycle_stage', ['prospect', 'sql']);
    case 'customer':
      return query.eq('lifecycle_stage', 'customer');
    case 'lost':
      return query.eq('lifecycle_stage', 'lost');
    default:
      return query;
  }
}

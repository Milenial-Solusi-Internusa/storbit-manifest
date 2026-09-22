// src/routes/crmTabs.js
// Definisi tab dalam-menu CRM. Dipisah dari App.jsx karena eslint
// (react-refresh/only-export-components) benar: file komponen tidak boleh
// mengekspor konstanta bersama — dan sejak G3 satu-satunya pembacanya adalah
// file rute CRM, bukan App.jsx.
//
// `activeMenu` tetap menjadi id tab-nya sendiri (bukan id kontainer), jadi
// setiap tab punya path sendiri dan tab bar hanya menampilkan yang lolos gate.

/** Tab di menu "Account": Prospects / Lead Pool. Pipeline & Approval Lead Pool
 *  SENGAJA di luar (ditarik jadi menu top-level, batch restrukturisasi CRM #2,
 *  26 Jul 2026). */
export const ACCOUNT_TABS = [
  { id: 'crm-prospects', label: 'Prospects' },
  { id: 'crm-lead-pool', label: 'Lead Pool' },
];

/** Tab di menu "Aktivitas". `riwayat-visit` mempertahankan content-gate
 *  canRenderPage-nya sendiri (lihat Gated di crm.routes.jsx). */
export const ACTIVITY_TABS = [
  { id: 'crm-calls',        label: 'Jadwal & Tugas' },
  { id: 'crm-activity-log', label: 'Log Aktivitas'  },
  { id: 'riwayat-visit',    label: 'Riwayat Visit'  },
];

// src/lib/dateUtils.js
// Util tanggal bersama. Satu sumber supaya "hari ini" tidak dihitung
// beda-beda per file (dulu ada 8 helper lokal dengan bug yang sama).

// Tanggal HARI INI dalam WIB (Asia/Jakarta), format YYYY-MM-DD.
// JANGAN pakai new Date().toISOString().slice(0,10) — itu UTC, dan antara
// 00:00-06:59 WIB akan mengembalikan tanggal KEMARIN. Bug ini pernah
// terjadi nyata (SP no. 1232, 26 Agustus 2026).
//
// Locale 'en-CA' dipilih karena formatnya memang YYYY-MM-DD — persis yang
// dibutuhkan <input type="date"> dan kolom `date` Postgres. Zona di-pin ke
// Asia/Jakarta (bukan sekadar "waktu lokal mesin") supaya hasilnya tetap
// benar walau jam laptop user ter-set WITA/WIT atau zona luar negeri —
// sejalan dengan sisi DB yang sudah memakai AT TIME ZONE 'Asia/Jakarta'.
export const getTodayWIB = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

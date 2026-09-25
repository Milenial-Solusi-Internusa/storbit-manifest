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

// Waktu relatif ringkas untuk lini masa ("baru saja", "3 jam lalu", "12 Sep").
// MURNI TAMPILAN — tidak dipakai perhitungan apa pun yang dikirim ke server.
//
// Di atas 7 hari ia berhenti menghitung dan menampilkan TANGGAL, karena
// "47 hari lalu" tidak lebih berguna daripada tanggalnya sendiri dan justru
// menyembunyikan informasi yang bisa dicocokkan dengan dokumen fisik.
// Tanggalnya diformat di zona Asia/Jakarta, sejalan dengan getTodayWIB.
export function fmtRelativeWIB(iso) {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso);
  const detik = Math.floor((Date.now() - t.getTime()) / 1000);
  if (detik < 0)     return 'baru saja';
  if (detik < 60)    return 'baru saja';
  if (detik < 3600)  return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  const hari = Math.floor(detik / 86400);
  if (hari <= 7)     return `${hari} hari lalu`;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
  }).format(t);
}

// Tanggal + jam WIB lengkap — dipakai sebagai `title` di samping waktu relatif,
// supaya nilai persisnya tetap bisa dibaca tanpa membuka data mentah.
export function fmtDateTimeWIB(iso) {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(t) + ' WIB';
}

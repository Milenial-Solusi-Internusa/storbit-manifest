// src/lib/numberFormat.js
// Parse + format angka berformat Indonesia (id-ID) untuk INPUT uang.
//
// KENAPA ADA: kolom uang di form SP dulu memakai <input type="number">, yang
// TIDAK bisa menerima pemisah ribuan id-ID. Ongkir "1.766.050,00" yang diketik
// atau di-paste dari SP fisik terbaca sebagai 1,766 (titik dikira titik
// desimal), lalu dibulatkan kolom numeric(18,2) jadi 1.77 — nilai tersimpan
// 1.000.000x lebih kecil, TANPA error apa pun. Empat baris produksi lahir
// dengan pola ini (1.01 / 1.01 / 1.16 / 1.77 — keempatnya persis empat digit
// pertama nominal "1.xxx.xxx").
//
// Aturan id-ID yang dipakai: titik = pemisah RIBUAN, koma = pemisah DESIMAL.
//
// Helper ini MURNI (nol React, nol dependency) — polanya mengikuti
// dateUtils.js / taxConstants.js. Jangan tambahkan hook/komponen di sini.

/**
 * Parse teks berformat Indonesia menjadi angka.
 *
 * Contoh:
 *   '1.766.050'    → 1766050
 *   '1.766.050,00' → 1766050
 *   '1766050'      → 1766050
 *   '1.766'        → 1766      (titik = ribuan, BUKAN desimal)
 *   '50.000,5'     → 50000.5
 *   '1,766,050'    → NaN       (format en-US — lihat catatan koma di bawah)
 *   '1,77'         → 1.77
 *
 * Mengembalikan NaN (BUKAN 0) untuk teks yang tidak dikenali, supaya pemanggil
 * bisa membedakan "kosong/salah" dari "nol yang disengaja" dan memberi tahu
 * user. Jangan diubah jadi 0 di sini.
 *
 * @param {string|number|null|undefined} input
 * @returns {number} angka, atau NaN bila tak dikenali
 */
export function parseIdNumber(input) {
  if (input === null || input === undefined) return NaN;
  let s = String(input).trim();
  if (s === '') return NaN;

  // Tanda hanya sah di paling depan.
  let sign = 1;
  if (s[0] === '-')      { sign = -1; s = s.slice(1); }
  else if (s[0] === '+') {            s = s.slice(1); }

  // Pemanis yang lazim ikut saat copy dari PDF/Excel: prefiks "Rp" dan spasi
  // (termasuk NBSP U+00A0 / narrow NBSP U+202F yang dipakai pemisah ribuan
  // sebagian aplikasi).
  s = s.replace(/^rp\.?/i, '').replace(/[\s\u00A0\u202F]/g, '');
  if (s === '') return NaN;

  // Karakter di luar digit/titik/koma = DITOLAK, sengaja tidak dibuang diam-diam:
  // '1.766abc' harus terbaca "tidak dikenali", bukan 1766.
  if (!/^[0-9.,]+$/.test(s)) return NaN;

  // LEBIH DARI SATU KOMA = tolak (keputusan Den). Tanpa aturan ini '1,766,050'
  // (format en-US) akan terbaca 1766.05 — salah 1.000.000x dan ke arah yang
  // sama dengan bug yang sedang ditutup helper ini.
  const commaCount = (s.match(/,/g) || []).length;
  if (commaCount > 1) return NaN;

  let intPart = s;
  let decPart = '';
  if (commaCount === 1) {
    const i = s.indexOf(',');
    intPart = s.slice(0, i);
    decPart = s.slice(i + 1);
    // Setelah koma desimal hanya boleh digit. '1,766.050' (koma sbg ribuan
    // ala en-US) karena itu ditolak, bukan ditafsir.
    if (!/^[0-9]+$/.test(decPart)) return NaN;
  }

  // Titik di bagian bulat = pemisah ribuan → dibuang. Pengelompokannya SENGAJA
  // tidak divalidasi ketat (spec '1.766' → 1766 sendiri tidak menuntut itu);
  // yang dijaga adalah titik tidak pernah dibaca sebagai desimal.
  intPart = intPart.replace(/\./g, '');
  if (!/^[0-9]+$/.test(intPart)) return NaN;

  const n = Number(decPart === '' ? intPart : `${intPart}.${decPart}`);
  return Number.isFinite(n) ? sign * n : NaN;
}

/**
 * Format angka jadi teks id-ID untuk DITAMPILKAN di dalam input — tanpa
 * prefiks "Rp" (prefiks itu elemen <span> terpisah di form-form SP).
 *
 * 1766050 → '1.766.050' · 50000.5 → '50.000,5' · 0 → '0'
 * null/NaN/'' → '' (biar field bisa tampil kosong, bukan "NaN").
 *
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatIdNumber(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/**
 * Format rupiah untuk DITAMPILKAN, dengan desimal DIBATASI 2.
 *
 * ⚠️ SENGAJA BERBEDA dari `rp()` lokal di `spDetailTokens.js` / `InvoicePDF.jsx`,
 * dan `rp()` JANGAN diubah: ia dipakai puluhan permukaan dan seluruh angka di
 * sana rupiah bulat. Yang butuh helper ini hanya nilai yang memang PECAHAN --
 * praktisnya baris **DPP (Nilai Lain)**, yaitu (Subtotal + Shipping) x 11/12.
 *
 * Kenapa perlu: `toLocaleString('id-ID')` tanpa opsi memakai
 * `maximumFractionDigits` default **3**, sehingga DPP Nilai Lain pernah tercetak
 * `Rp 17.856.668,289` di invoice produksi. Dua desimal = satuan sen, batas yang
 * wajar untuk nilai uang.
 *
 * Dipakai DUA tempat yang wajib bergerak bersama (kelas checklist TD-233):
 * ringkasan layar `finance/InvoiceDetailPage.jsx` dan blok totals
 * `logistics/InvoicePDF.jsx` -- layar dan PDF harus menampilkan angka identik.
 *
 * @param {number|string|null|undefined} n
 * @returns {string} mis. 'Rp 5.270.833,33' · bulat tetap tanpa desimal ('Rp 0')
 */
export function formatRp2(n) {
  // Nilai tak terbaca jatuh ke 0, PERSIS seperti `rp()` lokal (`Number(n) || 0`)
  // -- tanpa ini null/'' menghasilkan 'Rp ' menggantung di layar maupun PDF.
  const num = Number(n);
  return 'Rp ' + formatIdNumber(Number.isFinite(num) ? num : 0);
}

/**
 * Baca isi input uang → nilai kanonik + penanda "tidak dikenali".
 *
 * Satu tempat untuk kebijakan NaN, supaya keempat input uang SP tidak
 * menyalin aturannya masing-masing:
 *   - teks kosong          → { value: 0, unrecognized: false }  (sah, field boleh kosong)
 *   - teks tak terbaca     → { value: 0, unrecognized: true  }  (teks DIBIARKAN di field
 *                                                               oleh pemanggil + pesan inline)
 *   - teks terbaca         → { value: <angka>, unrecognized: false }
 *
 * `value` 0 pada kasus tak terbaca DISENGAJA: ia tak pernah memblokir simpan,
 * jadi yang mencegah salah simpan adalah pesan inline-nya, bukan exception.
 *
 * @param {string} text isi mentah field
 * @returns {{ value: number, unrecognized: boolean }}
 */
export function readMoneyInput(text) {
  const n = parseIdNumber(text);
  if (Number.isFinite(n)) return { value: n, unrecognized: false };
  return { value: 0, unrecognized: String(text ?? '').trim() !== '' };
}

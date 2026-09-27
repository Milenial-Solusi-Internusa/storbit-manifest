#!/usr/bin/env node
/* scripts/qa/cek-sidik-parity.mjs -- penjaga angka harapan berkas parity.
 *
 * ATURANNYA SATU: setiap sidik jari md5 yang dipakai sebagai HARAPAN di berkas
 * parity atau migrasi retroaktif harus berupa angka yang DIUKUR dari production,
 * yaitu ada di scripts/qa/parity/inventaris-production-20260927.json.
 *
 * -- KENAPA PENJAGA INI ADA ---------------------------------------------------
 * 28 September 2026: ENAM konstanta sidik jari di berkas parity salah
 * seluruhnya. Rumusnya benar, badan fungsinya benar, atributnya benar -- yang
 * salah cuma satu anggapan: bahwa prosecdef::text menghasilkan 't'. Ia
 * menghasilkan 'true'. Karena angkanya dihitung di luar SQL, tidak ada satu pun
 * langkah yang bisa menangkapnya sampai blok V berbunyi atas keadaan yang
 * sebenarnya SUDAH BENAR -- dan pesan gagalnya bahkan mencetak sidik jari
 * production sendiri sebagai "yang salah".
 *
 * ** Sidik jari hasil hitungan sendiri tampak sama meyakinkannya dengan sidik
 *    jari hasil ukur. Perbedaannya tidak terlihat dari bentuknya, jadi ia harus
 *    dijaga dari asalnya. **
 *
 * Penjaga ini SENGAJA tidak menyentuh database: ia membandingkan berkas dengan
 * berkas. Ia bisa dijalankan siapa pun, kapan pun, tanpa kredensial.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUJUKAN = 'scripts/qa/parity/inventaris-production-20260927.json';

// Berkas yang angka harapannya dijaga. Migrasi retroaktif IKUT: ia menyamakan
// staging ke production, jadi harapannya harus angka production juga.
const DIJAGA = [
  ...readdirSync(join(AKAR, 'scripts/qa/parity'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => `scripts/qa/parity/${f}`),
  'supabase/migrations/20260918000001_set_sql_on_quotation_sent.sql',
  'supabase/migrations/20260927000002_get_table_columns_revoke_anon.sql',
  'supabase/migrations/20260927000003_hak_anon_catchup.sql',
];

const inv = JSON.parse(readFileSync(join(AKAR, RUJUKAN), 'utf8'));

/* Seluruh sidik jari yang diukur, apa pun kategorinya: berkas parity boleh
 * berharap pada sidik fungsi, policy, trigger, kolom, maupun hak. Menyaring
 * per kategori di sini akan menolak harapan yang sah. */
const DIUKUR = new Set();
for (const kat of ['fungsi', 'policy', 'trigger', 'kolom', 'hak']) {
  for (const [, sidik] of inv[kat] ?? []) DIUKUR.add(sidik);
}

/* md5(prosrc) SAJA bukan angka ukur -- INVENTARIS_SQL tidak pernah
 * menghasilkannya. Ia tetap boleh dipakai sebagai pemeriksaan TAMBAHAN (ia
 * menunjukkan badan mana yang beda, yang sidik penuh tidak bisa), jadi ia
 * didaftar di sini sebagai pengecualian yang DISEBUT, bukan celah. Setiap
 * entri wajib punya alasan; yang tanpa alasan akan ditolak. */
const DIIZINKAN_BUKAN_UKUR = new Map([
  ['6f28f42a8b597ec35eac6df37356285a', 'md5(prosrc) set_sql_on_quotation_sent -- dibaca dari production 27 Sep, pelengkap sidik penuh'],
  ['384132b93cf287b82c5d9d4ba2a61489', 'md5(prosrc) is_sp_item_writer -- dibaca dari production 27 Sep'],
  ['d8f2a428ac396512ef5056fbe4c5936f', 'md5(prosrc) delete_sp_item_dual -- dibaca dari production 27 Sep'],
  ['e37ee35b051b7bdd9a88184ebfb267e4', 'md5(prosrc) prf_mark_quoted -- dibaca dari production 27 Sep'],
  // !! SATU-SATUNYA entri yang BELUM bisa dibuktikan ulang dari repo: badan
  //    get_table_columns tidak tersalin ke berkas mana pun (berkas 20260927000002
  //    sengaja hanya menyentuh ACL-nya), jadi angka ini tidak bisa dihitung ulang
  //    di sini untuk dibandingkan. Ia dipercaya sebagai bacaan 27 Sep, dan
  //    disebut apa adanya supaya kepercayaan itu terlihat, bukan tersembunyi.
  //    Diselesaikan dengan MENGUKUR: --sql-fungsi get_table_columns di kedua DB.
  ['13acef68d392d5ed1a42bc716180794b', 'md5(prosrc) get_table_columns -- BELUM diverifikasi ulang, lihat catatan'],
]);

const HEX32 = /\b[0-9a-f]{32}\b/g;
let gagal = 0, diperiksa = 0;

for (const berkas of DIJAGA) {
  const jalur = join(AKAR, berkas);
  if (!existsSync(jalur)) { console.log(`  (lewat, tidak ada) ${berkas}`); continue; }
  const baris = readFileSync(jalur, 'utf8').split('\n');
  baris.forEach((t, i) => {
    // Komentar dilewati: di sanalah angka LAMA yang salah sengaja dicatat
    // sebagai jejak, dan menolaknya akan memaksa jejak itu dihapus.
    if (/^\s*--/.test(t)) return;
    for (const h of t.match(HEX32) ?? []) {
      diperiksa++;
      if (DIUKUR.has(h)) continue;
      if (DIIZINKAN_BUKAN_UKUR.has(h)) continue;
      gagal++;
      console.log(`GAGAL ${berkas}:${i + 1}`);
      console.log(`  ${h} bukan angka ukur.`);
      console.log(`  Ia tidak ada di ${RUJUKAN} dan tidak terdaftar sebagai pengecualian.`);
      console.log(`  Kalau ini md5 badan, daftarkan beserta alasannya. Kalau ini sidik`);
      console.log(`  penuh, JANGAN dihitung sendiri -- baca dari production:`);
      console.log(`    node scripts/qa/env-drift-check.mjs --sql-fungsi <nama>`);
      console.log(`  lalu pakai kolom sidik_penuh.`);
    }
  });
}

/* Daftar pengecualian dicetak SETIAP kali, bukan hanya saat gagal. Daftar
 * pengecualian yang tidak pernah terlihat akan tumbuh sampai ia menjadi
 * aturannya sendiri. */
console.log(`\n${DIIZINKAN_BUKAN_UKUR.size} pengecualian terdaftar (bukan angka ukur, ada alasannya):`);
for (const [h, sebab] of DIIZINKAN_BUKAN_UKUR) console.log(`  ${h}  ${sebab}`);

console.log(`\n--- cek-sidik-parity: ${diperiksa} angka diperiksa, ${gagal} bukan angka ukur ---`);
process.exit(gagal === 0 ? 0 : 1);

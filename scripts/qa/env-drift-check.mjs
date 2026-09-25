#!/usr/bin/env node
// scripts/qa/env-drift-check.mjs
// Membandingkan SKEMA staging vs production. 100% BACA di kedua sisi.
//
// ── KENAPA ADA ──────────────────────────────────────────────────────────────
// Pada 25 Sep 2026 uji manual AR Tahap 2 gagal karena LIMA policy RLS di staging
// masih home-company-only, sementara produksi sudah punya varian jamak sejak
// 2-11 September. Tidak ada satu pun alat yang bisa memberi tahu itu: header
// migrasi hanya mengaku status yang ditulis tangan, dan schema_snapshot.sql cuma
// memotret PRODUKSI. Perbedaan arah-terbalik seperti itu (produksi lebih maju
// dari staging) hanya bisa dilihat dengan MEMBANDINGKAN keduanya.
//
// ── YANG DIBANDINGKAN ───────────────────────────────────────────────────────
//   fungsi   proname(args)      -> md5(prosrc) + prosecdef + volatile + proconfig
//   policy   tabel.policy.cmd   -> md5(qual | with_check | roles)
//   trigger  tabel.trigger      -> md5(pg_get_triggerdef)
//   kolom    tabel              -> md5 atas SELURUH daftar kolomnya
//                                 (nama|tipe|nullable|default, urut nama)
//
// Hasilnya dikelompokkan: HANYA DI STAGING, HANYA DI PRODUCTION, BEDA ISI.
//
// ── TIGA KELAS PERBEDAAN ────────────────────────────────────────────────────
//   ANTRE      sudah di staging, MENUNGGU hari launching. Dicetak beserta
//              NOMOR BUTIR doc 12-nya -- tidak disembunyikan, dan tidak
//              dihitung sebagai drift tanpa penjelasan. Ia HARUS tetap
//              terlihat sampai benar-benar naik ke produksi; menyembunyikannya
//              berarti kehilangan satu-satunya daftar yang mengatakan apa yang
//              masih menggantung.
//   SELAMANYA  memang sengaja berbeda dan tidak akan pernah disamakan
//              (mis. notify_sp_milestone no-op, fungsi bantu seed).
//   DRIFT      tidak ada penjelasannya. Ini yang ditindaklanjuti, dan
//              satu-satunya yang membuat exit code != 0.
//
// ── YANG TIDAK DILIHAT ALAT INI (batas, bukan jaminan) ──────────────────────
//   index, constraint, sequence, extension, hak tabel/kolom (relacl/attacl),
//   dan ISI DATA. Contoh nyata: 20260925000002 hanya membuat index unik
//   parsial, jadi ia TIDAK akan pernah muncul di sini -- bukan karena ia sudah
//   sama, melainkan karena index tidak dibandingkan. Untuk kelas itu, doc 12
//   yang jadi daftarnya, bukan skrip ini.
//
// ── DUA FASE, DAN ITU DISENGAJA ─────────────────────────────────────────────
// Kolom dibandingkan PER TABEL, bukan per kolom: satu md5 atas seluruh daftar
// kolom tabel itu. Alasannya dua. (1) Ukuran: public punya ~2.400 kolom, dan
// mengangkut keduanya cuma untuk menyimpulkan "sama" membuang bandwidth yang
// sama besarnya setiap kali skrip ini jalan. (2) Kejelasan: "tabel X beda" lebih
// bisa ditindaklanjuti daripada dua belas baris kolom yang harus dibaca satu-satu.
// Begitu sebuah tabel dilaporkan beda, drill-down-nya:
//   node scripts/qa/env-drift-check.mjs --sql-kolom <tabel>
// lalu jalankan SQL-nya di KEDUA DB dan bandingkan.
//
// ── CARA JALAN ──────────────────────────────────────────────────────────────
//   STG_DB_URL='postgresql://...oovmlhilhqzejnawqkvt...' \
//   PRD_DB_URL='postgresql://...untmpqceexwxzuhlmyrg...' \
//   node scripts/qa/env-drift-check.mjs
//
//   node scripts/qa/env-drift-check.mjs --from-json stg.json prd.json
//     Membandingkan dua inventaris yang sudah diambil sebelumnya (bentuknya =
//     keluaran SQL di INVENTARIS_SQL). Dipakai kalau psql/kredensial tidak ada
//     di tangan pemanggil; logika pembandingnya PERSIS sama.
//
//   --sql   mencetak SQL inventarisnya lalu keluar (untuk ditempel manual).
//
// ⚠️ Nol kredensial di berkas ini. Keduanya dibaca dari environment.
// ⚠️ Read-only: satu-satunya SQL yang dikirim adalah SELECT atas katalog sistem.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ── Perbedaan yang MEMANG DISENGAJA ─────────────────────────────────────────
// Tiap entri WAJIB punya alasan yang bisa dibaca orang lain. Yang tidak ada di
// sini dilaporkan sebagai DRIFT -- termasuk yang "kelihatannya wajar", karena
// justru itu yang membuat lima policy tadi lolos berminggu-minggu.
//
// ⛔ Jangan menambahkan entri untuk membungkam temuan. Entri hanya sah kalau
// perbedaannya keputusan tertulis (doc 12) atau konsekuensi yang dicatat.
const DIKETAHUI = [
  {
    kelas: 'selamanya',
    cocok: (kat, kunci) => kat === 'fungsi' && kunci.startsWith('notify_sp_milestone('),
    alasan: 'no-op KHUSUS staging (20260925000003, doc 12 butir 10) -- badan produksi memanggil Edge Function produksi lewat URL hardcode, jadi staging sengaja BERBEDA selamanya',
  },
  {
    // Butir 6-9 + 11-14 doc 12: sudah di staging, menunggu hari launching.
    cocok: (kat, kunci) =>
      // submit_invoice IKUT di sini walau BADANNYA identik (1.732 karakter di
      // kedua sisi): yang berbeda ACL-nya -- AR Tahap 1 butir (e) mencabut
      // PUBLIC EXECUTE dari tiga fungsi invoice, dan sidik jari di skrip ini
      // memang menyertakan proacl. Perbedaan ACL yang tidak terlihat dari
      // panjang badan fungsi justru alasan proacl disertakan.
      (kat === 'fungsi' && /^(create_invoice_for_sp|create_invoice|record_payment|submit_invoice|generate_delivery_from_picking|set_delivery_signed_date|sp_invoice_readiness|sp_invoice_readiness_all|get_mapped_account|mark_delivery_delivered)\(/.test(kunci))
      || (kat === 'kolom' && /^(delivery_notes|account_role_mappings|sp_invoices_due_date_backfill_20260927|sp_invoices)$/.test(kunci))
      || (kat === 'policy' && kunci.startsWith('account_role_mappings.')),
    kelas: 'antre',
    butir: '6-9, 11-14',
    alasan: 'AR Tahap 1/2 menunggu hari launching -- LIVE staging, produksi belum, dan urutannya mengikat',
  },
  {
    kelas: 'selamanya',
    cocok: (kat, kunci) => kat === 'fungsi' && /^(seed_uat_build|seed_uat_bill|derive_status)\(/.test(kunci),
    alasan: 'fungsi bantu seed data dummy UAT (scripts/seed/uat/) -- staging saja, dan dihapus oleh 99-purge',
  },
  {
    // ENTRI TERPISAH dari entri AR Tahap 1/2 di atas, dan itu disengaja: dua
    // gelombang dengan alasan berbeda harus bisa dibedakan. Kalau keduanya
    // digabung, hari launching tidak bisa lagi menjawab "yang mana yang sudah
    // naik" tanpa membaca doc 12 baris per baris.
    //
    // Invoice lengkap (20260928000001..10), doc 12 butir 16-24. LIVE staging,
    // produksi belum, urutannya mengikat.
    cocok: (kat, kunci) =>
      (kat === 'kolom' && /^(sp_invoice_lines|invoice_attachments|invoice_notes)$/.test(kunci))
      || (kat === 'fungsi' && /^(invoice_journal_projection|post_invoice_journal|invoice_dapat_dibaca|set_invoice_tax_info|mark_invoice_printed|mark_invoice_emailed|link_replacement_invoice|add_invoice_attachment|delete_invoice_attachment|add_invoice_note|delete_invoice_note)\(/.test(kunci))
      || (kat === 'policy' && /^(invoice_attachments|invoice_notes)\./.test(kunci)),
    kelas: 'antre',
    butir: '16-26',
    alasan: 'Invoice lengkap ala Odoo + seam invoice MSI (20260928000001..11) -- LIVE staging, produksi belum, urutannya mengikat',
  },
  {
    // !! sp_invoices sudah tercakup entri AR Tahap 1/2 di atas untuk kategori
    // `kolom`, jadi 20 kolom baru berkas 1 tidak butuh entri sendiri. Yang
    // TIDAK tercakup adalah perubahan HAK-nya, dan sidik jari skrip ini tidak
    // membaca relacl/attacl tabel sama sekali -- pencabutan INSERT/UPDATE
    // (berkas 1 dan 4) karena itu TIDAK akan muncul sebagai drift. Itu batas
    // alat ini, bukan tanda tidak ada perbedaan: periksa lewat doc 12 butir 19.
    kelas: 'selamanya',
    cocok: () => false,
    alasan: '(penanda dokumentasi, tidak mencocokkan apa pun)',
  },
];

function klasifikasi(kat, kunci) {
  for (const d of DIKETAHUI) if (d.cocok(kat, kunci)) return d;
  return null;
}

export const INVENTARIS_SQL = `
WITH fn AS (
  SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS kunci,
         -- provolatile WAJIB di-cast ke text: bertipe "char", dan concat text dengan
         -- "char" ambigu di PostgreSQL (42725 operator is not unique). Backtick
         -- SENGAJA tidak dipakai di komentar ini: seluruh SQL di bawah hidup di
         -- dalam template literal, jadi satu backtick memutusnya.
         -- Ketahuan saat skrip ini
         -- dijalankan pertama kali, 25 Sep 2026.
         md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text
             || '|' || COALESCE(array_to_string(p.proconfig, ','), '')
             || '|' || COALESCE(array_to_string(p.proacl::text[], ','), '(null)')) AS sidik
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
), pol AS (
  SELECT tablename || '.' || policyname || '.' || cmd AS kunci,
         md5(COALESCE(qual,'') || '|' || COALESCE(with_check,'') || '|'
             || COALESCE(array_to_string(roles,','), '')) AS sidik
    FROM pg_policies WHERE schemaname = 'public'
), trg AS (
  SELECT c.relname || '.' || t.tgname AS kunci,
         md5(pg_get_triggerdef(t.oid)) AS sidik
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
), col AS (
  SELECT table_name AS kunci,
         md5(string_agg(column_name || '|' || data_type || '|' || is_nullable
                        || '|' || COALESCE(column_default,''), ',' ORDER BY column_name)) AS sidik
    FROM information_schema.columns WHERE table_schema = 'public'
   GROUP BY table_name
)
SELECT json_build_object(
  'fungsi',  (SELECT json_agg(json_build_array(kunci, sidik) ORDER BY kunci) FROM fn),
  'policy',  (SELECT json_agg(json_build_array(kunci, sidik) ORDER BY kunci) FROM pol),
  'trigger', (SELECT json_agg(json_build_array(kunci, sidik) ORDER BY kunci) FROM trg),
  'kolom',   (SELECT json_agg(json_build_array(kunci, sidik) ORDER BY kunci) FROM col)
) AS inventaris;
`;

function ambilLewatPsql(url, label) {
  if (!url) {
    console.error(`PALANG: ${label} belum diset.`);
    process.exit(2);
  }
  // Palang target: menolak kalau ref-nya tertukar, bukan cuma memeriksa satu arah.
  const stg = url.includes('oovmlhilhqzejnawqkvt');
  const prd = url.includes('untmpqceexwxzuhlmyrg');
  if (label === 'STG_DB_URL' && (!stg || prd)) {
    console.error('PALANG: STG_DB_URL tidak menunjuk staging (atau memuat ref produksi).');
    process.exit(3);
  }
  if (label === 'PRD_DB_URL' && (!prd || stg)) {
    console.error('PALANG: PRD_DB_URL tidak menunjuk produksi (atau memuat ref staging).');
    process.exit(3);
  }
  const out = execFileSync('psql', [url, '--no-psqlrc', '-At', '-c', INVENTARIS_SQL], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.trim());
}

/** Bandingkan dua inventaris. Dipakai kedua mode -- satu logika, bukan dua. */
export function bandingkan(stg, prd) {
  const kategori = ['fungsi', 'policy', 'trigger', 'kolom'];
  const hasil = {};
  for (const kat of kategori) {
    const a = new Map((stg[kat] || []).map(([k, v]) => [k, v]));
    const b = new Map((prd[kat] || []).map(([k, v]) => [k, v]));
    const hanyaStg = [], hanyaPrd = [], bedaIsi = [];
    for (const [k, v] of a) {
      if (!b.has(k)) hanyaStg.push(k);
      else if (b.get(k) !== v) bedaIsi.push(k);
    }
    for (const k of b.keys()) if (!a.has(k)) hanyaPrd.push(k);
    hasil[kat] = {
      n_stg: a.size, n_prd: b.size,
      hanyaStg: hanyaStg.sort(), hanyaPrd: hanyaPrd.sort(), bedaIsi: bedaIsi.sort(),
    };
  }
  return hasil;
}

export function laporkan(hasil) {
  let drift = 0, antre = 0, selamanya = 0;
  const butirAntre = new Map();
  for (const [kat, h] of Object.entries(hasil)) {
    const total = h.hanyaStg.length + h.hanyaPrd.length + h.bedaIsi.length;
    console.log(`\n=== ${kat.toUpperCase()} — staging ${h.n_stg} objek, production ${h.n_prd} objek, ${total} perbedaan ===`);
    for (const [label, daftar] of [
      ['HANYA DI STAGING',    h.hanyaStg],
      ['HANYA DI PRODUCTION', h.hanyaPrd],
      ['BEDA ISI',            h.bedaIsi],
    ]) {
      if (!daftar.length) continue;
      console.log(`  ${label} (${daftar.length}):`);
      for (const k of daftar) {
        const d = klasifikasi(kat, k);
        if (d && d.kelas === 'antre') {
          antre++;
          const b = d.butir || '(butir belum dicatat)';
          butirAntre.set(b, (butirAntre.get(b) || 0) + 1);
          console.log(`    [ANTRE doc 12 butir ${b}] ${k}\n                ${d.alasan}`);
        } else if (d) {
          selamanya++;
          console.log(`    [selamanya] ${k}\n                ${d.alasan}`);
        } else {
          drift++;
          console.log(`    [DRIFT]     ${k}`);
          if (kat === 'kolom') console.log(`                drill-down: node scripts/qa/env-drift-check.mjs --sql-kolom ${k}`);
        }
      }
    }
    if (!total) console.log('  (identik)');
  }
  console.log(`\n--- ringkasan: ${antre} ANTRE, ${selamanya} SELAMANYA, ${drift} DRIFT ---`);
  if (antre) {
    console.log('ANTRE = sudah di staging, menunggu hari launching. Per butir doc 12:');
    for (const [b, n] of [...butirAntre.entries()].sort()) {
      console.log(`  butir ${b}: ${n} objek`);
    }
    console.log('  (angka ini OBJEK yang berbeda, bukan jumlah migrasi -- satu migrasi');
    console.log('   bisa menyentuh beberapa fungsi/policy/kolom sekaligus.)');
  }
  if (drift) {
    console.log('DRIFT = perbedaan yang tidak ada penjelasannya. Periksa satu per satu:');
    console.log('kalau memang disengaja, tulis alasannya di DIKETAHUI beserta kelasnya');
    console.log("('antre' + nomor butir doc 12, atau 'selamanya'); kalau tidak, itu temuan.");
  }
  return drift;
}

// ── main ────────────────────────────────────────────────────────────────────
export const KOLOM_SQL = (tabel) => `
SELECT column_name, data_type, is_nullable, COALESCE(column_default,'(null)') AS bawaan
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = ${"'" + String(tabel).replace(/'/g, "''") + "'"}
 ORDER BY column_name;
`;

const arg = process.argv.slice(2);
if (arg[0] === '--sql') { console.log(INVENTARIS_SQL); process.exit(0); }
if (arg[0] === '--sql-kolom') {
  if (!arg[1]) { console.error('Pemakaian: --sql-kolom <nama tabel>'); process.exit(2); }
  console.log(KOLOM_SQL(arg[1]));
  process.exit(0);
}

let stg, prd;
if (arg[0] === '--from-json') {
  if (arg.length < 3) { console.error('Pemakaian: --from-json <staging.json> <production.json>'); process.exit(2); }
  stg = JSON.parse(readFileSync(arg[1], 'utf8'));
  prd = JSON.parse(readFileSync(arg[2], 'utf8'));
} else {
  stg = ambilLewatPsql(process.env.STG_DB_URL, 'STG_DB_URL');
  prd = ambilLewatPsql(process.env.PRD_DB_URL, 'PRD_DB_URL');
}
const drift = laporkan(bandingkan(stg, prd));
process.exit(drift ? 1 : 0);

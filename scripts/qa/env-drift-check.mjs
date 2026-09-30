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
//   hak      tabel:<t>          -> hak TABEL dari relacl
//            kolom:<t>.<k>      -> hak KOLOM dari attacl
//            fungsi:<f(args)>   -> proacl
//
// -- KENAPA `hak` JADI KATEGORI SENDIRI (27 Sep 2026) ------------------------
// Preflight Kelompok A menemukan `authenticated` MASIH punya DELETE pada
// sp_items di staging sementara production sudah mencabutnya -- staging lebih
// longgar, dan skrip ini BUTA terhadapnya. Policy-nya sendiri sudah dilaporkan
// berbeda, tapi menyamakan policy tanpa hak tabelnya hanya menutup lapis kedua
// sambil meninggalkan lapis pertama terbuka.
//
// ** proacl DIPINDAH dari sidik jari `fungsi` ke sini. Dulu ia ikut di-md5
// bersama badan, sehingga fungsi yang badannya IDENTIK tapi ACL-nya berbeda
// dilaporkan "BEDA ISI" -- kalimat yang mengirim orang membaca badan fungsi
// untuk mencari perbedaan yang tidak ada di sana. Sekarang `fungsi` berarti
// definisi, `hak` berarti izin, dan laporannya menyebut yang sebenarnya beda.
//
// Untuk TABEL dan KOLOM yang dibandingkan hanya hak untuk `anon`,
// `authenticated`, dan `PUBLIC` -- tiga yang benar-benar terpapar PostgREST.
// PUBLIC WAJIB ikut: hak yang diberikan ke PUBLIC sampai ke anon maupun
// authenticated tanpa disebut namanya. Hak untuk postgres/service_role
// sengaja diabaikan (artefak lingkungan, bukan permukaan aplikasi).
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
//   index, constraint, sequence, extension, dan ISI DATA.
//   (hak tabel/kolom/fungsi TIDAK lagi di daftar ini sejak kategori `hak`
//   ditambahkan 27 Sep 2026.)
//   Contoh nyata: 20260925000002 hanya membuat index unik
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
//   Drill-down (semuanya HANYA MENCETAK SQL, nol koneksi -- jalankan sendiri
//   di KEDUA database lalu bandingkan keluarannya):
//     --sql-kolom  <tabel>
//     --sql-policy <tabel.policy.cmd>   (kunci persis seperti yang dicetak)
//     --sql-fungsi <nama>               (tanpa argumen; semua overload dicetak)
//     --sql-hak    <tabel>              (relacl tabel + attacl tiap kolomnya)
//
//   --hak-detail  (bendera tambahan, bukan mode sendiri) mencetak tiap
//   perbedaan kategori hak BERPASANGAN staging vs production. Bisa digabung
//   dengan --from-json.
//
//   ⭐ Drill-down sengaja MENCETAK SQL, bukan menjalankannya. Sidik jari di
//   skrip ini md5 -- ia bisa bilang "berbeda", tidak pernah "berbeda di mana".
//   Yang menjawab itu hanya teks aslinya, dibaca manusia, dari KEDUA sisi.
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
    cocok: (kat, kunci) => (kat === 'fungsi' && kunci.startsWith('notify_sp_milestone('))
      || (hakFungsi(kat, kunci) || '').startsWith('notify_sp_milestone('),
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
      || (kat === 'policy' && kunci.startsWith('account_role_mappings.'))
      // Hak: ACL tiga fungsi invoice diperketat AR Tahap 1 butir (e), dan
      // tabel barunya belum ada di produksi.
      || /^(create_invoice_for_sp|create_invoice|record_payment|submit_invoice|generate_delivery_from_picking|set_delivery_signed_date|sp_invoice_readiness|sp_invoice_readiness_all|get_mapped_account|mark_delivery_delivered)\(/.test(hakFungsi(kat, kunci) || '')
      || /^(account_role_mappings|sp_invoices_due_date_backfill_20260927)$/.test(hakTabel(kat, kunci) || ''),
    // [KOREKSI 29 Sep 2026] "produksi belum" DULU berlaku untuk seluruh daftar di
    // atas. Itu TIDAK lagi benar untuk create_invoice dan create_invoice_for_sp:
    // PRODUKSI punya generasi 23 Sep 2026 dari keduanya (tanda tangan 2-argumen,
    // overload 1-argumen sudah di-DROP) -- tercatat di migrasi retroaktif
    // 20260923000001_invoice_historis_retroaktif.sql. Yang ada di staging adalah
    // generasi v2 (seri invoice v2 develop, 20260925..20260928). Jadi untuk kedua
    // fungsi itu yang berbeda BUKAN "ada vs tidak ada" melainkan ISInya, dan beda
    // isi itu MEMANG DIHARAPKAN sampai hari launching.
    //
    // Tetap SATU entri ANTRE (keputusan Den 29 Sep 2026): keduanya masih menunggu
    // hari launching yang sama, dan memecahnya jadi dua entri akan membuat daftar
    // "apa yang masih menggantung" lebih sulit dibaca, bukan lebih mudah.
    kelas: 'antre',
    butir: '6-9, 11-14',
    alasan: 'AR Tahap 1/2 menunggu hari launching -- urutannya mengikat. Untuk create_invoice & create_invoice_for_sp yang berbeda adalah ISI, bukan keberadaan: produksi punya generasi 23 Sep 2026 (migrasi retroaktif 20260923000001), staging punya v2 (seri invoice v2) -- beda isi DIHARAPKAN sampai launching. Sisanya: LIVE staging, produksi belum',
  },
  {
    kelas: 'selamanya',
    cocok: (kat, kunci) => /^(seed_uat_build|seed_uat_bill|derive_status)\(/.test(
      kat === 'fungsi' ? kunci : (hakFungsi(kat, kunci) || '')),
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
      || (kat === 'policy' && /^(invoice_attachments|invoice_notes)\./.test(kunci))
      // Hak: berkas 1 mencabut UPDATE(faktur_no) dan berkas 4 mencabut
      // INSERT/UPDATE/DELETE sp_invoice_lines + INSERT sp_invoices dari
      // authenticated -- SEMUA staging-only, doc 12 butir 16 dan 19. Inilah
      // yang dulu tidak bisa dilihat alat ini sama sekali.
      || /^(sp_invoices|sp_invoice_lines|invoice_attachments|invoice_notes)$/.test(hakTabel(kat, kunci) || '')
      || /^(invoice_journal_projection|post_invoice_journal|invoice_dapat_dibaca|set_invoice_tax_info|mark_invoice_printed|mark_invoice_emailed|link_replacement_invoice|add_invoice_attachment|delete_invoice_attachment|add_invoice_note|delete_invoice_note)\(/.test(hakFungsi(kat, kunci) || ''),
    kelas: 'antre',
    butir: '16-26',
    alasan: 'Invoice lengkap ala Odoo + seam invoice MSI (20260928000001..11) -- LIVE staging, produksi belum, urutannya mengikat',
  },
  {
    // AR Tahap 3 (20260929000004..10), doc 12 butir 32-38. Ditulis 29 Sep
    // 2026, LIVE staging 29 Sep 2026 (termasuk 20260929000009, backfill
    // due_date dari TTF -- dijalankan sesudah pengukuran dampak V0-nya
    // direview Den: 22 invoice tersentuh, 8 dari TTF, 14 jadi "Belum TTF"),
    // production BELUM -- entri ini disiapkan supaya begitu staging
    // menjalankannya, drift-nya langsung terbaca ANTRE, bukan DRIFT tak
    // dikenal.
    //
    // record_payment/submit_invoice/create_invoice_for_sp SENGAJA TIDAK
    // ditambahkan lagi di sini -- ketiganya SUDAH tercakup regex fungsi/hak
    // di entri "Tahap 1/2" di atas (cocok berdasarkan NAMA fungsi, bukan
    // isi), jadi versi AR Tahap 3-nya otomatis ikut terklasifikasi ANTRE
    // lewat entri itu. Menambahkannya di sini hanya akan jadi baris mati
    // (klasifikasi() berhenti di kecocokan PERTAMA).
    //
    // mark_ttf_received DIREVISI LAGI oleh butir 38 (20260929000010, koreksi
    // UAT -- tanggal_menerima isi sekali) -- signature TIDAK berubah, jadi
    // regex nama fungsi di bawah ini otomatis ikut mencakup revisi itu juga,
    // tanpa entri baru.
    //
    // sp_invoices_due_date_ttf_backfill_20260929 -- tabel cadangan butir 37
    // (20260929000009). Pola SAMA dengan sp_invoices_due_date_backfill_20260927
    // (entri "Tahap 1/2" di atas): jejak nilai lama/baru due_date, hanya ada
    // di staging sampai butir ini naik ke produksi saat launching.
    cocok: (kat, kunci) =>
      (kat === 'fungsi' && /^(compute_payment_term_days|mark_ttf_received)\(/.test(kunci))
      || (kat === 'kolom' && /^(sp_payments|sp_invoices_due_date_ttf_backfill_20260929)$/.test(kunci))
      || /^(compute_payment_term_days|mark_ttf_received)\(/.test(hakFungsi(kat, kunci) || '')
      || /^sp_invoices_due_date_ttf_backfill_20260929$/.test(hakTabel(kat, kunci) || ''),
    kelas: 'antre',
    butir: '32-38',
    alasan: 'AR Tahap 3 -- pengaman pembayaran (TD-285/286/287) + jatuh tempo dari TTF + koreksi UAT tanggal_menerima (20260929000004..10) -- LIVE staging 29 Sep 2026, production belum; naik bersama Tahap 1/2 saat launching (UI-nya menumpang di sana)',
  },
  {
    // AR Tahap 3 bagian kedua (20260930000001..06), doc 12 butir 39-44.
    // LIVE staging 30 Sep 2026, production belum -- entri ini disiapkan
    // lebih dulu (pola sama entri "32-38"), dan sudah terbukti benar: begitu
    // staging menjalankannya, drift-nya terbaca ANTRE seperti dirancang.
    //
    // record_payment/submit_invoice/create_invoice_for_sp/mark_ttf_received
    // SENGAJA TIDAK ditambahkan di sini -- keempatnya SUDAH tercakup regex
    // nama fungsi di entri "Tahap 1/2" (butir 16-26) dan entri "32-38" di
    // atas; klasifikasi() berhenti di kecocokan PERTAMA, jadi menambahkannya
    // lagi di sini hanya jadi baris mati.
    //
    // sp_invoices (kolom approved_by/approved_at/rejected_by/rejected_at/
    // rejection_note, butir 39) TIDAK ditambahkan di sini juga -- tabel itu
    // SUDAH ada di regex kategori `kolom` entri "Tahap 1/2" (baris ~130),
    // jadi fingerprint kolom barunya otomatis ikut ANTRE lewat entri itu.
    //
    // ⚠️ Perubahan status_check (nilai baru 'pending_approval') dan predikat
    // index sp_invoice_one_per_sp (butir 39/40) TIDAK BISA didaftarkan di
    // sini SAMA SEKALI -- INVENTARIS_SQL kategori `kolom` hanya membaca
    // information_schema.columns (nama/tipe/nullable/default), bukan CHECK
    // constraint atau index. Pola sama dengan keterbatasan H2/pg_default_acl
    // yang sudah dicatat doc 12: alat ini TIDAK PERNAH akan melaporkan drift
    // untuk keduanya, di lingkungan mana pun -- bukti keduanya benar harus
    // dicari lewat query langsung (pg_get_constraintdef/pg_get_indexdef),
    // bukan lewat drift-check.
    cocok: (kat, kunci) =>
      (kat === 'fungsi' && /^(approve_invoice_issue|reject_invoice_issue|get_invoice_audit_trail)\(/.test(kunci))
      || /^(approve_invoice_issue|reject_invoice_issue|get_invoice_audit_trail)\(/.test(hakFungsi(kat, kunci) || ''),
    kelas: 'antre',
    butir: '39-44',
    alasan: 'AR Tahap 3 bagian kedua -- approval terbit invoice (pending_approval, approve/reject_invoice_issue) + izin role finance + jejak koreksi TTF (get_invoice_audit_trail) -- LIVE staging 30 Sep 2026, production belum; naik bersama Tahap 1/2/3 bagian pertama saat launching',
  },
  {
    // 12 tabel cadangan koreksi data ongkir/AR (tahap 2-8, 28-29 Sep 2026,
    // migrasi 20260928000001..04 + 20260929000001..03). HANYA DI PRODUCTION,
    // dan memang tidak perlu ada di staging: isinya jejak nilai lama/baru dari
    // koreksi yang DIJALANKAN DI PRODUKSI. Menyalinnya ke staging tidak
    // menambah informasi apa pun, dan justru membuat staging mengaku punya
    // riwayat koreksi yang tidak pernah terjadi di sana.
    //
    // ARAHNYA KEBALIKAN entri ANTRE di atas: yang lain "staging dulu, produksi
    // menyusul"; ini "produksi saja, selamanya". Karena itu kelasnya
    // `selamanya`, bukan `antre` -- tidak ada hari launching yang akan
    // menyamakannya.
    //
    // Daftarnya SENGAJA TERTUTUP (nama ber-tanggal, dienumerasi satu-satu):
    // koreksi data berikutnya akan lahir dengan tanggal baru dan MUNCUL sebagai
    // DRIFT sampai sengaja ditambahkan di sini. Itu yang diinginkan -- pola
    // `backfill_*` yang terbuka akan menelan tabel cadangan apa pun di masa
    // depan tanpa seorang pun memutuskannya.
    kelas: 'selamanya',
    cocok: (kat, kunci) => {
      const T = /^backfill_(invoice_fix|invoice_line_fix|ongkir_fix|tahap4_invoice|tahap4_invoice_line|tahap4_items|tahap5)_20260928$|^backfill_(tahap6|tahap7_invoice|tahap7_invoice_line|tahap7_items|tahap8)_20260929$/;
      return (kat === 'kolom'   && T.test(kunci))
        ||   (kat === 'policy'  && T.test(kunci.split('.')[0]))
        ||   (kat === 'trigger' && T.test(kunci.split('.')[0]))
        ||   T.test(hakTabel(kat, kunci) || '');
    },
    alasan: '12 tabel cadangan koreksi ongkir/AR tahap 2-8 (28-29 Sep 2026) -- HANYA DI PRODUCTION: jejak nilai lama/baru koreksi yang dijalankan di produksi, tidak perlu dan tidak boleh disamakan ke staging',
  },
  {
    // [KOREKSI 27 Sep 2026] Penanda ini dulu berbunyi "skrip ini tidak membaca
    // relacl/attacl sama sekali, jadi pencabutan hak berkas 1 dan 4 TIDAK akan
    // muncul sebagai drift". Batas itu SUDAH DICABUT: kategori `hak` kini
    // membandingkan relacl, attacl, dan proacl, dan pencabutan itu muncul
    // sebagai ANTRE lewat entri invoice lengkap di atas.
    kelas: 'selamanya',
    cocok: () => false,
    alasan: '(penanda dokumentasi, tidak mencocokkan apa pun)',
  },
];

/** Kunci kategori `hak` berawalan tabel:/kolom:/fungsi:. Helper ini membuat
 *  satu matcher bisa menjawab untuk kategori aslinya SEKALIGUS untuk haknya --
 *  tanpa itu tiap entri DIKETAHUI harus ditulis dua kali, dan yang ditulis dua
 *  kali akan berbeda satu hari nanti. */
const hakFungsi = (kat, kunci) => (kat === 'hak' && kunci.startsWith('fungsi:')) ? kunci.slice(7) : null;
const hakTabel  = (kat, kunci) => {
  if (kat !== 'hak') return null;
  if (kunci.startsWith('tabel:')) return kunci.slice(6);
  if (kunci.startsWith('kolom:')) return kunci.slice(6).split('.')[0];
  return null;
};

function klasifikasi(kat, kunci) {
  for (const d of DIKETAHUI) if (d.cocok(kat, kunci)) return d;
  return null;
}

/** RUMUS SIDIK JARI FUNGSI -- SATU tempat, dipakai INVENTARIS_SQL dan FUNGSI_SQL.
 *
 *  Dulu rumus ini ditulis dua kali. Menyalinnya berarti dua salinan yang suatu
 *  hari berbeda tanpa ada yang tahu -- persis kelas TD-233. Sekarang keduanya
 *  membaca konstanta ini, jadi "rumusnya identik" bukan lagi sesuatu yang harus
 *  dipercaya, melainkan sesuatu yang tidak bisa tidak benar.
 *
 *  !! prosecdef::text menghasilkan 'true'/'false', BUKAN 't'/'f'. Huruf t/f itu
 *     cara psql MENAMPILKAN boolean, bukan hasil cast-nya ke text. Salah di titik
 *     ini melahirkan sidik jari yang tampak masuk akal tapi tidak pernah cocok
 *     dengan apa pun -- dan itulah sebab enam konstanta di berkas parity sempat
 *     salah seluruhnya (28 Sep 2026).
 *  !! provolatile WAJIB di-cast ke text: bertipe "char", dan concat text dengan
 *     "char" ambigu di PostgreSQL (42725 operator is not unique). Ketahuan saat
 *     skrip ini dijalankan pertama kali, 25 Sep 2026.
 *  !! proconfig NULL dan array kosong sama-sama jadi '' lewat COALESCE. Itu
 *     disengaja: keduanya berarti "tidak ada SET", dan membedakannya akan
 *     melaporkan drift untuk sesuatu yang perilakunya sama.
 *  !! proacl SENGAJA TIDAK di sini sejak 27 Sep 2026: ia pindah ke kategori hak,
 *     supaya "fungsi beda" berarti definisinya yang beda.
 *  Alias tabelnya HARUS p. -- pemakainya menyediakan FROM pg_proc p. */
export const EKSPRESI_SIDIK_FUNGSI =
  "md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text"
  + " || '|' || COALESCE(array_to_string(p.proconfig, ','), ''))";

export const INVENTARIS_SQL = `
WITH fn AS (
  SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS kunci,
         ${EKSPRESI_SIDIK_FUNGSI} AS sidik
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
), hak AS (
  -- Hak TABEL. grantee 0 = PUBLIC, dan pg_get_userbyid(0) tidak
  -- mengembalikan 'PUBLIC' -- harus ditangani sendiri, kalau tidak hak PUBLIC
  -- hilang dari perbandingan justru pada kategori yang tujuannya izin.
  SELECT 'tabel:' || c.relname AS kunci,
         COALESCE((
           SELECT string_agg(g.nama || '=' || g.priv, ',' ORDER BY g.nama, g.priv)
             FROM (SELECT DISTINCT
                          CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                               ELSE pg_get_userbyid(x.grantee) END AS nama,
                          x.privilege_type AS priv
                     FROM aclexplode(c.relacl) x) g
            WHERE g.nama IN ('anon','authenticated','PUBLIC')), '(nol)') AS sidik
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  UNION ALL
  -- Hak KOLOM. Hanya kolom yang PUNYA attacl jadi kunci: kolom tanpa attacl
  -- mewarisi hak tabelnya, dan mencantumkan ~2.400 kolom kosong akan
  -- menenggelamkan yang benar-benar berbeda.
  SELECT 'kolom:' || c.relname || '.' || a.attname AS kunci,
         COALESCE((
           SELECT string_agg(g.nama || '=' || g.priv, ',' ORDER BY g.nama, g.priv)
             FROM (SELECT DISTINCT
                          CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                               ELSE pg_get_userbyid(x.grantee) END AS nama,
                          x.privilege_type AS priv
                     FROM aclexplode(a.attacl) x) g
            WHERE g.nama IN ('anon','authenticated','PUBLIC')), '(nol)') AS sidik
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
  UNION ALL
  -- ACL FUNGSI. proacl NULL = bawaan = PUBLIC EXECUTE, dan itu BUKAN sama
  -- dengan "tidak ada hak" -- karena itu ia dieja, bukan dijadikan '(nol)'.
  SELECT 'fungsi:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS kunci,
         COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') AS sidik
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
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
  'kolom',   (SELECT json_agg(json_build_array(kunci, sidik) ORDER BY kunci) FROM col),
  'hak',     (SELECT json_agg(json_build_array(kunci, sidik) ORDER BY kunci) FROM hak)
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
  // Tolak host "direct connection": tidak bisa di-resolve dari jaringan ini,
  // dan kegagalannya dulu terbaca sebagai temuan, bukan sebagai salah URL.
  if (/db\.[^/]*\.supabase\.co/.test(url)) {
    console.error(`PALANG: ${label} memakai DIRECT CONNECTION (db.<ref>.supabase.co).`);
    console.error('  Pakai SESSION POOLER: host <region>.pooler.supabase.com,');
    console.error('  user postgres.<ref>, port 5432 (Project Settings > Database).');
    process.exit(4);
  }
  // SATU KONEKSI PER DB. Dulu ada dua: satu SELECT 1 sebagai bukti hidup, lalu
  // satu lagi untuk inventarisnya. Probe itu sudah dicabut -- ia menambah satu
  // koneksi tanpa menambah keterangan, karena query inventarisnya sendiri kini
  // ber-retry DAN menggolongkan sebab kegagalannya. Organisasi Supabase ini
  // Free Plan dengan kuota Log Ingestion yang sudah terlampaui; tiap koneksi
  // ada harganya.
  //
  // ** Retry HANYA untuk kegagalan koneksi. ** Mengulang password yang salah
  // membuang koneksi dan mengaburkan diagnosisnya; mengulang ERROR SQL
  // mengulang kesalahan yang sama dengan hasil yang sama. Cermin shell-nya:
  // scripts/qa/psql-retry.sh (aturan penggolongannya disengaja sama).
  const MAKS = 3;
  let jeda = 5000;
  for (let percobaan = 1; ; percobaan++) {
    try {
      const out = execFileSync('psql',
        [url, '--no-psqlrc', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', INVENTARIS_SQL],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
          env: { ...process.env, PGCONNECT_TIMEOUT: '15' } });
      if (percobaan > 1) console.error(`  ${label}: berhasil pada percobaan ke-${percobaan}.`);
      return JSON.parse(out.trim());
    } catch (e) {
      const pesan = String(e.stderr || e.message).trim();
      const sambungan = /Operation timed out|could not connect to server|connection timed out|timeout expired|Connection refused|server closed the connection unexpectedly|Connection reset by peer|SSL connection has been closed|terminating connection|the database system is starting up|too many clients|remaining connection slots/.test(pesan);
      const urlSalah = /could not translate host name|nodename nor servname|Name or service not known|password authentication failed|no password supplied|Tenant or user not found/.test(pesan);

      if (urlSalah) {
        console.error(`PALANG: URL SALAH untuk ${label}. TIDAK diulang -- mengulang tidak mengubah hasilnya.`);
        console.error(`  ${pesan}`);
        console.error('  Pakai SESSION POOLER: host <region>.pooler.supabase.com,');
        console.error('  user postgres.<ref>, port 5432 (Project Settings > Database).');
        process.exit(6);
      }
      if (!sambungan) {
        console.error(`PALANG: ${label} gagal, dan sebabnya BUKAN koneksi. TIDAK diulang.`);
        console.error(`  ${pesan}`);
        process.exit(8);
      }
      console.error(`KONEKSI PUTUS ke ${label} (percobaan ${percobaan} dari ${MAKS}).`);
      console.error(`  ${pesan}`);
      if (percobaan >= MAKS) {
        console.error(`\nGAGAL: ${MAKS} percobaan habis dan penyebabnya KONEKSI, bukan URL.`);
        console.error('  Jangan ketik ulang URL-nya; tunggu sebentar lalu jalankan lagi.');
        process.exit(7);
      }
      console.error(`  menunggu ${jeda / 1000}s lalu mencoba lagi...`);
      // Jeda sinkron lewat `sleep`, BUKAN busy-wait: alat ini berjalan
      // berurutan dan tidak punya event loop yang perlu dijaga hidup, jadi
      // menunggu di tempat lebih jujur daripada membuat seluruh jalur jadi
      // async -- tapi menunggu dengan memutar CPU 10 detik bukan menunggu,
      // itu memanaskan laptop untuk hasil yang sama.
      execFileSync('sleep', [String(jeda / 1000)]);
      jeda *= 2;
    }
  }
}

/** Bandingkan dua inventaris. Dipakai kedua mode -- satu logika, bukan dua. */
export function bandingkan(stg, prd) {
  const kategori = ['fungsi', 'policy', 'trigger', 'kolom', 'hak'];
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
/** Kutip literal SQL. Satu tempat, supaya tidak ada yang menyalin setengahnya. */
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";

/** Kunci policy dicetak sebagai `tabel.policyname.cmd`. Dipecah dari UJUNG:
 *  nama policy boleh memuat titik, nama tabel dan cmd tidak. Memecah dengan
 *  split('.') polos akan salah untuk policy bernama titik -- dan salahnya
 *  diam-diam mengembalikan nol baris, yang terbaca seperti "tidak ada". */
export const POLICY_SQL = (kunci) => {
  const p1 = kunci.indexOf('.');
  const p2 = kunci.lastIndexOf('.');
  if (p1 < 0 || p2 <= p1) throw new Error(`kunci policy tidak berbentuk tabel.policy.cmd: ${kunci}`);
  const tabel = kunci.slice(0, p1);
  const nama  = kunci.slice(p1 + 1, p2);
  const cmd   = kunci.slice(p2 + 1);
  return `
SELECT tablename, policyname, cmd, permissive,
       COALESCE(array_to_string(roles, ','), '') AS roles,
       COALESCE(qual, '(null)')       AS qual,
       COALESCE(with_check, '(null)') AS with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename  = ${lit(tabel)}
   AND policyname = ${lit(nama)}
   AND cmd        = ${lit(cmd)};
`;
};

/** Seluruh overload dicetak: yang berbeda bisa saja overload yang tidak
 *  terpikirkan, dan menyaring per-argumen di sini akan menyembunyikannya.
 *  proacl IKUT -- perbedaan ACL tidak terlihat dari badan fungsi sama sekali,
 *  dan itu persis kasus get_table_columns. */
export const FUNGSI_SQL = (nama) => `
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS kunci,
       -- sidik jari PENUH, dihitung dengan rumus yang SAMA dengan INVENTARIS_SQL.
       -- Inilah satu-satunya angka yang boleh dipakai sebagai harapan di blok V
       -- berkas parity. Angka yang dihitung di luar SQL adalah tebakan, dan
       -- tebakan yang berbentuk md5 tetap tebakan.
       ${EKSPRESI_SIDIK_FUNGSI} AS sidik_penuh,
       md5(p.prosrc) AS md5_badan,
       -- prosecdef ditampilkan DUA kali: apa adanya (psql mencetak t/f) dan
       -- hasil cast ke text (true/false) -- karena rumus sidik memakai yang
       -- KEDUA, dan mengira keduanya sama adalah kekeliruan yang sudah terjadi.
       p.prosecdef AS secdef, p.prosecdef::text AS secdef_text,
       p.provolatile::text AS volatile,
       -- proconfig dalam tiga bentuk: mentah, hasil array_to_string, dan
       -- pembeda NULL vs array kosong -- dua keadaan yang rumus sidik sengaja
       -- anggap sama, jadi bedanya harus terlihat di sini kalau tidak di sana.
       COALESCE(p.proconfig::text, '(NULL)') AS config_mentah,
       COALESCE(array_to_string(p.proconfig, ','), '(null)') AS config_gabung,
       CASE WHEN p.proconfig IS NULL THEN 'NULL'
            WHEN cardinality(p.proconfig) = 0 THEN 'array kosong'
            ELSE cardinality(p.proconfig)::text || ' entri' END AS config_bentuk,
       COALESCE(array_to_string(p.proacl::text[], ','), '(null -- PUBLIC EXECUTE)') AS acl,
       length(p.prosrc) AS panjang_badan,
       -- Byte terakhir badan, dibuat KELIHATAN: baris baru jadi \\n dan spasi
       -- jadi titik. Tanpa ini, badan yang bedanya cuma spasi di ekor tampak
       -- identik di layar sementara md5-nya berbeda.
       replace(replace(right(p.prosrc, 16), chr(10), '\\n'), ' ', '.') AS ekor_badan,
       pg_get_userbyid(p.proowner) AS pemilik,
       p.pronargs, format_type(p.prorettype, NULL) AS tipe_kembali,
       l.lanname AS bahasa,
       p.prosrc AS badan
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
 WHERE n.nspname = 'public' AND p.proname = ${lit(nama)}
 ORDER BY kunci;
`;

/** Rincian hak SATU tabel: relacl tabelnya + attacl tiap kolom yang punya.
 *  Dipakai untuk menjawab "beda di mana" sesudah kategori hak bilang "beda". */
export const HAK_SQL = (tabel) => `
SELECT 'TABEL' AS lingkup, NULL::text AS kolom,
       CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
       x.privilege_type AS hak
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL aclexplode(c.relacl) x
 WHERE n.nspname = 'public' AND c.relname = ${lit(tabel)}
UNION ALL
SELECT 'KOLOM', a.attname,
       CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
       x.privilege_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL aclexplode(a.attacl) x
 WHERE n.nspname = 'public' AND c.relname = ${lit(tabel)}
   AND a.attnum > 0 AND NOT a.attisdropped
 ORDER BY 1, 2, 3, 4;
`;

export const KOLOM_SQL = (tabel) => `
SELECT column_name, data_type, is_nullable, COALESCE(column_default,'(null)') AS bawaan
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = ${"'" + String(tabel).replace(/'/g, "''") + "'"}
 ORDER BY column_name;
`;

const arg = process.argv.slice(2);
if (arg[0] === '--sql') { console.log(INVENTARIS_SQL); process.exit(0); }
// Rumus sidik jari fungsi, apa adanya. Ada supaya skrip lain memakai rumus
// YANG SAMA alih-alih menyalinnya -- salinan rumus adalah salinan yang suatu
// hari berbeda, dan bedanya cuma terlihat sebagai md5 yang tidak cocok.
if (arg[0] === '--ekspresi-sidik') { console.log(EKSPRESI_SIDIK_FUNGSI); process.exit(0); }
if (arg[0] === '--sql-policy') {
  if (!arg[1]) { console.error('Pemakaian: --sql-policy <tabel.policy.cmd>'); process.exit(2); }
  console.log(POLICY_SQL(arg[1]));
  process.exit(0);
}
if (arg[0] === '--sql-hak') {
  if (!arg[1]) { console.error('Pemakaian: --sql-hak <nama tabel>'); process.exit(2); }
  console.log(HAK_SQL(arg[1]));
  process.exit(0);
}
if (arg[0] === '--sql-fungsi') {
  if (!arg[1]) { console.error('Pemakaian: --sql-fungsi <nama fungsi tanpa argumen>'); process.exit(2); }
  console.log(FUNGSI_SQL(arg[1]));
  process.exit(0);
}
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
const hasil = bandingkan(stg, prd);
const drift = laporkan(hasil);

// --hak-detail: untuk kategori `hak`, sidik jarinya BUKAN md5 melainkan daftar
// haknya sendiri -- jadi "beda di mana" bisa dijawab tanpa query tambahan.
// Dicetak berpasangan supaya arah perbedaannya terbaca sekali lihat, bukan
// disimpulkan dari dua daftar terpisah.
if (arg.includes('--hak-detail')) {
  const a = new Map((stg.hak || []).map(([k, v]) => [k, v]));
  const b = new Map((prd.hak || []).map(([k, v]) => [k, v]));
  const h = hasil.hak || { hanyaStg: [], hanyaPrd: [], bedaIsi: [] };
  const semua = [...h.hanyaStg, ...h.hanyaPrd, ...h.bedaIsi].sort();
  console.log(`\n=== RINCIAN HAK (${semua.length} perbedaan) ===`);
  for (const k of semua) {
    const d = klasifikasi('hak', k);
    const tag = d ? (d.kelas === 'antre' ? `ANTRE butir ${d.butir}` : 'selamanya') : 'DRIFT';
    console.log(`\n[${tag}] ${k}`);
    console.log(`  staging    : ${a.has(k) ? a.get(k) : '(objek tidak ada)'}`);
    console.log(`  production : ${b.has(k) ? b.get(k) : '(objek tidak ada)'}`);
  }
  if (!semua.length) console.log('  (nol perbedaan hak)');
}

process.exit(drift ? 1 : 0);

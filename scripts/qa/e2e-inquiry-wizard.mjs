#!/usr/bin/env node
// scripts/qa/e2e-inquiry-wizard.mjs
// Inquiry Management Putaran 4 Tahap 4B — satu alur ujung-ke-ujung memakai
// wizard baru (InquiryIntakeWizardPage.jsx): login -> buka wizard -> isi
// Customs Clearance + Import (Undername) + dua lane + angka berformat id-ID
// -> Create -> Detail Inquiry (blok "Route Options" + POL/POD terkunci saat
// edit) -> dua assert negatif (angka tak dikenali memblokir Create; kartu
// Warehousing/General Trading tidak ada). Bukan pengganti menu-sweep.mjs/
// detail-routes.mjs (fingerprint/rute) -- skrip ini mengisi FORM sungguhan.
//
// Pola KEAMANAN SAMA PERSIS dengan menu-sweep.mjs/detail-routes.mjs: menolak
// jalan ke ref PRODUKSI (untmpqceexwxzuhlmyrg); password dari env QA_PASSWORD
// ATAU, kalau kosong dan stdin TTY, dari prompt tersembunyi interaktif (lihat
// resolvePassword) -- kedua jalur sama-sama tidak pernah ditulis ke
// berkas/stdout/log, login via GoTrue password grant lalu sesi disuntik ke
// localStorage (nol ketikan password di UI aplikasi, nol screenshot/log yang
// bisa memuatnya).
//
// CARA JALAN (CC tidak pernah menjalankan ini dengan password sendiri --
// nol akses password; kalau CC menjalankan tanpa QA_PASSWORD di terminal
// yang terlihat pemilik, skrip berhenti di prompt sampai pemilik mengetik):
//   1. Build yang mau diuji sudah dilayani statis:
//        npm run build && npx vite preview --port 4173
//   2. env lokal (.env.local atau --env) menunjuk STAGING (bukan produksi --
//      skrip menolak ref produksi apa pun isi env-nya).
//   3. Jalankan, DUA CARA (pilih satu):
//        a) QA_PASSWORD='<password akun uji>' node scripts/qa/e2e-inquiry-wizard.mjs \
//             --base http://localhost:4173
//        b) node scripts/qa/e2e-inquiry-wizard.mjs --base http://localhost:4173
//           (QA_PASSWORD dikosongkan, dijalankan di terminal interaktif --
//           skrip menanyakan password dengan input TERSEMBUNYI, karakter
//           tidak ditampilkan sama sekali, dipakai hanya di memori utk login
//           GoTrue, tidak pernah ditulis ke berkas/log/output. Ctrl+C
//           membatalkan dengan bersih, terminal tidak tertinggal tersembunyi)
//      Opsi: --account <email> (default test@msi.com) · --env .env.local ·
//            --settle <ms> (default 1200) · --headed (lihat browsernya)
//
// Akun uji: test@msi.com ("ZZZTEST Admin", super_admin @ MSI -- PROGRESS.md
// 2026-09-21, dipakai berulang di detail-routes.mjs suite `crm` karena
// satu-satunya akun yang punya data di semua daftar CRM staging hari ini).
// Flow ketiga (Putaran 5 K1a) re-login akun KEDUA di tengah skrip yang sama:
// zzztest.salesspv@msi.com ("ZZZ Test Sales Supervisor", bd_sales_spv_forwarding
// level 6 @ MSI -- satu-satunya di antara akun uji yang lolos isManagerOrAbove()
// TANPA sekaligus Super Admin). Password-nya dari env QA_PASSWORD_MANAGER ATAU
// prompt tersembunyi interaktif KEDUA (pola identik QA_PASSWORD di atas,
// ditanyakan menyusul sesudah flow 1+2 selesai, sebelum flow 3 dimulai).
// Data bisnis yang diasumsikan SUDAH ADA di staging (diberikan di instruksi
// tugas, tidak diverifikasi skrip ini sebelumnya): akun "PT Agro Sawit
// Kalimantan" ber-source 'referral', lokasi "Singapore"/"Jakarta",
// dropdown_options list_key='importer_of_record' memuat "PT Sentra Impor
// Nusantara". Kalau salah satu tidak ada, langkah terkait akan GAGAL dengan
// pesan yang menyebut apa yang dicari -- bukan dibuat otomatis oleh skrip
// ini (skrip ini TIDAK PERNAH menulis data lewat jalur lain selain wizard
// yang sedang diuji).
//
// Flow KEEMPAT (Putaran 5 K1d) re-login akun KETIGA, di konteks browser
// BARU lagi: sales@msi.com ("ZZZTEST Sales", bd_sales_executive @ MSI) --
// pemilik seluruh fixture Quotation flow ini (created_by = dirinya sendiri,
// supaya gate canAct di QuotationDetailPage.jsx lolos tanpa butuh
// is_manager_or_above()). Password dari env QA_PASSWORD_SALES ATAU prompt
// tersembunyi interaktif KETIGA, ditanyakan menyusul sesudah flow 1-3
// selesai. BERBEDA dari flow 1-3: flow ini membuat data FIXTURE lewat REST
// langsung (bukan lewat wizard/form UI -- modul Quotation List/Form di luar
// scope task ini) dan TIDAK menghapusnya sendiri -- dicetak di akhir run
// utk pembersihan manual nanti (pola sama inquiry flow 1-3, yang juga tidak
// pernah dihapus skrip ini).
//
// ⚠️ Beberapa selector bergantung pada STRUKTUR DOM InquiryIntakeWizardPage.jsx/
// DealDetailPage.jsx hari ini (nol id/name/aria-label eksplisit di kontrol
// form -- pola yang sama dengan file itu sendiri, lihat komentarnya). Kalau
// strukturnya berubah di Tahap 4C atau revisi berikutnya, selector XPath di
// bawah (berbasis teks label yang tampil ke user, bukan class CSS) kemungkinan
// besar tetap cocok, tapi tidak dijamin -- laporkan dengan pesan yang jelas
// (lihat helper `check`), bukan diam-diam lolos.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const BASE = opt('base', 'http://localhost:4173').replace(/\/+$/, '');
const ACCOUNT = opt('account', 'test@msi.com');
const SETTLE = Number(opt('settle', '1200'));
// --only 4 (opsional, pola spasi SAMA dengan --base/--account di atas,
// BUKAN --only=4) -- HANYA Flow 4 (Mark Accepted) dijalankan, HANYA
// password sales@msi.com diminta; Flow 1-3 dan login/browser-context
// test@msi.com miliknya dilewati seluruhnya. Tanpa argumen ini, perilaku
// skrip TIDAK berubah (byte-identik -- lihat IIFE utama di bawah).
const ONLY = opt('only', null);

// Input tersembunyi raw-stdin (tanpa dependency baru) -- dipakai HANYA saat
// QA_PASSWORD kosong DAN stdin adalah TTY (lihat resolvePassword di bawah).
// Echo terminal dimatikan oleh termios raw mode itu sendiri (bukan ditulis
// ulang per-karakter) -- nol tampilan sama sekali, bukan tanda bintang.
function promptHiddenPassword(promptText) {
  return new Promise((resolvePromise, rejectPromise) => {
    const { stdin, stdout } = process;
    stdout.write(promptText);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';
    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw || false);
      stdin.pause();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '') { cleanup(); stdout.write('\n'); rejectPromise(new Error('CANCELLED')); return; } // Ctrl+C
        if (ch === '\r' || ch === '\n' || ch === '') { cleanup(); stdout.write('\n'); resolvePromise(input); return; } // Enter / Ctrl+D
        if (ch === '' || ch === '\b') { input = input.slice(0, -1); continue; } // Backspace/Delete
        input += ch;
      }
    };
    stdin.on('data', onData);
  });
}

// Digeneralisasi (Putaran 5 K1a, Task 2) supaya bisa dipakai utk akun KEDUA
// (flow ketiga, re-login manager) tanpa menduplikasi logika env/prompt --
// perilaku utk akun PERTAMA byte-identik (envVar='QA_PASSWORD', email=ACCOUNT).
async function resolvePasswordFor(email, envVar) {
  if (process.env[envVar]) return process.env[envVar];
  if (!process.stdin.isTTY) {
    console.error(`${envVar} (env) wajib saat stdin bukan TTY — password bersama akun uji, JANGAN ditulis di repo`);
    process.exit(2);
  }
  let pw;
  try {
    pw = await promptHiddenPassword(`Password akun uji untuk ${email} (tersembunyi, Enter untuk kirim): `);
  } catch (e) {
    console.error(e.message === 'CANCELLED' ? 'Dibatalkan (Ctrl+C) — nol password terbaca.' : `Dibatalkan: ${e.message}`);
    process.exit(130);
  }
  if (!pw) { console.error('Password kosong — dibatalkan.'); process.exit(2); }
  return pw;
}
async function resolvePassword() { return resolvePasswordFor(ACCOUNT, 'QA_PASSWORD'); }

// ── env + gerbang ref produksi (pola IDENTIK menu-sweep.mjs/detail-routes.mjs) ──
function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = readEnv(resolve(ROOT, opt('env', '.env.local')));
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) { console.error('VITE_SUPABASE_URL/KEY tidak ditemukan — arahkan --env ke berkas yang menunjuk staging'); process.exit(2); }
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
if (REF === 'untmpqceexwxzuhlmyrg') { console.error('⛔ Skrip ini menolak jalan ke PRODUKSI (untmpqceexwxzuhlmyrg). Arahkan env ke staging.'); process.exit(2); }

// ── pelapor LULUS/GAGAL (pola sama detail-routes.mjs) ──────────────────────
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`  ${ok ? '✔ LULUS' : '✖ GAGAL'} ${name}${detail ? ' — ' + detail : ''}`); return ok; };

// Putaran 13a Task 3 -- daftar data uji yang tercipta (nomor inquiry/id/
// kontak), dikumpulkan dari seluruh Flow apa pun hasilnya, dicetak sebagai
// satu blok di akhir skrip (lihat ringkasan sebelum process.exit). Isinya
// STRING siap-cetak, bukan objek -- tiap Flow yang sudah mencetak info ini
// inline (console.log "→ ...") cukup menambah satu `testDataLog.push(...)`
// senilai, nol perubahan pada check()/assersi.
const testDataLog = [];

// Putaran 13a Task 3 -- satu Flow (1, D2D, 2, 3, 4) yang throw TIDAK LAGI
// mematikan proses: tiap Flow dibungkus try/catch sendiri di titik
// panggilnya (lihat badan (async () => {...})() di bawah). Exception yang
// lolos sampai sini dicatat sebagai SATU check() GAGAL bertanda
// "[<TAG>-FATAL]" (supaya ringkasan per-Flow di akhir skrip tetap bisa
// menghitungnya sebagai Flow yang gagal, bukan Flow yang lenyap tanpa jejak)
// + percobaan screenshot ke os.tmpdir() kalau `pageForShot` yang dioper
// masih berupa Page yang terbuka (percobaan terbaik -- kegagalan
// screenshot itu sendiri TIDAK dicatat sebagai check tambahan, hanya
// dicetak sebagai catatan baris biasa). Data uji yang SUDAH tercipta
// sebelum Flow itu berhenti TIDAK dihapus (instruksi eksplisit) -- dicatat
// apa adanya, siapa pun yang sudah tercetak di log flow tetap tercetak.
async function recordFlowFailure(tag, label, e, pageForShot) {
  const causeCode = e?.cause?.code || e?.cause?.errors?.[0]?.code || null;
  const causeText = e?.cause ? ` | cause: ${causeCode ? causeCode + ' — ' : ''}${e.cause.message || e.cause}` : '';
  const stepText = String(e?.message || e).split('\n')[0].slice(0, 300);
  console.log(`\n  ✖ ${label} BERHENTI karena exception tak tertangkap — dicatat, Flow lain TIDAK terdampak: ${stepText}${causeText}`);
  let shotPath = '';
  if (pageForShot && typeof pageForShot.isClosed === 'function' && !pageForShot.isClosed()) {
    try {
      shotPath = join(tmpdir(), `e2e-inquiry-wizard-${tag}-${Date.now()}.png`);
      await pageForShot.screenshot({ path: shotPath, fullPage: true });
      console.log(`    screenshot: ${shotPath}`);
    } catch { shotPath = ''; }
  }
  check(`[${tag}-FATAL] ${label} berhenti karena exception tak tertangkap`, false, `${stepText}${causeText}${shotPath ? ' | screenshot: ' + shotPath : ''}`);
  testDataLog.push(`${label}: BERHENTI sebelum selesai — data yang sempat tercipta sebelum titik ini TIDAK dihapus, lihat baris log Flow ini di atas untuk nomor/id yang sudah tercetak.`);
}

async function settle(page, extra = 0) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(SETTLE + extra);
}

// Selector toast generik (pola SAMA dgn captureRejectionDiagnostics/laneToastText
// di bawah -- TIDAK diganti exact/substring di sini, hanya dipakai utk
// menunggu/mendiagnosis, bukan utk assert lulus/gagal).
const toastLocator = (page) => page.locator('[class*="toast" i], [role="alert" i], [role="status" i]');

// Akar bug (Vir, verifikasi kode App.jsx ~baris 2412): showToast memanggil
// setTimeout(() => setToast(null), 2800) TANPA membatalkan timer toast
// SEBELUMNYA -- toast baru yang muncul <2,8 detik sesudah toast lain akan
// dihapus lebih awal oleh timer toast LAMA, sehingga umurnya jauh lebih
// pendek dari 2800ms (kadang <1 detik) dan terlewat oleh cek instan. Bug
// pre-existing di shell global, BUKAN bagian Tahap 4C -- App.jsx TIDAK
// disentuh di sini (dicatat Vir utk audit Putaran 5); mitigasinya di SISI
// TES: pastikan toast SEBELUMNYA sudah benar-benar hilang (timer lamanya
// sudah habis) sebelum memicu aksi yang menampilkan toast BARU, supaya
// toast baru mendapat umur penuh 2800ms miliknya sendiri.
async function waitForToastGone(page, timeout = 6000) {
  const loc = toastLocator(page);
  if (await loc.count() === 0) return;
  await loc.first().waitFor({ state: 'hidden', timeout }).catch(() => {});
}

// Cek toast teks PERSIS (selector TETAP exact text="..." -- TIDAK diganti
// substring/regex) dgn POLLING sampai timeout (default 3 detik, minimum
// instruksi Vir), bukan snapshot instan -- toast yang umurnya dipersingkat
// oleh bug di atas tetap SUNGGUH tampil sesaat, waitFor({state:'visible'})
// menangkapnya selama ia masih ada di jendela waktu itu. Kalau TETAP gagal
// sesudah ini, JANGAN ubah selector diam-diam -- cetak teks SEMUA elemen
// toast yang terlihat saat itu (pola sama captureRejectionDiagnostics) dan
// laporkan apa adanya lewat detail check().
async function checkToastExact(page, name, text, timeoutMs = 3000) {
  const exact = page.locator(`text="${text}"`);
  let ok = false;
  try {
    await exact.first().waitFor({ state: 'visible', timeout: timeoutMs });
    ok = true;
  } catch { ok = false; }
  if (ok) return check(name, true);
  const visibleToasts = (await toastLocator(page).allInnerTexts().catch(() => [])).filter(Boolean);
  return check(name, false, `toast terlihat saat timeout: ${JSON.stringify(visibleToasts)}`);
}

// Pill aktif (InquiryIntakeWizardPage.jsx) berwarna solid navy `#1B4D8A` =
// rgb(27, 77, 138) -- IDENTIK pola assert Direction "Import" di bawah.
// Dipakai utk memastikan handleCreate BENAR melempar wizard balik ke step
// yang errornya berasal, bukan cuma menebak dari "URL tidak berubah" (URL
// memang TAK PERNAH berubah sampai Create sungguhan sukses -- itu assert
// yang trivial-benar, bukan bukti jump-on-error jalan).
async function isStepActive(page, stepLabel) {
  // Putaran 13a -- didiscoping lewat stepPill() (dideklarasikan di bawah,
  // `function` di-hoist) alih-alih text-is("N. Label") yang sudah tidak
  // pernah cocok sejak badge bundar (lihat komentar stepPill). Pemanggil
  // mengirim LABEL POLOS saja, tanpa "N. " -- lihat situs panggilan.
  const btn = stepPill(page, stepLabel);
  if (await btn.count() === 0) return false;
  const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
  return /27,\s*77,\s*138/.test(bg || '');
}

// Tombol "Create Inquiry" HANYA dirender saat `stepIdx===SK.length` (lihat
// footer navigasi wizard -- "Next" dan "Create Inquiry" SALING EKSKLUSIF,
// nol kemungkinan ambigu). Klik "Next" berulang sampai Review -- bukan klik
// pill "N. Review" langsung -- supaya jalur ini tidak bergantung pada index
// SK[] mana pun; dibatasi `maxSteps` iterasi supaya tak mungkin berputar
// tanpa akhir kalau tombol Create ternyata tidak pernah muncul (gejala
// APLIKASI, bukan skrip -- lihat pemanggil).
async function goToReviewViaNext(page, maxSteps = 10) {
  for (let i = 0; i < maxSteps; i++) {
    if (await page.locator('button:text-is("Create Inquiry")').isVisible().catch(() => false)) return true;
    const nextBtn = page.locator('button:has-text("Next")').first();
    if (await nextBtn.count() === 0) return false;
    await nextBtn.click();
    await settle(page, 300);
  }
  return await page.locator('button:text-is("Create Inquiry")').isVisible().catch(() => false);
}

// Diagnostik dipakai SETELAH Create ditolak tanpa penjelasan dari assert
// biasa, supaya akarnya terlihat dari output tanpa membuka browser headed
// manual. Tiga sumber: (a) pill step mana yang AKTIF saat ini (background
// navy solid rgb(27,77,138) -- IDENTIK isStepActive, tapi di sini discan
// SEMUA pill sekali jalan, bukan mencocokkan satu label yang ditebak); (b)
// SELURUH <span> ber-warna merah FieldError (color rgb(220,38,38) =
// C.error `#DC2626`, InquiryIntakeWizardPage.jsx:128-131) yang SEDANG
// tampil -- mencakup pesan under_docs/route_*/svc_* dkk, yang bentuk
// teksnya berbeda-beda per field; (c) teks toast yang sedang tampil.
// Screenshot full halaman disimpan ke `screenshotPath` supaya pemanggil
// (manusia/alat baca gambar) bisa memverifikasi visual, bukan hanya
// tekstual.
async function captureRejectionDiagnostics(page, screenshotPath) {
  const activePill = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('button')).find((b) => {
      const t = (b.textContent || '').trim();
      return /^\d+\.\s/.test(t) && getComputedStyle(b).backgroundColor === 'rgb(27, 77, 138)';
    });
    return hit ? hit.textContent.trim() : null;
  }).catch(() => null);
  const fieldErrors = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('span').forEach((el) => {
      if (getComputedStyle(el).color === 'rgb(220, 38, 38)') {
        const t = (el.textContent || '').trim();
        if (t) out.push(t);
      }
    });
    return Array.from(new Set(out));
  }).catch(() => []);
  const toastText = (await page.locator('[class*="toast" i], [role="alert" i], [role="status" i]').allInnerTexts().catch(() => [])).filter(Boolean);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  return { activePill, fieldErrors, toastText };
}

// XPath: cari div/label yang teksnya PERSIS sama dengan `label` (bukan
// substring — mockup punya label pendek "Owner" yang jadi substring label
// lain), lalu ambil elemen `tag` di SIBLING SETELAHNYA.
// Mencocokkan struktur nyata Field({label, children}) di InquiryIntakeWizardPage.jsx:
// <div><div>{label}{*}</div>{children}</div> — label dan children SIBLING,
// bukan nested. `children` punya DUA bentuk nyata yang keduanya harus
// tertangkap: (a) `tag` langsung sebagai sibling TANPA div pembungkus (mis.
// Number of containers -- <input> langsung), dan (b) `tag` BERSARANG di
// dalam div pembungkus (mis. Total Weight/Volume/Estimated -- <div><input/></div>,
// Importer of Record/Duties & Taxes -- <div><select/></div>), dan (c) `tag`
// itu sendiri adalah div tanpa anak apa pun (Source, read-only). `//tag`
// (descendant SAJA) menangkap (b) tapi BUKAN (a)/(c) -- `descendant-or-self::`
// menangkap ketiganya sekaligus karena ia menyertakan node SIBLING itu
// sendiri, bukan hanya anaknya.
function fieldLocator(page, label, tag) {
  // normalize-space menyamakan "Importer of Record *" (asterisk ikut node teks
  // yang sama di beberapa browser) dengan "Importer of Record" — dicocokkan
  // dengan starts-with supaya asterisk wajib tidak menggagalkan pencocokan.
  return page.locator(
    `xpath=//div[starts-with(normalize-space(.), ${JSON.stringify(label)})][not(.//div[starts-with(normalize-space(.), ${JSON.stringify(label)})])]/following-sibling::*[1]/descendant-or-self::${tag}`
  ).first();
}
// Pill langkah wizard (InquiryIntakeWizardPage.jsx, pill bar atas) --
// Putaran 13a (D9, badge bundar bernomor): <button><span>{{N}}</span>{{Label}}</button>
// -- DUA children JSX bersebelahan, NOL separator teks (jarak visual
// "N. Label" lama MURNI dari CSS flex `gap`, bukan karakter). `:text-is("N. Label")`
// (lama) karena itu TIDAK PERNAH cocok lagi (teks sungguhan "NLabel",
// digabung tanpa spasi/titik) -- terverifikasi via build output minified
// (dist/.../InquiryIntakeWizardPage-*.js: `children:[jsx(span,{children:i+1}),STEP_LABEL[k]]`,
// nol string literal di antaranya). `button:has-text("Label")` SAJA (tanpa
// scoping) ambigu: "Cargo" juga substring tombol tag "Cargo Insurance"
// (Langkah 5, TagCard -- SAMA-SAMA <button> berisi <span>). Discoping lewat
// SAUDARA tombol "Customer & Contact" -- frasa itu unik di SELURUH halaman
// (nol kartu/label lain memakainya), jadi ia jadi jangkar yang pasti berada
// di DALAM pill bar; dari situ cari saudara <button> yang mengandung label
// yang dicari. Berlaku SAMA untuk KEDUA varian SK (Customs & Undername
// menggantikan Additional Services di jalur Door-to-Door).
function stepPill(page, label) {
  return page.locator(
    `xpath=//button[contains(normalize-space(.), "Customer & Contact")]/parent::div/button[contains(normalize-space(.), ${JSON.stringify(label)})]`
  ).first();
}

// SectionHeader (DealDetailPage.jsx): <div><h3>{title}</h3>{button Edit}</div> —
// title dan tombol SIBLING, parent langsung dari h3.
function sectionButton(page, title, buttonText) {
  return page.locator(`xpath=//h3[normalize-space(text())=${JSON.stringify(title)}]/parent::div//button[normalize-space(text())=${JSON.stringify(buttonText)}]`).first();
}

// Hasil dicari DI DALAM panel yang SEDANG TERBUKA saja, bukan di seluruh
// halaman -- `button:has-text(resultText)` global bisa mengenai tombol
// PEMICU LocationPicker LAIN yang sudah terisi (mis. pemicu POD lane 1
// "Jakarta (Tanjung Priok)", yang ada LEBIH DULU di urutan DOM daripada
// opsi dropdown lane 2 yang baru dibuka) dan `.first()` mengambil yang
// salah, meninggalkan lane yang dimaksud tetap kosong TANPA error. Panel
// = dua tingkat ancestor dari input pencarian (input -> span pencarian ->
// div popover `position:fixed`, src/kit/LocationPicker.jsx:290-302); karena
// hanya SATU LocationPicker pernah `open` di satu waktu sepanjang alur ini
// (popover lain yang sudah dipilih otomatis unmount, `{open && (...)}`),
// input pencarian ini SELALU unik di DOM saat dipanggil. Pemilihan opsi
// memakai teks PERSIS (bukan substring) pada <span> NAMA lokasi SAJA
// (`:has(span:text-is(...))`, bukan cocok ke seluruh tombol yang juga
// memuat kode+tipe+negara tergabung tanpa pemisah) -- substring "Jakarta"
// cocok DUA opsi sekaligus: "Jakarta (Tanjung Priok)" DAN "Soekarno-Hatta
// Airport (Jakarta)".
async function pickLocation(page, triggerLocator, searchText, resultText) {
  await triggerLocator.click();
  const searchInput = page.locator('input[placeholder="Search code or name"]');
  await searchInput.waitFor({ timeout: 10000 });
  await searchInput.fill(searchText);
  await page.waitForTimeout(300);
  const panel = page.locator('xpath=//input[@placeholder="Search code or name"]/ancestor::span[1]/parent::div');
  const result = panel.locator(`button:has(span:text-is(${JSON.stringify(resultText)}))`).first();
  await result.waitFor({ timeout: 10000 });
  await result.click();
}

// Putaran 13a -- Contact kini WAJIB di Langkah 1 (KEDUA mode). Akun fixture
// "PT Agro Sawit Kalimantan" dipakai ulang di Flow 1 DAN Flow 2 -- begitu
// salah satu flow memilih/menambah contact, flow berikutnya akan menemukan
// akun itu SUDAH punya contact (select terisi, bukan tombol "Add new
// contact" lagi). Fungsi ini menangani KEDUA keadaan, dipanggil identik di
// kedua flow. Mengembalikan string ringkas (dicetak lewat `check` pemanggil)
// supaya record uji yang dibuat (nama contact baru) bisa dilaporkan utk
// pembersihan manual -- skrip ini TIDAK PERNAH menghapus data sendiri (pola
// sama inquiry/quotation fixture, lihat komentar header berkas).
async function ensureContactSelected(page) {
  const addBtn = page.locator('button:has-text("Add new contact")').first();
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
    await settle(page, 200);
    await fieldLocator(page, 'Name', 'input').fill('QA E2E Test Contact');
    await page.locator('button:has-text("Add Contact")').first().click();
    await settle(page, 500);
    return 'contact BARU dibuat: "QA E2E Test Contact"';
  }
  const contactSelect = fieldLocator(page, 'Contact', 'select');
  if (await contactSelect.count() === 0) return null;
  const options = await contactSelect.locator('option').allTextContents();
  const firstReal = options.find((t) => t.trim() && t.trim() !== '— Select contact —' && t.trim() !== 'Add new contact');
  if (!firstReal) return null;
  await contactSelect.selectOption({ label: firstReal });
  return `contact LAMA dipilih: "${firstReal.trim()}"`;
}

// Login GoTrue password-grant -- diekstrak (Putaran 5 K1a, Task 2) dari kode
// IIFE utama supaya bisa dipakai LAGI utk re-login akun KEDUA (flow ketiga,
// akun manager) tanpa menduplikasi parsing respons. Perilaku utk login
// PERTAMA byte-identik.
async function loginSession(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) { console.error(`login gagal (${email}): HTTP ${r.status}`); process.exit(1); }
  const s = await r.json();
  return { access_token: s.access_token, refresh_token: s.refresh_token, token_type: s.token_type,
    expires_in: s.expires_in, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in, user: s.user };
}

// ── Ronde "Lane Editor", Tahap B — helper utk blok "Route Options" (Detail
// Inquiry, DealDetailPage.jsx) DAN tabel lane wizard (keduanya kini memakai
// `src/kit/LaneTable.jsx` yang sama sejak ekstraksi kit). Struktur nyata
// (LaneTable.jsx:48-127): <div wrapper><div>{h4 "Route options (N)"}{Add
// lane?}</div><div border>{row header grid}{row data grid}*N</div></div> --
// h4 adalah SIBLING dari div bordered-container (following-sibling dari
// PARENT h4, bukan dari h4 itu sendiri). Baris data dihitung dari STRUKTUR
// (anak container dikurangi 1 baris header), bukan dari teks heading "(N)"
// itu sendiri -- heading diturunkan dari state yang SAMA yang mau
// diverifikasi, jadi menghitung lewat heading saja tautologis.
function laneTableContainer(page) {
  return page.locator('xpath=//h4[starts-with(normalize-space(.), "Route options")]/parent::div/following-sibling::div[1]').first();
}
// Baris index-0 = header (background tokens.bg, bukan baris data) -- lane ke-i
// (0-based) = anak ke (i+1). `nth()` di-resolve ULANG setiap dipanggil (lazy),
// aman dipakai berkali-kali setelah state React berubah (reorder/add/remove)
// tanpa memegang handle basi dari render sebelumnya.
function laneRow(page, i) { return laneTableContainer(page).locator('> div').nth(i + 1); }
async function laneRowCount(page) { return Math.max(0, await laneTableContainer(page).locator('> div').count() - 1); }

// FieldWrap (DealDetailPage.jsx, dealOverviewFieldInputs.jsx:41-48):
// <div><span>{label}</span>{sibling}</div> -- label SPAN (beda dari
// fieldLocator wizard di atas, yang label-nya DIV/Field()). Dipakai utk
// baca nilai read-only "Port of Loading"/"Port of Discharge" section
// "Route & Terms" (DealDetailPage.jsx:1954-1955, SELALU editing={false} --
// baca langsung inquiry.pol/pod, mirror kolom yang disinkron RPC
// update_inquiry_lanes dari lane PERTAMA setelah urutan baru).
function dealFieldValue(page, label) {
  return page.locator(
    `xpath=//span[starts-with(normalize-space(.), ${JSON.stringify(label)})][not(.//span[starts-with(normalize-space(.), ${JSON.stringify(label)})])]/following-sibling::*[1]`
  ).first();
}

(async () => {
  // Diangkat ke sini (semula dideklarasikan di dalam Flow 1) supaya tetap
  // ada untuk Flow 4 dan tally akhir walau Flow 1-3 dilewati (--only 4).
  // Isi/urutan Flow 1-4 di bawah TIDAK disentuh -- hanya dibungkus gate ini.
  const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed') });
  const consoleErrors = [];
  let inquiryNo = null, inquiryId = null;

  if (ONLY !== '4') {
  console.log(`e2e-inquiry-wizard — ${BASE} · project ${REF} · akun ${ACCOUNT}\n`);

  const PASSWORD = await resolvePassword();
  const session = await loginSession(ACCOUNT, PASSWORD);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* mode privat */ } }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(String(e.message || e).slice(0, 160)));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);

  // Putaran 13a Task 3 -- Flow 1 dibungkus try/catch sendiri (lihat
  // recordFlowFailure di atas): kalau langkah apa pun di bawah throw, D2D/
  // Flow 2/Flow 3 TETAP lanjut jalan (memakai `page`/`browser` yang sama,
  // masih valid walau satu aksi gagal) alih-alih proses mati total seperti
  // sebelum perbaikan ini.
  try {
  // ── buka wizard baru (CREATE-only; edit kini inline di DealDetailPage,
  // InquiryFormPage.jsx dipensiunkan Putaran 15 Task 1) ───────────────────
  await page.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  // Putaran 13a -- H1 diganti "Inquiry Intake Form" (mockup baris 43, nol
  // subtitle di bawahnya -- lihat PROGRESS.md/laporan putaran ini).
  check('Wizard Intake Form terbuka', await page.locator('h1:text-is("Inquiry Intake Form")').count() > 0,
    (await page.title()));

  // ── negatif (FIX 6): Warehousing/General Trading TIDAK ADA di kartu
  // Service Type — dicek di langkah 2 (step pill ke-2, bisa diklik langsung
  // tanpa mengisi langkah 1 dulu, pola navigasi pill bebas mockup). ───────
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  check('Kartu "Warehousing" tidak ada di Service Type', await page.locator('button:has-text("Warehousing")').count() === 0);
  check('Kartu "General Trading" tidak ada di Service Type', await page.locator('button:has-text("General Trading")').count() === 0);
  check('Kartu "Customs Clearance" ADA (sanity -- bukan daftar kosong)', await page.locator('button:has-text("Customs Clearance")').count() > 0);
  check('Kartu "Door to Door" ADA', await page.locator('button:has-text("Door to Door")').count() > 0);

  // ── Langkah 1 — Customer & Contact ─────────────────────────────────────
  // Putaran 13a (D1) -- toggle "Sumber" (Prospect/Customer) DICABUT, SATU
  // kolom "Customer" gabungan menggantikannya (placeholder mockup persis).
  await stepPill(page, 'Customer & Contact').click();
  await settle(page);
  const accountInput = page.locator('input[placeholder="Search account name or account code…"]');
  await accountInput.fill('PT Agro Sawit Kalimantan');
  await page.waitForTimeout(400);
  const accountBtn = page.locator('button:has-text("PT Agro Sawit Kalimantan")').first();
  const accountFound = await accountBtn.count() > 0;
  check('Akun "PT Agro Sawit Kalimantan" ditemukan di pencarian Customer', accountFound,
    accountFound ? '' : 'akun tidak ada di daftar staging hari ini -- cek data, bukan skrip');
  if (accountFound) await accountBtn.click();
  await settle(page);
  const sourceText = (await fieldLocator(page, 'Source', 'div').innerText().catch(() => '')).trim();
  check('Source akun tampil "referral" (read-only)', sourceText === 'referral', `dapat: "${sourceText}"`);
  // Putaran 13a -- Contact kini WAJIB (D3). Pilih/tambah SEBELUM lanjut,
  // supaya Create di akhir flow ini tidak ditolak validasi baru.
  const contactResult1 = await ensureContactSelected(page);
  check('Contact terisi (Langkah 1, Flow 1)', !!contactResult1, contactResult1 || 'nol contact terpilih/ditambahkan');
  if (contactResult1) { console.log(`    i Contact — ${contactResult1}`); testDataLog.push(`Flow 1 — contact: ${contactResult1}`); }

  // ── Langkah 2 — Service & Direction: pilih Customs Clearance ───────────
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  await page.locator('button:has-text("Customs Clearance")').first().click();
  await settle(page);

  // ── Langkah 3 — Route & Terms: POL Singapore / POD Jakarta ─────────────
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of loading…")'), 'Singapore', 'Singapore');
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of discharge or city…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
  await settle(page);

  // ── balik ke Langkah 2 — assert Direction otomatis Import, isi Customer
  // Role + Undername (Customs Clearance = inline di langkah svc, BUKAN di
  // langkah "customs" — itu khusus Door-to-Door). ─────────────────────────
  await stepPill(page, 'Service & Direction').click();
  await settle(page, 300);
  const importActive = await page.locator('button:text-is("Import")').evaluate((el) => getComputedStyle(el).backgroundColor);
  // Pill aktif = background navy (#1B4D8A → rgb(27, 77, 138)); pill tak aktif = putih.
  check('Direction otomatis "Import" (POL non-Indonesia, POD Indonesia)', /27,\s*77,\s*138/.test(importActive || ''), importActive);

  await page.locator('button:text-is("Consignee")').click();
  await page.locator('label:has-text("Undername import") input[type="checkbox"]').check();
  await settle(page, 300);

  const iorSelect = fieldLocator(page, 'Importer of Record', 'select');
  const iorOptions = await iorSelect.locator('option').allTextContents();
  const iorOk = iorOptions.some((t) => t.includes('PT Sentra Impor Nusantara'));
  check('Opsi "PT Sentra Impor Nusantara" ada di Importer of Record', iorOk, iorOk ? '' : `opsi tersedia: ${JSON.stringify(iorOptions)}`);
  if (iorOk) await iorSelect.selectOption({ value: 'PT Sentra Impor Nusantara' });

  const dutiesSelect = fieldLocator(page, 'Duties & Taxes', 'select');
  const dutiesDefault = await dutiesSelect.inputValue();
  check('Duties & Taxes sudah terisi default (FIX 1) saat Undername dicentang', dutiesDefault === 'Included in price', `nilai: "${dutiesDefault}"`);

  await page.locator('label:has-text("Supporting documents from the customer") input[type="checkbox"]').check();
  await settle(page, 300);

  // ── Langkah 3 lagi — container FCL 20', Number of containers, Add route
  // option sampai 2 lane (lane kedua butuh POD diisi manual — lane pertama
  // sudah lengkap dari POL/POD di atas; lihat komentar FIX 3 di kode wizard:
  // startLanes mewarisi POD HANYA ke lane pertama, lane kedua sengaja kosong
  // supaya pembandingan rute beda tujuan bisa diisi). ─────────────────────
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  await page.locator('button:text-is("FCL 20\'")').click();
  // Kartu duplikat (jika data staging kebetulan punya pasangan akun+rute+
  // kontainer yang sama dalam 30 hari) butuh alasan sebelum Create — diisi
  // defensif di sini supaya kebetulan itu tidak menggagalkan alur sukses.
  await settle(page, 600);
  const dupReasonBox = page.locator('textarea[placeholder="Explain why this is a separate shipment…"]');
  if (await dupReasonBox.count() > 0) {
    await dupReasonBox.fill('Uji e2e otomatis -- rute terpisah dari kebetulan histori data staging.');
  }
  const nContainersInput = fieldLocator(page, 'Number of containers', 'input');
  await nContainersInput.fill('2');

  // "Add route option" (InquiryIntakeWizardPage.jsx:790, `startLanes`) --
  // tombol wizard-LOKAL, DI LUAR LaneTable, yang mentransisikan laneMode
  // false->true dan men-seed 2 lane langsung. BUKAN tombol "Add lane" milik
  // LaneTable sendiri (itu baru muncul SESUDAH laneMode true, utk menambah
  // lane ke-3+) -- teksnya TIDAK berubah oleh kit extraction, nol regresi
  // di titik ini (koreksi atas kesimpulan awal yang sempat salah).
  await page.locator('button:has-text("Add route option")').click();
  await settle(page);
  const laneHeading = await page.locator('h4:has-text("Route options")').innerText().catch(() => '');
  check('Heading lane menunjukkan 2 lane setelah "Add lane" (sanity teks)', laneHeading.includes('(2)'), laneHeading);
  const laneCountAfterAdd = await laneRowCount(page);
  check('Tabel lane (struktur, bukan teks heading) punya tepat 2 baris setelah "Add lane"', laneCountAfterAdd === 2, `dapat: ${laneCountAfterAdd}`);
  const lane2PodTrigger = page.locator('button:has-text("Port of Discharge")').first();
  const lane2PodWasEmpty = await lane2PodTrigger.count() > 0;
  if (lane2PodWasEmpty) {
    await pickLocation(page, lane2PodTrigger, 'Jakarta', 'Jakarta (Tanjung Priok)');
    await settle(page, 300);
  }
  // Assert eksplisit pasca-pilih -- bukti lane 2 BENAR terisi (bukan lane 1
  // yang kena klik berulang kalau pickLocation salah memilih tombol), dan
  // nol placeholder POD kosong tersisa di MANA PUN tabel lane (dua lane,
  // keduanya wajib terisi sampai titik ini).
  const emptyPodCount = await page.locator('button:has-text("Port of Discharge")').count();
  check('Nol tombol POD placeholder "Port of Discharge" (kosong) tersisa di tabel lane', emptyPodCount === 0, `tersisa: ${emptyPodCount}`);
  const jakartaPodCount = await page.locator('button:has-text("Jakarta (Tanjung Priok)")').count();
  check('Lane 2 (dan lane 1) sama-sama menampilkan "Jakarta (Tanjung Priok)" di kolom POD', jakartaPodCount >= 2, `jumlah tombol ber-"Jakarta (Tanjung Priok)": ${jakartaPodCount}`);

  // ── Langkah 4 — Cargo: Weight "1,5" / Volume "2,25" (TD-285, FIX 2) ────
  await stepPill(page, 'Cargo').click();
  await settle(page);
  const weightInput = fieldLocator(page, 'Total Weight', 'input');
  await weightInput.fill('1,5');
  await weightInput.blur();
  const volumeInput = fieldLocator(page, 'Volume', 'input');
  await volumeInput.fill('2,25');
  await volumeInput.blur();
  await settle(page, 300);
  const weightAfterBlur = await weightInput.inputValue();
  const volumeAfterBlur = await volumeInput.inputValue();
  check('Weight "1,5" diformat ulang id-ID saat blur (bukan dibuang/NaN)', weightAfterBlur === '1,5', `dapat: "${weightAfterBlur}"`);
  check('Volume "2,25" diformat ulang id-ID saat blur', volumeAfterBlur === '2,25', `dapat: "${volumeAfterBlur}"`);

  // ── Langkah 5 — Additional Services: pilih "Cargo Insurance" (BUKAN
  // "Undername" -- sudah ada checkbox Undername terpisah di langkah lain,
  // menghindari pencampuran konsep) supaya assert Review "Additional
  // Services bila diisi" (5a) teruji sungguhan, bukan trivial-kosong.
  // STEPS_DEFAULT (service_type Customs Clearance, bukan Door-to-Door)
  // memuat 'addl' sebagai step kelima -- InquiryIntakeWizardPage.jsx:96. ──
  await stepPill(page, 'Additional Services').click();
  await settle(page);
  await page.locator('button:has-text("Cargo Insurance")').click();
  await settle(page, 300);

  // ── Langkah 6 — Commercial: assert negatif "abc" dulu (FIX 2), baru isi
  // Estimated yang benar "1.500.000". ─────────────────────────────────────
  await stepPill(page, 'Commercial').click();
  await settle(page);
  const estInput = fieldLocator(page, 'Estimated (intake)', 'input');
  await estInput.fill('abc');
  await settle(page, 300);
  check('Estimated "abc" memunculkan "Angka tidak dikenali" inline', await page.locator('text="Angka tidak dikenali"').count() > 0);

  // coba Create sementara "abc" masih di field -- harus DITOLAK: handleCreate
  // (stepErrors) melempar wizard BALIK ke step "Commercial" begitu diklik.
  // Tombol dipastikan TERLIHAT dulu sebelum diklik (klik "membabi buta" ke
  // selector yang belum tentu match menutupi akar masalah sesungguhnya kalau
  // tombolnya tidak ada) -- dan assert "ditolak" memeriksa DUA hal, bukan
  // satu: URL tidak berubah (ini SELALU benar sampai Create sungguhan
  // sukses, jadi sendirian ia trivial) DAN wizard benar-benar pindah ke pill
  // "6. Commercial" (bukti nyata jalur jump-on-error jalan, bukan sekadar
  // klik yang tidak mengenai
  // apa pun).
  await stepPill(page, 'Review').click();
  await settle(page);
  const createBtnLocator = page.locator('button:text-is("Create Inquiry")');
  const createVisibleBeforeBadAttempt = await createBtnLocator.isVisible().catch(() => false);
  check('Tombol "Create Inquiry" terlihat di step Review (sebelum percobaan Create yang ditolak)', createVisibleBeforeBadAttempt);
  const urlBeforeBadCreate = page.url();
  if (createVisibleBeforeBadAttempt) await createBtnLocator.click();
  await settle(page, 500);
  check('Create DITOLAK selama Estimated "abc" tak dikenali (URL tidak pindah ke Detail Inquiry)',
    page.url() === urlBeforeBadCreate, page.url());
  check('Wizard berpindah balik ke step "6. Commercial" setelah Create ditolak (jump-on-error stepErrors)',
    await isStepActive(page, 'Commercial'));

  // handleCreate melompat ke step PERTAMA yang errornya ditemukan
  // stepErrors() (urutan: cust_account, svc_*, under_*, route_*, cargo_*,
  // commercial_*). Klik pill "6. Commercial" EKSPLISIT di sini -- bukan
  // hanya mengandalkan lompatan otomatis di atas -- supaya alur tetap aman
  // kalau field lain kebetulan ikut tidak valid (stepErrors menemukan error
  // itu lebih dulu dan wizard melompat ke step lain; tanpa klik eksplisit
  // ini, fieldLocator('Estimated...') berikutnya menunggu 30 detik lalu
  // timeout).
  await stepPill(page, 'Commercial').click();
  await settle(page);
  await estInput.fill('1.500.000');
  await estInput.blur();
  await settle(page, 300);
  check('"Angka tidak dikenali" hilang setelah Estimated diperbaiki', await page.locator('text="Angka tidak dikenali"').count() === 0);

  // ── Create sungguhan — klik "Next" (BUKAN pill "N. Review") sampai tombol
  // "Create Inquiry" terlihat, sesuai instruksi review: jalur ini tidak
  // bergantung pada index SK[] mana pun. Assert eksplisit tombol TERLIHAT
  // sebelum diklik -- kalau tombolnya TIDAK PERNAH muncul walau sudah di
  // step terakhir, itu gejala APLIKASI (dilaporkan apa adanya, bukan
  // ditambal di sini). Tangkap inquiry_no dari RESPON RPC (kebenaran
  // network-level, bukan menebak dari toast yang bisa hilang sebelum
  // dibaca). ──
  const reachedReview = await goToReviewViaNext(page);
  check('Step Review tercapai via "Next" setelah Estimated diperbaiki', reachedReview);

  // ── Isi Review step (5a) — Cargo/Undername/Additional Services, SEBELUM
  // klik "Create Inquiry". Label persis ReviewRow (InquiryIntakeWizardPage.jsx
  // fungsi ReviewStep, baris 1054-1152); ReviewRow = <div><div>{label}</div>
  // <span>{value}</span></div> -- bentuk SAMA dgn Field() yang fieldLocator
  // sudah dibangun utk, jadi dipakai ulang apa adanya. ──────────────────────
  if (reachedReview) {
    const weightReview = (await fieldLocator(page, 'Total Weight (KG)', 'span').innerText().catch(() => '')).trim();
    check('Review step menampilkan Total Weight (KG) "1,5"', weightReview === '1,5', `dapat: "${weightReview}"`);
    const volumeReview = (await fieldLocator(page, 'Volume (CBM)', 'span').innerText().catch(() => '')).trim();
    check('Review step menampilkan Volume (CBM) "2,25"', volumeReview === '2,25', `dapat: "${volumeReview}"`);
    const iorReview = (await fieldLocator(page, 'Importer of Record', 'span').innerText().catch(() => '')).trim();
    check('Review step menampilkan Importer of Record "PT Sentra Impor Nusantara"', iorReview.includes('PT Sentra Impor Nusantara'), `dapat: "${iorReview}"`);
    const dutiesReview = (await fieldLocator(page, 'Duties & Taxes', 'span').innerText().catch(() => '')).trim();
    check('Review step menampilkan Duties & Taxes "Included in price"', dutiesReview === 'Included in price', `dapat: "${dutiesReview}"`);
    const addlReview = (await fieldLocator(page, 'Additional Services', 'span').innerText().catch(() => '')).trim();
    check('Review step menampilkan Additional Services "Cargo Insurance" (bila diisi)', addlReview.includes('Cargo Insurance'), `dapat: "${addlReview}"`);
  }

  // ── Putaran 12 Butir 5 (validasi lane identik, migrasi
  // 20261029000001_crm_lane_validation_and_direction.sql) — SEBELUM lane 2
  // dibedakan dari lane 1, kedua lane di titik ini MASIH identik (sama POL/
  // POD/Mode/Load unit, warisan "Add route option" di atas). Klik Create
  // Inquiry di sini WAJIB ditolak RPC dengan pesan baku -- ini perilaku yang
  // DIHARAPKAN (aturan bisnis baru), BUKAN kegagalan RPC yang tak terduga,
  // jadi TIDAK memakai label "Diagnostik" ala captureRejectionDiagnostics.
  // Variabel lokal (dup*) sengaja TIDAK memakai nama rpcResp/inquiryNo/
  // inquiryId di luar blok ini supaya nol tabrakan dengan percobaan
  // sungguhan di bawah. ──────────────────────────────────────────────────────
  const dupRpcPromise = page.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 20000 }).catch(() => null);
  const createVisibleForDupCheck = await createBtnLocator.isVisible().catch(() => false);
  if (createVisibleForDupCheck) await createBtnLocator.click();
  const dupRpcResp = await dupRpcPromise;
  check('[Lane identik] RPC create_inquiry_with_lanes DITOLAK selagi 2 lane masih identik', !!dupRpcResp && !dupRpcResp.ok(), dupRpcResp ? `HTTP ${dupRpcResp.status()}` : 'nol respon tertangkap');
  await settle(page, 500);
  const dupToastText = (await page.locator('[class*="toast" i], [role="alert" i], [role="status" i]').allInnerTexts().catch(() => [])).filter(Boolean);
  check('[Lane identik] Toast "Two or more lanes are identical..." tampil',
    dupToastText.some((t) => t.includes('Two or more lanes are identical (same Port of Loading, Port of Discharge, Mode, and Load Unit).')),
    `toast sebenarnya: ${JSON.stringify(dupToastText)}`);
  check('[Lane identik] URL TIDAK pindah ke Detail Inquiry (masih di wizard)', page.url().endsWith('/crm/inquiry/new'), page.url());

  // ── Bedakan lane 2 dari lane 1 supaya payload berikutnya LOLOS validasi
  // "lane identik": Mode lane 2 diganti "Sea LCL" (lane 1 tetap "Sea FCL").
  // POD TETAP SAMA ("Jakarta (Tanjung Priok)") -- dua lane boleh berbagi POD
  // yang sama, asalkan Mode ATAU Load unit berbeda; cek baris di atas
  // ("kedua lane sama-sama menampilkan Jakarta di kolom POD") tetap
  // bermakna. `onChange` LaneTable.jsx (`unitForMode`, src/kit/laneUtils.js)
  // otomatis ikut mengubah load_unit -> "CBM" begitu Mode diganti dari
  // "Sea FCL" -- SATU select yang disentuh skrip, DUA field yang akhirnya
  // berbeda (cara paling sederhana, nol logika baru di skrip). ─────────────
  await stepPill(page, 'Route & Terms').click();
  await settle(page, 300);
  await laneRow(page, 1).locator('select').nth(0).selectOption('Sea LCL');
  await settle(page, 300);
  const lane2ModeUnitAfterDiff = await laneRow(page, 1).locator('select').evaluateAll((els) => els.map((el) => el.value));
  check('Lane 2 Mode diganti "Sea LCL" (beda dari lane 1 "Sea FCL")', lane2ModeUnitAfterDiff[0] === 'Sea LCL', `dapat: ${JSON.stringify(lane2ModeUnitAfterDiff)}`);
  check('Lane 2 Load unit ikut berubah "CBM" (unitForMode, bukan disentuh manual)', lane2ModeUnitAfterDiff[1] === 'CBM', `dapat: ${JSON.stringify(lane2ModeUnitAfterDiff)}`);
  const lane1ModeUnitStillFcl = await laneRow(page, 0).locator('select').evaluateAll((els) => els.map((el) => el.value));
  check('Lane 1 TIDAK ikut berubah (tetap "Sea FCL"/"Container")', lane1ModeUnitStillFcl[0] === 'Sea FCL' && lane1ModeUnitStillFcl[1] === 'Container', `dapat: ${JSON.stringify(lane1ModeUnitStillFcl)}`);

  const reachedReviewAgain = await goToReviewViaNext(page);
  check('Step Review tercapai lagi setelah lane dibedakan', reachedReviewAgain);

  const createVisibleForReal = await createBtnLocator.isVisible().catch(() => false);
  check('Tombol "Create Inquiry" terlihat sebelum diklik (percobaan sungguhan)', createVisibleForReal);

  const rpcRespPromise = page.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 20000 }).catch(() => null);
  if (createVisibleForReal) await createBtnLocator.click();
  const rpcResp = await rpcRespPromise;
  inquiryNo = null; inquiryId = null; // outer-scoped (hoisted di atas) -- BUKAN `let` baru, supaya tally akhir (luar blok --only) membacanya
  if (rpcResp && rpcResp.ok()) {
    const body = await rpcResp.json().catch(() => null);
    const row = Array.isArray(body) ? body[0] : body;
    inquiryNo = row?.inquiry_no || null;
    inquiryId = row?.id || null;
  }
  const rpcOk = check('RPC create_inquiry_with_lanes merespon sukses', !!rpcResp && rpcResp.ok(), rpcResp ? `HTTP ${rpcResp.status()}` : 'nol respon tertangkap');
  await settle(page, 800);
  // Diagnostik (dicetak apa adanya, TIDAK ditambal di sini) kalau Create
  // ditolak lagi walau Estimated sudah benar -- berarti stepErrors()
  // menemukan error LAIN lebih dulu (lihat urutan di dalamnya: cust_account,
  // svc_*, under_*, route_*, cargo_*, commercial_*) dan handleCreate kembali
  // ke `return` sebelum RPC sempat dipanggil (RPC TIDAK PERNAH menolak --
  // ia tidak pernah dipanggil sama sekali, konsisten dengan rpcResp null di
  // sini). Pill aktif menunjukkan KE STEP APA ia melompat; FieldError
  // menunjukkan KUNCI mana yang gagal; screenshot untuk verifikasi visual.
  if (!rpcOk) {
    const shotPath = '/tmp/e2e-wizard-after-reject.png';
    const diag = await captureRejectionDiagnostics(page, shotPath);
    console.log(`  ⚠ Diagnostik (Create ditolak client-side, RPC tak terpanggil) --`);
    console.log(`      pill aktif saat ini: ${diag.activePill || '(tak terdeteksi -- nol pill berwarna navy solid)'}`);
    console.log(`      FieldError merah terlihat: ${JSON.stringify(diag.fieldErrors)}`);
    console.log(`      toast terlihat: ${JSON.stringify(diag.toastText)}`);
    console.log(`      screenshot: ${shotPath} · URL saat ini: ${page.url()}`);
  }
  check('Toast sukses tampil', (await page.locator('text=/Inquiry created/i').count()) > 0 || !!inquiryNo);
  // Rute Detail Inquiry sungguhan = /crm/inquiry/status-history/<id> (menu
  // "Inquiry Status & History" -- src/routes/menu-skeleton.js, redirect lama
  // /crm/inquiry/:id -> /crm/inquiry/status-history/:id), BUKAN
  // /crm/inquiry/<id> polos; `(?:status-history\/)?` opsional supaya tetap
  // cocok kalau rutenya berubah kembali ke bentuk pendek di masa depan.
  check('Pindah ke Detail Inquiry setelah Create', /\/crm\/inquiry\/(?:status-history\/)?[0-9a-f-]{36}$/i.test(page.url()), page.url());

  console.log(`\n  → Nomor inquiry yang dibuat: ${inquiryNo || '(tidak tertangkap dari respon RPC — cek manual di Detail Inquiry/DB)'}  ${inquiryId ? `(id: ${inquiryId})` : ''}`);
  testDataLog.push(`Flow 1 — inquiry: ${inquiryNo || '(tidak tertangkap)'}${inquiryId ? ` (id: ${inquiryId})` : ''}`);

  // ── Detail Inquiry: blok "Route Options" (SectionHeader <h3> + LaneTable
  // <h4> bersarang sejak kit extraction -- lihat laneTableContainer di atas)
  // berisi 2 baris (lane 1 Sea FCL/Container, lane 2 Sea LCL/CBM -- sengaja
  // dibedakan, lihat blok "Bedakan lane 2" di atas; verifikasi fix 5c
  // end-to-end, item a), + POL/POD read-only saat edit section Route &
  // Terms (FIX 5). ───────────────────────────────────────────────────────
  await settle(page, 800);
  // waitFor({state:'visible'}) -- bukan cek instan -- supaya timing render
  // Detail Inquiry sesaat sesudah Create (kemungkinan flaky, dicurigai dari
  // run sebelumnya: setiap check LAIN yang terkait blok ini lulus normal
  // tepat sesudahnya) punya jendela wajar sampai 10 detik sebelum dianggap
  // benar-benar gagal. Assertion lain di flow ini TIDAK disentuh.
  let routeOptionsHeaderVisible = true;
  try {
    await page.locator('h3:text-is("Route Options")').first().waitFor({ state: 'visible', timeout: 10000 });
  } catch { routeOptionsHeaderVisible = false; }
  check('Section "Route Options" (SectionHeader) tampil di Detail Inquiry', routeOptionsHeaderVisible);
  const routeOptionsHeading = await page.locator('h4:has-text("Route options")').innerText().catch(() => '');
  check('Heading LaneTable menunjukkan 2 lane (sanity teks)', routeOptionsHeading.includes('(2)'), routeOptionsHeading);
  const detailLaneCount = await laneRowCount(page);
  check('Blok Route Options (struktur, bukan teks heading) punya tepat 2 baris', detailLaneCount === 2, `dapat: ${detailLaneCount}`);

  // item (a) -- Mode/Load unit lane 1 harus Sea FCL/Container (kontainer
  // dipilih "FCL 20'" di wizard; sebelum fix 5c, blankLane/startLanes
  // hardcode Sea LCL/CBM utk jalur lane-mode -- gejala MSI-INQ-X-2026-0024).
  // Lane 2 SENGAJA berbeda (Sea LCL/CBM, lihat blok "Bedakan lane 2" di
  // atas) -- validasi lane identik Putaran 12 Butir 5 menolak dua lane
  // ber-Mode/Load unit sama persis, jadi lane 2 di sini TIDAK BOLEH lagi
  // Sea FCL/Container sejak fixture ini dibedakan.
  if (detailLaneCount >= 2) {
    const row0ModeUnit = await laneRow(page, 0).locator('select').evaluateAll((els) => els.map((el) => el.value));
    const row1ModeUnit = await laneRow(page, 1).locator('select').evaluateAll((els) => els.map((el) => el.value));
    check('Lane 1 Detail Inquiry menunjukkan Mode "Sea FCL"', row0ModeUnit[0] === 'Sea FCL', `dapat: ${JSON.stringify(row0ModeUnit)}`);
    check('Lane 1 Detail Inquiry menunjukkan Load unit "Container"', row0ModeUnit[1] === 'Container', `dapat: ${JSON.stringify(row0ModeUnit)}`);
    check('Lane 2 Detail Inquiry menunjukkan Mode "Sea LCL" (sengaja beda dari lane 1)', row1ModeUnit[0] === 'Sea LCL', `dapat: ${JSON.stringify(row1ModeUnit)}`);
    check('Lane 2 Detail Inquiry menunjukkan Load unit "CBM" (sengaja beda dari lane 1)', row1ModeUnit[1] === 'CBM', `dapat: ${JSON.stringify(row1ModeUnit)}`);
  }

  const routeEditBtn = sectionButton(page, 'Route & Terms', 'Edit');
  check('Tombol Edit "Route & Terms" ditemukan', await routeEditBtn.count() > 0);
  if (await routeEditBtn.count() > 0) {
    await routeEditBtn.click();
    await settle(page, 300);
    check('Catatan POL/POD terkunci tampil saat edit Route & Terms',
      (await page.locator("text=/Port of Loading and Port of Discharge come from this inquiry's route options/i").count()) > 0);
    check('LocationPicker POL/POD TIDAK muncul (read-only, bukan editable)',
      (await page.locator('button:has-text("Select port of loading…")').count()) === 0
      && (await page.locator('button:has-text("Select port of discharge or city…")').count()) === 0);
    // editingSection adalah state TUNGGAL (satu section aktif sekaligus,
    // dealOverviewFieldInputs.jsx) -- Cancel dulu sebelum masuk edit Route
    // Options, kalau tidak klik Edit di bawah tidak akan berefek.
    const routeCancelBtn = sectionButton(page, 'Route & Terms', 'Cancel');
    if (await routeCancelBtn.count() > 0) { await routeCancelBtn.click(); await settle(page, 300); }
  }

  // ── item (c): Edit Route Options — tambah lane ke-3, tukar urutan, Save,
  // reload, assert jumlah+urutan persisten DAN POL/POD header (mirror sync
  // inquiries.pol/pod) mengikuti lane pertama baru. Lane ke-3 SENGAJA dibalik
  // (POL Jakarta / POD Singapore, kebalikan lane 1 & 2 yang sama-sama
  // Singapore→Jakarta) supaya hasil reorder bisa DIBUKTIKAN dari konten,
  // bukan ditebak. ──────────────────────────────────────────────────────────
  const routeOptionsEditBtn = sectionButton(page, 'Route Options', 'Edit');
  check('Tombol Edit "Route Options" ditemukan', await routeOptionsEditBtn.count() > 0);
  let laneEditorOk = false;
  if (await routeOptionsEditBtn.count() > 0) {
    await routeOptionsEditBtn.click();
    await settle(page, 300);
    await page.locator('button:has-text("Add lane")').click();
    await settle(page, 300);
    const countAfterAdd3rd = await laneRowCount(page);
    check('Lane ke-3 bertambah (3 baris) setelah "Add lane" di editor Route Options', countAfterAdd3rd === 3, `dapat: ${countAfterAdd3rd}`);
    if (countAfterAdd3rd === 3) {
      const lane3Pol = laneRow(page, 2).locator('> div').nth(1).locator('button').first();
      await pickLocation(page, lane3Pol, 'Jakarta', 'Jakarta (Tanjung Priok)');
      await settle(page, 300);
      const lane3Pod = laneRow(page, 2).locator('> div').nth(2).locator('button').first();
      await pickLocation(page, lane3Pod, 'Singapore', 'Singapore');
      await settle(page, 300);

      // Tukar urutan: klik "Move up" baris index-2 (lane-3 pindah ke index-1),
      // lalu klik "Move up" baris index-1 (pindah lagi ke index-0). Locator
      // di-resolve ULANG tiap klik (lazy) -- aman walau konten di posisi itu
      // berubah antar-klik.
      await laneRow(page, 2).locator('button[title="Move up"]').click();
      await settle(page, 300);
      await laneRow(page, 1).locator('button[title="Move up"]').click();
      await settle(page, 300);

      const row0PolBefore = (await laneRow(page, 0).locator('> div').nth(1).innerText().catch(() => '')).trim();
      const row0PodBefore = (await laneRow(page, 0).locator('> div').nth(2).innerText().catch(() => '')).trim();
      check('Sebelum Save: baris 1 (hasil reorder) POL "Jakarta (Tanjung Priok)"', row0PolBefore.includes('Jakarta (Tanjung Priok)'), `dapat: "${row0PolBefore}"`);
      check('Sebelum Save: baris 1 (hasil reorder) POD "Singapore"', row0PodBefore.includes('Singapore'), `dapat: "${row0PodBefore}"`);

      const laneSaveBtn = sectionButton(page, 'Route Options', 'Save');
      const laneRpcPromise = page.waitForResponse((resp) => resp.url().includes('/rpc/update_inquiry_lanes'), { timeout: 20000 }).catch(() => null);
      await laneSaveBtn.click();
      const laneRpcResp = await laneRpcPromise;
      laneEditorOk = check('RPC update_inquiry_lanes merespon sukses', !!laneRpcResp && laneRpcResp.ok(), laneRpcResp ? `HTTP ${laneRpcResp.status()}` : 'nol respon tertangkap');
      await settle(page, 500);
      // Toast TIDAK diasumsikan teksnya persis "Changes saved" -- kalau beda,
      // dilaporkan apa adanya (bukan ditambal diam-diam di kode/skrip). Bukti
      // UTAMA keberhasilan (c) adalah respons RPC di atas + data pasca-reload
      // di bawah, bukan teks toast ini.
      const laneToastText = (await page.locator('[class*="toast" i], [role="alert" i], [role="status" i]').allInnerTexts().catch(() => [])).filter(Boolean);
      check('Toast tampil setelah Save Route Options (teks dicatat, tidak diasumsikan persis)', laneToastText.length > 0, `teks sebenarnya: ${JSON.stringify(laneToastText)}`);

      // Reload PENUH (bukan navigasi SPA) -- data yang diverifikasi di bawah
      // wajib datang dari DB lewat refetch, bukan state klien yang kebetulan
      // masih benar.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page, 800);

      const countAfterReload = await laneRowCount(page);
      check('Pasca-reload: jumlah lane tetap 3 (persisten)', countAfterReload === 3, `dapat: ${countAfterReload}`);
      const row0PolAfter = (await laneRow(page, 0).locator('> div').nth(1).innerText().catch(() => '')).trim();
      const row0PodAfter = (await laneRow(page, 0).locator('> div').nth(2).innerText().catch(() => '')).trim();
      check('Pasca-reload: urutan lane persisten -- baris 1 POL "Jakarta (Tanjung Priok)"', row0PolAfter.includes('Jakarta (Tanjung Priok)'), `dapat: "${row0PolAfter}"`);
      check('Pasca-reload: urutan lane persisten -- baris 1 POD "Singapore"', row0PodAfter.includes('Singapore'), `dapat: "${row0PodAfter}"`);

      const headerPol = (await dealFieldValue(page, 'Port of Loading').innerText().catch(() => '')).trim();
      const headerPod = (await dealFieldValue(page, 'Port of Discharge').innerText().catch(() => '')).trim();
      check('POL/POD "Route & Terms" (mirror inquiries.pol/pod) mengikuti lane pertama baru -- POL "Jakarta (Tanjung Priok)"', headerPol.includes('Jakarta (Tanjung Priok)'), `dapat: "${headerPol}"`);
      check('POL/POD "Route & Terms" (mirror inquiries.pol/pod) mengikuti lane pertama baru -- POD "Singapore"', headerPod.includes('Singapore'), `dapat: "${headerPod}"`);
    }
  }
  if (!laneEditorOk) console.log('  ⚠ Editor Route Options tidak sampai Save sukses -- lihat hasil check() di atas untuk titik gagalnya.');
  } catch (e) {
    await recordFlowFailure('FLOW1', 'Flow 1 (Single Shipment)', e, page);
  }

  // Putaran 13a Task 3 -- skenario D2D dibungkus try/catch TERPISAH dari
  // Flow 1 (instruksi eksplisit): kegagalannya tidak boleh ikut menyeret
  // Flow 2/Flow 3, dan sebaliknya kegagalan Flow 1 di atas tidak menghalangi
  // D2D tetap dicoba (selama `page` masih berupa Page yang terbuka).
  try {
  // =========================================================================
  // Putaran 13a (D8) -- skenario NEGATIF SAJA utk Pickup/Delivery Address
  // wajib Door to Door: Create DITOLAK saat kosong (menekan Create di sini
  // AMAN -- validasi memblokir SEBELUM RPC dipanggil sama sekali, nol data
  // tercipta); wizard harus lolos ke Review begitu keduanya terisi, TANPA
  // menekan Create lagi (instruksi eksplisit, menghindari data uji baru).
  // Wizard BARU, akun yang sama ("PT Agro Sawit Kalimantan", sudah punya
  // contact dari Flow 1 di atas).
  // =========================================================================
  console.log('\n— Skenario tambahan: Pickup/Delivery Address wajib untuk Door to Door (D8) —\n');
  await page.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await stepPill(page, 'Customer & Contact').click();
  await settle(page);
  await page.locator('input[placeholder="Search account name or account code…"]').fill('PT Agro Sawit Kalimantan');
  await page.waitForTimeout(400);
  await page.locator('button:has-text("PT Agro Sawit Kalimantan")').first().click();
  await settle(page);
  const d2dContactResult = await ensureContactSelected(page);
  check('[D2D] Contact terisi', !!d2dContactResult, d2dContactResult || 'nol contact terpilih/ditambahkan');
  if (d2dContactResult) testDataLog.push(`D2D — contact: ${d2dContactResult}`);
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  await page.locator('button:has-text("Door to Door")').first().click();
  await settle(page, 300);
  await page.locator('button:text-is("Shipper")').click();
  await settle(page);
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of loading…")'), 'Singapore', 'Singapore');
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of discharge or city…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
  await settle(page, 300);

  // -- NEGATIF: Pickup/Delivery KOSONG, tekan Create.
  await stepPill(page, 'Review').click();
  await settle(page);
  check('[D2D] Tombol "Create Inquiry" terlihat (sebelum ditekan, Pickup/Delivery masih kosong)',
    await page.locator('button:text-is("Create Inquiry")').isVisible().catch(() => false));
  let d2dRpcSeen = false;
  const d2dNoRpc = page.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 3000 })
    .then(() => { d2dRpcSeen = true; }).catch(() => {});
  await page.locator('button:text-is("Create Inquiry")').click();
  await d2dNoRpc;
  check('[D2D] Create DITOLAK saat Pickup/Delivery Address kosong (nol panggilan RPC create_inquiry_with_lanes)', !d2dRpcSeen);
  await settle(page, 300);
  check('[D2D] Wizard melompat balik ke "3. Route & Terms" setelah Create ditolak', await isStepActive(page, 'Route & Terms'));
  check('[D2D] Pesan error Pickup Address tampil', (await page.locator('text="Pickup Address is required for Door to Door."').count()) > 0);
  check('[D2D] Pesan error Delivery Address tampil', (await page.locator('text="Delivery Address is required for Door to Door."').count()) > 0);

  // -- POSITIF: isi keduanya, pastikan lolos sampai Review. Create TIDAK
  // ditekan di sini (instruksi eksplisit D8).
  await fieldLocator(page, 'Pickup Address', 'textarea').fill('Jl. Contoh Pickup No. 1, Jakarta');
  await fieldLocator(page, 'Delivery Address', 'textarea').fill('Jl. Contoh Delivery No. 2, Singapore');
  await settle(page, 200);
  await stepPill(page, 'Review').click();
  await settle(page);
  check('[D2D] Lolos ke Review setelah Pickup/Delivery Address terisi (tombol "Create Inquiry" terlihat)',
    await page.locator('button:text-is("Create Inquiry")').isVisible().catch(() => false));
  check('[D2D] Nol pesan error Pickup/Delivery tersisa', (await page.locator('text=/Address is required for Door to Door/i').count()) === 0);
  console.log('  i [D2D] Create TIDAK ditekan pada kasus positif -- nol inquiry baru tercipta dari skenario ini.');
  } catch (e) {
    await recordFlowFailure('D2D', 'Skenario D2D (Pickup/Delivery wajib untuk Door to Door)', e, page);
  }

  // =========================================================================
  // Putaran 13b -- skenario tambahan utk 8 butir W-14/W-16/W-21/W-33/W-34/
  // W-40/W-44/W-64, dibungkus try/catch SENDIRI (pola sama D2D), terpisah
  // dari Flow 1/D2D di atas dan Flow 2 (RS)/Flow 3 (MGR)/Flow 4 (ACC) di
  // bawah. `page`/`browser` SAMA (akun sales@msi.com, sesi login yang sudah
  // ada). Create TIDAK PERNAH ditekan sepanjang skenario ini -- murni
  // verifikasi UI/state, nol inquiry baru tercipta.
  // =========================================================================
  try {
  console.log('\n— Skenario tambahan (Putaran 13b): W-14/W-16/W-21/W-33/W-34/W-40/W-44/W-64 —\n');
  await page.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await stepPill(page, 'Customer & Contact').click();
  await settle(page);
  await page.locator('input[placeholder="Search account name or account code…"]').fill('PT Agro Sawit Kalimantan');
  await page.waitForTimeout(400);
  await page.locator('button:has-text("PT Agro Sawit Kalimantan")').first().click();
  await settle(page);
  const p13bContactResult = await ensureContactSelected(page);
  check('[P13b] Contact terisi', !!p13bContactResult, p13bContactResult || 'nol contact terpilih/ditambahkan');

  // ── W-14 (crShow) -- Customer Role TIDAK ADA sebelum Service Type dipilih. ──
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  check('[P13b/W-14] Customer Role TIDAK tampil sebelum Service Type dipilih',
    (await page.locator('text="Customer Role"').count()) === 0);

  // ── W-14 (sanity) -- Customer Role tampil begitu Service Type dipilih
  // (pasangan negatif dari check sebelum ini). Dipilih "Customs Clearance"
  // di sini SEKEDAR utk variasi kartu -- W-16 (Next diblok saat JCI
  // terblokir) DIPINDAH ke Flow 4 (sesi sales@msi.com, akun single-entity
  // tanpa akses JCI -- sesi akun INI (test@msi.com) super_admin, SELALU
  // punya akses JCI lewat `isSuperAdmin()`, jadi svcJciBlocked TIDAK PERNAH
  // menyala di sini apa pun yang dilakukan -- menguji W-16 di sesi ini
  // hanya akan selalu "lewat diam-diam", persis yang Mas minta dihindari). ──
  await page.locator('button:has-text("Customs Clearance")').first().click();
  await settle(page, 300);
  check('[P13b/W-14] Customer Role tampil setelah Service Type dipilih',
    (await page.locator('button:text-is("Shipper")').count()) > 0);

  // ── W-14 -- ganti ke "Door to Door" (nol JCI block utk DtD), lalu uji
  // auto-fill Customer Role dari Direction (Export->Shipper, Import->
  // Consignee, SELALU menimpa -- keputusan Den: ikut mockup apa adanya,
  // nol guard "touched"). ──────────────────────────────────────────────────
  await page.locator('button:has-text("Door to Door")').first().click();
  await settle(page, 300);
  await page.locator('button:text-is("Export")').click();
  await settle(page, 200);
  check('[P13b/W-14] Direction "Export" -> Customer Role otomatis "Shipper"',
    /27,\s*77,\s*138/.test(await page.locator('button:text-is("Shipper")').evaluate((el) => getComputedStyle(el).backgroundColor)));
  await page.locator('button:text-is("Import")').click();
  await settle(page, 200);
  check('[P13b/W-14] Direction "Import" -> Customer Role otomatis "Consignee"',
    /27,\s*77,\s*138/.test(await page.locator('button:text-is("Consignee")').evaluate((el) => getComputedStyle(el).backgroundColor)));
  // Bonus -- pilihan manual TIDAK dihormati lintas klik Direction berikutnya
  // (mockup sendiri tidak punya guard "touched" utk custRole; keputusan Den
  // "ikuti mockup apa adanya" dibuktikan lewat skenario ini, bukan ditebak).
  await page.locator('button:text-is("Third Party")').click();
  await settle(page, 200);
  await page.locator('button:text-is("Export")').click();
  await settle(page, 200);
  check('[P13b/W-14] Pilihan manual "Third Party" ditimpa lagi begitu Direction diklik ulang (Export -> Shipper, bukti nol guard "touched")',
    /27,\s*77,\s*138/.test(await page.locator('button:text-is("Shipper")').evaluate((el) => getComputedStyle(el).backgroundColor)));

  // ── W-21 -- isi Route & Terms (POL/POD/Pickup/Delivery/Cargo ready date),
  // lalu "Add route option": utk Door-to-Door, Pickup/Delivery TETAP tampil
  // (+ tetap wajib, keputusan Den); Cargo ready date HILANG (nol pengecualian
  // DtD, beda dari Pickup/Delivery). ──────────────────────────────────────
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of loading…")'), 'Singapore', 'Singapore');
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of discharge or city…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
  await settle(page, 300);
  const p13bPickupText = 'Jl. Uji P13b Pickup No. 1, Jakarta';
  await fieldLocator(page, 'Pickup Address', 'textarea').fill(p13bPickupText);
  await fieldLocator(page, 'Delivery Address', 'textarea').fill('Jl. Uji P13b Delivery No. 2, Singapore');
  await fieldLocator(page, 'Cargo ready date', 'input').fill('2027-01-15');
  await settle(page, 200);
  await page.locator('button:has-text("Add route option")').click();
  await settle(page, 300);
  check('[P13b/W-21] Door-to-Door + "Add route option": Pickup Address TETAP tampil',
    (await page.locator('text="Pickup Address"').count()) > 0);
  check('[P13b/W-21] Door-to-Door + "Add route option": Cargo ready date HILANG',
    (await page.locator('text="Cargo ready date"').count()) === 0);

  // ── W-21 -- ganti Service Type ke non-DtD ("Freight Forwarding") TANPA
  // menyentuh laneMode (sudah aktif dari langkah di atas, laneMode bukan
  // konsep per-service-type): Pickup/Delivery kini HARUS hilang (pengecualian
  // DtD tidak lagi berlaku). ──────────────────────────────────────────────
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  await page.locator('button:has-text("Freight Forwarding")').first().click();
  await settle(page, 300);
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  check('[P13b/W-21] Non-DtD + "Add route option" (laneMode tak berubah): Pickup Address HILANG',
    (await page.locator('text="Pickup Address"').count()) === 0);
  check('[P13b/W-21] Non-DtD + "Add route option": Cargo ready date tetap HILANG',
    (await page.locator('text="Cargo ready date"').count()) === 0);

  // ── W-21 -- balik ke Door-to-Door: Pickup Address harus MUNCUL LAGI
  // dengan nilai yang SAMA (state tidak pernah dikosongkan saat disembunyikan,
  // pola sama container_types RS) -- "pembatalan" di sini TIDAK lewat tombol
  // khusus (laneMode Single Shipment TIDAK PERNAH bisa dimatikan lagi lewat
  // UI begitu "Add route option" ditekan -- nol tombol "batalkan" di produk)
  // melainkan lewat ganti Service Type kembali ke Door-to-Door, satu-satunya
  // jalan UI nyata yang membuat `pickupDeliveryVisible` balik jadi true. ───
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  await page.locator('button:has-text("Door to Door")').first().click();
  await settle(page, 300);
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  const p13bPickupAfterRoundTrip = await fieldLocator(page, 'Pickup Address', 'textarea').inputValue().catch(() => null);
  check('[P13b/W-21] Door-to-Door lagi: Pickup Address MUNCUL LAGI dengan nilai yang sama (nilai tidak hilang saat disembunyikan)',
    p13bPickupAfterRoundTrip === p13bPickupText, `dapat: "${p13bPickupAfterRoundTrip}"`);

  // ── W-33/W-34/W-64 -- step "Customs & Undername" (Door-to-Door), Direction
  // masih "Export" (lihat bonus check di atas). Kunjungan PERTAMA ke step ini
  // di sesi ini -- pas utk menguji default lazy W-64 (nol kesempatan
  // sebelumnya utk pricing_basis/duties_and_taxes terisi). ─────────────────
  const p13bCustomsPill = stepPill(page, 'Customs & Undername');
  await p13bCustomsPill.click();
  await settle(page, 300);
  check('[P13b/W-64] Pricing Basis SUDAH "Itemized charges" sejak step Customs pertama kali dibuka (default lazy, bukan kosong)',
    /27,\s*77,\s*138/.test(await page.locator('button:text-is("Itemized charges")').evaluate((el) => getComputedStyle(el).backgroundColor)));
  const p13bDutiesDefault = await fieldLocator(page, 'Duties & Taxes', 'select').inputValue();
  check('[P13b/W-64] Duties & Taxes SUDAH "Included in price" sejak step Customs pertama kali dibuka (default lazy, bukan kosong)',
    p13bDutiesDefault === 'Included in price', `dapat: "${p13bDutiesDefault}"`);
  check('[P13b/W-33] Direction "Export": Duties & Taxes MANDIRI tetap tampil tanpa centang Undername (SATU instance, tak terkunci di dalam panel)',
    (await page.locator('text="Duties & Taxes"').count()) === 1);
  check('[P13b/W-34] Direction "Export": pesan "Undername applies to import shipments only." tampil',
    (await page.locator('text="Undername applies to import shipments only."').count()) > 0);
  check('[P13b/W-34] Direction "Export": checkbox "Undername import" TIDAK ADA',
    (await page.locator('label:has-text("Undername import") input[type="checkbox"]').count()) === 0);

  // ── balik Direction ke "Import": Duties & Taxes TETAP tampil (standalone,
  // belum dicentang apa pun), checkbox Undername kembali ada, dan Duties &
  // Taxes TIDAK dirender dua kali setelah dicentang (bug prototipe mockup
  // yang sengaja tidak ditiru -- lihat komentar UndernamePanel/hideDuties). ──
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  await page.locator('button:text-is("Import")').click();
  await settle(page, 200);
  await p13bCustomsPill.click();
  await settle(page, 300);
  check('[P13b/W-33] Direction "Import", Undername belum dicentang: Duties & Taxes MANDIRI tetap tampil (default "Included in price")',
    (await fieldLocator(page, 'Duties & Taxes', 'select').inputValue()) === 'Included in price');
  await page.locator('label:has-text("Undername import") input[type="checkbox"]').check();
  await settle(page, 300);
  check('[P13b/W-33] Direction "Import" + Undername dicentang: Duties & Taxes TIDAK dirender dua kali',
    (await page.locator('text="Duties & Taxes"').count()) === 1);

  // ── W-40 -- blok statis "Latest quoted value" di step Commercial. ───────
  await stepPill(page, 'Commercial').click();
  await settle(page);
  check('[P13b/W-40] Blok "Latest quoted value" tampil',
    (await page.locator('text="Latest quoted value"').count()) > 0);
  check('[P13b/W-40] Teks "No quotation yet. It shows here and on the inquiry once a quotation exists." tampil',
    (await page.locator('text="No quotation yet. It shows here and on the inquiry once a quotation exists."').count()) > 0);

  // ── W-44 -- link "Edit" per grup di Review, lompat ke step terkait.
  // GroupHeader (InquiryIntakeWizardPage.jsx): <div><span>{title}</span>
  // <button>Edit</button></div> -- SIBLING, bukan h3 (beda dari
  // sectionButton() yang sudah ada, pola DealDetailPage.jsx, tidak dipakai
  // di sini). "Service & Direction" sebagai teks SATU-SATUNYA di dalam
  // <span> (label pill step tidak dibungkus span terpisah) -- aman tanpa
  // scoping tambahan. ──────────────────────────────────────────────────────
  await stepPill(page, 'Review').click();
  await settle(page);
  check('[P13b/W-44] Tombol "Create Inquiry" terlihat di Review (sanity, Create TIDAK ditekan sepanjang skenario ini)',
    await page.locator('button:text-is("Create Inquiry")').isVisible().catch(() => false));
  const p13bReviewEditSvcBtn = page.locator('xpath=//span[normalize-space(text())="Service & Direction"]/following-sibling::button[normalize-space(text())="Edit"]');
  check('[P13b/W-44] Tombol "Edit" grup "Service & Direction" di Review ditemukan', (await p13bReviewEditSvcBtn.count()) > 0);
  await p13bReviewEditSvcBtn.click();
  await settle(page, 300);
  check('[P13b/W-44] Klik "Edit" grup "Service & Direction" melompat ke step itu (pill aktif)',
    await isStepActive(page, 'Service & Direction'));
  console.log('  i [P13b] Create TIDAK ditekan sepanjang skenario ini -- nol inquiry baru tercipta.');
  } catch (e) {
    await recordFlowFailure('P13B', 'Skenario tambahan Putaran 13b (W-14/16/21/33/34/40/44/64)', e, page);
  }

  // Putaran 13a Task 3 -- Flow 2 (Rate Sheet Request) dibungkus try/catch
  // sendiri, terpisah dari Flow 1/D2D di atas dan Flow 3 di bawah.
  try {
  // =========================================================================
  // FLOW KEDUA -- Putaran 4 Tahap 4C, mode "Rate Sheet Request". Browser/
  // login SAMA (satu proses skrip), dimulai SESUDAH flow Single Shipment di
  // atas selesai -- flow pertama TIDAK disentuh sama sekali (byte-identik).
  // =========================================================================
  console.log('\n— FLOW KEDUA: Rate Sheet Request —\n');

  await page.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  check('[RS] Wizard Intake Form terbuka (flow kedua)', await page.locator('h1:text-is("Inquiry Intake Form")').count() > 0);

  // ── Langkah 1 — akun (reuse "PT Agro Sawit Kalimantan", rute BERBEDA dari
  // flow pertama -- POL/POD dibalik, Export bukan Import -- nol risiko
  // beririsan dengan inquiry flow pertama). ──────────────────────────────
  await stepPill(page, 'Customer & Contact').click();
  await settle(page);
  // D1 -- satu kolom "Customer" gabungan (lihat Flow 1).
  const rsAccountInput = page.locator('input[placeholder="Search account name or account code…"]');
  await rsAccountInput.fill('PT Agro Sawit Kalimantan');
  await page.waitForTimeout(400);
  const rsAccountBtn = page.locator('button:has-text("PT Agro Sawit Kalimantan")').first();
  if (await rsAccountBtn.count() > 0) await rsAccountBtn.click();
  await settle(page);
  // D3 -- Contact WAJIB di mode Rate Sheet Request JUGA (korekis Den #2).
  // Akun ini sudah tersentuh Flow 1 -- kemungkinan besar sudah punya contact
  // (dipilih lewat select), tapi fungsi ini aman di kedua keadaan.
  const contactResult2 = await ensureContactSelected(page);
  check('[RS] Contact terisi (Langkah 1, Flow 2)', !!contactResult2, contactResult2 || 'nol contact terpilih/ditambahkan');
  if (contactResult2) { console.log(`    i Contact — ${contactResult2}`); testDataLog.push(`Flow 2 (RS) — contact: ${contactResult2}`); }

  // ── Langkah 2 — Service Type "Freight Forwarding" + Customer Role
  // "Shipper" (hindari Customs/Undername -- sudah teruji flow pertama,
  // fokus RS saja; Customer Role WAJIB kecuali service_type='trading'). ───
  await stepPill(page, 'Service & Direction').click();
  await settle(page);
  await page.locator('button:has-text("Freight Forwarding")').first().click();
  await settle(page, 300);
  await page.locator('button:text-is("Shipper")').click();
  await settle(page);

  // ── Langkah 3, MASIH Single Shipment (isRS belum true) — isi POL/POD
  // sebagai field TUNGGAL (bukan lane), lalu pilih Container Type "FCL 20'".
  // REVISI 1 -- ini SENGAJA dilakukan SEBELUM toggle ke Rate Sheet Request,
  // supaya state container_types TERISI saat toggle terjadi (state TIDAK
  // dikosongkan oleh toggle -- hanya field-nya yang disembunyikan). ───────
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of loading…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of discharge or city…")'), 'Singapore', 'Singapore');
  await settle(page);
  await page.locator('button:text-is("FCL 20\'")').click();
  await settle(page, 600);

  // ── Toggle ke "Rate Sheet Request" (langkah 1). ──────────────────────────
  await stepPill(page, 'Customer & Contact').click();
  await settle(page);
  await page.locator('button:text-is("Rate Sheet Request")').click();
  await settle(page, 400);

  // ── REVISI 1, item (e): nol banner duplikat, nol error route_ncont,
  // sepanjang SISA alur RS -- dicek di sini (sesaat sesudah toggle, sebelum
  // field lain diisi) dan diulang lagi sesudah Create (lihat di bawah). ────
  check('[RS] Nol banner "Possible duplicate" sesaat sesudah toggle ke Rate Sheet Request (meski container_types FCL 20\' masih tersimpan)',
    (await page.locator('text=/Possible duplicate/i').count()) === 0);

  // ── Langkah 3 sesudah toggle — assert field Single-Shipment-only TIDAK
  // ADA, LaneTable tampil dgn 1 lane PRA-ISI dari POL/POD yang sudah diisi
  // sebelum toggle (switchInquiryType seed dari f.pol_location_id/pod). ────
  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  // Putaran 13a Task 2 -- label field sungguhan adalah "Incoterms" (jamak,
  // InquiryIntakeWizardPage.jsx), bukan "Incoterm" tunggal; dikoreksi supaya
  // teks yang dicari cocok label nyata (field ini tersembunyi total di mode
  // RS, jadi hasil check tidak berubah -- murni ketepatan teks yang diuji).
  for (const label of ['Pickup Address', 'Delivery Address', 'Incoterms', 'Container Type', 'Number of containers', 'Cargo ready date']) {
    check(`[RS] Field Single-Shipment-only "${label}" TIDAK ADA di step Route & Terms`, (await page.locator(`text="${label}"`).count()) === 0);
  }
  check('[RS] Tombol "Add route option" TIDAK ADA (laneTbl sudah true sejak toggle, nol transisi diperlukan)',
    (await page.locator('button:has-text("Add route option")').count()) === 0);
  const rsLaneCountAfterToggle = await laneRowCount(page);
  check('[RS] LaneTable tampil dgn 1 lane pra-isi segera sesudah toggle', rsLaneCountAfterToggle === 1, `dapat: ${rsLaneCountAfterToggle}`);
  check('[RS] Kolom pertama LaneTable berjudul "Use" (bukan "#")', (await page.locator('div:text-is("Use")').count()) > 0);
  const rsLane0Pol = (await laneRow(page, 0).locator('> div').nth(1).innerText().catch(() => '')).trim();
  const rsLane0Pod = (await laneRow(page, 0).locator('> div').nth(2).innerText().catch(() => '')).trim();
  check('[RS] Lane 1 pra-isi POL "Jakarta (Tanjung Priok)" (carry-over dari field tunggal sebelum toggle)', rsLane0Pol.includes('Jakarta (Tanjung Priok)'), `dapat: "${rsLane0Pol}"`);
  check('[RS] Lane 1 pra-isi POD "Singapore" (carry-over dari field tunggal sebelum toggle)', rsLane0Pod.includes('Singapore'), `dapat: "${rsLane0Pod}"`);

  // ── Tambah lane 2 via "Add lane" (BUKAN "Add route option" -- tombol itu
  // tidak pernah muncul untuk RS), isi rute DIBALIK (beda jelas dari lane 1),
  // lalu UNCHECK "Use"-nya (C3.2 -- lane ini TIDAK boleh ikut tersimpan). ──
  await page.locator('button:has-text("Add lane")').click();
  await settle(page, 300);
  const rsLaneCountAfterAdd = await laneRowCount(page);
  check('[RS] Lane ke-2 bertambah setelah "Add lane"', rsLaneCountAfterAdd === 2, `dapat: ${rsLaneCountAfterAdd}`);
  const rsLane1Pol = laneRow(page, 1).locator('> div').nth(1).locator('button').first();
  await pickLocation(page, rsLane1Pol, 'Singapore', 'Singapore');
  await settle(page, 300);
  const rsLane1Pod = laneRow(page, 1).locator('> div').nth(2).locator('button').first();
  await pickLocation(page, rsLane1Pod, 'Jakarta', 'Jakarta (Tanjung Priok)');
  await settle(page, 300);
  await laneRow(page, 1).locator('> div').nth(0).locator('input[type="checkbox"]').click();
  await settle(page, 300);
  const rsLane1Checked = await laneRow(page, 1).locator('> div').nth(0).locator('input[type="checkbox"]').isChecked();
  check('[RS] Checkbox "Use" lane 2 TERLIHAT tidak tercentang setelah diklik', rsLane1Checked === false, `checked=${rsLane1Checked}`);

  // ── REVISI 2 — uncheck SEMUA lane (termasuk lane 1) -- coba lanjut/Create
  // harus tertahan di step Route dengan pesan spesifik "0 lane terpilih". ──
  await laneRow(page, 0).locator('> div').nth(0).locator('input[type="checkbox"]').click();
  await settle(page, 300);
  let rsUrlBeforeAttempt = page.url();
  let rsReachedReview = await goToReviewViaNext(page);
  check('[RS] Step Review tercapai via "Next" (Next tidak pernah blokir -- validasi terjadi di Create)', rsReachedReview);
  const rsCreateBtn = page.locator('button:text-is("Create Inquiry")');
  if (await rsCreateBtn.isVisible().catch(() => false)) await rsCreateBtn.click();
  await settle(page, 500);
  check('[RS] Create DITOLAK saat nol lane terpilih (URL tidak pindah ke Detail Inquiry)', page.url() === rsUrlBeforeAttempt, page.url());
  check('[RS] Wizard berpindah balik ke step "3. Route & Terms" saat nol lane terpilih', await isStepActive(page, 'Route & Terms'));
  check('[RS] Pesan "Select at least one lane to include." tampil saat nol lane terpilih',
    (await page.locator('text="Select at least one lane to include."').count()) > 0);

  // Centang lagi lane 1 (lane 2 TETAP tidak tercentang, sesuai skenario akhir
  // yang dimaksud: hanya lane 1 yang disimpan).
  await laneRow(page, 0).locator('> div').nth(0).locator('input[type="checkbox"]').click();
  await settle(page, 300);

  // ── Validity From/To + Estimated Volume per Month. Uji validasi validity
  // terbalik DULU (coba Create harus tertahan lagi di step Route), baru
  // perbaiki -- lalu isi volume bergaya TD-285. ────────────────────────────
  const rsValidityFrom = fieldLocator(page, 'Validity Requested From', 'input');
  const rsValidityTo = fieldLocator(page, 'Validity Requested Until', 'input');
  await rsValidityFrom.fill('2026-12-01');
  await rsValidityTo.fill('2026-11-01'); // SENGAJA terbalik
  await settle(page, 300);

  rsUrlBeforeAttempt = page.url();
  rsReachedReview = await goToReviewViaNext(page);
  if (await rsCreateBtn.isVisible().catch(() => false)) await rsCreateBtn.click();
  await settle(page, 500);
  check('[RS] Create DITOLAK saat validity_to < validity_from (URL tidak pindah)', page.url() === rsUrlBeforeAttempt, page.url());
  check('[RS] Wizard berpindah balik ke step "3. Route & Terms" saat validity terbalik', await isStepActive(page, 'Route & Terms'));
  check('[RS] Pesan validity error tampil saat validity_to < validity_from',
    (await page.locator('text=/Enter the requested validity/i').count()) > 0);

  await stepPill(page, 'Route & Terms').click();
  await settle(page);
  await rsValidityTo.fill('2027-02-28'); // perbaiki
  await settle(page, 300);

  // TD-285 -- "1.250,5" harus tersimpan 1250.5 (bukan 1.25 kalau titik dibaca
  // desimal ala type="number"). type="text"+inputMode="decimal", format
  // ulang HANYA saat blur.
  const rsVolumeInput = fieldLocator(page, 'Estimated Volume per Month (CBM)', 'input');
  await rsVolumeInput.fill('1.250,5');
  await rsVolumeInput.blur();
  await settle(page, 300);
  const rsVolumeAfterBlur = await rsVolumeInput.inputValue();
  check('[RS] Estimated Volume "1.250,5" diformat ulang id-ID saat blur (bukan 1,25/NaN)', rsVolumeAfterBlur === '1.250,5', `dapat: "${rsVolumeAfterBlur}"`);

  // ── Review step — Lanes(1) (lane 2 ter-uncheck TIDAK dihitung), Validity
  // Requested, Estimated Volume per Month ADA; Incoterms/Container Type
  // TIDAK ADA; HANYA SATU baris "Estimated" (Commercial, kosong -- C4). ────
  rsReachedReview = await goToReviewViaNext(page);
  check('[RS] Step Review tercapai (sesudah validity+volume diperbaiki)', rsReachedReview);
  const rsLanesReviewText = (await fieldLocator(page, 'Lanes (1)', 'span').innerText().catch(() => '')).trim();
  check('[RS] Review menunjukkan "Lanes (1)" (hanya lane terpilih dihitung)', rsLanesReviewText.length > 0, `dapat label ada: ${rsLanesReviewText.length > 0}`);
  const rsValidityReviewText = (await fieldLocator(page, 'Validity Requested', 'span').innerText().catch(() => '')).trim();
  check('[RS] Review "Validity Requested" = "2026-12-01 to 2027-02-28"', rsValidityReviewText === '2026-12-01 to 2027-02-28', `dapat: "${rsValidityReviewText}"`);
  const rsVolumeReviewText = (await fieldLocator(page, 'Estimated Volume per Month', 'span').innerText().catch(() => '')).trim();
  check('[RS] Review "Estimated Volume per Month" = "1.250,5 CBM"', rsVolumeReviewText === '1.250,5 CBM', `dapat: "${rsVolumeReviewText}"`);
  check('[RS] Review TIDAK memuat "Incoterms"', (await page.locator('text="Incoterms"').count()) === 0);
  check('[RS] Review TIDAK memuat "Container Type"', (await page.locator('text="Container Type"').count()) === 0);
  const rsEstimatedRowCount = await page.locator('text="Estimated (intake)"').count();
  check('[RS] Review HANYA SATU baris "Estimated" (Commercial, C4 -- nol baris Estimated Value ganda)', rsEstimatedRowCount === 1, `dapat: ${rsEstimatedRowCount}`);

  // ── Create sungguhan. ─────────────────────────────────────────────────
  const rsRpcRespPromise = page.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 20000 }).catch(() => null);
  if (await rsCreateBtn.isVisible().catch(() => false)) await rsCreateBtn.click();
  const rsRpcResp = await rsRpcRespPromise;
  let rsInquiryNo = null, rsInquiryId = null;
  if (rsRpcResp && rsRpcResp.ok()) {
    const body = await rsRpcResp.json().catch(() => null);
    const row = Array.isArray(body) ? body[0] : body;
    rsInquiryNo = row?.inquiry_no || null;
    rsInquiryId = row?.id || null;
  }
  check('[RS] RPC create_inquiry_with_lanes merespon sukses', !!rsRpcResp && rsRpcResp.ok(), rsRpcResp ? `HTTP ${rsRpcResp.status()}` : 'nol respon tertangkap');
  await settle(page, 800);
  check('[RS] Pindah ke Detail Inquiry setelah Create', /\/crm\/inquiry\/(?:status-history\/)?[0-9a-f-]{36}$/i.test(page.url()), page.url());
  console.log(`\n  → [RS] Nomor inquiry yang dibuat: ${rsInquiryNo || '(tidak tertangkap)'}  ${rsInquiryId ? `(id: ${rsInquiryId})` : ''}`);
  testDataLog.push(`Flow 2 (RS) — inquiry: ${rsInquiryNo || '(tidak tertangkap)'}${rsInquiryId ? ` (id: ${rsInquiryId})` : ''}`);

  // ── Detail Inquiry — badge, 1 lane TERSIMPAN (lane 2 TIDAK ikut), Route &
  // Terms menampilkan Validity/Volume (bukan Incoterms/dll). ───────────────
  // waitFor({state:'visible'}) -- bukan cek instan -- utk badge DAN heading
  // LaneTable, pola IDENTIK fix flaky "Section Route Options (SectionHeader)"
  // di flow 1 (render Detail Inquiry sesaat sesudah Create/navigasi bisa
  // belum tuntas saat settle() berakhir; ditemukan lewat 2 run berturut-turut
  // yang GAGAL persis di titik ini dgn "dapat: 0" padahal SELURUH check
  // lain pada inquiry yang sama -- Validity/Volume persisten, Edit Route &
  // Terms, 4 toast -- lulus normal sesaat sesudahnya). h4 "Route options"
  // dan baris datanya SIBLING dalam SATU return JSX LaneTable.jsx (nol gap
  // async di antaranya), jadi menunggu h4 visible cukup utk menjamin baris
  // datanya juga sudah di DOM sebelum laneRowCount() dihitung.
  await settle(page, 800);
  let rsBadgeVisible = true;
  try { await page.locator('text="Rate Sheet Request"').first().waitFor({ state: 'visible', timeout: 10000 }); }
  catch { rsBadgeVisible = false; }
  check('[RS] Badge "Rate Sheet Request" tampil di header Detail Inquiry', rsBadgeVisible);
  let rsLaneTableReady = true;
  try { await page.locator('h4:has-text("Route options")').first().waitFor({ state: 'visible', timeout: 10000 }); }
  catch { rsLaneTableReady = false; }
  const rsDetailLaneCount = rsLaneTableReady ? await laneRowCount(page) : 0;
  check('[RS] Route Options Detail Inquiry HANYA 1 baris (lane ter-uncheck tidak ikut tersimpan)', rsDetailLaneCount === 1, `dapat: ${rsDetailLaneCount}`);
  if (rsDetailLaneCount === 1) {
    const rsDetailPol = (await laneRow(page, 0).locator('> div').nth(1).innerText().catch(() => '')).trim();
    const rsDetailPod = (await laneRow(page, 0).locator('> div').nth(2).innerText().catch(() => '')).trim();
    check('[RS] Lane tersimpan POL "Jakarta (Tanjung Priok)"', rsDetailPol.includes('Jakarta (Tanjung Priok)'), `dapat: "${rsDetailPol}"`);
    check('[RS] Lane tersimpan POD "Singapore"', rsDetailPod.includes('Singapore'), `dapat: "${rsDetailPod}"`);
  }
  for (const label of ['Pickup Address', 'Delivery Address', 'Incoterms', 'Container Type']) {
    check(`[RS] Field Single-Shipment-only "${label}" TIDAK ADA di Detail Inquiry`, (await page.locator(`text="${label}"`).count()) === 0);
  }
  const rsDetailValidityFrom = (await dealFieldValue(page, 'Validity Requested From').innerText().catch(() => '')).trim();
  const rsDetailValidityTo = (await dealFieldValue(page, 'Validity Requested Until').innerText().catch(() => '')).trim();
  const rsDetailVolume = (await dealFieldValue(page, 'Estimated Volume per Month (CBM)').innerText().catch(() => '')).trim();
  check('[RS] Detail Inquiry Validity From persisten "2026-12-01"', rsDetailValidityFrom.includes('2026-12-01'), `dapat: "${rsDetailValidityFrom}"`);
  check('[RS] Detail Inquiry Validity Until persisten "2027-02-28"', rsDetailValidityTo.includes('2027-02-28'), `dapat: "${rsDetailValidityTo}"`);
  check('[RS] Detail Inquiry Estimated Volume per Month persisten "1.250,5" (TD-285 round-trip DB, bukan 1,25)', rsDetailVolume.includes('1.250,5'), `dapat: "${rsDetailVolume}"`);

  // ── Perbaikan 2 (review Vir) -- edit Validity/Volume dari Detail Inquiry
  // section "Route & Terms", pakai inquiry RS yang baru dibuat di atas.
  // Pemantau PATCH /rest/v1/inquiries (satu-satunya jalur saveInquirySection,
  // DealDetailPage.jsx:1287-1291) -- dipasang SEKALI, dibaca sebagai hitungan
  // sebelum/sesudah tiap percobaan Save supaya "nol panggilan DB saat
  // validasi klien gagal" bisa dibuktikan dari jaringan, bukan ditebak dari
  // UI saja. ──────────────────────────────────────────────────────────────
  const patchRequests = [];
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/rest/v1/inquiries')) patchRequests.push(req.url());
  });

  const rsRouteEditBtn = sectionButton(page, 'Route & Terms', 'Edit');
  check('[RS] Tombol Edit "Route & Terms" ditemukan di Detail Inquiry', await rsRouteEditBtn.count() > 0);
  await rsRouteEditBtn.click();
  await settle(page, 300);

  const rsEditValidityFrom = dealFieldValue(page, 'Validity Requested From');
  const rsEditValidityTo = dealFieldValue(page, 'Validity Requested Until');
  const rsEditVolume = dealFieldValue(page, 'Estimated Volume per Month (CBM)');
  check('[RS] Input Validity Requested From BISA diedit (tag <input>)', (await rsEditValidityFrom.evaluate((el) => el.tagName).catch(() => '')) === 'INPUT');
  check('[RS] Input Validity Requested Until BISA diedit (tag <input>)', (await rsEditValidityTo.evaluate((el) => el.tagName).catch(() => '')) === 'INPUT');
  check('[RS] Input Estimated Volume per Month BISA diedit (tag <input>)', (await rsEditVolume.evaluate((el) => el.tagName).catch(() => '')) === 'INPUT');
  check('[RS] "Pickup Address" TIDAK ADA saat edit Route & Terms (Detail Inquiry)', (await page.locator('text="Pickup Address"').count()) === 0);
  check('[RS] "Incoterms" TIDAK ADA saat edit Route & Terms (Detail Inquiry)', (await page.locator('text="Incoterms"').count()) === 0);

  const rsRouteSaveBtn = sectionButton(page, 'Route & Terms', 'Save');

  // (2) Until lebih awal dari From ("2026-12-01") -- ditolak klien-side,
  // nol PATCH, section tetap mode edit. waitForToastGone DULU (slate bersih
  // -- lihat komentar helper di atas) supaya toast ini mendapat umur penuh
  // 2800ms miliknya sendiri, lalu checkToastExact POLLING (bukan instan).
  await waitForToastGone(page);
  let rsPatchCountBefore = patchRequests.length;
  await rsEditValidityTo.fill('2026-11-01');
  await rsRouteSaveBtn.click();
  await checkToastExact(page, '[RS] Toast "Validity Requested Until must be on or after From." tampil', 'Validity Requested Until must be on or after From.');
  check('[RS] Nol PATCH /rest/v1/inquiries saat validity terbalik', patchRequests.length === rsPatchCountBefore, `before=${rsPatchCountBefore} after=${patchRequests.length}`);
  check('[RS] Section "Route & Terms" TETAP mode edit setelah Save ditolak (validity)', await rsRouteSaveBtn.isVisible().catch(() => false));

  // (3) Perbaiki Until, Volume="abc" -- ditolak "Angka tidak dikenali", nol PATCH.
  await waitForToastGone(page);
  await rsEditValidityTo.fill('2027-02-28');
  await rsEditVolume.fill('abc');
  rsPatchCountBefore = patchRequests.length;
  await rsRouteSaveBtn.click();
  await checkToastExact(page, '[RS] Toast "Angka tidak dikenali" tampil saat Volume "abc"', 'Angka tidak dikenali');
  check('[RS] Nol PATCH /rest/v1/inquiries saat Volume "abc"', patchRequests.length === rsPatchCountBefore, `before=${rsPatchCountBefore} after=${patchRequests.length}`);
  check('[RS] Section "Route & Terms" TETAP mode edit setelah Save ditolak (volume tak dikenali)', await rsRouteSaveBtn.isVisible().catch(() => false));

  // (4) Volume="0" -- ditolak "harus > 0", nol PATCH.
  await waitForToastGone(page);
  await rsEditVolume.fill('0');
  rsPatchCountBefore = patchRequests.length;
  await rsRouteSaveBtn.click();
  await checkToastExact(page, '[RS] Toast "Estimated Volume per Month is required and must be greater than 0." tampil saat Volume "0"', 'Estimated Volume per Month is required and must be greater than 0.');
  check('[RS] Nol PATCH /rest/v1/inquiries saat Volume "0"', patchRequests.length === rsPatchCountBefore, `before=${rsPatchCountBefore} after=${patchRequests.length}`);
  check('[RS] Section "Route & Terms" TETAP mode edit setelah Save ditolak (volume 0)', await rsRouteSaveBtn.isVisible().catch(() => false));

  // (5) Volume="2.000" (format id-ID = 2000, BUKAN 2), Until="2027-03-31" --
  // sukses, SATU PATCH, toast "Changes saved".
  await waitForToastGone(page);
  await rsEditVolume.fill('2.000');
  await rsEditValidityTo.fill('2027-03-31');
  rsPatchCountBefore = patchRequests.length;
  const rsPatchRespPromise = page.waitForResponse((resp) => resp.request().method() === 'PATCH' && resp.url().includes('/rest/v1/inquiries'), { timeout: 20000 }).catch(() => null);
  await rsRouteSaveBtn.click();
  const rsPatchResp = await rsPatchRespPromise;
  check('[RS] SATU PATCH /rest/v1/inquiries terjadi saat Save valid', patchRequests.length === rsPatchCountBefore + 1, `before=${rsPatchCountBefore} after=${patchRequests.length}`);
  check('[RS] PATCH merespon sukses', !!rsPatchResp && rsPatchResp.ok(), rsPatchResp ? `HTTP ${rsPatchResp.status()}` : 'nol respon tertangkap');
  await checkToastExact(page, '[RS] Toast "Changes saved" tampil', 'Changes saved');
  await settle(page, 400);

  // (6) Reload -- Until/Volume persisten dari DB, bukan hanya state klien.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page, 800);
  const rsEditValidityToAfter = (await dealFieldValue(page, 'Validity Requested Until').innerText().catch(() => '')).trim();
  const rsEditVolumeAfter = (await dealFieldValue(page, 'Estimated Volume per Month (CBM)').innerText().catch(() => '')).trim();
  check('[RS] Pasca-reload: Validity Requested Until = "2027-03-31"', rsEditValidityToAfter.includes('2027-03-31'), `dapat: "${rsEditValidityToAfter}"`);
  check('[RS] Pasca-reload: Estimated Volume per Month = "2.000" (bukan "2")', rsEditVolumeAfter.includes('2.000'), `dapat: "${rsEditVolumeAfter}"`);

  console.log(`\n  → [RS] Inquiry yang dipakai uji edit Detail: ${rsInquiryNo || '(tidak tertangkap)'}  ${rsInquiryId ? `(id: ${rsInquiryId})` : ''} -- cek monthly_volume_cbm = 2000 di database.`);
  } catch (e) {
    await recordFlowFailure('RS', 'Flow 2 (Rate Sheet Request)', e, page);
  }

  // Putaran 13a Task 3 -- Flow 3 (owner default manager) dibungkus try/catch
  // sendiri. `page2` dideklarasikan dgn `let` DI LUAR try (lihat beberapa
  // baris di bawah) supaya catch di sini bisa mengambil screenshot-nya kalau
  // sudah terbuka saat exception terjadi -- `const` di dalam try tidak akan
  // terlihat dari catch (lexical scoping), jadi dihoist.
  let ctx2, page2;
  try {
  // =========================================================================
  // FLOW KETIGA -- Putaran 5 K1a, Task 2. Owner default-ke-diri-sendiri utk
  // role manager-ke-atas (isManagerOrAbove() -> level<=6, src/lib/roles.js)
  // YANG JUGA ada di roster operasional (OPERATIONAL_ROSTER_ROLES,
  // salesRoster.js -- superset BD_SALES_ROLES+gm_bd). bd_sales_spv_forwarding
  // (level 6, "Sales Supervisor Forwarding") adalah SATU-SATUNYA di antara
  // 4 akun uji yang diberikan yang lolos isManagerOrAbove TANPA sekaligus
  // Super Admin: test@msi.com punya Manager L4 TAPI JUGA Super Admin (dan
  // role 'manager' lagipula BUKAN anggota OPERATIONAL_ROSTER_ROLES, jadi
  // auto-fill owner_id tidak akan menyala untuknya walau canPickOwner true);
  // sales@msi.com dan zzztest.sales2@msi.com ber-level 7, tidak lolos sama
  // sekali. Login akun KEDUA di KONTEKS BROWSER BARU, bukan menimpa page
  // yang sama -- ctx.addInitScript yang dipasang utk akun pertama di atas
  // berjalan LAGI di SETIAP navigasi baru dalam konteksnya (bukan sekali
  // saja), jadi menimpa localStorage pada page yang sama akan ditimpa BALIK
  // oleh init script lama persis saat page.goto() berikutnya terjadi --
  // konteks baru dengan addInitScript SENDIRI menghindari tarik-menarik itu
  // (pola IDENTIK dengan ctx/page pertama, bukan konvensi baru).
  // =========================================================================
  console.log('\n— FLOW KETIGA: Owner default untuk Manager (bd_sales_spv_forwarding) —\n');

  const MANAGER_ACCOUNT = 'zzztest.salesspv@msi.com';
  const MANAGER_SELF_NAME = 'ZZZ Test Sales Supervisor';
  const SWITCH_OWNER_NAME = 'ZZZTEST Sales';

  const managerPassword = await resolvePasswordFor(MANAGER_ACCOUNT, 'QA_PASSWORD_MANAGER');
  const managerSession = await loginSession(MANAGER_ACCOUNT, managerPassword);
  ctx2 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx2.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* mode privat */ } }, [`sb-${REF}-auth-token`, JSON.stringify(managerSession)]);
  page2 = await ctx2.newPage();
  page2.on('pageerror', (e) => consoleErrors.push(String(e.message || e).slice(0, 160)));

  // Field minimum yang WAJIB lolos stepErrors() utk Single Shipment non-FCL
  // (cust_account/svc_service_type/svc_direction/svc_customer_role/
  // route_lanes -- lihat InquiryIntakeWizardPage.jsx:563-618): nol Undername/
  // FCL/Weight/Volume/Additional Services disentuh, semuanya opsional di
  // jalur ini. Pelanggan+lokasi dipakai ULANG dari flow 1/2 (instruksi
  // eksplisit "pakai yang sudah ada di script"), BUKAN fixture baru.
  async function openWizardAndFillToCommercial(pg, checkLabel) {
    await pg.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
    await settle(pg);
    check(`[MGR] Wizard Intake Form terbuka (${checkLabel})`, await pg.locator('h1:text-is("Inquiry Intake Form")').count() > 0);
    await stepPill(pg, 'Customer & Contact').click();
    await settle(pg);
    // D1 -- satu kolom "Customer" gabungan (lihat Flow 1/2).
    await pg.locator('input[placeholder="Search account name or account code…"]').fill('PT Agro Sawit Kalimantan');
    await pg.waitForTimeout(400);
    await pg.locator('button:has-text("PT Agro Sawit Kalimantan")').first().click();
    await settle(pg);
    // D3 -- Contact WAJIB; akun ini sudah tersentuh Flow 1/2 sebelumnya di
    // skrip yang sama, jadi biasanya tinggal pilih dari select.
    const mgrContactResult = await ensureContactSelected(pg);
    check(`[MGR] Contact terisi (${checkLabel})`, !!mgrContactResult, mgrContactResult || 'nol contact terpilih/ditambahkan');
    await stepPill(pg, 'Service & Direction').click();
    await settle(pg);
    await pg.locator('button:has-text("Freight Forwarding")').first().click();
    await settle(pg, 300);
    await pg.locator('button:text-is("Shipper")').click();
    await settle(pg);
    await stepPill(pg, 'Route & Terms').click();
    await settle(pg);
    await pickLocation(pg, pg.locator('button:has-text("Select port of loading…")'), 'Singapore', 'Singapore');
    await settle(pg);
    await pickLocation(pg, pg.locator('button:has-text("Select port of discharge or city…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
    await settle(pg);
    await stepPill(pg, 'Commercial').click();
    // ekstra -- menunggu fetchOperationalRoster (2 query berurutan) + efek
    // auto-fill owner_id (setTimeout(...,0), InquiryIntakeWizardPage.jsx:519)
    // selesai sebelum select Owner dibaca.
    await settle(pg, 700);
  }

  // ── (a) + (b): inquiry #1 -- Owner TIDAK disentuh, harus default diri
  // sendiri sejak wizard dibuka, dan owner_id yang tersimpan = pemanggil. ──
  await openWizardAndFillToCommercial(page2, 'inquiry #1, diri sendiri');
  const ownerSelect1 = fieldLocator(page2, 'Owner', 'select');
  const ownerSelectedText1 = await ownerSelect1.evaluate((el) => el.options[el.selectedIndex]?.textContent || '').catch(() => '');
  check('[MGR] (a) Select Owner berisi diri sendiri saat wizard dibuka (bukan kosong/"Leave unassigned")',
    ownerSelectedText1 === MANAGER_SELF_NAME, `dapat: "${ownerSelectedText1}"`);

  await stepPill(page2, 'Review').click();
  await settle(page2);
  const createBtn1 = page2.locator('button:text-is("Create Inquiry")');
  check('[MGR] Tombol "Create Inquiry" terlihat (inquiry #1)', await createBtn1.isVisible().catch(() => false));
  const rpcResp1Promise = page2.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 20000 }).catch(() => null);
  await createBtn1.click();
  const rpcResp1 = await rpcResp1Promise;
  let mgrInquiryNo1 = null, mgrInquiryId1 = null;
  if (rpcResp1 && rpcResp1.ok()) {
    const body = await rpcResp1.json().catch(() => null);
    const row = Array.isArray(body) ? body[0] : body;
    mgrInquiryNo1 = row?.inquiry_no || null;
    mgrInquiryId1 = row?.id || null;
  }
  check('[MGR] (b) RPC create_inquiry_with_lanes merespon sukses (inquiry #1, owner tak disentuh)', !!rpcResp1 && rpcResp1.ok(), rpcResp1 ? `HTTP ${rpcResp1.status()}` : 'nol respon tertangkap');
  await settle(page2, 800);
  check('[MGR] Pindah ke Detail Inquiry setelah Create (inquiry #1)', /\/crm\/inquiry\/(?:status-history\/)?[0-9a-f-]{36}$/i.test(page2.url()), page2.url());
  const ownerDetail1 = (await dealFieldValue(page2, 'Owner').innerText().catch(() => '')).trim();
  check('[MGR] (b) Detail Inquiry Owner = diri sendiri (owner_id tersimpan = pemanggil) (inquiry #1)',
    ownerDetail1.includes(MANAGER_SELF_NAME), `dapat: "${ownerDetail1}"`);
  console.log(`\n  → [MGR] Inquiry #1 (owner diri sendiri): ${mgrInquiryNo1 || '(tidak tertangkap)'}  ${mgrInquiryId1 ? `(id: ${mgrInquiryId1})` : ''}`);
  testDataLog.push(`Flow 3 (MGR) — inquiry #1 (owner diri sendiri): ${mgrInquiryNo1 || '(tidak tertangkap)'}${mgrInquiryId1 ? ` (id: ${mgrInquiryId1})` : ''}`);

  // ── (c): inquiry #2 -- Owner DIGANTI manual ke "ZZZTEST Sales" sebelum
  // Create, owner_id yang tersimpan harus ikut pilihan manual itu. ────────
  await openWizardAndFillToCommercial(page2, 'inquiry #2, ganti owner');
  const ownerSelect2 = fieldLocator(page2, 'Owner', 'select');
  await ownerSelect2.selectOption({ label: SWITCH_OWNER_NAME });
  await settle(page2, 300);
  const ownerSelectedText2 = await ownerSelect2.evaluate((el) => el.options[el.selectedIndex]?.textContent || '').catch(() => '');
  check('[MGR] Owner berhasil diganti ke "ZZZTEST Sales" sebelum Create', ownerSelectedText2 === SWITCH_OWNER_NAME, `dapat: "${ownerSelectedText2}"`);

  await stepPill(page2, 'Review').click();
  await settle(page2);
  const createBtn2 = page2.locator('button:text-is("Create Inquiry")');
  check('[MGR] Tombol "Create Inquiry" terlihat (inquiry #2)', await createBtn2.isVisible().catch(() => false));
  // Aturan toast -- toast sukses inquiry #1 mungkin belum habis (lihat
  // waitForToastGone/checkToastExact di atas); TASK 1 sudah menutup akarnya
  // di App.jsx, tapi menunggu di sini tetap aman/murah dan menghormati
  // instruksi eksplisit.
  await waitForToastGone(page2);
  const rpcResp2Promise = page2.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 20000 }).catch(() => null);
  await createBtn2.click();
  const rpcResp2 = await rpcResp2Promise;
  let mgrInquiryNo2 = null, mgrInquiryId2 = null;
  if (rpcResp2 && rpcResp2.ok()) {
    const body = await rpcResp2.json().catch(() => null);
    const row = Array.isArray(body) ? body[0] : body;
    mgrInquiryNo2 = row?.inquiry_no || null;
    mgrInquiryId2 = row?.id || null;
  }
  check('[MGR] (c) RPC create_inquiry_with_lanes merespon sukses (inquiry #2, owner diganti)', !!rpcResp2 && rpcResp2.ok(), rpcResp2 ? `HTTP ${rpcResp2.status()}` : 'nol respon tertangkap');
  await settle(page2, 800);
  check('[MGR] Pindah ke Detail Inquiry setelah Create (inquiry #2)', /\/crm\/inquiry\/(?:status-history\/)?[0-9a-f-]{36}$/i.test(page2.url()), page2.url());
  const ownerDetail2 = (await dealFieldValue(page2, 'Owner').innerText().catch(() => '')).trim();
  check('[MGR] (c) Detail Inquiry Owner = "ZZZTEST Sales" (owner_id tersimpan = pilihan manual) (inquiry #2)',
    ownerDetail2.includes(SWITCH_OWNER_NAME), `dapat: "${ownerDetail2}"`);
  console.log(`\n  → [MGR] Inquiry #2 (owner diganti ke ${SWITCH_OWNER_NAME}): ${mgrInquiryNo2 || '(tidak tertangkap)'}  ${mgrInquiryId2 ? `(id: ${mgrInquiryId2})` : ''}`);
  testDataLog.push(`Flow 3 (MGR) — inquiry #2 (owner diganti ke ${SWITCH_OWNER_NAME}): ${mgrInquiryNo2 || '(tidak tertangkap)'}${mgrInquiryId2 ? ` (id: ${mgrInquiryId2})` : ''}`);
  } catch (e) {
    await recordFlowFailure('MGR', 'Flow 3 (Owner default manager, bd_sales_spv_forwarding)', e, page2 || page);
  }
  } // end if (ONLY !== '4') -- Flow 1-3

  if (ONLY === '4') console.log(`e2e-inquiry-wizard -- Flow 4 SAJA (--only 4) -- ${BASE} · project ${REF}\n`);

  // =========================================================================
  // FLOW KEEMPAT -- Putaran 5 K1d. "Mark Accepted dengan bukti" dari sisi
  // pengguna, sesudah migrasi 20261026000004 LIVE di staging dan lulus
  // seluruh uji SQL (a)-(k). Akun BARU, konteks browser BARU (pola identik
  // Flow 3): ZZZTEST Sales (sales@msi.com) sebagai PEMILIK ketiga fixture --
  // bukan test@msi.com (super_admin, flow 1/2) maupun zzztest.salesspv@msi.com
  // (manager, flow 3), supaya "created_by = pemanggil" (gate canAct di
  // QuotationDetailPage.jsx) lolos tanpa butuh is_manager_or_above().
  //
  // FIXTURE dibuat lewat REST LANGSUNG (fetch ke /rest/v1/..., Authorization
  // Bearer = access_token sesi sales@msi.com -- BUKAN service_role): modul
  // Quotation List/Form ada di luar scope task ini, dan guard BARU hanya
  // BEFORE UPDATE (trg_z_guard_quotations_accepted_columns) sehingga INSERT
  // langsung TIDAK terjegal olehnya -- diizinkan eksplisit oleh instruksi
  // tugas. Nol SQL/service_role; RLS quotations_insert (company_id IN
  // get_user_company_ids()) menegakkan sendiri siapa yang boleh menulis apa.
  //
  // ⚠️ TEMUAN (dicatat SEBELUM menulis fixture-nya, bukan sesudah gagal):
  // migrasi 20261022000001_crm_inquiry_server_side_numbering memasang
  // trigger BEFORE INSERT trg_z_assign_inquiry_no yang SELALU MENIMPA
  // inquiries.inquiry_no dengan nomor server-generated, apa pun yang dikirim
  // client (atau walau kolomnya diabaikan sama sekali). Fixture inquiry di
  // bawah TIDAK mengirim inquiry_no sama sekali (percuma -- akan ditimpa)
  // dan memakai kolom `notes` sebagai penanda ZZZTEST (nomor inquiry asli
  // dibaca balik dari respons INSERT, dicetak di akhir run utk pembersihan).
  // quotations.quotation_no TIDAK punya trigger sejenis (diverifikasi grep
  // migrations/) -- ketiga fixture quotation di bawah tetap ber-nomor
  // "ZZZTEST-E2E-K1D-*" apa adanya.
  // =========================================================================
  // Putaran 13a Task 3 -- `page3` dihoist dgn `let` DI LUAR try (sama pola
  // dgn ctx2/page2 Flow 3) supaya catch di bawah bisa mengambil screenshot
  // kalau sudah terbuka saat exception terjadi.
  let ctx3, page3;
  try {
    console.log('\n— FLOW KEEMPAT: Mark Accepted dengan bukti (Quotation) —\n');

    const ACC_COMPANY_MSI = '0e1840d8-e6fb-4190-bd09-88338e68b492';
    const SALES_ACCOUNT = 'sales@msi.com';
    const QUOTATION_DETAIL_PATH = '/crm/quotation/builder';

    // Fetch REST langsung (Bearer = access_token sesi pengguna uji, BUKAN
    // service_role) -- fixture + verifikasi DB + uji guard (8) semuanya
    // lewat jalur ini, nol SQL dijalankan ke database.
    async function pgrest(path, { method = 'GET', token, body, prefer } = {}) {
      const headers = { apikey: ANON_KEY, Authorization: `Bearer ${token}` };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (prefer) headers['Prefer'] = prefer;
      const doFetch = () => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let r;
      try {
        r = await doFetch();
      } catch (e) {
        // Jaringan putus sesaat (TypeError fetch failed, dua kali terjadi di
        // sesi staging ini -- bukan respons server, lihat laporan Vir) --
        // GET murni baca-saja AMAN diulang. POST/PATCH/RPC TIDAK PERNAH
        // diulang di sini: idempotensinya tidak terjamin (mis. fixture
        // POST yang sudah sukses tersimpan server tapi responsnya hilang
        // di jaringan -- mengulang bisa membuat baris dobel), jadi
        // dilempar apa adanya seperti sebelumnya.
        if (method !== 'GET' || !(e instanceof TypeError)) throw e;
        console.log(`  ℹ [ACC] pgrest GET diulang 1x karena fetch failed: ${path}`);
        await new Promise((res) => setTimeout(res, 1500));
        r = await doFetch();
      }
      const text = await r.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { ok: r.ok, status: r.status, json };
    }

    const salesPassword = await resolvePasswordFor(SALES_ACCOUNT, 'QA_PASSWORD_SALES');
    const salesSession = await loginSession(SALES_ACCOUNT, salesPassword);
    const salesToken = salesSession.access_token;
    const salesUserId = salesSession.user?.id;
    check('[ACC] Login sesi sales@msi.com berhasil (access_token diterima)', !!salesToken && !!salesUserId, salesUserId || '');

    // ── prospect_id fixture -- KOSMETIK SAJA (Mark Accepted tidak butuh ini).
    // SENGAJA TIDAK menyebut akun tertentu ("PT Agro Sawit Kalimantan", pola
    // flow 1-3) dan TIDAK di-assert -- temuan Vir: RLS prospects_read hanya
    // meloloskan akun yang assigned_to/created_by SESSION ITU SENDIRI (atau
    // manager-ke-atas); sales@msi.com bukan keduanya untuk akun manapun yang
    // dipakai flow 1-3 (punya created_by test@msi.com/zzztest.salesspv@msi.com),
    // jadi [] di sini adalah RLS BEKERJA BENAR, bukan bug -- mengukur akun
    // bernama tertentu akan SELALU gagal untuk pemilik ini, apa pun isi DB.
    // GET polos limit 1 TANPA filter nama -- kalau ADA akun yang kebetulan
    // boleh dibaca sales@msi.com, pakai itu; kalau NOL (hasil paling mungkin
    // untuk akun ini), prospectId tetap null -- fixture quotation/inquiry
    // tetap valid tanpa itu (kolom nullable), Mark Accepted tidak terpengaruh.
    const acctResp = await pgrest('accounts?select=id&limit=1', { token: salesToken });
    const prospectId = Array.isArray(acctResp.json) ? acctResp.json[0]?.id : null;
    if (prospectId) {
      console.log(`  ℹ [ACC] prospect_id fixture terisi dari akun pertama yang terbaca sales@msi.com: ${prospectId}`);
    } else {
      console.log('  ℹ [ACC] prospect_id fixture TETAP NULL -- sales@msi.com hanya melihat akun yang assigned_to/created_by dirinya sendiri (RLS prospects_read), nol di antara akun yang ada kebetulan begitu. Bukan GAGAL, tidak dihitung ke total -- fixture tetap valid (prospect_id nullable).');
    }

    const nonce = Date.now();

    // ── Fixture A: inquiry (via RPC create_inquiry_with_lanes, BUKAN REST
    // INSERT langsung -- K1c mencabut INSERT authenticated pada inquiries,
    // persis jalur lama yang dipakai fixture ini; lihat run sebelumnya
    // [ACC Fixture A gagal "permission denied for table inquiries"], temuan
    // Den: perilaku K1c yang disengaja, perbaikannya di skrip ini) +
    // quotation SENT tertaut.
    //
    // Status TIDAK dipaksa QUOTED lewat UPDATE -- create_inquiry_with_lanes
    // SELALU membuat baris berstatus OPEN (hardcode di badan RPC, nol
    // parameter p_status); trigger set_inquiry_quoted_on_quotation_sent
    // (AFTER INSERT ON quotations, SECURITY DEFINER) menaikkannya ke QUOTED
    // begitu quotation SENT tertaut dibuat di bawah -- status dibaca balik
    // SESUDAHNYA dan dicetak sebagai baris INFO, bukan diasumsikan.
    //
    // p_notes RPC ini ADA (dikonfirmasi di tanda tangan fungsi) -- penanda
    // ZZZTEST tetap tersimpan di inquiries.notes, pola sama REST lama.
    // Lane minimal: pol_location_id/pod_location_id WAJIB uuid lokasi NYATA
    // (FK ke public.locations) -- locations_insert kini super_admin-only
    // (K1c, migrasi 20261026000003) sehingga sales@msi.com tidak bisa
    // membuat lokasi throwaway lagi; locations_select tetap USING(true),
    // jadi dua lokasi EXISTING diambil lewat GET biasa.
    const locResp = await pgrest('locations?select=id,code&limit=2', { token: salesToken });
    const locPol = Array.isArray(locResp.json) ? locResp.json[0]?.id : null;
    const locPod = Array.isArray(locResp.json) ? locResp.json[1]?.id : null;
    check('[ACC] Dua lokasi existing terbaca lewat REST (utk lane fixture A)', !!locPol && !!locPod, JSON.stringify(locResp.json));

    const inqAResp = await pgrest('rpc/create_inquiry_with_lanes', {
      method: 'POST', token: salesToken,
      body: {
        p_company_id: ACC_COMPANY_MSI, p_prospect_id: prospectId, p_service_type: 'freight_forwarding',
        p_direction: 'Export', p_customer_role: 'Shipper',
        p_notes: 'ZZZTEST-E2E-K1D fixture -- aman dihapus',
        p_lanes: [{ pol_location_id: locPol, pod_location_id: locPod, pol: 'ZZZTEST POL', pod: 'ZZZTEST POD' }],
      },
    });
    const inquiryAId = Array.isArray(inqAResp.json) ? inqAResp.json[0]?.id : null;
    const inquiryANo = Array.isArray(inqAResp.json) ? inqAResp.json[0]?.inquiry_no : null;
    check('[ACC] Fixture A -- inquiry dibuat via RPC create_inquiry_with_lanes (sesi sales@msi.com)', inqAResp.ok && !!inquiryAId, inqAResp.ok ? `${inquiryAId} (${inquiryANo})` : JSON.stringify(inqAResp.json));

    const quoAResp = await pgrest('quotations', {
      method: 'POST', token: salesToken, prefer: 'return=representation',
      body: {
        company_id: ACC_COMPANY_MSI, quotation_no: `ZZZTEST-E2E-K1D-A-${nonce}`,
        status: 'SENT', created_by: salesUserId, inquiry_id: inquiryAId, prospect_id: prospectId,
      },
    });
    const quoAId = Array.isArray(quoAResp.json) ? quoAResp.json[0]?.id : null;
    check('[ACC] Fixture A -- quotation SENT dibuat via REST, tertaut inquiry A', quoAResp.ok && !!quoAId, quoAResp.ok ? quoAId : JSON.stringify(quoAResp.json));

    if (inquiryAId) {
      const inqAStatusResp = await pgrest(`inquiries?id=eq.${inquiryAId}&select=status`, { token: salesToken });
      const inqAStatusBefore = inqAStatusResp.json?.[0]?.status;
      console.log(`  ℹ [ACC] Inquiry A status SEBELUM quotation diterima: ${inqAStatusBefore} (OPEN dari create_inquiry_with_lanes, atau QUOTED kalau trigger quotation-SENT sudah menaikkannya)`);
    }

    // ── Fixture B: quotation SENT TANPA inquiry (jalur Reject, regresi). ────
    const quoBResp = await pgrest('quotations', {
      method: 'POST', token: salesToken, prefer: 'return=representation',
      body: { company_id: ACC_COMPANY_MSI, quotation_no: `ZZZTEST-E2E-K1D-B-${nonce}`, status: 'SENT', created_by: salesUserId, prospect_id: prospectId },
    });
    const quoBId = Array.isArray(quoBResp.json) ? quoBResp.json[0]?.id : null;
    check('[ACC] Fixture B -- quotation SENT dibuat via REST (jalur Reject)', quoBResp.ok && !!quoBId, quoBResp.ok ? quoBId : JSON.stringify(quoBResp.json));

    // ── Fixture C: quotation SENT lain (jalur guard UPDATE langsung). ───────
    const quoCResp = await pgrest('quotations', {
      method: 'POST', token: salesToken, prefer: 'return=representation',
      body: { company_id: ACC_COMPANY_MSI, quotation_no: `ZZZTEST-E2E-K1D-C-${nonce}`, status: 'SENT', created_by: salesUserId, prospect_id: prospectId },
    });
    const quoCId = Array.isArray(quoCResp.json) ? quoCResp.json[0]?.id : null;
    check('[ACC] Fixture C -- quotation SENT dibuat via REST (jalur guard)', quoCResp.ok && !!quoCId, quoCResp.ok ? quoCId : JSON.stringify(quoCResp.json));

    if (!quoAId || !quoBId || !quoCId) {
      console.log('  ⚠ Satu atau lebih fixture gagal dibuat -- sisa Flow 4 yang bergantung padanya akan gagal dengan jelas, dilaporkan apa adanya lewat check() di atas.');
    }

    // ── Konteks browser BARU, akun sales@msi.com (pola identik ctx2/page2
    // Flow 3 -- localStorage per-konteks, tidak menimpa sesi akun lain). ─────
    ctx3 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await ctx3.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* mode privat */ } }, [`sb-${REF}-auth-token`, JSON.stringify(salesSession)]);
    page3 = await ctx3.newPage();
    page3.on('pageerror', (e) => consoleErrors.push(String(e.message || e).slice(0, 160)));

    // =======================================================================
    // Putaran 13b (W-16, DIPINDAH dari skenario [P13b] -- lihat komentar di
    // sana, dekat "ganti ke Door to Door") -- sesi SATU-SATUNYA di skrip ini
    // yang BUKAN super_admin/manager (sales@msi.com, level 7 @ MSI, single-
    // entity): tempat yang benar utk membuktikan Next diblok saat JCI
    // terblokir, karena super_admin (test@msi.com, Flow 1-3/D2D/[P13b])
    // SELALU lolos `isSuperAdmin()` sehingga svcJciBlocked tidak pernah
    // menyala di sana. Ground truth akses JCI diukur LANGSUNG lewat REST
    // (bukan ditebak dari tampilan banner, company JCI UUID tetap -- lihat
    // CLAUDE.md §Entity UUID "ref TIDAK berubah pasca-migrasi"): kalau ground
    // truth bilang akun ini TANPA akses JCI tapi banner tidak muncul, itu
    // GAGAL (check() di bawah, BUKAN dilewati diam-diam) -- skip HANYA
    // terjadi kalau ground truth membuktikan akun BENAR punya akses, dan itu
    // dicetak sebagai PERINGATAN KERAS, bukan disembunyikan. Pemilihan akun
    // SENGAJA DILEWATI (bukan "pilih lalu abaikan hasilnya" yang berisiko
    // salah klik) -- RLS `prospects_read` membuat akun Flow 1-3 ("PT Agro
    // Sawit Kalimantan") TIDAK TERLIHAT oleh sesi ini (sudah didokumentasikan
    // di komentar `prospectId` di atas), dan akun BUKAN prasyarat W-16 sama
    // sekali: Service Type/Direction/svcJciBlocked murni fungsi dari
    // role+entitas sesi, nol ketergantungan pada akun mana pun terpilih.
    // Create TIDAK PERNAH ditekan di skenario ini.
    // =======================================================================
    const jciRoleResp = await pgrest(
      `user_roles?select=id&user_id=eq.${salesUserId}&company_id=eq.42569e7c-531b-4d2b-832a-d5a7268c455b&is_active=eq.true&valid_until=is.null&limit=1`,
      { token: salesToken },
    );
    const salesHasJciRoleGroundTruth = jciRoleResp.ok && Array.isArray(jciRoleResp.json) && jciRoleResp.json.length > 0;
    console.log(`  i [ACC/W-16] Ground truth REST -- baris user_roles aktif sales@msi.com di company JCI: ${salesHasJciRoleGroundTruth ? 'ADA (akun ini PUNYA akses JCI hari ini -- data staging berubah)' : 'NOL (akun ini TANPA akses JCI -- svcJciBlocked HARUS menyala)'}`);

    await page3.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
    await settle(page3);
    await stepPill(page3, 'Service & Direction').click();
    await settle(page3, 300);
    await page3.locator('button:has-text("Customs Clearance")').first().click();
    await settle(page3, 300);
    // Diagnosis 198/200 (run 735c50d) -- teks banner yang dicek SEBELUMNYA
    // ("JCI sales access is required for Customs Clearance") TIDAK PERNAH
    // cocok dengan teks asli di kode (`InquiryIntakeWizardPage.jsx`, span di
    // dalam blok `svcJciBlocked`): "Customs Clearance is a JCI service
    // line. Ask your manager to request JCI sales access for your account
    // to continue." -- dua frasa itu salah tulis skrip, BUKAN kutipan dari
    // kode. Dikonfirmasi lewat browser nyata (dua kali: alur pengguna
    // normal dgn Customer dipilih, DAN alur persis skrip tanpa Customer +
    // lompat pill) -- banner tampil SEKETIKA (nol race data `myCompanyIds`)
    // dan Next benar menolak pindah step di keduanya. Regex diperbaiki ke
    // potongan stabil dari kalimat asli.
    const w16BannerVisible = (await page3.locator('text=/Customs Clearance is a JCI service line/i').count()) > 0;
    if (salesHasJciRoleGroundTruth) {
      console.log('  ⚠⚠ [ACC/W-16] PERINGATAN KERAS: ground truth REST membuktikan sales@msi.com PUNYA role aktif JCI hari ini -- svcJciBlocked tidak akan menyala. Pengecekan W-16 di bawah DILEWATI dengan alasan eksplisit (bukan gagal diam-diam, bukan dipaksa lulus).');
    } else {
      // Prasyarat eksplisit (diminta Mas) -- buktikan pengecekan Next-block
      // di bawah TIDAK vakum: step aktif BENAR "Service & Direction" (bukan
      // kebetulan nyangkut di step lain) DAN kartu Customs Clearance BENAR
      // terpilih (latar oranye C.orangeSoft '#FDF0E9' = rgb(253,240,233),
      // pola sama cek Pill aktif di tempat lain skrip ini) SEBELUM Next
      // diklik -- kalau salah satu prasyarat ini gagal, hasil check
      // berikutnya tidak bisa dipercaya sebagai bukti W-16.
      check('[ACC/W-16] Prasyarat: masih di step "Service & Direction" sesaat sebelum Next diklik',
        await isStepActive(page3, 'Service & Direction'));
      check('[ACC/W-16] Prasyarat: kartu "Customs Clearance" benar terpilih (latar oranye aktif)',
        /253,\s*240,\s*233/.test(await page3.locator('button:has-text("Customs Clearance")').first().evaluate((el) => getComputedStyle(el).backgroundColor)));
      check('[ACC/W-16] Banner blokir akses JCI tampil (ground truth REST: akun TANPA role aktif di JCI)', w16BannerVisible);
      await page3.locator('button:has-text("Next")').first().click();
      await settle(page3, 300);
      check('[ACC/W-16] Next di "Service & Direction" TIDAK memindahkan step saat JCI terblokir',
        await isStepActive(page3, 'Service & Direction'));
      check('[ACC/W-16] Banner blokir JCI TETAP terlihat setelah Next ditolak (penolakan tidak diam-diam)',
        (await page3.locator('text=/Customs Clearance is a JCI service line/i').count()) > 0);
    }
    console.log('  i [ACC/W-16] Create TIDAK ditekan pada skenario ini -- nol inquiry baru tercipta dari sesi sales@msi.com.');

    // ── Berkas fixture di temp OS (os.tmpdir(), BUKAN disk repo, dihapus di
    // akhir flow ini) -- .txt kecil (jenis ditolak) + "PDF" minimal (header
    // %PDF- cukup supaya Playwright mengirim Content-Type application/pdf
    // lewat setInputFiles; FE hanya membaca file.type/file.size, tidak
    // pernah membaca ISI berkas). ────────────────────────────────────────────
    const tmpDir = mkdtempSync(join(tmpdir(), 'e2e-k1d-'));
    const txtPath = join(tmpDir, 'bukti-tidak-valid.txt');
    const pdfPath = join(tmpDir, 'bukti-valid.pdf');
    writeFileSync(txtPath, 'Bukti uji e2e K1d -- bukan berkas sungguhan.\n');
    writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

    if (quoAId) {
      // ── (1) Detail Quotation A -- klik "Mark Accepted": modal terbuka. ────
      await page3.goto(`${BASE}${QUOTATION_DETAIL_PATH}/${quoAId}`, { waitUntil: 'domcontentloaded' });
      await settle(page3);
      const markAcceptedBtn = page3.locator('button:has-text("Mark Accepted")');
      check('[ACC] (1) Tombol "Mark Accepted" terlihat di Detail Quotation A', await markAcceptedBtn.isVisible().catch(() => false));
      await markAcceptedBtn.click();
      await settle(page3, 300);
      check('[ACC] (1) Modal "Record customer acceptance" terbuka', (await page3.locator('text="Record customer acceptance"').count()) > 0);
      check('[ACC] (1) Tombol submit "Yes, Mark Accepted" terlihat di modal', await page3.locator('button:has-text("Yes, Mark Accepted")').isVisible().catch(() => false));

      // ── (2) Submit TANPA file -- pesan inline, modal tetap terbuka, DB SENT. ──
      await page3.locator('button:has-text("Yes, Mark Accepted")').click();
      await settle(page3, 300);
      check('[ACC] (2) Pesan inline "Proof is required." tampil', (await page3.locator('text="Proof is required."').count()) > 0);
      check('[ACC] (2) Modal tetap terbuka setelah submit tanpa file', (await page3.locator('text="Record customer acceptance"').count()) > 0);
      let quoACheck = await pgrest(`quotations?id=eq.${quoAId}&select=status`, { token: salesToken });
      check('[ACC] (2) Quotation A di DB tetap SENT (nol file)', quoACheck.json?.[0]?.status === 'SENT', JSON.stringify(quoACheck.json));

      // ── (3) File .txt (jenis ditolak) -- pesan diperbaiki Putaran 6 Task 3
      // (dulu Indonesia, tertelan toast berawalan Inggris "Failed to record
      // the outcome: " -- campur bahasa; db.js kini "... is not accepted.
      // Only PDF, JPG, and PNG."). Regex ikut diperbarui ke teks baru. ──────
      await page3.locator('input[type="file"]').first().setInputFiles(txtPath);
      await settle(page3, 300);
      await waitForToastGone(page3);
      await page3.locator('button:has-text("Yes, Mark Accepted")').click();
      await settle(page3, 800);
      const toastAfterTxt = (await toastLocator(page3).allInnerTexts().catch(() => [])).filter(Boolean);
      const inlineAfterTxt = (await page3.locator('text=/not accepted/i').count()) > 0;
      const modalStillOpenAfterTxt = (await page3.locator('text="Record customer acceptance"').count()) > 0;
      check('[ACC] (3) Pesan penolakan jenis berkas muncul (toast ATAU inline)',
        inlineAfterTxt || toastAfterTxt.some((t) => /not accepted/i.test(t)),
        `toast terlihat: ${JSON.stringify(toastAfterTxt)} · inline "not accepted": ${inlineAfterTxt} · modal masih terbuka: ${modalStillOpenAfterTxt}`);
      quoACheck = await pgrest(`quotations?id=eq.${quoAId}&select=status`, { token: salesToken });
      check('[ACC] (3) Quotation A di DB tetap SENT (file .txt ditolak)', quoACheck.json?.[0]?.status === 'SENT', JSON.stringify(quoACheck.json));

      // ── (4) PDF valid + Notes -- sukses, toast, kembali ke daftar. Buka
      // ulang modal secara eksplisit kalau langkah (3) kebetulan menutupnya
      // (temuan, bukan diasumsikan) -- supaya langkah ini tidak bergantung
      // pada state modal yang ditinggalkan langkah sebelumnya. ─────────────
      if (!modalStillOpenAfterTxt) {
        await page3.goto(`${BASE}${QUOTATION_DETAIL_PATH}/${quoAId}`, { waitUntil: 'domcontentloaded' });
        await settle(page3);
        await page3.locator('button:has-text("Mark Accepted")').click();
        await settle(page3, 300);
      }
      await page3.locator('input[type="file"]').first().setInputFiles(pdfPath);
      await settle(page3, 300);
      await page3.locator('#quo-accept-notes').fill('ZZZTEST e2e catatan');
      await waitForToastGone(page3);
      await page3.locator('button:has-text("Yes, Mark Accepted")').click();
      await checkToastExact(page3, '[ACC] (4) Toast "Quotation marked as accepted" tampil', 'Quotation marked as accepted', 8000);
      await settle(page3, 500);
      const urlAfterAccept = page3.url();
      check('[ACC] (4) Kembali ke daftar Quotation setelah sukses', new URL(urlAfterAccept).pathname === QUOTATION_DETAIL_PATH, urlAfterAccept);

      // ── (5) Verifikasi DB (sesi sales@msi.com). ──────────────────────────
      const quoAFinal = await pgrest(`quotations?id=eq.${quoAId}&select=status,accepted_evidence_path,accepted_by`, { token: salesToken });
      const rowA = quoAFinal.json?.[0] || {};
      check('[ACC] (5) Quotation A status ACCEPTED', rowA.status === 'ACCEPTED', JSON.stringify(rowA));
      check('[ACC] (5) accepted_evidence_path berawalan "<company_id>/<quotation_id>/"', typeof rowA.accepted_evidence_path === 'string' && rowA.accepted_evidence_path.startsWith(`${ACC_COMPANY_MSI}/${quoAId}/`), rowA.accepted_evidence_path);
      check('[ACC] (5) accepted_by = user uji (sales@msi.com)', rowA.accepted_by === salesUserId, rowA.accepted_by);

      const inqAFinal = await pgrest(`inquiries?id=eq.${inquiryAId}&select=status,won_reason`, { token: salesToken });
      const rowInqA = inqAFinal.json?.[0] || {};
      check('[ACC] (5) Inquiry A terkait jadi WON', rowInqA.status === 'WON', JSON.stringify(rowInqA));
      check('[ACC] (5) Inquiry A won_reason = "Accepted quotation"', rowInqA.won_reason === 'Accepted quotation', rowInqA.won_reason);

      const auditResp = await pgrest(`audit_logs?action=eq.ACCEPT_QUOTATION&entity_id=eq.${quoAId}&select=notes`, { token: salesToken });
      if (auditResp.ok && Array.isArray(auditResp.json) && auditResp.json.length > 0) {
        check('[ACC] (5) audit_logs.notes = "ZZZTEST e2e catatan"', auditResp.json[0]?.notes === 'ZZZTEST e2e catatan', JSON.stringify(auditResp.json));
      } else {
        console.log('  ⊘ SKIPPED [ACC] (5) audit_logs.notes -- sales@msi.com tidak lolos audit_logs_read (is_admin_or_above() wajib); tidak dipaksa pakai sesi lain.');
      }

      // ── (6) Reopen Detail A -- "Acceptance Evidence" + "View proof", klik. ──
      await page3.goto(`${BASE}${QUOTATION_DETAIL_PATH}/${quoAId}`, { waitUntil: 'domcontentloaded' });
      await settle(page3);
      check('[ACC] (6) Baris "Acceptance Evidence" tampil', (await page3.locator('text="Acceptance Evidence"').count()) > 0);
      const viewProofBtn = page3.locator('button:has-text("View proof")');
      check('[ACC] (6) Tombol "View proof" terlihat', await viewProofBtn.isVisible().catch(() => false));
      try {
        const [popup] = await Promise.all([
          page3.context().waitForEvent('page', { timeout: 15000 }),
          viewProofBtn.click(),
        ]);
        await popup.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
        const popupUrl = popup.url();
        const fileResp = await fetch(popupUrl).catch((e) => ({ ok: false, status: 0, headers: new Map(), _err: e.message }));
        check('[ACC] (6) Tab baru terbuka ke URL signed Storage (bucket quotation-acceptance-evidence)', /quotation-acceptance-evidence/.test(popupUrl), popupUrl);
        check('[ACC] (6) Respons file HTTP 200', fileResp.ok === true, fileResp.ok === false ? `status ${fileResp.status}${fileResp._err ? ' -- ' + fileResp._err : ''}` : `status ${fileResp.status}`);
        const ct = fileResp.headers?.get?.('content-type') || '';
        check('[ACC] (6) Content-Type respons memuat "pdf"', /pdf/i.test(ct), ct);
        await popup.close().catch(() => {});
      } catch (e) {
        check('[ACC] (6) Klik "View proof" membuka tab baru ke berkas (fetch ulang di sisi Node)', false, `exception: ${e.message}`);
      }
    } else {
      console.log('  ⚠ Fixture A gagal dibuat -- langkah (1)-(6) dilewati sama sekali (bukan dicoba lalu gagal), lihat check() fixture di atas utk akarnya.');
    }

    // ── (7) Regresi Reject -- Detail Quotation B, "Mark Rejected" (tombol
    // + RejectReasonModal SUDAH ADA sebelum K1d, TIDAK disentuh K1d). ───────
    if (quoBId) {
      await page3.goto(`${BASE}${QUOTATION_DETAIL_PATH}/${quoBId}`, { waitUntil: 'domcontentloaded' });
      await settle(page3);
      const markRejectedBtn = page3.locator('button:has-text("Mark Rejected")');
      check('[ACC] (7) Tombol "Mark Rejected" terlihat di Detail Quotation B', await markRejectedBtn.isVisible().catch(() => false));
      await markRejectedBtn.click();
      await settle(page3, 300);
      await page3.locator('#quo-reject-reason').fill('ZZZTEST e2e alasan tolak (regresi)');
      await waitForToastGone(page3);
      // Trigger "Mark Rejected" (action bar) DAN submit modal "Mark Rejected"
      // sama-sama cocok selector teks ini -- modal dirender TERAKHIR di JSX
      // (sesudah action bar), jadi .last() = submit modal (bukan trigger).
      await page3.locator('button:has-text("Mark Rejected")').last().click();
      await settle(page3, 800);
      const quoBFinal = await pgrest(`quotations?id=eq.${quoBId}&select=status,rejection_reason,accepted_evidence_path`, { token: salesToken });
      const rowB = quoBFinal.json?.[0] || {};
      check('[ACC] (7) Quotation B status REJECTED', rowB.status === 'REJECTED', JSON.stringify(rowB));
      check('[ACC] (7) Quotation B rejection_reason terisi', !!rowB.rejection_reason, rowB.rejection_reason);
      check('[ACC] (7) Quotation B accepted_evidence_path NULL', rowB.accepted_evidence_path == null, rowB.accepted_evidence_path);
    }

    // ── (8) Guard lewat REST langsung (sesi sales@msi.com, BUKAN service_role). ──
    if (quoCId) {
      const directUpdate = await pgrest(`quotations?id=eq.${quoCId}`, { method: 'PATCH', token: salesToken, body: { status: 'ACCEPTED' } });
      check('[ACC] (8) UPDATE langsung status=ACCEPTED DITOLAK', !directUpdate.ok, `status ${directUpdate.status}`);
      const msg1 = typeof directUpdate.json === 'object' ? directUpdate.json?.message : String(directUpdate.json);
      check('[ACC] (8) Pesan error memuat "tidak bisa diubah langsung ke ACCEPTED"', /tidak bisa diubah langsung ke ACCEPTED/.test(msg1 || ''), msg1);
      const quoCAfterPatch = await pgrest(`quotations?id=eq.${quoCId}&select=status`, { token: salesToken });
      check('[ACC] (8) Quotation C di DB tetap SENT setelah UPDATE langsung ditolak', quoCAfterPatch.json?.[0]?.status === 'SENT', JSON.stringify(quoCAfterPatch.json));

      const rpcNoEvidence = await pgrest('rpc/set_quotation_outcome', {
        method: 'POST', token: salesToken,
        body: { p_quotation_id: quoCId, p_outcome: 'ACCEPTED', p_reason: null, p_evidence_path: null },
      });
      check('[ACC] (8) RPC set_quotation_outcome ACCEPTED tanpa p_evidence_path DITOLAK', !rpcNoEvidence.ok, `status ${rpcNoEvidence.status}`);
      const msg2 = typeof rpcNoEvidence.json === 'object' ? rpcNoEvidence.json?.message : String(rpcNoEvidence.json);
      check('[ACC] (8) Pesan error memuat "Bukti wajib dilampirkan"', /Bukti wajib dilampirkan/.test(msg2 || ''), msg2);
    }

    rmSync(tmpDir, { recursive: true, force: true });
    await ctx3.close().catch(() => {});

    console.log('\n  → [ACC] Fixture tertinggal di staging (ZZZTEST, utk pembersihan nanti):');
    console.log(`      inquiry A  : ${inquiryAId || '(gagal dibuat)'}  nomor server: ${inquiryANo || '(tidak tertangkap)'}  (notes = penanda ZZZTEST)`);
    console.log(`      quotation A: ${quoAId || '(gagal dibuat)'}  (ZZZTEST-E2E-K1D-A-${nonce})`);
    console.log(`      quotation B: ${quoBId || '(gagal dibuat)'}  (ZZZTEST-E2E-K1D-B-${nonce})`);
    console.log(`      quotation C: ${quoCId || '(gagal dibuat)'}  (ZZZTEST-E2E-K1D-C-${nonce})`);
    testDataLog.push(`Flow 4 (ACC) — inquiry A: ${inquiryAId || '(gagal dibuat)'}, nomor server: ${inquiryANo || '(tidak tertangkap)'}`);
    testDataLog.push(`Flow 4 (ACC) — quotation A: ${quoAId || '(gagal dibuat)'} (ZZZTEST-E2E-K1D-A-${nonce})`);
    testDataLog.push(`Flow 4 (ACC) — quotation B: ${quoBId || '(gagal dibuat)'} (ZZZTEST-E2E-K1D-B-${nonce})`);
    testDataLog.push(`Flow 4 (ACC) — quotation C: ${quoCId || '(gagal dibuat)'} (ZZZTEST-E2E-K1D-C-${nonce})`);
  } catch (e) {
    // e.cause -- undici (fetch Node) membungkus error jaringan NYATA di sini
    // (mis. ECONNRESET/ETIMEDOUT/ENOTFOUND); e.message sendiri SELALU cuma
    // "fetch failed" generik, nol info penyebab. Dicetak eksplisit supaya
    // kalau ini muncul lagi, penyebab sebenarnya kelihatan tanpa menebak.
    const causeCode = e.cause?.code || e.cause?.errors?.[0]?.code || null;
    const causeText = e.cause ? `${causeCode ? causeCode + ' -- ' : ''}${e.cause.message || e.cause}` : '(tidak ada e.cause)';
    console.log(`\n  ✖ FLOW KEEMPAT berhenti karena exception tak tertangkap -- dilaporkan, flow 1-3 TIDAK terdampak (sudah selesai sebelum blok ini jalan): ${e.message} | cause: ${causeText}`);
    // Putaran 13a Task 3 -- screenshot percobaan-terbaik (pola sama
    // recordFlowFailure), ditambahkan di sini DI DALAM catch yang sudah ada
    // (bukan diganti ke recordFlowFailure) supaya ekstraksi e.cause di atas,
    // yang khusus utk fetch Node, tetap terpakai apa adanya.
    let shotPath = '';
    if (page3 && typeof page3.isClosed === 'function' && !page3.isClosed()) {
      try {
        shotPath = join(tmpdir(), `e2e-inquiry-wizard-ACC-${Date.now()}.png`);
        await page3.screenshot({ path: shotPath, fullPage: true });
        console.log(`    screenshot: ${shotPath}`);
      } catch { shotPath = ''; }
    }
    check('[ACC] Flow 4 selesai tanpa exception fatal', false, `${(e.stack || '').split('\n').slice(0, 3).join(' | ')} | cause: ${causeText}${shotPath ? ' | screenshot: ' + shotPath : ''}`);
    testDataLog.push('Flow 4 (ACC): BERHENTI sebelum selesai — data yang sempat tercipta sebelum titik ini TIDAK dihapus, lihat baris log Flow 4 di atas (fixture A/B/C) untuk id/nomor yang sudah tercetak sebelum exception ini.');
  }

  if (consoleErrors.length) console.log(`\n⚠ pageerror (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);
  await browser.close();

  // Putaran 13a Task 3.2 -- ringkasan lulus/gagal PER FLOW, dideduksi dari
  // prefix bracket yang SUDAH ADA di nama tiap check() (`[D2D]`/`[RS]`/
  // `[MGR]`/`[ACC]`; nol bracket = Flow 1) -- nol perubahan pada check()
  // itu sendiri, murni klasifikasi di titik cetak. Entri "-FATAL" yang
  // ditambahkan recordFlowFailure() (mis. "[FLOW1-FATAL] ...") ikut masuk
  // ke bucket Flow yang sama lewat pencocokan prefix yang sama.
  function classifyFlow(name) {
    if (name.startsWith('[D2D')) return 'D2D (Pickup/Delivery wajib — Door to Door)';
    // Putaran 13b -- prefix `[P13b/...]` (check biasa) DAN `[P13B-FATAL]`
    // (recordFlowFailure, tag huruf besar) sama-sama diawali "[P13" --
    // satu cabang mencakup keduanya, bukan dua cabang case-sensitive.
    if (name.startsWith('[P13')) return 'Putaran 13b (W-14/16/21/33/34/40/44/64)';
    if (name.startsWith('[RS')) return 'Flow 2 (Rate Sheet Request)';
    if (name.startsWith('[MGR')) return 'Flow 3 (Owner default manager)';
    if (name.startsWith('[ACC')) return 'Flow 4 (Mark Accepted dengan bukti)';
    return 'Flow 1 (Single Shipment)';
  }
  const flowOrder = [
    'Flow 1 (Single Shipment)',
    'D2D (Pickup/Delivery wajib — Door to Door)',
    'Putaran 13b (W-14/16/21/33/34/40/44/64)',
    'Flow 2 (Rate Sheet Request)',
    'Flow 3 (Owner default manager)',
    'Flow 4 (Mark Accepted dengan bukti)',
  ];
  const byFlow = new Map(flowOrder.map((f) => [f, { pass: 0, fail: 0 }]));
  for (const r of results) {
    const bucket = byFlow.get(classifyFlow(r.name));
    if (r.ok) bucket.pass++; else bucket.fail++;
  }
  console.log('\n— RINGKASAN PER FLOW —');
  for (const f of flowOrder) {
    const b = byFlow.get(f);
    const total = b.pass + b.fail;
    if (total === 0) { console.log(`  • ${f}: (dilewati — 0 pengecekan tercatat; kemungkinan --only 4, atau Flow ini berhenti SEBELUM check() pertamanya sempat jalan)`); continue; }
    console.log(`  ${b.fail ? '✖' : '✔'} ${f}: ${b.pass}/${total} lulus`);
  }

  if (testDataLog.length) {
    console.log('\n— DATA UJI YANG TERCIPTA DI STAGING (tidak dihapus skrip ini) —');
    for (const t of testDataLog) console.log(`  • ${t}`);
  }

  const bad = results.filter((x) => !x.ok).length;
  console.log(`\n${bad ? '✖' : '✔'} ${results.length - bad}/${results.length} LULUS (total gabungan seluruh Flow)`);
  if (inquiryNo) console.log(`Nomor inquiry (cek di database): ${inquiryNo}`);
  process.exit(bad ? 1 : 0);
})();

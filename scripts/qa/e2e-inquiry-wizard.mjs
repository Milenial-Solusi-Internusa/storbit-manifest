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
// ⚠️ Beberapa selector bergantung pada STRUKTUR DOM InquiryIntakeWizardPage.jsx/
// DealDetailPage.jsx hari ini (nol id/name/aria-label eksplisit di kontrol
// form -- pola yang sama dengan file itu sendiri, lihat komentarnya). Kalau
// strukturnya berubah di Tahap 4C atau revisi berikutnya, selector XPath di
// bawah (berbasis teks label yang tampil ke user, bukan class CSS) kemungkinan
// besar tetap cocok, tapi tidak dijamin -- laporkan dengan pesan yang jelas
// (lihat helper `check`), bukan diam-diam lolos.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const BASE = opt('base', 'http://localhost:4173').replace(/\/+$/, '');
const ACCOUNT = opt('account', 'test@msi.com');
const SETTLE = Number(opt('settle', '1200'));

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
  const btn = page.locator(`button:text-is(${JSON.stringify(stepLabel)})`);
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
  console.log(`e2e-inquiry-wizard — ${BASE} · project ${REF} · akun ${ACCOUNT}\n`);

  const PASSWORD = await resolvePassword();
  const session = await loginSession(ACCOUNT, PASSWORD);

  const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed') });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* mode privat */ } }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message || e).slice(0, 160)));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);

  // ── buka wizard baru (CREATE-only; InquiryFormPage.jsx TETAP utk EDIT,
  // tidak disentuh di sini) ──────────────────────────────────────────────
  await page.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  check('Wizard Intake Form terbuka', await page.locator('h1:text-is("New Inquiry")').count() > 0,
    (await page.title()));

  // ── negatif (FIX 6): Warehousing/General Trading TIDAK ADA di kartu
  // Service Type — dicek di langkah 2 (step pill ke-2, bisa diklik langsung
  // tanpa mengisi langkah 1 dulu, pola navigasi pill bebas mockup). ───────
  await page.locator('button:text-is("2. Service & Direction")').click();
  await settle(page);
  check('Kartu "Warehousing" tidak ada di Service Type', await page.locator('button:has-text("Warehousing")').count() === 0);
  check('Kartu "General Trading" tidak ada di Service Type', await page.locator('button:has-text("General Trading")').count() === 0);
  check('Kartu "Customs Clearance" ADA (sanity -- bukan daftar kosong)', await page.locator('button:has-text("Customs Clearance")').count() > 0);
  check('Kartu "Door to Door" ADA', await page.locator('button:has-text("Door to Door")').count() > 0);

  // ── Langkah 1 — Customer & Contact ─────────────────────────────────────
  await page.locator('button:text-is("1. Customer & Contact")').click();
  await settle(page);
  // sourceType default 'prospect' -- tab eksplisit sesuai instruksi tugas.
  await page.locator('button:text-is("Prospect")').click();
  const prospectInput = page.locator('input[placeholder="Search prospects…"]');
  await prospectInput.fill('PT Agro Sawit Kalimantan');
  await page.waitForTimeout(400);
  const accountBtn = page.locator('button:has-text("PT Agro Sawit Kalimantan")').first();
  const accountFound = await accountBtn.count() > 0;
  check('Akun "PT Agro Sawit Kalimantan" ditemukan di pencarian Prospect', accountFound,
    accountFound ? '' : 'akun tidak ada di daftar prospect staging hari ini -- cek data, bukan skrip');
  if (accountFound) await accountBtn.click();
  await settle(page);
  const sourceText = (await fieldLocator(page, 'Source', 'div').innerText().catch(() => '')).trim();
  check('Source akun tampil "referral" (read-only)', sourceText === 'referral', `dapat: "${sourceText}"`);

  // ── Langkah 2 — Service & Direction: pilih Customs Clearance ───────────
  await page.locator('button:text-is("2. Service & Direction")').click();
  await settle(page);
  await page.locator('button:has-text("Customs Clearance")').first().click();
  await settle(page);

  // ── Langkah 3 — Route & Terms: POL Singapore / POD Jakarta ─────────────
  await page.locator('button:text-is("3. Route & Terms")').click();
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of loading…")'), 'Singapore', 'Singapore');
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of discharge or city…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
  await settle(page);

  // ── balik ke Langkah 2 — assert Direction otomatis Import, isi Customer
  // Role + Undername (Customs Clearance = inline di langkah svc, BUKAN di
  // langkah "customs" — itu khusus Door-to-Door). ─────────────────────────
  await page.locator('button:text-is("2. Service & Direction")').click();
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
  await page.locator('button:text-is("3. Route & Terms")').click();
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
  await page.locator('button:text-is("4. Cargo")').click();
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
  await page.locator('button:text-is("5. Additional Services")').click();
  await settle(page);
  await page.locator('button:has-text("Cargo Insurance")').click();
  await settle(page, 300);

  // ── Langkah 6 — Commercial: assert negatif "abc" dulu (FIX 2), baru isi
  // Estimated yang benar "1.500.000". ─────────────────────────────────────
  await page.locator('button:text-is("6. Commercial")').click();
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
  await page.locator('button:text-is("7. Review")').click();
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
    await isStepActive(page, '6. Commercial'));

  // handleCreate melompat ke step PERTAMA yang errornya ditemukan
  // stepErrors() (urutan: cust_account, svc_*, under_*, route_*, cargo_*,
  // commercial_*). Klik pill "6. Commercial" EKSPLISIT di sini -- bukan
  // hanya mengandalkan lompatan otomatis di atas -- supaya alur tetap aman
  // kalau field lain kebetulan ikut tidak valid (stepErrors menemukan error
  // itu lebih dulu dan wizard melompat ke step lain; tanpa klik eksplisit
  // ini, fieldLocator('Estimated...') berikutnya menunggu 30 detik lalu
  // timeout).
  await page.locator('button:text-is("6. Commercial")').click();
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

  const createVisibleForReal = await createBtnLocator.isVisible().catch(() => false);
  check('Tombol "Create Inquiry" terlihat sebelum diklik (percobaan sungguhan)', createVisibleForReal);

  const rpcRespPromise = page.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 20000 }).catch(() => null);
  if (createVisibleForReal) await createBtnLocator.click();
  const rpcResp = await rpcRespPromise;
  let inquiryNo = null, inquiryId = null;
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

  // ── Detail Inquiry: blok "Route Options" (SectionHeader <h3> + LaneTable
  // <h4> bersarang sejak kit extraction -- lihat laneTableContainer di atas)
  // berisi 2 baris, keduanya Sea FCL/Container (verifikasi fix 5c end-to-end,
  // item a), + POL/POD read-only saat edit section Route & Terms (FIX 5). ──
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

  // item (a) -- Mode/Load unit kedua lane harus Sea FCL/Container (kontainer
  // dipilih "FCL 20'" di wizard; sebelum fix 5c, blankLane/startLanes
  // hardcode Sea LCL/CBM utk jalur lane-mode -- gejala MSI-INQ-X-2026-0024).
  if (detailLaneCount >= 2) {
    const row0ModeUnit = await laneRow(page, 0).locator('select').evaluateAll((els) => els.map((el) => el.value));
    const row1ModeUnit = await laneRow(page, 1).locator('select').evaluateAll((els) => els.map((el) => el.value));
    check('Lane 1 Detail Inquiry menunjukkan Mode "Sea FCL"', row0ModeUnit[0] === 'Sea FCL', `dapat: ${JSON.stringify(row0ModeUnit)}`);
    check('Lane 1 Detail Inquiry menunjukkan Load unit "Container"', row0ModeUnit[1] === 'Container', `dapat: ${JSON.stringify(row0ModeUnit)}`);
    check('Lane 2 Detail Inquiry menunjukkan Mode "Sea FCL"', row1ModeUnit[0] === 'Sea FCL', `dapat: ${JSON.stringify(row1ModeUnit)}`);
    check('Lane 2 Detail Inquiry menunjukkan Load unit "Container"', row1ModeUnit[1] === 'Container', `dapat: ${JSON.stringify(row1ModeUnit)}`);
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

  // =========================================================================
  // FLOW KEDUA -- Putaran 4 Tahap 4C, mode "Rate Sheet Request". Browser/
  // login SAMA (satu proses skrip), dimulai SESUDAH flow Single Shipment di
  // atas selesai -- flow pertama TIDAK disentuh sama sekali (byte-identik).
  // =========================================================================
  console.log('\n— FLOW KEDUA: Rate Sheet Request —\n');

  await page.goto(`${BASE}/crm/inquiry/new`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  check('[RS] Wizard Intake Form terbuka (flow kedua)', await page.locator('h1:text-is("New Inquiry")').count() > 0);

  // ── Langkah 1 — akun (reuse "PT Agro Sawit Kalimantan", rute BERBEDA dari
  // flow pertama -- POL/POD dibalik, Export bukan Import -- nol risiko
  // beririsan dengan inquiry flow pertama). ──────────────────────────────
  await page.locator('button:text-is("1. Customer & Contact")').click();
  await settle(page);
  await page.locator('button:text-is("Prospect")').click();
  const rsProspectInput = page.locator('input[placeholder="Search prospects…"]');
  await rsProspectInput.fill('PT Agro Sawit Kalimantan');
  await page.waitForTimeout(400);
  const rsAccountBtn = page.locator('button:has-text("PT Agro Sawit Kalimantan")').first();
  if (await rsAccountBtn.count() > 0) await rsAccountBtn.click();
  await settle(page);

  // ── Langkah 2 — Service Type "Freight Forwarding" + Customer Role
  // "Shipper" (hindari Customs/Undername -- sudah teruji flow pertama,
  // fokus RS saja; Customer Role WAJIB kecuali service_type='trading'). ───
  await page.locator('button:text-is("2. Service & Direction")').click();
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
  await page.locator('button:text-is("3. Route & Terms")').click();
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of loading…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
  await settle(page);
  await pickLocation(page, page.locator('button:has-text("Select port of discharge or city…")'), 'Singapore', 'Singapore');
  await settle(page);
  await page.locator('button:text-is("FCL 20\'")').click();
  await settle(page, 600);

  // ── Toggle ke "Rate Sheet Request" (langkah 1). ──────────────────────────
  await page.locator('button:text-is("1. Customer & Contact")').click();
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
  await page.locator('button:text-is("3. Route & Terms")').click();
  await settle(page);
  for (const label of ['Pickup Address', 'Delivery Address', 'Incoterm', 'Container Type', 'Number of containers', 'Cargo ready date']) {
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
  check('[RS] Wizard berpindah balik ke step "3. Route & Terms" saat nol lane terpilih', await isStepActive(page, '3. Route & Terms'));
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
  check('[RS] Wizard berpindah balik ke step "3. Route & Terms" saat validity terbalik', await isStepActive(page, '3. Route & Terms'));
  check('[RS] Pesan validity error tampil saat validity_to < validity_from',
    (await page.locator('text=/Enter the requested validity/i').count()) > 0);

  await page.locator('button:text-is("3. Route & Terms")').click();
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
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await ctx2.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* mode privat */ } }, [`sb-${REF}-auth-token`, JSON.stringify(managerSession)]);
  const page2 = await ctx2.newPage();
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
    check(`[MGR] Wizard Intake Form terbuka (${checkLabel})`, await pg.locator('h1:text-is("New Inquiry")').count() > 0);
    await pg.locator('button:text-is("1. Customer & Contact")').click();
    await settle(pg);
    await pg.locator('button:text-is("Prospect")').click();
    await pg.locator('input[placeholder="Search prospects…"]').fill('PT Agro Sawit Kalimantan');
    await pg.waitForTimeout(400);
    await pg.locator('button:has-text("PT Agro Sawit Kalimantan")').first().click();
    await settle(pg);
    await pg.locator('button:text-is("2. Service & Direction")').click();
    await settle(pg);
    await pg.locator('button:has-text("Freight Forwarding")').first().click();
    await settle(pg, 300);
    await pg.locator('button:text-is("Shipper")').click();
    await settle(pg);
    await pg.locator('button:text-is("3. Route & Terms")').click();
    await settle(pg);
    await pickLocation(pg, pg.locator('button:has-text("Select port of loading…")'), 'Singapore', 'Singapore');
    await settle(pg);
    await pickLocation(pg, pg.locator('button:has-text("Select port of discharge or city…")'), 'Jakarta', 'Jakarta (Tanjung Priok)');
    await settle(pg);
    await pg.locator('button:text-is("6. Commercial")').click();
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

  await page2.locator('button:text-is("7. Review")').click();
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

  // ── (c): inquiry #2 -- Owner DIGANTI manual ke "ZZZTEST Sales" sebelum
  // Create, owner_id yang tersimpan harus ikut pilihan manual itu. ────────
  await openWizardAndFillToCommercial(page2, 'inquiry #2, ganti owner');
  const ownerSelect2 = fieldLocator(page2, 'Owner', 'select');
  await ownerSelect2.selectOption({ label: SWITCH_OWNER_NAME });
  await settle(page2, 300);
  const ownerSelectedText2 = await ownerSelect2.evaluate((el) => el.options[el.selectedIndex]?.textContent || '').catch(() => '');
  check('[MGR] Owner berhasil diganti ke "ZZZTEST Sales" sebelum Create', ownerSelectedText2 === SWITCH_OWNER_NAME, `dapat: "${ownerSelectedText2}"`);

  await page2.locator('button:text-is("7. Review")').click();
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

  if (consoleErrors.length) console.log(`\n⚠ pageerror (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);
  await browser.close();

  const bad = results.filter((x) => !x.ok).length;
  console.log(`\n${bad ? '✖' : '✔'} ${results.length - bad}/${results.length} LULUS`);
  if (inquiryNo) console.log(`Nomor inquiry (cek di database): ${inquiryNo}`);
  process.exit(bad ? 1 : 0);
})();

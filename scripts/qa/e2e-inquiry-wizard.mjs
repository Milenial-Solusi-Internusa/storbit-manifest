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

async function resolvePassword() {
  if (process.env.QA_PASSWORD) return process.env.QA_PASSWORD;
  if (!process.stdin.isTTY) {
    console.error('QA_PASSWORD (env) wajib saat stdin bukan TTY — password bersama akun uji, JANGAN ditulis di repo');
    process.exit(2);
  }
  let pw;
  try {
    pw = await promptHiddenPassword(`Password akun uji untuk ${ACCOUNT} (tersembunyi, Enter untuk kirim): `);
  } catch (e) {
    console.error(e.message === 'CANCELLED' ? 'Dibatalkan (Ctrl+C) — nol password terbaca.' : `Dibatalkan: ${e.message}`);
    process.exit(130);
  }
  if (!pw) { console.error('Password kosong — dibatalkan.'); process.exit(2); }
  return pw;
}

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

(async () => {
  console.log(`e2e-inquiry-wizard — ${BASE} · project ${REF} · akun ${ACCOUNT}\n`);

  const PASSWORD = await resolvePassword();

  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: ACCOUNT, password: PASSWORD }),
  });
  if (!r.ok) { console.error(`login gagal: HTTP ${r.status}`); process.exit(1); }
  const s = await r.json();
  const session = { access_token: s.access_token, refresh_token: s.refresh_token, token_type: s.token_type,
    expires_in: s.expires_in, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in, user: s.user };

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

  await page.locator('button:has-text("Add route option")').click();
  await settle(page);
  const laneRows = page.locator('div:has(> div > h4:text-is("Route options (2)")) ~ div table, table'); // lihat assert di bawah utk hitungan baris sungguhan
  const laneHeading = await page.locator('h4:has-text("Route options")').innerText().catch(() => '');
  check('Tabel lane menunjukkan 2 lane setelah "Add route option"', laneHeading.includes('(2)'), laneHeading);
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

  // ── Detail Inquiry: blok "Route Options" berisi 2 baris + POL/POD
  // read-only saat edit section Route & Terms (FIX 5). ────────────────────
  await settle(page, 800);
  const routeOptionsHeading = await page.locator('h4:has-text("Route Options")').innerText().catch(() => '');
  check('Blok "Route Options" tampil di Detail Inquiry', routeOptionsHeading.includes('Route Options'), routeOptionsHeading);
  check('Blok "Route Options" berisi 2 baris', routeOptionsHeading.includes('(2)'), routeOptionsHeading);
  const routeOptionsRows = await page.locator('h4:has-text("Route Options") ~ div table tbody tr, h4:has-text("Route Options") + div table tbody tr').count().catch(() => 0);
  check('Tabel Route Options punya tepat 2 <tr>', routeOptionsRows === 2, `dapat: ${routeOptionsRows}`);

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
  }

  if (consoleErrors.length) console.log(`\n⚠ pageerror (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);
  await browser.close();

  const bad = results.filter((x) => !x.ok).length;
  console.log(`\n${bad ? '✖' : '✔'} ${results.length - bad}/${results.length} LULUS`);
  if (inquiryNo) console.log(`Nomor inquiry (cek di database): ${inquiryNo}`);
  process.exit(bad ? 1 : 0);
})();

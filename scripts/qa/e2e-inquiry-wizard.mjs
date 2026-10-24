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
// jalan ke ref PRODUKSI (untmpqceexwxzuhlmyrg), password HANYA dari env
// QA_PASSWORD (tidak pernah ditulis ke berkas/stdout), login via GoTrue
// password grant lalu sesi disuntik ke localStorage (nol ketikan password
// di UI, nol screenshot/log yang bisa memuatnya).
//
// CARA JALAN (CC tidak pernah menjalankan ini -- nol akses password):
//   1. Build yang mau diuji sudah dilayani statis:
//        npm run build && npx vite preview --port 4173
//   2. env lokal (.env.local atau --env) menunjuk STAGING (bukan produksi --
//      skrip menolak ref produksi apa pun isi env-nya).
//   3. Jalankan:
//        QA_PASSWORD='<password akun uji>' node scripts/qa/e2e-inquiry-wizard.mjs \
//          --base http://localhost:4173
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
const PASSWORD = process.env.QA_PASSWORD;
if (!PASSWORD) { console.error('QA_PASSWORD (env) wajib — password bersama akun uji, JANGAN ditulis di repo'); process.exit(2); }

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

// XPath: cari div/label yang teksnya PERSIS sama dengan `label` (bukan
// substring — mockup punya label pendek "Owner" yang jadi substring label
// lain), lalu ambil elemen `tag` pertama di dalam SIBLING SETELAHNYA.
// Mencocokkan struktur nyata Field({label, children}) di InquiryIntakeWizardPage.jsx:
// <div><div>{label}{*}</div>{children}</div> — label dan children SIBLING,
// bukan nested.
function fieldLocator(page, label, tag) {
  // normalize-space menyamakan "Importer of Record *" (asterisk ikut node teks
  // yang sama di beberapa browser) dengan "Importer of Record" — dicocokkan
  // dengan starts-with supaya asterisk wajib tidak menggagalkan pencocokan.
  return page.locator(
    `xpath=//div[starts-with(normalize-space(.), ${JSON.stringify(label)})][not(.//div[starts-with(normalize-space(.), ${JSON.stringify(label)})])]/following-sibling::*[1]//${tag}`
  ).first();
}
// SectionHeader (DealDetailPage.jsx): <div><h3>{title}</h3>{button Edit}</div> —
// title dan tombol SIBLING, parent langsung dari h3.
function sectionButton(page, title, buttonText) {
  return page.locator(`xpath=//h3[normalize-space(text())=${JSON.stringify(title)}]/parent::div//button[normalize-space(text())=${JSON.stringify(buttonText)}]`).first();
}

async function pickLocation(page, triggerLocator, searchText, resultText) {
  await triggerLocator.click();
  await page.waitForSelector('input[placeholder="Search code or name"]', { timeout: 10000 });
  await page.fill('input[placeholder="Search code or name"]', searchText);
  await page.waitForTimeout(300);
  const result = page.locator(`button:has-text("${resultText}")`).first();
  await result.waitFor({ timeout: 10000 });
  await result.click();
}

(async () => {
  console.log(`e2e-inquiry-wizard — ${BASE} · project ${REF} · akun ${ACCOUNT}\n`);

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
  await pickLocation(page, page.locator('button:has-text("Select port of discharge or city…")'), 'Jakarta', 'Jakarta');
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
  if (await lane2PodTrigger.count() > 0) {
    await pickLocation(page, lane2PodTrigger, 'Jakarta', 'Jakarta');
    await settle(page, 300);
  }

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

  // coba Create sementara "abc" masih di field -- harus DITOLAK (lompat balik
  // ke langkah yang error, toast peringatan, BUKAN membuat inquiry).
  await page.locator('button:text-is("7. Review")').click();
  await settle(page);
  const createBtnLocator = page.locator('button:text-is("Create Inquiry")');
  const urlBeforeBadCreate = page.url();
  if (await createBtnLocator.count() > 0) await createBtnLocator.click();
  await settle(page, 500);
  check('Create DITOLAK selama Estimated "abc" tak dikenali (URL tidak pindah ke Detail Inquiry)',
    page.url() === urlBeforeBadCreate, page.url());

  // perbaiki ke nilai yang benar, lanjutkan alur sukses.
  await page.locator('button:text-is("6. Commercial")').click();
  await settle(page);
  await estInput.fill('1.500.000');
  await estInput.blur();
  await settle(page, 300);
  check('"Angka tidak dikenali" hilang setelah Estimated diperbaiki', await page.locator('text="Angka tidak dikenali"').count() === 0);

  // ── Create sungguhan — tangkap inquiry_no dari RESPON RPC (kebenaran
  // network-level, bukan menebak dari toast yang bisa hilang sebelum dibaca). ──
  await page.locator('button:text-is("7. Review")').click();
  await settle(page);
  const rpcRespPromise = page.waitForResponse((resp) => resp.url().includes('/rpc/create_inquiry_with_lanes'), { timeout: 20000 }).catch(() => null);
  await page.locator('button:text-is("Create Inquiry")').click();
  const rpcResp = await rpcRespPromise;
  let inquiryNo = null, inquiryId = null;
  if (rpcResp && rpcResp.ok()) {
    const body = await rpcResp.json().catch(() => null);
    const row = Array.isArray(body) ? body[0] : body;
    inquiryNo = row?.inquiry_no || null;
    inquiryId = row?.id || null;
  }
  check('RPC create_inquiry_with_lanes merespon sukses', !!rpcResp && rpcResp.ok(), rpcResp ? `HTTP ${rpcResp.status()}` : 'nol respon tertangkap');
  await settle(page, 800);
  check('Toast sukses tampil', (await page.locator('text=/Inquiry created/i').count()) > 0 || !!inquiryNo);
  check('Pindah ke Detail Inquiry setelah Create', /\/crm\/inquiry\/[0-9a-f-]+$/i.test(page.url()), page.url());

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

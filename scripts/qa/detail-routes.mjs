#!/usr/bin/env node
// scripts/qa/detail-routes.mjs
// Uji rute DETAIL ber-`:id` yang lahir sejak Batch FS Fase 2.5 G2 — bagian yang
// TIDAK bisa dibuktikan `menu-sweep.mjs` (sweep hanya membuka tujuan MENU, satu
// per satu, cold load). Skrip ini menguji butir 2 & 4 checklist README:
//
//   2. refresh di halaman detail → konteks BERTAHAN (sebelum G2: balik ke daftar)
//   4. deep link id tak sah      → keadaan kosong/error yang wajar, BUKAN layar putih
//
// plus: klik baris daftar mengubah alamat, tombol kembali mendarat di daftar,
// dan Back/Forward browser bergerak di dalam aplikasi.
//
// Dipakai per giliran G2–G6 dengan `--suite <modul>`; hari ini satu suite:
// `logistics-warehouse` (chain Storbit: SP → Picking → Surat Jalan).
//
// Pakai:
//   QA_PASSWORD=… node scripts/qa/detail-routes.mjs --base http://localhost:4173 \
//     --account zzztest.warehouse@msi.com --suite logistics-warehouse
// Butuh Google Chrome lokal (playwright-core channel 'chrome'), env menunjuk STAGING.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MENU_PATHS } from '../../src/routes/menu-paths.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const BASE = opt('base', 'http://localhost:4173').replace(/\/+$/, '');
const ACCOUNT = opt('account', '');
const SUITE = opt('suite', 'logistics-warehouse');
const SETTLE = Number(opt('settle', '1500'));
const PASSWORD = process.env.QA_PASSWORD;
if (!ACCOUNT) { console.error('--account wajib'); process.exit(2); }
if (!PASSWORD) { console.error('QA_PASSWORD (env) wajib — JANGAN ditulis di repo'); process.exit(2); }

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
const ANON_KEY = process.env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_KEY;
if (!SUPABASE_URL || !ANON_KEY) { console.error('VITE_SUPABASE_URL/KEY tidak ditemukan'); process.exit(2); }
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
if (REF === 'untmpqceexwxzuhlmyrg') { console.error('⛔ menolak jalan ke PRODUKSI'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

const SUITES = {
  'logistics-warehouse': {
    // [label, path daftar, regex path detail yang diharapkan, teks tombol kembali]
    flows: [
      { label: 'Detail SP',    list: MENU_PATHS.manifest,      detail: /\/sales-order\/[^/]+\/[^/]+$/,     back: /back to list|kembali/i },
      { label: 'Picking List', list: MENU_PATHS.picking,       detail: /\/picking-packing\/[^/]+$/,        back: /kembali ke daftar|kembali/i },
      { label: 'Surat Jalan',  list: MENU_PATHS['surat-jalan'],detail: /\/delivery-note\/[^/]+$/,          back: /kembali ke daftar|kembali/i },
    ],
    // deep link id tak sah → harus keadaan wajar, bukan layar putih
    bogus: [
      `${MENU_PATHS.picking}/00000000-0000-0000-0000-000000000000`,
      `${MENU_PATHS['surat-jalan']}/00000000-0000-0000-0000-000000000000`,
      `${MENU_PATHS.manifest}/00000000-0000-0000-0000-000000000000/SP-TIDAK-ADA`,
    ],
  },
};

const snap = () => ({
  path: location.pathname,
  heading: [...document.querySelectorAll('main h1, main h2')].map(h => h.innerText.trim()).filter(Boolean)[0] || null,
  surfaceLen: (document.querySelector('.nexus-main-surface')?.innerText || '').replace(/\s+/g, ' ').trim().length,
  denied: /Akses Ditolak/.test(document.body.innerText),
  notFound: /tidak ditemukan|not found/i.test(document.body.innerText),
  loading: /\b(Memuat|Loading)\b/.test(document.querySelector('.nexus-main-surface')?.innerText || ''),
});

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(SETTLE);
  for (let i = 0; i < 12 && (await page.evaluate(snap)).loading; i++) await page.waitForTimeout(500);
}

(async () => {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: ACCOUNT, password: PASSWORD }),
  });
  if (!r.ok) { console.error(`login gagal: HTTP ${r.status}`); process.exit(1); }
  const s = await r.json();
  const session = { access_token: s.access_token, refresh_token: s.refresh_token, token_type: s.token_type,
    expires_in: s.expires_in, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in, user: s.user };

  const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed') });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* mode privat */ } }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message || e).slice(0, 120)));
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);

  console.log(`detail-routes — ${BASE} · ${ACCOUNT} · suite ${SUITE}\n`);
  const suite = SUITES[SUITE];
  if (!suite) { console.error(`suite tidak dikenal: ${SUITE}`); process.exit(2); }

  for (const flow of suite.flows) {
    console.log(`── ${flow.label}`);
    await page.goto(`${BASE}${flow.list}`, { waitUntil: 'domcontentloaded' }); await settle(page);
    const listSnap = await page.evaluate(snap);
    if (listSnap.denied) { check(`${flow.label}: daftar terbuka`, false, 'Akses Ditolak — akun tidak berhak'); continue; }

    const row = await page.$('.nexus-main-surface table tbody tr');
    if (!row) { check(`${flow.label}: ada baris untuk diklik`, false, 'daftar kosong di staging'); continue; }
    await row.click(); await settle(page);
    const d1 = await page.evaluate(snap);
    check(`${flow.label}: klik baris → alamat berubah ke rute detail`, flow.detail.test(d1.path), d1.path);

    // BUTIR 2 checklist: refresh di halaman detail — konteks harus BERTAHAN
    await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page);
    const d2 = await page.evaluate(snap);
    check(`${flow.label}: refresh → tetap di detail yang sama`,
      d2.path === d1.path && flow.detail.test(d2.path) && d2.surfaceLen > 200 && !d2.denied,
      `${d2.path} · heading=${JSON.stringify(d2.heading)} · panjang=${d2.surfaceLen}`);

    // tombol kembali → daftar induk
    const backBtn = await page.$$eval('.nexus-main-surface button', (bs, pat) => {
      const re = new RegExp(pat, 'i');
      const i = bs.findIndex(b => re.test(b.innerText || ''));
      if (i >= 0) bs[i].setAttribute('data-qa-back', '1');
      return i >= 0;
    }, flow.back.source);
    if (backBtn) {
      await page.click('[data-qa-back="1"]'); await settle(page);
      const d3 = await page.evaluate(snap);
      check(`${flow.label}: tombol kembali → path daftar`, d3.path === flow.list, d3.path);
    } else check(`${flow.label}: tombol kembali ditemukan`, false);

    // Back/Forward browser
    await page.goBack({ waitUntil: 'domcontentloaded' }); await settle(page);
    const b1 = await page.evaluate(snap);
    check(`${flow.label}: browser Back → kembali ke detail`, flow.detail.test(b1.path), b1.path);
    await page.goForward({ waitUntil: 'domcontentloaded' }); await settle(page);
    const f1 = await page.evaluate(snap);
    check(`${flow.label}: browser Forward → daftar lagi`, f1.path === flow.list, f1.path);
    console.log('');
  }

  // BUTIR 4 checklist: deep link id tak sah
  console.log('── Deep link id tak sah');
  for (const p of suite.bogus) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' }); await settle(page);
    const b = await page.evaluate(snap);
    const white = b.surfaceLen < 40 && !b.denied && !b.notFound;
    check(`${p.replace(BASE, '')} → keadaan wajar (bukan layar putih)`, !white,
      `notFound=${b.notFound} denied=${b.denied} panjang=${b.surfaceLen}`);
  }

  if (consoleErrors.length) console.log(`\n⚠ pageerror (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);
  await browser.close();
  const bad = results.filter(x => !x.ok).length;
  console.log(`\n${bad ? '✖' : '✔'} ${results.length - bad}/${results.length} lolos`);
  process.exit(bad ? 1 : 0);
})();

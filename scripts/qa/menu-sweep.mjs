#!/usr/bin/env node
// scripts/qa/menu-sweep.mjs
// Sweep kontrak URL Batch FS Fase 2.5: buka SETIAP tujuan menu yang dikenal
// (src/routes/menu-paths.js: MENU_PATHS ∪ PLANNED ∪ LEGACY + beberapa probe tak sah)
// untuk beberapa akun uji, lalu rekam FINGERPRINT per tujuan. Dua run yang
// seharusnya identik (mis. build `main` vs build branch) dibandingkan dengan
// `--compare <dir>`; perbedaan = regresi yang harus dijelaskan.
//
// Mode:
//   --mode menu     (default, G0) buka `/?menu=<id>` — deep link / bookmark lama
//   --mode restore  set `nexus_last_menu=<id>` di localStorage lalu buka `/` —
//                   jalur "kembali ke menu terakhir" (parity keputusan #6 saat G1)
//   --mode path     (sejak G1) buka `pathFor(id)`; `?menu=<id>` lama diharapkan
//                   ter-redirect ke path itu
//
// Fingerprint SENGAJA berupa hash + penanda, bukan teks halaman: data staging
// (salinan produksi) tidak boleh ikut ter-commit di scripts/qa/baseline/.
//
// Pakai:
//   QA_PASSWORD=… node scripts/qa/menu-sweep.mjs --base http://localhost:4173 \
//     --accounts sales@msi.com,zzztest.warehouse@msi.com --label main-baseline
//   node scripts/qa/menu-sweep.mjs … --compare scripts/qa/baseline/menu-sweep
// Opsi: --env .env.local (sumber VITE_SUPABASE_URL/KEY) · --mode menu|restore|path · --diff <dirA> <dirB> ·
//       --out <dir> (default scripts/qa/out/<label>) · --ids a,b (subset) ·
//       --settle <ms> (default 1200) · --headed
// Butuh Google Chrome lokal (playwright-core channel 'chrome', tanpa unduh browser).

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { KNOWN_MENU_IDS, pathFor } from '../../src/routes/menu-paths.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ── argumen ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const has = (name) => argv.includes(`--${name}`);
const BASE = (opt('base', 'http://localhost:4173')).replace(/\/+$/, '');
const LABEL = opt('label', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const OUT = resolve(ROOT, opt('out', `scripts/qa/out/${LABEL}`));
const ENV_FILE = resolve(ROOT, opt('env', '.env.local'));
const MODE = opt('mode', 'menu');                 // 'menu' | 'restore' | 'path' — lihat header
if (!['menu', 'restore', 'path'].includes(MODE)) { console.error(`--mode tidak dikenal: ${MODE}`); process.exit(2); }
const SETTLE_MS = Number(opt('settle', '1200'));
const COMPARE = opt('compare', null);
const ACCOUNTS = (opt('accounts', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const ONLY_IDS = (opt('ids', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const PASSWORD = process.env.QA_PASSWORD;
if (!has('diff')) {
  if (!ACCOUNTS.length) { console.error('--accounts wajib (daftar email dipisah koma)'); process.exit(2); }
  if (!PASSWORD) { console.error('QA_PASSWORD (env) wajib — password bersama akun uji, JANGAN ditulis di repo'); process.exit(2); }
}

// ── Supabase URL + anon key dari file env lokal (tidak di-commit) ──────────
function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = readEnv(ENV_FILE);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!has('diff') && (!SUPABASE_URL || !ANON_KEY)) { console.error(`VITE_SUPABASE_URL/KEY tidak ditemukan di ${ENV_FILE}`); process.exit(2); }
const PROJECT_REF = SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : null;
if (PROJECT_REF === 'untmpqceexwxzuhlmyrg') { console.error('⛔ Sweep menolak jalan ke PRODUKSI (untmpqceexwxzuhlmyrg). Arahkan env ke staging.'); process.exit(2); }

// ── login GoTrue (password grant) → session utk disuntik ke localStorage ──
async function login(email) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${email} gagal: HTTP ${r.status} ${await r.text()}`);
  const s = await r.json();
  // format yang dibaca supabase-js v2 dari localStorage: objek Session utuh
  return { access_token: s.access_token, refresh_token: s.refresh_token, token_type: s.token_type,
           expires_in: s.expires_in, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in, user: s.user };
}

// ── daftar tujuan ──────────────────────────────────────────────────────────
const INVALID_PROBES = ['__tidak-ada__', '', 'customer-detail-typo'];
const targets = ONLY_IDS.length ? ONLY_IDS : [...KNOWN_MENU_IDS, ...INVALID_PROBES];
const urlFor = (id) => {
  if (MODE === 'path') { const p = pathFor(id); return p ? `${BASE}${p}` : `${BASE}/?menu=${encodeURIComponent(id)}`; }
  if (MODE === 'restore') return `${BASE}/`;
  return `${BASE}/?menu=${encodeURIComponent(id)}`;
};

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const mask = (s) => (s || '').replace(/\d[\d.,:/%-]*/g, '#').replace(/\s+/g, ' ').trim();

// ── fingerprint di dalam halaman ───────────────────────────────────────────
const FINGERPRINT_FN = () => {
  const body = document.body?.innerText || '';
  const surface = document.querySelector('.nexus-main-surface');
  const surfaceText = surface ? surface.innerText : '';
  const homeShown = !surface || getComputedStyle(surface).display === 'none';
  const struct = [];
  if (surface) {
    surface.querySelectorAll('h1,h2,h3,button,th,label,[role="tab"]').forEach((el) => {
      const t = (el.innerText || '').trim().slice(0, 40);
      struct.push(`${el.tagName.toLowerCase()}:${t}`);
      if (struct.length >= 120) return;
    });
  }
  const headings = [...document.querySelectorAll('h1,h2')].map(h => (h.innerText || '').trim()).filter(Boolean).slice(0, 6);
  const sidebarActive = document.querySelector('[aria-current="page"], .nav-active, [data-active="true"]')?.innerText?.trim() || null;
  return {
    search: location.search,
    pathname: location.pathname,
    title: document.title,
    lastMenu: (() => { try { return localStorage.getItem('nexus_last_menu'); } catch { return null; } })(),
    lastPath: (() => { try { return localStorage.getItem('nexus_last_path'); } catch { return null; } })(),
    loginShown: /Masuk untuk mengakses/i.test(body),
    accessDenied: /Akses Ditolak/i.test(body),
    comingSoon: /Coming Soon|Segera Hadir|sedang dalam pengembangan/i.test(body),
    notFound: /Halaman tidak ditemukan|Not Found/i.test(body),
    homeShown,
    headings,
    surfaceText,
    struct,
    sidebarActive,
  };
};

async function sweepAccount(browser, email) {
  const session = await login(email);
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const storageKey = `sb-${PROJECT_REF}-auth-token`;
  // Tiap tujuan = COLD LOAD murni: sesi disuntik, tapi `nexus_last_menu`/`_module`
  // (restore menu terakhir) dibersihkan supaya hasil satu tujuan tidak bergantung
  // pada tujuan sebelumnya dalam urutan sweep.
  await context.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); localStorage.removeItem('nexus_last_menu'); localStorage.removeItem('nexus_last_module'); localStorage.removeItem('nexus_last_path'); } catch {}
    // mode restore: id menu terakhir dikirim lewat cookie `qa_restore` (di-set per tujuan
    // lewat context.addCookies SEBELUM goto — init script konteks jalan lebih dulu dari
    // init script halaman, jadi window.* dari halaman belum ada di sini).
    try { const m = document.cookie.match(/(?:^|; )qa_restore=([^;]*)/); if (m && m[1]) localStorage.setItem('nexus_last_menu', decodeURIComponent(m[1])); } catch {}
  }, [storageKey, JSON.stringify(session)]);
  const page = await context.newPage();
  // Warm-up: muat app sekali sebelum loop supaya tujuan pertama tidak menanggung
  // cold start (chunk vendor, sesi, izin) — terbukti timeout saat 20 konteks paralel.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message || e).slice(0, 160)));

  const results = {};
  let n = 0;
  for (const id of targets) {
    n += 1;
    consoleErrors.length = 0;
    const url = urlFor(id);
    let fp, error = null;
    try {
      if (MODE === 'restore') {
        await context.addCookies([{ name: 'qa_restore', value: encodeURIComponent(id), url: BASE }]);
      }
      // satu kali retry kalau navigasi timeout (beban lokal saat banyak konteks paralel)
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      catch (e1) { if (!/Timeout/i.test(String(e1.message))) throw e1; await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
      // tunggu app hidup: surface, login, atau AccessDenied
      await page.waitForFunction(() => {
        const b = document.body?.innerText || '';
        return document.querySelector('.nexus-main-surface') || /Masuk untuk mengakses|Akses Ditolak|Halaman tidak ditemukan/i.test(b);
      }, null, { timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
      // Tunggu teks halaman STABIL (tak berubah selama SETTLE_MS, maks 10 s) — jalur
      // pentalan (AccessDenied → redirect → muat menu lain) butuh lebih dari satu
      // settle; tanpa ini fingerprint bisa menangkap keadaan setengah muat.
      // Halaman data berat (Storbit/Inventory) bisa diam >1,5 s di keadaan "Memuat…"
      // sebelum tabel terisi → indikator muat dianggap BELUM stabil; jendela stabil
      // = max(SETTLE_MS, 2500 ms); batas total 20 s lalu apa adanya.
      await page.waitForFunction((ms) => new Promise((done) => {
        const txt = () => (document.body?.innerText || '') + '|' + (localStorage.getItem('nexus_last_menu') || '');
        const loading = () => /\b(Memuat|Loading)\b/i.test(document.querySelector('.nexus-main-surface')?.innerText || '');
        const start = txt(); setTimeout(() => done(!loading() && txt() === start), ms);
      }), Math.max(SETTLE_MS, 2500), { timeout: 20000, polling: 300 }).catch(() => {});
      fp = await page.evaluate(FINGERPRINT_FN);
    } catch (e) {
      error = String(e.message || e).slice(0, 200);
      fp = { search: null, pathname: null, headings: [], surfaceText: '', struct: [] };
    }
    // Tujuan yang TERPENTAL (menu akhir ≠ tujuan): identitasnya = `lastMenu`; konten
    // halaman pentalan (Command Center dsb.) dinamis dan bukan milik tujuan ini →
    // hash/heading tidak direkam supaya baseline tidak berisik.
    const bounced = fp.lastMenu != null && fp.lastMenu !== id && !INVALID_PROBES.includes(id);
    results[id] = {
      url,
      bounced,
      finalSearch: fp.search,
      finalPath: fp.pathname,
      lastMenu: fp.lastMenu,
      lastPath: fp.lastPath,
      loginShown: !!fp.loginShown,
      accessDenied: !!fp.accessDenied,
      comingSoon: !!fp.comingSoon,
      notFound: !!fp.notFound,
      homeShown: !!fp.homeShown,
      headings: bounced ? null : (fp.headings || []).map(mask),
      sidebarActive: fp.sidebarActive ? mask(fp.sidebarActive) : null,
      surfaceHash: bounced ? null : sha(mask(fp.surfaceText)),
      structHash: bounced ? null : sha((fp.struct || []).map(mask).join('|')),
      consoleErrors: consoleErrors.length,
      consoleSample: consoleErrors.slice(0, 3),
      error,
    };
    if (n % 20 === 0) console.log(`  [${email}] ${n}/${targets.length}`);
  }
  await context.close();
  return results;
}

// ── compare ────────────────────────────────────────────────────────────────
// consoleErrors dikeluarkan dari pembanding: 404 RPC/aset di staging terbukti intermiten
// (muncul di satu run, hilang di run berikutnya); tetap DIREKAM untuk dibaca manual.
const IGNORE_FIELDS = new Set(['url', 'consoleSample', 'consoleErrors']);
function compare(baseDir, curByAccount) {
  let diffs = 0;
  for (const [email, cur] of Object.entries(curByAccount)) {
    const f = join(baseDir, `${email}.json`);
    if (!existsSync(f)) { console.log(`  ⚠ baseline ${email} tidak ada (${f})`); continue; }
    const base = JSON.parse(readFileSync(f, 'utf8')).results;
    for (const id of new Set([...Object.keys(base), ...Object.keys(cur)])) {
      const a = base[id], b = cur[id];
      if (!a || !b) { diffs += 1; console.log(`  ✖ [${email}] ${id}: ${!a ? 'baru di run ini' : 'hilang di run ini'}`); continue; }
      const changed = Object.keys({ ...a, ...b }).filter(k => !IGNORE_FIELDS.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      if (changed.length) { diffs += 1; console.log(`  ✖ [${email}] ${id}: ${changed.map(k => `${k} ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`).join(' · ')}`); }
    }
  }
  return diffs;
}

// ── --diff <dirA> <dirB>: banding dua folder hasil tanpa sweep ulang ───────
if (has('diff')) {
  const i = argv.indexOf('--diff');
  const [a, b] = [resolve(ROOT, argv[i + 1] || ''), resolve(ROOT, argv[i + 2] || '')];
  const cur = {};
  for (const f of (existsSync(b) ? readdirSync(b) : []).filter(x => x.endsWith('.json'))) cur[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(b, f), 'utf8')).results;
  console.log(`diff ${a}  vs  ${b}`);
  const d = compare(a, cur);
  console.log(d ? `✖ ${d} perbedaan` : '✔ identik');
  process.exit(d ? 1 : 0);
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log(`menu-sweep — base ${BASE} · project ${PROJECT_REF} · mode ${MODE} · ${targets.length} tujuan × ${ACCOUNTS.length} akun · out ${OUT}`);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed') });
  const startedAt = new Date().toISOString();
  const all = {};
  await Promise.all(ACCOUNTS.map(async (email) => {
    try {
      all[email] = await sweepAccount(browser, email);
      writeFileSync(join(OUT, `${email}.json`), JSON.stringify({ meta: { base: BASE, project: PROJECT_REF, mode: MODE, label: LABEL, account: email, startedAt, targets: targets.length }, results: all[email] }, null, 2));
      const r = Object.values(all[email]);
      console.log(`  ✔ ${email}: ${r.length} tujuan · login-shown ${r.filter(x => x.loginShown).length} · denied ${r.filter(x => x.accessDenied).length} · coming-soon ${r.filter(x => x.comingSoon).length} · console-error ${r.filter(x => x.consoleErrors > 0).length} · gagal-muat ${r.filter(x => x.error).length}`);
    } catch (e) {
      console.error(`  ✖ ${email}: ${e.message}`);
      process.exitCode = 1;
    }
  }));
  await browser.close();
  if (COMPARE) {
    console.log(`\nbanding dengan ${COMPARE}:`);
    const d = compare(resolve(ROOT, COMPARE), all);
    console.log(d ? `✖ ${d} perbedaan` : '✔ identik dengan baseline');
    if (d) process.exitCode = 1;
  }
})();

#!/usr/bin/env node
// scripts/qa/butir5.mjs
// Checklist `scripts/qa/README.md` **butir 5 (role terbatas)** — menguji bahwa
// aksi yang digerbangi ROLE benar-benar hilang untuk user yang boleh membuka
// halamannya tapi tidak berhak melakukan aksinya. Lahir di Batch FS Fase 2.5 G2
// untuk tombol "Input SP"; dipakai ulang tiap giliran yang mengubah gate.
//
// Skenario G2: `canInputSP = canRenderPage('input') && role ∈ SP_ITEM_WRITER_ROLES`
// (`src/lib/roles.js`). Akun `zzztest.restricted` = role `viewer` yang diberi
// grant menu SEMENTARA `logistics_sp` + `logistics_input` — KEDUANYA, supaya
// satu-satunya sebab tombol bisa hilang adalah ROLE-nya, bukan izin menu yang
// kurang. Grant itu WAJIB dicabut lagi sesudahnya (resep lengkap + verifikasi DB
// ada di README §"Butir 5").
//
// Asersi — C dan D yang membuatnya jujur:
//   A. daftar SP TERBUKA (heading "Sales Order / SP")   → grant menu bekerja
//   B. tombol "Input SP" TIDAK ADA                      → inti butir 5
//   C. /sales-order/new diketik langsung → Akses Ditolak → gate RUTE, lapis kedua
//   D. pembanding akun penulis SP → tombol ADA          → B bukan tombol rusak
//
// ⚠️ Pelajaran yang jangan hilang (dua kali nyaris memberi hasil palsu):
//   1. Asersi A dulu hanya `!denied && len > 200` → PENTALAN ke Command Center
//      lolos sebagai "halaman terbuka", dan B lalu "lolos" karena tombolnya
//      memang tak ada di dashboard. Sekarang A menuntut heading halaman, dan
//      B/C/D TIDAK dijalankan bila A gagal.
//   2. Regexnya dulu `/sales order|SP/i` — flag `i` membuat cabang `SP` cocok
//      dengan "sp" apa pun. Sekarang `/Sales Order/`, tanpa flag.
//   Kelas yang sama dengan "identik palsu" di menu-sweep.mjs: asersi yang lolos
//   karena prasyaratnya tak pernah terpenuhi.
//
// Pakai (dari root repo, env menunjuk STAGING):
//   QA_PASSWORD=… node scripts/qa/butir5.mjs --base http://localhost:4173 [--wait 5] [--headed]
//   --wait <menit>: tunggu grant terpasang (polling 30 s); 0 = coba sekali lalu menyerah.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:4173').replace(/\/+$/, '');
const WAIT_MIN = Number(process.argv.includes('--wait') ? process.argv[process.argv.indexOf('--wait') + 1] : 20);
const PASSWORD = process.env.QA_PASSWORD;
if (!PASSWORD) { console.error('QA_PASSWORD wajib'); process.exit(2); }
const env = {};
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m) env[m[1]] = m[2]; }
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_KEY;
const REF = new URL(URL_).hostname.split('.')[0];
if (REF === 'untmpqceexwxzuhlmyrg') { console.error('⛔ menolak jalan ke PRODUKSI'); process.exit(2); }

const LIST = '/logistics-warehouse/warehouse/sales-order';
const NEW = '/logistics-warehouse/warehouse/sales-order/new';
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? '✔' : '✖'} ${n}${d ? ' — ' + d : ''}`); };

async function login(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login ${email}: HTTP ${r.status}`);
  const s = await r.json();
  return { access_token: s.access_token, refresh_token: s.refresh_token, token_type: s.token_type, expires_in: s.expires_in, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in, user: s.user };
}
const probe = () => {
  const surface = document.querySelector('.nexus-main-surface');
  const txt = surface ? surface.innerText : '';
  const btn = [...(surface?.querySelectorAll('button') || [])].find(b => /input sp/i.test(b.innerText || ''));
  return { denied: /Akses Ditolak/.test(document.body.innerText), inputBtn: !!btn, heading: [...document.querySelectorAll('main h1,main h2')].map(h => h.innerText.trim())[0] || null, len: txt.replace(/\s+/g, ' ').trim().length, loading: /\b(Memuat|Loading)\b/.test(txt) };
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
  const open = async (email, path) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* privat */ } }, [`sb-${REF}-auth-token`, JSON.stringify(await login(email))]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    for (let i = 0; i < 12 && (await page.evaluate(probe)).loading; i++) await page.waitForTimeout(500);
    const out = await page.evaluate(probe);
    await ctx.close();
    return out;
  };

  // tunggu grant terpasang (daftar SP terbuka untuk restricted)
  console.log(`butir 5 — menunggu grant untuk zzztest.restricted (maks ${WAIT_MIN} menit)…`);
  let r = null;
  const deadline = Date.now() + WAIT_MIN * 60000;
  for (let i = 0; ; i++) {
    // Selalu coba MINIMAL sekali, bahkan saat --wait 0 (grant sudah dipasang).
    r = await open('zzztest.restricted@msi.com', LIST);
    if (!r.denied && r.len > 200) break;
    if (Date.now() >= deadline) break;
    if (i === 0) console.log(`  (belum: denied=${r.denied} panjang=${r.len} — grant belum terbaca, cek tiap 30 s)`);
    await new Promise(res => setTimeout(res, 30000));
  }
  console.log('');
  // Asersi A diperketat 23 Sep 2026: versi lama (`!denied && len > 200`) meloloskan
  // PENTALAN ke Command Center sebagai "terbuka" — dan B lalu lolos karena alasan
  // yang salah (tombol memang tak ada di dashboard). Heading wajib halaman SP.
  // Regex sengaja TANPA flag `i` pada cabang kedua: `/sales order|SP/i` membuat
  // "SP" cocok dengan "sp" apa pun (mis. heading yang memuat kata "response").
  // Kemarin lolos hanya karena "Operations Overview" kebetulan tak memuat "sp".
  const listOpen = !r.denied && /Sales Order/.test(r.heading || '') && r.len > 200;
  check('A. daftar SP TERBUKA untuk zzztest.restricted (grant menu bekerja)', listOpen, `heading=${JSON.stringify(r.heading)} panjang=${r.len}`);
  if (!listOpen) {
    console.log('\n  ⛔ B/C/D TIDAK dijalankan: tanpa halaman daftar SP terbuka, hasilnya tak bermakna.');
    console.log('     Cek grant tersimpan (bukan cuma tercentang di layar):');
    console.log("     select … from user_menu_permissions where user = 'zzztest.restricted@msi.com'");
    await browser.close();
    process.exit(1);
  }
  check('B. tombol "Input SP" TIDAK ADA (butir 5)', r.inputBtn === false, `inputBtn=${r.inputBtn}`);
  const n = await open('zzztest.restricted@msi.com', NEW);
  check('C. /sales-order/new → Akses Ditolak (gate rute menjaga)', n.denied === true, `denied=${n.denied} heading=${JSON.stringify(n.heading)}`);
  const w = await open('zzztest.warehouse@msi.com', LIST);
  check('D. pembanding warehouse (penulis SP): tombol "Input SP" ADA', w.inputBtn === true, `inputBtn=${w.inputBtn}`);
  await browser.close();
  const bad = results.filter(x => !x).length;
  console.log(`\n${bad ? '✖' : '✔'} ${results.length - bad}/${results.length} lolos`);
  process.exit(bad ? 1 : 0);
})();

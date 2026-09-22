#!/usr/bin/env node
// scripts/qa/check-menu-paths.mjs
// Gate kontrak URL (Batch FS Fase 2.5): setiap id menu yang bisa dicapai di
// src/App.jsx WAJIB punya path di src/routes/menu-paths.js, dan tabel itu
// tidak boleh punya path ganda / id basi. Dipanggil CI (.github/workflows/ci.yml)
// dan boleh dijalankan lokal: `node scripts/qa/check-menu-paths.mjs`.
//
// Sumber kebenaran id = kode (App.jsx), bukan tabel — kalau App.jsx berubah
// (menu baru/dihapus) skrip ini yang berteriak, bukan tabelnya diam-diam basi.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  MENU_PATHS, PLANNED_MENU_IDS, PLANNED_PREFIX, LEGACY_MENU_PATHS,
  SYNTHETIC_DETAIL_IDS, pathFor, PATH_TO_MENU,
} from '../../src/routes/menu-paths.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const app = readFileSync(resolve(ROOT, 'src/App.jsx'), 'utf8');

function sliceBetween(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s + 1);
  if (s < 0 || e < 0) throw new Error(`Penanda tidak ditemukan: ${startMarker} … ${endMarker}`);
  return src.slice(s, e);
}

// 1) Pohon menu yang menentukan canRenderPage(): CRM_MENU_ITEMS + ERP_MENU_GROUPS
//    (CRM_MENU_ITEMS di-spread ke ERP_MENU_GROUPS; ACCOUNT_TABS/ACTIVITY_TABS ikut
//    tersapu tapi id-nya sudah ada di CRM_MENU_ITEMS).
const treeSrc = sliceBetween(app, 'const CRM_MENU_ITEMS = [', 'const NEXUS_NAV = [');
// [A-Za-z0-9-]: pohon memuat id camelCase (jobCosting, cashBank, procRequest-*, …) — regex
// kebab-only di G0 melewatkan 32 id itu (ketahuan G1: klik Job Costing tidak berpindah).
const treeIds = [...new Set([...treeSrc.matchAll(/\bid:\s*'([A-Za-z0-9-]+)'/g)].map(m => m[1]))].sort();

// 2) Id sintetis + id yang punya blok render tapi di luar pohon
const synthLine = app.match(/const SYNTHETIC_MENU_IDS = \[([^\]]*)\]/);
const synthIds = synthLine ? [...synthLine[1].matchAll(/'([A-Za-z0-9-]+)'/g)].map(m => m[1]) : [];
const renderIds = [...new Set([...app.matchAll(/activeMenu === '([A-Za-z0-9-]+)'/g)].map(m => m[1]))];

const reachable = [...new Set([...treeIds, ...synthIds, ...renderIds])].sort();

const problems = [];
const info = [];

// A. Setiap id yang bisa dicapai harus punya path
const missing = reachable.filter(id => !pathFor(id));
if (missing.length) problems.push(`Id tanpa path (${missing.length}): ${missing.join(', ')}`);

// B. Path ganda di rute kanonik (MENU_PATHS non-sintetis ∪ planned)
const canon = new Map();
for (const [id, p] of Object.entries(MENU_PATHS)) {
  if (SYNTHETIC_DETAIL_IDS.includes(id)) continue;
  if (canon.has(p)) problems.push(`Path ganda "${p}": ${canon.get(p)} & ${id}`);
  canon.set(p, id);
}
for (const id of PLANNED_MENU_IDS) {
  const p = `${PLANNED_PREFIX}/${id}`;
  if (canon.has(p)) problems.push(`Path ganda "${p}": ${canon.get(p)} & ${id}`);
  canon.set(p, id);
}

// C. Satu id hanya boleh hidup di satu tabel
const inMenu = new Set(Object.keys(MENU_PATHS));
const inPlanned = new Set(PLANNED_MENU_IDS);
for (const id of PLANNED_MENU_IDS) if (inMenu.has(id)) problems.push(`Id di MENU_PATHS sekaligus PLANNED: ${id}`);
for (const id of Object.keys(LEGACY_MENU_PATHS)) {
  if (inMenu.has(id)) problems.push(`Id di MENU_PATHS sekaligus LEGACY: ${id}`);
  if (inPlanned.has(id)) problems.push(`Id di PLANNED sekaligus LEGACY: ${id}`);
}

// D. Bentuk path: kebab-case, mulai '/', tanpa trailing slash, tanpa segmen kosong
const shape = /^\/[a-z0-9]+(?:[-/][a-z0-9]+)*$/;
for (const [id, p] of [...Object.entries(MENU_PATHS), ...Object.entries(LEGACY_MENU_PATHS)]) {
  if (!shape.test(p)) problems.push(`Bentuk path tidak sah untuk ${id}: "${p}"`);
}

// E. Id basi: PLANNED harus benar-benar ada di pohon; MENU_PATHS non-sintetis harus
//    ada di pohon atau di daftar id render/sintetis App.jsx
const reachableSet = new Set(reachable);
const stalePlanned = PLANNED_MENU_IDS.filter(id => !reachableSet.has(id));
if (stalePlanned.length) problems.push(`PLANNED tidak ada di App.jsx (basi): ${stalePlanned.join(', ')}`);
const staleMenu = Object.keys(MENU_PATHS).filter(id => !reachableSet.has(id) && !SYNTHETIC_DETAIL_IDS.includes(id));
if (staleMenu.length) problems.push(`MENU_PATHS tidak ada di App.jsx (basi): ${staleMenu.join(', ')}`);

// F. Peta balik konsisten
for (const [p, id] of Object.entries(PATH_TO_MENU)) {
  if (pathFor(id) !== p) problems.push(`PATH_TO_MENU tidak konsisten: ${p} → ${id} → ${pathFor(id)}`);
}

info.push(`id pohon App.jsx (CRM_MENU_ITEMS + ERP_MENU_GROUPS): ${treeIds.length}`);
info.push(`id sintetis (SYNTHETIC_MENU_IDS): ${synthIds.length} · id blok render: ${renderIds.length}`);
info.push(`total id yang bisa dicapai: ${reachable.length}`);
info.push(`MENU_PATHS: ${inMenu.size} (sintetis detail ${SYNTHETIC_DETAIL_IDS.length}) · PLANNED: ${PLANNED_MENU_IDS.length} · LEGACY: ${Object.keys(LEGACY_MENU_PATHS).length}`);
info.push(`rute kanonik unik: ${canon.size}`);

console.log('check-menu-paths — kontrak URL Batch FS Fase 2.5');
for (const line of info) console.log('  ' + line);
if (problems.length) {
  console.error(`\n✖ ${problems.length} masalah:`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\n✔ semua id punya path, nol path ganda, nol id basi');

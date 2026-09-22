#!/usr/bin/env node
// scripts/qa/lint-baseline.mjs
// Gate lint "net-zero" (CLAUDE.md §Aturan Wajib): `npm run lint` hari ini
// memang punya ratusan temuan warisan, jadi CI tidak bisa memakai exit code
// eslint mentah. Skrip ini menjalankan eslint (format JSON), lalu:
//   - GAGAL kalau total error ATAU total warning NAIK di atas baseline,
//   - GAGAL kalau ada FILE yang jumlah error/warning-nya naik (regresi per file
//     tak boleh disembunyikan penurunan di file lain),
//   - LOLOS kalau sama atau turun (angka turun dilaporkan supaya baseline
//     bisa diperbarui SADAR, bukan diam-diam).
//
// Perbarui baseline hanya dengan keputusan eksplisit:
//   node scripts/qa/lint-baseline.mjs --update
// Baseline hidup di scripts/qa/lint-baseline.json (angka total + per file).

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = resolve(ROOT, 'scripts/qa/lint-baseline.json');
const update = process.argv.includes('--update');

const eslintBin = resolve(ROOT, 'node_modules/.bin/eslint');
const run = spawnSync(eslintBin, ['.', '-f', 'json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (run.error) { console.error('eslint gagal dijalankan:', run.error.message); process.exit(2); }
if (!run.stdout) { console.error('eslint tidak mengeluarkan JSON. stderr:', run.stderr); process.exit(2); }

let report;
try { report = JSON.parse(run.stdout); } catch (e) { console.error('JSON eslint tidak bisa dibaca:', e.message, run.stderr); process.exit(2); }

const current = { errors: 0, warnings: 0, files: {} };
for (const f of report) {
  if (!f.errorCount && !f.warningCount) continue;
  const rel = relative(ROOT, f.filePath).split('\\').join('/');
  current.files[rel] = { errors: f.errorCount, warnings: f.warningCount };
  current.errors += f.errorCount;
  current.warnings += f.warningCount;
}
current.files = Object.fromEntries(Object.entries(current.files).sort(([a], [b]) => a.localeCompare(b)));

if (update || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify({ generatedAt: new Date().toISOString(), ...current }, null, 2) + '\n');
  console.log(`baseline ${existsSync(BASELINE) && !update ? 'dibuat' : 'diperbarui'}: ${current.errors} error / ${current.warnings} warning di ${Object.keys(current.files).length} file → ${relative(ROOT, BASELINE)}`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const problems = [];
if (current.errors > base.errors) problems.push(`total error naik: ${base.errors} → ${current.errors}`);
if (current.warnings > base.warnings) problems.push(`total warning naik: ${base.warnings} → ${current.warnings}`);
for (const [file, cur] of Object.entries(current.files)) {
  const b = base.files[file] ?? { errors: 0, warnings: 0 };
  if (cur.errors > b.errors || cur.warnings > b.warnings) {
    problems.push(`${file}: ${b.errors}/${b.warnings} → ${cur.errors}/${cur.warnings} (error/warning)`);
  }
}

console.log(`lint-baseline — sekarang ${current.errors} error / ${current.warnings} warning · baseline ${base.errors} / ${base.warnings}`);
if (problems.length) {
  console.error(`\n✖ regresi lint (${problems.length}):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
if (current.errors < base.errors || current.warnings < base.warnings) {
  console.log('ℹ angka TURUN dari baseline — kalau memang disengaja, perbarui dengan `--update` di commit yang sama.');
}
console.log('✔ tidak ada regresi lint');

#!/usr/bin/env node
// scripts/qa/sweep-classify.mjs
// Pemilah hasil `menu-sweep.mjs`: memisahkan perbedaan yang DISENGAJA dari yang
// berarti REGRESI. Dibuat untuk kerangka menu Grand Design Bagian 1, saat 54
// halaman hidup berpindah alamat sekaligus dan pembandingan mentah terhadap
// baseline menghasilkan ratusan baris ✖ yang sebagian besar memang diharapkan.
//
// Pakai:
//   node scripts/qa/sweep-classify.mjs <dir-baseline> <dir-hasil> <label> [mode]
//
// `mode` (menu|restore|path) hanya dipakai untuk menilai satu perubahan yang
// memang khusus mode `menu` (lihat DIJELASKAN di bawah).
//
// ── DASAR EMPIRIS ──────────────────────────────────────────────────────────
// Kepala konteks (breadcrumb) dirender DI LUAR `.nexus-main-surface`, dan
// SENGAJA bukan <h1>/<h2>. Keduanya sudah diukur, bukan diasumsikan:
//   - di luar surface  → surfaceHash/structHash tidak tersentuh olehnya
//   - bukan heading    → `headings` tiap halaman tetap identik dengan baseline
// Karena itu aturannya bisa tetap keras: hash ATAU headings berubah = regresi,
// tanpa kategori pengecualian. (Versi sebelumnya, saat masih ada tab bar
// ber-<h1>, perlu aturan "sisipan judul Level 2" — aturan itu DICABUT.)
//
// ── ATURAN, dinilai berurutan, berhenti di kecocokan pertama ───────────────
//   1. entri ber-`error`                      → gagal-muat (run tidak layak banding)
//   2. cocok daftar DIJELASKAN                → disengaja, DICETAK beserta alasannya
//   3. accessDenied/bounced/homeShown/
//      loginShown/notFound berubah            → REGRESI (tanpa pengecualian)
//   4. surfaceHash / structHash berubah       → REGRESI
//   5. headings berubah                       → REGRESI
//   6. id tidak ada di baseline               → tujuan BARU (disengaja)
//   7. finalPath/lastPath/finalSearch berubah → bentuk alamat (disengaja)
//   8. sisanya                                → identik
//   + id baseline yang HILANG dari run baru   → REGRESI
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const [, , baseDir, newDir, label = '(tanpa label)', mode = ''] = process.argv;
if (!baseDir || !newDir) {
  console.error('pakai: node scripts/qa/sweep-classify.mjs <dir-baseline> <dir-hasil> <label> [mode]');
  process.exit(2);
}

// ── Perubahan yang SUDAH dijelaskan, dengan alasannya ───────────────────────
// Sengaja dicetak terpisah, BUKAN disembunyikan: yang berbahaya bukan
// perbedaannya, melainkan perbedaan yang lewat tanpa ada yang bisa
// menjelaskannya. Kalau salah satu baris di sini berhenti muncul, itu juga
// kabar — berarti sebabnya hilang dan daftarnya yang basi.
const DIJELASKAN = [
  {
    ids: ['crm-prospects', 'crm-lead-pool', 'crm-calls', 'crm-activity-log', 'riwayat-visit'],
    jenis: 'hash',
    alasan: 'tab bar CRM lama (CrmTabBar) dicabut dari wrapper rute — ia mengulang '
          + 'navigasi sidebar tiga tingkat dengan label lama yang sudah tidak berlaku',
  },
  {
    ids: ['inventory-dashboard'],
    jenis: 'hash',
    alasan: 'drift DATA staging, bukan kode — dibuktikan uji A/B 24 Sep 2026: build '
          + 'LAMA yang dijalankan hari itu menghasilkan hash yang sama persis dengan '
          + 'build baru, sementara baseline berasal dari 22 Sep (structHash identik '
          + 'di ketiga titik)',
  },
  {
    // Ditambahkan 25 Sep 2026 setelah sweep malam 24-25 Sep. Keempat tujuan ini
    // berubah dari "terbuka" jadi "dipental" HANYA untuk akun sales, dan itu
    // PERUBAHAN DATA YANG DISENGAJA, bukan regresi kode.
    //
    // /!\ CATATAN KEJUJURAN: begitu baseline ketiga mode diperbarui dari run
    // 24-25 Sep (commit terpisah, hari yang sama), entri ini menjadi INERT —
    // baseline baru sudah merekam keadaan "dipental", jadi tidak ada lagi
    // perbedaan untuk dijelaskan dan baris ini tidak akan pernah tercetak.
    // Ia SENGAJA dipertahankan sebagai REKAMAN alasan baseline bergeser.
    // Jangan membacanya sebagai penjelasan yang masih aktif, dan jangan
    // menyimpulkan "sebabnya hilang" (aturan di kepala berkas) dari diamnya.
    ids: ['crm-rate-list', 'prf', 'proc-inquiry-fwd-msi', 'reporting-mom'],
    jenis: 'akses',
    hanyaAkun: ['sales'],
    alasan: 'PERUBAHAN DATA yang disengaja (keputusan Den 24 Sep 2026): izin role '
          + 'bd_sales_executive untuk proc_prf, proc_inquiry_fwd_msi, report_mom, dan '
          + 'crm_rate_list DICABUT lewat Role Defaults di staging. Akibatnya akun sales '
          + 'dipental ke Beranda/Command Center di keempat tujuan itu. Migrasi '
          + '20260912000005 dulu menyeed 14 key untuk role ini; kini tersisa 10 '
          + '(semuanya crm_*). Tiga role BD saudaranya tidak disentuh. Bukan bug kode',
  },
  {
    ids: ['assets', 'assets-it', 'assets-kendaraan', 'assets-furniture', 'assets-properti',
          'assets-analytics', 'assets-docs', 'assets-kategori', 'assets-lokasi',
          'assets-vendor', 'assets-settings', 'assets-maint', 'assets-hist',
          'assets-workorders', 'assets-expiring', 'assets-expired'],
    jenis: 'akses',
    hanyaMode: 'menu',
    alasan: 'PERUBAHAN yang diterima (Q-H): 15 halaman aset kini punya gate eksplisit '
          + 'service_asset, sehingga deep-link ?menu= untuk pemegang izin itu tidak lagi '
          + 'ditolak — konsisten dengan klik sidebar yang memang sudah berhasil sejak dulu. '
          + 'Nol halaman baru jadi terjangkau',
  },
];

// `hanyaAkun` (opsional, 25 Sep 2026): batasi entri ke akun tertentu. Tanpa
// field ini entri berlaku untuk SEMUA akun — perilaku lama, tidak berubah.
// Ditambahkan supaya penjelasan yang memang khusus satu akun tidak diam-diam
// menelan kasus akun lain yang kebetulan ber-id sama.
const cocokDijelaskan = (id, jenis, who) => DIJELASKAN.find(
  (d) => d.jenis === jenis
      && d.ids.includes(id)
      && (!d.hanyaMode || d.hanyaMode === mode)
      && (!d.hanyaAkun || d.hanyaAkun.includes(who)),
);

const o = {
  akun: 0, akunBanding: 0, gagalMuat: 0,
  baru: 0, alamat: 0, identik: 0,
  dijelaskan: [], regAkses: [], regHash: [], regHead: [], hilang: [],
};

for (const f of readdirSync(newDir).filter((x) => x.endsWith('.json'))) {
  o.akun++;
  const nw = JSON.parse(readFileSync(`${newDir}/${f}`, 'utf8'));
  if (!existsSync(`${baseDir}/${f}`)) continue;
  o.akunBanding++;
  const bs = JSON.parse(readFileSync(`${baseDir}/${f}`, 'utf8'));
  const who = f.replace('@msi.com.json', '');

  for (const [id, r] of Object.entries(nw.results)) {
    if (r.error) { o.gagalMuat++; continue; }
    const b = bs.results[id];
    if (!b) { o.baru++; continue; }

    const akses = ['accessDenied', 'bounced', 'homeShown', 'loginShown', 'notFound']
      .filter((k) => !!b[k] !== !!r[k]);
    if (akses.length) {
      const d = cocokDijelaskan(id, 'akses', who);
      if (d) o.dijelaskan.push({ who, id, jenis: 'akses', alasan: d.alasan });
      else o.regAkses.push({ who, id, akses, b, r });
      continue;
    }

    if (b.surfaceHash !== r.surfaceHash || b.structHash !== r.structHash) {
      const d = cocokDijelaskan(id, 'hash', who);
      if (d) o.dijelaskan.push({ who, id, jenis: 'hash', alasan: d.alasan });
      else o.regHash.push({ who, id, b, r });
      continue;
    }

    if (JSON.stringify(b.headings) !== JSON.stringify(r.headings)) {
      o.regHead.push({ who, id, bh: b.headings, rh: r.headings });
      continue;
    }

    if (b.finalPath !== r.finalPath || b.lastPath !== r.lastPath || b.finalSearch !== r.finalSearch) o.alamat++;
    else o.identik++;
  }
  for (const id of Object.keys(bs.results)) if (!(id in nw.results)) o.hilang.push({ who, id });
}

const regresi = o.regAkses.length + o.regHash.length + o.regHead.length + o.hilang.length;

console.log(`\n========== ${label}${mode ? ` · mode ${mode}` : ''} ==========`);
console.log(`akun dibandingkan                         : ${o.akunBanding}/${o.akun}`);
console.log(`gagal-muat (SYARAT SAH: harus 0)          : ${o.gagalMuat}`);
console.log('--- DISENGAJA ---');
console.log(`tujuan BARU (belum ada di baseline)       : ${o.baru}`);
console.log(`hanya bentuk alamat berubah               : ${o.alamat}`);
console.log(`identik penuh dengan baseline             : ${o.identik}`);
console.log(`sudah dijelaskan (rincian di bawah)       : ${o.dijelaskan.length}`);
console.log('--- REGRESI ---');
console.log(`status akses berubah                      : ${o.regAkses.length}`);
console.log(`surfaceHash/structHash berubah            : ${o.regHash.length}`);
console.log(`headings berubah                          : ${o.regHead.length}`);
console.log(`tujuan baseline HILANG                    : ${o.hilang.length}`);

if (o.dijelaskan.length) {
  console.log('\n— Perubahan yang sudah dijelaskan —');
  const per = new Map();
  for (const x of o.dijelaskan) {
    const k = `${x.jenis}|${x.alasan}`;
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(`${x.who}/${x.id}`);
  }
  for (const [k, v] of per) {
    const [jenis, alasan] = k.split('|');
    console.log(`  [${jenis}] ${v.length} entri: ${v.slice(0, 6).join(', ')}${v.length > 6 ? ', …' : ''}`);
    console.log(`          ${alasan}`);
  }
}

for (const x of o.regAkses.slice(0, 40)) {
  console.log(`\n  ✖ [akses] ${x.who} · ${x.id} · ${x.akses.join(',')}`);
  console.log(`      lama denied=${x.b.accessDenied} bounced=${x.b.bounced} home=${x.b.homeShown} path=${x.b.finalPath}`);
  console.log(`      baru denied=${x.r.accessDenied} bounced=${x.r.bounced} home=${x.r.homeShown} path=${x.r.finalPath}`);
}
for (const x of o.regHash.slice(0, 40)) {
  console.log(`\n  ✖ [hash] ${x.who} · ${x.id}`);
  console.log(`      surface ${x.b.surfaceHash} → ${x.r.surfaceHash}`);
  console.log(`      struct  ${x.b.structHash} → ${x.r.structHash}`);
}
for (const x of o.regHead.slice(0, 40)) {
  console.log(`\n  ✖ [headings] ${x.who} · ${x.id}`);
  console.log(`      lama ${JSON.stringify(x.bh)}`);
  console.log(`      baru ${JSON.stringify(x.rh)}`);
}
for (const x of o.hilang.slice(0, 40)) console.log(`\n  ✖ [hilang] ${x.who} · ${x.id}`);

console.log(`\n${regresi === 0 && o.gagalMuat === 0 ? '✔ NOL regresi' : `✖ ${regresi} kandidat regresi` + (o.gagalMuat ? ` + ${o.gagalMuat} gagal-muat` : '')}`);
process.exit(regresi === 0 && o.gagalMuat === 0 ? 0 : 1);

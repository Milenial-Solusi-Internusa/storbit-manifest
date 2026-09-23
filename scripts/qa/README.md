# scripts/qa — gate & checklist Batch FS Fase 2.5

Skrip QA yang **di-commit** (keputusan Den 21 Sep 2026, #12). Tiga gate deterministik dipanggil CI (`.github/workflows/ci.yml`); sweep runtime dijalankan lokal per giliran karena butuh akun uji + DB staging.

| Skrip | Fungsi | Dipanggil |
|---|---|---|
| `check-menu-paths.mjs` | Kontrak URL: setiap id menu di `src/App.jsx` (pohon `CRM_MENU_ITEMS`+`ERP_MENU_GROUPS`, `SYNTHETIC_MENU_IDS`, id blok render) punya path di `src/routes/menu-paths.js`; nol path ganda; nol id basi | CI + lokal |
| `lint-baseline.mjs` | Lint "net-zero": gagal kalau total error/warning ATAU angka per file **naik** dari `lint-baseline.json`. `--update` memperbarui baseline (hanya dengan keputusan sadar, di commit yang sama dengan penurunannya) | CI + lokal |
| `menu-sweep.mjs` | Buka semua tujuan menu (`KNOWN_MENU_IDS` + probe tak sah) untuk beberapa akun uji, rekam fingerprint (hash, bukan teks), `--compare` dengan baseline | lokal, per giliran |
| `detail-routes.mjs` | **[BARU, G2]** Uji rute **detail ber-`:id`** — bagian yang tidak bisa dibuktikan sweep (sweep hanya membuka tujuan MENU, cold load): **checklist butir 2** (refresh di detail → konteks bertahan) & **butir 4** (deep-link id tak sah → keadaan wajar, bukan layar putih), plus klik baris mengubah alamat, tombol kembali → path daftar induk, Back/Forward. Ber-`--suite <modul>`; hari ini **dua** suite: `logistics-warehouse` (Detail SP · Picking · Surat Jalan = 3 flow × 5 butir + 3 deep-link palsu = **18** cek) dan **`crm` [BARU, G3]** (Detail Deal · Detail Quotation · Detail Customer · Detail SO = 4 flow × 5 butir + 5 deep-link palsu = **25** cek). Suite baru ditambahkan per giliran G4–G6 | lokal, per giliran |
| `butir5.mjs` | Checklist butir 5 (role terbatas): aksi ber-gate ROLE hilang untuk user yang boleh membuka halamannya tapi tak berhak — G2: tombol "Input SP". Butuh grant menu sementara + **wajib dicabut** (resep di bawah) | lokal, tiap giliran yang mengubah gate |

## Sweep — cara pakai

```bash
# 1. jalankan build yang mau diukur, layani statis (SPA fallback bawaan vite preview)
npm run build && npx vite preview --port 4173

# 2. sweep (env .env.local harus menunjuk STAGING; skrip menolak ref produksi)
QA_PASSWORD='<password bersama akun uji>' node scripts/qa/menu-sweep.mjs \
  --base http://localhost:4173 \
  --accounts sales@msi.com,zzztest.warehouse@msi.com,zzztest.hrga@msi.com,zzztest.procurement@msi.com,zzztest.restricted@msi.com \
  --label g0-branch --compare scripts/qa/baseline/menu-sweep
```

- `--mode menu` (default, G0): buka `?menu=<id>`. `--mode path` (sejak G1): buka `pathFor(id)`, dan `?menu=<id>` lama diharapkan ter-redirect.
- **Baseline resmi sejak 22 Sep 2026 = hasil build G1** (keputusan Den; sebelumnya build `main` `7e3660c`): `baseline/menu-sweep` (mode `menu`), `baseline/menu-sweep-restore` (mode `restore`), dan **`baseline/menu-sweep-path` (mode `path`, baru)** — masing-masing 5 akun × 194 tujuan (191 `KNOWN_MENU_IDS` + 3 probe). Bandingkan tiap mode dengan baseline mode-nya sendiri; `--ignore` tidak diperlukan lagi kecuali sengaja mengecualikan field. Perbedaan lama→baru saat baseline diganti (dihitung `--diff` dengan `--ignore finalSearch,finalPath,lastPath`): `menu` 2 hash konten (drift data, identik build `main` hari itu) + 160 tujuan baru (32 id camelCase × 5); `restore` 39 (10 probe sampah → home, 20 id sintetis detail → daftar induk/pentalan, 7 kontainer CRM → tab pertama, 2 hash drift) + 160 baru — rinciannya `PROGRESS.md` 2026-09-22.
- Catatan semantik (tetap berlaku): `menu` = gate adopsi `?menu=` lama direplikasi persis (id gateless/tak berizin → `/`); `path` yang dibuka langsung = "activeMenu sudah X sejak awal", semantik yang sama dengan `restore` (validasi FIX B) — itulah sebabnya hasil `path` dan `restore` identik kecuali bentuk alamat.
- Output per akun → `scripts/qa/out/<label>/<email>.json` (di-gitignore). Baseline resmi → `scripts/qa/baseline/menu-sweep/<email>.json` (di-commit; hash saja, nol data halaman).
- Fingerprint per tujuan: `finalSearch`/`finalPath` (adopsi vs scrub URL), `lastMenu`, penanda `loginShown`/`accessDenied`/`comingSoon`/`notFound`/`homeShown`, `headings` (angka dimask), `surfaceHash` + `structHash` (sha256 teks & struktur `.nexus-main-surface`, angka dimask), jumlah console error.
- Perbedaan yang **diharapkan** saat baseline diperbarui (mis. G1: `finalSearch` kosong karena URL jadi path) harus disebut eksplisit di PROGRESS.md; selain itu = regresi.
- ⚠️ **JANGAN jalankan dua mode sweep BERBARENGAN di satu `vite preview`, dan baca `gagal-muat N` sebagai SYARAT SAH.** 22 Sep 2026 (G2 ronde 2) `menu` + `restore` dijalankan paralel = **10 konteks browser** menghantam satu server statis; tiga akun kena kegagalan muat **HTTP 404 atas sumber daya** di tujuan **163 / 171 / 172** — jendela waktu yang sama, bukan tujuan yang sama. Gejala khasnya mudah salah dibaca sebagai regresi: `lastMenu`/`lastPath` **null** (localStorage tak pernah terisi), `surfaceHash` = hash string KOSONG (`e3b0c442…`), `consoleErrors` melonjak, lalu **cascade** `page.goto: … interrupted by another navigation` untuk seluruh sisa tujuan akun itu. Satu akun bahkan **menggantung tanpa batas** (node 0 % CPU >30 menit) karena `page.evaluate` di ekor loop **tidak ber-timeout** — satu-satunya panggilan Playwright di loop ini yang tak dibatasi; kalau sweep diam tanpa kemajuan, periksa `ps -o %cpu,time` alih-alih menunggu. ⭐ Yang paling layak diingat: **`restore` yang jalan berbarengan justru BERSIH dan identik baseline** — jadi *hasil bersih di satu mode bukan jaminan mode lain bersih*, dan dua mode yang dibandingkan ke baseline masing-masing bisa bercerita beda hanya karena beban. Obatnya: mode dijalankan **berurutan**, dan `gagal-muat N` di ringkasan per akun diperlakukan sebagai gerbang — **`N > 0` = run itu tidak layak dibandingkan, ulang modenya** (bandingkan hanya entri ber-`error: null`).

- ⛔ **AKAR SEBENARNYA dari insiden di atas — dikoreksi 22 Sep 2026 sesudah mode `menu` diulang bersih; baca ini SEBELUM bullet di atas:** penyebabnya **bukan kontensi**, melainkan **`npm run build` yang dijalankan selama `vite preview` melayani `dist/`** (di G2: oleh agen dokumentasi, di latar, untuk mengukur ulang gate). Rebuild mengganti nama chunk ber-hash, sehingga halaman yang sedang dibuka meminta chunk yang sudah tidak ada → **404 atas chunk**, app tak pernah mount, `lastMenu`/`lastPath` null, `surfaceHash` = hash string kosong. Buktinya: `restore` yang berjalan **berbarengan** justru **bersih**, dan 404 mengenai *sumber daya tertentu*, bukan melambat seperti khas beban. **ATURAN: jangan menjalankan build — termasuk lewat agen/alat lain — selama `vite preview` melayani `dist/`.** Saran "mode dijalankan berurutan" + gerbang `gagal-muat N > 0` di bullet sebelumnya **tetap berlaku sebagai kehati-hatian**, tapi keduanya bukan obat untuk kelas kegagalan ini. Mode `menu` yang diulang **sendirian, tanpa build berjalan** → `✔ identik (5/5 akun)`, gagal-muat 0. ✅ **Aturan ini TERBUKTI di G3 (23 Sep 2026):** ketiga mode dijalankan **berurutan** dan tidak ada build yang menimpa `dist/` selama sweep → **2.910 pembanding, ketiga mode `✔ identik (5/5 akun)`, `gagal-muat 0` di seluruh 15 akun-run, NOL run dibuang** — lawan dua run yang dibuang di G2.
- ⚠️ **Baca kata "identik" bersama CAKUPANNYA (skrip diperkeras 22 Sep 2026, G2).** Pemicunya: satu run G2 gagal login **kelima** akun, dan skrip versi lama tetap mencetak `✔ identik dengan baseline` padahal **nol data terkumpul** — kesimpulan terbalik dari kenyataan. Sekarang: **nol akun berdata → `✖ pembandingan DIBATALKAN — nol data` + exit 1** (nol data = *tidak ada pembanding*, bukan nol perbedaan); hasil jalur sweep **selalu menyebut cakupan** — `✔ identik dengan baseline (5/5 akun)` atau `✖ … (HANYA 3/5 akun)` — dan **exit code gagal juga ketika nol perbedaan tapi akun tak lengkap**. ⚠️ Baris cakupan itu **hanya** dicetak jalur sweep (`--compare`); jalur **`--diff <dirA> <dirB>`** tetap mencetak `✔ identik` polos, jadi kalau memakai `--diff`, hitung sendiri berapa akun yang ada di kedua folder.
- 💡 **Jangan saring output sweep lewat `| tail -N`.** Di G2 outputnya disalurkan begitu dan progres tak terlihat ±15 menit — sulit membedakan "masih jalan" dari "menggantung". Pakai `tee` penuh (mis. `… | tee scripts/qa/out/<label>.log`) supaya log lengkap tersimpan **dan** progres terlihat; kalau sweep diam tanpa kemajuan, periksa `ps -o %cpu,time` alih-alih menunggu.

## Checklist manual per giliran (di luar sweep otomatis)

Sweep hanya membuktikan "buka langsung + identitas halaman". Per giliran, uji manual dengan ≥2 akun (satu yang boleh, satu yang ditolak):

1. **Masuk dari tiap titik**: sidebar · Beranda · tombol handoff (Deal → Buat Quotation/PRF, PRF Detail → Buat Quotation, Storbit Dashboard → SP Detail → Picking → Surat Jalan → "Ke SP", Customer → Edit Inquiry → Back = tab Riwayat).
2. **Refresh** di halaman detail (sejak G2: konteks harus bertahan) dan di form (sejak G1: payload `location.state` bertahan di tab yang sama).
3. **Back/Forward** browser 3× berturut (sejak G1 bergerak di dalam app).
4. **Deep link tak sah**: id record salah/dihapus → keadaan kosong/error yang wajar, bukan layar putih (kelas kegagalan baru sejak G2).
5. **Role terbatas**: menu tersembunyi + `AccessDenied` di path yang sama; `viewer` hanya melihat menu publik.
6. **Login dari path dalam** (bukan `/`): setelah login mendarat di path itu.
7. Catat hasil di `PROGRESS.md` giliran tersebut (lolos/gagal per butir, akun yang dipakai).

Butir **2** dan **4** punya alat sendiri sejak G2 — jalankan `detail-routes.mjs` untuk modul yang baru dipindah, lalu tetap lakukan butir **1/3/6** manual (butir **5** punya resep sendiri di bawah):

```bash
QA_PASSWORD='<password bersama akun uji>' node scripts/qa/detail-routes.mjs \
  --base http://localhost:4173 \
  --account zzztest.warehouse@msi.com --suite logistics-warehouse

# G3 — suite `crm` (4 flow × 5 butir + 5 deep-link palsu = 25 cek).
# Pilih akun yang PUNYA data di keempat daftar; di staging hari ini itu test@msi.com
# (satu-satunya customer MSI dimiliki akun ini, dan daftar SO CRM hanya terisi untuknya).
QA_PASSWORD='<password bersama akun uji>' node scripts/qa/detail-routes.mjs \
  --base http://localhost:4173 \
  --account test@msi.com --suite crm
```

⭐ **Pelajaran G3 (23 Sep 2026) — baris placeholder, dan kenapa "akun mana yang dipakai" adalah bagian dari tesnya.** Run pertama suite `crm` melaporkan **14/25**, dan **seluruh 11 ✖ ternyata artefak harness — nol bug produk**. Dua sebabnya berbeda dan keduanya sudah ditambal:

- **Keadaan kosong dan "memuat" juga berupa `<tr>`** — satu `<td colSpan=N>` tanpa `onClick`. Harness lama mengambil `tbody tr` **pertama**, mengkliknya, tidak terjadi apa-apa, lalu melaporkan **"klik baris gagal"** → **menuduh rute padahal datanya yang kosong**. Sekarang skrip memilih baris **data** saja (`td` lebih dari satu **dan** tanpa `td[colspan]`) dan, kalau nihil, membedakan **"daftar MASIH MEMUAT saat diuji"** dari **"daftar KOSONG untuk akun ini — bukan kegagalan rute"**.
- **Label tombol kembali tidak seragam antar-halaman** — Detail Deal memakai **"Deal List"**, bukan "Kembali", sehingga regex harness tak menemukannya; dan karena butir itu gagal, dua butir Back/Forward ikut gagal **tanpa pernah dijalankan**. Sekarang regex `back` ditulis **per-flow** di definisi suite.

⭐ Ini **bentuk BARU** dari pelajaran G2 (*"daftar kosong ternyata artefak selector"*): kali ini selector **mengenai NON-data**, bukan meleset dari data — gejalanya sama (angka gagal yang menuduh produk), sebabnya berlawanan. Kelas yang sama pula dengan *"identik palsu"* `menu-sweep.mjs` dan *"3/4 lolos"* butir 5: **asersi yang hasilnya ditentukan oleh sesuatu di luar hal yang diuji**. Dua aturan turunannya untuk suite baru G4–G6: **(a)** pilih akun uji yang **punya data di setiap daftar** dalam suite itu — daftar kosong bukan bukti rute rusak **maupun** bukti rute benar; **(b)** asersi tombol kembali menyebut **label halaman itu sendiri**, jangan mengandalkan satu regex generik untuk semua modul.

### Butir 5 (role terbatas) — resep konkret sejak 23 Sep 2026

Masalahnya berulang: gate yang mau diuji sering menolak **role** yang **tidak ada di antara 5 akun uji** (G2: `canInputSP` menolak `ceo`/`gm`/`finance`; kelima akun uji hanya mencakup sales/warehouse/hcga/procurement/viewer). Yang dipakai di G2 — dan boleh ditiru per giliran — adalah **membalik arah**: bukan membuat/mencari akun ber-role lain, tapi **memberi grant menu SEMENTARA ke akun `viewer` yang sudah ada**.

1. **Beri grant lewat User Access** ke `zzztest.restricted@msi.com` (role `viewer`, level 99, normalnya nol grant): **semua menu yang dibutuhkan alur**, termasuk menu tujuan yang digerbangi role. Contoh G2: `logistics_sp` **dan** `logistics_input`. ⭐ **Beri yang kedua juga** — dengan izin menu lengkap, satu-satunya sebab tombol/halaman bisa tertutup adalah **ROLE**-nya; kalau izin menunya sengaja dikurangi, dua sebab bercampur dan tesnya tumpul.
2. **Verifikasi grant TERSIMPAN lewat DB, bukan dari layar** — `select … from user_menu_permissions where user_id = …` sebelum uji (harus naik dari 0) dan sesudah dicabut (harus balik 0). Centang di form ≠ baris di tabel; lihat pelajaran di bawah.
3. Jalankan ujinya (build yang diukur via `vite preview` + DB staging, pola pengaman sama dengan skrip lain: `QA_PASSWORD` dari env, menolak ref produksi).
4. ⛔ **CABUT kembali semua grant sementara.** Data staging wajib kembali ke keadaan semula — kalau tidak, `scripts/qa/baseline/*` (yang direkam dari akun-akun ini) berhenti sahih dan sweep berikutnya melaporkan "regresi" palsu.
5. Sertakan **pembanding**: akun yang memang berhak (G2: `zzztest.warehouse`) harus tetap melihat tombol/halamannya — tanpa itu, "hilang" bisa berarti "rusak untuk semua orang".
6. Uji **dua lapis**, bukan satu: tombol/menu disembunyikan **dan** path-nya diketik langsung → `AccessDenied`.

Alat ujinya **di-commit** sejak 23 Sep 2026 (keputusan Den): `scripts/qa/butir5.mjs`, sekelas `detail-routes.mjs` — semula hidup di `scripts/qa/out/` yang di-gitignore, dipindah supaya G3–G6 mewarisi alat **dan** dua pelajaran asersinya (heading wajib + regex tanpa flag `i`, lihat kepala filenya) alih-alih menemukannya ulang. Resep manual di atas tetap berlaku sebagai jalur tanpa skrip.

⭐ **Pelajaran lintas-alat (23 Sep 2026) — asersi yang lolos karena PRASYARATNYA tak pernah terpenuhi.** Ronde pertama uji butir 5 melaporkan **"3/4 lolos"**, dan angka itu **menyesatkan**: asersi "halaman terbuka" ditulis terlalu longgar (`tidak ditolak && panjang teks > 200`), sehingga **pentalan ke Command Center lolos sebagai "halaman SP terbuka"** — lalu asersi berikutnya ("tombol X tidak ada") ikut "lolos" **karena alasan yang salah**, tombol itu memang tak ada di dashboard. Akarnya: grant baru **tercentang di layar tapi belum tersimpan**. Ini **kelas yang sama** dengan "identik palsu" `menu-sweep.mjs` di atas (nol data dibaca sebagai nol perbedaan). Dua aturan yang berlaku untuk **semua** alat QA di sini:

- **Asersi identitas harus menyebut yang spesifik** (heading halaman yang dituju), bukan sekadar "tidak error / ada isinya".
- **Kalau asersi PRASYARAT gagal, asersi turunannya JANGAN dijalankan** — berhenti dengan exit code gagal + petunjuk apa yang harus dicek. Lebih baik nol angka daripada angka yang terbaca seperti keberhasilan.

Jejak: `PROGRESS.md` 2026-09-22 butir 12a/12b (butir 5 G2, LOLOS 4/4) & butir 13b (pengerasan `menu-sweep.mjs`). Ini **pelajaran proses, sengaja bukan TD** (keputusan Den).

Akun uji staging & pola aksesnya: `PROGRESS.md` 2026-09-21 (password bersama — tanya Den, tidak ditulis di repo).

# scripts/qa — gate & checklist Batch FS Fase 2.5

Skrip QA yang **di-commit** (keputusan Den 21 Sep 2026, #12). Tiga gate deterministik dipanggil CI (`.github/workflows/ci.yml`); sweep runtime dijalankan lokal per giliran karena butuh akun uji + DB staging.

| Skrip | Fungsi | Dipanggil |
|---|---|---|
| `check-menu-paths.mjs` | Kontrak URL: setiap id menu di `src/App.jsx` (pohon `CRM_MENU_ITEMS`+`ERP_MENU_GROUPS`, `SYNTHETIC_MENU_IDS`, id blok render) punya path di `src/routes/menu-paths.js`; nol path ganda; nol id basi | CI + lokal |
| `lint-baseline.mjs` | Lint "net-zero": gagal kalau total error/warning ATAU angka per file **naik** dari `lint-baseline.json`. `--update` memperbarui baseline (hanya dengan keputusan sadar, di commit yang sama dengan penurunannya) | CI + lokal |
| `menu-sweep.mjs` | Buka semua tujuan menu (`KNOWN_MENU_IDS` + probe tak sah) untuk beberapa akun uji, rekam fingerprint (hash, bukan teks), `--compare` dengan baseline | lokal, per giliran |

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

## Checklist manual per giliran (di luar sweep otomatis)

Sweep hanya membuktikan "buka langsung + identitas halaman". Per giliran, uji manual dengan ≥2 akun (satu yang boleh, satu yang ditolak):

1. **Masuk dari tiap titik**: sidebar · Beranda · tombol handoff (Deal → Buat Quotation/PRF, PRF Detail → Buat Quotation, Storbit Dashboard → SP Detail → Picking → Surat Jalan → "Ke SP", Customer → Edit Inquiry → Back = tab Riwayat).
2. **Refresh** di halaman detail (sejak G2: konteks harus bertahan) dan di form (sejak G1: payload `location.state` bertahan di tab yang sama).
3. **Back/Forward** browser 3× berturut (sejak G1 bergerak di dalam app).
4. **Deep link tak sah**: id record salah/dihapus → keadaan kosong/error yang wajar, bukan layar putih (kelas kegagalan baru sejak G2).
5. **Role terbatas**: menu tersembunyi + `AccessDenied` di path yang sama; `viewer` hanya melihat menu publik.
6. **Login dari path dalam** (bukan `/`): setelah login mendarat di path itu.
7. Catat hasil di `PROGRESS.md` giliran tersebut (lolos/gagal per butir, akun yang dipakai).

Akun uji staging & pola aksesnya: `PROGRESS.md` 2026-09-21 (password bersama — tanya Den, tidak ditulis di repo).

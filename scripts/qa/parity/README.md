# Patch parity staging (TD-279)

Berkas di sini **menyamakan STAGING ke PRODUCTION**. Ia bukan migrasi, dan
sengaja tidak tinggal di `supabase/migrations/`.

## Kenapa bukan migrasi

Migrasi menggambarkan **perubahan skema yang direncanakan**, dan antreannya ke
production hidup di `docs/Governance/12_ANTREAN_MIGRASI_PRODUCTION.md`. Berkas
di sini melakukan yang sebaliknya: ia membawa staging **menyusul** keadaan yang
**sudah lama hidup di production**. Menaruhnya di folder migrasi akan membuat
antrean itu berbohong — seolah ada yang perlu dinaikkan, padahal production
justru sumbernya.

⛔ **Tidak satu pun berkas di sini boleh dijalankan di PRODUCTION.**

## Kenapa teksnya disalin dari production, bukan dari berkas migrasi

Bacaan 27 Sep 2026 membuktikan **berkas migrasi di repo bukan cermin
production**: `20260907000001` memasang empat RPC PRF, lalu `20260912000004`
mengganti `prf_claim`. Menjalankan berkas pertama di staging akan memperbaiki
satu objek sambil **memundurkan** objek lain yang sekarang sudah sama — drift
baru, lahir dari upaya menutup drift.

Karena itu tiap objek disamakan ke **teks yang benar-benar hidup di
production**, diambil read-only, disalin verbatim.

## Bukti, bukan harapan

Tiap berkas ditutup blok `DO` yang **membandingkan hasilnya dengan sidik jari
production** yang sudah diukur (md5 badan fungsi, atau teks `qual`/`with_check`
policy apa adanya). Kalau tidak cocok, berkas itu **gagal dengan exception** —
bukan mencetak peringatan lalu lanjut.

⚠️ Sidik jari yang dibandingkan **ditanam sebagai angka mati di dalam berkas**.
Itu disengaja: ia memotret keadaan production pada **27 Sep 2026**. Kalau
production berubah sesudahnya, berkas ini **harus gagal** — bukan diam-diam
menyamakan staging ke keadaan yang sudah basi.

## Batas yang tidak ditutup di sini

`env-drift-check.mjs` tidak membandingkan **hak tabel/kolom, index, constraint,
sequence, extension, dan isi data**. Berkas di sini hanya menutup apa yang
terukur. Untuk kelas itu, doc 12 dan pemeriksaan tersendiri yang jadi
daftarnya.

#!/bin/bash
# scripts/seed/uat/seed.sh -- pembungkus seed data dummy UAT untuk nexus-staging.
#
# ASCII MURNI. Jangan tambahkan karakter non-ASCII: /bin/bash macOS 3.2.57 di
# bawah locale UTF-8 menelan byte non-ASCII yang MENEMPEL pada $var menjadi
# bagian nama variabel, lalu gagal "unbound variable" di bawah set -u. Gagalnya
# TIDAK tertangkap bash -n maupun uji di shell ber-LC_ALL=C.
# (02_RULES_GOVERNANCE.md par.2 + par.6)
#
# Pemakaian:
#   STG_DB_URL='postgresql://...oovmlhilhqzejnawqkvt...' ./seed.sh seed
#   STG_DB_URL='...' ./seed.sh purge
#   STG_DB_URL='...' ./seed.sh verify
#
# Nol kredensial di berkas ini. STG_DB_URL dibaca dari environment saja.

set -euo pipefail

MODE="${1:-}"
if [ "$MODE" != "seed" ] && [ "$MODE" != "purge" ] && [ "$MODE" != "verify" ]; then
  echo "Pemakaian: STG_DB_URL='...' $0 seed|purge|verify" >&2
  exit 2
fi

if [ -z "${STG_DB_URL:-}" ]; then
  echo "PALANG: STG_DB_URL belum diset." >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# PALANG TARGET -- dua arah, bukan satu.
# Menuntut ref staging ADA, dan menolak kalau ref produksi MUNCUL. Hanya
# memeriksa satu di antaranya akan meloloskan URL yang memuat keduanya.
# ---------------------------------------------------------------------------
case "$STG_DB_URL" in
  *untmpqceexwxzuhlmyrg*)
    echo "PALANG: STG_DB_URL memuat ref PRODUKSI (untmpqceexwxzuhlmyrg). DITOLAK." >&2
    exit 3 ;;
esac
case "$STG_DB_URL" in
  *oovmlhilhqzejnawqkvt*) : ;;
  *)
    echo "PALANG: STG_DB_URL tidak memuat ref staging (oovmlhilhqzejnawqkvt). DITOLAK." >&2
    exit 3 ;;
esac

command -v psql >/dev/null 2>&1 || { echo "PALANG: psql tidak ditemukan di PATH." >&2; exit 4; }

cd "$(dirname "$0")"

# PALANG STRUKTUR: tiap berkas yang dijalankan harus memanggil palangnya sendiri.
./cek-guards.sh

# ON_ERROR_STOP=1 -- berhenti di kesalahan pertama, bukan melanjutkan dan
# meninggalkan data separuh jadi.
#
# --single-transaction WAJIB, dan bukan sekadar kerapian. 00-guards.sql memasang
# impersonasi lewat set_config(..., true) yang berlaku SATU TRANSAKSI. Tanpa
# bendera ini psql autocommit: tiap pernyataan jadi transaksinya sendiri, GUC-nya
# hilang begitu blok palang selesai, dan pernyataan berikutnya berjalan dengan
# auth.uid() NULL -- guard RPC menolak dengan pesan yang terdengar seperti bug
# izin ("Tidak berhak membuat picking list untuk SP ini"), padahal sebabnya
# transaksi.
#
# Efek keduanya diinginkan: tiap berkas jadi ATOMIK. Gagal di tengah berarti
# berkas itu dibatalkan seluruhnya, bukan meninggalkan staging separuh jadi.
#
# !! Tiap berkas memanggil \i 00-guards.sql sendiri. Jangan dicabut dengan alasan
# "sudah dipanggil di berkas sebelumnya" -- tiap berkas di sini adalah proses
# psql SENDIRI, jadi SESI sendiri, dan tidak mewarisi GUC dari siapa pun.
# Dijaga mekanis oleh cek-guards.sh.
PSQL="psql --no-psqlrc --set=ON_ERROR_STOP=1 --single-transaction --quiet"

jalankan() {
  echo ""
  echo "=== $1 ==="
  $PSQL "$STG_DB_URL" -f "$1"
}

case "$MODE" in
  seed)
    # Urutannya MENGIKAT:
    #  - 01-stock  sebelum skenario apa pun (tanpa stok, SP jatuh ke MENUNGGU_STOK)
    #  - 01b-helper sebelum 02/03/04 (ketiganya memanggil fungsinya)
    #  - 04 sebelum 05 (TTF menempel pada invoice yang dibuat 04)
    #  - 07 sesudah 04 (fixture kolom kelas (c) menempel pada invoice yang sama)
    #    dan sebelum 06-verify, karena V12i menghitung hasilnya
    jalankan 01-stock.sql
    jalankan 01b-helper.sql
    jalankan 02-scenario-1.sql
    jalankan 03-scenario-2.sql
    jalankan 04-scenario-3.sql
    jalankan 05-ttf.sql
    jalankan 07-fixture-invoice-v2.sql
    jalankan 06-verify.sql
    echo ""
    echo "SELESAI. Periksa kolom hasil di atas: setiap baris harus LOLOS."
    ;;
  purge)
    jalankan 99-purge.sql
    echo ""
    echo "PURGE SELESAI. Seluruh angka sisa harus 0, dan stok pulih ke keadaan"
    echo "sebelum seed (30.000 per produk hilang; PVC POP A6 kembali ke 40)."
    ;;
  verify)
    jalankan 06-verify.sql
    ;;
esac

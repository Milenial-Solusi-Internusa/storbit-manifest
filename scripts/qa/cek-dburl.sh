#!/bin/bash
# scripts/qa/cek-dburl.sh -- palang bersama untuk setiap skrip yang memakai URL
# Postgres. 100% BACA: satu-satunya SQL yang dikirim adalah SELECT 1.
#
# ASCII MURNI. Jangan tambahkan karakter non-ASCII: /bin/bash macOS 3.2.57 di
# bawah locale UTF-8 menelan byte non-ASCII yang MENEMPEL pada $var menjadi
# bagian nama variabel, lalu gagal "unbound variable" di bawah set -u.
#
# -- PEMAKAIAN ---------------------------------------------------------------
#   ./cek-dburl.sh <NAMA_VARIABEL> <staging|production>
#
#   Yang dioper NAMA variabelnya, BUKAN isinya:
#       ./scripts/qa/cek-dburl.sh STG_DB_URL staging
#
#   !! Sengaja begitu. URL memuat password, dan argumen perintah terlihat oleh
#   siapa pun yang menjalankan `ps` di mesin yang sama. Nama variabel tidak
#   membocorkan apa-apa; isinya dibaca lewat ekspansi tak langsung ${!nama}.
#
# -- KENAPA ADA (27 Sep 2026) ------------------------------------------------
# baca-drift-a.sh dijalankan dengan URL "direct connection"
# (db.<ref>.supabase.co) yang tidak bisa di-resolve dari jaringan ini. Setiap
# psql gagal, TAPI skrip itu menutup tiap panggilan dengan `|| true` lalu
# mem-`diff` keluarannya -- jadi ia membandingkan DUA PESAN ERROR dan
# melaporkan setiap objek "BERBEDA".
#
# ** Itu kelas kegagalan yang sudah dua kali menggigit proyek ini: asersi yang
# berbunyi karena PRASYARATNYA tak pernah terpenuhi, bukan karena temuannya
# nyata (lihat scripts/qa/README.md). Yang berbahaya bukan gagalnya koneksi --
# itu jelas dan cepat ketahuan -- melainkan laporan yang tetap terlihat
# berwibawa sesudahnya.
#
# Tiga aturan yang ditegakkan di sini, dan ketiganya harus ada:
#   1. tolak host direct connection SEJAK AWAL (nol koneksi, pesan + petunjuk)
#   2. palang ref DUA ARAH (ref yang benar wajib ADA, ref lawan wajib TIDAK)
#   3. buktikan koneksinya HIDUP lewat SELECT 1 sebelum skrip pemanggil mulai
#
# Aturan 1 saja tidak cukup: URL bisa salah karena password, port, atau nama
# user, bukan cuma host. Aturan 3 yang membuat "berhasil" berarti sesuatu.

set -euo pipefail

NAMA="${1:-}"
HARAP="${2:-}"
if [ -z "$NAMA" ] || [ -z "$HARAP" ]; then
  echo "Pemakaian: $0 <NAMA_VARIABEL> <staging|production>" >&2
  exit 2
fi

# Ekspansi tak langsung: baca isi variabel yang namanya ada di $NAMA.
URL="${!NAMA:-}"
if [ -z "$URL" ]; then
  echo "PALANG: $NAMA belum diset." >&2
  exit 2
fi

REF_STG='oovmlhilhqzejnawqkvt'
REF_PRD='untmpqceexwxzuhlmyrg'

petunjuk_pooler() {
  echo "" >&2
  echo "  Pakai SESSION POOLER, bukan direct connection:" >&2
  echo "    host : <region>.pooler.supabase.com   (mis. aws-1-ap-northeast-2.pooler.supabase.com)" >&2
  echo "    user : postgres.<ref>                 (bukan sekadar 'postgres')" >&2
  echo "    port : 5432" >&2
  echo "  BUKAN: db.<ref>.supabase.co -- host itu tidak bisa di-resolve dari sini." >&2
  echo "  Salin dari Supabase > Project Settings > Database > Connection string > Session pooler." >&2
}

# -- 1. Tolak host direct connection sebelum satu byte pun dikirim -----------
case "$URL" in
  *db.*.supabase.co*)
    echo "PALANG: $NAMA memakai DIRECT CONNECTION (db.<ref>.supabase.co)." >&2
    petunjuk_pooler
    exit 4 ;;
esac

# -- 2. Palang ref DUA ARAH --------------------------------------------------
# Memeriksa satu arah saja akan meloloskan URL yang memuat keduanya.
case "$HARAP" in
  staging)
    case "$URL" in *"$REF_PRD"*)
      echo "PALANG: $NAMA seharusnya STAGING tapi memuat ref PRODUKSI. DITOLAK." >&2; exit 3 ;; esac
    case "$URL" in *"$REF_STG"*) : ;;
      *) echo "PALANG: $NAMA tidak memuat ref staging ($REF_STG). DITOLAK." >&2; exit 3 ;; esac ;;
  production)
    case "$URL" in *"$REF_STG"*)
      echo "PALANG: $NAMA seharusnya PRODUCTION tapi memuat ref STAGING. DITOLAK." >&2; exit 3 ;; esac
    case "$URL" in *"$REF_PRD"*) : ;;
      *) echo "PALANG: $NAMA tidak memuat ref produksi ($REF_PRD). DITOLAK." >&2; exit 3 ;; esac ;;
  *)
    echo "PALANG: argumen kedua harus 'staging' atau 'production', bukan '$HARAP'." >&2
    exit 2 ;;
esac

command -v psql >/dev/null 2>&1 || { echo "PALANG: psql tidak ditemukan di PATH." >&2; exit 5; }

# -- 3. Buktikan koneksinya hidup --------------------------------------------
# ON_ERROR_STOP + exit code diperiksa. Keluarannya ditahan supaya URL tidak
# ikut tercetak kalau psql mengutipnya di pesan error.
GALAT=$(PGCONNECT_TIMEOUT=15 psql "$URL" --no-psqlrc -X -A -t \
          -v ON_ERROR_STOP=1 -c 'SELECT 1' 2>&1 >/dev/null) && RC=0 || RC=$?
if [ "$RC" != "0" ]; then
  echo "PALANG: $NAMA tidak bisa dipakai menyambung ($HARAP). psql keluar dengan kode $RC." >&2
  echo "  pesan: $GALAT" >&2
  case "$GALAT" in
    *"could not translate host name"*|*"Name or service not known"*|*"nodename nor servname"*)
      petunjuk_pooler ;;
  esac
  exit 6
fi

echo "PALANG LOLOS: $NAMA menyambung ke $HARAP (SELECT 1 berhasil)."

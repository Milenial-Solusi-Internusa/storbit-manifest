#!/bin/bash
# scripts/qa/psql-retry.sh -- satu panggilan psql, dengan retry HANYA untuk
# kegagalan koneksi, dan pesan yang membedakan sebabnya.
#
# ASCII MURNI. Jangan tambahkan karakter non-ASCII: /bin/bash macOS 3.2.57 di
# bawah locale UTF-8 menelan byte non-ASCII yang MENEMPEL pada $var menjadi
# bagian nama variabel, lalu gagal "unbound variable" di bawah set -u.
#
# -- PEMAKAIAN ---------------------------------------------------------------
#   ./psql-retry.sh <NAMA_VARIABEL> <label> <berkas_keluar> -- <argumen psql...>
#
#   contoh:
#     ./scripts/qa/psql-retry.sh STG_DB_URL staging out/f.stg -- \
#        -A -F '|' -t -f out/f.sql
#
#   Yang dioper NAMA variabelnya, BUKAN isinya -- URL memuat password.
#   berkas_keluar = '-' berarti biarkan keluaran psql ke stdout.
#
# -- KENAPA ADA (28 Sep 2026) ------------------------------------------------
# baca-komponen-fungsi.sh membuka SATU KONEKSI PER OBJEK. Fungsi pertama
# terbaca, lalu koneksi staging timeout di fungsi kedua
# (aws-0-ap-northeast-2 pooler, "Operation timed out") -- padahal palang
# SELECT 1 sudah lolos beberapa detik sebelumnya. Jadi URL-nya benar; yang
# putus-putus koneksinya.
#
# Dua akibat yang ditutup di sini:
#   1. satu koneksi per objek = N kali peluang gagal untuk satu pekerjaan, dan
#      N kali pemakaian kuota. Organisasi Supabase ini Free Plan dan kuota Log
#      Ingestion-nya sudah terlampaui -- tiap koneksi ada harganya.
#   2. "gagal" tanpa penjelasan membuat orang mengetik ulang URL yang
#      sebenarnya sudah benar.
#
# ** RETRY-NYA SENGAJA HANYA UNTUK KEGAGALAN KONEKSI. ** Mengulang password
# yang salah tiga kali membuang tiga koneksi dan mengaburkan diagnosisnya;
# mengulang ERROR SQL mengulang kesalahan yang sama dengan hasil yang sama.
# Yang diulang hanya yang memang bisa berhasil kalau dicoba lagi.

set -euo pipefail

NAMA="${1:-}"
LABEL="${2:-}"
KELUAR="${3:-}"
if [ -z "$NAMA" ] || [ -z "$LABEL" ] || [ -z "$KELUAR" ]; then
  echo "Pemakaian: $0 <NAMA_VARIABEL> <label> <berkas_keluar|-> -- <argumen psql...>" >&2
  exit 2
fi
shift 3
if [ "${1:-}" = "--" ]; then shift; fi

URL="${!NAMA:-}"
if [ -z "$URL" ]; then
  echo "PALANG: $NAMA belum diset." >&2
  exit 2
fi

MAKS="${QA_RETRY_MAKS:-3}"        # jumlah percobaan, bukan jumlah ulangan
# Detik; digandakan tiap percobaan (5, 10). Bisa di-nol-kan lewat env HANYA
# untuk menguji skrip ini sendiri dengan psql tiruan -- tanpa itu tiap uji
# menunggu 15 detik sungguhan dan pengujiannya berhenti dilakukan.
JEDA_AWAL="${QA_RETRY_JEDA:-5}"

petunjuk_pooler() {
  echo "  Pakai SESSION POOLER: host <region>.pooler.supabase.com," >&2
  echo "  user postgres.<ref>, port 5432 (Project Settings > Database)." >&2
  echo "  BUKAN db.<ref>.supabase.co -- host itu tidak bisa di-resolve dari sini." >&2
}

# Mengembalikan: 'koneksi' (boleh diulang), 'url' (jangan diulang),
# 'sql' (jangan diulang), 'lain' (jangan diulang).
golongkan() {
  case "$1" in
    *"could not translate host name"*|*"nodename nor servname"*|*"Name or service not known"*)
      echo url ;;
    *"password authentication failed"*|*"no password supplied"*|*"role \""*"does not exist"*|*"database \""*"does not exist"*|*"Tenant or user not found"*)
      echo url ;;
    *"Operation timed out"*|*"could not connect to server"*|*"connection timed out"*|*"timeout expired"*|*"Connection refused"*|*"server closed the connection unexpectedly"*|*"Connection reset by peer"*|*"SSL connection has been closed unexpectedly"*|*"terminating connection"*|*"the database system is starting up"*|*"too many clients"*|*"remaining connection slots"*)
      echo koneksi ;;
    *"ERROR:"*)
      echo sql ;;
    *)
      echo lain ;;
  esac
}

PERCOBAAN=1
JEDA=$JEDA_AWAL
while : ; do
  if [ "$KELUAR" = "-" ]; then
    GALAT=$(PGCONNECT_TIMEOUT=15 psql "$URL" --no-psqlrc -X -v ON_ERROR_STOP=1 "$@" 2>&1 >&3) && RC=0 || RC=$?
  else
    GALAT=$(PGCONNECT_TIMEOUT=15 psql "$URL" --no-psqlrc -X -v ON_ERROR_STOP=1 "$@" 2>&1 >"$KELUAR") && RC=0 || RC=$?
  fi 3>&1

  if [ "$RC" = "0" ]; then
    if [ "$PERCOBAAN" != "1" ]; then
      echo "  psql berhasil pada percobaan ke-$PERCOBAAN." >&2
    fi
    # stderr psql yang bukan error (NOTICE dari blok DO) tetap ditampilkan --
    # blok verifikasi migrasi berbicara lewat RAISE NOTICE, dan menelannya
    # membuat "LOLOS" tidak pernah terlihat.
    [ -n "$GALAT" ] && printf '%s\n' "$GALAT" >&2
    exit 0
  fi

  JENIS=$(golongkan "$GALAT")
  case "$JENIS" in
    koneksi)
      echo "KONEKSI PUTUS ke $LABEL (percobaan $PERCOBAAN dari $MAKS, kode $RC)." >&2
      echo "  pesan: $GALAT" >&2
      if [ "$PERCOBAAN" -ge "$MAKS" ]; then
        echo "" >&2
        echo "GAGAL: $MAKS percobaan habis dan penyebabnya KONEKSI, bukan URL." >&2
        echo "  URL-nya sendiri sudah lolos palang bentuk + ref. Jangan diketik ulang;" >&2
        echo "  tunggu sebentar lalu jalankan skripnya lagi. Kalau berulang, periksa" >&2
        echo "  jaringan atau status pooler Supabase." >&2
        exit 7
      fi
      echo "  menunggu ${JEDA}s lalu mencoba lagi..." >&2
      sleep "$JEDA"
      PERCOBAAN=$((PERCOBAAN + 1))
      JEDA=$((JEDA * 2))
      ;;
    url)
      echo "URL SALAH untuk $LABEL (kode $RC). TIDAK diulang -- mengulang tidak akan mengubah hasilnya." >&2
      echo "  pesan: $GALAT" >&2
      petunjuk_pooler
      exit 6
      ;;
    sql)
      echo "GAGAL SQL di $LABEL (kode $RC). Koneksinya HIDUP; yang gagal querynya." >&2
      echo "  pesan: $GALAT" >&2
      exit 8
      ;;
    *)
      echo "GAGAL tak tergolong di $LABEL (kode $RC). TIDAK diulang." >&2
      echo "  pesan: $GALAT" >&2
      exit 9
      ;;
  esac
done

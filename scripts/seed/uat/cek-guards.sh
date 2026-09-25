#!/bin/bash
# scripts/seed/uat/cek-guards.sh -- palang STRUKTUR untuk rangkaian seed.
#
# ASCII MURNI. Jangan tambahkan karakter non-ASCII: /bin/bash macOS 3.2.57 di
# bawah locale UTF-8 menelan byte non-ASCII yang MENEMPEL pada $var menjadi
# bagian nama variabel, lalu gagal "unbound variable" di bawah set -u.
#
# Menegakkan satu aturan: SETIAP berkas yang dijalankan seed.sh memanggil
# 00-guards.sql sendiri.
#
# Kenapa perlu dijaga mekanis. seed.sh menjalankan tiap berkas sebagai proses
# psql SENDIRI, jadi tiap berkas adalah SESI sendiri: GUC impersonasi dari
# berkas sebelumnya TIDAK diwariskan. Sebelum 25 Sep 2026 enam berkas
# mengandalkan "00-guards.sql sudah dijalankan di sesi yang SAMA" -- kalimat
# yang tidak pernah benar untuk seed.sh, dan baru terbukti salah saat seed
# dijalankan lewat psql. Kalau ada yang mencabut satu \i lagi dengan alasan
# "sudah dipanggil di atas", berkas ini yang berbunyi, bukan staging.
#
# 100% BACA berkas. Nol koneksi database.

set -euo pipefail
cd "$(dirname "$0")"

WAJIB="01-stock.sql 01b-helper.sql 02-scenario-1.sql 03-scenario-2.sql 04-scenario-3.sql 05-ttf.sql 06-verify.sql 07-fixture-invoice-v2.sql 99-purge.sql"
RC=0

for f in $WAJIB; do
  if [ ! -f "$f" ]; then
    echo "PALANG STRUKTUR: berkas $f tidak ada." >&2
    RC=1
    continue
  fi
  if ! grep -q '^\\i 00-guards.sql$' "$f"; then
    echo "PALANG STRUKTUR: $f tidak memanggil 00-guards.sql." >&2
    echo "  Tiap berkas = proses psql sendiri = sesi sendiri. Tambahkan baris:" >&2
    echo "    \\i 00-guards.sql" >&2
    RC=1
  fi
done

# Berkas seed apa pun yang BARU tapi belum masuk daftar di atas juga ditolak:
# daftar yang diam-diam ketinggalan adalah cara aturan ini mati pelan-pelan.
for f in [0-9]*.sql; do
  case "$f" in
    00-guards.sql) continue ;;
  esac
  case " $WAJIB " in
    *" $f "*) : ;;
    *)
      echo "PALANG STRUKTUR: $f ada di folder tapi tidak terdaftar di cek-guards.sh." >&2
      echo "  Tambahkan ke WAJIB (dan ke seed.sh kalau memang harus dijalankan)." >&2
      RC=1 ;;
  esac
done

if [ "$RC" -ne 0 ]; then
  echo "PALANG STRUKTUR GAGAL." >&2
  exit 5
fi
echo "PALANG STRUKTUR LOLOS: 9 berkas memanggil 00-guards.sql sendiri."

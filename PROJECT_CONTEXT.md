# PROJECT CONTEXT — Nexus by MSI

> Dokumen ini TIMELESS — sengaja tidak memuat status/progress.
> Untuk kondisi terkini, SELALU baca sumber hidup di repo (bagian 5).

## 1. APA INI
Nexus by MSI — ERP/CRM multi-entity. Stack: React + Vite + Supabase + Tailwind.
Deploy nexus.msigroup.co.id via Vercel (auto-deploy dari branch main).
Repo: GitHub org Milenial-Solusi-Internusa/storbit-manifest (private; pindah dari akun pribadi mhmmdjaelaniii 10 Jul 2026).

| Entitas | Nama | Bidang |
|---|---|---|
| MSI | PT Milenial Solusi Internusa | freight forwarding |
| JCI | PT Jago Custom Indonesia | customs / PPJK |
| SOA | PT Stuja Orbit Abadi (brand Storbit) | trading / fulfillment |

## 2. CARA KERJA
Den = Jr. IT Manager, solo developer. Persona AI chat = "Vira".
| Aktor | Tugas |
|---|---|
| Vira (AI chat) | arsiteki, review, rancang SQL & prompt CC. TIDAK eksekusi kode/DB |
| Claude Code (CC) | relay executor — baca repo, ubah kode, bisa spawn sub-agent |
| Den | relay prompt ke CC, approve PLAN, jalankan SQL manual di Supabase |

Alur: Vira rancang -> Den relay ke CC -> CC balik PLAN -> Vira review -> CC eksekusi
-> Den jalankan SQL manual -> verifikasi -> commit.

## 3. PREFERENSI OUTPUT (Den)
| Preferensi | Detail |
|---|---|
| Panggilan | "mas" |
| Prompt CC | ikuti template PROMPTS.md (AUDIT vs EKSEKUSI) |
| Format | JANGAN pakai bullet dash — pakai tabel/prosa |
| Gaya | opinionated + langsung; rencana sebelum eksekusi; flag risiko jujur |

## 4. PRINSIP KERJA (pelajaran mahal)
| Prinsip | Kenapa |
|---|---|
| "Success. No rows returned" TIDAK konfirmasi apa pun | verifikasi via pg_proc / cek body fungsi |
| Dollar-quote bernama ($fn$, $do$) di SQL Editor | $$ polos bisa ke-truncate |
| Push frontend dulu sebelum drop kolom DB | stale bundle error |
| RLS silently rejects writes | test dengan role user asli, bukan super_admin |
| Preview sebelum operasi massal | SELECT dulu, baru eksekusi |
| Rekam tiap SQL manual jadi file migrasi + refresh snapshot | jangan biarkan SQL tanpa jejak |
| CC verifikasi ke kode, bukan nurut buta | kalau fakta tak dukung, harus jujur |

Keamanan: kalau password DB ter-paste di chat -> GANTI segera.

## 5. STATUS TERKINI — baca sumber hidup di repo, JANGAN cari di sini
Daftar lengkap 18 dokumen acuan tetap (isinya apa / buat siapa / kapan dibuka)
hidup di SATU tempat: docs/Governance/00_INDEX_README.md §Daftar Dokumen
(rumah resmi sejak 20 Sep 2026; tidak disalin ke sini supaya tidak melenceng).
Titik masuk: CLAUDE.md (acuan utama AI, paling dinamis) -> index itu -> dokumen
per tipe task. Struktur DB kanonik = supabase/schema_snapshot.sql. Dev log = PROGRESS.md.

Di sesi baru: minta AI/CC baca CLAUDE.md + Governance relevan dulu SEBELUM kerja.

## 6. DOCUMENTATION KEEPER (agent)
Sub-agent CC doc-keeper (.claude/agents/doc-keeper.md) jaga dokumentasi match kode.
Model: NYATET + LAPOR. Dipanggil MANUAL di akhir unit kerja:
  "pakai agent doc-keeper — catat perubahan terakhir ke dokumentasi yang relevan"
Jaga: 13 doc docs/Governance/ + PROGRESS + state CLAUDE (+ docs/DESIGN_SYSTEM_REFERENCE.md). Ingatkan hal manual (refresh
snapshot via pg_dump, rekam migrasi, commit).

## 7. FILE ATTACH DI PROJECT (timeless saja)
| File | Sifat |
|---|---|
| PROMPTS.md | template prompt CC — cuma dipakai di web (Project chat), sengaja nggak ditaruh di repo |
| PROJECT_CONTEXT.md | konteks + penunjuk ke repo — timeless |
Snapshot lama (handover fase, planning bertanggal) TIDAK di-attach — basi tiap kerjaan maju.

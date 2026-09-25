// src/modules/finance/invoiceStatus.js
// Kosakata status invoice + kontrak query daftar. SATU sumber untuk ketiga
// halaman Invoice Management (Siap Ditagih, Daftar, Detail).
//
// ⛔ Berkas ini NOL logika bisnis: ia tidak memutuskan siapa boleh apa dan tidak
// menghitung apa pun yang dikirim ke server. Isinya label, warna, dan urutan --
// murni tampilan. Aturan siap/tertahan tetap milik DB (sp_invoice_readiness),
// gate peran tetap milik src/lib/roles.js.
//
// Konstanta polos saja (nol JSX) supaya ramah Fast-Refresh -- pola yang sama
// dengan spDetailTokens.js dan src/kit/tokens.js.
import { TAG_PALE, TAG_OUTLINE, TAG_NEUTRAL, TAG_ATTN } from '../logistics/spDetailTokens.js';

// Label Indonesia yang dipakai SELURUH permukaan AR (keputusan Den 25 Sep 2026).
// `submitted` sengaja panjang: "Submitted" tak memberi tahu siapa pun APA yang
// sudah terjadi, sementara yang sungguh dilakukan Finance adalah mengunggah
// invoice ke portal customer.
export const STATUS_LABEL = {
  draft:     'Draft',
  issued:    'Terbit',
  submitted: 'Sudah Upload ke Portal',
  partial:   'Bayar Sebagian',
  paid:      'Lunas',
  void:      'Void',
};

// Label pendek untuk tempat sempit (tab, kolom tabel sempit).
export const STATUS_LABEL_SHORT = {
  ...STATUS_LABEL,
  submitted: 'Sudah Upload',
};

// Pemetaan ke empat varian tag keluarga ungu/serif Storbit. Aturannya sama
// dengan yang berlaku di Detail SP: PALE = selesai/positif, OUTLINE = sedang
// berjalan, ATTN = butuh perhatian, NEUTRAL = inert/informasi.
export const STATUS_TAG = {
  draft:     TAG_NEUTRAL,
  issued:    TAG_OUTLINE,
  submitted: TAG_OUTLINE,
  partial:   TAG_ATTN,
  paid:      TAG_PALE,
  void:      TAG_NEUTRAL,
};

// ─── Stepper tahap ─────────────────────────────────────────────────────────
// Urutan tahap hidup invoice. `void` TIDAK di sini: ia bukan tahap lanjutan
// melainkan pembatalan, dan dirender sebagai label merah terpisah di ujung bar
// (pola yang sama dengan `closed` pada StatusBar kit).
//
// ⭐ SIAP DISISIPI: AR Tahap 3 akan menambahkan "Menunggu Persetujuan" DI DEPAN
// 'issued'. Caranya cukup menyisipkan satu entri di awal array ini -- komponen
// Stepper menghitung tahap aktif lewat indexOf pada array ini, bukan lewat
// angka hardcode, jadi nol tempat lain yang perlu disentuh. Contoh:
//   { id: 'pending_approval', label: 'Menunggu Persetujuan' },
export const INVOICE_STEPS = [
  { id: 'issued',    label: 'Terbit' },
  { id: 'submitted', label: 'Sudah Upload ke Portal' },
  { id: 'partial',   label: 'Bayar Sebagian' },
  { id: 'paid',      label: 'Lunas' },
];

/** Indeks tahap aktif di INVOICE_STEPS; -1 kalau statusnya di luar sumbu. */
export const stepIndexOf = (status) => INVOICE_STEPS.findIndex((s) => s.id === status);

// ─── Kontrak query daftar (dibawa ke URL) ──────────────────────────────────
// Navigasi rekaman "3 / 22" di Detail Invoice harus mengikuti URUTAN DAN FILTER
// yang sedang aktif di Daftar Invoice. Supaya itu tetap benar sesudah refresh
// dan sesudah Back, keadaannya dibawa di URL -- bukan di location.state.
// Pelajaran G3: begitu "daftar mana yang sedang dilihat" hidup di state, janji
// "tetap benar saat di-refresh" gugur persis di kasus yang jadi alasannya ada.
export const LIST_QUERY_KEYS = { status: 'st', search: 'q' };

/** {status,search} -> '?st=…&q=…' (string kosong kalau keduanya default). */
export function buildListQuery({ status = 'semua', search = '' } = {}) {
  const p = new URLSearchParams();
  if (status && status !== 'semua') p.set(LIST_QUERY_KEYS.status, status);
  if (search.trim())               p.set(LIST_QUERY_KEYS.search, search.trim());
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** URLSearchParams -> {status,search}. Nilai tak dikenal jatuh ke 'semua'. */
export function parseListQuery(searchParams) {
  const st = searchParams?.get?.(LIST_QUERY_KEYS.status) || 'semua';
  return {
    status: st === 'semua' || STATUS_LABEL[st] ? st : 'semua',
    search: searchParams?.get?.(LIST_QUERY_KEYS.search) || '',
  };
}

/**
 * Saring + urutkan baris invoice menurut {status, search}. Dipakai DUA halaman:
 * Daftar Invoice (untuk tabelnya) dan Detail Invoice (untuk menghitung
 * "3 / 22" + panah sebelum/sesudah). Satu fungsi, supaya mustahil urutan di
 * panah berbeda dari urutan di tabel.
 *
 * Urutannya sendiri sudah ditentukan server (`listInvoices` ORDER BY
 * invoice_date DESC); di sini hanya penyaringan.
 */
export function filterInvoices(rows, { status = 'semua', search = '' } = {}) {
  const q = search.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (status !== 'semua' && r.status !== status) return false;
    if (!q) return true;
    const hay = [
      r.invoice_no,
      r.sp_orders?.sp_no,
      r.sp_orders?.accounts?.name,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

// ─── Jatuh tempo ───────────────────────────────────────────────────────────
// Satu definisi "lewat jatuh tempo" untuk ketiga halaman.
// `due_date` NULL -> BUKAN lewat jatuh tempo: 508 dari 509 invoice hidup masih
// NULL (backfill AR Tahap 2 belum jalan di semua lingkungan), dan memerahkan
// semuanya akan mengubur yang benar-benar telat.
export const OPEN_STATUSES = ['issued', 'submitted', 'partial'];

export function isOverdue(row, todayIso) {
  if (!row?.due_date) return false;
  if (!OPEN_STATUSES.includes(row.status)) return false;
  return String(row.due_date) < String(todayIso);
}

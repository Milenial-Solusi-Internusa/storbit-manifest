# UI/UX FLOW & DESIGN SYSTEM — Nexus by MSI

> Design system & pola UI. Sumber: `CLAUDE.md` (Brand System), `docs/02_RULES_GOVERNANCE.md §5`, phase notes. Brand = MSI Brand Guideline v1.0.

---

## 1. Brand Tokens

| Token | Hex | Konteks |
|-------|-----|---------|
| MSI Navy | `#144682` | Sidebar, header chart/card, dominan (30% dari 60/30/10), card head, footer PDF |
| Navy Dark | `#0f3366` | Hover navy, gradient end |
| Navy Light | `#1a5299` | Border cell navy (PDF), varian |
| MSI Orange | `#E85A1E` | Accent, CTA, active item, highlight (10%) |
| Orange Dark | `#c44d18` | Hover orange |
| Coral | `#F08C7D` | Header tabel item quotation (teks navy di atasnya), badge SOA, accent |
| White | `#ffffff` | Background utama app shell (sejak fase 2.10F; sebelumnya cream/gradient) |
| Cream | `#F6EFE3` | Legacy surface (deprecated untuk shell; masih dipakai sbg token `C.bg` di beberapa modul CRM warm-beige) |
| Light Gray | `#F7F7F8` | Card/secondary bg (sebagian) |
| accentSoft | `#FEF2EC` | Icon container, hover highlight |
| Status WON | `#1F8B4D` | Hijau-status (BUKAN dark green terlarang) |
| Status LOST | `#C0392B` | Merah |

**Sidebar:** `linear-gradient(165deg, #144682 0%, #0f3366 100%)`. Active item: bg `rgba(255,255,255,0.13)`, left-border `rgba(255,212,184,0.7)`, icon `#FFB899`. Primary button: `#E85A1E` → hover `#c44d18`.

**Font:**
| Font | Pakai |
|------|-------|
| **Montserrat** | Heading, judul, nama, label penting |
| **Inter** | Body / UI default |
| **IBM Plex Mono** | Angka, nomor dokumen, SKU, code, jam, tanggal mono |
| JetBrains Mono | `.font-mono` utility (sebagian) |

**Ikon:** **Lucide React only**. Tidak ada inline-SVG ad-hoc untuk ikon yang tersedia di Lucide. PDF: ikon di-skip / pakai bentuk View (react-pdf tak render Lucide).

---

## 2. Layout Patterns

- **AppShell** (`App.jsx`): `<div className="flex flex-col lg:flex-row min-h-screen">` → mobile stack, desktop row. Sidebar (`hidden lg:flex` static sticky) + `<main className="nexus-shell-bg flex-1 min-w-0 overflow-x-hidden">`.
- **`.nexus-shell-bg`** — background `<main>` (kini `#ffffff` global sejak 2.10F).
- **`.nexus-main-surface`** — div pembungkus konten modul, padding `px-5 sm:px-7 xl:px-9 py-6 lg:py-7`; di-`display:none` saat di App Launcher.
- **`ModuleSidebar`** — vertical nav per modul (Option B: sidebar-after-launcher). Desktop static; mobile = **drawer** (`asDrawer`/`isOpen`/`onClose`, slide-in dari kiri, overlay) dibuka via hamburger di topbar.
- **App Launcher** — bento module grid (full-width saat `!activeModule`); card per grup, permission-gated, restricted modal.
- **`.nx-page-pad`** — padding horizontal halaman (mengecil di <640).
- **`.nx-stack`** — flex 2-kolom (mis. form 60% / summary sticky 40%); di `<1024px` collapse jadi column + full-width + unsticky (`index.css`).
- **`.nx-grid-kpi` / `.nx-grid-3` / `.nx-grid-2`** — grid responsive opt-in: override `grid-template-columns` HANYA via `@media (max-width:1023px)` (desktop pixel-identik).
- **Breakpoint:** `lg = 1024px` (Tailwind). Mobile = `< 1024px`.

---

## 3. Komponen Standar

- **Form:** field via primitives per modul (`Field`/`FieldLabel`/`FieldInput`/`FieldSelect`); validasi client-side; state lokal `useState`; reset modal via `key` prop (remount), bukan effect. Tokens inline (`C`/`D`/`S`).
- **Tabel/list:** header row + body row; zebra opsional; `overflowX:auto` wrapper untuk tabel lebar; mobile min-width class via `@media`. Pagination client-side `PAGE_SIZE` (≤500 row) atau server-side `.range()`.
- **Modal:** centered overlay `position:fixed inset:0` + backdrop blur; `AdminFormModal` (admin), `ConfirmModal` (`src/components/ConfirmModal.jsx` — reusable, variant danger/warning/info, Escape close) menggantikan semua `window.confirm`.
- **Toast:** `showToast?.(message, type)` — `type` = `'success'`(default)/`'error'`; auto-dismiss ~3s; posisi bottom-right. Shell-level toast di-pass via prop agar survive navigasi state-swap.
- **Dropdown/popover:** state `openMenu` tunggal (satu popover sekaligus) + overlay `fixed inset-0` (click-outside, tanpa document listener) + menu `absolute zIndex 150` dalam wrapper `position:relative`. Lihat pola PipelineKanban toolbar.
- **Card:** `background:#fff`, `border:1px solid <line>`, `borderRadius:12-14`, shadow halus; `cardHead` bg navy + ikon putih.
- **Badge:** pill `borderRadius:99`, bg-soft + fg per status; per modul punya map (STAGE_BADGE, TYPE_META, dll).
- **Detail page pattern:** breadcrumb + header card (avatar/initials) + tab bar underline (orange aktif) + state-swap (bukan route) untuk list↔detail (mirror AssetDetailPage).

---

## 4. Larangan UI

- ❌ **No dark green.** Deprecated: `#1a3a2a`, `#2d5a3d`, `#0F2A23`, `#173D34`, `#2F6B3F`, `#E7EFE2`. (Teal/hijau-status tertentu mis. `#1F8B4D` WON, `#0F766E` Head, `#166534` Manager-level OK.)
- ❌ **No emoji** di UI (✓/× untuk close diganti Lucide `Check`/`X`).
- ❌ **No `Plus Jakarta Sans`** (diganti Inter + Montserrat).
- ❌ Jangan redesign UI kecuali task memintanya. Jangan ubah komponen tak terkait.
- ❌ Jangan tambah npm package tanpa approval.
- ⚠️ Inline-style untuk warna brand boleh (banyak modul pakai token `C`/`D`/`S` inline); konsistenkan ke palet — jangan warna acak di luar palet.
- Wrap section page besar di `ErrorBoundary`; list view baru pakai pagination; search baru di-debounce (min 300ms).

---

## 5. Pola PDF (Quotation)

Library: **`@react-pdf/renderer`** (vektor/text, pagination otomatis; menggantikan html2canvas+jsPDF raster sejak 2.10A). Komponen: `src/modules/crm/QuotationPDF.jsx`.

- **Font:** Helvetica built-in (Montserrat upgrade pending — tak register font tambahan).
- **9 section (top→bottom):** [1] Header band (logo h=36 + nama + tagline | "QUOTATION" + no/Rev/tanggal/valid) — **tidak fixed** (halaman 1 saja); [2] Customer Details table (label navy + value `#f9f9f7` + APPROVED BY/APPROVAL DATE blank); [3] Item tables per section (`<View wrap={false}>` bungkus [section-name + col-header]; tiap body row `wrap={false}`, zebra `#fff`/`#fafaf8`, USD text `#a45a22`, section-total `#f5f5f0`; kolom **35/8/14/14/8/21%**; **TANPA cost_price/margin**); [4] Grand summary (Subtotal/Diskon[if pct>0]/PPN dynamic/GRAND TOTAL navy borderTop); [5] Notes box (border-left navy, bg `#F8FAFC`); [6] Terms box (border-left orange, bg `#FBF8F2`, "Above rates :"); [7] Signatures 2-kolom (Best Regards+creator | Approved by+customer, **center**); [8] Divider 8% orange + 92% navy; [9] **Footer band navy `fixed`** (muncul tiap halaman) — text-only "PT Milenial Solusi Internusa" putih + 2 alamat + jam `#FFB899`.
- **`fixed` footer + `wrap={false}` no-break** untuk baris yang tak boleh kepotong. `Page` `paddingBottom: 96` ≥ tinggi footer → konten tak overlap.
- **PPN label dynamic:** `'PPN ' + (vat_rate*100).toFixed(vat_rate===0.011?1:0).replace('.',',') + '%'` ("PPN 1,1%"/"PPN 11%"); baris VAT disembunyikan kalau `vat_rate===0`.
- **JANGAN render data internal:** `cost_price`, `margin`, `internal_notes` tak pernah ke PDF (customer-facing).
- Generate: `pdf(<QuotationPDF .../>).toBlob()` → objectURL `<a download>` `${quotation_no}_rev${revision??1}.pdf`.

---

## 6. Responsive Guidelines

- **Breakpoint utama:** `lg = 1024px`. Desktop ≥1024, mobile <1024.
- **Pendekatan opt-in (desktop pixel-identik):** util class override hanya via `@media (max-width:1023px)` + `!important` — desktop tak punya `@media` match → inline style menang. Contoh: `.nx-grid-kpi`, `.nx-grid-3`, `.nx-grid-2`, `.nx-stack`, `.nx-page-pad`.
- **Mobile scroll pattern:** tabel lebar → wrapper `overflowX:auto` + `min-width` via `@media` (mis. `.q-list-table{min-width:920px}`, `.q-item-table{min-width:800px}`). Dropdown sempit → `appearance:none` di mobile untuk reclaim ruang panah.
- **Nav mobile:** hamburger (Lucide `Menu`) → drawer `ModuleSidebar asDrawer`; App Launcher full-width.
- **Kalender CRM (mobile):** pola "dot + tap detail" (event jadi dot pastel, tap tanggal → bottom-sheet), bukan scroll horizontal.
- **Shell mobile:** `flex-col lg:flex-row` cegah topbar menutupi konten.
- ⚠️ Halaman selain CRM Dashboard belum semua dicek di <1024px (TECH_DEBT TD-28).

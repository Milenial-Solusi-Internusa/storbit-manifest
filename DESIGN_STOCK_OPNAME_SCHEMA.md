# DESIGN — Skema DB Modul Stock Opname (Full Count & Cycle Count) — DRAFT v2 (8 keputusan terintegrasi)

> **Draft SQL untuk direview — BUKAN eksekusi.** Tidak ada kode/DB yang diubah. Konsep sudah dikunci Den; 8 titik yang di rev.1 ditandai butuh keputusan sudah dijawab dan diintegrasikan ke SQL di bawah — lihat §"KEPUTUSAN DEN" untuk rekap tiap keputusan + konsekuensinya di SQL.
> Basis: `supabase/schema_snapshot.sql` (struktur SEKARANG) + 3 sesi investigasi sebelumnya (fondasi data stok, jejak git fitur opname setengah-jadi, verifikasi `is_manager_or_above()`/blast-radius `rack_location`/`stock_ledger.created_at`) + pola `DESIGN_SP_SCHEMA.md`.
> Prinsip AGENTS.md dipatuhi: multi-company, FK & constraint eksplisit, RLS company-scoped, additive (tak ada DROP/ALTER destruktif ke apa pun yang sudah ada).
> ⚠️ Semua blok SQL **wajib diverifikasi ulang saat eksekusi** (branch + staging) — dokumen ini belum pernah dijalankan sama sekali.

---

## ✅ KEPUTUSAN DEN (rev.1 → rev.2 — semua 8 titik dijawab)

8 titik yang di rev.1 ditandai "perlu dikonfirmasi" sudah diputuskan. Rekap tiap keputusan + di mana konsekuensinya masuk ke SQL:

1. **`finalize_stock_count_session` (RPC ke-5) — DISETUJUI, tetap seperti draft rev.1.** Tidak ada perubahan SQL, §4.5 tak disentuh.
2. **`company_id` di `stock_count_variance_reports` — DISETUJUI.** Tidak ada perubahan SQL (selain penambahan `rejected_snapshot`, lihat #7).
3. **Nol `deleted_at` di `stock_count_variance_reports` — DISETUJUI**, memang disengaja (dokumen resmi, mirip `sp_btb`). Tidak ada perubahan SQL.
4. **Sumber sasaran Full Count = `stock_ledger`** (BUKAN `product_warehouse_location`) — DIKUNCI, alasan eksplisit Den: produk yang punya histori stok tapi BELUM di-*assign* rack location justru yang paling perlu ikut Full Count. §4.1 diperjelas: filter ditambah `AND sl.company_id = v_company_id` eksplisit (sebelumnya cuma implisit lewat `warehouse_id`, yang secara FK sudah company-specific — hasilnya identik, kini cuma lebih eksplisit sesuai kalimat "per company+warehouse").
5. **`stock_count_sessions.status` KENA proteksi kolom-spesifik**, sama persis pola `stock_count_variance_reports.status` — §3.2 ditulis ulang penuh.
6. **`last_count_date` di-update untuk SEMUA item ber-`counted_qty`, dipisah dari baris adjustment (yang tetap hanya variance≠0)** — §4.3 ditulis ulang. **⚠️ Lihat catatan ketegangan teknis di bawah** — bukan penghalang, tapi perlu 1 konfirmasi cepat.
7. **`reject_variance_report` reset sesi ke `'in_progress'` + `rejected_snapshot` (jsonb) permanen sebelum reset** — kolom baru di §1.4, logic ditulis ulang di §4.4.
8. **Parameter `jsonb` untuk `start_stock_count_session` — DISETUJUI.** Tidak ada perubahan SQL.

**⚠️ Satu ketegangan teknis baru, ketemu saat mengimplementasikan Keputusan #6 — perlu konfirmasi cepat, TIDAK menghalangi progres:** instruksi menyatakan "Baris `stock_ledger` (`movement_type='adjustment'`) TETAP hanya untuk item yang variance≠0" **dan** "`last_count_date` WAJIB di-update untuk SEMUA item yang `counted_qty` sudah diisi" sekaligus. Tapi `last_count_date` **cuma hidup di kolom `stock_ledger`** (dikonfirmasi ulang — nol kolom serupa di `products`/`product_warehouse_location`), jadi satu-satunya cara mengubahnya untuk item variance=0 tetap lewat baris `stock_ledger` baru — hanya dengan `qty=0` (tak mengubah `on_hand` sama sekali, murni menumpang kolom `last_count_date`). Diimplementasikan di §4.3 sebagai **dua `INSERT` terpisah** (persis instruksi "dua hal dipisah, jangan digabung jadi satu syarat"): satu untuk koreksi asli (`variance≠0`, qty sungguhan, `reference_type='stock_count'`), satu lagi qty=0 (`variance=0`, `reference_type='stock_count_verified'` — beda, supaya gampang dibedakan dari koreksi sungguhan saat membaca ledger nanti). Kalau maksud sebenarnya "jangan sentuh `stock_ledger` SAMA SEKALI untuk item variance=0" — itu berarti `last_count_date` item yang cocok **tak bisa** diupdate sama sekali dengan skema yang ada sekarang (butuh kolom baru di tabel lain, di luar scope additive draft ini). Interpretasi qty=0 di atas saya jalankan karena itu satu-satunya cara mencapai KEDUA instruksi sekaligus tanpa ubah skema — tapi ini keputusan pengisi-celah dari saya, bukan sesuatu yang eksplisit dikonfirmasi, jadi ditandai di sini alih-alih ditelan diam-diam.

---

## 1. TABEL BARU

### 1.1 `warehouse_locations` — master lokasi fisik gudang
```sql
CREATE TABLE public.warehouse_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  warehouse_id  uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  floor         text,
  rack          text,
  code          text NOT NULL,                 -- gabungan tampilan, mis. "A3-L2"
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT warehouse_locations_code_unique UNIQUE (warehouse_id, code)  -- [USULAN, tak eksplisit diminta] cegah 2 lokasi kode sama dalam 1 gudang
);
```
Pola kolom (`created_by/created_at/updated_at/deleted_at`, tipe `uuid`/`timestamptz`) persis meniru `dc_master` **[IMPLEMENTED]** — tabel paling baru yang benar-benar live di schema sekarang, bukan diketik dari ingatan pola lama.

### 1.2 `stock_count_sessions` — payung satu sesi opname
```sql
CREATE TABLE public.stock_count_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  warehouse_id  uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  session_no    text NOT NULL,                 -- via increment_document_sequence, lihat §5
  session_type  text NOT NULL CHECK (session_type IN ('full','cycle')),
  status        text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','in_progress','review','closed')),
  freeze_at     timestamptz,                    -- WAJIB utk 'full' (lihat CHECK di bawah); NULL sah utk 'cycle'
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT stock_count_sessions_no_unique UNIQUE (company_id, session_no),      -- [USULAN]
  CONSTRAINT stock_count_sessions_freeze_full_check
    CHECK (session_type <> 'full' OR freeze_at IS NOT NULL)                       -- tegakkan aturan "WAJIB utk full" di DB, bukan cuma di RPC
);
```
`freeze_at` mengunci prinsip freeze non-destruktif dari brief: **satu timestamp**, bukan mematikan sistem — `system_qty` tiap item full-count dihitung `SUM` `stock_ledger` sampai timestamp ini (§1.3, §4.2).

### 1.3 `stock_count_items` — baris per produk dalam satu sesi
```sql
CREATE TABLE public.stock_count_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             uuid NOT NULL REFERENCES public.stock_count_sessions(id) ON DELETE CASCADE,
  product_id             uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  location_id            uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,  -- NULL = full count level produk saja
  system_qty_snapshot_at timestamptz,            -- diisi RPC submit_count_item, bukan saat baris dibuat (lihat §4.3)
  system_qty             integer,                -- SUM stock_ledger WHERE created_at <= snapshot_at, pola persis stock_summary.on_hand
  counted_qty            integer CHECK (counted_qty IS NULL OR counted_qty >= 0),
  variance               integer GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  notes                  text,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
  -- TANPA deleted_at — sesuai daftar kolom brief (item hitung bukan entitas yang di-soft-delete sendiri; ikut siklus sesinya)
);

-- ⚠️ GOTCHA UNIQUE + NULL: UNIQUE(session_id, product_id, location_id) TIDAK akan mencegah duplikat
-- saat location_id NULL (Postgres menganggap tiap NULL berbeda dari NULL lain di constraint unik biasa).
-- Full count (location_id selalu NULL) perlu index parsial terpisah:
CREATE UNIQUE INDEX stock_count_items_unique_with_location
  ON public.stock_count_items (session_id, product_id, location_id) WHERE location_id IS NOT NULL;
CREATE UNIQUE INDEX stock_count_items_unique_no_location
  ON public.stock_count_items (session_id, product_id) WHERE location_id IS NULL;
```
**Catatan penting soal `location_id` dan `system_qty`:** `stock_ledger` **tidak** punya kolom `location_id`/bin apa pun (dikonfirmasi sesi investigasi sebelumnya) — cuma `warehouse_id`. Jadi untuk item cycle-count yang punya `location_id` terisi, `system_qty` yang dihitung **tetap level gudang** (tak ada cara tahu berapa unit yang SEHARUSNYA ada persis di lokasi itu) — hanya `counted_qty` yang benar-benar granular per-lokasi. `variance` di baris ber-`location_id` karena itu membandingkan hasil hitung SATU lokasi terhadap sistem SATU GUDANG, bukan apple-to-apple murni. Ini bukan bug desain — ini keterbatasan struktural yang sudah ada (`stock_ledger` tanpa granularity lokasi), diwariskan apa adanya, bukan sesuatu yang draft ini perbaiki.

### 1.4 `stock_count_variance_reports` — Berita Acara Selisih Stock
```sql
CREATE TABLE public.stock_count_variance_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,  -- DISETUJUI (Keputusan #2)
  session_id         uuid NOT NULL REFERENCES public.stock_count_sessions(id) ON DELETE RESTRICT,
  report_no          text NOT NULL,                 -- via increment_document_sequence, lihat §5
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','pending_approval','approved','rejected')),
  summary_notes      text,
  approved_by        uuid REFERENCES auth.users(id),
  approved_at        timestamptz,
  rejection_note     text,
  rejected_snapshot  jsonb,                          -- [BARU, Keputusan #7] array item {product_id,location_id,system_qty,counted_qty,variance,notes} PERSIS saat ditolak — diisi reject_variance_report SEBELUM stock_count_items direset; permanen, tak pernah ditimpa/dihapus
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_count_variance_reports_no_unique UNIQUE (company_id, report_no),         -- [USULAN]
  CONSTRAINT stock_count_variance_reports_rejection_check
    CHECK (status <> 'rejected' OR rejection_note IS NOT NULL)                              -- ditolak wajib punya alasan
);
```

---

## 2. PERUBAHAN TABEL EXISTING (additive saja)

```sql
-- products.reorder_point — kolom BARU terpisah dari min_order_qty (TEXT, dipertahankan apa adanya, TAK disentuh).
ALTER TABLE public.products
  ADD COLUMN reorder_point numeric;   -- nullable, tanpa DEFAULT — sama persis pola min_order_qty (nullable, tanpa default)

-- product_warehouse_location.location_id — berdampingan dengan rack_location (text) yang sudah ada.
ALTER TABLE public.product_warehouse_location
  ADD COLUMN location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL;
```
**Keamanan additive sudah terverifikasi sesi lalu** (bukan diulang tebak): blast radius `rack_location` cuma 3 titik — `src/lib/db.js` (`getProductRackLocations`/`upsertProductRackLocation`, keduanya sebut kolom eksplisit, bukan `SELECT *`), `StokBarangPage.jsx` (satu-satunya pemanggil), dan RPC `generate_picking_from_sp` (baca `pwl.rack_location` eksplisit). Kolom `location_id` baru — nullable, tak disebut di manapun ketiga titik itu — nol risiko regresi sampai memang mulai dipakai.

---

## 3. RLS + GRANT

Prinsip diikuti **PERSIS** bentuk 4-policy `dc_master` **[IMPLEMENTED]**, dikutip verbatim dari `schema_snapshot.sql` (bukan pola lama yang mungkin sudah berubah):
```sql
-- schema_snapshot.sql:13924 — dc_master_read (tanpa role gate)
-- schema_snapshot.sql:13917/:13931 — dc_master_insert/update: company + (is_manager_or_above() OR has_role('operations'))
-- schema_snapshot.sql:13910 — dc_master_delete: is_super_admin() saja
```

### 3.1 `warehouse_locations`
```sql
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_locations_read ON public.warehouse_locations FOR SELECT
  USING (public.is_super_admin() OR company_id = public.get_user_company_id());

CREATE POLICY warehouse_locations_insert ON public.warehouse_locations FOR INSERT
  WITH CHECK (public.is_super_admin() OR (company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'))));

CREATE POLICY warehouse_locations_update ON public.warehouse_locations FOR UPDATE
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id()
         AND (public.is_manager_or_above() OR public.has_role('operations'))));

CREATE POLICY warehouse_locations_delete ON public.warehouse_locations FOR DELETE
  USING (public.is_super_admin());

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.warehouse_locations TO anon;
GRANT ALL ON TABLE public.warehouse_locations TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.warehouse_locations TO service_role;
```

### 3.2 `stock_count_sessions`

**[Keputusan #5]** Sama seperti `stock_count_variance_reports` (§3.4) — kolom `status` diproteksi lewat GRANT (bukan cuma RLS), supaya role `operations` tak bisa `UPDATE status='closed'` langsung, harus lewat `finalize_stock_count_session`/`approve_variance_report`/`reject_variance_report`.
```sql
ALTER TABLE public.stock_count_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_count_sessions_read ON public.stock_count_sessions FOR SELECT
  USING (public.is_super_admin() OR company_id = public.get_user_company_id());

CREATE POLICY stock_count_sessions_insert ON public.stock_count_sessions FOR INSERT
  WITH CHECK (public.is_super_admin() OR (company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'))));

CREATE POLICY stock_count_sessions_update ON public.stock_count_sessions FOR UPDATE
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id()
         AND (public.is_manager_or_above() OR public.has_role('operations'))));
  -- ⚠️ RLS row-level ini SENGAJA masih mengizinkan operations UPDATE baris ini (kolom non-status apa pun) —
  -- yang mencegah UPDATE langsung ke `status` BUKAN RLS ini, tapi GRANT di bawah (persis mekanisme §3.4:
  -- PostgREST menolak duluan sebelum RLS sempat dievaluasi, kolom itu tak pernah di-GRANT UPDATE sama sekali).

CREATE POLICY stock_count_sessions_delete ON public.stock_count_sessions FOR DELETE
  USING (public.is_super_admin());

-- Baseline grant TANPA UPDATE polos (persis pola sp_orders / §3.4 — nol REVOKE eksplisit, granularity
-- datang dari GRANT tabel yang memang tak menyertakan UPDATE polos):
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_sessions TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_sessions TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_sessions TO service_role;

-- UPDATE per-kolom — SEMUA kolom KECUALI status:
GRANT UPDATE(id)            ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(company_id)    ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(warehouse_id)  ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(session_no)    ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(session_type)  ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(freeze_at)     ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(created_by)    ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(created_at)    ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(updated_at)    ON TABLE public.stock_count_sessions TO authenticated;
GRANT UPDATE(deleted_at)    ON TABLE public.stock_count_sessions TO authenticated;
-- TIDAK ADA: GRANT UPDATE(status)
-- → status HANYA bisa berubah lewat submit_count_item (draft→in_progress), finalize_stock_count_session
--   (→review atau →closed), approve_variance_report (→closed), reject_variance_report (→in_progress) —
--   semua SECURITY DEFINER, jalan sebagai owner fungsi (postgres), tak terikat batas GRANT authenticated ini.
```

### 3.3 `stock_count_items`
```sql
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;

-- stock_count_items tak punya company_id sendiri — company-scoping via JOIN ke sesi induknya
-- (beda dari 3 tabel lain; tabel ini murni baris-anak, tak ada alasan menambah company_id
-- redundan di sini karena selalu diakses lewat session_id, tak pernah query lepas).
CREATE POLICY stock_count_items_read ON public.stock_count_items FOR SELECT
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.stock_count_sessions s
    WHERE s.id = stock_count_items.session_id AND s.company_id = public.get_user_company_id()
  ));

CREATE POLICY stock_count_items_insert ON public.stock_count_items FOR INSERT
  WITH CHECK (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.stock_count_sessions s
    WHERE s.id = stock_count_items.session_id AND s.company_id = public.get_user_company_id()
      AND (public.is_manager_or_above() OR public.has_role('operations'))
  ));

CREATE POLICY stock_count_items_update ON public.stock_count_items FOR UPDATE
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.stock_count_sessions s
    WHERE s.id = stock_count_items.session_id AND s.company_id = public.get_user_company_id()
      AND (public.is_manager_or_above() OR public.has_role('operations'))
  ));

CREATE POLICY stock_count_items_delete ON public.stock_count_items FOR DELETE
  USING (public.is_super_admin());

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_items TO anon;
GRANT ALL ON TABLE public.stock_count_items TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_items TO service_role;
```
⚠️ **Penyimpangan kecil dari "ikuti persis bentuk `dc_master`"**: `dc_master` punya `company_id` sendiri jadi policy-nya kolom langsung; `stock_count_items` tak punya (bukan pilihan saya — brief tak mencantumkannya di daftar kolom tabel ini), jadi bentuknya pakai `EXISTS` ke sesi induk. Logika perizinannya (siapa boleh apa) tetap identik, cuma bentuk SQL-nya beda karena strukturnya beda. Tandai kalau `company_id` redundan sebaiknya ditambahkan juga ke tabel ini demi performa (index company_id lebih murah dari EXISTS-join tiap row-check) — masuk akal kalau tabel ini nanti jadi besar.

### 3.4 `stock_count_variance_reports` — dengan pengecualian segregation-of-duty

RLS-nya **sama bentuknya** seperti 3 tabel di atas (RLS cuma menjaga akses ROW, bukan kolom) — proteksi kolom `status`/`approved_by`/`approved_at`/`rejection_note`/`rejected_snapshot` (kolom baru, Keputusan #7) terjadi di lapisan **GRANT**, persis pola yang sudah dipasang live di `sp_orders`/`sp_invoices` sesi ini (dikutip ulang persis dari `schema_snapshot.sql`, bukan diketik dari ingatan):
```sql
-- Pola nyata sp_orders (schema_snapshot.sql:17676 dst): GRANT tabel TANPA UPDATE polos,
-- lalu GRANT UPDATE(kolom) SATU-SATU per kolom yang boleh — kolom 'status' sengaja
-- TAK PERNAH muncul di daftar itu (24 dari 25 kolom ber-GRANT; status = 1 yang hilang, sengaja).
-- Tak ada REVOKE eksplisit — granularity datang dari GRANT tabel yang memang tak menyertakan UPDATE polos.
```

```sql
ALTER TABLE public.stock_count_variance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_count_variance_reports_read ON public.stock_count_variance_reports FOR SELECT
  USING (public.is_super_admin() OR company_id = public.get_user_company_id());

CREATE POLICY stock_count_variance_reports_insert ON public.stock_count_variance_reports FOR INSERT
  WITH CHECK (public.is_super_admin() OR (company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'))));

CREATE POLICY stock_count_variance_reports_update ON public.stock_count_variance_reports FOR UPDATE
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id()
         AND (public.is_manager_or_above() OR public.has_role('operations'))));
  -- ⚠️ RLS row-level ini SENGAJA masih mengizinkan operations UPDATE baris ini (mis. ubah summary_notes).
  -- Yang mencegah operations mengubah status/approved_by/approved_at/rejection_note BUKAN RLS ini,
  -- tapi GRANT di bawah — kolom itu tak pernah di-GRANT UPDATE ke `authenticated` sama sekali,
  -- jadi PostgREST menolaknya duluan sebelum RLS sempat dievaluasi, siapa pun rolenya.

CREATE POLICY stock_count_variance_reports_delete ON public.stock_count_variance_reports FOR DELETE
  USING (public.is_super_admin());

-- Baseline grant TANPA UPDATE polos (persis pola sp_orders) —
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_variance_reports TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_count_variance_reports TO service_role;

-- UPDATE per-kolom — SEMUA kolom KECUALI status/approved_by/approved_at/rejection_note/rejected_snapshot:
GRANT UPDATE(id)             ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT UPDATE(company_id)     ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT UPDATE(session_id)     ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT UPDATE(report_no)      ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT UPDATE(summary_notes)  ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT UPDATE(created_by)     ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT UPDATE(created_at)     ON TABLE public.stock_count_variance_reports TO authenticated;
GRANT UPDATE(updated_at)     ON TABLE public.stock_count_variance_reports TO authenticated;
-- TIDAK ADA: GRANT UPDATE(status) / GRANT UPDATE(approved_by) / GRANT UPDATE(approved_at) / GRANT UPDATE(rejection_note)
--            / GRANT UPDATE(rejected_snapshot)
-- → 5 kolom ini HANYA bisa berubah lewat approve_variance_report/reject_variance_report (SECURITY DEFINER, §4.3-4.4),
--   yang jalan sebagai owner fungsi (postgres), bukan role `authenticated` — GRANT-level block di atas tak berlaku
--   utk pemanggilan internal RPC, cuma utk UPDATE langsung lewat PostgREST/klien.
```

---

## 4. RPC DRAFT (SECURITY DEFINER, pola `create_invoice`/`dispatch_delivery`/`submit_invoice`)

Semua pakai `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'` — dikonfirmasi ulang ini pola persis yang dipakai RPC live (`create_invoice`, `dispatch_delivery`, `submit_invoice`), bukan diasumsikan.

### 4.1 `start_stock_count_session`
```sql
CREATE OR REPLACE FUNCTION public.start_stock_count_session(
  p_warehouse_id  uuid,
  p_session_type  text,
  p_freeze_at     timestamptz DEFAULT NULL,
  p_items         jsonb       DEFAULT NULL   -- array [{"product_id":"...","location_id":"..."}] — lihat Keputusan #8
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_company_id  uuid;
  v_entity_code text;
  v_year        int := extract(year from now())::int;
  v_seq         int;
  v_session_no  text;
  v_session_id  uuid;
  v_uid         uuid := auth.uid();
BEGIN
  SELECT company_id INTO v_company_id FROM warehouses WHERE id = p_warehouse_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Gudang tidak ditemukan.'; END IF;

  IF NOT (is_super_admin() OR (v_company_id = get_user_company_id()
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak punya izin memulai sesi stock opname untuk gudang ini.';
  END IF;

  IF p_session_type NOT IN ('full','cycle') THEN
    RAISE EXCEPTION 'session_type harus ''full'' atau ''cycle''.';
  END IF;
  IF p_session_type = 'full' AND p_freeze_at IS NULL THEN
    RAISE EXCEPTION 'freeze_at wajib diisi untuk Full Count.';
  END IF;
  IF p_session_type = 'cycle' AND (p_items IS NULL OR jsonb_array_length(p_items) = 0) THEN
    RAISE EXCEPTION 'Cycle Count wajib menentukan sasaran SKU/lokasi (p_items) — "Proses Penentuan Sasaran".';
  END IF;

  SELECT code INTO v_entity_code FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'SOP', 'WH', v_year, 0, 0);   -- lihat §5
  v_session_no := 'SOP/' || v_entity_code || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');

  INSERT INTO stock_count_sessions (company_id, warehouse_id, session_no, session_type, status, freeze_at, created_by)
  VALUES (v_company_id, p_warehouse_id, v_session_no, p_session_type, 'draft', p_freeze_at, v_uid)
  RETURNING id INTO v_session_id;

  IF p_session_type = 'full' THEN
    -- [Keputusan #4] sasaran = semua produk yang PERNAH bergerak di gudang ini, dari stock_ledger (BUKAN
    -- product_warehouse_location) — alasan Den: produk yang punya histori stok tapi belum di-assign rack
    -- location justru paling perlu ikut Full Count. company_id ditambah eksplisit (sebelumnya cuma implisit
    -- lewat warehouse_id, yang secara FK sudah company-specific — hasil identik, kini lebih eksplisit).
    INSERT INTO stock_count_items (session_id, product_id, location_id, created_by)
    SELECT DISTINCT v_session_id, sl.product_id, NULL::uuid, v_uid
    FROM stock_ledger sl
    WHERE sl.warehouse_id = p_warehouse_id
      AND sl.company_id = v_company_id;
  ELSE
    INSERT INTO stock_count_items (session_id, product_id, location_id, created_by)
    SELECT v_session_id,
           (elem->>'product_id')::uuid,
           NULLIF(elem->>'location_id', '')::uuid,
           v_uid
    FROM jsonb_array_elements(p_items) AS elem;
  END IF;

  RETURN v_session_id;
END;
$$;
```

### 4.2 `submit_count_item`
```sql
CREATE OR REPLACE FUNCTION public.submit_count_item(
  p_item_id     uuid,
  p_counted_qty integer,
  p_notes       text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_session_id     uuid;
  v_product_id     uuid;
  v_warehouse_id   uuid;
  v_company_id     uuid;
  v_session_type   text;
  v_freeze_at      timestamptz;
  v_session_status text;
  v_snapshot_at    timestamptz;
  v_system_qty     integer;
BEGIN
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RAISE EXCEPTION 'counted_qty wajib diisi dan >= 0.';
  END IF;

  SELECT i.session_id, i.product_id, s.warehouse_id, s.company_id, s.session_type, s.freeze_at, s.status
    INTO v_session_id, v_product_id, v_warehouse_id, v_company_id, v_session_type, v_freeze_at, v_session_status
    FROM stock_count_items i
    JOIN stock_count_sessions s ON s.id = i.session_id
   WHERE i.id = p_item_id;
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'Item hitung tidak ditemukan.'; END IF;

  IF NOT (is_super_admin() OR (v_company_id = get_user_company_id()
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak punya izin mengisi hasil hitung untuk sesi ini.';
  END IF;

  IF v_session_status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'Sesi berstatus % — item cuma bisa diisi saat draft/in_progress.', v_session_status;
  END IF;

  -- Mekanisme freeze (prinsip, bukan literal stop sistem): full = pakai freeze_at SESI (sama utk semua item);
  -- cycle = snapshot SEKARANG, per item, sesuai kapan fisiknya benar-benar dihitung.
  v_snapshot_at := CASE WHEN v_session_type = 'full' THEN v_freeze_at ELSE now() END;

  -- Pola persis stock_summary.on_hand (schema_snapshot.sql:6634) — BUKAN .available (reserved masih fisik ada di rak).
  SELECT COALESCE(SUM(qty) FILTER (
           WHERE movement_type IN ('inbound','outbound','adjustment','transfer_in','transfer_out')
         ), 0)
    INTO v_system_qty
    FROM stock_ledger
   WHERE product_id = v_product_id
     AND warehouse_id = v_warehouse_id
     AND created_at <= v_snapshot_at;    -- aman dipercaya: 7 jalur tulis stock_ledger terverifikasi tak pernah override created_at

  UPDATE stock_count_items
     SET system_qty_snapshot_at = v_snapshot_at,
         system_qty  = v_system_qty,
         counted_qty = p_counted_qty,
         notes       = COALESCE(p_notes, notes),
         updated_at  = now()
   WHERE id = p_item_id;

  UPDATE stock_count_sessions SET status = 'in_progress', updated_at = now()
   WHERE id = v_session_id AND status = 'draft';
END;
$$;
```

### 4.3 `approve_variance_report`
```sql
CREATE OR REPLACE FUNCTION public.approve_variance_report(p_report_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_session_id   uuid;
  v_company_id   uuid;
  v_warehouse_id uuid;
  v_report_no    text;
  v_status       text;
  v_uid          uuid := auth.uid();
BEGIN
  SELECT r.session_id, r.company_id, r.status, r.report_no, s.warehouse_id
    INTO v_session_id, v_company_id, v_status, v_report_no, v_warehouse_id
    FROM stock_count_variance_reports r
    JOIN stock_count_sessions s ON s.id = r.session_id
   WHERE r.id = p_report_id;
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'Berita Acara tidak ditemukan.'; END IF;

  -- SENGAJA TANPA has_role('operations') — segregation of duty eksplisit dari Den:
  -- "approval WAJIB atasan, bukan orang yang sama yang bikin laporannya".
  IF NOT (is_super_admin() OR (v_company_id = get_user_company_id() AND is_manager_or_above())) THEN
    RAISE EXCEPTION 'Tidak punya izin menyetujui Berita Acara ini — wajib manager ke atas.';
  END IF;

  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Berita Acara berstatus % — hanya "pending_approval" yang bisa disetujui.', v_status;
  END IF;

  -- [Keputusan #6] DUA insert TERPISAH — sengaja tidak digabung jadi satu syarat. last_count_date =
  -- system_qty_snapshot_at ITEM (waktu hitung fisik sesungguhnya) di KEDUANYA, BUKAN now() (waktu approve,
  -- bisa beda hari dari saat fisiknya dihitung).

  -- (a) Koreksi stok SUNGGUHAN — HANYA item variance≠0, qty = variance asli (bisa +/-).
  --     reference_type='stock_count' menandai baris koreksi nyata.
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no,
     created_by, last_count_date)
  SELECT v_company_id, v_warehouse_id, i.product_id, 'adjustment', i.variance,
         'stock_count', p_report_id, v_report_no, v_uid, i.system_qty_snapshot_at::date
  FROM stock_count_items i
  WHERE i.session_id = v_session_id
    AND i.variance IS NOT NULL
    AND i.variance <> 0;

  -- (b) "Sudah dicek fisik" — SEMUA item variance=0 (cocok). qty=0 (TAK mengubah on_hand sama sekali,
  --     murni menumpang kolom last_count_date, satu-satunya tempat kolom itu hidup di skema ini).
  --     reference_type BEDA ('stock_count_verified') supaya gampang dibedakan dari koreksi sungguhan (a)
  --     saat baca ledger nanti — lihat catatan ketegangan teknis soal ini di §"KEPUTUSAN DEN" atas dokumen.
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no,
     created_by, last_count_date)
  SELECT v_company_id, v_warehouse_id, i.product_id, 'adjustment', 0,
         'stock_count_verified', p_report_id, v_report_no, v_uid, i.system_qty_snapshot_at::date
  FROM stock_count_items i
  WHERE i.session_id = v_session_id
    AND i.variance = 0;

  UPDATE stock_count_sessions SET status = 'closed', updated_at = now() WHERE id = v_session_id;

  UPDATE stock_count_variance_reports
     SET status = 'approved', approved_by = v_uid, approved_at = now(), updated_at = now()
   WHERE id = p_report_id;
END;
$$;
```

### 4.4 `reject_variance_report`
```sql
CREATE OR REPLACE FUNCTION public.reject_variance_report(
  p_report_id      uuid,
  p_rejection_note text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_session_id uuid;
  v_status     text;
  v_snapshot   jsonb;
BEGIN
  IF p_rejection_note IS NULL OR btrim(p_rejection_note) = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
  END IF;

  SELECT company_id, session_id, status INTO v_company_id, v_session_id, v_status
    FROM stock_count_variance_reports WHERE id = p_report_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Berita Acara tidak ditemukan.'; END IF;

  -- Guard SAMA seperti approve — sengaja tanpa has_role('operations'), lihat §4.3.
  IF NOT (is_super_admin() OR (v_company_id = get_user_company_id() AND is_manager_or_above())) THEN
    RAISE EXCEPTION 'Tidak punya izin menolak Berita Acara ini — wajib manager ke atas.';
  END IF;

  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Berita Acara berstatus % — hanya "pending_approval" yang bisa ditolak.', v_status;
  END IF;

  -- [Keputusan #7] Salin hasil hitung SAAT INI ke rejected_snapshot SEBELUM direset — bukti audit permanen.
  -- Baris report ini sendiri juga tak pernah ditimpa: recount berikutnya menghasilkan report BARU lewat
  -- finalize_stock_count_session (report_no baru via increment_document_sequence), bukan menulis ulang yang ini.
  SELECT jsonb_agg(jsonb_build_object(
           'item_id', i.id,
           'product_id', i.product_id,
           'location_id', i.location_id,
           'system_qty_snapshot_at', i.system_qty_snapshot_at,
           'system_qty', i.system_qty,
           'counted_qty', i.counted_qty,
           'variance', i.variance,
           'notes', i.notes
         ))
    INTO v_snapshot
    FROM stock_count_items i
   WHERE i.session_id = v_session_id;

  UPDATE stock_count_variance_reports
     SET status = 'rejected', rejection_note = p_rejection_note, rejected_snapshot = v_snapshot, updated_at = now()
   WHERE id = p_report_id;

  -- Reset item utk hitung ulang — SETELAH snapshot tersimpan. Tiga kolom sekaligus (bukan cuma counted_qty)
  -- supaya tak ada state "counted_qty NULL tapi system_qty/snapshot_at lama nyangkut" yang membingungkan UI;
  -- submit_count_item mengisi ulang ketiganya bersamaan saat recount, jadi ini konsisten dengan alur normalnya.
  UPDATE stock_count_items
     SET counted_qty = NULL, system_qty = NULL, system_qty_snapshot_at = NULL, updated_at = now()
   WHERE session_id = v_session_id;

  -- [Keputusan #7] Sesi kembali 'in_progress' (bukan 'draft') — siap direcount langsung lewat submit_count_item,
  -- tanpa start_stock_count_session baru. finalize_stock_count_session bisa dipanggil ulang setelahnya (guard-nya
  -- sudah menerima status 'in_progress') dan akan bikin report BARU kalau masih ada selisih — tak perlu perubahan
  -- apa pun di §4.5 untuk mendukung alur ini, sudah otomatis kompatibel.
  UPDATE stock_count_sessions SET status = 'in_progress', updated_at = now() WHERE id = v_session_id;
END;
$$;
```

### 4.5 `finalize_stock_count_session` — usulan tambahan di rev.1, DISETUJUI Den (Keputusan #1)
Pengisi celah supaya alur benar-benar bisa dipakai ujung-ke-ujung: tanpa RPC ini, tak ada yang membuat baris `stock_count_variance_reports`, dan sesi tanpa selisih (`Terdapat Selisih? → Tidak`) tak pernah bisa ditutup.
```sql
CREATE OR REPLACE FUNCTION public.finalize_stock_count_session(
  p_session_id    uuid,
  p_summary_notes text DEFAULT NULL
) RETURNS uuid   -- report_id kalau ada selisih (perlu approval), NULL kalau sesi langsung closed tanpa Berita Acara
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_company_id   uuid;
  v_status       text;
  v_uncounted    integer;
  v_has_variance boolean;
  v_entity_code  text;
  v_year         int := extract(year from now())::int;
  v_seq          int;
  v_report_no    text;
  v_report_id    uuid;
  v_uid          uuid := auth.uid();
BEGIN
  SELECT company_id, status INTO v_company_id, v_status FROM stock_count_sessions WHERE id = p_session_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Sesi tidak ditemukan.'; END IF;

  IF NOT (is_super_admin() OR (v_company_id = get_user_company_id()
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak punya izin menutup sesi ini.';
  END IF;
  IF v_status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'Sesi berstatus % — tak bisa difinalisasi dari status ini.', v_status;
  END IF;

  SELECT count(*) INTO v_uncounted FROM stock_count_items WHERE session_id = p_session_id AND counted_qty IS NULL;
  IF v_uncounted > 0 THEN
    RAISE EXCEPTION '% item belum diisi counted_qty — selesaikan submit_count_item dulu.', v_uncounted;
  END IF;

  SELECT EXISTS (SELECT 1 FROM stock_count_items WHERE session_id = p_session_id AND variance <> 0)
    INTO v_has_variance;

  -- Cabang "Terdapat Selisih? → Tidak" di SOP: langsung selesai, tanpa Berita Acara.
  IF NOT v_has_variance THEN
    UPDATE stock_count_sessions SET status = 'closed', updated_at = now() WHERE id = p_session_id;
    RETURN NULL;
  END IF;

  -- Cabang "Terdapat Selisih? → Ya": buat Berita Acara, sesi masuk 'review' menunggu approve/reject.
  SELECT code INTO v_entity_code FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'BAP', 'WH', v_year, 0, 0);   -- lihat §5
  v_report_no := 'BAP/' || v_entity_code || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');

  INSERT INTO stock_count_variance_reports (company_id, session_id, report_no, status, summary_notes, created_by)
  VALUES (v_company_id, p_session_id, v_report_no, 'pending_approval', p_summary_notes, v_uid)
  RETURNING id INTO v_report_id;

  UPDATE stock_count_sessions SET status = 'review', updated_at = now() WHERE id = p_session_id;

  RETURN v_report_id;
END;
$$;
```

---

## 5. Konfirmasi `increment_document_sequence`

Signature diverifikasi ulang persis dari `schema_snapshot.sql:1102` (bukan ingatan): `(p_company_id uuid, p_document_type text, p_department_code text, p_year integer, p_month integer DEFAULT 0, p_day integer DEFAULT 0) RETURNS integer`. **Self-initializing** — body-nya `UPDATE ... IF NOT FOUND THEN INSERT ... ON CONFLICT DO UPDATE` (`:1109-1127`), jadi kode `document_type` baru apa pun otomatis mulai dari 1 di panggilan pertama, **tak butuh seed apa pun**.

Kode yang dipakai contoh live: `'INV'`/`'FIN'` (invoice), `'SJ'`/`'WH'` (surat jalan), `'PICK'`/`'WH'` (picking) — **`'WH'` sudah jadi department_code standar utk dokumen gudang**. Usulan Den (`'SOP'`/`'WH'` utk sesi, `'BAP'`/`'WH'` utk Berita Acara) **konsisten dengan precedent ini** — tidak ada kode lebih pas yang saya temukan, tidak ada tabrakan (keduanya string baru, self-initializing menjamin itu). **Dikonfirmasi, dipakai apa adanya di §4.1 dan §4.5**, bukan diganti diam-diam.

---

## Ringkasan status dokumen ini

| # | Keputusan Den | Status di dokumen |
|---|---|---|
| 1 | `finalize_stock_count_session` disetujui apa adanya | ✅ Selesai — §4.5 tak berubah |
| 2 | `company_id` di `stock_count_variance_reports` disetujui | ✅ Selesai — §1.4 kolomnya tak berubah |
| 3 | Nol `deleted_at` di `stock_count_variance_reports` disetujui | ✅ Selesai — §1.4 tak berubah |
| 4 | Full Count target dari `stock_ledger`, bukan `product_warehouse_location` | ✅ Selesai — §4.1 diperjelas (filter `company_id` eksplisit) |
| 5 | `stock_count_sessions.status` diproteksi kolom-spesifik | ✅ Selesai — §3.2 ditulis ulang penuh |
| 6 | `last_count_date` update utk semua item ter-`counted_qty`, dipisah dari baris adjustment | ✅ Selesai — §4.3 ditulis ulang · ⚠️ 1 ketegangan teknis baru ditandai (lihat §"KEPUTUSAN DEN" di atas — interpretasi qty=0 perlu 1 konfirmasi cepat) |
| 7 | `reject_variance_report` reset sesi ke `in_progress` + `rejected_snapshot` permanen | ✅ Selesai — kolom baru di §1.4, logic di §4.4 ditulis ulang |
| 8 | Parameter `jsonb` utk `start_stock_count_session` disetujui | ✅ Selesai — §4.1 bentuk parameternya tak berubah |

**File lain (§1.1–1.3, §2, §3.1, §3.3, §4.2, §5) tidak disentuh** — dikonfirmasi tidak terpengaruh oleh ke-8 keputusan ini, seperti diminta.

**Status keseluruhan: 7 dari 8 keputusan terintegrasi bersih tanpa sisa pertanyaan.** Keputusan #6 terintegrasi penuh secara fungsional (SQL-nya lengkap dan konsisten, tidak menghalangi progres), tapi memunculkan satu ketegangan teknis baru — bagaimana caranya `last_count_date` item variance=0 ter-update kalau baris `stock_ledger` "sungguhan" katanya cuma boleh utk variance≠0 — dijelaskan lengkap + interpretasi yang saya jalankan (qty=0) di §"KEPUTUSAN DEN" atas dokumen. Dokumen ini karena itu **belum bisa disebut 100% TERKUNCI** sampai satu poin itu eksplisit dikonfirmasi (tinggal jawaban satu kalimat: qty=0 OK, atau ada mekanisme lain yang dimaksud) — poin 1, 2, 3, 4, 5, 7, dan 8 sudah TERKUNCI penuh. Belum ada satu baris pun dari dokumen ini yang dijalankan ke DB.

-- ============================================================================
-- role_menu_permissions (tabel baru) + user_menu_permissions.effect (kolom baru)
-- ============================================================================
-- Tanggal eksekusi manual: 2026-08-07.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase
--    SQL Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli
--    agar tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: Dua perubahan terkait, jadi fondasi resolusi izin menu 3-tingkat
--   (user override → role default → deny) yang dibangun sesudahnya di
--   AuthContext.jsx (hasMenuPermission) dan UI-nya di UserEditPage.jsx
--   (Permission Matrix jadi 3-state: ikut role / boleh / larang):
--
--   1. `user_menu_permissions.effect` — kolom baru text, default 'grant',
--      CHECK IN ('grant','deny'). Baris LAMA otomatis jadi 'grant' via
--      DEFAULT (backward-compatible, tak ada perilaku yang berubah untuk
--      baris yang sudah ada). Level USER sekarang bisa override eksplisit
--      dua arah — bukan cuma "grant kalau baris ada", tapi juga "deny
--      eksplisit walau role mengizinkan".
--
--   2. `role_menu_permissions` (tabel baru) — cerminan struktural
--      `user_menu_permissions`, tapi `role_id` bukan `user_id`, dan SENGAJA
--      TANPA kolom `effect` — level role cuma bisa grant (default), tidak
--      ada konsep deny di level role (keputusan desain, bukan kelalaian).
--      `role_id` sudah otomatis company-scoped lewat `roles.roles_company_
--      code_unique` — tidak perlu kolom `company_id` terpisah di tabel ini.
--
-- FIX: 2 partial unique index (bukan 1 UNIQUE biasa) untuk
--   `role_menu_permissions` — `menu_action_id`/`module_action_id` mutually
--   exclusive & nullable (via `rmp_one_action_required`), dan Postgres
--   menganggap NULL≠NULL di UNIQUE constraint biasa, jadi 1 UNIQUE gabungan
--   tak akan mencegah duplikat pada sisi manapun. Ditambah index eksplisit
--   di `role_id`/`menu_action_id`/`module_action_id` (konvensi yang sama
--   dipakai `role_permissions`, tabel sibling `role_id`-keyed lain). RLS
--   `role_menu_permissions`: tulis (INSERT/UPDATE/DELETE) cuma
--   `is_super_admin()` — lebih ketat dari `role_permissions` (yang izinkan
--   admin biasa company-scoped) karena ini sumber default yang berlaku ke
--   SEMUA user pemegang role itu, bukan permission granular per-baris; baca
--   diizinkan untuk siapa pun yang role itu jadi salah satu role AKTIF-nya
--   sendiri (EXISTS ke `user_roles`).
--
-- ISI:
--   Statement 1 — ALTER TABLE user_menu_permissions ADD COLUMN effect.
--   Statement 2 — CREATE TABLE role_menu_permissions.
--   Statement 3-7 — ALTER TABLE ADD CONSTRAINT (PK + 4 FK).
--   Statement 8-9 — CREATE UNIQUE INDEX (partial, 2x).
--   Statement 10-12 — CREATE INDEX (lookup, 3x).
--   Statement 13 — ENABLE ROW LEVEL SECURITY.
--   Statement 14-15 — CREATE POLICY (rmp_admin_all, rmp_select).
--   Statement 16 — GRANT ke authenticated.
-- ============================================================================


-- STATEMENT 1: kolom effect di user_menu_permissions (grant/deny, default grant)
ALTER TABLE public.user_menu_permissions
  ADD COLUMN effect text NOT NULL DEFAULT 'grant'
  CHECK (effect IN ('grant', 'deny'));

-- STATEMENT 2: tabel role_menu_permissions
CREATE TABLE public.role_menu_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    menu_action_id uuid,
    module_action_id uuid,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rmp_one_action_required CHECK ((((module_action_id IS NOT NULL) AND (menu_action_id IS NULL)) OR ((module_action_id IS NULL) AND (menu_action_id IS NOT NULL))))
);

-- STATEMENT 3-7: constraint (PK + 4 FK)
ALTER TABLE ONLY public.role_menu_permissions
    ADD CONSTRAINT role_menu_permissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.role_menu_permissions
    ADD CONSTRAINT role_menu_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_menu_permissions
    ADD CONSTRAINT role_menu_permissions_menu_action_id_fkey FOREIGN KEY (menu_action_id) REFERENCES public.menu_actions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_menu_permissions
    ADD CONSTRAINT role_menu_permissions_module_action_id_fkey FOREIGN KEY (module_action_id) REFERENCES public.module_actions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_menu_permissions
    ADD CONSTRAINT role_menu_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id);

-- STATEMENT 8-9: partial unique index (pengganti UNIQUE biasa, lihat FIX di atas)
CREATE UNIQUE INDEX role_menu_permissions_role_menu_action_unique
    ON public.role_menu_permissions (role_id, menu_action_id)
    WHERE (menu_action_id IS NOT NULL);
CREATE UNIQUE INDEX role_menu_permissions_role_module_action_unique
    ON public.role_menu_permissions (role_id, module_action_id)
    WHERE (module_action_id IS NOT NULL);

-- STATEMENT 10-12: index lookup (konvensi role_permissions)
CREATE INDEX idx_role_menu_permissions_role_id ON public.role_menu_permissions USING btree (role_id);
CREATE INDEX idx_role_menu_permissions_menu_action_id ON public.role_menu_permissions USING btree (menu_action_id);
CREATE INDEX idx_role_menu_permissions_module_action_id ON public.role_menu_permissions USING btree (module_action_id);

-- STATEMENT 13: enable RLS
ALTER TABLE public.role_menu_permissions ENABLE ROW LEVEL SECURITY;

-- STATEMENT 14-15: policy (super_admin-only write, self-role-scoped read)
CREATE POLICY rmp_admin_all ON public.role_menu_permissions
  TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY rmp_select ON public.role_menu_permissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
      WHERE ur.role_id = role_menu_permissions.role_id
        AND ur.user_id = auth.uid() AND ur.is_active = true)
  );

-- STATEMENT 16: grant table-level ke authenticated (RLS di atas tetap berlaku)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_menu_permissions TO authenticated;

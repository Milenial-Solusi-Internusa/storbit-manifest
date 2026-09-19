/* =========================================================================
   ENTITIES — SATU sumber daftar entitas Nexus by MSI (kode · UUID · nama legal).

   Lahir di Batch DS 1 (20 Sep 2026) untuk menggantikan DUA versi yang selama
   ini kepencar dan beda bentuk:
     - `pages/foundation/admin-settings/tokens.js` → `id` = kode pendek ("MSI"),
       tanpa UUID sama sekali;
     - `modules/crm/v3/tokens.js`                 → `id` = UUID company.
   Keduanya masih hidup sampai kit lamanya dihapus (Batch DS 7) — JANGAN
   menambah versi ketiga; impor dari sini.

   Bentuk baris (mengikuti v3, yang lebih lengkap): `id` SELALU UUID
   `companies.id`, `code` = kode pendek yang dipakai UI/nomor dokumen, `name` =
   nama legal (`companies.legal_name`; SOA dikoreksi "PT Stuja Orbit Abadi"
   11 Sep 2026, tanpa titik). Komponen yang dulu membandingkan `e.id === 'MSI'`
   (EntitySwitcher AdminKit) di kit baru membandingkan `e.code`.

   UUID = nilai produksi (CLAUDE.md §Quick Reference "Entity UUID"); staging
   memakai UUID yang sama karena disalin dari produksi.
   ========================================================================= */

export const ENTITIES = [
  { code: 'MSI', id: '0e1840d8-e6fb-4190-bd09-88338e68b492', name: 'PT Milenial Solusi Internusa' },
  { code: 'JCI', id: '42569e7c-531b-4d2b-832a-d5a7268c455b', name: 'PT Jago Custom Indonesia' },
  { code: 'SOA', id: 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', name: 'PT Stuja Orbit Abadi' },
];

export const ENTITY_CODES = ENTITIES.map((e) => e.code);

/* Peta cepat dua arah. Dibekukan supaya tak ada yang bisa "menambah entitas"
   diam-diam dari sisi pemanggil. */
export const ENTITY_BY_CODE = Object.freeze(Object.fromEntries(ENTITIES.map((e) => [e.code, e])));
export const ENTITY_BY_ID   = Object.freeze(Object.fromEntries(ENTITIES.map((e) => [e.id, e])));

export const entityByCode = (code) => ENTITY_BY_CODE[code] || null;
export const entityById   = (id) => ENTITY_BY_ID[id] || null;
/* `companies.id` → kode pendek; pemanggil lama yang menyimpan kode ("MSI")
   di state juga lolos apa adanya. */
export const entityCodeOf = (idOrCode) => ENTITY_BY_ID[idOrCode]?.code || (ENTITY_BY_CODE[idOrCode] ? idOrCode : null);

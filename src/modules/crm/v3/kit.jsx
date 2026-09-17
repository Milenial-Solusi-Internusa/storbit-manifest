/* =========================================================================
   CRM v3 — primitif kecil yang dipakai bersama kelima komponen layout.

   Ini BUKAN pengganti `admin-settings/kit.jsx` (573 baris, 20 export, milik
   halaman Admin Settings). Yang di sini hanya potongan minimum yang benar-
   benar dibutuhkan FormSheet/StatusBar/Notebook/ListView/Chatter, supaya v3
   berdiri sendiri tanpa satu pun import ke file produksi.

   Pola visual mengikuti DealDetailPage (cetakan yang disetujui 19 Jul 2026):
   kartu bergaris tipis, badge rounded-rect (bukan pill), heading Montserrat,
   body Inter, angka/nomor dokumen IBM Plex Mono.
   ========================================================================= */

import { NAVY, INK, INK_SOFT, FAINT, LINE, LINE_SOFT, SURFACE, SURFACE_2,
         FONT_HEAD, FONT_BODY, FONT_MONO, SP, RADIUS, toneOf } from './tokens';

/* ---------- Badge — satu-satunya bentuk badge di v3 ---------- */
export function Badge({ tone = 'slate', children, title }) {
  const t = typeof tone === 'string' ? toneOf(tone) : tone;
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
        fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700,
        padding: '2px 9px', borderRadius: RADIUS.sm, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/* ---------- Card — pembungkus section ---------- */
export function Card({ title, icon, right, children, padded = true }) {
  return (
    <section
      style={{
        background: SURFACE, border: `1px solid ${LINE}`,
        borderRadius: RADIUS.lg, overflow: 'hidden',
      }}
    >
      {(title || right) && (
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: SP.s2,
            padding: `${SP.s3}px ${SP.s4}px`, borderBottom: `1px solid ${LINE_SOFT}`,
            background: SURFACE_2,
          }}
        >
          {icon}
          <h3 style={{ margin: 0, flex: 1, fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 700, color: INK }}>
            {title}
          </h3>
          {right}
        </header>
      )}
      <div style={{ padding: padded ? SP.s4 : 0 }}>{children}</div>
    </section>
  );
}

/* ---------- DocNo — nomor dokumen, selalu mono ---------- */
export function DocNo({ children }) {
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: '.02em', color: INK_SOFT }}>
      {children}
    </span>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ title, sub }) {
  return (
    <div style={{ padding: `${SP.s6}px ${SP.s4}px`, textAlign: 'center' }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 700, color: INK_SOFT }}>{title}</div>
      {sub && (
        <div style={{ marginTop: SP.s1, fontFamily: FONT_BODY, fontSize: 12.5, color: FAINT }}>{sub}</div>
      )}
    </div>
  );
}

/* ---------- tombol ---------- */
export function PrimaryBtn({ children, onClick, disabled, icon }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 16px', borderRadius: RADIUS.md, border: `1px solid ${NAVY}`,
        background: NAVY, color: '#FFFFFF', fontFamily: FONT_HEAD, fontSize: 13.5,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}{children}
    </button>
  );
}

export function OutlineBtn({ children, onClick, disabled, icon }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 16px', borderRadius: RADIUS.md, border: `1px solid ${LINE}`,
        background: 'transparent', color: NAVY, fontFamily: FONT_HEAD, fontSize: 13.5,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}{children}
    </button>
  );
}

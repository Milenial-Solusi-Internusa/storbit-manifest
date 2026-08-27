/* =========================================================================
   StatusBar — representasi visual SATU sumbu status sebagai rangkaian tahap
   horizontal.

   GENERIK secara sengaja: komponen ini tidak tahu apakah yang dirender adalah
   lifecycle akun atau status deal inquiry. Ia hanya menerima daftar tahap +
   tahap sekarang, lalu menanyakan warnanya ke STAGE_TONE (tokens.js). Itu
   sebabnya belum ada satu pun kosakata yang di-hardcode di file ini —
   syarat eksplisit di brief batch persiapan.

   TIGA KEADAAN VISUAL:
     lewat    → abu-abu solid, tipis
     sekarang → menyala sesuai tone tahapnya (slate/orange/navy/brick)
     depan    → pudar

   KEADAAN KEEMPAT — RIBBON PENUTUP:
     Kalau status sudah closed (WON/LOST/CANCELLED, atau lifecycle lost/
     free_agent), bar TIDAK dirender sebagai rangkaian yang berhenti di
     tengah. Alasannya bukan estetika: bar yang mandek di tahap 3 dari 5
     membaca sebagai "macet, tunggu tahap berikutnya", padahal dokumennya
     sudah selesai dan tak akan bergerak lagi. Ribbon menutup sumbu itu
     secara eksplisit.

   ⚠️ `closed` TIDAK disimpulkan sendiri dari `current`. Pemanggil yang
   memutuskan, lewat prop `closed`. Sebab satu nilai bisa berarti dua hal
   tergantung sumbunya — dan komponen ini sengaja tak tahu sumbu apa yang
   sedang dipegangnya.
   ========================================================================= */

import { INK_SOFT, FAINT, LINE_SOFT, FONT_HEAD, SP, RADIUS, toneOf } from './tokens';

/**
 * @param {Object}   props
 * @param {Array}    props.stages   - [{ id, label }] urut dari awal ke akhir
 * @param {string}   props.current  - id tahap sekarang
 * @param {Object}   [props.closed] - { stage, label } bila sumbu sudah ditutup.
 *                                    `stage` dipakai untuk mencari tone ribbon.
 * @param {boolean}  [props.compact] - versi rapat untuk header padat
 */
export default function StatusBar({ stages = [], current, closed = null, compact = false }) {
  /* ── Ribbon penutup ── */
  if (closed) {
    const t = toneOf(closed.stage);
    return (
      <div
        role="status"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: SP.s2,
          padding: compact ? '6px 14px' : '9px 18px',
          background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
          borderRadius: RADIUS.md, fontFamily: FONT_HEAD,
          fontSize: compact ? 12 : 13, fontWeight: 700, letterSpacing: '.02em',
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: '50%', background: t.fg, flexShrink: 0 }}
        />
        {closed.label}
      </div>
    );
  }

  if (!stages.length) return null;

  const currentIdx = stages.findIndex((s) => s.id === current);

  return (
    <div
      role="status"
      style={{ display: 'flex', alignItems: 'stretch', gap: 3, flexWrap: 'wrap' }}
    >
      {stages.map((s, i) => {
        const isPast = currentIdx > -1 && i < currentIdx;
        const isNow = i === currentIdx;
        const t = toneOf(s.id);

        // lewat → abu solid · sekarang → tone tahapnya · depan → pudar
        const style = isNow
          ? { background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, fontWeight: 700 }
          : isPast
            ? { background: LINE_SOFT, color: INK_SOFT, border: `1px solid ${LINE_SOFT}`, fontWeight: 600 }
            : { background: 'transparent', color: FAINT, border: `1px dashed ${LINE_SOFT}`, fontWeight: 500 };

        return (
          <div
            key={s.id}
            title={s.label}
            aria-current={isNow ? 'step' : undefined}
            style={{
              ...style,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: compact ? '5px 10px' : '7px 14px',
              borderRadius: RADIUS.sm, fontFamily: FONT_HEAD,
              fontSize: compact ? 11.5 : 12.5, letterSpacing: '.01em',
              whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

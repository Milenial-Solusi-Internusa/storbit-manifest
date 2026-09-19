/* =========================================================================
   Data kit tunggal (Batch DS 1): Badge · StatusBar · ListView (+ re-export DocNo).

   `StatusBar` dan `ListView` = SALINAN `src/modules/crm/v3/StatusBar.jsx` &
   `ListView.jsx` (file aslinya tetap dipakai 3 halaman CRM sampai Batch DS 3;
   dua salinan sementara DISENGAJA). Kontrak keduanya utuh — yang berubah:
     - warna identitas → token sage (segmen "dilewati" NAVY+putih → ACCENT+INK;
       segmen aktif ORANGE_AA+putih → ACCENT_2+INK; pil saved-view aktif navy
       solid → ACCENT+INK);
     - warna STATUS tetap warna status: penanda WON = `DEAL_STATUS.WON.fg`
       navy solid (teks putih, 9,42:1), LOST/CANCELLED trio `DEAL_STATUS`;
     - tiga nilai papan gabungan v3 (BOARD_BG / BOARD_LINE / radius 16, dulu
       hex literal karena tak ada token v3 yang cocok) → INPUT_BG / LINE_SOFT /
       RADIUS.lg — di kit tunggal tokennya ada;
     - penanda centang segmen "dilewati": string simbol → `<Check/>` Lucide
       (arah TD-269, dibangun benar sejak lahir untuk kode baru; file v3
       aslinya tidak disentuh).
   ========================================================================= */

import { useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { SearchInput } from './Form';
import { EmptyState, Skeleton, DocNo } from './Layout';
import {
  ACCENT, ACCENT_HOVER, ACCENT_2, CARD, INK, INK_SOFT, LINE, LINE_SOFT, HEAD_BG, ROW_HOVER, INPUT_BG,
  WHITE, DEAL_STATUS, SHADOW_DROP, FONT_HEAD, FONT_BODY, SP, RADIUS, MOTION, toneOf,
} from './tokens';

export { DocNo };

/* =========================================================================
   BADGE — satu-satunya bentuk badge kit: rounded-square (radius 6), 11,5/700.
   `tone`: nama SEMANTIC (ok/warn/danger/info/neutral) · nama TONE
   (slate/orange/navy/brick) · id sumbu status (dipetakan STAGE_TONE) · atau
   objek trio {fg,bg,bd} (mis. `DEAL_STATUS.WON`). Resolusi: tokens.toneOf.
   ========================================================================= */
export function Badge({ tone = 'slate', children, title, icon, style }) {
  const t = toneOf(tone);
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
        fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700,
        padding: '2px 9px', borderRadius: RADIUS.sm, whiteSpace: 'nowrap', lineHeight: 1.5,
        ...style,
      }}
    >
      {icon}{children}
    </span>
  );
}

/* =========================================================================
   STATUSBAR — SATU sumbu status sebagai chevron bersambung + penanda penutupan.

   GENERIK: tak tahu sumbu apa yang dirender; hanya daftar tahap + tahap kini.
   TIGA KEADAAN SEGMEN:
     dilewati → ACCENT + INK, penanda centang
     aktif    → ACCENT_2 + INK 700, penanda nomor urut, drop-shadow
     belum    → CARD + INK_SOFT, garis LINE, nomor urut
   `closed` = PENANDA DI UJUNG KANAN yang hidup BERDAMPINGAN dengan segmen
   (bukan early-return pengganti bar — perubahan 4 Sep 2026, jangan dibalik).
   Tanpa `closed`, penanda berbunyi "Not closed". Murni tampilan, tak bisa
   diklik. `closed` TIDAK disimpulkan dari `current` — pemanggil yang memutuskan.
   ASIMETRI WON vs LOST/CANCELLED disengaja: WON (`done`) merender semua
   segmen tuntas (pernyataan HASIL); LOST/CANCELLED membiarkan segmen apa
   adanya karena riwayat tahap belum tersedia — menebaknya = jawaban separuh.
   ========================================================================= */
const NOTCH = { normal: 18, compact: 14 };

/* Gaya penanda penutupan = warna STATUS (kelas terpisah dari sage). Nilai di
   luar tiga kunci ini (mis. lifecycle 'free_agent') jatuh ke CANCELLED. */
const CLOSED_STYLE = {
  WON:       { bg: DEAL_STATUS.WON.fg, fg: WHITE, bd: 'transparent', done: true },
  LOST:      { bg: DEAL_STATUS.LOST.bg, fg: DEAL_STATUS.LOST.fg, bd: DEAL_STATUS.LOST.bd },
  CANCELLED: { bg: DEAL_STATUS.CANCELLED.bg, fg: DEAL_STATUS.CANCELLED.fg, bd: DEAL_STATUS.CANCELLED.bd },
};

/**
 * @param {Array}   props.stages   - [{ id, label }] urut awal → akhir
 * @param {string}  props.current  - id tahap sekarang
 * @param {Object}  [props.closed] - { stage, label } bila sumbu sudah ditutup
 * @param {boolean} [props.compact]
 * @param {string}  [props.notClosedLabel='Not closed']
 */
export function StatusBar({ stages = [], current, closed = null, compact = false, notClosedLabel = 'Not closed' }) {
  const notch = compact ? NOTCH.compact : NOTCH.normal;
  const height = compact ? 40 : 52;
  const labelSize = compact ? 10 : 11;
  const markSize = compact ? 11 : 13;
  const closeSize = compact ? 11 : 12;

  const currentIdx = stages.findIndex((s) => s.id === current);
  const t = closed ? (CLOSED_STYLE[closed.stage] || CLOSED_STYLE.CANCELLED) : null;
  const allDone = !!t?.done;

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6 }}>
      {stages.map((s, i) => {
        const isPast = allDone || (currentIdx > -1 && i < currentIdx);
        const isNow = !allDone && i === currentIdx;
        const first = i === 0;
        const clip = first
          ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%)`
          : `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%, ${notch}px 50%)`;
        const tone = isNow
          ? { background: ACCENT_2, color: INK, weight: 700 }
          : isPast
            ? { background: ACCENT, color: INK, weight: 500 }
            : { background: CARD, color: INK_SOFT, weight: 500, border: `1px solid ${LINE}` };
        return (
          <div
            key={s.id} title={s.label} aria-current={isNow ? 'step' : undefined}
            style={{
              background: tone.background, color: tone.color, border: tone.border, boxSizing: 'border-box',
              clipPath: clip, WebkitClipPath: clip, marginLeft: first ? 0 : -notch, zIndex: stages.length - i, height,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              padding: `0 ${notch + 10}px 0 ${first ? notch : notch + 10}px`,
              filter: isNow ? SHADOW_DROP : undefined,
            }}
          >
            <span aria-hidden="true" style={{ fontFamily: FONT_HEAD, fontSize: markSize, fontWeight: 700, lineHeight: 1, display: 'inline-flex' }}>
              {isPast ? <Check size={markSize} strokeWidth={3} /> : i + 1}
            </span>
            <span style={{ fontFamily: FONT_HEAD, fontSize: labelSize, fontWeight: tone.weight, letterSpacing: '.02em', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {s.label}
            </span>
          </div>
        );
      })}

      {stages.length > 0 && (
        <span aria-hidden="true" style={{ width: 1, height: height - 16, background: LINE, margin: '0 14px' }} />
      )}

      {closed ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', padding: compact ? '5px 10px' : '6px 12px',
          background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, borderRadius: RADIUS.sm,
          fontFamily: FONT_HEAD, fontSize: closeSize, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap',
        }}>
          {closed.label}
        </span>
      ) : (
        <span style={{ fontFamily: FONT_HEAD, fontSize: closeSize, fontWeight: 600, color: INK_SOFT, whiteSpace: 'nowrap' }}>
          {notClosedLabel}
        </span>
      )}
    </div>
  );
}

/* =========================================================================
   LISTVIEW — filter bar + saved view; mode "table" atau "lanes" (papan).
   Lajur `closed` menciut jadi rel 48px; `groupedBoard` (opt-in) menggabungkan
   lajur TERBUKA ke satu papan ber-grid + bar chevron. Saved view murni
   presentasional — persistensinya milik pemanggil.
   ========================================================================= */
function FilterBar({ search, onSearch, searchPlaceholder, filters, savedViews, activeView, onSelectView, right, card }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: SP.s3, marginBottom: SP.s4,
      ...(card ? { background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: SP.s4 } : null),
    }}>
      {!!savedViews?.length && (
        <div style={{ display: 'flex', gap: SP.s1, flexWrap: 'wrap', alignItems: 'center' }}>
          {savedViews.map((v) => {
            const on = v.id === activeView;
            /* Warna pil AKTIF, tiga tingkat: trio {bg,text,border} → TINTED ·
               `color` saja → SOLID warna itu (warna status milik pemanggil, teks
               putih) · kosong → ACCENT + INK (dulu navy solid + putih). */
            const tinted = !!(v.bg && v.text);
            const solid = !tinted && !!v.color;
            const onBg = tinted ? v.bg : solid ? v.color : ACCENT;
            const onText = tinted ? v.text : solid ? WHITE : INK;
            const onBorder = tinted ? (v.border || v.text) : solid ? v.color : ACCENT_HOVER;
            return (
              <button
                key={v.id} type="button" onClick={() => onSelectView?.(v.id)} aria-pressed={on} className="nk-focus"
                style={{
                  padding: '5px 12px', borderRadius: RADIUS.pill, cursor: 'pointer',
                  border: `1px solid ${on ? onBorder : LINE}`, background: on ? onBg : 'transparent', color: on ? onText : INK_SOFT,
                  fontFamily: FONT_HEAD, fontSize: 12, fontWeight: on ? 700 : 600, transition: `background ${MOTION.base}`,
                }}
              >
                {v.label}
                {typeof v.count === 'number' && <span style={{ marginLeft: 6, opacity: 0.75 }}>{v.count}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search hanya dirender bila pemanggil menyediakan `onSearch`. */}
        {onSearch && <SearchInput value={search} onChange={onSearch} placeholder={searchPlaceholder} />}
        {filters}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
    </div>
  );
}

/* Lebar sudut chevron papan: SATU angka untuk takik kiri, ujung lancip kanan,
   dan tumpang-tindih antar segmen — jangan dipisah. */
const ARROW = 18;
const STEP_H = 46;

/* Bar chevron papan: GEOMETRI milik komponen, PALET milik pemanggil lewat
   `lane.step` = { bg, fg, sub }; tanpa `step`, segmen jatuh ke tone lajurnya. */
function StepperBar({ lanes }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: STEP_H }}>
      {lanes.map((l, i) => {
        const first = i === 0;
        const last = i === lanes.length - 1;
        const clip = first
          ? `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%)`
          : last
            ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${ARROW}px 50%)`
            : `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%, ${ARROW}px 50%)`;
        const t = toneOf(l.tone || l.id);
        const step = l.step || {};
        return (
          <div
            key={l.id}
            style={{
              flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              marginLeft: first ? 0 : -ARROW, zIndex: i + 1, background: step.bg || t.bg,
              clipPath: clip, WebkitClipPath: clip, padding: `0 ${ARROW + 6}px`,
            }}
          >
            <span style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, color: step.fg || t.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {l.label}
            </span>
            <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: step.sub || t.fg }}>{l.items?.length || 0}</span>
          </div>
        );
      })}
    </div>
  );
}

function Lane({ lane, renderCard, collapsed, onToggle, grouped = false, divider = false }) {
  const t = toneOf(lane.tone || lane.id);
  const count = lane.items?.length || 0;

  if (collapsed) {
    return (
      <button
        type="button" onClick={onToggle} title={`Open the ${lane.label} lane`} className="nk-focus"
        style={{
          flex: '0 0 48px', minHeight: 220, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s3,
          padding: `${SP.s3}px 0`, borderRadius: RADIUS.lg, border: `1px solid ${t.bd}`, background: t.bg, color: t.fg,
        }}
      >
        <ChevronRight size={15} />
        <span style={{ writingMode: 'vertical-rl', fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
          {lane.label} · {count}
        </span>
      </button>
    );
  }

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
      {count === 0
        ? <div style={{ padding: SP.s3, fontFamily: FONT_BODY, fontSize: 12, color: INK_SOFT, textAlign: 'center' }}>Empty</div>
        : lane.items.map((it) => <div key={it.id}>{renderCard?.(it)}</div>)}
    </div>
  );

  if (grouped) {
    return (
      <div style={{ minWidth: 0, padding: SP.s3, display: 'flex', flexDirection: 'column', gap: SP.s2, borderRight: divider ? `1px solid ${LINE_SOFT}` : 'none' }}>
        {body}
      </div>
    );
  }

  return (
    <div style={{ flex: '1 1 240px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
      <header
        onClick={lane.closed ? onToggle : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: SP.s2, padding: `${SP.s2}px ${SP.s3}px`, borderRadius: RADIUS.md,
          background: t.bg, border: `1px solid ${t.bd}`, cursor: lane.closed ? 'pointer' : 'default',
        }}
      >
        <span style={{ flex: 1, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, color: t.fg }}>{lane.label}</span>
        <Badge tone={lane.tone || lane.id}>{count}</Badge>
      </header>
      {body}
    </div>
  );
}

/**
 * @param {'table'|'lanes'} [props.mode='table']
 * @param {Array}    [props.columns]     - table: [{ key, label, align, render(row, index) }]
 * @param {Array}    [props.rows]
 * @param {Array}    [props.lanes]       - lanes: [{ id, label, tone, closed, items, step }]
 * @param {Function} [props.renderCard]
 * @param {boolean}  [props.groupedBoard]
 * @param {string}   [props.search]  · {Function} [props.onSearch] · {string} [props.searchPlaceholder='Search…']
 * @param {Node}     [props.filters] · {Node} [props.right]
 * @param {Array}    [props.savedViews]  - [{ id, label, count, color?, bg?, text?, border? }]
 * @param {string}   [props.activeView] · {Function} [props.onSelectView]
 * @param {boolean}  [props.filterCard]  - baris filter dibungkus kartu
 * @param {Function} [props.onRowClick]  - table: baris bisa diklik (hover + cursor)
 * @param {boolean}  [props.loading]     - table: 5 baris skeleton, header tetap
 * @param {string}   [props.emptyTitle='No data'] · {string} [props.emptySub]
 */
export function ListView({
  mode = 'table', columns = [], rows = [], lanes = [], renderCard,
  search, onSearch, searchPlaceholder = 'Search…', filters, savedViews, activeView, onSelectView, right,
  filterCard = false, emptyTitle = 'No data', emptySub, groupedBoard = false,
  onRowClick, loading = false,
}) {
  const [expanded, setExpanded] = useState({});
  const [hoverRow, setHoverRow] = useState(-1);
  const toggle = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const laneState = useMemo(
    () => lanes.map((l) => ({ ...l, isCollapsed: !!l.closed && !expanded[l.id] })),
    [lanes, expanded],
  );

  const bar = (
    <FilterBar
      search={search} onSearch={onSearch} searchPlaceholder={searchPlaceholder} filters={filters}
      savedViews={savedViews} activeView={activeView} onSelectView={onSelectView} card={filterCard} right={right}
    />
  );

  if (mode === 'lanes') {
    const openLanes = laneState.filter((l) => !l.closed);
    const closedLanes = laneState.filter((l) => l.closed);

    if (groupedBoard && openLanes.length > 0) {
      return (
        <div>
          {bar}
          <div style={{ display: 'flex', gap: SP.s3, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: SP.s2 }}>
            <div style={{ flex: 1, minWidth: 0, background: INPUT_BG, border: `1px solid ${LINE_SOFT}`, borderRadius: RADIUS.lg, overflow: 'hidden' }}>
              <StepperBar lanes={openLanes} />
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${openLanes.length}, minmax(0, 1fr))` }}>
                {openLanes.map((l, i) => (
                  <Lane key={l.id} lane={l} renderCard={renderCard} collapsed={false} grouped divider={i < openLanes.length - 1} />
                ))}
              </div>
            </div>
            {closedLanes.map((l) => (
              <Lane key={l.id} lane={l} renderCard={renderCard} collapsed={l.isCollapsed} onToggle={() => toggle(l.id)} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        {bar}
        <div style={{ display: 'flex', gap: SP.s3, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: SP.s2 }}>
          {laneState.map((l) => (
            <Lane key={l.id} lane={l} renderCard={renderCard} collapsed={l.isCollapsed} onToggle={() => toggle(l.id)} />
          ))}
        </div>
      </div>
    );
  }

  /* Kerangka tabel dipakai baris data DAN skeleton — header tetap saat memuat. */
  const shell = (body) => (
    <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: RADIUS.lg }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT_BODY, fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: HEAD_BG }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align || 'left', padding: `${SP.s3}px ${SP.s3}px`, fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700,
                  letterSpacing: '.04em', textTransform: 'uppercase', color: INK_SOFT, borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );

  const cellStyle = (c) => ({ textAlign: c.align || 'left', padding: `${SP.s3}px ${SP.s3}px`, borderBottom: `1px solid ${LINE_SOFT}`, color: INK });

  const dataBody = rows.map((r, i) => (
    <tr
      key={r.id ?? i}
      onClick={onRowClick ? () => onRowClick(r) : undefined}
      onMouseEnter={onRowClick ? () => setHoverRow(i) : undefined}
      onMouseLeave={onRowClick ? () => setHoverRow(-1) : undefined}
      style={onRowClick ? { cursor: 'pointer', background: hoverRow === i ? ROW_HOVER : 'transparent', transition: `background ${MOTION.fast} ease` } : undefined}
    >
      {/* `render(row, index)` — argumen kedua untuk kolom nomor urut (aditif). */}
      {columns.map((c) => (
        <td key={c.key} style={cellStyle(c)}>{c.render ? c.render(r, i) : r[c.key]}</td>
      ))}
    </tr>
  ));

  const skeletonBody = Array.from({ length: 5 }, (_, i) => (
    <tr key={`sk-${i}`}>
      {columns.map((c) => (
        <td key={c.key} style={cellStyle(c)}>
          <Skeleton h={10} r={RADIUS.sm} style={{ maxWidth: 160, marginLeft: c.align === 'right' ? 'auto' : 0 }} />
        </td>
      ))}
    </tr>
  ));

  return (
    <div>
      {bar}
      {loading ? shell(skeletonBody) : rows.length === 0 ? <EmptyState title={emptyTitle} sub={emptySub} /> : shell(dataBody)}
    </div>
  );
}

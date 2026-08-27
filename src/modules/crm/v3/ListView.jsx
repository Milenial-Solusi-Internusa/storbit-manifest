/* =========================================================================
   ListView — pola daftar (filter bar + saved view) diformalkan, PLUS varian
   "lajur tertutup".

   DUA MODE:
     mode="table" → daftar baris biasa dengan filter bar + saved view
     mode="lanes" → lajur horizontal (bentuk papan), tiap lajur bisa DITUTUP

   VARIAN LAJUR TERTUTUP — disiapkan sekarang, dipakai batch Pipeline nanti.
   Lajur yang ditandai `closed` (mis. WON/LOST/CANCELLED) dirender menciut
   jadi rel tipis dengan hitungannya saja, bisa dibuka lewat klik. Alasannya
   bukan hemat tempat: lajur terminal biasanya menampung mayoritas kartu
   historis, dan kalau dirender penuh ia mendominasi papan sehingga lajur
   yang benar-benar butuh tindakan jadi tenggelam.

   ⚠️ BELUM DIINTEGRASIKAN ke papan Pipeline yang sekarang — batasan eksplisit
   batch persiapan. Papan lama tetap jalan apa adanya; komponen ini berdiri
   sendiri sampai batch Pipeline mengadopsinya.

   Saved view di sini murni PRESENTASIONAL (daftar + mana yang aktif).
   Persistensinya milik pemanggil — ListView tak menyentuh localStorage
   maupun DB, supaya satu komponen bisa dipakai baik untuk view lokal
   maupun view tersimpan di server nanti.
   ========================================================================= */

import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { NAVY, INK, INK_SOFT, FAINT, LINE, LINE_SOFT, SURFACE, SURFACE_2,
         FONT_HEAD, FONT_BODY, SP, RADIUS, toneOf } from './tokens';
import { Badge, EmptyState } from './kit';

/* ---------- Filter bar ---------- */
function FilterBar({ search, onSearch, filters, savedViews, activeView, onSelectView, right }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s3, marginBottom: SP.s4 }}>
      {/* saved view */}
      {!!savedViews?.length && (
        <div style={{ display: 'flex', gap: SP.s1, flexWrap: 'wrap', alignItems: 'center' }}>
          {savedViews.map((v) => {
            const on = v.id === activeView;
            return (
              <button
                key={v.id} type="button" onClick={() => onSelectView?.(v.id)}
                style={{
                  padding: '5px 12px', borderRadius: RADIUS.pill, cursor: 'pointer',
                  border: `1px solid ${on ? NAVY : LINE}`,
                  background: on ? NAVY : 'transparent', color: on ? '#FFFFFF' : INK_SOFT,
                  fontFamily: FONT_HEAD, fontSize: 12, fontWeight: on ? 700 : 600,
                }}
              >
                {v.label}
                {typeof v.count === 'number' && (
                  <span style={{ marginLeft: 6, opacity: 0.75 }}>{v.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: FAINT }} />
          <input
            value={search || ''} onChange={(e) => onSearch?.(e.target.value)}
            placeholder="Cari…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: RADIUS.md,
              border: `1px solid ${LINE}`, background: SURFACE,
              fontFamily: FONT_BODY, fontSize: 13.5, color: INK, outline: 'none',
            }}
          />
        </div>
        {filters}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
    </div>
  );
}

/* ---------- Satu lajur ---------- */
function Lane({ lane, renderCard, collapsed, onToggle }) {
  const t = toneOf(lane.tone || lane.id);
  const count = lane.items?.length || 0;

  if (collapsed) {
    return (
      <button
        type="button" onClick={onToggle} title={`Buka lajur ${lane.label}`}
        style={{
          flex: '0 0 48px', minHeight: 220, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s3,
          padding: `${SP.s3}px 0`, borderRadius: RADIUS.lg,
          border: `1px solid ${t.bd}`, background: t.bg, color: t.fg,
        }}
      >
        <ChevronRight size={15} />
        <span style={{
          writingMode: 'vertical-rl', fontFamily: FONT_HEAD, fontSize: 12,
          fontWeight: 700, letterSpacing: '.04em', whiteSpace: 'nowrap',
        }}>
          {lane.label} · {count}
        </span>
      </button>
    );
  }

  return (
    <div style={{ flex: '1 1 240px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
      <header
        onClick={lane.closed ? onToggle : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: SP.s2,
          padding: `${SP.s2}px ${SP.s3}px`, borderRadius: RADIUS.md,
          background: t.bg, border: `1px solid ${t.bd}`,
          cursor: lane.closed ? 'pointer' : 'default',
        }}
      >
        <span style={{ flex: 1, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, color: t.fg }}>
          {lane.label}
        </span>
        <Badge tone={lane.tone || lane.id}>{count}</Badge>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
        {count === 0
          ? <div style={{ padding: SP.s3, fontFamily: FONT_BODY, fontSize: 12, color: FAINT, textAlign: 'center' }}>Kosong</div>
          : lane.items.map((it) => <div key={it.id}>{renderCard?.(it)}</div>)}
      </div>
    </div>
  );
}

/**
 * @param {Object}   props
 * @param {'table'|'lanes'} [props.mode]
 * @param {Array}    [props.columns]   - mode table: [{ key, label, align, render }]
 * @param {Array}    [props.rows]      - mode table
 * @param {Array}    [props.lanes]     - mode lanes: [{ id, label, tone, closed, items }]
 * @param {Function} [props.renderCard]- mode lanes
 * @param {string}   [props.search]
 * @param {Function} [props.onSearch]
 * @param {Node}     [props.filters]
 * @param {Array}    [props.savedViews]- [{ id, label, count }]
 * @param {string}   [props.activeView]
 * @param {Function} [props.onSelectView]
 * @param {Node}     [props.right]
 * @param {string}   [props.emptyTitle]
 */
export default function ListView({
  mode = 'table', columns = [], rows = [], lanes = [], renderCard,
  search, onSearch, filters, savedViews, activeView, onSelectView, right,
  emptyTitle = 'Tidak ada data', emptySub,
}) {
  // Lajur `closed` menciut secara default; user boleh membukanya per sesi.
  const [expanded, setExpanded] = useState({});
  const toggle = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const laneState = useMemo(
    () => lanes.map((l) => ({ ...l, isCollapsed: !!l.closed && !expanded[l.id] })),
    [lanes, expanded],
  );

  const bar = (
    <FilterBar
      search={search} onSearch={onSearch} filters={filters}
      savedViews={savedViews} activeView={activeView} onSelectView={onSelectView}
      right={right}
    />
  );

  if (mode === 'lanes') {
    return (
      <div>
        {bar}
        <div style={{ display: 'flex', gap: SP.s3, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: SP.s2 }}>
          {laneState.map((l) => (
            <Lane
              key={l.id} lane={l} renderCard={renderCard}
              collapsed={l.isCollapsed} onToggle={() => toggle(l.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {bar}
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} sub={emptySub} />
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: RADIUS.lg }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT_BODY, fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: SURFACE_2 }}>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      textAlign: c.align || 'left', padding: `${SP.s3}px ${SP.s3}px`,
                      fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700,
                      letterSpacing: '.04em', textTransform: 'uppercase', color: INK_SOFT,
                      borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? i}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        textAlign: c.align || 'left', padding: `${SP.s3}px ${SP.s3}px`,
                        borderBottom: `1px solid ${LINE_SOFT}`, color: INK,
                      }}
                    >
                      {c.render ? c.render(r) : r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

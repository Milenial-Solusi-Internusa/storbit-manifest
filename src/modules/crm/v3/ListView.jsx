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

   VARIAN PAPAN GABUNGAN (`groupedBoard`) — OPT-IN, mati secara default.
   Lajur TERBUKA dikumpulkan ke dalam satu container ber-grid: garis vertikal
   antar kolom, dan SATU bar chevron di atasnya yang menggantikan header
   per-lajur. Lajur `closed` TIDAK ikut masuk container itu — ia tetap rel
   terpisah di kanan dengan perilaku expand/collapse yang sama persis.
   Sengaja opt-in, bukan perubahan langsung pada `mode="lanes"`: bentuk papan
   ini spesifik untuk sumbu yang tahapnya berurutan, sementara mode lanes
   sendiri tak menuntut itu.

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
            placeholder="Search…"
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

/* ---------- Chrome papan gabungan ----------
   Ketiga nilai di bawah sengaja ditulis sebagai angka, BUKAN diambil dari
   tokens.js: tak satu pun token v3 cocok persis — LINE_SOFT `#EFE9DD` vs
   `#ECE7E2`, dan SURFACE_2 `#F7F8FA` yang dingin vs `#FBFAF9` yang hangat.
   Selisihnya kasat mata, bukan pembulatan, jadi menukarnya dengan token yang
   "mirip" akan menggeser rupa papan diam-diam. Dipromosikan ke tokens.js kalau
   kelak ada permukaan KEDUA yang memakainya — satu pemakai belum cukup jadi
   alasan menambah kosakata token. */
const BOARD_BG     = '#FBFAF9';
const BOARD_LINE   = '#ECE7E2';
const BOARD_RADIUS = 16;

/* Lebar sudut chevron. SATU angka ini mengatur tiga hal yang wajib sama
   besarnya: kedalaman takik di kiri segmen, panjang ujung lancip di kanannya,
   dan besar tumpang-tindih antar segmen (margin-left negatif). Menyetel salah
   satunya sendirian akan memunculkan celah putih di antara segmen. */
const ARROW  = 18;
const STEP_H = 46;

/* ---------- Bar chevron papan ----------
   GEOMETRI milik komponen ini (sudut, tinggi, urutan tumpuk). PALET milik
   PEMANGGIL, lewat `lane.step` = { bg, fg, sub }. Pembagian itu disengaja dan
   meneruskan aturan yang sudah dipegang StatusBar: primitif v3 tidak mengenal
   kosakata sumbu mana pun. Tanpa `step`, segmen jatuh ke tone lajurnya sendiri
   sehingga varian ini tetap aman dipakai sumbu lain. */
function StepperBar({ lanes }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: STEP_H }}>
      {lanes.map((l, i) => {
        const first = i === 0;
        const last  = i === lanes.length - 1;
        // Bentuk diturunkan dari INDEX, bukan dari id lajur: segmen pertama
        // rata di kiri, terakhir rata di kanan, sisanya bertakik di kiri +
        // lancip di kanan. Jadi jumlah/urutan tahap boleh berubah tanpa
        // menyentuh file ini.
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
              flex: 1, minWidth: 0, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              marginLeft: first ? 0 : -ARROW,
              zIndex: i + 1,               // menaik — tiap segmen menimpa takik tetangga kirinya
              background: step.bg || t.bg,
              clipPath: clip, WebkitClipPath: clip,
              padding: `0 ${ARROW + 6}px`, // jaga teks tak menabrak takik (pola DealStepper)
            }}
          >
            <span style={{
              fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, color: step.fg || t.fg,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {l.label}
            </span>
            <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: step.sub || t.fg }}>
              {l.items?.length || 0}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Satu lajur ---------- */
function Lane({ lane, renderCard, collapsed, onToggle, grouped = false, divider = false }) {
  const t = toneOf(lane.tone || lane.id);
  const count = lane.items?.length || 0;

  if (collapsed) {
    return (
      <button
        type="button" onClick={onToggle} title={`Open the ${lane.label} lane`}
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

  // Tumpukan kartu — sama untuk kedua varian, jadi didefinisikan sekali.
  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
      {count === 0
        ? <div style={{ padding: SP.s3, fontFamily: FONT_BODY, fontSize: 12, color: FAINT, textAlign: 'center' }}>Empty</div>
        : lane.items.map((it) => <div key={it.id}>{renderCard?.(it)}</div>)}
    </div>
  );

  /* Varian papan gabungan: header per-lajur DIHAPUS (satu bar chevron di atas
     papan yang menggantikannya), lebar diserahkan ke grid pembungkus, pemisah
     antar kolom jadi garis vertikal. Garis itu ikut tinggi kolom TERPANJANG
     dengan sendirinya karena grid item default-nya stretch — persis alasan
     pembungkusnya grid, bukan flex+gap. */
  if (grouped) {
    return (
      <div style={{
        minWidth: 0, padding: SP.s3,
        display: 'flex', flexDirection: 'column', gap: SP.s2,
        borderRight: divider ? `1px solid ${BOARD_LINE}` : 'none',
      }}>
        {body}
      </div>
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
      {body}
    </div>
  );
}

/**
 * @param {Object}   props
 * @param {'table'|'lanes'} [props.mode]
 * @param {Array}    [props.columns]   - mode table: [{ key, label, align, render }]
 * @param {Array}    [props.rows]      - mode table
 * @param {Array}    [props.lanes]     - mode lanes: [{ id, label, tone, closed, items, step }]
 * @param {Function} [props.renderCard]- mode lanes
 * @param {boolean}  [props.groupedBoard] - mode lanes: lajur TERBUKA digabung jadi satu
 *                                       papan ber-grid + bar chevron; lajur `closed`
 *                                       tetap rel terpisah di kanan. Palet tiap segmen
 *                                       diambil dari `lane.step` = { bg, fg, sub }.
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
  emptyTitle = 'No data', emptySub, groupedBoard = false,
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
    const openLanes   = laneState.filter((l) => !l.closed);
    const closedLanes = laneState.filter((l) => l.closed);

    /* Papan gabungan. Lajur `closed` sengaja TIDAK ikut masuk container:
       ia tetap dirender lewat <Lane> jalur biasa, dengan state expand/collapse
       yang sama — membukanya tetap menghasilkan lajur penuh berheader seperti
       sebelumnya, karena rel tertutup bukan bagian dari sumbu tahap berurutan
       yang digambarkan chevron. */
    if (groupedBoard && openLanes.length > 0) {
      return (
        <div>
          {bar}
          <div style={{ display: 'flex', gap: SP.s3, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: SP.s2 }}>
            <div style={{
              flex: 1, minWidth: 0,
              background: BOARD_BG, border: `1px solid ${BOARD_LINE}`,
              borderRadius: BOARD_RADIUS, overflow: 'hidden',
            }}>
              <StepperBar lanes={openLanes} />
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${openLanes.length}, minmax(0, 1fr))` }}>
                {openLanes.map((l, i) => (
                  <Lane
                    key={l.id} lane={l} renderCard={renderCard}
                    collapsed={false} grouped divider={i < openLanes.length - 1}
                  />
                ))}
              </div>
            </div>
            {closedLanes.map((l) => (
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

/* =========================================================================
   Notebook — pola tab yang selama ini informal di tab Account, diformalkan
   jadi satu komponen.

   SATU MEKANISME GATE, BUKAN PER-TAB.
   Sebelumnya tiap tab mengecek haknya sendiri-sendiri di dalam body-nya, jadi
   tab bisa TAMPIL tapi isinya kosong/AccessDenied — dan tab pertama bisa jadi
   tab yang user tak berhak, sehingga halaman terbuka dalam keadaan buntu.
   Di sini gate dievaluasi SATU KALI di level daftar tab:
     - tab yang tak lolos gate tidak dirender sama sekali
     - tab default = tab PERTAMA YANG LOLOS, bukan tab pertama secara harfiah

   Kontrak gate: tiap tab boleh punya `gate` berupa
     - undefined / true  → selalu tampil
     - false             → tak pernah tampil
     - function          → dipanggil sekali, hasilnya truthy = tampil
   Satu bentuk saja, tak ada jalur kedua. Kalau kelak butuh gate berbasis
   permission DB, bungkus di `gate` milik pemanggil — JANGAN tambahkan
   mekanisme paralel di sini.

   Komponen ini stateless soal tab aktif (controlled): pemanggil memegang
   `value`. Yang dikelola sendiri hanya koreksi otomatis saat `value` menunjuk
   tab yang tak (lagi) berhak — lihat useEffect di bawah.
   ========================================================================= */

import { useEffect, useMemo } from 'react';
import { NAVY, INK_SOFT, LINE, FONT_HEAD, SP } from './tokens';

/**
 * @param {Object}   props
 * @param {Array}    props.tabs      - [{ id, label, gate?, render? }]
 * @param {string}   props.value     - id tab aktif
 * @param {Function} props.onChange  - (id) => void
 * @param {Node}     [props.children] - isi tab (kalau tidak pakai tab.render)
 * @param {Node}     [props.right]    - slot kanan di baris tab (aksi kecil)
 */
export default function Notebook({ tabs = [], value, onChange, children, right = null }) {
  // Gate dievaluasi sekali per render, di satu tempat.
  const visible = useMemo(
    () => tabs.filter((t) => {
      if (typeof t.gate === 'function') return !!t.gate();
      return t.gate !== false;
    }),
    [tabs],
  );

  const activeId = visible.some((t) => t.id === value) ? value : visible[0]?.id;

  // Koreksi ke tab pertama yang berhak bila `value` menunjuk tab terlarang
  // (mis. deep-link lama, atau hak user berubah saat halaman terbuka).
  useEffect(() => {
    if (activeId && activeId !== value) onChange?.(activeId);
  }, [activeId, value, onChange]);

  if (!visible.length) return null;

  const active = visible.find((t) => t.id === activeId);

  return (
    <div>
      {/* TD-318 Irisan 2 Inquiry, bug fix round, Task 4: gap/padding/height
          disamakan ke mockup Inquiry Management.dc.html -- wrapper tab
          `display:flex;gap:24px;padding:0 16px;border-bottom:1px solid
          #D8E0D2;overflow-x:auto`, tiap tombol `height:48px;padding:0`
          (spasi antar-tab datang dari gap wrapper, BUKAN padding tombol).
          Satu-satunya pemakai produksi Notebook hari ini = DealDetailPage
          (demo CrmV3DemoPage.jsx sisanya) -- aman diubah di sini. */}
      <div
        role="tablist"
        style={{
          display: 'flex', alignItems: 'center', gap: 24,
          padding: '0 16px', borderBottom: `1px solid ${LINE}`, marginBottom: SP.s5,
          flexWrap: 'wrap', overflowX: 'auto',
        }}
      >
        {visible.map((t) => {
          const on = t.id === activeId;
          return (
            <button
              key={t.id} type="button" role="tab" aria-selected={on}
              onClick={() => onChange?.(t.id)}
              style={{
                appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', height: 48, padding: 0, marginBottom: -1,
                fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: on ? 700 : 600, whiteSpace: 'nowrap',
                color: on ? NAVY : INK_SOFT,
                borderBottom: on ? `2px solid ${NAVY}` : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          );
        })}
        {right && <div style={{ marginLeft: 'auto', paddingBottom: SP.s2 }}>{right}</div>}
      </div>

      <div role="tabpanel">{active?.render ? active.render() : children}</div>
    </div>
  );
}

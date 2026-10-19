/* =========================================================================
   RouteStrip -- TD-318 Irisan 2 Inquiry, commit 4.
   Dua varian persis mockup design-handoff/mockup/Inquiry Management.dc.html:
     - RouteStrip standar (data-screen-label="Detail/RouteStrip"): Departure/
       Arrival dua ujung + konektor putus-putus + ikon kontainer + teks
       container type di tengah.
     - RouteStrip Door-to-Door (data-screen-label="Detail/RouteStripDoorToDoor"):
       EMPAT noktah (Pickup -> Port of Loading -> Port of Discharge ->
       Delivery), tiga konektor.

   DIHILANGKAN dari mockup, DILAPORKAN bukan ditebak (nol sumber data):
     - Baris kota/negara di bawah nama pelabuhan (RT.lCity/rCity) -- mockup
       mengambilnya dari tabel hardcode nama-pelabuhan->kota di dalam file
       mockup sendiri; Nexus TIDAK punya master lokasi (LocationSelect/
       Location Master -- Irisan 6, belum ada). pol/pod di Nexus adalah
       teks bebas, bukan referensi ke master yang punya kota/negara.
     - Warna teks peringatan RT.lFg/rFg (pelabuhan tak dikenal) -- turunan
       dari master lokasi yang sama, tidak ada.
     - Chip "Customs by {entity}" di varian Door-to-Door -- tidak ada kolom
       penanda "entitas yang menangani customs" di `inquiries`.
   Keduanya TIDAK dirender sama sekali (bukan placeholder kosong) -- lihat
   komentar pemakaian di DealDetailPage.jsx untuk kondisi varian mana yang
   bisa benar-benar terpicu hari ini.

   Brand: navy/orange/cream (instruksi eksekusi task ini), BUKAN sage mockup
   -- token warna dioper dari pemanggil (`C` di DealPanels.jsx), komponen ini
   sendiri tidak mengimpor kit sage supaya tetap konsisten dengan CRM yang
   belum migrasi (CLAUDE.md).

   FIX (bug fix round, Task 4): ikon & ukuran disamakan ke mockup, dibaca
   langsung dari path SVG mentah di file sumber (bukan ditebak dari nama
   lucide) -- ternyata BERBEDA dari yang dipasang di komit sebelumnya:
     - Ikon "Arrival"/"Delivery" = Flag (path M4 15s1-1 4-1...), BUKAN Ship.
     - Ikon konektor rute LAUT (POL<->POD) = Ship (path M2 21c.6.5 1.2 1
       2.5 1...), BUKAN Truck -- Truck tetap untuk konektor darat
       (Pickup<->POL, POD<->Delivery di varian Door-to-Door).
     - Lingkar konektor standar 32px (bukan default 28), ikon di dalamnya
       16px; lebar minimum pembungkus konektor standar 120px (bukan 72).
     - Tinggi track konektor = PERSIS diameter lingkar (bukan +4px), posisi
       garis putus-putus = diameter/2-1 -- diverifikasi cocok di ketiga
       varian (32/28/24) dengan nilai `top` yang tertulis di mockup. */
import { MapPin, Ship, Truck, Flag } from 'lucide-react';

const LABEL = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 11 };
const STOP = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 110, alignItems: 'center', textAlign: 'center' };
const CONNECTOR_WRAP = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 72 };

function Connector({ size = 28, iconSize, color, muted, icon: Icon = Truck }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: size / 2 - 1, borderTop: `2px dashed ${muted}` }} />
      <span style={{
        position: 'relative', width: size, height: size, borderRadius: size / 2, background: '#FFFFFF',
        border: `1px solid ${muted}`, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={iconSize ?? size * 0.5} />
      </span>
    </div>
  );
}

/**
 * RouteStrip standar -- Departure/Arrival, dua ujung. `compact` = versi
 * ringkas Header (mockup `showRoute`, :301-304): satu baris, ikon pin/kapal
 * tanpa label "Departure"/"Arrival", tinggi 56 bukan 88, max-width 560.
 * @param {string} pol - Port of Loading / Departure
 * @param {string} pod - Port of Discharge / Arrival
 * @param {string} [containerLabel] - mis. gabungan container_types
 * @param {Object} tokens - { border, mutedBg, text, textMute }
 * @param {boolean} [compact]
 */
export function RouteStrip({ pol, pod, containerLabel, tokens, compact = false }) {
  const t = tokens;
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, padding: '0 16px', background: t.mutedBg, border: `1px solid ${t.border}`, borderRadius: 10, maxWidth: 560 }}>
        <span style={{ color: t.textMute, display: 'flex' }}><MapPin size={14} /></span>
        <span style={{ fontWeight: 600, fontSize: 13.5, color: t.text, whiteSpace: 'nowrap' }}>{pol || '—'}</span>
        <div style={{ ...CONNECTOR_WRAP, minWidth: 48 }}><Connector size={24} iconSize={14} color={t.textMute} muted={t.border} icon={Ship} /></div>
        <span style={{ fontWeight: 600, fontSize: 13.5, color: t.text, whiteSpace: 'nowrap' }}>{pod || '—'}</span>
        <span style={{ color: t.textMute, display: 'flex' }}><Flag size={14} /></span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 88, padding: '12px 20px', background: t.mutedBg, border: `1px solid ${t.border}`, borderRadius: 10 }}>
      <div style={{ ...STOP, alignItems: 'flex-start', textAlign: 'left' }}>
        <span style={{ ...LABEL, color: t.textMute }}><MapPin size={14} />Departure</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: t.text }}>{pol || '—'}</span>
      </div>
      <div style={{ ...CONNECTOR_WRAP, minWidth: 120 }}>
        <Connector size={32} color={t.textMute} muted={t.border} icon={Ship} />
        {containerLabel && <span style={{ fontFamily: 'monospace', fontSize: 12, color: t.textMute }}>{containerLabel}</span>}
      </div>
      <div style={{ ...STOP, alignItems: 'flex-end', textAlign: 'right' }}>
        <span style={{ ...LABEL, color: t.textMute }}><Flag size={14} />Arrival</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: t.text }}>{pod || '—'}</span>
      </div>
    </div>
  );
}

/**
 * RouteStrip Door-to-Door -- empat noktah: Pickup -> POL -> POD -> Delivery.
 * @param {string} pickup - alamat pickup
 * @param {string} pol
 * @param {string} pod
 * @param {string} delivery - alamat delivery
 * @param {string} [containerLabel]
 */
export function RouteStripDoorToDoor({ pickup, pol, pod, delivery, containerLabel, tokens }) {
  const t = tokens;
  const stops = [
    { label: 'Pickup', icon: MapPin, value: pickup },
    { label: 'Port of Loading', icon: MapPin, value: pol },
    { label: 'Port of Discharge', icon: MapPin, value: pod },
    { label: 'Delivery', icon: Flag, value: delivery },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 88, padding: '12px 16px', background: t.mutedBg, border: `1px solid ${t.border}`, borderRadius: 10, overflowX: 'auto' }}>
      {stops.map((s, i) => (
        <>
          <div key={s.label} style={STOP}>
            <span style={{ ...LABEL, color: t.textMute }}><s.icon size={14} />{s.label}</span>
            <span style={{ fontWeight: 600, fontSize: 13.5, color: t.text }}>{s.value || '—'}</span>
          </div>
          {/* Leg 1 (POL->POD) = LAUT -> Ship; leg 0 (Pickup->POL) & leg 2
              (POD->Delivery) = DARAT -> Truck. containerLabel milik leg 1
              di mockup (bukan leg 0) -- diverifikasi posisinya di markup
              sumber, bukan ditebak. */}
          {i < stops.length - 1 && (
            <div key={`c-${s.label}`} style={{ ...CONNECTOR_WRAP, minWidth: 72 }}>
              <Connector size={28} color={t.textMute} muted={t.border} icon={i === 1 ? Ship : Truck} />
              {i === 1 && containerLabel && <span style={{ fontFamily: 'monospace', fontSize: 12, color: t.textMute }}>{containerLabel}</span>}
            </div>
          )}
        </>
      ))}
    </div>
  );
}

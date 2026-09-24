// src/components/MenuPlaceholderPage.jsx
// Halaman untuk tab Level 3 yang BELUM punya halaman hidup (Grand Design
// Bagian 1). Statis sepenuhnya: nama Level 3 + deskripsinya, ditambah konteks
// modul/Level 2 supaya pembaca tahu ia sedang berdiri di mana. NOL fetch, nol
// state, nol efek — komponen ini tidak boleh menyentuh data.
//
// Kit: mengikut TETANGGANYA (keputusan #61) — navy/pastel yang sama dengan
// AccessDeniedPage & shell (var(--navy) #1B4D8A, Montserrat untuk judul, Inter
// untuk teks, ikon Lucide). BUKAN src/kit sage: halaman ini di luar giliran
// Batch DS mana pun. Tanpa emoji, tanpa hijau tua.
import { Compass } from 'lucide-react';

export default function MenuPlaceholderPage({ tab }) {
  if (!tab) return null;
  const { module, l2 } = tab;
  const eyebrow = [module?.label, l2 && l2.label !== tab.label ? l2.label : null]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          background: 'white',
          border: '1px solid var(--line, #E8ECF2)',
          borderRadius: 18,
          padding: '30px 32px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <span
            style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              background: 'var(--p-blue, #E9F1FC)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Compass size={20} strokeWidth={1.8} style={{ color: 'var(--navy, #1B4D8A)' }} />
          </span>

          <div style={{ minWidth: 0 }}>
            {eyebrow && (
              <div
                style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.9px',
                  textTransform: 'uppercase', color: 'var(--faint, #A6AEBD)',
                  marginBottom: 7,
                }}
              >
                {eyebrow}
              </div>
            )}

            <h2
              style={{
                fontFamily: "'Montserrat', system-ui, sans-serif",
                fontSize: 20, fontWeight: 800, lineHeight: 1.25,
                color: 'var(--navy, #1B4D8A)', margin: '0 0 10px',
              }}
            >
              {tab.label}
            </h2>

            {tab.desc && (
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--mute, #7E8899)', margin: 0 }}>
                {tab.desc}
              </p>
            )}

            {tab.note && (
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--faint, #A6AEBD)', margin: '10px 0 0' }}>
                {tab.note}
              </p>
            )}

            <div
              style={{
                marginTop: 20, paddingTop: 16,
                borderTop: '1px solid var(--line, #E8ECF2)',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.5px',
                  padding: '3px 9px', borderRadius: 7,
                  background: 'var(--p-blue, #E9F1FC)', color: 'var(--navy, #1B4D8A)',
                }}
              >
                Bagian 1 — {tab.code}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--faint, #A6AEBD)' }}>
                Belum dibangun. Kerangka menunya sudah disiapkan.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

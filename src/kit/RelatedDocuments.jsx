/* =========================================================================
   RelatedDocuments -- TD-318 Irisan 2 Inquiry, commit 6. Mockup
   design-handoff/mockup/Inquiry Management.dc.html, data-screen-label=
   "Detail/RelatedDocuments": dua kolom Upstream/Downstream, tiap baris
   {type, no, status, date}, keadaan kosong "None yet".

   REUSE, BUKAN DUPLIKASI -- sebelum membangun ini, `LeadDetailPage.jsx`
   (src/modules/crm/lead/pages/) DICEK DULU dan SUDAH punya fungsi lokal
   `RelatedDocuments` sendiri (grid Upstream/Downstream serupa). Fungsi itu
   TIDAK diimpor langsung: ia LOKAL (tidak di-export), memakai token sage kit
   (LINE/CARD/INK dkk dari src/kit/tokens.js), sementara CRM/Inquiry belum
   migrasi kit (brand instruksi task ini: navy/orange/cream). Upstream Lead
   juga berbentuk SATU field statis ("Lead Source"), bukan daftar baris
   seperti mockup Inquiry. Menyalin fungsi itu apa adanya akan MEMBAWA token
   sage ke halaman navy/orange/cream (salah merek) ATAU melahirkan salinan
   lokal kedua yang sama (duplikasi yang justru dilarang instruksi).
   Jalan tengahnya: komponen INI diparameterisasi via prop `tokens` (pola
   RouteStrip/DocumentFlow, dua file lain di folder ini) supaya SATU
   implementasi bisa dipakai kit sage (Lead) maupun navy/orange/cream
   (Inquiry) -- tapi LeadDetailPage.jsx SENDIRI TIDAK disentuh oleh irisan
   ini (di luar scope "Detail Inquiry Overview"); menyatukannya ke sini
   adalah pekerjaan konsolidasi terpisah di masa depan, bukan bagian commit
   ini. Bentuknya juga digeneralisasi: KEDUA kolom di sini adalah daftar
   baris (Upstream Inquiry sungguh berisi >=1 baris dokumen, bukan satu
   field statis seperti Lead), supaya satu sub-render dipakai dua kolom.

   Brand: token dioper dari pemanggil, komponen ini tidak mengimpor token
   sage sendiri.
   ========================================================================= */

// [Putaran 16 Tahap 8, Task 2] badge status netral -- diukur mockup
// (d.st, :449): border #D8E0D2 (t.border, SUDAH ada) / bg #EFF3ED (HEAD_BG)
// / fg #5C6B52 (t.textMute, SUDAH ada). Dipakai saat baris TIDAK mengoper
// `statusTone` sendiri (lihat JSDoc di bawah) -- bg satu-satunya yang belum
// ada di kontrak lama, lewat prop tokens.neutralBg BARU+opsional (default
// ke t.border supaya nol crash kalau pemanggil lama belum mengopernya;
// secara visual beda dari mockup tapi tak pernah terjadi, DealDetailPage.jsx
// SUDAH mengoper C.surfaceAlt = HEAD_BG persis).
function StatusPill({ status, tone, tokens: t }) {
  const bd = tone?.bd || t.border;
  const bg = tone?.bg || t.neutralBg || t.border;
  const fg = tone?.fg || t.textMute;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6, fontFamily: t.fontHead, fontSize: 11, fontWeight: 700, whiteSpace: 'normal', textAlign: 'right', maxWidth: 160, border: `1px solid ${bd}`, background: bg, color: fg }}>
      {status}
    </span>
  );
}

function Column({ title, rows, tokens }) {
  const t = tokens;
  return (
    <div style={{ minWidth: 0 }}>
      {/* [Putaran 16 Tahap 8, Task 2] diukur mockup (g.l, :449): font
          Montserrat 700 11px (t.fontHead, BUKAN t.fontBody/Inter -- selisih
          Tahap 7). */}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: t.textMute, marginBottom: 8, fontFamily: t.fontHead }}>
        {title}
      </div>
      {/* [Putaran 16 Tahap 8, Task 2] pembungkus LINE_SOFT border/radius 10
          kini SELALU dirender (mockup: bungkus baris ATAU "None yet" sama-
          sama di DALAM satu kotak ber-border, bukan hanya saat ada baris --
          selisih Tahap 7). */}
      <div style={{ border: `1px solid ${t.borderSoft}`, borderRadius: 10, overflow: 'hidden' }}>
        {!rows.length ? (
          <div style={{ padding: '8px 12px', fontFamily: t.fontBody, fontSize: 13, fontStyle: 'italic', color: t.textFaint }}>None yet</div>
        ) : (
          rows.map((r, i) => (
            // [Putaran 16 Tahap 8, Task 2] baris jadi GRID 3-kolom persis
            // mockup (d, :449): 96px (type) | minmax(120px,1fr) (no+date
            // bertumpuk) | minmax(0,max-content) (badge status) -- sebelumnya
            // flex kiri-kanan. onClick/cursor/urutan/keadaan kosong TIDAK
            // berubah.
            <div
              key={r.key || `${r.type}-${r.no}-${i}`}
              onClick={r.onClick}
              style={{
                display: 'grid', gridTemplateColumns: '96px minmax(120px,1fr) minmax(0,max-content)', gap: 8, alignItems: 'center', padding: '8px 12px', fontSize: 13,
                cursor: r.onClick ? 'pointer' : 'default',
                borderBottom: i < rows.length - 1 ? `1px solid ${t.borderSoft}` : 'none',
              }}
            >
              <span style={{ color: t.textMute, fontFamily: t.fontBody, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.type}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontFamily: t.fontMono, fontSize: 12.5, fontWeight: 400, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.no}</span>
                {r.date && <span style={{ fontFamily: t.fontBody, fontSize: 11.5, color: t.textFaint }}>{r.date}</span>}
              </span>
              {r.status && <StatusPill status={r.status} tone={r.statusTone} tokens={t} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * @param {Array<{key,type,no,status,date,onClick,statusTone?:{fg,bg,bd}}>} upstream
 * @param {Array<{key,type,no,status,date,onClick,statusTone?:{fg,bg,bd}}>} downstream
 *   `statusTone` (BARU, opsional+aditif, Putaran 16 Tahap 8 Task 2): trio
 *   {fg,bg,bd} badge status baris itu, ditentukan PEMANGGIL dari peta status
 *   yang SUDAH dipakai Nexus untuk dokumen itu (mis. QUO_STATUS quotation) --
 *   komponen ini tidak membuat peta status baru. Tanpa `statusTone`, badge
 *   jatuh ke gaya netral mockup lewat `tokens.neutralBg`/`tokens.border`/
 *   `tokens.textMute`.
 * @param {{border,borderSoft,text,textMute,textFaint,fontHead,fontBody,fontMono,neutralBg?}} tokens
 *   `neutralBg` (BARU, opsional+aditif): latar badge status netral (mockup
 *   #EFF3ED/HEAD_BG). Tanpa itu jatuh ke `tokens.border` (beda visual dari
 *   mockup tapi tak pernah terjadi -- DealDetailPage.jsx SUDAH mengopernya).
 */
export function RelatedDocuments({ upstream, downstream, tokens }) {
  const t = tokens;
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: '#FFFFFF' }}>
      <div style={{ fontFamily: t.fontHead, fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 12 }}>Related Documents</div>
      {/* [Putaran 16 Tahap 8, Task 2] diukur mockup (:449): grid
          repeat(auto-fit,minmax(340px,1fr)) + gap 16px seragam (bukan 1fr 1fr
          tetap + gap 0/32 -- selisih Tahap 7). Kolom kini menciut ke SATU
          baris di bawah ~696px lebar kontainer, bukan selalu dua kolom sama
          lebar. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Column title="Upstream" rows={upstream} tokens={t} />
        <Column title="Downstream" rows={downstream} tokens={t} />
      </div>
    </div>
  );
}

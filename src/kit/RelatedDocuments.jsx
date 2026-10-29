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

function Column({ title, rows, tokens }) {
  const t = tokens;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: t.textMute, marginBottom: 8, fontFamily: t.fontBody }}>
        {title}
      </div>
      {!rows.length ? (
        <div style={{ fontSize: 13, color: t.textFaint, fontFamily: t.fontBody, fontStyle: 'italic' }}>None yet</div>
      ) : (
        /* [Putaran 16] diukur mockup: pembungkus grup baris LINE_SOFT
           (#ECF0E9) -- sama persis nilai t.borderSoft yang sudah dipakai
           border-bottom antar-baris di bawah, BUKAN t.border (LINE,
           #D8E0D2, milik kontainer luar RelatedDocuments). Reuse prop
           yang ada -- nol prop baru. */
        <div style={{ border: `1px solid ${t.borderSoft}`, borderRadius: 10, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div
              key={r.key || `${r.type}-${r.no}-${i}`}
              onClick={r.onClick}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px',
                cursor: r.onClick ? 'pointer' : 'default',
                borderBottom: i < rows.length - 1 ? `1px solid ${t.borderSoft}` : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 12, color: t.textMute, fontFamily: t.fontBody, marginRight: 8 }}>{r.type}</span>
                <span style={{ fontSize: 13.5, color: t.text, fontFamily: t.fontMono, fontWeight: 600 }}>{r.no}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                {r.date && <span style={{ fontSize: 11.5, color: t.textFaint, fontFamily: t.fontBody }}>{r.date}</span>}
                {r.status && <span style={{ fontSize: 11, fontWeight: 600, color: t.textMute, fontFamily: t.fontBody }}>{r.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @param {Array<{key,type,no,status,date,onClick}>} upstream
 * @param {Array<{key,type,no,status,date,onClick}>} downstream
 * @param {{border,borderSoft,text,textMute,textFaint,fontHead,fontBody,fontMono}} tokens
 */
export function RelatedDocuments({ upstream, downstream, tokens }) {
  const t = tokens;
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: '#FFFFFF' }}>
      <div style={{ fontFamily: t.fontHead, fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 12 }}>Related Documents</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
        <Column title="Upstream" rows={upstream} tokens={t} />
        <Column title="Downstream" rows={downstream} tokens={t} />
      </div>
    </div>
  );
}

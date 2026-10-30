/* =========================================================================
   DocumentFlow -- TD-318 Irisan 2 Inquiry, commit 5. Mockup
   design-handoff/mockup/Inquiry Management.dc.html, data-screen-label=
   "Detail/DocumentFlow": rantai dokumen Lead -> Inquiry -> Rate Request ->
   Quotation -> Sales Order -> Purchase Order -> Job Order -> Carrier Booking
   -> Invoice, satu baris klik ke tiap dokumen.

   PEMETAAN ISTILAH mockup -> Nexus (BUKAN disalin verbatim -- mockup pakai
   CRM fiktif sendiri):
     - "Rate Request" mockup = PRF di Nexus (nama tab/dokumen yang SUDAH ada,
       Den eksplisit: nama & isi tab PRF TIDAK diubah -- memakai istilah
       "Rate Request" di sini akan melahirkan DUA nama untuk SATU dokumen).
     - "Lead"/node pertama = `accounts` (prospect_id inquiry ini), label
       "Lead" vs "Customer" dari `accounts.lifecycle_stage==='customer'`
       (kolom NYATA, bukan tebakan -- lihat pemanggilan di DealDetailPage.jsx).

   DIHILANGKAN dari mockup, DILAPORKAN bukan ditebak:
     - Badge "New" di header (`hl`) -- murni anotasi alat mockup sendiri
       (NEXUS_WC), bukan elemen produk.
     - Sub-blok "Internal Work Order" di bawah node Sales Order -- Nexus
       TIDAK punya tabel/konsep IWO/PIB sama sekali hari ini (nol hit di
       seluruh src/). Bukan "datanya kosong", kolomnya tidak ada.

   Node "Sales Order" dan "Purchase Order" SELALU render "Not yet" --
   BUKAN karena Nexus tidak punya konsep itu sama sekali (trigger
   `set_inquiry_won_on_so` membuktikan tabel `sales_orders` ADA), tapi
   karena halaman ini tidak mem-fetch tabel itu, dan menambah fetch ke
   tabel yang belum dipakai halaman ini adalah query baru yang TIDAK
   diminta (DoD: "Tidak ada query baru yang tidak perlu"). Node "Job
   Order"/"Carrier Booking"/"Invoice" SELALU "Not yet" DI MOCKUP SENDIRI
   (hardcode `none:true`, modul itu belum ada di CRM fiktif mockup juga)
   -- jadi perlakuan "Not yet" permanen untuk kelima node terakhir ini
   konsisten dengan presedennya sendiri di mockup.

   Brand: navy/orange/cream (instruksi eksekusi task ini) -- token dioper
   dari pemanggil, komponen ini tidak mengimpor kit sage. Satu pengecualian
   (Putaran 16): `SHADOW_POPOVER` diimpor LANGSUNG dari `./tokens` untuk
   boxShadow dropdown IWO -- sebelumnya literal lama `rgba(27,77,138,.16)`
   (navy pra-sage, tersisa sejak brand file ini belum berganti), bukan
   warna brand file ini sendiri yang perlu diganti lewat prop.

   FIX (bug fix round, Task 3): node Lead (state 'name') tampil beda dari
   node lain -- ikon terdorong ke atas teks, bukan sebaris -- untuk nilai
   panjang (nama akun, bisa jauh lebih panjang dari kode/nomor dokumen node
   lain). Mockup pakai `<a>` untuk link doc/name/multi (bukan `<button>`);
   `<button>` (dipakai di sini, demi semantik interaktif yang benar --
   bukan `<a href="#">` dummy ala mockup) TIDAK otomatis mewarisi
   `min-width:0` dari parent flex-nya sendiri sebagai elemen pengganti
   (replaced-like) -- tanpa `display:'block'` + `minWidth:0` eksplisit PADA
   BUTTON ITU SENDIRI, teks panjang menolak menyusut, memaksa flex-wrap
   outer node membungkus ikon ke baris sendiri. Ditambahkan ke button
   doc/name/multi SELURUHNYA (bukan hanya Lead) -- struktur sama untuk
   semua node, bukan tambalan khusus satu node.
   ========================================================================= */
import { useState } from 'react';
import {
  UserRound, FileSearch, Inbox, FileText, ClipboardCheck, ShoppingCart,
  Wrench, Ship, Receipt, ChevronDown,
} from 'lucide-react';
import { SHADOW_POPOVER } from './tokens';

const ICON_MAP = {
  lead: UserRound,
  inquiry: FileSearch,
  prf: Inbox,
  quotation: FileText,
  salesOrder: ClipboardCheck,
  purchaseOrder: ShoppingCart,
  jobOrder: Wrench,
  carrierBooking: Ship,
  invoice: Receipt,
};

/**
 * @param {Array<{
 *   type: keyof ICON_MAP, label: string, active?: boolean,
 *   state: 'doc'|'name'|'multi'|'none', value?: string,
 *   onClick?: () => void, items?: Array<{label:string, onClick:()=>void}>,
 * }>} nodes
 * @param {{border:string, text:string, textMute:string, activeBg:string, linkColor:string, textFaint?:string, hoverBg?:string}} tokens
 *   `textFaint` opsional (Putaran 16) -- dipakai KHUSUS teks "Not yet"
 *   (mockup: INK_FAINT, beda dari label node yang INK_SOFT/textMute).
 *   Tidak diisi -> jatuh ke `t.textMute`, keluaran byte-sama utk pemanggil
 *   lama (satu-satunya hari ini: DealDetailPage.jsx).
 *   `hoverBg` opsional BARU (Putaran 16 Tahap 8, Task 3) -- latar hover item
 *   dropdown cabang "multi" (mockup #E4EDDE/ROW_HOVER). Tidak diisi -> nol
 *   hover, byte-identik perilaku lama.
 */
export function DocumentFlow({ nodes, tokens }) {
  const t = tokens;
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: '700 11px Montserrat, sans-serif', color: t.textMute, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        Document Flow
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', border: `1px solid ${t.border}`, borderRadius: 10, background: '#FFFFFF' }}>
        {nodes.map((n, i) => {
          const Icon = ICON_MAP[n.type] || FileText;
          const dim = n.state === 'none' ? 0.5 : 1;
          return (
            <div key={n.label} style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 12px', background: n.active ? t.activeBg : '#FFFFFF', borderLeft: i ? `1px solid ${t.border}` : '1px solid transparent', minWidth: 0 }}>
              <span style={{ width: 28, height: 28, borderRadius: 14, background: '#FFFFFF', border: `1px solid ${t.border}`, color: t.textMute, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', opacity: dim }}>
                <Icon size={14} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, opacity: dim }}>
                <span style={{ font: '600 11px Inter, sans-serif', color: t.textMute }}>{n.label}</span>
                {n.state === 'doc' && (
                  <button type="button" onClick={n.onClick} style={{ display: 'block', minWidth: 0, maxWidth: '100%', border: 0, background: 'transparent', padding: 0, textAlign: 'left', font: "400 12px 'IBM Plex Mono', monospace", color: t.linkColor, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    {n.value}
                  </button>
                )}
                {n.state === 'name' && (
                  <button type="button" onClick={n.onClick} style={{ display: 'block', minWidth: 0, maxWidth: '100%', border: 0, background: 'transparent', padding: 0, textAlign: 'left', font: '500 12.5px Inter, sans-serif', color: t.linkColor, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    {n.value}
                  </button>
                )}
                {n.state === 'multi' && (
                  <button type="button" onClick={() => setOpenIdx((v) => (v === i ? null : i))} style={{ minWidth: 0, maxWidth: '100%', border: 0, background: 'transparent', padding: 0, font: '600 12.5px Inter, sans-serif', color: t.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{n.value}</span><ChevronDown size={14} style={{ flex: 'none' }} />
                  </button>
                )}
                {n.state === 'none' && (
                  <span style={{ font: "italic 400 12.5px Inter, sans-serif", color: t.textFaint || t.textMute }}>Not yet</span>
                )}
              </div>
              {n.state === 'multi' && openIdx === i && (
                <div style={{ position: 'absolute', top: '100%', left: 8, zIndex: 30, marginTop: 4, background: '#FFFFFF', border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: SHADOW_POPOVER, padding: 4, display: 'flex', flexDirection: 'column', minWidth: 200 }}>
                  {/* [Putaran 16 Tahap 8, Task 3] hover item dropdown cabang --
                      diukur mockup (n.items, style-hover="background:#E4EDDE").
                      `t.hoverBg` BARU, opsional+aditif -- tanpa itu hover tetap
                      nol (byte-identik perilaku lama); DealDetailPage.jsx
                      SATU-SATUNYA pemanggil, mengoper C.navySoft = ROW_HOVER =
                      #E4EDDE persis. Inline onMouseEnter/Leave (bukan CSS
                      :hover) -- pola yang sama dgn dropdown mention
                      InquiryChatter.jsx, komponen ini tak punya <style> scoped
                      sendiri. */}
                  {(n.items || []).map((x) => (
                    <button key={x.label} type="button" onClick={() => { setOpenIdx(null); x.onClick?.(); }}
                      style={{ border: 0, background: 'transparent', textAlign: 'left', padding: '8px 12px', borderRadius: 8, font: "400 12.5px 'IBM Plex Mono', monospace", color: t.text, cursor: 'pointer' }}
                      onMouseEnter={t.hoverBg ? (e) => { e.currentTarget.style.background = t.hoverBg; } : undefined}
                      onMouseLeave={t.hoverBg ? (e) => { e.currentTarget.style.background = 'transparent'; } : undefined}>
                      {x.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

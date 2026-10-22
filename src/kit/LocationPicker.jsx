/* =========================================================================
   LocationPicker -- Inquiry Management Irisan 6.
   Dibangun PERSIS design-handoff/mockup/LocationSelect.dc.html (komponen
   bersama picker lokasi) + Location Master.dc.html (badge/warna chip type).

   KOMPONEN INI MURNI PRESENTASIONAL -- pola sama src/kit/MasterSelect.jsx:
   nol Supabase/useAuth di sini. Pemanggil bertanggung jawab atas:
     1. Fetch `options` (array {id, code, name, country, type} dari tabel
        `locations`, biasanya SEKALI per halaman lalu dioper ke beberapa
        instance picker -- dua picker POL+POD di satu form tidak perlu
        fetch dua kali).
     2. Memutuskan peran lewat `onManage`/`onRequest` (KEBERADAAN prop,
        BUKAN sebuah prop `role` string -- filosofi sama MasterSelect):
          a. `onManage` ADA  -> link "Manage in Location Master" (Manager/
             GM, mockup `isMgr`).
          b. `onRequest(name, note)` ADA -> baris "Request new option"
             (role lain, mockup `notMgr`) -- diklik membuka mini-form
             inline nama+catatan (mockup TIDAK menentukan persistensi sama
             sekali, badan `onRequest` di sana cuma
             `p.onRequest(p.label || 'Location')`; default yang
             diinstruksikan untuk app ini: pemanggil memanggil RPC
             request_new_location, lihat InquiryFormPage.jsx/
             DealDetailPage.jsx).
          Independen, bukan if/else -- kalau keduanya ada, keduanya tampil.

   Brand: TOKEN-AGNOSTIC lewat prop `tokens` (pola sama src/kit/RouteStrip.jsx/
   DocumentFlow.jsx/RelatedDocuments.jsx) -- Inquiry/CRM belum pada gilirannya
   migrasi ke kit sage (kebijakan "kit ada != boleh diimpor di luar giliran
   Batch DS"), jadi warna TIDAK dihardcode sage di sini. Default jatuh ke
   hex sage mockup (dipakai kalau tidak ada tokens dioper) supaya komponen
   tetap utuh dipakai mandiri/di halaman yang sudah sage nanti.

   Posisi popover: `position:fixed` dihitung dari getBoundingClientRect()
   tombol pemicu, flip ke sisi yang ruangnya lebih besar (atas/bawah) --
   DIHITUNG ULANG (bukan sekali saat dibuka) oleh `computePosition()`,
   dipanggil `toggle()` SAAT MEMBUKA dan effect scroll/resize SELAMA
   popover terbuka, supaya tetap menempel tombol pemicu dan bisa membalik
   arah kalau ruang berubah (mis. keyboard layar tablet muncul/hilang).
   [Bugfix, laporan Vir/Den] Tinggi popover TIDAK LAGI nilai tetap 330px
   (mockup) -- dihitung dari ruang yang benar-benar tersedia, dengan
   `window.visualViewport?.height` sbg sumber tinggi viewport kalau ada
   (mengecilkan diri saat keyboard layar muncul, beda dari
   `window.innerHeight` yang tidak selalu ikut berubah). Scroll DI DALAM
   popover sendiri (daftar hasil overflow) TIDAK menutup popover -- hanya
   scroll di LUAR-nya (halaman/container induk) yang menggeser posisi, dan
   HANYA menutup kalau tombol pemicu sudah sepenuhnya keluar viewport;
   resize/visualViewport TIDAK PERNAH menutup, hanya menghitung ulang.
   Tanpa portal (beda dari MasterSelect) karena pemakai pertama
   (InquiryFormPage/DealDetailPage) adalah halaman penuh, bukan di dalam
   Modal ber-overflow -- fixed positioning sudah cukup.

   "Not recorded" (mockup): value teks ADA (`textValue`) tapi `value` (ID)
   tidak merujuk opsi mana pun -- badge amber, bukan ditebak/dipaksa cocok.
   ========================================================================= */
import { useEffect, useRef, useState } from 'react';

const DEFAULT_TOKENS = {
  bg: '#F6F8F3', card: '#FFFFFF', border: '#D8E0D2', text: '#33422B', textMute: '#5C6B52',
  placeholder: '#838E7A', hover: '#E4EDDE', divider: '#ECF0E9',
  warnBg: '#F8ECCF', warnBorder: '#E6CE94', warnText: '#8E620D',
};

const VARIANT_SIZE = { cell: 36, field: 56, box: 44 };

// Geometri popover (bugfix laporan Vir/Den -- lihat header file). Nilai
// non-MARGIN/TRIGGER_GAP di bawah adalah PERKIRAAN tinggi elemen non-list
// di dalam popover (search box + divider + baris Manage/Request) --
// popover belum ter-render saat posisi dihitung, jadi tak bisa diukur DOM
// langsung; dipilih supaya cocok dgn nilai style literal JSX di bawah
// (search box height:40, wrapper padding:4 + gap:4, divider height:1,
// baris aksi ~36px). Dipakai HANYA utk menyisakan ruang supaya search box
// + baris Manage/Request SELALU terlihat -- bukan patokan px presisi.
const MARGIN = 8;        // jarak minimum dari tepi viewport yang TERLIHAT
const TRIGGER_GAP = 4;   // jarak popover ke tombol pemicu
const MIN_LIST_H = 96;   // lantai daftar hasil -- tak pernah lenyap total di layar sangat sempit
const SEARCH_ROW_H = 40;
const POPOVER_GAP = 4;
const DIVIDER_H = 1;
const ACTION_ROW_H = 36;
const POPOVER_PADDING = 4;

// `window.visualViewport` mengecilkan diri saat keyboard layar muncul
// (tablet/HP) -- `window.innerHeight` tidak selalu ikut berubah. Dipakai
// di SEMUA perhitungan geometri di bawah supaya popover tidak menghitung
// ruang yang sebenarnya sudah ditutup keyboard.
function viewportSize() {
  return {
    h: window.visualViewport?.height ?? window.innerHeight,
    w: window.visualViewport?.width ?? window.innerWidth,
  };
}

function isTriggerFullyOutOfView(rect) {
  const { h, w } = viewportSize();
  return rect.bottom <= 0 || rect.top >= h || rect.right <= 0 || rect.left >= w;
}

// Posisi + ukuran popover -- DIHITUNG ULANG tiap dipanggil (bukan sekali
// saat dibuka): toggle() memanggilnya SAAT MEMBUKA, dan effect scroll/
// resize memanggilnya ULANG SELAMA popover terbuka, supaya ia ikut
// menempel tombol pemicu dan bisa membalik arah kalau ruang yang tersedia
// berubah (scroll halaman, atau keyboard layar muncul/hilang).
function computePosition(rect, hasFooter) {
  const { h: viewportH, w: viewportW } = viewportSize();
  const width = Math.max(rect.width, 300);
  const left = Math.min(rect.left, Math.max(MARGIN, viewportW - width - MARGIN));

  const spaceBelow = viewportH - rect.bottom - MARGIN;
  const spaceAbove = rect.top - MARGIN;
  const openUp = spaceAbove > spaceBelow; // sisi yang ruangnya LEBIH BESAR, bukan nilai tetap
  const available = Math.max(0, openUp ? spaceAbove : spaceBelow);

  const chromeReserve = POPOVER_PADDING * 2 + SEARCH_ROW_H + POPOVER_GAP
    + (hasFooter ? POPOVER_GAP + DIVIDER_H + POPOVER_GAP + ACTION_ROW_H : 0);
  const listMaxHeight = Math.max(MIN_LIST_H, available - chromeReserve);
  const popoverHeight = chromeReserve + listMaxHeight;

  const top = openUp
    ? Math.max(MARGIN, rect.top - TRIGGER_GAP - popoverHeight)
    : rect.bottom + TRIGGER_GAP;

  return { top, left, width, listMaxHeight };
}

function TypeBadge({ type, tokens }) {
  if (!type) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid ' + tokens.border, background: tokens.bg, color: tokens.textMute, whiteSpace: 'nowrap' }}>
      {type}
    </span>
  );
}

export default function LocationPicker({
  label, required = false, variant = 'box', placeholder = 'Select location',
  value = null,          // locations.id terpilih, atau null
  textValue = '',         // nilai teks lama (inquiries.pol/pod) -- untuk badge "Not recorded"
  options = [],           // [{id, code, name, country, type}]
  onChange,               // (locationId, location) => void
  onManage,               // optional -- link "Manage in Location Master"
  onRequest,              // optional -- (name, note) => void, "Request new option"
  invalid = false,
  disabled = false,
  tokens: tokensProp,
}) {
  const tokens = tokensProp || DEFAULT_TOKENS;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300, listMaxHeight: 260 });
  const [requesting, setRequesting] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqNote, setReqNote] = useState('');
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const current = options.find((o) => o.id === value) || null;
  const hasVal = !!(value || (textValue || '').trim());
  // "Not recorded": nilai teks ADA tapi tidak (lagi) merujuk opsi master manapun.
  const notRecorded = hasVal && !current;
  // Dipakai computePosition() utk menyisakan ruang bagi baris Manage/
  // Request -- boolean primitif (bukan identitas fungsi onManage/onRequest
  // itu sendiri) supaya dependency effect di bawah stabil lintas render.
  const hasFooter = !!(onManage || onRequest);

  useEffect(() => {
    if (!open) return undefined;

    const onOutsideStart = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Resize/visualViewport -- TIDAK PERNAH menutup (bugfix: keyboard
    // layar tablet memicu 'resize', dulu ikut menutup popover). Hanya
    // menghitung ulang posisi + tinggi daftar.
    const recompute = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos(computePosition(r, hasFooter));
    };
    // Scroll -- DIBEDAKAN dari resize: scroll DI DALAM popover sendiri
    // (daftar hasil overflow) diabaikan total (bugfix: dulu capture=true
    // menutup popover begitu daftarnya sendiri digulung). Scroll di LUAR
    // popover (halaman/container induk) menggeser posisi tombol pemicu --
    // popover ikut menempel, dan HANYA menutup kalau tombol pemicu sudah
    // sepenuhnya keluar viewport.
    const onWindowScroll = (e) => {
      if (popRef.current?.contains(e.target)) return;
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) { setOpen(false); return; }
      if (isTriggerFullyOutOfView(r)) { setOpen(false); return; }
      setPos(computePosition(r, hasFooter));
    };

    document.addEventListener('mousedown', onOutsideStart);
    document.addEventListener('touchstart', onOutsideStart);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onWindowScroll, true);
    window.addEventListener('resize', recompute);
    window.visualViewport?.addEventListener('resize', recompute);
    window.visualViewport?.addEventListener('scroll', recompute);
    return () => {
      document.removeEventListener('mousedown', onOutsideStart);
      document.removeEventListener('touchstart', onOutsideStart);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onWindowScroll, true);
      window.removeEventListener('resize', recompute);
      window.visualViewport?.removeEventListener('resize', recompute);
      window.visualViewport?.removeEventListener('scroll', recompute);
    };
  }, [open, hasFooter]);

  const toggle = () => {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(computePosition(r, hasFooter));
    setQ('');
    setRequesting(false);
    setOpen(true);
  };

  const qLower = q.trim().toLowerCase();
  const filtered = options.filter((o) => {
    if (!o.active && o.id !== value) return false; // opsi aktif saja, kecuali yang sedang terpilih
    if (!qLower) return true;
    const hay = [o.code, o.name, ...(o.aliases || [])].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(qLower);
  });

  const pick = (o) => {
    setOpen(false);
    onChange?.(o.id, o);
  };

  const submitRequest = () => {
    const name = reqName.trim();
    if (!name) return;
    onRequest?.(name, reqNote.trim() || null);
    setOpen(false);
    setRequesting(false);
    setReqName('');
    setReqNote('');
  };

  const h = VARIANT_SIZE[variant] || VARIANT_SIZE.box;
  const shown = current ? `${current.code}, ${current.name}` : (textValue || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', minWidth: 0 }}>
      {variant === 'box' && label && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 12px Inter,sans-serif', color: tokens.textMute }}>
          {label}{required && <span style={{ color: tokens.warnText }}>*</span>}
        </span>
      )}
      <button
        type="button" ref={btnRef} onClick={toggle} disabled={disabled}
        style={{
          height: h, width: '100%', borderRadius: 10, border: '1px solid ' + (invalid ? tokens.warnBorder : tokens.border),
          background: tokens.bg, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, color: tokens.text, font: '400 13.5px Inter,sans-serif', cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left', minWidth: 0, opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          {hasVal ? (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</span>
          ) : (
            <span style={{ fontStyle: 'italic', color: tokens.placeholder, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placeholder}</span>
          )}
          {notRecorded && (
            <span title="This place is not in Location Master yet. Ask admin to add it."
              style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid ' + tokens.warnBorder, background: tokens.warnBg, color: tokens.warnText }}>
              Not recorded
            </span>
          )}
        </span>
        <svg viewBox="0 0 24 24" width="16" height="16" style={{ fill: 'none', stroke: tokens.textMute, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {current?.type === 'FTZ' && (
        <div style={{ fontSize: 12, color: tokens.warnText, background: tokens.warnBg, border: '1px solid ' + tokens.warnBorder, borderRadius: 8, padding: '8px 10px' }}>
          {current.name} is a Free Trade Zone. Customs documents and duty and tax treatment differ from regular import and export. Goods moving out of the zone to other parts of Indonesia are treated as imports.
        </div>
      )}

      {open && (
        <div ref={popRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 300,
          background: tokens.card, border: '1px solid ' + tokens.border, borderRadius: 10,
          boxShadow: '0 12px 32px rgba(51,66,43,.16)', padding: 4, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {!requesting && (
            <>
              <span style={{ height: 40, border: '1px solid ' + tokens.border, borderRadius: 10, background: tokens.bg, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, color: tokens.placeholder }}>
                <svg viewBox="0 0 24 24" width="14" height="14" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or name"
                  style={{ flex: 1, minWidth: 0, height: 36, border: 0, background: 'transparent', outline: 'none', font: '400 13.5px Inter,sans-serif', color: tokens.text }} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: pos.listMaxHeight, overflowY: 'auto' }}>
                {filtered.map((o) => (
                  <button key={o.id} type="button" onClick={() => pick(o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: 0, borderRadius: 8, background: current?.id === o.id ? tokens.bg : 'transparent', color: tokens.text, font: '400 13.5px Inter,sans-serif', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ font: "600 12.5px 'IBM Plex Mono',monospace", width: 56, flex: 'none', color: tokens.textMute }}>{o.code}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                      <span style={{ fontSize: 12, color: tokens.textMute }}>{[o.type, o.country].filter(Boolean).join(', ')}</span>
                    </span>
                    <TypeBadge type={o.type === 'FTZ' ? 'FTZ' : null} tokens={tokens} />
                  </button>
                ))}
                {filtered.length === 0 && (
                  <span style={{ padding: 12, fontSize: 13, color: tokens.textMute }}>Location not found. Ask admin to add it in Location Master.</span>
                )}
              </div>
              {(onManage || onRequest) && <div style={{ height: 1, background: tokens.divider, margin: '0 4px' }} />}
              {onManage && (
                <button type="button" onClick={() => { setOpen(false); onManage(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: 8, background: 'transparent', color: tokens.text, font: '600 12.5px Inter,sans-serif', cursor: 'pointer', textAlign: 'left' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                  Manage in Location Master
                </button>
              )}
              {!onManage && onRequest && (
                <button type="button" onClick={() => { setReqName(q); setRequesting(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: 8, background: 'transparent', color: tokens.text, font: '600 13.5px Inter,sans-serif', cursor: 'pointer', textAlign: 'left' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                  Request new option
                </button>
              )}
            </>
          )}

          {requesting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
              <span style={{ font: '600 12.5px Inter,sans-serif', color: tokens.text }}>Request new location</span>
              <input value={reqName} onChange={(e) => setReqName(e.target.value)} placeholder="Location name"
                style={{ height: 36, borderRadius: 8, border: '1px solid ' + tokens.border, padding: '0 10px', font: '400 13px Inter,sans-serif', color: tokens.text, outline: 'none' }} />
              <textarea value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Note (optional)" rows={2}
                style={{ borderRadius: 8, border: '1px solid ' + tokens.border, padding: 8, font: '400 13px Inter,sans-serif', color: tokens.text, outline: 'none', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setRequesting(false)} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid ' + tokens.border, background: 'transparent', color: tokens.textMute, cursor: 'pointer', font: '600 12.5px Inter,sans-serif' }}>Cancel</button>
                <button type="button" onClick={submitRequest} disabled={!reqName.trim()} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 0, background: tokens.textMute, color: '#fff', cursor: reqName.trim() ? 'pointer' : 'not-allowed', opacity: reqName.trim() ? 1 : 0.6, font: '700 12.5px Inter,sans-serif' }}>Submit request</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

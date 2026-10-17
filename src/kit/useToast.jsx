/* =========================================================================
   useToast — toast lokal per halaman (pindahan AdminKit; 10 halaman admin
   masih memakainya). File ini HANYA meng-export hook — bukan komponen —
   supaya lolos react-refresh/only-export-components.

   Pemakaian (kontrak lama, utuh):
     const [toast, toastNode] = useToast();
     toast('Tersimpan');                 // ikon sukses
     toast('Gagal menyimpan', 'error');  // ikon peringatan, aksen danger
     toast('Diproses', 'refresh');       // nama ikon registri apa pun
     … return (<>{page}{toastNode}</>);

   Bukan pengganti `showToast` global App.jsx — itu jalur lain (keduanya
   sengaja direstyle ke kotak yang sama persis, TD-318 Irisan Kit item 5,
   tapi tetap dua sistem terpisah — lihat 08_TECH_DEBT.md). Warna: latar INK,
   teks WHITE; ikon sukses ACCENT, ikon error/info warna `SEMANTIC.*.fg`.
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Icon from './Icon';
import { INK, WHITE, ACCENT, SEMANTIC, FONT_BODY, RADIUS, Z } from './tokens';

const TYPE_ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TYPE_COLOR = { success: ACCENT, error: SEMANTIC.danger.fg, info: SEMANTIC.info.fg };

export default function useToast(duration = 2400) {
  const [toast, setToast] = useState({ show: false, msg: '', kind: 'success' });
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const fire = useCallback((msg, kind) => {
    clearTimeout(timer.current);
    setToast({ show: true, msg, kind: kind || 'success' });
    timer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), duration);
  }, [duration]);

  const Typed = TYPE_ICON[toast.kind];
  const node = (
    // TD-318 Irisan Kit, item 5 (restyle, keputusan Den): kotak disamakan ke
    // mockup toastIn (Lead Management.dc.html :425) -- INK solid, teks WHITE,
    // radius/shadow/padding persis spek. Posisi digeser ke `bottom:88` (bukan
    // 24 seperti mockup) KHUSUS sistem kit ini supaya tidak bertumpuk dengan
    // toast global App.jsx (showToast) yang menempati `bottom:24` persis
    // mockup -- kedua sistem SENGAJA belum disatukan (lihat 08_TECH_DEBT.md),
    // jadi kalau keduanya tampil bersamaan ia naik di ATAS toast global,
    // bukan menimpanya. Signature hook (`useToast(duration)` -> `[fire,
    // node]`) dan kontrak `kind` bebas-string (fallback <Icon name={kind}/>
    // utk nama registri apa pun selain success/error/info) TIDAK berubah.
    <div
      role="status" aria-live="polite"
      style={{
        position: 'fixed', left: '50%', bottom: 88, display: 'flex', alignItems: 'center', gap: 10,
        background: INK, color: WHITE, padding: '12px 16px', borderRadius: RADIUS.md,
        fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500,
        boxShadow: '0 12px 32px rgba(51,66,43,.25)', zIndex: Z.toast,
        transition: 'opacity .2s ease-out, transform .2s ease-out',
        opacity: toast.show ? 1 : 0,
        transform: toast.show ? 'translate(-50%, 0)' : 'translate(-50%, 12px)',
        pointerEvents: 'none',
      }}
    >
      {Typed
        ? <Typed size={18} color={TYPE_COLOR[toast.kind]} />
        : <Icon name={toast.kind} size={18} color={ACCENT} />}
      {toast.msg}
    </div>
  );
  return [fire, node];
}

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

   Bukan pengganti `showToast` global App.jsx — itu jalur lain. Warna: latar
   INK, teks BG (10:1); ikon sukses ACCENT (7,1:1 di INK), ikon error tint
   danger (kelas status).
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Icon from './Icon';
import { INK, BG, ACCENT, SEMANTIC, FONT_BODY, RADIUS, Z, SHADOW_2 } from './tokens';

const TYPE_ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TYPE_COLOR = { success: ACCENT, error: SEMANTIC.danger.bg, info: BG };

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
    <div
      role="status" aria-live="polite"
      style={{
        position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 10,
        background: INK, color: BG, padding: '13px 18px', borderRadius: RADIUS.md + 2,
        fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500, boxShadow: SHADOW_2, zIndex: Z.toast,
        transition: 'opacity .25s ease, transform .25s ease',
        opacity: toast.show ? 1 : 0, transform: toast.show ? 'translateY(0)' : 'translateY(10px)', pointerEvents: 'none',
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

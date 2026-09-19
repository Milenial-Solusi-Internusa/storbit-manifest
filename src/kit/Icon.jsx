/* =========================================================================
   Icon — pembungkus lucide-react lewat NAMA (registri), dipertahankan sebagai
   KOMPATIBILITAS untuk 13 halaman admin yang menulis `<Icon name="pencil"/>`
   (keputusan #8). Komponen BARU tetap mengimpor Lucide langsung —
   `import { Pencil } from 'lucide-react'` — jangan memperluas registri ini
   untuk kebutuhan baru.

   Registri = 66 nama, PERSIS `admin-settings/kit.jsx:31-49`, supaya migrasi
   Batch DS 2 nol perubahan perilaku (nama tak dikenal → `Info`, sama seperti
   dulu). Halaman yang memakai nama di luar daftar ini (mis. ProductsPage
   "box"/"building") punya `Icon` lokalnya sendiri, bukan yang ini.
   ========================================================================= */

import {
  ChevronRight, ChevronLeft, ChevronDown, ArrowLeft, ArrowRight, Building2,
  FileText, Coins, GitBranch, Bell, Shield, ClipboardList, Settings, Plug,
  Plus, Minus, Check, CheckCircle2, X, Pencil, Trash2, Lock, Upload, Image,
  Stamp, PenTool, RefreshCw, Loader, Info, AlertTriangle, Hash, Layout,
  Receipt, Search, Inbox, Quote, ShoppingCart, Globe, MapPin, Phone, Mail,
  Globe2, Calendar, Landmark, Percent, Wallet, Scale, Clock, Banknote,
  AlignLeft, AlignCenter, AlignRight,
  Smartphone, User, Filter, Download, MessageCircle, Webhook, KeyRound,
  Signal, Zap, Link2, Copy, Eye, EyeOff, Layers,
} from 'lucide-react';

const ICONS = {
  chevright: ChevronRight, chevleft: ChevronLeft, chevdown: ChevronDown,
  arrowleft: ArrowLeft, arrowright: ArrowRight, building2: Building2,
  filetext: FileText, coins: Coins, gitbranch: GitBranch, bell: Bell,
  shield: Shield, clipboard: ClipboardList, settings: Settings, plug: Plug,
  plus: Plus, minus: Minus, check: Check, checkcircle: CheckCircle2, x: X,
  pencil: Pencil, trash: Trash2, lock: Lock, upload: Upload, image: Image,
  stamp: Stamp, pen: PenTool, refresh: RefreshCw, loader: Loader, info: Info,
  alert: AlertTriangle, hash: Hash, layout: Layout, receipt: Receipt,
  search: Search, inbox: Inbox, quote: Quote, shoppingcart: ShoppingCart,
  globe: Globe, mappin: MapPin, phone: Phone, mail: Mail, globe2: Globe2,
  calendar: Calendar, bank: Landmark, percent: Percent, wallet: Wallet,
  scale: Scale, clock: Clock, banknote: Banknote, alignleft: AlignLeft,
  aligncenter: AlignCenter, alignright: AlignRight,
  smartphone: Smartphone, user: User, filter: Filter, download: Download,
  messagecircle: MessageCircle, webhook: Webhook, key: KeyRound,
  signal: Signal, zap: Zap, link2: Link2, copy: Copy, eye: Eye, eyeoff: EyeOff,
  layers: Layers,
};

/**
 * @param {Object} props
 * @param {string} props.name        - kunci registri (lihat ICONS)
 * @param {number} [props.size=18]
 * @param {string} [props.color]     - default `currentColor`
 * @param {number} [props.strokeWidth=1.7]
 * @param {Object} [props.style]
 */
export default function Icon({ name, size = 18, color, style, strokeWidth = 1.7 }) {
  const Cmp = ICONS[name] || Info;
  return (
    <Cmp
      size={size}
      color={color || 'currentColor'}
      strokeWidth={strokeWidth}
      style={{ display: 'block', flex: '0 0 auto', ...style }}
    />
  );
}

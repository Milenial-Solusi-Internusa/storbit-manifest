/* =========================================================================
   Nexus Kit — barrel KOMPONEN (Batch DS 1). Token diimpor terpisah, path
   relatif (repo tidak punya alias `@`), mis. dari `src/modules/crm/`:
     import { Button, Card, ListView } from '../../kit';
     import { INK, SP, RADIUS } from '../../kit/tokens';
   (pola dua kit lama: `kit.jsx` + `tokens.js` berpasangan).

   ⛔ STATUS 20 Sep 2026: KODE MATI — belum satu halaman pun mengimpornya.
   Konsumen pertama masuk di Batch DS 2 (AdminKit → kit).

   Bagian ALIAS di bawah = nama lama dua kit (PrimaryBtn, OutlineBtn,
   KitSelect, Skel, Tabs) supaya diff migrasi tiap halaman cukup path impor;
   DICABUT di Batch DS 7. `KitStyles` SENGAJA tidak dialiaskan — gantinya
   `kit.css` yang diimpor sekali di main.jsx (Batch DS 2).
   ========================================================================= */

export { Button, SaveButton, IconButton } from './Button';
export {
  FloatingInput, FloatingSelect, Select, Textarea, SearchInput,
  Toggle, NumberStepper, Segmented, PillToggle, EntitySwitcher,
} from './Form';
export { PageHeader, SectionLabel, Card, EmptyState, Skeleton, DocNo, FormSheet, Notebook } from './Layout';
export { Badge, StatusBar, ListView } from './Data';
export { Modal, SlideOver, Tooltip } from './Overlay';
export { DropZone, UploadBox } from './Upload';
export { default as Icon } from './Icon';
export { default as useToast } from './useToast';

/* ---------- ALIAS kompatibilitas — dicabut Batch DS 7 ---------- */
export { PrimaryBtn, OutlineBtn } from './Button';
export { KitSelect } from './Form';
export { Skel, Tabs } from './Layout';

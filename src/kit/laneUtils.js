// src/kit/laneUtils.js
// Helper murni (nol JSX) untuk lane POL/POD/Mode/Load unit -- dipisah dari
// LaneTable.jsx karena react-refresh/only-export-components menolak file
// komponen mengekspor apa pun selain komponen (pola sama tokens.js).
// Dipakai BERSAMA oleh InquiryIntakeWizardPage.jsx, DealDetailPage.jsx, dan
// LaneTable.jsx sendiri.

// Mode-default load unit, meniru modeOf()/startLanes mockup (Inquiry
// Management.dc.html baris 949): Sea FCL -> Container, selain itu CBM.
export const unitForMode = (mode) => (mode === 'Sea FCL' ? 'Container' : 'CBM');

// Mode default dari tipe kontainer, PERSIS modeOf() mockup (baris 743):
// "(f.cont||[]).some(c => c.indexOf('FCL')===0) ? 'Sea FCL' : 'Sea LCL'".
// Dipakai di DUA sisi (wizard: blankLane/startLanes/addLane/handleCreate
// jalur satu-lane; Detail Inquiry: draft awal lane tunggal yang disintesis
// dari inquiry lama ber-0-baris inquiry_lanes) supaya derivasinya SATU
// sumber, bukan dua salinan yang bisa melenceng.
export const deriveLaneMode = (containerTypes) =>
  (containerTypes || []).some((c) => c.indexOf('FCL') === 0) ? 'Sea FCL' : 'Sea LCL';

// src/modules/crm/InquiryActivityTimeline.jsx
// Putaran 16 Tahap 9 -- struktur tab Activity DealDetailPage.jsx, dipisah ke
// berkas sendiri (izin eksplisit instruksi tahap ini, rule 9) karena ukuran
// JSX + aturan per-type yang cukup banyak untuk ikut menebalkan
// DealDetailPage.jsx yang sudah besar.
//
// Sumber: mockup Inquiry Management.dc.html, data-screen-label=
// "Detail/Activity" (dibaca utuh dari file sumber, bukan render HTTP) --
// wadah `padding-left:48px` + garis vertikal TUNGGAL (bukan per-baris) di
// `left:15px`, lingkaran ikon 32px absolut di `left:-48px` per baris, kartu
// per entri (border kondisional "Upcoming"), badge "Upcoming" HANYA untuk
// entri type==='Scheduled Follow Up' di mockup (logika komputasi `tl`,
// mockup baris ~1039: `type: x.type==='Follow Up' && pl ? 'Scheduled Follow
// Up' : x.type`, `pl = x.status==='Planned'`), ikon per-type (BUKAN warna
// per-type -- warna HANYA biner Upcoming/tidak, lihat `cBg/cBd/cFg`), tombol
// expand/collapse (`hasDetail`/`chev`/`toggle`) untuk entri yang punya
// `detail` terpisah dari `desc`, dan pil "From {dokumen}" yang TERBUKTI
// TIDAK bisa dibangun dari skema Nexus (lihat komentar di bawah).
//
// PEMETAAN TIPE mockup -> Nexus (5 tipe NYATA di `activities`: followup,
// lead_lost, note, owner_change, status_change -- audit Fase A, bukan
// tebakan):
//   - note          -> mockup 'Note'          -> ikon 'file'    -> FileText
//   - owner_change  -> mockup 'Owner Change'   -> ikon 'ucheck'  -> UserCheck
//   - status_change -> mockup 'Status Change'  -> ikon 'refresh' -> RefreshCw
//     (KONSISTEN dengan ikon status_change/owner_change yang SUDAH dipakai
//     tab Status History di file ini -- RefreshCw/UserCheck, Putaran 16
//     Tahap 6 -- bukti independen kedua utk pemetaan ikon yang sama)
//   - followup      -> mockup 'Scheduled Follow Up' HANYA saat status='todo'
//     (konvensi `status` di seluruh codebase: 'todo'/'done', lihat
//     leadActivity.js/LeadDetailPage.jsx/ActivitiesPage.jsx) -> ikon 'cal'
//     -> Calendar, warna Upcoming (amber). Saat status!=='todo' (selesai):
//     mockup TIDAK punya contoh followup selesai di data contohnya (fixture
//     `tl` 8 baris: Email/Status Change/Rate Request x3/Meeting/Owner
//     Change/Note -- NOL 'Follow Up' biasa) -- ikon Calendar tetap dipakai
//     (satu-satunya ikon kalender di set mockup, tak masuk akal memberi nol
//     ikon), warna netral (bukan Upcoming). TIDAK PASTI, dilaporkan.
//   - lead_lost     -> NOL padanan di mockup Inquiry Management (konsep
//     "Lead Lost" milik Lead Management, bukan tab Activity Inquiry) -> ikon
//     fallback generik, warna netral. TIDAK PASTI, dilaporkan.
//   - tipe lain yang mungkin muncul (call/visit/meeting/email/whatsapp --
//     NOL hit di 3 inquiry data uji, tak terbukti pernah dipakai modul
//     Inquiry) -> dipetakan by-the-book ke ikon mockup yang cocok persis
//     namanya (phone/pin/users/mail/msg) untuk jaga-jaga, warna netral.
//
// PIL "From {dokumen}" (mockup: `hasFrom`/`openFrom`, sumber `x.rep`/visit
// report ATAU PRF) -- SENGAJA TIDAK DIBANGUN. `activities` TIDAK punya
// kolom penaut balik ke sumber (diverifikasi schema_snapshot.sql: FK ke
// account/company/contact/inquiry/quotation, NOL kolom ke laporan
// kunjungan/PRF). Preseden identik: LeadDetailPage.jsx (TD-318, komentar di
// atas TimelineRow) membangun timeline SERUPA dari skema SAMA dan membuat
// keputusan SAMA, DITUNDA ke modul Sales Activity -- bukan dikarang kolom
// baru di sini.
import { useState } from 'react';
import { Calendar, FileText, RefreshCw, UserCheck, ListChecks, Phone, MessageCircle, MapPin, Users, Mail } from 'lucide-react';
import { DEAL_C as C } from './inquiryTheme';
import { HEAD, BODY, fmtDate } from './DealPanels';

const TYPE_ICON = {
  note: FileText, owner_change: UserCheck, status_change: RefreshCw,
  // followup ditangani terpisah di bawah (ikon tetap Calendar, warna
  // tergantung status) -- entri di sini hanya utk tipe yang nol cabang khusus.
  call: Phone, whatsapp: MessageCircle, visit: MapPin, meeting: Users, email: Mail,
};

function activityLabel(a) {
  if (a.type === 'followup') return a.status === 'todo' ? 'Scheduled Follow Up' : 'Follow-up';
  if (a.type === 'status_change') return 'Status Change';
  if (a.type === 'owner_change') return 'Owner Change';
  if (a.type === 'lead_lost') return 'Lead Lost';
  return a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1).replace(/_/g, ' ') : 'Activity';
}

function ActivityRow({ a, actorMap }) {
  const [open, setOpen] = useState(false);
  const isFu = a.type === 'followup';
  const upcoming = isFu && a.status === 'todo';
  const Icon = isFu ? Calendar : (TYPE_ICON[a.type] || ListChecks);
  const actorName = a.created_by ? actorMap[a.created_by] : null;
  const metaWhen = isFu && a.scheduled_for ? fmtDate(a.scheduled_for) : fmtDate(a.created_at);
  const byText = actorName ? (upcoming ? `scheduled by ${actorName}` : actorName) : null;
  const desc = a.notes || a.outcome || '';
  // hasDetail: pola sama LeadDetailPage.jsx TimelineRow (skema identik) --
  // `outcome` jadi detail terpisah HANYA bila `notes` sudah dipakai sbg desc
  // (supaya outcome tak hilang di belakang notes); `next_action` SELALU
  // detail tambahan bila ada.
  const detailParts = [];
  if (a.notes && a.outcome) detailParts.push(`Outcome: ${a.outcome}`);
  if (a.next_action) detailParts.push(`Next action: ${a.next_action}`);
  const hasDetail = detailParts.length > 0;
  // Trio warna -- diukur mockup (komputasi `tl`, baris ~1039): BINER
  // Upcoming/tidak, BUKAN per-tipe. `cBd` (border lingkaran ikon) mockup
  // SENGAJA memakai warna FG (#8E620D/C.amber), BUKAN BD (#E6CE94/C.amberBd)
  // -- disalin apa adanya, bukan "dibetulkan" ke C.amberBd.
  const cardBd = upcoming ? C.amberBd : C.border;
  const circleBg = upcoming ? C.amberBg : C.surface;
  const circleBd = upcoming ? C.amber : C.border;
  const circleFg = upcoming ? C.amber : C.textMute;
  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: -48, top: 8, width: 32, height: 32, borderRadius: 16,
        background: circleBg, border: `1px solid ${circleBd}`, color: circleFg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, flex: 'none',
      }}>
        <Icon size={16} />
      </span>
      <div style={{ background: C.surface, border: `1px solid ${cardBd}`, borderRadius: 14, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: HEAD, fontSize: 13.5, fontWeight: 700, color: C.text }}>{activityLabel(a)}</span>
          {/* contact_name -- data yang SUDAH tampil sebelumnya (disambung ke
              label tipe), dipertahankan di sini sbg span terpisah; mockup
              nol field setara persis (desc "Email" fixture menyelipkan nama
              kontak INLINE di teks, bukan field berdiri sendiri). */}
          {a.contact_name && <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>{a.contact_name}</span>}
          {upcoming && (
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6, border: `1px solid ${C.amberBd}`, background: C.amberBg, color: C.amber, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
              Upcoming
            </span>
          )}
          <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>
            {metaWhen}{byText ? `, ${byText}` : ''}
          </span>
          {hasDetail && (
            <button type="button" onClick={() => setOpen((o) => !o)}
              style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: C.textMute, fontFamily: HEAD, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {open ? 'Close' : 'Details'}
            </button>
          )}
        </div>
        {/* [TIDAK PASTI] mockup `<div>{{e.desc}}</div>` tanpa style eksplisit
            apa pun -- nilai di bawah dipertahankan dari gaya sebelumnya,
            bukan diukur dari mockup. */}
        {desc && <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text }}>{desc}</div>}
        {open && hasDetail && (
          <div style={{ marginTop: 4, paddingTop: 8, borderTop: `1px solid ${C.lineSoft}`, fontFamily: BODY, fontSize: 13, color: C.textMute }}>
            {detailParts.join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @param {Array} activities - baris `activities` (account_id = inquiry.prospect_id)
 * @param {Object} actorMap - {profileId: full_name}, dari profMap yang SUDAH
 *   ada di DealDetailPage.jsx (created_by aktivitas ikut satu query profiles
 *   yang sama, bukan query baru).
 */
export default function InquiryActivityTimeline({ activities, actorMap }) {
  if (!activities.length) {
    // Teks dipertahankan verbatim dari sebelum Tahap 9 -- mockup nol
    // keadaan kosong eksplisit utk tab ini (fixture `tl` selalu berisi).
    return (
      <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>
        No activity recorded for this inquiry yet.
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', paddingLeft: 48, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 2, background: C.border }} />
      {activities.map((a) => <ActivityRow key={a.id} a={a} actorMap={actorMap} />)}
    </div>
  );
}

// src/modules/crm/DealDetailPage.jsx
// CRM — Detail Deal (per inquiry). Ported from the Lovable handoff, adapted to
// Nexus conventions: Lucide icons, shared supabase client, useAuth, brand
// tokens (navy #1B4D8A / orange #E85A1E), Montserrat/Inter fonts.
//
// Props:
//   inquiryId          : string — inquiry to render
//   onBack             : () => void
//   onCreateQuotation  : () => void                 — open blank Quotation form
//   onViewQuotation    : (quotation) => void        — open Quotation detail
//   showToast          : (msg, type?) => void
//
// Data: inquiries + accounts (prospect) + quotations (WHERE inquiry_id) +
// activities (WHERE account_id = inquiry.prospect_id) + profiles + payment_terms.
// No DB schema change. Stage updates write accounts.pipeline_stage.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, Pencil, Hash, CalendarClock,
  Loader2, AlertCircle, Phone, MessageCircle, MapPin, Users, Mail, ListChecks, Anchor, XCircle,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import {
  C, HEAD, BODY, STAGES, stageIndex, isKnownStage, isActiveStage, fmtDate, fmtRp, Card, InfoRow, Tab,
  DealStepper, DealHeaderControls, EditDealModal, QuotationListCard,
  PrfListCard, PriceSummaryCard, fetchAssignees, saveDealUpdate,
} from './DealPanels';
import { bantQualifyGate } from './bant';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import ConfirmModal from '../../components/ConfirmModal';
import WinLossModal from './WinLossModal';
import InquiryChatter from './InquiryChatter';

// Status inquiry yang masih boleh ditandai KALAH. WON / LOST / CANCELLED terminal →
// aksinya tidak dirender sama sekali (bukan disabled).
const LOSABLE_INQUIRY_STATUS = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];

// Batch 3C — gate tombol "Pakai/Ganti Penawaran Ini" (RPC prf_select_offer
// menegakkan izin sebenarnya). Mirrors DB is_manager_or_above() — sama persis
// daftar di PRFDetailPage.jsx (tidak diekspor dari sana, jadi disalin di sini;
// pola mirror-per-file ini sudah berulang di codebase).
const MANAGER_OR_ABOVE = ['super_admin', 'admin', 'ceo', 'gm', 'gm_bd', 'manager', 'supervisor'];

const SERVICE_LABEL = {
  freight_forwarding: 'Freight Forwarding',
  customs: 'Customs Clearance',
  trading: 'General Trading',
};
const ACT_ICON = {
  call: Phone, whatsapp: MessageCircle, visit: MapPin, meeting: Users,
  email: Mail, followup: ListChecks,
};

// Detail Inquiry BUKAN tab — itu primary view, selalu tampil di atas tab bar
// ini (lihat render). Cuma 3 tab di bawahnya. Icon sengaja pakai FileText yang
// sama untuk Quotation/PRF — kedua Card-nya sendiri sudah memakai FileText
// sebagai icon-nya masing-masing, jadi ini bukan oversight, cuma meneruskan
// pilihan visual yang sudah ada.
const DEAL_TABS = [
  { id: 'aktivitas', icon: <ListChecks size={15} />, label: 'Aktivitas' },
  { id: 'quotation', icon: <FileText size={15} />,   label: 'Quotation' },
  { id: 'prf',       icon: <FileText size={15} />,   label: 'PRF' },
];

function Avatar({ name, size = 28 }) {
  const init = (name && name !== '—')
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '—';
  return (
    <span style={{ width: size, height: size, borderRadius: 999, background: C.navySoft, color: C.navy, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontFamily: HEAD, fontSize: size * 0.4, fontWeight: 700 }}>
      {init}
    </span>
  );
}

function StageBadge({ idx }) {
  const s = STAGES[idx] || STAGES[0];
  const tone = s.key === 'WON' ? { bg: C.greenBg, fg: C.green } : s.key === 'LOST' ? { bg: C.redBg, fg: C.red } : { bg: C.navySoft, fg: C.navy };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 99, background: tone.bg, color: tone.fg, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: tone.fg }} />{s.label}
    </span>
  );
}

/* ---------- Header ---------- */
function Header({ name, stageIdx, stageKey, inquiryNo, assignedName, assignedProfileId, onViewProfile, accountId, onViewCustomer, closeDate, value, onBack, onEdit, onPickStage }) {
  // Nama assignee jadi klik-able HANYA bila id-nya dan handler-nya tersedia — kalau
  // tidak (belum di-assign, atau prop tak dikirim dari pemanggil), render persis
  // seperti sebelumnya (teks polos, tanpa cursor pointer). Nol regresi kasus kosong.
  const canViewProfile = !!(assignedProfileId && onViewProfile);
  // Sama pola utk nama akun (h1) — accountId & name sama-sama turunan account?.*,
  // jadi "account kosong" otomatis jatuh ke cabang non-klik (bukan crash).
  const canViewCustomer = !!(accountId && onViewCustomer);
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute }}><ChevronLeft size={18} /></button>
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>Inquiry List</button>
        <ChevronRight size={14} color={C.textFaint} />
        <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>Detail Deal</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            {canViewCustomer ? (
              <h1
                className="dd-account-name"
                onClick={() => onViewCustomer(accountId)}
                title="Lihat detail akun"
                style={{ margin: 0, fontFamily: HEAD, fontSize: 25, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', cursor: 'pointer' }}
              >
                {name || '—'}
              </h1>
            ) : (
              <h1 style={{ margin: 0, fontFamily: HEAD, fontSize: 25, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{name || '—'}</h1>
            )}
            <StageBadge idx={stageIdx} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 600, color: C.navy, background: C.navySoft, padding: '4px 11px', borderRadius: 8 }}>
              <Hash size={13} />{inquiryNo || '—'}
            </span>
            {canViewProfile ? (
              <button
                type="button"
                onClick={() => onViewProfile(assignedProfileId)}
                title="Lihat profil"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: BODY, fontSize: 13, color: C.textMute, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Avatar name={assignedName} size={26} />
                <span style={{ textDecoration: 'underline', textDecorationColor: C.border, textUnderlineOffset: 3 }}>{assignedName}</span>
              </button>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: BODY, fontSize: 13, color: C.textMute }}>
                <Avatar name={assignedName} size={26} />{assignedName || 'Belum di-assign'}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 13, color: C.textMute }}>
              <CalendarClock size={15} color={C.textFaint} />Est. closing {fmtDate(closeDate)}
            </span>
          </div>
        </div>

        <DealHeaderControls value={value} stageKey={stageKey} onEdit={onEdit} onPickStage={onPickStage} />
      </div>
    </div>
  );
}

// Render a text[] (or null) as pills; "—" when empty.
function BadgeRow({ label, values, full }) {
  const arr = Array.isArray(values) ? values.filter(Boolean) : [];
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      {arr.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {arr.map((v) => (
            <span key={v} style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.navy, background: C.navySoft, borderRadius: 7, padding: '3px 9px' }}>{v}</span>
          ))}
        </div>
      ) : <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text }}>—</div>}
    </div>
  );
}

// ---------- QuotationItemsCard (lokal — bukan shared DealPanels) ----------
// Rincian harga itemized untuk SATU quotation (yang terbaru dibuat/diedit dari
// daftar di tab ini). Grouping/kalkulasi & struktur render disalin PERSIS dari
// QuotationDetailPage.jsx (sections by group_name, exclude baris if_any dari
// total) — tidak ada logic baru di sini, cuma dipindah ke konteks tab ini.
function QuotationItemsCard({ quotation, items, loading }) {
  const sections = useMemo(() => {
    if (!items.length) return [];
    const order = [];
    const map = {};
    items.forEach((row) => {
      const key = row.group_name || 'CHARGES';
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(row);
    });
    return order.map((name) => ({
      name,
      rows: map[name],
      total: map[name].reduce((s, r) => s + (r.if_any ? 0 : (Number(r.total) || 0)), 0),
    }));
  }, [items]);

  return (
    <Card title="Rincian Harga" icon={<FileText size={17} />}>
      <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, marginBottom: 14 }}>
        — <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: C.navy }}>{quotation.quotation_no}</span>
        {' '}· terakhir diedit {fmtDate(quotation.updated_at || quotation.created_at)}
      </div>
      {loading ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Memuat rincian harga…</div>
      ) : sections.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Tidak ada item</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((sec, si) => {
            const secCost = sec.rows.reduce((s, r) =>
              r.if_any ? s : s + Math.round((Number(r.cost_price) || 0) * (Number(r.qty) || 0) * (Number(r.exchange_rate) || 1)), 0);
            return (
              <div key={si} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <div style={{ background: C.surfaceAlt, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: HEAD, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: C.textMute }}>{sec.name}</span>
                  <span style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 700, color: C.text }}>{fmtRp(sec.total)}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'left',   fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Description</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Cost Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Currency</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Sell Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Unit Label</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>QTY</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Total IDR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row, ri) => (
                        <tr key={row.id || ri} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '9px 12px', color: C.text }}>{row.description || '—'}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', color: C.textMute, fontSize: 12 }}>
                            {(Number(row.cost_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: row.currency === 'USD' ? C.orange : C.textMute, fontWeight: 600, fontSize: 12 }}>
                            {row.currency || 'IDR'}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', color: C.text, fontSize: 12 }}>
                            {(Number(row.unit_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.textMute, fontSize: 12 }}>{row.unit_label || '—'}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.text, fontWeight: 600 }}>{row.qty || 1}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: row.currency !== 'IDR' ? C.orange : C.text, whiteSpace: 'nowrap' }}>
                            {fmtRp(row.total)}
                            {row.currency !== 'IDR' && (
                              <div style={{ fontSize: 10, color: C.textFaint, fontWeight: 400 }}>
                                × kurs {(Number(row.exchange_rate) || 1).toLocaleString('id-ID')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`, background: C.surfaceAlt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: BODY, fontSize: 11.5, color: C.textFaint }}>
                    Cost: {fmtRp(secCost)} • Margin: {sec.total > 0 ? ((sec.total - secCost) / sec.total * 100).toFixed(1) : '0'}%
                  </span>
                  <span style={{ fontFamily: HEAD, fontSize: 13, fontWeight: 700, color: C.text }}>Section total: {fmtRp(sec.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ========================================================================= */
export default function DealDetailPage({ inquiryId, onBack, onCreateQuotation, onViewQuotation, onEditInquiry, onCreatePRF, onViewPRF, onViewProfile, onViewCustomer, showToast }) {
  const { profile, erpRole, erpRoles, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inquiry, setInquiry] = useState(null);
  const [account, setAccount] = useState(null);
  // Kunci in-flight tulis pipeline_stage — cegah updateAccount ditulis dobel
  // (pickStage, gate BANT confirm, Edit Deal — ketiganya lewat fungsi ini)
  // selagi tulisan sebelumnya masih berlangsung. Boolean cukup: halaman ini
  // scope satu akun, bukan papan banyak kartu spt Kanban (lihat DRAG_STAGE_BUG_AUDIT.md).
  const stageUpdateInFlight = useRef(false);
  const [quotations, setQuotations] = useState([]);
  // Rincian Harga (tab Quotation) — items HANYA untuk quotation terbaru (lihat
  // `latestQuotation` di bawah), bukan untuk semua quotation di daftar.
  const [latestQuotationItems, setLatestQuotationItems] = useState([]);
  const [latestItemsLoading, setLatestItemsLoading] = useState(false);
  const [prfs, setPrfs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [profMap, setProfMap] = useState({});
  const [termMap, setTermMap] = useState({});
  const [assignees, setAssignees] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('aktivitas');
  // Konfirmasi lunak gate BANT (skor 5–7 → QUALIFIED) — pola pending-action yang sama
  // dengan stageGate di PipelineKanbanPage.
  const [stageGate, setStageGate] = useState({ open: false, message: '', onYes: null });
  // Tandai inquiry KALAH (Task 4) — memakai ulang WinLossModal mode='lost'.
  const [lossOpen, setLossOpen] = useState(false);
  const [lossSaving, setLossSaving] = useState(false);
  // Tandai inquiry MENANG (jalur manual baru) — ConfirmModal polos (bukan
  // WinLossModal, nol form alasan diminta), RPC mark_inquiry_won yang
  // menegakkan izin sebenarnya.
  const [wonOpen, setWonOpen] = useState(false);
  const [wonSaving, setWonSaving] = useState(false);
  // Batch 3C — pilih/ganti penawaran vendor (prf_select_offer). Konfirmasi
  // HANYA dibutuhkan saat MENGGANTI pilihan yang sudah ada; pilihan pertama
  // langsung jalan tanpa dialog.
  const [offerSwitchConfirm, setOfferSwitchConfirm] = useState({ open: false, prf: null, offer: null });
  const [offerActionBusy, setOfferActionBusy] = useState(false);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!inquiryId) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data: inq, error: e1 } = await supabase
        .from('inquiries')
        .select('id, inquiry_no, service_type, route, estimated_volume, status, notes, prospect_id, created_by, created_at, deadline_quote, pol, pod, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, cargo_types, un_number, imo_class, has_msds, additional_services')
        .eq('id', inquiryId).is('deleted_at', null).maybeSingle();
      if (cancelled) return;
      if (e1 || !inq) { setNotFound(true); setLoading(false); return; }

      let acc = null;
      if (inq.prospect_id) {
        const { data } = await supabase
          .from('accounts')
          // bant_* dipakai gate QUALIFIED (aturan bersama bant.js) — ikut ditarik di
          // sini supaya tidak perlu fetch kedua saat user memindahkan stage.
          .select('id, name, pipeline_stage, estimated_value, assigned_profile, assigned_to, pic_name, estimated_closing_date, bant_budget, bant_authority, bant_need, bant_timeline')
          .eq('id', inq.prospect_id).maybeSingle();
        acc = data || null;
      }

      const { data: quos } = await supabase
        .from('quotations')
        .select('id, quotation_no, total_amount, status, valid_until, created_at, updated_at, payment_terms_id')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000);

      // PRF born from this inquiry (RLS-scoped as-is — sales sees only own PRF).
      const { data: prfRows } = await supabase
        .from('prf')
        .select('id, prf_no, service_type, status, created_at, created_by, selected_offer_id, min_offers_waiver_reason')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(200);

      // Batch 3C — untuk PRF berstatus QUOTED, tarik penawaran vendornya (read-only;
      // RLS prf_vendor_offers_select/prf_cost_items_select sudah mengizinkan sales
      // pembuat PRF membaca lewat EXISTS ke prf.created_by, tak perlu policy baru)
      // + total biaya per penawaran (dari prf_cost_items, dikelompokkan per offer_id).
      const quotedPrfIds = (prfRows || []).filter((p) => p.status === 'QUOTED').map((p) => p.id);
      const offersByPrf = {};
      if (quotedPrfIds.length) {
        const { data: offerRows } = await supabase
          .from('prf_vendor_offers')
          .select('id, prf_id, vendor_id, currency, pros, cons, vendor:vendors!prf_vendor_offers_vendor_id_fkey(name)')
          .in('prf_id', quotedPrfIds).is('deleted_at', null)
          .order('created_at', { ascending: true }).limit(500);
        const offerIds = (offerRows || []).map((o) => o.id);
        const totalsByOffer = {};
        if (offerIds.length) {
          const { data: costRows } = await supabase
            .from('prf_cost_items')
            .select('offer_id, amount, currency')
            .in('offer_id', offerIds).limit(2000);
          (costRows || []).forEach((r) => {
            if (!r.offer_id) return;
            const m = totalsByOffer[r.offer_id] || (totalsByOffer[r.offer_id] = {});
            const cur = r.currency || 'IDR';
            m[cur] = (m[cur] || 0) + (Number(r.amount) || 0);
          });
        }
        (offerRows || []).forEach((o) => {
          if (!offersByPrf[o.prf_id]) offersByPrf[o.prf_id] = [];
          offersByPrf[o.prf_id].push({
            id: o.id,
            vendorName: o.vendor?.name || '—',
            currency: o.currency,
            totals: totalsByOffer[o.id] || {},
            pros: o.pros,
            cons: o.cons,
          });
        });
      }
      const prfsAugmented = (prfRows || []).map((p) => (
        p.status === 'QUOTED' ? { ...p, vendorOffers: offersByPrf[p.id] || [] } : p
      ));

      let acts = [];
      if (inq.prospect_id) {
        const { data } = await supabase
          .from('activities')
          .select('id, type, status, notes, outcome, contact_name, prospect_name, scheduled_for, created_at')
          .eq('account_id', inq.prospect_id).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(5);
        acts = data || [];
      }

      // resolve profile names (assigned_profile, assigned_to, created_by)
      const pIds = [...new Set([acc?.assigned_profile, acc?.assigned_to, inq.created_by].filter(Boolean))];
      const pMap = {};
      if (pIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', pIds).limit(1000);
        (profs || []).forEach((p) => { pMap[p.id] = p.full_name; });
      }

      // resolve payment terms names
      const tIds = [...new Set((quos || []).map((q) => q.payment_terms_id).filter(Boolean))];
      const tMap = {};
      if (tIds.length) {
        const { data: terms } = await supabase.from('payment_terms').select('id, name').in('id', tIds).limit(1000);
        (terms || []).forEach((t) => { tMap[t.id] = t.name; });
      }

      if (cancelled) return;
      setInquiry(inq);
      setAccount(acc);
      setQuotations(quos || []);
      setPrfs(prfsAugmented);
      setActivities(acts);
      setProfMap(pMap);
      setTermMap(tMap);
      setLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setNotFound(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [inquiryId, reloadKey]);

  // assignees for the Edit modal (company-scoped)
  useEffect(() => {
    if (!profile?.company_id) return undefined;
    let cancelled = false;
    fetchAssignees(profile.company_id).then((a) => { if (!cancelled) setAssignees(a); });
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  // Quotation paling baru dibuat/diedit (updated_at, fallback created_at) — dipilih
  // dari `quotations` yang SUDAH difetch di atas (bukan query list baru). Satu inquiry
  // bisa punya banyak quotation/revisi; section "Rincian Harga" hanya menampilkan SATU.
  const latestQuotation = useMemo(() => {
    if (!quotations.length) return null;
    return quotations.reduce((latest, q) => {
      const qTime = new Date(q.updated_at || q.created_at).getTime();
      const latestTime = new Date(latest.updated_at || latest.created_at).getTime();
      return qTime > latestTime ? q : latest;
    }, quotations[0]);
  }, [quotations]);

  // Rincian Harga — SATU query tambahan setelah identitas quotation-terbaru diketahui
  // (bukan N+1: tidak fetch item untuk quotation lain di daftar). Di-key ke id saja,
  // supaya tidak fetch ulang kalau quotation-terbaru tak berganti (mis. refetch() akibat
  // Pindah Stage / aksi lain di halaman ini).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!latestQuotation?.id) { setLatestQuotationItems([]); return undefined; }
    let cancelled = false;
    setLatestItemsLoading(true);
    supabase
      .from('quotation_items')
      .select('id, sort_order, group_name, description, currency, cost_price, unit_price, unit_label, qty, exchange_rate, total, notes, if_any')
      .eq('quotation_id', latestQuotation.id)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) showToast?.('Gagal memuat rincian harga: ' + error.message, 'error');
        setLatestQuotationItems(data || []);
        setLatestItemsLoading(false);
      });
    return () => { cancelled = true; };
  }, [latestQuotation?.id, showToast]);

  const stageIdx = stageIndex(account?.pipeline_stage);
  const estValue = Number(account?.estimated_value || 0);
  const assignedName = profMap[account?.assigned_profile] || profMap[account?.assigned_to] || null;
  // Id di balik assignedName — fallback SAMA PERSIS supaya id-nya konsisten dgn
  // nama yang tampil. Dipakai utk buka mini profil (klik nama sales di Header).
  const assignedProfileId = account?.assigned_profile || account?.assigned_to || null;
  const createdByName = profMap[inquiry?.created_by] || null;
  // Orang yang diprioritaskan di dropdown @mention Chatter — SAMA PERSIS logic
  // `pIds` di effect fetch utama (:393), tapi diturunkan ulang di scope render dari
  // state `account`/`inquiry` (effect itu pakai `acc`/`inq` lokal, tak bisa diakses
  // dari sini).
  const priorityUserIds = [...new Set([account?.assigned_profile, account?.assigned_to, inquiry?.created_by].filter(Boolean))];
  // Aksi "Tandai Kalah" hanya untuk status yang belum terminal (default 'OPEN' bila
  // kolomnya kosong). WON / LOST / CANCELLED → tombolnya tidak dirender sama sekali.
  const canMarkLost = LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase());
  // Aksi "Tandai sebagai WON" — gate UI murni UX (RPC mark_inquiry_won yang
  // menegakkan izin sebenarnya): cuma pembuat inquiry atau super_admin, dan
  // cuma kalau belum WON. Sengaja TIDAK ikut LOSABLE_INQUIRY_STATUS — inquiry
  // yang sudah LOST/CANCELLED tetap boleh ditandai WON manual (mis. customer
  // berubah pikiran), sesuai spesifikasi task.
  const isInquiryCreator = !!(inquiry?.created_by && profile?.id && inquiry.created_by === profile.id);
  const canMarkWon = (isInquiryCreator || erpRole === 'super_admin')
    && String(inquiry?.status || 'OPEN').toUpperCase() !== 'WON';

  // Update accounts row (used by both Edit modal & Pindah Stage). Returns boolean.
  // Single shared write path (saveDealUpdate) so the audit trail matches
  // CustomerDetailPage's deal controls exactly.
  async function updateAccount(patch, auditStageKey) {
    if (!account?.id) { showToast?.('Prospect tidak ditemukan untuk deal ini', 'error'); return false; }
    // Tulisan lain untuk akun ini masih berlangsung — abaikan (bukan rate-limit:
    // dilepas lagi begitu tulisan yang sedang jalan selesai).
    if (stageUpdateInFlight.current) return false;
    stageUpdateInFlight.current = true;
    try {
      const ok = await saveDealUpdate({
        accountId: account.id, patch, auditStageKey,
        prevStage: account.pipeline_stage, accountName: account.name,
        actor: { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id },
        showToast,
      });
      if (ok) refetch();
      return ok;
    } finally {
      stageUpdateInFlight.current = false;
    }
  }

  // onPickStage kini mengirim KEY stage (menu hanya menawarkan ACTIVE_STAGES).
  function pickStage(key) {
    if (key === (account?.pipeline_stage || 'NEW')) return;
    if (!isActiveStage(key)) return;                     // sabuk pengaman jalur tulis
    if (key === 'QUALIFIED') {
      const gate = bantQualifyGate(account);
      if (gate.verdict === 'block') { showToast?.(gate.message, 'error'); return; }
      if (gate.verdict === 'confirm') {
        setStageGate({ open: true, message: gate.message, onYes: () => updateAccount({ pipeline_stage: key }, key) });
        return;
      }
    }
    updateAccount({ pipeline_stage: key }, key);
  }

  async function saveEdit(draft) {
    // PENJAGA stage tak dikenal — sama tujuannya dengan CustomerDetailPage.saveDealEdit.
    // `draft.stage` diturunkan dari `stageIdx` (prop `initial` EditDealModal), dan
    // `stageIdx = stageIndex(account?.pipeline_stage)`; stageIndex mengembalikan 0 (=NEW)
    // untuk nilai di luar STAGES. Tanpa penjaga ini, menyimpan modal untuk akun
    // ber-stage 'NURTURE' menimpanya jadi 'NEW', diam-diam dan tanpa audit.
    //
    // Di halaman INI penyemai draft memang state `account` itu sendiri — tidak ada fetch
    // terpisah seperti `dealSeed` di CustomerDetailPage. Jadi membaca `account` di sini
    // BUKAN memakai state halaman sebagai pengganti sumber, melainkan memang sumber yang
    // sama dengan yang menyemai draft.stage.
    const seedStage = account?.pipeline_stage;
    const stageKnown = isKnownStage(seedStage);
    const nextKey = STAGES[draft.stage]?.key;
    // Stage ditulis HANYA bila seed-nya dikenal DAN nilai barunya masih boleh ditulis.
    // Syarat kedua menutup kasus akun warisan (mis. PROPOSAL) yang dibuka lalu langsung
    // disimpan tanpa menyentuh dropdown: tanpa itu, nilai lamanya akan DITULIS ULANG.
    const stageWritable = stageKnown && isActiveStage(nextKey);

    if (stageWritable && nextKey === 'QUALIFIED' && nextKey !== seedStage) {
      const gate = bantQualifyGate(account);
      if (gate.verdict === 'block') { showToast?.(gate.message, 'error'); return false; }
      if (gate.verdict === 'confirm') {
        // Modal Edit Deal dibiarkan terbuka (return false) sampai konfirmasi dijawab.
        setStageGate({
          open: true,
          message: gate.message,
          onYes: async () => { const done = await commitEdit(draft, nextKey); if (done) setEditOpen(false); },
        });
        return false;
      }
    }

    const ok = await commitEdit(draft, stageWritable ? nextKey : null);
    // Setelah updateAccount supaya pesan ini yang terakhir dilihat user. Tipe default,
    // bukan 'error' — penyimpanannya memang berhasil.
    if (ok && !stageWritable) {
      showToast?.(stageKnown
        ? `Stage "${seedStage}" sekarang mengikuti status inquiry — stage tidak diubah. Perubahan lain tersimpan.`
        : `Stage "${seedStage || '(kosong)'}" tidak dikenal — stage tidak diubah. Perubahan lain tersimpan.`);
    }
    return ok;
  }

  // Jalur tulis Edit Deal — stageKey null berarti stage sengaja TIDAK ditulis.
  async function commitEdit(draft, stageKey) {
    const patch = {
      assigned_profile: draft.assignedId || null,
      estimated_value: draft.value === '' ? 0 : Number(draft.value),
      estimated_closing_date: draft.closeDate || null,
    };
    if (stageKey) patch.pipeline_stage = stageKey;
    return updateAccount(patch);
  }

  // ── Task 4 — tandai INQUIRY kalah. Menulis inquiries.status + lost_reason SAJA;
  // accounts TIDAK disentuh sama sekali (lifecycle akun hanya naik, tak pernah turun).
  // Aksi "Tandai Menang" tandingannya kini ADA (markInquiryWon, di bawah) — jalur
  // manual lewat RPC mark_inquiry_won, terpisah dari jalur SO/trigger resmi
  // (set_inquiry_won_on_so → set_customer_on_inquiry_won, masih hidup berdampingan)
  // dan terpisah dari pickStage/ACTIVE_STAGE_KEYS (tetap diblok, tak disentuh).
  async function markInquiryLost(values) {
    if (!inquiry?.id) return;
    const prevStatus = inquiry.status || 'OPEN';
    setLossSaving(true);
    const { error } = await supabase
      .from('inquiries')
      .update({ status: 'LOST', lost_reason: values.lost_reason })
      .eq('id', inquiry.id);
    setLossSaving(false);
    if (error) { showToast?.('Gagal menandai kalah: ' + error.message, 'error'); return; }
    // Berjejak: ini SATU-SATUNYA jalur menandai deal kalah, dan alasannya ikut
    // menghitung win rate. Pola sama saveDealUpdate — fire-and-forget, tak memblokir.
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: inquiry.id,
      entityLabel: inquiry.inquiry_no,
      notes: `${prevStatus} → LOST · alasan: ${values.lost_reason}`,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setLossOpen(false);
    showToast?.('Inquiry ditandai KALAH.', 'success');
    refetch();
  }

  // ── Tandai INQUIRY menang secara manual. RPC mark_inquiry_won menegakkan izin
  // sebenarnya (creator inquiry atau super_admin) + guard idempotency (sudah WON
  // → ditolak) — gate `canMarkWon` di atas murni UX, bukan pengganti validasi RPC.
  // Trigger set_customer_on_inquiry_won yang sudah ada mengurus accounts.lifecycle_stage
  // + became_customer_at otomatis; RPC itu sendiri yang sekalian set
  // accounts.pipeline_stage='WON'. Pesan error ditampilkan apa adanya dari RPC.
  async function markInquiryWon() {
    if (!inquiry?.id) return;
    setWonSaving(true);
    const { error } = await supabase.rpc('mark_inquiry_won', { p_inquiry_id: inquiry.id });
    setWonSaving(false);
    if (error) { showToast?.(error.message, 'error'); return; }
    showToast?.('Inquiry ditandai WON. Akun terkait sudah jadi customer.', 'success');
    refetch();
  }

  // ── Batch 3C — pilih/ganti penawaran vendor terpilih (prf.selected_offer_id).
  // RPC prf_select_offer boleh dipanggil berulang untuk MENGGANTI pilihan (tidak
  // ada guard yang melarangnya) — konfirmasi di sini murni UX, bukan penegak izin. ──
  async function doSelectOffer(prf, offer) {
    const prevOffer = prf.selected_offer_id
      ? (prf.vendorOffers || []).find((o) => o.id === prf.selected_offer_id)
      : null;
    const isSwitch = !!prf.selected_offer_id && prf.selected_offer_id !== offer.id;
    setOfferActionBusy(true);
    try {
      const { error } = await supabase.rpc('prf_select_offer', { p_prf_id: prf.id, p_offer_id: offer.id });
      if (error) throw error;
      logAudit(supabase, {
        action: ACTION_TYPES.SELECT_VENDOR_OFFER,
        entityType: ENTITY_TYPES.PRF,
        entityId: prf.id,
        entityLabel: prf.prf_no,
        notes: isSwitch
          ? `Ganti pilihan: ${prevOffer?.vendorName || 'vendor sebelumnya'} (offer ${prf.selected_offer_id}) → ${offer.vendorName} (offer ${offer.id})`
          : `Penawaran dipilih: ${offer.vendorName} (offer ${offer.id})`,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      showToast?.('Penawaran vendor dipilih.', 'success');
      refetch();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setOfferActionBusy(false);
    }
  }

  function handleSelectOffer(prf, offer) {
    if (prf.selected_offer_id && prf.selected_offer_id !== offer.id) {
      setOfferSwitchConfirm({ open: true, prf, offer });
    } else {
      doSelectOffer(prf, offer);
    }
  }

  // ── loading / not-found ──
  if (loading) {
    return (
      <div style={{ margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textFaint, fontFamily: BODY }}>
        <Loader2 size={30} className="dd-spin" />
        <div style={{ fontSize: 13.5 }}>Memuat detail deal…</div>
        <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}`}</style>
      </div>
    );
  }
  if (notFound || !inquiry) {
    return (
      <div style={{ margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textMute, fontFamily: BODY }}>
        <AlertCircle size={30} color={C.red} />
        <div style={{ fontFamily: HEAD, fontSize: 16, fontWeight: 700, color: C.text }}>Inquiry tidak ditemukan</div>
        <button onClick={onBack} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}><ChevronLeft size={15} />Kembali</button>
      </div>
    );
  }

  return (
    <div style={{ margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: BODY, color: C.text }}>
      {/* .cd-tab:hover di sini SUPAYA hover tab konsisten dengan CustomerDetailPage —
          Tab (dari DealPanels.jsx) sama-sama merender className="cd-tab" di kedua
          halaman, tapi rule hover-nya sendiri hanya hidup di mana pun <style> ini
          dirender (CustomerDetailPage punya rule identik di file-nya sendiri). */}
      <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}.cd-tab:hover{color:${C.navy};}.dd-account-name:hover{text-decoration:underline;}`}</style>

      <DealStepper current={stageIdx} value={estValue} />

      <Header
        name={account?.name}
        stageIdx={stageIdx}
        stageKey={account?.pipeline_stage || 'NEW'}
        inquiryNo={inquiry.inquiry_no}
        assignedName={assignedName}
        assignedProfileId={assignedProfileId}
        onViewProfile={onViewProfile}
        accountId={account?.id}
        onViewCustomer={onViewCustomer}
        closeDate={account?.estimated_closing_date}
        value={estValue}
        onBack={onBack}
        onEdit={() => setEditOpen(true)}
        onPickStage={pickStage}
      />

      {/* 2 kolom di bawah Header: kiri = konten existing (Detail Inquiry + tab bar
          + tab content, verbatim, cuma dipindah satu level nesting), kanan = Chatter
          PERSISTEN (tak berubah apa pun tab kiri yang aktif). Reuse class `.nx-stack`
          (index.css) — sama persis dipakai QuotationDetailPage.jsx: collapse jadi
          1 kolom + sticky→static di bawah 1024px, nol CSS baru. */}
      <div className="nx-stack" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Primary view — SELALU tampil, bukan bagian dari tab (koreksi struktur: sesuai
          referensi Odoo, field utama tak boleh hilang saat pindah tab). Tab bar 3 tab
          (Aktivitas/Quotation/PRF) ada DI BAWAH kartu ini, bukan di atasnya. */}
      <Card
        title="Detail Inquiry"
        icon={<FileText size={17} />}
        right={(onEditInquiry || canMarkLost || canMarkWon) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onEditInquiry && (
              <button onClick={onEditInquiry} style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Pencil size={14} />Edit Inquiry
              </button>
            )}
            {canMarkWon && (
              <button onClick={() => setWonOpen(true)} disabled={wonSaving}
                style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.greenBd}`, background: '#fff', color: C.green, fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: wonSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: wonSaving ? 0.6 : 1 }}>
                <CheckCircle2 size={14} />{wonSaving ? 'Memproses…' : 'Tandai sebagai WON'}
              </button>
            )}
            {canMarkLost && (
              <button onClick={() => setLossOpen(true)} style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.redBd}`, background: '#fff', color: C.red, fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <XCircle size={14} />Tandai Kalah
              </button>
            )}
          </div>
        ) : null}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ padding: '4px 11px', borderRadius: 99, background: C.orangeSoft, color: C.orange, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700 }}>
            {SERVICE_LABEL[inquiry.service_type] || inquiry.service_type || '—'}
          </span>
          <span style={{ padding: '4px 11px', borderRadius: 99, background: C.navySoft, color: C.navy, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700 }}>
            {inquiry.status || 'OPEN'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
          <InfoRow label="Jenis Layanan" value={SERVICE_LABEL[inquiry.service_type] || inquiry.service_type} />
          <InfoRow label="Status" value={inquiry.status} />
          {/* POL → POD */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Anchor size={15} color={C.navy} />
                <span style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 600, color: C.text }}>{inquiry.pol || '—'}</span>
              </span>
              <ChevronRight size={15} color={C.textFaint} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={15} color={C.orange} />
                <span style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 600, color: C.text }}>{inquiry.pod || '—'}</span>
              </span>
            </div>
          </div>
          <BadgeRow label="Incoterm" values={inquiry.incoterms} />
          <BadgeRow label="Jenis Kontainer" values={inquiry.container_types} />
          <InfoRow label="Nama Barang" value={inquiry.goods_name} />
          <InfoRow label="HS Code" value={inquiry.hs_code} />
          <InfoRow label="Berat Total (KG)" value={inquiry.weight_kg != null ? String(inquiry.weight_kg) : ''} />
          <InfoRow label="Volume (CBM)" value={inquiry.volume_cbm != null ? String(inquiry.volume_cbm) : ''} />
          <BadgeRow label="Cargo Type" values={inquiry.cargo_types} />
          <BadgeRow label="Layanan Tambahan" values={inquiry.additional_services} />
          <InfoRow label="Deadline Quote" value={inquiry.deadline_quote ? fmtDate(inquiry.deadline_quote) : ''} />
          <InfoRow label="Route" value={inquiry.route} />
          <InfoRow label="Dibuat Oleh" value={createdByName} />
          <InfoRow label="Tanggal Dibuat" value={fmtDate(inquiry.created_at)} />
          <InfoRow label="Notes" value={inquiry.notes} full />
        </div>
      </Card>

      <div style={{ borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'stretch', gap: 4, flexWrap: 'wrap' }}>
        {DEAL_TABS.map((t) => (
          <Tab key={t.id} id={t.id} icon={t.icon} label={t.label} active={tab === t.id} onClick={setTab} />
        ))}
      </div>

      {tab === 'aktivitas' && (
        <Card title="Aktivitas Terkait" icon={<ListChecks size={17} />}>
          {activities.length === 0 ? (
            <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Belum ada aktivitas</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activities.map((a) => {
                const AIcon = ACT_ICON[a.type] || ListChecks;
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: C.navySoft, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><AIcon size={15} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 600, color: C.text }}>
                        {(a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1) : 'Aktivitas')}{a.contact_name ? ` · ${a.contact_name}` : ''}
                      </div>
                      {(a.notes || a.outcome) && <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, lineHeight: 1.4 }}>{a.notes || a.outcome}</div>}
                      <div style={{ fontFamily: BODY, fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{fmtDate(a.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'quotation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <QuotationListCard quotations={quotations} onCreate={onCreateQuotation} onView={onViewQuotation} />
          {latestQuotation && (
            <QuotationItemsCard quotation={latestQuotation} items={latestQuotationItems} loading={latestItemsLoading} />
          )}
          <PriceSummaryCard quotations={quotations} termMap={termMap} />
        </div>
      )}

      {tab === 'prf' && (
        <PrfListCard
          prfs={prfs}
          // Cetak PRF — cek SELURUH role aktif (erpRoles), bukan erpRole (role
          // primer). User multi-role (mis. manager+sales) sebelumnya kehilangan
          // tombol ini karena role prioritas lebih tinggi menutupi 'sales' di
          // erpRole. Cermin RLS prf_insert (has_role('sales') = EXISTS lintas
          // user_roles, bukan role primer).
          canCreate={erpRoles?.some((r) => ['sales', 'gm_bd', 'super_admin'].includes(r.roles?.code))}
          onCreate={onCreatePRF}
          onView={onViewPRF}
          canSelectOffer={(p) => p.created_by === profile?.id || MANAGER_OR_ABOVE.includes(erpRole)}
          onSelectOffer={handleSelectOffer}
          offerActionBusy={offerActionBusy}
        />
      )}

      </div>

      <div style={{ flex: '0 0 400px', position: 'sticky', top: 24 }}>
        <InquiryChatter
          inquiryId={inquiry.id}
          companyId={profile?.company_id}
          inquiryNo={inquiry.inquiry_no}
          priorityUserIds={priorityUserIds}
          showToast={showToast}
        />
      </div>
      </div>

      <EditDealModal
        open={editOpen}
        initial={{ stage: stageIdx, assignedId: account?.assigned_profile || '', value: estValue, closeDate: account?.estimated_closing_date || '' }}
        assignees={assignees}
        onClose={() => setEditOpen(false)}
        onSave={saveEdit}
      />

      {/* Gate BANT — konfirmasi lunak saat menaikkan stage ke QUALIFIED */}
      <ConfirmModal
        open={stageGate.open}
        variant="warning"
        title="Score BANT Belum Optimal"
        message={stageGate.message}
        confirmLabel="Ya, Lanjut"
        cancelLabel="Batal"
        onConfirm={() => { stageGate.onYes?.(); setStageGate({ open: false, message: '', onYes: null }); }}
        onCancel={() => setStageGate({ open: false, message: '', onYes: null })}
      />

      {/* Ganti penawaran vendor terpilih — konfirmasi HANYA saat mengganti pilihan lama */}
      <ConfirmModal
        open={offerSwitchConfirm.open}
        variant="warning"
        title="Ganti Penawaran Terpilih"
        message={`Ganti pilihan penawaran ke vendor ${offerSwitchConfirm.offer?.vendorName || ''}? Ini akan menggantikan penawaran yang sedang dipakai untuk quotation.`}
        confirmLabel="Ya, Ganti"
        cancelLabel="Batal"
        onConfirm={() => {
          const { prf, offer } = offerSwitchConfirm;
          setOfferSwitchConfirm({ open: false, prf: null, offer: null });
          doSelectOffer(prf, offer);
        }}
        onCancel={() => setOfferSwitchConfirm({ open: false, prf: null, offer: null })}
      />

      {/* Tandai inquiry KALAH — kategori alasan memakai kosakata WinLossModal apa adanya */}
      <WinLossModal
        key={`lost-${inquiry.id}-${lossOpen}`}
        open={lossOpen}
        mode="lost"
        prospectName={inquiry.inquiry_no}
        saving={lossSaving}
        onSave={markInquiryLost}
        onCancel={() => setLossOpen(false)}
      />

      {/* Tandai inquiry MENANG — konfirmasi polos (nol form alasan), RPC yang
          menegakkan izin. Modal ditutup SEGERA saat konfirmasi (pola sama
          offerSwitchConfirm di atas) supaya tombol "Ya" tak bisa diklik dobel. */}
      <ConfirmModal
        open={wonOpen}
        variant="info"
        title="Tandai sebagai WON"
        message="Tandai inquiry ini sebagai WON? Akun terkait akan otomatis jadi customer."
        confirmLabel="Ya, Tandai WON"
        cancelLabel="Batal"
        onConfirm={() => { setWonOpen(false); markInquiryWon(); }}
        onCancel={() => setWonOpen(false)}
      />
    </div>
  );
}

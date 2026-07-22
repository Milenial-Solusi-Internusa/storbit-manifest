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

import { useState, useEffect, useCallback } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, Pencil, Hash, CalendarClock,
  Loader2, AlertCircle, Phone, MessageCircle, MapPin, Users, Mail, ListChecks, Anchor, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import {
  C, HEAD, BODY, STAGES, stageIndex, isKnownStage, isActiveStage, fmtDate, Card, InfoRow,
  DealStepper, DealHeaderControls, EditDealModal, QuotationListCard,
  PrfListCard, PriceSummaryCard, fetchAssignees, saveDealUpdate,
} from './DealPanels';
import { bantQualifyGate } from './bant';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import ConfirmModal from '../../components/ConfirmModal';
import WinLossModal from './WinLossModal';

// Status inquiry yang masih boleh ditandai KALAH. WON / LOST / CANCELLED terminal →
// aksinya tidak dirender sama sekali (bukan disabled).
const LOSABLE_INQUIRY_STATUS = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];

const SERVICE_LABEL = {
  freight_forwarding: 'Freight Forwarding',
  customs: 'Customs Clearance',
  trading: 'General Trading',
};
const ACT_ICON = {
  call: Phone, whatsapp: MessageCircle, visit: MapPin, meeting: Users,
  email: Mail, followup: ListChecks,
};

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
function Header({ name, stageIdx, stageKey, inquiryNo, assignedName, closeDate, value, onBack, onEdit, onPickStage }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute }}><ChevronLeft size={18} /></button>
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>Inquiry List</button>
        <ChevronRight size={14} color={C.textFaint} />
        <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>Detail Deal</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontFamily: HEAD, fontSize: 25, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{name || '—'}</h1>
            <StageBadge idx={stageIdx} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 600, color: C.navy, background: C.navySoft, padding: '4px 11px', borderRadius: 8 }}>
              <Hash size={13} />{inquiryNo || '—'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: BODY, fontSize: 13, color: C.textMute }}>
              <Avatar name={assignedName} size={26} />{assignedName || 'Belum di-assign'}
            </span>
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

/* ========================================================================= */
export default function DealDetailPage({ inquiryId, onBack, onCreateQuotation, onViewQuotation, onEditInquiry, onCreatePRF, showToast }) {
  const { profile, erpRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inquiry, setInquiry] = useState(null);
  const [account, setAccount] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [prfs, setPrfs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [profMap, setProfMap] = useState({});
  const [termMap, setTermMap] = useState({});
  const [assignees, setAssignees] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Konfirmasi lunak gate BANT (skor 5–7 → QUALIFIED) — pola pending-action yang sama
  // dengan stageGate di PipelineKanbanPage.
  const [stageGate, setStageGate] = useState({ open: false, message: '', onYes: null });
  // Tandai inquiry KALAH (Task 4) — memakai ulang WinLossModal mode='lost'.
  const [lossOpen, setLossOpen] = useState(false);
  const [lossSaving, setLossSaving] = useState(false);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!inquiryId) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data: inq, error: e1 } = await supabase
        .from('inquiries')
        .select('id, inquiry_no, service_type, route, commodity, estimated_volume, status, notes, prospect_id, created_by, created_at, deadline_quote, pol, pod, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, cargo_types, un_number, imo_class, has_msds, additional_services')
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
        .select('id, quotation_no, total_amount, status, valid_until, created_at, payment_terms_id')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000);

      // PRF born from this inquiry (RLS-scoped as-is — sales sees only own PRF).
      const { data: prfRows } = await supabase
        .from('prf')
        .select('id, prf_no, service_type, status, created_at')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(200);

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
      setPrfs(prfRows || []);
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

  const stageIdx = stageIndex(account?.pipeline_stage);
  const estValue = Number(account?.estimated_value || 0);
  const assignedName = profMap[account?.assigned_profile] || profMap[account?.assigned_to] || null;
  const createdByName = profMap[inquiry?.created_by] || null;
  // Aksi "Tandai Kalah" hanya untuk status yang belum terminal (default 'OPEN' bila
  // kolomnya kosong). WON / LOST / CANCELLED → tombolnya tidak dirender sama sekali.
  const canMarkLost = LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase());

  // Update accounts row (used by both Edit modal & Pindah Stage). Returns boolean.
  // Single shared write path (saveDealUpdate) so the audit trail matches
  // CustomerDetailPage's deal controls exactly.
  async function updateAccount(patch, auditStageKey) {
    if (!account?.id) { showToast?.('Prospect tidak ditemukan untuk deal ini', 'error'); return false; }
    const ok = await saveDealUpdate({
      accountId: account.id, patch, auditStageKey,
      prevStage: account.pipeline_stage, accountName: account.name,
      actor: { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id },
      showToast,
    });
    if (ok) refetch();
    return ok;
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
  // Tidak ada aksi "Tandai Menang" tandingannya: WON hanya lahir dari SO lewat trigger.
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

  // ── loading / not-found ──
  if (loading) {
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textFaint, fontFamily: BODY }}>
        <Loader2 size={30} className="dd-spin" />
        <div style={{ fontSize: 13.5 }}>Memuat detail deal…</div>
        <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}`}</style>
      </div>
    );
  }
  if (notFound || !inquiry) {
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textMute, fontFamily: BODY }}>
        <AlertCircle size={30} color={C.red} />
        <div style={{ fontFamily: HEAD, fontSize: 16, fontWeight: 700, color: C.text }}>Inquiry tidak ditemukan</div>
        <button onClick={onBack} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}><ChevronLeft size={15} />Kembali</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: BODY, color: C.text }}>
      <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}`}</style>

      <DealStepper current={stageIdx} value={estValue} />

      <Header
        name={account?.name}
        stageIdx={stageIdx}
        stageKey={account?.pipeline_stage || 'NEW'}
        inquiryNo={inquiry.inquiry_no}
        assignedName={assignedName}
        closeDate={account?.estimated_closing_date}
        value={estValue}
        onBack={onBack}
        onEdit={() => setEditOpen(true)}
        onPickStage={pickStage}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 20, alignItems: 'start' }} className="dd-cols">
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <Card
            title="Detail Inquiry"
            icon={<FileText size={17} />}
            right={(onEditInquiry || canMarkLost) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {onEditInquiry && (
                  <button onClick={onEditInquiry} style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Pencil size={14} />Edit Inquiry
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
              <InfoRow label="Komoditas" value={inquiry.commodity} />
              <InfoRow label="Dibuat Oleh" value={createdByName} />
              <InfoRow label="Tanggal Dibuat" value={fmtDate(inquiry.created_at)} />
              <InfoRow label="Notes" value={inquiry.notes} full />
            </div>
          </Card>

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
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <QuotationListCard quotations={quotations} onCreate={onCreateQuotation} onView={onViewQuotation} />
          <PrfListCard prfs={prfs} canCreate={['sales', 'gm_bd'].includes(erpRole)} onCreate={onCreatePRF} />
          <PriceSummaryCard quotations={quotations} termMap={termMap} />
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

      <style>{`@media (max-width: 860px){ .dd-cols{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

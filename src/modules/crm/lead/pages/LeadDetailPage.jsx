// src/modules/crm/lead/pages/LeadDetailPage.jsx
// "Lead Qualification to Inquiry" / Detail Lead -- design-handoff/crm-2026-10-11/
// shots/lead/16-23 (sales) + 30-32 (supervisor). Batch DS 3 Lead Management,
// Paket 1 irisan 5. Rute /crm/lead/capture/:id (crm.routes.jsx).
//
// Akun yang SUDAH lifecycle_stage='customer' TIDAK PERNAH merender halaman
// ini -- LeadDetailRoute (crm.routes.jsx) mengalihkan ke /crm/customer/:id
// SEBELUM mount. Tab "Customer" di mockup (33-detail-customertab-preview…)
// karena itu SENGAJA TIDAK DIBANGUN di sini.
//
// Related Documents SATU panel DI BAWAH Notebook (bukan di dalam tab apa
// pun) -- dirender sekali di body FormSheet, persis instruksi "panel di
// bawah tab", dan tampil identik di seluruh enam tab karena anatominya
// memang begitu di mockup.
import { useCallback, useEffect, useState } from 'react';
import { MoreVertical, Phone, Mail, MessageCircle, MapPin, Calendar, FileText, Users, RefreshCw, Inbox } from 'lucide-react';
import {
  FormSheet, Notebook, StatusBar, Badge, Card, EmptyState, SaveButton, Button, OutlineBtn, PrimaryBtn,
  FloatingInput, FloatingSelect, MasterSelect, Textarea, IconButton,
} from '../../../../kit';
import {
  INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, CARD, FONT_BODY, FONT_HEAD, FONT_MONO,
  RADIUS, SP, fmtRp, avatarToneFor,
} from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isManagerOrAbove } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { readMoneyInput, formatIdNumber } from '../../../../lib/numberFormat';
import { BANT_DIMENSIONS, BANT_MAX_SCORE, calcBantScore } from '../../lib/bant';
import { LEAD_STATUS_META, deriveLeadStatus } from '../lib/leadStatus';
import { SOURCES, SOURCE_LABELS, PRIORITIES } from '../lib/leadOptions';
import { ACTIVITY_TYPE_LABEL, listLeadActivities, addLeadNote, scheduleLeadFollowUp } from '../lib/leadActivity';
import RequestNewOptionModal from '../../components/RequestNewOptionModal';
import ReassignModal from '../components/ReassignModal';
import MarkAsLostModal from '../components/MarkAsLostModal';
import ArchiveModal from '../components/ArchiveModal';

const STAGE_SEGMENTS = [
  { id: 'raw', label: 'Raw' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'converted', label: 'Converted' },
  { id: 'customer', label: 'Customer' },
];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ViewField({ label, value, mono, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 14px', background: CARD, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 4, fontFamily: FONT_BODY }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? INK : INK_FAINT, fontFamily: mono ? FONT_MONO : FONT_BODY, fontWeight: 500, fontStyle: value ? 'normal' : 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value || 'Not set'}
      </div>
    </div>
  );
}

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 };
const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SP.s4 };

function OwnerLine({ id, name, canReassign, onReassign }) {
  const tone = name ? avatarToneFor(id) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {name ? (
        <>
          <span style={{ width: 22, height: 22, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 22px' }}>
            {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <span style={{ fontSize: 14, color: INK, fontFamily: FONT_BODY }}>{name}</span>
        </>
      ) : <span style={{ fontSize: 14, color: INK_FAINT, fontFamily: FONT_BODY, fontStyle: 'italic' }}>Unassigned</span>}
      {canReassign && (
        <button type="button" onClick={onReassign} style={{ background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_BODY }}>Reassign</button>
      )}
    </div>
  );
}

/**
 * @param {string} id
 * @param {() => void} onBack
 * @param {() => void} [onCreateInquiry]
 * @param {(inquiryId:string) => void} [onOpenInquiry]
 * @param {(quotationId:string) => void} [onOpenQuotation]
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function LeadDetailPage({ id, onBack, onCreateInquiry, onOpenInquiry, onOpenQuotation, showToast }) {
  const { profile, erpRoles } = useAuth();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [actorMap, setActorMap] = useState({});
  const [latestInquiry, setLatestInquiry] = useState(null);
  const [latestQuotation, setLatestQuotation] = useState(null);
  const [industryOptions, setIndustryOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [requestOptionFor, setRequestOptionFor] = useState(null);

  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const fetchAccount = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('accounts')
      .select('*, assigned_profile:profiles!prospects_assigned_to_fkey(id, full_name)')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) showToast?.('Failed to load lead: ' + error.message, 'error');
    setAccount(data || null);
    setLoading(false);
  }, [id, showToast]);
  useEffect(() => { Promise.resolve().then(fetchAccount); }, [fetchAccount]);

  const fetchContacts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('contacts').select('*').eq('account_id', id).is('deleted_at', null)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: true });
    setContacts(data || []);
  }, [id]);
  useEffect(() => { Promise.resolve().then(fetchContacts); }, [fetchContacts]);

  const fetchActivities = useCallback(async () => {
    if (!id) return;
    const { data, error } = await listLeadActivities(id);
    if (error) { showToast?.('Failed to load activity: ' + error.message, 'error'); return; }
    setActivities(data || []);
    const ids = [...new Set((data || []).map((a) => a.created_by).filter(Boolean))];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map = {};
      (profs || []).forEach((p) => { map[p.id] = p.full_name; });
      setActorMap(map);
    }
  }, [id, showToast]);
  useEffect(() => { Promise.resolve().then(fetchActivities); }, [fetchActivities]);

  const fetchHistory = useCallback(async () => {
    if (!id) return;
    const { data: inqs } = await supabase.from('inquiries').select('id, inquiry_no, status, created_at')
      .eq('prospect_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1);
    const inq = inqs?.[0] || null;
    setLatestInquiry(inq);
    if (inq) {
      const { data: quos } = await supabase.from('quotations').select('id, quotation_no, status, revision')
        .eq('inquiry_id', inq.id).is('deleted_at', null).order('revision', { ascending: false }).limit(1);
      setLatestQuotation(quos?.[0] || null);
    } else {
      setLatestQuotation(null);
    }
  }, [id]);
  useEffect(() => { Promise.resolve().then(fetchHistory); }, [fetchHistory]);

  useEffect(() => {
    supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lead_industry').eq('is_active', true).is('deleted_at', null)
      .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setIndustryOptions(data || []));
    supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lead_category').eq('is_active', true).is('deleted_at', null)
      .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setCategoryOptions(data || []));
  }, []);

  const companyId = account?.company_id;
  const canManage = account ? isManagerOrAbove(erpRoles, { companyId }) : false;
  const isOwner = account ? account.assigned_to === profile?.id : false;
  const status = account ? deriveLeadStatus(account) : null;
  const statusMeta = status ? LEAD_STATUS_META[status] : null;
  const bantScore = account ? calcBantScore(account) : 0;
  const entityCode = ENTITIES.find((e) => e.id === companyId)?.code || '—';

  const canMarkQualified = account && status === 'raw' && (isOwner || canManage);
  const canMarkLost = account && status !== 'lost' && (isOwner || canManage);
  const canArchive = !!canManage;

  async function handleMarkQualified() {
    const { error } = await supabase.from('accounts')
      .update({ qualified_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', id);
    if (error) return { error };
    await supabase.from('activities').insert({
      account_id: id, company_id: companyId, type: 'status_change', status: 'done',
      notes: 'Raw to Qualified', created_by: profile.id, completed_at: new Date().toISOString(),
    });
    setAccount((a) => ({ ...a, qualified_at: new Date().toISOString() }));
    fetchActivities();
    return undefined;
  }

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>;
  }
  if (!account) {
    return <EmptyState icon="inbox" title="Lead not found" sub="It may have been archived or removed." action={<OutlineBtn onClick={onBack}>Back to list</OutlineBtn>} />;
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'activity', label: 'Activity' },
    { id: 'bant', label: 'BANT & Pipeline' },
    { id: 'history', label: 'History' },
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <div>
      <FormSheet
        breadcrumb={(
          <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: INK_SOFT, fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY }}>
            ← Back to list
          </button>
        )}
        kicker="Lead"
        title={account.name}
        docNo={account.code}
        meta={(
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {statusMeta && <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
            <Badge tone="neutral">{entityCode}</Badge>
            <Badge tone="neutral">{SOURCE_LABELS[account.source] || account.source || '—'}</Badge>
          </div>
        )}
        actions={(
          <div style={{ display: 'flex', gap: SP.s2, alignItems: 'center', position: 'relative' }}>
            {canMarkQualified && (
              <SaveButton onSave={handleMarkQualified} variant="secondary" label="Mark Qualified" savedLabel="Qualified!"
                onError={(err) => showToast?.('Failed to update: ' + err.message, 'error')} />
            )}
            {onCreateInquiry && <PrimaryBtn onClick={onCreateInquiry}>Create Inquiry</PrimaryBtn>}
            {(canMarkLost || canArchive) && (
              <>
                <IconButton icon={<MoreVertical size={16} />} label="More actions" onClick={() => setMenuOpen((o) => !o)} />
                {menuOpen && (
                  <>
                    <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 160, zIndex: 10, overflow: 'hidden' }}>
                      {canMarkLost && (
                        <button type="button" onClick={() => { setMenuOpen(false); setLostOpen(true); }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: '#B4432A' }}>
                          Mark as Lost
                        </button>
                      )}
                      {canArchive && (
                        <button type="button" onClick={() => { setMenuOpen(false); setArchiveOpen(true); }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>
                          Archive
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
        status={(
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.s5, paddingBottom: SP.s3, borderBottom: `1px solid ${LINE_SOFT}`, marginBottom: SP.s3 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>Owner</div>
                <OwnerLine id={account.assigned_to} name={account.assigned_profile?.full_name} canReassign={canManage} onReassign={() => setReassignOpen(true)} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>Last Touched</div>
                <div style={{ fontSize: 14, color: INK, fontFamily: FONT_MONO }}>{fmtDate(account.last_activity_at)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>Estimated Value</div>
                <div style={{ fontSize: 14, color: INK, fontFamily: FONT_MONO }}>{account.estimated_value != null ? fmtRp(account.estimated_value) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>BANT Score</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: INK, fontWeight: 600 }}>{bantScore}/{BANT_MAX_SCORE}</span>
                  <span style={{ width: 60, height: 5, borderRadius: 999, background: HEAD_BG, overflow: 'hidden', display: 'inline-block' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(bantScore / BANT_MAX_SCORE) * 100}%`, background: INK_SOFT, borderRadius: 999 }} />
                  </span>
                </div>
              </div>
            </div>
            <StatusBar stages={STAGE_SEGMENTS} current={status === 'lost' ? null : status}
              closed={status === 'lost' ? { stage: 'LOST', label: 'Lost' } : null} />
          </div>
        )}
      >
        <Notebook tabs={tabs} value={tab} onChange={setTab}>
          {tab === 'overview' && (
            <OverviewTab
              account={account} setAccount={setAccount} id={id} companyId={companyId}
              industryOptions={industryOptions} categoryOptions={categoryOptions}
              onRequestNewOption={(key) => setRequestOptionFor(key)}
              showToast={showToast}
            />
          )}
          {tab === 'contacts' && <ContactsTab contacts={contacts} />}
          {tab === 'activity' && (
            <ActivityTab activities={activities} actorMap={actorMap} accountId={id} companyId={companyId}
              profile={profile} showToast={showToast} onChanged={fetchActivities} />
          )}
          {tab === 'bant' && <BantTab account={account} id={id} setAccount={setAccount} showToast={showToast} />}
          {tab === 'history' && <HistoryTab inquiry={latestInquiry} onOpenInquiry={onOpenInquiry} />}
          {tab === 'notes' && (
            <NotesTab activities={activities} actorMap={actorMap} accountId={id} companyId={companyId}
              profile={profile} showToast={showToast} onChanged={fetchActivities} />
          )}
        </Notebook>

        <RelatedDocuments account={account} statusMeta={statusMeta}
          inquiry={latestInquiry} quotation={latestQuotation}
          onOpenInquiry={onOpenInquiry} onOpenQuotation={onOpenQuotation} />
      </FormSheet>

      <ReassignModal open={reassignOpen} onClose={() => setReassignOpen(false)} account={account} showToast={showToast}
        onReassigned={() => { setReassignOpen(false); showToast?.('Lead reassigned'); fetchAccount(); fetchActivities(); }} />
      <MarkAsLostModal open={lostOpen} onClose={() => setLostOpen(false)} account={account} showToast={showToast}
        onMarked={() => { setLostOpen(false); showToast?.('Lead marked as Lost'); fetchAccount(); fetchActivities(); }} />
      <ArchiveModal open={archiveOpen} onClose={() => setArchiveOpen(false)} account={account} showToast={showToast}
        onArchived={() => { setArchiveOpen(false); showToast?.('Lead archived'); onBack?.(); }} />
      <RequestNewOptionModal
        open={!!requestOptionFor} onClose={() => setRequestOptionFor(null)}
        listKey={requestOptionFor === 'industry' ? 'lead_industry' : 'lead_category'}
        listLabel={requestOptionFor === 'industry' ? 'Industry' : 'Lead Category'}
        companyId={null}
        onSubmitted={(result) => {
          if (result.mode === 'direct') {
            const slug = result.option.label.trim().toLowerCase().replace(/\s+/g, '_');
            const opt = { id: result.option.id, value: slug, label: result.option.label };
            if (requestOptionFor === 'industry') setIndustryOptions((o) => [...o, opt]);
            else setCategoryOptions((o) => [...o, opt]);
          }
        }}
      />
    </div>
  );
}

/* =========================================================================
   OVERVIEW -- Company / Commercial / Notes, masing-masing kartu ber-Edit
   sendiri. Entity SENGAJA selalu read-only (ganti entitas = lintas scope
   RLS/penomoran, di luar cakupan irisan ini). Owner di kartu Commercial JUGA
   read-only + link "Reassign" -- perubahan owner HANYA lewat ReassignModal
   supaya tercatat di activity log + notifikasi (bukan Edit polos).
   ========================================================================= */
function OverviewTab({ account, setAccount, id, companyId, industryOptions, categoryOptions, onRequestNewOption, showToast }) {
  const entityCode = ENTITIES.find((e) => e.id === companyId)?.code || '—';

  const [companyEdit, setCompanyEdit] = useState(false);
  const [companyDraft, setCompanyDraft] = useState(null);
  function startCompanyEdit() {
    setCompanyDraft({
      name: account.name || '', legal_name: account.legal_name || '', industry: account.industry || '',
      lead_category: account.lead_category || '', priority: account.priority || '', website: account.website || '',
      address: account.address || '', city: account.city || '', country: account.country || 'Indonesia',
    });
    setCompanyEdit(true);
  }
  async function saveCompany() {
    if (!companyDraft.name.trim()) return { error: new Error('Company Name wajib diisi') };
    const payload = { ...companyDraft, name: companyDraft.name.trim(), legal_name: companyDraft.legal_name.trim() || null };
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) return { error };
    setAccount((a) => ({ ...a, ...payload }));
    setCompanyEdit(false);
    return undefined;
  }

  const [commercialEdit, setCommercialEdit] = useState(false);
  const [commercialDraft, setCommercialDraft] = useState(null);
  function startCommercialEdit() {
    setCommercialDraft({
      source: account.source || '', estimated_value: formatIdNumber(account.estimated_value) || '',
      estimated_closing_date: account.estimated_closing_date || '',
    });
    setCommercialEdit(true);
  }
  async function saveCommercial() {
    const { value: estVal, unrecognized } = readMoneyInput(commercialDraft.estimated_value);
    if (unrecognized) return { error: new Error('Estimated Value tidak dikenali') };
    const payload = {
      source: commercialDraft.source || null, estimated_value: estVal,
      estimated_closing_date: commercialDraft.estimated_closing_date || null,
    };
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) return { error };
    setAccount((a) => ({ ...a, ...payload }));
    setCommercialEdit(false);
    return undefined;
  }

  const [notesEdit, setNotesEdit] = useState(false);
  const [notesDraft, setNotesDraft] = useState(null);
  function startNotesEdit() {
    setNotesDraft({ description: account.description || '', notes: account.notes || '', qualified_reason: account.qualified_reason || '' });
    setNotesEdit(true);
  }
  async function saveNotes() {
    const payload = {
      description: notesDraft.description.trim() || null, notes: notesDraft.notes.trim() || null,
      qualified_reason: notesDraft.qualified_reason.trim() || null,
    };
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) return { error };
    setAccount((a) => ({ ...a, ...payload }));
    setNotesEdit(false);
    return undefined;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s5 }}>
      <Card title="Company" right={!companyEdit && <OutlineBtn size="sm" onClick={startCompanyEdit}>Edit</OutlineBtn>}>
        {companyEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <div style={grid3}>
              <FloatingInput label="Company Name" value={companyDraft.name} onChange={(v) => setCompanyDraft((d) => ({ ...d, name: v }))} />
              <FloatingInput label="Legal Name" value={companyDraft.legal_name} onChange={(v) => setCompanyDraft((d) => ({ ...d, legal_name: v }))} />
              <ViewField label="Entity" value={entityCode} />
            </div>
            <div style={grid3}>
              <MasterSelect label="Industry" value={companyDraft.industry} onChange={(v) => setCompanyDraft((d) => ({ ...d, industry: v }))}
                options={industryOptions.map((o) => ({ value: o.value, label: o.label }))} onRequestNew={() => onRequestNewOption('industry')} />
              <MasterSelect label="Lead Category" value={companyDraft.lead_category} onChange={(v) => setCompanyDraft((d) => ({ ...d, lead_category: v }))}
                options={categoryOptions.map((o) => ({ value: o.value, label: o.label }))} onRequestNew={() => onRequestNewOption('lead_category')} />
              <FloatingSelect label="Priority" value={companyDraft.priority} onChange={(v) => setCompanyDraft((d) => ({ ...d, priority: v }))}
                options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
            </div>
            <div style={grid2}>
              <FloatingInput label="Website" value={companyDraft.website} onChange={(v) => setCompanyDraft((d) => ({ ...d, website: v }))} />
              <FloatingInput label="Address" value={companyDraft.address} onChange={(v) => setCompanyDraft((d) => ({ ...d, address: v }))} />
            </div>
            <div style={grid2}>
              <FloatingInput label="City" value={companyDraft.city} onChange={(v) => setCompanyDraft((d) => ({ ...d, city: v }))} />
              <FloatingInput label="Country" value={companyDraft.country} onChange={(v) => setCompanyDraft((d) => ({ ...d, country: v }))} />
            </div>
            <div style={{ display: 'flex', gap: SP.s2, justifyContent: 'flex-end' }}>
              <OutlineBtn size="sm" onClick={() => setCompanyEdit(false)}>Cancel</OutlineBtn>
              <SaveButton size="sm" onSave={saveCompany} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <div style={grid3}>
              <ViewField label="Company Name" value={account.name} />
              <ViewField label="Legal Name" value={account.legal_name} />
              <ViewField label="Entity" value={entityCode} />
            </div>
            <div style={grid3}>
              <ViewField label="Industry" value={industryOptions.find((o) => o.value === account.industry)?.label || account.industry} />
              <ViewField label="Lead Category" value={categoryOptions.find((o) => o.value === account.lead_category)?.label || account.lead_category} />
              <ViewField label="Priority" value={account.priority} />
            </div>
            <div style={grid2}>
              <ViewField label="Website" value={account.website} />
              <ViewField label="Address" value={account.address} />
            </div>
            <div style={grid2}>
              <ViewField label="City" value={account.city} />
              <ViewField label="Country" value={account.country} />
            </div>
          </div>
        )}
      </Card>

      <Card title="Commercial" right={!commercialEdit && <OutlineBtn size="sm" onClick={startCommercialEdit}>Edit</OutlineBtn>}>
        {commercialEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <div style={grid3}>
              <FloatingSelect label="Source" value={commercialDraft.source} onChange={(v) => setCommercialDraft((d) => ({ ...d, source: v }))}
                options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))} />
              <ViewField label="Owner" value={account.assigned_profile?.full_name} />
              <FloatingInput label="Estimated Value" value={commercialDraft.estimated_value} onChange={(v) => setCommercialDraft((d) => ({ ...d, estimated_value: v }))} mono />
            </div>
            <FloatingInput label="Expected Closing Date" type="date" half value={commercialDraft.estimated_closing_date} onChange={(v) => setCommercialDraft((d) => ({ ...d, estimated_closing_date: v }))} />
            <div style={{ display: 'flex', gap: SP.s2, justifyContent: 'flex-end' }}>
              <OutlineBtn size="sm" onClick={() => setCommercialEdit(false)}>Cancel</OutlineBtn>
              <SaveButton size="sm" onSave={saveCommercial} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
            </div>
          </div>
        ) : (
          <div style={grid3}>
            <ViewField label="Source" value={SOURCE_LABELS[account.source] || account.source} />
            <ViewField label="Owner" value={account.assigned_profile?.full_name} />
            <ViewField label="Estimated Value" value={account.estimated_value != null ? fmtRp(account.estimated_value) : null} mono />
            <ViewField label="Expected Closing Date" value={fmtDate(account.estimated_closing_date)} />
          </div>
        )}
      </Card>

      <Card title="Notes" right={!notesEdit && <OutlineBtn size="sm" onClick={startNotesEdit}>Edit</OutlineBtn>}>
        {notesEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <Textarea label="Lead Description" value={notesDraft.description} onChange={(v) => setNotesDraft((d) => ({ ...d, description: v }))} rows={3} />
            <Textarea label="Internal Notes" value={notesDraft.notes} onChange={(v) => setNotesDraft((d) => ({ ...d, notes: v }))} rows={3} />
            <Textarea label="Qualified Reason" value={notesDraft.qualified_reason} onChange={(v) => setNotesDraft((d) => ({ ...d, qualified_reason: v }))} rows={3} />
            <div style={{ display: 'flex', gap: SP.s2, justifyContent: 'flex-end' }}>
              <OutlineBtn size="sm" onClick={() => setNotesEdit(false)}>Cancel</OutlineBtn>
              <SaveButton size="sm" onSave={saveNotes} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <ViewField label="Lead Description" value={account.description} full />
            <ViewField label="Internal Notes" value={account.notes} full />
            <ViewField label="Qualified Reason" value={account.qualified_reason} full />
          </div>
        )}
      </Card>
    </div>
  );
}

/* =========================================================================
   CONTACTS -- read-only (nol "+ Add Contact"/edit-per-kontak di irisan ini;
   belum ada modal yang memintanya secara eksplisit -- lihat laporan akhir).
   ========================================================================= */
function ContactsTab({ contacts }) {
  if (!contacts.length) return <EmptyState icon="users" title="No contacts yet" sub="Contacts captured for this lead will appear here." />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: SP.s4 }}>
      {contacts.map((c) => {
        const tone = avatarToneFor(c.id);
        const initials = c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
        return (
          <div key={c.id} style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, background: CARD }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.s3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD }}>{initials}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{c.name}</span>
              </div>
              {c.is_primary && <Badge tone="info">Primary</Badge>}
            </div>
            <div style={grid2}>
              <ViewField label="Position" value={c.position} />
              <ViewField label="Role" value={c.role_type} />
              <ViewField label="Phone" value={c.phone} mono />
              <ViewField label="WhatsApp" value={c.whatsapp} mono />
            </div>
            <div style={{ marginTop: SP.s4, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
              <ViewField label="Email" value={c.email} full />
              <ViewField label="Preferred Channel" value={c.preferred_channel ? (c.preferred_channel === 'whatsapp' ? 'WhatsApp' : c.preferred_channel === 'call' ? 'Call' : 'Email') : null} full />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================================
   ACTIVITY -- Add Note + Schedule Follow Up (komposer inline, satu aktif
   sekaligus) + timeline SEMUA type, terbaru dulu (urut created_at, bukan
   scheduled_for -- lihat catatan di laporan akhir).
   ========================================================================= */
const ACTIVITY_ICON = {
  note: FileText, call: Phone, whatsapp: MessageCircle, visit: MapPin, meeting: Users,
  email: Mail, followup: Calendar, owner_change: RefreshCw, status_change: RefreshCw, lead_lost: Inbox,
};
function activityLabel(type) {
  return ACTIVITY_TYPE_LABEL[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ') : 'Activity');
}

function ActivityTab({ activities, actorMap, accountId, companyId, profile, showToast, onChanged }) {
  const [composer, setComposer] = useState(null); // null | 'note' | 'followup'
  const [text, setText] = useState('');
  const [followDate, setFollowDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function submitNote() {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await addLeadNote({ accountId, companyId, userId: profile.id, text: text.trim() });
    setSaving(false);
    if (error) { showToast?.('Failed to add note: ' + error.message, 'error'); return; }
    setText(''); setComposer(null); onChanged?.();
  }
  async function submitFollowUp() {
    if (!followDate) return;
    setSaving(true);
    const { error } = await scheduleLeadFollowUp({ accountId, companyId, userId: profile.id, assignedTo: profile.id, date: followDate, notes: text.trim() || null });
    setSaving(false);
    if (error) { showToast?.('Failed to schedule follow up: ' + error.message, 'error'); return; }
    setText(''); setFollowDate(''); setComposer(null); onChanged?.();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: SP.s2, marginBottom: SP.s4 }}>
        <OutlineBtn size="sm" onClick={() => setComposer(composer === 'note' ? null : 'note')}>Add Note</OutlineBtn>
        <OutlineBtn size="sm" onClick={() => setComposer(composer === 'followup' ? null : 'followup')}>Schedule Follow Up</OutlineBtn>
      </div>

      {composer === 'note' && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, marginBottom: SP.s4, background: CARD }}>
          <Textarea label="New internal note" value={text} onChange={setText} rows={3} placeholder="Visible to your team only" />
          <div style={{ display: 'flex', gap: SP.s2, marginTop: SP.s3 }}>
            <Button variant="primary" size="sm" disabled={!text.trim() || saving} loading={saving} onClick={submitNote}>Add Note</Button>
            <OutlineBtn size="sm" onClick={() => { setComposer(null); setText(''); }}>Cancel</OutlineBtn>
          </div>
        </div>
      )}
      {composer === 'followup' && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, marginBottom: SP.s4, background: CARD, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
          <FloatingInput label="Follow-up Date" type="date" value={followDate} onChange={setFollowDate} />
          <Textarea label="Notes" value={text} onChange={setText} rows={2} hint="Optional" />
          <div style={{ display: 'flex', gap: SP.s2 }}>
            <Button variant="primary" size="sm" disabled={!followDate || saving} loading={saving} onClick={submitFollowUp}>Schedule</Button>
            <OutlineBtn size="sm" onClick={() => { setComposer(null); setText(''); setFollowDate(''); }}>Cancel</OutlineBtn>
          </div>
        </div>
      )}

      {!activities.length ? (
        <EmptyState icon="inbox" title="No activity yet" sub="Calls, visits, notes, and status changes will appear here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
          {activities.map((a) => {
            const Icon = ACTIVITY_ICON[a.type] || FileText;
            return (
              <div key={a.id} style={{ display: 'flex', gap: SP.s3, border: `1px solid ${LINE_SOFT}`, borderRadius: RADIUS.md, padding: '12px 14px', background: CARD }}>
                <Icon size={16} color={INK_SOFT} style={{ marginTop: 2, flex: '0 0 auto' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{activityLabel(a.type)}</span>
                    <span style={{ fontSize: 12, color: INK_FAINT, fontFamily: FONT_BODY }}>{fmtDateTime(a.created_at)}{a.created_by && actorMap[a.created_by] ? `, ${actorMap[a.created_by]}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY, marginTop: 2 }}>{a.notes || a.outcome || a.next_action || '—'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   NOTES -- komposer SELALU tampil + daftar entri type='note' saja (sumber
   SAMA dengan Activity tab, hanya filter baca beda -- instruksi "pola yang
   sudah ada, JANGAN tabel baru").
   ========================================================================= */
function NotesTab({ activities, actorMap, accountId, companyId, profile, showToast, onChanged }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const notes = activities.filter((a) => a.type === 'note');

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await addLeadNote({ accountId, companyId, userId: profile.id, text: text.trim() });
    setSaving(false);
    if (error) { showToast?.('Failed to add note: ' + error.message, 'error'); return; }
    setText(''); onChanged?.();
  }

  return (
    <div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, marginBottom: SP.s4, background: CARD }}>
        <Textarea label="New internal note" value={text} onChange={setText} rows={3} placeholder="Visible to your team only" />
        <div style={{ marginTop: SP.s3 }}>
          <Button variant="primary" size="sm" disabled={!text.trim() || saving} loading={saving} onClick={submit}>Add Note</Button>
        </div>
      </div>

      {!notes.length ? (
        <EmptyState icon="inbox" title="No notes yet" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {notes.map((n, i) => (
            <div key={n.id} style={{ padding: '14px 0', borderBottom: i < notes.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{n.created_by ? (actorMap[n.created_by] || '—') : '—'}</span>
                <span style={{ fontSize: 12, color: INK_FAINT, fontFamily: FONT_BODY }}>{fmtDateTime(n.created_at)}</span>
              </div>
              <div style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY, marginTop: 4 }}>{n.notes}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   BANT & PIPELINE -- empat skor 0-3 klik-langsung (bant_budget/authority/
   need/timeline, nol konfirmasi -- sama ringannya dgn klik di
   LeadCapturePage/BantCell). "Qualification Data" (7 kolom legacy
   bant_commodity dkk, lihat lib/bant.js "Legacy compatibility — kolom lama
   dipertahankan di DB [tech debt]") SENGAJA read-only tanpa Edit di irisan
   ini -- menulis UI edit baru untuk kolom yang kodenya sendiri sudah
   menandai sebagai tech debt bukan pekerjaan yang diminta; dicatat di
   laporan akhir sebagai deviasi sadar dari mockup.
   ========================================================================= */
function BantTab({ account, id, setAccount, showToast }) {
  const score = calcBantScore(account);
  async function setDim(key, value) {
    const prev = account[key];
    setAccount((a) => ({ ...a, [key]: value }));
    const { error } = await supabase.from('accounts').update({ [key]: value, last_activity_at: new Date().toISOString() }).eq('id', id);
    if (error) { setAccount((a) => ({ ...a, [key]: prev })); showToast?.('Failed to update BANT: ' + error.message, 'error'); }
  }
  const legacy = [
    { label: 'Commodity', key: 'bant_commodity' }, { label: 'Origin', key: 'bant_origin' },
    { label: 'Destination', key: 'bant_destination' }, { label: 'Shipping Frequency', key: 'bant_frequency' },
    { label: 'Current Vendor', key: 'bant_current_vendor' }, { label: 'Payment Method', key: 'bant_payment' },
    { label: 'Decision Maker', key: 'bant_decision_maker' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s5 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.s2 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: INK }}>BANT Score</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: INK }}>{score}/{BANT_MAX_SCORE}</div>
        </div>
        <span style={{ display: 'block', height: 6, borderRadius: 999, background: HEAD_BG, overflow: 'hidden', marginBottom: SP.s4 }}>
          <span style={{ display: 'block', height: '100%', width: `${(score / BANT_MAX_SCORE) * 100}%`, background: INK_SOFT, borderRadius: 999 }} />
        </span>
        <div style={grid2}>
          {BANT_DIMENSIONS.map((dim) => (
            <div key={dim.key} style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, background: CARD }}>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: INK }}>{dim.label}</div>
              <div style={{ fontSize: 12.5, color: INK_SOFT, fontFamily: FONT_BODY, marginTop: 2, marginBottom: SP.s3 }}>{dim.description}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {dim.options.map((o) => {
                  const active = Number(account[dim.key]) === o.value;
                  return (
                    <button key={o.value} type="button" onClick={() => setDim(dim.key, o.value)}
                      style={{
                        width: 34, height: 34, borderRadius: RADIUS.md, border: `1px solid ${active ? INK : LINE}`,
                        background: active ? HEAD_BG : CARD, color: INK, fontFamily: FONT_MONO, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
                      }}>
                      {o.value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card title="Qualification Data">
        <div style={grid3}>
          {legacy.map((f) => <ViewField key={f.key} label={f.label} value={account[f.key]} />)}
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   HISTORY -- disederhanakan jadi inquiry TERBARU untuk akun ini (bukan
   daftar lengkap riwayat quotation bersarang) -- lihat laporan akhir.
   ========================================================================= */
function HistoryTab({ inquiry, onOpenInquiry }) {
  if (!inquiry) return <EmptyState icon="inbox" title="No inquiry history for this account yet." />;
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: onOpenInquiry ? 'pointer' : 'default' }}
      onClick={() => onOpenInquiry?.(inquiry.id)}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY }}>Inquiry</div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: INK, fontWeight: 600 }}>{inquiry.inquiry_no}</div>
      </div>
      <Badge tone="neutral">{inquiry.status}</Badge>
    </div>
  );
}

/* =========================================================================
   RELATED DOCUMENTS -- DI LUAR Notebook, SATU panel dirender untuk keenam
   tab (dipanggil sekali di body FormSheet, bukan di dalam tiap tab).
   ========================================================================= */
function RelatedDocuments({ account, statusMeta, inquiry, quotation, onOpenInquiry, onOpenQuotation }) {
  return (
    <div style={{ marginTop: SP.s5, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, background: CARD }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: INK, marginBottom: SP.s3 }}>Related Documents</div>
      <div style={grid2}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: SP.s2, fontFamily: FONT_BODY }}>Upstream</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <div>
              <span style={{ fontSize: 12, color: INK_SOFT, fontFamily: FONT_BODY, marginRight: 8 }}>Lead Source</span>
              <span style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY, fontWeight: 600 }}>{SOURCE_LABELS[account.source] || account.source || '—'}</span>
            </div>
            {statusMeta && <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: SP.s2, fontFamily: FONT_BODY }}>Downstream</div>
          {!inquiry && !quotation && <div style={{ fontSize: 13, color: INK_FAINT, fontFamily: FONT_BODY, fontStyle: 'italic' }}>None yet</div>}
          {inquiry && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: onOpenInquiry ? 'pointer' : 'default' }} onClick={() => onOpenInquiry?.(inquiry.id)}>
              <div><span style={{ fontSize: 12, color: INK_SOFT, fontFamily: FONT_BODY, marginRight: 8 }}>Inquiry</span><span style={{ fontSize: 13.5, color: INK, fontFamily: FONT_MONO, fontWeight: 600 }}>{inquiry.inquiry_no}</span></div>
              <Badge tone="neutral">{inquiry.status}</Badge>
            </div>
          )}
          {quotation && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: onOpenQuotation ? 'pointer' : 'default' }} onClick={() => onOpenQuotation?.(quotation.id)}>
              <div><span style={{ fontSize: 12, color: INK_SOFT, fontFamily: FONT_BODY, marginRight: 8 }}>Quotation</span><span style={{ fontSize: 13.5, color: INK, fontFamily: FONT_MONO, fontWeight: 600 }}>{quotation.quotation_no} v{quotation.revision}</span></div>
              <Badge tone="neutral">{quotation.status}</Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

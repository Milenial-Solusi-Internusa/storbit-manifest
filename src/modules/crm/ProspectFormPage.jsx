// src/modules/crm/ProspectFormPage.jsx
// UI follows the Lovable "Tambah Prospect" design system (slate/white, navy/orange,
// Montserrat/Inter/IBM Plex Mono). Logic, fetch, fields, save, and BANT (4 dim 0–3)
// are unchanged — only the visual layer was reworked.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronDown, Save, UserPlus, X, DollarSign, Users, Target, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { useCustomFields, STANDARD_COLUMNS } from '../../hooks/useCustomFields';
import CustomFieldsSection from '../../components/CustomFieldsSection';
import ConfirmModal from '../../components/ConfirmModal';
import WinLossModal from './WinLossModal';
import { BANT_DIMENSIONS, calcBantScore } from './bant';
import BantScoreBar from './BantScoreBar';

/* ---------- design tokens (Lovable) ---------- */
const C = {
  navy: '#144682', navyDark: '#0F3768', navySoft: '#EEF3FB',
  orange: '#E85A1E', orangeDark: '#C94D18', orangeSoft: '#FDF0E9',
  pageBg: '#F8FAFC', card: '#FFFFFF',
  border: '#E2E8F0', borderStrong: '#CBD5E1',
  text: '#0F172A', sub: '#475569', muted: '#94A3B8',
  success: '#16A34A', warning: '#F59E0B', error: '#DC2626',
};

const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'NURTURE'];
const STAGE_DOT = { NEW: '#94A3B8', CONTACTED: '#3B82F6', QUALIFIED: '#0D9488', PROPOSAL: '#F59E0B', NEGOTIATION: '#E85A1E', WON: '#16A34A', LOST: '#DC2626', NURTURE: '#94A3B8' };
const CUSTOMER_TYPES = ['freight', 'customs', 'trading', 'mixed'];
const SOURCES = ['sales_visit', 'cold_call', 'referral', 'existing_network', 'exhibition', 'instagram', 'linkedin', 'tiktok', 'website', 'walk_in', 'other'];
const SOURCE_LABELS = {
  sales_visit: 'Sales Visit', cold_call: 'Cold Call', referral: 'Referral',
  existing_network: 'Existing Network', exhibition: 'Exhibition / Pameran', instagram: 'Instagram',
  linkedin: 'LinkedIn', tiktok: 'TikTok', website: 'Website', walk_in: 'Walk-in', other: 'Lainnya',
};
const BANT_ICON = { bant_budget: DollarSign, bant_authority: Users, bant_need: Target, bant_timeline: Clock };

const S = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '4px 0 8px', fontFamily: "'Inter',system-ui,sans-serif", color: C.text },
  headerCard: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', padding: '22px 26px', marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' },
  hTitle: { fontFamily: "'Montserrat',sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: -0.6, color: C.text, margin: 0, lineHeight: 1.1 },
  hSub: { fontSize: 14, color: C.sub, marginTop: 7 },
  card: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 22, overflow: 'hidden' },
  secBar: { display: 'flex', alignItems: 'center', gap: 12, background: '#F1F5F9', borderBottom: '1px solid ' + C.border, padding: '14px 24px', flexWrap: 'wrap' },
  secNum: { width: 26, height: 26, borderRadius: 999, background: C.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, flex: '0 0 26px' },
  secTitle: { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, color: C.text, letterSpacing: -0.1, lineHeight: 1.2 },
  secSub: { fontSize: 12.5, color: '#64748B' },
  secBody: { padding: 28 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.35 },
  req: { color: C.orange, fontWeight: 800 },
  input: { height: 44, borderRadius: 10, border: '1px solid ' + C.border, background: '#fff', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box' },
  textarea: { borderRadius: 10, border: '1px solid ' + C.border, background: '#fff', padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.55 },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 26px', borderRadius: 10, border: '1px solid ' + C.orange, background: C.orange, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(232,90,30,.35)' },
  btnGhost: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 20px', borderRadius: 10, border: '1px solid ' + C.navy, background: '#fff', color: C.navy, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer' },
};
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '18px 20px' };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 };

function Field({ label, required, span, children }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? '1 / -1' : 'auto' }}>
      <div style={S.label}>{label}{required && <span style={S.req}>*</span>}</div>
      {children}
    </div>
  );
}
function SelectChevron() {
  return <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><ChevronDown size={16} color={C.muted} /></span>;
}

export default function ProspectFormPage({ prospect, onBack, showToast }) {
  const { profile, erpRole, user } = useAuth();
  const isEdit = !!prospect?.id;
  const canDelete = ['super_admin', 'admin', 'ceo', 'gm', 'manager'].includes(erpRole);
  const isSalesCreator = ['sales', 'operations'].includes(erpRole);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setConfirmState({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false, onConfirm: null }));

  const [form, setForm] = useState({
    company_prefix: '', name: '', legal_name: '', customer_type: 'freight', source: 'sales_visit',
    pic_name: '', pic_phone: '', pic_email: '', phone: '', email: '', address: '', city: '',
    notes: '', assigned_to: '', pipeline_stage: 'NEW', payment_terms_id: '', won_reason: '', lost_reason: '',
    // BANT qualification — 4 dimensi 0–3 (model baru)
    bant_budget: 0, bant_authority: 0, bant_need: 0, bant_timeline: 0,
    // BANT scorecard lama — dipertahankan di DB (tech debt), tak dirender lagi
    bant_commodity: '', bant_origin: '', bant_destination: '', bant_frequency: '',
    bant_current_vendor: '', bant_payment: '', bant_decision_maker: '', bant_score: 0,
  });

  const [winLoss, setWinLoss] = useState({ open: false, mode: 'won' });
  const [nameWarning, setNameWarning] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [fetchedAssignee, setFetchedAssignee] = useState(null);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const { customFields } = useCustomFields('accounts');
  const [customValues, setCustomValues] = useState({});

  useEffect(() => {
    if (!isEdit || !prospect) return;
    const standard = new Set(STANDARD_COLUMNS.accounts);
    const custom = Object.fromEntries(Object.entries(prospect).filter(([k]) => !standard.has(k)));
    setCustomValues(custom);
  }, [isEdit, prospect]);

  useEffect(() => {
    if (isEdit && prospect) {
      const bantVals = {
        bant_commodity: prospect.bant_commodity || '', bant_origin: prospect.bant_origin || '',
        bant_destination: prospect.bant_destination || '', bant_frequency: prospect.bant_frequency || '',
        bant_current_vendor: prospect.bant_current_vendor || '', bant_payment: prospect.bant_payment || '',
        bant_decision_maker: prospect.bant_decision_maker || '',
      };
      const dimVals = {
        bant_budget: Number(prospect.bant_budget) || 0, bant_authority: Number(prospect.bant_authority) || 0,
        bant_need: Number(prospect.bant_need) || 0, bant_timeline: Number(prospect.bant_timeline) || 0,
      };
      setForm({
        company_prefix: prospect.company_prefix || '', name: prospect.name || '', legal_name: prospect.legal_name || '',
        customer_type: prospect.customer_type || 'freight', source: prospect.source || 'sales_visit',
        pic_name: prospect.pic_name || '', pic_phone: prospect.pic_phone || '', pic_email: prospect.pic_email || '',
        phone: prospect.phone || '', email: prospect.email || '', address: prospect.address || '', city: prospect.city || '',
        notes: prospect.notes || '', assigned_to: prospect.assigned_to || '', pipeline_stage: prospect.pipeline_stage || 'NEW',
        payment_terms_id: prospect.payment_terms_id || '', won_reason: prospect.won_reason || '', lost_reason: prospect.lost_reason || '',
        ...bantVals, ...dimVals, bant_score: calcBantScore(dimVals),
      });
    }
  }, [isEdit, prospect]);

  useEffect(() => {
    if (isEdit || !prospect) return;
    setForm(f => ({ ...f, name: prospect.name || f.name, pic_name: prospect.pic_name || f.pic_name, pic_phone: prospect.pic_phone || f.pic_phone }));
  }, [isEdit, prospect]);

  useEffect(() => {
    if (!isEdit || !prospect?.id || prospect.assigned_to) return;
    let cancelled = false;
    supabase.from('accounts')
      .select('assigned_to, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)')
      .eq('id', prospect.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.assigned_to) return;
        setForm(f => f.assigned_to ? f : { ...f, assigned_to: data.assigned_to });
        setFetchedAssignee({ id: data.assigned_to, full_name: data.assigned_profile?.full_name || prospect.assigned_profile?.full_name || 'Sales ter-assign' });
      });
    return () => { cancelled = true; };
  }, [isEdit, prospect]);

  const assigneeOptions = useMemo(() => {
    const selId = form.assigned_to;
    if (!selId || profiles.some(p => p.id === selId)) return profiles;
    const name = (isEdit && prospect?.assigned_to === selId && prospect?.assigned_profile?.full_name) ||
      (fetchedAssignee?.id === selId && fetchedAssignee?.full_name) || 'Sales ter-assign';
    return [...profiles, { id: selId, full_name: name }];
  }, [profiles, form.assigned_to, isEdit, prospect, fetchedAssignee]);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('active', true).limit(1000)
      .then(({ data }) => setProfiles(data || []));
    supabase.from('payment_terms').select('id, name').eq('company_id', profile.company_id).is('deleted_at', null)
      .then(({ data }) => setPaymentTerms(data || []));
  }, [profile?.company_id]);

  const handleDelete = useCallback(() => {
    if (!prospect?.id) return;
    showConfirm('Hapus Prospect', `Hapus prospect "${prospect.name}"? Tindakan ini tidak dapat dibatalkan.`, async () => {
      closeConfirm();
      try {
        const { error } = await supabase.from('accounts').update({ deleted_at: new Date().toISOString() }).eq('id', prospect.id);
        if (error) throw error;
        showToast?.('Prospect berhasil dihapus.', 'success');
        onBack?.();
      } catch (err) {
        showToast?.('Gagal hapus prospect: ' + err.message, 'error');
      }
    });
  }, [prospect?.id, prospect?.name, showToast, onBack]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const setBantDim = (k) => (e) => setForm(f => {
    const next = { ...f, [k]: Number(e.target.value) };
    next.bant_score = calcBantScore(next);
    return next;
  });

  const checkDuplicateName = async (val) => {
    if (!val.trim() || isEdit) { setNameWarning(''); return; }
    const { data } = await supabase.from('accounts').select('id, name').ilike('name', val.trim())
      .is('deleted_at', null).eq('company_id', profile.company_id).eq('account_status', 'prospect').limit(1);
    setNameWarning(data && data.length > 0 ? 'Prospect dengan nama ini sudah terdaftar. Pastikan tidak duplikat.' : '');
  };

  const handleStageChange = (e) => {
    const v = e.target.value;
    if (v === 'WON' || v === 'LOST') setWinLoss({ open: true, mode: v.toLowerCase() });
    else setForm(f => ({ ...f, pipeline_stage: v }));
  };

  const handleWinLossSave = (values) => {
    setForm(f => ({ ...f, pipeline_stage: winLoss.mode.toUpperCase(), ...values }));
    setWinLoss(wl => ({ ...wl, open: false }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const effectiveAssignedTo = (!isEdit && isSalesCreator) ? profile.id : (form.assigned_to || null);
      const payload = {
        ...form, ...customValues, company_id: profile.company_id,
        assigned_to: effectiveAssignedTo, payment_terms_id: form.payment_terms_id || null, updated_by: profile.id,
      };
      if (form.pipeline_stage === 'WON') payload.converted_at = prospect?.converted_at || new Date().toISOString();
      let error;
      if (isEdit) {
        ({ error } = await supabase.from('accounts').update(payload).eq('id', prospect.id));
      } else {
        payload.created_by = profile.id; payload.account_status = 'prospect';
        payload.owner_company_id = profile.company_id; payload.last_activity_at = new Date().toISOString();
        ({ error } = await supabase.from('accounts').insert(payload));
      }
      if (error) throw error;
      logAudit(supabase, {
        action: isEdit ? ACTION_TYPES.UPDATE_PROSPECT : ACTION_TYPES.CREATE_PROSPECT,
        entityType: ENTITY_TYPES.PROSPECT, entityId: isEdit ? prospect.id : null, entityLabel: form.name,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      showToast?.(isEdit ? 'Prospect berhasil diupdate ✨' : 'Prospect berhasil ditambahkan ✨');
      onBack();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputFocusable = (extra = {}) => ({ ...S.input, ...extra });
  const selWrap = { position: 'relative' };
  const selInput = { ...S.input, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 38, cursor: 'pointer' };
  const assignInitials = (() => {
    const opt = assigneeOptions.find(p => p.id === form.assigned_to);
    const nm = opt?.full_name || '';
    return nm ? nm.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '';
  })();

  return (
    <div style={{ background: C.pageBg, padding: '8px 8px 40px', borderRadius: 16 }}>
      <div style={S.page}>
        {/* header card */}
        <div style={S.headerCard}>
          <div style={{ minWidth: 0 }}>
            <h1 style={S.hTitle}>{isEdit ? 'Edit Prospect' : 'Tambah Prospect'}</h1>
            <div style={S.hSub}>{isEdit ? prospect.name : 'Lengkapi data prospect baru untuk masuk ke pipeline CRM.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
            <button type="button" style={S.btnGhost} onClick={onBack}><X size={16} />Batal</button>
            <button type="button" style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={handleSave} disabled={saving}>
              <UserPlus size={17} />{saving ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Tambah Prospect')}
            </button>
          </div>
        </div>

        {/* SECTION 01 — Informasi Perusahaan */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>01</div>
            <div><div style={S.secTitle}>Informasi Perusahaan</div></div>
            <div style={S.secSub}>Identitas legal &amp; kontak calon customer</div>
          </div>
          <div style={S.secBody}>
            <div style={{ display: 'grid', gap: 18 }}>
              {/* Row 1 — prefix + name combined */}
              <Field label="Nama Perusahaan" required>
                <PrefixNameField
                  prefix={form.company_prefix} onPrefix={set('company_prefix')}
                  name={form.name} onName={set('name')} onNameBlur={checkDuplicateName}
                  error={!!errors.name}
                />
                {errors.name && <span style={{ fontSize: 12, color: C.error, marginTop: 5, display: 'block' }}>{errors.name}</span>}
                {nameWarning && <span style={{ fontSize: 12, color: C.orange, marginTop: 5, display: 'block' }}>{nameWarning}</span>}
              </Field>

              {/* Row 2 */}
              <div style={grid3}>
                <Field label="Legal Name"><input value={form.legal_name} onChange={set('legal_name')} style={S.input} placeholder="Nama badan hukum…" /></Field>
                <Field label="Customer Type">
                  <div style={selWrap}>
                    <select value={form.customer_type} onChange={set('customer_type')} style={selInput}>
                      {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select><SelectChevron />
                  </div>
                </Field>
                <Field label="Source">
                  <div style={selWrap}>
                    <select value={form.source} onChange={set('source')} style={selInput}>
                      {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
                    </select><SelectChevron />
                  </div>
                </Field>
              </div>

              {/* Row 3 — PIC */}
              <div style={grid3}>
                <Field label="PIC Name"><input value={form.pic_name} onChange={set('pic_name')} style={S.input} placeholder="Nama PIC…" /></Field>
                <Field label="PIC Phone"><input value={form.pic_phone} onChange={set('pic_phone')} style={S.input} placeholder="+62…" /></Field>
                <Field label="PIC Email"><input type="email" value={form.pic_email} onChange={set('pic_email')} style={S.input} placeholder="pic@perusahaan.co.id" /></Field>
              </div>

              {/* Row 4 */}
              <div style={grid3}>
                <Field label="Phone"><input value={form.phone} onChange={set('phone')} style={S.input} placeholder="+62…" /></Field>
                <Field label="Email"><input type="email" value={form.email} onChange={set('email')} style={S.input} placeholder="info@perusahaan.co.id" /></Field>
                <Field label="City"><input value={form.city} onChange={set('city')} style={S.input} placeholder="Kota…" /></Field>
              </div>

              {/* Row 5 — address */}
              <Field label="Address" span><textarea value={form.address} onChange={set('address')} rows={2} style={S.textarea} placeholder="Alamat lengkap…" /></Field>
            </div>
          </div>
        </section>

        {/* SECTION 02 — Pipeline & Penugasan */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>02</div>
            <div><div style={S.secTitle}>Pipeline &amp; Penugasan</div></div>
            <div style={S.secSub}>Tahap pipeline, owner &amp; komersial</div>
          </div>
          <div style={S.secBody}>
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={grid3}>
                <Field label="Pipeline Stage">
                  <div style={selWrap}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, borderRadius: 999, background: STAGE_DOT[form.pipeline_stage] || '#94A3B8', pointerEvents: 'none' }} />
                    <select value={form.pipeline_stage} onChange={handleStageChange} style={{ ...selInput, paddingLeft: 30 }}>
                      {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                    </select><SelectChevron />
                  </div>
                </Field>
                <Field label="Assigned To">
                  {!isEdit && isSalesCreator ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', borderRadius: 10, background: C.orangeSoft, color: C.orangeDark, fontSize: 13, fontWeight: 600 }}>
                      Otomatis di-assign ke Anda{profile?.full_name ? ` — ${profile.full_name}` : ''}
                    </div>
                  ) : (
                    <>
                      <div style={selWrap}>
                        {assignInitials && <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 999, background: C.navy, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontFamily: "'Montserrat',sans-serif", zIndex: 1 }}>{assignInitials}</span>}
                        <select value={form.assigned_to} onChange={set('assigned_to')} style={{ ...selInput, paddingLeft: assignInitials ? 44 : 14 }}>
                          <option value="">— Pilih sales —</option>
                          {assigneeOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                        </select><SelectChevron />
                      </div>
                      {!isEdit && !isSalesCreator && !form.assigned_to && (
                        <div style={{ marginTop: 6, fontSize: 12, color: C.orange, fontWeight: 500 }}>Prospect belum di-assign ke sales.</div>
                      )}
                    </>
                  )}
                </Field>
                <Field label="Payment Terms">
                  <div style={selWrap}>
                    <select value={form.payment_terms_id} onChange={set('payment_terms_id')} style={selInput}>
                      <option value="">— Pilih payment terms —</option>
                      {paymentTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select><SelectChevron />
                  </div>
                </Field>
              </div>
              <Field label="Notes" span><textarea value={form.notes} onChange={set('notes')} rows={3} style={S.textarea} placeholder="Catatan tambahan…" /></Field>
            </div>
          </div>
        </section>

        {/* SECTION 03 — BANT */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>03</div>
            <div><div style={S.secTitle}>BANT Qualification</div></div>
            <div style={S.secSub}>Skor ≥ 8/12 untuk lanjut ke tahap Qualified</div>
          </div>
          <div style={S.secBody}>
            <div style={{ marginBottom: 22 }}><BantScoreBar score={form.bant_score} /></div>
            <div style={grid2}>
              {BANT_DIMENSIONS.map(dim => (
                <BantCard key={dim.key} dim={dim} value={Number(form[dim.key]) || 0} onChange={setBantDim(dim.key)} />
              ))}
            </div>
          </div>
        </section>

        {/* Custom fields */}
        <section style={S.card}>
          <div style={S.secBody}>
            <CustomFieldsSection
              customFields={customFields}
              values={customValues}
              onChange={(key, val) => setCustomValues(prev => ({ ...prev, [key]: val }))}
            />
          </div>
        </section>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
          {canDelete && isEdit ? (
            <button type="button" onClick={handleDelete} style={{ ...S.btnGhost, borderColor: C.error, color: C.error }}>Hapus Prospect</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={S.btnGhost} onClick={onBack}><ChevronLeft size={16} />Batal</button>
            <button type="button" style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={handleSave} disabled={saving}>
              <Save size={16} />{saving ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Tambah Prospect')}
            </button>
          </div>
        </div>
      </div>

      <WinLossModal
        key={`${winLoss.mode}-${winLoss.open}`}
        open={winLoss.open} mode={winLoss.mode} prospectName={form.name}
        onSave={handleWinLossSave} onCancel={() => setWinLoss(wl => ({ ...wl, open: false }))}
      />
      <ConfirmModal
        open={confirmState.open} title={confirmState.title} message={confirmState.message}
        confirmLabel="Ya, Hapus" cancelLabel="Batal" variant="danger"
        onConfirm={confirmState.onConfirm} onCancel={closeConfirm}
      />
    </div>
  );
}

/* ---------- prefix + name combined field ---------- */
function PrefixNameField({ prefix, onPrefix, name, onName, onNameBlur, error }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ display: 'flex', border: '1px solid ' + (error ? C.error : (f ? C.navy : C.border)), borderRadius: 10, background: '#fff', overflow: 'hidden', boxShadow: f ? '0 0 0 3px rgba(20,70,130,.13)' : 'none' }}>
      <div style={{ position: 'relative', flex: '0 0 96px', borderRight: '1px solid ' + C.border }}>
        <select value={prefix} onChange={onPrefix} onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={{ height: 44, width: '100%', border: 'none', background: C.navySoft, color: C.navy, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', padding: '0 28px 0 14px', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', outline: 'none', cursor: 'pointer' }}>
          {['', 'PT', 'CV', 'Mr.', 'Mrs.', 'Ms.'].map(p => <option key={p} value={p}>{p || '—'}</option>)}
        </select>
        <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><ChevronDown size={15} color={C.navy} /></span>
      </div>
      <input value={name} placeholder="Nama perusahaan…" onChange={onName} onBlur={onNameBlur ? (e) => onNameBlur(e.target.value) : undefined} onFocus={() => setF(true)}
        style={{ flex: 1, height: 44, border: 'none', outline: 'none', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, minWidth: 0 }} />
    </div>
  );
}

/* ---------- BANT card ---------- */
function BantCard({ dim, value, onChange }) {
  const [h, setH] = useState(false);
  const DimIcon = BANT_ICON[dim.key] || Target;
  const selected = dim.options.find(o => o.value === value);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ border: '1px solid ' + (h ? C.borderStrong : C.border), borderRadius: 14, padding: 18, background: h ? '#FCFDFE' : '#fff', transition: 'border-color .16s ease, background .16s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: C.navySoft, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 32px' }}><DimIcon size={17} /></div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14.5, color: C.text }}>{dim.label}</div>
        <div style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 13, color: value > 0 ? C.navy : C.muted }}>{value}<span style={{ color: C.muted, fontWeight: 500 }}>/3</span></div>
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 13, minHeight: 34 }}>{dim.description}</div>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={onChange} style={{ ...S.input, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 38, cursor: 'pointer' }}>
          {dim.options.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
        </select>
        <SelectChevron />
      </div>
      {selected && (
        <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.orange, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: C.orange, flex: '0 0 6px' }} />{selected.label}
        </div>
      )}
    </div>
  );
}

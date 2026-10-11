// src/modules/crm/lead/components/CaptureLeadModal.jsx
// "Capture Lead" -- design-handoff/crm-2026-10-11/shots/lead/05-modal-capture-lead.png.
// Pengganti ProspectFormPage.jsx SEBAGAI JALUR BUAT BARU (halaman penuh ->
// modal, keputusan Den atas Perbedaan Visual #1 plan Lead Management). Field
// JAUH lebih sedikit dari ProspectFormPage: field lain (Legal Name/Website/
// Address/BANT/dst.) diedit di LeadDetailPage sesudah lead tersimpan --
// irisan 5, belum ada di sini. Kolom yang dikirim beririsan dengan
// ProspectFormPage.handleSave (accounts.lifecycle_stage='lead' untuk baru),
// supaya baris yang dibuat dari sini bisa dibuka ProspectFormPage/
// CustomerDetailPage apa adanya.
import { useEffect, useState } from 'react';
import { Modal, FloatingInput, FloatingSelect, SaveButton, OutlineBtn, MasterSelect } from '../../../../kit';
import { SEMANTIC, FONT_BODY, RADIUS, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isSalesOnly as isSalesOnlyRole, isAllEntities as isAllEntitiesRole } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { SOURCES, SOURCE_LABELS, PRIORITIES } from '../lib/leadOptions';
import RequestNewOptionModal from '../../components/RequestNewOptionModal';

const emptyForm = (entityId) => ({
  name: '', company_id: entityId || '', source: '', industry: '', lead_category: '', priority: 'Medium',
  contact_name: '', contact_position: '', contact_phone: '', contact_whatsapp: '', contact_email: '',
});

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} [initialName] - prefill Company Name (handoff dari Activities)
 * @param {(account: {id:string, name:string}) => void} onSaved
 * @param {(msg: string, type?: string) => void} [showToast]
 */
export default function CaptureLeadModal({ open, onClose, initialName = '', onSaved, showToast }) {
  const { profile, erpRole, erpRoles } = useAuth();
  const isSalesOnly = isSalesOnlyRole(erpRole);
  const isAllEntities = isAllEntitiesRole(erpRoles);

  const [form, setForm] = useState(() => emptyForm(profile?.company_id));
  // WhatsApp mengikuti Phone SAMPAI user mengetik langsung di WhatsApp --
  // begitu disentuh, berhenti mengikuti (pola "alamat penagihan = alamat
  // kirim" standar: auto-isi default, bukan kunci permanen). Direset
  // bersama form saat modal dibuka ulang.
  const [whatsappTouched, setWhatsappTouched] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [requestOptionFor, setRequestOptionFor] = useState(null); // 'industry' | 'lead_category' | null
  const [industryOptions, setIndustryOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);

  // Reset form SAAT `open` berubah false->true -- pola "adjust state during
  // render" (react.dev/learn/you-might-not-need-an-effect), BUKAN effect,
  // supaya react-hooks/set-state-in-effect tidak menyala (modal tetap
  // mounted terus demi animasi keluar-masuk Modal kit, jadi state-nya memang
  // perlu direset manual, bukan lenyap lewat unmount).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm({ ...emptyForm(profile?.company_id), name: initialName || '' });
      setSimilar([]);
      setWhatsappTouched(false);
    }
  }

  const setPhone = (v) => setForm((f) => ({ ...f, contact_phone: v, contact_whatsapp: whatsappTouched ? f.contact_whatsapp : v }));
  const setWhatsapp = (v) => { setWhatsappTouched(true); setForm((f) => ({ ...f, contact_whatsapp: v })); };

  const fetchOptions = (listKey, setter) => {
    supabase.from('dropdown_options').select('id, label, value')
      .eq('list_key', listKey).eq('is_active', true).is('deleted_at', null)
      .or(`company_id.is.null,company_id.eq.${form.company_id || '00000000-0000-0000-0000-000000000000'}`)
      .order('sort_order', { ascending: true }).limit(1000)
      .then(({ data }) => setter(data || []));
  };
  useEffect(() => { if (open) fetchOptions('lead_industry', setIndustryOptions); }, [open, form.company_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) fetchOptions('lead_category', setCategoryOptions); }, [open, form.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Cek mirip -- RPC check_similar_accounts, sama seperti ProspectFormPage.
  // Debounce sederhana lewat onBlur (bukan live), pola yang sama dgn form lama.
  const checkDuplicate = async () => {
    if (!form.name.trim() || !form.company_id) { setSimilar([]); return; }
    const { data, error } = await supabase.rpc('check_similar_accounts', {
      p_name: form.name.trim(), p_company_id: form.company_id,
    });
    if (error || !data?.length) { setSimilar([]); return; }
    setSimilar(data);
  };

  const entityOf = (id) => ENTITIES.find((e) => e.id === id);
  const canSave = form.name.trim() && form.company_id && form.source && form.contact_name.trim();

  async function handleSave() {
    if (!canSave) return { error: new Error('Lengkapi Company Name, Entity, Source, dan Contact Name') };
    const effectiveAssignedTo = isSalesOnly ? profile.id : null;
    const payload = {
      name: form.name.trim(), company_id: form.company_id, source: form.source,
      industry: form.industry || null, lead_category: form.lead_category || null,
      priority: form.priority || null, customer_type: 'freight',
      assigned_to: effectiveAssignedTo, lifecycle_stage: 'lead',
      created_by: profile.id, owner_company_id: form.company_id,
      last_activity_at: new Date().toISOString(),
    };
    const { data: account, error } = await supabase.from('accounts').insert(payload).select('id, name').single();
    if (error) {
      const isDupName = error?.code === '23505' && /uq_accounts_norm_name_per_entitas/i.test(`${error?.message ?? ''} ${error?.details ?? ''}`);
      return { error: isDupName ? new Error(`Sudah ada akun dengan nama ini di ${entityOf(form.company_id)?.code || 'entitas ini'}.`) : error };
    }
    if (form.contact_name.trim()) {
      const { error: contactErr } = await supabase.from('contacts').insert({
        account_id: account.id, company_id: form.company_id, name: form.contact_name.trim(),
        position: form.contact_position.trim() || null, phone: form.contact_phone.trim() || null,
        whatsapp: form.contact_whatsapp.trim() || null, email: form.contact_email.trim() || null,
        is_primary: true,
      });
      if (contactErr) showToast?.('Lead tersimpan, tapi kontak gagal disimpan: ' + contactErr.message, 'error');
    }
    onSaved?.(account);
    return undefined;
  }

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Capture Lead" width={600} footer={(
        <>
          <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
          {!canSave && (
            <span style={{ fontSize: 12.5, color: SEMANTIC.neutral.fg, fontFamily: FONT_BODY, alignSelf: 'center', marginRight: 'auto' }}>
              {!form.source ? 'Select a source to save' : !form.name.trim() ? 'Enter a company name' : 'Enter a contact name'}
            </span>
          )}
          <SaveButton onSave={handleSave} label="Save Lead" savedLabel="Lead tersimpan!" disabled={!canSave} />
        </>
      )}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
          <FloatingInput label="Company Name" full value={form.name} onChange={set('name')} onBlur={checkDuplicate} placeholder="Registered company name" />

          {similar.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.s2,
              background: SEMANTIC.warn.bg, border: `1px solid ${SEMANTIC.warn.bd}`, borderRadius: RADIUS.md,
              padding: '10px 14px', fontSize: 12.5, color: SEMANTIC.warn.fg, fontFamily: FONT_BODY,
            }}>
              <span>{similar.length === 1 ? '1 similar account found: ' : `${similar.length} similar accounts found: `}{similar.map((s) => s.name).join(', ')}</span>
              <a href={`/crm/customer/${similar[0].id}`} target="_blank" rel="noreferrer" style={{ color: SEMANTIC.warn.fg, fontWeight: 700, whiteSpace: 'nowrap' }}>View</a>
            </div>
          )}

          <div style={grid2}>
            <FloatingSelect label="Entity" value={form.company_id} onChange={set('company_id')}
              options={isAllEntities ? ENTITIES.map((e) => ({ value: e.id, label: e.code })) : ENTITIES.filter((e) => e.id === profile?.company_id).map((e) => ({ value: e.id, label: e.code }))} />
            <FloatingSelect label="Source" value={form.source} onChange={set('source')}
              options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))} />
          </div>

          <div style={grid2}>
            <MasterSelect label="Industry" value={form.industry} onChange={set('industry')}
              options={industryOptions.map((o) => ({ value: o.value, label: o.label }))}
              onRequestNew={() => setRequestOptionFor('industry')} />
            <MasterSelect label="Lead Category" value={form.lead_category} onChange={set('lead_category')}
              options={categoryOptions.map((o) => ({ value: o.value, label: o.label }))}
              onRequestNew={() => setRequestOptionFor('lead_category')} />
          </div>

          <div style={grid2}>
            <FloatingSelect label="Priority" value={form.priority} onChange={set('priority')}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
            <div />
          </div>

          <div style={{ borderTop: `1px solid ${SEMANTIC.neutral.bd}`, paddingTop: SP.s3, marginTop: SP.s1 }}>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 700, marginBottom: SP.s3 }}>Primary Contact</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
              <div style={grid2}>
                <FloatingInput label="Contact Name" value={form.contact_name} onChange={set('contact_name')} />
                <FloatingInput label="Position" value={form.contact_position} onChange={set('contact_position')} />
              </div>
              <div style={grid2}>
                <FloatingInput label="Phone" value={form.contact_phone} onChange={setPhone} />
                <FloatingInput label="WhatsApp" value={form.contact_whatsapp} onChange={setWhatsapp} />
              </div>
              <FloatingInput label="Email" full type="email" value={form.contact_email} onChange={set('contact_email')} />
            </div>
          </div>
        </div>
      </Modal>

      <RequestNewOptionModal
        open={!!requestOptionFor} onClose={() => setRequestOptionFor(null)}
        listKey={requestOptionFor === 'industry' ? 'lead_industry' : 'lead_category'}
        listLabel={requestOptionFor === 'industry' ? 'Industry' : 'Lead Category'}
        companyId={null}
        onSubmitted={(result) => {
          if (result.mode === 'direct') {
            // add_dropdown_option_direct mengembalikan id SAJA (RETURNS uuid) --
            // `value` (slug) dihitung server-side dan tidak dikirim balik, jadi
            // direplikasi di sini persis rumus SQL-nya:
            // lower(regexp_replace(trim(label), '\s+', '_', 'g')).
            const slug = result.option.label.trim().toLowerCase().replace(/\s+/g, '_');
            const opt = { id: result.option.id, value: slug, label: result.option.label };
            if (requestOptionFor === 'industry') { setIndustryOptions((o) => [...o, opt]); set('industry')(opt.value); }
            else { setCategoryOptions((o) => [...o, opt]); set('lead_category')(opt.value); }
          }
        }}
      />
    </>
  );
}

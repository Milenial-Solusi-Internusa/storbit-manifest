// src/modules/crm/InquiryFormPage.jsx
import { useState, useEffect } from 'react';
import { ChevronLeft, Save, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';

const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  danger:    '#B23227',
};

// Fallback — used only if the DB fetch (dropdown_options) fails or is empty.
const SERVICE_TYPES_FALLBACK = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'customs',            label: 'Customs Clearance'  },
  { value: 'trading',            label: 'General Trading'    },
];

const inpStyle = (extra = {}) => ({
  width: '100%', height: 40, borderRadius: 9,
  border: `1px solid ${C.line}`, background: C.surface,
  padding: '0 12px', fontSize: 13.5, color: C.ink,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  ...extra,
});

function Field({ label, req, children, full }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkSoft }}>
        {label}{req && <span style={{ color: C.danger }}> *</span>}
      </label>
      {children}
    </div>
  );
}

async function generateInquiryNo(companyId, companyCode) {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('increment_document_sequence', {
    p_company_id:     companyId,
    p_document_type:  'INQ',
    p_department_code:'CRM',
    p_year:           year,
    p_month:          0,
  });
  // No silent fallback: a non-sequential number (e.g. timestamp) risks duplicate /
  // garbage document numbers. Surface the failure so the caller's try/catch aborts
  // the save and shows an error instead of generating a bad number.
  if (error) throw new Error('Gagal generate nomor dokumen, coba lagi.');
  const seq = String(data).padStart(3, '0');
  return `INQ/${companyCode || 'MSI'}/${year}/${seq}`;
}

export default function InquiryFormPage({ onBack, showToast }) {
  const { profile, erpRole, user } = useAuth();
  const { options: serviceTypeOpts } = useDropdownOptions('service_type', SERVICE_TYPES_FALLBACK);

  const [form, setForm] = useState({
    prospect_id:      '',
    customer_id:      '',
    service_type:     'freight_forwarding',
    route:            '',
    commodity:        '',
    estimated_volume: '',
    notes:            '',
  });

  const [prospects, setProspects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [sourceType, setSourceType] = useState('prospect'); // 'prospect' | 'customer'

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).eq('account_status', 'prospect').is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setProspects(data || []));
    supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).eq('account_status', 'customer').is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setCustomers(data || []));
  }, [profile?.company_id]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (sourceType === 'prospect' && !form.prospect_id) e.source = 'Pilih prospect';
    if (sourceType === 'customer' && !form.customer_id) e.source = 'Pilih customer';
    if (!form.service_type) e.service_type = 'Wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const companyRow = await supabase.from('companies').select('code').eq('id', profile.company_id).maybeSingle();
      const companyCode = companyRow.data?.code || 'MSI';
      const inquiry_no = await generateInquiryNo(profile.company_id, companyCode);

      const payload = {
        inquiry_no,
        company_id:       profile.company_id,
        // Both prospect & customer are `accounts` rows now — link via prospect_id
        // consistently for all CRM records; customer_id is left NULL.
        prospect_id:      sourceType === 'prospect' ? (form.prospect_id || null) : (form.customer_id || null),
        customer_id:      null,
        service_type:     form.service_type,
        route:            form.route || null,
        commodity:        form.commodity || null,
        estimated_volume: form.estimated_volume || null,
        notes:            form.notes || null,
        status:           'OPEN',
        created_by:       profile.id,
      };

      const { error } = await supabase.from('inquiries').insert(payload);
      if (error) throw error;
      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_INQUIRY,
        entityType: ENTITY_TYPES.INQUIRY,
        entityId: null,
        entityLabel: inquiry_no,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      showToast?.('Inquiry berhasil dibuat ✨');
      onBack();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const selStyle = inpStyle({ padding: '0 10px', cursor: 'pointer' });

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink, maxWidth: 780, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, color: C.inkSoft, cursor: 'pointer' }}
        >
          <ChevronLeft size={15} /> Kembali
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={17} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Tambah Inquiry</h1>
            <p style={{ margin: 0, fontSize: 12.5, color: C.inkSoft }}>Nomor akan di-generate otomatis</p>
          </div>
        </div>
      </div>

      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: 28, boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>

          {/* Source type toggle */}
          <Field label="Sumber" full>
            <div style={{ display: 'flex', gap: 10 }}>
              {['prospect', 'customer'].map(t => (
                <button
                  key={t}
                  onClick={() => { setSourceType(t); setForm(f => ({ ...f, prospect_id: '', customer_id: '' })); }}
                  style={{
                    padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${sourceType === t ? C.accent : C.line}`,
                    background: sourceType === t ? C.accentSoft : C.surface2,
                    color: sourceType === t ? C.accent : C.inkSoft,
                  }}
                >
                  {t === 'prospect' ? 'Prospect' : 'Customer (Existing)'}
                </button>
              ))}
            </div>
          </Field>

          {sourceType === 'prospect' ? (
            <Field label="Prospect" req full>
              <select value={form.prospect_id} onChange={set('prospect_id')} style={selStyle}>
                <option value="">— Pilih prospect —</option>
                {prospects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {errors.source && <span style={{ fontSize: 11.5, color: C.danger }}>{errors.source}</span>}
            </Field>
          ) : (
            <Field label="Customer" req full>
              <select value={form.customer_id} onChange={set('customer_id')} style={selStyle}>
                <option value="">— Pilih customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.source && <span style={{ fontSize: 11.5, color: C.danger }}>{errors.source}</span>}
            </Field>
          )}

          <Field label="Service Type" req>
            <select value={form.service_type} onChange={set('service_type')} style={selStyle}>
              {serviceTypeOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {errors.service_type && <span style={{ fontSize: 11.5, color: C.danger }}>{errors.service_type}</span>}
          </Field>

          <Field label="Route">
            <input value={form.route} onChange={set('route')} style={inpStyle()} placeholder="cth: Jakarta – Surabaya" />
          </Field>

          <Field label="Commodity">
            <input value={form.commodity} onChange={set('commodity')} style={inpStyle()} placeholder="Jenis komoditi" />
          </Field>

          <Field label="Estimated Volume">
            <input value={form.estimated_volume} onChange={set('estimated_volume')} style={inpStyle()} placeholder="cth: 10 CBM / 500 KGS" />
          </Field>

          <Field label="Notes" full>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              style={{ ...inpStyle({ height: 'auto', padding: '10px 12px', resize: 'vertical' }) }}
              placeholder="Catatan tambahan…"
            />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
          <button onClick={onBack}
            style={{ padding: '10px 20px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 9, border: 'none', background: C.accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
            <Save size={15} /> {saving ? 'Menyimpan…' : 'Buat Inquiry'}
          </button>
        </div>
      </div>
    </div>
  );
}

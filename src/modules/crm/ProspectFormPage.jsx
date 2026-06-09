// src/modules/crm/ProspectFormPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Save, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { useCustomFields, STANDARD_COLUMNS } from '../../hooks/useCustomFields';
import CustomFieldsSection from '../../components/CustomFieldsSection';

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
  danger:    '#B23227', dangerBg: '#F6E0DB',
};

const PIPELINE_STAGES = ['NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST','NURTURE'];
const CUSTOMER_TYPES  = ['freight','customs','trading','mixed'];
const SOURCES = [
  'digital_marketing',
  'sales_visit',
  'referral',
  'event',
  'cold_call',
  'exhibition',
  'social_media',
  'website',
  'walk_in',
  'other',
];

const SOURCE_LABELS = {
  digital_marketing: 'Digital Marketing',
  sales_visit:       'Sales Visit',
  referral:          'Referral',
  event:             'Event / Pameran',
  cold_call:         'Cold Call',
  exhibition:        'Exhibition',
  social_media:      'Social Media',
  website:           'Website',
  walk_in:           'Walk-in',
  other:             'Lainnya',
};

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

export default function ProspectFormPage({ prospect, onBack, showToast }) {
  const { profile, erpRole } = useAuth();
  const isEdit = !!prospect;
  const canDelete = ['super_admin', 'admin', 'ceo', 'gm', 'manager'].includes(erpRole);

  const [form, setForm] = useState({
    name:             '',
    legal_name:       '',
    customer_type:    'freight',
    source:           'sales_visit',
    pic_name:         '',
    pic_phone:        '',
    pic_email:        '',
    phone:            '',
    email:            '',
    address:          '',
    city:             '',
    notes:            '',
    assigned_to:      '',
    pipeline_stage:   'NEW',
    payment_terms_id: '',
  });

  const [profiles, setProfiles] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // ── Custom fields ────────────────────────────────────────────────────────
  const { customFields } = useCustomFields('prospects');
  const [customValues, setCustomValues] = useState({});

  // Populate custom values from existing prospect data (edit mode)
  useEffect(() => {
    if (!isEdit || !prospect) return;
    const standard = new Set(STANDARD_COLUMNS.prospects);
    const custom = Object.fromEntries(
      Object.entries(prospect).filter(([k]) => !standard.has(k))
    );
    setCustomValues(custom);
  }, [isEdit, prospect]);

  useEffect(() => {
    if (isEdit && prospect) {
      setForm({
        name:             prospect.name             || '',
        legal_name:       prospect.legal_name       || '',
        customer_type:    prospect.customer_type    || 'freight',
        source:           prospect.source            || 'sales_visit',
        pic_name:         prospect.pic_name          || '',
        pic_phone:        prospect.pic_phone         || '',
        pic_email:        prospect.pic_email         || '',
        phone:            prospect.phone             || '',
        email:            prospect.email             || '',
        address:          prospect.address           || '',
        city:             prospect.city              || '',
        notes:            prospect.notes             || '',
        assigned_to:      prospect.assigned_to       || '',
        pipeline_stage:   prospect.pipeline_stage    || 'NEW',
        payment_terms_id: prospect.payment_terms_id  || '',
      });
    }
  }, [isEdit, prospect]);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('active', true).limit(1000)
      .then(({ data }) => setProfiles(data || []));
    supabase.from('payment_terms').select('id, name').eq('company_id', profile.company_id).is('deleted_at', null)
      .then(({ data }) => setPaymentTerms(data || []));
  }, [profile?.company_id]);

  const handleDelete = useCallback(async () => {
    if (!prospect?.id) return;
    if (!window.confirm(`Hapus prospect "${prospect.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const { error } = await supabase
        .from('prospects')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', prospect.id);
      if (error) throw error;
      showToast?.('Prospect berhasil dihapus.', 'success');
      onBack?.();
    } catch (err) {
      showToast?.('Gagal hapus prospect: ' + err.message, 'error');
    }
  }, [prospect?.id, prospect?.name, showToast, onBack]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

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
      const payload = {
        ...form,
        ...customValues,
        company_id:       profile.company_id,
        assigned_to:      form.assigned_to      || null,
        payment_terms_id: form.payment_terms_id || null,
        updated_by:       profile.id,
      };

      let error;
      if (isEdit) {
        ({ error } = await supabase.from('prospects').update(payload).eq('id', prospect.id));
      } else {
        payload.created_by = profile.id;
        ({ error } = await supabase.from('prospects').insert(payload));
      }
      if (error) throw error;
      showToast?.(isEdit ? 'Prospect berhasil diupdate ✨' : 'Prospect berhasil ditambahkan ✨');
      onBack();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const selStyle = inpStyle({ padding: '0 10px', cursor: 'pointer' });

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink, maxWidth: 860, margin: '0 auto' }}>
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
            <User size={17} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{isEdit ? 'Edit Prospect' : 'Tambah Prospect'}</h1>
            <p style={{ margin: 0, fontSize: 12.5, color: C.inkSoft }}>{isEdit ? prospect.name : 'Data prospect baru'}</p>
          </div>
        </div>
      </div>

      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: 28, boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>

          <Field label="Nama Perusahaan" req>
            <input value={form.name} onChange={set('name')} style={inpStyle(errors.name ? { borderColor: C.danger } : {})} placeholder="PT. …" />
            {errors.name && <span style={{ fontSize: 11.5, color: C.danger }}>{errors.name}</span>}
          </Field>

          <Field label="Legal Name">
            <input value={form.legal_name} onChange={set('legal_name')} style={inpStyle()} placeholder="Nama legal sesuai akta" />
          </Field>

          <Field label="Customer Type">
            <select value={form.customer_type} onChange={set('customer_type')} style={selStyle}>
              {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </Field>

          <Field label="Source">
            <select value={form.source} onChange={set('source')} style={selStyle}>
              {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
          </Field>

          <Field label="PIC Name">
            <input value={form.pic_name} onChange={set('pic_name')} style={inpStyle()} placeholder="Nama contact person" />
          </Field>

          <Field label="PIC Phone">
            <input value={form.pic_phone} onChange={set('pic_phone')} style={inpStyle()} placeholder="08xx…" />
          </Field>

          <Field label="PIC Email">
            <input type="email" value={form.pic_email} onChange={set('pic_email')} style={inpStyle()} placeholder="email@perusahaan.com" />
          </Field>

          <Field label="Phone">
            <input value={form.phone} onChange={set('phone')} style={inpStyle()} placeholder="Nomor telepon kantor" />
          </Field>

          <Field label="Email">
            <input type="email" value={form.email} onChange={set('email')} style={inpStyle()} placeholder="info@perusahaan.com" />
          </Field>

          <Field label="City">
            <input value={form.city} onChange={set('city')} style={inpStyle()} placeholder="Jakarta" />
          </Field>

          <Field label="Address" full>
            <input value={form.address} onChange={set('address')} style={inpStyle()} placeholder="Alamat lengkap" />
          </Field>

          <Field label="Pipeline Stage">
            <select value={form.pipeline_stage} onChange={set('pipeline_stage')} style={selStyle}>
              {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Assigned To">
            <select value={form.assigned_to} onChange={set('assigned_to')} style={selStyle}>
              <option value="">— Pilih sales —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </Field>

          <Field label="Payment Terms">
            <select value={form.payment_terms_id} onChange={set('payment_terms_id')} style={selStyle}>
              <option value="">— Pilih payment terms —</option>
              {paymentTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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

        {/* Custom fields — dynamic columns added via Schema Manager */}
        <CustomFieldsSection
          customFields={customFields}
          values={customValues}
          onChange={(key, val) => setCustomValues(prev => ({ ...prev, [key]: val }))}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
          {canDelete && isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 'auto' }}
            >
              Hapus Prospect
            </button>
          )}
          <button
            onClick={onBack}
            style={{ padding: '10px 20px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 9, border: 'none', background: C.accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}
          >
            <Save size={15} /> {saving ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Tambah Prospect')}
          </button>
        </div>
      </div>
    </div>
  );
}

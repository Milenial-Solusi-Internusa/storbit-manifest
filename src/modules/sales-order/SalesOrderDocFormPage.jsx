// src/modules/sales-order/SalesOrderDocFormPage.jsx
// SO create form — sales pilih INQUIRY sumber; account_id diturunkan otomatis dari
// inquiry (customer_id ?? prospect_id). Nomor via increment_document_sequence
// (document_type 'SO', dept 'CRM', month 0) → SO/{code}/{year}/{seq3}.
// Anti-dobel: cek SO live per inquiry sebelum insert + tangkap unique violation DB.
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  bg: '#F6EFE3', surface: '#FFFDF8', surface2: '#FBF6EC',
  ink: '#23291E', inkSoft: '#5E6553', inkFaint: '#8A8E7C',
  line: '#E7DCC8', navy: '#144682', accent: '#E85A1E', accentSoft: '#FEF2EC',
  warnBg: '#FDF4E7', warnInk: '#9A5B12', warnBd: '#E6CE94',
};

async function generateSoNo(companyId, companyCode) {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('increment_document_sequence', {
    p_company_id: companyId, p_document_type: 'SO', p_department_code: 'CRM', p_year: year, p_month: 0,
  });
  if (error) throw new Error('Gagal generate nomor SO, coba lagi.');
  return `SO/${companyCode || 'MSI'}/${year}/${String(data).padStart(3, '0')}`;
}

export default function SalesOrderDocFormPage({ onBack, onCreated, showToast }) {
  const { profile } = useAuth();
  const [inquiries, setInquiries] = useState([]);
  const [companyCode, setCompanyCode] = useState('');
  const [inquiryId, setInquiryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null); // { id, so_no } bila inquiry sudah punya SO live

  useEffect(() => {
    if (!profile?.company_id) return;
    const cid = profile.company_id;
    // Inquiry yang boleh dilihat user (RLS inquiries_read menyaring); embed nama account.
    supabase.from('inquiries')
      .select('id, inquiry_no, customer_id, prospect_id, service_type, route, customer:accounts!inquiries_customer_id_fkey(name), prospect:accounts!inquiries_prospect_id_fkey(name)')
      .eq('company_id', cid).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1000)
      .then(({ data }) => setInquiries(data || []));
    supabase.from('companies').select('code').eq('id', cid).maybeSingle()
      .then(({ data }) => setCompanyCode(data?.code || 'MSI'));
  }, [profile?.company_id]);

  const picked = inquiries.find(i => i.id === inquiryId) || null;
  const derivedAccountId = picked ? (picked.customer_id || picked.prospect_id || null) : null;
  const derivedAccountName = picked ? (picked.customer?.name || picked.prospect?.name || '—') : '—';

  // Ganti inquiry → reset penanda anti-dobel.
  const onPick = (e) => { setInquiryId(e.target.value); setExisting(null); };

  const doCreate = useCallback(async () => {
    if (!picked) { showToast?.('Pilih inquiry sumber dulu', 'error'); return; }
    if (!derivedAccountId) { showToast?.('Inquiry ini belum tertaut ke customer/prospect — tak bisa dibuatkan SO', 'error'); return; }
    setSaving(true);
    setExisting(null);
    try {
      // Benteng 1: cek SO live untuk inquiry ini (anti-dobel yang ramah).
      const { data: dup, error: dupErr } = await supabase
        .from('sales_orders')
        .select('id, so_no')
        .eq('inquiry_id', picked.id).is('deleted_at', null)
        .limit(1).maybeSingle();
      if (dupErr) throw dupErr;
      if (dup) { setExisting(dup); setSaving(false); return; }

      const so_no = await generateSoNo(profile.company_id, companyCode);
      const { data: inserted, error } = await supabase
        .from('sales_orders')
        .insert({
          company_id: profile.company_id,
          so_no,
          status: 'DRAFT',
          signed: false,
          inquiry_id: picked.id,
          account_id: derivedAccountId,
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (error) {
        // Benteng 2: unique violation sales_orders_inquiry_unique_live (race / terlewat benteng 1).
        if (error.code === '23505') {
          const { data: ex } = await supabase.from('sales_orders')
            .select('id, so_no').eq('inquiry_id', picked.id).is('deleted_at', null).limit(1).maybeSingle();
          setExisting(ex || { id: null, so_no: '(SO aktif)' });
          setSaving(false);
          return;
        }
        throw error;
      }
      showToast?.(`SO ${so_no} berhasil dibuat`);
      onCreated?.(inserted.id);
    } catch (err) {
      showToast?.('Gagal membuat SO: ' + err.message, 'error');
      setSaving(false);
    }
  }, [picked, derivedAccountId, profile, companyCode, onCreated, showToast]);

  const label = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.inkSoft, marginBottom: 7, display: 'block' };
  const box = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24, marginBottom: 18 };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', fontFamily: 'Inter, sans-serif', color: C.ink }}>
      <button type="button" onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.navy}`, background: '#fff', color: C.navy, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 18 }}>
        <ChevronLeft size={16} />Kembali
      </button>

      <h1 style={{ margin: '0 0 4px', fontFamily: "'Montserrat',sans-serif", fontSize: 24, fontWeight: 800, color: C.navy }}>Buat Sales Order</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, color: C.inkSoft }}>Pilih inquiry sumber. Customer diturunkan otomatis dari inquiry itu.</p>

      <div style={box}>
        <label style={label}>Inquiry Sumber <span style={{ color: C.accent }}>*</span></label>
        <select value={inquiryId} onChange={onPick}
          style={{ width: '100%', height: 44, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', padding: '0 12px', fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}>
          <option value="">— pilih inquiry —</option>
          {inquiries.map(i => (
            <option key={i.id} value={i.id}>
              {i.inquiry_no} — {i.customer?.name || i.prospect?.name || 'tanpa customer'}
            </option>
          ))}
        </select>

        {picked && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px' }}>
            <div><span style={label}>Customer (otomatis)</span><div style={{ fontSize: 14, fontWeight: 600 }}>{derivedAccountName}</div></div>
            <div><span style={label}>Layanan</span><div style={{ fontSize: 14, color: C.inkSoft }}>{picked.service_type || '—'}</div></div>
            <div style={{ gridColumn: '1 / -1' }}><span style={label}>Rute</span><div style={{ fontSize: 14, color: C.inkSoft }}>{picked.route || '—'}</div></div>
          </div>
        )}
      </div>

      {/* Anti-dobel: inquiry sudah punya SO live */}
      {existing && (
        <div style={{ ...box, background: C.warnBg, border: `1px solid ${C.warnBd}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <AlertTriangle size={20} color={C.warnInk} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, color: C.warnInk, marginBottom: 4 }}>Inquiry ini sudah punya SO aktif</div>
            <div style={{ fontSize: 13.5, color: C.warnInk, marginBottom: 12 }}>Satu inquiry hanya boleh punya satu SO. Buka SO yang sudah ada: <strong>{existing.so_no}</strong>.</div>
            {existing.id && (
              <button type="button" onClick={() => onCreated?.(existing.id)}
                style={{ height: 38, padding: '0 16px', borderRadius: 9, border: 'none', background: C.navy, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Buka SO {existing.so_no}
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={doCreate} disabled={saving || !picked}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 24px', borderRadius: 10, border: 'none', background: C.accent, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, cursor: (saving || !picked) ? 'not-allowed' : 'pointer', opacity: (saving || !picked) ? 0.6 : 1 }}>
          <Save size={16} />{saving ? 'Menyimpan…' : 'Terbitkan SO'}
        </button>
      </div>
    </div>
  );
}

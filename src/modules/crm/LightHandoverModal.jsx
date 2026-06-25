// src/modules/crm/LightHandoverModal.jsx
// Light Handover (Form 10.6a) — muncul setelah WinLossModal (won) untuk deal
// dengan estimated_value ≤ Rp 100jt, SEBELUM stage berubah ke WON.
// Modal mengumpulkan field & memanggil onSubmit(fields) — caller (PipelineKanban)
// yang insert ke deal_handovers + update accounts (pola WinLossModal).
//
// Catatan: "Customer Master Setup" + 5-item Ops Checklist dirender sesuai spec
// tapi TIDAK di-persist (tak ada kolom di deal_handovers) — keputusan user.
import { useState, useEffect } from 'react';
import { X, ClipboardCheck, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  navy: '#144682', accent: '#E85A1E', ink: '#23291E', inkSoft: '#5E6553',
  inkFaint: '#8A8E7C', line: '#E7DCC8', surface: '#FFFDF8', surface2: '#FBF6EC',
};
const TIPE_CUSTOMER = ['Direct Customer', 'Forwarder Channel', 'Hybrid'];
const STREAM_SERVICE = ['Sea FCL', 'Sea LCL', 'Air', 'Customs JCI', 'Trucking', 'WH', 'Project', 'Storbit'];
const SPECIAL_HANDLING = ['DG', 'Oversize', 'Time-critical', 'Customs complexity'];
const OPS_CHECKLIST = [
  'Customer Master di ERP sudah lengkap',
  'Payment terms terdokumentasi dan disetujui Finance',
  'Service type & lane terkonfirmasi feasibility ke OPS',
  'Customer expectation terhadap transit time realistis',
  'Documentation requirement dari customer ter-record',
];

const lblStyle = { fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5, display: 'block' };
const inpStyle = { width: '100%', height: 38, borderRadius: 8, border: `1px solid ${C.line}`, padding: '0 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff', color: C.ink };
const taStyle = { ...inpStyle, height: 'auto', padding: '8px 11px', resize: 'vertical' };
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.navy, textTransform: 'uppercase', letterSpacing: '.4px', margin: '6px 0 12px', fontFamily: "'Montserrat',sans-serif" }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>{children}</div>
    </div>
  );
}
function F({ label, full, children }) {
  return <div style={{ gridColumn: full ? '1 / -1' : undefined }}><span style={lblStyle}>{label}</span>{children}</div>;
}

export default function LightHandoverModal({ account, onCancel, onSubmit }) {
  const { profile } = useAuth();
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    npwp: '', alamat: account?.address || '', pic_operasional: account?.pic_name || '',
    pic_finance: '', tipe_customer: '', stream_service: '', estimasi_volume: '',
    payment_terms: '', credit_limit: '', validity_quote: '',
    customer_master_setup: '', // UI-only
  });
  const [special, setSpecial] = useState([]);
  const [checklist, setChecklist] = useState([]); // UI-only

  useEffect(() => {
    if (!profile?.company_id) return undefined;
    let cancelled = false;
    supabase.from('payment_terms').select('id, name').eq('company_id', profile.company_id).is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => { if (!cancelled) setPaymentTerms(data || []); });
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const submit = async () => {
    setSaving(true);
    const ok = await onSubmit({
      nama_perusahaan: account?.name || null,
      npwp: f.npwp || null,
      alamat: f.alamat || null,
      pic_operasional: f.pic_operasional || null,
      pic_finance: f.pic_finance || null,
      tipe_customer: f.tipe_customer || null,
      stream_service: f.stream_service || null,
      estimasi_volume: f.estimasi_volume || null,
      payment_terms: f.payment_terms || null,
      credit_limit: f.credit_limit !== '' ? Number(f.credit_limit) : null,
      validity_quote: f.validity_quote || null,
      special_handling: special.length ? special.join(', ') : null,
    });
    setSaving(false);
    if (!ok) return; // caller failed → keep modal open
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10003, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 640, width: '100%', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.line}`, background: C.surface2, borderRadius: '16px 16px 0 0' }}>
          <ClipboardCheck size={18} color={C.navy} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.ink, fontFamily: "'Montserrat',sans-serif" }}>Light Handover</h2>
            <div style={{ fontSize: 12, color: C.inkSoft }}>{account?.name}</div>
          </div>
          <button onClick={onCancel} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          <Section title="A — Data Customer">
            <F label="Nama Perusahaan"><input value={account?.name || ''} readOnly style={{ ...inpStyle, background: C.surface2, color: C.inkSoft }} /></F>
            <F label="NPWP"><input value={f.npwp} onChange={set('npwp')} style={inpStyle} /></F>
            <F label="Alamat Lengkap" full><textarea rows={2} value={f.alamat} onChange={set('alamat')} style={taStyle} /></F>
            <F label="PIC Operasional (nama · jabatan · HP · email)" full><input value={f.pic_operasional} onChange={set('pic_operasional')} style={inpStyle} /></F>
            <F label="PIC Finance/Billing (nama · HP · email)" full><input value={f.pic_finance} onChange={set('pic_finance')} style={inpStyle} /></F>
            <F label="Tipe Customer"><select value={f.tipe_customer} onChange={set('tipe_customer')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{TIPE_CUSTOMER.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
          </Section>

          <Section title="B — Deal Summary">
            <F label="Stream Service"><select value={f.stream_service} onChange={set('stream_service')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{STREAM_SERVICE.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Estimasi Volume 12 Bulan"><input value={f.estimasi_volume} onChange={set('estimasi_volume')} style={inpStyle} /></F>
            <F label="Payment Terms"><select value={f.payment_terms} onChange={set('payment_terms')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{paymentTerms.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></F>
            <F label="Credit Limit (Rp, jika TOP)"><input type="number" min="0" value={f.credit_limit} onChange={set('credit_limit')} style={inpStyle} /></F>
            <F label="Validity Quote/Kontrak"><input type="date" value={f.validity_quote} onChange={set('validity_quote')} style={inpStyle} /></F>
            <F label="Customer Master Setup"><select value={f.customer_master_setup} onChange={set('customer_master_setup')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option><option value="SELESAI">SELESAI</option><option value="PENDING">PENDING</option></select></F>
            <F label="Special Handling" full>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {SPECIAL_HANDLING.map(o => (
                  <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
                    <input type="checkbox" checked={special.includes(o)} onChange={() => toggle(special, setSpecial, o)} />{o}
                  </label>
                ))}
              </div>
            </F>
          </Section>

          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.navy, textTransform: 'uppercase', letterSpacing: '.4px', margin: '6px 0 10px', fontFamily: "'Montserrat',sans-serif" }}>C — Checklist Ops</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {OPS_CHECKLIST.map(o => (
                <label key={o} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
                  <input type="checkbox" checked={checklist.includes(o)} onChange={() => toggle(checklist, setChecklist, o)} style={{ marginTop: 2 }} />{o}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: 8, background: '#EAF0F8', border: '1px solid #CFE0F2', fontSize: 12, color: '#1B4E86' }}>
            Form ini memerlukan tanda tangan Sales SPV dan OPS Coordinator (dual sign-off) sebelum komisi dilepas.
          </div>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.line}`, background: C.surface2, borderRadius: '0 0 16px 16px' }}>
          <button onClick={onCancel} disabled={saving} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.inkSoft, fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
          <button onClick={submit} disabled={saving} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: C.accent, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ClipboardCheck size={15} />}Simpan &amp; Lanjutkan
          </button>
        </footer>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

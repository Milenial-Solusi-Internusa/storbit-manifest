// src/modules/crm/StrategicHandoverModal.jsx
// Strategic Handover (Form 10.6b) — muncul setelah WinLossModal (won) untuk deal
// dengan estimated_value > Rp 100jt, SEBELUM stage berubah ke WON.
// Mengumpulkan field & memanggil onSubmit(fields); caller (PipelineKanban) yang
// insert ke deal_handovers (handover_type='strategic') + update accounts.
import { useState, useEffect } from 'react';
import { X, Crown, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  navy: '#1B4D8A', accent: '#E85A1E', ink: '#23291E', inkSoft: '#5E6553',
  inkFaint: '#8A8E7C', line: '#E7DCC8', surface: '#FFFDF8', surface2: '#FBF6EC',
};
const INDUSTRI = ['Manufacturing', 'Retail / FMCG', 'Otomotif', 'Elektronik', 'Kimia', 'Farmasi', 'Agrikultur', 'Konstruksi', 'Oil & Gas', 'Tekstil / Garmen', 'F&B', 'E-commerce', 'Lainnya'];
const TIPE_CUSTOMER = ['Direct Customer', 'Forwarder Channel', 'Hybrid'];
const TIER = ['A', 'B', 'C'];
const SPECIAL_HANDLING = ['DG', 'Oversize', 'Time-critical', 'Customs complexity'];
const MSA_STATUS = ['Signed', 'In Review', 'Pending'];
const TAX_STATUS = ['PKP', 'Non-PKP'];
const COMM_PREF = ['Email', 'WhatsApp', 'Phone', 'Meeting'];
const CADENCE = ['Daily', 'Weekly', 'Monthly'];
const PIC_ROWS = [
  { key: 'pic_decision_maker', label: 'Decision Maker' },
  { key: 'pic_operasional', label: 'PIC Operasional' },
  { key: 'pic_commercial', label: 'PIC Commercial' },
  { key: 'pic_finance', label: 'PIC Finance' },
  { key: 'pic_escalation_1', label: 'Escalation Level 1' },
  { key: 'pic_escalation_2', label: 'Escalation Level 2' },
];

const lblStyle = { fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5, display: 'block' };
const inpStyle = { width: '100%', height: 38, borderRadius: 8, border: `1px solid ${C.line}`, padding: '0 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff', color: C.ink };
const taStyle = { ...inpStyle, height: 'auto', padding: '8px 11px', resize: 'vertical' };
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.navy, textTransform: 'uppercase', letterSpacing: '.4px', margin: '10px 0 12px', fontFamily: "'Montserrat',sans-serif" }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>{children}</div>
    </div>
  );
}
function F({ label, full, children }) {
  return <div style={{ gridColumn: full ? '1 / -1' : undefined }}><span style={lblStyle}>{label}</span>{children}</div>;
}

export default function StrategicHandoverModal({ account, onCancel, onSubmit }) {
  const { profile } = useAuth();
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [kams, setKams] = useState([]);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState({
    npwp: '', nib: '', ktp_direktur: '', alamat: account?.address || '', website: '',
    industri: '', tahun_berdiri: '', tipe_customer: '', tier_assigned: '',
    tcv_forecast: '', volume_per_lane: '', service_mix: '', sla_komitmen: '',
    quotation_ref: '', msa_status: '', payment_terms: '', credit_limit: '',
    pefindo_score: '', pefindo_date: '', bank_reference: '', invoicing_instructions: '',
    tax_status: '', doc_requirement: '', communication_pref: '', reporting_cadence: '', kam_assigned: '',
  });
  const [special, setSpecial] = useState([]);
  const [pic, setPic] = useState(Object.fromEntries(PIC_ROWS.map(r => [r.key, { nama: '', kontak: '', catatan: '' }])));

  useEffect(() => {
    if (!profile?.company_id) return undefined;
    let cancelled = false;
    supabase.from('payment_terms').select('id, name').eq('company_id', profile.company_id).is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => { if (!cancelled) setPaymentTerms(data || []); });
    (async () => {
      const { data: roleRows } = await supabase.from('roles').select('id').eq('company_id', profile.company_id).in('code', ['sales', 'manager']);
      const roleIds = (roleRows || []).map(r => r.id);
      if (!roleIds.length) return;
      const { data: urs } = await supabase.from('user_roles').select('user_id').eq('company_id', profile.company_id).in('role_id', roleIds).eq('is_active', true).is('revoked_at', null);
      const ids = [...new Set((urs || []).map(u => u.user_id).filter(Boolean))];
      if (!ids.length) return;
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids).eq('active', true).order('full_name').limit(1000);
      if (!cancelled) setKams(profs || []);
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const setPicField = (rowKey, sub) => (e) => setPic(p => ({ ...p, [rowKey]: { ...p[rowKey], [sub]: e.target.value } }));
  const toggle = (v) => setSpecial(a => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);
  const picText = (r) => [r.nama, r.kontak, r.catatan].map(s => s.trim()).filter(Boolean).join(' · ') || null;

  const submit = async () => {
    setSaving(true);
    const ok = await onSubmit({
      nama_perusahaan: account?.name || null,
      npwp: f.npwp || null, nib: f.nib || null, ktp_direktur: f.ktp_direktur || null,
      alamat: f.alamat || null, website: f.website || null, industri: f.industri || null,
      tahun_berdiri: f.tahun_berdiri || null, tipe_customer: f.tipe_customer || null, tier_assigned: f.tier_assigned || null,
      pic_decision_maker: picText(pic.pic_decision_maker), pic_operasional: picText(pic.pic_operasional),
      pic_commercial: picText(pic.pic_commercial), pic_finance: picText(pic.pic_finance),
      pic_escalation_1: picText(pic.pic_escalation_1), pic_escalation_2: picText(pic.pic_escalation_2),
      tcv_forecast: f.tcv_forecast !== '' ? Number(f.tcv_forecast) : null,
      volume_per_lane: f.volume_per_lane || null, service_mix: f.service_mix || null, sla_komitmen: f.sla_komitmen || null,
      special_handling: special.length ? special.join(', ') : null,
      quotation_ref: f.quotation_ref || null, msa_status: f.msa_status || null,
      payment_terms: f.payment_terms || null, credit_limit: f.credit_limit !== '' ? Number(f.credit_limit) : null,
      pefindo_score: [f.pefindo_score.trim(), f.pefindo_date.trim()].filter(Boolean).join(' · ') || null,
      bank_reference: f.bank_reference || null, invoicing_instructions: f.invoicing_instructions || null, tax_status: f.tax_status || null,
      doc_requirement: f.doc_requirement || null, communication_pref: f.communication_pref || null,
      reporting_cadence: f.reporting_cadence || null, kam_assigned: f.kam_assigned || null,
    });
    setSaving(false);
    if (!ok) return;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10003, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 720, width: '100%', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.line}`, background: C.surface2, borderRadius: '16px 16px 0 0' }}>
          <Crown size={18} color={C.accent} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.ink, fontFamily: "'Montserrat',sans-serif" }}>Strategic Handover</h2>
            <div style={{ fontSize: 12, color: C.inkSoft }}>{account?.name}</div>
          </div>
          <button onClick={onCancel} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          <Section title="A — Profil Customer Lengkap">
            <F label="Nama Perusahaan"><input value={account?.name || ''} readOnly style={{ ...inpStyle, background: C.surface2, color: C.inkSoft }} /></F>
            <F label="NPWP"><input value={f.npwp} onChange={set('npwp')} style={inpStyle} /></F>
            <F label="NIB"><input value={f.nib} onChange={set('nib')} style={inpStyle} /></F>
            <F label="KTP Direktur"><input value={f.ktp_direktur} onChange={set('ktp_direktur')} style={inpStyle} /></F>
            <F label="Alamat" full><textarea rows={2} value={f.alamat} onChange={set('alamat')} style={taStyle} /></F>
            <F label="Website"><input value={f.website} onChange={set('website')} style={inpStyle} /></F>
            <F label="Industri / Vertikal"><select value={f.industri} onChange={set('industri')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{INDUSTRI.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Tahun Berdiri"><input value={f.tahun_berdiri} onChange={set('tahun_berdiri')} style={inpStyle} /></F>
            <F label="Tipe Customer"><select value={f.tipe_customer} onChange={set('tipe_customer')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{TIPE_CUSTOMER.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Tier Assigned"><select value={f.tier_assigned} onChange={set('tier_assigned')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{TIER.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
          </Section>

          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.navy, textTransform: 'uppercase', letterSpacing: '.4px', margin: '10px 0 12px', fontFamily: "'Montserrat',sans-serif" }}>B — PIC Tree &amp; Escalation</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {PIC_ROWS.map(r => (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft }}>{r.label}</span>
                <input placeholder="Nama" value={pic[r.key].nama} onChange={setPicField(r.key, 'nama')} style={{ ...inpStyle, height: 34 }} />
                <input placeholder="No HP / Email" value={pic[r.key].kontak} onChange={setPicField(r.key, 'kontak')} style={{ ...inpStyle, height: 34 }} />
                <input placeholder="Catatan" value={pic[r.key].catatan} onChange={setPicField(r.key, 'catatan')} style={{ ...inpStyle, height: 34 }} />
              </div>
            ))}
          </div>

          <Section title="C — Commercial Commitment">
            <F label="TCV 12 Bulan (Rp)"><input type="number" min="0" value={f.tcv_forecast} onChange={set('tcv_forecast')} style={inpStyle} /></F>
            <F label="Quotation Number Aktif"><input value={f.quotation_ref} onChange={set('quotation_ref')} style={inpStyle} /></F>
            <F label="Volume Forecast per Lane" full><textarea rows={2} value={f.volume_per_lane} onChange={set('volume_per_lane')} style={taStyle} /></F>
            <F label="Service Type Mix" full><textarea rows={2} value={f.service_mix} onChange={set('service_mix')} style={taStyle} /></F>
            <F label="SLA Komitmen per Lane" full><textarea rows={2} value={f.sla_komitmen} onChange={set('sla_komitmen')} style={taStyle} /></F>
            <F label="MSA Status"><select value={f.msa_status} onChange={set('msa_status')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{MSA_STATUS.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Special Handling" full>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {SPECIAL_HANDLING.map(o => (
                  <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
                    <input type="checkbox" checked={special.includes(o)} onChange={() => toggle(o)} />{o}
                  </label>
                ))}
              </div>
            </F>
          </Section>

          <Section title="D — Payment Terms & Credit">
            <F label="Payment Terms"><select value={f.payment_terms} onChange={set('payment_terms')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{paymentTerms.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></F>
            <F label="Credit Limit Approved (Rp)"><input type="number" min="0" value={f.credit_limit} onChange={set('credit_limit')} style={inpStyle} /></F>
            <F label="Pefindo Score"><input value={f.pefindo_score} onChange={set('pefindo_score')} style={inpStyle} /></F>
            <F label="Pefindo Date"><input type="date" value={f.pefindo_date} onChange={set('pefindo_date')} style={inpStyle} /></F>
            <F label="Bank Reference"><input value={f.bank_reference} onChange={set('bank_reference')} style={inpStyle} /></F>
            <F label="Tax/VAT Status"><select value={f.tax_status} onChange={set('tax_status')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{TAX_STATUS.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Invoicing Instructions" full><textarea rows={2} value={f.invoicing_instructions} onChange={set('invoicing_instructions')} style={taStyle} /></F>
          </Section>

          <Section title="E — Customer-Specific SOP">
            <F label="Document Requirement" full><textarea rows={2} value={f.doc_requirement} onChange={set('doc_requirement')} style={taStyle} /></F>
            <F label="Communication Preference"><select value={f.communication_pref} onChange={set('communication_pref')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{COMM_PREF.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Reporting Cadence"><select value={f.reporting_cadence} onChange={set('reporting_cadence')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{CADENCE.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="KAM Assigned" full><select value={f.kam_assigned} onChange={set('kam_assigned')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{kams.map(k => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></F>
          </Section>

          <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 8, background: '#EAF0F8', border: '1px solid #CFE0F2', fontSize: 12, color: '#1B4E86' }}>
            Form ini memerlukan triple sign-off: Sales SPV + Acting Head Operations + Finance Controller sebelum komisi dilepas.
          </div>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.line}`, background: C.surface2, borderRadius: '0 0 16px 16px' }}>
          <button onClick={onCancel} disabled={saving} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.inkSoft, fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
          <button onClick={submit} disabled={saving} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: C.accent, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Crown size={15} />}Simpan &amp; Lanjutkan
          </button>
        </footer>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

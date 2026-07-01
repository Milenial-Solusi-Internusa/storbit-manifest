// src/modules/crm/TOPRequestModal.jsx
// TOP Request (Form 10.7) — pengajuan Terms of Payment / credit. Dibuka dari
// CustomerDetailPage (tombol "Ajukan TOP Request"), auto-fill dari accounts.
// Submit → INSERT ke top_requests (status 'submitted'). Self-contained.
import { useState } from 'react';
import { X, CreditCard, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  navy: '#1B4D8A', accent: '#E85A1E', ink: '#23291E', inkSoft: '#5E6553',
  inkFaint: '#8A8E7C', line: '#E7DCC8', surface: '#FFFDF8', surface2: '#FBF6EC',
};
const REVENUE = ['< 1 Miliar', '1-5 Miliar', '5-10 Miliar', '> 10 Miliar'];
const LAPKEU = ['Audited', 'Unaudited'];
const PKP = ['PKP', 'Non-PKP'];
const TOP_OPTIONS = ['CBD', 'TOP 7', 'TOP 14', 'TOP 30', 'TOP 45', 'TOP 60'];

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
function tradeText(r) { return [r.nama, r.pic, r.hubungan, r.top].map(s => (s || '').trim()).filter(Boolean).join(' · ') || null; }

export default function TOPRequestModal({ account, onClose, showToast }) {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    alamat_kantor: account?.address || '', alamat_gudang: '', telepon: account?.phone || '',
    email: account?.email || '', website: '', npwp: account?.tax_id || '', nib: '',
    direktur_nama: '', direktur_ktp: '', status_pkp: '',
    industri: '', tahun_berdiri: '', jumlah_karyawan: '', revenue_tahunan: '',
    produk_utama: '', customer_utama: '', supplier_utama: '', volume_bulanan: '',
    total_aset: '', total_liabilities: '', annual_revenue: '', net_profit_margin: '',
    laporan_keuangan: '', outstanding_hutang: '',
    bank_1_nama: '', bank_1_rekening: '', bank_1_cabang: '', bank_1_contact: '',
    bank_2_nama: '', bank_2_rekening: '', bank_2_cabang: '', bank_2_contact: '',
    top_requested: '', credit_limit_diminta: '', service_type: '', estimasi_volume: '', alasan_top: '',
  });
  const [trade, setTrade] = useState([0, 1, 2].map(() => ({ nama: '', pic: '', hubungan: '', top: '' })));

  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const setTrade_ = (i, sub) => (e) => setTrade(t => t.map((r, idx) => idx === i ? { ...r, [sub]: e.target.value } : r));
  const num = (v) => v !== '' ? Number(v) : null;

  const submit = async () => {
    if (!profile?.company_id) { showToast?.('Company tidak ditemukan', 'error'); return; }
    setSaving(true);
    const payload = {
      company_id: profile.company_id,
      account_id: account?.id || null,
      created_by: profile.id,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      nama_perusahaan: account?.name || null,
      alamat_kantor: f.alamat_kantor || null, alamat_gudang: f.alamat_gudang || null,
      telepon: f.telepon || null, email: f.email || null, website: f.website || null,
      npwp: f.npwp || null, nib: f.nib || null, direktur_nama: f.direktur_nama || null,
      direktur_ktp: f.direktur_ktp || null, status_pkp: f.status_pkp || null,
      industri: f.industri || null, tahun_berdiri: f.tahun_berdiri || null, jumlah_karyawan: f.jumlah_karyawan || null,
      revenue_tahunan: f.revenue_tahunan || null, produk_utama: f.produk_utama || null,
      customer_utama: f.customer_utama || null, supplier_utama: f.supplier_utama || null, volume_bulanan: f.volume_bulanan || null,
      total_aset: num(f.total_aset), total_liabilities: num(f.total_liabilities), annual_revenue: num(f.annual_revenue),
      net_profit_margin: f.net_profit_margin || null, laporan_keuangan: f.laporan_keuangan || null, outstanding_hutang: f.outstanding_hutang || null,
      bank_1_nama: f.bank_1_nama || null, bank_1_rekening: f.bank_1_rekening || null, bank_1_cabang: f.bank_1_cabang || null, bank_1_contact: f.bank_1_contact || null,
      bank_2_nama: f.bank_2_nama || null, bank_2_rekening: f.bank_2_rekening || null, bank_2_cabang: f.bank_2_cabang || null, bank_2_contact: f.bank_2_contact || null,
      trade_ref_1: tradeText(trade[0]), trade_ref_2: tradeText(trade[1]), trade_ref_3: tradeText(trade[2]),
      top_requested: f.top_requested || null, credit_limit_diminta: num(f.credit_limit_diminta),
      service_type: f.service_type || null, estimasi_volume: f.estimasi_volume || null, alasan_top: f.alasan_top || null,
    };
    const { error } = await supabase.from('top_requests').insert(payload);
    setSaving(false);
    if (error) { showToast?.('Gagal submit TOP Request: ' + error.message, 'error'); return; }
    showToast?.('TOP Request diajukan ✨', 'success');
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10003, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 720, width: '100%', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.line}`, background: C.surface2, borderRadius: '16px 16px 0 0' }}>
          <CreditCard size={18} color={C.navy} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.ink, fontFamily: "'Montserrat',sans-serif" }}>Ajukan TOP Request</h2>
            <div style={{ fontSize: 12, color: C.inkSoft }}>{account?.name}</div>
          </div>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          <Section title="A — Identitas Perusahaan">
            <F label="Nama Perusahaan"><input value={account?.name || ''} readOnly style={{ ...inpStyle, background: C.surface2, color: C.inkSoft }} /></F>
            <F label="Status PKP"><select value={f.status_pkp} onChange={set('status_pkp')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{PKP.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Alamat Kantor" full><textarea rows={2} value={f.alamat_kantor} onChange={set('alamat_kantor')} style={taStyle} /></F>
            <F label="Alamat Gudang" full><textarea rows={2} value={f.alamat_gudang} onChange={set('alamat_gudang')} style={taStyle} /></F>
            <F label="Telepon"><input value={f.telepon} onChange={set('telepon')} style={inpStyle} /></F>
            <F label="Email"><input value={f.email} onChange={set('email')} style={inpStyle} /></F>
            <F label="Website"><input value={f.website} onChange={set('website')} style={inpStyle} /></F>
            <F label="NPWP"><input value={f.npwp} onChange={set('npwp')} style={inpStyle} /></F>
            <F label="NIB"><input value={f.nib} onChange={set('nib')} style={inpStyle} /></F>
            <F label="Direktur — Nama"><input value={f.direktur_nama} onChange={set('direktur_nama')} style={inpStyle} /></F>
            <F label="Direktur — KTP"><input value={f.direktur_ktp} onChange={set('direktur_ktp')} style={inpStyle} /></F>
          </Section>

          <Section title="B — Profil Bisnis">
            <F label="Industri"><input value={f.industri} onChange={set('industri')} style={inpStyle} /></F>
            <F label="Tahun Berdiri"><input value={f.tahun_berdiri} onChange={set('tahun_berdiri')} style={inpStyle} /></F>
            <F label="Jumlah Karyawan"><input value={f.jumlah_karyawan} onChange={set('jumlah_karyawan')} style={inpStyle} /></F>
            <F label="Revenue Tahunan"><select value={f.revenue_tahunan} onChange={set('revenue_tahunan')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{REVENUE.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Produk/Service Utama" full><input value={f.produk_utama} onChange={set('produk_utama')} style={inpStyle} /></F>
            <F label="Customer Utama (3)" full><textarea rows={2} value={f.customer_utama} onChange={set('customer_utama')} style={taStyle} /></F>
            <F label="Supplier Utama (3)" full><textarea rows={2} value={f.supplier_utama} onChange={set('supplier_utama')} style={taStyle} /></F>
            <F label="Volume Shipment Bulanan" full><input value={f.volume_bulanan} onChange={set('volume_bulanan')} style={inpStyle} /></F>
          </Section>

          <Section title="C — Informasi Keuangan">
            <F label="Total Aset (Rp)"><input type="number" min="0" value={f.total_aset} onChange={set('total_aset')} style={inpStyle} /></F>
            <F label="Total Liabilities (Rp)"><input type="number" min="0" value={f.total_liabilities} onChange={set('total_liabilities')} style={inpStyle} /></F>
            <F label="Annual Revenue (Rp)"><input type="number" min="0" value={f.annual_revenue} onChange={set('annual_revenue')} style={inpStyle} /></F>
            <F label="Net Profit Margin (%)"><input value={f.net_profit_margin} onChange={set('net_profit_margin')} style={inpStyle} /></F>
            <F label="Laporan Keuangan"><select value={f.laporan_keuangan} onChange={set('laporan_keuangan')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{LAPKEU.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Outstanding Hutang ke Forwarder Lain"><input value={f.outstanding_hutang} onChange={set('outstanding_hutang')} style={inpStyle} /></F>
          </Section>

          <Section title="D — Referensi Bank">
            <F label="Bank 1 — Nama"><input value={f.bank_1_nama} onChange={set('bank_1_nama')} style={inpStyle} /></F>
            <F label="Bank 1 — No Rekening"><input value={f.bank_1_rekening} onChange={set('bank_1_rekening')} style={inpStyle} /></F>
            <F label="Bank 1 — Cabang"><input value={f.bank_1_cabang} onChange={set('bank_1_cabang')} style={inpStyle} /></F>
            <F label="Bank 1 — Contact Person"><input value={f.bank_1_contact} onChange={set('bank_1_contact')} style={inpStyle} /></F>
            <F label="Bank 2 — Nama"><input value={f.bank_2_nama} onChange={set('bank_2_nama')} style={inpStyle} /></F>
            <F label="Bank 2 — No Rekening"><input value={f.bank_2_rekening} onChange={set('bank_2_rekening')} style={inpStyle} /></F>
            <F label="Bank 2 — Cabang"><input value={f.bank_2_cabang} onChange={set('bank_2_cabang')} style={inpStyle} /></F>
            <F label="Bank 2 — Contact Person"><input value={f.bank_2_contact} onChange={set('bank_2_contact')} style={inpStyle} /></F>
          </Section>

          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.navy, textTransform: 'uppercase', letterSpacing: '.4px', margin: '10px 0 12px', fontFamily: "'Montserrat',sans-serif" }}>E — Trade Reference</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {trade.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                <input placeholder={`Ref ${i + 1} — Perusahaan`} value={r.nama} onChange={setTrade_(i, 'nama')} style={{ ...inpStyle, height: 34 }} />
                <input placeholder="PIC + No HP" value={r.pic} onChange={setTrade_(i, 'pic')} style={{ ...inpStyle, height: 34 }} />
                <input placeholder="Jenis Hubungan" value={r.hubungan} onChange={setTrade_(i, 'hubungan')} style={{ ...inpStyle, height: 34 }} />
                <input placeholder="TOP" value={r.top} onChange={setTrade_(i, 'top')} style={{ ...inpStyle, height: 34 }} />
              </div>
            ))}
          </div>

          <Section title="F — Permohonan Kredit">
            <F label="TOP Requested"><select value={f.top_requested} onChange={set('top_requested')} style={{ ...inpStyle, cursor: 'pointer' }}><option value="">— Pilih —</option>{TOP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
            <F label="Credit Limit Diminta (Rp)"><input type="number" min="0" value={f.credit_limit_diminta} onChange={set('credit_limit_diminta')} style={inpStyle} /></F>
            <F label="Service yang Akan Dipakai"><input value={f.service_type} onChange={set('service_type')} style={inpStyle} /></F>
            <F label="Estimasi Volume"><input value={f.estimasi_volume} onChange={set('estimasi_volume')} style={inpStyle} /></F>
            <F label="Alasan TOP" full><textarea rows={2} value={f.alasan_top} onChange={set('alasan_top')} style={taStyle} /></F>
          </Section>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.line}`, background: C.surface2, borderRadius: '0 0 16px 16px' }}>
          <button onClick={onClose} disabled={saving} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.inkSoft, fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
          <button onClick={submit} disabled={saving} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: C.accent, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={15} />}Submit TOP Request
          </button>
        </footer>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

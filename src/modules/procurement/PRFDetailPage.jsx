// src/modules/procurement/PRFDetailPage.jsx
// Detail PRF (dibuka dari list Forwarding MSI): ringkasan PRF read-only +
// panel "Jawaban Harga" MULTI-VENDOR.
//
// Model: tiap vendor mengirim rate sheet UTUH → satu KARTU per vendor. Komponen antar
// vendor TIDAK dibandingkan baris-per-baris (penamaan & rincian beda-beda). Award =
// SATU vendor menang untuk SELURUH PRF (tak ada split) → dijamin tunggal lewat `awardedKey`,
// sekaligus mencegah RAISE dari guard RPC save_prf_pricing.
//
// Currency: total ditampilkan TERPISAH per mata uang, TIDAK dikonversi di layar ini.
// `exchange_rate` tetap disimpan per baris (disalin dari tabel kurs header saat submit)
// tapi tidak dipakai menghitung apa pun di sini.
//
// Edit hanya untuk procurement/super_admin (cermin RLS prf_update_status + prf_cost_items write);
// sales/lainnya LIHAT saja. RLS = penegak sebenarnya.
// Tombol "Buat Quotation" + panel riwayat quotation di-gate hasMenuPermission('crm_quotation','view')
// (fail-CLOSED — beda dari canRenderPage/TD-103; konsisten TD-90).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Plus, Trash2, FileText, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const BORDER = '#E8ECF2';
const INK = '#16243A';
const MUTE = '#7E8899';
const HEAD = "'Montserrat',sans-serif";
const BODY = "'Inter',system-ui,sans-serif";
const DANGER = '#C0392B';

const SERVICE_LABEL = { sea: 'Sea', air: 'Air', inland: 'Inland', project: 'Project', custom: 'Custom' };
// Kategori biaya = daftar tetap (kolom item_group). Aturan bisnis, bukan CHECK di DB.
const ITEM_GROUPS = ['Origin Charges', 'Freight Charges', 'Destination Charges'];

const fmtDate = (iso) => {
  if (!iso) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};
const num = (v) => (Number(v) || 0);
const money = (v) => (Number(v) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const uid = () => crypto.randomUUID();

// Total per mata uang — TIDAK dijumlahkan lintas currency.
const totalsOf = (rows) => rows.reduce((m, r) => {
  const c = r.currency || 'IDR';
  m[c] = (m[c] || 0) + num(r.amount);
  return m;
}, {});

const PRF_SELECT = 'id, prf_no, status, created_at, customer_source, account_name_manual, stream, deadline_quotation, direction, commodity, hs_code, service_type, incoterms, origin, destination, pickup_address, delivery_address, cargo_ready_date, add_on_services, notes, inquiry_id, suggested_rate, rate_currency, valid_from, valid_until, pricing_notes, exchange_rates, answered_by, answered_at, account:accounts!prf_account_id_fkey(name), inquiry:inquiries!prf_inquiry_id_fkey(inquiry_no)';
const COST_SELECT = 'id, component, cost_type, amount, currency, sort_order, notes, vendor_id, item_group, is_awarded, exchange_rate';

export default function PRFDetailPage({ prfId, onBack, showToast, onCreateQuotation }) {
  const { profile, erpRole, hasMenuPermission } = useAuth();
  const canEdit = ['procurement', 'super_admin'].includes(erpRole);
  const canSeeQuotations = hasMenuPermission('crm_quotation', 'view');
  const companyId = profile?.company_id || null;

  const [prf, setPrf] = useState(null);
  // Kartu vendor: [{ key, vendor_id, rows: [{ key, item_group, component, amount, currency, notes }] }]
  const [vendorCards, setVendorCards] = useState([]);
  const [internalRows, setInternalRows] = useState([]);   // biaya internal — tanpa vendor, tak dilombakan
  const [awardedKey, setAwardedKey] = useState(null);     // key kartu pemenang (tunggal by construction)
  const [rates, setRates] = useState({});                 // prf.exchange_rates → { USD:'16200' }; IDR implisit 1
  const [answer, setAnswer] = useState({ suggested_rate: '', rate_currency: 'IDR', valid_from: '', valid_until: '', pricing_notes: '' });
  const [answeredName, setAnsweredName] = useState('');
  const [vendors, setVendors] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [prfQuotes, setPrfQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: p, error: e1 } = await supabase.from('prf').select(PRF_SELECT).eq('id', prfId).is('deleted_at', null).maybeSingle();
    if (e1) { setError(e1.message); setLoading(false); return; }
    if (!p) { setError('PRF tidak ditemukan atau tidak ada akses.'); setLoading(false); return; }
    setPrf(p);
    setAnswer({
      suggested_rate: p.suggested_rate != null ? String(p.suggested_rate) : '',
      rate_currency: p.rate_currency || 'IDR',
      valid_from: p.valid_from || '',
      valid_until: p.valid_until || '',
      pricing_notes: p.pricing_notes || '',
    });
    setRates(
      p.exchange_rates && typeof p.exchange_rates === 'object'
        ? Object.fromEntries(Object.entries(p.exchange_rates).map(([k, v]) => [k, String(v ?? '')]))
        : {}
    );

    const { data: ci } = await supabase.from('prf_cost_items').select(COST_SELECT).eq('prf_id', prfId).order('sort_order', { ascending: true });

    // Kelompokkan baris flat → kartu. PRF LAMA (vendor_id NULL, cost_type='vendor')
    // jatuh ke SATU kartu "vendor belum dipilih" → tetap terbuka & tetap bisa disimpan
    // (vendor_id null tak dihitung guard RPC, jadi tak pernah memicu RAISE).
    const internal = [];
    const byVendor = new Map();
    (ci || []).forEach((r) => {
      const row = {
        key: uid(),
        item_group: r.item_group || '',
        component: r.component || '',
        amount: r.amount != null ? String(r.amount) : '0',
        currency: r.currency || 'IDR',
        notes: r.notes || '',
      };
      if (r.cost_type === 'internal') { internal.push(row); return; }
      const vk = r.vendor_id || '';
      if (!byVendor.has(vk)) byVendor.set(vk, { key: uid(), vendor_id: vk, rows: [], awarded: false });
      const card = byVendor.get(vk);
      card.rows.push(row);
      if (r.is_awarded) card.awarded = true;
    });
    const cards = [...byVendor.values()];
    setVendorCards(cards.map(c => ({ key: c.key, vendor_id: c.vendor_id, rows: c.rows })));
    setAwardedKey(cards.find(c => c.awarded)?.key ?? null);
    setInternalRows(internal);

    if (p.answered_by) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', p.answered_by).maybeSingle();
      setAnsweredName(prof?.full_name || '');
    } else { setAnsweredName(''); }
    setLoading(false);
  }, [prfId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Dropdown vendor — WAJIB tiga filter. `deleted_at` tak lagi disaring RLS (TD-115).
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    supabase.from('vendors')
      .select('id, code, name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('code')
      .limit(1000)
      .then(({ data }) => { if (!cancelled) setVendors(data || []); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    supabase.from('currencies').select('code, name').eq('is_active', true).order('code')
      .then(({ data }) => { if (!cancelled) setCurrencies(data || []); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!canSeeQuotations || !prfId) return;
    let cancelled = false;
    supabase.from('quotations')
      .select('id, quotation_no, quote_date, created_at, status, total_amount')
      .eq('prf_id', prfId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error: qe }) => { if (!cancelled && !qe) setPrfQuotes(data || []); });
    return () => { cancelled = true; };
  }, [canSeeQuotations, prfId]);

  // ── Ops kartu vendor ──
  const addCard = () => setVendorCards(cs => [...cs, { key: uid(), vendor_id: '', rows: [] }]);
  const removeCard = (ck) => {
    setVendorCards(cs => cs.filter(c => c.key !== ck));
    setAwardedKey(k => (k === ck ? null : k));
  };
  const setCardVendor = (ck, vid) => setVendorCards(cs => cs.map(c => c.key === ck ? { ...c, vendor_id: vid } : c));
  const addCardRow = (ck) => setVendorCards(cs => cs.map(c => c.key === ck
    ? { ...c, rows: [...c.rows, { key: uid(), item_group: '', component: '', amount: '0', currency: 'IDR', notes: '' }] }
    : c));
  const patchCardRow = (ck, rk, k, v) => setVendorCards(cs => cs.map(c => c.key === ck
    ? { ...c, rows: c.rows.map(r => r.key === rk ? { ...r, [k]: v } : r) } : c));
  const removeCardRow = (ck, rk) => setVendorCards(cs => cs.map(c => c.key === ck
    ? { ...c, rows: c.rows.filter(r => r.key !== rk) } : c));

  // ── Ops biaya internal ──
  const addInternalRow = () => setInternalRows(rs => [...rs, { key: uid(), item_group: '', component: '', amount: '0', currency: 'IDR', notes: '' }]);
  const patchInternalRow = (rk, k, v) => setInternalRows(rs => rs.map(r => r.key === rk ? { ...r, [k]: v } : r));
  const removeInternalRow = (rk) => setInternalRows(rs => rs.filter(r => r.key !== rk));

  // ── Ops kurs (pola sama QuotationFormPage: peta {code: rate}, IDR implisit 1) ──
  const updateRate = (code, v) => setRates(m => ({ ...m, [code]: v }));
  const removeRate = (code) => setRates(m => { const n = { ...m }; delete n[code]; return n; });
  const addRateCurrency = (code) => { if (code) setRates(m => (code in m ? m : { ...m, [code]: '' })); };

  // ── Derived ──
  const allRows = useMemo(
    () => [...vendorCards.flatMap(c => c.rows), ...internalRows],
    [vendorCards, internalRows]
  );
  const usedCurrencies = useMemo(
    () => [...new Set(allRows.map(r => r.currency || 'IDR'))].filter(c => c !== 'IDR'),
    [allRows]
  );
  const missingRates = useMemo(
    () => usedCurrencies.filter(c => !(num(rates[c]) > 0)),
    [usedCurrencies, rates]
  );

  const awardedCard = vendorCards.find(c => c.key === awardedKey) || null;
  // Tiga titik hitung: HANYA baris ter-award (vendor pemenang + seluruh biaya internal).
  const awardedRows = useMemo(
    () => [...(awardedCard?.rows || []), ...internalRows],
    [awardedCard, internalRows]
  );
  const modalByCurrency = useMemo(() => totalsOf(awardedRows), [awardedRows]);

  const rc = answer.rate_currency || 'IDR';
  const sell = num(answer.suggested_rate);
  // Untung/Margin HANYA pada baris ber-currency = rate_currency (harga jual hanya ada
  // dalam satu mata uang; untung lintas mata uang tanpa konversi tak terdefinisi).
  const summaryCurrencies = useMemo(
    () => [...new Set([...Object.keys(modalByCurrency), rc])],
    [modalByCurrency, rc]
  );

  const rateFor = useCallback((c) => ((c || 'IDR') === 'IDR' ? 1 : (num(rates[c]) || 1)), [rates]);

  // ── Jalur "Buat Quotation" (Opsi 2 — hanya jalur yang bisa benar) ──
  // quotation_items hanya punya SATU kolom currency untuk cost_price DAN unit_price,
  // dan exchange_rate baris quotation di-hardcode 1 di QuotationFormPage → jalur non-IDR
  // pasti salah basis. Jadi tombol hanya aktif bila rate_currency = IDR.
  const awardedNonIdr = Object.keys(modalByCurrency).filter(c => c !== 'IDR' && num(modalByCurrency[c]) !== 0);
  const needConvert = awardedNonIdr.length > 0;                       // modal campur → konversi ke IDR
  const convertBlocked = awardedNonIdr.filter(c => !(num(rates[c]) > 0)); // kurs belum diisi → tak bisa konversi
  const costTotalIdr = Object.entries(modalByCurrency)
    .reduce((s, [c, amt]) => s + (c === 'IDR' ? num(amt) : num(amt) * rateFor(c)), 0);

  let quotationBlockReason = null;
  if (rc !== 'IDR') {
    quotationBlockReason = 'Harga jual atau modal bukan IDR. Quotation untuk kasus ini harus dibuat manual — dukungan multi-currency di quotation belum tersedia.';
  } else if (convertBlocked.length > 0) {
    quotationBlockReason = `Kurs ${convertBlocked.join(', ')} belum diisi, jadi modal tak bisa dikonversi ke IDR. Isi kurs di atas terlebih dahulu.`;
  }

  const handleSave = async () => {
    if (!canEdit) return;
    // Cegah RAISE dari guard RPC + cegah biaya vendor tersimpan senyap sebagai
    // non-pemenang. Dua kondisi:
    //   (a) ada kartu vendor tapi belum ada pemenang — termasuk saat kartunya CUMA SATU
    //       (dulu `> 1`, sehingga satu kartu tanpa pemenang lolos & biayanya hilang dari
    //       Total Modal tanpa peringatan).
    //   (b) awardedKey menunjuk key yang sudah tidak ada di vendorCards (key hantu) —
    //       truthy sehingga lolos cek (a), padahal tak ada kartu yang jadi pemenang.
    // PRF warisan TIDAK terblokir: baris lamanya `is_awarded=true` (default kolom) → saat
    // load `awardedKey` sudah terisi (lihat pengelompokan di `load`).
    if ((vendorCards.length > 0 && !awardedKey) || (awardedKey && !awardedCard)) {
      showToast?.('Belum ada vendor yang dipilih sebagai pemenang. Klik "Pilih Vendor Ini" pada salah satu kartu vendor.', 'error');
      return;
    }
    setSaving(true);
    try {
      const p_header = {
        suggested_rate: answer.suggested_rate,
        rate_currency: answer.rate_currency || 'IDR',
        valid_from: answer.valid_from || '',
        valid_until: answer.valid_until || '',
        pricing_notes: answer.pricing_notes.trim(),
        exchange_rates: Object.fromEntries(
          Object.entries(rates).filter(([, v]) => num(v) > 0).map(([k, v]) => [k, num(v)])
        ),
      };

      const keep = (r) => r.component.trim() !== '' || num(r.amount) !== 0;
      const p_items = [];
      let sort = 0;
      vendorCards.forEach((card) => {
        const isAw = card.key === awardedKey;
        card.rows.filter(keep).forEach((r) => p_items.push({
          component: r.component.trim(),
          cost_type: 'vendor',
          amount: num(r.amount),
          currency: r.currency || 'IDR',
          sort_order: sort++,
          notes: r.notes?.trim() || '',
          vendor_id: card.vendor_id || null,
          item_group: r.item_group || null,
          is_awarded: isAw,
          exchange_rate: rateFor(r.currency),
        }));
      });
      internalRows.filter(keep).forEach((r) => p_items.push({
        component: r.component.trim(),
        cost_type: 'internal',
        amount: num(r.amount),
        currency: r.currency || 'IDR',
        sort_order: sort++,
        notes: r.notes?.trim() || '',
        vendor_id: null,
        item_group: r.item_group || null,
        is_awarded: true,
        exchange_rate: rateFor(r.currency),
      }));

      const { error: e } = await supabase.rpc('save_prf_pricing', { p_prf_id: prfId, p_header, p_items });
      if (e) throw e;
      showToast?.('Jawaban harga tersimpan');
      await load();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Styles ──
  const page = { maxWidth: 1060, margin: '0 auto', padding: '24px 24px 48px', fontFamily: BODY };
  const backBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 18 };
  const card = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 };
  const secBar = { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: '#F7F9FB' };
  const secTitle = { fontFamily: HEAD, fontWeight: 700, fontSize: 14, color: NAVY };
  const secBody = { padding: 20 };
  const label = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTE, marginBottom: 4 };
  const val = { fontSize: 13.5, color: INK, fontFamily: BODY };
  const input = { height: 38, width: '100%', borderRadius: 9, border: `1px solid ${BORDER}`, padding: '0 10px', fontSize: 13, fontFamily: BODY, color: INK, boxSizing: 'border-box', outline: 'none', background: canEdit ? '#fff' : '#F7F9FB' };
  const th = { textAlign: 'left', padding: '9px 10px', fontFamily: HEAD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: MUTE, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '7px 10px', fontSize: 13, color: INK, borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' };
  const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer' };
  const numTd = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };

  if (loading) return <div style={page}><div style={{ padding: '40px 0', textAlign: 'center', color: MUTE }}>Memuat…</div></div>;
  if (error) return (
    <div style={page}>
      <button type="button" onClick={onBack} style={backBtn}><ChevronLeft size={16} />Kembali</button>
      <div style={{ padding: '40px 0', textAlign: 'center', color: DANGER }}>{error}</div>
    </div>
  );

  const customer = prf.account?.name || prf.account_name_manual || '—';

  const canCreateQuotation =
    typeof onCreateQuotation === 'function' &&
    canSeeQuotations &&
    !!prf.answered_at &&
    num(prf.suggested_rate) > 0 &&
    !['CANCELLED', 'EXPIRED'].includes(String(prf.status || '').toUpperCase());

  // cost_total: satu mata uang (IDR) → apa adanya; campur → konversi ke IDR pakai kurs
  // yang diinput (dilabeli eksplisit di UI). Jalur non-IDR diblokir, lihat quotationBlockReason.
  const handleCreateQuotation = () => onCreateQuotation({
    prf_id:         prf.id,
    inquiry_id:     prf.inquiry_id || null,
    rate_currency:  prf.rate_currency || 'IDR',
    valid_until:    prf.valid_until || null,
    suggested_rate: num(prf.suggested_rate),
    cost_total:     costTotalIdr,
  });

  const summary = [
    ['Customer', customer],
    ['Inquiry', prf.inquiry?.inquiry_no || '—'],
    ['Service Type', SERVICE_LABEL[prf.service_type] || prf.service_type || '—'],
    ['Direction', prf.direction || '—'],
    ['Commodity', prf.commodity || '—'],
    ['HS Code', prf.hs_code || '—'],
    ['Incoterms', prf.incoterms || '—'],
    ['Origin', prf.origin || '—'],
    ['Destination', prf.destination || '—'],
    ['Pickup', prf.pickup_address || '—'],
    ['Delivery', prf.delivery_address || '—'],
    ['Stream', prf.stream || '—'],
    ['Deadline Quotation', fmtDate(prf.deadline_quotation)],
    ['Cargo Ready', fmtDate(prf.cargo_ready_date)],
    ['Add-On', Array.isArray(prf.add_on_services) && prf.add_on_services.length ? prf.add_on_services.join(', ') : '—'],
  ];

  const currencyCodes = currencies.length ? currencies.map(c => c.code) : ['IDR', 'USD'];

  // Tabel baris biaya — dipakai kartu vendor & kartu internal (bentuk sama).
  const renderRows = (rowsArr, onPatch, onRemove) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 170 }}>Kategori</th>
            <th style={th}>Komponen</th>
            <th style={{ ...th, textAlign: 'right', width: 150 }}>Amount</th>
            <th style={{ ...th, width: 110 }}>Currency</th>
            {canEdit && <th style={{ ...th, textAlign: 'center', width: 60 }}>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {rowsArr.length === 0 && (
            <tr><td style={{ ...td, color: MUTE, textAlign: 'center' }} colSpan={canEdit ? 5 : 4}>Belum ada baris biaya.</td></tr>
          )}
          {rowsArr.map((r) => (
            <tr key={r.key}>
              <td style={td}>
                {canEdit
                  ? <select value={r.item_group} onChange={e => onPatch(r.key, 'item_group', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                      <option value="">— Pilih —</option>
                      {ITEM_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  : <span>{r.item_group || '—'}</span>}
              </td>
              <td style={td}>
                {canEdit
                  ? <input value={r.component} onChange={e => onPatch(r.key, 'component', e.target.value)} style={input} placeholder="mis. Ocean Freight" />
                  : <span>{r.component || '—'}</span>}
              </td>
              <td style={numTd}>
                {canEdit
                  ? <input value={r.amount} onChange={e => onPatch(r.key, 'amount', e.target.value.replace(/[^\d.]/g, ''))} onWheel={e => e.currentTarget.blur()} inputMode="decimal" style={{ ...input, textAlign: 'right' }} placeholder="0" />
                  : <span>{money(r.amount)}</span>}
              </td>
              <td style={td}>
                {canEdit
                  ? <select value={r.currency} onChange={e => onPatch(r.key, 'currency', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                      {currencyCodes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  : <span>{r.currency || 'IDR'}</span>}
              </td>
              {canEdit && (
                <td style={{ ...td, textAlign: 'center' }}>
                  <button type="button" onClick={() => onRemove(r.key)} style={{ ...iconBtn, color: DANGER, borderColor: '#F0D2D2' }} title="Hapus baris"><Trash2 size={14} /></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Total per mata uang — berdiri sendiri, TIDAK dijumlahkan lintas currency.
  const renderTotals = (map) => {
    const entries = Object.entries(map);
    if (entries.length === 0) return <span style={{ fontSize: 12.5, color: MUTE }}>Belum ada biaya.</span>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {entries.map(([c, v]) => (
          <span key={c} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>
            {c} {money(v)}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button type="button" onClick={onBack} style={backBtn}><ChevronLeft size={16} />Kembali</button>
        {canCreateQuotation && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginBottom: 18, maxWidth: 460 }}>
            <button type="button" onClick={handleCreateQuotation} disabled={!!quotationBlockReason}
              title={quotationBlockReason || undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 18px', borderRadius: 10, border: `1px solid ${quotationBlockReason ? BORDER : ORANGE}`, background: quotationBlockReason ? '#F1F3F6' : ORANGE, color: quotationBlockReason ? MUTE : '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: quotationBlockReason ? 'not-allowed' : 'pointer' }}>
              <FileText size={15} />Buat Quotation
            </button>
            {quotationBlockReason && (
              <span style={{ fontSize: 11.5, color: DANGER, textAlign: 'right', lineHeight: 1.45 }}>{quotationBlockReason}</span>
            )}
            {!quotationBlockReason && needConvert && (
              <span style={{ fontSize: 11.5, color: ORANGE, textAlign: 'right', lineHeight: 1.45 }}>
                Modal lintas mata uang — angka yang dikirim ke quotation adalah <b>hasil konversi ke IDR</b>: {money(costTotalIdr)} (kurs {awardedNonIdr.map(c => `${c} ${money(rates[c])}`).join(', ')}).
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: ORANGE, marginBottom: 6 }}>Procurement · PRF</div>
        <h1 style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: NAVY, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{prf.prf_no}</h1>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 5 }}>Status <b style={{ color: INK }}>{String(prf.status).toUpperCase()}</b> · dibuat {fmtDate(prf.created_at)}</div>
      </div>

      <section style={card}>
        <div style={secBar}><span style={secTitle}>Ringkasan Permintaan</span></div>
        <div style={secBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 20px' }}>
            {summary.map(([k, v]) => (<div key={k}><div style={label}>{k}</div><div style={val}>{v}</div></div>))}
          </div>
          {prf.notes && <div style={{ marginTop: 16 }}><div style={label}>Catatan</div><div style={{ ...val, whiteSpace: 'pre-wrap' }}>{prf.notes}</div></div>}
        </div>
      </section>

      {/* ── Panel Jawaban Harga (multi-vendor) ── */}
      <section style={card}>
        <div style={secBar}>
          <span style={secTitle}>Jawaban Harga</span>
          {!canEdit && <span style={{ fontSize: 11.5, color: MUTE }}>(hanya bisa dilihat — pengisian oleh procurement)</span>}
          {prf.answered_at && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: MUTE }}>Dijawab {answeredName ? `oleh ${answeredName} ` : ''}· {fmtDate(prf.answered_at)}</span>}
        </div>
        <div style={secBody}>

          {/* Tabel kurs (header panel) — pola sama quotations.exchange_rates. IDR selalu 1. */}
          <div style={{ marginBottom: 20, padding: 14, border: `1px solid ${BORDER}`, borderRadius: 12, background: '#F7F9FB' }}>
            <div style={label}>Kurs ke IDR</div>
            {Object.keys(rates).length === 0 && (
              <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 8 }}>Belum ada kurs. Tambahkan mata uang yang dipakai baris biaya (IDR selalu 1).</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(rates).map(([code, rate]) => (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 46, fontWeight: 700, fontSize: 13, color: INK }}>{code}</span>
                  {canEdit
                    ? <input type="number" min="0" step="any" value={rate ?? ''} onWheel={e => e.currentTarget.blur()}
                        onChange={e => updateRate(code, e.target.value)} style={{ ...input, textAlign: 'right', flex: 1, maxWidth: 220 }} placeholder="cth: 16200" />
                    : <span style={val}>{money(rate)}</span>}
                  {canEdit && (
                    <button type="button" onClick={() => removeRate(code)} style={{ ...iconBtn, color: DANGER, borderColor: '#F0D2D2' }} title={`Hapus kurs ${code}`}><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
              {canEdit && (
                <select value="" onChange={e => { addRateCurrency(e.target.value); e.target.value = ''; }} style={{ ...input, cursor: 'pointer', maxWidth: 260 }}>
                  <option value="">+ Tambah Mata Uang…</option>
                  {currencyCodes.filter(c => c !== 'IDR' && !(c in rates)).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {missingRates.length > 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: DANGER }}>
                  Kurs belum diisi: {missingRates.join(', ')} — baris ber-mata-uang itu akan tersimpan dengan kurs 1.
                </div>
              )}
            </div>
          </div>

          {/* Kartu vendor */}
          {canEdit && (
            <button type="button" onClick={addCard} style={{ ...ghostBtn, marginBottom: 14 }}><Plus size={15} />Tambah Vendor</button>
          )}

          {vendorCards.length === 0 && (
            <div style={{ fontSize: 13, color: MUTE, marginBottom: 16 }}>Belum ada penawaran vendor.</div>
          )}

          {vendorCards.map((c) => {
            const isAw = c.key === awardedKey;
            // Award SELALU punya penanda — dua tingkat, supaya tak pernah ada kartu yang
            // memegang award tanpa terlihat sama sekali:
            //   'final'   → ter-award DAN vendor terisi   → badge navy + border tebal (keputusan).
            //   'pending' → ter-award TAPI vendor kosong  → badge netral abu, TANPA border tebal.
            // Tingkat 'pending' sengaja tidak navy: kartu warisan PRF lama ter-award otomatis
            // (is_awarded default true) padahal vendor_id NULL — itu efek pengelompokan saat
            // load, bukan keputusan award yang sudah diambil.
            const awardTier = isAw ? (c.vendor_id ? 'final' : 'pending') : null;
            const showAward = awardTier === 'final';
            const vname = vendors.find(v => v.id === c.vendor_id);
            return (
              <div key={c.key} style={{ border: `${showAward ? 2 : 1}px solid ${showAward ? NAVY : BORDER}`, borderRadius: 14, padding: 16, marginBottom: 16, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                    <div style={label}>Vendor</div>
                    {canEdit
                      ? <select value={c.vendor_id} onChange={e => setCardVendor(c.key, e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                          <option value="">— Pilih Vendor —</option>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
                        </select>
                      : <div style={val}>{vname ? `${vname.code} — ${vname.name}` : '— belum dipilih —'}</div>}
                  </div>
                  {awardTier && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: awardTier === 'final' ? '#EAF0F8' : '#EEF0F3', color: awardTier === 'final' ? NAVY : MUTE, fontFamily: HEAD, fontWeight: 800, fontSize: 11.5, letterSpacing: '.03em' }}>
                      {awardTier === 'final' && <Check size={13} />}
                      {awardTier === 'final' ? 'VENDOR TERPILIH' : 'TERPILIH — vendor belum diisi'}
                    </span>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => removeCard(c.key)} style={{ ...iconBtn, color: DANGER, borderColor: '#F0D2D2', marginLeft: 'auto' }} title="Hapus kartu vendor"><Trash2 size={14} /></button>
                  )}
                </div>

                {renderRows(c.rows, (rk, k, v) => patchCardRow(c.key, rk, k, v), (rk) => removeCardRow(c.key, rk))}

                {canEdit && (
                  <button type="button" onClick={() => addCardRow(c.key)} style={{ ...ghostBtn, marginTop: 10 }}><Plus size={14} />Tambah Baris</button>
                )}

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ ...label, marginBottom: 0 }}>Total</span>
                  {renderTotals(totalsOf(c.rows))}
                  {canEdit && !isAw && (
                    <button type="button" onClick={() => setAwardedKey(c.key)} style={{ ...ghostBtn, marginLeft: 'auto' }}><Check size={14} />Pilih Vendor Ini</button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Kartu biaya internal — tanpa vendor, tidak dilombakan */}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 16, background: '#FBFCFD' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, color: NAVY }}>Biaya Internal</span>
              <span style={{ fontSize: 11.5, color: MUTE }}>tanpa vendor · selalu ikut dihitung</span>
            </div>
            {renderRows(internalRows, patchInternalRow, removeInternalRow)}
            {canEdit && (
              <button type="button" onClick={addInternalRow} style={{ ...ghostBtn, marginTop: 10 }}><Plus size={14} />Tambah Baris</button>
            )}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ ...label, marginBottom: 0 }}>Total</span>
              {renderTotals(totalsOf(internalRows))}
            </div>
          </div>

          {/* Ringkasan ter-award — per mata uang, TIDAK dikonversi */}
          <div style={{ marginTop: 20, padding: 16, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, color: NAVY }}>Ringkasan (vendor terpilih + biaya internal)</span>
              {!awardedCard && vendorCards.length > 0 && (
                <span style={{ fontSize: 11.5, color: DANGER }}>Belum ada vendor terpilih — angka di bawah baru menghitung biaya internal.</span>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 110 }}>Mata Uang</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total Modal</th>
                    <th style={{ ...th, textAlign: 'right' }}>Harga Jual</th>
                    <th style={{ ...th, textAlign: 'right' }}>Untung</th>
                    <th style={{ ...th, textAlign: 'right', width: 110 }}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryCurrencies.map((c) => {
                    const modal = num(modalByCurrency[c]);
                    const isRc = c === rc;
                    const profit = isRc ? sell - modal : null;
                    const mg = isRc && sell > 0 ? (profit / sell) * 100 : null;
                    return (
                      <tr key={c}>
                        <td style={{ ...td, fontWeight: 700 }}>{c}</td>
                        <td style={numTd}>{money(modal)}</td>
                        <td style={numTd}>{isRc ? money(sell) : '—'}</td>
                        <td style={{ ...numTd, color: profit != null && profit < 0 ? DANGER : INK, fontWeight: 700 }}>{profit != null ? money(profit) : '—'}</td>
                        <td style={{ ...numTd, color: mg != null && mg < 0 ? DANGER : INK }}>{mg != null ? `${mg.toFixed(1)} %` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 8 }}>
              Total per mata uang berdiri sendiri — tidak dijumlahkan maupun dikonversi. Untung &amp; margin hanya dihitung pada mata uang harga jual ({rc}).
            </div>
          </div>

          {/* Field header jawaban */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <div style={label}>Harga Jual</div>
              {canEdit
                ? <input value={answer.suggested_rate} onChange={e => setAnswer(a => ({ ...a, suggested_rate: e.target.value.replace(/[^\d.]/g, '') }))} onWheel={e => e.currentTarget.blur()} inputMode="decimal" style={input} placeholder="0" />
                : <div style={{ ...val, fontWeight: 700 }}>{money(sell)}</div>}
            </div>
            <div>
              <div style={label}>Rate Currency</div>
              {canEdit
                ? <select value={answer.rate_currency} onChange={e => setAnswer(a => ({ ...a, rate_currency: e.target.value }))} style={{ ...input, cursor: 'pointer' }}>
                    {currencyCodes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                : <div style={val}>{answer.rate_currency || 'IDR'}</div>}
            </div>
            <div>
              <div style={label}>Berlaku Dari</div>
              {canEdit
                ? <input type="date" value={answer.valid_from} onChange={e => setAnswer(a => ({ ...a, valid_from: e.target.value }))} style={input} />
                : <div style={val}>{fmtDate(answer.valid_from)}</div>}
            </div>
            <div>
              <div style={label}>Berlaku Sampai</div>
              {canEdit
                ? <input type="date" value={answer.valid_until} onChange={e => setAnswer(a => ({ ...a, valid_until: e.target.value }))} style={input} />
                : <div style={val}>{fmtDate(answer.valid_until)}</div>}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={label}>Catatan Pricing</div>
            {canEdit
              ? <textarea value={answer.pricing_notes} onChange={e => setAnswer(a => ({ ...a, pricing_notes: e.target.value }))} rows={3} style={{ ...input, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} placeholder="Catatan untuk sales / syarat harga…" />
              : <div style={{ ...val, whiteSpace: 'pre-wrap' }}>{answer.pricing_notes || '—'}</div>}
          </div>

          {/* Peringatan LUNAK — bukan blokir. Kartu pemenang tanpa vendor tetap boleh
              disimpan: bentuk datanya identik dengan kartu warisan PRF lama (vendor_id
              NULL) dan tak bisa dibedakan tanpa menambah penanda buatan. */}
          {canEdit && awardedCard && !awardedCard.vendor_id && (
            <div style={{ marginTop: 16, fontSize: 12.5, fontWeight: 600, color: ORANGE }}>
              Vendor belum dipilih. Baris akan tersimpan tanpa vendor.
            </div>
          )}

          {canEdit && (
            <div style={{ marginTop: 20 }}>
              <button type="button" onClick={handleSave} disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 24px', borderRadius: 10, border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Menyimpan…' : 'Simpan Jawaban Harga'}
              </button>
            </div>
          )}
        </div>
      </section>

      {canSeeQuotations && (
        <section style={card}>
          <div style={secBar}><span style={secTitle}>Quotation dari PRF Ini</span></div>
          <div style={secBody}>
            {prfQuotes.length === 0 ? (
              <div style={{ fontSize: 13, color: MUTE }}>Belum ada quotation yang dibuat dari PRF ini.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Quotation No</th>
                      <th style={th}>Tanggal</th>
                      <th style={th}>Status</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prfQuotes.map(q => (
                      <tr key={q.id}>
                        <td style={{ ...td, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, color: NAVY }}>{q.quotation_no}</td>
                        <td style={td}>{fmtDate(q.quote_date || q.created_at)}</td>
                        <td style={td}>{String(q.status || '—').toUpperCase()}</td>
                        <td style={numTd}>Rp {money(q.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

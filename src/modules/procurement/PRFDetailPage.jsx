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
import { ChevronLeft, Plus, Trash2, FileText, Check, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import ConfirmModal from '../../components/ConfirmModal';
import PRFVendorOfferModal from './PRFVendorOfferModal';

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
// Mirrors DB is_manager_or_above() (schema_snapshot.sql, fungsi is_manager_or_above).
// Dipakai HANYA untuk gate tombol render (RPC prf_release menegakkan izin sebenarnya).
const MANAGER_OR_ABOVE = ['super_admin', 'admin', 'ceo', 'gm', 'gm_bd', 'manager', 'supervisor'];
// Blok "Detail Layanan" (Section 03) — label tampilan, mirror kosakata PRFFormPage.jsx.
const SEA_FREIGHT_LABEL = { fcl: 'FCL', lcl: 'LCL' };
const CONTAINER_LABEL = { '20': "20'", '40': "40'", '40HC': "40' HC", '20RF': "20' Reefer", '40RF': "40' Reefer" };

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

// Gabungkan tipe+qty kontainer FCL jadi satu baris terbaca, mis. "20' × 2, 40' HC × 1".
function containerSummary(types, qty) {
  if (!Array.isArray(types) || types.length === 0) return null;
  return types.map((t) => {
    const q = qty && qty[t] != null ? qty[t] : null;
    return `${CONTAINER_LABEL[t] || t}${q != null ? ` × ${q}` : ''}`;
  }).join(', ');
}
// True bila salah satu nilai terisi (dipakai fallback "belum ada detail" per moda).
const anyFilled = (...vals) => vals.some((v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0));

const PRF_SELECT = 'id, prf_no, status, created_at, customer_source, account_id, account_name_manual, stream, deadline_quotation, direction, commodity, hs_code, msds_available, un_number, imo_class, service_type, incoterms, origin, destination, pickup_address, delivery_address, cargo_ready_date, add_on_services, notes, inquiry_id, sea_freight_type, sea_container_types, sea_container_qty, sea_lcl_gw, sea_lcl_dimension, sea_lcl_volume, sea_lcl_koli, air_gw, air_dimension, air_volume, air_koli, inland_fleet_types, inland_pickup_address, inland_delivery_address, inland_gw, inland_dimension, custom_doc_type, project_freight_types, project_qty, suggested_rate, rate_currency, valid_from, valid_until, pricing_notes, exchange_rates, answered_by, answered_at, acknowledged_by, acknowledged_at, selected_offer_id, min_offers_waiver_reason, account:accounts!prf_account_id_fkey(name, code), inquiry:inquiries!prf_inquiry_id_fkey(inquiry_no), creator:profiles!prf_created_by_fkey(full_name, email), holder:profiles!prf_acknowledged_by_fkey(full_name)';
const COST_SELECT = 'id, component, cost_type, amount, currency, sort_order, notes, vendor_id, item_group, is_awarded, exchange_rate, offer_id';

export default function PRFDetailPage({ prfId, onBack, showToast, onCreateQuotation }) {
  const { profile, erpRole, hasMenuPermission, user } = useAuth();
  const canEdit = ['procurement', 'super_admin'].includes(erpRole);
  const canSeeQuotations = hasMenuPermission('crm_quotation', 'view');
  const companyId = profile?.company_id || null;

  const [prf, setPrf] = useState(null);
  // Salinan MENTAH prf_cost_items dari DB (bukan bentuk kartu, TAK difilter offer_id).
  // Dua pemakai: (1) gate + payload "Buat Quotation" (savedModalByCurrency/costTotalIdr,
  // filter is_awarded) supaya menggambarkan PRF versi tersimpan; (2) costItemsByOffer utk
  // kartu "Penawaran Vendor" (filter offer_id terisi). Panel "Jawaban Harga" lama TIDAK
  // memakai state ini langsung — vendorCards/internalRows dibangun dari `ci` di load(),
  // difilter offer_id NULL di sana (lihat komentar di titik itu).
  const [savedCostItems, setSavedCostItems] = useState([]);
  // Kartu vendor: [{ key, vendor_id, rows: [{ key, item_group, component, amount, currency, notes }] }]
  const [vendorCards, setVendorCards] = useState([]);
  const [internalRows, setInternalRows] = useState([]);   // biaya internal — tanpa vendor, tak dilombakan
  const [awardedKey, setAwardedKey] = useState(null);     // key kartu pemenang (tunggal by construction)
  const [rates, setRates] = useState({});                 // prf.exchange_rates → { USD:'16200' }; IDR implisit 1
  const [answer, setAnswer] = useState({ suggested_rate: '', rate_currency: 'IDR', valid_from: '', valid_until: '', pricing_notes: '' });
  const [answeredName, setAnsweredName] = useState('');
  const [primaryContact, setPrimaryContact] = useState(null); // kontak utama tabel contacts (bukan accounts.pic_*)
  const [vendors, setVendors] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [prfQuotes, setPrfQuotes] = useState([]);
  const [vendorOffers, setVendorOffers] = useState([]); // prf_vendor_offers milik PRF ini
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);    // klaim/lepas PRF (terpisah dari `saving` panel harga)
  const [error, setError] = useState(null);
  // Batch 3B — sisi tulis kartu "Penawaran Vendor".
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null); // null = mode tambah; objek = mode edit
  const [deleteOfferTarget, setDeleteOfferTarget] = useState(null); // offer yg sedang dikonfirmasi hapus
  const [deletingOffer, setDeletingOffer] = useState(false);
  // Batch 3C — "Nyatakan Penawaran Siap" (ACKNOWLEDGED → QUOTED, prf_mark_quoted).
  const [markQuotedBusy, setMarkQuotedBusy] = useState(false);
  const [waiverModalOpen, setWaiverModalOpen] = useState(false); // dialog alasan saat penawaran < 3

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
    setSavedCostItems(ci || []);

    // Kelompokkan baris flat → kartu. HANYA baris WARISAN (offer_id NULL) — baris
    // ber-offer_id terisi adalah milik penawaran vendor (kartu "Penawaran Vendor" di
    // atas, lihat costItemsByOffer) dan SENGAJA tak ikut dikelompokkan di sini: kalau
    // ikut, panel lama menampilkannya lagi sebagai kartu vendor duplikat, dan menyimpan
    // panel lama akan menulisnya ulang TANPA offer_id (p_items di handleSave tak pernah
    // mengisi offer_id) → baris asli (masih ber-offer_id, tak ikut ter-DELETE karena
    // save_prf_pricing hanya menghapus offer_id IS NULL) + baris baru ber-offer_id NULL
    // hidup berdampingan → dobel, angka terhitung dua kali.
    // PRF LAMA (vendor_id NULL, cost_type='vendor') jatuh ke SATU kartu "vendor belum
    // dipilih" → tetap terbuka & tetap bisa disimpan (vendor_id null tak dihitung guard
    // RPC, jadi tak pernah memicu RAISE).
    const internal = [];
    const byVendor = new Map();
    (ci || []).filter((r) => !r.offer_id).forEach((r) => {
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

    // Penawaran vendor (modul "Penawaran Vendor", batch 3A) — READ-ONLY di sini.
    // Tanpa filter company_id eksplisit: RLS prf_vendor_offers_select sudah cukup,
    // sama seperti fetch `prf`/`prf_cost_items` di atas (satu PRF spesifik, bukan
    // daftar lintas-PRF yang butuh scoping tambahan).
    const { data: offers, error: offersErr } = await supabase.from('prf_vendor_offers')
      .select('id, vendor_id, currency, valid_from, valid_until, pros, cons, notes, vendor:vendors!prf_vendor_offers_vendor_id_fkey(name)')
      .eq('prf_id', prfId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (offersErr) { console.error('[PRF] gagal memuat penawaran vendor:', offersErr.message); showToast?.('Gagal memuat penawaran vendor: ' + offersErr.message, 'error'); }
    setVendorOffers(offers || []);

    if (p.answered_by) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', p.answered_by).maybeSingle();
      setAnsweredName(prof?.full_name || '');
    } else { setAnsweredName(''); }
    setLoading(false);
    // showToast sengaja tak dimasukkan dep — alasan sama seperti effect vendor/currency
    // di bawah (tak dimemo di App.jsx; memasukkannya akan membuat load() dibuat ulang
    // tiap App.jsx re-render → useEffect([load]) refetch berulang).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prfId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Kontak utama akun ini — tabel `contacts` (is_primary=true), BUKAN accounts.pic_*
  // (pensiunan). Pola sama persis CustomerDetailPage.jsx (primaryContact). Menunggu
  // prf.account_id yang baru terisi setelah load() selesai.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!prf?.account_id) { setPrimaryContact(null); return undefined; }
    let cancelled = false;
    supabase.from('contacts')
      .select('id, name, position, email, phone')
      .eq('account_id', prf.account_id)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('[PRF] gagal memuat kontak utama:', error.message); return; }
        setPrimaryContact(data || null);
      });
    return () => { cancelled = true; };
  }, [prf?.account_id]);

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
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('[PRF] gagal memuat daftar vendor:', error.message); showToast?.('Gagal memuat daftar vendor: ' + error.message, 'error'); return; }
        setVendors(data || []);
      });
    return () => { cancelled = true; };
    // showToast sengaja tak dimasukkan dep — tak dimemo di App.jsx, memasukkannya akan
    // memicu effect ini re-run (refetch vendor) tiap App.jsx re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    supabase.from('currencies').select('code, name').eq('is_active', true).order('code')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('[PRF] gagal memuat daftar currency:', error.message); showToast?.('Gagal memuat daftar currency: ' + error.message, 'error'); return; }
        setCurrencies(data || []);
      });
    return () => { cancelled = true; };
    // showToast sengaja tak dimasukkan dep — alasan sama seperti effect vendor di atas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Kartu "Penawaran Vendor" (batch 3A, read-only) — kelompokkan savedCostItems
  // (bukan state form vendorCards) per offer_id supaya total tiap penawaran
  // menggambarkan angka yang sudah TERSIMPAN, bukan draft panel Jawaban Harga lama.
  const costItemsByOffer = useMemo(() => {
    const m = new Map();
    savedCostItems.forEach((r) => {
      if (!r.offer_id) return;
      if (!m.has(r.offer_id)) m.set(r.offer_id, []);
      m.get(r.offer_id).push(r);
    });
    return m;
  }, [savedCostItems]);

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
  // SUMBER TUNGGAL untuk gate + payload = PRF versi TERSIMPAN (bukan state form). Tombol ini
  // BERPINDAH HALAMAN ke QuotationFormPage → edit yang belum disimpan hilang saat itu juga,
  // jadi memakai nilai form akan melahirkan quotation dari angka yang tak ada di mana pun.
  // Ringkasan/Untung/Margin di panel bawah SENGAJA tetap ikut state form (itu preview editing).
  const savedRateCurrency = prf?.rate_currency || 'IDR';
  const savedRates = (prf?.exchange_rates && typeof prf.exchange_rates === 'object') ? prf.exchange_rates : {};
  const savedRateFor = (c) => ((c || 'IDR') === 'IDR' ? 1 : (num(savedRates[c]) || 1));
  // Batch 3C — dasar modal PINDAH ke prf.selected_offer_id (TD-156). Model lama
  // (filter is_awarded di SELURUH savedCostItems) tak pernah melihat baris
  // ber-offer_id (batch 3B sengaja is_awarded=false untuk baris itu) → modal
  // penawaran vendor baru TIDAK PERNAH terhitung. Formula baru = union dua bucket:
  //   (a) baris offer_id NULL (warisan sebelum modul "Penawaran Vendor" ada) —
  //       TETAP difilter is_awarded=true, PERSIS formula lama. is_awarded pada
  //       baris warisan ini adalah penanda model LAMA yang membedakan vendor
  //       menang vs kalah (bisa >1 vendor card per PRF, offer_id sama-sama NULL)
  //       — kalau filter ini dibuang, vendor yang KALAH di PRF lama ikut
  //       kehitung sebagai modal. Filter ini gugur bersamaan saat is_awarded
  //       sendiri dibuang di Fase 4 (lihat TD-122).
  //   (b) baris offer_id = selected_offer_id (penawaran yang DIPILIH SALES) —
  //       tanpa syarat is_awarded (baris ini selalu is_awarded=false, tak lagi
  //       relevan — keputusan "menang" sekarang murni dari selected_offer_id).
  // hasOffers menandai PRF yang PUNYA prf_vendor_offers sama sekali — PRF lama
  // murni (nol offer) tak pernah masuk cabang "belum tersedia" di bawah, jadi
  // modalnya tetap terhitung dari bucket (a) seperti sebelumnya, tanpa regresi.
  const hasOffers = vendorOffers.length > 0;
  const legacyRows = savedCostItems.filter(r => r.offer_id == null && r.is_awarded);
  const selectedOfferRows = prf?.selected_offer_id ? (costItemsByOffer.get(prf.selected_offer_id) || []) : [];
  const savedModalByCurrency = totalsOf([...legacyRows, ...selectedOfferRows]);
  const awardedNonIdr = Object.keys(savedModalByCurrency).filter(c => c !== 'IDR' && num(savedModalByCurrency[c]) !== 0);
  const needConvert = awardedNonIdr.length > 0;                              // modal campur → konversi ke IDR
  const convertBlocked = awardedNonIdr.filter(c => !(num(savedRates[c]) > 0)); // kurs belum diisi → tak bisa konversi
  const costTotalIdr = Object.entries(savedModalByCurrency)
    .reduce((s, [c, amt]) => s + (c === 'IDR' ? num(amt) : num(amt) * savedRateFor(c)), 0);

  let quotationBlockReason = null;
  if (hasOffers && !prf?.selected_offer_id) {
    quotationBlockReason = 'Sales belum memilih penawaran. Modal belum bisa dihitung sampai salah satu penawaran vendor dipilih.';
  } else if (savedRateCurrency !== 'IDR') {
    quotationBlockReason = 'Harga jual atau modal bukan IDR. Quotation untuk kasus ini harus dibuat manual — dukungan multi-currency di quotation belum tersedia.';
  } else if (convertBlocked.length > 0) {
    quotationBlockReason = `Kurs ${convertBlocked.join(', ')} belum diisi, jadi modal tak bisa dikonversi ke IDR. Isi kurs di atas terlebih dahulu.`;
  }

  // ── Klaim / Lepas PRF (batch 3A) — panggil RPC apa adanya, JANGAN duplikasi
  // pengecekan izin di sini selain yang sudah dipakai untuk gate render tombol
  // (canClaim/canRelease, dihitung setelah guard loading/error di bawah). Kedua
  // RPC SECURITY DEFINER dan menegakkan izin sendiri; pesan error ditampilkan
  // apa adanya (sudah Bahasa Indonesia yang jelas dari RAISE Postgres).
  const handleClaim = async () => {
    setClaimBusy(true);
    try {
      const { error: e } = await supabase.rpc('prf_claim', { p_prf_id: prfId });
      if (e) throw e;
      showToast?.('PRF berhasil diambil.');
      logAudit(supabase, {
        action: ACTION_TYPES.CLAIM_PRF,
        entityType: ENTITY_TYPES.PRF,
        entityId: prfId,
        entityLabel: prf?.prf_no,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setClaimBusy(false);
    }
  };

  const handleRelease = async () => {
    // Force-release oleh manager (bukan pemegang asli) dicatat eksplisit di notes —
    // release oleh diri sendiri tak kehilangan informasi apa pun, jadi notes kosong.
    const isForceRelease = !!prf?.acknowledged_by && prf.acknowledged_by !== profile?.id;
    setClaimBusy(true);
    try {
      const { error: e } = await supabase.rpc('prf_release', { p_prf_id: prfId });
      if (e) throw e;
      showToast?.('PRF berhasil dilepas.');
      logAudit(supabase, {
        action: ACTION_TYPES.RELEASE_PRF,
        entityType: ENTITY_TYPES.PRF,
        entityId: prfId,
        entityLabel: prf?.prf_no,
        notes: isForceRelease ? `Dilepas paksa oleh manager (sebelumnya dipegang ${prf?.holder?.full_name || 'tidak diketahui'})` : null,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setClaimBusy(false);
    }
  };

  // ── Hapus penawaran vendor (batch 3B) — SOFT DELETE prf_vendor_offers
  // (deleted_at; DELETE fisik super_admin-only per RLS, tak dipakai di sini),
  // HARD DELETE prf_cost_items miliknya (tabel itu tak punya deleted_at).
  // Diblokir di render kalau offer ini prf.selected_offer_id (lihat JSX) —
  // fungsi ini sendiri tak mengulang cek itu, murni eksekusi.
  const handleDeleteOffer = async (offer) => {
    setDeletingOffer(true);
    try {
      const { error: eDel } = await supabase.from('prf_cost_items').delete().eq('offer_id', offer.id);
      if (eDel) throw eDel;
      const { error: eUpd } = await supabase.from('prf_vendor_offers').update({ deleted_at: new Date().toISOString() }).eq('id', offer.id);
      if (eUpd) throw eUpd;
      showToast?.('Penawaran berhasil dihapus.');
      logAudit(supabase, {
        action: ACTION_TYPES.DELETE_VENDOR_OFFER,
        entityType: ENTITY_TYPES.PRF,
        entityId: prfId,
        entityLabel: prf?.prf_no,
        notes: `Penawaran dihapus: ${offer.vendor?.name || offer.vendor_id} (offer ${offer.id})`,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setDeletingOffer(false);
      setDeleteOfferTarget(null);
    }
  };

  // ── Nyatakan Penawaran Siap (batch 3C) — ACKNOWLEDGED → QUOTED via
  // prf_mark_quoted. RPC menolak kalau bukan pemegang PRF atau nol penawaran
  // (gate render `canMarkQuoted` di bawah sudah menutup dua kasus itu duluan);
  // guard minimum-3-atau-alasan sepenuhnya milik RPC — reason di sini HANYA
  // dikirim kalau dialog waiver sudah mengumpulkannya.
  const handleMarkQuoted = async (reason) => {
    setMarkQuotedBusy(true);
    try {
      const { error: e } = await supabase.rpc('prf_mark_quoted', { p_prf_id: prfId, p_waiver_reason: reason || null });
      if (e) throw e;
      showToast?.('Penawaran dinyatakan siap dikutip.');
      logAudit(supabase, {
        action: ACTION_TYPES.MARK_PRF_QUOTED,
        entityType: ENTITY_TYPES.PRF,
        entityId: prfId,
        entityLabel: prf?.prf_no,
        notes: reason
          ? `Disetujui dengan ${vendorOffers.length} penawaran (kurang dari 3). Alasan: ${reason}`
          : `Disetujui dengan ${vendorOffers.length} penawaran.`,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      setWaiverModalOpen(false);
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setMarkQuotedBusy(false);
    }
  };
  // Klik tombol header — buka dialog alasan HANYA kalau penawaran < 3 (alasan
  // wajib diisi di dialog itu sebelum RPC dipanggil); ≥3 langsung tanpa dialog.
  const handleMarkQuotedClick = () => {
    if (vendorOffers.length < 3) { setWaiverModalOpen(true); return; }
    handleMarkQuoted(null);
  };

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
      logAudit(supabase, {
        action: ACTION_TYPES.UPDATE_PRF_PRICING,
        entityType: ENTITY_TYPES.PRF,
        entityId: prfId,
        entityLabel: prf?.prf_no,
        notes: `Harga jual ${answer.rate_currency || 'IDR'} ${money(sell)}${awardedCard?.vendor_id ? ' · vendor dipilih' : ''}`,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
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

  // Klaim/lepas — gate TOMBOL saja; RPC prf_claim/prf_release menegakkan izin
  // sebenarnya (SECURITY DEFINER, guard sudah di dalamnya).
  const canClaim = canEdit && prf.status === 'SUBMITTED' && !prf.acknowledged_by;
  const canRelease = prf.status === 'ACKNOWLEDGED' && (prf.acknowledged_by === profile?.id || MANAGER_OR_ABOVE.includes(erpRole));

  // Tambah/edit/hapus penawaran vendor (batch 3B) — gate TOMBOL saja, cermin
  // PERSIS syarat RLS prf_vendor_offers_insert/update: acknowledged_by HARUS
  // sama dengan auth.uid() (bukan IS NULL OR — beda dari canRelease di atas).
  // Status eksplisit ACKNOWLEDGED/QUOTED (batch 3C, keputusan desain #4): harga
  // vendor boleh berubah setelah sales memilih, jadi tombol tambah/edit TETAP
  // aktif saat QUOTED — RLS prf_vendor_offers_insert/update sendiri sudah tak
  // membatasi status sama sekali (lihat migrasi 20260727000004), pengecekan di
  // sini murni dokumentasi niat + jaga-jaga bila kelak ada status baru
  // (CANCELLED/EXPIRED, TD-154, belum ada RPC-nya) yang seharusnya menutup akses.
  const canManageOffers = canEdit && prf.acknowledged_by === profile?.id && ['ACKNOWLEDGED', 'QUOTED'].includes(prf.status);
  // Batch 3C — "Nyatakan Penawaran Siap". RPC prf_mark_quoted menegakkan syarat
  // sebenarnya (pemegang PRF + status ACKNOWLEDGED + ≥1 penawaran); gate di sini
  // hanya menyembunyikan tombol saat pasti akan RAISE.
  const canMarkQuoted = canEdit && prf.status === 'ACKNOWLEDGED' && prf.acknowledged_by === profile?.id && vendorOffers.length >= 1;

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

  // Satu field label+value untuk blok Detail Layanan/Customer & Kontak — TIDAK dirender
  // sama sekali bila kosong (bukan em-dash diam-diam). Fungsi biasa (pola sama renderRows/
  // renderTotals di bawah), dipanggil sbg `{infoField(...)}`, BUKAN sbg tag JSX <InfoField/> —
  // supaya React tak menganggapnya komponen terpisah (aman dari bug remount-kehilangan-fokus).
  const infoField = (l, v) => {
    if (v == null || v === '') return null;
    return <div key={l}><div style={label}>{l}</div><div style={val}>{v}</div></div>;
  };

  // Blok Detail Layanan (Task 2) — true bila moda dikenal PUNYA minimal satu sub-field
  // terisi. Dihitung per-moda (bukan gabungan seluruh kolom) supaya PRF air tak "dianggap
  // terisi" oleh sisa data sea, dst.
  const modeHasDetail = (() => {
    switch (prf.service_type) {
      case 'sea':    return anyFilled(prf.sea_freight_type, prf.sea_container_types, prf.sea_lcl_gw, prf.sea_lcl_dimension, prf.sea_lcl_volume, prf.sea_lcl_koli);
      case 'air':    return anyFilled(prf.air_gw, prf.air_dimension, prf.air_volume, prf.air_koli);
      case 'inland': return anyFilled(prf.inland_fleet_types, prf.inland_pickup_address, prf.inland_delivery_address, prf.inland_gw, prf.inland_dimension);
      case 'custom': return anyFilled(prf.custom_doc_type);
      case 'project':return anyFilled(prf.project_freight_types, prf.project_qty);
      default:       return false;
    }
  })();
  const KNOWN_MODES = ['sea', 'air', 'inland', 'custom', 'project'];
  const showDG = !!(prf.un_number || prf.imo_class || prf.msds_available);

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
                Modal lintas mata uang — angka yang dikirim ke quotation adalah <b>hasil konversi ke IDR</b>: {money(costTotalIdr)} (kurs {awardedNonIdr.map(c => `${c} ${money(savedRates[c])}`).join(', ')}).
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: ORANGE, marginBottom: 6 }}>Procurement · PRF</div>
        <h1 style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: NAVY, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{prf.prf_no}</h1>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 5 }}>Status <b style={{ color: INK }}>{String(prf.status).toUpperCase()}</b> · dibuat {fmtDate(prf.created_at)}{prf.creator?.full_name ? ` oleh ${prf.creator.full_name}` : ''}</div>
        {prf.acknowledged_by && (
          <div style={{ fontSize: 13, color: MUTE, marginTop: 3 }}>Sedang dikerjakan oleh <b style={{ color: INK }}>{prf.holder?.full_name || '—'}</b> · sejak {fmtDate(prf.acknowledged_at)}</div>
        )}
        {prf.status === 'QUOTED' && (
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#EAF0F8', color: NAVY, fontFamily: HEAD, fontWeight: 800, fontSize: 11.5, letterSpacing: '.03em' }}>
            <Check size={13} />PENAWARAN SIAP DIKUTIP
          </div>
        )}
        {(canClaim || canRelease || canMarkQuoted) && (
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            {canClaim && (
              <button type="button" onClick={handleClaim} disabled={claimBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 18px', borderRadius: 10, border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: claimBusy ? 'not-allowed' : 'pointer', opacity: claimBusy ? 0.7 : 1 }}>
                {claimBusy ? 'Mengambil…' : 'Ambil PRF Ini'}
              </button>
            )}
            {canRelease && (
              <button type="button" onClick={handleRelease} disabled={claimBusy}
                style={{ ...ghostBtn, height: 38, cursor: claimBusy ? 'not-allowed' : 'pointer', opacity: claimBusy ? 0.7 : 1 }}>
                {claimBusy ? 'Melepas…' : 'Lepas PRF'}
              </button>
            )}
            {canMarkQuoted && (
              <button type="button" onClick={handleMarkQuotedClick} disabled={markQuotedBusy}
                style={{ ...ghostBtn, height: 38, cursor: markQuotedBusy ? 'not-allowed' : 'pointer', opacity: markQuotedBusy ? 0.7 : 1 }}>
                {markQuotedBusy ? 'Memproses…' : 'Nyatakan Penawaran Siap'}
              </button>
            )}
          </div>
        )}
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

      {/* ── Customer & Kontak — akun dari accounts, kontak utama dari contacts (BUKAN
          accounts.pic_*, sudah dipensiunkan) ── */}
      <section style={card}>
        <div style={secBar}><span style={secTitle}>Customer &amp; Kontak</span></div>
        <div style={secBody}>
          {prf.account ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 20px' }}>
                {infoField('Nama Akun', prf.account.name)}
                {infoField('Kode Akun', prf.account.code)}
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ ...label, marginBottom: 10 }}>Kontak Utama</div>
                {primaryContact ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 20px' }}>
                    {infoField('Nama', primaryContact.name)}
                    {infoField('Posisi', primaryContact.position)}
                    {infoField('Telepon', primaryContact.phone)}
                    {infoField('Email', primaryContact.email)}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: MUTE }}>Belum ada kontak utama.</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: MUTE }}>Data akun tidak tersedia.</div>
          )}
        </div>
      </section>

      {/* ── Detail Layanan — kondisional per prf.service_type ── */}
      <section style={card}>
        <div style={secBar}><span style={secTitle}>Detail Layanan</span></div>
        <div style={secBody}>
          {!prf.service_type ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: ORANGE }}>Moda layanan belum ditentukan.</div>
          ) : !KNOWN_MODES.includes(prf.service_type) ? (
            <div style={{ fontSize: 13, color: MUTE }}>Moda &quot;{prf.service_type}&quot; tidak dikenal.</div>
          ) : !modeHasDetail ? (
            <div style={{ fontSize: 13, color: MUTE }}>Belum ada detail layanan untuk moda ini.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 20px' }}>
              {prf.service_type === 'sea' && <>
                {infoField('Freight Type', SEA_FREIGHT_LABEL[prf.sea_freight_type] || prf.sea_freight_type)}
                {infoField('Tipe & Qty Kontainer', containerSummary(prf.sea_container_types, prf.sea_container_qty))}
                {infoField('GW LCL (kg)', prf.sea_lcl_gw)}
                {infoField('Dimensi LCL', prf.sea_lcl_dimension)}
                {infoField('Volume LCL (m³)', prf.sea_lcl_volume)}
                {infoField('Koli LCL', prf.sea_lcl_koli)}
              </>}
              {prf.service_type === 'air' && <>
                {infoField('GW (kg)', prf.air_gw)}
                {infoField('Dimensi', prf.air_dimension)}
                {infoField('Volume (m³)', prf.air_volume)}
                {infoField('Koli', prf.air_koli)}
              </>}
              {prf.service_type === 'inland' && <>
                {infoField('Tipe Armada', Array.isArray(prf.inland_fleet_types) && prf.inland_fleet_types.length ? prf.inland_fleet_types.join(', ') : null)}
                {infoField('Pickup Address (Inland)', prf.inland_pickup_address)}
                {infoField('Delivery Address (Inland)', prf.inland_delivery_address)}
                {infoField('GW (kg)', prf.inland_gw)}
                {infoField('Dimensi', prf.inland_dimension)}
              </>}
              {prf.service_type === 'custom' && infoField('Tipe Dokumen', prf.custom_doc_type)}
              {prf.service_type === 'project' && <>
                {infoField('Tipe Freight', Array.isArray(prf.project_freight_types) && prf.project_freight_types.length ? prf.project_freight_types.join(', ') : null)}
                {infoField('Qty', prf.project_qty)}
              </>}
            </div>
          )}
        </div>
      </section>

      {/* ── Penawaran Vendor (batch 3A baca + 3B tulis) — procurement sediakan
          opsi, sales yang memilih (prf.selected_offer_id, RPC prf_select_offer,
          UI-nya = batch 3C). Tambah/edit/hapus di sini hanya boleh oleh
          procurement yang SEDANG memegang PRF ini (canManageOffers). ── */}
      <section style={card}>
        <div style={secBar}><span style={secTitle}>Penawaran Vendor</span></div>
        <div style={secBody}>
          {prf.min_offers_waiver_reason && (
            <div style={{ marginBottom: 14, fontSize: 12.5, fontWeight: 600, color: ORANGE }}>
              Disetujui dengan kurang dari 3 penawaran. Alasan: {prf.min_offers_waiver_reason}
            </div>
          )}
          {canManageOffers && (
            <button type="button" onClick={() => { setEditingOffer(null); setOfferModalOpen(true); }} style={{ ...ghostBtn, marginBottom: 14 }}>
              <Plus size={15} />Tambah Penawaran
            </button>
          )}
          {canEdit && !canManageOffers && (
            <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 14 }}>Ambil PRF ini dulu untuk menambah penawaran.</div>
          )}

          {vendorOffers.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTE }}>Belum ada penawaran vendor.</div>
          ) : (
            vendorOffers.map((o) => {
              const isSelected = prf.selected_offer_id === o.id;
              const offerTotals = totalsOf(costItemsByOffer.get(o.id) || []);
              return (
                <div key={o.id} style={{ border: `${isSelected ? 2 : 1}px solid ${isSelected ? NAVY : BORDER}`, borderRadius: 14, padding: 16, marginBottom: 16, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                      <div style={label}>Vendor</div>
                      <div style={{ ...val, fontWeight: 700 }}>{o.vendor?.name || '—'}</div>
                    </div>
                    {isSelected && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#EAF0F8', color: NAVY, fontFamily: HEAD, fontWeight: 800, fontSize: 11.5, letterSpacing: '.03em' }}>
                        <Check size={13} />DIPILIH SALES
                      </span>
                    )}
                    {canManageOffers && (
                      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                        <button type="button" onClick={() => { setEditingOffer({ ...o, costItems: costItemsByOffer.get(o.id) || [] }); setOfferModalOpen(true); }}
                          style={iconBtn} title="Edit penawaran"><Pencil size={14} /></button>
                        <button type="button" onClick={() => !isSelected && setDeleteOfferTarget(o)} disabled={isSelected}
                          style={{ ...iconBtn, color: isSelected ? MUTE : DANGER, borderColor: isSelected ? BORDER : '#F0D2D2', cursor: isSelected ? 'not-allowed' : 'pointer', opacity: isSelected ? 0.5 : 1 }}
                          title={isSelected ? 'Penawaran ini sedang dipakai sales untuk quotation. Hubungi sales kalau perlu diganti.' : 'Hapus penawaran'}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  {isSelected && canManageOffers && (
                    <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 12, marginTop: -6 }}>
                      Penawaran ini sedang dipakai sales untuk quotation — tak bisa dihapus. Hubungi sales kalau perlu diganti.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px 20px', marginBottom: 14 }}>
                    {infoField('Currency', o.currency)}
                    {o.valid_from && infoField('Berlaku Dari', fmtDate(o.valid_from))}
                    {o.valid_until && infoField('Berlaku Sampai', fmtDate(o.valid_until))}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={label}>Total Biaya</div>
                    {renderTotals(offerTotals)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <div>
                      <div style={label}>Kelebihan</div>
                      <div style={{ ...val, whiteSpace: 'pre-wrap' }}>{o.pros}</div>
                    </div>
                    <div>
                      <div style={label}>Kekurangan</div>
                      <div style={{ ...val, whiteSpace: 'pre-wrap' }}>{o.cons}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {offerModalOpen && (
        <PRFVendorOfferModal
          key={editingOffer?.id || 'new'}
          offer={editingOffer}
          prfId={prfId}
          prfNo={prf.prf_no}
          companyId={companyId}
          vendors={vendors}
          currencyCodes={currencyCodes}
          actor={{ id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id }}
          showToast={showToast}
          onClose={() => { setOfferModalOpen(false); setEditingOffer(null); }}
          onSaved={() => { setOfferModalOpen(false); setEditingOffer(null); load(); }}
        />
      )}

      <ConfirmModal
        open={!!deleteOfferTarget}
        title="Hapus Penawaran"
        message={`Hapus penawaran dari ${deleteOfferTarget?.vendor?.name || 'vendor ini'}? Rincian biayanya ikut terhapus.`}
        confirmLabel={deletingOffer ? 'Menghapus…' : 'Ya, Hapus'}
        variant="danger"
        onConfirm={() => deleteOfferTarget && handleDeleteOffer(deleteOfferTarget)}
        onCancel={() => !deletingOffer && setDeleteOfferTarget(null)}
      />

      {waiverModalOpen && (
        <MinOffersWaiverModal
          offerCount={vendorOffers.length}
          onClose={() => setWaiverModalOpen(false)}
          onConfirm={handleMarkQuoted}
        />
      )}

      {/* ── Dangerous Goods — seluruh blok disembunyikan kalau nol data DG ── */}
      {showDG && (
        <section style={card}>
          <div style={secBar}><span style={secTitle}>Dangerous Goods (DG)</span></div>
          <div style={secBody}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 20px' }}>
              <div><div style={label}>MSDS Tersedia</div><div style={val}>{prf.msds_available ? 'Ya' : 'Tidak'}</div></div>
              {infoField('UN Number', prf.un_number)}
              {infoField('IMO Class', prf.imo_class)}
            </div>
          </div>
        </section>
      )}

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

// ── Batch 3C — dialog alasan waiver saat penawaran < 3 (RPC prf_mark_quoted
// menolak tanpa alasan). Pola sama CancelModal (SalesOrderDetailPage.jsx):
// state lokal + onConfirm(reason) diserahkan ke pemanggil, modal urus loading
// sendiri sambil menunggu promise-nya. ──
function MinOffersWaiverModal({ offerCount, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const ok = reason.trim().length > 0;

  const handleConfirm = async () => {
    if (!ok) return;
    setLoading(true);
    await onConfirm(reason.trim());
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, maxWidth: 460, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
        <h2 style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 800, color: NAVY, margin: '0 0 10px' }}>Penawaran Kurang dari Minimum</h2>
        <p style={{ fontSize: 13, color: INK, lineHeight: 1.55, margin: '0 0 4px' }}>
          Baru ada <b>{offerCount}</b> penawaran vendor (minimum 3). Isi alasan kenapa jumlahnya kurang — <b>alasan ini akan terlihat oleh sales</b> pemilik PRF ini.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          autoFocus
          placeholder="mis. Rute ini hanya dilayani 2 vendor aktif"
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 14, borderRadius: 9, border: `1px solid ${BORDER}`, padding: '10px 12px', fontSize: 13, fontFamily: BODY, color: INK, resize: 'vertical', lineHeight: 1.5, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={loading}
            style={{ padding: '10px 24px', borderRadius: 10, border: '1.5px solid #D1D5DB', background: 'white', color: '#374151', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            Batal
          </button>
          <button type="button" onClick={handleConfirm} disabled={!ok || loading}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: ORANGE, color: 'white', fontSize: 14, fontWeight: 600, cursor: (!ok || loading) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (!ok || loading) ? 0.6 : 1 }}>
            {loading ? 'Memproses…' : 'Nyatakan Siap'}
          </button>
        </div>
      </div>
    </div>
  );
}

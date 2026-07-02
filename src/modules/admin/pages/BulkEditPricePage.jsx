// src/modules/admin/pages/BulkEditPricePage.jsx
// Update Harga Massal — bulk-edit product default_price across many rows at once.
// super_admin only (gated in App.jsx). Calls RPC bulk_update_product_prices which
// returns { updated, skipped } (skipped = price unchanged). Product picker reuses
// the shared ProductPicker component (same one used in Quotation/Surat Jalan).
//
// Brand tokens follow the sibling Master Data pages (ProductsPage / StokBarang):
// navy #1B4D8A, orange #E85A1E, Montserrat/Inter/IBM Plex Mono.

import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, TrendingUp, Save, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/useAuth';
import useProducts from '../../../hooks/useProducts';
import ProductPicker from '../../../components/ProductPicker';

const NAVY = '#1B4D8A';
const ORANGE = '#E85A1E';

const rp = (n) => (n === '' || n == null || isNaN(Number(n)))
  ? '—'
  : 'Rp ' + Number(n).toLocaleString('id-ID');

const S = {
  root:       { fontFamily: "'Inter', system-ui, sans-serif", color: '#1A2330' },
  crumbs:     { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#9AA0AC', marginBottom: 8 },
  title:      { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: 0 },
  sub:        { fontSize: 13, color: '#7A828E', marginTop: 4 },
  card:       { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, boxShadow: '0 1px 2px rgba(20,40,70,.04)', overflow: 'hidden' },
  tableScroll:{ overflowX: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse', minWidth: 940 },
  th:         { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9AA0AC', background: '#FAFBFC', borderBottom: '1px solid #F0F1F4', padding: '11px 14px', textAlign: 'left', whiteSpace: 'nowrap' },
  td:         { padding: '10px 14px', borderBottom: '1px solid #F4F5F7', fontSize: 12.5, verticalAlign: 'middle' },
  idx:        { color: '#9AA0AC', fontFamily: "'IBM Plex Mono', ui-monospace, monospace", width: 40 },
  cur:        { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, color: '#16243A', whiteSpace: 'nowrap' },
  input:      { width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 9, border: '1px solid #E3E5EA', background: '#fff', padding: '0 12px', fontFamily: 'inherit', fontSize: 13, color: '#16243A', outline: 'none' },
  pickerInput:{ width: '100%', boxSizing: 'border-box', borderRadius: 9, border: '1px solid #E3E5EA', background: '#fff', fontFamily: 'inherit', fontSize: 13, color: '#16243A' },
  delBtn:     { width: 34, height: 34, borderRadius: 9, border: '1px solid #F0D4CC', background: '#fff', color: '#C8521B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  ghostBtn:   { display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid ' + NAVY, background: '#fff', color: NAVY, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 11, border: '1px solid ' + NAVY, background: NAVY, color: '#fff', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(20,70,130,.22)' },
  footer:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderTop: '1px solid #F0F1F4', flexWrap: 'wrap' },
  hint:       { fontSize: 11.5, color: '#9AA0AC' },
  emptyBar:   { padding: '28px 16px', textAlign: 'center', color: '#9AA0AC', fontSize: 13 },
  errorBar:   { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13, marginBottom: 14 },
  toast:      { position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 9, color: '#fff', padding: '11px 16px', borderRadius: 11, fontSize: 13, fontWeight: 600, boxShadow: '0 12px 30px rgba(10,20,40,.28)', zIndex: 200, maxWidth: 420 },
};

function newRow(key) {
  return { key, text: '', product_id: null, current_price: null, new_price: '', contract_no: '', valid_until: '' };
}

export default function BulkEditPricePage() {
  const { erpRole } = useAuth();
  const isSuper = erpRole === 'super_admin';

  // Non-super: company-scoped catalog (useProducts default — unchanged for other pages).
  // Called unconditionally (hooks rule); its result is ignored in super mode.
  const { products: scopedProducts, loading: scopedLoading, error: scopedError } = useProducts();

  // Super mode: catalog across ALL entities (RLS products_read lets super read all).
  // Each product's `category` is set to its entity code (MSI/JCI/SOA) so the picker's
  // badge labels the entity — disambiguates same-named products across companies.
  // allLoading starts true so there's no synchronous setState inside the effect.
  const [allProducts, setAllProducts] = useState([]);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState(null);

  useEffect(() => {
    if (!isSuper) return undefined;
    let cancelled = false;
    Promise.all([
      supabase.from('companies').select('id, code').eq('is_active', true),
      supabase.from('products')
        .select('id, company_id, code, name, category, default_price, is_active')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(1000),
    ]).then(([{ data: cos }, { data: prods, error: pErr }]) => {
      if (cancelled) return;
      if (pErr) { setAllError(pErr); setAllProducts([]); setAllLoading(false); return; }
      const codeById = Object.fromEntries((cos || []).map(c => [c.id, c.code]));
      const mapped = (prods || []).map(p => ({ ...p, category: codeById[p.company_id] || '—' }));
      setAllError(null);
      setAllProducts(mapped);
      setAllLoading(false);
    });
    return () => { cancelled = true; };
  }, [isSuper]);

  const products = isSuper ? allProducts : scopedProducts;
  const loading  = isSuper ? allLoading  : scopedLoading;
  const error    = isSuper ? allError    : scopedError;

  const keyRef = useRef(1);
  const [rows, setRows] = useState(() => [newRow(0)]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { msg, type: 'success' | 'error' }

  const fireToast = useCallback((msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, newRow(keyRef.current++)]);
  }, []);

  const removeRow = useCallback((key) => {
    setRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const setRow = useCallback((key, patch) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    // A row counts as "filled" if the user touched any field.
    const filled = rows.filter(r => r.product_id || r.text.trim() || r.new_price !== '' || r.contract_no.trim() || r.valid_until);
    if (filled.length === 0) {
      fireToast('Tambah minimal 1 baris: pilih produk dan isi harga baru.', 'error');
      return;
    }
    // Every filled row must have a picked product AND a valid new price.
    const invalid = filled.some(r => !r.product_id || r.new_price === '' || !(Number(r.new_price) > 0));
    if (invalid) {
      fireToast('Ada baris belum lengkap — pastikan Produk dipilih dan Harga Baru terisi (> 0).', 'error');
      return;
    }
    const p_rows = filled.map(r => ({
      product_id: r.product_id,
      new_price: Number(r.new_price),
      contract_no: r.contract_no.trim() || null,
      valid_until: r.valid_until || null,
    }));

    setSaving(true);
    const { data, error: rpcErr } = await supabase.rpc('bulk_update_product_prices', { p_rows });
    setSaving(false);
    if (rpcErr) {
      fireToast('Gagal menyimpan: ' + (rpcErr.message || 'terjadi kesalahan'), 'error');
      return;
    }
    const updated = Number(data?.updated ?? 0);
    const skipped = Number(data?.skipped ?? 0);
    fireToast(`${updated} harga diperbarui, ${skipped} dilewati (harga sama).`, 'success');
  }, [saving, rows, fireToast]);

  return (
    <div style={S.root}>
      {/* header */}
      <nav style={S.crumbs}>
        <span>Home</span><span>›</span><span>Master Data</span><span>›</span>
        <span style={{ color: '#545B66', fontWeight: 600 }}>Update Harga Massal</span>
      </nav>
      <h1 style={S.title}>Update Harga Massal</h1>
      <div style={S.sub}>Perbarui harga (default price) beberapa produk sekaligus. Baris dengan harga sama akan dilewati.</div>

      {error && (
        <div style={{ ...S.errorBar, marginTop: 16 }}>
          <AlertCircle size={16} /> Gagal memuat produk: {error.message || 'terjadi kesalahan'}
        </div>
      )}

      <div style={{ ...S.card, marginTop: 18 }}>
        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.idx }}>#</th>
                <th style={S.th}>Produk</th>
                <th style={S.th}>Harga Saat Ini</th>
                <th style={S.th}>Harga Baru</th>
                <th style={S.th}>Nomor Kontrak <span style={{ color: '#C2C7D0' }}>(opsional)</span></th>
                <th style={S.th}>Berlaku Sampai <span style={{ color: '#C2C7D0' }}>(opsional)</span></th>
                <th style={{ ...S.th, width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={S.emptyBar}>Memuat produk…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={S.emptyBar}>Belum ada baris. Klik “Tambah Baris” untuk mulai.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.key}>
                  <td style={{ ...S.td, ...S.idx }}>{i + 1}</td>
                  <td style={{ ...S.td, minWidth: 260 }}>
                    <ProductPicker
                      value={r.text}
                      products={products}
                      placeholder="Cari produk…"
                      inputStyle={S.pickerInput}
                      onChangeText={(t) => setRow(r.key, { text: t, product_id: null, current_price: null })}
                      onPick={(p) => setRow(r.key, { text: p.name, product_id: p.id, current_price: p.default_price })}
                    />
                  </td>
                  <td style={{ ...S.td, ...S.cur }}>{r.product_id ? rp(r.current_price) : '—'}</td>
                  <td style={{ ...S.td, width: 150 }}>
                    <input
                      type="number" min="0" step="any"
                      style={S.input}
                      placeholder="0"
                      value={r.new_price}
                      onChange={(e) => setRow(r.key, { new_price: e.target.value })}
                      // Anti-scroll: blur on wheel so an accidental scroll can't change the price.
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </td>
                  <td style={{ ...S.td, minWidth: 160 }}>
                    <input
                      type="text"
                      style={S.input}
                      placeholder="mis. PKS/2026/001"
                      value={r.contract_no}
                      onChange={(e) => setRow(r.key, { contract_no: e.target.value })}
                    />
                  </td>
                  <td style={{ ...S.td, width: 160 }}>
                    <input
                      type="date"
                      style={S.input}
                      value={r.valid_until}
                      onChange={(e) => setRow(r.key, { valid_until: e.target.value })}
                    />
                  </td>
                  <td style={{ ...S.td, width: 48, textAlign: 'center' }}>
                    <button type="button" title="Hapus baris" style={S.delBtn} onClick={() => removeRow(r.key)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={S.footer}>
          <button type="button" style={S.ghostBtn} onClick={addRow}>
            <Plus size={16} /> Tambah Baris
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={S.hint}>{rows.length} baris</span>
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan Semua'}
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ ...S.toast, background: toast.type === 'error' ? '#B42318' : '#16243A' }}>
          {toast.type === 'error' ? <AlertCircle size={16} color="#FCA5A5" /> : <TrendingUp size={16} color={ORANGE} />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

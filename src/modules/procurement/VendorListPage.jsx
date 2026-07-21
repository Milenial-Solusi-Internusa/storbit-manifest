// src/modules/procurement/VendorListPage.jsx
// Master Vendor (Procurement): list + form tambah/edit + nonaktifkan (soft delete).
// Scope: company-scoped EKSPLISIT (.eq('company_id', profile.company_id)) di samping
// RLS `vendors_*` (rombakan 21 Jul) yang tetap jadi penegak sebenarnya.
// Penghapusan = UPDATE deleted_at (arsip). TIDAK PERNAH memanggil .delete().
// created_by/updated_by = profile.id — sah karena profiles.id ADALAH auth.users.id
// (profiles_id_fkey → auth.users(id)); FK vendors_created_by_fkey menunjuk auth.users.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Plus, Pencil, Ban, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ConfirmModal from '../../components/ConfirmModal';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const BORDER = '#E8ECF2';
const INK = '#16243A';
const MUTE = '#7E8899';
const HEAD = "'Montserrat',sans-serif";
const BODY = "'Inter',system-ui,sans-serif";
const DANGER = '#C0392B';

// Disimpan lowercase (value); label hanya untuk tampilan.
const VENDOR_TYPES = [
  { v: 'shipping_line',  l: 'Shipping Line'  },
  { v: 'trucker',        l: 'Trucker'        },
  { v: 'customs_agent',  l: 'Customs Agent'  },
  { v: 'supplier',       l: 'Supplier'       },
  { v: 'sub_contractor', l: 'Sub Contractor' },
  { v: 'general',        l: 'General'        },
];
const TYPE_LABEL = VENDOR_TYPES.reduce((m, t) => { m[t.v] = t.l; return m; }, {});

// List sengaja TIDAK menarik kolom sensitif (bank_account dkk) — hanya kolom tampil.
const LIST_SELECT = 'id, code, name, vendor_type, city, currency_code, is_active';
// Field lengkap ditarik on-demand saat Edit saja.
const FORM_SELECT = 'id, code, name, legal_name, vendor_type, tax_id, address, city, country, phone, email, pic_name, pic_phone, bank_name, bank_account, bank_account_name, currency_code, notes, is_active';

const EMPTY_FORM = {
  code: '', name: '', legal_name: '', vendor_type: '', tax_id: '',
  address: '', city: '', country: 'Indonesia', phone: '', email: '',
  pic_name: '', pic_phone: '', bank_name: '', bank_account: '', bank_account_name: '',
  currency_code: 'IDR', notes: '', is_active: true,
};

// '' → null supaya kolom opsional tidak menyimpan string kosong.
const nn = (v) => { const s = (v ?? '').toString().trim(); return s === '' ? null : s; };

// Style + komponen field di MODULE SCOPE (bukan di dalam render) supaya identitas
// komponen stabil — kalau dideklarasikan saat render, subtree remount tiap ketikan
// dan input kehilangan fokus.
const INPUT = { height: 40, width: '100%', borderRadius: 9, border: `1px solid ${BORDER}`, padding: '0 12px', fontSize: 13.5, fontFamily: BODY, color: INK, boxSizing: 'border-box', outline: 'none', background: '#fff' };
const LABEL = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTE, marginBottom: 4 };

function Field({ lbl, req, error, children }) {
  return (
    <div>
      <div style={LABEL}>{lbl}{req ? <span style={{ color: ORANGE }}> *</span> : null}</div>
      {children}
      {error && <div style={{ fontSize: 11.5, color: DANGER, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function TextField({ lbl, req, error, value, onChange, type = 'text', area }) {
  return (
    <Field lbl={lbl} req={req} error={error}>
      {area
        ? <textarea value={value} onChange={onChange} rows={2} style={{ ...INPUT, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} />
        : <input type={type} value={value} onChange={onChange} style={{ ...INPUT, ...(error ? { borderColor: DANGER } : null) }} />}
    </Field>
  );
}

export default function VendorListPage({ onBack, showToast }) {
  const { profile } = useAuth();
  const companyId = profile?.company_id || null;

  const [rows, setRows]         = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [search, setSearch]         = useState('');
  const [filterActive, setFilterActive] = useState('all'); // all | active | inactive

  const [formOpen, setFormOpen]   = useState(false);
  const [editId, setEditId]       = useState(null);   // null = mode tambah
  const [form, setForm]           = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]       = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const [delTarget, setDelTarget] = useState(null);
  const [deleting, setDeleting]   = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setError('Company tidak ditemukan untuk user ini.'); setLoading(false); return; }
    setLoading(true); setError(null);
    const { data, error: e } = await supabase
      .from('vendors')
      .select(LIST_SELECT)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('code', { ascending: true })
      .limit(1000);
    if (e) { setError(e.message); setRows([]); }
    else setRows(data || []);
    setLoading(false);
  }, [companyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Master currency untuk dropdown (pola sama PRFFormPage/QuotationFormPage).
  useEffect(() => {
    let cancelled = false;
    supabase.from('currencies').select('code, name').eq('is_active', true).order('code')
      .then(({ data }) => { if (!cancelled) setCurrencies(data || []); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filterActive === 'active'   && r.is_active !== true)  return false;
      if (filterActive === 'inactive' && r.is_active !== false) return false;
      if (!q) return true;
      return (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q);
    });
  }, [rows, search, filterActive]);

  const openCreate = () => {
    setEditId(null); setForm(EMPTY_FORM); setFormErrors({}); setFormOpen(true);
  };

  const openEdit = async (id) => {
    setEditId(id); setFormErrors({}); setFormOpen(true); setFormLoading(true);
    const { data, error: e } = await supabase.from('vendors').select(FORM_SELECT).eq('id', id).maybeSingle();
    setFormLoading(false);
    if (e || !data) {
      setFormOpen(false);
      showToast?.('Gagal memuat vendor: ' + (e?.message || 'data tidak ditemukan'), 'error');
      return;
    }
    setForm({
      code: data.code || '', name: data.name || '', legal_name: data.legal_name || '',
      vendor_type: data.vendor_type || '', tax_id: data.tax_id || '',
      address: data.address || '', city: data.city || '', country: data.country || '',
      phone: data.phone || '', email: data.email || '',
      pic_name: data.pic_name || '', pic_phone: data.pic_phone || '',
      bank_name: data.bank_name || '', bank_account: data.bank_account || '',
      bank_account_name: data.bank_account_name || '',
      currency_code: data.currency_code || 'IDR', notes: data.notes || '',
      is_active: data.is_active !== false,
    });
  };

  const setF = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSave = async () => {
    const errs = {};
    if (!form.code.trim()) errs.code = 'Wajib diisi';
    if (!form.name.trim()) errs.name = 'Wajib diisi';
    setFormErrors(errs);
    if (Object.keys(errs).length) return;
    if (!companyId) { showToast?.('Company tidak ditemukan untuk user ini', 'error'); return; }

    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(), name: form.name.trim(),
        legal_name: nn(form.legal_name), vendor_type: nn(form.vendor_type),
        tax_id: nn(form.tax_id), address: nn(form.address), city: nn(form.city),
        country: nn(form.country), phone: nn(form.phone), email: nn(form.email),
        pic_name: nn(form.pic_name), pic_phone: nn(form.pic_phone),
        bank_name: nn(form.bank_name), bank_account: nn(form.bank_account),
        bank_account_name: nn(form.bank_account_name),
        currency_code: nn(form.currency_code) || 'IDR',
        notes: nn(form.notes), is_active: !!form.is_active,
        updated_by: profile.id,
      };

      let error;
      if (editId) {
        ({ error } = await supabase.from('vendors').update(payload).eq('id', editId));
      } else {
        // company_id TIDAK diinput manual — diambil dari company user yang login.
        ({ error } = await supabase.from('vendors').insert({
          ...payload, company_id: companyId, created_by: profile.id,
        }));
      }
      if (error) throw error;

      showToast?.(editId ? 'Vendor berhasil diperbarui' : 'Vendor berhasil ditambahkan', 'success');
      setFormOpen(false);
      await load();
    } catch (err) {
      // 23505 = unique_violation → constraint vendors_company_code_unique (company_id, code).
      if (err?.code === '23505') {
        setFormErrors(e => ({ ...e, code: 'Kode sudah dipakai' }));
        showToast?.(`Kode vendor "${form.code.trim()}" sudah dipakai di company ini.`, 'error');
      } else {
        showToast?.('Gagal menyimpan vendor: ' + (err?.message || 'terjadi kesalahan'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // Soft delete — UPDATE deleted_at. Tidak ada .delete() di file ini.
  const handleDeactivate = async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('vendors')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', delTarget.id);
      if (error) throw error;
      showToast?.(`Vendor ${delTarget.code} dinonaktifkan`, 'success');
      setDelTarget(null);
      await load();
    } catch (err) {
      showToast?.('Gagal menonaktifkan vendor: ' + (err?.message || 'terjadi kesalahan'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Styles ──
  const page = { maxWidth: 1180, margin: '0 auto', padding: '24px 24px 48px', fontFamily: BODY };
  const backBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
  const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 18px', borderRadius: 10, border: `1px solid ${ORANGE}`, background: ORANGE, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
  const card = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' };
  const th = { textAlign: 'left', padding: '10px 12px', fontFamily: HEAD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: MUTE, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '10px 12px', fontSize: 13, color: INK, borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' };
  const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer' };

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <button type="button" onClick={onBack} style={backBtn}><ChevronLeft size={16} />Kembali</button>
        <button type="button" onClick={openCreate} style={primaryBtn}><Plus size={15} />Tambah Vendor</button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: ORANGE, marginBottom: 6 }}>Procurement · Vendor</div>
        <h1 style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: NAVY, margin: 0 }}>Master Vendor</h1>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 5 }}>Daftar vendor entitas Anda. Vendor yang dinonaktifkan diarsipkan dan tidak ditampilkan.</div>
      </div>

      {/* Filter bar */}
      <div style={{ ...card, padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <Search size={15} color={MUTE} style={{ position: 'absolute', left: 12, top: 12 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama atau kode vendor…"
            style={{ ...INPUT, paddingLeft: 34 }} />
        </div>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value)} style={{ ...INPUT, width: 180, cursor: 'pointer' }}>
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
        <span style={{ fontSize: 12.5, color: MUTE, marginLeft: 'auto' }}>
          {loading ? 'Memuat…' : `${filtered.length} vendor`}
        </span>
      </div>

      {/* Tabel */}
      <section style={card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Code</th>
                <th style={th}>Name</th>
                <th style={th}>Vendor Type</th>
                <th style={th}>City</th>
                <th style={th}>Currency</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'center', width: 100 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td style={{ ...td, textAlign: 'center', color: MUTE }} colSpan={7}>Memuat…</td></tr>
              )}
              {!loading && error && (
                <tr><td style={{ ...td, textAlign: 'center', color: DANGER }} colSpan={7}>{error}</td></tr>
              )}
              {!loading && !error && filtered.length === 0 && (
                <tr><td style={{ ...td, textAlign: 'center', color: MUTE }} colSpan={7}>
                  {rows.length === 0 ? 'Belum ada vendor untuk entitas ini. Klik "Tambah Vendor" untuk mulai.' : 'Tidak ada vendor yang cocok dengan filter.'}
                </td></tr>
              )}
              {!loading && !error && filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, color: NAVY }}>{r.code}</td>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{TYPE_LABEL[r.vendor_type] || r.vendor_type || '—'}</td>
                  <td style={td}>{r.city || '—'}</td>
                  <td style={td}>{r.currency_code || '—'}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: r.is_active ? '#EAF0F8' : '#EEF0F3', color: r.is_active ? NAVY : MUTE,
                    }}>{r.is_active ? 'Aktif' : 'Nonaktif'}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => openEdit(r.id)} style={{ ...iconBtn, marginRight: 4 }} title="Edit"><Pencil size={14} /></button>
                    <button type="button" onClick={() => setDelTarget(r)} style={{ ...iconBtn, color: DANGER, borderColor: '#F0D2D2' }} title="Nonaktifkan"><Ban size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Form tambah / edit */}
      {formOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 860, margin: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: NAVY }}>{editId ? 'Edit Vendor' : 'Tambah Vendor'}</span>
              <button type="button" onClick={() => setFormOpen(false)} style={{ marginLeft: 'auto', ...iconBtn, border: 'none', background: '#F3F4F6' }} title="Tutup"><X size={16} /></button>
            </div>

            <div style={{ padding: 22 }}>
              {formLoading ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: MUTE }}>Memuat data vendor…</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <TextField lbl="Code" req value={form.code} onChange={setF('code')} error={formErrors.code} />
                    <TextField lbl="Name" req value={form.name} onChange={setF('name')} error={formErrors.name} />
                    <TextField lbl="Legal Name" value={form.legal_name} onChange={setF('legal_name')} />
                    <Field lbl="Vendor Type">
                      <select value={form.vendor_type} onChange={setF('vendor_type')} style={{ ...INPUT, cursor: 'pointer' }}>
                        <option value="">— Pilih —</option>
                        {VENDOR_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                    </Field>
                    <TextField lbl="Tax ID" value={form.tax_id} onChange={setF('tax_id')} />
                    <TextField lbl="City" value={form.city} onChange={setF('city')} />
                    <TextField lbl="Country" value={form.country} onChange={setF('country')} />
                    <TextField lbl="Phone" value={form.phone} onChange={setF('phone')} />
                    <TextField lbl="Email" type="email" value={form.email} onChange={setF('email')} />
                    <TextField lbl="PIC Name" value={form.pic_name} onChange={setF('pic_name')} />
                    <TextField lbl="PIC Phone" value={form.pic_phone} onChange={setF('pic_phone')} />
                    <TextField lbl="Bank Name" value={form.bank_name} onChange={setF('bank_name')} />
                    <TextField lbl="Bank Account" value={form.bank_account} onChange={setF('bank_account')} />
                    <TextField lbl="Bank Account Name" value={form.bank_account_name} onChange={setF('bank_account_name')} />
                    <Field lbl="Currency">
                      <select value={form.currency_code} onChange={setF('currency_code')} style={{ ...INPUT, cursor: 'pointer' }}>
                        {(currencies.length ? currencies : [{ code: 'IDR', name: 'Rupiah' }]).map(c => (
                          <option key={c.code} value={c.code}>{c.code}{c.name ? ` — ${c.name}` : ''}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                    <TextField lbl="Address" area value={form.address} onChange={setF('address')} />
                    <TextField lbl="Notes" area value={form.notes} onChange={setF('notes')} />
                  </div>

                  <label style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: INK, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.is_active} onChange={setF('is_active')} style={{ width: 16, height: 16, accentColor: NAVY, cursor: 'pointer' }} />
                    Vendor aktif
                  </label>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: `1px solid ${BORDER}` }}>
              <button type="button" onClick={() => setFormOpen(false)} style={{ ...backBtn, borderColor: '#D1D5DB', color: '#374151' }}>Batal</button>
              <button type="button" onClick={handleSave} disabled={saving || formLoading}
                style={{ ...primaryBtn, cursor: (saving || formLoading) ? 'not-allowed' : 'pointer', opacity: (saving || formLoading) ? 0.7 : 1 }}>
                {saving ? 'Menyimpan…' : (editId ? 'Simpan Perubahan' : 'Simpan Vendor')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!delTarget}
        variant="danger"
        title="Nonaktifkan Vendor"
        message={delTarget ? `Nonaktifkan vendor ${delTarget.code} — ${delTarget.name}? Vendor akan diarsipkan dan hilang dari daftar. Data tidak dihapus permanen.` : ''}
        confirmLabel={deleting ? 'Memproses…' : 'Ya, Nonaktifkan'}
        cancelLabel="Batal"
        onConfirm={handleDeactivate}
        onCancel={() => setDelTarget(null)}
      />
    </div>
  );
}

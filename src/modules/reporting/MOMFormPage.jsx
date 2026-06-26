// src/modules/reporting/MOMFormPage.jsx
// Minutes of Meeting — create/edit form. UI follows the Lovable MOM design
// (slate/white, navy/orange, Montserrat/Inter/IBM Plex Mono), adapted to Nexus:
// supabase + useAuth, inline primitives, Lucide icons. Renders inside the app
// shell → no sticky-topbar / fixed-footer (inline header card + footer instead).
import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, X, Save, Send, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { C, MOM_TYPES, STATUS_OPTS, PRIORITAS_OPTS } from './momConstants';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const emptyAP = () => ({ id: uid(), action_plan: '', pic: '', timeline: '', prioritas: 'high', status: 'pending' });
const emptyPU = () => ({ id: uid(), aspek: '', capaian: '', target: '', status: 'on_progress' });
const emptyISS = () => ({ id: uid(), issue: '', dampak: '', akar_masalah: '' });
const emptyIMP = () => ({ id: uid(), usulan: '', catatan: '' });

/* ---------- primitives ---------- */
function Label({ children, required }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', marginBottom: 7, display: 'flex', gap: 5 }}>{children}{required && <span style={{ color: C.orange }}>*</span>}</div>;
}
function Input({ value, onChange, placeholder, readOnly, mono, type = 'text', list }) {
  const [f, setF] = useState(false);
  return (
    <input type={type} value={value} readOnly={readOnly} placeholder={placeholder} list={list}
      onChange={e => onChange?.(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ height: 44, width: '100%', boxSizing: 'border-box', border: `1px solid ${f ? C.navy : C.border}`, boxShadow: f ? '0 0 0 3px rgba(20,70,130,.12)' : 'none', borderRadius: 10, padding: '0 13px', fontSize: 14, fontFamily: mono ? "'IBM Plex Mono',monospace" : 'inherit', color: readOnly ? C.sub : C.text, background: readOnly ? '#F1F5F9' : '#fff', outline: 'none', transition: 'border-color .15s,box-shadow .15s' }} />
  );
}
function Textarea({ value, onChange, placeholder, rows = 4 }) {
  const [f, setF] = useState(false);
  return (
    <textarea value={value} rows={rows} placeholder={placeholder} onChange={e => onChange?.(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${f ? C.navy : C.border}`, boxShadow: f ? '0 0 0 3px rgba(20,70,130,.12)' : 'none', borderRadius: 10, padding: '11px 13px', fontSize: 14, fontFamily: 'inherit', color: C.text, background: '#fff', outline: 'none', resize: 'vertical', lineHeight: 1.6, transition: 'border-color .15s,box-shadow .15s' }} />
  );
}
function Select({ value, onChange, options, placeholder }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={e => onChange?.(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ height: 44, width: '100%', boxSizing: 'border-box', border: `1px solid ${f ? C.navy : C.border}`, boxShadow: f ? '0 0 0 3px rgba(20,70,130,.12)' : 'none', borderRadius: 10, padding: '0 36px 0 13px', fontSize: 14, fontFamily: 'inherit', color: value ? C.text : C.muted, background: '#fff', outline: 'none', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', cursor: 'pointer', transition: 'border-color .15s' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.muted, fontSize: 12 }}>▾</span>
    </div>
  );
}
function Btn({ children, variant = 'primary', onClick, small, disabled, Icon }) {
  const [h, setH] = useState(false);
  const base = { display: 'inline-flex', alignItems: 'center', gap: 7, height: small ? 36 : 44, padding: small ? '0 16px' : '0 22px', borderRadius: 10, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: small ? 12.5 : 14, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', transition: 'all .15s', opacity: disabled ? 0.6 : 1 };
  const styles = {
    primary: { ...base, background: h && !disabled ? C.orangeDark : C.orange, color: '#fff' },
    ghost: { ...base, background: h && !disabled ? C.navySoft : '#fff', color: C.navy, border: `1px solid ${C.navy}` },
  };
  return <button type="button" disabled={disabled} style={styles[variant]} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>{Icon && <Icon size={small ? 14 : 16} />}{children}</button>;
}
function Section({ badge, title, subtitle, required, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${required ? C.orange + '60' : C.border}`, borderLeft: required ? `3px solid ${C.orange}` : `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F1F5F9', borderBottom: `1px solid ${C.border}`, padding: '13px 22px', flexWrap: 'wrap' }}>
        <span style={{ width: 28, height: 28, borderRadius: 999, background: required ? C.orange : C.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{badge}</span>
        <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, color: C.text }}>{title}</span>
        {subtitle && <span style={{ fontSize: 12, color: C.muted }}>{subtitle}</span>}
        {required && <span style={{ fontSize: 11, fontWeight: 700, color: C.orange, background: C.orangeSoft, padding: '2px 8px', borderRadius: 999, marginLeft: 'auto' }}>Wajib</span>}
      </div>
      <div style={{ padding: '22px 24px' }}>{children}</div>
    </div>
  );
}
const thS = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.sub, borderBottom: `1px solid ${C.border}` };
const tdS = { padding: '8px 10px', verticalAlign: 'top' };

function DynTable({ cols, rows, onAdd, onDelete, onEdit, emptyText, picListId }) {
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={{ ...thS, width: 40 }}>No</th>
              {cols.map(c => <th key={c.key} style={{ ...thS, minWidth: c.min ?? 120 }}>{c.label}</th>)}
              <th style={{ ...thS, width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length + 2} style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13, fontStyle: 'italic' }}>{emptyText}</td></tr>
            ) : rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ ...tdS, textAlign: 'center', color: C.muted, fontWeight: 700, width: 40 }}>{i + 1}</td>
                {cols.map(c => (
                  <td key={c.key} style={{ ...tdS, minWidth: c.min ?? 120 }}>
                    {c.type === 'select' ? (
                      <Select value={row[c.key] ?? ''} onChange={v => onEdit(row.id, c.key, v)} options={c.options} placeholder="—" />
                    ) : c.type === 'date' ? (
                      <Input type="date" value={row[c.key] ?? ''} onChange={v => onEdit(row.id, c.key, v)} />
                    ) : c.type === 'pic' ? (
                      <Input value={row[c.key] ?? ''} onChange={v => onEdit(row.id, c.key, v)} placeholder="Nama PIC" list={picListId} />
                    ) : (
                      <Input value={row[c.key] ?? ''} onChange={v => onEdit(row.id, c.key, v)} placeholder={c.placeholder} />
                    )}
                  </td>
                ))}
                <td style={{ ...tdS, width: 44, textAlign: 'center' }}>
                  <button type="button" onClick={() => onDelete(row.id)} title="Hapus baris" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = C.red; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted; }}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}><Btn variant="ghost" small onClick={onAdd} Icon={Plus}>Tambah Baris</Btn></div>
    </div>
  );
}

function TagInput({ tags, onChange }) {
  const [input, setInput] = useState('');
  const add = () => { const v = input.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput(''); };
  return (
    <div style={{ minHeight: 44, border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: '#fff' }}>
      {tags.map(t => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.navySoft, color: C.navy, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 600 }}>
          {t}<button type="button" onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.navy, padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        placeholder={tags.length === 0 ? 'Ketik nama lalu Enter…' : ''} style={{ border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', flex: 1, minWidth: 140, color: C.text }} />
    </div>
  );
}

/* ========================================================================= */
export default function MOMFormPage({ momId, mode = 'create', onBack, showToast }) {
  const { profile, erpRole, user } = useAuth();
  const isEdit = mode === 'edit' && !!momId;
  const PIC_LIST_ID = 'mom-pic-options';

  const [header, setHeader] = useState({
    mom_type: '', divisi: '', meeting_date: '', time_start: '', time_end: '',
    pemimpin: '', notulis_id: profile?.id || '', lokasi: '', peserta: [],
  });
  const [notulisName, setNotulisName] = useState(profile?.full_name || '');
  const [sectionA, setSectionA] = useState([]);
  const [sectionB, setSectionB] = useState([]);
  const [sectionC, setSectionC] = useState([]);
  const [sectionD, setSectionD] = useState([]);
  const [sectionF, setSectionF] = useState([emptyAP()]);
  const [catatan, setCatatan] = useState('');
  const [picNames, setPicNames] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editNo, setEditNo] = useState('');
  const sectionFRef = useRef(null);

  const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }));
  const editRow = (setter) => (id, key, val) => setter(rows => rows.map(r => r.id === id ? { ...r, [key]: val } : r));
  const delRow = (setter) => (id) => setter(rows => rows.filter(r => r.id !== id));

  // profiles for PIC combobox + notulis name resolution
  useEffect(() => {
    if (!profile?.company_id) return undefined;
    let cancelled = false;
    supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('active', true).order('full_name').limit(1000)
      .then(({ data }) => {
        if (cancelled) return;
        const list = data || [];
        setPicNames(list.map(p => p.full_name).filter(Boolean));
        if (!isEdit) setNotulisName(profile.full_name || '');
      });
    return () => { cancelled = true; };
  }, [profile?.company_id, isEdit, profile?.full_name]);

  // Edit mode — load MOM + children
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase.from('meeting_moms').select('*').eq('id', momId).maybeSingle();
      if (cancelled || !m) return;
      setEditNo(m.mom_no || '');
      setHeader({
        mom_type: m.mom_type || '', divisi: m.divisi || '', meeting_date: m.meeting_date || '',
        time_start: m.time_start ? String(m.time_start).slice(0, 5) : '', time_end: m.time_end ? String(m.time_end).slice(0, 5) : '',
        pemimpin: m.pemimpin || '', notulis_id: m.notulis_id || profile?.id || '', lokasi: m.lokasi || '', peserta: m.peserta || [],
      });
      setCatatan(m.catatan_tambahan || '');
      if (m.notulis_id) {
        const { data: np } = await supabase.from('profiles').select('full_name').eq('id', m.notulis_id).maybeSingle();
        if (!cancelled && np) setNotulisName(np.full_name || '');
      }
      const [ap, pu, iss, imp] = await Promise.all([
        supabase.from('mom_action_plans').select('*').eq('mom_id', momId).order('no'),
        supabase.from('mom_progress_updates').select('*').eq('mom_id', momId).order('no'),
        supabase.from('mom_issues').select('*').eq('mom_id', momId).order('no'),
        supabase.from('mom_improvements').select('*').eq('mom_id', momId).order('no'),
      ]);
      if (cancelled) return;
      const apRows = ap.data || [];
      setSectionA(apRows.filter(r => r.section === 'review').map(r => ({ id: uid(), action_plan: r.action_plan || '', pic: r.pic || '', timeline: r.timeline || '', status: r.status || 'pending' })));
      const fRows = apRows.filter(r => r.section === 'new').map(r => ({ id: uid(), action_plan: r.action_plan || '', pic: r.pic || '', timeline: r.timeline || '', prioritas: r.prioritas || 'high', status: r.status || 'pending' }));
      setSectionF(fRows.length ? fRows : [emptyAP()]);
      setSectionB((pu.data || []).map(r => ({ id: uid(), aspek: r.aspek || '', capaian: r.capaian || '', target: r.target || '', status: r.status || 'on_progress' })));
      setSectionC((iss.data || []).map(r => ({ id: uid(), issue: r.issue || '', dampak: r.dampak || '', akar_masalah: r.akar_masalah || '' })));
      setSectionD((imp.data || []).map(r => ({ id: uid(), usulan: r.usulan || '', catatan: r.catatan || '' })));
    })();
    return () => { cancelled = true; };
  }, [isEdit, momId, profile?.id]);

  // Notify CEO(s) of the company on submit. Best-effort.
  const notifyCEO = async (id, momNo) => {
    try {
      const { data: roleRows } = await supabase.from('roles').select('id').eq('company_id', profile.company_id).eq('code', 'ceo');
      const roleIds = (roleRows || []).map(r => r.id);
      if (!roleIds.length) return;
      const { data: urs } = await supabase.from('user_roles').select('user_id').eq('company_id', profile.company_id).in('role_id', roleIds).eq('is_active', true).is('revoked_at', null);
      const userIds = [...new Set((urs || []).map(u => u.user_id).filter(Boolean))];
      if (!userIds.length) return;
      const rows = userIds.map(u => ({
        company_id: profile.company_id, user_id: u, event_type: 'mom_approval_needed',
        title: 'MOM Baru Menunggu Approval', body: `${notulisName || 'Notulis'} mengajukan MOM ${momNo} untuk disetujui`,
        reference_type: 'mom', reference_id: id,
      }));
      await supabase.from('notifications').insert(rows);
    } catch (e) { console.error('[mom] notify CEO failed:', e?.message || e); }
  };

  const persist = async (submit) => {
    setError('');
    if (!header.mom_type) { setError('Jenis meeting wajib dipilih.'); return; }
    const fNew = sectionF.filter(r => r.action_plan.trim());
    if (!fNew.length) {
      setError('Wajib isi minimal 1 action plan baru di Section F sebelum menyimpan.');
      sectionFRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setSaving(true);
    try {
      const cid = profile.company_id;
      const status = submit ? 'submitted' : 'draft';
      const headerPayload = {
        mom_type: header.mom_type,
        divisi: header.divisi || null,
        meeting_date: header.meeting_date || null,
        time_start: header.time_start || null,
        time_end: header.time_end || null,
        pemimpin: header.pemimpin || null,
        notulis_id: header.notulis_id || profile.id,
        lokasi: header.lokasi || null,
        peserta: header.peserta.length ? header.peserta : null,
        catatan_tambahan: catatan || null,
        status,
      };
      if (submit) headerPayload.submitted_at = new Date().toISOString();

      let id = momId;
      let momNo = editNo;
      if (isEdit) {
        const { error: e1 } = await supabase.from('meeting_moms').update(headerPayload).eq('id', momId);
        if (e1) throw e1;
        await Promise.all([
          supabase.from('mom_action_plans').delete().eq('mom_id', momId),
          supabase.from('mom_progress_updates').delete().eq('mom_id', momId),
          supabase.from('mom_issues').delete().eq('mom_id', momId),
          supabase.from('mom_improvements').delete().eq('mom_id', momId),
        ]);
      } else {
        const { data: companyRow } = await supabase.from('companies').select('code').eq('id', cid).maybeSingle();
        const code = companyRow?.code || 'MSI';
        const year = new Date().getFullYear();
        const { data: seq, error: seqErr } = await supabase.rpc('increment_document_sequence', { p_company_id: cid, p_document_type: 'MOM', p_department_code: 'RPT', p_year: year, p_month: 0 });
        if (seqErr) throw new Error('Gagal generate nomor MOM, coba lagi.');
        momNo = `MOM/${code}/${year}/${String(seq).padStart(3, '0')}`;
        const { data: ins, error: e2 } = await supabase.from('meeting_moms').insert({ ...headerPayload, mom_no: momNo, company_id: cid, created_by: profile.id }).select('id, mom_no').single();
        if (e2) throw e2;
        id = ins.id; momNo = ins.mom_no || momNo;
      }

      // child rows (skip empty)
      const apRows = [];
      sectionA.filter(r => r.action_plan.trim()).forEach((r, i) => apRows.push({ mom_id: id, section: 'review', no: i + 1, action_plan: r.action_plan, pic: r.pic || null, timeline: r.timeline || null, prioritas: null, status: r.status || null }));
      fNew.forEach((r, i) => apRows.push({ mom_id: id, section: 'new', no: i + 1, action_plan: r.action_plan, pic: r.pic || null, timeline: r.timeline || null, prioritas: r.prioritas || null, status: r.status || null }));
      if (apRows.length) { const { error } = await supabase.from('mom_action_plans').insert(apRows); if (error) throw error; }

      const puRows = sectionB.filter(r => r.aspek.trim()).map((r, i) => ({ mom_id: id, no: i + 1, aspek: r.aspek, capaian: r.capaian || null, target: r.target || null, status: r.status || null }));
      if (puRows.length) { const { error } = await supabase.from('mom_progress_updates').insert(puRows); if (error) throw error; }

      const issRows = sectionC.filter(r => r.issue.trim()).map((r, i) => ({ mom_id: id, no: i + 1, issue: r.issue, dampak: r.dampak || null, akar_masalah: r.akar_masalah || null }));
      if (issRows.length) { const { error } = await supabase.from('mom_issues').insert(issRows); if (error) throw error; }

      const impRows = sectionD.filter(r => r.usulan.trim()).map((r, i) => ({ mom_id: id, no: i + 1, usulan: r.usulan, catatan: r.catatan || null }));
      if (impRows.length) { const { error } = await supabase.from('mom_improvements').insert(impRows); if (error) throw error; }

      logAudit(supabase, {
        action: isEdit ? ACTION_TYPES.UPDATE_MOM : ACTION_TYPES.CREATE_MOM,
        entityType: ENTITY_TYPES.MOM, entityId: id, entityLabel: momNo,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });

      if (submit) await notifyCEO(id, momNo);
      showToast?.(submit ? 'MOM disubmit untuk approval ✨' : 'Draft MOM tersimpan ✨');
      onBack();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
      <Btn variant="ghost" onClick={onBack} Icon={ChevronLeft}>Batal</Btn>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={() => persist(false)} disabled={saving} Icon={Save}>{saving ? 'Menyimpan…' : 'Simpan Draft'}</Btn>
        <Btn variant="primary" onClick={() => persist(true)} disabled={saving} Icon={Send}>{saving ? 'Menyimpan…' : 'Submit untuk Approval'}</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.page, padding: '8px 8px 40px', borderRadius: 16, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <datalist id={PIC_LIST_ID}>{picNames.map(n => <option key={n} value={n} />)}</datalist>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* title card */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 28px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 26, fontWeight: 800, color: C.text, margin: 0, letterSpacing: -0.5 }}>{isEdit ? 'Edit Minutes of Meeting' : 'Buat Minutes of Meeting'}</h1>
            <p style={{ fontSize: 14, color: C.sub, margin: '6px 0 0' }}>Dokumentasi meeting resmi MSI Group</p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.navy, color: '#fff', padding: '9px 16px', borderRadius: 999, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{isEdit ? (editNo || '—') : 'MOM/—/—/—'}</span>
        </div>

        {error && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '14px 20px', marginBottom: 20, color: C.red, fontWeight: 600, fontSize: 14 }}>{error}</div>}

        {/* SECTION 00 */}
        <Section badge="00" title="Informasi Meeting" subtitle="Data dasar meeting">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
            <div><Label required>Jenis Meeting</Label><Select value={header.mom_type} onChange={v => setH('mom_type', v)} options={MOM_TYPES} placeholder="— Pilih jenis meeting —" /></div>
            <div><Label required>Divisi</Label><Input value={header.divisi} onChange={v => setH('divisi', v)} placeholder="cth: IT Development & Support" /></div>
            <div><Label required>Tanggal Meeting</Label><Input type="date" value={header.meeting_date} onChange={v => setH('meeting_date', v)} /></div>
            <div><Label>Waktu</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Input type="time" value={header.time_start} onChange={v => setH('time_start', v)} />
                <span style={{ color: C.muted, fontWeight: 600, flexShrink: 0 }}>–</span>
                <Input type="time" value={header.time_end} onChange={v => setH('time_end', v)} />
              </div>
            </div>
            <div><Label required>Pemimpin Meeting</Label><Input value={header.pemimpin} onChange={v => setH('pemimpin', v)} placeholder="Nama pemimpin meeting" /></div>
            <div><Label>Notulis</Label><Input value={notulisName} readOnly /></div>
            <div style={{ gridColumn: '1 / -1' }}><Label>Lokasi / Media</Label><Input value={header.lokasi} onChange={v => setH('lokasi', v)} placeholder="cth: Office BSD Lt. 3 / Google Meet / Zoom" /></div>
            <div style={{ gridColumn: '1 / -1' }}><Label>Peserta</Label><TagInput tags={header.peserta} onChange={v => setH('peserta', v)} /><div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Ketik nama lalu tekan Enter untuk menambah</div></div>
          </div>
        </Section>

        <Section badge="A" title="Review Action Plan" subtitle="Evaluasi action plan dari meeting sebelumnya">
          <DynTable picListId={PIC_LIST_ID}
            cols={[
              { key: 'action_plan', label: 'Action Plan', min: 220, placeholder: 'Deskripsi action plan…' },
              { key: 'pic', label: 'PIC', min: 150, type: 'pic' },
              { key: 'timeline', label: 'Target', min: 150, type: 'date' },
              { key: 'status', label: 'Status', min: 170, type: 'select', options: STATUS_OPTS },
            ]}
            rows={sectionA} onAdd={() => setSectionA(r => [...r, emptyAP()])} onDelete={delRow(setSectionA)} onEdit={editRow(setSectionA)}
            emptyText="Belum ada action plan review. Klik Tambah Baris." />
        </Section>

        <Section badge="B" title="Weekly Progress Update" subtitle="Capaian vs target minggu ini">
          <DynTable
            cols={[
              { key: 'aspek', label: 'Aspek / Aktivitas', min: 200, placeholder: 'Nama aspek/aktivitas…' },
              { key: 'capaian', label: 'Capaian Minggu Ini', min: 180, placeholder: 'Capaian aktual…' },
              { key: 'target', label: 'Target', min: 150, placeholder: 'Target…' },
              { key: 'status', label: 'Status', min: 170, type: 'select', options: STATUS_OPTS },
            ]}
            rows={sectionB} onAdd={() => setSectionB(r => [...r, emptyPU()])} onDelete={delRow(setSectionB)} onEdit={editRow(setSectionB)}
            emptyText="Belum ada progress update." />
        </Section>

        <Section badge="C" title="Highlight Issue & Bottleneck" subtitle="Identifikasi masalah dan akar penyebab">
          <DynTable
            cols={[
              { key: 'issue', label: 'Issue / Bottleneck', min: 200, placeholder: 'Deskripsi issue…' },
              { key: 'dampak', label: 'Dampak', min: 180, placeholder: 'Dampak…' },
              { key: 'akar_masalah', label: 'Akar Masalah', min: 180, placeholder: 'Penyebab utama…' },
            ]}
            rows={sectionC} onAdd={() => setSectionC(r => [...r, emptyISS()])} onDelete={delRow(setSectionC)} onEdit={editRow(setSectionC)}
            emptyText="Belum ada issue yang dicatat." />
        </Section>

        <Section badge="D" title="Improvement Plan / SOP Review" subtitle="Usulan perbaikan dan rencana improvement">
          <DynTable
            cols={[
              { key: 'usulan', label: 'Usulan Perbaikan / SOP', min: 280, placeholder: 'Deskripsi usulan…' },
              { key: 'catatan', label: 'Catatan', min: 200, placeholder: 'Catatan tambahan…' },
            ]}
            rows={sectionD} onAdd={() => setSectionD(r => [...r, emptyIMP()])} onDelete={delRow(setSectionD)} onEdit={editRow(setSectionD)}
            emptyText="Belum ada usulan improvement." />
        </Section>

        <div ref={sectionFRef}>
          <Section badge="F" title="Action Plan Baru" subtitle="Wajib diisi minimal 1 item sebelum menyimpan" required>
            <DynTable picListId={PIC_LIST_ID}
              cols={[
                { key: 'action_plan', label: 'Action Plan', min: 220, placeholder: 'Deskripsi action plan baru…' },
                { key: 'pic', label: 'PIC', min: 150, type: 'pic' },
                { key: 'timeline', label: 'Timeline', min: 150, type: 'date' },
                { key: 'prioritas', label: 'Prioritas', min: 130, type: 'select', options: PRIORITAS_OPTS },
                { key: 'status', label: 'Status', min: 170, type: 'select', options: STATUS_OPTS },
              ]}
              rows={sectionF} onAdd={() => setSectionF(r => [...r, emptyAP()])} onDelete={delRow(setSectionF)} onEdit={editRow(setSectionF)}
              emptyText="Tambahkan minimal 1 action plan baru." />
          </Section>
        </div>

        <Section badge="G" title="Catatan Tambahan & Pengesahan">
          <div style={{ marginBottom: 24 }}><Label>Catatan</Label><Textarea value={catatan} onChange={setCatatan} rows={5} placeholder="Catatan, kesimpulan, atau keputusan penting dari meeting ini…" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {[{ label: 'Disusun Oleh', name: notulisName || '—', role: 'Notulis', note: null }, { label: 'Disetujui Oleh', name: 'Pak Adam', role: 'CEO', note: 'Menunggu approval…' }].map((s, i) => (
              <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px 16px', position: 'relative' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{s.role}</div>
                {s.note && <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginTop: 8 }}>{s.note}</div>}
              </div>
            ))}
          </div>
        </Section>

        {footer}
      </div>
    </div>
  );
}

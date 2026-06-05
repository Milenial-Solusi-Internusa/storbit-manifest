// src/modules/hrga/pages/BuatRequestPage.jsx
// HRGA Request — Buat Request — 3-step form.
// Design: hrga-buat.html
// Step 1: category/type card picker
// Step 2: split form + sticky summary
// Step 3: review + approval stepper + confirm + submit

import { useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft, ArrowRight, Check, X, Plus, Trash2, Upload,
  Tag, Clock, User, FileText, Inbox, Send, ChevronRight,
  Briefcase,
} from 'lucide-react';
import {
  D, Card, TypePill, Btn, Banner, CATEGORY_CONFIG,
  fmtDate, fmtRupiah, daysUntil,
} from '../HrgaShared';
import {
  useHrgaRequestTypes, submitHrgaRequest,
} from '../../../hooks/useHrgaRequests';
import { useAuth } from '../../../contexts/useAuth';

// ─────────────────────────────────────────────────────────────
// Step 1 — Category/Type card picker
// ─────────────────────────────────────────────────────────────
function Step1({ types, selectedTypeId, onSelect }) {
  // Group types by category_code
  const grouped = useMemo(() => {
    const m = {};
    types.forEach(t => {
      if (!m[t.category_code]) m[t.category_code] = [];
      m[t.category_code].push(t);
    });
    return m;
  }, [types]);

  return (
    <Card>
      <div style={{ padding:'14px 18px', borderBottom:`1px solid ${D.lineSoft}` }}>
        <div style={{ fontWeight:700, fontSize:14 }}>Pilih Tipe Request</div>
        <div style={{ fontSize:13, color:D.inkSoft, marginTop:3 }}>Pilih kategori permintaan yang sesuai kebutuhanmu</div>
      </div>
      <div style={{ padding:18 }}>
        {Object.entries(grouped).map(([catCode, catTypes]) => {
          const cfg = CATEGORY_CONFIG[catCode] || {};
          const Icon = cfg.icon || Tag;
          return (
            <div key={catCode} style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div style={{ width:26, height:26, borderRadius:7, background:cfg.bg||D.neutralBg,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon size={14} color={cfg.color||D.neutral} strokeWidth={1.8} />
                </div>
                <span style={{ fontSize:12, fontWeight:700, textTransform:'uppercase',
                  letterSpacing:'.5px', color:D.inkFaint }}>{cfg.label || catCode}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
                {catTypes.map(t => {
                  const sel = selectedTypeId === t.id;
                  return (
                    <button key={t.id} onClick={() => onSelect(t)}
                      style={{ textAlign:'left', cursor:'pointer', padding:'14px 16px', borderRadius:10,
                        border:`2px solid ${sel ? D.accent : D.line}`,
                        background: sel ? D.accentSoft : D.surface,
                        position:'relative', transition:'border-color .12s, background .12s',
                        fontFamily:'inherit' }}>
                      {sel && (
                        <span style={{ position:'absolute', top:10, right:10, width:18, height:18,
                          borderRadius:'50%', background:D.accent, color:'#fff',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Check size={11} strokeWidth={2.5} />
                        </span>
                      )}
                      <div style={{ fontWeight:700, fontSize:13.5, color:D.ink, marginBottom:4 }}>
                        {t.type_name}
                      </div>
                      <div style={{ fontSize:12, color:D.inkSoft, lineHeight:1.4, marginBottom:8 }}>
                        {t.description || cfg.label}
                      </div>
                      <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:10.5,
                        fontWeight:500, color:D.inkFaint, background:D.bgAlt,
                        borderRadius:20, padding:'2px 10px' }}>
                        Respon {t.approval_levels || 1}×24 jam
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {types.length === 0 && (
          <div style={{ textAlign:'center', color:D.inkFaint, fontSize:13, padding:'2rem 0' }}>
            Memuat tipe request…
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// ATK dynamic item rows
// ─────────────────────────────────────────────────────────────
function ATKItems({ items, onChange }) {
  const addItem = () => onChange([...items, { name:'', qty:1, unit:'Pcs', price:'' }]);
  const rmItem  = (i) => onChange(items.length > 1 ? items.filter((_,idx) => idx !== i) : items);
  const setItem = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };
  const total = items.reduce((s, it) => s + (parseInt(it.qty)||0) * (parseInt(String(it.price).replace(/\D/g,''))||0), 0);

  return (
    <div style={{ marginTop:4 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 72px 88px 1fr 32px', gap:8, marginBottom:6,
        fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.4px', color:D.inkFaint }}>
        <span>Nama Item</span><span>Qty</span><span>Satuan</span><span>Est. Harga</span><span/>
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 72px 88px 1fr 32px', gap:8, marginBottom:8, alignItems:'center' }}>
          <input value={it.name} onChange={e => setItem(i,'name',e.target.value)}
            placeholder="cth: Kertas A4 80gr"
            style={{ height:36, borderRadius:7, border:`1px solid ${D.line}`, padding:'0 9px',
              fontSize:13, fontFamily:'inherit', color:D.ink, background:D.surface, outline:'none' }} />
          <input type="number" min="1" value={it.qty} onChange={e => setItem(i,'qty',e.target.value)}
            style={{ height:36, borderRadius:7, border:`1px solid ${D.line}`, padding:'0 9px',
              fontSize:13, fontFamily:'inherit', color:D.ink, background:D.surface, outline:'none' }} />
          <select value={it.unit} onChange={e => setItem(i,'unit',e.target.value)}
            style={{ height:36, borderRadius:7, border:`1px solid ${D.line}`, padding:'0 9px',
              fontSize:13, fontFamily:'inherit', color:D.ink, background:D.surface, outline:'none' }}>
            {['Pcs','Rim','Box','Pack','Unit','Lusin'].map(s => <option key={s}>{s}</option>)}
          </select>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)',
              fontSize:12.5, fontWeight:600, color:D.inkFaint }}>Rp</span>
            <input value={it.price} onChange={e => setItem(i,'price',e.target.value)}
              placeholder="0"
              style={{ width:'100%', height:36, borderRadius:7, border:`1px solid ${D.line}`,
                padding:'0 9px 0 28px', fontSize:13, fontFamily:"'IBM Plex Mono', monospace",
                color:D.ink, background:D.surface, outline:'none', boxSizing:'border-box' }} />
          </div>
          <button onClick={() => rmItem(i)}
            style={{ width:32, height:32, borderRadius:7, border:`1px solid ${D.line}`,
              background:D.surface, cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', color:D.inkFaint }}
            onMouseEnter={e => { e.currentTarget.style.background=D.dangerBg; e.currentTarget.style.color=D.danger; e.currentTarget.style.borderColor=D.dangerBd; }}
            onMouseLeave={e => { e.currentTarget.style.background=D.surface; e.currentTarget.style.color=D.inkFaint; e.currentTarget.style.borderColor=D.line; }}>
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        </div>
      ))}
      <button onClick={addItem}
        style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 12px',
          borderRadius:8, border:`1px solid ${D.line}`, background:D.surface, cursor:'pointer',
          fontSize:12.5, fontWeight:600, color:D.inkSoft, fontFamily:'inherit', marginTop:4 }}>
        <Plus size={13} strokeWidth={2} />Tambah Item
      </button>
      {total > 0 && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          marginTop:12, padding:'11px 14px', borderRadius:9, background:D.accentSoft,
          border:`1px solid ${D.okBd}` }}>
          <span style={{ fontSize:12.5, fontWeight:700, color:D.accentInk }}>Total Estimasi</span>
          <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:15, fontWeight:600, color:D.accentInk }}>
            {fmtRupiah(total)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2 — Form
// ─────────────────────────────────────────────────────────────
function Step2({ selectedType, form, setForm, profile }) {
  const catCode = selectedType?.category_code;
  const isATK   = selectedType?.type_code?.startsWith('AST_ATK') || catCode === 'AST';
  const days    = daysUntil(form.needed_date);
  const tooSoon = days !== null && days < 3;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:20, alignItems:'start' }}>
      {/* Form */}
      <Card style={{ padding:18 }}>
        {/* Info Dasar */}
        <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, marginBottom:14 }}>
          Informasi Dasar
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:12.5, fontWeight:600, color:D.inkSoft, display:'block', marginBottom:4 }}>
              Department <span style={{ color:D.danger }}>*</span>
            </label>
            <select value={form.department} onChange={e => setForm(f => ({...f, department:e.target.value}))}
              style={{ width:'100%', height:38, borderRadius:8, border:`1px solid ${D.line}`,
                padding:'0 10px', fontSize:13, fontFamily:'inherit', color:D.ink, background:D.surface, outline:'none' }}>
              {['Finance','Logistik','HRD','IT','Operasional','Sales','Procurement'].map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:12.5, fontWeight:600, color:D.inkSoft, display:'block', marginBottom:4 }}>
              Diajukan Oleh
            </label>
            <input disabled value={profile?.full_name || 'User'} style={{ width:'100%', height:38, borderRadius:8,
              border:`1px solid ${D.line}`, padding:'0 10px', fontSize:13, fontFamily:'inherit',
              color:D.inkSoft, background:D.bgAlt, opacity:.8, boxSizing:'border-box' }} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <label style={{ fontSize:12.5, fontWeight:600, color:D.inkSoft }}>
                Keperluan / Tujuan <span style={{ color:D.danger }}>*</span>
              </label>
              <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:11, color:D.inkFaint }}>
                {form.subject.length}/500
              </span>
            </div>
            <textarea value={form.subject} onChange={e => setForm(f => ({...f, subject:e.target.value.slice(0,500)}))}
              maxLength={500} rows={3} placeholder="Jelaskan kebutuhan dan tujuan permintaan…"
              style={{ width:'100%', borderRadius:8, border:`1px solid ${D.line}`,
                padding:'8px 10px', fontSize:13, fontFamily:'inherit', color:D.ink,
                background:D.surface, resize:'vertical', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor=D.accent}
              onBlur={e => e.target.style.borderColor=D.line} />
          </div>
        </div>

        {/* Type-specific fields */}
        {isATK && (
          <>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, margin:'18px 0 12px' }}>
              Detail Permintaan — {selectedType.type_name}
            </div>
            <ATKItems items={form.items}
              onChange={items => setForm(f => ({...f, items}))} />
          </>
        )}
        {!isATK && form.description !== undefined && (
          <>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, margin:'18px 0 12px' }}>
              Keterangan Detail
            </div>
            <textarea value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))}
              rows={4} placeholder="Jelaskan detail permintaan…"
              style={{ width:'100%', borderRadius:8, border:`1px solid ${D.line}`,
                padding:'8px 10px', fontSize:13, fontFamily:'inherit', color:D.ink,
                background:D.surface, resize:'vertical', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor=D.accent}
              onBlur={e => e.target.style.borderColor=D.line} />
          </>
        )}

        {/* Waktu & Prioritas */}
        <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, margin:'18px 0 12px' }}>
          Waktu &amp; Prioritas
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ fontSize:12.5, fontWeight:600, color:D.inkSoft, display:'block', marginBottom:4 }}>
              Tgl Dibutuhkan <span style={{ color:D.danger }}>*</span>
            </label>
            <input type="date" value={form.needed_date}
              onChange={e => setForm(f => ({...f, needed_date:e.target.value}))}
              style={{ width:'100%', height:38, borderRadius:8, border:`1px solid ${tooSoon?D.warnBd:D.line}`,
                padding:'0 10px', fontSize:13, fontFamily:'inherit', color:D.ink, background:D.surface,
                outline:'none', boxSizing:'border-box' }} />
            {tooSoon && (
              <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:6, fontSize:12, color:D.warn }}>
                <span>Permintaan mendadak, mohon koordinasi langsung dengan tim HRGA.</span>
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize:12.5, fontWeight:600, color:D.inkSoft, display:'block', marginBottom:4 }}>Prioritas</label>
            <div style={{ display:'flex', gap:8 }}>
              {['Normal','Urgent','Critical'].map(p => (
                <label key={p} style={{ cursor:'pointer' }}>
                  <input type="radio" name="priority" value={p}
                    checked={form.priority === p}
                    onChange={() => setForm(f => ({...f, priority:p}))}
                    style={{ position:'absolute', opacity:0, width:0, height:0 }} />
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, height:36, padding:'0 12px',
                    borderRadius:8, border:`1px solid ${form.priority===p?(p==='Normal'?D.accent:p==='Urgent'?D.warnBd:D.dangerBd):D.line}`,
                    background:form.priority===p?(p==='Normal'?D.accentSoft:p==='Urgent'?D.warnBg:D.dangerBg):D.surface,
                    fontSize:13, fontWeight:600, color:form.priority===p?(p==='Normal'?D.accentInk:p==='Urgent'?D.warn:D.danger):D.inkSoft,
                    transition:'.1s', userSelect:'none' }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:'currentColor', opacity:.6 }} />
                    {p}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, margin:'18px 0 12px' }}>
          Lampiran
        </div>
        <div style={{ border:`2px dashed ${D.line}`, borderRadius:10, padding:'20px',
          textAlign:'center', background:D.surface2, cursor:'pointer' }}
          onMouseEnter={e => e.currentTarget.style.borderColor=D.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor=D.line}>
          <Upload size={22} color={D.inkFaint} style={{ margin:'0 auto 8px' }} />
          <div style={{ fontWeight:700, fontSize:13, color:D.ink, marginBottom:3 }}>Tarik &amp; lepas file, atau klik untuk memilih</div>
          <div style={{ fontSize:12, color:D.inkFaint }}>PDF / JPG / PNG / XLSX · maks 5 file × 10 MB</div>
        </div>
      </Card>

      {/* Summary sidebar */}
      <div style={{ position:'sticky', top:78, border:`1px solid ${D.okBd}`, borderRadius:12,
        background:D.surface2, overflow:'hidden' }}>
        <div style={{ padding:'13px 16px', borderBottom:`1px solid ${D.lineSoft}`,
          display:'flex', alignItems:'center', gap:8, fontWeight:700, fontSize:13.5 }}>
          <Inbox size={16} color={D.accent} strokeWidth={1.8} />
          Ringkasan Request
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
          {[
            ['Tipe',        <TypePill key="t" categoryCode={selectedType?.category_code} typeName={selectedType?.type_name} />],
            ['Department',  form.department],
            ['Keperluan',   form.subject ? (form.subject.length > 50 ? form.subject.slice(0,50)+'…' : form.subject) : '—'],
            ['Tgl Dibutuhkan', form.needed_date ? fmtDate(form.needed_date) : '—'],
            ['Prioritas',   form.priority],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12.5 }}>
              <span style={{ color:D.inkFaint, fontWeight:600, flexShrink:0 }}>{k}</span>
              <span style={{ fontWeight:600, textAlign:'right', color:D.ink }}>{v}</span>
            </div>
          ))}
          {isATK && form.items.length > 0 && (() => {
            const total = form.items.reduce((s,it) => s+(parseInt(it.qty)||0)*(parseInt(String(it.price).replace(/\D/g,''))||0),0);
            return total > 0 ? (
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12.5 }}>
                <span style={{ color:D.inkFaint, fontWeight:600 }}>Total Estimasi</span>
                <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontWeight:700, color:D.accentInk }}>
                  {fmtRupiah(total)}
                </span>
              </div>
            ) : null;
          })()}
        </div>
        <div style={{ margin:'0 14px 14px', padding:'11px 13px', borderRadius:9,
          background:D.accentSoft, fontSize:11.5, color:D.accentInk, lineHeight:1.4,
          display:'flex', gap:8 }}>
          <Clock size={15} style={{ flexShrink:0, marginTop:1 }} />
          <span>
            Akan diproses dalam {selectedType?.approval_levels||1}×24 jam.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 3 — Review & Submit
// ─────────────────────────────────────────────────────────────
function Step3({ selectedType, form, confirmed, setConfirmed }) {
  const isATK = selectedType?.type_code?.startsWith('AST_ATK') || selectedType?.category_code === 'AST';
  const total = isATK ? form.items.reduce((s,it) => s+(parseInt(it.qty)||0)*(parseInt(String(it.price).replace(/\D/g,''))||0),0) : 0;

  return (
    <div>
      <Banner tone="ok" icon={Check}>
        Semua field wajib telah terisi. Periksa ringkasan di bawah sebelum mengirim.
      </Banner>
      <Card style={{ marginBottom:14 }}>
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${D.lineSoft}` }}>
          <div style={{ fontWeight:700, fontSize:14 }}>Periksa kembali sebelum mengirim</div>
          <div style={{ fontSize:13, color:D.inkSoft, marginTop:2 }}>
            Pastikan semua informasi sudah benar. Request yang sudah dikirim tidak dapat diubah.
          </div>
        </div>
        <div style={{ padding:18 }}>
          {/* Tipe */}
          <div style={{ padding:'12px 0', borderBottom:`1px solid ${D.lineSoft}` }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, marginBottom:10 }}>
              Tipe Request
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <TypePill categoryCode={selectedType?.category_code} typeName={selectedType?.type_name} />
              <b style={{ fontSize:14 }}>{selectedType?.type_name}</b>
            </div>
          </div>
          {/* Keperluan */}
          <div style={{ padding:'12px 0', borderBottom:`1px solid ${D.lineSoft}` }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, marginBottom:8 }}>Keperluan</div>
            <div style={{ fontSize:13.5, lineHeight:1.5 }}>{form.subject || '—'}</div>
          </div>
          {/* Items */}
          {isATK && form.items.length > 0 && (
            <div style={{ padding:'12px 0', borderBottom:`1px solid ${D.lineSoft}` }}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, marginBottom:8 }}>Detail Item ATK</div>
              {form.items.filter(it => it.name).map((it, i) => {
                const price = parseInt(String(it.price).replace(/\D/g,''))||0;
                return (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'160px 1fr', padding:'6px 0',
                    borderBottom:`1px solid ${D.lineSoft}`, gap:12 }}>
                    <dt style={{ fontSize:12.5, color:D.inkFaint, fontWeight:600 }}>{it.name || 'Item'}</dt>
                    <dd style={{ margin:0, fontSize:13, fontFamily:"'IBM Plex Mono', monospace", fontWeight:500, color:D.ink }}>
                      {it.qty} {it.unit} · {fmtRupiah(price)}
                    </dd>
                  </div>
                );
              })}
              {total > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', padding:'9px 0 9px',
                  background:D.accentSoft, borderRadius:6, marginTop:6, gap:12, paddingLeft:8 }}>
                  <dt style={{ fontSize:12.5, color:D.accentInk, fontWeight:700 }}>Total Estimasi</dt>
                  <dd style={{ margin:0, fontSize:15, color:D.accentInk, fontFamily:"'IBM Plex Mono', monospace", fontWeight:700 }}>
                    {fmtRupiah(total)}
                  </dd>
                </div>
              )}
            </div>
          )}
          {/* Waktu */}
          <div style={{ padding:'12px 0', borderBottom:`1px solid ${D.lineSoft}` }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, marginBottom:8 }}>Waktu</div>
            <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:12 }}>
              <span style={{ fontSize:12.5, color:D.inkFaint, fontWeight:600 }}>Tgl Dibutuhkan</span>
              <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:13 }}>{form.needed_date ? fmtDate(form.needed_date) : '—'}</span>
              <span style={{ fontSize:12.5, color:D.inkFaint, fontWeight:600 }}>Prioritas</span>
              <span style={{ fontSize:13 }}>{form.priority}</span>
            </div>
          </div>
          {/* Approval flow mini */}
          <div style={{ padding:'12px 0 0' }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:D.inkFaint, marginBottom:12 }}>Proses Approval</div>
            <div style={{ display:'flex', alignItems:'center', gap:0, flexWrap:'wrap' }}>
              {[
                { icon: User, label:'Kamu', sub:'Pengaju', cur:true },
                null,
                { icon: Briefcase, label:'Approver L1', sub:'Level 1', cur:false },
                null,
                { icon: Briefcase, label:'HRGA Team', sub:'Pelaksana', cur:false },
                null,
                { icon: Check, label:'Selesai', sub:'Done', cur:false },
              ].map((node, i) => {
                if (!node) return (
                  <div key={i} style={{ flex:1, minWidth:24, height:2, background:D.line, margin:'0 6px', marginBottom:24 }} />
                );
                const Icon = node.icon;
                return (
                  <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7, textAlign:'center' }}>
                    <div style={{ width:42, height:42, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                      border:`1.5px solid ${node.cur?D.accent:D.line}`,
                      background:node.cur?D.accentSoft:D.surface, color:node.cur?D.accent:D.inkFaint,
                      boxShadow:node.cur?`0 0 0 3px rgba(47,107,63,.1)`:undefined }}>
                      <Icon size={19} strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize:11.5, fontWeight:700 }}>{node.label}</div>
                    <div style={{ fontSize:10.5, color:D.inkFaint }}>{node.sub}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Confirm checkbox */}
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, marginTop:18, cursor:'pointer' }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              style={{ width:16, height:16, marginTop:2, cursor:'pointer', accentColor:D.accent, flexShrink:0 }} />
            <span style={{ fontSize:13, color:D.ink, lineHeight:1.5 }}>
              Saya menyatakan bahwa informasi di atas benar dan dapat dipertanggungjawabkan.
            </span>
          </label>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Success state
// ─────────────────────────────────────────────────────────────
function SuccessState({ documentNo, onViewDetail, onNewRequest }) {
  return (
    <Card style={{ padding:'3rem', textAlign:'center' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', background:D.okBg, border:`4px solid ${D.okBd}`,
        display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px' }}>
        <Check size={32} color={D.ok} strokeWidth={2.5} />
      </div>
      <h2 style={{ fontSize:20, fontWeight:800, color:D.ink, margin:'0 0 8px' }}>Request Berhasil Dikirim!</h2>
      <p style={{ fontSize:13.5, color:D.inkSoft, margin:'0 0 20px', lineHeight:1.55 }}>
        Tim HRGA akan memproses permintaanmu. Kamu akan menerima notifikasi setiap update status.
      </p>
      <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:18, fontWeight:700,
        color:D.accent, background:D.accentSoft, borderRadius:9, padding:'11px 20px',
        display:'inline-block', marginBottom:24 }}>
        {documentNo}
      </div>
      <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
        <Btn primary icon={FileText} onClick={onViewDetail}>Lihat Detail Request</Btn>
        <Btn icon={Plus} onClick={onNewRequest}>Buat Request Baru</Btn>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function BuatRequestPage({ onSuccess }) {
  const { profile }              = useAuth();
  const [step,         setStep]  = useState(1);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm]          = useState({
    subject:     '',
    description: '',
    department:  'Finance',
    needed_date: '',
    priority:    'Normal',
    items:       [{ name:'', qty:1, unit:'Pcs', price:'' }],
  });
  const [confirmed, setConfirmed] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(null); // { documentNo, requestId }
  const [submitErr, setSubmitErr] = useState(null);

  const { data: types } = useHrgaRequestTypes(profile?.company_id);

  const canGoNext = step === 1 ? !!selectedType
    : step === 2 ? !!form.subject && !!form.needed_date
    : confirmed;

  const handleNext = useCallback(async () => {
    if (step < 3) {
      setStep(s => s + 1);
      return;
    }
    // Step 3: Submit
    setSaving(true);
    setSubmitErr(null);

    const isATK = selectedType?.type_code?.startsWith('AST_ATK') || selectedType?.category_code === 'AST';
    const items  = isATK
      ? form.items
          .filter(it => it.name)
          .map((it) => ({
            item_description: it.name,
            quantity:         parseInt(it.qty) || 1,
            unit:             it.unit || 'Pcs',
            notes:            it.price ? `Est. Rp ${it.price}` : null,
          }))
      : [];

    const { data: result, error: err } = await submitHrgaRequest({
      requestTypeId: selectedType.id,
      subject:       form.subject,
      description:   form.description,
      requestedDate: form.needed_date,
      items,
      profile,
    });

    setSaving(false);
    if (err) { setSubmitErr(err.message); return; }
    setSaved({ documentNo: result.document_no, requestId: result.id });
  }, [step, selectedType, form, profile]);

  if (saved) {
    return (
      <div style={{ fontFamily:"'Inter', system-ui, sans-serif", color:D.ink }}>
        <SuccessState
          documentNo={saved.documentNo}
          onViewDetail={() => onSuccess?.(saved.requestId)}
          onNewRequest={() => { setSaved(null); setStep(1); setSelectedType(null); setConfirmed(false); }}
        />
      </div>
    );
  }

  const stepLabels = ['Pilih Tipe', 'Isi Detail', 'Review & Kirim'];

  return (
    <div style={{ fontFamily:"'Inter', system-ui, sans-serif", color:D.ink }}>
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        <div>
          <nav style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:D.inkFaint, marginBottom:8 }}>
            <span>Home</span><ChevronRight size={12} />
            <span>HRGA Request</span><ChevronRight size={12} />
            <span style={{ color:D.inkSoft, fontWeight:600 }}>Buat Request</span>
          </nav>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.4px', margin:0 }}>Buat Request</h1>
          <div style={{ fontSize:13.5, color:D.inkSoft, marginTop:4 }}>Ajukan permintaan layanan ke tim HRGA</div>
        </div>
        <Btn icon={X} onClick={() => window.history.back()}>Batal</Btn>
      </div>

      {/* Stepper */}
      <div style={{ display:'flex', alignItems:'center', gap:0, maxWidth:640, marginBottom:24 }}>
        {stepLabels.map((label, i) => {
          const n = i + 1;
          const isDone   = n < step;
          const isActive = n === step;
          return (
            <div key={n} style={{ display:'flex', alignItems:'center', flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                  background:isDone?D.accent:isActive?D.accentSoft:D.bgAlt,
                  border:`2px solid ${isDone?D.accent:isActive?D.accent:D.neutralBd}`,
                  color:isDone?'#fff':isActive?D.accent:D.neutral,
                  fontSize:13, fontWeight:700 }}>
                  {isDone ? <Check size={15} strokeWidth={2.5} /> : n}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:isActive?D.ink:D.inkFaint }}>{label}</div>
                  <div style={{ fontSize:11, color:D.inkFaint }}>
                    {['Kategori request','Lengkapi data','Periksa & ajukan'][i]}
                  </div>
                </div>
              </div>
              {i < stepLabels.length - 1 && (
                <div style={{ flex:1, height:2, background:isDone?D.accent:D.lineSoft, margin:'0 10px' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === 1 && <Step1 types={types} selectedTypeId={selectedType?.id} onSelect={setSelectedType} />}
      {step === 2 && <Step2 selectedType={selectedType} form={form} setForm={setForm} profile={profile} />}
      {step === 3 && <Step3 selectedType={selectedType} form={form} confirmed={confirmed} setConfirmed={setConfirmed} />}

      {submitErr && (
        <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, background:D.dangerBg, color:D.danger, fontSize:13 }}>
          Gagal mengirim: {submitErr}
        </div>
      )}

      {/* Footer navigation */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:20,
        padding:'14px 0', borderTop:`1px solid ${D.lineSoft}` }}>
        <button onClick={() => setStep(s => Math.max(1, s-1))} disabled={step === 1}
          style={{ display:'inline-flex', alignItems:'center', gap:7, height:38, padding:'0 16px',
            borderRadius:8, border:`1px solid ${D.line}`, background:D.surface, cursor:step===1?'not-allowed':'pointer',
            fontSize:13, fontWeight:600, color:D.inkSoft, opacity:step===1?.4:1, fontFamily:'inherit' }}>
          <ArrowLeft size={14} strokeWidth={1.8} />Kembali
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:12.5, color:D.inkFaint }}>Langkah {step} dari 3</span>
          <Btn primary icon={step === 3 ? Send : ArrowRight} onClick={handleNext} disabled={!canGoNext || saving}>
            {saving ? 'Mengirim…' : step === 3 ? 'Kirim Request' : step === 2 ? 'Lanjut Review' : 'Lanjut'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// src/modules/crm/lead/components/ImportLeadsModal.jsx
// "Import Leads" -- design-handoff/mockup/Lead Management.dc.html,
// Modal/ImportLeads (rujukan PNG lama design-handoff/crm-2026-10-11/ sudah
// basi, folder itu sudah dihapus total -- lihat 08_TECH_DEBT.md TD-318
// "Akar masalah"). 4 langkah: Upload File / Column Mapping / Defaults and
// Preview / sukses.
// Beda dari mockup (instruksi eksplisit, BUKAN ada di Lead Management.dc.html):
// baris yang mirip akun existing (check_similar_accounts) ditandai di
// pratinjau step 3, defaultnya DILEWATI (include=false), user boleh
// mencentangnya balik untuk tetap memasukkan.
import { useEffect, useMemo, useState } from 'react';
import { Upload, Check, AlertTriangle, FileText, X } from 'lucide-react';
import { Modal, FloatingSelect, SaveButton, OutlineBtn, PrimaryBtn } from '../../../../kit';
import { INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, SEMANTIC, FONT_BODY, FONT_HEAD, FONT_MONO, RADIUS, SP } from '../../../../kit/tokens';
import Pager from './Pager';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { SOURCES, SOURCE_LABELS } from '../lib/leadOptions';
import { NEXUS_FIELDS, autoMatchColumns, parseLeadImportFile, buildPreviewRows, downloadLeadImportTemplate } from '../lib/leadImport';

const PREVIEW_PAGE_SIZE = 5;

const Step = ({ n, label, state }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{
      width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11.5, fontWeight: 700, fontFamily: FONT_HEAD, flex: '0 0 22px',
      background: state === 'done' ? SEMANTIC.ok.bg : state === 'active' ? INK : HEAD_BG,
      color: state === 'done' ? SEMANTIC.ok.fg : state === 'active' ? '#fff' : INK_SOFT,
      border: state === 'todo' ? `1px solid ${LINE}` : 'none',
    }}>
      {state === 'done' ? <Check size={13} /> : n}
    </span>
    <span style={{ fontSize: 13, fontWeight: state === 'active' ? 700 : 500, color: state === 'todo' ? INK_SOFT : INK, fontFamily: FONT_BODY }}>{label}</span>
  </div>
);

function Stepper({ step }) {
  const of = (n) => (step > n ? 'done' : step === n ? 'active' : 'todo');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3, marginBottom: SP.s4 }}>
      <Step n={1} label="Upload File" state={of(1)} />
      <div style={{ flex: '0 0 32px', height: 1, background: LINE }} />
      <Step n={2} label="Column Mapping" state={of(2)} />
      <div style={{ flex: '0 0 32px', height: 1, background: LINE }} />
      <Step n={3} label="Defaults and Preview" state={of(3)} />
    </div>
  );
}

export default function ImportLeadsModal({ open, onClose, onImported, showToast }) {
  const { profile, erpRoles } = useAuth();
  const isAllEntities = isAllEntitiesRole(erpRoles);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState({ headers: [], rows: [] });
  const [mapping, setMapping] = useState({});
  const [defaultSource, setDefaultSource] = useState('');
  const [defaultCompanyId, setDefaultCompanyId] = useState('');
  const [defaultOwner, setDefaultOwner] = useState('');
  const [owners, setOwners] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewPage, setPreviewPage] = useState(0);
  const [similarByRow, setSimilarByRow] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  // Reset SELURUH wizard saat `open` berubah false->true -- "adjust state
  // during render" (react.dev/learn/you-might-not-need-an-effect), bukan
  // effect, supaya react-hooks/set-state-in-effect tidak menyala (Modal kit
  // tetap mounted demi animasi, state-nya yang perlu direset manual).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(1); setFile(null); setParsed({ headers: [], rows: [] }); setMapping({});
      setDefaultSource(''); setDefaultCompanyId(profile?.company_id || ''); setDefaultOwner('');
      setPreviewRows([]); setPreviewPage(0); setSimilarByRow({}); setResult(null);
    }
  }

  useEffect(() => {
    if (!defaultCompanyId) return; // owners lama dibiarkan apa adanya -- companyId kosong hanya saat profil belum siap
    supabase.from('profiles').select('id, full_name').eq('company_id', defaultCompanyId).eq('active', true).limit(1000)
      .then(({ data }) => setOwners(data || []));
  }, [defaultCompanyId]);

  const hasSourceColumn = useMemo(() => Object.values(mapping).includes('source'), [mapping]);

  async function handleFileChosen(f) {
    if (!f) return;
    setFile(f);
    const p = await parseLeadImportFile(f);
    setParsed(p);
    setMapping(autoMatchColumns(p.headers));
  }

  // TD-318 Irisan 1, N11: "Remove" mockup (Modal/ImportLeads :340) -- jalur
  // ganti file sebelumnya cuma "pilih file lain", nol cara melepas tanpa
  // menggantinya.
  function removeFile() { setFile(null); setParsed({ headers: [], rows: [] }); setMapping({}); }

  function goToMapping() { if (file && parsed.rows.length > 0) setStep(2); }

  // Pratinjau dibangun ULANG tiap kali Default Values berubah SELAMA di step
  // 3 -- mockup menaruh Default Values dan Preview di LAYAR YANG SAMA tanpa
  // tombol "apply" terpisah (screenshot 10: Preview sudah terisi begitu step
  // 3 dibuka). Konsekuensi diterima: toggle include manual + cek-mirip yang
  // sudah dihitung ikut direset tiap defaults berubah (entity berubah = scope
  // cek-mirip ikut berubah, jadi mereset itu benar, bukan cuma efek samping).
  // Pola render-time-adjustment yang sama dengan reset-saat-open di atas --
  // buildPreviewRows murni/sinkron, jadi ini BUKAN kandidat effect sama
  // sekali (react.dev: "You don't need an Effect to update state based on
  // another state").
  const previewKey = `${step}|${defaultSource}|${defaultCompanyId}|${defaultOwner}`;
  const [builtPreviewKey, setBuiltPreviewKey] = useState('');
  if (step === 3 && previewKey !== builtPreviewKey) {
    setBuiltPreviewKey(previewKey);
    setPreviewRows(buildPreviewRows(parsed.rows, mapping, {
      source: defaultSource, companyId: defaultCompanyId, assignedTo: defaultOwner || null,
    }));
    setPreviewPage(0);
    setSimilarByRow({});
  }

  // Cek mirip, lazy per halaman pratinjau yang terlihat (bukan seluruh 48
  // baris sekaligus) -- supaya tidak membanjiri RPC untuk file besar.
  useEffect(() => {
    if (step !== 3 || !defaultCompanyId) return;
    const pageRows = previewRows.slice(previewPage * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE + PREVIEW_PAGE_SIZE);
    pageRows.forEach((r) => {
      if (similarByRow[r.rowNumber] !== undefined || !r.name.trim()) return;
      supabase.rpc('check_similar_accounts', { p_name: r.name.trim(), p_company_id: defaultCompanyId })
        .then(({ data }) => {
          const hit = data?.length ? data[0] : null;
          setSimilarByRow((m) => ({ ...m, [r.rowNumber]: hit }));
          if (hit) setPreviewRows((rows) => rows.map((x) => (x.rowNumber === r.rowNumber ? { ...x, include: false } : x)));
        });
    });
  }, [step, previewPage, previewRows, defaultCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canImport = defaultSource && defaultCompanyId && previewRows.some((r) => r.include);
  const includedCount = previewRows.filter((r) => r.include).length;

  async function handleImport() {
    if (!canImport) return { error: new Error('Lengkapi Source dan Entity, dan sertakan minimal satu baris') };
    setImporting(true);
    try {
      const toInsert = previewRows.filter((r) => r.include);
      let ok = 0;
      for (const r of toInsert) {
        const { data: account, error } = await supabase.from('accounts').insert({
          name: r.name.trim(), company_id: r.company_id, source: r.source || null,
          description: r.description.trim() || null, assigned_to: r.assigned_to,
          lifecycle_stage: 'lead', customer_type: 'freight', created_by: profile.id,
          owner_company_id: r.company_id, last_activity_at: new Date().toISOString(),
        }).select('id').single();
        if (error) continue; // baris lain tetap lanjut -- laporan akhir pakai hitungan sukses
        ok++;
        if (r.contact_name.trim()) {
          await supabase.from('contacts').insert({
            account_id: account.id, company_id: r.company_id, name: r.contact_name.trim(),
            phone: r.phone.trim() || null, email: r.email.trim() || null, is_primary: true,
          });
        }
      }
      if (ok < toInsert.length) showToast?.(`${toInsert.length - ok} baris gagal diimpor (dilewati), ${ok} berhasil.`, 'error');
      setResult({ count: ok, source: defaultSource, entity: ENTITIES.find((e) => e.id === defaultCompanyId)?.code, owner: defaultOwner ? owners.find((o) => o.id === defaultOwner)?.full_name : null });
      setStep(4);
      onImported?.();
      return undefined;
    } finally {
      setImporting(false);
    }
  }

  const dropZoneStyle = {
    border: `1.5px dashed ${LINE}`, borderRadius: RADIUS.lg, padding: '36px 20px', textAlign: 'center',
    background: HEAD_BG, cursor: 'pointer',
  };
  const th = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY };
  const td = { padding: '10px 12px', fontSize: 13, color: INK, fontFamily: FONT_BODY, borderTop: `1px solid ${LINE_SOFT}` };

  return (
    // TD-318 Irisan 1, N10: 760px persis mockup Modal/ImportLeads
    // (max-width:760px) -- sebelumnya 700.
    <Modal open={open} onClose={onClose} title="Import Leads" width={760} footer={step === 4 ? null : (
      <>
        {step > 1 && <OutlineBtn style={{ marginRight: 'auto' }} onClick={() => setStep((s) => s - 1)}>Back</OutlineBtn>}
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        {step === 1 && <PrimaryBtn onClick={goToMapping} disabled={!file || parsed.rows.length === 0}>Next</PrimaryBtn>}
        {step === 2 && <PrimaryBtn onClick={() => setStep(3)}>Next</PrimaryBtn>}
        {step === 3 && <SaveButton onSave={handleImport} label={`Import ${includedCount} Lead${includedCount === 1 ? '' : 's'}`} disabled={!canImport || importing} />}
      </>
    )}>
      {step < 4 && <Stepper step={step} />}

      {step === 1 && (
        <div>
          <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: SP.s3, fontFamily: FONT_BODY }}>
            Upload a CSV or Excel file with these columns: Company Name, Contact Name, Phone, Email, Source, Description.
          </div>
          {/* TD-318 Irisan 1, N11: dua keadaan TERPISAH persis mockup (noFile
              :339 vs hasFile :340) -- sebelumnya satu dropzone yang teksnya
              diganti jadi nama file, nol ikon/metadata/tombol Remove. */}
          {!file ? (
            <label style={dropZoneStyle}>
              <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFileChosen(e.target.files?.[0])} />
              <Upload size={22} color={INK_SOFT} style={{ marginBottom: 8 }} />
              <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14, color: INK }}>Choose a file or drag it here</div>
              <div style={{ fontSize: 12, color: INK_FAINT, marginTop: 4 }}>.csv or .xlsx, up to 5 MB</div>
            </label>
          ) : (
            <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: RADIUS.md, background: SEMANTIC.ok.bg, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 36px' }}>
                <FileText size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontFamily: FONT_BODY, fontSize: 13.5, color: INK }}>{file.name}</div>
                <div style={{ fontSize: 12, color: INK_FAINT, fontFamily: FONT_BODY }}>
                  {parsed.rows.length} rows, {parsed.headers.length} columns, {Math.max(1, Math.round(file.size / 1024))} KB
                </div>
              </div>
              <button type="button" onClick={removeFile} style={{ marginLeft: 'auto', border: 0, background: 'none', color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <X size={13} /> Remove
              </button>
            </div>
          )}
          <button type="button" onClick={downloadLeadImportTemplate} style={{ background: 'none', border: 'none', padding: 0, marginTop: SP.s3, color: INK_SOFT, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_BODY }}>
            Download Template
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: SP.s3, fontFamily: FONT_BODY }}>
            Columns were matched automatically. Correct any that are wrong.
          </div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SP.s3 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: HEAD_BG }}><th style={th}>Column in File</th><th style={th}>Sample Data</th><th style={th}>Nexus Field</th><th style={{ ...th, width: 28 }} /></tr></thead>
              <tbody>
                {parsed.headers.map((h, i) => {
                  const mapped = (mapping[i] || 'ignore') !== 'ignore';
                  return (
                    <tr key={i}>
                      <td style={{ ...td, fontFamily: FONT_MONO, fontWeight: 600 }}>{h || `Column ${i + 1}`}</td>
                      <td style={{ ...td, color: INK_SOFT }}>{parsed.rows[0]?.[i] ?? ''}</td>
                      <td style={td}>
                        <select value={mapping[i] || 'ignore'} onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}
                          style={{ height: 36, borderRadius: RADIUS.sm, border: `1px solid ${LINE}`, padding: '0 8px', fontFamily: FONT_BODY, fontSize: 13 }}>
                          {NEXUS_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </td>
                      <td style={{ ...td, width: 28 }}>{mapped && <Check size={15} color={SEMANTIC.ok.fg} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!hasSourceColumn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: SEMANTIC.warn.bg, border: `1px solid ${SEMANTIC.warn.bd}`, borderRadius: RADIUS.md, padding: '10px 14px', fontSize: 12.5, color: SEMANTIC.warn.fg, fontFamily: FONT_BODY }}>
              <AlertTriangle size={14} /> No Source column was found. Set a default value in the next step.
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14, marginBottom: SP.s3 }}>Default Values</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SP.s3, marginBottom: SP.s3 }}>
            <div>
              <FloatingSelect label="Source" value={defaultSource} onChange={setDefaultSource} options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))} />
              {!hasSourceColumn && <div style={{ fontSize: 11, color: INK_FAINT, marginTop: 4 }}>Applied to every row because the file has no Source column.</div>}
            </div>
            <FloatingSelect label="Entity" value={defaultCompanyId} onChange={setDefaultCompanyId}
              options={(isAllEntities ? ENTITIES : ENTITIES.filter((e) => e.id === profile?.company_id)).map((e) => ({ value: e.id, label: e.code }))} />
            {/* TD-318 Irisan 1, N12: label "Owner" + kata "Optional" terpisah
                warna lebih terang, persis mockup (:353) -- sebelumnya satu
                string "Owner (optional)" polos. TD-318 Irisan 3, tes Den
                #3: pindah ke prop kit `optional` (FieldLabel) -- JSX label
                manual di atas adalah workaround SEBELUM prop ini ada. */}
            <FloatingSelect label="Owner" optional value={defaultOwner} onChange={setDefaultOwner}
              options={[{ value: '', label: 'Leave unassigned' }, ...owners.map((o) => ({ value: o.id, label: o.full_name }))]} />
          </div>

          {previewRows.length > 0 && (
            <>
              <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14, marginBottom: SP.s2 }}>Preview</div>
              <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SP.s2 }}>
                {/* TD-318 Irisan 1, #2/#3: kolom Phone + Email ditambahkan --
                    datanya SUDAH ada di tiap baris (buildPreviewRows,
                    leadImport.js), hanya belum ditampilkan di sini. Mockup
                    (:358) 6 kolom: Company Name/Contact/Phone/Email/Source/
                    Owner -- kode lama berhenti di 4 (Phone+Email hilang). */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: HEAD_BG }}>
                    <th style={th}></th><th style={th}>Company Name</th><th style={th}>Contact</th><th style={th}>Phone</th><th style={th}>Email</th><th style={th}>Source</th><th style={th}>Owner</th>
                  </tr></thead>
                  <tbody>
                    {previewRows.slice(previewPage * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE + PREVIEW_PAGE_SIZE).map((r) => {
                      const similar = similarByRow[r.rowNumber];
                      return (
                        <tr key={r.rowNumber}>
                          <td style={{ ...td, width: 30 }}>
                            <input type="checkbox" checked={r.include} onChange={(e) => setPreviewRows((rows) => rows.map((x) => (x.rowNumber === r.rowNumber ? { ...x, include: e.target.checked } : x)))} />
                          </td>
                          <td style={td}>
                            {r.name}
                            {similar && (
                              <div style={{ fontSize: 11, color: SEMANTIC.warn.fg, marginTop: 2 }}>Similar to “{similar.name}” — excluded by default</div>
                            )}
                          </td>
                          <td style={{ ...td, color: INK_SOFT }}>{r.contact_name || '—'}</td>
                          <td style={{ ...td, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                          <td style={{ ...td, color: INK_SOFT }}>{r.email || '—'}</td>
                          <td style={td}>{SOURCE_LABELS[r.source] || r.source || '—'}</td>
                          <td style={{ ...td, color: INK_SOFT }}>{r.assigned_to ? owners.find((o) => o.id === r.assigned_to)?.full_name : 'Unassigned'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager
                left={`Rows ${previewPage * PREVIEW_PAGE_SIZE + 1} to ${Math.min(previewRows.length, previewPage * PREVIEW_PAGE_SIZE + PREVIEW_PAGE_SIZE)} of ${previewRows.length} (${includedCount} will be imported)`}
                page={previewPage} totalPages={Math.ceil(previewRows.length / PREVIEW_PAGE_SIZE)} onChange={setPreviewPage}
              />
            </>
          )}
        </div>
      )}

      {step === 4 && result && (
        <div style={{ textAlign: 'center', padding: `${SP.s5}px 0` }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: SEMANTIC.ok.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={26} color={SEMANTIC.ok.fg} />
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 18, color: INK, marginBottom: 6 }}>{result.count} lead{result.count === 1 ? '' : 's'} imported</div>
          <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: 24 }}>
            Source {SOURCE_LABELS[result.source] || result.source}, entity {result.entity}{result.owner ? `, owner ${result.owner}` : ', unassigned'}
          </div>
          <PrimaryBtn onClick={onClose}>View imported leads</PrimaryBtn>
        </div>
      )}
    </Modal>
  );
}

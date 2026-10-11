// src/modules/crm/lead/pages/LeadQualificationPage.jsx
// "Lead Qualification to Inquiry" -- design-handoff/crm-2026-10-11/shots/lead/
// 15-qualification-list-sales.png. Batch DS 3 Lead Management, Paket 1
// irisan 6 (penutup). Rute /crm/lead/qualification (menu 1.1.3), menu id
// BARU `crm-lead-qualification`, gerbang SAMA dengan Capture (`crm_prospects`
// -- nol izin baru, lihat crm.routes.jsx/menu-skeleton.js).
//
// Cakupan tabel: lifecycle_stage IN ('lead','mql') -- SELURUH lead yang
// belum Converted/Customer/Lost, bukan cuma yang sudah qualified_at terisi.
// Ini SENGAJA lebih luas dari mockup (yang kebetulan memotret momen semua
// lead sales itu sudah qualified): instruksi eksplisit minta aksi "Mark
// Qualified" di halaman ini juga (poin 4), dan aksi itu hanya punya arti
// untuk baris yang BELUM qualified_at. Ketiga kartu statistik tetap dihitung
// HANYA dari subset qualified (qualified_at IS NOT NULL) -- angka itu
// persis label mockup "Qualified Leads"/"Total Estimated Value"/"Average
// BANT Score", dan baris per baris tabel membedakan aksinya sendiri: Mark
// Qualified untuk yang belum, Create Inquiry untuk yang sudah.
//
// Panel per baris (expand) memakai BantScoreBar (komponen BANT yang sudah
// ada, dipakai apa adanya) + empat tombol skor BANT_DIMENSIONS klik-langsung
// (pola identik LeadDetailPage.BantTab) + QUALIFICATION_FIELDS (lib/bant.js,
// satu sumber dgn LeadDetailPage) + Qualified Reason -- "konsisten dengan
// LeadDetailPage" instruksi irisan 6 poin 4.
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, EmptyState, Segmented, Select, SaveButton, PrimaryBtn, FloatingInput, Textarea } from '../../../../kit';
import {
  INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, CARD, ROW_HOVER,
  FONT_BODY, FONT_HEAD, FONT_MONO, RADIUS, SP, fmtRp, avatarToneFor,
} from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole, isSalesOnly as isSalesOnlyRole, isManagerOrAbove } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { BANT_DIMENSIONS, BANT_MAX_SCORE, calcBantScore, QUALIFICATION_FIELDS } from '../../lib/bant';
import BantScoreBar from '../../components/BantScoreBar';

const FETCH_LIMIT = 500; // bukan daftar paginasi besar seperti Capture -- cakupannya sempit (lead/mql milik satu entitas/sales), lihat catatan kepala file soal statistik.

function OwnerCell({ id, name }) {
  if (!name) return <span style={{ color: INK_FAINT, fontSize: 13 }}>Unassigned</span>;
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const tone = avatarToneFor(id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 22px' }}>{initials}</span>
      <span style={{ fontSize: 13, color: INK }}>{name}</span>
    </div>
  );
}

function BantCell({ score }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: INK, fontWeight: 600 }}>{score}/{BANT_MAX_SCORE}</span>
      <span style={{ width: 40, height: 5, borderRadius: 999, background: HEAD_BG, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${(score / BANT_MAX_SCORE) * 100}%`, background: INK_SOFT, borderRadius: 999 }} />
      </span>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
const primaryContactOf = (acc) => (Array.isArray(acc.contacts) ? acc.contacts : []).find((k) => k.is_primary && !k.deleted_at) || null;

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 };
const grid4 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: SP.s4 };

/**
 * @param {(account: Object) => void} onSelectLead
 * @param {(account: Object) => void} onCreateInquiry
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function LeadQualificationPage({ onSelectLead, onCreateInquiry, showToast }) {
  const { profile, erpRole, erpRoles } = useAuth();
  const isAllEntities = isAllEntitiesRole(erpRoles);
  const isSalesOnly = isSalesOnlyRole(erpRole);
  const canManage = isManagerOrAbove(erpRoles);

  const [scope, setScope] = useState('mine');
  const effectiveScope = isSalesOnly ? 'mine' : scope;
  const [entity, setEntity] = useState('all');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const fetchLeads = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    try {
      let query = supabase.from('accounts')
        .select(`
          id, code, name, source, lifecycle_stage, qualified_at, qualified_reason,
          assigned_to, estimated_value, last_activity_at, company_id,
          bant_budget, bant_authority, bant_need, bant_timeline,
          bant_commodity, bant_origin, bant_destination, bant_frequency,
          bant_current_vendor, bant_payment, bant_decision_maker,
          assigned_profile:profiles!prospects_assigned_to_fkey(id, full_name),
          contacts(id, name, is_primary, deleted_at)
        `)
        .in('lifecycle_stage', ['lead', 'mql'])
        .is('deleted_at', null);

      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      else if (entity !== 'all') query = query.eq('company_id', entity);
      if (effectiveScope === 'mine') query = query.eq('assigned_to', profile.id);

      query = query.order('qualified_at', { ascending: false, nullsFirst: false })
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .limit(FETCH_LIMIT);

      const { data, error } = await query;
      if (error) throw error;
      setLeads(data || []);
    } catch (err) {
      showToast?.('Failed to load leads: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, isAllEntities, effectiveScope, entity, showToast]);
  useEffect(() => { Promise.resolve().then(fetchLeads); }, [fetchLeads]);

  async function handleMarkQualified(row) {
    const { error } = await supabase.from('accounts')
      .update({ qualified_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', row.id);
    if (error) return { error };
    await supabase.from('activities').insert({
      account_id: row.id, company_id: row.company_id, type: 'status_change', status: 'done',
      notes: 'Raw to Qualified', created_by: profile.id, completed_at: new Date().toISOString(),
    });
    fetchLeads();
    return undefined;
  }

  const qualified = leads.filter((l) => l.qualified_at);
  const totalEstValue = qualified.reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);
  const avgBant = qualified.length ? qualified.reduce((sum, l) => sum + calcBantScore(l), 0) / qualified.length : 0;

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY, whiteSpace: 'nowrap' };
  const td = { padding: '12px', fontSize: 13, color: INK, fontFamily: FONT_BODY };
  const scopeLabel = effectiveScope === 'mine' ? 'showing your leads only' : 'showing all team leads';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: SP.s4, marginBottom: SP.s4 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY, marginBottom: 6 }}>Qualified Leads</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 700, color: INK }}>{qualified.length}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY, marginBottom: 6 }}>Total Estimated Value</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 700, color: INK }}>{fmtRp(totalEstValue)}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY, marginBottom: 6 }}>Average BANT Score</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 700, color: INK }}>{avgBant.toFixed(1)} / {BANT_MAX_SCORE}</div>
        </Card>
      </div>

      {!isSalesOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3, marginBottom: SP.s3, flexWrap: 'wrap' }}>
          <Segmented ariaLabel="Lead scope" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My Leads' }, { value: 'all', label: 'All Leads' }]} />
          {isAllEntities && (
            <Select value={entity} onChange={setEntity} width={110} options={[{ value: 'all', label: 'All' }, ...ENTITIES.map((e) => ({ value: e.id, label: e.code }))]} />
          )}
        </div>
      )}

      <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: SP.s2, fontFamily: FONT_BODY }}>{leads.length} lead{leads.length === 1 ? '' : 's'}, {scopeLabel}</div>

      <Card padded={false}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
        ) : leads.length === 0 ? (
          <EmptyState icon="inbox" title="No leads to qualify" sub="Leads captured but not yet converted will appear here." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
                  <th style={{ ...th, width: 28 }} />
                  <th style={th}>Account Code</th>
                  <th style={th}>Company Name</th>
                  <th style={th}>Primary Contact</th>
                  <th style={th}>Owner</th>
                  <th style={th}>BANT Score</th>
                  <th style={th}>Estimated Value</th>
                  <th style={th}>Qualified On</th>
                  <th style={th}>Last Touched</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const score = calcBantScore(l);
                  const expanded = expandedId === l.id;
                  return (
                    <RowGroup key={l.id} row={l} score={score} expanded={expanded}
                      onToggle={() => setExpandedId(expanded ? null : l.id)}
                      onSelectLead={onSelectLead} onCreateInquiry={onCreateInquiry}
                      onMarkQualified={handleMarkQualified} onChanged={fetchLeads}
                      canManage={canManage} showToast={showToast}
                      th={th} td={td} />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RowGroup({ row, score, expanded, onToggle, onSelectLead, onCreateInquiry, onMarkQualified, onChanged, showToast, td }) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderBottom: expanded ? 'none' : `1px solid ${LINE_SOFT}`, cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = ROW_HOVER; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <td style={{ ...td, width: 28 }}>{expanded ? <ChevronDown size={15} color={INK_SOFT} /> : <ChevronRight size={15} color={INK_SOFT} />}</td>
        <td style={{ ...td, fontFamily: FONT_MONO, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); onSelectLead?.(row); }}>
          <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>{row.code || '—'}</span>
        </td>
        <td style={{ ...td, fontWeight: 700 }}>{row.name}</td>
        <td style={{ ...td, color: INK_SOFT }}>{primaryContactOf(row)?.name || '—'}</td>
        <td style={td}><OwnerCell id={row.assigned_to} name={row.assigned_profile?.full_name} /></td>
        <td style={td}><BantCell score={score} /></td>
        <td style={{ ...td, fontFamily: FONT_MONO }}>{row.estimated_value != null ? fmtRp(row.estimated_value) : '—'}</td>
        <td style={{ ...td, color: INK_FAINT, fontSize: 12.5 }}>{fmtDate(row.qualified_at)}</td>
        <td style={{ ...td, color: INK_FAINT, fontSize: 12.5 }}>{fmtDate(row.last_activity_at)}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          {row.qualified_at ? (
            onCreateInquiry && <PrimaryBtn size="sm" onClick={() => onCreateInquiry(row)}>Create Inquiry</PrimaryBtn>
          ) : (
            <SaveButton size="sm" label="Mark Qualified" savedLabel="Qualified!" onSave={() => onMarkQualified(row)}
              onError={(err) => showToast?.('Failed to update: ' + err.message, 'error')} />
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: `1px solid ${LINE_SOFT}` }}>
          <td colSpan={10} style={{ padding: 0, background: HEAD_BG }}>
            <ExpandPanel row={row} onChanged={onChanged} showToast={showToast} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandPanel({ row, onChanged, showToast }) {
  const score = calcBantScore(row);
  const [qualDraft, setQualDraft] = useState(() => {
    const draft = { qualified_reason: row.qualified_reason || '' };
    QUALIFICATION_FIELDS.forEach((f) => { draft[f.key] = row[f.key] || ''; });
    return draft;
  });

  async function setDim(key, value) {
    const { error } = await supabase.from('accounts').update({ [key]: value, last_activity_at: new Date().toISOString() }).eq('id', row.id);
    if (error) { showToast?.('Failed to update BANT: ' + error.message, 'error'); return; }
    onChanged?.();
  }
  async function saveQual() {
    const payload = { qualified_reason: qualDraft.qualified_reason.trim() || null };
    QUALIFICATION_FIELDS.forEach((f) => { payload[f.key] = qualDraft[f.key].trim() || null; });
    const { error } = await supabase.from('accounts').update(payload).eq('id', row.id);
    if (error) return { error };
    onChanged?.();
    return undefined;
  }

  return (
    <div style={{ padding: SP.s4, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <BantScoreBar score={score} />
      <div style={grid4}>
        {BANT_DIMENSIONS.map((dim) => (
          <div key={dim.key} style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: SP.s3, background: CARD }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, color: INK }}>{dim.label}</div>
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              {dim.options.map((o) => {
                const active = Number(row[dim.key]) === o.value;
                return (
                  <button key={o.value} type="button" onClick={() => setDim(dim.key, o.value)}
                    style={{
                      width: 28, height: 28, borderRadius: RADIUS.sm, border: `1px solid ${active ? INK : LINE}`,
                      background: active ? HEAD_BG : CARD, color: INK, fontFamily: FONT_MONO, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                    }}>
                    {o.value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={grid4}>
        {QUALIFICATION_FIELDS.slice(0, 4).map((f) => (
          <FloatingInput key={f.key} label={f.label} value={qualDraft[f.key]} onChange={(v) => setQualDraft((d) => ({ ...d, [f.key]: v }))} />
        ))}
      </div>
      <div style={grid2}>
        {QUALIFICATION_FIELDS.slice(4).map((f) => (
          <FloatingInput key={f.key} label={f.label} value={qualDraft[f.key]} onChange={(v) => setQualDraft((d) => ({ ...d, [f.key]: v }))} />
        ))}
      </div>

      <Textarea label="Qualified Reason" value={qualDraft.qualified_reason} onChange={(v) => setQualDraft((d) => ({ ...d, qualified_reason: v }))} rows={2} />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton size="sm" onSave={saveQual} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
      </div>
    </div>
  );
}

// src/modules/crm/lead/pages/LeadQualificationPage.jsx
// "Lead Qualification to Inquiry" -- design-handoff/mockup/Lead Management.dc.html
// (tab `qual`, data-screen-label "Qualification/Table" + "Qualification/BANTPanel").
// Batch DS 3 Lead Management, Paket 1 -- TD-318 Irisan 0c (13 Okt 2026):
// halaman ini ditulis ulang supaya ikut mockup PERSIS, menggantikan bentuk
// irisan 6 asli (lihat git history untuk versi lama).
//
// TIGA perbedaan sengaja dari irisan 6 asli, seluruhnya keputusan Den 13 Okt 2026:
//   1. Cakupan tabel kini HANYA lead Qualified (lifecycle_stage IN ('lead','mql')
//      AND qualified_at IS NOT NULL -- `applyLeadStatusFilter(query,'qualified')`,
//      SATU SUMBER KEBENARAN dengan filter Status "Qualified" di LeadCapturePage,
//      src/modules/crm/lead/lib/leadStatus.js). Lead Raw (belum qualified_at)
//      TIDAK lagi tampil di sini -- ditemukan di /crm/lead/capture, filter
//      Status = Raw (jalur yang sudah ada, bukan halaman baru).
//   2. Filter "Qualified" otomatis juga berarti "belum punya inquiry", TANPA
//      join/cek tambahan: trigger DB `trg_set_prospect_on_inquiry`
//      (schema_snapshot.sql) mengubah lifecycle_stage -> 'prospect' begitu
//      sebuah inquiry dibuat untuk akun itu, sehingga akun itu otomatis
//      KELUAR dari `lifecycle_stage IN ('lead','mql')` -- padanan persis
//      status "Converted" mockup (lead ber-`inq` berstatus 'Converted', bukan
//      'Qualified' lagi, Lead Management.dc.html baris data `L(...)`).
//   3. Panel baris (expand) kini BACA-SAJA: 4 skor BANT + Commodity/Origin/
//      Destination/Shipping Frequency sebagai teks, NOL <input>, NOL tombol
//      Simpan -- persis struktur mockup. Edit BANT & ketujuh field
//      Qualification Data HANYA lewat Lead Detail (LeadDetailPage.jsx, tab
//      "BANT & Pipeline") -- satu-satunya tempat edit, sesuai urutan kerja
//      yang disyaratkan (Lead Detail dibereskan lebih dulu).
//
// Kolom aksi: SATU tombol "Create Inquiry" saja (cabang "Mark Qualified"
// dibuang -- sejak filter di atas, setiap baris yang tersisa pasti sudah
// qualified_at terisi, jadi cabang itu tak akan pernah tercapai).
//
// Lebar kolom tabel: grid-template-columns PERSIS mockup (lihat QUAL_GRID_COLS
// di bawah, disalin literal dari Lead Management.dc.html baris Qualification/
// Table), bukan <table> table-layout:auto -- HTML table tak bisa menyatakan
// kolom fleksibel minmax(px,fr) seperti mockup, jadi CSS grid dipilih sebagai
// yang paling sedikit risiko untuk kecocokan lebar persis (role="table"/"row"/
// "columnheader"/"cell" ditambahkan sebagai mitigasi aksesibilitas -- mockup
// sendiri nol ARIA, prototipe murni). Wadah scroll horizontalnya memakai
// `.nk-scroll` (TD-318 Irisan 0b) supaya scrollbar-nya SELALU terlihat.
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader, Card, Segmented, Select, PrimaryBtn } from '../../../../kit';
import {
  INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, ROW_HOVER,
  FONT_BODY, FONT_HEAD, FONT_MONO, SP, fmtRp, avatarToneFor,
} from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole, isSalesOnly as isSalesOnlyRole } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { applyLeadStatusFilter } from '../lib/leadStatus';
import { BANT_DIMENSIONS, BANT_MAX_SCORE, calcBantScore, QUALIFICATION_FIELDS } from '../../lib/bant';

const FETCH_LIMIT = 500; // bukan daftar paginasi besar seperti Capture -- cakupannya sempit (qualified milik satu entitas/sales).

// Grid persis mockup (Lead Management.dc.html, data-screen-label
// "Qualification/Table"), disalin literal -- JANGAN dihitung ulang/dibulatkan.
const QUAL_GRID_COLS = '44px 96px minmax(170px,1.4fr) minmax(130px,1fr) minmax(150px,1fr) 100px 136px 108px 104px 148px';
const QUAL_GRID_MIN_W = 1180;

// Empat field ringkasan panel baris, diambil BERDASARKAN KEY dari
// QUALIFICATION_FIELDS (bukan slice(0,4)) -- tidak bergantung urutan array,
// aman kalau QUALIFICATION_FIELDS di lib/bant.js suatu saat disusun ulang.
const SUMMARY_FIELD_KEYS = ['bant_commodity', 'bant_origin', 'bant_destination', 'bant_frequency'];

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

// Sel data -- Company Name/Primary Contact/Owner SENGAJA tanpa whiteSpace
// (boleh wrap, persis mockup); Estimated Value/Qualified On/Last Touched
// dapat nowrap sendiri-sendiri di pemanggilnya (mockup eksplisit set itu
// hanya di tiga kolom itu, bukan default semua sel).
const cell = { padding: '12px', fontFamily: FONT_BODY, fontSize: 13.5, color: INK, minWidth: 0 };
const headCell = { padding: '12px', fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, whiteSpace: 'nowrap' };

/**
 * @param {(account: Object) => void} onSelectLead
 * @param {(account: Object) => void} onCreateInquiry
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function LeadQualificationPage({ onSelectLead, onCreateInquiry, showToast }) {
  const { profile, erpRole, erpRoles } = useAuth();
  const isAllEntities = isAllEntitiesRole(erpRoles);
  const isSalesOnly = isSalesOnlyRole(erpRole);
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
        .is('deleted_at', null);
      query = applyLeadStatusFilter(query, 'qualified');

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

  // Seluruh baris yang tersisa sudah dijamin qualified_at terisi oleh filter
  // di atas -- nol filter tambahan di sini (beda dari irisan 6 asli yang
  // masih memisah `qualified` dari `leads` karena dulu `leads` memuat Raw juga).
  const totalEstValue = leads.reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);
  const avgBant = leads.length ? leads.reduce((sum, l) => sum + calcBantScore(l), 0) / leads.length : 0;
  const scopeLabel = effectiveScope === 'mine' ? 'showing your leads only' : 'showing all team leads';

  return (
    <div>
      <PageHeader title="Lead Qualification to Inquiry" />

      {/* repeat(3, minmax(0,1fr)) -- persis mockup (Lead Management.dc.html:151,
          "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px"),
          bukan auto-fit minmax(220px,1fr) -- TD-318 Irisan 0d. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: SP.s4, marginBottom: SP.s4 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY, marginBottom: 6 }}>Qualified Leads</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 700, color: INK }}>{leads.length}</div>
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

      {/* border -> boxShadow inset -- TD-318 Irisan 0d, SATU-SATUNYA sumber overflow 1px
          sisa di 1475px (jendela Den). Matematikanya (diukur Playwright, bukan ditebak):
          QUAL_GRID_COLS sendiri PUNYA lantai 1186px (7 kolom tetap 736px + 3 minimum
          minmax 170+130+150=450px) -- lebih besar dari QUAL_GRID_MIN_W=1180 yang
          tertulis (angka itu DISALIN LITERAL dari mockup, dan mockup SENDIRI sudah
          salah hitung 6px -- bukan typo kita, dibuktikan via grep mockup langsung).
          Di 1475px, chrome app (sidebar 248px + padding 20px x2, PERSIS mockup
          `<aside style="width:248px">`+`<main style="padding:24px 20px 32px">`)
          menyisakan 1185px untuk isi kartu -- 1px DI BAWAH lantai 1186px itu, SEBELUM
          border kartu dihitung. Border 1px x 2 sisi (kartu `padded={false}`) memakan
          2px LAGI dari lebar isi, sementara perhitungan Den (1475-248-40=1187) tidak
          menghitungnya -- itulah penyebab persis overflow 1px, bukan pembulatan
          (diverifikasi: seluruh kotak di rantai ini bulat, nol sub-pixel).
          grid-template-columns TIDAK disentuh (dilarang) dan sidebar/padding bersama
          TIDAK disentuh (dipakai semua halaman lain) -- satu-satunya ruang aman untuk
          mengembalikan 2px itu TANPA mengubah tampilan: ganti border jadi inset
          box-shadow (warna & tebal sama persis, dicat KE DALAM alih-alih ditambahkan
          ke lebar kotak). Baris mockup min-width:1180 sendiri akan overflow identik
          kalau diukur persis di chrome yang sama -- bukan sesuatu yang kita
          perkenalkan. */}
      <Card padded={false} style={{ border: 'none', boxShadow: `inset 0 0 0 1px ${LINE}` }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
        ) : leads.length === 0 ? (
          // Teks polos tengah, PERSIS mockup (bukan EmptyState berikon --
          // mockup "noQual" hanya <div style="padding:32px 16px;text-align:
          // center;color:#5C6B52">, tanpa ikon/judul/subjudul terpisah).
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13.5, color: INK_SOFT, fontFamily: FONT_BODY }}>
            No qualified leads waiting for an inquiry.
          </div>
        ) : (
          <div className="nk-scroll" role="table" aria-label="Qualified leads" style={{ overflowX: 'auto' }}>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: QUAL_GRID_COLS, minWidth: QUAL_GRID_MIN_W, alignItems: 'center', background: HEAD_BG, borderBottom: `1px solid ${LINE_SOFT}` }}>
              <div role="columnheader" style={headCell} />
              <div role="columnheader" style={headCell}>Account Code</div>
              <div role="columnheader" style={headCell}>Company Name</div>
              <div role="columnheader" style={headCell}>Primary Contact</div>
              <div role="columnheader" style={headCell}>Owner</div>
              <div role="columnheader" style={headCell}>BANT Score</div>
              <div role="columnheader" style={{ ...headCell, textAlign: 'right' }}>Estimated Value</div>
              <div role="columnheader" style={headCell}>Qualified On</div>
              <div role="columnheader" style={headCell}>Last Touched</div>
              <div role="columnheader" style={headCell} />
            </div>
            {leads.map((l) => {
              const score = calcBantScore(l);
              const expanded = expandedId === l.id;
              return (
                <RowSummary key={l.id} row={l} score={score} expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : l.id)}
                  onSelectLead={onSelectLead} onCreateInquiry={onCreateInquiry} />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function RowSummary({ row, score, expanded, onToggle, onSelectLead, onCreateInquiry }) {
  return (
    <>
      <div
        role="row" onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: QUAL_GRID_COLS, minWidth: QUAL_GRID_MIN_W, alignItems: 'center',
          borderBottom: expanded ? 'none' : `1px solid ${LINE_SOFT}`, cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = ROW_HOVER; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div role="cell" style={{ padding: '4px 4px 4px 8px' }}>
          {expanded ? <ChevronDown size={15} color={INK_SOFT} /> : <ChevronRight size={15} color={INK_SOFT} />}
        </div>
        <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); onSelectLead?.(row); }}>
          <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>{row.code || '—'}</span>
        </div>
        <div role="cell" style={{ ...cell, fontWeight: 700 }}>{row.name}</div>
        <div role="cell" style={{ ...cell, color: INK_SOFT }}>{primaryContactOf(row)?.name || '—'}</div>
        <div role="cell" style={cell}><OwnerCell id={row.assigned_to} name={row.assigned_profile?.full_name} /></div>
        <div role="cell" style={cell}><BantCell score={score} /></div>
        <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, whiteSpace: 'nowrap', textAlign: 'right' }}>{row.estimated_value != null ? fmtRp(row.estimated_value) : '—'}</div>
        <div role="cell" style={{ ...cell, color: INK_FAINT, fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(row.qualified_at)}</div>
        <div role="cell" style={{ ...cell, color: INK_FAINT, fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(row.last_activity_at)}</div>
        <div role="cell" style={{ ...cell, display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          {onCreateInquiry && <PrimaryBtn size="sm" onClick={() => onCreateInquiry(row)}>Create Inquiry</PrimaryBtn>}
        </div>
      </div>
      {expanded && <RowSummaryPanel row={row} />}
    </>
  );
}

// Ringkasan BACA-SAJA, persis mockup Qualification/BANTPanel -- NOL <input>,
// NOL tombol Simpan. Edit hanya lewat Lead Detail (BantTab).
function RowSummaryPanel({ row }) {
  const summaryFields = SUMMARY_FIELD_KEYS
    .map((key) => QUALIFICATION_FIELDS.find((f) => f.key === key))
    .filter(Boolean);
  return (
    <div
      role="row"
      style={{
        minWidth: QUAL_GRID_MIN_W, padding: '16px 16px 16px 56px', background: HEAD_BG, borderBottom: `1px solid ${LINE_SOFT}`,
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: SP.s4,
      }}
    >
      {BANT_DIMENSIONS.map((dim) => (
        <div key={dim.key} role="cell" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>{dim.label}</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK }}>{Number(row[dim.key]) || 0}/3</span>
        </div>
      ))}
      {summaryFields.map((f) => (
        <div key={f.key} role="cell" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>{f.label}</span>
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK }}>{row[f.key] || '—'}</span>
        </div>
      ))}
    </div>
  );
}

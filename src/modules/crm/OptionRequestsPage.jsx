// src/modules/crm/OptionRequestsPage.jsx
// "Option Requests" -- Irisan 5, slot 1.11 (src/routes/menu-skeleton.js),
// design-handoff/mockup/Option Requests.dc.html + nexus-notes.js rule 107/108
// (dibaca utuh). Satu-satunya sisa TD-318 sebelum launching Lead Management
// (12_ANTREAN_MIGRASI_PRODUCTION.md item #18).
//
// Rekonsiliasi kit: halaman ini + modal pemicunya (RequestNewOptionModal.jsx)
// + MasterSelect.jsx + seluruh pemakai Industry/Lead Category/Lost Reason
// (CaptureLeadModal/LeadDetailPage/MarkAsLostModal) SUDAH memakai src/kit
// (sage) -- hex badge "New" mockup (bd #F6CDB6/bg #FEF2EC/fg #BE4A19) cocok
// PERSIS TONE.orange kit (tokens.js), bukan kebetulan: mockup ini dibangun
// di atas token sage, bukan navy/orange/cream crm/v3. Halaman dibangun
// dengan kit sage, konsisten dengan seluruh keluarga fiturnya.
//
// Commit 2 (plan §8): panel Detail read-only PENUH (header/field/existing-
// options anti-duplikat/reason/history) -- Approve/Reject (blok aksi)
// menyusul Commit 3, dengan signature RPC LAMA (20261011000002).
import { useState, useEffect, useMemo } from 'react';
import {
  PageHeader, Card, EmptyState, Segmented, SearchInput, Badge,
} from '../../kit';
import {
  INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, ROW_HOVER, BG,
  FONT_BODY, FONT_HEAD, FONT_MONO, SP, SEMANTIC, TONE,
} from '../../kit/tokens';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove } from '../../lib/roles';

// Label manusiawi per list_key -- DB tidak menyimpan ini (plan §2a). Hanya
// tiga list yang hidup hari ini; list_key lain tampil apa adanya (fallback).
const LIST_KEY_LABELS = { lead_industry: 'Industry', lead_category: 'Lead Category', lost_reason: 'Lost Reason' };
function listLabel(key) { return LIST_KEY_LABELS[key] || key; }

// Location Master (rule 108) BELUM ada sebagai master data Nexus -- array
// SENGAJA kosong, bukan tebakan nama key. Cabang isLoc tak tereksekusi
// dengan data produksi/staging apa pun hari ini.
const LOCATION_LIST_KEYS = [];
const isLocationList = (key) => LOCATION_LIST_KEYS.includes(key);

const STATUS_TONE = { pending: 'warn', approved: 'ok', rejected: 'danger' };
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

// fmtDate -- pola sama LeadAssignmentPage.jsx (en-GB, "12 Oct 2026").
function fmtDate(iso) {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const headCell = { padding: '10px 12px', fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, whiteSpace: 'nowrap' };
const cell = { padding: 12, fontFamily: FONT_BODY, fontSize: 13.5, color: INK, minWidth: 0 };
const LIST_GRID_COLS = 'minmax(150px,1.2fr) 140px 150px 120px 110px minmax(140px,1fr) 100px';
const LIST_GRID_MIN_W = 960;

function gridRow(extra) {
  return { display: 'grid', gridTemplateColumns: LIST_GRID_COLS, minWidth: LIST_GRID_MIN_W, alignItems: 'center', ...extra };
}

/**
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function OptionRequestsPage({ showToast }) {
  const { erpRoles } = useAuth();
  const canManage = isManagerOrAbove(erpRoles);

  const [statusFilter, setStatusFilter] = useState('pending');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [peopleMap, setPeopleMap] = useState({}); // id -> { name, role }
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [existingOptions, setExistingOptions] = useState([]);
  const [reloadKey] = useState(0);

  // Daftar permintaan -- hanya dimuat untuk manager ke atas. Non-manager
  // SELALU merender cabang NoAccess (lihat akhir fungsi ini) sebelum sempat
  // membaca `rows`/`loading` -- jadi cabang `!canManage` di sini aman
  // `return undefined` TANPA setState (pola sama LeadAssignmentPage.jsx
  // `if (!profile?.id) return undefined;` -- menghindari react-hooks/
  // set-state-in-effect: state awal `loading=true`/`rows=[]` tak pernah
  // dibaca untuk non-manager, jadi tak perlu disetel ulang).
  useEffect(() => {
    if (!canManage) return undefined;
    let cancelled = false;
    supabase
      .from('dropdown_option_requests')
      .select('id, list_key, label, reason, status, requested_by, requested_at, reviewed_by, reviewed_at, rejection_reason, approval_note')
      .order('requested_at', { ascending: false })
      .limit(1000)
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) { showToast?.('Failed to load option requests: ' + error.message, 'error'); setRows([]); setLoading(false); return; }
        const list = data || [];
        setRows(list);

        const ids = [...new Set(list.flatMap((r) => [r.requested_by, r.reviewed_by]).filter(Boolean))];
        if (!ids.length) { setPeopleMap({}); setLoading(false); return; }

        const [{ data: profs }, { data: roleRows }] = await Promise.all([
          supabase.from('profiles').select('id, full_name').in('id', ids).limit(1000),
          // user_roles.user_id -> auth.users(id), BUKAN FK ke profiles --
          // query terpisah, resolusi manual (pola sama profMap di atas),
          // bukan embed PostgREST (nol FK bernama yang menghubungkannya).
          supabase.from('user_roles').select('user_id, is_active, valid_until, roles(name, level)').in('user_id', ids).eq('is_active', true).limit(1000),
        ]);
        if (cancelled) return;

        const today = new Date().toISOString().slice(0, 10);
        const bestRole = {}; // user_id -> { name, level }
        (roleRows || []).forEach((ur) => {
          if (ur.valid_until && ur.valid_until < today) return;
          const lvl = ur.roles?.level;
          if (!Number.isInteger(lvl)) return;
          if (!bestRole[ur.user_id] || lvl < bestRole[ur.user_id].level) {
            bestRole[ur.user_id] = { name: ur.roles.name, level: lvl };
          }
        });
        const map = {};
        (profs || []).forEach((p) => {
          map[p.id] = { name: p.full_name || '—', role: bestRole[p.id]?.name || '—' };
        });
        setPeopleMap(map);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [canManage, showToast, reloadKey]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  // "Existing options" anti-duplikat (plan §1e/§4) -- dimuat ulang tiap kali
  // list_key yang dipilih berubah (bukan setiap kali `selected` berubah
  // identitasnya -- dua request di list_key yang sama tak perlu fetch dua
  // kali berturut-turut kalau user klik cepat). Kedua cabang awal `return
  // undefined` TANPA setState (sama alasan efek di atas): `!selected` dan
  // Location Master (LOCATION_LIST_KEYS, tak tereksekusi hari ini) berarti
  // DetailPanel tak membaca `existingOptions` sama sekali untuk kasus itu
  // (lihat render DetailPanel: `!selected` pulang lebih dulu; cabang `loc`
  // merender teks Location Master-nya sendiri, bukan daftar existingOptions).
  useEffect(() => {
    if (!selected) return undefined;
    if (isLocationList(selected.list_key)) return undefined; // lihat LOCATION_LIST_KEYS
    let cancelled = false;
    supabase
      .from('dropdown_options')
      .select('label')
      .eq('list_key', selected.list_key)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setExistingOptions([]); return; }
        setExistingOptions((data || []).map((o) => o.label));
      });
    return () => { cancelled = true; };
    // Dep sengaja hanya list_key, bukan seluruh `selected` (lihat komentar
    // di atas efek ini): dua request di list yang sama tak perlu fetch ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.list_key]);

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!qq) return true;
      const by = peopleMap[r.requested_by]?.name || '';
      return (r.label + ' ' + listLabel(r.list_key) + ' ' + by).toLowerCase().includes(qq);
    });
  }, [rows, statusFilter, q, peopleMap]);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === 'pending').length, [rows]);

  function selectRow(id) { setSelectedId(id); }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Option Requests" subtitle="Requests for a new option in a dropdown list, sent from Request new option. A Manager or above approves or rejects them. A Manager can also add an option directly in the dropdown without a request." />
        <Card style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: INK }}>This page is for a Manager or above</b>
            <span style={{ color: INK_SOFT, fontFamily: FONT_BODY }}>Your requests are decided by a Manager. You are notified of the decision in the notification icon.</span>
          </div>
        </Card>
      </div>
    );
  }

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div>
      {/* Breadcrumb lokal SENGAJA TIDAK dipasang (keputusan §10.1) -- ContextHeader
          (route-table.jsx, layout bersama) sudah merender "Modul > Level 2 > Level 3"
          di atas halaman ini, pola sama LeadAssignmentPage.jsx. */}
      <PageHeader
        title={(
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Option Requests
            <Badge tone={TONE.orange}>New</Badge>
          </span>
        )}
        subtitle="Requests for a new option in a dropdown list, sent from Request new option. A Manager or above approves or rejects them. A Manager can also add an option directly in the dropdown without a request."
        right={(
          <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT }}>
            {pendingCount} pending {pendingCount === 1 ? 'request' : 'requests'}
          </span>
        )}
      />

      <Card style={{ marginBottom: SP.s4 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>Status</span>
            <Segmented ariaLabel="Option Requests status" value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Requested option, list, or requester" style={{ flex: '1 1 240px', maxWidth: 340 }} />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '3 1 640px', minWidth: 0 }}>
          <Card padded={false}>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
            ) : filteredRows.length === 0 ? (
              <EmptyState
                icon="inbox"
                title={statusFilter === 'pending' && !q.trim() ? 'No pending option requests' : 'No option request in this view.'}
              />
            ) : (
              <div className="nk-scroll" role="table" aria-label="Option Requests" style={{ overflowX: 'auto' }}>
                <div role="row" style={gridRow({ background: HEAD_BG })}>
                  {['Requested Option', 'List', 'Requested By', 'Role', 'Date', 'Reason', 'Status'].map((h) => (
                    <div key={h} role="columnheader" style={headCell}>{h}</div>
                  ))}
                </div>
                {filteredRows.map((r, i) => {
                  const active = r.id === selectedId;
                  const by = peopleMap[r.requested_by]?.name || '—';
                  const role = peopleMap[r.requested_by]?.role || '—';
                  return (
                    <div
                      key={r.id} role="row" tabIndex={0}
                      onClick={() => selectRow(r.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') selectRow(r.id); }}
                      style={gridRow({
                        cursor: 'pointer',
                        background: active ? ROW_HOVER : 'transparent',
                        boxShadow: active ? `inset 3px 0 0 ${INK_SOFT}` : 'none',
                        borderBottom: i < filteredRows.length - 1 ? `1px solid ${LINE_SOFT}` : 'none',
                      })}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = BG; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div role="cell" style={{ ...cell, fontWeight: 600 }}>{r.label}</div>
                      <div role="cell" style={cell}>{listLabel(r.list_key)}</div>
                      <div role="cell" style={cell}>{by}</div>
                      <div role="cell" style={{ ...cell, color: INK_SOFT }}>{role}</div>
                      <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, fontSize: 12.5, color: INK_SOFT }}>{fmtDate(r.requested_at)}</div>
                      <div role="cell" style={{ ...cell, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason || 'No reason given'}>
                        {r.reason || 'No reason given'}
                      </div>
                      <div role="cell" style={cell}><Badge tone={STATUS_TONE[r.status] || 'neutral'}>{STATUS_LABEL[r.status] || r.status}</Badge></div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <aside style={{ flex: '2 1 380px', minWidth: 320, position: 'sticky', top: 76 }}>
          <Card>
            {/* Blok aksi Approve/Reject menyusul Commit 3 -- lihat plan §8. */}
            <DetailPanel selected={selected} existingOptions={existingOptions} peopleMap={peopleMap} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function DetailPanel({ selected, existingOptions, peopleMap }) {
  if (!selected) {
    return <span style={{ color: INK_SOFT, fontFamily: FONT_BODY }}>Pick a request to review it.</span>;
  }
  const loc = isLocationList(selected.list_key);
  const label = selected.label;
  const trimmedLabel = label.trim().toLowerCase();
  const dup = selected.status === 'pending' && existingOptions.some((o) => o.toLowerCase() === trimmedLabel);
  const byName = peopleMap[selected.requested_by]?.name || '—';
  const byRole = peopleMap[selected.requested_by]?.role || '—';
  const reviewerName = peopleMap[selected.reviewed_by]?.name || '—';
  const exTitle = loc ? 'Active locations in Location Master' : `Existing options in ${listLabel(selected.list_key)}`;

  const fields = [
    { l: 'List', v: listLabel(selected.list_key), w: 600 },
    { l: 'Proposed label', v: label, w: 600 },
    { l: 'Requested by', v: `${byName}, ${byRole}`, w: 400 },
    { l: 'Date', v: fmtDate(selected.requested_at), w: 400 },
  ];

  const decisionNote = selected.status === 'approved' ? selected.approval_note : selected.status === 'rejected' ? selected.rejection_reason : null;
  const history = [
    { txt: `Requested by ${byName}, ${byRole}. ${selected.reason || 'No reason given'}`, when: fmtDate(selected.requested_at) },
    ...(selected.status !== 'pending'
      ? [{ txt: `${STATUS_LABEL[selected.status]} by ${reviewerName}${decisionNote ? '. ' + decisionNote : ''}`, when: fmtDate(selected.reviewed_at) }]
      : []),
  ].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT }}>Request new option</span>
          <b style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: INK }}>{label}</b>
        </div>
        <Badge tone={STATUS_TONE[selected.status] || 'neutral'}>{STATUS_LABEL[selected.status] || selected.status}</Badge>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map((f) => (
          <div key={f.l} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12 }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>{f.l}</span>
            <span style={{ fontWeight: f.w }}>{f.v}</span>
          </div>
        ))}
      </div>

      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: BG }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: '.04em' }}>{exTitle}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {existingOptions.map((o) => {
            const match = o.toLowerCase() === trimmedLabel;
            return <Badge key={o} tone={match ? SEMANTIC.warn : SEMANTIC.neutral}>{o}</Badge>;
          })}
        </div>
        {existingOptions.length === 0 && <span style={{ color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 12.5 }}>No options recorded for this list.</span>}
        {loc && <a href="#" onClick={(e) => e.preventDefault()} style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600 }}>Open Location Master</a>}
      </div>

      {dup && (
        <div style={{ padding: '10px 14px', background: SEMANTIC.warn.bg, border: `1px solid ${SEMANTIC.warn.bd}`, borderRadius: 10, color: SEMANTIC.warn.fg, fontFamily: FONT_BODY, fontSize: 12.5 }}>
          This option already exists in {listLabel(selected.list_key)}. Reject the request and ask the requester to pick the existing option.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: '.04em' }}>Reason from {byName}</span>
        <div style={{ padding: '10px 14px', background: BG, border: `1px solid ${LINE_SOFT}`, borderRadius: 10, color: selected.reason ? INK : INK_FAINT }}>
          {selected.reason || 'No reason given'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: '.04em' }}>History</span>
        {history.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: '#AFC9A0', marginTop: 6, flex: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: INK }}>{h.txt}</span>
              <span style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: INK_FAINT }}>{h.when}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

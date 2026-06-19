// src/modules/foundation/OrgStructurePage.jsx
// Nexus by MSI · Struktur Organisasi (Organization Chart)
// Ported from Claude Design "OrgChartPage" — dummy data replaced with Supabase.
// Top-down vertical tree built from profiles.reports_to. Search dims non-matches;
// clicking a node opens a "Atur Atasan" modal that re-parents the person via
// supabase.from('profiles').update({ reports_to }) and re-fetches the tree.
// Connector pseudo-elements (::before/::after) can't be inline styles, so a single
// scoped <style> block (.ocp) holds just those rules.
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/* ---------- entity colour schemes (keyed by company_id) ---------- */
const ENTITY = {
  '0e1840d8-e6fb-4190-bd09-88338e68b492': { color: '#144682', label: 'MSI' }, // navy
  '42569e7c-531b-4d2b-832a-d5a7268c455b': { color: '#E85A1E', label: 'JCI' }, // orange
  'd2e5e565-5f67-4954-b8d9-5979a2a0c697': { color: '#F08C7D', label: 'SOA' }, // coral
};
const FALLBACK_ENTITY = { color: '#6b7280', label: '—' };
const entityOf = (companyId) => ENTITY[companyId] || FALLBACK_ENTITY;

/* ---------- helpers ---------- */
function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function subtreeIds(rootId, childrenOf) {
  const out = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    (childrenOf[id] || []).forEach((k) => { out.add(k.id); stack.push(k.id); });
  }
  return out;
}

/* ---------- scoped CSS (connectors + a few pseudo/hover states) ---------- */
const TREE_CSS = `
.ocp, .ocp *{box-sizing:border-box;}
.ocp{font-family:'Inter',system-ui,sans-serif;}
.ocp .tree, .ocp .tree ul{display:flex;justify-content:center;list-style:none;margin:0;padding:0;position:relative;}
.ocp .tree ul{padding-top:34px;}
.ocp .tree li{position:relative;padding:34px 14px 0;display:flex;flex-direction:column;align-items:center;}
.ocp .tree li::before,
.ocp .tree li::after{content:'';position:absolute;top:0;right:50%;width:50%;height:34px;border-top:2px solid #D6DAE0;}
.ocp .tree li::after{right:auto;left:50%;border-left:2px solid #D6DAE0;}
.ocp .tree li:only-child::before,
.ocp .tree li:only-child::after{display:none;}
.ocp .tree li:first-child::before,
.ocp .tree li:last-child::after{border:0 none;}
.ocp .tree li:last-child::before{border-right:2px solid #D6DAE0;border-radius:0 7px 0 0;}
.ocp .tree li:first-child::after{border-radius:7px 0 0 0;}
.ocp .tree ul ul::before,
.ocp .tree > li > ul::before{content:'';position:absolute;top:0;left:50%;width:0;height:34px;border-left:2px solid #D6DAE0;}
.ocp .tree.root-tree > li{padding-top:0;}
.ocp .tree.root-tree > li::before,
.ocp .tree.root-tree > li::after{display:none;}
.ocp .node{transition:opacity .2s ease, transform .12s ease, filter .2s ease;}
.ocp .node:hover{transform:translateY(-2px);}
.ocp .node:hover .ocp-card{box-shadow:0 8px 28px rgba(16,24,40,.14),0 2px 6px rgba(16,24,40,.08);}
.ocp .search-input:focus{border-color:#144682!important;background:#fff!important;box-shadow:0 0 0 3px rgba(20,70,130,.12);}
.ocp .select:focus{border-color:#144682!important;background-color:#fff!important;box-shadow:0 0 0 3px rgba(20,70,130,.12);}
.ocp .btn-primary:hover{background:#103a6c!important;}
.ocp .btn-ghost:hover{background:#f6f7f9!important;}
.ocp .modal-close:hover{background:#f1f3f6!important;color:#1f2733!important;}
@keyframes ocpFade{from{opacity:0;}to{opacity:1;}}
@keyframes ocpPop{from{opacity:0;transform:translateY(8px) scale(.98);}to{opacity:1;transform:none;}}
`;

/* ---------- inline style objects ---------- */
const S = {
  page: { display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", minHeight: 520, background: "#f1f3f6", color: "#1f2733", border: "1px solid #D6DAE0", borderRadius: 16, overflow: "hidden" },
  toolbar: { flex: "0 0 auto", display: "flex", alignItems: "center", gap: 18, padding: "18px 26px", background: "#fff", borderBottom: "1px solid #D6DAE0", zIndex: 5, flexWrap: "wrap" },
  h1: { fontFamily: "'Montserrat',sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "-.2px", margin: 0, whiteSpace: "nowrap" },
  sub: { fontSize: 12.5, color: "#6b7280", marginTop: 2 },
  legend: { display: "flex", alignItems: "center", gap: 16 },
  legendItem: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#6b7280" },
  legendDot: { width: 11, height: 11, borderRadius: "50%", flex: "0 0 auto" },
  matchCount: { fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" },
  searchWrap: { position: "relative", marginLeft: "auto", width: 320, maxWidth: "42vw" },
  searchIcon: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none", display: "flex" },
  searchInput: { width: "100%", padding: "9px 34px 9px 36px", border: "1px solid #D6DAE0", borderRadius: 9, fontFamily: "inherit", fontSize: 13.5, color: "#1f2733", background: "#fbfcfd", outline: "none" },
  searchClear: { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: 0, background: "#e7eaef", color: "#6b7280", width: 20, height: 20, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  scroll: { flex: "1 1 auto", overflow: "auto", padding: "48px 60px 80px", backgroundImage: "radial-gradient(circle at 1px 1px, #dfe3ea 1px, transparent 0)", backgroundSize: "26px 26px" },
  inner: { display: "inline-block", minWidth: "100%" },
  centerState: { flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40, color: "#6b7280", fontSize: 14 },

  avatar: { flex: "0 0 48px", width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: ".3px", fontFamily: "'Montserrat',sans-serif", zIndex: 1, boxShadow: "0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.05)", marginRight: -10 },
  card: { position: "relative", background: "#fff", borderRadius: 12, boxShadow: "0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.05)", padding: "11px 16px 12px 20px", minWidth: 208, maxWidth: 248, textAlign: "left", transition: "box-shadow .15s ease" },
  name: { fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 14, lineHeight: 1.25, paddingRight: 42, letterSpacing: "-.1px" },
  title: { fontSize: 12.5, color: "#6b7280", marginTop: 2, lineHeight: 1.3, paddingRight: 8 },
  dept: { fontSize: 11, color: "#9ca3af", marginTop: 5, textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 500 },
  badge: { position: "absolute", top: 9, right: 10, fontSize: 10, fontWeight: 700, letterSpacing: ".6px", color: "#fff", padding: "2px 8px", borderRadius: 999, lineHeight: 1.4 },

  overlay: { position: "fixed", inset: 0, background: "rgba(17,24,39,.42)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24, animation: "ocpFade .15s ease" },
  modal: { background: "#fff", borderRadius: 16, boxShadow: "0 8px 28px rgba(16,24,40,.14),0 2px 6px rgba(16,24,40,.08)", width: 420, maxWidth: "100%", overflow: "hidden", animation: "ocpPop .16s cubic-bezier(.2,.8,.3,1)" },
  modalHead: { display: "flex", alignItems: "center", gap: 13, padding: "20px 22px 18px", borderBottom: "1px solid #D6DAE0" },
  mhText: { display: "flex", flexDirection: "column", minWidth: 0 },
  mhName: { fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 15 },
  mhSub: { fontSize: 12.5, color: "#6b7280", marginTop: 1 },
  modalClose: { marginLeft: "auto", border: 0, background: "transparent", cursor: "pointer", color: "#9ca3af", width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  modalBody: { padding: "20px 22px 8px" },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "#1f2733", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8, display: "block" },
  select: { width: "100%", padding: "11px 13px", border: "1px solid #D6DAE0", borderRadius: 10, fontFamily: "inherit", fontSize: 13.5, color: "#1f2733", background: "#fbfcfd", outline: "none", cursor: "pointer", appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.4' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" },
  fieldHint: { fontSize: 12, color: "#9ca3af", marginTop: 9, lineHeight: 1.4 },
  saveError: { fontSize: 12, color: "#B23227", marginTop: 12, lineHeight: 1.4 },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px 20px" },
  btn: { fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, padding: "9px 18px", borderRadius: 9, cursor: "pointer", border: "1px solid transparent", transition: "background .14s, border-color .14s" },
};

/* ---------- node ---------- */
function Node({ person, onClick, dimmed, hit }) {
  const ent = entityOf(person.company_id);
  const c = ent.color;
  const cardStyle = {
    ...S.card,
    borderLeft: `4px solid ${c}`,
    boxShadow: hit ? `0 0 0 3px ${hexA(c, 0.4)}, 0 8px 28px rgba(16,24,40,.14)` : S.card.boxShadow,
  };
  return (
    <div
      className="node"
      style={{ display: "flex", alignItems: "stretch", cursor: "pointer", position: "relative", opacity: dimmed ? 0.4 : 1, filter: dimmed ? "saturate(.6)" : "none" }}
      onClick={(e) => { e.stopPropagation(); onClick(person); }}
    >
      <div style={{ ...S.avatar, background: c }}>{initials(person.name)}</div>
      <div className="ocp-card" style={cardStyle}>
        <span style={{ ...S.badge, background: c }}>{ent.label}</span>
        <div style={{ ...S.name, color: c }}>{person.name}</div>
        <div style={S.title}>{person.title}</div>
        <div style={S.dept}>{person.dept}</div>
      </div>
    </div>
  );
}

/* ---------- recursive branch ---------- */
function Branch({ node, childrenOf, onClick, matchIds }) {
  const kids = childrenOf[node.id] || [];
  const dimmed = matchIds ? !matchIds.has(node.id) : false;
  const hit = matchIds ? matchIds.has(node.id) : false;
  return (
    <li>
      <Node person={node} onClick={onClick} dimmed={dimmed} hit={hit} />
      {kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Branch key={k.id} node={k} childrenOf={childrenOf} onClick={onClick} matchIds={matchIds} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ---------- modal — set reports_to ---------- */
function ReportsToModal({ person, people, childrenOf, saving, saveError, onSave, onClose }) {
  const [value, setValue] = useState(person.reportsTo || "__root__");
  const ent = entityOf(person.company_id);
  const c = ent.color;
  const blocked = subtreeIds(person.id, childrenOf); // self + descendants (prevents cycles)
  const options = people
    .filter((p) => !blocked.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ ...S.avatar, marginRight: 0, width: 44, height: 44, flexBasis: 44, fontSize: 14, background: c }}>{initials(person.name)}</div>
          <div style={S.mhText}>
            <div style={S.mhName}>{person.name}</div>
            <div style={S.mhSub}>{person.title} · {ent.label}</div>
          </div>
          <button className="modal-close" style={S.modalClose} onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </div>
        <div style={S.modalBody}>
          <label style={S.fieldLabel} htmlFor="ocp-reports-to">Atur Atasan</label>
          <select id="ocp-reports-to" className="select" style={S.select} value={value} onChange={(e) => setValue(e.target.value)} disabled={saving}>
            <option value="__root__">Tidak ada atasan (root)</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.title} ({entityOf(p.company_id).label})</option>
            ))}
          </select>
          <div style={S.fieldHint}>
            {value === "__root__"
              ? "Orang ini menjadi node level teratas (tanpa atasan)."
              : "Memindahkan orang ini beserta bawahannya ke bawah atasan terpilih."}
          </div>
          {saveError && <div style={S.saveError}>{saveError}</div>}
        </div>
        <div style={S.modalFoot}>
          <button className="btn-ghost" style={{ ...S.btn, background: "#fff", borderColor: "#D6DAE0", color: "#1f2733", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }} onClick={onClose} disabled={saving}>Batal</button>
          <button className="btn-primary" style={{ ...S.btn, background: "#144682", color: "#fff", opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }} onClick={() => onSave(person.id, value === "__root__" ? null : value)} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- page ---------- */
export default function OrgStructurePage() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Fetch active profiles + position/department name + entity (company_id).
  // profiles has no deleted_at — "active" is the `active` boolean (per CLAUDE.md).
  // company_id is taken from user_roles (active, earliest granted) per spec, with
  // a fallback to profiles.company_id when no active role row is visible (RLS).
  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, reports_to, company_id, position:positions(name), department:departments(name)')
        .eq('active', true)
        .order('full_name', { ascending: true })
        .limit(1000);
      if (pErr) throw pErr;

      const ids = (profs || []).map((p) => p.id);
      const urMap = {};
      if (ids.length) {
        const { data: urs } = await supabase
          .from('user_roles')
          .select('user_id, company_id, granted_at')
          .in('user_id', ids)
          .eq('is_active', true)
          .is('revoked_at', null)
          .order('granted_at', { ascending: true });
        (urs || []).forEach((u) => {
          if (!(u.user_id in urMap) && u.company_id) urMap[u.user_id] = u.company_id; // first wins
        });
      }

      setPeople((profs || []).map((p) => ({
        id: p.id,
        name: p.full_name || '—',
        title: p.position?.name || '—',
        dept: p.department?.name || '—',
        company_id: urMap[p.id] || p.company_id,
        reportsTo: p.reports_to || null,
      })));
    } catch (e) {
      setError(e.message || 'Gagal memuat struktur organisasi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const childrenOf = useMemo(() => {
    const map = {};
    people.forEach((p) => {
      if (p.reportsTo) (map[p.reportsTo] = map[p.reportsTo] || []).push(p);
    });
    return map;
  }, [people]);

  const roots = useMemo(() => people.filter((p) => !p.reportsTo), [people]);

  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!q) return null;
    return new Set(
      people
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.title.toLowerCase().includes(q) ||
            p.dept.toLowerCase().includes(q) ||
            entityOf(p.company_id).label.toLowerCase().includes(q)
        )
        .map((p) => p.id)
    );
  }, [q, people]);

  // Persist reports_to to DB, then re-fetch the tree. null = root (no superior).
  const handleSave = useCallback(async (id, newParent) => {
    setSaving(true);
    setSaveError(null);
    try {
      const { error: uErr } = await supabase
        .from('profiles')
        .update({ reports_to: newParent })
        .eq('id', id);
      if (uErr) throw uErr;
      setSelectedId(null);
      await fetchTree();
    } catch (e) {
      setSaveError(e.message || 'Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  }, [fetchTree]);

  const selected = selectedId ? people.find((p) => p.id === selectedId) : null;

  return (
    <div className="ocp" style={S.page}>
      <style>{TREE_CSS}</style>

      {/* toolbar */}
      <div style={S.toolbar}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h1 style={S.h1}>Struktur Organisasi</h1>
          <span style={S.sub}>Nexus · Struktur pelaporan grup</span>
        </div>
        <div style={S.legend}>
          {Object.values(ENTITY).map((e) => (
            <div style={S.legendItem} key={e.label}>
              <span style={{ ...S.legendDot, background: e.color }} />
              {e.label}
            </div>
          ))}
        </div>
        {matchIds && (
          <span style={S.matchCount}>
            {matchIds.size} hasil
          </span>
        )}
        <div style={S.searchWrap}>
          <span style={S.searchIcon}><Search size={16} /></span>
          <input
            className="search-input"
            style={S.searchInput}
            placeholder="Cari nama, jabatan, departemen, entitas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button style={S.searchClear} onClick={() => setQuery("")} aria-label="Bersihkan"><X size={13} /></button>
          )}
        </div>
      </div>

      {/* chart / states */}
      {loading ? (
        <div style={S.centerState}>Memuat struktur organisasi…</div>
      ) : error ? (
        <div style={S.centerState}>
          <span style={{ color: "#B23227" }}>{error}</span>
          <button className="btn-primary" style={{ ...S.btn, background: "#144682", color: "#fff" }} onClick={fetchTree}>Coba lagi</button>
        </div>
      ) : people.length === 0 ? (
        <div style={S.centerState}>Belum ada data karyawan aktif.</div>
      ) : roots.length === 0 ? (
        <div style={S.centerState}>Tidak ada node root — pastikan minimal satu orang tanpa atasan (reports_to kosong).</div>
      ) : (
        <div style={S.scroll}>
          <div style={S.inner}>
            <ul className="tree root-tree">
              {roots.map((root) => (
                <Branch key={root.id} node={root} childrenOf={childrenOf} onClick={(p) => { setSaveError(null); setSelectedId(p.id); }} matchIds={matchIds} />
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* modal */}
      {selected && (
        <ReportsToModal
          person={selected}
          people={people}
          childrenOf={childrenOf}
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          onClose={() => { if (!saving) { setSelectedId(null); setSaveError(null); } }}
        />
      )}
    </div>
  );
}

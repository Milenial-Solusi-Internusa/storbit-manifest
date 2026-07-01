// src/modules/logistics/PickingListPage.jsx
// Fase 2 — Picking List (list view). Design source: picking-list-mockup.jsx.
// Real data: listPickingLists() (picking_lists + embedded warehouse). Customer is
// resolved from a sp_no → customer map passed by App (groupedSP).
//
// Nexus rebrand tokens (navy #1B4D8A + pastel Logistic teal) — matches the mockup.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardList, Search, Circle, Package, CheckCircle2, AlertTriangle,
  ChevronRight, Home, RefreshCw,
} from 'lucide-react';
import { listPickingLists } from '../../lib/db';

// ─── Design tokens (Nexus rebrand — from nexus_home_v4) ────────────────────
const C = {
  navy: '#1B4D8A', navyD: '#143C6E',
  ink: '#212A37', mute: '#7E8899', faint: '#A6AEBD',
  orange: '#E8703D', bg: '#F2F5F9', card: '#FFFFFF', line: '#E8ECF2',
  teal: '#E5F2F4', tealI: '#3F8E9E',
  slate: '#EDF0F4', slateI: '#525E70',
  green: '#E7F4ED', greenI: '#479467',
  amber: '#FCF2E3', amberI: '#C0863A',
  rose: '#F9EBF2', roseI: '#B25E94',
};

const STATUS_MAP = {
  pending:     { label: 'Menunggu',       bg: C.slate, fg: C.slateI, icon: Circle },
  in_progress: { label: 'Sedang Diambil',  bg: C.amber, fg: C.amberI, icon: Package },
  done:        { label: 'Selesai',         bg: C.green, fg: C.greenI, icon: CheckCircle2 },
  cancelled:   { label: 'Dibatalkan',      bg: C.rose,  fg: C.roseI,  icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  const Icon = s.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.fg, fontWeight: 700, fontSize: 11.5,
      padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      <Icon size={12} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

function TopBar({ crumbs }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.mute, marginBottom: 4 }}>
      <Home size={13} />
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ChevronRight size={12} style={{ color: C.faint }} />
          <span style={{ color: i === crumbs.length - 1 ? C.ink : C.mute, fontWeight: i === crumbs.length - 1 ? 600 : 500 }}>{c}</span>
        </span>
      ))}
    </div>
  );
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function PickingListPage({ onOpenDetail, customerBySpNo = {}, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listPickingLists();
    if (error) {
      showToast?.(error.message || 'Gagal memuat picking list', 'error');
      setRows([]);
    } else {
      setRows(data);
    }
    setLoading(false);
  }, [showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      const cust = customerBySpNo[r.sp_no] || '';
      return (
        r.picking_no?.toLowerCase().includes(q) ||
        r.sp_no?.toLowerCase().includes(q) ||
        cust.toLowerCase().includes(q)
      );
    });
  }, [rows, search, customerBySpNo]);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
      <TopBar crumbs={['Daftar Pesanan (Storbit)', 'Picking List']} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList size={18} color={C.tealI} />
            </div>
            <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, color: C.ink, margin: 0 }}>
              Picking List
            </h1>
          </div>
          <p style={{ color: C.mute, fontSize: 13, marginTop: 6, marginLeft: 44 }}>
            Daftar pengambilan barang gudang dari SP yang sudah dikonfirmasi
          </p>
        </div>
        <button
          onClick={load}
          title="Muat ulang"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 11,
            color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} /> Muat ulang
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{
          flex: 1, maxWidth: 380, height: 40, background: C.card, border: `1px solid ${C.line}`,
          borderRadius: 11, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 9,
        }}>
          <Search size={15} color={C.faint} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nomor picking, SP, atau customer..."
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: C.ink, width: '100%' }}
          />
        </div>
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
        boxShadow: '0 1px 2px rgba(27,77,138,.04)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFC', borderBottom: `1px solid ${C.line}` }}>
              {['No. Picking', 'SP No', 'Customer', 'Gudang', 'Status', 'PIC', 'Dibuat'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '12px 16px', fontSize: 10.5, fontWeight: 700,
                  color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Memuat…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: C.mute, fontSize: 13 }}>
                {search ? 'Tidak ada picking list yang cocok.' : 'Belum ada picking list. Generate dari SP yang sudah dikonfirmasi.'}
              </td></tr>
            ) : filtered.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => onOpenDetail?.(row.id)}
                style={{
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.line}` : 'none',
                  cursor: 'pointer', transition: '.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12.5, fontWeight: 600, color: C.navy }}>
                  {row.picking_no}
                </td>
                <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12.5, color: C.ink }}>
                  {row.sp_no}
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: C.ink, fontWeight: 500 }}>{customerBySpNo[row.sp_no] || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 12.5, color: C.mute }}>{row.warehouses?.name || '—'}</td>
                <td style={{ padding: '14px 16px' }}><StatusBadge status={row.status} /></td>
                {/* PIC: assign feature deferred (Fase 5 role gudang) → placeholder */}
                <td style={{ padding: '14px 16px', fontSize: 12.5, color: C.mute }}>—</td>
                <td style={{ padding: '14px 16px', fontSize: 12, color: C.faint }}>{fmtDateTime(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

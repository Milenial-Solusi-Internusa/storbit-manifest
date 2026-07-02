// src/modules/logistics/DeliveryNotePage.jsx
// Fase 3 — Surat Jalan (list view). Mirrors PickingListPage.
// Nexus rebrand tokens. Customer resolved from sp_no → customer map (App groupedSP).

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck, Search, FileText, Send, CheckCircle2, AlertTriangle,
  ChevronRight, Home, RefreshCw,
} from 'lucide-react';
import { listDeliveryNotes } from '../../lib/db';

const C = {
  navy: '#1B4D8A', ink: '#212A37', mute: '#7E8899', faint: '#A6AEBD',
  orange: '#E8703D', bg: '#F2F5F9', card: '#FFFFFF', line: '#E8ECF2',
  teal: '#E5F2F4', tealI: '#3F8E9E',
  slate: '#EDF0F4', slateI: '#525E70',
  green: '#E7F4ED', greenI: '#479467',
  amber: '#FCF2E3', amberI: '#C0863A',
  rose: '#F9EBF2', roseI: '#B25E94',
};

const STATUS_MAP = {
  draft:       { label: 'Draft',            bg: C.slate, fg: C.slateI, icon: FileText },
  in_transit:  { label: 'Dalam Pengiriman',  bg: C.amber, fg: C.amberI, icon: Send },
  delivered:   { label: 'Terkirim',          bg: C.green, fg: C.greenI, icon: CheckCircle2 },
  cancelled:   { label: 'Dibatalkan',        bg: C.rose,  fg: C.roseI,  icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const st = STATUS_MAP[status] || STATUS_MAP.draft;
  const Icon = st.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st.bg, color: st.fg, fontWeight: 700, fontSize: 11.5, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      <Icon size={12} strokeWidth={2.5} /> {st.label}
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

export default function DeliveryNotePage({ onOpenDetail, customerBySpNo = {}, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listDeliveryNotes();
    if (error) { showToast?.(error.message || 'Gagal memuat surat jalan', 'error'); setRows([]); }
    else setRows(data);
    setLoading(false);
  }, [showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.do_no?.toLowerCase().includes(q) ||
      r.sp_no?.toLowerCase().includes(q) ||
      (customerBySpNo[r.sp_no] || '').toLowerCase().includes(q) ||
      (r.driver_name || '').toLowerCase().includes(q));
  }, [rows, search, customerBySpNo]);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%', padding: 28 }}>
      <TopBar crumbs={['Daftar Pesanan (Storbit)', 'Surat Jalan']} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={18} color={C.tealI} />
            </div>
            <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, color: C.ink, margin: 0 }}>Surat Jalan</h1>
          </div>
          <p style={{ color: C.mute, fontSize: 13, marginTop: 6, marginLeft: 44 }}>Dokumen pengiriman barang keluar gudang, dari picking list yang sudah selesai</p>
        </div>
        <button onClick={load} title="Muat ulang" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px', background: C.card, border: `1px solid ${C.line}`, borderRadius: 11, color: C.mute, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={14} /> Muat ulang
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, maxWidth: 380, height: 40, background: C.card, border: `1px solid ${C.line}`, borderRadius: 11, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 9 }}>
          <Search size={15} color={C.faint} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari no. surat jalan, SP, customer, driver..." style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: C.ink, width: '100%' }} />
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(27,77,138,.04)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFC', borderBottom: `1px solid ${C.line}` }}>
              {['No. Surat Jalan', 'SP No', 'Customer', 'Tujuan', 'Driver', 'Status', 'Dibuat'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 10.5, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: C.mute, fontSize: 13 }}>Memuat…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: C.mute, fontSize: 13 }}>
                {search ? 'Tidak ada surat jalan yang cocok.' : 'Belum ada surat jalan. Buat dari picking list yang sudah selesai (done).'}
              </td></tr>
            ) : filtered.map((row, i) => (
              <tr key={row.id} onClick={() => onOpenDetail?.(row.id)}
                style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.line}` : 'none', cursor: 'pointer', transition: '.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12.5, fontWeight: 600, color: C.navy }}>{row.do_no}</td>
                <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12.5, color: C.ink }}>{row.sp_no}</td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: C.ink, fontWeight: 500 }}>{row.customer_name || customerBySpNo[row.sp_no] || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 12.5, color: C.mute, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.destination_address || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 12.5, color: C.mute }}>{row.driver_name || '—'}</td>
                <td style={{ padding: '14px 16px' }}><StatusBadge status={row.status} /></td>
                <td style={{ padding: '14px 16px', fontSize: 12, color: C.faint }}>{fmtDateTime(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

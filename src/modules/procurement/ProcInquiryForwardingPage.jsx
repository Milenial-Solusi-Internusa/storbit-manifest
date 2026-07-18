// src/modules/procurement/ProcInquiryForwardingPage.jsx
// Node aktif nav Procurement: Inquiry / RFQ → Direct → Forwarding (MSI).
// List PRF read-only minimal (v1). Scope = RLS `prf_select` apa adanya (jangan dilonggarkan):
// sales lihat PRF miliknya; procurement/manager+ lihat se-company; super lintas-entitas.
import { useState, useEffect } from 'react';
import { ChevronLeft, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const BORDER = '#E8ECF2';
const HEAD = "'Montserrat',sans-serif";
const BODY = "'Inter',system-ui,sans-serif";

const SERVICE_LABEL = { sea: 'Sea', air: 'Air', inland: 'Inland', project: 'Project', custom: 'Custom' };
const BADGE = {
  DRAFT:        { bg: '#EEF0F3', fg: '#5E6675' },
  SUBMITTED:    { bg: '#E1ECF7', fg: '#2563EB' },
  ACKNOWLEDGED: { bg: '#FBF0DD', fg: '#B45309' },
  QUOTED:       { bg: '#E4F0E5', fg: '#1F8B4D' },
  CANCELLED:    { bg: '#FBE3E3', fg: '#C0392B' },
  EXPIRED:      { bg: '#EEF0F3', fg: '#5E6675' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

export default function ProcInquiryForwardingPage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch once on mount; initial state already loading=true/error=null (no sync setState here).
    let cancelled = false;
    supabase
      .from('prf')
      .select('id, prf_no, service_type, status, created_at, account_name_manual, account:accounts!prf_account_id_fkey(name), inquiry:inquiries!prf_inquiry_id_fkey(inquiry_no)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) { setError(e.message); setLoading(false); return; }
        setRows(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const th = { textAlign: 'left', padding: '10px 12px', fontFamily: HEAD, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8A8E7C', whiteSpace: 'nowrap', borderBottom: `1px solid ${BORDER}` };
  const td = { padding: '11px 12px', fontFamily: BODY, fontSize: 13, color: '#16243A', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 48px', fontFamily: BODY }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 18 }}
        >
          <ChevronLeft size={16} />Kembali
        </button>
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: ORANGE, marginBottom: 6 }}>
          Procurement · Inquiry / RFQ · Direct
        </div>
        <h1 style={{ fontFamily: HEAD, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: NAVY, margin: 0 }}>
          Forwarding (MSI)
        </h1>
        <p style={{ fontSize: 13.5, color: '#7E8899', marginTop: 6 }}>Daftar PRF (Price Request Form) yang diterbitkan.</p>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13.5, color: '#8A8E7C' }}>Memuat…</div>
        ) : error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13.5, color: '#C0392B' }}>Gagal memuat: {error}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <FileText size={28} color="#B9BEC9" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#5E6675' }}>Belum ada PRF</div>
            <div style={{ fontSize: 13, color: '#8A8E7C', marginTop: 4 }}>PRF yang diterbitkan dari inquiry akan muncul di sini.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['No', 'PRF No', 'Tanggal', 'Customer', 'Service Type', 'Status', 'Inquiry Asal'].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const b = BADGE[String(r.status).toUpperCase()] || BADGE.DRAFT;
                  const customer = r.account?.name || r.account_name_manual || '—';
                  return (
                    <tr key={r.id}>
                      <td style={{ ...td, color: '#8A8E7C' }}>{i + 1}</td>
                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: NAVY }}>{r.prf_no}</td>
                      <td style={{ ...td, color: '#5E6553' }}>{fmtDate(r.created_at)}</td>
                      <td style={td}>{customer}</td>
                      <td style={{ ...td, color: '#5E6553' }}>{SERVICE_LABEL[r.service_type] || r.service_type || '—'}</td>
                      <td style={td}>
                        <span style={{ padding: '3px 9px', borderRadius: 99, background: b.bg, color: b.fg, fontFamily: HEAD, fontSize: 10.5, fontWeight: 700 }}>{String(r.status).toUpperCase()}</span>
                      </td>
                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace', color: '#5E6553' }}>{r.inquiry?.inquiry_no || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

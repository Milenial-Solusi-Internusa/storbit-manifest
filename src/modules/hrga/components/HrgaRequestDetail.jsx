// src/modules/hrga/components/HrgaRequestDetail.jsx
// Read-only detail modal for a single HRGA Request.
// Sections: coloured header, 2-col info grid, line items table,
//           approval progress with role labels, approval trail.

import { useEffect } from 'react';
import { X, CheckCircle2, XCircle, RotateCcw, MessageSquare } from 'lucide-react';
import { useHrgaRequestDetail } from '../../../hooks/useHrgaRequests';

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────
const P = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  mint:         '#C8EFD9',
  mintDeep:     '#7FC9A0',
  rose:         '#F5C8D5',
  roseDeep:     '#D89AB0',
  lavender:     '#D8C5F0',
  lavenderDeep: '#A98FD8',
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
  sky:          '#C8E4F5',
  skyDeep:      '#8FBCD8',
  peach:        '#FFD4B8',
  peachDeep:    '#F5A78F',
};

const CATEGORY_COLOR = {
  ADM: { bg: P.lavender,  text: P.lavenderDeep, labelBg: 'rgba(168,143,216,0.18)' },
  AST: { bg: P.sky,       text: P.skyDeep,       labelBg: 'rgba(143,188,216,0.18)' },
  FAC: { bg: P.mint,      text: '#1A5C35',       labelBg: 'rgba(127,201,160,0.18)' },
  TRV: { bg: P.butter,    text: '#7A5C10',       labelBg: 'rgba(232,193,104,0.18)' },
  FIN: { bg: P.peach,     text: '#8C4A18',       labelBg: 'rgba(245,167,143,0.18)' },
  OFF: { bg: P.rose,      text: P.roseDeep,      labelBg: 'rgba(216,154,176,0.18)' },
};

const STATUS_CONFIG = {
  draft:              { label: 'Draft',           bg: 'rgba(45,42,40,0.08)', color: P.inkMute  },
  submitted:          { label: 'Submitted',       bg: P.sky,                  color: P.skyDeep  },
  under_review:       { label: 'In Review',       bg: P.butter,               color: '#7A5C10'  },
  revision_requested: { label: 'Revision Needed', bg: P.rose,                 color: P.roseDeep },
  revised:            { label: 'Revised',         bg: P.butter,               color: '#7A5C10'  },
  approved:           { label: 'Approved',        bg: P.mint,                 color: '#1A5C35'  },
  rejected:           { label: 'Rejected',        bg: P.rose,                 color: P.roseDeep },
  cancelled:          { label: 'Cancelled',       bg: 'rgba(45,42,40,0.08)', color: P.inkMute  },
  completed:          { label: 'Completed',       bg: P.mint,                 color: '#1A5C35'  },
  archived:           { label: 'Archived',        bg: 'rgba(45,42,40,0.08)', color: P.inkMute  },
};

const APPROVAL_ACTION_CONFIG = {
  approved:           { icon: CheckCircle2, color: '#1A5C35',  bg: P.mint     },
  rejected:           { icon: XCircle,      color: P.roseDeep, bg: P.rose     },
  revision_requested: { icon: RotateCcw,    color: '#7A5C10',  bg: P.butter   },
  noted:              { icon: MessageSquare,color: P.inkMute,  bg: P.lineSoft  },
};

// Role code → display label
const ROLE_LABEL = {
  supervisor:       'Supervisor',
  hrga:             'HRGA',
  it:               'IT',
  finance:          'Finance',
  finance_controller: 'Finance',
  admin:            'Admin',
  super_admin:      'Super Admin',
};
const roleLabel = (code) => ROLE_LABEL[code] || (code ? code.charAt(0).toUpperCase() + code.slice(1) : '?');

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ─────────────────────────────────────────────────────────────
// StatusBadge
// dark=true → white pill with dark text, for use on coloured header backgrounds
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status, dark = false }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: P.lineSoft, color: P.inkMute };
  const bg    = dark ? 'rgba(255,255,255,0.88)' : cfg.bg;
  const color = dark ? '#1a1a1a'                : cfg.color;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: bg, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// SectionTitle
// ─────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div
      className="text-[10px] uppercase tracking-[0.24em] font-bold mb-3"
      style={{ color: P.inkMute }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// InfoGrid — 2-column layout, label col tinted, value col plain
// ─────────────────────────────────────────────────────────────
function InfoGrid({ rows }) {
  // rows: [{ label, value, wide? }]
  return (
    <div
      className="rounded-2xl overflow-hidden text-sm"
      style={{ border: `1px solid ${P.line}` }}
    >
      {rows.map(({ label, value, node }, idx) => (
        <div
          key={label}
          className="grid"
          style={{
            gridTemplateColumns: '140px 1fr',
            borderBottom: idx < rows.length - 1 ? `1px solid ${P.line}` : 'none',
          }}
        >
          {/* Label cell — tinted */}
          <div
            className="px-4 py-3 flex items-start"
            style={{ background: P.lineSoft }}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-wide leading-5"
              style={{ color: P.inkSoft }}
            >
              {label}
            </span>
          </div>
          {/* Value cell — plain white */}
          <div
            className="px-4 py-3 flex items-start"
            style={{ background: 'white', color: P.ink }}
          >
            {node || (
              <span className="text-sm leading-5" style={{ color: value ? P.ink : P.inkMute }}>
                {value || '—'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ApprovalProgress — circles with role labels below
// ─────────────────────────────────────────────────────────────
function ApprovalProgress({ currentLevel, totalLevels, levelRoles, terminalStatus }) {
  const rejected  = terminalStatus === 'rejected';
  const cancelled = terminalStatus === 'cancelled';
  const approved  = terminalStatus === 'approved' || terminalStatus === 'completed';

  return (
    <div className="flex items-start gap-3">
      {Array.from({ length: totalLevels }).map((_, i) => {
        const lvl    = i + 1;
        const done   = approved ? true : (!rejected && !cancelled && lvl < currentLevel);
        const active = !rejected && !cancelled && !approved && lvl === currentLevel;
        const role   = levelRoles?.[lvl];

        const circleBg    = done   ? P.mint       : active ? P.lavender : P.lineSoft;
        const circleColor = done   ? '#1A5C35'    : active ? P.lavenderDeep : P.inkMute;
        const circleBorder= active ? `2px solid ${P.lavenderDeep}` : '2px solid transparent';

        // connector line between circles
        const showLine = i < totalLevels - 1;

        return (
          <div key={lvl} className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0 transition-all"
                style={{ background: circleBg, color: circleColor, border: circleBorder }}
              >
                {done ? '✓' : lvl}
              </div>
              {role && (
                <span
                  className="text-[10px] font-semibold text-center leading-tight"
                  style={{ color: active ? P.lavenderDeep : done ? '#1A5C35' : P.inkMute, maxWidth: 52 }}
                >
                  {roleLabel(role)}
                </span>
              )}
            </div>
            {showLine && (
              <div
                className="mt-4 flex-shrink-0"
                style={{
                  width: 20,
                  height: 2,
                  background: done ? P.mintDeep : P.line,
                  borderRadius: 1,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-8 py-6">
      <div className="h-4 w-32 rounded-xl animate-pulse" style={{ background: P.lineSoft }} />
      <div className="h-6 w-56 rounded-xl animate-pulse" style={{ background: P.lineSoft }} />
      <div className="h-4 w-72 rounded-xl animate-pulse" style={{ background: P.lineSoft }} />
      <div className="mt-4 h-36 rounded-2xl animate-pulse" style={{ background: P.lineSoft }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function HrgaRequestDetail({ open, requestId, onClose }) {
  const { data, loading, error } = useHrgaRequestDetail(open ? requestId : null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const rt       = data?.hrga_request_types;
  const catCode  = rt?.category_code;
  const catColor = CATEGORY_COLOR[catCode] || { bg: P.lineSoft, text: P.inkMute, labelBg: P.lineSoft };

  // Terminal statuses for the progress indicator
  const terminalStatus = ['rejected','cancelled','approved','completed','archived'].includes(data?.status)
    ? data.status : null;

  // Build info rows for InfoGrid
  const infoRows = data ? [
    { label: 'Diajukan oleh', value: data.requester_name || '—' },
    { label: 'Tipe Request',  value: rt?.type_name || '—' },
    { label: 'Keperluan',     value: data.subject },
    ...(data.description ? [{ label: 'Catatan', value: data.description }] : []),
    { label: 'Tgl. Dibutuhkan', value: formatDate(data.requested_date) },
    { label: 'Tgl. Disubmit',   value: formatDateTime(data.submitted_at) },
  ] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(45,42,40,0.40)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 720,
          maxHeight: 'calc(100svh - 48px)',
          background: 'white',
          borderRadius: 28,
          border: `1px solid ${P.line}`,
          boxShadow: '0 32px 80px rgba(45,42,40,0.22), 0 8px 24px rgba(45,42,40,0.10)',
        }}
      >

        {/* ── Coloured header band ── */}
        <div
          className="relative flex-shrink-0 px-8 pt-7 pb-6"
          style={{
            background: loading
              ? P.lineSoft
              : `linear-gradient(135deg, ${catColor.bg} 0%, ${catColor.bg}99 100%)`,
            borderBottom: `1px solid ${catColor.bg}`,
            minHeight: 110,
          }}
        >
          {/* Close button — top-right, always visible */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 flex items-center justify-center w-8 h-8 rounded-2xl transition-opacity hover:opacity-70"
            style={{ background: 'rgba(255,255,255,0.70)', backdropFilter: 'blur(4px)' }}
            aria-label="Tutup"
          >
            <X size={15} style={{ color: P.inkSoft }} />
          </button>

          {loading && <Skeleton />}

          {!loading && error && (
            <p className="text-sm font-medium" style={{ color: P.roseDeep }}>
              Gagal memuat detail request.
            </p>
          )}

          {!loading && data && (
            <>
              {/* Meta row: category chip · doc number · status */}
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {/* Category chip — white bg so text always readable */}
                <span
                  className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: 'rgba(255,255,255,0.80)', color: '#1a1a1a' }}
                >
                  {catCode} · {rt?.category_name}
                </span>
                {/* Doc number — monospaced pill */}
                <span
                  className="font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.80)', color: '#1a1a1a' }}
                >
                  {data.document_no}
                </span>
                <StatusBadge status={data.status} dark />
              </div>

              {/* Type name — always dark */}
              <h2
                className="font-display text-xl font-semibold tracking-tight leading-snug"
                style={{ color: '#1a1a1a' }}
              >
                {rt?.type_name}
              </h2>

              {/* Subject — always dark */}
              <p
                className="mt-1 text-sm leading-relaxed"
                style={{ color: '#1a1a1a', maxWidth: 540 }}
              >
                {data.subject}
              </p>
            </>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6">
          {!loading && data && (
            <div className="flex flex-col gap-7">

              {/* ── Informasi Request — 2-col grid ── */}
              <div>
                <SectionTitle>Informasi Request</SectionTitle>
                <InfoGrid rows={infoRows} />
              </div>

              {/* ── Approval Progress ── */}
              {data.total_levels >= 1 && (
                <div>
                  <SectionTitle>Approval Progress</SectionTitle>
                  <div
                    className="px-5 py-4 rounded-2xl"
                    style={{ background: P.lineSoft, border: `1px solid ${P.line}` }}
                  >
                    <ApprovalProgress
                      currentLevel={data.current_level}
                      totalLevels={data.total_levels}
                      levelRoles={data.level_roles}
                      terminalStatus={terminalStatus}
                    />
                  </div>
                </div>
              )}

              {/* ── Daftar Barang — always rendered so errors are visible ── */}
              <div>
                <SectionTitle>
                  Daftar Barang{data.items.length > 0 ? ` (${data.items.length} item)` : ''}
                </SectionTitle>
                {data.items.length === 0 ? (
                  <p className="text-sm px-1" style={{ color: P.inkMute }}>
                    Tidak ada item barang.
                  </p>
                ) : (
                  <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${P.line}` }}>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr style={{ background: P.lineSoft }}>
                          {[
                            { label: '#',           cls: 'w-8  text-center' },
                            { label: 'Nama Barang', cls: '' },
                            { label: 'Jumlah',      cls: 'w-20 text-right' },
                            { label: 'Satuan',      cls: 'w-20' },
                            { label: 'Keterangan',  cls: '' },
                          ].map(({ label, cls }) => (
                            <th
                              key={label}
                              className={`px-4 py-3 text-left text-[10px] uppercase tracking-widest font-bold ${cls}`}
                              style={{ color: P.inkMute }}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((item) => (
                          <tr
                            key={item.id}
                            style={{ borderTop: `1px solid ${P.lineSoft}` }}
                          >
                            <td
                              className="px-4 py-3 text-xs tabular-nums text-center"
                              style={{ color: P.inkMute }}
                            >
                              {item.line_no}
                            </td>
                            <td className="px-4 py-3 font-medium" style={{ color: P.ink }}>
                              {item.item_description}
                            </td>
                            <td
                              className="px-4 py-3 tabular-nums text-right"
                              style={{ color: P.inkSoft }}
                            >
                              {item.quantity % 1 === 0
                                ? Number(item.quantity)
                                : Number(item.quantity).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: P.inkSoft }}>
                              {item.unit || '—'}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: P.inkMute }}>
                              {item.notes || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Approval Trail ── */}
              <div>
                <SectionTitle>Approval Trail</SectionTitle>
                {data.approvals.length === 0 ? (
                  <p
                    className="text-sm px-1"
                    style={{ color: P.inkMute }}
                  >
                    Belum ada aksi approval.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.approvals.map((ap) => {
                      const cfg  = APPROVAL_ACTION_CONFIG[ap.action] ||
                        { icon: MessageSquare, color: P.inkMute, bg: P.lineSoft };
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={ap.id}
                          className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
                          style={{ background: cfg.bg, border: `1px solid ${P.line}` }}
                        >
                          <Icon
                            size={15}
                            style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold" style={{ color: P.ink }}>
                                {ap.approver_name || roleLabel(ap.approver_role)}
                              </span>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                                style={{ background: 'rgba(45,42,40,0.07)', color: P.inkSoft }}
                              >
                                {roleLabel(ap.approver_role)} · Lv.{ap.level}
                              </span>
                              <span
                                className="text-[10px] ml-auto tabular-nums"
                                style={{ color: P.inkMute }}
                              >
                                {formatDateTime(ap.actioned_at)}
                              </span>
                            </div>
                            {ap.comment && (
                              <p className="mt-1 text-sm leading-relaxed" style={{ color: P.inkSoft }}>
                                {ap.comment}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: `1px solid ${P.line}`, flexShrink: 0 }} />
        <div
          className="px-8 py-4 flex items-center justify-end flex-shrink-0"
          style={{ background: P.lineSoft, borderRadius: '0 0 28px 28px' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ background: 'white', color: P.inkSoft, border: `1.5px solid ${P.line}` }}
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}

// src/modules/crm/PipelineKanbanPage.jsx
// Kanban board — HTML5 native drag-and-drop (no external deps)
import { useState, useEffect, useCallback } from 'react';
import { BarChart2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  ok:        '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  warn:      '#9A6B0E', warnBg: '#F8ECCF', warnBd: '#E6CE94',
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
  purple:    '#6E4B8C', purpleBg: '#ECE3F4', purpleBd: '#D6C6E4',
  teal:      '#1F6B6B', tealBg: '#DCEBEA', tealBd: '#B2D4D3',
  orange:    '#A45A22', orangeBg: '#F6E8D6', orangeBd: '#E7CDA9',
};

const STAGES = [
  { key: 'NEW',         label: 'New',         colBg: '#F5F5F5', headerBg: C.neutralBg,  headerColor: C.neutral  },
  { key: 'CONTACTED',   label: 'Contacted',   colBg: '#EFF4FB', headerBg: C.infoBg,     headerColor: C.info     },
  { key: 'QUALIFIED',   label: 'Qualified',   colBg: '#EBF5F5', headerBg: C.tealBg,     headerColor: C.teal     },
  { key: 'PROPOSAL',    label: 'Proposal',    colBg: '#FBF6ED', headerBg: C.warnBg,     headerColor: C.warn     },
  { key: 'NEGOTIATION', label: 'Negotiation', colBg: '#FBF2EA', headerBg: C.orangeBg,   headerColor: C.orange   },
  { key: 'WON',         label: 'Won',         colBg: '#EAF4EC', headerBg: C.okBg,       headerColor: C.ok       },
  { key: 'LOST',        label: 'Lost',        colBg: '#FBF0EE', headerBg: C.dangerBg,   headerColor: C.danger   },
];

const SOURCE_LABELS = {
  digital_marketing: 'Digital',
  sales_visit:       'Visit',
  referral:          'Referral',
  event:             'Event',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function SourceBadge({ source }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 99,
      fontSize: 10, fontWeight: 700, letterSpacing: '.2px',
      background: C.surface2, color: C.inkSoft, border: `1px solid ${C.line}`,
    }}>
      {SOURCE_LABELS[source] || source || '—'}
    </span>
  );
}

function ProspectCard({ prospect, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('prospectId', prospect.id);
        onDragStart(prospect.id);
      }}
      style={{
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10,
        padding: '12px 14px', cursor: 'grab', boxShadow: '0 1px 4px rgba(35,41,30,.07)',
        transition: 'box-shadow .12s, transform .12s',
        userSelect: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(35,41,30,.13)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(35,41,30,.07)'; e.currentTarget.style.transform = 'none'; }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
        {prospect.name}
      </p>
      {prospect.pic_name && (
        <p style={{ margin: '0 0 8px', fontSize: 11.5, color: C.inkSoft }}>{prospect.pic_name}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SourceBadge source={prospect.source} />
        <span style={{ fontSize: 10.5, color: C.inkFaint }}>{fmtDate(prospect.created_at)}</span>
      </div>
    </div>
  );
}

function KanbanColumn({ stage, cards, onDrop, draggingId }) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsOver(false);
        const id = e.dataTransfer.getData('prospectId');
        if (id) onDrop(id, stage.key);
      }}
      style={{
        flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 0,
        borderRadius: 12,
        border: isOver ? `2px solid ${stage.headerColor}` : `2px solid transparent`,
        transition: 'border-color .12s',
      }}
    >
      {/* Column header */}
      <div style={{
        background: stage.headerBg, borderRadius: '10px 10px 0 0',
        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: `1px solid ${C.line}`, borderBottom: 'none',
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: stage.headerColor }}>
          {stage.label}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, minWidth: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 99, background: 'rgba(0,0,0,.08)', color: stage.headerColor,
        }}>
          {cards.length}
        </span>
      </div>

      {/* Cards area */}
      <div style={{
        flex: 1, background: isOver ? stage.colBg : C.surface2,
        borderRadius: '0 0 10px 10px', padding: 10,
        border: `1px solid ${C.line}`, borderTop: 'none',
        display: 'flex', flexDirection: 'column', gap: 8,
        minHeight: 200, transition: 'background .12s',
      }}>
        {cards.map(p => (
          <ProspectCard
            key={p.id}
            prospect={p}
            onDragStart={() => {}}
          />
        ))}
        {cards.length === 0 && !isOver && (
          <div style={{ padding: '20px 10px', textAlign: 'center', color: C.inkFaint, fontSize: 12, lineHeight: 1.5 }}>
            Drag prospect ke sini
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelineKanbanPage({ showToast }) {
  const { profile } = useAuth();
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState(null);

  const fetchProspects = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, name, pic_name, source, pipeline_stage, created_at')
        .eq('company_id', profile.company_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProspects(data || []);
    } catch (err) {
      showToast?.('Gagal memuat pipeline: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, showToast]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  const handleDrop = useCallback(async (prospectId, newStage) => {
    const prospect = prospects.find(p => p.id === prospectId);
    if (!prospect || prospect.pipeline_stage === newStage) return;

    // Optimistic update
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, pipeline_stage: newStage } : p));

    try {
      const { error } = await supabase
        .from('prospects')
        .update({ pipeline_stage: newStage, updated_by: profile.id })
        .eq('id', prospectId);
      if (error) throw error;
    } catch (err) {
      // Rollback
      setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, pipeline_stage: prospect.pipeline_stage } : p));
      showToast?.('Gagal memindah stage: ' + err.message, 'error');
    }
  }, [prospects, profile?.id, showToast]);

  const grouped = STAGES.reduce((acc, s) => {
    acc[s.key] = prospects.filter(p => (p.pipeline_stage || 'NEW') === s.key);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart2 size={20} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Pipeline / Leads</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>{prospects.length} prospect aktif</p>
          </div>
        </div>
        <button
          onClick={fetchProspects}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: C.inkFaint }}>Memuat pipeline…</div>
      ) : (
        <div
          style={{
            display: 'flex', gap: 12, overflowX: 'auto',
            paddingBottom: 16,
            // Custom scrollbar
            scrollbarWidth: 'thin',
            scrollbarColor: `${C.line} transparent`,
          }}
        >
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              cards={grouped[stage.key] || []}
              onDrop={handleDrop}
              draggingId={draggingId}
            />
          ))}
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 11.5, color: C.inkFaint, textAlign: 'center' }}>
        Drag kartu antar kolom untuk memindah pipeline stage. Perubahan tersimpan otomatis.
      </p>
    </div>
  );
}

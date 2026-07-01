/* =========================================================================
   HomeDashboard — Nexus beranda (restruktur-nexus).
   Replaces the old app-launcher grid: sidebar already exposes every module,
   so home is now a lightweight dashboard. Ported from nexus_home_v4.html.

   Rules:
   - All content is dummy/static (announcements & activity feed are placeholders
     until wired to MSI-Connect).
   - NO sensitive financial figures (outstanding AR, inventory value, revenue,
     Rp nominal) — product decision.
   - New palette (soft navy + pastels), lucide icons, Montserrat/Inter.
   ========================================================================= */
import { Plus, FileText, CheckCircle2, Megaphone, Clock, User, Receipt } from 'lucide-react';

const NAVY = '#1B4D8A';
const INK = '#212A37';
const MUTE = '#7E8899';
const FAINT = '#A6AEBD';
const ORANGE = '#E8703D';
const LINE = '#E8ECF2';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

// Dummy "Perlu tindakan" — action targets navigate into the relevant module.
// `gate` = the menu id whose access permission decides if the row shows (same
// gate as the sidebar). Interim gating for dummy data; when wired to real data
// this must instead filter by approval-assignment (is it actually the user's to act on).
const TASKS = [
  { gate: 'manifest', tone: ['#F0EBFB', '#7A5EBE'], icon: Receipt, title: 'Konfirmasi SP baru', sub: 'SP-894688 · Indomarco · 150 unit',
    actions: [{ label: 'Tinjau', kind: 'pri', to: 'manifest' }] },
  { gate: 'crm-customers-msi', tone: ['#E9F1FC', '#3D6BAB'], icon: User, title: 'Review akses customer', sub: 'Indomarco minta akses entitas MSI',
    actions: [{ label: 'Tinjau', kind: 'pri', to: 'crm-customers-msi' }] },
  { gate: 'quotation-draft', tone: ['#E7F4ED', '#479467'], icon: FileText, title: 'Setujui quotation', sub: 'QT-0412 · Martin · MSI',
    actions: [{ label: 'Tolak', kind: 'sec', to: 'quotation-draft' }, { label: 'Setujui', kind: 'pri', to: 'quotation-draft' }] },
];

const ANNOUNCEMENTS = [
  { title: 'Rapat SCM Forum bulanan', body: 'Seluruh manager SCM & BizDev diharapkan hadir, Jumat 09.00 di ruang utama.', meta: 'HCGA · 2 hari lalu' },
  { title: 'Pembaruan SOP pengiriman Storbit', body: 'SOP baru untuk proses kirim ke DC retail sudah tersedia di Dokumen.', meta: 'SCM · 4 hari lalu' },
];

const FEED = [
  { dot: '#7A5EBE', title: 'SP-894688 dibuat', meta: 'Gigih · 8 menit lalu' },
  { dot: NAVY, title: 'Quotation QT-0411 dikirim', meta: 'Ayumurni · 1 jam lalu' },
  { dot: '#479467', title: 'Rate sheet Q3 diperbarui', meta: 'Den · 3 jam lalu' },
  { dot: ORANGE, title: 'Notulen rapat SCM disimpan', meta: 'Faried · kemarin' },
  { dot: NAVY, title: 'Customer baru ditambahkan', meta: 'Maria · kemarin' },
];

function Panel({ children, delay }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 20,
      boxShadow: '0 1px 2px rgba(27,77,138,0.04)', animation: `homeRise .5s ${delay}s both`,
    }}>{children}</div>
  );
}

export default function HomeDashboard({ profile, currentRoleLabel, onNavigate, canNavigate }) {
  const nav = (id) => id && onNavigate?.(id);
  // Same access gate as the sidebar (canRenderPage → canSeeMenuItem). Default-allow
  // if no gate fn is passed so the page never hard-fails. Buttons for pages the
  // user can't reach are HIDDEN, not disabled.
  const can = (id) => (typeof canNavigate === 'function' ? !!canNavigate(id) : true);
  const firstName = (profile?.full_name || 'User').split(' ')[0];

  // Quick actions gated to the SAME permission as their target menu item.
  const QUICK = [
    { id: 'input',           label: 'Buat SP',        icon: Plus,     solid: true },
    { id: 'quotation-draft', label: 'Buat Quotation', icon: Plus },
    { id: 'crm-inquiry',     label: 'Catat Inquiry',  icon: FileText },
  ].filter(q => can(q.id));
  const visibleTasks = TASKS.filter(t => can(t.gate));

  return (
    <div style={{ padding: '6px 30px 46px', maxWidth: 1240, margin: '0 auto', fontFamily: "'Inter', system-ui, sans-serif", color: INK }}>
      <style>{`
        @keyframes homeRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .home-anim { animation: none !important; } }
        @media (max-width: 1040px) { .home-layout { grid-template-columns: 1fr !important; } }
        .home-qbtn { transition: background .18s, transform .1s; }
        .home-qbtn:hover { transform: translateY(-2px); }
      `}</style>

      {/* HERO */}
      <div className="home-anim" style={{
        position: 'relative', borderRadius: 22, padding: '28px 30px', marginBottom: 22, overflow: 'hidden',
        background: `linear-gradient(120deg, ${NAVY}, #205596 55%, #2A6196)`, animation: 'homeRise .55s .05s both',
      }}>
        <div style={{ position: 'absolute', right: -60, top: -70, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,112,61,.5), transparent 68%)' }} />
        <div style={{ position: 'absolute', right: 120, bottom: -90, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.1), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 26, color: '#fff', letterSpacing: '-.5px' }}>
            {greeting()}, {firstName}
          </div>
          <div style={{ color: '#C9D9EE', fontSize: 13.5, marginTop: 6 }}>
            Kamu masuk sebagai <b style={{ color: '#fff', fontWeight: 600 }}>Group</b> — <b style={{ color: '#fff', fontWeight: 600 }}>{visibleTasks.length} hal</b> menunggu tindakanmu hari ini.
          </div>
          {QUICK.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              {QUICK.map(q => {
                const QIcon = q.icon;
                return (
                  <button key={q.id} type="button" onClick={() => nav(q.id)} className="home-qbtn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 11, padding: '9px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#fff',
                      background: q.solid ? ORANGE : 'rgba(255,255,255,.14)',
                      border: q.solid ? '1px solid transparent' : '1px solid rgba(255,255,255,.18)' }}>
                    <QIcon size={15} strokeWidth={2.2} /> {q.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* LAYOUT */}
      <div className="home-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Perlu tindakan */}
          <Panel delay={0.12}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h4 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
                <CheckCircle2 size={17} style={{ color: NAVY }} /> Perlu tindakan
              </h4>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: ORANGE, background: '#FDEDE4', padding: '3px 9px', borderRadius: 9 }}>{visibleTasks.length}</span>
            </div>
            {visibleTasks.length === 0 && (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: MUTE }}>Tidak ada yang perlu tindakan.</div>
            )}
            {visibleTasks.map((t, i) => {
              const Ico = t.icon;
              return (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 0', borderBottom: i < visibleTasks.length - 1 ? '1px solid #F3F5F8' : 'none' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: t.tone[0], color: t.tone[1] }}>
                    <Ico size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>{t.title}</b>
                    <small style={{ color: MUTE, fontSize: 11.5 }}>{t.sub}</small>
                  </div>
                  <div style={{ alignSelf: 'center', display: 'flex', gap: 6 }}>
                    {t.actions.map((a, ai) => (
                      <button key={ai} type="button" onClick={() => nav(a.to)}
                        style={{ fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                          background: a.kind === 'pri' ? NAVY : '#EDF0F4', color: a.kind === 'pri' ? '#fff' : '#525E70' }}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </Panel>

          {/* Pengumuman */}
          <Panel delay={0.2}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h4 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
                <Megaphone size={17} style={{ color: NAVY }} /> Pengumuman
              </h4>
              <span style={{ fontSize: 11.5, color: MUTE, fontWeight: 500 }}>Semua →</span>
            </div>
            {ANNOUNCEMENTS.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: 13, borderRadius: 12, background: 'linear-gradient(100deg, #FDF4EC, #FCEEE4)', border: '1px solid #F6E0CF', marginBottom: i < ANNOUNCEMENTS.length - 1 ? 10 : 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ORANGE, flexShrink: 0 }}>
                  <Megaphone size={18} />
                </div>
                <div>
                  <b style={{ fontSize: 12.5, fontWeight: 600, display: 'block' }}>{a.title}</b>
                  <p style={{ fontSize: 11.5, color: MUTE, margin: '2px 0 0', lineHeight: 1.45 }}>{a.body}</p>
                  <small style={{ fontSize: 10.5, color: FAINT, display: 'block', marginTop: 4 }}>{a.meta}</small>
                </div>
              </div>
            ))}
          </Panel>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Panel delay={0.28}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h4 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
                <Clock size={17} style={{ color: NAVY }} /> Aktivitas terakhir
              </h4>
            </div>
            <div style={{ position: 'relative', paddingLeft: 19 }}>
              <div style={{ position: 'absolute', left: 5, top: 5, bottom: 5, width: 1.5, background: LINE }} />
              {FEED.map((f, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: i < FEED.length - 1 ? 15 : 0, fontSize: 12.5 }}>
                  <span style={{ position: 'absolute', left: -14, top: 4, width: 8, height: 8, borderRadius: '50%', background: f.dot, boxShadow: '0 0 0 3px #fff' }} />
                  <b style={{ fontWeight: 600 }}>{f.title}</b>
                  <small style={{ display: 'block', color: MUTE, fontSize: 11, marginTop: 1 }}>{f.meta}</small>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: FAINT }}>
        Login sebagai · {currentRoleLabel || 'User'} · MSI Group
      </div>
    </div>
  );
}

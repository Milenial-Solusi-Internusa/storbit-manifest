/* =========================================================================
   CrmV3DemoPage — etalase kelima primitif layout CRM v3 dengan data DUMMY.

   ⚠️ SENGAJA TIDAK DIDAFTARKAN ke NEXUS_NAV maupun ERP_MENU_GROUPS. Tidak ada
   route, tidak ada menu, tidak ada guard — halaman ini tak bisa dicapai user
   mana pun dari aplikasi berjalan. Cara membukanya saat mengembangkan v3:
   tempel import + render sementara di App.jsx, lalu CABUT lagi sebelum commit.

   Project ini tidak punya Storybook (dicek: nol file *.stories.*), jadi ini
   penggantinya — dan sengaja dibuat sebagai satu file yang gampang dihapus
   utuh saat komponen-komponennya sudah benar-benar dipasang di layar nyata.

   Nol panggilan Supabase. Chatter dirender dalam mode entity-tak-dikenal
   supaya demo tidak menulis apa pun ke DB — lihat catatan di bawah.
   ========================================================================= */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import FormSheet from '../FormSheet';
import StatusBar from '../StatusBar';
import Notebook from '../Notebook';
import ListView from '../ListView';
import Chatter from '../Chatter';
import { Badge, Card, PrimaryBtn, OutlineBtn, EmptyState } from '../kit';
import {
  LIFECYCLE_ORDER, DEAL_STATUS_ORDER, INK, INK_SOFT, FAINT, LINE,
  FONT_HEAD, FONT_BODY, FONT_MONO, SP, RADIUS, SURFACE,
} from '../tokens';

/* ---------- label dua sumbu ---------- */
const LIFECYCLE_LABEL = {
  lead: 'Lead', mql: 'MQL', prospect: 'Prospect', sql: 'SQL', customer: 'Customer',
  free_agent: 'Free Agent', lost: 'Lost',
};
const DEAL_LABEL = {
  OPEN: 'Open', IN_REVIEW: 'In Review', QUOTED: 'Quoted',
  NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled',
};

const stagesOf = (order, labels) => order.map((id) => ({ id, label: labels[id] }));

/* ---------- data dummy (nama entitas resmi) ---------- */
const DUMMY_ROWS = [
  { id: '1', no: 'INQ/MSI/BD/2026/0184', akun: 'PT Milenial Solusi Internusa', lini: 'Freight Forwarding', status: 'QUOTED', nilai: 148_500_000 },
  { id: '2', no: 'INQ/JCI/BD/2026/0091', akun: 'PT Jago Custom Indonesia',     lini: 'Customs',            status: 'IN_REVIEW', nilai: 62_000_000 },
  { id: '3', no: 'INQ/SOA/BD/2026/0212', akun: 'PT Stuja Orbit Abadi',         lini: 'Trading',            status: 'OPEN', nilai: 31_750_000 },
  { id: '4', no: 'INQ/MSI/BD/2026/0177', akun: 'PT Milenial Solusi Internusa', lini: 'Freight Forwarding', status: 'NEGOTIATION', nilai: 205_000_000 },
];

const DUMMY_LANES = [
  { id: 'OPEN',        label: 'Open',        items: [DUMMY_ROWS[2]] },
  { id: 'IN_REVIEW',   label: 'In Review',   items: [DUMMY_ROWS[1]] },
  { id: 'QUOTED',      label: 'Quoted',      items: [DUMMY_ROWS[0]] },
  { id: 'NEGOTIATION', label: 'Negotiation', items: [DUMMY_ROWS[3]] },
  { id: 'WON',         label: 'Won',         items: [], closed: true },
  { id: 'LOST',        label: 'Lost',        items: [], closed: true },
];

const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

function DemoSection({ n, title, note, children }) {
  return (
    <section style={{ marginBottom: SP.s7 }}>
      <div style={{ marginBottom: SP.s3 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: FAINT }}>
          Primitif {n}
        </div>
        <h2 style={{ margin: `${SP.s1}px 0 0`, fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 700, color: INK }}>{title}</h2>
        {note && <p style={{ margin: `${SP.s1}px 0 0`, fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT }}>{note}</p>}
      </div>
      <div style={{ padding: SP.s4, border: `1px dashed ${LINE}`, borderRadius: RADIUS.lg, background: SURFACE }}>
        {children}
      </div>
    </section>
  );
}

export default function CrmV3DemoPage() {
  const [tab, setTab] = useState('ringkasan');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('semua');
  const [isManager] = useState(false); // ubah manual untuk menguji gate Notebook

  const filtered = DUMMY_ROWS.filter(
    (r) => !search || r.akun.toLowerCase().includes(search.toLowerCase()) || r.no.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ padding: SP.s6, maxWidth: 1240, fontFamily: FONT_BODY, color: INK }}>
      <header style={{ marginBottom: SP.s7 }}>
        <h1 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: 26, fontWeight: 700, color: INK }}>
          CRM v3 — Etalase Primitif Layout
        </h1>
        <p style={{ margin: `${SP.s2}px 0 0`, fontFamily: FONT_BODY, fontSize: 13.5, color: INK_SOFT, maxWidth: 720 }}>
          Halaman internal, data dummy, nol panggilan Supabase. Tidak terdaftar di menu mana pun
          dan tidak memengaruhi layar produksi.
        </p>
      </header>

      {/* ── 2. StatusBar ── */}
      <DemoSection
        n="2" title="StatusBar"
        note="Generik: menerima daftar tahap + tahap sekarang, dirender sebagai chevron bersambung. Status tertutup BUKAN lagi ribbon pengganti bar — sejak 4 Sep 2026 ia penanda di ujung kanan yang hidup berdampingan dengan segmen (lihat varian gabungan paling bawah); tanpa `closed`, penanda berbunyi 'Not closed'."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s5 }}>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: FAINT, marginBottom: SP.s2 }}>
              lifecycle akun · current=prospect
            </div>
            <StatusBar stages={stagesOf(LIFECYCLE_ORDER, LIFECYCLE_LABEL)} current="prospect" />
          </div>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: FAINT, marginBottom: SP.s2 }}>
              status deal · current=QUOTED
            </div>
            <StatusBar stages={stagesOf(DEAL_STATUS_ORDER, DEAL_LABEL)} current="QUOTED" />
          </div>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: FAINT, marginBottom: SP.s2 }}>
              tertutup · WON (navy) / LOST (brick) / free_agent (slate)
            </div>
            <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap' }}>
              <StatusBar stages={[]} closed={{ stage: 'WON', label: 'Won' }} />
              <StatusBar stages={[]} closed={{ stage: 'LOST', label: 'Lost' }} />
              <StatusBar stages={[]} closed={{ stage: 'CANCELLED', label: 'Cancelled' }} />
              <StatusBar stages={[]} closed={{ stage: 'free_agent', label: 'Free Agent' }} />
            </div>
          </div>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: FAINT, marginBottom: SP.s2 }}>
              gabungan · segmen + penanda penutupan berdampingan (stages DAN closed)
            </div>
            <StatusBar
              stages={stagesOf(DEAL_STATUS_ORDER, DEAL_LABEL)}
              current="QUOTED"
              closed={{ stage: 'LOST', label: 'Lost' }}
            />
          </div>
        </div>
      </DemoSection>

      {/* ── 4. ListView ── */}
      <DemoSection
        n="4" title="ListView"
        note="Filter bar + saved view. Mode lanes punya varian lajur tertutup — Won & Lost menciut jadi rel tipis, klik untuk membuka."
      >
        <div style={{ marginBottom: SP.s6 }}>
          <ListView
            mode="table"
            search={search} onSearch={setSearch}
            savedViews={[
              { id: 'semua', label: 'Semua', count: DUMMY_ROWS.length },
              { id: 'milikku', label: 'Milik Saya', count: 2 },
              { id: 'aging', label: 'Lewat SLA', count: 1 },
            ]}
            activeView={view} onSelectView={setView}
            right={<OutlineBtn>Ekspor</OutlineBtn>}
            columns={[
              { key: 'no', label: 'Nomor', render: (r) => <span style={{ fontFamily: FONT_MONO, fontSize: 12.5 }}>{r.no}</span> },
              { key: 'akun', label: 'Akun' },
              { key: 'lini', label: 'Lini' },
              { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status}>{DEAL_LABEL[r.status]}</Badge> },
              { key: 'nilai', label: 'Nilai', align: 'right', render: (r) => rp(r.nilai) },
            ]}
            rows={filtered}
            emptyTitle="Tidak ada inquiry" emptySub="Coba ubah kata kunci pencarian."
          />
        </div>

        <ListView
          mode="lanes"
          lanes={DUMMY_LANES}
          renderCard={(it) => (
            <div style={{ padding: SP.s3, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, background: SURFACE }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: FAINT }}>{it.no}</div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: INK, marginTop: 2 }}>{it.akun}</div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT, marginTop: 2 }}>{rp(it.nilai)}</div>
            </div>
          )}
        />
      </DemoSection>

      {/* ── 1 + 3 + 5: FormSheet membungkus Notebook & Chatter ── */}
      <DemoSection
        n="1 · 3 · 5" title="FormSheet + Notebook + Chatter"
        note="FormSheet menyediakan tiga slot: header (nomor + status + aksi), body (Notebook), aside (Chatter). Tab 'Finance' digate manager — ubah isManager di kode untuk mengujinya."
      >
        <FormSheet
          kicker="Detail Inquiry"
          docNo="INQ/MSI/BD/2026/0184"
          title="PT Milenial Solusi Internusa"
          meta={<span style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT }}>Freight Forwarding · {rp(148_500_000)}</span>}
          status={<StatusBar stages={stagesOf(DEAL_STATUS_ORDER, DEAL_LABEL)} current="QUOTED" compact />}
          actions={<><OutlineBtn>Sunting</OutlineBtn><PrimaryBtn icon={<FileText size={14} />}>Buat Quotation</PrimaryBtn></>}
          aside={
            /* entityType sengaja 'demo' — Chatter menolak entity tak dikenal
               secara eksplisit, jadi halaman ini nol tulis ke DB. */
            <Chatter entityType="demo" entityId="dummy" companyId={null} entityLabel="0184" />
          }
        >
          <Notebook
            value={tab} onChange={setTab}
            tabs={[
              {
                id: 'ringkasan', label: 'Ringkasan',
                render: () => (
                  <Card title="Ringkasan">
                    <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.7 }}>
                      Rute Jakarta → Surabaya · FCL 2×40HC · Incoterm CIF.
                      <br />Slot ini nanti diisi konten tab yang sebenarnya.
                    </div>
                  </Card>
                ),
              },
              {
                id: 'dokumen', label: 'Dokumen',
                render: () => <Card title="Dokumen"><EmptyState title="Belum ada dokumen" sub="Quotation dan PRF akan muncul di sini." /></Card>,
              },
              {
                id: 'finance', label: 'Finance', gate: () => isManager,
                render: () => <Card title="Finance"><EmptyState title="Khusus manager" /></Card>,
              },
            ]}
          />
        </FormSheet>
      </DemoSection>
    </div>
  );
}

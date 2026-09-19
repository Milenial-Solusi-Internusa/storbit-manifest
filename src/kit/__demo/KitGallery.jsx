/* =========================================================================
   KitGallery — etalase SEMUA komponen kit tunggal dengan data DUMMY.

   ⚠️ SENGAJA TIDAK DI-ROUTE: tidak terdaftar di NEXUS_NAV/ERP_MENU_GROUPS,
   nol menu, nol guard — tak bisa dicapai user dari aplikasi berjalan. Cara
   membukanya saat mengembangkan kit: mount sementara (mis. cabang
   `?kit-gallery` di main.jsx) lalu CABUT sebelum commit. Pengganti Storybook
   (repo tak punya `*.stories.*`) dan sumber screenshot etalase tiap Batch DS.

   Nol panggilan Supabase. Label sumbu CRM (STATUS_LABEL dsb.) ditulis lokal
   di sini karena `src/modules/crm/dealStatus.js` baru lahir di Batch DS 3 —
   kit sendiri buta sumbu.
   ========================================================================= */

import { useState } from 'react';
import { Building2, FileText, Filter, MessageSquare, Plus, Save, Trash2 } from 'lucide-react';
import '../kit.css';
import {
  Button, SaveButton, IconButton,
  FloatingInput, FloatingSelect, Select, Textarea, SearchInput, Toggle, NumberStepper, Segmented, PillToggle, EntitySwitcher,
  PageHeader, SectionLabel, Card, EmptyState, Skeleton, DocNo, FormSheet, Notebook,
  Badge, StatusBar, ListView, Modal, SlideOver, Tooltip, DropZone, UploadBox, Icon, useToast,
} from '../index';
import {
  BG, CARD, ACCENT, ACCENT_HOVER, ACCENT_2, ACCENT_2_HOVER, LINE, INK, INK_SOFT, INK_FAINT,
  LINE_SOFT, HEAD_BG, ROW_HOVER, INPUT_BG, DISABLED_BG, WHITE,
  SEMANTIC, TONE, DEAL_STATUS, FONT_HEAD, FONT_BODY, FONT_MONO, SP, RADIUS, fmtRp,
} from '../tokens';
import { ENTITIES } from '../../lib/entities';

/* ---------- kosakata CRM lokal (demo) ---------- */
const LIFECYCLE_ORDER = ['lead', 'mql', 'prospect', 'sql', 'customer'];
const DEAL_STATUS_ORDER = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION', 'WON'];
const LIFECYCLE_LABEL = { lead: 'Lead', mql: 'MQL', prospect: 'Prospect', sql: 'SQL', customer: 'Customer', free_agent: 'Free Agent', lost: 'Lost' };
const DEAL_LABEL = { OPEN: 'Open', IN_REVIEW: 'In Review', QUOTED: 'Quoted', NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled' };
const stagesOf = (order, labels) => order.map((id) => ({ id, label: labels[id] }));

const DUMMY_ROWS = [
  { id: '1', no: 'INQ/MSI/BD/2026/0184', akun: 'PT Milenial Solusi Internusa', lini: 'Freight Forwarding', status: 'QUOTED', nilai: 148_500_000 },
  { id: '2', no: 'INQ/JCI/BD/2026/0091', akun: 'PT Jago Custom Indonesia', lini: 'Customs', status: 'IN_REVIEW', nilai: 62_000_000 },
  { id: '3', no: 'INQ/SOA/BD/2026/0212', akun: 'PT Stuja Orbit Abadi', lini: 'Trading', status: 'OPEN', nilai: 31_750_000 },
  { id: '4', no: 'INQ/MSI/BD/2026/0177', akun: 'PT Milenial Solusi Internusa', lini: 'Freight Forwarding', status: 'NEGOTIATION', nilai: 205_000_000 },
  { id: '5', no: 'INQ/MSI/BD/2026/0160', akun: 'PT Milenial Solusi Internusa', lini: 'Customs', status: 'WON', nilai: 98_000_000 },
];
const DUMMY_LANES = [
  { id: 'OPEN', label: 'Open', items: [DUMMY_ROWS[2]] },
  { id: 'IN_REVIEW', label: 'In Review', items: [DUMMY_ROWS[1]] },
  { id: 'QUOTED', label: 'Quoted', items: [DUMMY_ROWS[0]] },
  { id: 'NEGOTIATION', label: 'Negotiation', items: [DUMMY_ROWS[3]] },
  { id: 'WON', label: 'Won', items: [DUMMY_ROWS[4]], closed: true },
  { id: 'LOST', label: 'Lost', items: [], closed: true },
];

/* ---------- kontras WCAG (demo saja, untuk label swatch) ---------- */
const lum = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x + 0.05) / (y + 0.05)).toFixed(2); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const delay = (ms) => () => new Promise((resolve) => setTimeout(resolve, ms));

function Section({ n, title, note, children }) {
  return (
    <section id={`sec-${n}`} style={{ marginBottom: SP.s7 }}>
      <div style={{ marginBottom: SP.s3 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: INK_SOFT }}>Bagian {n}</div>
        <h2 style={{ margin: `${SP.s1}px 0 0`, fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 700, color: INK }}>{title}</h2>
        {note && <p style={{ margin: `${SP.s1}px 0 0`, fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT, maxWidth: 820 }}>{note}</p>}
      </div>
      <div style={{ padding: SP.s4, border: `1px dashed ${LINE}`, borderRadius: RADIUS.lg, background: CARD }}>{children}</div>
    </section>
  );
}

function Swatch({ name, hex, on = INK }) {
  return (
    <div style={{ width: 138, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, overflow: 'hidden', background: INPUT_BG }}>
      <div style={{ height: 56, background: hex, display: 'flex', alignItems: 'center', justifyContent: 'center', color: on, fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 12 }}>Aa</div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, color: INK }}>{name}</div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: INK_SOFT }}>{hex} · {cr(on, hex)}:1</div>
      </div>
    </div>
  );
}

function Row({ children, gap = SP.s2, wrap = true, align = 'center' }) {
  return <div style={{ display: 'flex', gap, flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: align }}>{children}</div>;
}

const SAMPLE_ICONS = ['building2', 'filetext', 'coins', 'gitbranch', 'bell', 'shield', 'clipboard', 'settings', 'plug', 'plus', 'check', 'x', 'pencil', 'trash', 'lock', 'upload', 'search', 'calendar', 'bank', 'percent', 'wallet', 'user', 'filter', 'download', 'key', 'zap', 'eye', 'layers'];

export default function KitGallery() {
  const [toast, toastNode] = useToast();
  const [tab, setTab] = useState('ringkasan');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('semua');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [slide, setSlide] = useState(false);
  const [entity, setEntity] = useState('MSI');
  const [seg, setSeg] = useState('table');
  const [on, setOn] = useState(true);
  const [num, setNum] = useState(14);
  const [pills, setPills] = useState({ MSI: true, JCI: false });
  const [text, setText] = useState('PT Milenial Solusi Internusa');
  const [mono, setMono] = useState('INQ/MSI/BD/2026/0184');
  const [sel, setSel] = useState('PT');
  const [note, setNote] = useState('');
  const [logo, setLogo] = useState(null);
  const [sig, setSig] = useState(null);
  const [lastErr, setLastErr] = useState('');

  const filtered = DUMMY_ROWS.filter((r) => !search || r.akun.toLowerCase().includes(search.toLowerCase()) || r.no.toLowerCase().includes(search.toLowerCase()));
  const columns = [
    { key: 'n', label: '#', render: (_r, i) => <span style={{ color: INK_SOFT }}>{i + 1}</span> },
    { key: 'no', label: 'Nomor', render: (r) => <DocNo>{r.no}</DocNo> },
    { key: 'akun', label: 'Akun' },
    { key: 'lini', label: 'Lini' },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={DEAL_STATUS[r.status]}>{DEAL_LABEL[r.status]}</Badge> },
    { key: 'nilai', label: 'Nilai', align: 'right', render: (r) => fmtRp(r.nilai) },
  ];
  const card = (it) => (
    <div style={{ padding: SP.s3, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, background: INPUT_BG }}>
      <DocNo style={{ fontSize: 11.5 }}>{it.no}</DocNo>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: INK, marginTop: 2 }}>{it.akun}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT, marginTop: 2 }}>{fmtRp(it.nilai)}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: BG, color: INK, fontFamily: FONT_BODY, padding: SP.s6 }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <header style={{ marginBottom: SP.s7 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: INK_SOFT }}>Nexus Kit · Batch DS 1</div>
          <h1 style={{ margin: `${SP.s1}px 0 0`, fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 700, color: INK }}>Etalase kit tunggal — palet sage, tiga font</h1>
          <p style={{ margin: `${SP.s2}px 0 0`, fontSize: 13.5, color: INK_SOFT, maxWidth: 760 }}>
            Halaman internal, data dummy, nol panggilan Supabase. Tidak di-route. Setiap swatch memuat rasio kontras teks di atasnya.
          </p>
        </header>

        {/* ── 1. Token ── */}
        <Section n="1" title="Token identitas & turunan" note="9 hex kebijakan A.1 + turunan (mix sRGB, nol hue baru). Angka = kontras INK di atas swatch; putih di atas aksen sengaja tidak dipakai (1,5–1,95:1).">
          <Row>
            <Swatch name="BG" hex={BG} /><Swatch name="CARD" hex={CARD} /><Swatch name="ACCENT" hex={ACCENT} /><Swatch name="ACCENT_HOVER" hex={ACCENT_HOVER} />
            <Swatch name="ACCENT_2" hex={ACCENT_2} /><Swatch name="ACCENT_2_HOVER" hex={ACCENT_2_HOVER} /><Swatch name="LINE" hex={LINE} />
            <Swatch name="INK" hex={INK} on={BG} /><Swatch name="INK_SOFT" hex={INK_SOFT} on={BG} />
          </Row>
          <div style={{ height: SP.s3 }} />
          <Row>
            <Swatch name="INK_FAINT" hex={INK_FAINT} on={BG} /><Swatch name="LINE_SOFT" hex={LINE_SOFT} /><Swatch name="HEAD_BG" hex={HEAD_BG} />
            <Swatch name="ROW_HOVER" hex={ROW_HOVER} /><Swatch name="INPUT_BG" hex={INPUT_BG} /><Swatch name="DISABLED_BG" hex={DISABLED_BG} on={INK_FAINT} />
          </Row>
          <div style={{ height: SP.s4 }} />
          <SectionLabel style={{ marginBottom: SP.s2 }}>Status / data — kelas terpisah</SectionLabel>
          <Row>
            {Object.entries(SEMANTIC).map(([k, t]) => <Swatch key={k} name={`SEMANTIC.${k}`} hex={t.bg} on={t.fg} />)}
            {Object.entries(TONE).map(([k, t]) => <Swatch key={k} name={`TONE.${k}`} hex={t.bg} on={t.fg} />)}
          </Row>
          <div style={{ height: SP.s3 }} />
          <Row>
            {Object.entries(DEAL_STATUS).map(([k, t]) => <Swatch key={k} name={`DEAL.${k}`} hex={t.bg} on={t.fg} />)}
            <Swatch name="WON solid (closed)" hex={DEAL_STATUS.WON.fg} on={WHITE} />
          </Row>
        </Section>

        {/* ── 2. Tipografi ── */}
        <Section n="2" title="Tipografi" note="Montserrat 700 heading · Montserrat 600 label/kontrol · Inter 400–500 isi · IBM Plex Mono angka & nomor.">
          <div style={{ display: 'grid', gap: SP.s3 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 30, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.15 }}>H1 dokumen 30/700 — PT Milenial Solusi Internusa</div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>H1 halaman 24/700 — Companies</div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700 }}>Judul modal 18/700</div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 700 }}>Judul kartu 13.5/700</div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: INK_SOFT }}>Kicker 11/700 uppercase</div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 15, lineHeight: 1.55 }}>Body dokumen Inter 15/400 — Rute Jakarta → Surabaya · FCL 2×40HC · Incoterm CIF. Teks paragraf memakai INK di atas BG (10,05:1).</div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13.5 }}>Body UI 13.5 — sel tabel, input, komentar. <span style={{ color: INK_SOFT }}>Subtitle INK_SOFT 13.</span> <span style={{ color: INK_FAINT }}>Placeholder INK_FAINT (3,2:1, bukan teks isi).</span></div>
            <div><DocNo>QUO/MSI/BD/2026/007</DocNo> <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 600, marginLeft: 16 }}>{fmtRp(148_500_000)}</span></div>
          </div>
        </Section>

        {/* ── 3. Tombol ── */}
        <Section n="3" title="Button · SaveButton · IconButton" note="Lima varian × tiga ukuran (md 40 / sm 32 / xs 28). SaveButton menunggu Promise: tombol kedua gagal (throw), ketiga mengembalikan { error } ala supabase-js — keduanya menampilkan keadaan GAGAL, bukan 'Tersimpan!'.">
          <div style={{ display: 'grid', gap: SP.s3 }}>
            {['md', 'sm', 'xs'].map((size) => (
              <Row key={size}>
                <span style={{ width: 28, fontFamily: FONT_MONO, fontSize: 11, color: INK_SOFT }}>{size}</span>
                <Button size={size} icon={<Plus size={14} />}>Primary</Button>
                <Button size={size} variant="secondary">Secondary</Button>
                <Button size={size} variant="outline" icon="pencil">Outline</Button>
                <Button size={size} variant="ghost">Ghost</Button>
                <Button size={size} variant="danger" icon={<Trash2 size={14} />}>Danger</Button>
                <Button size={size} loading>Loading</Button>
                <Button size={size} disabled>Disabled</Button>
              </Row>
            ))}
            <Row>
              <SaveButton onSave={delay(900)} />
              <SaveButton label="Gagal (throw)" onSave={async () => { await sleep(900); throw new Error('RLS: new row violates row-level security policy'); }} onError={(e) => setLastErr(String(e?.message || e))} />
              <SaveButton label="Gagal ({ error })" variant="secondary" onSave={async () => { await sleep(900); return { data: null, error: { message: 'permission denied for table companies' } }; }} onError={(e) => setLastErr(String(e?.message || e))} />
              <SaveButton label="Validasi (false)" onSave={() => false} />
              <SaveButton disabled />
              {lastErr && <span style={{ fontSize: 12, color: SEMANTIC.danger.fg }}>onError: {lastErr}</span>}
            </Row>
            <Row>
              <IconButton icon="pencil" label="Sunting" />
              <IconButton icon={<Trash2 size={18} />} label="Hapus" danger />
              <IconButton icon="filter" label="Filter" active />
              <IconButton icon="x" label="Tutup" variant="ghost" />
              <IconButton icon="refresh" label="Muat ulang" size="sm" />
              <IconButton icon="plus" label="Tambah" size="xs" />
              <IconButton icon="lock" label="Terkunci" disabled />
              <Tooltip label="Tooltip gelap, delay 150 ms"><Button variant="outline" size="sm">Hover: Tooltip</Button></Tooltip>
            </Row>
          </div>
        </Section>

        {/* ── 4. Form ── */}
        <Section n="4" title="Kontrol form" note="Latar input = INPUT_BG (= BG) supaya timbul di atas kartu; fokus = border INK_SOFT + ring. FloatingSelect kini punya disabled; FloatingInput punya maxLength & error.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: SP.s4 }}>
            <FloatingInput label="Nama perusahaan" value={text} onChange={setText} hint="Nama legal sesuai akta" />
            <FloatingInput label="Nomor dokumen" value={mono} onChange={setMono} mono maxLength={24} />
            <FloatingInput label="NPWP" value="" onChange={() => {}} placeholder="00.000.000.0-000.000" third />
            <FloatingInput label="Email" value="admin@msigroup.co.id" onChange={() => {}} third error="Format email tidak valid" />
            <FloatingInput label="Kode" value="MSI" onChange={() => {}} third disabled />
            <FloatingSelect label="Bentuk badan" value={sel} onChange={setSel} options={['PT', 'CV', 'Koperasi']} />
            <FloatingSelect label="Mata uang" value="IDR" onChange={() => {}} options={[{ value: 'IDR', label: 'IDR — Rupiah' }, { value: 'USD', label: 'USD' }]} disabled />
            <Textarea label="Catatan" value={note} onChange={setNote} placeholder="Tulis catatan…" hint="Maks 500 karakter" maxLength={500} />
          </div>
          <Row gap={SP.s3}>
            <Select value={seg} onChange={setSeg} options={[{ value: 'table', label: 'Tampilan tabel' }, { value: 'lanes', label: 'Tampilan papan' }]} icon={<Filter size={15} />} />
            <SearchInput value={search} onChange={setSearch} width={260} />
            <Toggle on={on} onChange={setOn} label="Aktif" /><Toggle on={!on} onChange={(v) => setOn(!v)} label="Kebalikan" /><Toggle on disabled label="Nonaktif" />
            <NumberStepper value={num} onChange={setNum} suffix="hari" />
          </Row>
          <div style={{ height: SP.s3 }} />
          <Row gap={SP.s3}>
            <Segmented options={[{ value: 'table', label: 'Tabel', icon: 'layout' }, { value: 'lanes', label: 'Papan', icon: 'layers' }, 'Kalender']} value={seg} onChange={setSeg} />
            <EntitySwitcher value={entity} onChange={setEntity} />
            <PillToggle label="MSI" active={pills.MSI} onClick={() => setPills((p) => ({ ...p, MSI: !p.MSI }))} />
            <PillToggle label="JCI" active={pills.JCI} onClick={() => setPills((p) => ({ ...p, JCI: !p.JCI }))} />
            <PillToggle label="SOA" active locked />
          </Row>
        </Section>

        {/* ── 5. Layout ── */}
        <Section n="5" title="PageHeader · SectionLabel · Card · EmptyState · Skeleton">
          <PageHeader
            crumbs={[{ label: 'Foundation', onClick: () => toast('Crumb diklik') }, { label: 'Master Data' }, { label: 'Companies' }]}
            title="Companies" subtitle="Data perusahaan/entitas dalam grup." onBack={() => toast('Kembali')}
            right={<><Button variant="outline" icon="refresh">Muat ulang</Button><Button icon="plus">Tambah</Button></>}
          />
          <div className="nx-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 }}>
            <Card title="Ringkasan" icon={<FileText size={15} />} right={<Button size="xs" variant="ghost" icon="pencil">Edit</Button>}>
              <SectionLabel style={{ marginBottom: SP.s2 }}>Identitas</SectionLabel>
              <div style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.7 }}>Kartu ber-header: header HEAD_BG, badan padding 16. Kartu tanpa bayangan — hierarki dari border.</div>
              <div style={{ marginTop: SP.s3, display: 'grid', gap: 8 }}><Skeleton w={220} /><Skeleton w={160} /><Skeleton w={190} h={10} /></div>
            </Card>
            <Card pad={24}>
              <EmptyState icon="inbox" title="Belum ada dokumen" sub="Quotation dan PRF akan muncul di sini." action={<Button size="sm" icon="plus">Buat dokumen</Button>} />
            </Card>
          </div>
        </Section>

        {/* ── 6. Badge & StatusBar ── */}
        <Section n="6" title="Badge · StatusBar" note="Badge rounded-square 11,5/700; tone = SEMANTIC / TONE / id sumbu / trio objek. StatusBar: dilewati ACCENT, aktif ACCENT_2, belum CARD; penanda penutupan memakai warna STATUS (WON navy tetap).">
          <Row>
            {Object.keys(SEMANTIC).map((k) => <Badge key={k} tone={k}>{k}</Badge>)}
            {Object.keys(TONE).map((k) => <Badge key={k} tone={k}>tone {k}</Badge>)}
            {Object.keys(DEAL_STATUS).map((k) => <Badge key={k} tone={DEAL_STATUS[k]}>{DEAL_LABEL[k]}</Badge>)}
            <Badge tone="customer">customer (STAGE_TONE)</Badge>
          </Row>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s5, marginTop: SP.s4 }}>
            <div><div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: INK_SOFT, marginBottom: SP.s2 }}>lifecycle · current=prospect</div><StatusBar stages={stagesOf(LIFECYCLE_ORDER, LIFECYCLE_LABEL)} current="prospect" /></div>
            <div><div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: INK_SOFT, marginBottom: SP.s2 }}>deal · current=QUOTED · compact</div><StatusBar stages={stagesOf(DEAL_STATUS_ORDER, DEAL_LABEL)} current="QUOTED" compact /></div>
            <div><div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: INK_SOFT, marginBottom: SP.s2 }}>closed=WON (semua tuntas)</div><StatusBar stages={stagesOf(DEAL_STATUS_ORDER, DEAL_LABEL)} current="WON" closed={{ stage: 'WON', label: 'Won' }} /></div>
            <div><div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: INK_SOFT, marginBottom: SP.s2 }}>closed=LOST berdampingan dengan segmen</div><StatusBar stages={stagesOf(DEAL_STATUS_ORDER, DEAL_LABEL)} current="QUOTED" closed={{ stage: 'LOST', label: 'Lost' }} /></div>
            <Row>
              <StatusBar stages={[]} closed={{ stage: 'CANCELLED', label: 'Cancelled' }} />
              <StatusBar stages={[]} closed={{ stage: 'free_agent', label: 'Free Agent' }} />
            </Row>
          </div>
        </Section>

        {/* ── 7. ListView ── */}
        <Section n="7" title="ListView — table · lanes · groupedBoard" note="Filter bar + saved view + skeleton + baris klik. Lajur Won/Lost menciut jadi rel; klik untuk membuka.">
          <div style={{ marginBottom: SP.s6 }}>
            <ListView
              mode="table" search={search} onSearch={setSearch} loading={loading} filterCard
              savedViews={[{ id: 'semua', label: 'All', count: DUMMY_ROWS.length }, { id: 'won', label: 'Won', bg: DEAL_STATUS.WON.bg, text: DEAL_STATUS.WON.fg, border: DEAL_STATUS.WON.bd, count: 1 }, { id: 'lost', label: 'Lost', color: TONE.brick.fg, count: 0 }]}
              activeView={view} onSelectView={setView}
              filters={<Select value="all" onChange={() => {}} options={[{ value: 'all', label: 'Semua entitas' }]} width={170} icon={<Building2 size={15} />} />}
              right={<Row><Button size="sm" variant="outline" onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>Simulasi loading</Button><Button size="sm" icon="download">Ekspor</Button></Row>}
              columns={columns} rows={view === 'won' ? filtered.filter((r) => r.status === 'WON') : view === 'lost' ? [] : filtered}
              onRowClick={(r) => toast(`Buka ${r.no}`)}
              emptyTitle="Tidak ada inquiry" emptySub="Coba ubah kata kunci pencarian."
            />
          </div>
          <div style={{ marginBottom: SP.s6 }}><ListView mode="lanes" lanes={DUMMY_LANES} renderCard={card} /></div>
          <ListView mode="lanes" lanes={DUMMY_LANES} renderCard={card} groupedBoard />
        </Section>

        {/* ── 8. FormSheet + Notebook ── */}
        <Section n="8" title="FormSheet + Notebook (+ aside)" note="Tiga slot: header (kicker/judul/docNo/actions/status/toolbar), body (Notebook ber-gate), aside sticky. Tab 'Finance' digate → tidak dirender.">
          <FormSheet
            kicker="Detail Inquiry" docNo="INQ/MSI/BD/2026/0184" title="PT Milenial Solusi Internusa"
            meta={<span style={{ fontSize: 13, color: INK_SOFT }}>Freight Forwarding · {fmtRp(148_500_000)}</span>}
            status={<StatusBar stages={stagesOf(DEAL_STATUS_ORDER, DEAL_LABEL)} current="QUOTED" compact />}
            actions={<><Button variant="outline">Sunting</Button><Button icon={<FileText size={14} />}>Buat Quotation</Button></>}
            toolbar={<Row><Button size="sm" variant="outline" icon="pencil">Set Value</Button><Button size="sm" variant="outline" icon="user">Change Owner</Button><Button size="sm" variant="outline" icon="filetext">Buat PRF</Button><Button size="sm" variant="danger" icon={<Trash2 size={13} />}>Batalkan</Button></Row>}
            aside={
              <Card title="Chatter" icon={<MessageSquare size={15} />} style={{ border: 'none', borderRadius: 0 }}>
                <div style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.6 }}>Slot aside — komentar tentang DOKUMEN, tetap ada saat pindah tab.</div>
                <div style={{ marginTop: SP.s3 }}><Textarea rows={2} placeholder="Tulis komentar… @mention" /></div>
                <div style={{ marginTop: SP.s2, display: 'flex', justifyContent: 'flex-end' }}><Button size="sm" icon={<Save size={13} />}>Kirim</Button></div>
              </Card>
            }
          >
            <Notebook
              value={tab} onChange={setTab}
              right={<Button size="xs" variant="ghost">Aksi tab</Button>}
              tabs={[
                { id: 'ringkasan', label: 'Ringkasan', icon: 'filetext', render: () => <Card title="Ringkasan"><div style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.7 }}>Rute Jakarta → Surabaya · FCL 2×40HC · Incoterm CIF.</div></Card> },
                { id: 'dokumen', label: 'Dokumen', dot: true, render: () => <Card title="Dokumen" padded={false}><EmptyState title="Belum ada dokumen" sub="Quotation dan PRF akan muncul di sini." /></Card> },
                { id: 'finance', label: 'Finance', gate: () => false, render: () => <Card title="Finance"><EmptyState title="Khusus manager" /></Card> },
              ]}
            />
          </FormSheet>
        </Section>

        {/* ── 9. Overlay & Upload & Toast ── */}
        <Section n="9" title="Modal · SlideOver · Upload · Toast">
          <Row>
            <Button variant="outline" onClick={() => setModal(true)}>Buka Modal</Button>
            <Button variant="outline" onClick={() => setSlide(true)}>Buka SlideOver</Button>
            <Button variant="secondary" onClick={() => toast('Tersimpan')}>Toast sukses</Button>
            <Button variant="secondary" onClick={() => toast('Gagal menyimpan', 'error')}>Toast error</Button>
            <Button variant="secondary" onClick={() => toast('Diproses ulang', 'refresh')}>Toast ikon registri</Button>
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4, marginTop: SP.s4 }} className="nx-grid-2">
            <DropZone value={logo} onChange={setLogo} />
            <Row gap={SP.s3} align="stretch"><UploadBox label="Tanda tangan" icon="pen" value={sig} onChange={setSig} /><UploadBox label="Stempel" icon="stamp" value={null} onChange={() => {}} /></Row>
          </div>
          <Modal open={modal} onClose={() => setModal(false)} title="Tambah Perusahaan" subtitle="Data entitas baru dalam grup."
            footer={<><Button variant="outline" onClick={() => setModal(false)}>Batal</Button><SaveButton onSave={async () => { await sleep(800); setModal(false); }} /></>}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <FloatingInput label="Kode" value="" onChange={() => {}} third mono /><FloatingInput label="Nama legal" value="" onChange={() => {}} full />
              <FloatingSelect label="Entitas" value="MSI" onChange={() => {}} options={ENTITIES.map((e) => ({ value: e.code, label: e.name }))} full />
            </div>
          </Modal>
          <SlideOver open={slide} onClose={() => setSlide(false)} title="Edit Cabang" subtitle="Cabang Semper · SOA"
            footer={<><Button variant="outline" onClick={() => setSlide(false)}>Batal</Button><SaveButton onSave={delay(800)} /></>}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <FloatingInput label="Nama cabang" value="Gudang Semper" onChange={() => {}} full /><FloatingInput label="Kota" value="Jakarta Utara" onChange={() => {}} />
              <FloatingInput label="Telepon" value="" onChange={() => {}} /><Textarea label="Alamat" value="" onChange={() => {}} rows={3} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}><Toggle on={on} onChange={setOn} label="Aktif" /><span style={{ fontSize: 13.5 }}>Cabang aktif</span></div>
            </div>
          </SlideOver>
        </Section>

        {/* ── 10. Icon & Entities ── */}
        <Section n="10" title="Icon (registri kompatibilitas) · ENTITIES tunggal" note="Registri 66 nama persis AdminKit; komponen baru impor Lucide langsung. ENTITIES dari src/lib/entities.js (code · UUID · nama legal).">
          <Row gap={SP.s3}>
            {SAMPLE_ICONS.map((n) => (
              <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 64, color: INK_SOFT }}>
                <Icon name={n} size={18} /><span style={{ fontFamily: FONT_MONO, fontSize: 9.5 }}>{n}</span>
              </div>
            ))}
          </Row>
          <div style={{ marginTop: SP.s4, display: 'grid', gap: 6 }}>
            {ENTITIES.map((e) => (
              <div key={e.code} style={{ display: 'flex', gap: SP.s3, alignItems: 'center', fontSize: 13 }}>
                <Badge tone="neutral">{e.code}</Badge><span style={{ fontFamily: FONT_MONO, fontSize: 12, color: INK_SOFT }}>{e.id}</span><span>{e.name}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      {toastNode}
    </div>
  );
}

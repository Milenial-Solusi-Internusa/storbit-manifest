// src/modules/finance/ArAgingPage.jsx
// Finance > Accounts Receivable > AR Aging (6.2.3).
//
// Umur piutang yang belum tertagih, dari sumbu `due_date` (TTF + termin) --
// BUKAN dari dokumen lama "Outstanding" (status dokumen SP, sudah dipensiunkan,
// lihat TD/PROGRESS terkait penyatuan modul Finance).
//
// Data + formula sisa/bucket dari collectionData.js (dipakai bersama Payment &
// Collection Tracking) -- SATU muatan, nol fetch ulang saat memilih filter:
// klik angka di strip kelompok umur ATAU di tabel ringkasan cukup mengubah
// state filter lokal, menyaring array yang sudah ada di memori.
//
// Keluarga token: ungu/serif Storbit (lihat catatan di financeKit.jsx).
import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, Users } from 'lucide-react';
import useOpenInvoicesForCollection, { AGING_BUCKETS } from './collectionData.js';
import { STATUS_LABEL_SHORT, STATUS_TAG } from './invoiceStatus.js';
import { PageHead, Btn, Panel, TableShell, Td, Notice, Hint, Empty } from './financeKit.jsx';
import { C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, rp, fmtDate } from '../logistics/spDetailTokens.js';
import { Badge } from '../logistics/spDetailKit.jsx';

/** Tabel ringkas customer/entitas x kelompok umur. Klik nama -> saring ke
 *  identitas itu (lintas kelompok); klik satu angka -> saring ke identitas
 *  ITU dan kelompok ITU sekaligus (drill-down presisi). */
function RingkasanTable({ title, icon, rows, activeId, activeBucket, onPickId, onPickCell }) {
  return (
    <Panel title={title} icon={icon}>
      {rows.length === 0 ? (
        <Hint>Tidak ada invoice terbuka.</Hint>
      ) : (
        <TableShell
          minWidth={620}
          head={[['Nama'], ...AGING_BUCKETS.map((b) => [b.label, 'right']), ['Total', 'right']]}
        >
          {rows.map((r) => {
            const aktifBaris = activeId === r.id;
            return (
              <tr key={r.id}>
                <Td
                  nowrap
                  style={{ cursor: 'pointer', color: aktifBaris ? C.accent : C.ink, fontWeight: aktifBaris ? 700 : 500 }}
                  onClick={() => onPickId(r.id)}
                >
                  {r.nama}
                </Td>
                {AGING_BUCKETS.map((b) => {
                  const nilai = r[b.key] || 0;
                  const aktifSel = aktifBaris && activeBucket === b.key;
                  return (
                    <Td
                      key={b.key} align="right" mono
                      style={nilai > 0
                        ? { cursor: 'pointer', color: aktifSel ? C.accent : C.inkSoft, fontWeight: aktifSel ? 700 : 400 }
                        : { color: C.inkFaint }}
                      onClick={() => nilai > 0 && onPickCell(r.id, b.key)}
                    >
                      {nilai > 0 ? rp(nilai) : '—'}
                    </Td>
                  );
                })}
                <Td align="right" mono style={{ fontWeight: 700 }}>{rp(r.total)}</Td>
              </tr>
            );
          })}
        </TableShell>
      )}
    </Panel>
  );
}

export default function ArAgingPage({ onOpenInvoice }) {
  const { invoices, loading, error, reload } = useOpenInvoicesForCollection();
  // identityKind: 'customer' | 'entitas' | null -- hanya satu dimensi identitas
  // aktif sekaligus, supaya hasil filter tidak pernah jadi irisan kosong tanpa
  // penjelasan (satu customer biasanya SP-nya memang satu entitas).
  const [filter, setFilter] = useState({ identityKind: null, identityId: null, bucket: null });
  const resetFilter = () => setFilter({ identityKind: null, identityId: null, bucket: null });

  const setBucketOnly = (key) => setFilter((f) => ({ ...f, bucket: f.bucket === key ? null : key }));
  const pickCustomer = (id) => setFilter((f) => (f.identityKind === 'customer' && f.identityId === id
    ? { identityKind: null, identityId: null, bucket: f.bucket }
    : { identityKind: 'customer', identityId: id, bucket: f.bucket }));
  const pickCustomerCell = (id, bucket) => setFilter({ identityKind: 'customer', identityId: id, bucket });
  const pickEntitas = (id) => setFilter((f) => (f.identityKind === 'entitas' && f.identityId === id
    ? { identityKind: null, identityId: null, bucket: f.bucket }
    : { identityKind: 'entitas', identityId: id, bucket: f.bucket }));
  const pickEntitasCell = (id, bucket) => setFilter({ identityKind: 'entitas', identityId: id, bucket });

  const perBucket = useMemo(() => {
    const m = {};
    AGING_BUCKETS.forEach((b) => { m[b.key] = { count: 0, sisa: 0 }; });
    invoices.forEach((inv) => { m[inv.bucket].count += 1; m[inv.bucket].sisa += inv.sisa; });
    return m;
  }, [invoices]);

  const perCustomer = useMemo(() => {
    const m = new Map();
    invoices.forEach((inv) => {
      const id = inv.sp_orders?.customer_id;
      if (!id) return;
      if (!m.has(id)) {
        const baris = { id, nama: inv.sp_orders?.accounts?.name || '—', total: 0 };
        AGING_BUCKETS.forEach((b) => { baris[b.key] = 0; });
        m.set(id, baris);
      }
      const baris = m.get(id);
      baris[inv.bucket] += inv.sisa;
      baris.total += inv.sisa;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [invoices]);

  const perEntitas = useMemo(() => {
    const m = new Map();
    invoices.forEach((inv) => {
      const id = inv.company_id;
      if (!id) return;
      if (!m.has(id)) {
        const baris = { id, nama: inv.companies?.name || inv.companies?.code || '—', total: 0 };
        AGING_BUCKETS.forEach((b) => { baris[b.key] = 0; });
        m.set(id, baris);
      }
      const baris = m.get(id);
      baris[inv.bucket] += inv.sisa;
      baris.total += inv.sisa;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [invoices]);

  const tersaring = useMemo(() => invoices.filter((inv) => {
    if (filter.bucket && inv.bucket !== filter.bucket) return false;
    if (filter.identityKind === 'customer' && inv.sp_orders?.customer_id !== filter.identityId) return false;
    if (filter.identityKind === 'entitas' && inv.company_id !== filter.identityId) return false;
    return true;
  }).sort((a, b) => b.sisa - a.sisa), [invoices, filter]);

  const adaFilter = !!(filter.bucket || filter.identityKind);
  const totalTersaring = tersaring.reduce((s, r) => s + r.sisa, 0);

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.ink, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
      <PageHead
        kicker="Accounts Receivable"
        title="AR Aging"
        sub="Umur piutang terbuka, dihitung dari tanggal jatuh tempo (TTF + termin pembayaran)."
        right={<Btn onClick={reload} disabled={loading}>{loading ? 'Memuat…' : 'Muat Ulang'}</Btn>}
      />

      {error && (
        <Notice tone="danger" icon={AlertTriangle}>
          Data gagal dimuat: {error.message || 'penyebab tidak diketahui'}
        </Notice>
      )}

      {/* ── Strip kelompok umur ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: SP.s3 }}>
        {AGING_BUCKETS.map((b) => {
          const d = perBucket[b.key] || { count: 0, sisa: 0 };
          const aktif = filter.bucket === b.key;
          const lewatTempo = !['belum_ttf', 'belum_jatuh_tempo'].includes(b.key);
          return (
            <button
              key={b.key} type="button" onClick={() => setBucketOnly(b.key)}
              style={{
                textAlign: 'left', cursor: 'pointer',
                border: `1px solid ${aktif ? C.accent : C.lineSoft}`,
                borderRadius: RADIUS.md, padding: SP.s3, background: aktif ? C.accentSoft : C.surface,
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkSoft }}>{b.label}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 700, color: lewatTempo && d.sisa > 0 ? C.danger : C.ink }}>
                {rp(d.sisa)}
              </div>
              <div style={{ fontSize: 12, color: C.inkSoft }}>{d.count} invoice</div>
            </button>
          );
        })}
      </div>

      {adaFilter && (
        <div>
          <Btn size="sm" variant="ghost" onClick={resetFilter}>Hapus semua filter</Btn>
        </div>
      )}

      {/* ── Ringkasan per customer & per entitas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: SP.s3 }}>
        <RingkasanTable
          title="Per Customer" icon={Users} rows={perCustomer}
          activeId={filter.identityKind === 'customer' ? filter.identityId : null}
          activeBucket={filter.bucket}
          onPickId={pickCustomer} onPickCell={pickCustomerCell}
        />
        <RingkasanTable
          title="Per Entitas" icon={Building2} rows={perEntitas}
          activeId={filter.identityKind === 'entitas' ? filter.identityId : null}
          activeBucket={filter.bucket}
          onPickId={pickEntitas} onPickCell={pickEntitasCell}
        />
      </div>

      {/* ── Daftar invoice tersaring — HANYA muncul sesudah ada filter ── */}
      {adaFilter ? (
        <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden', background: C.surface }}>
          <div style={{
            padding: `${SP.s2}px ${SP.s3}px`, borderBottom: `1px solid ${C.lineSoft}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SP.s2,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Daftar Invoice (tersaring)</span>
            <span style={{ fontSize: 12, color: C.inkSoft }}>
              {tersaring.length} invoice ·{' '}
              <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.ink }}>{rp(totalTersaring)}</span>
            </span>
          </div>
          {loading ? (
            <p style={{ padding: SP.s3, fontSize: 13, color: C.inkFaint, margin: 0 }}>Memuat…</p>
          ) : tersaring.length === 0 ? (
            <Empty icon={AlertTriangle} title="Tidak ada invoice pada tampilan ini" sub="Coba hapus filter di atas."/>
          ) : (
            <div style={{ padding: SP.s3 }}>
              <TableShell
                minWidth={960}
                head={[['Entitas'], ['No. Invoice'], ['Customer'], ['Jatuh Tempo'], ['Kelompok'], ['Sisa', 'right'], ['Status']]}
              >
                {tersaring.map((r) => {
                  const label = AGING_BUCKETS.find((b) => b.key === r.bucket)?.label || r.bucket;
                  return (
                    <tr
                      key={r.id} onClick={() => onOpenInvoice?.(r.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenInvoice?.(r.id); } }}
                      tabIndex={0} role="button" title="Buka detail invoice"
                      style={{ cursor: 'pointer' }}
                    >
                      <Td nowrap style={{ color: C.inkSoft }}>{r.companies?.code || r.companies?.name || '—'}</Td>
                      <Td mono nowrap style={r.invoice_no ? { color: C.accent, fontWeight: 600 } : { color: C.inkFaint }}>
                        {r.invoice_no || 'Menunggu nomor'}
                      </Td>
                      <Td>{r.sp_orders?.accounts?.name || '—'}</Td>
                      <Td nowrap>{r.due_date ? fmtDate(r.due_date) : 'Belum TTF'}</Td>
                      <Td nowrap>{label}{r.hariTelat > 0 ? ` (${r.hariTelat} hari)` : ''}</Td>
                      <Td align="right" mono>{rp(r.sisa)}</Td>
                      <Td nowrap>
                        <Badge {...(STATUS_TAG[r.status] || STATUS_TAG.issued)}>{STATUS_LABEL_SHORT[r.status] || r.status}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </TableShell>
            </div>
          )}
        </div>
      ) : (
        <Empty
          title="Pilih kelompok umur, customer, atau entitas"
          sub="Klik salah satu kartu di atas, atau nama/sel di tabel ringkasan, untuk melihat daftar invoicenya."
        />
      )}
    </div>
  );
}

// src/routes/RecordNotFound.jsx
// Batch FS Fase 2.5 G2 — keadaan "record tidak ada" untuk rute detail ber-`:id`.
// Sebelum G2 halaman detail hanya bisa dicapai dengan MENGKLIK barisnya, jadi
// id-nya selalu sah; sejak alamatnya bisa diketik/di-bookmark, id salah atau
// record terhapus jadi kelas kegagalan baru (checklist `scripts/qa/README.md`
// butir 4: harus keadaan yang wajar, bukan layar putih).
//
// Dipakai HANYA oleh wrapper rute yang halamannya belum punya penanganan
// sendiri. Halaman yang sudah punya (mis. PickingListDetailPage → "Picking list
// tidak ditemukan.") tetap memakai miliknya — tampilan di sini sengaja meniru
// pola itu supaya keduanya tidak terasa seperti dua aplikasi berbeda.
import { ChevronLeft } from 'lucide-react';

export default function RecordNotFound({ label, onBack, backLabel = 'Kembali ke daftar' }) {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none',
          border: 'none', padding: 0, marginBottom: 18, cursor: 'pointer',
          color: '#4A5360', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        }}
      >
        <ChevronLeft size={14} /> {backLabel}
      </button>
      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#7E8899', fontSize: 13 }}>
        {label}
      </div>
    </div>
  );
}

import { SuratItem } from './types';

export const INITIAL_SURAT_ITEMS: SuratItem[] = [
  {
    id: 'SM-2026-001',
    jenis: 'masuk',
    nomorSurat: '005/7412/ESDM/IX/2026',
    nomorAgenda: 'AGD-M-2026-084',
    tanggalSurat: '2026-09-02',
    tanggalDiterimaAtauKirim: '2026-09-03',
    asalPengirim: 'Dinas ESDM Provinsi Jawa Tengah',
    tujuanSurat: 'Kepala Kantor (Bpk. Rudito)',
    perihal: 'Koordinasi Pendataan & Monitoring Pajak Air Permukaan Wilayah I',
    ringkasanIsi: 'Permintaan data debit pemanfaatan dan sinkronisasi laporan wajib pajak air permukaan semester ganjil untuk evaluasi pendapatan daerah.',
    kategori: 'Laporan',
    statusDisposisi: 'Diteruskan ke Seksi/Staf',
    sumberAsal: 'SRIKANDI (Disalin)',
    lokasiFisikBuku: 'Ordner SM-09 / Rak Pajak A1',
    disposisi: [
      {
        id: 'disp-1',
        dari: 'Bpk. Rudito (Kepala)',
        kepada: 'Ibu Dwi (Kasie)',
        instruksi: 'Tindak lanjuti bersama tim teknis dan siapkan bahan rekap sebelum hari Kamis.',
        tanggal: '2026-09-03 09:15',
        catatan: 'Prioritas, koordinasikan dengan UPTD terkait',
        sudahDibaca: true
      },
      {
        id: 'disp-2',
        dari: 'Ibu Dwi (Kasie)',
        kepada: 'Sanjaya & Staf Teknis',
        instruksi: 'Tolong rekap data kecamatan dan siapkan draft balasan.',
        tanggal: '2026-09-03 11:30',
        catatan: 'Cek database tagihan tahun berjalan',
        sudahDibaca: true
      }
    ],
    lampiran: [
      {
        id: 'att-1',
        namaFile: 'surat_esdm_air_permukaan_7412.pdf',
        ukuran: '1.4 MB',
        tipe: 'pdf',
        url: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=800&q=80',
        tanggalUpload: '2026-09-03'
      }
    ]
  },
  {
    id: 'SM-2026-002',
    jenis: 'masuk',
    nomorSurat: '400.1/104/KEC-UNG/2026',
    nomorAgenda: 'AGD-M-2026-085',
    tanggalSurat: '2026-09-05',
    tanggalDiterimaAtauKirim: '2026-09-06',
    asalPengirim: 'Kecamatan Ungaran Barat',
    tujuanSurat: 'Kepala Kantor (Bpk. Rudito)',
    perihal: 'Undangan Rapat Koordinasi Lintas Sektoral Penertiban Retribusi',
    ringkasanIsi: 'Rapat koordinasi bersama forum pimpinan kecamatan hari Selasa tanggal 15 September 2026 di Aula Kantor Kecamatan.',
    kategori: 'Undangan',
    statusDisposisi: 'Diteruskan ke Seksi/Staf',
    sumberAsal: 'SRIKANDI (Disalin)',
    lokasiFisikBuku: 'Ordner SM-09 / Rak Undangan',
    disposisi: [
      {
        id: 'disp-3',
        dari: 'Bpk. Rudito (Kepala)',
        kepada: 'Ibu Dwi & Anita',
        instruksi: 'Hadir mewakili dan laporkan hasil rapat.',
        tanggal: '2026-09-06 14:00',
        catatan: 'Disiapkan materi presentasi singkat',
        sudahDibaca: true
      }
    ],
    lampiran: [
      {
        id: 'att-2',
        namaFile: 'undangan_rapat_kecamatan_selasa.pdf',
        ukuran: '650 KB',
        tipe: 'pdf',
        url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=800&q=80',
        tanggalUpload: '2026-09-06'
      }
    ]
  },
  {
    id: 'SM-2026-003',
    jenis: 'masuk',
    nomorSurat: '018/YYS-BHAKTI/VIII/2026',
    nomorAgenda: 'AGD-M-2026-086',
    tanggalSurat: '2026-08-28',
    tanggalDiterimaAtauKirim: '2026-08-29',
    asalPengirim: 'Yayasan Bhakti Kasih Sejahtera',
    tujuanSurat: 'Kepala Kantor',
    perihal: 'Permohonan Bantuan Fasilitasi Kegiatan Sosialisasi Masyarakat',
    ringkasanIsi: 'Pengajuan proposal fasilitasi tempat dan narasumber kegiatan sosialisasi tertib administrasi kependudukan dan pajak daerah.',
    kategori: 'Permohonan',
    statusDisposisi: 'Selesai Ditindaklanjuti',
    sumberAsal: 'Fisik Langsung',
    lokasiFisikBuku: 'Ordner SM-08 / Bantuan Sosial',
    disposisi: [
      {
        id: 'disp-4',
        dari: 'Bpk. Rudito (Kepala)',
        kepada: 'Ibu Dwi',
        instruksi: 'Kaji ketersediaan jadwal dan berikan surat jawaban tertulis.',
        tanggal: '2026-08-30 08:30',
        catatan: 'Sudah dijawab dengan SK-2026-042',
        sudahDibaca: true
      }
    ],
    lampiran: [
      {
        id: 'att-3',
        namaFile: 'scan_proposal_yayasan_bhakti.jpg',
        ukuran: '2.1 MB',
        tipe: 'gambar',
        url: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80',
        tanggalUpload: '2026-08-29'
      }
    ]
  },
  {
    id: 'SK-2026-001',
    jenis: 'keluar',
    nomorSurat: '973/042/BAPENDA-UPPD/IX/2026',
    nomorAgenda: 'AGD-K-2026-042',
    tanggalSurat: '2026-09-04',
    tanggalDiterimaAtauKirim: '2026-09-04',
    asalPengirim: 'Seksi Pelayanan & Penerimaan',
    tujuanSurat: 'Ketua Yayasan Bhakti Kasih Sejahtera',
    perihal: 'Jawaban atas Permohonan Fasilitasi Kegiatan Sosialisasi',
    ringkasanIsi: 'Persetujuan fasilitasi narasumber edukasi kepatuhan pajak daerah dengan jadwal yang disesuaikan.',
    kategori: 'Permohonan',
    tipeTandaTangan: 'Manual / Basah',
    penandatangan: 'Bpk. Rudito (Kepala Kantor)',
    sumberAsal: 'Manual Bagian',
    lokasiFisikBuku: 'Buku Arsip Surat Keluar Non-TTE 2026 / Hal 18',
    lampiran: [
      {
        id: 'att-4',
        namaFile: 'foto_surat_keluar_manual_tanda_tangan_basah_042.jpg',
        ukuran: '1.8 MB',
        tipe: 'gambar',
        url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80',
        tanggalUpload: '2026-09-04'
      }
    ]
  },
  {
    id: 'SK-2026-002',
    jenis: 'keluar',
    nomorSurat: '005/043/BAPENDA-UPPD/IX/2026',
    nomorAgenda: 'AGD-K-2026-043',
    tanggalSurat: '2026-09-07',
    tanggalDiterimaAtauKirim: '2026-09-07',
    asalPengirim: 'Subbag Tata Usaha',
    tujuanSurat: 'Camat Ungaran Barat & Ungaran Timur',
    perihal: 'Konfirmasi Kehadiran Rapat Evaluasi Pengelolaan Pajak Daerah',
    ringkasanIsi: 'Penyampaian daftar personil yang ditugaskan menghadiri agenda rakor lintas instansi.',
    kategori: 'Pemberitahuan',
    tipeTandaTangan: 'Manual / Basah',
    penandatangan: 'Bpk. Rudito (Kepala Kantor)',
    sumberAsal: 'Manual Bagian',
    lokasiFisikBuku: 'Buku Arsip Surat Keluar Non-TTE 2026 / Hal 19',
    lampiran: [
      {
        id: 'att-5',
        namaFile: 'scan_surat_keluar_konfirmasi_043.pdf',
        ukuran: '940 KB',
        tipe: 'pdf',
        url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
        tanggalUpload: '2026-09-07'
      }
    ]
  },
  {
    id: 'SK-2026-003',
    jenis: 'keluar',
    nomorSurat: '800/044/BAPENDA-UPPD/IX/2026',
    nomorAgenda: 'AGD-K-2026-044',
    tanggalSurat: '2026-09-08',
    tanggalDiterimaAtauKirim: '2026-09-08',
    asalPengirim: 'Subbag Tata Usaha',
    tujuanSurat: 'Dekan Fakultas Ilmu Komputer UDINUS Semarang',
    perihal: 'Surat Keterangan Penerimaan Praktik Magang / Capstone Project Mahasiswa',
    ringkasanIsi: 'Penerimaan mahasiswa program magang untuk pengembangan sistem digitalisasi administrasi internal kantor tahun 2026.',
    kategori: 'Surat Tugas',
    tipeTandaTangan: 'TTE (Elektronik)',
    penandatangan: 'Bpk. Rudito (Kepala Kantor via SRIKANDI)',
    sumberAsal: 'SRIKANDI (Disalin)',
    lokasiFisikBuku: 'Arsip Digital SRIKANDI',
    lampiran: [
      {
        id: 'att-6',
        namaFile: 'tte_surat_keterangan_magang_udinus_044.pdf',
        ukuran: '520 KB',
        tipe: 'pdf',
        url: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=800&q=80',
        tanggalUpload: '2026-09-08'
      }
    ]
  }
];

export function exportToCSV(items: SuratItem[], filename: string) {
  const headers = [
    'Jenis',
    'Nomor Agenda',
    'Nomor Surat',
    'Tanggal Surat',
    'Tanggal Catat/Kirim',
    'Pengirim/Pembuat',
    'Tujuan',
    'Perihal',
    'Kategori',
    'Tipe Tanda Tangan',
    'Status Disposisi',
    'Lokasi Fisik / Sumber'
  ];

  const rows = items.map(item => [
    `"${item.jenis.toUpperCase()}"`,
    `"${item.nomorAgenda}"`,
    `"${item.nomorSurat.replace(/"/g, '""')}"`,
    `"${item.tanggalSurat}"`,
    `"${item.tanggalDiterimaAtauKirim}"`,
    `"${item.asalPengirim.replace(/"/g, '""')}"`,
    `"${item.tujuanSurat.replace(/"/g, '""')}"`,
    `"${item.perihal.replace(/"/g, '""')}"`,
    `"${item.kategori}"`,
    `"${item.tipeTandaTangan || '-'}"`,
    `"${item.statusDisposisi || '-'}"`,
    `"${(item.lokasiFisikBuku || item.sumberAsal || '-').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

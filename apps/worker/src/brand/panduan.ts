// `/panduan` — step-by-step user guide for gerai owners and Kasir staff (plain Indonesian, readers 35–55+).
// Content is data (`GUIDES`), rendered by `renderPanduan`. Every screenshot is produced by `scripts/panduan/` from
// the real screens with synthetic data; the numbered markers in an image match the numbered steps beside it. Screens
// are captured as Kasir wherever possible so no cost or margin figure appears on a public page (visual 09 §6.2).
import { escapeHtml as e } from "../http/pages"
import SHOT_SIZES from "./panduan-shots.json"

export interface GuideShot {
  /** File stem under `/panduan/` (`<file>.webp`, plus `<file>-hp.webp` for narrow screens when it exists). */
  file: string
  /** What the image shows, for screen readers and when images are off (10–125 chars). */
  alt: string
  /** Visible caption under the image. */
  caption: string
  /** Derived: a picture at most NARROW_MAX_PX wide (a single card, a dialog, a phone screen) sits beside its steps. */
  narrow: boolean
}

export interface GuideStep {
  /** Step text. May contain `<strong>` for the exact label printed on a button or field. */
  html: string
}

export interface GuidePart {
  /** Optional heading inside a guide when it has more than one screen. */
  title?: string
  steps: GuideStep[]
  shot?: GuideShot
}

export interface Guide {
  id: string
  /** Short label in the table of contents. */
  nav: string
  title: string
  /** Who does this: shown as a small badge. */
  who: "Pemilik" | "Kasir" | "Pemilik & Kasir" | "Pelanggan"
  /** One or two sentences: when you need this guide and what you end up with. */
  intro: string
  /** What to have ready before starting. */
  need?: string[]
  parts: GuidePart[]
  /** "Kalau …" notes: the mistakes people actually make. */
  tips?: string[]
}

/** Pixel sizes of every WebP, written by scripts/panduan/optimize.mjs. */
const SIZES = SHOT_SIZES as Record<string, { w: number; h: number }>
/** Every image the page may request: the allow-list entry for the brand asset route. */
export const PANDUAN_ASSETS: string[] = Object.keys(SIZES).map((k) => `/panduan/${k}.webp`)
/** Widest picture that still leaves a readable column of steps beside it (the guide column is 808 px on desktop). */
export const NARROW_MAX_PX = 480
const shot = (file: string, alt: string, caption: string): GuideShot => {
  const size = SIZES[file]
  if (!size) throw new Error(`panduan: no image size for ${file} (run scripts/panduan/optimize.mjs)`)
  return { file, alt, caption, narrow: size.w <= NARROW_MAX_PX }
}
const s = (html: string): GuideStep => ({ html })
const b = (label: string) => `<strong>${label}</strong>`

export const GUIDES: Guide[] = [
  {
    id: "daftar",
    nav: "Daftar gerai",
    title: "Mendaftar sebagai gerai mitra",
    who: "Pemilik",
    intro: "Dilakukan satu kali di awal. Anda membuat akun, mengisi data gerai, lalu menentukan alamat tempat kurir menjemput paket. Pengajuan ditinjau tim GeraiExpress sebelum gerai aktif.",
    need: ["Alamat email yang aktif (kode verifikasi dikirim ke sini)", "Nomor WhatsApp gerai", "Alamat lengkap toko: kecamatan, kelurahan, nama jalan dan nomor"],
    parts: [
      {
        title: "Tahap 1 dari 3 — Buat akun pemilik",
        steps: [
          s(`Buka halaman ${b("Daftar Gerai")}, ketik email Anda.`),
          s(`Tekan ${b("Kirim Kode")}. Kode 6 angka dikirim ke email itu.`),
          s(`Buka email, salin kodenya, lalu isi di kolom ${b("Kode verifikasi")}.`),
          s(`Tekan ${b("Verifikasi")}.`),
        ],
        shot: shot("daftar-2-kode", "Formulir pendaftaran langkah 1: kolom kode verifikasi 6 angka dan tombol Verifikasi", "Kode 6 angka dari email diisi di sini."),
      },
      {
        steps: [
          s(`Isi ${b("Nama lengkap")} Anda.`),
          s(`Buat ${b("Kata sandi")} minimal 8 karakter. Catat di tempat aman.`),
          s(`Tekan ${b("Buat Akun")}.`),
        ],
        shot: shot("daftar-3-akun", "Formulir pendaftaran: nama lengkap, kata sandi, dan tombol Buat Akun", "Nama dan kata sandi untuk masuk ke aplikasi."),
      },
      {
        title: "Tahap 2 dari 3 — Identitas gerai",
        steps: [
          s(`Isi ${b("Nama gerai")}. Alamat situs gerai (contoh: <code>namagerai.geraimitra.com</code>) dibuat otomatis dari nama ini.`),
          s(`Isi ${b("WhatsApp gerai")} dan ${b("Email untuk akun Mengantar")}. Email ini dipakai untuk masuk ke akun Mengantar gerai Anda nanti, jadi pakai email yang benar-benar Anda pegang.`),
          s(`Tekan ${b("Lanjut ke Titik Jemput")}.`),
        ],
        shot: shot("daftar-4-gerai", "Formulir pendaftaran langkah 2: nama gerai, alamat situs otomatis, WhatsApp gerai, dan email akun Mengantar", "Alamat situs gerai muncul otomatis di bawah nama gerai."),
      },
      {
        title: "Tahap 3 dari 3 — Titik jemput kurir",
        steps: [
          s(`Ketik nama ${b("Kecamatan")}, pilih dari daftar, lalu pilih ${b("Kelurahan / Desa")}. Kode pos terisi sendiri.`),
          s(`Isi ${b("Alamat lengkap titik jemput")}: nama jalan, nomor, dan patokan.`),
          s(`Centang persetujuan, lalu tekan ${b("Ajukan Gerai")}.`),
        ],
        shot: shot("daftar-5-titik-jemput", "Formulir pendaftaran langkah 3: kecamatan, kelurahan, alamat titik jemput, dan tombol Ajukan Gerai", "Alamat ini yang didatangi kurir saat menjemput paket."),
      },
      {
        steps: [s(`Selesai. Halaman ${b("Status Pengajuan")} menampilkan perkembangannya. Anda juga menerima email saat pengajuan disetujui.`)],
        shot: shot("daftar-6-status", "Halaman Status Pengajuan setelah formulir dikirim", "Pantau status pengajuan di halaman ini."),
      },
    ],
    tips: [
      "Kode verifikasi tidak masuk? Periksa folder Spam, tunggu satu menit, lalu minta kode baru.",
      "Kecamatan tidak ketemu? Ketik minimal 3 huruf dan pilih dari daftar yang muncul, jangan diketik sampai habis.",
    ],
  },
  {
    id: "persiapan",
    nav: "Persiapan pertama",
    title: "Menyiapkan gerai setelah disetujui",
    who: "Pemilik",
    intro: "Tiga hal yang perlu beres sebelum melayani pelanggan pertama: saldo Mengantar, printer, dan akun untuk kasir. Semuanya ada di menu Pengaturan.",
    parts: [
      {
        title: "Akun Mengantar dan saldo ongkir",
        steps: [
          s(`Buka ${b("Pengaturan")} lalu ${b("Mengantar")}. Tulisan ${b("Sinkron otomatis aktif")} berarti gerai sudah terhubung; status kiriman diperbarui sendiri setiap jam.`),
          s(`Tekan ${b("Buka Mengantar")}. Saat pertama kali masuk, tekan ${b("Lupa Password")} di halaman Mengantar untuk membuat kata sandi, memakai email akun Mengantar yang Anda isi waktu mendaftar.`),
          s(`Isi saldo di Mengantar. Saldo inilah yang terpotong setiap kali resi Non-COD terbit.`),
        ],
        shot: shot("siap-1-mengantar", "Halaman Pengaturan Mengantar: status koneksi Sinkron otomatis aktif dan tombol Buka Mengantar", "Koneksi ke Mengantar dan jalan masuk untuk isi saldo."),
      },
      {
        title: "Printer label",
        steps: [
          s(`Buka ${b("Pengaturan")} lalu ${b("Printer & Struk")}.`),
          s(`Pilih ${b("Format label bawaan")} sesuai kertas di printer Anda. Kalau ragu, pakai ${b("10×15 · Paket + Bukti")}: satu lembar berisi label paket dan bukti kirim untuk pelanggan.`),
          s(`Tekan ${b("Cetak Uji Contoh")}. Ini memakai data contoh: tidak membuat kiriman dan tidak memotong saldo.`),
          s(`Kalau barcode tampak pudar, ganti ${b("Ketebalan cetak")} ke ${b("Tebal")}.`),
        ],
        shot: shot("siap-3-printer", "Halaman Printer dan Struk: pilihan format label, pratinjau label, tombol Cetak Uji Contoh, dan ketebalan cetak", "Pratinjau di kanan berubah mengikuti format yang dipilih."),
      },
      {
        title: "Mengundang kasir",
        steps: [
          s(`Buka ${b("Pengaturan")} lalu ${b("Anggota")}.`),
          s(`Ketik email kasir di ${b("Undang kasir")}, lalu tekan ${b("Kirim Undangan")}.`),
          s(`Kasir membuka tautan di emailnya, mengisi nama dan kata sandi sendiri. Undangan berlaku 7 hari.`),
        ],
        shot: shot("siap-2-anggota", "Halaman Anggota: daftar pemilik dan kasir, serta formulir undang kasir lewat email", "Kasir punya akun sendiri; kata sandi pemilik tidak perlu dibagikan."),
      },
    ],
    tips: [
      "Kasir tidak bisa melihat harga modal, laba, dan saldo. Angka itu hanya tampil di akun pemilik.",
      "Kasir berhenti bekerja? Buka Anggota, tekan Cabut Akses di sebelah namanya.",
      "Di komputer, atur ukuran kertas di driver printer sama dengan label (misalnya 100×150 mm) dan skala cetak 100%.",
    ],
  },
  {
    id: "mengenal",
    nav: "Mengenal layar",
    title: "Mengenal layar utama",
    who: "Pemilik & Kasir",
    intro: "Begitu masuk, Anda melihat Dashboard. Empat bagian ini yang paling sering dipakai sehari-hari.",
    parts: [
      {
        steps: [
          s(`${b("Kiriman Baru")}: tombol untuk mulai melayani pelanggan. Di komputer ada di kiri atas; di HP berupa tombol ${b("+")} di tengah bawah.`),
          s(`${b("Cek Ongkir & Resi")}: bandingkan ongkir tanpa membuat kiriman, atau lacak paket.`),
          s(`${b("Kiriman")}: daftar semua paket, serah terima ke kurir, dan paket retur.`),
          s(`${b("Perlu dikerjakan")}: pengingat hari ini, misalnya paket yang menunggu dijemput kurir.`),
        ],
        shot: shot("mulai-dashboard", "Dashboard kasir dengan empat penanda: tombol Kiriman Baru, menu Cek Ongkir dan Resi, menu Kiriman, dan kotak Perlu dikerjakan", "Dashboard: tampilan pertama setelah masuk."),
      },
      {
        title: "Di HP",
        steps: [s(`Di HP, menu pindah ke bawah layar: ${b("Beranda")}, ${b("Cek Ongkir")}, tombol ${b("+")}, ${b("Kiriman")}, dan ${b("Lainnya")} untuk menu selebihnya.`)],
        shot: shot("hp-1-dashboard", "Dashboard di layar HP dengan menu di bagian bawah dan tombol tambah di tengah", "Tampilan di HP."),
      },
    ],
  },
  {
    id: "cek-ongkir",
    nav: "Cek ongkir",
    title: "Cek ongkir untuk pelanggan",
    who: "Kasir",
    intro: "Pelanggan bertanya “kirim ke sana berapa?” — jawab dari sini tanpa membuat kiriman dulu.",
    need: ["Kecamatan tujuan", "Berat paket (timbang dulu)"],
    parts: [
      {
        steps: [
          s(`Buka ${b("Cek Ongkir & Resi")} lalu ${b("Cek Ongkir")}. Ketik nama kecamatan tujuan.`),
          s(`Pilih kecamatan yang benar dari daftar. Perhatikan kota dan provinsinya, karena nama kecamatan bisa sama.`),
        ],
        shot: shot("ongkir-1-kecamatan", "Halaman Cek Ongkir Cepat: kolom kecamatan tujuan diisi tebet dan daftar hasil pencarian wilayah", "Ketik beberapa huruf, lalu pilih dari daftar."),
      },
      {
        steps: [
          s(`Daftar ekspedisi muncul, diurutkan dari yang paling murah. Tanda ${b("Termurah")} dan ${b("Tercepat")} membantu pelanggan memilih.`),
          s(`Pelanggan setuju? Tekan ${b("Buat Kiriman dari Tarif Ini")} pada ekspedisi yang dipilih. Anda langsung dibawa ke layar kiriman dengan data yang sudah terisi.`),
        ],
        shot: shot("ongkir-2-hasil", "Hasil cek ongkir: daftar ekspedisi dengan tarif publik, tanda Termurah dan Tercepat, serta tombol Buat Kiriman dari Tarif Ini", "Harga yang tampil adalah harga untuk pelanggan."),
      },
    ],
    tips: [
      "Paket besar tapi ringan (bantal, boneka)? Isi juga Ukuran P × L × T. Ongkir memakai berat volume bila lebih besar dari berat timbangan.",
      "Beberapa ekspedisi baru menampilkan tarif setelah Nilai barang diisi. Keterangannya tertulis di barisnya.",
    ],
  },
  {
    id: "kirim",
    nav: "Kirim paket",
    title: "Membuat kiriman dan mencetak resi",
    who: "Kasir",
    intro: "Alur utama di loket: dari pelanggan datang sampai resi tercetak. Semua dikerjakan di satu layar.",
    need: ["Nama dan nomor HP pengirim", "Nama, nomor HP, dan alamat penerima", "Paket sudah ditimbang"],
    parts: [
      {
        title: "Pengirim dan penerima",
        steps: [
          s(`Tekan ${b("Kiriman Baru")}. Di kotak ${b("Pengirim")}, pilih nama pelanggan. Pelanggan baru? Tekan ${b("Pengirim Baru")}.`),
          s(`Di kotak ${b("Penerima")}, pilih dari daftar atau tekan ${b("Penerima Baru")}. Kecamatan penerima otomatis menjadi tujuan kiriman.`),
        ],
        shot: shot("kirim-1-pengirim-penerima", "Layar Kiriman Satuan: daftar pilihan pengirim di kiri dan daftar pilihan penerima di kanan", "Pelanggan lama tinggal dipilih; ketik nama atau nomor HP untuk mencari."),
      },
      {
        title: "Detail paket",
        steps: [
          s(`Pilih ${b("Non-COD")} bila ongkir dibayar pelanggan di loket.`),
          s(`Isi berat. Tombol cepat ${b("500 g")}, ${b("1 kg")}, ${b("2 kg")}, ${b("5 kg")} bisa dipakai.`),
          s(`Tulis ${b("Isi paket")} dengan jujur, misalnya “Pakaian”.`),
        ],
        shot: shot("kirim-2-detail-paket", "Kotak Detail Paket: pilihan Non-COD, COD Barang, COD Ongkir, berat paket, dan isi paket", "Berat boleh diisi dalam gram atau kg."),
      },
      {
        title: "Pilih ekspedisi",
        steps: [s(`Ongkir dihitung otomatis. Tekan ${b("Pilih")} pada ekspedisi yang diinginkan pelanggan.`)],
        shot: shot("kirim-3-pilih-ekspedisi", "Kotak Pilihan Ekspedisi: daftar kurir dengan estimasi dan tarif publik, J&T Express dipilih", "Baris yang dipilih diberi tanda."),
      },
      {
        title: "Bayar dan cetak",
        steps: [
          s(`Pilih cara bayar: ${b("QRIS gerai")}, ${b("Tunai")}, ${b("Transfer")}, atau ${b("Bayar nanti")}.`),
          s(`Kalau tunai, isi ${b("Uang diterima")}. Kembalian dihitung otomatis.`),
          s(`Centang ${b("Isi paket bukan barang terlarang atau berbahaya")} setelah menanyakannya ke pelanggan.`),
          s(`Tekan ${b("Tandai Lunas & Cetak")}.`),
        ],
        shot: shot("kirim-4-bayar", "Kotak Ringkasan dan Pembayaran: total bayar di loket, cara bayar Tunai, uang diterima, kembalian, dan tombol Tandai Lunas", "Jumlah di tombol sama dengan yang ditagih ke pelanggan."),
      },
      {
        steps: [
          s(`Resi terbit. Nomor resi dari ekspedisi tampil di layar, setelah tulisan AWB.`),
          s(`Tekan ${b("Cetak Label")}, tempel label di paket, berikan bukti kirim ke pelanggan.`),
        ],
        shot: shot("kirim-5-resi-terbit", "Layar setelah resi terbit: nomor AWB, status Lunas, dan tombol Cetak Label", "Resi terbit dalam beberapa detik."),
      },
    ],
    tips: [
      "Tombol utama tidak bisa ditekan? Biasanya ada yang belum diisi: pengirim, penerima, ekspedisi, isi paket, atau centang barang terlarang.",
      "Muncul “Menunggu saldo”? Saldo Mengantar gerai tidak cukup. Kiriman tersimpan dan terbit otomatis setelah pemilik mengisi saldo.",
      "Pelanggan belum bayar? Pilih Bayar nanti. Kiriman tercatat “Belum dibayar” dan muncul di pengingat Dashboard.",
    ],
  },
  {
    id: "cetak",
    nav: "Cetak label",
    title: "Mencetak dan mencetak ulang label",
    who: "Kasir",
    intro: "Label dicetak dari jendela Pratinjau & Atur Cetak. Jendela ini muncul setelah resi terbit, dan bisa dibuka lagi dari halaman kiriman.",
    parts: [
      {
        steps: [
          s(`Pilih ukuran kertas yang terpasang di printer.`),
          s(`Periksa pratinjau: nama penerima, tujuan, dan tulisan ${b("NON-COD")} atau ${b("COD")} harus benar.`),
          s(`Tekan ${b("Cetak")}. Di komputer dengan printer biasa, pakai ${b("Buka PDF / Cetak Sistem")}.`),
        ],
        shot: shot("cetak-1-laci", "Jendela Pratinjau dan Atur Cetak: empat pilihan ukuran kertas, tombol Cetak dan Buka PDF, serta pratinjau label 100×150 mm", "Pratinjau menampilkan label persis seperti yang akan tercetak."),
      },
    ],
    tips: [
      "Label rusak atau macet? Cetak ulang dari halaman kiriman. Anda diminta menulis alasan singkat (misalnya “label sobek”) supaya tidak ada label ganda yang tertempel di paket lain.",
      "Hasil cetak terpotong? Ukuran kertas di printer tidak sama dengan format yang dipilih. Samakan dulu, lalu cetak dengan skala 100%.",
    ],
  },
  {
    id: "cod",
    nav: "Kiriman COD",
    title: "Kiriman COD (bayar di tempat)",
    who: "Kasir",
    intro: "Untuk pelanggan yang berjualan online: pembeli membayar ke kurir saat paket tiba. Langkahnya sama dengan kiriman biasa, bedanya ada di Detail Paket.",
    need: ["Nomor WhatsApp pengirim sudah terverifikasi (lihat tanda “WA terverifikasi” di bawah namanya)", "Harga barang yang harus ditagih ke pembeli"],
    parts: [
      {
        steps: [
          s(`Di Detail Paket, pilih ${b("COD Barang")}.`),
          s(`Isi ${b("Harga barang (COD)")} sesuai harga jual pelanggan.`),
          s(`Pilih siapa yang menanggung ${b("Biaya COD")}: ${b("Dibayar penerima")} (ditambahkan ke tagihan pembeli) atau ${b("Dipotong pengirim")} (dipotong dari uang yang diterima penjual).`),
        ],
        shot: shot("cod-1-harga-barang", "Kotak Detail Paket untuk COD: pilihan COD Barang, kolom harga barang COD, dan pilihan siapa yang menanggung biaya COD", "Tiga isian yang membedakan COD dari kiriman biasa."),
      },
      {
        steps: [
          s(`Periksa ringkasan sebelum mencetak: ${b("Ditagih kurir ke penerima")} adalah uang yang dibayar pembeli; ${b("Estimasi cair ke pengirim")} adalah uang yang nanti diterima penjual.`),
          s(`Bacakan dua angka itu ke pelanggan, lalu tekan ${b("Simpan & Cetak")}. Tidak ada yang dibayar di loket.`),
        ],
        shot: shot("cod-2-ringkasan", "Ringkasan kiriman COD: ongkir, tagihan kurir ke penerima, estimasi cair ke pengirim, dan bayar di loket Rp 0", "Pastikan pelanggan setuju dengan kedua angka ini."),
      },
    ],
    tips: [
      "Uang COD tidak langsung ada. Kurir menagih pembeli, lalu dana masuk ke saldo Mengantar gerai setelah paket diterima. Baru setelah itu hak penjual dibayarkan dari halaman kiriman.",
      "Pembeli menolak paket? Paket kembali ke gerai sebagai retur. Lihat panduan Paket retur di bawah.",
      "COD Ongkir dipakai bila pembeli hanya membayar ongkirnya saat paket tiba, tanpa harga barang.",
    ],
  },
  {
    id: "pengirim-baru",
    nav: "Pelanggan baru",
    title: "Menambah pengirim baru",
    who: "Kasir",
    intro: "Pelanggan yang baru pertama kali kirim cukup didata sekali. Kunjungan berikutnya tinggal dipilih dari daftar.",
    parts: [
      {
        steps: [
          s(`Di kotak Pengirim tekan ${b("Pengirim Baru")}, lalu isi ${b("Nama pengirim asli")}.`),
          s(`Isi ${b("Nomor WhatsApp")}. Nomor ini dipakai untuk menghubungi pengirim bila paket retur dan untuk kiriman COD.`),
          s(`Tekan ${b("Simpan")}.`),
        ],
        shot: shot("kontak-1-pengirim-baru", "Jendela tambah pengirim baru: nama pengirim asli, nomor WhatsApp, dan tombol Simpan", "Jendela ini hanya tertutup lewat tombol Simpan atau Batal, supaya isian tidak hilang karena salah sentuh."),
      },
    ],
    tips: ["Untuk kiriman COD, nomor WhatsApp pengirim perlu dikonfirmasi dulu. Ikuti petunjuk verifikasi yang muncul di layar setelah pengirim disimpan."],
  },
  {
    id: "pickup",
    nav: "Serah ke kurir",
    title: "Menyerahkan paket ke kurir",
    who: "Kasir",
    intro: "Saat kurir datang menjemput, paket dipindai satu per satu supaya tidak ada yang tertukar ekspedisi, lalu kurir tanda tangan. Hasilnya Surat Jalan sebagai bukti serah terima.",
    parts: [
      {
        steps: [s(`Buka ${b("Kiriman")} lalu ${b("Pickup & Surat Jalan")}. Paket dikelompokkan per ekspedisi. Tekan ${b("Mulai Pindai")} pada ekspedisi yang kurirnya datang.`)],
        shot: shot("pickup-1-antrean", "Halaman Pickup dan Surat Jalan: antrean paket per ekspedisi dengan tombol Mulai Pindai", "Satu kelompok untuk setiap ekspedisi."),
      },
      {
        steps: [
          s(`Pindai barcode di label setiap paket, atau ketik nomor resinya lalu tekan ${b("Tambah")}. Paket pindah ke daftar ${b("Dipindai")}.`),
          s(`Isi ${b("Nama kurir")}, ${b("No HP kurir")}, dan ${b("No. polisi")} kendaraannya.`),
          s(`Minta kurir tanda tangan di kotak ${b("Tanda tangan kurir")}.`),
          s(`Tekan ${b("Selesai & Tanda Tangan")}.`),
        ],
        shot: shot("pickup-2-pindai-serah", "Halaman Manifest: pindai barcode, daftar dipindai, data kurir, kotak tanda tangan, dan tombol Selesai dan Tanda Tangan", "Daftar Belum dipindai harus kosong sebelum kurir pergi, seperti di gambar."),
      },
      {
        steps: [s(`Tekan ${b("Cetak Surat Jalan")} bila kurir atau gerai perlu salinan kertasnya.`)],
        shot: shot("pickup-3-surat-jalan", "Halaman setelah serah terima selesai dengan tautan Cetak Surat Jalan", "Surat Jalan tersimpan dan bisa dicetak kapan saja."),
      },
    ],
    tips: [
      "Muncul peringatan merah “SALAH KURIR”? Paket itu milik ekspedisi lain. Sisihkan, jangan ikut diserahkan.",
      "Muncul peringatan “Belum dibayar pelanggan”? Tagih dulu sebelum paket dibawa kurir.",
      "Salah pindai? Tekan Keluarkan di sebelah paket itu.",
    ],
  },
  {
    id: "lacak",
    nav: "Lacak paket",
    title: "Melacak paket",
    who: "Pemilik & Kasir",
    intro: "Pelanggan menanyakan paketnya sudah sampai mana. Ada dua jalan: lewat daftar kiriman, atau langsung cari nomornya.",
    parts: [
      {
        steps: [s(`Buka ${b("Kiriman")}. Cari dengan nomor INV, nomor resi, nama, atau nomor HP. Kolom ${b("Status")} menunjukkan posisi terakhir tiap paket.`)],
        shot: shot("lacak-2-daftar-kiriman", "Halaman Kiriman: kolom pencarian, pilihan periode, dan tabel kiriman berisi kurir, pengirim, penerima, tagihan, dan status", "Semua kiriman gerai dalam satu daftar."),
      },
      {
        steps: [
          s(`Tekan nomor INV untuk membuka rinciannya. Baris tahapan menunjukkan perjalanan paket dari kiri ke kanan.`),
          s(`Status terasa lama tidak berubah? Tekan ${b("Sinkronkan Status")} untuk mengambil kabar terbaru dari ekspedisi.`),
        ],
        shot: shot("lacak-1-detail-inv", "Rincian kiriman: tahapan dari Dibuat hingga Terkirim, tombol Sinkronkan Status, nomor resi, dan tombol Cetak Label", "Tahap yang sedang berjalan diberi warna. Di halaman ini juga ada tombol cetak ulang label dan pembatalan."),
      },
    ],
    tips: [
      "INV adalah nomor kiriman dari gerai (7 huruf dan angka, tercetak di label dan bukti kirim). Resi atau AWB adalah nomor dari ekspedisi. Keduanya bisa dipakai untuk mencari.",
      "Pelanggan bisa melacak sendiri di situs gerai, menu Lacak Paket, dengan nomor INV atau resinya.",
    ],
  },
  {
    id: "retur",
    nav: "Paket retur",
    title: "Menangani paket retur",
    who: "Kasir",
    intro: "Paket yang gagal diantar dikembalikan ekspedisi ke gerai, bukan ke rumah pengirim. Gerai menerimanya, mengabari pengirim, lalu menyerahkan paket dengan Kode Ambil supaya tidak jatuh ke orang yang salah.",
    parts: [
      {
        steps: [
          s(`Buka ${b("Kiriman")} lalu ${b("Meja Retur")}. Pindai resi atau INV di paket yang dikembalikan kurir. Pilih kondisi paket; bila penyok atau terbuka, ambil fotonya.`),
          s(`Tekan ${b("Terima Paket Retur")}. Nama dan nomor pengirim asli langsung tampil.`),
        ],
        shot: shot("retur-1-terima", "Halaman Meja Retur: kolom pindai resi atau INV, pilihan kondisi paket, tombol ambil foto, dan tombol Terima Paket Retur", "Foto wajib untuk paket yang penyok, rusak, atau terbuka."),
      },
      {
        steps: [
          s(`Tekan ${b("Kirim Kode Ambil")}, lalu ${b("Buka WhatsApp")}. Pesan berisi kode untuk pengirim sudah disiapkan; tinggal kirim.`),
          s(`Saat pengirim datang, minta ia menyebutkan kodenya. Ketik di kolom ${b("Kode Ambil")}.`),
          s(`Tekan ${b("Serahkan ke Pengirim")}. Paket tercatat sudah diambil.`),
        ],
        shot: shot("retur-2-kode-ambil", "Meja Retur setelah paket diterima: tombol Buka WhatsApp, kolom Kode Ambil, dan tombol Serahkan ke Pengirim", "Paket hanya diserahkan kepada orang yang menyebut kode yang benar."),
      },
    ],
    tips: [
      "Kode salah lima kali berturut-turut akan terkunci 15 menit. Minta pengirim membuka lagi pesan WhatsApp dari gerai.",
      "Tanggal “simpan sampai” tertulis di setiap paket retur. Hubungi lagi pengirim sebelum tanggal itu lewat.",
      "Biaya retur dari ekspedisi dipotong dari saldo Mengantar gerai dan tercatat di menu Keuangan (akun pemilik).",
    ],
  },
  {
    id: "massal",
    nav: "Paket massal",
    title: "Mengirim banyak paket sekaligus",
    who: "Kasir",
    intro: "Untuk pelanggan online shop yang membawa puluhan paket dari satu pengirim. Alamat tidak diketik satu per satu, melainkan diunggah dari berkas Excel.",
    need: ["Daftar penerima dalam berkas Excel, paling banyak 200 baris"],
    parts: [
      {
        steps: [
          s(`Buka ${b("Buat Pengiriman")} lalu ${b("Paket Massal")}. Pilih pengirimnya.`),
          s(`Pilih satu ekspedisi untuk semua paket. Bila paketnya COD, pilih juga siapa yang menanggung biaya COD: pembeli atau pengirim.`),
          s(`Belum punya berkasnya? Tekan ${b("Unduh Template")}, minta pelanggan mengisi satu baris untuk satu paket.`),
          s(`Tekan ${b("Unggah Excel/CSV")} dan pilih berkasnya. Baris yang lengkap berstatus siap; baris yang bermasalah diberi keterangan apa yang perlu diperbaiki, dan bisa dibetulkan langsung di layar.`),
          s(`Bayar sekali untuk semua paket yang siap, lalu cetak labelnya dari menu ${b("Cetak Resi Massal")}.`),
        ],
        shot: shot("massal-1-unggah", "Halaman Paket Massal: daftar pengirim, pilihan ekspedisi dan COD, tombol Unduh Template, dan tombol Unggah Excel/CSV", "Empat penanda untuk empat langkah pertama; langkah 5 muncul setelah berkas diunggah."),
      },
    ],
    tips: ["Baris dengan nominal COD dikirim sebagai COD; baris tanpa nominal dikirim biasa.", "Excel dibaca dari lembar (sheet) pertama saja."],
  },
  {
    id: "situs-gerai",
    nav: "Situs gerai",
    title: "Situs gerai untuk pelanggan Anda",
    who: "Pelanggan",
    intro: "Setiap gerai punya situs sendiri di alamat namagerai.geraimitra.com. Bagikan alamatnya ke pelanggan: mereka bisa cek ongkir, mengisi data kiriman dari rumah, dan melacak paket tanpa menelepon gerai.",
    parts: [
      {
        steps: [s(`Halaman depan situs: pelanggan mengisi kecamatan tujuan dan berat, lalu melihat perbandingan ongkir dari gerai Anda.`)],
        shot: shot("minisite-1-cek-ongkir", "Halaman depan situs gerai: formulir cek ongkir, logo ekspedisi yang dilayani, serta lokasi dan jam buka gerai", "Yang dilihat pelanggan saat membuka alamat situs gerai."),
      },
      {
        title: "Kirim dari Rumah",
        steps: [s(`Pelanggan mengisi nama, nomor HP, dan alamat penerima dari rumah, lalu menekan ${b("Buat Kode QR")}.`)],
        shot: shot("minisite-2-kirim-dari-rumah", "Formulir Kirim dari Rumah di situs gerai: data pengirim, data penerima, isi paket, dan tombol Buat Kode QR", "Pelanggan mengetik alamat sendiri, tanpa antre."),
      },
      {
        steps: [
          s(`Pelanggan mendapat kode QR, berlaku 48 jam. Di loket, kasir menekan tombol QR di sebelah ${b("Kiriman Baru")}, memindai kode itu, dan semua data langsung terisi. Tinggal timbang, pilih ekspedisi, bayar.`),
        ],
        shot: shot("minisite-3-kode-qr", "Halaman kode QR kiriman di situs gerai: nomor INV, kode QR, tombol Kirim ke WA Saya dan Lacak Paket", "Kode QR ditunjukkan ke kasir saat datang ke gerai."),
      },
    ],
    tips: ["Pasang alamat situs gerai di status WhatsApp, spanduk, atau nota. Semakin banyak pelanggan mengisi dari rumah, semakin pendek antrean di loket."],
  },
]

const WHO_NOTE: Record<Guide["who"], string> = {
  Pemilik: "Dikerjakan pemilik gerai",
  Kasir: "Dikerjakan kasir (pemilik juga bisa)",
  "Pemilik & Kasir": "Untuk pemilik dan kasir",
  Pelanggan: "Yang dilihat pelanggan gerai",
}

/**
 * One screenshot. Phones get the same step captured in a 390 px window (`-hp`, 2×) through `<picture>`: a desktop
 * screen scaled down to a phone is unreadable. The link opens the image on its own for pinch-zoom.
 */
const figure = (g: GuideShot) => {
  const d = SIZES[g.file]!
  const hp = SIZES[`${g.file}-hp`]
  const source = hp ? `<source media="(max-width:700px)" srcset="/panduan/${g.file}-hp.webp" width="${hp.w}" height="${hp.h}">` : ""
  return `<figure class="gshot${g.narrow ? " narrow" : ""}"><a href="/panduan/${g.file}.webp" aria-label="Perbesar gambar: ${e(g.caption)}"><picture>${source}<img src="/panduan/${g.file}.webp" width="${d.w}" height="${d.h}" alt="${e(g.alt)}" loading="lazy" decoding="async"></picture></a><figcaption>${e(g.caption)}</figcaption></figure>`
}

/** Renders one guide. Step numbers run through the whole guide so they match the markers drawn in its screenshots. */
function renderGuide(g: Guide): string {
  let n = 0
  const parts = g.parts
    .map((p) => {
      const start = n + 1
      n += p.steps.length
      const steps = `<ol class="gsteps" start="${start}" style="counter-reset:gstep ${start - 1}">${p.steps.map((st) => `<li><span>${st.html}</span></li>`).join("")}</ol>`
      return `<div class="gpart">${p.title ? `<h3>${e(p.title)}</h3>` : ""}<div class="gpair${p.shot?.narrow ? " side" : ""}">${steps}${p.shot ? figure(p.shot) : ""}</div></div>`
    })
    .join("\n")
  return `<section class="guide" id="${e(g.id)}" aria-labelledby="${e(g.id)}-title">
<header class="ghead"><p class="gwho">${e(WHO_NOTE[g.who])}</p><h2 id="${e(g.id)}-title">${e(g.title)}</h2><p class="gintro">${e(g.intro)}</p>
${g.need ? `<div class="gneed"><p>Siapkan dulu</p><ul>${g.need.map((x) => `<li>${e(x)}</li>`).join("")}</ul></div>` : ""}</header>
${parts}
${g.tips ? `<div class="gtips"><h3>Kalau ada kendala</h3><ul>${g.tips.map((t) => `<li>${e(t)}</li>`).join("")}</ul></div>` : ""}
<p class="gtop"><a href="#daftar-isi">Kembali ke daftar isi</a></p>
</section>`
}

/** Guides grouped for the table of contents, in the order a new gerai meets them. */
const GROUPS: Array<[string, string[]]> = [
  ["Mulai", ["daftar", "persiapan", "mengenal"]],
  ["Melayani pelanggan", ["cek-ongkir", "kirim", "cetak", "cod", "pengirim-baru", "massal"]],
  ["Setelah paket dibuat", ["pickup", "lacak", "retur"]],
  ["Untuk pelanggan Anda", ["situs-gerai"]],
]

export function renderPanduanBody(): string {
  const byId = new Map(GUIDES.map((g) => [g.id, g]))
  const toc = `<nav class="gtoc" id="daftar-isi" aria-label="Daftar isi panduan">${GROUPS.map(
    ([label, ids]) => `<div class="gtoc-g"><p>${label}</p><ul>${ids.map((id) => `<li><a href="#${id}">${byId.get(id)!.nav}</a></li>`).join("")}</ul></div>`,
  ).join("")}</nav>`
  return `<section class="sec tight gwrap"><div class="wrap glayout">
${toc}
<div class="gbody">
<p class="gnote">Gambar di panduan ini diambil dari aplikasi dengan data contoh. Angka bulat berwarna jingga di gambar sama dengan nomor langkah yang sedang dibaca. Angka biru kecil di layar aplikasi adalah nama bagian layar, bukan urutan langkah. Ketuk atau klik gambar untuk memperbesar.</p>
${GROUPS.flatMap(([, ids]) => ids.map((id) => renderGuide(byId.get(id)!))).join("\n")}
</div>
</div></section>`
}

/** Small enhancement only: marks the active guide in the table of contents and matches zoom links to the active picture source. The page works without it. */
export const PANDUAN_SCRIPT = `<script>
(function(){
  var mq=matchMedia("(max-width:700px)");
  function syncShots(){[].forEach.call(document.querySelectorAll(".gshot a"),function(a){var s=a.querySelector("source"),i=a.querySelector("img");if(!s||!i)return;a.setAttribute("href",mq.matches?s.getAttribute("srcset"):i.getAttribute("src"))})}
  syncShots();if(mq.addEventListener)mq.addEventListener("change",syncShots);
  var links=[].slice.call(document.querySelectorAll(".gtoc a")),secs=[].slice.call(document.querySelectorAll("section.guide"));
  if(!links.length||!secs.length||!("IntersectionObserver" in window))return;
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;
    links.forEach(function(a){var on=a.getAttribute("href")==="#"+en.target.id;if(on)a.setAttribute("aria-current","location");else a.removeAttribute("aria-current")})})},{rootMargin:"-20% 0px -70% 0px"});
  secs.forEach(function(s){io.observe(s)});
})();
</script>`

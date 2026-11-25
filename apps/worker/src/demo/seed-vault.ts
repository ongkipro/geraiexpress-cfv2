// Idempotent transactional seeder for the demo GeraiVaultDO (68 issued/active shipments + 2 QR drafts across 45 days,
// 24 senders, 32 recipients, rich Mengantar checkpoint timelines with `status_text`, Book 1 counter receipts,
// Book 2 Mengantar mirror invoices + discrepancies, 4 pickup manifests, 3 bulk batches, returns, claims, shifts,
// 24 notifications).
// All people, stores, addresses, and phone numbers are synthetic (AGENTS.md Example Data Policy: redacted 08xx-xxxx-NNNN).
import { encryptString } from "../crypto/aead"
import { DEMO_SELLER_API_KEY, DEMO_TENANT_NAME } from "./constants"

const ALPHABET = "23456789abcdefghjkmnpqrstvwxyz"
const DAY = 86_400_000
const HOUR = 3_600_000

const demoSlug = (i: number): string =>
  `dm${ALPHABET[Math.floor(i / 25) % ALPHABET.length]}${ALPHABET[i % 25]}k${ALPHABET[(i * 7 + 3) % ALPHABET.length]}${ALPHABET[(i * 11 + 5) % ALPHABET.length]}`

export interface SeededShipmentIndexRow {
  slug: string
  awbNumber: string | null
  courierCode: string
  status: string
  createdAt: number
  updatedAt: number
}

interface SenderDef {
  id: string
  kind: "reseller_dropship" | "walk_in"
  name: string
  phone: string
  brand: string | null
  brandPhone: string | null
  street: string
  areaLabel: string
  postal: string
  verified: boolean
}

interface RecipientDef {
  id: string
  senderIdx: number
  name: string
  phone: string
  areaId: string
  province: string
  city: string
  district: string
  subdistrict: string
  postal: string
  street: string
  sortingCode: string
  codDelivered: number
  codRts: number
}

// 24 synthetic senders (14 reseller/dropship + 10 walk-in) -> triggers 2-page PageNav on /kontak/pengirim.
const SENDERS: SenderDef[] = [
  { id: "demo-snd-01", kind: "reseller_dropship", name: "Rina Wulandari", phone: "08xx-xxxx-1001", brand: "Butik Melati Bandung", brandPhone: "08xx-xxxx-1001", street: "Jl. Riau Contoh No. 14", areaLabel: "Citarum, Bandung Wetan, Kota Bandung", postal: "40115", verified: true },
  { id: "demo-snd-02", kind: "reseller_dropship", name: "Hendra Gunawan", phone: "08xx-xxxx-1002", brand: "Kopi Nusantara Roastery", brandPhone: "08xx-xxxx-1002", street: "Jl. Cigadung Contoh No. 7", areaLabel: "Cigadung, Cibeunying Kaler, Kota Bandung", postal: "40191", verified: true },
  { id: "demo-snd-03", kind: "reseller_dropship", name: "Dewi Lestari", phone: "08xx-xxxx-1003", brand: "Skincare Cantik Alami", brandPhone: "08xx-xxxx-1003", street: "Jl. Buah Batu Contoh No. 92", areaLabel: "Turangga, Lengkong, Kota Bandung", postal: "40264", verified: true },
  { id: "demo-snd-04", kind: "reseller_dropship", name: "Agus Supriyanto", phone: "08xx-xxxx-1004", brand: "Gadget Karya Aksesoris", brandPhone: "08xx-xxxx-1004", street: "Jl. Merdeka Contoh No. 31", areaLabel: "Babakan Ciamis, Sumur Bandung, Kota Bandung", postal: "40117", verified: true },
  { id: "demo-snd-05", kind: "reseller_dropship", name: "Siti Aminah", phone: "08xx-xxxx-1005", brand: "Dapur Kue Ibu Ani", brandPhone: "08xx-xxxx-1005", street: "Jl. Antapani Contoh No. 22", areaLabel: "Antapani Tengah, Antapani, Kota Bandung", postal: "40291", verified: true },
  { id: "demo-snd-06", kind: "reseller_dropship", name: "Bambang Wijaya", phone: "08xx-xxxx-1006", brand: "Batik Sekar Jaya", brandPhone: "08xx-xxxx-1006", street: "Jl. Pajajaran Contoh No. 55", areaLabel: "Pasirkaliki, Cicendo, Kota Bandung", postal: "40171", verified: true },
  { id: "demo-snd-07", kind: "reseller_dropship", name: "Nadia Putri", phone: "08xx-xxxx-1007", brand: "Herbal Sehat ID", brandPhone: "08xx-xxxx-1007", street: "Jl. Setiabudi Contoh No. 40", areaLabel: "Hegarmanah, Cidadap, Kota Bandung", postal: "40141", verified: true },
  { id: "demo-snd-08", kind: "reseller_dropship", name: "Taufik Hidayat", phone: "08xx-xxxx-1008", brand: "Sepatu Kulit Cibaduyut", brandPhone: "08xx-xxxx-1008", street: "Jl. Cibaduyut Contoh No. 18", areaLabel: "Cibaduyut, Bojongloa Kidul, Kota Bandung", postal: "40236", verified: true },
  { id: "demo-snd-09", kind: "reseller_dropship", name: "Lestari Anggraini", phone: "08xx-xxxx-1009", brand: "Gamis Syari Azalea", brandPhone: "08xx-xxxx-1009", street: "Jl. Arcamanik Contoh No. 26", areaLabel: "Cisaranten Kulon, Arcamanik, Kota Bandung", postal: "40293", verified: true },
  { id: "demo-snd-10", kind: "reseller_dropship", name: "Eko Wahyudi", phone: "08xx-xxxx-1010", brand: "Jaket Outdoor Parahyangan", brandPhone: "08xx-xxxx-1010", street: "Jl. Cihampelas Contoh No. 72", areaLabel: "Cipaganti, Coblong, Kota Bandung", postal: "40131", verified: true },
  { id: "demo-snd-11", kind: "reseller_dropship", name: "Mila Oktaviani", phone: "08xx-xxxx-1011", brand: "Aksesoris Hijab Kirana", brandPhone: "08xx-xxxx-1011", street: "Jl. Tubagus Ismail Contoh No. 41", areaLabel: "Sekeloa, Coblong, Kota Bandung", postal: "40134", verified: true },
  { id: "demo-snd-12", kind: "reseller_dropship", name: "Rudi Hartono", phone: "08xx-xxxx-1012", brand: "Sparepart Motor Prima", brandPhone: "08xx-xxxx-1012", street: "Jl. Banceuy Contoh No. 12", areaLabel: "Braga, Sumur Bandung, Kota Bandung", postal: "40111", verified: true },
  { id: "demo-snd-13", kind: "reseller_dropship", name: "Fitri Rahayu", phone: "08xx-xxxx-1013", brand: "Perlengkapan Bayi Ceria", brandPhone: "08xx-xxxx-1013", street: "Jl. Kopo Contoh No. 88", areaLabel: "Situsaeur, Bojongloa Kidul, Kota Bandung", postal: "40234", verified: true },
  { id: "demo-snd-14", kind: "reseller_dropship", name: "Yogi Pratama", phone: "08xx-xxxx-1014", brand: "Distro Kaos Dago 99", brandPhone: "08xx-xxxx-1014", street: "Jl. Ir. H. Juanda Contoh No. 105", areaLabel: "Dago, Coblong, Kota Bandung", postal: "40135", verified: false },
  { id: "demo-snd-15", kind: "walk_in", name: "Budi Santoso", phone: "08xx-xxxx-1015", brand: null, brandPhone: null, street: "Jl. Dago Asri Contoh No. 5", areaLabel: "Dago, Coblong, Kota Bandung", postal: "40135", verified: true },
  { id: "demo-snd-16", kind: "walk_in", name: "Yulianti Pratiwi", phone: "08xx-xxxx-1016", brand: null, brandPhone: null, street: "Jl. Dipatiukur Contoh No. 19", areaLabel: "Lebakgede, Coblong, Kota Bandung", postal: "40132", verified: false },
  { id: "demo-snd-17", kind: "walk_in", name: "Fajar Nugroho", phone: "08xx-xxxx-1017", brand: null, brandPhone: null, street: "Jl. Sukajadi Contoh No. 63", areaLabel: "Pasteur, Sukajadi, Kota Bandung", postal: "40161", verified: false },
  { id: "demo-snd-18", kind: "walk_in", name: "Ratna Sari", phone: "08xx-xxxx-1018", brand: null, brandPhone: null, street: "Jl. Cihampelas Contoh No. 11", areaLabel: "Cipaganti, Coblong, Kota Bandung", postal: "40131", verified: true },
  { id: "demo-snd-19", kind: "walk_in", name: "Dedi Kurniawan", phone: "08xx-xxxx-1019", brand: null, brandPhone: null, street: "Jl. Tubagus Ismail Contoh No. 8", areaLabel: "Sekeloa, Coblong, Kota Bandung", postal: "40134", verified: false },
  { id: "demo-snd-20", kind: "walk_in", name: "Indah Permatasari", phone: "08xx-xxxx-1020", brand: null, brandPhone: null, street: "Jl. Cisitu Baru Contoh No. 16", areaLabel: "Dago, Coblong, Kota Bandung", postal: "40135", verified: true },
  { id: "demo-snd-21", kind: "walk_in", name: "Arief Rachman", phone: "08xx-xxxx-1021", brand: null, brandPhone: null, street: "Jl. Sadang Serang Contoh No. 24", areaLabel: "Sadang Serang, Coblong, Kota Bandung", postal: "40133", verified: true },
  { id: "demo-snd-22", kind: "walk_in", name: "Sri Mulyani Contoh", phone: "08xx-xxxx-1022", brand: null, brandPhone: null, street: "Jl. Sangkuriang Contoh No. 9", areaLabel: "Dago, Coblong, Kota Bandung", postal: "40135", verified: false },
  { id: "demo-snd-23", kind: "walk_in", name: "Hadi Kusuma", phone: "08xx-xxxx-1023", brand: null, brandPhone: null, street: "Jl. Ciumbuleuit Contoh No. 33", areaLabel: "Ciumbuleuit, Cidadap, Kota Bandung", postal: "40142", verified: true },
  { id: "demo-snd-24", kind: "walk_in", name: "Niken Maharani", phone: "08xx-xxxx-1024", brand: null, brandPhone: null, street: "Jl. Gandapura Contoh No. 27", areaLabel: "Merdeka, Sumur Bandung, Kota Bandung", postal: "40113", verified: false },
]

// 32 synthetic recipients nationwide -> triggers 2-page PageNav on /kontak/penerima.
const RECIPIENTS: RecipientDef[] = [
  { id: "demo-rcp-01", senderIdx: 0, name: "Anisa Rahma", phone: "08xx-xxxx-2001", areaId: "5fc62f5df8f44b34aa4c0d8d", province: "DKI Jakarta", city: "Jakarta Selatan", district: "Tebet", subdistrict: "Tebet Barat", postal: "12810", street: "Jl. Tebet Barat Dalam Contoh No. 12", sortingCode: "CGK-TBT-01", codDelivered: 5, codRts: 0 },
  { id: "demo-rcp-02", senderIdx: 0, name: "Rizky Pratama", phone: "08xx-xxxx-2002", areaId: "5fc62f5df8f44b34aa4c0d8e", province: "Jawa Timur", city: "Kota Surabaya", district: "Gubeng", subdistrict: "Airlangga", postal: "60286", street: "Jl. Dharmawangsa Contoh No. 45", sortingCode: "SUB-GUB-04", codDelivered: 3, codRts: 0 },
  { id: "demo-rcp-03", senderIdx: 1, name: "Lina Marlina", phone: "08xx-xxxx-2003", areaId: "5fc62f5df8f44b34aa4c0d8f", province: "Jawa Tengah", city: "Kota Semarang", district: "Tembalang", subdistrict: "Bulusan", postal: "50277", street: "Jl. Sirojudin Contoh No. 8", sortingCode: "SRG-TMB-02", codDelivered: 4, codRts: 0 },
  { id: "demo-rcp-04", senderIdx: 1, name: "Eko Prasetyo", phone: "08xx-xxxx-2004", areaId: "5fc62f5df8f44b34aa4c0d90", province: "DI Yogyakarta", city: "Kab. Sleman", district: "Depok", subdistrict: "Caturtunggal", postal: "55281", street: "Jl. Kaliurang Km 6 Contoh No. 19", sortingCode: "JOG-DPK-03", codDelivered: 6, codRts: 0 },
  { id: "demo-rcp-05", senderIdx: 2, name: "Maya Puspita", phone: "08xx-xxxx-2005", areaId: "5fc62f5df8f44b34aa4c0d91", province: "Banten", city: "Kota Tangerang Selatan", district: "Serpong", subdistrict: "BSD", postal: "15310", street: "Cluster Anggrek Contoh Blok B4 No. 9", sortingCode: "TNG-SRP-05", codDelivered: 4, codRts: 1 },
  { id: "demo-rcp-06", senderIdx: 2, name: "Arif Hidayat", phone: "08xx-xxxx-2006", areaId: "5fc62f5df8f44b34aa4c0d92", province: "Jawa Barat", city: "Kota Bekasi", district: "Bekasi Selatan", subdistrict: "Pekayon Jaya", postal: "17148", street: "Jl. Pekayon Raya Contoh No. 77", sortingCode: "BKI-BKS-02", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-07", senderIdx: 3, name: "Tania Wijaya", phone: "08xx-xxxx-2007", areaId: "5fc62f5df8f44b34aa4c0d93", province: "Sumatera Utara", city: "Kota Medan", district: "Medan Baru", subdistrict: "Babura", postal: "20154", street: "Jl. Iskandar Muda Contoh No. 33", sortingCode: "MES-MDB-01", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-08", senderIdx: 3, name: "Wahyu Ramadhan", phone: "08xx-xxxx-2008", areaId: "5fc62f5df8f44b34aa4c0d94", province: "Sulawesi Selatan", city: "Kota Makassar", district: "Panakkukang", subdistrict: "Masale", postal: "90231", street: "Jl. Boulevard Contoh No. 21", sortingCode: "UPG-PNK-01", codDelivered: 1, codRts: 0 },
  { id: "demo-rcp-09", senderIdx: 4, name: "Putri Handayani", phone: "08xx-xxxx-2009", areaId: "5fc62f5df8f44b34aa4c0d95", province: "Bali", city: "Kota Denpasar", district: "Denpasar Selatan", subdistrict: "Sanur", postal: "80228", street: "Jl. Danau Tamblingan Contoh No. 50", sortingCode: "DPS-SNR-02", codDelivered: 3, codRts: 0 },
  { id: "demo-rcp-10", senderIdx: 4, name: "Dimas Saputra", phone: "08xx-xxxx-2010", areaId: "5fc62f5df8f44b34aa4c0d96", province: "Jawa Timur", city: "Kota Malang", district: "Lowokwaru", subdistrict: "Dinoyo", postal: "65144", street: "Jl. MT Haryono Contoh No. 16", sortingCode: "MLG-LWK-03", codDelivered: 5, codRts: 0 },
  { id: "demo-rcp-11", senderIdx: 5, name: "Siska Amelia", phone: "08xx-xxxx-2011", areaId: "5fc62f5df8f44b34aa4c0d97", province: "Jawa Barat", city: "Kota Bogor", district: "Bogor Tengah", subdistrict: "Paledang", postal: "16122", street: "Jl. Pajajaran Contoh No. 28", sortingCode: "BOO-BGT-01", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-12", senderIdx: 5, name: "Irfan Hakim", phone: "08xx-xxxx-2012", areaId: "5fc62f5df8f44b34aa4c0d98", province: "DKI Jakarta", city: "Jakarta Barat", district: "Kebon Jeruk", subdistrict: "Duri Kepa", postal: "11510", street: "Jl. Tanjung Duren Contoh No. 64", sortingCode: "CGK-KBJ-04", codDelivered: 4, codRts: 0 },
  { id: "demo-rcp-13", senderIdx: 6, name: "Novi Anggraini", phone: "08xx-xxxx-2013", areaId: "5fc62f5df8f44b34aa4c0d99", province: "Jawa Timur", city: "Kab. Sidoarjo", district: "Sukodono", subdistrict: "Anggaswangi", postal: "61258", street: "Perum Puri Contoh Blok C2 No. 11", sortingCode: "SDA-SKD-01", codDelivered: 3, codRts: 0 },
  { id: "demo-rcp-14", senderIdx: 6, name: "Bagus Setiawan", phone: "08xx-xxxx-2014", areaId: "5fc62f5df8f44b34aa4c0d9a", province: "Jawa Tengah", city: "Kota Surakarta", district: "Laweyan", subdistrict: "Sriwedari", postal: "57141", street: "Jl. Slamet Riyadi Contoh No. 102", sortingCode: "SOC-LWY-02", codDelivered: 2, codRts: 1 },
  { id: "demo-rcp-15", senderIdx: 7, name: "Ayu Kartika", phone: "08xx-xxxx-2015", areaId: "5fc62f5df8f44b34aa4c0d9b", province: "DKI Jakarta", city: "Jakarta Timur", district: "Duren Sawit", subdistrict: "Pondok Kelapa", postal: "13450", street: "Jl. Kalimalang Contoh No. 39", sortingCode: "CGK-DRS-02", codDelivered: 1, codRts: 0 },
  { id: "demo-rcp-16", senderIdx: 8, name: "Reza Mahendra", phone: "08xx-xxxx-2016", areaId: "5fc62f5df8f44b34aa4c0d9c", province: "Jawa Barat", city: "Kota Depok", district: "Beji", subdistrict: "Kemirimuka", postal: "16423", street: "Jl. Margonda Raya Contoh No. 81", sortingCode: "DPK-BEJ-01", codDelivered: 0, codRts: 0 },
  { id: "demo-rcp-17", senderIdx: 9, name: "Fitriani Zahra", phone: "08xx-xxxx-2017", areaId: "5fc62f5df8f44b34aa4c0d9d", province: "Sumatera Selatan", city: "Kota Palembang", district: "Ilir Timur I", subdistrict: "Sungai Pangeran", postal: "30121", street: "Jl. Jenderal Sudirman Contoh No. 17", sortingCode: "PLM-ILT-01", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-18", senderIdx: 10, name: "Galih Permana", phone: "08xx-xxxx-2018", areaId: "5fc62f5df8f44b34aa4c0d9e", province: "Kalimantan Timur", city: "Kota Balikpapan", district: "Balikpapan Selatan", subdistrict: "Sepinggan", postal: "76115", street: "Jl. Marsma R Iswahyudi Contoh No. 23", sortingCode: "BPN-BPS-01", codDelivered: 1, codRts: 0 },
  { id: "demo-rcp-19", senderIdx: 11, name: "Wulan Dari", phone: "08xx-xxxx-2019", areaId: "5fc62f5df8f44b34aa4c0d9f", province: "Jawa Barat", city: "Kota Cirebon", district: "Kejaksan", subdistrict: "Sukapura", postal: "45122", street: "Jl. Siliwangi Contoh No. 44", sortingCode: "CBN-KJK-01", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-20", senderIdx: 0, name: "Yusuf Mansyur", phone: "08xx-xxxx-2020", areaId: "5fc62f5df8f44b34aa4c0da0", province: "Riau", city: "Kota Pekanbaru", district: "Tampan", subdistrict: "Simpang Baru", postal: "28293", street: "Jl. HR Soebrantas Contoh No. 15", sortingCode: "PKU-TMP-02", codDelivered: 1, codRts: 0 },
  { id: "demo-rcp-21", senderIdx: 2, name: "Intan Permata", phone: "08xx-xxxx-2021", areaId: "5fc62f5df8f44b34aa4c0da1", province: "Lampung", city: "Kota Bandar Lampung", district: "Tanjung Karang Pusat", subdistrict: "Gotong Royong", postal: "35119", street: "Jl. Raden Intan Contoh No. 60", sortingCode: "TKG-TKP-01", codDelivered: 3, codRts: 0 },
  { id: "demo-rcp-22", senderIdx: 3, name: "Robby Kurnia", phone: "08xx-xxxx-2022", areaId: "5fc62f5df8f44b34aa4c0da2", province: "DKI Jakarta", city: "Jakarta Utara", district: "Kelapa Gading", subdistrict: "Kelapa Gading Timur", postal: "14240", street: "Jl. Boulevard Raya Contoh No. 88", sortingCode: "CGK-KGD-03", codDelivered: 4, codRts: 0 },
  { id: "demo-rcp-23", senderIdx: 5, name: "Mega Utami", phone: "08xx-xxxx-2023", areaId: "5fc62f5df8f44b34aa4c0da3", province: "Jawa Barat", city: "Kab. Karawang", district: "Karawang Barat", subdistrict: "Nagasari", postal: "41312", street: "Jl. Ahmad Yani Contoh No. 29", sortingCode: "KRW-KWB-01", codDelivered: 0, codRts: 2 },
  { id: "demo-rcp-24", senderIdx: 6, name: "Andi Pratama", phone: "08xx-xxxx-2024", areaId: "5fc62f5df8f44b34aa4c0da4", province: "Banten", city: "Kota Serang", district: "Serang", subdistrict: "Cimuncang", postal: "42111", street: "Jl. Veteran Contoh No. 10", sortingCode: "SRG-SRG-01", codDelivered: 1, codRts: 1 },
  { id: "demo-rcp-25", senderIdx: 8, name: "Salma Khairunnisa", phone: "08xx-xxxx-2025", areaId: "5fc62f5df8f44b34aa4c0da5", province: "Sumatera Barat", city: "Kota Padang", district: "Padang Barat", subdistrict: "Flamboyan Baru", postal: "25114", street: "Jl. Khatib Sulaiman Contoh No. 51", sortingCode: "PDG-PDB-01", codDelivered: 3, codRts: 0 },
  { id: "demo-rcp-26", senderIdx: 9, name: "Bayu Nugraha", phone: "08xx-xxxx-2026", areaId: "5fc62f5df8f44b34aa4c0da6", province: "Kalimantan Barat", city: "Kota Pontianak", district: "Pontianak Kota", subdistrict: "Sungai Bangkong", postal: "78116", street: "Jl. Ahmad Yani Contoh No. 18", sortingCode: "PNK-PTK-02", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-27", senderIdx: 10, name: "Farah Diba", phone: "08xx-xxxx-2027", areaId: "5fc62f5df8f44b34aa4c0da7", province: "Kalimantan Selatan", city: "Kota Banjarmasin", district: "Banjarmasin Tengah", subdistrict: "Kertak Baru Ilir", postal: "70111", street: "Jl. Lambung Mangkurat Contoh No. 32", sortingCode: "BDJ-BJT-01", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-28", senderIdx: 11, name: "Kevin Sanjaya Contoh", phone: "08xx-xxxx-2028", areaId: "5fc62f5df8f44b34aa4c0da8", province: "Sulawesi Utara", city: "Kota Manado", district: "Wenang", subdistrict: "Calaca", postal: "95121", street: "Jl. Sam Ratulangi Contoh No. 70", sortingCode: "MDC-WNG-01", codDelivered: 1, codRts: 0 },
  { id: "demo-rcp-29", senderIdx: 12, name: "Rani Puspitasari", phone: "08xx-xxxx-2029", areaId: "5fc62f5df8f44b34aa4c0da9", province: "Kepulauan Riau", city: "Kota Batam", district: "Batam Kota", subdistrict: "Teluk Tering", postal: "29461", street: "Komp. Engku Putri Contoh Blok D5", sortingCode: "BTH-BTK-01", codDelivered: 4, codRts: 0 },
  { id: "demo-rcp-30", senderIdx: 13, name: "Ilham Maulana", phone: "08xx-xxxx-2030", areaId: "5fc62f5df8f44b34aa4c0daa", province: "Nusa Tenggara Barat", city: "Kota Mataram", district: "Selaparang", subdistrict: "Gomong", postal: "83126", street: "Jl. Pejanggik Contoh No. 41", sortingCode: "AMI-SLP-01", codDelivered: 2, codRts: 0 },
  { id: "demo-rcp-31", senderIdx: 14, name: "Citra Kusuma", phone: "08xx-xxxx-2031", areaId: "5fc62f5df8f44b34aa4c0dab", province: "DKI Jakarta", city: "Jakarta Pusat", district: "Menteng", subdistrict: "Gondangdia", postal: "10350", street: "Jl. Teuku Umar Contoh No. 25", sortingCode: "CGK-MTG-01", codDelivered: 5, codRts: 0 },
  { id: "demo-rcp-32", senderIdx: 15, name: "Doni Saputro", phone: "08xx-xxxx-2032", areaId: "5fc62f5df8f44b34aa4c0dac", province: "Jawa Barat", city: "Kota Tasikmalaya", district: "Cihideung", subdistrict: "Yudanagara", postal: "46121", street: "Jl. HZ Mustofa Contoh No. 66", sortingCode: "TSM-CHD-01", codDelivered: 0, codRts: 1 },
]

const COURIERS = [
  { courierCode: "JNE", serviceCode: "JNE", serviceClass: "regular" as const, awbPrefix: "CGK2508", bps: 2500, baseShip: 20_000, label: "JNE" },
  { courierCode: "JT", serviceCode: "JT", serviceClass: "regular" as const, awbPrefix: "JP98412", bps: 2500, baseShip: 18_000, label: "J&T Express" },
  { courierCode: "SiCepat", serviceCode: "SiCepat", serviceClass: "regular" as const, awbPrefix: "0042819", bps: 3000, baseShip: 19_000, label: "SiCepat" },
  { courierCode: "iDexpress", serviceCode: "iDexpress", serviceClass: "regular" as const, awbPrefix: "IDE7712", bps: 2500, baseShip: 16_000, label: "iDexpress" },
  { courierCode: "Sap", serviceCode: "Sap", serviceClass: "regular" as const, awbPrefix: "SAP8810", bps: 2500, baseShip: 17_000, label: "SAP Express" },
  { courierCode: "anteraja", serviceCode: "anteraja", serviceClass: "regular" as const, awbPrefix: "1000891", bps: 2000, baseShip: 18_000, label: "Anteraja" },
  { courierCode: "spx", serviceCode: "spx", serviceClass: "regular" as const, awbPrefix: "SPXID05", bps: 2000, baseShip: 15_000, label: "SPX" },
  { courierCode: "lion", serviceCode: "lion", serviceClass: "regular" as const, awbPrefix: "11LP172", bps: 2000, baseShip: 22_000, label: "Lion Parcel" },
  { courierCode: "JNE", serviceCode: "JTR", serviceClass: "cargo" as const, awbPrefix: "JTR2508", bps: 2000, baseShip: 45_000, label: "JNE Trucking" },
  { courierCode: "pos", serviceCode: "pos", serviceClass: "regular" as const, awbPrefix: "POS4013", bps: 2000, baseShip: 17_000, label: "Pos Indonesia" },
] as const

const ITEMS = [
  "Kemeja Katun Lengan Panjang",
  "Biji Kopi Arabika Gayo 500g",
  "Paket Skincare Brightening Set",
  "Charger Fast Charging 65W + Kabel",
  "Kue Kering Nastar Toples 500g",
  "Kain Batik Tulis Motif Parang",
  "Madu Hutan Asli Botol 500ml",
  "Sepatu Kulit Pria Ukuran 42",
  "Gamis Syari Linen Premium",
  "Jaket Gunung Waterproof M",
  "Hijab Voal Laser Cut (4 pcs)",
  "Kampas Rem & Filter Motor Set",
  "Selimut & Bedong Bayi Katun",
  "Kaos Combed 30s Oversize (2 pcs)",
  "Tas Ransel Laptop 15 Inci",
  "Suplemen Herbal Imunitas (2 btl)",
]

const METHODS = ["qris", "tunai", "transfer", "deposit"] as const
const CHANNELS = ["counter_pos", "counter_pos", "counter_pos", "bulk", "minisite_qr"] as const

type DemoStatus =
  | "delivered"
  | "in_transit"
  | "handed_to_courier"
  | "ready_for_pickup"
  | "undelivery_hold"
  | "rts_in_transit"
  | "rts_at_gerai"
  | "rts_returned_to_sender"
  | "lost"
  | "cancelled"

interface SeedPlan {
  daysAgo: number
  hoursOffset: number
  status: DemoStatus
  dispatchState?: "issued" | "provider_unpaid_hold" | "cancelled"
  cod: boolean
  unpaid?: boolean
  stuck?: boolean
  conflict?: boolean
  adjustmentIdr?: number
  returnDamaged?: boolean
  claimSubmitted?: boolean
  printed?: boolean
  codPaidOut?: boolean
  courierIdx: number
  senderIdx: number
  recipientIdx: number
  weightGram: number
  packingIdr: number
}

// 68 realistic shipments across 45 days:
// - 8 today ("Hari Ini")
// - 24 in last 7 days
// - 52 in last 30 days (triggers 3-page PageNav: 20 + 20 + 12 on /kiriman!)
// - 16 in days 31..44 (previous 30-day window for realistic growth trend badges & 4 pages in 90-day view)
// Covers every single tab & workstation: Belum Dibayar, Menunggu Saldo, Pickup, Cetak Massal, Riwayat Massal,
// Meja Retur (di gerai, dalam perjalanan, selesai), Kendala & Klaim (semua 6 bucket), Keuangan (Mutasi, Laba, Cadangan, Selisih).
const PLANS: SeedPlan[] = [
  // ---- Today (8 shipments: 5 ready_for_pickup across 5 couriers + 2 handed_to_courier + 1 in_transit) ----
  { daysAgo: 0, hoursOffset: 1, status: "ready_for_pickup", cod: false, unpaid: true, printed: false, courierIdx: 0, senderIdx: 0, recipientIdx: 0, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 0, hoursOffset: 2, status: "ready_for_pickup", cod: true, unpaid: false, printed: false, courierIdx: 1, senderIdx: 2, recipientIdx: 4, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 0, hoursOffset: 3, status: "ready_for_pickup", cod: false, unpaid: true, printed: true, courierIdx: 2, senderIdx: 1, recipientIdx: 2, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 0, hoursOffset: 4, status: "ready_for_pickup", cod: true, unpaid: false, printed: false, courierIdx: 3, senderIdx: 3, recipientIdx: 6, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 0, hoursOffset: 5, status: "ready_for_pickup", cod: false, unpaid: false, printed: false, courierIdx: 6, senderIdx: 8, recipientIdx: 24, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 0, hoursOffset: 6, status: "handed_to_courier", cod: false, unpaid: true, printed: true, courierIdx: 0, senderIdx: 4, recipientIdx: 8, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 0, hoursOffset: 7, status: "handed_to_courier", cod: true, unpaid: false, printed: true, courierIdx: 1, senderIdx: 7, recipientIdx: 14, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 0, hoursOffset: 8, status: "in_transit", cod: false, unpaid: false, printed: true, courierIdx: 5, senderIdx: 9, recipientIdx: 25, weightGram: 1000, packingIdr: 3000 },

  // ---- Days 1..6 (16 shipments -> 24 in last 7 days) ----
  { daysAgo: 1, hoursOffset: 2, status: "ready_for_pickup", dispatchState: "provider_unpaid_hold", cod: false, unpaid: true, printed: false, courierIdx: 0, senderIdx: 10, recipientIdx: 26, weightGram: 2000, packingIdr: 3000 },
  { daysAgo: 1, hoursOffset: 3, status: "ready_for_pickup", dispatchState: "provider_unpaid_hold", cod: false, unpaid: false, printed: false, courierIdx: 1, senderIdx: 11, recipientIdx: 27, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 1, hoursOffset: 4, status: "in_transit", cod: true, printed: true, courierIdx: 1, senderIdx: 0, recipientIdx: 1, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 1, hoursOffset: 6, status: "in_transit", cod: false, printed: true, courierIdx: 4, senderIdx: 5, recipientIdx: 10, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 2, hoursOffset: 2, status: "undelivery_hold", cod: true, printed: true, courierIdx: 1, senderIdx: 12, recipientIdx: 28, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 2, hoursOffset: 3, status: "in_transit", cod: true, printed: true, courierIdx: 2, senderIdx: 6, recipientIdx: 12, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 2, hoursOffset: 5, status: "delivered", cod: false, unpaid: true, printed: true, courierIdx: 0, senderIdx: 14, recipientIdx: 30, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 3, hoursOffset: 2, status: "rts_in_transit", cod: true, printed: true, courierIdx: 3, senderIdx: 0, recipientIdx: 31, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 3, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: false, printed: true, courierIdx: 1, senderIdx: 1, recipientIdx: 3, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 3, hoursOffset: 7, status: "delivered", cod: false, printed: true, courierIdx: 5, senderIdx: 2, recipientIdx: 5, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 4, hoursOffset: 2, status: "undelivery_hold", cod: true, printed: true, courierIdx: 2, senderIdx: 8, recipientIdx: 15, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 4, hoursOffset: 3, status: "delivered", cod: true, codPaidOut: false, printed: true, courierIdx: 3, senderIdx: 3, recipientIdx: 7, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 4, hoursOffset: 7, status: "in_transit", cod: false, stuck: true, printed: true, courierIdx: 6, senderIdx: 4, recipientIdx: 9, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 5, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 8, senderIdx: 5, recipientIdx: 11, weightGram: 6000, packingIdr: 10000 },
  { daysAgo: 5, hoursOffset: 8, status: "rts_at_gerai", cod: true, printed: true, courierIdx: 1, senderIdx: 5, recipientIdx: 22, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 6, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 2, senderIdx: 0, recipientIdx: 19, weightGram: 1000, packingIdr: 0 },

  // ---- Days 7..29 (28 shipments -> 52 in last 30 days = 3 full pages of 20 on /kiriman!) ----
  { daysAgo: 7, hoursOffset: 2, status: "in_transit", cod: true, stuck: true, printed: true, courierIdx: 4, senderIdx: 6, recipientIdx: 13, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 7, hoursOffset: 6, status: "rts_in_transit", cod: true, printed: true, courierIdx: 7, senderIdx: 9, recipientIdx: 25, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 8, hoursOffset: 3, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 15, recipientIdx: 15, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 8, hoursOffset: 7, status: "rts_returned_to_sender", cod: true, printed: true, courierIdx: 1, senderIdx: 0, recipientIdx: 22, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 9, hoursOffset: 2, status: "rts_at_gerai", returnDamaged: true, cod: true, printed: true, courierIdx: 2, senderIdx: 6, recipientIdx: 23, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 9, hoursOffset: 6, status: "delivered", adjustmentIdr: 7500, cod: false, printed: true, courierIdx: 0, senderIdx: 7, recipientIdx: 29, weightGram: 3000, packingIdr: 5000 },
  { daysAgo: 10, hoursOffset: 3, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 0, recipientIdx: 0, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 10, hoursOffset: 8, status: "cancelled", dispatchState: "cancelled", cod: false, unpaid: false, printed: false, courierIdx: 5, senderIdx: 16, recipientIdx: 16, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 11, hoursOffset: 3, status: "lost", claimSubmitted: true, cod: false, printed: true, courierIdx: 7, senderIdx: 3, recipientIdx: 17, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 11, hoursOffset: 7, status: "rts_at_gerai", conflict: true, cod: true, printed: true, courierIdx: 1, senderIdx: 11, recipientIdx: 23, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 12, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 9, senderIdx: 17, recipientIdx: 16, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 13, hoursOffset: 5, status: "delivered", cod: true, codPaidOut: false, printed: true, courierIdx: 2, senderIdx: 12, recipientIdx: 28, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 14, hoursOffset: 3, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 3, senderIdx: 2, recipientIdx: 20, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 14, hoursOffset: 8, status: "in_transit", cod: false, stuck: true, printed: true, courierIdx: 5, senderIdx: 13, recipientIdx: 29, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 15, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 1, recipientIdx: 2, weightGram: 3000, packingIdr: 5000 },
  { daysAgo: 16, hoursOffset: 6, status: "lost", claimSubmitted: false, cod: false, printed: true, courierIdx: 4, senderIdx: 10, recipientIdx: 26, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 17, hoursOffset: 5, status: "rts_returned_to_sender", cod: true, printed: true, courierIdx: 1, senderIdx: 2, recipientIdx: 4, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 18, hoursOffset: 4, status: "delivered", cod: false, unpaid: true, printed: true, courierIdx: 6, senderIdx: 18, recipientIdx: 18, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 19, hoursOffset: 6, status: "delivered", cod: false, printed: true, courierIdx: 8, senderIdx: 4, recipientIdx: 9, weightGram: 8000, packingIdr: 10000 },
  { daysAgo: 20, hoursOffset: 3, status: "delivered", cod: true, codPaidOut: false, printed: true, courierIdx: 2, senderIdx: 8, recipientIdx: 24, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 21, hoursOffset: 3, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 3, recipientIdx: 21, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 22, hoursOffset: 5, status: "rts_returned_to_sender", cod: true, printed: true, courierIdx: 0, senderIdx: 9, recipientIdx: 31, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 23, hoursOffset: 7, status: "delivered", cod: false, printed: true, courierIdx: 5, senderIdx: 19, recipientIdx: 18, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 24, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 9, senderIdx: 20, recipientIdx: 30, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 25, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 0, senderIdx: 0, recipientIdx: 1, weightGram: 2000, packingIdr: 3000 },
  { daysAgo: 26, hoursOffset: 6, status: "cancelled", dispatchState: "cancelled", cod: false, unpaid: false, printed: false, courierIdx: 3, senderIdx: 21, recipientIdx: 19, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 27, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 6, senderIdx: 22, recipientIdx: 18, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 28, hoursOffset: 7, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 23, recipientIdx: 27, weightGram: 1000, packingIdr: 3000 },

  // ---- Days 31..44 (16 shipments in previous 30-day period -> 68 total shipments!) ----
  { daysAgo: 31, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 0, recipientIdx: 0, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 32, hoursOffset: 6, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 1, recipientIdx: 3, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 33, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 2, senderIdx: 2, recipientIdx: 5, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 34, hoursOffset: 7, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 3, senderIdx: 3, recipientIdx: 7, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 35, hoursOffset: 3, status: "delivered", cod: false, printed: true, courierIdx: 9, senderIdx: 7, recipientIdx: 25, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 36, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 4, senderIdx: 4, recipientIdx: 8, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 37, hoursOffset: 8, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 5, recipientIdx: 10, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 38, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 6, recipientIdx: 12, weightGram: 2000, packingIdr: 0 },
  { daysAgo: 39, hoursOffset: 6, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 2, senderIdx: 0, recipientIdx: 1, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 40, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 8, senderIdx: 1, recipientIdx: 2, weightGram: 7000, packingIdr: 10000 },
  { daysAgo: 40, hoursOffset: 9, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 6, senderIdx: 8, recipientIdx: 24, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 41, hoursOffset: 7, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 2, recipientIdx: 4, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 42, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 5, senderIdx: 14, recipientIdx: 14, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 42, hoursOffset: 8, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 3, senderIdx: 11, recipientIdx: 28, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 43, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 3, recipientIdx: 21, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 44, hoursOffset: 6, status: "delivered", cod: false, printed: true, courierIdx: 7, senderIdx: 12, recipientIdx: 29, weightGram: 2000, packingIdr: 5000 },
]

export async function seedDemoVault(
  sql: SqlStorage,
  env: Env,
  tenantId: string,
  actorId: string,
  now: number,
): Promise<{ shipments: SeededShipmentIndexRow[]; senders: number; recipients: number }> {
  const encryptedDemoKey = await encryptString(env.KEK_SECRET, DEMO_SELLER_API_KEY, `seller-key:${tenantId}`)
  const outletId = "demo-outlet-default"
  const closedShiftId = "demo-shift-closed-1"
  const openShiftId = "demo-shift-open-1"
  const indexRows: SeededShipmentIndexRow[] = []

  // Clear existing demo data so re-running the seed refreshes the 45-day window cleanly without duplicates.
  const tables = [
    "minisite_drafts",
    "shipment_claims",
    "return_intakes",
    "pickup_batch_items",
    "pickup_batches",
    "bulk_import_rows",
    "bulk_import_batches",
    "finance_discrepancies",
    "mengantar_invoice_subitems",
    "mengantar_invoice_mirror",
    "counter_receipts",
    "shipment_events",
    "quote_snapshots",
    "shipments",
    "inv_slugs",
    "cashier_shifts",
    "recipient_contacts",
    "sender_contacts",
    "notification_reads",
    "notifications",
    "packing_items",
    "tenant_courier_prefs",
    "tenant_outlets",
    "tenant_business_profiles",
    "mengantar_connections",
    "finance_sync_state",
    "tenant_settings",
  ]
  for (const t of tables) sql.exec(`DELETE FROM ${t}`)

  sql.exec(
    `INSERT INTO tenant_settings (tenant_id, default_label_format, unboxing_remark_text, show_commission_on_quick_check, counter_service_fee_enabled, counter_service_fee_default_idr, cargo_recommend_threshold_gram, cashier_may_pay_sender_cod, masking_offered, masking_presets_enabled, masking_default_preset, mask_recipient_phone_on_cod_default, updated_at, updated_by, mengantar_dropshipper_sync, mengantar_dropshipper_state)
     VALUES (?1, 'label_10x15_with_stub', 'Rekam video saat buka paket untuk klaim', 1, 1, 1000, 5000, 1, 1, '["standar_gerai","dropship_toko","privasi_penerima_cod"]', 'standar_gerai', 0, ?2, ?3, 0, NULL)`,
    tenantId,
    now,
    actorId,
  )

  sql.exec(
    `INSERT INTO tenant_business_profiles (tenant_id, entity_type, legal_name, brand_name, nib, encrypted_npwp, registered_address, pic_name, pic_role, pic_email, pic_phone, updated_by, updated_at)
     VALUES (?1, 'cv', 'CV Gerai Express Contoh', ?2, '1234567890123', NULL, 'Jl. Dago Contoh No. 88, Coblong, Kota Bandung', 'Rama Pratama', 'Pemilik Gerai', 'demo@geraiexpress.com', '08xx-xxxx-9900', ?3, ?4)`,
    tenantId,
    DEMO_TENANT_NAME,
    actorId,
    now,
  )

  sql.exec(
    `INSERT INTO tenant_outlets (id, tenant_id, name, pic_name, pic_phone, mengantar_address_id, mengantar_area_id, province_name, city_name, district_name, subdistrict_name, postal_code, street_address, latitude, longitude, whatsapp, opening_hours, logo_media_id, qris_media_id, is_default, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'Rama Pratama', '08xx-xxxx-9900', 'demo-addr-01', '5fc62f5df8f44b34aa4c0d8c', 'Jawa Barat', 'Kota Bandung', 'Coblong', 'Dago', '40135', 'Jl. Dago Contoh No. 88', -6.8892, 107.6131, '08xx-xxxx-9900', 'Senin–Sabtu 08.00–20.00 WIB', NULL, NULL, 1, ?4, ?4)`,
    outletId,
    tenantId,
    DEMO_TENANT_NAME,
    now - 45 * DAY,
  )

  sql.exec(
    `INSERT INTO mengantar_connections (tenant_id, environment, onboarding_state, webhook_state, seller_id, external_user_id, encrypted_api_key, key_version, webhook_path_token, encrypted_webhook_secret, synced_balance_idr, last_invoice_synced_at, last_sync_status, updated_at, webhook_last_event_at, last_polled_at, rotation_state)
     VALUES (?1, 'production', 'connected', 'active', 'demo-seller-001', ?1, ?2, 1, 'demo-webhook-token', NULL, 4850000, ?3, 'ok', ?3, ?3, ?3, 'idle')`,
    tenantId,
    encryptedDemoKey,
    now - 12 * 60_000,
  )

  sql.exec(
    `INSERT INTO finance_sync_state (id, last_run_at, last_ok_at, last_trigger, last_pages, last_error)
     VALUES (1, ?1, ?1, 'scheduled', 3, NULL)`,
    now - 12 * 60_000,
  )

  const packings: Array<[string, string, number, number]> = [
    ["demo-pack-1", "Bubble Wrap", 3000, 1],
    ["demo-pack-2", "Kardus Kecil", 5000, 2],
    ["demo-pack-3", "Kardus Besar", 10000, 3],
    ["demo-pack-4", "Packing Kayu Ringan", 25000, 4],
  ]
  for (const [id, name, price, order] of packings) {
    sql.exec("INSERT INTO packing_items (id, name, price_idr, is_active, sort_order, updated_at) VALUES (?, ?, ?, 1, ?, ?)", id, name, price, order, now - 45 * DAY)
  }

  for (const code of ["JNE", "JT", "SiCepat", "Sap", "iDexpress", "lion", "anteraja", "pos", "spx"]) {
    sql.exec("INSERT INTO tenant_courier_prefs (tenant_id, courier_code, enabled, pickup_mode, updated_at, updated_by) VALUES (?, ?, 1, 'scheduled_pickup', ?, ?)", tenantId, code, now - 45 * DAY, actorId)
  }

  // Count shipments per sender for accurate `shipments_count`.
  const senderCounts = new Array<number>(SENDERS.length).fill(0)
  for (const p of PLANS) senderCounts[p.senderIdx]! += 1

  SENDERS.forEach((s, i) => {
    const created = now - (45 - Math.min(40, i)) * DAY
    sql.exec(
      `INSERT INTO sender_contacts (id, tenant_id, sender_kind, true_name, true_phone, wa_verified_at, wa_verified_by, wa_verify_method, true_street, true_area_id, true_area_label, true_postal_code, display_brand_name, display_brand_phone, hide_gerai_branding, default_mask_preset, deposit_balance_idr, shipments_count, is_archived, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '5fc62f5df8f44b34aa4c0d8c', ?10, ?11, ?12, ?13, 0, ?14, ?15, ?16, 0, ?17, ?17)`,
      s.id,
      tenantId,
      s.kind,
      s.name,
      s.phone,
      s.verified ? created : null,
      s.verified ? actorId : null,
      s.verified ? "operator_confirmed" : null,
      s.street,
      s.areaLabel,
      s.postal,
      s.brand,
      s.brandPhone,
      s.kind === "reseller_dropship" ? "dropship_toko" : "standar_gerai",
      s.kind === "reseller_dropship" ? (i + 1) * 125_000 : 0,
      senderCounts[i]!,
      created,
    )
  })

  RECIPIENTS.forEach((r, i) => {
    const created = now - (44 - Math.min(40, i)) * DAY
    sql.exec(
      `INSERT INTO recipient_contacts (id, tenant_id, linked_sender_id, name, phone, mengantar_area_id, province_name, city_name, district_name, subdistrict_name, postal_code, street_address, address_note, cod_delivered_count, cod_rts_count, risk_version, is_archived, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 1, 0, ?16, ?16)`,
      r.id,
      tenantId,
      SENDERS[r.senderIdx]!.id,
      r.name,
      r.phone,
      r.areaId,
      r.province,
      r.city,
      r.district,
      r.subdistrict,
      r.postal,
      r.street,
      i % 3 === 0 ? "Rumah pagar abu-abu sebelah minimarket" : null,
      r.codDelivered,
      r.codRts,
      created,
    )
  })

  // Shifts: 1 closed yesterday + 1 open today.
  sql.exec(
    `INSERT INTO cashier_shifts (id, tenant_id, cashier_user_id, opened_at, opening_float_idr, closed_at, counted_cash_idr, expected_cash_idr, variance_idr, state)
     VALUES (?1, ?2, ?3, ?4, 300000, ?5, 685000, 685000, 0, 'closed')`,
    closedShiftId,
    tenantId,
    actorId,
    now - DAY - 9 * HOUR,
    now - DAY - HOUR,
  )
  sql.exec(
    `INSERT INTO cashier_shifts (id, tenant_id, cashier_user_id, opened_at, opening_float_idr, state)
     VALUES (?1, ?2, ?3, ?4, 300000, 'open')`,
    openShiftId,
    tenantId,
    actorId,
    now - 6 * HOUR,
  )

  // 4 Historical completed pickup manifests (36-char UUIDs so `/pickup/:batch` and `/surat-jalan.pdf` work cleanly).
  const pickupDefs = [
    { id: "00000000-0000-4000-8000-000000000101", courier: "JNE", driver: "Darmawan (Kurir JNE)", phone: "08xx-xxxx-7701", plate: "D 4512 ABC", daysAgo: 1, count: 0, max: 4 },
    { id: "00000000-0000-4000-8000-000000000102", courier: "JT", driver: "Sutisna (Kurir J&T)", phone: "08xx-xxxx-7702", plate: "D 8831 KLM", daysAgo: 2, count: 0, max: 4 },
    { id: "00000000-0000-4000-8000-000000000103", courier: "SiCepat", driver: "Ahmad Fauzi (SiCepat)", phone: "08xx-xxxx-7703", plate: "D 2910 ZXC", daysAgo: 4, count: 0, max: 3 },
    { id: "00000000-0000-4000-8000-000000000104", courier: "iDexpress", driver: "Rizal Maulana (iDexpress)", phone: "08xx-xxxx-7704", plate: "D 6104 BDG", daysAgo: 6, count: 0, max: 3 },
  ]
  for (const pb of pickupDefs) {
    sql.exec(
      `INSERT INTO pickup_batches (id, tenant_id, outlet_id, courier_code, status, driver_name, driver_phone, driver_vehicle_no, scanned_count, handed_over_at, handed_over_by, created_by, created_at)
       VALUES (?1, ?2, ?3, ?4, 'handed_over', ?5, ?6, ?7, 0, ?8, ?9, ?9, ?10)`,
      pb.id,
      tenantId,
      outletId,
      pb.courier,
      pb.driver,
      pb.phone,
      pb.plate,
      now - pb.daysAgo * DAY + HOUR,
      actorId,
      now - pb.daysAgo * DAY,
    )
  }

  // 3 Historical bulk import batches (36-char UUIDs so `/kiriman/massal/$batch` opens cleanly).
  const bulkBatches = [
    { id: "00000000-0000-4000-8000-000000000201", senderIdx: 0, file: "order-butik-melati.csv", service: "JNE", state: "done", pay: "paid", daysAgo: 3, rows: 0, max: 4 },
    { id: "00000000-0000-4000-8000-000000000202", senderIdx: 1, file: "kiriman-kopi-nusantara.csv", service: "JT", state: "done", pay: "paid", daysAgo: 8, rows: 0, max: 3 },
    { id: "00000000-0000-4000-8000-000000000203", senderIdx: 2, file: "skincare-promo-nov.csv", service: "SiCepat", state: "partially_failed", pay: "unpaid", daysAgo: 13, rows: 0, max: 3 },
  ]
  for (const bb of bulkBatches) {
    sql.exec(
      `INSERT INTO bulk_import_batches (id, tenant_id, sender_contact_id, source, file_name, mask_preset, cod_fee_mode, service_code, row_count, ready_count, failed_count, state, counter_payment_status, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'csv', ?4, 'dropship_toko', 'none', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)`,
      bb.id,
      tenantId,
      SENDERS[bb.senderIdx]!.id,
      bb.file,
      bb.service,
      bb.max + (bb.state === "partially_failed" ? 1 : 0),
      bb.max,
      bb.state === "partially_failed" ? 1 : 0,
      bb.state,
      bb.pay,
      actorId,
      now - bb.daysAgo * DAY,
    )
  }

  // Running balance for Book 2 Mengantar mirror invoices (starting from two top-ups totaling Rp 7.000.000).
  let mirrorBalance = 4_500_000
  sql.exec(
    `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
     VALUES ('demo-inv-topup-1', 'INV-MGT-DEMO-TOPUP1', 'typeAddBalance', 'statusCleared', 4500000, 4500000, 4500000, 'Top up saldo Mengantar #1 (Demo)', ?1, ?1, '{"type":"typeAddBalance","amount":4500000}', 'not_applicable', ?1, ?2)`,
    now - 45 * DAY,
    now,
  )
  mirrorBalance += 2_500_000
  sql.exec(
    `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
     VALUES ('demo-inv-topup-2', 'INV-MGT-DEMO-TOPUP2', 'typeAddBalance', 'statusCleared', 2500000, 2500000, ?3, 'Top up saldo Mengantar #2 (Demo)', ?1, ?1, '{"type":"typeAddBalance","amount":2500000}', 'not_applicable', ?1, ?2)`,
    now - 18 * DAY,
    now,
    mirrorBalance,
  )

  const WIB = 7 * HOUR
  const wibMidnight = Math.floor((now + WIB) / DAY) * DAY - WIB

  let discrepancySlug1: string | null = null
  let discrepancySlug2: string | null = null
  let refundSlug: string | null = null

  PLANS.forEach((plan, i) => {
    const slug = demoSlug(i)
    const c = COURIERS[plan.courierIdx]!
    const sender = SENDERS[plan.senderIdx]!
    const recipient = RECIPIENTS[plan.recipientIdx]!
    const dispatchState = plan.dispatchState ?? "issued"
    const hasAwb = dispatchState === "issued"
    const issuedAt =
      plan.daysAgo === 0
        ? Math.max(wibMidnight + 60_000, now - plan.hoursOffset * 12 * 60_000)
        : now - plan.daysAgo * DAY - plan.hoursOffset * HOUR
    const updatedAt =
      plan.status === "delivered"
        ? issuedAt + 2 * DAY
        : plan.status === "rts_at_gerai"
          ? issuedAt + 4 * DAY
          : plan.status === "rts_returned_to_sender"
            ? now - (((i % 5) + 1) * DAY)
            : plan.stuck
              ? issuedAt + 6 * HOUR
              : issuedAt + 4 * HOUR
    const kgBillable = Math.max(1, Math.ceil(plan.weightGram / 1000))
    const publishShipping = c.baseShip + (kgBillable - 1) * (c.serviceClass === "cargo" ? 4500 : 8000) + ((i % 3) * 1000)
    const providerNet = Math.round((publishShipping * (10_000 - c.bps)) / 10_000)
    const serviceFee = plan.cod ? 0 : 1000
    const codGoods = plan.cod ? 120_000 + (i % 6) * 35_000 : 0
    const codFee = plan.cod ? Math.max(3000, Math.round(((codGoods + publishShipping) * 3) / 100)) : 0
    const codCollection = plan.cod ? codGoods + publishShipping + codFee : 0
    const counterDue = plan.cod ? plan.packingIdr : publishShipping + plan.packingIdr + serviceFee
    const expectedProviderCodCredit = plan.cod ? codCollection - providerNet - codFee : 0
    const senderCodPayable = plan.cod ? codGoods : 0
    const estimatedMargin = publishShipping - providerNet + plan.packingIdr + serviceFee
    const awb = hasAwb ? `${c.awbPrefix}${String(10410 + i * 37).padStart(6, "0")}` : null
    const orderCode = dispatchState === "cancelled" ? `MGT-DM-C${1000 + i}` : `MGT-DM-${1000 + i}`
    const quoteId = `demo-q-${slug}`
    const method = METHODS[i % METHODS.length]!

    // Assign to one of the 3 bulk batches if matching sender/window.
    let attachBulk: string | null = null
    for (const bb of bulkBatches) {
      if (!attachBulk && hasAwb && !plan.cod && bb.rows < bb.max && plan.daysAgo >= bb.daysAgo && plan.daysAgo <= bb.daysAgo + 5) {
        attachBulk = bb.id
        bb.rows++
      }
    }
    const channel = attachBulk ? "bulk" : CHANNELS[i % CHANNELS.length]!
    const isPaid = dispatchState !== "cancelled" && !plan.unpaid
    const counterPaymentStatus = dispatchState === "cancelled" ? "voided" : counterDue === 0 ? "not_required" : isPaid ? "paid" : "unpaid"
    const reconciled = hasAwb && plan.status === "delivered"
    const paymentSyncState = reconciled
      ? "provider_invoice_reconciled"
      : hasAwb
        ? "provider_paid_estimated"
        : dispatchState === "provider_unpaid_hold"
          ? "provider_unpaid"
          : "unissued"
    const custodyStage =
      dispatchState === "cancelled"
        ? "cancelled_local"
        : !hasAwb || plan.status === "ready_for_pickup"
          ? "none"
          : plan.status === "rts_at_gerai"
            ? "rts_at_gerai"
            : plan.status === "rts_returned_to_sender"
              ? "rts_returned_to_sender"
              : "handed_to_courier"

    const providerStatus =
      dispatchState !== "issued"
        ? null
        : plan.status === "delivered"
          ? "delivered"
          : plan.status === "in_transit"
            ? "in_transit"
            : plan.status === "handed_to_courier"
              ? "handed_to_courier"
              : plan.status === "ready_for_pickup"
                ? "ready_for_pickup"
                : plan.status === "undelivery_hold"
                  ? "undelivery_hold"
                  : plan.status === "lost"
                    ? "lost"
                    : plan.status === "rts_in_transit"
                      ? "rts_in_transit"
                      : "provider_returned"

    const providerRank =
      plan.status === "delivered" || plan.status === "lost"
        ? 40
        : plan.status.startsWith("rts_")
          ? 35
          : plan.status === "undelivery_hold"
            ? 25
            : plan.status === "in_transit"
              ? 20
              : plan.status === "handed_to_courier"
                ? 15
                : 10

    const trueSenderJson = JSON.stringify({
      name: sender.name,
      phone: sender.phone,
      area: sender.areaLabel,
      brand: sender.brand,
    })
    const trueRecipientJson = JSON.stringify({
      name: recipient.name,
      phone: recipient.phone,
      street: recipient.street,
      area: `${recipient.subdistrict}, ${recipient.district}, ${recipient.city} ${recipient.postal}`,
    })
    const maskSnapshotJson = JSON.stringify({
      sender: { name: sender.brand ?? sender.name, phone: sender.brandPhone ?? sender.phone },
      recipientPhonePrinted: recipient.phone,
      showOutletBranding: sender.kind !== "reseller_dropship",
      showShippingFee: true,
    })
    const pickupSnapshotJson = JSON.stringify({
      name: DEMO_TENANT_NAME,
      phone: "08xx-xxxx-9900",
      area: "Dago, Coblong, Kota Bandung 40135",
    })

    sql.exec("INSERT INTO inv_slugs (slug, purpose, created_at) VALUES (?, ?, ?)", slug, channel === "bulk" ? "bulk" : channel === "minisite_qr" ? "minisite_qr" : "draft", issuedAt - 120_000)

    sql.exec(
      `INSERT INTO quote_snapshots (id, tenant_id, shipment_slug, origin_area_id, destination_area_id, cod_fee_mode, actual_weight_gram, length_cm, width_cm, height_cm, volumetric_divisor, billable_weight_gram, provider_weight_kg_text, courier_code, service_code, service_class, publish_shipping_idr, provider_net_shipping_idr, raw_discount_percent, provider_observed_discount_bps, assigned_gerai_discount_bps, effective_gerai_cost_idr, insurance_fee_idr, cod_fee_idr, cod_goods_amount_idr, cod_collection_total_idr, counter_due_idr, sender_cod_payable_idr, expected_provider_cod_credit_idr, packing_addon_idr, estimated_margin_idr, quoted_at, expires_at, counter_service_fee_idr, promo_discount_idr, declared_value_idr, is_dangerous_goods)
       VALUES (?1, ?2, ?3, '5fc62f5df8f44b34aa4c0d8c', ?4, ?5, ?6, 25, 18, 10, 6000, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?13, NULL, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, 0, 0, 0)`,
      quoteId,
      tenantId,
      slug,
      recipient.areaId,
      plan.cod ? "buyer_bears_fee" : "none",
      plan.weightGram,
      kgBillable * 1000,
      String(kgBillable),
      c.courierCode,
      c.serviceCode,
      c.serviceClass,
      publishShipping,
      providerNet,
      `${c.bps / 100}%`,
      c.bps,
      codFee,
      codGoods,
      codCollection,
      counterDue,
      senderCodPayable,
      expectedProviderCodCredit,
      plan.packingIdr,
      estimatedMargin,
      issuedAt - 60_000,
      issuedAt + 15 * 60_000,
      serviceFee,
    )

    // Attach to a matching completed pickup batch when eligible.
    let attachPickup: string | null = null
    if (hasAwb && plan.status !== "ready_for_pickup" && dispatchState === "issued") {
      for (const pb of pickupDefs) {
        if (!attachPickup && pb.courier === c.courierCode && pb.count < pb.max && plan.daysAgo >= pb.daysAgo) {
          attachPickup = pb.id
          pb.count++
        }
      }
    }

    const effectiveStatus = dispatchState === "provider_unpaid_hold" ? "provider_unpaid_hold" : dispatchState === "cancelled" ? "cancelled" : plan.status

    sql.exec(
      `INSERT INTO shipments (tenant_id, slug, courier_code, mengantar_order_code, awb_number, status, provider_status, last_provider_event_at, last_provider_rank, custody_stage, custody_at, provider_status_conflict_at, stuck_attention_at, last_polled_at, index_version, created_at, updated_at, quote_snapshot_id, entry_channel, outlet_id, sender_contact_id, recipient_contact_id, cashier_shift_id, created_by_user_id, dispatch_state, service_code, is_cargo, cod_fee_mode, payment_sync_state, sorting_code, provider_echoed_weight_kg_text, true_sender_json, true_recipient_json, content_declaration_text, prohibited_ack_at, publish_shipping_idr, gerai_shipping_cost_idr, packing_addon_idr, counter_service_fee_idr, promo_discount_idr, cod_goods_amount_idr, cod_service_fee_idr, cod_collection_total_idr, counter_due_idr, counter_total_paid_idr, expected_provider_cod_credit_idr, sender_cod_payable_idr, actual_weight_gram, billable_weight_gram, counter_payment_status, counter_payment_method, counter_paid_at, counter_paid_by, counter_paid_shift_id, first_printed_at, print_count, issued_at, cancelled_at, mask_preset, mask_snapshot_json, pickup_snapshot_json, sender_cod_paid_idr, reconciled_provider_cod_credit_idr, bulk_batch_id, provider_reconciled_cost_idr, reconciled_extra_adjustment_idr, pickup_batch_id, item_quantity)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?15, ?34, ?35, ?36, ?37, 0, ?38, ?39, ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50, ?51, ?52, ?53, ?54, ?55, ?56, ?57, ?58, ?59, ?60, ?61, ?62, ?63, ?64, 1)`,
      tenantId,
      slug,
      c.courierCode,
      orderCode,
      awb,
      effectiveStatus,
      providerStatus,
      updatedAt,
      providerRank,
      custodyStage,
      custodyStage === "none" ? null : issuedAt + 3 * HOUR,
      plan.conflict ? now - 10 * HOUR : null,
      plan.stuck ? now - 12 * HOUR : null,
      now - 15 * 60_000,
      issuedAt,
      updatedAt,
      quoteId,
      channel,
      outletId,
      sender.id,
      recipient.id,
      plan.daysAgo === 0 ? openShiftId : closedShiftId,
      actorId,
      dispatchState,
      c.serviceCode,
      c.serviceClass === "cargo" ? 1 : 0,
      plan.cod ? "buyer_bears_fee" : "none",
      paymentSyncState,
      recipient.sortingCode,
      String(kgBillable),
      trueSenderJson,
      trueRecipientJson,
      ITEMS[i % ITEMS.length]!,
      publishShipping,
      providerNet,
      plan.packingIdr,
      serviceFee,
      codGoods,
      codFee,
      codCollection,
      counterDue,
      isPaid ? counterDue : 0,
      expectedProviderCodCredit,
      senderCodPayable,
      plan.weightGram,
      kgBillable * 1000,
      counterPaymentStatus,
      isPaid && counterDue > 0 ? method : null,
      isPaid && counterDue > 0 ? issuedAt + 30_000 : null,
      isPaid && counterDue > 0 ? actorId : null,
      isPaid && counterDue > 0 ? (plan.daysAgo === 0 ? openShiftId : closedShiftId) : null,
      plan.printed ? issuedAt + 60_000 : null,
      plan.printed ? 1 : 0,
      hasAwb ? issuedAt : null,
      dispatchState === "cancelled" ? issuedAt + 30 * 60_000 : null,
      sender.kind === "reseller_dropship" ? "dropship_toko" : "standar_gerai",
      maskSnapshotJson,
      pickupSnapshotJson,
      plan.cod && plan.codPaidOut ? senderCodPayable : null,
      plan.cod && reconciled ? expectedProviderCodCredit : null,
      attachBulk,
      !plan.cod && reconciled ? providerNet + (plan.adjustmentIdr ?? 0) : null,
      reconciled ? (plan.adjustmentIdr ?? 0) : null,
      attachPickup,
    )

    if (attachPickup) {
      const pb = pickupDefs.find((x) => x.id === attachPickup)!
      sql.exec("INSERT INTO pickup_batch_items (batch_id, slug, scanned_at, scanned_by, unpaid_warning) VALUES (?, ?, ?, ?, 0)", attachPickup, slug, now - pb.daysAgo * DAY + 30 * 60_000, actorId)
    }

    if (attachBulk) {
      const bb = bulkBatches.find((x) => x.id === attachBulk)!
      sql.exec(
        `INSERT INTO bulk_import_rows (batch_id, row_no, raw_json, recipient_name, recipient_phone, street, area_text, area_id, area_label, postal_code, content, weight_gram, cod_goods_idr, publish_shipping_idr, cod_fee_idr, counter_due_idr, cod_collection_total_idr, sender_cod_payable_idr, estimated_margin_idr, service_code, state, shipment_slug)
         VALUES (?1, ?2, '{}', ?3, ?4, ?5, ?6, ?7, ?6, ?8, ?9, ?10, 0, ?11, 0, ?12, 0, 0, ?13, ?14, 'created', ?15)`,
        attachBulk,
        bb.rows,
        recipient.name,
        recipient.phone,
        recipient.street,
        `${recipient.district}, ${recipient.city}`,
        recipient.areaId,
        recipient.postal,
        ITEMS[i % ITEMS.length]!,
        plan.weightGram,
        publishShipping,
        counterDue,
        estimatedMargin,
        c.serviceCode,
        slug,
      )
    }

    // Rich Indonesian Mengantar checkpoint timeline (`status_text` populated for /kiriman/$slug & /kontak/*).
    const addEv = (n: number, source: "local" | "webhook" | "poll", rawCat: string, mapped: string | null, statusText: string, at: number) => {
      sql.exec(
        `INSERT INTO shipment_events (event_key, slug, source, raw_category, mapped_status, status_text, event_at, event_at_text, recorded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?7)`,
        `demo-ev-${slug}-${n}`,
        slug,
        source,
        rawCat,
        mapped,
        statusText,
        at,
      )
    }

    addEv(1, "local", "ORDER_CREATED", "ready_for_pickup", `Paket diterima di loket ${DEMO_TENANT_NAME}`, issuedAt)

    if (dispatchState === "cancelled") {
      addEv(2, "local", "CANCELLED", "cancelled", "Kiriman dibatalkan atas permintaan pengirim sebelum pickup", issuedAt + 30 * 60_000)
    } else if (dispatchState === "provider_unpaid_hold") {
      addEv(2, "local", "UNPAID_HOLD", null, "Menunggu saldo Mengantar untuk penerbitan resi", issuedAt + 2 * 60_000)
    } else if (plan.status !== "ready_for_pickup") {
      addEv(2, "local", "PICKED_UP", "handed_to_courier", `Paket diserahkan ke kurir pickup ${c.label}`, issuedAt + 2 * HOUR)
      if (plan.status !== "handed_to_courier") {
        addEv(3, "webhook", "ON_PROCESS", "in_transit", `Paket tiba di Gudang Sortir ${c.label} Bandung`, issuedAt + 5 * HOUR)
        if (!plan.stuck) {
          addEv(4, "poll", "ON_PROCESS", "in_transit", `Paket tiba di Hub ${c.label} ${recipient.city}`, issuedAt + 22 * HOUR)
        }
      }
      if (plan.status === "delivered") {
        addEv(5, "webhook", "ON_DELIVERY", "in_transit", `Kurir sedang mengantar ke alamat penerima (${recipient.district})`, updatedAt - 3 * HOUR)
        addEv(6, "webhook", "DELIVERED", "delivered", `Paket diterima oleh ${recipient.name} (Ybs)`, updatedAt)
      } else if (plan.status === "undelivery_hold") {
        addEv(5, "webhook", "UNDELIVERY", "undelivery_hold", `Gagal antar di ${recipient.district}: rumah kosong / penerima belum bisa dihubungi`, updatedAt)
      } else if (plan.status === "rts_in_transit") {
        addEv(5, "webhook", "UNDELIVERY", "undelivery_hold", "Gagal antar 3× percobaan — paket diproses retur", issuedAt + 30 * HOUR)
        addEv(6, "webhook", "RTS", "rts_in_transit", `Paket retur dalam perjalanan kembali ke ${DEMO_TENANT_NAME}`, updatedAt)
      } else if (plan.status === "rts_at_gerai") {
        addEv(5, "webhook", "RTS", "provider_returned", "Paket retur tiba di gerai asal", updatedAt - HOUR)
        addEv(6, "local", "rts_at_gerai", null, plan.returnDamaged ? "Diterima di Meja Retur (kondisi penyok/rusak — siap klaim)" : "Diterima di Meja Retur — menunggu Kode Ambil pengirim", updatedAt)
      } else if (plan.status === "rts_returned_to_sender") {
        addEv(5, "webhook", "RTS", "provider_returned", "Paket retur tiba di gerai asal", updatedAt - 2 * DAY)
        addEv(6, "local", "rts_returned_to_sender", null, "Paket retur telah diserahkan kembali ke pengirim dengan Kode Ambil", updatedAt)
      } else if (plan.status === "lost") {
        addEv(5, "webhook", "LOST", "lost", `Paket dilaporkan hilang di hub transit ${recipient.city}`, updatedAt)
      }
    }

    // Book 1 counter receipt for paid counter dues.
    if (isPaid && counterDue > 0) {
      sql.exec(
        `INSERT INTO counter_receipts (id, tenant_id, shipment_slug, event, direction, amount_idr, method, cash_received_idr, change_idr, shift_id, actor_user_id, idempotency_key, created_at)
         VALUES (?1, ?2, ?3, 'mark_paid', 'in', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        `demo-rcpt-${slug}`,
        tenantId,
        slug,
        counterDue,
        method,
        method === "tunai" ? Math.ceil(counterDue / 10_000) * 10_000 : null,
        method === "tunai" ? Math.ceil(counterDue / 10_000) * 10_000 - counterDue : null,
        plan.daysAgo === 0 ? openShiftId : closedShiftId,
        actorId,
        `demo-pay-${slug}`,
        issuedAt + 30_000,
      )
    }

    // Sender COD payout receipt when already paid out.
    if (plan.cod && plan.codPaidOut && senderCodPayable > 0) {
      sql.exec(
        `INSERT INTO counter_receipts (id, tenant_id, shipment_slug, event, direction, amount_idr, method, shift_id, actor_user_id, idempotency_key, created_at)
         VALUES (?1, ?2, ?3, 'sender_cod_payout', 'out', ?4, 'transfer', ?5, ?6, ?7, ?8)`,
        `demo-payout-${slug}`,
        tenantId,
        slug,
        senderCodPayable,
        closedShiftId,
        actorId,
        `demo-codout-${slug}`,
        updatedAt + 4 * HOUR,
      )
    }

    // Book 2 Mengantar mirror invoice for delivered shipments.
    if (reconciled && awb) {
      if (!plan.cod) {
        const billed = providerNet + (plan.adjustmentIdr ?? 0)
        mirrorBalance -= billed
        const invId = `demo-inv-pay-${slug}`
        sql.exec(
          `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, courier, order_code, awb_number, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
           VALUES (?1, ?2, 'typePayment', 'statusCleared', ?3, ?4, ?5, ?6, ?6, ?7, ?8, ?9, ?9, '{}', 'linked', ?9, ?10)`,
          invId,
          `MGT-PAY-${slug.toUpperCase()}`,
          c.courierCode,
          orderCode,
          awb,
          -billed,
          mirrorBalance,
          plan.adjustmentIdr ? "Pembayaran ongkir Non-COD + penyesuaian berat aktual" : "Pembayaran ongkir Non-COD",
          issuedAt + HOUR,
          now,
        )
        sql.exec(
          `INSERT INTO mengantar_invoice_subitems (invoice_id, idx, awb_number, order_code, amount_idr, estimated_price_idr, estimated_special_price_idr, shipment_slug)
           VALUES (?1, 0, ?2, ?3, ?4, ?5, ?6, ?7)`,
          invId,
          awb,
          orderCode,
          -billed,
          publishShipping,
          providerNet,
          slug,
        )
        if (plan.adjustmentIdr) discrepancySlug1 = slug
        else if (!discrepancySlug2 && i > 18) discrepancySlug2 = slug
      } else {
        mirrorBalance += expectedProviderCodCredit
        const invId = `demo-inv-cod-${slug}`
        sql.exec(
          `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, courier, order_code, awb_number, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
           VALUES (?1, ?2, 'typeReconciliation', 'statusCleared', ?3, ?4, ?5, ?6, ?6, ?7, 'Pencairan COD berhasil', ?8, ?8, '{}', 'linked', ?8, ?9)`,
          invId,
          `MGT-COD-${slug.toUpperCase()}`,
          c.courierCode,
          orderCode,
          awb,
          expectedProviderCodCredit,
          mirrorBalance,
          updatedAt + 6 * HOUR,
          now,
        )
        sql.exec(
          `INSERT INTO mengantar_invoice_subitems (invoice_id, idx, awb_number, order_code, amount_idr, cod_amount_idr, estimated_price_idr, estimated_special_price_idr, shipment_slug)
           VALUES (?1, 0, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
          invId,
          awb,
          orderCode,
          expectedProviderCodCredit,
          codCollection,
          publishShipping,
          providerNet,
          slug,
        )
      }
    }

    // Meja Retur records for RTS items at gerai & already handed back.
    if (plan.status === "rts_at_gerai" || plan.status === "rts_returned_to_sender") {
      const intakeAt = plan.status === "rts_returned_to_sender" ? updatedAt - 2 * DAY : updatedAt
      const handedBack = plan.status === "rts_returned_to_sender"
      sql.exec(
        `INSERT INTO return_intakes (slug, tenant_id, condition, note, intake_by, intake_at, storage_deadline_at, handback_at, handback_by, handback_method, claim_offered)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        slug,
        tenantId,
        plan.returnDamaged ? "penyok_rusak" : "baik",
        plan.returnDamaged ? "Kardus penyok di sudut; foto bukti penerimaan sudah diambil" : "Penerima tidak di tempat 3× percobaan antar",
        actorId,
        intakeAt,
        intakeAt + 14 * DAY,
        handedBack ? updatedAt : null,
        handedBack ? actorId : null,
        handedBack ? "code" : null,
        plan.returnDamaged ? 1 : 0,
      )
    }

    // Active claim for the submitted lost shipment (leave the second lost shipment unclaimed so "Ajukan Klaim" shows too).
    if (plan.status === "lost" && plan.claimSubmitted) {
      refundSlug = slug
      sql.exec(
        `INSERT INTO shipment_claims (id, tenant_id, shipment_slug, kind, status, deadline_at, note, evidence_json, submitted_at, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'hilang', 'submitted', ?4, 'Paket tidak ditemukan di hub tujuan; bukti foto packing sudah dilampirkan.', '[]', ?5, ?6, ?5, ?5)`,
        `demo-claim-${slug}`,
        tenantId,
        slug,
        issuedAt + 14 * DAY,
        issuedAt + 6 * DAY,
        actorId,
      )
    }

    indexRows.push({ slug, awbNumber: awb, courierCode: c.courierCode, status: effectiveStatus, createdAt: issuedAt, updatedAt })
  })

  // Update exact scanned_count on the 4 pickup batches and add 1 failed row to the partially_failed bulk batch.
  for (const pb of pickupDefs) {
    sql.exec("UPDATE pickup_batches SET scanned_count = ? WHERE id = ?", pb.count, pb.id)
  }
  sql.exec(
    `INSERT INTO bulk_import_rows (batch_id, row_no, raw_json, recipient_name, recipient_phone, street, area_text, area_id, area_label, postal_code, content, weight_gram, cod_goods_idr, publish_shipping_idr, cod_fee_idr, counter_due_idr, cod_collection_total_idr, sender_cod_payable_idr, estimated_margin_idr, service_code, state, errors_json)
     VALUES ('00000000-0000-4000-8000-000000000203', 4, '{}', 'Budi Contoh', '08xx-xxxx-9988', 'Jl. Belum Lengkap', 'Kecamatan tidak dikenal', NULL, NULL, NULL, 'Paket Skincare', 1000, 0, NULL, 0, NULL, 0, 0, NULL, 'SiCepat', 'needs_fix', '{"area":"Kecamatan tujuan belum ditemukan — pilih dari daftar."}')`,
  )

  // 2 Active Mini-Site QR Pre-Booking Drafts (fills `Draf QR` tab on /kiriman + `minisite_drafts`).
  const qrDrafts = [
    { slug: demoSlug(80), senderName: "Rina Wulandari", senderPhone: "08xx-xxxx-1001", senderStore: "Butik Melati Bandung", recName: "Anisa Rahma", recPhone: "08xx-xxxx-2001", recArea: "5fc62f5df8f44b34aa4c0d8d", recLabel: "Tebet Barat, Tebet, Jakarta Selatan", recStreet: "Jl. Tebet Barat Dalam Contoh No. 12", content: "Blouse Katun Linen", weight: 1000, cod: 0, codGoods: 0, hoursAgo: 3 },
    { slug: demoSlug(81), senderName: "Dewi Lestari", senderPhone: "08xx-xxxx-1003", senderStore: "Skincare Cantik Alami", recName: "Maya Puspita", recPhone: "08xx-xxxx-2005", recArea: "5fc62f5df8f44b34aa4c0d91", recLabel: "BSD, Serpong, Kota Tangerang Selatan", recStreet: "Cluster Anggrek Contoh Blok B4 No. 9", content: "Serum Vitamin C + Toner", weight: 1000, cod: 1, codGoods: 185000, hoursAgo: 6 },
  ]
  for (const d of qrDrafts) {
    const t = now - d.hoursAgo * HOUR
    sql.exec("INSERT INTO inv_slugs (slug, purpose, created_at) VALUES (?, 'minisite_qr', ?)", d.slug, t)
    sql.exec(
      `INSERT INTO minisite_drafts (slug, tenant_id, cod, sender_name, sender_phone, sender_store, recipient_name, recipient_phone, recipient_area_id, recipient_area_label, recipient_street, content, weight_gram, cod_goods_idr, ip_hash, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'demo-ip-hash', ?15, ?16)`,
      d.slug,
      tenantId,
      d.cod,
      d.senderName,
      d.senderPhone,
      d.senderStore,
      d.recName,
      d.recPhone,
      d.recArea,
      d.recLabel,
      d.recStreet,
      d.content,
      d.weight,
      d.codGoods,
      t,
      t + 48 * HOUR,
    )
    sql.exec(
      `INSERT INTO shipments (tenant_id, slug, courier_code, status, index_version, created_at, updated_at, entry_channel, outlet_id, created_by_user_id, dispatch_state, cod_fee_mode, content_declaration_text, actual_weight_gram, billable_weight_gram, counter_due_idr, counter_payment_status)
       VALUES (?1, ?2, 'JNE', 'draft', 1, ?3, ?3, 'minisite_qr', ?4, ?5, 'draft', ?6, ?7, ?8, ?8, 0, 'unpaid')`,
      tenantId,
      d.slug,
      t,
      outletId,
      actorId,
      d.cod ? "buyer_bears_fee" : "none",
      d.content,
      d.weight,
    )
  }

  // 1 Claim Refund mirror entry + 2 Finance Discrepancies so `/keuangan?tab=selisih` has actionable rows.
  if (refundSlug) {
    mirrorBalance += 150_000
    sql.exec(
      `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, courier, order_code, awb_number, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
       VALUES ('demo-inv-refund-1', 'MGT-REF-DEMO01', 'typeRefund', 'statusCleared', 'lion', 'MGT-DM-REF1', NULL, 150000, 150000, ?1, 'Penggantian klaim paket hilang disetujui', ?2, ?2, '{}', 'linked', ?2, ?3)`,
      mirrorBalance,
      now - 5 * DAY,
      now,
    )
  }
  if (discrepancySlug1) {
    sql.exec(
      `INSERT INTO finance_discrepancies (id, invoice_id, kind, shipment_slug, expected_idr, actual_idr, detail, created_at)
       VALUES ('demo-disc-1', ?1, 'adjustment', ?2, 27000, 34500, 'Penyesuaian berat volumetrik oleh kurir di hub sortir (+Rp 7.500)', ?3)`,
      `demo-inv-pay-${discrepancySlug1}`,
      discrepancySlug1,
      now - 8 * DAY,
    )
  }
  if (discrepancySlug2) {
    sql.exec(
      `INSERT INTO finance_discrepancies (id, invoice_id, kind, shipment_slug, expected_idr, actual_idr, detail, created_at)
       VALUES ('demo-disc-2', ?1, 'debit_differs', ?2, 14400, 15200, 'Potongan invoice Mengantar berbeda Rp 800 dari estimasi awal', ?3)`,
      `demo-inv-pay-${discrepancySlug2}`,
      discrepancySlug2,
      now - 4 * DAY,
    )
  }

  // Keep synced_balance_idr aligned with the mirror running balance so Book 2 looks cohesive.
  sql.exec("UPDATE mengantar_connections SET synced_balance_idr = ? WHERE tenant_id = ?", Math.max(1_450_000, mirrorBalance), tenantId)

  // 24 rich notifications spanning multiple days -> triggers 2-page PageNav on /notifikasi!
  const notes: Array<[string, string, "all" | "owner", string, string, string, number, boolean]> = [
    ["demo-note-01", "finance", "owner", "Pencairan COD masuk ke saldo", "4 kiriman COD selesai sudah masuk ke mutasi saldo Mengantar.", "/keuangan?tab=mutasi", now - 35 * 60_000, false],
    ["demo-note-02", "exception", "all", "3 paket tidak bergerak > 48 jam", "Pantau paket macet di Kendala & Klaim untuk follow-up ke ekspedisi.", "/kiriman?tab=kendala", now - 2 * HOUR, false],
    ["demo-note-03", "return", "all", "3 paket retur menunggu diambil pengirim", "Cek Meja Retur untuk mengirim Kode Ambil ke pengirim.", "/kiriman?tab=retur", now - 4 * HOUR, false],
    ["demo-note-04", "finance", "owner", "2 kiriman menunggu saldo Mengantar", "Top-up saldo agar resi 2 kiriman tertahan segera terbit otomatis.", "/kiriman?tab=menunggu-saldo", now - 6 * HOUR, false],
    ["demo-note-05", "pickup", "all", "5 paket siap dijemput kurir hari ini", "Buka Pickup & Surat Jalan sebelum kurir sore tiba di loket.", "/kiriman?tab=pickup", now - 7 * HOUR, false],
    ["demo-note-06", "finance", "owner", "2 selisih sync perlu ditinjau", "Terdapat penyesuaian berat/potongan di tab Selisih Sync Keuangan.", "/keuangan?tab=selisih", now - 9 * HOUR, false],
    ["demo-note-07", "return", "all", "1 paket retur tiba kondisi penyok", "Foto bukti sudah diunggah; ajukan klaim sebelum batas waktu kurir.", "/kiriman?tab=retur", now - DAY - 2 * HOUR, true],
    ["demo-note-08", "pickup", "all", "Surat Jalan JNE selesai diserahkan", "4 paket diserahkan ke Darmawan (D 4512 ABC). PDF tersedia di arsip.", "/kiriman?tab=pickup", now - DAY - 5 * HOUR, true],
    ["demo-note-09", "exception", "all", "2 paket gagal antar (penerima tidak di rumah)", "Koordinasikan ulang alamat dengan pengirim melalui daftar Kendala.", "/kiriman?tab=kendala", now - DAY - 8 * HOUR, true],
    ["demo-note-10", "finance", "owner", "Sinkronisasi mutasi Mengantar selesai", "Seluruh mutasi harian berhasil dicocokkan dengan pembukuan loket.", "/keuangan", now - 2 * DAY - HOUR, true],
    ["demo-note-11", "pickup", "all", "Surat Jalan J&T Express selesai diserahkan", "4 paket diserahkan ke Sutisna (D 8831 KLM).", "/kiriman?tab=pickup", now - 2 * DAY - 4 * HOUR, true],
    ["demo-note-12", "finance", "owner", "Batch massal Butik Melati lunas", "4 kiriman dari order-butik-melati.csv sudah diterbitkan resinya.", "/kiriman/massal", now - 3 * DAY - 2 * HOUR, true],
    ["demo-note-13", "return", "all", "2 paket retur dalam perjalanan kembali", "Pantau estimasi kedatangan paket retur di Meja Retur.", "/kiriman?tab=retur", now - 3 * DAY - 6 * HOUR, true],
    ["demo-note-14", "pickup", "all", "Surat Jalan SiCepat selesai diserahkan", "3 paket diserahkan ke Ahmad Fauzi (D 2910 ZXC).", "/kiriman?tab=pickup", now - 4 * DAY - 3 * HOUR, true],
    ["demo-note-15", "finance", "owner", "Klaim paket hilang disetujui (Rp 150.000)", "Dana penggantian klaim sudah dikreditkan ke saldo Mengantar.", "/keuangan?tab=mutasi", now - 5 * DAY - 2 * HOUR, true],
    ["demo-note-16", "pickup", "all", "Surat Jalan iDexpress selesai diserahkan", "3 paket diserahkan ke Rizal Maulana (D 6104 BDG).", "/kiriman?tab=pickup", now - 6 * DAY - 4 * HOUR, true],
    ["demo-note-17", "return", "all", "Paket retur INV diserahkan ke pengirim", "Serah terima berhasil diverifikasi dengan Kode Ambil 4 digit.", "/kiriman?tab=retur", now - 7 * DAY - HOUR, true],
    ["demo-note-18", "finance", "owner", "Batch massal Kopi Nusantara selesai", "3 kiriman dari kiriman-kopi-nusantara.csv telah terbit resi.", "/kiriman/massal", now - 8 * DAY - 2 * HOUR, true],
    ["demo-note-19", "exception", "owner", "1 kiriman dengan status bertentangan", "Perlu catatan pengecekan pemilik di Kendala & Klaim › Status Bertentangan.", "/kiriman?tab=kendala", now - 9 * DAY - 3 * HOUR, true],
    ["demo-note-20", "finance", "owner", "Top-up saldo Mengantar Rp 2.500.000 tercatat", "Saldo aman tersedia diperbarui otomatis dari mutasi Mengantar.", "/keuangan", now - 10 * DAY - HOUR, true],
    ["demo-note-21", "exception", "all", "Draf klaim paket hilang diajukan", "Pantau perkembangan persetujuan klaim Lion Parcel di Kendala & Klaim.", "/kiriman?tab=kendala", now - 11 * DAY - 4 * HOUR, true],
    ["demo-note-22", "finance", "owner", "Batch skincare-promo-nov.csv perlu dicek", "1 baris gagal validasi kecamatan; 3 baris lainnya berhasil dibuat.", "/kiriman/massal", now - 13 * DAY - 2 * HOUR, true],
    ["demo-note-23", "finance", "owner", "Ringkasan laba mingguan tersedia", "Bandingkan Estimasi Laba vs Laba Kas di halaman Keuangan.", "/keuangan?tab=laba", now - 15 * DAY - 3 * HOUR, true],
    ["demo-note-24", "system", "owner", "Webhook Mengantar aktif dan sehat", "Pembaruan status paket diterima otomatis tanpa delay.", "/pengaturan/mengantar", now - 18 * DAY - HOUR, true],
  ]
  for (const [id, kind, audience, title, body, link, createdAt, isRead] of notes) {
    sql.exec("INSERT INTO notifications (id, tenant_id, kind, audience, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, tenantId, kind, audience, title, body, link, createdAt)
    if (isRead) {
      sql.exec("INSERT INTO notification_reads (notification_id, user_id, read_at) VALUES (?, ?, ?)", id, actorId, createdAt + 30 * 60_000)
    }
  }

  return { shipments: indexRows, senders: SENDERS.length, recipients: RECIPIENTS.length }
}

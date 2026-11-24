// Idempotent transactional seeder for the demo GeraiVaultDO (42 shipments across 45 days, 12 senders, 24 recipients,
// Book 1 counter receipts, Book 2 Mengantar mirror invoices, pickup manifest, returns, claims, shifts, notifications).
// All people, stores, addresses, and phone numbers are synthetic (AGENTS.md Example Data Policy: redacted 08xx-xxxx-NNNN).
import { encryptString } from "../crypto/aead"
import { DEMO_SELLER_API_KEY, DEMO_TENANT_NAME } from "./constants"

const ALPHABET = "23456789abcdefghjkmnpqrstvwxyz"
const DAY = 86_400_000
const HOUR = 3_600_000

const demoSlug = (i: number): string => `dm${ALPHABET[Math.floor(i / 25) % ALPHABET.length]}${ALPHABET[i % 25]}k${ALPHABET[(i * 7 + 3) % ALPHABET.length]}${ALPHABET[(i * 11 + 5) % ALPHABET.length]}`

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

const SENDERS: SenderDef[] = [
  { id: "demo-snd-01", kind: "reseller_dropship", name: "Rina Wulandari", phone: "08xx-xxxx-1001", brand: "Butik Melati Bandung", brandPhone: "08xx-xxxx-1001", street: "Jl. Riau Contoh No. 14", areaLabel: "Citarum, Bandung Wetan, Kota Bandung", postal: "40115", verified: true },
  { id: "demo-snd-02", kind: "reseller_dropship", name: "Hendra Gunawan", phone: "08xx-xxxx-1002", brand: "Kopi Nusantara Roastery", brandPhone: "08xx-xxxx-1002", street: "Jl. Cigadung Contoh No. 7", areaLabel: "Cigadung, Cibeunying Kaler, Kota Bandung", postal: "40191", verified: true },
  { id: "demo-snd-03", kind: "reseller_dropship", name: "Dewi Lestari", phone: "08xx-xxxx-1003", brand: "Skincare Cantik Alami", brandPhone: "08xx-xxxx-1003", street: "Jl. Buah Batu Contoh No. 92", areaLabel: "Turangga, Lengkong, Kota Bandung", postal: "40264", verified: true },
  { id: "demo-snd-04", kind: "reseller_dropship", name: "Agus Supriyanto", phone: "08xx-xxxx-1004", brand: "Gadget Karya Aksesoris", brandPhone: "08xx-xxxx-1004", street: "Jl. Merdeka Contoh No. 31", areaLabel: "Babakan Ciamis, Sumur Bandung, Kota Bandung", postal: "40117", verified: true },
  { id: "demo-snd-05", kind: "reseller_dropship", name: "Siti Aminah", phone: "08xx-xxxx-1005", brand: "Dapur Kue Ibu Ani", brandPhone: "08xx-xxxx-1005", street: "Jl. Antapani Contoh No. 22", areaLabel: "Antapani Tengah, Antapani, Kota Bandung", postal: "40291", verified: true },
  { id: "demo-snd-06", kind: "reseller_dropship", name: "Bambang Wijaya", phone: "08xx-xxxx-1006", brand: "Batik Sekar Jaya", brandPhone: "08xx-xxxx-1006", street: "Jl. Pajajaran Contoh No. 55", areaLabel: "Pasirkaliki, Cicendo, Kota Bandung", postal: "40171", verified: true },
  { id: "demo-snd-07", kind: "reseller_dropship", name: "Nadia Putri", phone: "08xx-xxxx-1007", brand: "Herbal Sehat ID", brandPhone: "08xx-xxxx-1007", street: "Jl. Setiabudi Contoh No. 40", areaLabel: "Hegarmanah, Cidadap, Kota Bandung", postal: "40141", verified: true },
  { id: "demo-snd-08", kind: "walk_in", name: "Budi Santoso", phone: "08xx-xxxx-1008", brand: null, brandPhone: null, street: "Jl. Dago Asri Contoh No. 5", areaLabel: "Dago, Coblong, Kota Bandung", postal: "40135", verified: true },
  { id: "demo-snd-09", kind: "walk_in", name: "Yulianti Pratiwi", phone: "08xx-xxxx-1009", brand: null, brandPhone: null, street: "Jl. Dipatiukur Contoh No. 19", areaLabel: "Lebakgede, Coblong, Kota Bandung", postal: "40132", verified: false },
  { id: "demo-snd-10", kind: "walk_in", name: "Fajar Nugroho", phone: "08xx-xxxx-1010", brand: null, brandPhone: null, street: "Jl. Sukajadi Contoh No. 63", areaLabel: "Pasteur, Sukajadi, Kota Bandung", postal: "40161", verified: false },
  { id: "demo-snd-11", kind: "walk_in", name: "Ratna Sari", phone: "08xx-xxxx-1011", brand: null, brandPhone: null, street: "Jl. Cihampelas Contoh No. 11", areaLabel: "Cipaganti, Coblong, Kota Bandung", postal: "40131", verified: true },
  { id: "demo-snd-12", kind: "walk_in", name: "Dedi Kurniawan", phone: "08xx-xxxx-1012", brand: null, brandPhone: null, street: "Jl. Tubagus Ismail Contoh No. 8", areaLabel: "Sekeloa, Coblong, Kota Bandung", postal: "40134", verified: false },
]

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
]

const COURIERS = [
  { courierCode: "JNE", serviceCode: "JNE", serviceClass: "regular" as const, awbPrefix: "CGK2508", bps: 2500, baseShip: 20_000 },
  { courierCode: "JT", serviceCode: "JT", serviceClass: "regular" as const, awbPrefix: "JP98412", bps: 2500, baseShip: 18_000 },
  { courierCode: "SiCepat", serviceCode: "SiCepat", serviceClass: "regular" as const, awbPrefix: "0042819", bps: 3000, baseShip: 19_000 },
  { courierCode: "iDexpress", serviceCode: "iDexpress", serviceClass: "regular" as const, awbPrefix: "IDE7712", bps: 2500, baseShip: 16_000 },
  { courierCode: "Sap", serviceCode: "Sap", serviceClass: "regular" as const, awbPrefix: "SAP8810", bps: 2500, baseShip: 17_000 },
  { courierCode: "anteraja", serviceCode: "anteraja", serviceClass: "regular" as const, awbPrefix: "1000891", bps: 2000, baseShip: 18_000 },
  { courierCode: "spx", serviceCode: "spx", serviceClass: "regular" as const, awbPrefix: "SPXID05", bps: 2000, baseShip: 15_000 },
  { courierCode: "lion", serviceCode: "lion", serviceClass: "regular" as const, awbPrefix: "11LP172", bps: 2000, baseShip: 22_000 },
  { courierCode: "JNE", serviceCode: "JTR", serviceClass: "cargo" as const, awbPrefix: "JTR2508", bps: 2000, baseShip: 45_000 },
] as const

const ITEMS = [
  "Kemeja Katun Lengan Panjang",
  "Biji Kopi Arabika Gayo 500g",
  "Paket Skincare Brightening Set",
  "Charger Fast Charging 65W + Kabel",
  "Kue Kering Nastar Toples 500g",
  "Kain Batik Tulis Motif Parang",
  "Madu Hutan Asli Botol 500ml",
  "Sepatu Lari Pria Ukuran 42",
  "Tas Ransel Laptop Waterproof",
  "Jaket Denim Oversize",
  "Hijab Voal Premium (3 pcs)",
  "Suplemen Herbal Imunitas (2 btl)",
]

const METHODS = ["qris", "tunai", "transfer", "deposit"] as const
const CHANNELS = ["counter_pos", "counter_pos", "counter_pos", "bulk", "minisite_qr"] as const

interface SeedPlan {
  daysAgo: number
  hoursOffset: number
  status: "delivered" | "in_transit" | "ready_for_pickup" | "rts_at_gerai" | "rts_returned_to_sender" | "lost"
  cod: boolean
  unpaid?: boolean
  stuck?: boolean
  printed?: boolean
  codPaidOut?: boolean
  courierIdx: number
  senderIdx: number
  recipientIdx: number
  weightGram: number
  packingIdr: number
}

// 42 realistic shipments distributed across 45 days: 5 today, 16 in last 7 days, 30 in last 30 days, 12 in days 31..44.
const PLANS: SeedPlan[] = [
  // Today (5 shipments — rich "Hari Ini" view + ready_for_pickup + unpaid)
  { daysAgo: 0, hoursOffset: 1, status: "ready_for_pickup", cod: false, unpaid: true, printed: false, courierIdx: 0, senderIdx: 0, recipientIdx: 0, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 0, hoursOffset: 2, status: "ready_for_pickup", cod: true, unpaid: false, printed: false, courierIdx: 1, senderIdx: 2, recipientIdx: 4, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 0, hoursOffset: 3, status: "ready_for_pickup", cod: false, unpaid: true, printed: true, courierIdx: 2, senderIdx: 1, recipientIdx: 2, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 0, hoursOffset: 4, status: "ready_for_pickup", cod: true, unpaid: false, printed: true, courierIdx: 3, senderIdx: 3, recipientIdx: 6, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 0, hoursOffset: 5, status: "in_transit", cod: false, printed: true, courierIdx: 0, senderIdx: 4, recipientIdx: 8, weightGram: 2000, packingIdr: 5000 },

  // Days 1..6 (11 shipments -> 16 total in 7 days)
  { daysAgo: 1, hoursOffset: 2, status: "in_transit", cod: true, printed: true, courierIdx: 1, senderIdx: 0, recipientIdx: 1, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 1, hoursOffset: 6, status: "in_transit", cod: false, printed: true, courierIdx: 4, senderIdx: 5, recipientIdx: 10, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 2, hoursOffset: 3, status: "in_transit", cod: true, printed: true, courierIdx: 2, senderIdx: 6, recipientIdx: 12, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 2, hoursOffset: 8, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 7, recipientIdx: 14, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 3, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: false, printed: true, courierIdx: 1, senderIdx: 1, recipientIdx: 3, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 3, hoursOffset: 9, status: "delivered", cod: false, printed: true, courierIdx: 5, senderIdx: 2, recipientIdx: 5, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 4, hoursOffset: 3, status: "delivered", cod: true, codPaidOut: false, printed: true, courierIdx: 3, senderIdx: 3, recipientIdx: 7, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 4, hoursOffset: 7, status: "in_transit", cod: false, stuck: true, printed: true, courierIdx: 6, senderIdx: 4, recipientIdx: 9, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 5, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 8, senderIdx: 5, recipientIdx: 11, weightGram: 6000, packingIdr: 10000 },
  { daysAgo: 5, hoursOffset: 10, status: "rts_at_gerai", cod: true, printed: true, courierIdx: 1, senderIdx: 5, recipientIdx: 22, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 6, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 2, senderIdx: 0, recipientIdx: 19, weightGram: 1000, packingIdr: 0 },

  // Days 7..28 (14 shipments -> 30 total in 30 days)
  { daysAgo: 7, hoursOffset: 3, status: "in_transit", cod: true, stuck: true, printed: true, courierIdx: 4, senderIdx: 6, recipientIdx: 13, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 8, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 8, recipientIdx: 15, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 9, hoursOffset: 4, status: "rts_at_gerai", cod: true, printed: true, courierIdx: 2, senderIdx: 6, recipientIdx: 23, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 10, hoursOffset: 6, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 0, recipientIdx: 0, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 11, hoursOffset: 3, status: "lost", cod: false, printed: true, courierIdx: 7, senderIdx: 3, recipientIdx: 17, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 12, hoursOffset: 7, status: "delivered", cod: false, printed: true, courierIdx: 2, senderIdx: 9, recipientIdx: 16, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 14, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 3, senderIdx: 2, recipientIdx: 20, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 15, hoursOffset: 8, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 1, recipientIdx: 2, weightGram: 3000, packingIdr: 5000 },
  { daysAgo: 17, hoursOffset: 5, status: "rts_returned_to_sender", cod: true, printed: true, courierIdx: 1, senderIdx: 2, recipientIdx: 4, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 19, hoursOffset: 6, status: "delivered", cod: false, printed: true, courierIdx: 8, senderIdx: 4, recipientIdx: 9, weightGram: 8000, packingIdr: 10000 },
  { daysAgo: 21, hoursOffset: 3, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 3, recipientIdx: 21, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 23, hoursOffset: 7, status: "delivered", cod: false, printed: true, courierIdx: 5, senderIdx: 10, recipientIdx: 18, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 25, hoursOffset: 4, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 0, senderIdx: 0, recipientIdx: 1, weightGram: 2000, packingIdr: 3000 },
  { daysAgo: 27, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 6, senderIdx: 11, recipientIdx: 18, weightGram: 1000, packingIdr: 0 },

  // Days 31..44 (12 shipments in previous 30-day period for realistic growth trend badges)
  { daysAgo: 31, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 0, recipientIdx: 0, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 32, hoursOffset: 6, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 1, recipientIdx: 3, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 33, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 2, senderIdx: 2, recipientIdx: 5, weightGram: 2000, packingIdr: 5000 },
  { daysAgo: 34, hoursOffset: 7, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 3, senderIdx: 3, recipientIdx: 7, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 36, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 4, senderIdx: 4, recipientIdx: 8, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 37, hoursOffset: 8, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 5, recipientIdx: 10, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 38, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 6, recipientIdx: 12, weightGram: 2000, packingIdr: 0 },
  { daysAgo: 39, hoursOffset: 6, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 2, senderIdx: 0, recipientIdx: 1, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 40, hoursOffset: 4, status: "delivered", cod: false, printed: true, courierIdx: 8, senderIdx: 1, recipientIdx: 2, weightGram: 7000, packingIdr: 10000 },
  { daysAgo: 41, hoursOffset: 7, status: "delivered", cod: true, codPaidOut: true, printed: true, courierIdx: 1, senderIdx: 2, recipientIdx: 4, weightGram: 1000, packingIdr: 3000 },
  { daysAgo: 42, hoursOffset: 5, status: "delivered", cod: false, printed: true, courierIdx: 5, senderIdx: 7, recipientIdx: 14, weightGram: 1000, packingIdr: 0 },
  { daysAgo: 43, hoursOffset: 6, status: "delivered", cod: false, printed: true, courierIdx: 0, senderIdx: 3, recipientIdx: 21, weightGram: 1000, packingIdr: 3000 },
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
  const pickupBatchId = "demo-pickup-batch-1"
  const bulkBatchId = "demo-bulk-batch-1"
  const indexRows: SeededShipmentIndexRow[] = []

  // Clear existing demo data so re-running the seed refreshes the 45-day window cleanly without duplicates.
  const tables = [
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
     VALUES (?1, 'production', 'connected', 'active', 'demo-seller-001', ?1, ?2, 1, 'demo-webhook-token', NULL, 3485000, ?3, 'ok', ?3, ?3, ?3, 'idle')`,
    tenantId,
    encryptedDemoKey,
    now - 15 * 60_000,
  )

  sql.exec(
    `INSERT INTO finance_sync_state (id, last_run_at, last_ok_at, last_trigger, last_pages, last_error)
     VALUES (1, ?1, ?1, 'scheduled', 2, NULL)`,
    now - 15 * 60_000,
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
    const created = now - (45 - i) * DAY
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
      s.kind === "reseller_dropship" ? (i + 1) * 150_000 : 0,
      senderCounts[i]!,
      created,
    )
  })

  RECIPIENTS.forEach((r, i) => {
    const created = now - (44 - Math.min(40, i)) * DAY
    sql.exec(
      `INSERT INTO recipient_contacts (id, tenant_id, linked_sender_id, name, phone, mengantar_area_id, province_name, city_name, district_name, subdistrict_name, postal_code, street_address, address_note, cod_delivered_count, cod_rts_count, risk_version, is_archived, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13, ?14, 1, 0, ?15, ?15)`,
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
      r.codDelivered,
      r.codRts,
      created,
    )
  })

  // Shifts: 1 closed yesterday + 1 open today.
  sql.exec(
    `INSERT INTO cashier_shifts (id, tenant_id, cashier_user_id, opened_at, opening_float_idr, closed_at, counted_cash_idr, expected_cash_idr, variance_idr, state)
     VALUES (?1, ?2, ?3, ?4, 300000, ?5, 542000, 542000, 0, 'closed')`,
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

  // Historical completed pickup batch (2 days ago).
  sql.exec(
    `INSERT INTO pickup_batches (id, tenant_id, outlet_id, courier_code, status, driver_name, driver_phone, driver_vehicle_no, scanned_count, handed_over_at, handed_over_by, created_by, created_at)
     VALUES (?1, ?2, ?3, 'JNE', 'handed_over', 'Darmawan (Kurir JNE)', '08xx-xxxx-7701', 'D 4512 ABC', 3, ?4, ?5, ?5, ?6)`,
    pickupBatchId,
    tenantId,
    outletId,
    now - 2 * DAY + HOUR,
    actorId,
    now - 2 * DAY,
  )

  // Historical completed bulk batch (3 days ago).
  sql.exec(
    `INSERT INTO bulk_import_batches (id, tenant_id, sender_contact_id, source, file_name, mask_preset, cod_fee_mode, service_code, row_count, ready_count, failed_count, state, counter_payment_status, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'csv', 'order-butik-melati.csv', 'dropship_toko', 'none', 'JNE', 3, 3, 0, 'done', 'paid', ?4, ?5, ?5)`,
    bulkBatchId,
    tenantId,
    SENDERS[0]!.id,
    actorId,
    now - 3 * DAY,
  )

  // Running balance for Book 2 Mengantar mirror invoices (starting from top-up Rp 4.500.000).
  let mirrorBalance = 4_500_000
  sql.exec(
    `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
     VALUES ('demo-inv-topup-1', 'INV-MGT-DEMO-TOPUP', 'typeAddBalance', 'statusCleared', 4500000, 4500000, 4500000, 'Top up saldo Mengantar (Demo)', ?1, ?1, '{"type":"typeAddBalance","amount":4500000}', 'not_applicable', ?1, ?2)`,
    now - 45 * DAY,
    now,
  )

  let bulkRowNo = 0
  let pickupCount = 0

  const WIB = 7 * HOUR
  const wibMidnight = Math.floor((now + WIB) / DAY) * DAY - WIB

  PLANS.forEach((plan, i) => {
    const slug = demoSlug(i)
    const c = COURIERS[plan.courierIdx]!
    const sender = SENDERS[plan.senderIdx]!
    const recipient = RECIPIENTS[plan.recipientIdx]!
    const issuedAt =
      plan.daysAgo === 0
        ? Math.max(wibMidnight + 60_000, now - plan.hoursOffset * 10 * 60_000)
        : now - plan.daysAgo * DAY - plan.hoursOffset * HOUR
    const updatedAt = plan.status === "delivered" ? issuedAt + 2 * DAY : plan.status === "rts_at_gerai" ? issuedAt + 4 * DAY : issuedAt + 2 * HOUR
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
    const awb = `${c.awbPrefix}${String(10410 + i * 37).padStart(6, "0")}`
    const orderCode = `MGT-DM-${String(1000 + i)}`
    const quoteId = `demo-q-${slug}`
    const method = METHODS[i % METHODS.length]!
    const channel = plan.daysAgo === 3 && bulkRowNo < 3 ? "bulk" : CHANNELS[i % CHANNELS.length]!
    const isPaid = !plan.unpaid
    const counterPaymentStatus = counterDue === 0 ? "not_required" : isPaid ? "paid" : "unpaid"
    const reconciled = plan.status === "delivered"
    const paymentSyncState = reconciled ? "provider_invoice_reconciled" : "provider_paid_estimated"
    const custodyStage =
      plan.status === "ready_for_pickup"
        ? "none"
        : plan.status === "rts_at_gerai"
          ? "rts_at_gerai"
          : plan.status === "rts_returned_to_sender"
            ? "rts_returned_to_sender"
            : "handed_to_courier"

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

    const attachBulk = channel === "bulk" && bulkRowNo < 3 ? bulkBatchId : null
    const attachPickup = plan.daysAgo >= 2 && c.courierCode === "JNE" && pickupCount < 3 ? pickupBatchId : null
    if (attachPickup) pickupCount++

    sql.exec(
      `INSERT INTO shipments (tenant_id, slug, courier_code, mengantar_order_code, awb_number, status, provider_status, last_provider_event_at, last_provider_rank, custody_stage, custody_at, stuck_attention_at, last_polled_at, index_version, created_at, updated_at, quote_snapshot_id, entry_channel, outlet_id, sender_contact_id, recipient_contact_id, cashier_shift_id, created_by_user_id, dispatch_state, service_code, is_cargo, cod_fee_mode, payment_sync_state, sorting_code, provider_echoed_weight_kg_text, true_sender_json, true_recipient_json, content_declaration_text, prohibited_ack_at, publish_shipping_idr, gerai_shipping_cost_idr, packing_addon_idr, counter_service_fee_idr, promo_discount_idr, cod_goods_amount_idr, cod_service_fee_idr, cod_collection_total_idr, counter_due_idr, counter_total_paid_idr, expected_provider_cod_credit_idr, sender_cod_payable_idr, actual_weight_gram, billable_weight_gram, counter_payment_status, counter_payment_method, counter_paid_at, counter_paid_by, counter_paid_shift_id, first_printed_at, print_count, issued_at, mask_preset, mask_snapshot_json, pickup_snapshot_json, sender_cod_paid_idr, reconciled_provider_cod_credit_idr, bulk_batch_id, provider_reconciled_cost_idr, reconciled_extra_adjustment_idr, pickup_batch_id, item_quantity)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 1, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, 'issued', ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?14, ?32, ?33, ?34, ?35, 0, ?36, ?37, ?38, ?39, ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50, ?51, ?14, ?52, ?59, ?60, ?53, ?54, ?55, ?56, ?57, ?58, 1)`,
      tenantId,
      slug,
      c.courierCode,
      orderCode,
      awb,
      plan.status,
      plan.status === "delivered" ? "DELIVERED" : plan.status === "in_transit" ? "ON_PROCESS" : plan.status === "ready_for_pickup" ? "READY_FOR_PICKUP" : plan.status === "lost" ? "LOST" : "RETURNED",
      updatedAt,
      plan.status === "delivered" ? 40 : plan.status === "in_transit" ? 20 : 10,
      custodyStage,
      custodyStage === "none" ? null : issuedAt + 3 * HOUR,
      plan.stuck ? now - 12 * HOUR : null,
      now - 20 * 60_000,
      issuedAt,
      updatedAt,
      quoteId,
      channel,
      outletId,
      sender.id,
      recipient.id,
      plan.daysAgo === 0 ? openShiftId : closedShiftId,
      actorId,
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
      sender.kind === "reseller_dropship" ? "dropship_toko" : "standar_gerai",
      plan.cod && plan.codPaidOut ? senderCodPayable : null,
      plan.cod && reconciled ? expectedProviderCodCredit : null,
      attachBulk,
      !plan.cod && reconciled ? providerNet : null,
      reconciled ? 0 : null,
      attachPickup,
      maskSnapshotJson,
      pickupSnapshotJson,
    )

    if (attachPickup) {
      sql.exec("INSERT INTO pickup_batch_items (batch_id, slug, scanned_at, scanned_by, unpaid_warning) VALUES (?, ?, ?, ?, 0)", pickupBatchId, slug, now - 2 * DAY + 30 * 60_000, actorId)
    }

    if (attachBulk) {
      bulkRowNo++
      sql.exec(
        `INSERT INTO bulk_import_rows (batch_id, row_no, raw_json, recipient_name, recipient_phone, street, area_text, area_id, area_label, postal_code, content, weight_gram, cod_goods_idr, publish_shipping_idr, cod_fee_idr, counter_due_idr, cod_collection_total_idr, sender_cod_payable_idr, estimated_margin_idr, service_code, state, shipment_slug)
         VALUES (?1, ?2, '{}', ?3, ?4, ?5, ?6, ?7, ?6, ?8, ?9, ?10, 0, ?11, 0, ?12, 0, 0, ?13, ?14, 'created', ?15)`,
        bulkBatchId,
        bulkRowNo,
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

    // Tracking timeline events.
    sql.exec(
      `INSERT INTO shipment_events (event_key, slug, source, raw_category, mapped_status, event_at, event_at_text, recorded_at)
       VALUES (?1, ?2, 'local', 'ORDER_CREATED', 'ready_for_pickup', ?3, 'Paket diterima di loket', ?3)`,
      `demo-ev-${slug}-1`,
      slug,
      issuedAt,
    )
    if (plan.status !== "ready_for_pickup") {
      sql.exec(
        `INSERT INTO shipment_events (event_key, slug, source, raw_category, mapped_status, event_at, event_at_text, recorded_at)
         VALUES (?1, ?2, 'webhook', 'ON_PROCESS', 'in_transit', ?3, 'Paket dalam pengiriman kurir', ?3)`,
        `demo-ev-${slug}-2`,
        slug,
        issuedAt + 5 * HOUR,
      )
    }
    if (plan.status === "delivered") {
      sql.exec(
        `INSERT INTO shipment_events (event_key, slug, source, raw_category, mapped_status, event_at, event_at_text, recorded_at)
         VALUES (?1, ?2, 'webhook', 'DELIVERED', 'delivered', ?3, 'Paket diterima oleh penerima', ?3)`,
        `demo-ev-${slug}-3`,
        slug,
        updatedAt,
      )
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
    if (reconciled) {
      if (!plan.cod) {
        mirrorBalance -= providerNet
        const invId = `demo-inv-pay-${slug}`
        sql.exec(
          `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, courier, order_code, awb_number, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
           VALUES (?1, ?2, 'typePayment', 'statusCleared', ?3, ?4, ?5, ?6, ?6, ?7, 'Pembayaran ongkir Non-COD', ?8, ?8, '{}', 'linked', ?8, ?9)`,
          invId,
          `MGT-PAY-${slug.toUpperCase()}`,
          c.courierCode,
          orderCode,
          awb,
          -providerNet,
          mirrorBalance,
          issuedAt + HOUR,
          now,
        )
        sql.exec(
          `INSERT INTO mengantar_invoice_subitems (invoice_id, idx, awb_number, order_code, amount_idr, estimated_price_idr, estimated_special_price_idr, shipment_slug)
           VALUES (?1, 0, ?2, ?3, ?4, ?5, ?6, ?7)`,
          invId,
          awb,
          orderCode,
          -providerNet,
          publishShipping,
          providerNet,
          slug,
        )
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

    // Meja Retur records for RTS items.
    if (plan.status === "rts_at_gerai" || plan.status === "rts_returned_to_sender") {
      const intakeAt = updatedAt
      const handedBack = plan.status === "rts_returned_to_sender"
      sql.exec(
        `INSERT INTO return_intakes (slug, tenant_id, condition, note, intake_by, intake_at, storage_deadline_at, handback_at, handback_by, handback_method, claim_offered)
         VALUES (?1, ?2, 'baik', 'Penerima tidak di tempat 3× percobaan antar', ?3, ?4, ?5, ?6, ?7, ?8, 0)`,
        slug,
        tenantId,
        actorId,
        intakeAt,
        intakeAt + 14 * DAY,
        handedBack ? intakeAt + 2 * DAY : null,
        handedBack ? actorId : null,
        handedBack ? "code" : null,
      )
    }

    // Active claim for the lost shipment so Kendala & Klaim has a real submitted claim.
    if (plan.status === "lost") {
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

    indexRows.push({ slug, awbNumber: awb, courierCode: c.courierCode, status: plan.status, createdAt: issuedAt, updatedAt })
  })

  // Keep synced_balance_idr aligned with the mirror running balance so Book 2 looks cohesive.
  sql.exec("UPDATE mengantar_connections SET synced_balance_idr = ? WHERE tenant_id = ?", Math.max(1_250_000, mirrorBalance), tenantId)

  // Notifications for the topbar bell.
  const notes: Array<[string, string, "all" | "owner", string, string, string, number]> = [
    ["demo-note-1", "finance", "owner", "Pencairan COD masuk ke saldo", "2 kiriman COD selesai sudah masuk ke mutasi Mengantar.", "/keuangan", now - 2 * HOUR],
    ["demo-note-2", "exception", "all", "2 paket perlu dipantau", "Ada 2 kiriman belum bergerak lebih dari 3 hari di Kendala & Klaim.", "/kiriman/kendala", now - 5 * HOUR],
    ["demo-note-3", "return", "all", "2 paket retur menunggu diambil pengirim", "Cek Meja Retur untuk mengirim Kode Ambil ke pengirim.", "/kiriman?tab=retur", now - DAY],
  ]
  for (const [id, kind, audience, title, body, link, createdAt] of notes) {
    sql.exec("INSERT INTO notifications (id, tenant_id, kind, audience, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, tenantId, kind, audience, title, body, link, createdAt)
  }

  return { shipments: indexRows, senders: SENDERS.length, recipients: RECIPIENTS.length }
}

/* =========================================================================
   AddAssetData — Nexus by MSI · Asset Management › Add Asset
   Category-driven step / section / field schema for AddAssetPage.jsx.
   Ported from the Claude Design bundle. Pure data (no JSX) so it stays a
   plain .js helper. Mock data, no backend.

   Field types: text · mono · select · date · money · int · dec · slider ·
                radio · textarea · toggle
   Field width (w): full · half · third   (default half)
   Sections may carry showIf(form) for dynamic visibility.
   ========================================================================= */

/* ---------- dropdown option banks ---------- */
const AA_OPT = {
  itSubtype:   ["Laptop", "Desktop/PC", "Server", "Printer", "Scanner", "Projector", "Network Device", "Storage Device", "Monitor", "Peripheral", "Lainnya"],
  ramType:     ["DDR4", "DDR5", "LPDDR5", "ECC", "Other"],
  storageType: ["SSD", "HDD", "NVMe", "eMMC"],
  storageIf:   ["SATA", "NVMe", "USB", "Other"],
  osName:      ["Windows 11", "Windows 10", "macOS", "Ubuntu", "Debian", "CentOS", "Other"],
  osArch:      ["x64", "ARM64", "x86"],
  osLicense:   ["OEM", "Retail", "Volume", "Open Source"],
  vehSubtype:  ["Mobil", "Motor", "Truk", "Pick-Up", "Van", "Bus", "Forklift", "Lainnya"],
  furnSubtype: ["Meja", "Kursi", "Lemari", "Rak", "Sofa", "Partisi", "Whiteboard", "AC", "Kulkas", "Dispenser", "CCTV", "Lainnya"],
  bldgSubtype: ["Gedung", "Ruko", "Gudang", "Tanah", "Apartemen", "Lainnya"],
};

/* subtypes for which the Display section is hidden (IT) */
const AA_NO_DISPLAY = ["Server", "Network Device", "Storage Device"];

/* ---------- shared status / fuel pill sets ---------- */
const AA_STATUS_STD  = ["Aktif", "Dalam Perbaikan", "Tidak Aktif"];
const AA_STATUS_FURN = ["Aktif", "Rusak", "Tidak Aktif"];
const AA_STATUS_BLDG = ["Aktif", "Dalam Renovasi", "Tidak Aktif"];
const AA_FUEL        = ["Bensin", "Solar", "Hybrid", "Listrik"];

/* status pill tones (dot color) keyed by label */
export const AA_STATUS_TONE = {
  "Aktif": "ok", "Dalam Perbaikan": "warn", "Dalam Renovasi": "warn",
  "Rusak": "danger", "Tidak Aktif": "neutral",
};

/* =========================================================================
   CATEGORY DEFINITIONS
   ========================================================================= */
export const AA_CATS = {
  /* ---------------------------------------------------------------- IT */
  "IT-EQP": {
    code: "IT-EQP", prefix: "IT-", icon: "monitor",
    label: "IT Equipment", crumb: "IT Equipment",
    titleField: "nama",
    steps: [
      {
        id: "dasar", title: "Informasi Dasar", short: "Dasar", kind: "form",
        sections: [
          { id: "identitas", title: "Identitas Aset", icon: "tag", fields: [
            { k: "code", label: "Asset Code", type: "mono", w: "half", hint: "Prefix IT- · dapat diubah" },
            { k: "nama", label: "Nama Aset", type: "text", w: "half", req: true, ph: "cth: MacBook Pro 14" },
            { k: "subtype", label: "Asset Subtype", type: "select", w: "half", options: AA_OPT.itSubtype },
            { k: "model", label: "Model", type: "text", w: "half", ph: "cth: MacBook Pro M3 14-inch" },
            { k: "serial", label: "Serial Number", type: "mono", w: "half", ph: "cth: C02FX9LMQ6NV" },
          ]},
          { id: "beli", title: "Pengadaan & Nilai", icon: "wallet", fields: [
            { k: "vendor", label: "Vendor / Supplier", type: "text", w: "half", ph: "cth: PT Synnex Metrodata" },
            { k: "tglBeli", label: "Tanggal Pembelian", type: "date", w: "half" },
            { k: "invoice", label: "No. Invoice Pembelian", type: "mono", w: "half", ph: "FK-0000" },
            { k: "harga", label: "Harga Perolehan", type: "money", w: "half" },
          ]},
          { id: "tempat", title: "Penempatan & Status", icon: "mappin", fields: [
            { k: "assignedTo", label: "Assigned To", type: "text", w: "half", ph: "Nama pemegang aset" },
            { k: "lokasi", label: "Lokasi", type: "text", w: "half", ph: "Nama lokasi / ruangan" },
            { k: "status", label: "Status", type: "radio", w: "full", options: AA_STATUS_STD },
            { k: "keterangan", label: "Keterangan", type: "textarea", w: "full", ph: "Catatan tambahan (opsional)" },
          ]},
        ],
      },
      {
        id: "spek", title: "Spesifikasi Teknis", short: "Spesifikasi", kind: "form",
        sections: [
          { id: "cpu", title: "Processor", icon: "cpu", fields: [
            { k: "cpuModel", label: "CPU Model", type: "text", w: "full", ph: "cth: Apple M3 Pro" },
            { k: "cpuCores", label: "CPU Cores", type: "int", w: "third", max: 256 },
            { k: "cpuThreads", label: "CPU Threads", type: "int", w: "third", max: 512 },
            { k: "cpuCache", label: "Cache", type: "int", w: "third", unit: "MB", max: 1024 },
            { k: "cpuBase", label: "Base Clock", type: "dec", w: "half", unit: "GHz" },
            { k: "cpuTurbo", label: "Turbo Clock", type: "dec", w: "half", unit: "GHz" },
          ]},
          { id: "ram", title: "Memory", icon: "memory", fields: [
            { k: "ramGb", label: "RAM", type: "int", w: "half", unit: "GB", max: 4096 },
            { k: "ramType", label: "RAM Type", type: "select", w: "half", options: AA_OPT.ramType },
            { k: "ramUsed", label: "Slots Used", type: "int", w: "half", max: 32 },
            { k: "ramTotal", label: "Slots Total", type: "int", w: "half", max: 32 },
          ]},
          { id: "storage", title: "Storage", icon: "harddrive", fields: [
            { k: "stoGb", label: "Capacity", type: "int", w: "half", unit: "GB", max: 1048576 },
            { k: "stoType", label: "Storage Type", type: "select", w: "half", options: AA_OPT.storageType },
            { k: "stoIf", label: "Interface", type: "select", w: "half", options: AA_OPT.storageIf },
            { k: "stoUsed", label: "Storage Used", type: "slider", w: "half", unit: "%" },
          ]},
          { id: "display", title: "Display", icon: "monitor",
            showIf: (f) => !AA_NO_DISPLAY.includes(f.subtype), fields: [
            { k: "dispSize", label: "Display Size", type: "dec", w: "third", unit: "inch" },
            { k: "dispRes", label: "Resolution", type: "text", w: "third", ph: "cth: 2560x1664" },
            { k: "dispHz", label: "Refresh Rate", type: "int", w: "third", unit: "Hz", max: 480 },
          ]},
          { id: "gpu", title: "GPU", icon: "gpu", fields: [
            { k: "gpuModel", label: "GPU Model", type: "text", w: "full", ph: "cth: Apple M3 Pro 18-core GPU" },
          ]},
          { id: "os", title: "Operating System", icon: "disc", fields: [
            { k: "osName", label: "OS Name", type: "select", w: "half", options: AA_OPT.osName },
            { k: "osVersion", label: "OS Version", type: "text", w: "half", ph: "cth: 14.4.1" },
            { k: "osBuild", label: "OS Build", type: "text", w: "half", ph: "cth: 23E224" },
            { k: "osArch", label: "OS Arch", type: "select", w: "half", options: AA_OPT.osArch },
            { k: "osLicense", label: "License Type", type: "select", w: "half", options: AA_OPT.osLicense },
          ]},
          { id: "battery", title: "Battery", icon: "battery",
            showIf: (f) => f.subtype === "Laptop", fields: [
            { k: "batWh", label: "Capacity", type: "dec", w: "third", unit: "Wh" },
            { k: "batHealth", label: "Battery Health", type: "slider", w: "third", unit: "%" },
            { k: "batCycle", label: "Cycle Count", type: "int", w: "third", max: 5000 },
          ]},
          { id: "phys", title: "Physical", icon: "box", fields: [
            { k: "weight", label: "Weight", type: "dec", w: "third", unit: "KG" },
            { k: "color", label: "Color", type: "text", w: "third", ph: "cth: Space Black" },
            { k: "webcam", label: "Webcam", type: "text", w: "third", ph: "cth: 1080p FaceTime HD" },
            { k: "keyboard", label: "Keyboard", type: "text", w: "half", ph: "cth: Magic Keyboard, backlit" },
            { k: "wireless", label: "Wireless", type: "text", w: "half", ph: "cth: WiFi 6E, Bluetooth 5.3" },
            { k: "ports", label: "Ports", type: "textarea", w: "full", ph: "cth: 2x Thunderbolt 4, 1x HDMI, 1x SD Card" },
          ]},
        ],
      },
      {
        id: "net", title: "Jaringan & Network", short: "Jaringan", kind: "form",
        optional: true,
        sections: [
          { id: "host", title: "Alamat & Host", icon: "network", fields: [
            { k: "ip", label: "IP Address", type: "mono", w: "half", ph: "192.168.1.24" },
            { k: "ipv6", label: "IPv6", type: "mono", w: "half", ph: "fe80::1c2d:..." },
            { k: "hostname", label: "Hostname", type: "mono", w: "half", ph: "mbp-budi.local" },
            { k: "gateway", label: "Gateway", type: "mono", w: "half", ph: "192.168.1.1" },
            { k: "macWifi", label: "MAC WiFi", type: "mono", w: "half", ph: "A4:83:E7:..." },
            { k: "macLan", label: "MAC LAN", type: "mono", w: "half", ph: "00:1B:44:..." },
          ]},
          { id: "dns", title: "DNS & Domain", icon: "globe2", fields: [
            { k: "dns1", label: "DNS Primary", type: "mono", w: "half", ph: "8.8.8.8" },
            { k: "dns2", label: "DNS Secondary", type: "mono", w: "half", ph: "1.1.1.1" },
            { k: "vlan", label: "VLAN", type: "text", w: "half", ph: "cth: VLAN 20 — Office" },
            { k: "domain", label: "Domain / Workgroup", type: "text", w: "half", ph: "cth: MSI.LOCAL" },
            { k: "online", label: "Status Jaringan", type: "toggle", w: "full",
              onLabel: "Online", offLabel: "Offline", help: "Tandai apakah perangkat saat ini terhubung ke jaringan." },
          ]},
        ],
      },
      { id: "review", title: "Review & Simpan", short: "Review", kind: "review" },
    ],
  },

  /* --------------------------------------------------------- KENDARAAN */
  "VEH": {
    code: "VEH", prefix: "VEH-", icon: "car",
    label: "Kendaraan", crumb: "Kendaraan",
    titleField: "nama",
    steps: [
      {
        id: "dasar", title: "Informasi Dasar", short: "Dasar", kind: "form",
        sections: [
          { id: "identitas", title: "Identitas Kendaraan", icon: "car", fields: [
            { k: "code", label: "Asset Code", type: "mono", w: "half", hint: "Prefix VEH- · dapat diubah" },
            { k: "nama", label: "Nama Kendaraan", type: "text", w: "half", req: true, ph: "cth: Toyota Avanza 2022" },
            { k: "subtype", label: "Asset Subtype", type: "select", w: "half", options: AA_OPT.vehSubtype },
            { k: "merkModel", label: "Merk & Model", type: "text", w: "half", ph: "cth: Toyota Avanza 1.3 G MT" },
            { k: "tahun", label: "Tahun Produksi", type: "int", w: "third", min: 1950, max: 2030 },
            { k: "noPol", label: "No. Polisi", type: "mono", w: "third", req: true, ph: "B 1234 ABC" },
            { k: "warna", label: "Warna", type: "text", w: "third", ph: "cth: Putih" },
            { k: "vin", label: "VIN / No. Rangka", type: "mono", w: "half", ph: "MHKxxxxxxxxxxxxxx" },
            { k: "noMesin", label: "No. Mesin", type: "mono", w: "half", ph: "cth: 2NRxxxxxxx" },
            { k: "bbm", label: "Jenis BBM", type: "radio", w: "full", options: AA_FUEL },
          ]},
          { id: "ops", title: "Operasional", icon: "gauge", fields: [
            { k: "odometer", label: "Odometer", type: "int", w: "half", unit: "KM", max: 9999999 },
            { k: "assignedTo", label: "Assigned To", type: "text", w: "half", ph: "Nama pemegang" },
            { k: "lokasiParkir", label: "Lokasi Parkir", type: "text", w: "half", ph: "cth: Pool Sunter" },
            { k: "status", label: "Status", type: "radio", w: "full", options: AA_STATUS_STD },
          ]},
          { id: "beli", title: "Pengadaan & Nilai", icon: "wallet", fields: [
            { k: "vendor", label: "Vendor / Supplier", type: "text", w: "half", ph: "cth: Auto2000" },
            { k: "tglBeli", label: "Tanggal Pembelian", type: "date", w: "half" },
            { k: "invoice", label: "No. Invoice", type: "mono", w: "half", ph: "FK-0000" },
            { k: "harga", label: "Harga Perolehan", type: "money", w: "half" },
            { k: "keterangan", label: "Keterangan", type: "textarea", w: "full", ph: "Catatan tambahan (opsional)" },
          ]},
        ],
      },
      { id: "dokumen", title: "Dokumen Kendaraan", short: "Dokumen", kind: "docs" },
      { id: "review", title: "Review & Simpan", short: "Review", kind: "review" },
    ],
  },

  /* --------------------------------------------------------- FURNITURE */
  "FURN": {
    code: "FURN", prefix: "FURN-", icon: "sofa",
    label: "Furniture & Office", crumb: "Furniture & Office",
    titleField: "nama",
    steps: [
      {
        id: "dasar", title: "Informasi Dasar", short: "Dasar", kind: "form",
        sections: [
          { id: "identitas", title: "Identitas Aset", icon: "sofa", fields: [
            { k: "code", label: "Asset Code", type: "mono", w: "half", hint: "Prefix FURN- · dapat diubah" },
            { k: "nama", label: "Nama Aset", type: "text", w: "half", req: true, ph: "cth: Meja Kerja Standing Desk" },
            { k: "subtype", label: "Asset Subtype", type: "select", w: "half", options: AA_OPT.furnSubtype },
            { k: "modelTipe", label: "Model / Tipe", type: "text", w: "half", ph: "cth: FlexiSpot E7" },
            { k: "warna", label: "Warna", type: "text", w: "half", ph: "cth: Maple / Hitam" },
            { k: "jumlah", label: "Jumlah Unit", type: "int", w: "half", min: 1, max: 99999 },
          ]},
          { id: "beli", title: "Pengadaan & Nilai", icon: "wallet", fields: [
            { k: "vendor", label: "Vendor / Supplier", type: "text", w: "half", ph: "cth: Informa" },
            { k: "tglBeli", label: "Tanggal Pembelian", type: "date", w: "half" },
            { k: "invoice", label: "No. Invoice", type: "mono", w: "half", ph: "FK-0000" },
            { k: "harga", label: "Harga Perolehan", type: "money", w: "half" },
          ]},
          { id: "tempat", title: "Penempatan & Status", icon: "mappin", fields: [
            { k: "lokasi", label: "Lokasi / Ruangan", type: "text", w: "half", ph: "cth: Ruang Meeting Lt. 3" },
            { k: "assignedTo", label: "Assigned To", type: "text", w: "half", ph: "Nama / departemen" },
            { k: "status", label: "Status", type: "radio", w: "full", options: AA_STATUS_FURN },
            { k: "keterangan", label: "Keterangan", type: "textarea", w: "full", ph: "Catatan tambahan (opsional)" },
          ]},
        ],
      },
      { id: "review", title: "Review & Simpan", short: "Review", kind: "review" },
    ],
  },

  /* ---------------------------------------------------------- PROPERTI */
  "BLDG": {
    code: "BLDG", prefix: "BLDG-", icon: "building",
    label: "Properti", crumb: "Properti",
    titleField: "nama",
    steps: [
      {
        id: "dasar", title: "Informasi Dasar", short: "Dasar", kind: "form",
        sections: [
          { id: "identitas", title: "Identitas Properti", icon: "building", fields: [
            { k: "code", label: "Asset Code", type: "mono", w: "half", hint: "Prefix BLDG- · dapat diubah" },
            { k: "nama", label: "Nama Properti", type: "text", w: "half", req: true, ph: "cth: Gedung Kantor Kuningan Lt 18" },
            { k: "subtype", label: "Asset Subtype", type: "select", w: "half", options: AA_OPT.bldgSubtype },
            { k: "alamat", label: "Alamat Lengkap", type: "textarea", w: "full", ph: "Jl. ..." },
            { k: "luasBangunan", label: "Luas Bangunan", type: "int", w: "half", unit: "m²", max: 9999999 },
            { k: "luasTanah", label: "Luas Tanah", type: "int", w: "half", unit: "m²", max: 9999999 },
          ]},
          { id: "beli", title: "Pengadaan & Nilai", icon: "wallet", fields: [
            { k: "vendor", label: "Vendor / Supplier", type: "text", w: "half", ph: "cth: PT Properti Prima" },
            { k: "tglBeli", label: "Tanggal Perolehan", type: "date", w: "half" },
            { k: "invoice", label: "No. Invoice / Akta", type: "mono", w: "half", ph: "AKTA-0000" },
            { k: "harga", label: "Harga Perolehan", type: "money", w: "half" },
            { k: "status", label: "Status", type: "radio", w: "full", options: AA_STATUS_BLDG },
            { k: "keterangan", label: "Keterangan", type: "textarea", w: "full", ph: "Catatan tambahan (opsional)" },
          ]},
        ],
      },
      { id: "review", title: "Review & Simpan", short: "Review", kind: "review" },
    ],
  },
};

/* ---------- vehicle document cards (VEH step 2) ---------- */
export const AA_VEH_DOCS = [
  { k: "stnk",     name: "STNK",     icon: "filetext", expiry: true,  desc: "Surat Tanda Nomor Kendaraan" },
  { k: "bpkb",     name: "BPKB",     icon: "filetext", expiry: false, desc: "Buku Pemilik Kendaraan Bermotor" },
  { k: "kir",      name: "KIR",      icon: "filetext", expiry: true,  desc: "Uji Kelayakan Kendaraan" },
  { k: "asuransi", name: "Asuransi", icon: "shield",   expiry: true,  desc: "Polis Asuransi Kendaraan", company: true },
];

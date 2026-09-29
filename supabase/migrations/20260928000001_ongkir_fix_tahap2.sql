-- =====================================================================
-- Koreksi ongkir SP Storbit, Tahap 2 (data SP saja, BELUM menyentuh invoice)
-- Tanggal draft : 28 Sep 2026
-- Status        : LIVE (dijalankan di produksi 28 Sep 2026, terverifikasi)
-- Cakupan       : 94 baris item SP, dikoreksi di DUA tabel (sp_order_items + sp_items)
--   P1 (4) ongkir salah baca ribuan      -> ongkir diisi nilai asli
--   P2 (65) ongkir dobel di harga satuan  -> harga satuan kembali ke harga normal
--   P3 (24) ongkir kosong padahal dibayar -> ongkir diisi di baris pertama SP
--   P4 (1) ongkir tercatat tanpa dasar   -> ongkir dinolkan
-- Sumber nilai  : baris pembayaran ongkir di sp_payments ((amount + pph) / 1,11)
--                 dan harga normal produk. Diambil dari produksi 28 Sep 2026.
-- Pengaman      : setiap UPDATE hanya kena kalau nilai di DB masih sama persis
--                 dengan nilai lama di tabel backup. Kalau jumlah baris yang
--                 kena tidak tepat 94 di masing masing tabel, seluruh transaksi
--                 dibatalkan (RAISE EXCEPTION).
-- CATATAN STAGING: data ini hanya ada di produksi. Di staging, blok ini
--                 SENGAJA gagal di pengecekan pertama ("0 dari 94") dan
--                 membatalkan semuanya. Itu membuktikan pengamannya bekerja.
-- =====================================================================

BEGIN;

-- 1. Tabel backup (jejak nilai lama dan baru)
CREATE TABLE IF NOT EXISTS public.backfill_ongkir_fix_20260928 (
  pola                 text        NOT NULL,
  sp_order_item_id     uuid        NOT NULL PRIMARY KEY,
  sp_item_id           uuid        NOT NULL,
  sp_no                text        NOT NULL,
  unit_price_lama      numeric(18,2) NOT NULL,
  unit_price_baru      numeric(18,2) NOT NULL,
  shipping_price_lama  numeric(18,2) NOT NULL,
  shipping_price_baru  numeric(18,2) NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backfill_ongkir_fix_20260928 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_ongkir_fix_20260928 FROM anon, authenticated;

INSERT INTO public.backfill_ongkir_fix_20260928
  (pola, sp_order_item_id, sp_item_id, sp_no,
   unit_price_lama, unit_price_baru, shipping_price_lama, shipping_price_baru)
VALUES
  ('P1', '21c36515-0dc7-490e-a363-0388a39e4fe5', 'a756d888-07f7-4fee-8fde-49a3188e6e50', '2046680', 120000, 120000, 1.01, 1008000),
  ('P1', '9d6cd212-5c57-4699-9a4f-cfeed1e10d68', '230a641f-b350-4990-aaa2-098e02429884', '2066165', 120000, 120000, 1.01, 1008000),
  ('P1', 'fd239b90-cc88-4787-a30d-3313bbf7aa59', 'd4f82e50-4ac1-4cfa-928d-998d1870e3c1', '2089437', 120000, 120000, 1.16, 1163000),
  ('P1', '5436ca45-1104-41eb-9fd4-8db1b21f4c10', '3bb2b8c9-d855-48ea-8e7c-1fa87b6343d5', '2205955', 487000, 487000, 1.77, 1766050),
  ('P2', '805f4151-6083-4b83-b363-3d7a9edec0d1', 'c424d451-d88e-4400-9d4d-022e21392f97', '2020577', 180000, 120000, 600000, 600000),
  ('P2', '3eb9e911-66e5-4184-9950-4c552e1a0f1b', '9e3ad82f-8506-4439-ad9d-6544ad0a5554', '2021721', 150000, 120000, 300000, 300000),
  ('P2', '1ac719f8-e812-4271-83db-8e3844fa8560', '8bf02076-d373-443e-a3cf-21cad4e43b58', '2028507', 123000, 120000, 390000, 390000),
  ('P2', 'c51f7f5d-14fd-409b-8f4a-64e6d4a70aa8', '46528724-08e4-4d80-9879-37783863397f', '2028512', 128900, 120000, 178000, 178000),
  ('P2', '0151451b-04c2-4368-9127-3de91198c402', 'ad6fa999-3647-4397-bcfb-d8f60b36db8d', '2028541', 123521.74, 120000, 810000, 810000),
  ('P2', '12ef6f07-63b8-4e7f-a675-af0fbc67b470', '760d2fd1-6437-4da4-a8b1-dabd8a9c448c', '2028561', 143100, 120000, 462000, 462000),
  ('P2', '5eba1c8d-aca3-4778-b3ab-8151c3314267', '6d50800e-a969-4cb2-a5ea-ff3711c13f95', '2028568', 130100, 120000, 101000, 101000),
  ('P2', '21d36ab0-1505-47b2-a09c-07b98b71ee62', '838c72b0-a447-4829-8b9f-822365a2d861', '2028580', 130050, 120000, 201000, 201000),
  ('P2', '9e90ab8d-4bb9-4a39-8366-fafc00bf5582', 'f6a995c7-35c8-42a7-87fa-7d60d2dcfd9b', '2028585', 134800, 120000, 444000, 444000),
  ('P2', 'e76edeaa-98be-43ec-a29d-3fbeaeab28ca', '0fac94b8-29cb-4927-8e62-2675cc3cec02', '2028607', 148400, 120000, 284000, 284000),
  ('P2', 'f2649975-267e-4ca6-9bae-b750097b82e2', 'd91b6389-fc4e-4cf9-81bf-98b6f6261bdb', '2030854', 123236.36, 120000, 178000, 178000),
  ('P2', '46108f55-20d0-46aa-9d14-65be2b9ade52', '0bc05e14-c5d5-4c85-bfc0-ecac75bba36a', '2030861', 123581.25, 120000, 573000, 573000),
  ('P2', '94cf9b7a-641b-454e-bc1b-90a6a1b04002', '9b11c3df-f77b-4eee-96a0-9df9cc0a85ae', '2030874', 127758.33, 120000, 465500, 465500),
  ('P2', '5e2469a0-a7e9-4167-a7e5-970be3b95937', '2d411f2e-487e-4f05-953f-97bfd0fcc1f6', '2030880', 127750, 120000, 77500, 77500),
  ('P2', '5b86e487-10d1-46ec-ad10-8ec9964fdb17', '478e0312-4c11-4e20-94b9-8e9f9b35c369', '2030884', 127757.14, 120000, 543000, 543000),
  ('P2', '8887d4bb-e968-4aa8-92a5-7fdfd46fda11', 'e294eab7-b88b-4fa9-9eeb-00252639c773', '2030888', 125075, 120000, 101500, 101500),
  ('P2', 'ae9deb11-f50c-462a-ad45-162942fc2f94', 'ebfdf5ca-6fa7-49cc-8c05-331d014af85f', '2030890', 125071.88, 120000, 811500, 811500),
  ('P2', '1da531b2-f3ab-4460-84ed-feaf52de78c7', '62e83ee5-9f55-4481-bb10-04f4a3e73d5a', '2030893', 127455.56, 120000, 1342000, 1342000),
  ('P2', 'd3211e5a-fe60-42b2-9a97-d1203fa70982', 'dfa08d08-cab4-4f94-8cc8-01768f5b0650', '2031167', 122985.71, 120000, 209000, 209000),
  ('P2', '9fd49ff2-0efd-4ced-9365-f91ff63fbf67', '46c97f54-fd95-4883-be1a-9c53229c056b', '2031957', 145000, 120000, 250000, 250000),
  ('P2', '16be7e5c-c549-48f7-a704-cc2c3c6de849', '5ae1cafb-3eaa-4d53-b144-991b5bfe402c', '2031966', 125897.44, 120000, 2300000, 2300000),
  ('P2', '4768200e-e74d-4ea0-9d88-cc48338c578d', '0e10d5be-37c7-4f8b-a492-e059cd349cd8', '2031968', 126034.48, 120000, 3500000, 3500000),
  ('P2', '59c0380b-e9ca-4731-a4ef-ccf0645322d7', '7fe72bd7-2186-4b2d-acf3-6351779fb4e3', '2031971', 126071.43, 120000, 850000, 850000),
  ('P2', 'c9a99646-37d8-4cce-876f-26dd78b77191', '9ac6c5d4-9e07-4513-8abd-30a5fd928be1', '2031976', 130588.24, 120000, 1800000, 1800000),
  ('P2', 'ba24e894-408f-4488-a94a-740e0d81b1d2', '27c7a7b5-ba79-46a3-803d-9eb855ed6a32', '2031977', 125070, 120000, 1267500, 1267500),
  ('P2', 'd8f8b4d9-38a5-439a-899a-1f57cc4400b7', '6249acd0-1604-41aa-8bfa-33f5a1cbab29', '2031978', 126750, 120000, 135000, 135000),
  ('P2', '6423e5ba-be50-4d3c-89ba-6f73a8259ec5', '495dbf5f-5b4f-4ffe-aabc-f55c1efd63df', '2031983', 131470.59, 120000, 3900000, 3900000),
  ('P2', 'b8780dd3-19e6-4e57-a751-2d382fd7c2f5', '239230b7-c81c-4cba-8927-bb6119bae9d4', '2031986', 141250, 120000, 850000, 850000),
  ('P2', '50ff266a-c00c-497e-afef-a4965ef9fcd5', '9214d3fa-3a8b-4209-a6bf-e723123087bf', '2031990', 122500, 120000, 700000, 700000),
  ('P2', '5cfc513b-39d4-4ff9-ba4f-4c13a4f4ef60', '43d43059-2297-49f5-9599-088613bbddb4', '2031994', 130500, 120000, 210000, 210000),
  ('P2', 'c7b43ae5-d248-4f82-b07f-2ff2417f00a4', '12dfdcd7-ba80-43ab-85e8-29efe25f79f0', '2031997', 130500, 120000, 210000, 210000),
  ('P2', '1f63989e-3cea-4e6d-a5d8-d75c175b8585', 'c000f510-213f-49ff-92b8-99988677b287', '2032009', 123928.57, 120000, 1100000, 1100000),
  ('P2', '94d5dd48-2877-4fdd-a820-3ff574fb9cde', 'c6322e4a-9964-41ad-b6bf-4420584ad46c', '2032030', 134650, 120000, 439500, 439500),
  ('P2', 'ca20e47b-56ec-4e1d-b3f9-9649f1692511', '78c4ca8f-39d9-48c9-9918-c4adc370ba5d', '2032031', 129322.73, 120000, 1025500, 1025500),
  ('P2', '31c74733-f6bf-4f83-9990-5ccca2bb5128', 'a912f69b-f58c-42c8-95fb-cddf0a15224a', '2033410', 122982, 120000, 745500, 745500),
  ('P2', '84a9c645-d3d9-455c-83f0-aca2ffb0881e', '4f0a7c9d-8eb5-4eda-8bc7-9607ac7a44f7', '2033414', 123579.41, 120000, 1217000, 1217000),
  ('P2', '436755ab-25fb-424b-ad45-7bc2f097eeef', 'dc3bd02b-81b7-4821-b01a-86fa44b20131', '2038206', 125000, 120000, 50000, 50000),
  ('P2', 'c87d23ab-9ff0-4044-89d0-a1647ff22160', '72e2cae1-45ec-4a20-a1f7-f8e4b6b670fb', '2038213', 127754.17, 120000, 930500, 930500),
  ('P2', '323f83ed-4bbd-41cb-ab3b-5f452823a57f', 'ad772a15-eb02-48cd-b402-41495b5c3685', '2038216', 125000, 120000, 50000, 50000),
  ('P2', '3ed00464-409f-495d-ab30-68c1a72a0c3d', 'cad1758c-b863-40af-9ee5-f0d6f07cf21e', '2038218', 127456.45, 120000, 2311500, 2311500),
  ('P2', '8f9dca3d-ae60-4d27-acbf-2a63ac0d4fe0', '9c6253d4-62fa-4247-a572-23f72d51c816', '2038224', 146033.33, 120000, 781000, 781000),
  ('P2', '176a28e9-2905-4103-b53c-e380bfc36bc0', '89dce38e-343b-46af-ac21-58f295f98b8f', '2038228', 122982.14, 120000, 835000, 835000),
  ('P2', '7a856d9e-e1f7-4179-a052-9de1e0491557', '87b7e598-eef2-4899-8479-302ed4395ce6', '2038232', 124773.68, 120000, 907000, 907000),
  ('P2', 'e362f814-95b6-48ac-bf56-01d23100699f', '1fa530b7-7822-4f31-a95b-942950acdee2', '2038345', 125070.83, 120000, 1217000, 1217000),
  ('P2', '45fc2596-d03a-4d77-b4b8-98a2d63e9d00', '0329c6ba-9160-49ee-b88d-29b597a790f6', '2042480', 123000, 120000, 30000, 30000),
  ('P2', '7926e3e5-13ac-46c4-a414-260b40a49dac', '89bf9a30-3a52-46bf-b5fa-e21a4df489c4', '2046673', 123579.41, 120000, 1217000, 1217000),
  ('P2', 'd2f2acdd-05a9-4858-81d1-d3cebb934936', '7607a14d-0b80-4ce2-8ebd-3fa320374306', '2046683', 125071.15, 120000, 1318500, 1318500),
  ('P2', '39548648-362e-4812-a447-a29cfd3fe55a', '0e5b1fb5-e58a-4f82-9b1f-698ff735bc31', '2047473', 127455.88, 120000, 2535000, 2535000),
  ('P2', '0c2b1312-04e3-4c71-9339-29f08746cfe6', 'ca752622-0ec5-40a1-bfd4-80173c275a52', '2047565', 125000, 120000, 50000, 50000),
  ('P2', '5fe5c64f-c6f8-4528-9b78-c9de5aad6d18', '7283f0ad-0db9-4c26-b893-897e712583aa', '2047566', 125000, 120000, 50000, 50000),
  ('P2', '0a72318c-8a7e-413e-b9a5-0a1b04d23ac4', '8b457a47-24cd-424c-9ad3-00776bdf9f48', '2047567', 129500, 120000, 95000, 95000),
  ('P2', 'c9c0cb42-638a-4f68-980e-515c979b238d', '3f9bd203-8748-4ad2-8b6c-f0c201f9ef9c', '2066156', 123579.41, 120000, 1217000, 1217000),
  ('P2', '301dabfd-b7e1-4d07-addb-a8731103aea5', 'e6beb4ab-1d20-4471-8bfe-164d9405d7b8', '2066157', 146033.33, 120000, 781000, 781000),
  ('P2', 'f252734a-d402-43b2-82c6-525f3b8011c8', 'a6d2d250-3fae-4b41-801e-758d021ff763', '2066161', 126000, 120000, 30000, 30000),
  ('P2', '0a4011f9-522e-42f4-8a54-4eecb678a734', '31b6cb87-047e-468d-a531-f5e4d12d4d85', '2066175', 125070.83, 120000, 1217000, 1217000),
  ('P2', '92519173-590d-459c-b24b-ba0625eb3ce5', '9f13ebc0-9815-4ba5-bfd6-1857b21cae84', '2066181', 125100, 120000, 102000, 102000),
  ('P2', '6048a507-8efa-4afd-8cff-8a12e7b72246', 'cea8fcb5-1ffa-4e2b-90c3-15cf27deec78', '2076942', 123000, 120000, 30000, 30000),
  ('P2', '25e7c4a5-2ee9-47f5-b3db-bce950130ad6', '5d2d29d7-eaa3-4a22-ac5e-0a2fc7010797', '2089432', 123579.31, 120000, 1038000, 1038000),
  ('P2', '6b83983b-f598-4287-b934-5e2b8e0d0271', 'd53c6b28-ec15-47c5-8819-689a0d54bf55', '2089440', 125072.22, 120000, 456500, 456500),
  ('P2', 'e19a19d7-7dcf-4538-be83-3b65cdb6328f', '64f78f43-a8c4-4b18-947b-9fdfc56aa60e', '2090197', 122984.38, 120000, 477500, 477500),
  ('P2', '1bd7fd04-1890-42ed-b8b6-e6221ba92d26', 'a40405a9-cfac-432f-9f18-4268956f9af1', '2090201', 129500, 120000, 95000, 95000),
  ('P2', '31b1832c-a406-48ed-8eb9-a9fd77a3dd8e', '26daf6e4-2128-453b-ae32-e9f03295b8b3', '2090204', 125000, 120000, 50000, 50000),
  ('P2', '4fa7e739-6408-4504-a379-689489fc0929', 'c4fc8bf7-c358-485a-a495-705ccdee7aad', '2117202', 539000, 487000, 832000, 832000),
  ('P2', 'ea86f366-27c4-46ac-b668-1c2ca91401ad', '57c6b6cb-5a72-4b90-a64d-b391b9c4306d', '2120596', 571375, 487000, 1350000, 1350000),
  ('P2', '5729d1cc-8277-457e-8327-dd451cefcb7b', '8a89535c-9196-43dd-bfa4-6e41cf66ecce', '2214267', 514444.44, 487000, 247000, 247000),
  ('P3', '2a4b39af-fd9e-4d73-b777-c24634c88f49', '19798b7f-7fdc-4032-98a4-60228c749abb', '1881802', 19500, 19500, 0, 1111880),
  ('P3', '45db708f-ee6b-4b84-8825-be62976288ad', '0be74210-220f-4674-a179-9eaa82cd7bde', '1881806', 19500, 19500, 0, 1541850),
  ('P3', 'ee8ea34c-d049-4224-a86b-8cb00e560bef', 'c8f2b24f-fc8f-4c49-9ec1-39512ae7440f', '1881812', 19500, 19500, 0, 1270055),
  ('P3', '3ec7de37-6745-4d74-8405-46554d06799e', '5d6908f3-ac81-413c-8963-47642d123b47', '1881821', 24500, 24500, 0, 318060),
  ('P3', '5266e92b-ca17-4030-b884-60f05e95f7ec', '8642046a-f991-4656-906b-3cb0fdf2bb1c', '1881825', 24500, 24500, 0, 626335),
  ('P3', '4b5d2349-5799-4b8a-a271-c486fc346b6f', '0a15d36c-7006-4f55-bb9d-6bd60de11b10', '1881828', 24500, 24500, 0, 2898100),
  ('P3', '6f08282c-481e-4f01-9eeb-42339fc23ccf', '93f97283-b962-4777-a76a-b0fa1497cc3e', '1881830', 19500, 19500, 0, 1239750),
  ('P3', '86bfd5e5-d6d9-4475-a5f4-c9cc8d6244e4', '39885c1b-0f33-4989-858b-d94506de4ee8', '2028544', 120000, 120000, 0, 178000),
  ('P3', 'b8c71771-72ad-4402-9b32-3dd475addc05', '353fbe75-78f0-45b0-b5e4-8088597bf94c', '2028615', 120000, 120000, 0, 284000),
  ('P3', 'f2a04383-603b-47b4-86b6-0e45e4e41d97', 'a40e4417-e5d7-4763-95e8-be921dca1217', '2042476', 120000, 120000, 0, 30000),
  ('P3', '1761c00d-9b97-406d-96e3-969d98b2fcc9', 'b6f18082-b79c-490c-898e-35ba6104e0ac', '2057618', 120000, 120000, 0, 30000),
  ('P3', '5c4f8635-9746-417b-aaca-e8c706ce078b', 'd086f550-000a-40a2-971f-0d038958e937', '2066159', 120000, 120000, 0, 835000),
  ('P3', 'b92985d1-a383-486b-8621-dfe8b2ab533f', '8410ebe3-1bbb-4b76-ba6c-e73fefa62232', '2070413', 120000, 120000, 0, 30000),
  ('P3', '648e947f-c544-4d10-829c-db96559105ef', '43a03232-ba32-4e87-bd54-1742136b69fd', '2090203', 120000, 120000, 0, 95000),
  ('P3', '7483e2a5-21c9-42d1-84c7-a3377229575e', '3aa3f970-b0fc-4f45-b9e4-659ee9f8beee', '2122099', 120000, 120000, 0, 99500),
  ('P3', 'e9b03841-0929-41ef-afa2-f3d69d90afb1', 'd5419aa5-4621-4ecb-addc-6add199c49e3', '2122101', 120000, 120000, 0, 99500),
  ('P3', '08a0464f-4e30-42f6-8067-5c6a204aa01f', '35dfe132-8a00-472a-8140-244b70af997e', '2122105', 120000, 120000, 0, 99500),
  ('P3', 'bace7a0b-6691-4d97-ac78-85d424c60a1c', 'f35ab9ac-a0d8-4a80-908e-67fc62c5b203', '2122107', 120000, 120000, 0, 99500),
  ('P3', '458347cc-6315-442a-85ed-cd6690267936', '428b44d0-d215-4c86-a77f-6edb54563391', '2122108', 120000, 120000, 0, 99500),
  ('P3', '5ab6d4ec-ebd2-4201-a432-a0a4255eba4b', 'c4557211-7ed3-46da-b220-3b317c44bdc2', '2128091', 120000, 120000, 0, 80000),
  ('P3', '2dc39a2a-65d6-467f-a8e0-2742ff808448', '2a63fd60-c408-4cd4-b84c-67575413e650', '2158594', 487000, 487000, 0, 477750),
  ('P3', '35f291ba-f0fc-41b9-b637-1a54e4a9e60f', '022f6bc0-36de-4aed-b136-1483934bc9d7', '2183790', 487000, 487000, 0, 2690000),
  ('P3', 'b06025a7-2171-4bee-bf21-7bb3ce87181b', '7c3e9cff-fb37-4544-bf62-36894051e5c2', '2194599', 487000, 487000, 0, 546000),
  ('P3', '4bb7c1b8-0577-4b28-8d81-b537044ffc0e', 'a28e3a96-dc81-4f11-aa02-a488650ec432', '2214263', 487000, 487000, 0, 477750),
  ('P4', '6ce284d2-a2db-4183-a36d-c4a0abb4b07c', 'e2f3ffc5-8b82-4411-9068-2060c1c6262d', '2223070', 3100, 3100, 781000, 0);

-- 2. Pengecekan + update dengan penghitung baris
DO $fix$
DECLARE
  v_expected int := 94;
  v_match_new int;
  v_match_old int;
  v_upd_new int;
  v_upd_old int;
BEGIN
  -- 2a. Nilai di DB harus masih sama dengan nilai lama
  SELECT count(*) INTO v_match_new
    FROM public.sp_order_items i
    JOIN public.backfill_ongkir_fix_20260928 b ON b.sp_order_item_id = i.id
   WHERE i.unit_price = b.unit_price_lama AND i.shipping_price = b.shipping_price_lama;

  SELECT count(*) INTO v_match_old
    FROM public.sp_items s
    JOIN public.backfill_ongkir_fix_20260928 b ON b.sp_item_id = s.id
   WHERE s.unit_price = b.unit_price_lama AND s.shipping_price = b.shipping_price_lama;

  IF v_match_new <> v_expected OR v_match_old <> v_expected THEN
    RAISE EXCEPTION 'Pengecekan gagal: sp_order_items cocok % dari %, sp_items cocok % dari %. Tidak ada yang diubah.',
      v_match_new, v_expected, v_match_old, v_expected;
  END IF;

  -- 2b. Update tabel baru
  UPDATE public.sp_order_items i
     SET unit_price = b.unit_price_baru,
         shipping_price = b.shipping_price_baru,
         updated_at = now()
    FROM public.backfill_ongkir_fix_20260928 b
   WHERE b.sp_order_item_id = i.id
     AND i.unit_price = b.unit_price_lama
     AND i.shipping_price = b.shipping_price_lama;
  GET DIAGNOSTICS v_upd_new = ROW_COUNT;

  -- 2c. Update tabel lama (updated_at diisi trigger)
  UPDATE public.sp_items s
     SET unit_price = b.unit_price_baru,
         shipping_price = b.shipping_price_baru
    FROM public.backfill_ongkir_fix_20260928 b
   WHERE b.sp_item_id = s.id
     AND s.unit_price = b.unit_price_lama
     AND s.shipping_price = b.shipping_price_lama;
  GET DIAGNOSTICS v_upd_old = ROW_COUNT;

  IF v_upd_new <> v_expected OR v_upd_old <> v_expected THEN
    RAISE EXCEPTION 'Update tidak lengkap: sp_order_items % dari %, sp_items % dari %. Dibatalkan.',
      v_upd_new, v_expected, v_upd_old, v_expected;
  END IF;

  RAISE NOTICE 'OK: % baris dikoreksi di sp_order_items dan sp_items.', v_expected;
END
$fix$;

COMMIT;


-- =====================================================================
-- VERIFIKASI SESUDAH (jalankan terpisah, hasil yang diharapkan di komentar)
-- =====================================================================

-- V1. Semua baris sudah bernilai baru di kedua tabel
--     Harapan: total 94, cocok_baru 94, cocok_lama 94
SELECT count(*) AS total,
       count(*) FILTER (WHERE i.unit_price = b.unit_price_baru AND i.shipping_price = b.shipping_price_baru) AS cocok_baru,
       count(*) FILTER (WHERE s.unit_price = b.unit_price_baru AND s.shipping_price = b.shipping_price_baru) AS cocok_lama
  FROM public.backfill_ongkir_fix_20260928 b
  JOIN public.sp_order_items i ON i.id = b.sp_order_item_id
  JOIN public.sp_items s       ON s.id = b.sp_item_id;

-- V2. Contoh SP 2205955. Harapan: unit_price 487000, shipping_price 1766050
SELECT o.sp_no, i.product_name, i.qty, i.unit_price, i.shipping_price
  FROM public.sp_order_items i JOIN public.sp_orders o ON o.id = i.sp_order_id
 WHERE o.sp_no IN ('2205955', '2033410', '2122099', '2223070')
 ORDER BY o.sp_no;
-- Harapan:
--   2033410 unit_price 120000, shipping_price 745500
--   2122099 unit_price 120000, shipping_price 99500
--   2223070 shipping_price 0

-- V3. Tidak ada lagi ongkir di bawah Rp 1.000. Harapan: 0
SELECT count(*) FROM public.sp_order_items WHERE shipping_price > 0 AND shipping_price < 1000;

-- V4. Total per pola. Harapan: P1 4, P2 65, P3 24, P4 1
SELECT pola, count(*),
       sum(shipping_price_baru - shipping_price_lama) AS selisih_ongkir,
       sum(unit_price_baru - unit_price_lama)         AS selisih_harga_satuan
  FROM public.backfill_ongkir_fix_20260928 GROUP BY pola ORDER BY pola;


-- =====================================================================
-- ROLLBACK DARURAT (hanya kalau perlu membatalkan setelah COMMIT)
-- =====================================================================
-- BEGIN;
-- UPDATE public.sp_order_items i SET unit_price = b.unit_price_lama, shipping_price = b.shipping_price_lama, updated_at = now()
--   FROM public.backfill_ongkir_fix_20260928 b WHERE b.sp_order_item_id = i.id;
-- UPDATE public.sp_items s SET unit_price = b.unit_price_lama, shipping_price = b.shipping_price_lama
--   FROM public.backfill_ongkir_fix_20260928 b WHERE b.sp_item_id = s.id;
-- COMMIT;

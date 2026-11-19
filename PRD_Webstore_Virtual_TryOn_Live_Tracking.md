# PRD — Brand Store, Live Virtual Try-On, dan Pelacakan Pesanan

**Versi:** 0.1 — draft untuk validasi  
**Tanggal:** 10 November 2026  
**Calon pilot:** Hernios Club atau Goodluch  
**Tujuan dokumen:** menyatukan kebutuhan produk dan roadmap implementasi sebelum memilih vendor, stack, dan biaya final.

---

## 1. Ringkasan

Membangun pengalaman toko online pakaian yang lebih rapi dan terasa milik brand, dengan pembelian melalui website sendiri. Fitur pembeda yang diuji adalah **live virtual try-on** melalui kamera perangkat: pengunjung memberi izin kamera, pose badan dideteksi di perangkat, lalu visual pakaian ditambatkan ke posisi badan secara langsung.

Sistem juga perlu mendukung alur setelah pembelian: pembayaran, stok, pemrosesan pesanan, nomor resi, dan halaman pelacakan. Ini bukan hanya pekerjaan UI. Bila pesanan dialihkan dari marketplace ke website, pemilik toko perlu memiliki proses operasional yang siap menangani pembayaran, fulfillment, pertanyaan pelanggan, stok lintas kanal, dan pengembalian.

**Prinsip MVP:**

- Uji pada **satu brand terlebih dahulu**. Jangan langsung membuat dua toko produksi atau platform multi-tenant.
- Kamera diproses di perangkat sejauh memungkinkan. MVP tidak mengunggah atau menyimpan frame kamera pelanggan.
- Mulai dari **kategori atasan** dan jumlah produk terbatas; akurasi celana, rok, layering, dan gerakan berputar berada di luar janji MVP.
- Try-on menjelaskan tampilan visual. Fitur ini **tidak menjamin ukuran atau kenyamanan pas**.
- Gunakan checkout langsung hanya bila gateway pembayaran, kurir, dan SOP admin siap. Jika belum, MVP bisa memakai tombol checkout yang mengarahkan ke kanal transaksi yang sudah dipakai sambil menguji minat try-on.
- Tracking pesanan harus berasal dari status/resi yang valid. Jangan membuat status pengiriman yang tampak real-time bila sumber datanya hanya diperbarui manual.

## 2. Latar belakang dan audit singkat

Audit publik awal menunjukkan dua toko memiliki pola katalog dan halaman produk yang mirip, sehingga komponen toko dapat dirancang sebagai satu template yang bisa dikonfigurasi. Namun, kesamaan tampilan belum membuktikan sistem backend, kepemilikan kode, ataupun ketersediaan API mereka sama.

### Goodluch

- Sudah ada katalog, filter kategori/stok/harga/ukuran, variasi produk, keranjang, chart ukuran, dan informasi pengiriman.
- Halaman katalog yang terlihat saat audit hanya menampilkan satu kartu produk; beberapa rentang filter harga tampak berulang/janggal. Perlu dicek ulang dengan pihak toko apakah ini masalah data, konfigurasi, atau rendering.
- Halaman produk punya foto depan/belakang dan detail ukuran/material, tetapi blok instruksi pemesanan, retur, dan komplain panjang sehingga informasi inti produk kurang mudah dipindai.
- Peluang perbaikan: foto lifestyle/try-on, navigasi, filter valid, chart ukuran yang lebih terbaca, penataan informasi produk dan kebijakan.

### Hernios Club

- Katalog yang terlihat menampilkan beberapa produk sekaligus, kategori, filter warna/ukuran, dan foto produk cukup detail.
- Halaman produk memiliki varian dan chart ukuran; label ukuran numerik/romawi sebaiknya diperjelas untuk pembeli.
- Teks kebijakan dan instruksi unboxing cukup panjang. Sebaiknya dipisahkan ke ringkasan dan halaman kebijakan.
- Peluang perbaikan: konsistensi tipografi dan nama produk, foto saat dikenakan, ukuran yang lebih mudah dipilih, serta jalur checkout dan tracking yang jelas.

Audit tersebut adalah gambaran halaman publik pada satu waktu, bukan audit analitik, akses admin, transaksi, atau operasi gudang. Sebelum estimasi final perlu sesi discovery dan akses yang disetujui.

## 3. Masalah yang hendak diselesaikan

1. Pengunjung kesulitan membayangkan pakaian di tubuh mereka dari foto katalog saja.
2. Informasi produk, ukuran, stok, pengiriman, serta kebijakan belum selalu tersaji secara ringkas dan konsisten.
3. Alur pembelian tersebar antara website dan marketplace; brand belum tentu menguasai pengalaman checkout atau data pelanggan di kanal marketplace.
4. Setelah checkout, pelanggan memerlukan status pesanan dan resi yang mudah dicek.
5. Admin perlu mengelola produk, variasi, stok, pesanan, pembayaran, fulfillment, dan komplain tanpa membuat duplikasi kerja atau overselling.

## 4. Tujuan dan metrik keberhasilan

### Tujuan produk

- Membuat pengunjung lebih mudah menemukan produk dan memahami fit/panduan ukuran.
- Menguji apakah try-on live benar-benar dipakai dan membantu keputusan pembelian.
- Menyediakan jalur pemesanan website yang dapat dikelola tim toko.
- Menyediakan status pesanan dan resi yang bisa dipercaya.

### Metrik pilot

Tetapkan baseline sebelum rilis. Angka target final dibicarakan bersama toko, bukan diasumsikan dari awal.

- Product-list-to-product-detail click-through.
- Penggunaan try-on: mulai kamera, pose terdeteksi, try-on berhasil, keluar/ulang.
- Add-to-cart dan checkout completion, dengan perbandingan sesi try-on dan non-try-on.
- Checkout gagal menurut tahap dan alasan.
- Waktu muat halaman, waktu sampai pose terdeteksi, FPS pada perangkat sasaran, dan crash/error kamera.
- Pertanyaan ukuran per pesanan, pembatalan, retur/komplain ukuran, dan waktu admin sampai pesanan dikirim.
- Akurasi stok website dibanding sumber stok operasional.
- Persentase pesanan yang memiliki resi dan status pelacakan valid.

**Catatan evaluasi:** peningkatan konversi atau penurunan retur tidak boleh diklaim hanya karena ada fitur. Bandingkan dengan baseline dan ukuran sampel yang cukup; pisahkan pengaruh diskon, kampanye, dan produk.

## 5. Pengguna dan peran

### Pengunjung/pelanggan

Menjelajah katalog, memeriksa detail dan ukuran, memberi izin kamera, mencoba pakaian secara live, memilih varian, membayar, dan melacak order.

### Admin katalog

Mengelola produk, gambar, varian, ukuran, stok, kategori, harga, promosi, dan status publikasi.

### Admin pesanan/fulfillment

Memeriksa pembayaran, menyiapkan barang, memasukkan/menarik resi, memperbarui status, dan menangani pembatalan/komplain sesuai kebijakan toko.

### Owner/manager

Melihat ringkasan penjualan, stok, pesanan, performa try-on, laporan, pengguna admin, dan audit aktivitas.

### Support pelanggan

Mencari order melalui nomor pesanan dan verifikasi yang aman, menjawab pertanyaan, serta mencatat kasus retur atau kendala.

## 6. Cakupan MVP

### Termasuk

- Website storefront responsif untuk mobile dan desktop.
- Beranda brand, katalog, pencarian/filter dasar, halaman kategori, halaman detail produk.
- Data produk terstruktur: SKU, warna, ukuran, harga, stok, berat, bahan, dimensi, foto, kebijakan ringkas.
- Live try-on untuk atasan pada daftar produk pilot.
- Pilih varian/ukuran, keranjang, dan alur checkout.
- Satu gateway pembayaran dan satu jalur pengiriman yang disepakati untuk pilot.
- Admin panel dasar untuk produk, stok, order, status fulfillment, resi, konten, dan pengguna.
- Halaman pelacakan order yang aman dan mobile-friendly.
- Analitik event dasar untuk try-on dan funnel pembelian.
- Kebijakan privasi kamera, retensi data pesanan, retur, pengiriman, dan syarat penggunaan yang disetujui pemilik toko.

### Tidak termasuk pada MVP

- Kamera atau pemrosesan pose berjalan di server secara terus-menerus.
- Upload foto pelanggan, penyimpanan foto, atau custom model training dari foto pelanggan.
- Klaim ukuran pasti pas, simulasi fisika kain, atau visualisasi akurat semua bentuk badan.
- Semua kategori pakaian, mix-and-match multi-item, avatar 3D realistis, AR room-scale, atau tracking 360 derajat.
- Sinkronisasi stok otomatis dua arah dengan marketplace sebelum akses API, kuota, biaya, dan pemilik data dikonfirmasi.
- Multi-brand SaaS/multi-tenant pada fase pilot.
- Sistem ERP, akuntansi, loyalty, referral, aplikasi mobile native, atau CRM penuh.

## 7. Kebutuhan fungsional — sisi pelanggan

### 7.1 Storefront dan katalog

- Beranda menampilkan identitas brand, koleksi baru/unggulan, CTA belanja, dan informasi kepercayaan.
- Katalog mendukung kategori, pencarian, filter ukuran/warna/harga/ketersediaan, sorting, serta empty state.
- Kartu produk menampilkan foto, nama, harga, varian warna, dan status stok yang konsisten.
- Mobile-first: filter mudah dibuka/tutup, CTA tidak tertutup, gambar tidak memotong produk secara keliru.

### 7.2 Detail produk

- Tampilkan foto produk konsisten (depan, belakang, detail bahan/print, dan foto saat dikenakan bila tersedia).
- Tampilkan harga, promo, pilihan warna dan ukuran, stok per varian, material, dimensi, berat, waktu proses, estimasi pengiriman, serta kebijakan ringkas.
- Chart ukuran menjelaskan satuan dan cara mengukur pakaian. Jangan menyamakan tinggi badan dengan ukuran baju bila data toko hanya ukuran pakaian.
- Jelaskan perbedaan **preview visual** dan **rekomendasi ukuran**.
- CTA: “Coba Live”, “Pilih ukuran”, “Tambah ke keranjang”, dan “Beli”. Tombol hanya aktif bila varian valid dan stok tersedia.

### 7.3 Live virtual try-on

- Fitur meminta izin kamera hanya setelah pelanggan menekan CTA try-on dan diberi penjelasan singkat.
- Jika izin ditolak, kamera tidak tersedia, atau perangkat tidak kompatibel, tampilkan alternatif yang informatif: lanjut tanpa try-on, chart ukuran, atau konten model.
- Pose tracking berjalan di browser/perangkat pelanggan bila teknologi dan perangkat sasaran mendukungnya; video kamera tidak dikirim ke backend pada MVP.
- Garment overlay diposisikan menggunakan titik badan yang disepakati (misalnya bahu, leher, torso, pinggang untuk kategori atasan). Setiap produk/tipe pakaian perlu aset visual yang siap dipetakan dan data anchor/skalanya.
- Overlay mengikuti translasi/skala/kemiringan dasar tubuh; tampilkan status tracking dan instruksi posisi/pencahayaan/jarak.
- Jika pose confidence rendah, badan terpotong, ada lebih dari satu orang, atau pengguna keluar frame, hentikan/kurangi overlay dan beri instruksi; jangan menampilkan preview yang jelas salah seolah akurat.
- Pelanggan dapat mematikan kamera kapan pun, menutup mode try-on, dan kembali ke detail produk tanpa kehilangan pilihan varian.
- Tidak merekam audio, mengambil foto, atau menyimpan rekaman.
- Overlay diberi penanda “visual simulasi—bukan jaminan fit/ukuran”.

**Batas teknis yang harus diuji:** model pose dapat memberi landmark tubuh, tetapi tidak otomatis membuat kain terlihat realistis, mengetahui ukuran badan fisik, atau menangani occlusion tangan/rambut/lengan dengan sempurna. MVP perlu menguji overlay 2D yang ditambatkan ke badan. Untuk realisme lebih tinggi, kemungkinan dibutuhkan segmentasi/occlusion on-device, aset pakaian yang dibuat khusus, teknologi/vendor try-on, atau model 3D. Fitur ini tidak memerlukan training model dari foto pelanggan sebagai asumsi awal.

### 7.4 Cart, checkout, pembayaran

- Cart memvalidasi harga dan stok terbaru sebelum checkout.
- Pelanggan memilih varian, kuantitas, alamat, opsi pengiriman, dan metode pembayaran yang tersedia.
- Sistem membuat order dengan ID unik dan status yang eksplisit: menunggu pembayaran, dibayar, diproses, dikirim, selesai, dibatalkan/refund.
- Status pembayaran berasal dari callback/webhook gateway tervalidasi atau rekonsiliasi admin, bukan dari halaman sukses di browser saja.
- Cegah double-submit/idempotent order creation dan perubahan harga/stok yang terjadi di tengah checkout.
- Tampilkan ringkasan biaya, ongkir, kebijakan, dan kontak bantuan sebelum pembayaran.

### 7.5 Pelacakan pesanan

- Pelanggan melihat status order dan nomor resi dari tautan aman/halaman order.
- Halaman publik tidak membuka order hanya berdasarkan nomor order yang mudah ditebak. Gunakan login, token akses acak, atau verifikasi gabungan yang tidak membocorkan data pribadi.
- Status berasal dari API agregator/kurir bila tersedia dan stabil. Bila tidak, admin dapat memasukkan resi dan pelanggan diarahkan ke halaman tracking resmi atau status di-refresh secara berkala.
- Tampilkan waktu update terakhir dan sumber status; bedakan “resi dibuat”, “paket diterima kurir”, “dalam pengiriman”, “terkirim”, dan “butuh tindakan”.
- Tangani resi belum ditemukan, kurir tidak terjangkau, gagal kirim, retur ke pengirim, dan keterlambatan.

## 8. Kebutuhan fungsional — sisi admin dan operasi

### 8.1 Admin katalog

- CRUD produk, kategori, koleksi, SKU, varian, harga, status publish, berat, material, ukuran, stok.
- Unggah gambar produk biasa dan aset overlay try-on secara terpisah; validasi dimensi, format, latar transparan bila perlu, dan mapping ke varian.
- Preview aset try-on sebelum dipublikasikan dan tandai produk yang belum memiliki aset/anchor.
- Impor/ekspor CSV dengan validasi dan laporan baris gagal.
- Riwayat perubahan stok/harga dan siapa yang mengubah.

### 8.2 Stok dan order management

- Tampilan daftar order dengan filter status, tanggal, pembayaran, metode kirim, dan pencarian ID.
- Reservasi stok sementara selama checkout/pembayaran dalam batas waktu yang ditentukan; lepaskan saat pembayaran gagal/expired.
- Admin dapat memproses, membatalkan, refund sesuai hak akses, menambahkan resi, dan menandai order sebagai terkirim hanya dengan alasan/riwayat.
- Pengurangan stok terjadi sekali pada transisi status yang benar; cegah stok negatif dan order ganda.
- Siapkan prosedur stok lintas kanal. Pilihan pilot: alokasi stok khusus website, pembaruan stok manual terjadwal, atau sinkronisasi resmi marketplace bila API dapat diakses.
- Buat daftar packing/fulfillment dan ringkasan harian pesanan.

### 8.3 Integrasi pembayaran dan pengiriman

- Integrasi gateway pembayaran dipilih bersama owner (misalnya Midtrans/Xendit setelah kebutuhan dan biaya diverifikasi).
- Integrasi kurir/agregator dipilih berdasarkan cakupan, tarif, API, webhook, pickup, dan prosedur klaim.
- Rahasia API berada di backend/secret manager; jangan di frontend atau source repository.
- Webhook harus tervalidasi, idempotent, dicatat, dan bisa direplay secara aman untuk pemulihan.
- Siapkan fallback operasional manual bila provider down, dengan label jelas dan audit trail.

### 8.4 Admin akses dan audit

- Role minimal: Owner, Catalog Admin, Order/Fulfillment, Support, Read-only Analyst.
- Hak akses least-privilege; tindakan refund, perubahan stok massal, role, dan setting integrasi dibatasi.
- Audit log untuk login admin, perubahan produk/harga/stok, status order, refund, resi, dan pengaturan.
- MFA untuk owner/admin bila platform mendukung.

### 8.5 Konten dan dukungan

- CMS sederhana untuk banner, FAQ, cara ukur, pengiriman, retur, kontak, dan halaman kampanye.
- Template pesan status order untuk email/WhatsApp bila provider dan consent pelanggan tersedia.
- Dukungan harus tetap punya jalur manual ketika notifikasi gagal. Jangan menjanjikan pesan WhatsApp tanpa integrasi dan persetujuan biaya.

### 8.6 Laporan

- Ringkasan order, nilai penjualan, produk/varian laris, stok rendah, pembayaran pending, fulfillment terlambat, retur/komplain.
- Funnel try-on: CTA terlihat → kamera diizinkan → pose terdeteksi → try-on digunakan → varian dipilih → cart → checkout.
- Jangan simpan frame video, biometric template, atau identitas wajah untuk analitik.

## 9. Data dan integrasi

Entitas minimum yang perlu dimodelkan:

- `Product`, `ProductMedia`, `TryOnAsset`, `Category`, `Variant/SKU`, `SizeGuide`, `InventoryMovement`.
- `Customer` (data minimal), `Address`, `Cart`, `Order`, `OrderItem`, `PaymentAttempt`, `Shipment`, `TrackingEvent`, `Refund/Return`.
- `AdminUser`, `Role`, `AuditLog`, `Promotion`, `Consent/PrivacyEvent`, `AnalyticsEvent` yang tidak memuat gambar/video.

Integrasi eksternal yang harus diputuskan saat discovery:

1. Payment gateway, metode settlement, biaya, refund, sandbox, dan pemilik akun merchant.
2. Kurir/agregator, tarif, resi, label, pickup, webhook/polling, dan coverage.
3. Marketplace saat ini, sumber kebenaran stok, kemungkinan API resmi, dan kebijakan sync.
4. Email/WhatsApp/notifikasi dan consent pelanggan.
5. Analytics, error monitoring, hosting, backup, DNS/domain, SSL, dan siapa yang memegang akses produksi.
6. Try-on engine: prototipe on-device open-source vs vendor berbayar vs pengembangan custom. Jangan commit ke vendor sebelum proof-of-concept di perangkat sasaran.

## 10. Arsitektur awal yang disarankan

Ini adalah opsi untuk diuji, bukan keputusan final:

- **Web storefront:** responsive app dengan katalog dan checkout.
- **Pose/overlay runtime:** modul browser yang meminta izin kamera dan memproses video lokal. Pose runtime (contohnya MediaPipe Pose Landmarker) dapat mendeteksi titik tubuh di web; overlay produk adalah lapisan tambahan yang perlu dikalibrasi per aset. Dokumentasi resmi Google menyebut 33 landmark pose; jumlah titik tersebut tidak berarti sistem sudah memahami ukuran atau fit pakaian.
- **Backend toko:** API produk, cart, order, stok, admin, pembayaran, pengiriman, resi, consent, dan audit.
- **Database:** relational database untuk transaksi; cache/queue hanya bila dibutuhkan untuk callback, notifikasi, atau sinkronisasi.
- **Asset storage:** hanya aset produk dan konten toko pada MVP. Jangan menyimpan video kamera atau foto pelanggan.
- **Provider secrets:** backend-only dan dipisahkan per environment.

**Pertanyaan arsitektur penting:** apakah storefront baru menggantikan situs saat ini, memakai backend/e-commerce yang ada, atau dibuat sebagai headless frontend? Jangan membangun ulang fitur transaksi bila sistem lama menyediakan API, ekspor data, atau jalur migrasi yang layak.

## 11. Non-functional requirements

- **Privasi kamera:** izin eksplisit, indikator kamera aktif, kamera berhenti saat modal/halaman try-on ditutup, pemrosesan lokal sebagai default, tidak ada rekaman/unggah.
- **Kompatibilitas:** uji perangkat dan browser yang benar-benar dipakai pelanggan; tetapkan daftar minimum setelah discovery. Fallback tidak boleh menghalangi belanja normal.
- **Performa:** halaman katalog tetap ringan; aset try-on tidak diunduh sampai diminta; pantau frame rate dan latensi di HP kelas menengah.
- **Akurasi UX:** tracking confidence threshold, smoothing untuk mengurangi jitter, penanganan posisi/occlusion, dan status gagal yang jujur.
- **Keamanan:** HTTPS, validasi server-side, CSRF/XSS/SQL injection defense sesuai stack, rate limiting, role permission, webhook signature validation, secret management, backup dan restore runbook.
- **Keandalan:** checkout, callback payment, inventory update, dan shipment update idempotent; ada retry dan rekonsiliasi.
- **Aksesibilitas:** navigasi keyboard, label kontrol, kontras, teks untuk status; belanja tidak mensyaratkan kamera.
- **Observability:** error log tanpa menyimpan data kamera; monitoring pembayaran/resi/stock sync.
- **Kepemilikan:** domain, source code, akun gateway, kurir, analytics, dan hosting harus atas nama/akses yang disepakati dengan klien; siapkan dokumentasi handover.

## 12. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi/keputusan |
|---|---|---|
| Overlay live terlihat seperti stiker dan tidak meyakinkan | Fitur tidak digunakan, reputasi turun | Proof-of-concept dahulu untuk 3 produk; uji dengan pelanggan; batasi copy klaim dan kategori. |
| Webcam pose stabil tapi kain tidak realistis | Salah mengira pose tracking = try-on | Pisahkan pose tracking, garment asset/warping, segmentation, dan fit recommendation dalam desain dan estimasi. |
| Izin kamera ditolak atau browser tidak kompatibel | Try-on gagal | Belanja tetap berfungsi; fallback ke foto model/chart ukuran; tampilkan persyaratan perangkat. |
| Live processing boros baterai/perangkat | Pengalaman buruk di HP | Uji model ringan, resolusi/frame rate adaptif, mulai tracking hanya saat halaman try-on terbuka. |
| Penjualan web dan marketplace memakai stok yang sama | Overselling dan pembatalan | Tetapkan master inventory dan alokasi; sinkronisasi resmi bila memungkinkan; jika manual, beri SOP dan buffer stok. |
| Checkout langsung belum punya SOP | Pesanan lambat/komplain | Validasi gateway, fulfillment, CS, refund, dan jam operasional sebelum launch. |
| API kurir/payment berubah atau down | Pembayaran/resi tidak terbarui | Webhook idempotent, retry, log, rekonsiliasi dan fallback manual. |
| Foto pelanggan terekam tanpa sadar | Risiko privasi dan hilang kepercayaan | Indikator kamera, stop kamera saat keluar, tidak merekam, uji network untuk memastikan frame tidak dikirim. |
| Data katalog buruk/tidak konsisten | Filter, stok, dan try-on salah | Bersihkan SKU/varian/ukuran dan tetapkan siapa yang bertanggung jawab atas kualitas data. |
| Ruang lingkup melebar jadi platform multi-brand | Biaya/waktu pilot membengkak | Satu brand/satu kategori/satu gateway/satu jalur pengiriman untuk validasi awal. |

## 13. Discovery sebelum harga dan implementasi final

Minta jawaban dari calon klien sebelum mengunci scope:

1. Siapa pemilik toko/domain dan siapa yang memberi persetujuan untuk perubahan sistem?
2. Website sekarang menggunakan platform apa? Apakah kode, database, admin, dan API dapat diakses? Siapa yang mengelola hosting/domain?
3. Berapa SKU aktif, varian, penjualan per bulan, produk terlaris, dan rasio retur/pertanyaan ukuran?
4. Stok saat ini berada di mana? Apakah satu stok dipakai bersama Shopee/marketplace lain?
5. Apakah toko siap menerima pembayaran langsung di website? Gateway/merchant account apa yang sudah dimiliki?
6. Siapa yang memproses order, mengemas, pickup, menangani refund, chat, dan update resi? Apa SLA mereka?
7. Kurir dan area pengiriman apa yang dipakai? Apakah perlu hitung ongkir atau cukup flat rate?
8. Data ukuran, pola baju, foto produk, foto model, dan aset desain apa yang tersedia dan boleh digunakan?
9. Perangkat dominan pelanggan: Android, iPhone, laptop, browser, dan kualitas koneksi?
10. Apakah pelanggan bersedia memberi izin kamera? Adakah preferensi bahwa video tidak boleh keluar dari perangkat?
11. Brand memilih try-on visual dasar yang ringan atau menuntut hasil fotorealistik? Siapa yang menyetujui aset overlay?
12. Siapa pemilik akun gateway, kurir, analytics, hosting, domain, source repo, dan biaya bulanan?
13. Kebijakan retur, refund, privasi, syarat transaksi, serta ketentuan penanganan data pelanggan perlu disetujui siapa?
14. Target bisnis pilot dan baseline yang tersedia apa?

## 14. Roadmap implementasi — 10 plan/commit

Urutan ini sengaja menempatkan pembuktian risiko live try-on lebih awal, sebelum checkout dan desain final mengunci asumsi teknis. Setiap plan berakhir dengan artefak yang bisa direview.

### Plan 1 — Discovery dan audit sistem lama

- Wawancara owner/admin; inventarisasi katalog, alur order, stok, kanal, biaya provider, dan akses.
- Petakan sistem yang sudah ada dan kemungkinan menggunakan API/ekspor/migrasi.
- Output: discovery notes, asumsi, keputusan terbuka, peta current-state, scope pilot.

### Plan 2 — Proof-of-concept live tracking

- Pilih satu laptop dan beberapa HP representatif.
- Uji izin kamera, deteksi pose, anchor bahu/torso, stabilitas overlay 2D pada 3 contoh atasan, FPS, panas/baterai, dan fallback.
- Verifikasi melalui network monitoring bahwa video tidak dikirim ke server.
- Output: demo internal, matriks perangkat, hasil usability, keputusan go/no-go dan batas klaim.

### Plan 3 — UX, visual system, dan kontrak konten produk

- Redesign beranda, katalog, detail produk, try-on modal, cart, checkout, tracking, dan admin.
- Tetapkan foto/aset produk yang dibutuhkan; definisikan chart ukuran dan kebijakan ringkas.
- Output: wireframes/prototype, design tokens, product-content checklist.

### Plan 4 — Data model dan fondasi backend

- Model produk/SKU/inventory/order/payment/shipment/user/audit.
- Setup environment dev/staging, migrasi/import awal, secret management, backup dasar.
- Output: schema, API contract, seed data/demo, runbook lingkungan.

### Plan 5 — Storefront dan katalog

- Implement beranda, katalog, filter, pencarian, detail produk, stok/varian, CMS dasar, dan responsive layout.
- Output: storefront staging dengan data yang telah dibersihkan.

### Plan 6 — Live try-on module

- Implement kamera opt-in, pose tracking di perangkat, overlay, status/error UX, lifecycle kamera, dan consent disclosure.
- Instrument event non-image untuk analitik; uji tanpa backend receiving video.
- Output: try-on pada produk pilot dan matriks uji perangkat.

### Plan 7 — Cart, checkout, dan pembayaran

- Cart, validasi stok/harga, order idempotent, satu gateway, webhook dan rekonsiliasi.
- Output: sandbox checkout, alur sukses/gagal/expired/refund yang bisa didemokan.

### Plan 8 — Admin, fulfillment, dan shipment tracking

- Admin produk/stok/order, role, audit log, resi, status tracking, notifikasi/fallback, laporan harian.
- Output: proses fulfillment end-to-end dari order sampai resi.

### Plan 9 — QA, pilot tertutup, dan perbaikan

- Uji perangkat, checkout, payment duplicate, stok race, webhook retry, kamera denied/lost, privasi/network, aksesibilitas dasar, dan restore backup.
- Jalankan pilot terbatas dengan produk dan pelanggan yang disetujui.
- Output: daftar temuan, sign-off operasional, baseline hasil, go/no-go launch.

### Plan 10 — Launch, monitoring, dan evaluasi

- Migrasi domain/data yang disepakati, monitoring, backup, incident/contact runbook, admin training, dan handover.
- Evaluasi KPI setelah periode pilot; putuskan lanjut ke lebih banyak produk, kategori, dan sync marketplace.
- Output: rilis produksi, dokumentasi admin/teknis, evaluasi pilot dan backlog fase berikutnya.

## 15. Kriteria penerimaan MVP

- Pengunjung dapat menelusuri produk, melihat harga/stok/varian, dan menambahkan varian valid ke cart di mobile dan desktop.
- Try-on hanya aktif setelah izin kamera; kamera berhenti saat pengguna keluar; gagal kamera tidak memblokir belanja.
- Preview mengikuti torso untuk produk pilot pada perangkat sasaran dalam kondisi yang ditentukan; batas akurasi terlihat jelas.
- Uji network memastikan video frame kamera tidak terkirim atau tersimpan di backend pada mode MVP.
- Harga/stok divalidasi lagi sebelum order; submit berulang tidak membuat order ganda.
- Pembayaran sukses hanya dari status gateway yang tervalidasi/reconciled.
- Admin dapat mengubah produk/stok, memproses order, memasukkan resi, dan melihat audit tindakan.
- Pelanggan dapat melihat status dan resi lewat akses yang tidak membuka data order orang lain.
- Ada fallback manual untuk pembayaran/resi, backup teruji, dan SOP operasional sebelum launch.
- Metrik penggunaan try-on dan funnel tercatat tanpa merekam gambar/video pelanggan.

## 16. Keputusan yang belum boleh diasumsikan

- Live tracking adalah arah produk yang dipilih, tetapi **metode rendering pakaian** belum diputuskan: overlay 2D custom, engine/vendor, atau model 3D.
- “Tanpa training” realistis untuk pose tracking memakai model pretrained; belum membuktikan bahwa garment overlay terlihat natural tanpa data/aset dan kalibrasi khusus.
- “Tanpa temporary image storage” dapat dicapai bila video diproses lokal dan tidak ada snapshot/upload. Pesanan tetap membutuhkan penyimpanan data transaksi dan alamat sesuai kebutuhan operasional.
- Pengalihan checkout dari marketplace ke website bisa menambah kendali dan data, tetapi juga menambah pekerjaan payment, CS, stok, fulfillment, retur, keamanan, dan biaya gateway.
- Live tracking resi baru otomatis bila provider menyediakan integrasi yang dapat digunakan; jika tidak, perlu update admin/manual atau tautan tracking eksternal.
- Estimasi biaya dan waktu baru layak dibuat setelah Plan 1–2 mengonfirmasi akses sistem lama dan kelayakan try-on pada perangkat sasaran.

## Referensi teknis awal

- Google AI Edge — Pose Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- Goodluch products: https://goodluch.com/products
- Hernios Club products: https://herniosclubstore.com/products
- Reza Auditore merch: https://rezaauditore.com/merch/

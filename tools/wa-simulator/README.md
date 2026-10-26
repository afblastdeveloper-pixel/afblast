# WA Gateway Simulator (AF Blast)

Simulator lokal untuk meniru perilaku WhatsApp Gateway (API watsap.id) untuk kebutuhan pengujian beban, otomasi pengiriman pesan blast, uji kegagalan, dan siklus hidup penautan perangkat.

> ⚠️ **PERNYATAAN PENTING & PENEGASAN:**
> Layanan simulator ini **HANYA MENIRU PERILAKU GATEWAY** dan **TIDAK MENGIRIM PESAN WHATSAPP SUNGGUHAN** ke nomor telepon atau jaringan telekomunikasi mana pun. Seluruh nomor, QR code, kode pairing, dan respons pengiriman adalah fiktif dan aman digunakan untuk pengujian berulang tanpa risiko biaya atau pemblokiran nomor asli.

---

## Fitur Utama Simulator

1. **Penolakan Lingkungan Produksi (`NODE_ENV=production`)**:
   - Simulator otomatis menolak untuk dijalankan jika `NODE_ENV=production`.
   - Backend AF Blast juga menolak mode `WATSAP_MODE=sim` atau `WATSAP_MODE=mock` bila `NODE_ENV=production`.
2. **Autentikasi Aman**:
   - Semua endpoint gateway (`/devices*`) dilindungi oleh header `x-api-key` yang sesuai dengan `SIM_API_KEY`.
3. **Endpoint Gateway Standar**:
   - `POST /devices` -> `{ deviceId }`
   - `GET /devices/:id/qr` -> `{ qr (data URL PNG), expiresAt }` (token acak berganti tiap permintaan)
   - `POST /devices/:id/pair` `{ phone }` -> `{ code (8 karakter alphanumeric), expiresAt }` (menolak nomor yang sudah dipakai device lain)
   - `GET /devices/:id/status` -> `{ status: "pending" | "connected" | "disconnected" | "logged_out", phone }`
   - `POST /devices/:id/send` `{ to, text, imageUrl? }` -> `{ messageId, status: "accepted" }`
   - `POST /devices/:id/logout` & `DELETE /devices/:id`
4. **Proteksi Rate Limiting Realistis**:
   - Membatasi pengiriman maksimal **30 pesan/menit per device**.
   - Bila terlampaui, simulator membalas HTTP `429 Too Many Requests` disertai header `Retry-After` dan payload `retry_after` agar worker belajar melakukan backoff adaptif.
5. **Webhook Bertanda Tangan HMAC-SHA256**:
   - Mengirim event ke `${BACKEND_URL}/api/webhooks/watsap` dengan header `X-Watsap-Signature` dan `X-Watsap-Timestamp`.
   - Event yang didukung:
     - `device.connected`
     - `device.disconnected`
     - `device.logged_out`
     - `message.sent`
     - `message.delivered`
     - `message.read`
     - `message.failed` (dengan alasan realistis seperti nomor tidak terdaftar, rate limited, dll)
6. **Halaman Kontrol Interaktif (`http://localhost:4100/`)**:
   - Memantau daftar perangkat WhatsApp aktif dan status koneksinya.
   - Tombol instan: "Selesaikan Penautan (Simulasi Scan QR / Input Kode)", "Putus Jaringan", "Paksa Logout (Kebijakan WhatsApp)", dan "Hapus".
   - Panel konfigurasi: Success Rate (%), Delivered Rate (%), Read Rate (%), Latensi (ms), Logout otomatis setiap N pesan, Batas Rate Limit, dan Auto-pairing (otomatis selesai setelah 12 detik).
   - Log pesan realtime (nomor tujuan, isi, status pengiriman).

---

## Cara Menjalankan Simulator

### 1. Menjalankan Layanan Simulator
Dari root project atau folder backend:
```bash
# Jalankan simulator pada port 4100
npm run sim
```
Atau langsung dari folder `tools/wa-simulator`:
```bash
cd tools/wa-simulator
npm start
```
Buka halaman dashboard kontrol simulator di browser:
👉 **http://localhost:4100/**

### 2. Mengaktifkan Mode Simulator di Backend
Pastikan file konfigurasi `.env` backend memiliki variabel:
```ini
WATSAP_MODE=sim
SIM_BASE_URL=http://localhost:4100
SIM_API_KEY=afblast_sim_secret_key_2026
SIM_WEBHOOK_SECRET=afblast_watsap_webhook_secret_key_2026
BACKEND_URL=http://localhost:4000
```

### 3. Mengisi Data Uji Simulator (`seed:sim`)
Jalankan skrip seeder untuk menyiapkan 500 kontak fiktif berawalan `62800000`, kategori `UJI-SIMULATOR` (tarif Rp 1.000), dan 1 kampanye aktif:
```bash
# Dari root project:
npm run seed:sim

# Atau dari folder backend:
cd backend
npm run seed:sim
```
*Seluruh data uji ditandai dengan flag `isSimulated=true`.*

---

## Alur Pengujian Lengkap

1. **Pembuatan & Penautan Perangkat**:
   - Member membuat perangkat di dashboard AF Blast.
   - Backend memanggil `createDevice` dan meminta QR atau kode penautan.
   - Simulator menghasilkan QR Data URL atau kode 8 karakter.
   - Selesaikan penautan melalui tombol **"Selesaikan Penautan"** di `http://localhost:4100/` (atau tunggu 12 detik jika auto-pairing aktif).
   - Webhook `device.connected` ber-HMAC dikirim simulator dan diterima backend untuk mengubah status perangkat menjadi `connected`.
2. **Pengujian Pengiriman & Rate Limiting (429 Backoff)**:
   - Jalankan worker blast atau picu pengiriman pesan.
   - Kirim >30 pesan dalam kurun waktu 1 menit pada 1 perangkat.
   - Simulator akan membalas dengan status HTTP `429` dan nilai `Retry-After`.
   - Worker mendeteksi status 429 dan melakukan jeda backoff hingga jendela waktu pulih.
3. **Pengujian Verifikasi Webhook HMAC**:
   - Webhook resmi yang ditandatangani dengan secret yang cocok akan diterima (HTTP 200).
   - Webhook dengan signature salah atau tanpa signature akan ditolak oleh backend (HTTP 401 Unauthorized).
4. **Pengujian Paksa Logout**:
   - Klik tombol **"Paksa Logout (Kebijakan WhatsApp)"** di dashboard simulator `http://localhost:4100/`.
   - Simulator mengirimkan webhook `device.logged_out` ke backend.
   - Backend mengubah status perangkat menjadi disconnected dan otomatis menjeda seluruh partisipasi kampanye aktif yang terkait.
5. **Pengujian Keamanan Produksi**:
   - Jalankan simulator atau backend dengan `NODE_ENV=production`.
   - Sistem akan menolak untuk start atau menolak panggilan mode `sim`/`mock` demi mencegah salah konfigurasi pada server produksi.

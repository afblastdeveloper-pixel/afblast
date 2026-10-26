# AF Blast — Arsitektur Single Domain Portal Terpadu

AF Blast menggabungkan portal **MEMBER** dan portal **STAF** dalam **SATU domain tunggal** (`afblast.id`), di mana area staf berada di bawah awalan path `${VITE_STAFF_BASE}` (default: `/staff`), tanpa mereset database dan tanpa menghapus fitur lama.

---

## 1. Peta Rute Single Domain

| Area | Prefix Jalur (Path) | Akses | Deskripsi & Isi Rute |
| :--- | :--- | :--- | :--- |
| **Member** | `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/app/*` | Publik & Pengguna | Dashboard member, broadcast kampanye WA, kontak, template, device, penarikan, komisi. **Bersih tanpa tautan/teks staf.** |
| **Staf** | `{BASE}/login`, `{BASE}/register`, `{BASE}/superadmin/*`, `{BASE}/finance/*`, `{BASE}/developer/*`, `403`, `404` | Staf Internal | Panel manajemen: Super Admin, Finance, Developer. **Tema gelap dengan label 'Portal Staf'.** |
| **API** | `/api/*` | Same-Origin / Proxy | Prefix terpisah: `/api/auth/*`, `/api/member/*` (aud=member) vs `/api/staff/*`, `/api/admin/*`, `/api/dev/*` (aud=staff). |

*Catatan: Nilai default `{BASE}` adalah `/staff`. Validasi: diawali `/`, tanpa `/` di akhir, huruf kecil/angka/strip.*

---

## 2. Variabel Environment

### Frontend (`.env` & `.env.example` di root):
```env
# Awalan path untuk area staf (default /staff)
VITE_STAFF_BASE=/staff

# Backend API Endpoint URL (relatif same-origin atau absolut)
VITE_API_URL=/api

# Telegram Recovery Bot Username
VITE_TELEGRAM_BOT_USERNAME=AFBlastRecoveryBot

# Cloudflare Turnstile (Site Key dipilih berdasarkan path area, satu domain)
VITE_CAPTCHA_ENABLED=false
VITE_TURNSTILE_SITE_KEY_MEMBER=
VITE_TURNSTILE_SITE_KEY_STAFF=
```

### Backend (`backend/.env` & `backend/.env.example`):
```env
DATABASE_URL="mysql://root:password@127.0.0.1:3306/wablast"
PORT=4000
JWT_SECRET="afblast_jwt_secret_staff_roles_2026_super_secure_key"
SEED_SUPERADMIN_PASSWORD="initial_superadmin_password"

# Single Domain Origin & Base URL
# Lokal:
APP_ORIGIN="http://localhost:5173"
APP_URL="http://localhost:5173"

# Produksi:
# APP_ORIGIN="https://afblast.id"
# APP_URL="https://afblast.id"
```

---

## 3. Cara Menjalankan Secara Lokal

1. **Jalankan Backend**:
   ```bash
   cd backend
   npm install
   npm run start # berjalan di http://localhost:4000
   ```

2. **Jalankan Frontend (Vite)**:
   ```bash
   # Di root project
   npm install
   npm run dev # berjalan di http://localhost:5173
   ```

3. **Akses Portal di Browser**:
   - **Login Member**: buka [http://localhost:5173/login](http://localhost:5173/login)
   - **Login Staf**: buka [http://localhost:5173/staff/login](http://localhost:5173/staff/login)
   - **Member App**: [http://localhost:5173/app](http://localhost:5173/app)

---

## 4. Keamanan & Isolasi Dua Arah

1. **Sesi Terpisah & Independen**:
   - Token member disimpan di `afblast.member.token` & `afblast.member.auth`.
   - Token staf disimpan di `afblast.staff.token`, `afblast.staff.auth`, & `afblast.staff.permissions`.
   - Login atau logout salah satu area tidak memutus atau mengganggu area lainnya.
2. **Klaim Token JWT `aud`**:
   - Token member memiliki `aud: "member"`. Rute `/api/staff/*`, `/api/admin/*`, dan `/api/dev/*` menolak token ini (403).
   - Token staf memiliki `aud: "staff"`. Rute `/api/auth/*` dan `/api/member/*` menolak token ini (403).
3. **Anti-Reconnaissance (Stealth 404)**:
   - Jika rute dashboard staf (`/staff/superadmin/*`, `/staff/finance/*`, `/staff/developer/*`) dibuka tanpa sesi staf, sistem **TIDAK me-redirect**, melainkan menampilkan halaman **404 Not Found** yang SAMA dengan halaman 404 member.
   - Sesi staf valid tetapi role salah menampilkan **403 Forbidden**.
4. **Isolasi Bundle (Code Splitting)**:
   - Rute staf dimuat dengan `React.lazy + Suspense` dan di-chunk khusus ke `"staff"`.
   - Pengunjung halaman member `/login` tidak mengunduh kode panel staf.
5. **Anti-Indexing Mesin Pencari**:
   - Area staf menyertakan `<meta name="robots" content="noindex,nofollow">`.
   - Path staf **tidak ditulis** di `robots.txt` atau `sitemap.xml`.

---

## 5. Konfigurasi Nginx Produksi (Single Domain)

```nginx
upstream backend_api {
    server 127.0.0.1:4000;
}

server {
    listen 80;
    server_name afblast.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name afblast.id;

    root /var/www/afblast/dist;
    index index.html;

    # Anti-Index Header untuk Area Staf
    location ^~ /staff/ {
        add_header X-Robots-Tag "noindex, nofollow" always;
        try_files $uri $uri/ /index.html;
    }

    # Static Assets Frontend
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri =404;
    }

    # Fallback SPA Member
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API Backend
    location /api/ {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Anti-Index pada API Staf
        location ^~ /api/staff/ {
            add_header X-Robots-Tag "noindex, nofollow" always;
            proxy_pass http://backend_api;
        }
        location ^~ /api/admin/ {
            add_header X-Robots-Tag "noindex, nofollow" always;
            proxy_pass http://backend_api;
        }
    }

    # SSE Stream Khusus (Realtime EventSource)
    location ~* ^/api/(member|admin)/stream {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 6. Saran Aturan Cloudflare

1. **Cloudflare Zero Trust / Access (Direkomendasikan)**:
   - Pasang proteksi Access di depan path `/staff*`, `/api/staff*`, dan `/api/admin*` mewajibkan otentikasi email OTP staf.
2. **WAF IP Allowlist**:
   - Batasi akses ke path `/staff*` dan `/api/staff*` hanya untuk IP kantor/VPN administrator.
3. **Rate Limiting**:
   - Terapkan rate limit ketat pada `/api/staff/login` (maks 3 req/menit) dan `/api/auth/login` (maks 5 req/menit).

---

## 7. URL Webhook Resmi

Jika API berjalan same-origin (`${APP_URL}`):
- Telegram Bot Webhook: `${APP_URL}/api/telegram/webhook`
- WhatsApp Watsap Webhook: `${APP_URL}/api/webhooks/watsap`
- WhatsApp WAHA Webhook: `${APP_URL}/api/webhooks/waha`

---

## 8. Video Animasi Pembuka (Intro Splash)

Video pembuka diputar sekali saat pengunjung pertama kali membuka portal member (`/`, `/login`, `/register`).
- Video **tidak pernah** diputar saat membuka path staf (`/staff/*`).
- Berkas video: `public/intro/afblast-intro.mp4`.

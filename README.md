# Gift Gamepass (Offline) — Roblox Studio + roblox-proxy (Vercel)

Panel UI gift gamepass sederhana untuk Roblox Studio, backend-nya nyambung
ke project **roblox-proxy** kamu yang sudah ada (Express + axios), tinggal
ditambah 3 route baru.

## Struktur file

```
roblox/
  GiftGamepassClient.client.lua   -> taruh di StarterGui (LocalScript)
  GiftGamepassServer.server.lua   -> taruh di ServerScriptService (Script)
roblox-proxy/
  server.js                       -> project proxy kamu + 3 route baru
  package.json
  vercel.json
  .gitignore
```

`roblox-proxy/server.js` adalah project proxy kamu yang sudah ada
(`/proxy?url=...`, `/health`), sudah aku tambahin 3 route baru:

- `GET /verify-username?username=NamaUser` — cek username valid & ambil userId
- `GET /gamepasses-for-user?username=NamaUser` — ambil **semua gamepass game
  ini** (via `UNIVERSE_ID`) + status kepemilikan target user per gamepass
- `POST /gift` — terima & catat request gift (log + opsional Discord webhook)

Route `/proxy` yang lama tetap ada, tidak diubah.

## ⚠️ Batasan penting

Roblox **tidak menyediakan API publik untuk memberikan gamepass secara
langsung ke akun user lain**. Gamepass hanya bisa dibeli oleh pemiliknya
sendiri, atau di-gift lewat fitur resmi Roblox di web:
`roblox.com/my/gifts` (pakai Robux, manual lewat browser).

Jadi endpoint `/gift` di sini cuma **mencatat/menotifikasi request**, bukan
memberikan gamepass otomatis:
1. Player isi username tujuan → klik **Cari**.
2. Panel load semua gamepass game ini + status kepemilikan target.
3. Player pilih gamepass yang belum dimiliki target → klik **Gift**.
4. Request dikirim ke server Roblox → diteruskan ke `/gift` di proxy kamu.
5. Backend mencatat request (dan bisa kirim notifikasi ke Discord via
   webhook) supaya kamu tahu ada request masuk.
6. Kamu (owner game) memproses gift-nya secara **manual** lewat fitur resmi
   Roblox, atau kamu kembangkan sendiri otomatisasinya.

## Deploy ulang roblox-proxy ke Vercel

Kalau project `roblox-proxy` ini sudah pernah kamu deploy, cukup replace
`server.js` dengan yang baru (di folder `roblox-proxy/` ini), lalu:

```bash
cd roblox-proxy
vercel --prod
```

### Environment variables yang perlu ditambah di Vercel

Buka **Project Settings → Environment Variables** di dashboard Vercel, isi:

- `UNIVERSE_ID` = **wajib**. Ini Universe Id dari game Roblox kamu (bukan
  Place Id). Cara dapatnya:
  1. Buka `https://apis.roblox.com/universes/v1/places/PLACE_ID_KAMU/universe`
     di browser (ganti `PLACE_ID_KAMU` dengan Place Id game kamu, lihat dari
     URL game di `roblox.com/games/PLACE_ID/nama-game`).
  2. Nilai `"universeId"` yang muncul itu yang dipakai di sini.
- `API_SECRET` = (opsional, disarankan) string acak untuk proteksi endpoint.
  Kalau diisi, harus sama persis dengan `API_SECRET` di
  `GiftGamepassServer.server.lua`.
- `DISCORD_WEBHOOK_URL` = (opsional) URL webhook Discord, buat notifikasi
  tiap ada request gift baru.

Setelah isi env vars, redeploy (`vercel --prod`) supaya kepakai.

## Cara pasang di Roblox Studio

1. Aktifkan HTTP requests:
   **Game Settings → Security → Allow HTTP Requests** (ON).
2. Masukkan `GiftGamepassServer.server.lua` ke **ServerScriptService**.
   - Ganti `BACKEND_URL` dengan URL Vercel project `roblox-proxy` kamu,
     contoh `https://roblox-proxy-xxxx.vercel.app`.
   - Ganti `API_SECRET` sesuai yang kamu set di Vercel (kalau dipakai).
3. Masukkan `GiftGamepassClient.client.lua` ke **StarterGui** (sebagai
   LocalScript). Tidak perlu edit apa pun di file ini — daftar gamepass
   otomatis dimuat dari backend.
4. Klik **Play/Test** — tombol 🎁 akan muncul di kiri-tengah layar. Klik
   untuk membuka/menutup panel gift gamepass.

## Alur pemakaian di game

1. Player klik tombol toggle (kiri-tengah layar) → panel muncul di tengah.
2. Player isi username tujuan → klik **Cari**.
3. Panel otomatis memuat **semua gamepass game ini** ke ScrollingFrame,
   lengkap dengan status kepemilikan target (yang sudah dimiliki ditandai
   "✅ Sudah dimiliki" dan tombolnya nonaktif).
4. Player scroll & pilih gamepass yang belum dimiliki target, klik **Gift**.
5. Request dikirim ke `/gift` di proxy kamu, kamu dapat notifikasi (kalau
   pakai Discord webhook), lalu proses gift-nya manual/lanjutan sesuai
   kebutuhanmu.

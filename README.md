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
- `GET /gamepasses-for-user?username=NamaUser` — **otomatis** cari semua
  game publik bikinan target user itu, lalu ambil semua gamepass dari
  game-game tsb. Tidak perlu setting Universe Id manual sama sekali.
- `POST /gift` — terima & catat request gift (log + opsional Discord webhook)

Route `/proxy` yang lama tetap ada, tidak diubah.

## Cara kerja `/gamepasses-for-user`

1. Username → `userId` (lewat `users.roblox.com`)
2. `userId` → semua game publik yang dia buat (lewat
   `games.roblox.com/v2/users/{userId}/games`)
3. Tiap game itu → semua gamepass yang dijual di game tsb (lewat
   `games.roblox.com/v1/games/{universeId}/game-passes`)
4. Semua gamepass dari semua game itu digabung jadi satu list, dikirim balik
   ke Roblox lengkap dengan nama game asalnya masing-masing.

Jadi kamu tinggal ketik username siapa saja, dan sistem otomatis nemuin
gamepass apa aja yang dia jual — nggak perlu hardcode game/Universe Id apa
pun di kode.

## ⚠️ Batasan penting

Roblox **tidak menyediakan API publik untuk memberikan gamepass secara
langsung ke akun user lain**. Gamepass hanya bisa dibeli oleh pemiliknya
sendiri, atau di-gift lewat fitur resmi Roblox di web:
`roblox.com/my/gifts` (pakai Robux, manual lewat browser).

Jadi endpoint `/gift` di sini cuma **mencatat/menotifikasi request**, bukan
memberikan gamepass otomatis:
1. Player isi username tujuan → klik **Cari**.
2. Panel otomatis load semua gamepass dari game-game bikinan target itu.
3. Player pilih gamepass yang mau digift → klik **Gift**.
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

### Environment variables (opsional, tidak wajib)

Buka **Project Settings → Environment Variables** di dashboard Vercel kalau
mau pakai:

- `API_SECRET` = (opsional) string acak untuk proteksi endpoint. Kalau
  diisi, harus sama persis dengan `API_SECRET` di
  `GiftGamepassServer.server.lua`. Kalau kamu nggak set ini sama sekali,
  endpoint tetap jalan tanpa proteksi tambahan (kayak sekarang).
- `DISCORD_WEBHOOK_URL` = (opsional) URL webhook Discord, buat notifikasi
  tiap ada request gift baru.

**Tidak ada env var wajib lagi** — `/gamepasses-for-user` sekarang full
dinamis berdasarkan username yang diinput, tanpa Universe Id manual.

## Cara pasang di Roblox Studio

1. Aktifkan HTTP requests:
   **Game Settings → Security → Allow HTTP Requests** (ON).
2. Masukkan `GiftGamepassServer.server.lua` ke **ServerScriptService**.
   - Ganti `BACKEND_URL` dengan URL Vercel project `roblox-proxy` kamu,
     contoh `https://roblox-proxy-gamma-three.vercel.app`.
   - Biarkan `API_SECRET = ""` kalau nggak dipakai.
3. Masukkan `GiftGamepassClient.client.lua` ke **StarterGui** (sebagai
   LocalScript). Tidak perlu edit apa pun di file ini.
4. Klik **Play/Test** — tombol 🎁 akan muncul di kiri-tengah layar. Klik
   untuk membuka/menutup panel gift gamepass.

## Alur pemakaian di game

1. Player klik tombol toggle (kiri-tengah layar) → panel muncul di tengah.
2. Player isi username tujuan → klik **Cari**.
3. Panel otomatis memuat semua gamepass dari game-game bikinan target itu
   ke ScrollingFrame, lengkap dengan nama game asalnya masing-masing.
4. Player scroll & pilih gamepass yang mau digift, klik **Gift**.
5. Request dikirim ke `/gift` di proxy kamu, kamu dapat notifikasi (kalau
   pakai Discord webhook), lalu proses gift-nya manual/lanjutan sesuai
   kebutuhanmu.

# Titik Kunci

Titik Kunci adalah aplikasi web untuk menemukan bengkel dan montir terdekat, meminta bantuan kendaraan berdasarkan lokasi, serta memantau tarif dan progres layanan.

Landing page menjelaskan layanan untuk pemilik kendaraan dan menyediakan pendaftaran mitra bengkel. Langganan bengkel ditawarkan per bulan: Pro (Rp50.000, tanpa booking dalam aplikasi), Ultra (Rp100.000, termasuk booking), dan Enterprise (Rp250.000, termasuk fitur Ultra dan banyak cabang). Pengajuan bengkel ditinjau Super Admin sebelum akun diaktifkan; aplikasi belum memproses pembayaran langganan.

## Struktur

- `frontend-titik-kunci` — React, Vite, Tailwind CSS, Leaflet/OpenStreetMap.
- `api` — Node.js, Express, MySQL.
- `api\database\titikkunci_database.sql` — skema dan data awal final untuk instalasi database satu kali.

## Persyaratan

- Node.js 20 atau lebih baru.
- MySQL 8.0.24+ (database menggunakan tipe spasial dengan SRID 4326).
- Koneksi internet untuk tile OpenStreetMap dan rute OSRM.

## Database final

`api\database\titikkunci_database.sql` adalah satu-satunya berkas SQL yang disediakan dan memuat skema serta data awal final. Import satu kali ke database kosong. Dari Command Prompt di folder proyek:

```bat
mysql -u root -p < api\database\titikkunci_database.sql
```

Jika menggunakan Laragon dengan kata sandi MySQL kosong, hilangkan `-p`. File SQL membuat `titikkunci_db`, seluruh tabel, indeks, relasi, dan data contoh; semua perubahan skema terbaru sudah disatukan di berkas final ini. Proyek tidak menyertakan berkas SQL migrasi terpisah.

Salin konfigurasi contoh dan sesuaikan koneksi MySQL serta `JWT_SECRET` dengan string acak yang panjang. Di PowerShell dari folder proyek:

```powershell
Copy-Item .\api\.env.example .\api\.env
```

Jangan bagikan atau commit file `.env`.

## Menjalankan aplikasi

Buka dua terminal terpisah dari folder proyek.

**Terminal 1 — API:**

```powershell
Set-Location .\api
npm install
npm run dev
```

**Terminal 2 — web:**

```powershell
Set-Location .\frontend-titik-kunci
npm install
npm run dev
```

Buka alamat Vite yang ditampilkan (default `http://localhost:5173`). API berjalan di `http://localhost:4000`; `GET /api/health` memeriksa koneksi database.

## Akun demo

Semua akun demo memakai kata sandi `TitikKunci123!`.

| Peran | Nomor telepon |
| --- | --- |
| Pemilik kendaraan | `081271829301` |
| Admin Bengkel Titik Kunci Pangkalpinang | `081234567801` |
| Super admin | `081234567800` |

Akun dan data ini hanya untuk demo lokal. Ganti kata sandi dan data seed sebelum penggunaan nyata.

## Fitur MVP

- Pemilik mendaftar/masuk dengan nomor telepon, mendaftarkan kendaraan, memilih lokasi lewat GPS atau peta, melihat montir/bengkel/toko sparepart, membuat permintaan darurat, melihat estimasi biaya/rute, serta memantau atau membatalkan pesanan.
- Pemilik bengkel dapat mengirim pengajuan dengan pilihan paket; Super Admin meninjau dan mengaktifkan bengkel serta akun admin setelah menetapkan titik lokasinya.
- Admin bengkel memantau antrean bengkel, memperbarui status montir dan pesanan, mengelola profil lokasi, serta mencatat pembayaran tunai.
- Super admin memantau keseluruhan operasi, menambah bengkel dan akun admin, mengelola tarif zona, serta menambah layanan bengkel.
- Tarif menggunakan biaya dasar zona ditambah tarif per kilometer dari rute jalan OSRM. Pesanan tanpa montir siaga tetap dapat masuk antrean dan ditandai jelas.

## Catatan database dan peta

Database sumber berisi lima tabel geospasial dasar: `pelanggan`, `mekanik`, `toko_sparepart`, `zona_geofence`, dan `pesanan_darurat`. Skema final melengkapinya dengan akun/role, bengkel, kendaraan, layanan, status pembayaran, dan riwayat pesanan. Kolom montir pada pesanan boleh kosong sebelum penugasan, dan relasi pesanan menggunakan penghapusan yang menjaga riwayat.

Nilai WKT sumber menggunakan urutan sumbu EPSG:4326. API meminta/menyajikan koordinat peta sebagai latitude/longitude dan mengonversi WKT menggunakan opsi axis-order MySQL; periksa ulang titik di peta jika mengganti atau mengimpor data spasial sendiri.

Rute dan jarak jalan dihitung melalui layanan publik OSRM. Jika layanan rute tidak tersedia, permintaan yang memerlukan montir tidak dibuat dan aplikasi menampilkan pesan agar pengguna mencoba lagi. Peta/tile berasal dari OpenStreetMap.

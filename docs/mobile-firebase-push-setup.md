# Mobile Firebase Push Setup

Dokumen ini menjelaskan setup yang perlu disiapkan tim mobile supaya push notification dari backend bisa berjalan.

## Tujuan

- mendaftarkan aplikasi mobile ke Firebase
- mengambil device token dari Firebase
- mengirim token ke backend
- menerima push notification dari backend

## Arsitektur Singkat

Alur yang dipakai saat ini:

1. Mobile app meminta izin notifikasi ke user.
2. Mobile app mendapatkan **FCM device token** dari Firebase.
3. Mobile app mengirim token tersebut ke backend lewat `PATCH /v1/notifications/settings`.
4. Backend menyimpan token ke kolom `push_token`.
5. Worker notifikasi di backend menjalankan jadwal reminder.
6. Jika kondisi notifikasi terpenuhi, backend mengirim push ke token yang tersimpan.

## Kontrak Final Yang Harus Disepakati

### Field backend yang dipakai

- `enabled` untuk toggle notifikasi global
- `push_token` untuk token FCM device
- `daily_expense_reminder_enabled`
- `daily_expense_reminder_time`
- `debt_payment_reminder_enabled`
- `debt_payment_reminder_time`
- `debt_payment_reminder_days_before`
- `salary_reminder_enabled`
- `salary_reminder_time`
- `salary_reminder_days_before`
- `salary_day`

Catatan: di mobile, field lokal boleh dinamai `notification_enabled`, tetapi saat kirim ke backend tetap gunakan `enabled`.

### Route yang dikirim backend

- `daily_expense_input` -> `/activity`
- `debt_payment` -> `/debts`
- `salary_reminder` -> `/transactions?type=income`

Mobile harus membaca `data.kind`, `data.type`, dan `data.route` dari payload atau inbox backend.

## Yang Harus Disiapkan Di Firebase

Firebase project saja belum cukup. Aplikasi mobile harus didaftarkan juga.

### 1. Tambahkan App Baru

Di Firebase Console:

- klik `Add app`
- pilih platform yang dipakai:
  - `Android`
  - `iOS`

### 2. Masukkan Identitas App

Isi identifier sesuai platform:

- Android: `package name`
- iOS: `bundle identifier`

Identifier ini harus sama dengan konfigurasi app mobile.

### 3. Unduh File Konfigurasi

Setelah app didaftarkan, Firebase akan memberi file config:

- Android: `google-services.json`
- iOS: `GoogleService-Info.plist`

### 4. Pasang File Config Ke Project Mobile

Letakkan file config ke project mobile sesuai dokumentasi platform yang dipakai.

## Expo Notes

Kalau project mobile memakai Expo:

- untuk push notification, biasanya perlu **development build** atau **EAS build**
- Expo Go umumnya tidak cukup untuk setup push production native
- jika backend ini dipakai apa adanya, mobile harus memakai **FCM device token**
- backend ini **tidak** memakai Expo Push Token sebagai format utama

Kalau tim ingin tetap memakai Expo Push Token, arsitektur backend harus diubah untuk kirim ke Expo Push API, bukan langsung ke Firebase.

## Yang Harus Dikirim Dari Mobile Ke Backend

Mobile harus mengirim token ke endpoint berikut:

```http
PATCH /v1/notifications/settings
```

Contoh body minimal:

```json
{
  "push_token": "fcm-device-token"
}
```

Contoh body lengkap:

```json
{
  "enabled": true,
  "daily_expense_reminder_enabled": true,
  "daily_expense_reminder_time": "20:00",
  "debt_payment_reminder_enabled": true,
  "debt_payment_reminder_time": "09:00",
  "debt_payment_reminder_days_before": 3,
  "salary_reminder_enabled": true,
  "salary_reminder_time": "08:00",
  "salary_reminder_days_before": 1,
  "salary_day": 25,
  "push_token": "fcm-device-token"
}
```

## Checklist Mobile

- minta izin notifikasi ke user
- ambil FCM token dari Firebase
- kirim token ke backend setelah login atau setelah app ready
- refresh token jika Firebase mengubah token device
- tangani notifikasi saat app foreground
- tangani tap notifikasi saat app background
- buka screen yang sesuai berdasarkan tipe notifikasi
- arahkan tap notifikasi berdasarkan `data.route`
- tampilkan unread badge atau inbox notif dari backend

## Tipe Notifikasi Yang Disiapkan Backend

- `daily_expense_input`
- `debt_payment`
- `salary_reminder`

Rekomendasi perilaku UI:

- `daily_expense_input` -> buka input pengeluaran
- `debt_payment` -> buka detail debt atau halaman pembayaran
- `salary_reminder` -> buka input income / salary

`salary_day` adalah tanggal gaji bulanan yang dipilih user. Kalau bulan lebih pendek, backend memakai hari terakhir bulan itu.

## Environment Backend Yang Terkait

Backend membaca konfigurasi berikut:

- `APP_MODE`
- `NOTIFICATION_CRON_SCHEDULE`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CREDENTIALS_PATH`
- `FIREBASE_CREDENTIALS_JSON`

Jika kredensial Firebase tidak diisi, backend tetap bisa menyimpan reminder history, tetapi push notification tidak akan terkirim.
`google-services.json` yang Anda kirim dipakai di mobile Android. Backend butuh **service account key JSON** dari Firebase Admin SDK.

## Catatan Implementasi

- backend sekarang memakai Firebase Admin SDK / ADC
- backend menjalankan scheduler notifikasi melalui worker service
- scheduler bisa dijalankan sebagai service terpisah di Docker Compose

## Ringkasan

Kalau disederhanakan:

- daftar app mobile ke Firebase
- ambil FCM token dari mobile
- kirim token ke backend
- backend simpan token dan kirim push

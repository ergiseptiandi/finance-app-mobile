# Backend FCM Push Notification — Integration Guide

> **Konteks:** Notifikasi berhasil tersimpan di database (`delivery_status: "sent"`) dan muncul via `GET /v1/notifications`, tetapi **tidak pernah muncul di device Android**. Dokumen ini menjelaskan penyebab dan solusinya.

---

## Masalah

```
[Backend Scheduler]
    │
    ├── ✅ Insert notification record ke database
    ├── ✅ Set delivery_status = "sent"
    └── ❌ TIDAK mengirim push ke FCM API ← masalah di sini
```

Saat ini backend hanya menyimpan notification ke database. Agar notifikasi muncul di device, backend **harus mengirim HTTP request ke Firebase Cloud Messaging (FCM) API** menggunakan `push_token` milik user.

---

## Flow yang Seharusnya

```
[Backend Scheduler]
    │
    ├── 1. Insert notification record ke database
    ├── 2. Ambil push_token dari tabel notification_settings
    ├── 3. Kirim push ke FCM API menggunakan push_token
    ├── 4. Jika FCM respond 200 → set delivery_status = "delivered"
    └── 5. Jika FCM respond error → set delivery_status = "failed" + log error
```

---

## Cara Mendapatkan push_token

`push_token` sudah dikirim oleh mobile app saat user mengaktifkan notifikasi:

```
PATCH /v1/notifications/settings
{
    "enabled": true,
    "push_token": "eXyz123...FCM_DEVICE_TOKEN",
    ...
}
```

Token ini adalah **FCM Device Registration Token** yang di-generate oleh Firebase SDK di device Android. Backend harus menyimpan token ini dan menggunakannya saat mengirim push.

> ⚠️ **Penting:** `push_token` bisa berubah sewaktu-waktu (reinstall app, clear data, dll). Mobile app akan otomatis sync token terbaru via `PATCH /v1/notifications/settings` setiap kali app dibuka.

---

## Cara Mengirim Push ke FCM

### Option A: Firebase Admin SDK (Recommended)

#### Go (menggunakan `firebase.google.com/go/v4`)

```bash
go get firebase.google.com/go/v4
go get google.golang.org/api/option
```

```go
package notification

import (
	"context"
	"fmt"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

type FCMClient struct {
	client *messaging.Client
}

// NewFCMClient membuat FCM client dari service account key file
func NewFCMClient(ctx context.Context, serviceAccountKeyPath string) (*FCMClient, error) {
	opt := option.WithCredentialsFile(serviceAccountKeyPath)
	app, err := firebase.NewApp(ctx, nil, opt)
	if err != nil {
		return nil, fmt.Errorf("firebase init: %w", err)
	}

	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("fcm client: %w", err)
	}

	return &FCMClient{client: client}, nil
}

// SendPush mengirim push notification ke device
func (f *FCMClient) SendPush(ctx context.Context, pushToken string, title string, body string, data map[string]string) error {
	message := &messaging.Message{
		Token: pushToken,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Data: data,
		Android: &messaging.AndroidConfig{
			Priority: "high",
			Notification: &messaging.AndroidNotification{
				ChannelID: "finance-go-default",
				Sound:     "default",
				Priority:  messaging.PriorityMax,
			},
		},
	}

	response, err := f.client.Send(ctx, message)
	if err != nil {
		return fmt.Errorf("fcm send: %w", err)
	}

	fmt.Printf("FCM message sent: %s\n", response)
	return nil
}
```

#### Contoh Penggunaan saat Membuat Notification

```go
func (s *NotificationService) CreateAndSendNotification(ctx context.Context, userID int, n Notification) error {
	// 1. Simpan ke database
	record, err := s.repo.InsertNotification(ctx, userID, n)
	if err != nil {
		return err
	}

	// 2. Ambil push_token user
	settings, err := s.repo.GetNotificationSettings(ctx, userID)
	if err != nil || settings.PushToken == "" || !settings.Enabled {
		// User belum enable push atau token kosong, skip
		_ = s.repo.UpdateDeliveryStatus(ctx, record.ID, "no_token")
		return nil
	}

	// 3. Kirim ke FCM
	data := map[string]string{
		"kind":  n.Kind,
		"type":  n.Type,
		"route": n.Data.Route,
	}

	err = s.fcm.SendPush(ctx, settings.PushToken, n.Title, n.Message, data)
	if err != nil {
		_ = s.repo.UpdateDeliveryStatus(ctx, record.ID, "failed")
		return fmt.Errorf("send push: %w", err)
	}

	// 4. Update status
	_ = s.repo.UpdateDeliveryStatus(ctx, record.ID, "delivered")
	return nil
}
```

---

### Option B: FCM HTTP v1 API (Tanpa SDK)

Jika tidak ingin pakai SDK, bisa langsung HTTP request:

```
POST https://fcm.googleapis.com/v1/projects/finance-go-aead3/messages:send
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

```json
{
  "message": {
    "token": "<push_token dari notification_settings>",
    "notification": {
      "title": "Daily expense reminder",
      "body": "Jangan lupa input pengeluaran hari ini."
    },
    "data": {
      "kind": "daily_expense_input",
      "type": "daily_expense_input",
      "route": "/activity"
    },
    "android": {
      "priority": "high",
      "notification": {
        "channel_id": "finance-go-default",
        "sound": "default"
      }
    }
  }
}
```

> `ACCESS_TOKEN` didapat dari OAuth2 menggunakan service account. Lihat: https://firebase.google.com/docs/cloud-messaging/auth-server

---

## Setup Firebase Service Account

1. Buka [Firebase Console](https://console.firebase.google.com/) → Project **finance-go-aead3**
2. Settings (⚙️) → **Service accounts**
3. Klik **Generate new private key** → download JSON file
4. Simpan file ini di server backend (jangan commit ke repo!)
5. Set environment variable:
   ```
   FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/finance-go-aead3-firebase-adminsdk.json
   ```

---

## Field yang WAJIB Ada di Push Payload

| Field | Nilai | Keterangan |
|---|---|---|
| `token` | `push_token` dari `notification_settings` | FCM device token |
| `notification.title` | Judul notifikasi | Tampil di notification tray |
| `notification.body` | Isi notifikasi | Tampil di notification tray |
| `data.kind` | `daily_expense_input`, `debt_payment`, dll | Untuk routing di mobile app |
| `data.type` | Sama dengan `kind` | Fallback routing |
| `data.route` | `/activity`, `/debts`, dll | Deep link target |
| `android.priority` | `"high"` | Agar notifikasi muncul segera |
| `android.notification.channel_id` | `"finance-go-default"` | **WAJIB** — notification channel di Android |
| `android.notification.sound` | `"default"` | Bunyi notifikasi |

---

## Mapping `kind` → `data` Payload

| kind | route | Keterangan |
|---|---|---|
| `daily_expense_input` | `/activity` | Reminder input pengeluaran harian |
| `debt_payment` | `/debts` | Reminder pembayaran hutang |
| `salary_reminder` | `/transactions?type=income` | Reminder gaji masuk |

---

## Handle Token Expired / Invalid

FCM akan mengembalikan error jika `push_token` sudah tidak valid:

```json
{
  "error": {
    "code": 404,
    "message": "Requested entity was not found.",
    "status": "NOT_FOUND"
  }
}
```

atau:

```json
{
  "error": {
    "code": 400,
    "message": "The registration token is not a valid FCM registration token",
    "status": "INVALID_ARGUMENT"
  }
}
```

**Yang harus dilakukan:**
- Set `delivery_status = "failed"` pada notification record
- Hapus / kosongkan `push_token` di `notification_settings` agar tidak terus kirim ke token invalid
- Mobile app akan otomatis sync token baru saat dibuka lagi

---

## Checklist untuk Tim Backend

- [ ] Download service account key dari Firebase Console project `finance-go-aead3`
- [ ] Setup Firebase Admin SDK / HTTP client di backend
- [ ] Saat scheduler membuat notification, ambil `push_token` dari `notification_settings`
- [ ] Kirim push ke FCM API dengan payload yang benar (termasuk `channel_id`)
- [ ] Update `delivery_status` berdasarkan response FCM (`delivered` / `failed`)
- [ ] Handle token invalid → clear `push_token` di database
- [ ] Test: enable notifikasi di app → cek `push_token` tersimpan → trigger notification → push muncul di device

# Notifications API Documentation

This module manages user notification settings, notification inbox history, scheduled reminder generation, and Firebase Cloud Messaging (FCM) push delivery.

**Base URL**: `/v1/notifications`  
**Authentication**: All endpoints require `Authorization: Bearer <access_token>`

## Response Envelope

Most success responses use:

```json
{
  "Status": "200",
  "Message": "Success Get",
  "Data": {}
}
```

Error responses use:

```json
{
  "Status": "400",
  "Message": "invalid notification input"
}
```

Special case:
- `PATCH /v1/notifications/{id}/read` returns `Status: "success"` and `Message: "read"`.

## Implementation Notes

- Push delivery uses Firebase Admin SDK, not legacy `FCM_SERVER_KEY`.
- Backend credentials can be provided via `FIREBASE_CREDENTIALS_PATH`, `GOOGLE_APPLICATION_CREDENTIALS`, or `FIREBASE_CREDENTIALS_JSON`.
- Firebase project ID is read from `FIREBASE_PROJECT_ID` or fallback `GOOGLE_CLOUD_PROJECT`.
- The background notification worker runs when `APP_MODE=worker`.
- Worker schedule is controlled by `NOTIFICATION_CRON_SCHEDULE` and defaults to `@every 1m`.
- Android push payload uses channel `finance-go-default`, sound `default`, and high priority.
- `PATCH /settings` is a partial update endpoint.
- JSON request bodies reject unknown fields because the decoder uses `DisallowUnknownFields()`.

## Notification Kinds and Routes

| Kind | `data.route` | Intended mobile destination |
| --- | --- | --- |
| `daily_expense_input` | `/activity` | Expense input / activity screen |
| `debt_payment` | `/debts` | Debt list or debt payment screen |
| `salary_reminder` | `/transactions?type=income` | Income / salary input screen |

Mobile should read `kind`, `type`, and `data.route` from inbox data or push payload.

## Settings Fields

| Field | Type | Notes |
| --- | --- | --- |
| `enabled` | boolean | Master notification switch |
| `daily_expense_reminder_enabled` | boolean | Enable daily expense reminder |
| `daily_expense_reminder_time` | string | `HH:MM`, 24-hour format |
| `debt_payment_reminder_enabled` | boolean | Enable debt reminder |
| `debt_payment_reminder_time` | string | `HH:MM`, 24-hour format |
| `debt_payment_reminder_days_before` | integer | Must be `>= 0` |
| `salary_reminder_enabled` | boolean | Enable salary reminder |
| `salary_reminder_time` | string | `HH:MM`, 24-hour format |
| `salary_reminder_days_before` | integer | Must be `>= 0` |
| `salary_day` | integer | Must be `1` to `31` |
| `push_token` | string | FCM device token; empty string clears it |

Notes:
- Mobile local state may call the master switch `notification_enabled`, but the API field is `enabled`.
- Empty time strings do not clear the stored time. The service keeps the previous value when an empty string is sent.
- `push_token` is trimmed before saving.

## Default Settings

If the user has no row yet in `notification_settings`, `GET /settings` returns the in-code defaults:

```json
{
  "user_id": 123,
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
  "push_token": "",
  "created_at": "0001-01-01T00:00:00Z",
  "updated_at": "0001-01-01T00:00:00Z"
}
```

The zero timestamps above are expected until settings are persisted.

---

## 1. Get Notification Settings

**GET** `/v1/notifications/settings`

Returns current settings for the authenticated user. If no settings row exists yet, backend returns the default settings object.

Example success response:

```json
{
  "Status": "200",
  "Message": "Success Get",
  "Data": {
    "user_id": 123,
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
    "push_token": "",
    "created_at": "2026-04-21T09:00:00Z",
    "updated_at": "2026-04-21T09:00:00Z"
  }
}
```

---

## 2. Update Notification Settings

**PATCH** `/v1/notifications/settings`

Partial update for notification settings. Only send fields that need to change.

Example request:

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

Validation rules:
- `daily_expense_reminder_time`, `debt_payment_reminder_time`, `salary_reminder_time` must be valid `HH:MM`.
- `debt_payment_reminder_days_before >= 0`
- `salary_reminder_days_before >= 0`
- `salary_day` must be between `1` and `31`
- Unknown JSON fields return `400`.

Example success response:

```json
{
  "Status": "200",
  "Message": "Success Update",
  "Data": {
    "user_id": 123,
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
    "push_token": "fcm-device-token",
    "created_at": "2026-04-21T09:00:00Z",
    "updated_at": "2026-04-21T09:05:00Z"
  }
}
```

Example error response:

```json
{
  "Status": "400",
  "Message": "invalid notification input"
}
```

---

## 3. Generate Scheduled Reminders

**POST** `/v1/notifications/generate`

Manually runs scheduled reminder generation for the authenticated user. This same logic is also executed by the background worker.

Possible reminders:
- daily expense reminder
- debt payment reminder
- salary reminder

Generation behavior:
- If `enabled=false`, response is an empty array.
- Generation is idempotent per reminder dedupe key; duplicate reminders for the same schedule window are skipped.
- Reminder is only generated after its configured reminder time has passed.
- Inbox rows are stored even when push delivery cannot be sent.

Delivery behavior:
- If `push_token` is empty, inbox row is stored with `delivery_status: "skipped"`.
- If FCM send succeeds, `delivery_status: "delivered"`.
- If FCM send fails, `delivery_status: "failed"`.
- If FCM token is invalid or expired, backend clears the saved `push_token`.

Salary reminder behavior:
- `salary_day` is the recurring salary day-of-month.
- If the target month is shorter than `salary_day`, backend uses the last day of that month.

Example success response:

```json
{
  "Status": "200",
  "Message": "Success Generate",
  "Data": [
    {
      "id": 123,
      "kind": "salary_reminder",
      "type": "salary_reminder",
      "title": "Salary reminder",
      "message": "Jangan lupa catat pemasukan gaji tanggal 2026-04-30.",
      "read": false,
      "delivery_status": "skipped",
      "scheduled_for": "2026-04-29T08:00:00Z",
      "sent_at": null,
      "read_at": null,
      "dedupe_key": "salary-reminder:2026-04:1",
      "data": {
        "kind": "salary_reminder",
        "type": "salary_reminder",
        "route": "/transactions?type=income"
      },
      "created_at": "2026-04-29T08:05:00Z",
      "updated_at": "2026-04-29T08:05:00Z"
    }
  ]
}
```

Current reminder titles and message patterns from service code:
- Daily expense: title `Daily expense reminder`, message `Jangan lupa input pengeluaran hari ini.`
- Debt payment: title `Debt payment reminder`, message includes debt count, total amount, and nearest due date when available
- Salary: title `Salary reminder`, message `Jangan lupa catat pemasukan gaji tanggal YYYY-MM-DD.`

---

## 4. List Notifications

**GET** `/v1/notifications`

Optional query parameters:
- `kind=<notification_kind>`
- `read=true|false`

Current supported kinds:
- `daily_expense_input`
- `debt_payment`
- `salary_reminder`

Filter notes:
- `read` must be a valid boolean value.
- Invalid `read` values return `400` with message `invalid notification filter`.

Ordering:
- Results are sorted by `created_at DESC, id DESC`.

This endpoint is useful for:
- notification inbox
- unread badge/count
- reminder history
- fallback UI when push delivery failed

Example success response:

```json
{
  "Status": "200",
  "Message": "Success Get",
  "Data": [
    {
      "id": 123,
      "kind": "daily_expense_input",
      "type": "daily_expense_input",
      "title": "Daily expense reminder",
      "message": "Jangan lupa input pengeluaran hari ini.",
      "read": false,
      "delivery_status": "delivered",
      "scheduled_for": "2026-04-21T20:00:00Z",
      "sent_at": null,
      "read_at": null,
      "dedupe_key": "daily-expense:2026-04-21",
      "data": {
        "kind": "daily_expense_input",
        "type": "daily_expense_input",
        "route": "/activity"
      },
      "created_at": "2026-04-21T20:01:00Z",
      "updated_at": "2026-04-21T20:01:00Z"
    }
  ]
}
```

Notification object fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | integer | Notification ID |
| `kind` | string | Reminder kind |
| `type` | string | Mirrors `kind` in current implementation |
| `title` | string | Notification title |
| `message` | string | Notification message |
| `read` | boolean | Derived from `read_at != null` |
| `delivery_status` | string | Runtime values currently seen: `skipped`, `failed`, `delivered` |
| `scheduled_for` | datetime | Scheduled reminder timestamp |
| `sent_at` | datetime or null | Present in model, currently not populated by service |
| `read_at` | datetime or null | Populated when marked as read |
| `dedupe_key` | string | Internal idempotency key |
| `data` | object | Routing payload for mobile |
| `created_at` | datetime | Row creation timestamp |
| `updated_at` | datetime | Row update timestamp |

---

## 5. Mark Notification As Read

**PATCH** `/v1/notifications/{id}/read`

Marks a notification as read by setting `read_at`.

Validation:
- `{id}` must be a positive integer.
- If notification is not found for the current user, backend returns `404` with message `notification not found`.

Expected success response:

```json
{
  "Status": "success",
  "Message": "read",
  "Data": {
    "status": "read"
  }
}
```

---

## Mobile Integration Notes

This backend expects an FCM device registration token in `push_token`.

Current backend support:
- FCM native device token: supported
- Expo Push Token: not supported directly

Recommended mobile flow:
- request notification permission
- obtain FCM token after login or app bootstrap
- send token to `PATCH /v1/notifications/settings`
- refresh token when Firebase rotates it
- use `GET /v1/notifications` for inbox and unread state
- use `PATCH /v1/notifications/{id}/read` after user opens a notification
- use `data.route` for deep-link routing

# Push Notification Integration Notes

This document summarizes the push notification flow used by the project in a public-safe way.

## Overview

The backend stores notification records in the database and sends push notifications to registered mobile devices when push delivery is enabled.

## High-Level Flow

1. A notification record is created in the backend.
2. The backend checks whether the user has enabled push delivery.
3. If a valid device token exists, the backend sends a push notification through Firebase Cloud Messaging.
4. The backend updates delivery status based on the send result.
5. If the token is invalid, the backend clears it and waits for the mobile app to sync a fresh token.

## Key Concepts

- Device tokens must be refreshed when the mobile app reinstalls or Firebase rotates the token.
- The backend should store notification history even if push delivery fails.
- Android push notifications should use a dedicated notification channel.
- Mobile routing should be driven by the payload data, not by hardcoded backend details in the UI.

## Operational Checklist

- Register the mobile app with Firebase.
- Obtain a device token from the mobile app.
- Store the token on the backend after login or app bootstrap.
- Send push notifications only when the user has enabled them.
- Handle invalid or expired tokens gracefully.
- Keep notification history accessible from the app.

## Notes

- Prefer Firebase Admin SDK or a service-account-based integration.
- Keep credentials out of version control.
- Use separate environments for development and production.

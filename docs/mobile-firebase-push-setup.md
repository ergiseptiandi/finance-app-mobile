# Mobile Push Setup Overview

This document summarizes the mobile-side setup for push notifications in a public-safe way.

## Goals

- register the mobile app with Firebase
- request notification permission from the user
- obtain a device token from Firebase
- sync the token with the backend
- receive push notifications on the device

## Mobile Checklist

- ask the user for notification permission
- fetch a fresh device token after app startup or login
- send the token to the backend
- refresh the token when Firebase rotates it
- handle foreground and background notification states
- open the correct screen when the user taps a notification

## Configuration Notes

- keep Firebase config files out of source control when possible
- use separate app identifiers for Android and iOS
- make sure the backend and mobile app agree on the notification data model
- use development and production environments separately

## Public-Safe Guidance

For a public repository, document only the general setup steps and avoid publishing:

- live backend URLs
- exact API endpoint paths
- production tokens or credentials
- internal routing details tied to private environments

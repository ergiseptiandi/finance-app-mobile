# Finance Go

Personal finance mobile app built with Expo and React Native.

## Overview

Finance Go helps users track their money with a mobile-first experience. The app includes authentication, wallet management, category management, budgets, activity tracking, debt tracking, reports, notifications, and account settings.

## Features

- Onboarding flow
- Register, login, logout, and password recovery
- Biometric unlock
- Wallet management
- Category management
- Budget tracking
- Activity and transaction overview
- Debt tracking
- Reports and summaries
- Notification inbox and settings
- Profile and password settings
- Push notification support

## Requirements

- Node.js LTS
- npm
- Expo CLI
- Android Studio for Android development
- Xcode for iOS development on macOS

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment variables

   Copy `.env.example` to `.env` and set the required values.

3. Start the app

   ```bash
   npm run start
   ```

## Available Scripts

- `npm run start` - start the Expo dev server
- `npm run android` - run on Android
- `npm run ios` - run on iOS
- `npm run web` - run in the browser
- `npm run lint` - run lint checks

## Environment

The app reads configuration from environment variables defined in `.env`.

- `EXPO_PUBLIC_API_BASE_URL` - backend API base URL

## Notes

- The project uses Expo Router with file-based routing.
- Push notifications use Firebase-based device tokens.
- The backend and mobile app are maintained as separate repositories.

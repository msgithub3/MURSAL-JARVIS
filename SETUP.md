# MURSAL JARVIS — Setup & Deployment Guide

## Prerequisites

- **Node.js:** v18 or higher (v22 recommended)
- **Python:** 3.10+
- **JDK (For Android Builds):** OpenJDK 17
- **Android SDK (For Android Builds):** API Level 34 (Android 14) with Build-Tools 34.0.0

---

## 1. Environment Configuration

Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Ensure `GEMINI_API_KEY` is populated for server-side AI reasoning:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

---

## 2. Cloud Pro Cockpit & Server

Start the development server:
```bash
npm run dev
```
The server will bind to `http://0.0.0.0:3000`.

---

## 3. Running Automated Tests

Verify system health, MURSALCART financial math, and device mesh:
```bash
python3 scripts/run_all_tests.py
```

---

## 4. Android Build & Deployment

### Option A: Local Android Studio
1. Open the `/android` directory in Android Studio (Hedgehog or newer).
2. Allow Gradle sync to complete.
3. Select an emulator or physical Android device.
4. Run `app` target.

### Option B: Command Line APK Build
```bash
cd android
./gradlew assembleDebug
```
The generated APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`.

### Option C: Continuous Integration
Pushing changes to GitHub triggers `.github/workflows/android-build.yml`, which sets up Temurin JDK 17, compiles the APK, runs unit tests, and uploads the debug APK as an artifact.

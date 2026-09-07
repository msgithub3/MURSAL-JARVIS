# MURSAL JARVIS — Sovereign Personal AI & Voice Operating System

**MURSAL JARVIS** is a unified personal AI ecosystem combining an always-active voice assistant, multimodal reasoning via Gemini 3.8 Flash, Android system automation, an encrypted peer-to-peer device mesh, and the proprietary **MURSALCART™** Pakistani e-commerce intelligence engine.

---

## Key Capabilities

1. **Android-First Native Client (`/android`):**
   - Jetpack Compose holographic UI with JARVIS Orb and real-time audio visualizer.
   - Persistent `JarvisVoiceForegroundService` with low-power acoustic buffer thresholding for hands-free hotwords ("Hey JARVIS", "Wake up JARVIS", "Hey Mursal").
   - `JarvisAccessibilityService` for legitimate system actions (app launch, UI navigation).
   - Room SQLite quad-tier memory storage.

2. **MURSALCART™ E-Commerce Intelligence (Always-On):**
   - Automated **12-Metric Algorithm**: evaluates Demand, Competition, Supplier Cost, Margin, Markaz/Daraz availability, and COD return risks (factoring in the 18–25% Pakistani RTO rate).
   - High-Conversion Multi-Channel Listing Generator (Facebook Marketplace, OLX Pakistan, Instagram, TikTok Hooks) with WhatsApp objection handling in Roman Urdu.

3. **Multilingual Intelligence:**
   - Code-switched parsing and generation for Urdu (اردو), Roman Urdu, Punjabi, and English.
   - Example: *"JARVIS kal 10 baje customer ko call remind karna."*

4. **Secure Device Mesh & Anti-Loss Protocol:**
   - Authenticated P2P telemetry between Android client and Cloud nodes.
   - Remote anti-loss acoustic beacon trigger & remote lock mechanism.

5. **Cloud Pro Brain & Full-Stack Gateway (`server.ts`):**
   - Express server powered by Google GenAI SDK (`gemini-3.8-flash`).
   - Automated test runner (`scripts/run_all_tests.py`) with 100% pass rate.
   - Ready-to-download release package (`MURSAL_JARVIS_COMPLETE.zip`).

---

## Quick Start

### 1. Web & Cloud Engine
```bash
# Install dependencies
npm install

# Run full-stack dev server (port 3000)
npm run dev

# Run automated integration tests
python3 scripts/run_all_tests.py
```

### 2. Android Native Application
```bash
# Build Android debug APK
cd android
./gradlew assembleDebug

# Run unit tests
./gradlew testDebugUnitTest
```

### 3. Generate Complete Release ZIP
```bash
python3 package-mursal-jarvis.py
```
Output: `MURSAL_JARVIS_COMPLETE.zip` (available via web UI or `/api/jarvis/download-package`).

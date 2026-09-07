# MURSAL JARVIS — Developer & Contributor Guide

## Architecture Overview

MURSAL JARVIS is architected as a decoupled, multi-node ecosystem:
1. **Core State Engine:** Deterministic 7-stage state machine (`JarvisStateMachine.kt`) managing audio and reasoning states.
2. **Android Services:**
   - `JarvisVoiceForegroundService`: continuous background audio buffer capture with wake-phrase spotting.
   - `JarvisAccessibilityService`: low-latency automated UI navigation.
   - `JarvisNotificationListenerService`: e-commerce and WhatsApp notification interception.
3. **MURSALCART Engine:**
   - 12-metric e-commerce model tailored to the Pakistani market (factoring in 18% COD returns).
   - Multi-platform copywriting generator.
4. **Cloud Gateway:** Express TypeScript server with Gemini 3.8 Flash model reasoning.

---

## Code Quality & Verification

Before opening pull requests or creating releases:
1. Run linter: `npm run lint`
2. Run integration test suite: `python3 scripts/run_all_tests.py`
3. Repackage artifacts: `python3 package-mursal-jarvis.py`

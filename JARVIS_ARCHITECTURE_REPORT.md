# MURSAL JARVIS — Full System Architecture & Inspection Report
**Date:** September 2026  
**System:** MURSAL JARVIS — Autonomous Voice-First Personal AI Operating Assistant  
**Status:** Audit & Modernization Specification  

---

## 1. Existing Codebase Inspection Summary

### 1.1 Frontend (`src/`)
- **App.tsx**: Main futuristic HUD cockpit. Provides visual telemetry for voice phases, chat history, audio synthesis controls, and tabs (`cockpit`, `mursalcart`, `mesh`, `android`, `memory`).
- **Components**:
  - `JarvisOrb.tsx`: Dynamic audio-reactive holographic orb indicating listening, thinking, executing, speaking, and standby states.
  - `DeviceControlHUD.tsx`: Direct Android telemetry (battery, flashlight, volume, brightness, wifi, recent notifications, accessibility actions).
  - `DeviceMeshPanel.tsx`: Mesh network nodes, cryptographic handshake audit trail, anti-loss remote locator siren.
  - `MursalCartWorkspace.tsx`: 12-metric e-commerce valuation engine, profit calculator, multi-platform copy generator for Pakistan marketplace.
  - `MemoryConsole.tsx`: Memory inspector and manual query interface.
  - `VoiceLanguageToolbar.tsx`: Language selector (English, Urdu, Roman Urdu, Punjabi, Saraiki, Pashto, Sindhi) and voice personality switcher.
  - `AndroidSourceViewer.tsx`: Source tree inspector for native Android Kotlin components.

### 1.2 Backend Gateway (`server.ts`)
- Express server binding to `0.0.0.0:3000` with Vite development middleware.
- REST endpoints for `/api/health`, `/api/jarvis/chat`, `/api/jarvis/device/*`, `/api/jarvis/mursalcart/*`, `/api/jarvis/mesh/*`, `/api/jarvis/memory/*`, etc.
- Gemini integration utilizing `@google/genai` with `gemini-3.8-flash`.
- In-memory data structures and failover engines.

### 1.3 Native Android Kotlin Code (`android/`)
- `MainActivity.kt`: Hardware permission orchestrator and launcher.
- `JarvisVoiceForegroundService.kt`: Persistent Android foreground notification service for continuous listening.
- `JarvisVoiceInteractionService.kt` & `JarvisVoiceInteractionSessionService.kt`: System-level Default Android Assistant implementation.
- `JarvisAccessibilityService.kt`: Safe accessibility-based interaction primitives (`CLICK`, `TYPE`, `SCROLL`, `READ_TEXT`, `VERIFY`).
- `DeviceControlManager.kt` & `DeviceMeshManager.kt`: Hardware control abstractions and encrypted mesh networking.
- `MursalCartEngine.kt` & `PakistaniLanguageEngine.kt`: Local on-device NLP and e-commerce rule engines.

---

## 2. Critical Defect Analysis: Voice Command Multi-Fire Bug

### Root Causes Identified:
1. **Uncleaned SpeechRecognition Lifecycle**: In `App.tsx`, `useEffect` lacked a cleanup return function. When language mode changed, a new `SpeechRecognition` instance was created without tearing down the existing instance. Multiple instances remained active on the audio stream.
2. **Interim & Final Event Flooding**: Browser speech recognition sends interim events followed by multiple finalize events. Without a strict debouncing and lock barrier, multiple dispatch requests fired concurrently.
3. **Absence of Command Idempotency**: Commands lacked unique identification (`commandId`, `requestId`, `executionId`). Neither frontend nor backend rejected repeated executions of the exact same user command.

### Structural Resolution:
1. **Singleton Voice Pipeline Manager**: Strict single-session speech recognition controller with explicit teardown and lifecycle cleanup.
2. **Global Command Execution Guard**:
   - Every user voice utterance generates a deterministic `commandId` and unique `executionId`.
   - In-flight execution lock ensures only one command is processed at any given moment.
   - Idempotency window drops identical transcripts received within 2500ms.
3. **Formal State Machine**:
   - Strictly enforces transitions: `STANDBY` → `WAKE_WORD_DETECTED` → `LISTENING` → `TRANSCRIBING` → `COMMAND_DETECTED` → `INTENT_ANALYSIS` → `PLANNING` → `TOOL_EXECUTION` → `RESULT` → `VOICE_RESPONSE` → `STANDBY`.
   - AssistantState: `STANDBY`, `LISTENING`, `PROCESSING`, `EXECUTING`, `SPEAKING`, `ERROR`.

---

## 3. Python JARVIS Core & Decoupled Architecture

To satisfy enterprise operating layer standards, business logic and autonomous execution are orchestrated via Python JARVIS Core:
- **Command Gateway & Execution Locks**: Thread-safe command deduplication and lock management.
- **Intent Analysis & Planning Engine**: Multilingual intent parsing and multi-step tool execution planner.
- **Unified Tool Registry**: 20 modular tools with risk classification (`LOW_RISK`, `MEDIUM_RISK`, `HIGH_RISK`), schemas, handlers, and confirmation policies.
- **Memory OS**: 6 distinct memory layers (`SHORT_TERM_MEMORY`, `CONVERSATION_MEMORY`, `USER_PREFERENCES`, `TASK_MEMORY`, `DEVICE_MEMORY`, `AUTOMATION_MEMORY`).
- **Automation Engine**: Rule-based triggers, schedules, conditions, and actions.
- **Self-Diagnostics**: Continuous monitor exposing `/health`, `/models`, `/devices`, `/diagnostics`.
- **Controlled Self-Improvement & Rollback Engine**: Proposal, backup, patch, lint, test, validate, deploy, and automatic rollback on failure.

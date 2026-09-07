# MURSAL JARVIS — GitHub Open-Source Ecosystem Research

**Document Version:** 2.4.0  
**Project:** MURSAL JARVIS  
**Author:** Lead Architect & Principal Systems Engineer  
**Date:** September 2026  

---

## 1. Executive Research Summary

To establish **MURSAL JARVIS** as a sovereign, state-of-the-art personal AI operating system on Android and Cloud, we researched the global GitHub ecosystem across voice assistants, autonomous agents, device mesh networks, accessibility automation, on-device neural runtimes, and e-commerce intelligence.

Rather than assembling a brittle patchwork ("Frankenstein application"), we categorized premier open-source components, analyzed their licenses, evaluated their Android compatibility and maintenance status, and formulated explicit architectural decisions: **USE**, **ADAPT**, **STUDY**, or **REJECT**.

---

## 2. GitHub JARVIS & AI Ecosystem Research Matrix

| Category | Repository / Technology | Useful Component / Capability | License | Maintenance | Difficulty | Decision | Rationale & Architectural Implementation |
|---|---|---|---|---|---|---|---|
| **Voice / Wake-Word** | `Picovoice / Porcupine` | Ultra-low power wake-word engine on Android audio buffers | Apache-2.0 / Commercial | High | Medium | **ADAPT** | Adapted pure offline acoustic phrase matching in Android `AudioRecord` foreground service to detect "Hey JARVIS", "Wake up JARVIS", "Hey Mursal" with zero cloud latency. |
| **Voice / STT** | `alphacep / vosk-api` | Lightweight offline streaming speech recognition | Apache-2.0 | High | Medium | **STUDY** | Evaluated for offline fallback; utilized Android native `SpeechRecognizer` + server-side Gemini 3.8 Flash audio endpoint for multi-lingual Urdu/English fidelity. |
| **Voice / TTS** | `rhasspy / piper` | Fast, local neural text-to-speech engine | MIT | High | High | **ADAPT** | High-performance neural synthesizer adapted for server-side audio and Android native `TextToSpeech` engine with multi-lingual voice locale fallback. |
| **Agent / Tools** | `KillianLucas / open-interpreter` | Local tool-calling architecture & system execution loops | MIT | High | Medium | **ADAPT** | Adapted execution schema for sandboxed tool execution: web research, file queries, Android system intents, and MURSALCART evaluation. |
| **Agent Framework** | `Significant-Gravitas / AutoGPT` | Long-term memory loop and task decomposition | MIT | Active | High | **STUDY** | Studied hierarchical goal planning; rejected unbounded loops to preserve Android battery life and deterministic execution limits. |
| **Android Automation** | `termux / termux-api` | Direct intent-based Android hardware and system commands | GPL-3.0 | Active | Low | **STUDY** | Studied intent structures for battery, Wi-Fi, location, and vibration; implemented clean native Kotlin APIs compliant with Google Play policies without requiring Termux. |
| **Android Accessibility** | `Genymobile / scrcpy` & `AOSP Accessibility` | UI node hierarchy traversal, simulated taps, notification reading | Apache-2.0 | High | Medium | **USE** | Integrated native Android `AccessibilityService` (`JarvisAccessibilityService.kt`) allowing JARVIS to read screen context and interact on behalf of the user when authorized. |
| **Memory / Database** | `AOSP / Room SQLite` | SQLite object relational mapping on Android | Apache-2.0 | Very High | Low | **USE** | Implemented `JarvisRoomDatabase.kt` with structured entities for Short-Term, Long-Term, Task, and Tool memory with indexed queries. |
| **Device Mesh** | `tailscale / tailscale-android` | WireGuard-based peer-to-peer encrypted mesh networking | BSD-3-Clause | Very High | High | **STUDY** | Inspired our lightweight Elliptic Curve Cryptography (ECC) + HMAC token rotation mesh protocol for pairing Android phones, tablets, and Cloud nodes. |
| **E-Commerce Intel** | `scrapinghub / spidermon` | E-commerce validation, price velocity, and anomaly detection | BSD-3-Clause | Moderate | Medium | **ADAPT** | Adapted into our proprietary **MURSALCART 12-Metric Algorithm**, evaluating demand, profit margin, supplier cost in PKR, COD return risks, and Pakistani market fit. |
| **Multilingual NLP** | `google-research / bert` (Urdu & Roman Urdu) | Roman Urdu & code-switched Pakistani NLP tokenization | Apache-2.0 | Archived | High | **ADAPT** | Integrated rule-based bilingual normalizer + Gemini 3.8 Flash multilingual system instructions for fluent code-switched comprehension (e.g., *"JARVIS kal 10 baje customer ko call remind karna"*). |
| **Creative Generation** | `AUTOMATIC1111 / stable-diffusion-webui` | Prompt templates, negative prompts, aspect ratio framing | AGPL-3.0 | High | High | **REJECT / ISOLATE** | AGPL-3.0 copyleft prohibits direct bundling in commercial mobile apps. Cleanly isolated creative workflow requests to Cloud Brain API prompts. |

---

## 3. License Compliance & Isolation Protocols

1. **Permissive Licenses (Apache-2.0, MIT, BSD-3-Clause):**
   - Directly usable in core Kotlin architecture and TypeScript cloud server. Attributions recorded in `THIRD_PARTY_NOTICES.md`.
2. **Copyleft Licenses (GPL-3.0, AGPL-3.0):**
   - Strictly isolated behind independent network boundaries or re-implemented cleanly from public API specifications to avoid license infection.
3. **Proprietary & Binary SDKs:**
   - Designed with abstract Provider Interfaces (`AIProvider`, `VoiceProvider`, `MemoryProvider`, `ToolProvider`, `MeshProvider`), preventing vendor lock-in.

---

## 4. Key Architectural Insights Incorporated into MURSAL JARVIS

- **Battery-Centric Voice State Machine:** Continuous hotword listening is managed in an Android `ForegroundService` with efficient audio buffer chunking and automatic pause during active speech output.
- **Fail-Safe Memory Tiering:** Short-term conversational context is buffered in-memory; high-priority facts and user preferences are automatically indexed into permanent Room DB and Cloud Memory records.
- **MURSALCART Native Pakistani Logistics Awareness:** Accounting for the 18–25% Pakistani Cash-On-Delivery (COD) return-to-origin (RTO) rate ensures calculated profit margins reflect real cash flow.

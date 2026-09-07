# MURSAL JARVIS — Unified Real-Time Telemetry & Command Protocol (v1.0.0)

This document specifies the standard communication protocol shared across:
1. **Frontend**: React / Vite Single-Page Application (`src/lib/connectionManager.ts`)
2. **Backend**: Express / Node.js WebSocket Server (`server.ts`, `/api/jarvis/ws`)
3. **Android Client**: Native Kotlin OkHttp Client (`com.mursal.jarvis.network.JarvisWebSocketClient`)

---

## 1. Transport & Endpoints

- **Primary Transport**: WebSocket (RFC 6455)
- **URL Scheme**:
  - Development / Local: `ws://<HOST>:3000/api/jarvis/ws`
  - Production / SSL: `wss://<HOST>/api/jarvis/ws`
- **Fallback Transport**: HTTP SSE / REST Polling (`/api/jarvis/device/state`, interval: 8000ms)

---

## 2. Envelope Specification

All WebSocket frames MUST be serialized as UTF-8 JSON text conforming to the `ProtocolEnvelope` schema:

```json
{
  "type": "HELLO | WELCOME | PING | PONG | STATE_UPDATE | DEVICE_STATE_REQUEST | EVENT | COMMAND_DISPATCH | COMMAND_RESULT | ERROR_REPORT",
  "version": "1.0.0",
  "id": "msg-1718000000000-xyz123",
  "timestamp": 1718000000000,
  "priority": "CRITICAL | HIGH | NORMAL | LOW",
  "source": "android | web | backend | stt | rest",
  "sessionId": "session-unique-id",
  "traceId": "trace-uuid",
  "payload": {}
}
```

---

## 3. Handshake & Authentication Lifecycle

1. **Client -> Server (`HELLO`)**:
   Upon establishing TCP / WebSocket handshake, the client emits a `HELLO` frame:
   ```json
   {
     "type": "HELLO",
     "id": "msg-handshake-1",
     "timestamp": 1718000000000,
     "priority": "HIGH",
     "source": "android",
     "payload": {
       "deviceId": "android-galaxy-s24-mursal",
       "deviceName": "Mursal's Galaxy S24 Ultra",
       "clientType": "android",
       "appVersion": "2.4.0",
       "sessionToken": "tok-mursal-s24-sovereign-mesh",
       "capabilities": ["BATTERY", "CAMERA_TORCH", "AUDIO_VOLUME", "WIFI_P2P", "VOICE_STT"]
     }
   }
   ```

2. **Server -> Client (`WELCOME`)**:
   Server validates token and responds:
   ```json
   {
     "type": "WELCOME",
     "id": "msg-welcome-1",
     "timestamp": 1718000000050,
     "payload": {
       "serverVersion": "2.4.0",
       "clientId": "android-galaxy-s24-mursal",
       "heartbeatIntervalMs": 10000,
       "authenticated": true,
       "serverTimestamp": 1718000000050
     }
   }
   ```

---

## 4. Heartbeat & Latency Measurement

- **Interval**: Client emits `{ "type": "PING", "timestamp": <NOW> }` every 10,000ms.
- **Response**: Server replies `{ "type": "PONG", "timestamp": <NOW> }`.
- **RTT Latency**: `round_trip = pong_recv_time - ping_sent_time`.
- **Watchdog Timeout**: If no incoming message or `PONG` arrives within 25,000ms, the connection is classified as `TIMEOUT` and closed with app code `4008`.

---

## 5. Device State Synchronization (`STATE_UPDATE`)

Server and Android node synchronize the 21-point hardware telemetry:

```json
{
  "type": "STATE_UPDATE",
  "payload": {
    "deviceState": {
      "deviceId": "android-galaxy-s24-mursal",
      "battery": { "level": 84, "status": "DISCHARGING", "chargingState": "NONE", "temperatureCelsius": 32.6, "health": "GOOD" },
      "network": { "type": "WIFI", "wifiState": "ENABLED", "wifiSsid": "Mursal-Mesh-Wi-Fi6", "ipAddress": "192.168.1.104" },
      "bluetooth": { "state": "ON", "connectedDevices": ["Galaxy Buds2 Pro"] },
      "screen": { "isScreenOn": true, "isLocked": false, "brightness": 80 },
      "audio": { "volumeLevels": { "media": 75, "ring": 80, "alarm": 90 } },
      "thermal": { "thermalStatus": "NONE", "temperatureCelsius": 32.6 },
      "appContext": { "foregroundPackage": "com.mursal.jarvis", "appName": "JARVIS" },
      "services": { "jarvisServiceState": "RUNNING", "accessibilityServiceState": "ENABLED" },
      "connectivity": { "transportType": "WEBSOCKET", "lastSyncTime": 1718000000000 }
    }
  }
}
```

---

## 6. Voice & Command Deduplication (`COMMAND_DISPATCH`)

To eliminate duplicate execution between physical microphone input (`stt`) and remote WebSocket trigger (`websocket`):
Every command includes `commandId`, `source`, `sessionId`, and `timestamp`.
The `VoicePipelineGuard` enforces a monotonic execution token:
- Rejects identical queries arriving within 200ms
- Drops requests while another active command is in the critical execution section
- Dispatches `COMMAND_RESULT` with `deduplicated: true` when suppressed.

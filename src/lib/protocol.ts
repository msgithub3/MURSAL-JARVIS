/**
 * MURSAL JARVIS — Unified Real-Time WebSocket Protocol
 * 
 * Standardized protocol schema shared across:
 * - Browser Client (React / Vite)
 * - Node.js Server (Express / ws)
 * - Android Sovereign Client (Kotlin / OkHttp)
 */

export const PROTOCOL_VERSION = '1.0.0';
export const DEFAULT_WS_PATH = '/api/jarvis/ws';

export type ProtocolMessageType =
  | 'HELLO'
  | 'WELCOME'
  | 'PING'
  | 'PONG'
  | 'STATE_UPDATE'
  | 'DEVICE_STATE_REQUEST'
  | 'EVENT'
  | 'COMMAND_DISPATCH'
  | 'COMMAND_RESULT'
  | 'SCREEN_UPDATE'
  | 'ERROR_REPORT'
  | 'INSTANT_REPLY_REQUEST'
  | 'INSTANT_ACK'
  | 'AI_STREAM_START'
  | 'AI_STREAM_CHUNK'
  | 'AI_STREAM_SENTENCE'
  | 'AI_STREAM_END'
  | 'CANCEL_REPLY'
  | 'CANCEL_ACK';

export type MessagePriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface InstantReplyRequestPayload {
  commandId: string;
  query: string;
  mode?: 'FAST' | 'DEEP' | 'AUTO';
  language?: string;
  voiceProfile?: string;
  source?: 'voice' | 'ui' | 'stt' | 'mesh';
  sessionId?: string;
  sttTimestamp?: number;
  wakeWordTimestamp?: number;
}

export interface InstantAckPayload {
  commandId: string;
  ackText: string;
  isAction: boolean;
  actionName?: string;
  timestamp: number;
}

export interface AIStreamStartPayload {
  commandId: string;
  mode: 'FAST' | 'DEEP';
  model: string;
  engineMode: string;
  isBypass?: boolean;
  isCached?: boolean;
}

export interface AIStreamChunkPayload {
  commandId: string;
  chunk: string;
  index: number;
}

export interface AIStreamSentencePayload {
  commandId: string;
  sentence: string;
  index: number;
  isFirst: boolean;
  isFinal: boolean;
}

export interface AIStreamEndPayload {
  commandId: string;
  fullText: string;
  engineMode: string;
  activeModel: string;
  detectedIntent?: string;
  executedTools?: string[];
  metrics: {
    stt_latency?: number;
    router_latency?: number;
    model_ttft?: number;
    model_total_latency?: number;
    tts_ttfa?: number;
    tts_total_latency?: number;
    device_action_latency?: number;
    total_reply_latency?: number;
  };
}

export interface CancelReplyPayload {
  commandId?: string;
  reason?: string;
  newCommandId?: string;
}

export interface ProtocolEnvelope<T = any> {
  type: ProtocolMessageType;
  version?: string;
  id: string;
  timestamp: number;
  traceId?: string;
  priority?: MessagePriority;
  source?: 'web' | 'android' | 'backend' | 'stt' | 'rest';
  sessionId?: string;
  payload: T;
}

export interface HelloPayload {
  deviceId: string;
  deviceName: string;
  clientType: 'web' | 'android' | 'desktop';
  appVersion: string;
  sessionToken?: string;
  capabilities: string[];
}

export interface WelcomePayload {
  serverVersion: string;
  clientId: string;
  heartbeatIntervalMs: number;
  authenticated: boolean;
  serverTimestamp: number;
}

export interface CommandDispatchPayload {
  commandId: string;
  query: string;
  source: 'websocket' | 'stt' | 'ui';
  sessionId?: string;
  targetSubsystem?: string;
  params?: Record<string, any>;
}

export interface CommandResultPayload {
  commandId: string;
  success: boolean;
  message?: string;
  result?: any;
  executionTimeMs: number;
}

export function createEnvelope<T>(
  type: ProtocolMessageType,
  payload: T,
  options: {
    id?: string;
    priority?: MessagePriority;
    source?: 'web' | 'android' | 'backend' | 'stt' | 'rest';
    sessionId?: string;
    traceId?: string;
  } = {}
): ProtocolEnvelope<T> {
  return {
    type,
    version: PROTOCOL_VERSION,
    id: options.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: Date.now(),
    traceId: options.traceId,
    priority: options.priority || 'NORMAL',
    source: options.source || 'web',
    sessionId: options.sessionId,
    payload,
  };
}

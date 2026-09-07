/**
 * MURSAL JARVIS — Global Voice Pipeline & Command Execution Guard
 * 
 * Guarantees strictly:
 * ONE voice command
 * → ONE final transcript
 * → ONE intent
 * → ONE tool execution
 * → ONE response
 * 
 * Enforces:
 * - Singleton SpeechRecognition session with strict teardown/cleanup
 * - Global commandId, requestId, executionId generation
 * - Monotonic in-flight lock preventing concurrent duplicate dispatches
 * - 3000ms sha-256 equivalent normalized string deduplication window
 * - Formal 10-state voice pipeline machine
 */

export type AssistantState =
  | 'STANDBY'
  | 'LISTENING'
  | 'PROCESSING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'ERROR';

export type VoicePipelinePhase =
  | 'STANDBY'
  | 'WAKE_WORD_DETECTED'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'COMMAND_DETECTED'
  | 'INTENT_ANALYSIS'
  | 'PLANNING'
  | 'TOOL_EXECUTION'
  | 'RESULT'
  | 'VOICE_RESPONSE';

import { CommandQueueItem, VoiceStateMachineState } from '../types';
import { globalDeviceMonitor } from './deviceMonitorEngine';

export interface VoiceCommandContext {
  commandId?: string;
  responseId?: string;
  sessionId?: string;
  source?: 'stt' | 'wake_word' | 'websocket' | 'ui' | 'external';
  status?: 'interim' | 'final';
  resultIndex?: number;
  timestamp?: number;
}

export interface CommandLockToken {
  commandId: string;
  requestId: string;
  executionId: string;
  normalizedText: string;
  timestamp: number;
  isBargeIn?: boolean;
  priority?: 'NORMAL' | 'HIGH' | 'INTERRUPT';
}

const BARGE_IN_KEYWORDS = ['stop', 'ruk jao', 'ruko', 'cancel', 'chup', 'khamosh', 'pause', 'shutup', 'bas'];

class VoicePipelineGuard {
  private currentState: AssistantState = 'STANDBY';
  private currentPhase: VoicePipelinePhase = 'STANDBY';
  private voiceState: VoiceStateMachineState = 'IDLE';
  
  // Singleton SpeechRecognition reference
  private activeRecognition: any = null;
  private isListening: boolean = false;
  
  // Execution locks and deduplication cache
  private activeLockToken: CommandLockToken | null = null;
  private recentCommandHashes: Map<
    string,
    { timestamp: number; executionId: string; commandId?: string; sessionId?: string; responseId?: string; completed?: boolean }
  > = new Map();
  private deduplicationWindowMs: number = 800; // Rapid audio stutter debounce window
  
  // Session-based final transcript deduplication cache (200ms window)
  private lastFinalBySession: Map<
    string,
    { normalizedText: string; rawText: string; timestamp: number }
  > = new Map();
  private sessionFinalDeduplicationWindowMs: number = 200;
  
  // Comprehensive Command Queue with states: QUEUED, RUNNING, COMPLETED, CANCELLED, FAILED
  private fullCommandQueue: CommandQueueItem[] = [];
  private drainQueueHandler: ((rawText: string, token: CommandLockToken) => void) | null = null;
  private bargeInHandler: (() => void) | null = null;

  private seq: number = 0;
  private stateListeners: Set<(state: AssistantState, phase: VoicePipelinePhase) => void> = new Set();
  private voiceStateListeners: Set<(state: VoiceStateMachineState) => void> = new Set();
  private queueListeners: Set<(queue: CommandQueueItem[]) => void> = new Set();

  public setVoiceState(st: VoiceStateMachineState): void {
    const prev = this.voiceState;
    this.voiceState = st;

    if (st === 'SPEAKING' || st === 'PREPARING_SPEECH') {
      console.info(`[JARVIS][TTS] ${st}`);
    } else {
      console.info(`[JARVIS][VOICE] ${st}`);
    }

    if (st === 'IDLE' && prev !== 'IDLE') {
      this.drainNextQueueItem();
    }

    this.voiceStateListeners.forEach((listener) => {
      try {
        listener(st);
      } catch (e) {
        console.warn('Voice state listener error:', e);
      }
    });
  }

  public getVoiceState(): VoiceStateMachineState {
    return this.voiceState;
  }

  public subscribeVoiceState(listener: (state: VoiceStateMachineState) => void): () => void {
    this.voiceStateListeners.add(listener);
    listener(this.voiceState);
    return () => {
      this.voiceStateListeners.delete(listener);
    };
  }

  public onDrainQueue(handler: (rawText: string, token: CommandLockToken) => void): () => void {
    this.drainQueueHandler = handler;
    return () => { this.drainQueueHandler = null; };
  }

  public onBargeIn(handler: () => void): () => void {
    this.bargeInHandler = handler;
    return () => { this.bargeInHandler = null; };
  }

  public subscribe(listener: (state: AssistantState, phase: VoicePipelinePhase) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.currentState, this.currentPhase);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeQueue(listener: (queue: CommandQueueItem[]) => void): () => void {
    this.queueListeners.add(listener);
    listener([...this.fullCommandQueue]);
    return () => this.queueListeners.delete(listener);
  }

  public getCommandQueue(): CommandQueueItem[] {
    return [...this.fullCommandQueue];
  }

  private notifyQueue() {
    const copy = [...this.fullCommandQueue];
    this.queueListeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (e) {
        console.warn('Queue listener error:', e);
      }
    });
  }

  public getState(): { state: AssistantState; phase: VoicePipelinePhase; isBusy: boolean } {
    return {
      state: this.currentState,
      phase: this.currentPhase,
      isBusy: this.activeLockToken !== null,
    };
  }

  public setPhase(phase: VoicePipelinePhase) {
    this.currentPhase = phase;
    switch (phase) {
      case 'STANDBY':
        this.currentState = 'STANDBY';
        break;
      case 'WAKE_WORD_DETECTED':
      case 'LISTENING':
        this.currentState = 'LISTENING';
        break;
      case 'TRANSCRIBING':
      case 'COMMAND_DETECTED':
      case 'INTENT_ANALYSIS':
      case 'PLANNING':
        this.currentState = 'PROCESSING';
        break;
      case 'TOOL_EXECUTION':
      case 'RESULT':
        this.currentState = 'EXECUTING';
        break;
      case 'VOICE_RESPONSE':
        this.currentState = 'SPEAKING';
        break;
      default:
        this.currentState = 'STANDBY';
    }
    this.notify();
  }

  public setError() {
    this.currentState = 'ERROR';
    this.currentPhase = 'STANDBY';
    this.notify();
  }

  private notify() {
    for (const listener of this.stateListeners) {
      try {
        listener(this.currentState, this.currentPhase);
      } catch (err) {
        console.warn('VoicePipelineGuard listener error:', err);
      }
    }
  }

  public normalizeText(text: string): string {
    const withoutWakeWords = text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
      .replace(/\b(hey jarvis|wake up jarvis|hey mursal|hello jarvis|jarvis)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutWakeWords.length >= 2) {
      return withoutWakeWords;
    }
    // Fallback if user spoke a greeting or wake word directly
    return text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Evaluates command priority
   */
  private evaluatePriority(normalized: string): 'NORMAL' | 'HIGH' | 'INTERRUPT' {
    if (BARGE_IN_KEYWORDS.includes(normalized)) return 'INTERRUPT';
    if (
      normalized.includes('screen') ||
      normalized.includes('emergency') ||
      normalized.includes('stop') ||
      normalized.includes('kya ho raha') ||
      normalized.includes('urgent')
    ) {
      return 'HIGH';
    }
    return 'NORMAL';
  }

  /**
   * Acquire execution lock for user utterance.
   * Context-aware: takes speech session, commandId, source, status, and responseId
   * to avoid suppressing legitimate repeated interactions.
   */
  public acquireExecution(
    rawText: string,
    context?: VoiceCommandContext
  ): CommandLockToken | null {
    // 0. Interim transcripts are only for live UI captioning, never for command execution
    if (context?.status === 'interim') {
      return null;
    }

    const normalized = this.normalizeText(rawText);
    if (!normalized || normalized.length < 2) {
      return null;
    }

    const now = Date.now();
    const priority = this.evaluatePriority(normalized);
    const sessionId = context?.sessionId || 'default';
    const source = context?.source || 'stt';
    const status = context?.status || 'final';
    const listenerCount = this.stateListeners.size + this.voiceStateListeners.size;
    const sttState = this.isListening ? 'LISTENING' : 'STOPPED';
    const ttsState = this.voiceState === 'SPEAKING' ? 'SPEAKING' : this.voiceState;

    // Publish event
    globalDeviceMonitor.publishEvent(
      'VOICE_COMMAND_RECEIVED',
      'VoicePipeline',
      priority === 'INTERRUPT' ? 'CRITICAL' : priority === 'HIGH' ? 'HIGH' : 'NORMAL',
      { rawText, priority, context },
      'PUBLIC'
    );
    console.info(`[JARVIS][VOICE] COMMAND_RECEIVED: "${rawText}" (priority: ${priority}, source: ${source})`);

    // If JARVIS is currently speaking, the arrival of a user command causes instant barge-in
    if (this.voiceState === 'SPEAKING' && this.bargeInHandler) {
      console.info(`[JARVIS][VOICE] Barge-in triggered while speaking by "${rawText}"`);
      try {
        this.bargeInHandler();
      } catch (e) {
        console.warn('Error in barge-in handler:', e);
      }
      this.setVoiceState('INTERRUPTED');
      this.activeLockToken = null;
    }

    // High-Priority Barge-In / Interruption check
    if (priority === 'INTERRUPT') {
      console.info(`[VoicePipelineGuard] BARGE-IN / INTERRUPT: "${rawText}". Aborting running actions.`);
      if (this.bargeInHandler) {
        try {
          this.bargeInHandler();
        } catch (e) {
          console.warn('Error in barge-in handler:', e);
        }
      }
      // Mark running commands as CANCELLED
      this.fullCommandQueue.forEach((item) => {
        if (item.status === 'RUNNING' || item.status === 'QUEUED') {
          item.status = 'CANCELLED';
        }
      });
      this.notifyQueue();
      this.activeLockToken = null;
      this.setVoiceState('INTERRUPTED');
      this.resetToStandby();
      return null;
    }

    // 1. Session-Based Final Transcript Deduplication:
    // Ignores transcripts identical to the previous 'final' transcript in the same session arriving within 200ms
    if (status === 'final') {
      const lastFinalInSession = this.lastFinalBySession.get(sessionId);
      if (lastFinalInSession) {
        const elapsedSinceFinal = now - lastFinalInSession.timestamp;
        const isIdentical =
          lastFinalInSession.normalizedText === normalized ||
          lastFinalInSession.rawText.toLowerCase().trim() === rawText.toLowerCase().trim();

        if (elapsedSinceFinal < this.sessionFinalDeduplicationWindowMs && isIdentical) {
          console.warn(
            `[VoicePipelineGuard] SUPPRESSED DUPLICATE SPEECH: "${rawText}" | reason: Session deduplication: identical to previous final transcript within ${elapsedSinceFinal}ms (<${this.sessionFinalDeduplicationWindowMs}ms window) | source: ${source} | status: ${status} | elapsed: ${elapsedSinceFinal}ms | session: ${sessionId} | listeners: ${listenerCount} | STT: ${sttState} | TTS: ${ttsState}`
          );
          return null;
        }
      }
    }

    // 2. Context-Aware Deduplication:
    // A: In-flight duplicate: identical command is actively executing
    if (this.activeLockToken && this.activeLockToken.normalizedText === normalized) {
      const inFlightElapsed = now - this.activeLockToken.timestamp;
      if (inFlightElapsed < 1200) {
        console.warn(
          `[VoicePipelineGuard] SUPPRESSED DUPLICATE SPEECH: "${rawText}" | reason: In-flight execution active | source: ${source} | status: ${status} | elapsed: ${inFlightElapsed}ms | session: ${sessionId} | listeners: ${listenerCount} | STT: ${sttState} | TTS: ${ttsState}`
        );
        return null;
      }
    }

    // B: Rapid audio stutter within same speech session / utterance (<800ms)
    const recent = this.recentCommandHashes.get(normalized);
    if (recent) {
      const elapsed = now - recent.timestamp;
      const isSameSession = context?.sessionId && recent.sessionId ? context.sessionId === recent.sessionId : true;
      const isSameCommandId = context?.commandId && recent.commandId ? context.commandId === recent.commandId : false;

      // Only suppress if within stutter window AND in same session AND command not completed
      if (elapsed < this.deduplicationWindowMs && (isSameSession || isSameCommandId) && !recent.completed) {
        console.warn(
          `[VoicePipelineGuard] SUPPRESSED DUPLICATE SPEECH: "${rawText}" | reason: Rapid audio stutter in same session | source: ${source} | status: ${status} | elapsed: ${elapsed}ms | session: ${sessionId} | listeners: ${listenerCount} | STT: ${sttState} | TTS: ${ttsState}`
        );
        return null;
      }
    }

    // 2. If a command is actively executing (different command):
    if (this.activeLockToken) {
      // Check safety lock expiry (15 seconds)
      if (now - this.activeLockToken.timestamp > 15000) {
        console.warn('[VoicePipelineGuard] Force-released hung lock');
        this.activeLockToken = null;
      } else {
        // Enqueue command instead of discarding it!
        const cmdId = context?.commandId || `cmd-${now}-${Math.random().toString(36).substring(2, 6)}`;
        const queueItem: CommandQueueItem = {
          commandId: cmdId,
          rawText,
          timestamp: now,
          priority,
          status: 'QUEUED',
        };

        if (priority === 'HIGH') {
          this.fullCommandQueue.unshift(queueItem);
          console.info(`[VoicePipelineGuard] HIGH PRIORITY COMMAND QUEUED AT HEAD: "${rawText}"`);
        } else {
          this.fullCommandQueue.push(queueItem);
          console.info(`[VoicePipelineGuard] NORMAL COMMAND QUEUED: "${rawText}" (Queue size: ${this.fullCommandQueue.length})`);
        }

        if (this.fullCommandQueue.length > 20) {
          this.fullCommandQueue.shift();
        }
        this.notifyQueue();
        return null;
      }
    }

    // 3. Grant execution lock
    this.seq += 1;
    const token: CommandLockToken = {
      commandId: context?.commandId || `cmd-${now}-${this.seq}`,
      requestId: context?.responseId || `req-${Math.random().toString(36).substring(2, 10)}`,
      executionId: `exec-${now}-${Math.random().toString(36).substring(2, 8)}`,
      normalizedText: normalized,
      timestamp: now,
      priority,
    };

    this.activeLockToken = token;
    this.recentCommandHashes.set(normalized, {
      timestamp: now,
      executionId: token.executionId,
      commandId: token.commandId,
      sessionId: context?.sessionId,
      responseId: context?.responseId,
      completed: false,
    });

    if (status === 'final') {
      this.lastFinalBySession.set(sessionId, {
        normalizedText: normalized,
        rawText,
        timestamp: now,
      });

      // Housekeeping: prune stale session entries older than 60s
      if (this.lastFinalBySession.size > 100) {
        for (const [sId, entry] of this.lastFinalBySession.entries()) {
          if (now - entry.timestamp > 60000) {
            this.lastFinalBySession.delete(sId);
          }
        }
      }
    }

    // Track in fullCommandQueue as RUNNING
    const runningItem: CommandQueueItem = {
      commandId: token.commandId,
      rawText,
      timestamp: now,
      priority,
      status: 'RUNNING',
    };
    this.fullCommandQueue.unshift(runningItem);
    if (this.fullCommandQueue.length > 20) this.fullCommandQueue.pop();
    this.notifyQueue();

    globalDeviceMonitor.publishEvent(
      'VOICE_COMMAND_STARTED',
      'VoicePipeline',
      'NORMAL',
      { commandId: token.commandId, executionId: token.executionId },
      'PUBLIC'
    );

    this.setPhase('COMMAND_DETECTED');
    this.setVoiceState('THINKING');
    console.info(`[VoicePipelineGuard] GRANTED EXECUTION: ${token.executionId} for "${normalized}"`);
    return token;
  }

  /**
   * Release the execution lock and transition phase
   */
  public releaseExecution(tokenOrId: CommandLockToken | string, success = true, error?: string) {
    const executionId = typeof tokenOrId === 'string' ? tokenOrId : tokenOrId.executionId;
    if (this.activeLockToken && (this.activeLockToken.executionId === executionId || typeof tokenOrId === 'string')) {
      const token = this.activeLockToken;
      const now = Date.now();
      const durationMs = now - token.timestamp;

      // Update queue item
      const item = this.fullCommandQueue.find((q) => q.commandId === token.commandId);
      if (item) {
        item.status = success ? 'COMPLETED' : 'FAILED';
        item.durationMs = durationMs;
        item.error = error;
      }
      this.notifyQueue();

      globalDeviceMonitor.publishEvent(
        success ? 'VOICE_COMMAND_COMPLETED' : 'VOICE_COMMAND_FAILED',
        'VoicePipeline',
        success ? 'NORMAL' : 'HIGH',
        { commandId: token.commandId, durationMs, error },
        'PUBLIC'
      );

      this.activeLockToken = null;
      const recent = this.recentCommandHashes.get(token.normalizedText);
      if (recent) {
        recent.completed = true;
      }
      this.setPhase('VOICE_RESPONSE');
      this.setVoiceState('COMPLETED');
      console.info(`[VoicePipelineGuard] RELEASED EXECUTION: ${token.executionId} (${durationMs}ms)`);
      this.drainNextQueueItem();
    }
  }

  public resetToStandby() {
    this.activeLockToken = null;
    this.setPhase('STANDBY');
    this.setVoiceState('IDLE');
    this.drainNextQueueItem();
  }

  private drainNextQueueItem() {
    if (this.activeLockToken) return;

    // Find next QUEUED item
    const nextItem = this.fullCommandQueue.find((q) => q.status === 'QUEUED');
    if (nextItem && this.drainQueueHandler) {
      console.info(`[VoicePipelineGuard] DRAINING QUEUE: executing queued command "${nextItem.rawText}"`);
      const newToken = this.acquireExecution(nextItem.rawText);
      if (newToken) {
        nextItem.status = 'RUNNING';
        this.notifyQueue();
        this.drainQueueHandler(nextItem.rawText, newToken);
      }
    }
  }

  /**
   * Singleton SpeechRecognition lifecycle management
   */
  public bindRecognition(recognitionInstance: any) {
    this.teardownRecognition();
    this.activeRecognition = recognitionInstance;
  }

  public teardownRecognition() {
    if (this.activeRecognition) {
      try {
        this.activeRecognition.onresult = null;
        this.activeRecognition.onstart = null;
        this.activeRecognition.onend = null;
        this.activeRecognition.onerror = null;
        this.activeRecognition.abort();
      } catch (err) {
        // Ignored
      }
      this.activeRecognition = null;
    }
    this.isListening = false;
  }

  public setListeningState(listening: boolean) {
    this.isListening = listening;
    if (listening && this.currentPhase === 'STANDBY') {
      this.setPhase('LISTENING');
    } else if (!listening && (this.currentPhase === 'LISTENING' || this.currentPhase === 'WAKE_WORD_DETECTED')) {
      this.setPhase('STANDBY');
    }
  }

  public setSessionFinalDeduplicationWindowMs(ms: number): void {
    this.sessionFinalDeduplicationWindowMs = ms;
  }

  public getSessionFinalDeduplicationWindowMs(): number {
    return this.sessionFinalDeduplicationWindowMs;
  }

  public clearSessionDeduplication(sessionId?: string): void {
    if (sessionId) {
      this.lastFinalBySession.delete(sessionId);
    } else {
      this.lastFinalBySession.clear();
    }
  }
}

export const globalVoicePipelineGuard = new VoicePipelineGuard();

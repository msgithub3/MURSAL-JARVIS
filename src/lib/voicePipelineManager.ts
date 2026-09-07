/**
 * MURSAL JARVIS — Centralized Voice Pipeline Lifecycle Manager
 * 
 * Guarantees:
 * 1. Strict Singleton: Only ONE active microphone / SpeechRecognition session at a time.
 * 2. Idempotency: startListening() and stopListening() are strictly idempotent and safe against race conditions.
 * 3. Event Listener Hygiene: Zero duplicate event listeners, explicit cleanups on teardown or remount.
 * 4. React StrictMode / Remount Immunity: Component remounts cannot leak active audio streams or instantiate concurrent STT sessions.
 * 5. Utterance & Index-Aware Processing:
 *    - Interim transcripts ONLY update UI preview — NEVER acquire execution locks or dispatch commands.
 *    - Finalized segments are tracked per resultIndex in `dispatchedResultIndices`; duplicate Chrome/WebKit flushes within ~55ms are rejected before guard dispatch.
 * 6. TTS Echo Suppression & Self-Listening Prevention:
 *    - Tracks TTS_ACTIVE and acoustic tail window (~350ms).
 *    - Non-barge-in transcripts matching or overlapping during TTS are suppressed.
 *    - If continuous listening was active, STT automatically resumes after TTS finishes without permanent mic disabling.
 * 7. Wake Word Preservation:
 *    - "Hey JARVIS", "Wake up JARVIS", "Hey Mursal", "JARVIS", "Hello JARVIS"
 *    - Plain "Hello" is NEVER treated as a wake word.
 */

import { globalVoicePipelineGuard, CommandLockToken, VoiceCommandContext } from './voicePipelineGuard';
import { VoiceStateMachineState } from '../types';

export type STTState = 'UNINITIALIZED' | 'STOPPED' | 'STARTING' | 'LISTENING' | 'STOPPING' | 'ERROR';
export type TTSState = 'IDLE' | 'PREPARING' | 'SPEAKING';

export interface VoicePipelineConfig {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  echoTailMs: number;
}

export type CommandDispatchHandler = (cleanQuery: string, token: CommandLockToken) => void;
export type TranscriptChangeHandler = (transcript: string, isFinal: boolean) => void;
export type StateChangeHandler = (sttState: STTState, isListening: boolean) => void;

// Canonical Wake Phrases (Strictly preserve user specifications)
export const WAKE_PHRASES = [
  'hey jarvis',
  'wake up jarvis',
  'hey mursal',
  'hello jarvis',
  'jarvis',
];

// Barge-in interruption triggers that are allowed even while TTS is speaking
export const BARGE_IN_PHRASES = [
  'ruk jao',
  'ruko',
  'bas karo',
  'bas',
  'stop',
  'chup',
  'cancel',
  'never mind',
  'pause',
  'khamosh',
];

export class VoicePipelineManager {
  private config: VoicePipelineConfig = {
    language: 'en-US',
    continuous: true,
    interimResults: true,
    echoTailMs: 350,
  };

  private currentSessionId: string = `vsession_init_${Date.now()}`;
  private sttState: STTState = 'STOPPED';
  private ttsState: TTSState = 'IDLE';

  // Active Browser SpeechRecognition reference
  private recognition: any = null;
  private continuousListeningWanted: boolean = false;

  // Echo and self-listening tracking
  private isTTSActive: boolean = false;
  private currentSpokenText: string = '';
  private lastTTSEndTimestamp: number = 0;

  // Result index deduplication within active recognition session
  private dispatchedResultIndices: Set<number> = new Set();
  private lastDispatchedQuery: string = '';
  private lastDispatchedTimestamp: number = 0;

  // Session-based deduplication for final transcripts (200ms window)
  private lastFinalTranscriptBySession: Map<
    string,
    { transcript: string; cleanQuery: string; normalizedQuery: string; timestamp: number }
  > = new Map();
  private sessionDeduplicationWindowMs: number = 200;

  // React lifecycle listener attachment management (ensures listeners are only attached once per lifecycle)
  private isReactLifecycleAttached: boolean = false;
  private lifecycleCleanupFns: Array<() => void> = [];

  // Subscribers with cleanup tracking
  private commandHandlers: Set<CommandDispatchHandler> = new Set();
  private transcriptHandlers: Set<TranscriptChangeHandler> = new Set();
  private stateHandlers: Set<StateChangeHandler> = new Set();
  private bargeInHandlers: Set<() => void> = new Set();

  constructor() {
    this.currentSessionId = `vsession_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  // --------------------------------------------------------------------------
  // Diagnostic State Getters
  // --------------------------------------------------------------------------

  public getSessionId(): string {
    return this.currentSessionId;
  }

  public getSTTState(): STTState {
    return this.sttState;
  }

  public getTTSState(): TTSState {
    return this.ttsState;
  }

  public getIsListening(): boolean {
    return this.sttState === 'LISTENING';
  }

  public getIsTTSActive(): boolean {
    return this.isTTSActive;
  }

  public getListenerCount(): number {
    return this.commandHandlers.size + this.transcriptHandlers.size + this.stateHandlers.size;
  }

  // --------------------------------------------------------------------------
  // Configuration & Language Mode
  // --------------------------------------------------------------------------

  public setLanguage(languageMode: string): void {
    const newLang = languageMode === 'ur' ? 'ur-PK' : 'en-US';
    if (this.config.language === newLang) return;

    this.config.language = newLang;
    console.info(`[VoicePipelineManager] Language updated to: ${newLang}`);

    // If currently listening, gracefully restart recognition with new language
    if (this.sttState === 'LISTENING' || this.continuousListeningWanted) {
      this.restartListeningInternal();
    }
  }

  // --------------------------------------------------------------------------
  // TTS State Coordination & Echo Suppression
  // --------------------------------------------------------------------------

  public notifyTTSStart(spokenText: string): void {
    this.isTTSActive = true;
    this.ttsState = 'SPEAKING';
    this.currentSpokenText = spokenText ? spokenText.toLowerCase().trim() : '';
    console.info(`[VoicePipelineManager] TTS_ACTIVE marked. Spoken text preview: "${this.currentSpokenText.substring(0, 35)}..."`);
  }

  public notifyTTSEnd(): void {
    this.isTTSActive = false;
    this.ttsState = 'IDLE';
    this.lastTTSEndTimestamp = Date.now();
    console.info(`[VoicePipelineManager] TTS finished. Acoustic echo tail active for ${this.config.echoTailMs}ms.`);

    // If continuous listening was requested by the user, ensure STT is actively listening
    if (this.continuousListeningWanted && this.sttState !== 'LISTENING' && this.sttState !== 'STARTING') {
      setTimeout(() => {
        if (this.continuousListeningWanted && !this.isTTSActive && this.sttState !== 'LISTENING') {
          console.info('[VoicePipelineManager] Automatically returning to continuous listening after TTS completion.');
          this.startListening().catch((err) => {
            console.warn('[VoicePipelineManager] Auto-resume listening error:', err);
          });
        }
      }, this.config.echoTailMs);
    }
  }

  // --------------------------------------------------------------------------
  // Lifecycle Management: Idempotent start, stop, restart, teardown
  // --------------------------------------------------------------------------

  public async startListening(): Promise<boolean> {
    this.continuousListeningWanted = true;

    // Idempotency check
    if (this.sttState === 'LISTENING') {
      console.info('[VoicePipelineManager] startListening() called while already LISTENING - idempotent no-op.');
      return true;
    }
    if (this.sttState === 'STARTING') {
      console.info('[VoicePipelineManager] startListening() called while STARTING - waiting.');
      return true;
    }

    if (typeof window === 'undefined') {
      console.warn('[VoicePipelineManager] Window is undefined (Node/SSR environment).');
      return false;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[VoicePipelineManager] SpeechRecognition API not supported on this browser.');
      this.setSTTState('ERROR');
      return false;
    }

    // Clean up any lingering or stale recognition instance before starting fresh
    this.cleanupRecognitionInstance();

    this.setSTTState('STARTING');
    this.currentSessionId = `vsession_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.dispatchedResultIndices.clear();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = this.config.continuous;
      recognition.interimResults = this.config.interimResults;
      recognition.lang = this.config.language;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        this.setSTTState('LISTENING');
        globalVoicePipelineGuard.setListeningState(true);
        console.info(`[VoicePipelineManager] STT session started: ${this.currentSessionId} (lang: ${this.config.language})`);
      };

      recognition.onresult = (event: any) => {
        this.handleRecognitionResult(event);
      };

      recognition.onerror = (event: any) => {
        const errorType = event.error;
        console.warn(`[VoicePipelineManager] STT error: ${errorType} (session: ${this.currentSessionId})`);

        if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
          this.continuousListeningWanted = false;
          this.setSTTState('ERROR');
          globalVoicePipelineGuard.setListeningState(false);
        } else if (errorType === 'aborted') {
          // Normal during teardown or restart
          if (this.sttState !== 'STARTING') {
            this.setSTTState('STOPPED');
          }
        } else {
          // Transient network or no-speech error
          if (this.continuousListeningWanted && !this.isTTSActive) {
            // Self-recover after transient error
            setTimeout(() => {
              if (this.continuousListeningWanted && this.sttState !== 'LISTENING' && !this.isTTSActive) {
                this.startListening().catch(() => {});
              }
            }, 500);
          } else {
            this.setSTTState('STOPPED');
            globalVoicePipelineGuard.setListeningState(false);
          }
        }
      };

      recognition.onend = () => {
        console.info(`[VoicePipelineManager] STT onend (session: ${this.currentSessionId})`);
        
        // If continuous listening is desired and not in middle of TTS, auto-reconnect
        if (this.continuousListeningWanted && !this.isTTSActive && this.sttState !== 'STOPPING') {
          this.setSTTState('STARTING');
          setTimeout(() => {
            if (this.continuousListeningWanted && !this.isTTSActive) {
              try {
                recognition.start();
              } catch (e) {
                // If start fails, re-initialize completely
                this.startListening().catch(() => {});
              }
            }
          }, 150);
        } else {
          this.setSTTState('STOPPED');
          globalVoicePipelineGuard.setListeningState(false);
        }
      };

      this.recognition = recognition;
      globalVoicePipelineGuard.bindRecognition(recognition);
      recognition.start();
      return true;
    } catch (err: any) {
      console.warn('[VoicePipelineManager] Failed to start SpeechRecognition:', err);
      this.cleanupRecognitionInstance();
      this.setSTTState('ERROR');
      globalVoicePipelineGuard.setListeningState(false);
      return false;
    }
  }

  public stopListening(): void {
    this.continuousListeningWanted = false;

    if (this.sttState === 'STOPPED' || this.sttState === 'STOPPING') {
      return;
    }

    this.setSTTState('STOPPING');
    this.cleanupRecognitionInstance();
    this.setSTTState('STOPPED');
    globalVoicePipelineGuard.setListeningState(false);
    console.info(`[VoicePipelineManager] STT session stopped: ${this.currentSessionId}`);
  }

  public toggleListening(): void {
    if (this.sttState === 'LISTENING' || this.sttState === 'STARTING') {
      this.stopListening();
    } else {
      this.startListening().catch((e) => {
        console.warn('[VoicePipelineManager] toggleListening error:', e);
      });
    }
  }

  private restartListeningInternal(): void {
    this.cleanupRecognitionInstance();
    this.setSTTState('STOPPED');
    this.startListening().catch((e) => {
      console.warn('[VoicePipelineManager] restart error:', e);
    });
  }

  private cleanupRecognitionInstance(): void {
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (err) {
        // Safe ignore
      }
      this.recognition = null;
    }
    this.dispatchedResultIndices.clear();
  }

  public teardown(): void {
    this.continuousListeningWanted = false;
    this.cleanupRecognitionInstance();
    this.setSTTState('STOPPED');
    this.commandHandlers.clear();
    this.transcriptHandlers.clear();
    this.stateHandlers.clear();
    this.bargeInHandlers.clear();
    globalVoicePipelineGuard.teardownRecognition();
    console.info('[VoicePipelineManager] Full teardown completed.');
  }

  // --------------------------------------------------------------------------
  // Result Index-Aware Speech Processing
  // --------------------------------------------------------------------------

  private handleRecognitionResult(event: any): void {
    if (!event || !event.results) return;

    let fullTranscript = '';
    let hasInterim = false;
    const now = Date.now();

    // 1. Process all results in the cumulative results array
    for (let i = 0; i < event.results.length; i++) {
      const item = event.results[i];
      if (!item || !item[0]) continue;

      const chunkText = item[0].transcript || '';
      fullTranscript += chunkText;

      if (!item.isFinal) {
        hasInterim = true;
      }
    }

    const trimmedFull = fullTranscript.trim();
    if (!trimmedFull) return;

    // 2. Notify transcript listeners for live UI captioning / orb reactivity
    this.transcriptHandlers.forEach((handler) => {
      try {
        handler(trimmedFull, !hasInterim);
      } catch (e) {
        console.warn('[VoicePipelineManager] Transcript handler error:', e);
      }
    });

    // 3. Barge-In Interruption Check
    // Words like "stop", "ruk jao", "cancel" must trigger barge-in even while speaking or thinking
    const lowerTrimmed = trimmedFull.toLowerCase();
    const isBargeInKeyword = BARGE_IN_PHRASES.some((phrase) => lowerTrimmed.includes(phrase));

    if (isBargeInKeyword && (this.isTTSActive || globalVoicePipelineGuard.getState().isBusy)) {
      console.info(`[VoicePipelineManager] BARGE-IN KEYWORD DETECTED: "${trimmedFull}". Triggering immediate interruption.`);
      this.triggerBargeIn();
      return;
    }

    // 4. TTS Echo & Self-Listening Suppression:
    // If JARVIS is currently speaking or in the acoustic tail window, ignore incoming speech
    // that is NOT a barge-in keyword to prevent JARVIS from listening to and answering itself.
    const inEchoWindow = this.isTTSActive || (now - this.lastTTSEndTimestamp < this.config.echoTailMs);
    if (inEchoWindow) {
      if (!isBargeInKeyword) {
        console.info(
          `[VoicePipelineManager] ECHO SUPPRESSED: Ignored speech during TTS playback/tail: "${trimmedFull}" | session: ${this.currentSessionId}`
        );
        return;
      }
    }

    // 5. Wake Phrase Detection
    let isWakeWordDetected = false;
    for (const wakePhrase of WAKE_PHRASES) {
      if (lowerTrimmed.includes(wakePhrase)) {
        isWakeWordDetected = true;
        break;
      }
    }

    if (isWakeWordDetected) {
      globalVoicePipelineGuard.setPhase('WAKE_WORD_DETECTED');
    }

    // 6. Inspect segments to identify newly finalized, undispatched utterances
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const resultItem = event.results[i];
      if (!resultItem || !resultItem[0]) continue;

      if (resultItem.isFinal) {
        // Prevent duplicate processing of the same result index!
        // In Web Speech API (Chromium), multiple onresult events often fire within 50ms
        // containing the same finalized result index.
        if (this.dispatchedResultIndices.has(i)) {
          // Already dispatched this exact STT result index
          continue;
        }

        const segmentText = resultItem[0].transcript.trim();
        if (segmentText.length < 2) continue;

        // Strip wake phrase if present to extract pure user query
        const cleanQuery = segmentText
          .replace(/hey jarvis|wake up jarvis|hey mursal|hello jarvis|jarvis/gi, '')
          .trim();

        // If the user ONLY said the wake word (e.g. "Hey JARVIS"), keep in WAKE_WORD_DETECTED standby
        if (!cleanQuery || cleanQuery.length < 2) {
          if (isWakeWordDetected) {
            console.info(`[VoicePipelineManager] Wake phrase acknowledged. Listening for follow-up command...`);
            this.dispatchedResultIndices.add(i);
          }
          continue;
        }

        const normalizedQuery = cleanQuery
          .toLowerCase()
          .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Session-based deduplication check:
        // Ignore transcripts identical to the previous 'final' transcript if they arrive within 200ms window
        const lastFinalInSession = this.lastFinalTranscriptBySession.get(this.currentSessionId);
        if (lastFinalInSession) {
          const elapsedSinceLastFinal = now - lastFinalInSession.timestamp;
          const isIdentical =
            lastFinalInSession.cleanQuery.toLowerCase() === cleanQuery.toLowerCase() ||
            lastFinalInSession.normalizedQuery === normalizedQuery ||
            lastFinalInSession.transcript.toLowerCase().trim() === segmentText.toLowerCase().trim();

          if (elapsedSinceLastFinal < this.sessionDeduplicationWindowMs && isIdentical) {
            console.info(
              `[VoicePipelineManager] SESSION DEDUPLICATION: Ignored transcript "${cleanQuery}" identical to previous final transcript within ${elapsedSinceLastFinal}ms (<${this.sessionDeduplicationWindowMs}ms window) | session: ${this.currentSessionId}`
            );
            this.dispatchedResultIndices.add(i);
            continue;
          }
        }

        // Record this final transcript for the session
        this.lastFinalTranscriptBySession.set(this.currentSessionId, {
          transcript: segmentText,
          cleanQuery,
          normalizedQuery,
          timestamp: now,
        });

        // Periodic pruning of stale session records (>60s)
        if (this.lastFinalTranscriptBySession.size > 100) {
          for (const [sId, entry] of this.lastFinalTranscriptBySession.entries()) {
            if (now - entry.timestamp > 60000) {
              this.lastFinalTranscriptBySession.delete(sId);
            }
          }
        }

        // Mark this result index as finalized and dispatched
        this.dispatchedResultIndices.add(i);
        this.lastDispatchedQuery = cleanQuery;
        this.lastDispatchedTimestamp = now;

        // Context-aware execution lock request
        const context: VoiceCommandContext = {
          sessionId: this.currentSessionId,
          source: 'stt',
          status: 'final',
          resultIndex: i,
          timestamp: now,
        };

        const token = globalVoicePipelineGuard.acquireExecution(cleanQuery, context);
        if (token) {
          console.info(
            `[VoicePipelineManager] DISPATCHING COMMAND: "${cleanQuery}" (execId: ${token.executionId}, session: ${this.currentSessionId})`
          );
          this.commandHandlers.forEach((handler) => {
            try {
              handler(cleanQuery, token);
            } catch (err) {
              console.warn('[VoicePipelineManager] Command handler error:', err);
            }
          });
        }
      }
    }
  }

  private triggerBargeIn(): void {
    this.bargeInHandlers.forEach((handler) => {
      try {
        handler();
      } catch (e) {
        console.warn('[VoicePipelineManager] Barge-in handler error:', e);
      }
    });
    globalVoicePipelineGuard.setVoiceState('INTERRUPTED');
  }

  private setSTTState(state: STTState): void {
    if (this.sttState === state) return;
    this.sttState = state;
    const isListening = state === 'LISTENING';
    this.stateHandlers.forEach((handler) => {
      try {
        handler(state, isListening);
      } catch (e) {
        console.warn('[VoicePipelineManager] State handler error:', e);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Subscriptions with Guaranteed Cleanups
  // --------------------------------------------------------------------------

  public onCommand(handler: CommandDispatchHandler): () => void {
    this.commandHandlers.add(handler);
    return () => {
      this.commandHandlers.delete(handler);
    };
  }

  public onTranscript(handler: TranscriptChangeHandler): () => void {
    this.transcriptHandlers.add(handler);
    return () => {
      this.transcriptHandlers.delete(handler);
    };
  }

  public onState(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.sttState, this.sttState === 'LISTENING');
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  public onBargeIn(handler: () => void): () => void {
    this.bargeInHandlers.add(handler);
    return () => {
      this.bargeInHandlers.delete(handler);
    };
  }

  /**
   * Attaches microphone and voice pipeline event listeners strictly ONCE per React lifecycle.
   * Ensures duplicate listener attachment is prevented across renders or StrictMode remounts.
   * Returns a cleanup function that safely detaches all listeners upon component unmount.
   */
  public attachReactLifecycle(subscriptions: {
    onCommand?: CommandDispatchHandler;
    onTranscript?: TranscriptChangeHandler;
    onState?: StateChangeHandler;
    onBargeIn?: () => void;
  }): () => void {
    if (this.isReactLifecycleAttached) {
      console.warn('[VoicePipelineManager] attachReactLifecycle: Listeners already attached in current React lifecycle. Re-binding cleanly.');
      this.detachReactLifecycle();
    }

    this.isReactLifecycleAttached = true;
    const cleanups: Array<() => void> = [];

    if (subscriptions.onCommand) {
      cleanups.push(this.onCommand(subscriptions.onCommand));
    }
    if (subscriptions.onTranscript) {
      cleanups.push(this.onTranscript(subscriptions.onTranscript));
    }
    if (subscriptions.onState) {
      cleanups.push(this.onState(subscriptions.onState));
    }
    if (subscriptions.onBargeIn) {
      cleanups.push(this.onBargeIn(subscriptions.onBargeIn));
    }

    this.lifecycleCleanupFns = cleanups;

    return () => {
      this.detachReactLifecycle();
    };
  }

  public detachReactLifecycle(): void {
    this.lifecycleCleanupFns.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('[VoicePipelineManager] Error during lifecycle cleanup:', err);
      }
    });
    this.lifecycleCleanupFns = [];
    this.isReactLifecycleAttached = false;
  }

  public getIsReactLifecycleAttached(): boolean {
    return this.isReactLifecycleAttached;
  }

  public setSessionDeduplicationWindowMs(ms: number): void {
    this.sessionDeduplicationWindowMs = ms;
  }

  public getSessionDeduplicationWindowMs(): number {
    return this.sessionDeduplicationWindowMs;
  }

  public clearSessionDeduplication(sessionId?: string): void {
    if (sessionId) {
      this.lastFinalTranscriptBySession.delete(sessionId);
    } else {
      this.lastFinalTranscriptBySession.clear();
    }
  }
}

export const globalVoicePipelineManager = new VoicePipelineManager();

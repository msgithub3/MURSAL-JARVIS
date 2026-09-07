/**
 * MURSAL JARVIS — Multi-Tier TTS Provider Architecture
 * 
 * Supports:
 * - Primary Web Speech API (Client-side SpeechSynthesis)
 * - Secondary / Fallback Local Synthesis
 * - Integration with SpeechNormalizer for MursalCart pronunciation and dictionary
 * - Automatic barge-in interruption
 * - Voice state machine synchronization
 */

import { globalSpeechNormalizer } from './speechNormalizer';
import { globalVoicePipelineGuard } from './voicePipelineGuard';
import { globalVoicePipelineManager } from './voicePipelineManager';
import { VoiceProfile } from '../types';

/**
 * Pronunciation dictionary override configuration for TTS engines.
 * Maps brand names and technical terms to phonetic representations ensuring
 * natural, continuous acoustic delivery without awkward pauses or letter-by-letter spelling.
 */
export interface PronunciationOverride {
  target: string;
  phoneticRepresentation: string;
  description: string;
}

/**
 * Canonical Pronunciation Dictionary Overrides for TTS
 * Maps 'MursalCart' to a phonetic representation ('Mursal-Cart') ensuring it is read as a single brand name.
 */
export const DEFAULT_PRONUNCIATION_OVERRIDES: Record<string, string> = {
  // Maps 'MursalCart' to a phonetic representation ensuring it is read as a single brand name
  MursalCart: 'Mursal-Cart',
};

export const PRONUNCIATION_DICTIONARY: Record<string, string> = {
  MursalCart: 'Mursal-Cart',
};

export interface TTSConfig {
  profile: VoiceProfile;
  language: string;
  speed: number;
  pitch: number;
  volume: number;
}

export class TTSProvider {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;
  private onEndCallbacks: Set<() => void> = new Set();
  private onErrorCallbacks: Set<(error: any) => void> = new Set();

  // Streaming session state
  private activeStreamingSessionId: string | null = null;
  private streamingStartTime: number = 0;
  private firstAudioLatencyMs: number | null = null;
  private streamingConfig: Partial<TTSConfig> = {};
  private streamingUserQuery: string | undefined = undefined;
  private pendingUtteranceCount: number = 0;
  private isStreamingFinished: boolean = false;
  private streamResolveFn: ((val: boolean) => void) | null = null;

  // Pronunciation dictionary override map
  private pronunciationOverrides: Map<string, string> = new Map([
    ['MursalCart', 'Mursal-Cart'],
  ]);

  public getSpeechSynthesis(): SpeechSynthesis | null {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return window.speechSynthesis;
    }
    return null;
  }

  /**
   * Retrieves measured Time To First Audio (TTFA) in milliseconds for the last utterance/stream
   */
  public getFirstAudioLatencyMs(): number | null {
    return this.firstAudioLatencyMs;
  }

  /**
   * Starts a streaming TTS session for instant sentence-by-sentence audio delivery
   */
  public startStreamingSession(
    config: Partial<TTSConfig> = {},
    userQuery?: string
  ): string {
    this.cancel();
    const sessionId = `tts_stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.activeStreamingSessionId = sessionId;
    this.streamingStartTime = Date.now();
    this.firstAudioLatencyMs = null;
    this.streamingConfig = config;
    this.streamingUserQuery = userQuery;
    this.pendingUtteranceCount = 0;
    this.isStreamingFinished = false;
    this.streamResolveFn = null;

    globalVoicePipelineGuard.setVoiceState('PREPARING_SPEECH');
    return sessionId;
  }

  /**
   * Enqueues an individual sentence or phrase chunk into the browser SpeechSynthesis queue.
   * Begins speaking the first chunk immediately upon arrival.
   */
  public enqueueChunk(
    sessionId: string,
    rawChunk: string,
    isFinal: boolean = false
  ): void {
    if (this.activeStreamingSessionId !== sessionId) return;

    const synth = this.getSpeechSynthesis();
    if (!synth) return;

    let normalizedText = globalSpeechNormalizer.normalizeForSpeech(rawChunk, this.streamingUserQuery);
    if (!normalizedText) return;
    normalizedText = this.applyPronunciationOverrides(normalizedText);

    try {
      const utterance = new SpeechSynthesisUtterance(normalizedText);
      this.currentUtterance = utterance;

      const pitchMap: Record<VoiceProfile, number> = {
        classic: 1.0,
        calm: 0.92,
        friendly: 1.05,
        professional: 0.98,
        energetic: 1.12,
        deep: 0.82,
      };
      const rateMap: Record<VoiceProfile, number> = {
        classic: 1.05,
        calm: 0.95,
        friendly: 1.1,
        professional: 1.15,
        energetic: 1.2,
        deep: 0.98,
      };

      const profile = this.streamingConfig.profile || 'friendly';
      utterance.pitch = this.streamingConfig.pitch ?? (pitchMap[profile] || 1.05);
      utterance.rate = this.streamingConfig.speed ?? (rateMap[profile] || 1.1);
      utterance.volume = this.streamingConfig.volume ?? 1.0;

      const lang = this.streamingConfig.language || 'ur-Roman';
      if (lang === 'ur' || lang === 'ur-Roman') {
        utterance.lang = 'ur-PK';
      } else {
        utterance.lang = 'en-US';
      }

      this.pendingUtteranceCount++;

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (this.firstAudioLatencyMs === null) {
          this.firstAudioLatencyMs = Date.now() - this.streamingStartTime;
          console.info(`[InstantReply][TTS] TTFA: ${this.firstAudioLatencyMs}ms`);
        }
        globalVoicePipelineManager.notifyTTSStart(normalizedText);
        globalVoicePipelineGuard.setVoiceState('SPEAKING');
      };

      utterance.onend = () => {
        this.pendingUtteranceCount--;
        if (this.pendingUtteranceCount <= 0 && this.isStreamingFinished) {
          this.isSpeaking = false;
          this.currentUtterance = null;
          this.activeStreamingSessionId = null;
          globalVoicePipelineManager.notifyTTSEnd();
          globalVoicePipelineGuard.setVoiceState('COMPLETED');
          globalVoicePipelineGuard.setVoiceState('IDLE');
          this.onEndCallbacks.forEach((cb) => cb());
          if (this.streamResolveFn) {
            this.streamResolveFn(true);
            this.streamResolveFn = null;
          }
        }
      };

      utterance.onerror = (e) => {
        this.pendingUtteranceCount--;
        if (e.error === 'interrupted' || e.error === 'canceled') {
          globalVoicePipelineGuard.setVoiceState('INTERRUPTED');
        } else {
          console.warn('[TTSProvider] Utterance error:', e);
          globalVoicePipelineGuard.setVoiceState('ERROR');
        }
        if (this.pendingUtteranceCount <= 0) {
          this.isSpeaking = false;
          this.currentUtterance = null;
          this.activeStreamingSessionId = null;
          globalVoicePipelineManager.notifyTTSEnd();
          globalVoicePipelineGuard.setVoiceState('IDLE');
          if (this.streamResolveFn) {
            this.streamResolveFn(false);
            this.streamResolveFn = null;
          }
        }
      };

      synth.speak(utterance);
    } catch (err) {
      console.warn('[TTSProvider] Failed to enqueue streaming utterance:', err);
    }
  }

  /**
   * Marks the streaming session as completed, resolving when all queued audio finishes.
   */
  public finishStreamingSession(sessionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.activeStreamingSessionId !== sessionId) {
        resolve(true);
        return;
      }
      this.isStreamingFinished = true;
      if (this.pendingUtteranceCount <= 0) {
        this.isSpeaking = false;
        this.activeStreamingSessionId = null;
        globalVoicePipelineManager.notifyTTSEnd();
        globalVoicePipelineGuard.setVoiceState('COMPLETED');
        globalVoicePipelineGuard.setVoiceState('IDLE');
        resolve(true);
      } else {
        this.streamResolveFn = resolve;
      }
    });
  }

  /**
   * Retrieves the current pronunciation dictionary overrides
   */
  public getPronunciationOverrides(): Record<string, string> {
    const overrides: Record<string, string> = {};
    this.pronunciationOverrides.forEach((phonetic, target) => {
      overrides[target] = phonetic;
    });
    return overrides;
  }

  /**
   * Sets or updates a pronunciation dictionary override
   */
  public setPronunciationOverride(target: string, phoneticRepresentation: string): void {
    this.pronunciationOverrides.set(target, phoneticRepresentation);
  }

  /**
   * Applies pronunciation dictionary overrides to text prior to SpeechSynthesis.
   * Maps 'MursalCart' to a phonetic representation ensuring it is read as a single brand name.
   */
  public applyPronunciationOverrides(text: string): string {
    if (!text) return text;
    let output = text;

    this.pronunciationOverrides.forEach((phonetic, target) => {
      const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedTarget}\\b`, 'g');
      output = output.replace(regex, phonetic);
    });

    return output;
  }

  /**
   * Speaks text after passing it through SpeechNormalizer and Pronunciation Dictionary Overrides.
   * Cancels any currently active speech (barge-in).
   */
  public speak(
    rawText: string,
    config: Partial<TTSConfig> = {},
    userQuery?: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const synth = this.getSpeechSynthesis();
      if (!synth) {
        console.warn('[TTSProvider] SpeechSynthesis not supported in this environment.');
        globalVoicePipelineGuard.setVoiceState('IDLE');
        resolve(false);
        return;
      }

      // 1. Normalize text and apply speech normalizer dictionary
      let normalizedText = globalSpeechNormalizer.normalizeForSpeech(rawText, userQuery);
      if (!normalizedText) {
        globalVoicePipelineGuard.setVoiceState('IDLE');
        resolve(true);
        return;
      }

      // 2. Apply pronunciation dictionary overrides (e.g. MursalCart -> Mursal-Cart phonetic representation)
      normalizedText = this.applyPronunciationOverrides(normalizedText);

      // 2. Interrupt any ongoing speech (barge-in)
      this.cancel();

      // 3. Update Voice State Machine
      globalVoicePipelineGuard.setVoiceState('PREPARING_SPEECH');

      try {
        const utterance = new SpeechSynthesisUtterance(normalizedText);
        this.currentUtterance = utterance;

        // Apply voice parameters
        const pitchMap: Record<VoiceProfile, number> = {
          classic: 1.0,
          calm: 0.92,
          friendly: 1.05,
          professional: 0.98,
          energetic: 1.12,
          deep: 0.82,
        };
        const rateMap: Record<VoiceProfile, number> = {
          classic: 1.05,
          calm: 0.95,
          friendly: 1.1,
          professional: 1.15,
          energetic: 1.2,
          deep: 0.98,
        };

        const profile = config.profile || 'friendly';
        utterance.pitch = config.pitch ?? (pitchMap[profile] || 1.05);
        utterance.rate = config.speed ?? (rateMap[profile] || 1.1);
        utterance.volume = config.volume ?? 1.0;

        const lang = config.language || 'ur-Roman';
        if (lang === 'ur' || lang === 'ur-Roman') {
          utterance.lang = 'ur-PK';
        } else {
          utterance.lang = 'en-US';
        }

        utterance.onstart = () => {
          this.isSpeaking = true;
          globalVoicePipelineManager.notifyTTSStart(normalizedText);
          globalVoicePipelineGuard.setVoiceState('SPEAKING');
          console.info(`[JARVIS][TTS] SPEAKING: "${normalizedText.substring(0, 45)}..."`);
        };

        utterance.onend = () => {
          this.isSpeaking = false;
          this.currentUtterance = null;
          globalVoicePipelineManager.notifyTTSEnd();
          globalVoicePipelineGuard.setVoiceState('COMPLETED');
          globalVoicePipelineGuard.setVoiceState('IDLE');
          this.onEndCallbacks.forEach((cb) => cb());
          resolve(true);
        };

        utterance.onerror = (e) => {
          this.isSpeaking = false;
          this.currentUtterance = null;
          globalVoicePipelineManager.notifyTTSEnd();
          // Interrupted is not a fatal failure
          if (e.error === 'interrupted' || e.error === 'canceled') {
            globalVoicePipelineGuard.setVoiceState('INTERRUPTED');
          } else {
            console.warn('[TTSProvider] Speech error:', e);
            globalVoicePipelineGuard.setVoiceState('ERROR');
          }
          globalVoicePipelineGuard.setVoiceState('IDLE');
          this.onErrorCallbacks.forEach((cb) => cb(e));
          resolve(false);
        };

        synth.speak(utterance);
      } catch (err) {
        console.warn('[TTSProvider] Failed to initiate utterance:', err);
        this.isSpeaking = false;
        globalVoicePipelineManager.notifyTTSEnd();
        globalVoicePipelineGuard.setVoiceState('IDLE');
        resolve(false);
      }
    });
  }

  /**
   * Stops current playback immediately and resets active streaming session
   */
  public cancel(): void {
    const synth = this.getSpeechSynthesis();
    if (synth && (this.isSpeaking || synth.speaking || synth.pending)) {
      try {
        synth.cancel();
      } catch (_) {}
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.activeStreamingSessionId = null;
    this.pendingUtteranceCount = 0;
    this.isStreamingFinished = false;
    if (this.streamResolveFn) {
      this.streamResolveFn(false);
      this.streamResolveFn = null;
    }
    globalVoicePipelineManager.notifyTTSEnd();
  }

  public getSpeaking(): boolean {
    const synth = this.getSpeechSynthesis();
    return Boolean(this.isSpeaking || (synth && synth.speaking));
  }
}

export const globalTTSProvider = new TTSProvider();

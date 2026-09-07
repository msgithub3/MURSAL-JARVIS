/**
 * MURSAL JARVIS — Instant Reply & Low-Latency Engine
 * 
 * Core Subsystems:
 * 1. Mode Classifier: FAST_MODE vs DEEP_MODE
 * 2. Deterministic Command Bypass: zero-LLM local execution for common commands (<5ms)
 * 3. Safe In-Memory Response Cache: short TTL (5-10s) for safe, read-only status queries
 * 4. Streaming Sentence Chunker: breaks token streams into immediate TTS-ready sentence chunks
 * 5. Priority Dispatcher: P0 (Voice/Instant) preempts P2/P3/P4 background work
 * 6. Instant Acknowledgement Generator: immediate verbal ack ("Ji.", "Kar raha hoon.")
 * 7. Offline Instant Command Engine: local device actions and queries when offline
 */

export type ReplyMode = 'FAST' | 'DEEP';

export interface DeterministicCommandMatch {
  actionType: string;
  isAction: boolean; // true if modifies state (needs ack + execution), false if read-only
  params: Record<string, any>;
  ackPhrase: {
    urRoman: string;
    en: string;
  };
  cacheKey?: string;
  cacheTtlMs?: number;
}

export interface CachedResponse {
  data: any;
  replyText: string;
  cachedAt: number;
  ttlMs: number;
}

/**
 * Classifies whether a user prompt requires FAST_MODE or DEEP_MODE
 */
export function classifyQueryMode(
  query: string,
  explicitMode?: 'FAST' | 'DEEP' | 'AUTO',
  hasImage?: boolean
): ReplyMode {
  if (explicitMode === 'FAST' || explicitMode === 'DEEP') {
    return explicitMode;
  }

  // Multimodal image queries default to DEEP for full visual inspection
  if (hasImage) {
    return 'DEEP';
  }

  const normalized = query.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  // Deep reasoning keywords
  const deepReasoningPatterns = [
    /\b(code|coding|function|refactor|debug|audit|architecture|algorithm)\b/i,
    /\b(research|analyze|analysis|investigate|evaluate|breakdown|deep dive)\b/i,
    /\b(explain in detail|step by step|comprehensive|essay|summarize document)\b/i,
    /\b(mursalcart profit|margin calculator|dropshipping supplier|cod return risk)\b/i,
    /\b(screen intelligence query|analyze my screen|read this page)\b/i,
  ];

  for (const pattern of deepReasoningPatterns) {
    if (pattern.test(normalized)) {
      return 'DEEP';
    }
  }

  // Long queries (> 25 words) typically require structured reasoning
  if (wordCount > 25) {
    return 'DEEP';
  }

  // Otherwise, default to FAST MODE for immediate response
  return 'FAST';
}

/**
 * Detects if a command is deterministic and can bypass LLM inference completely
 */
export function matchDeterministicCommand(rawQuery: string): DeterministicCommandMatch | null {
  const query = rawQuery.trim().toLowerCase();

  // 1. Battery queries (Read-only, cacheable 5s)
  if (/(battery|charge|charging|kitna charge|percentage|battery kitni hai|check battery)/i.test(query)) {
    return {
      actionType: 'get_battery',
      isAction: false,
      params: {},
      ackPhrase: { urRoman: 'Ji, check karta hoon.', en: 'Checking battery level.' },
      cacheKey: 'device_battery',
      cacheTtlMs: 5000,
    };
  }

  // 2. Wi-Fi control (Action)
  if (/(wifi|wi-fi|internet)\s*(on|chala|connect)/i.test(query) || /(turn on|enable|connect)\s*(wifi|wi-fi|internet)/i.test(query)) {
    return {
      actionType: 'control_wifi',
      isAction: true,
      params: { state: true },
      ackPhrase: { urRoman: 'Ji, Wi-Fi on kar raha hoon.', en: 'Enabling Wi-Fi.' },
    };
  }
  if (/(wifi|wi-fi|internet)\s*(off|band|disconnect)/i.test(query) || /(turn off|disable|disconnect)\s*(wifi|wi-fi|internet)/i.test(query)) {
    return {
      actionType: 'control_wifi',
      isAction: true,
      params: { state: false },
      ackPhrase: { urRoman: 'Ji, Wi-Fi off kar raha hoon.', en: 'Disabling Wi-Fi.' },
    };
  }

  // 3. Bluetooth control (Action)
  if (/(bluetooth|bt)\s*(on|chala|connect)/i.test(query) || /(turn on|enable)\s*(bluetooth|bt)/i.test(query)) {
    return {
      actionType: 'control_bluetooth',
      isAction: true,
      params: { state: true },
      ackPhrase: { urRoman: 'Ji, Bluetooth on kar raha hoon.', en: 'Enabling Bluetooth.' },
    };
  }
  if (/(bluetooth|bt)\s*(off|band|disconnect)/i.test(query) || /(turn off|disable)\s*(bluetooth|bt)/i.test(query)) {
    return {
      actionType: 'control_bluetooth',
      isAction: true,
      params: { state: false },
      ackPhrase: { urRoman: 'Ji, Bluetooth off kar raha hoon.', en: 'Disabling Bluetooth.' },
    };
  }

  // 4. Flashlight control (Action)
  if (/(flashlight|torch|light)\s*(on|chala|jala)/i.test(query) || /(turn on)\s*(flashlight|torch|light)/i.test(query)) {
    return {
      actionType: 'control_flashlight',
      isAction: true,
      params: { state: 'on' },
      ackPhrase: { urRoman: 'Ji, flashlight jala raha hoon.', en: 'Turning on flashlight.' },
    };
  }
  if (/(flashlight|torch|light)\s*(off|band|bujha)/i.test(query) || /(turn off)\s*(flashlight|torch|light)/i.test(query)) {
    return {
      actionType: 'control_flashlight',
      isAction: true,
      params: { state: 'off' },
      ackPhrase: { urRoman: 'Ji, flashlight band kar raha hoon.', en: 'Turning off flashlight.' },
    };
  }

  // 5. Volume control (Action)
  if (/(volume|awaz|awaaz|sound)\s*(barhao|up|zyada|increase|raise)/i.test(query) || /(volume up|increase volume)/i.test(query)) {
    return {
      actionType: 'set_volume',
      isAction: true,
      params: { delta: 15, level: 85 },
      ackPhrase: { urRoman: 'Ji, volume barha raha hoon.', en: 'Increasing volume.' },
    };
  }
  if (/(volume|awaz|awaaz|sound)\s*(kam|down|ghatao|decrease|lower|slow)/i.test(query) || /(volume down|decrease volume)/i.test(query)) {
    return {
      actionType: 'set_volume',
      isAction: true,
      params: { delta: -15, level: 35 },
      ackPhrase: { urRoman: 'Ji, volume kam kar raha hoon.', en: 'Lowering volume.' },
    };
  }
  const volumeMatch = query.match(/(?:volume|sound|awaz)\s*(?:set\s*)?(?:to\s*)?(\d{1,3})/i);
  if (volumeMatch) {
    const level = Math.min(100, Math.max(0, parseInt(volumeMatch[1], 10)));
    return {
      actionType: 'set_volume',
      isAction: true,
      params: { level },
      ackPhrase: { urRoman: `Ji, volume ${level}% par set kar raha hoon.`, en: `Setting volume to ${level}%.` },
    };
  }

  // 6. Screen lock (Action)
  if (/(screen|phone|device)\s*(lock|band)\s*(karo)?/i.test(query) || /(lock)\s*(screen|phone|device)/i.test(query)) {
    return {
      actionType: 'lock_device',
      isAction: true,
      params: {},
      ackPhrase: { urRoman: 'Ji, screen lock kar raha hoon.', en: 'Locking screen.' },
    };
  }

  // 7. System status (Read-only, cacheable 5s)
  if (/(jarvis status|system status|health check|status kya hai|sab theek hai|diagnostics)/i.test(query)) {
    return {
      actionType: 'get_system_status',
      isAction: false,
      params: {},
      ackPhrase: { urRoman: 'Ji, system status check kar raha hoon.', en: 'Checking system status.' },
      cacheKey: 'system_status',
      cacheTtlMs: 5000,
    };
  }

  // 8. Time & Date (Read-only, fresh)
  if (/(time kya hua|waqt kya hai|what time is it|current time|aaj ka time)/i.test(query)) {
    return {
      actionType: 'get_current_time',
      isAction: false,
      params: {},
      ackPhrase: { urRoman: 'Ji.', en: 'Checking time.' },
    };
  }

  // 9. Anti-Loss Ring Phone (Action)
  if (/(phone|mobile|device)\s*(dhoondo|kahan hai|ring karo|locate)/i.test(query) || /(where is my phone|find my phone|ring phone)/i.test(query)) {
    return {
      actionType: 'ring_device',
      isAction: true,
      params: {},
      ackPhrase: { urRoman: 'Ji, phone par siren chala raha hoon.', en: 'Sounding locator siren.' },
    };
  }

  return null;
}

/**
 * Fast In-Memory Response Cache for safe frequently requested read-only data
 */
export class ResponseCache {
  private cache: Map<string, CachedResponse> = new Map();

  public get(key: string): CachedResponse | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.cachedAt > item.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return item;
  }

  public set(key: string, replyText: string, data: any, ttlMs: number = 5000): void {
    // Defense: Never cache sensitive tokens or personal private actions
    if (key.includes('token') || key.includes('auth') || key.includes('secret')) {
      return;
    }
    this.cache.set(key, {
      data,
      replyText,
      cachedAt: Date.now(),
      ttlMs,
    });
  }

  public invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

export const globalResponseCache = new ResponseCache();

/**
 * Sentence Chunker: Buffers streaming AI tokens and emits speakable sentence chunks immediately.
 * 
 * Ultra-Low Latency Optimization:
 * For the VERY FIRST chunk, it detects early phrase boundaries (e.g. after a comma or colon on 3-5 words),
 * allowing TTS to start immediately while subsequent tokens continue streaming!
 */
export class SentenceChunker {
  private buffer: string = '';
  private sentenceIndex: number = 0;
  private isFirstChunkEmitted: boolean = false;

  /**
   * Adds incoming token chunk and returns any newly completed sentences/phrases
   */
  public addToken(token: string): string[] {
    this.buffer += token;
    const completedSentences: string[] = [];

    while (true) {
      // 1. Early Phrase Boundary check for FIRST chunk to minimize TTFA (< 500ms)
      if (!this.isFirstChunkEmitted) {
        // Look for comma, colon, semicolon or dash after at least 12 characters and 3 words
        const earlyMatch = this.buffer.match(/^([^,;:—–\n]{8,60}[,;:—–\n])\s*/);
        if (earlyMatch) {
          const phrase = earlyMatch[1].trim();
          if (phrase.length > 0) {
            completedSentences.push(phrase);
            this.buffer = this.buffer.substring(earlyMatch[0].length);
            this.isFirstChunkEmitted = true;
            this.sentenceIndex++;
            continue;
          }
        }
      }

      // 2. Standard Sentence Boundaries: [.?!] or Urdu [۔؟] followed by space or newline
      const sentenceMatch = this.buffer.match(/^([^.?!۔؟\n]+[.?!۔؟]+|\n+)\s*/);
      if (sentenceMatch) {
        const sentence = sentenceMatch[1].trim();
        this.buffer = this.buffer.substring(sentenceMatch[0].length);
        if (sentence.length > 0) {
          completedSentences.push(sentence);
          this.isFirstChunkEmitted = true;
          this.sentenceIndex++;
          continue;
        }
      }

      // 3. Length fallback: if buffer exceeds 120 characters without punctuation, break on last space
      if (this.buffer.length > 120) {
        const lastSpaceIdx = this.buffer.lastIndexOf(' ');
        if (lastSpaceIdx > 30) {
          const chunk = this.buffer.substring(0, lastSpaceIdx).trim();
          this.buffer = this.buffer.substring(lastSpaceIdx + 1);
          if (chunk.length > 0) {
            completedSentences.push(chunk);
            this.isFirstChunkEmitted = true;
            this.sentenceIndex++;
            continue;
          }
        }
      }

      break;
    }

    return completedSentences;
  }

  /**
   * Flushes any remaining text in the buffer when the stream completes
   */
  public flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (remaining.length > 0) {
      this.sentenceIndex++;
      return remaining;
    }
    return null;
  }

  public getSentenceIndex(): number {
    return this.sentenceIndex;
  }

  public reset(): void {
    this.buffer = '';
    this.sentenceIndex = 0;
    this.isFirstChunkEmitted = false;
  }
}

/**
 * Priority Task Dispatcher:
 * Ensures P0 (Voice / Instant Reply) commands execute with zero queue delay
 * and preempt background or non-critical tasks.
 */
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export class PriorityDispatcher {
  private activeP0Tasks: number = 0;

  public async runWithPriority<T>(
    priority: TaskPriority,
    taskFn: () => Promise<T>
  ): Promise<T> {
    if (priority === 'P0') {
      this.activeP0Tasks++;
      try {
        // P0 tasks run immediately on the event loop
        return await taskFn();
      } finally {
        this.activeP0Tasks--;
      }
    }

    // If P0 tasks are active, non-P0 tasks yield briefly to clear the event loop
    if (this.activeP0Tasks > 0 && priority !== 'P1') {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return await taskFn();
  }

  public hasActiveP0(): boolean {
    return this.activeP0Tasks > 0;
  }
}

export const globalPriorityDispatcher = new PriorityDispatcher();

/**
 * Instant Verbal Acknowledgement generator
 */
export function getInstantAck(isUrdu: boolean, actionName?: string): string {
  const urAcks = ['Ji.', 'Kar raha hoon.', 'Bilkul.', 'Sahi hai.', 'Ji, abhi karta hoon.'];
  const enAcks = ['Right away.', 'On it.', 'Understood.', 'Executing now.'];
  const list = isUrdu ? urAcks : enAcks;
  return list[Math.floor(Math.random() * list.length)];
}

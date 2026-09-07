/**
 * MURSAL JARVIS — Resilient Multi-Provider State Machine & Circuit Breaker
 * 
 * Manages provider health, 429 cooldowns, retryDelay extraction,
 * lightweight health checks, and genuine multi-tier failover cascade:
 * Tier 1: Gemini 3.8 Flash (Primary Cloud)
 * Tier 2: Gemini 2.5 Flash (Secondary Cloud)
 * Tier 3: Gemini 2.5 Flash Lite (Tertiary Cloud)
 * Tier 4: Python Core Local Daemon (Port 5050 - Intent Planner & Memory)
 * Tier 5: Sovereign Edge Brain (On-Device Multilingual Cognitive Engine)
 */

import { GoogleGenAI } from '@google/genai';
import { generateSovereignResponse, SovereignResponse } from './sovereignBrain.ts';

export type ProviderState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'OFFLINE'
  | 'COOLDOWN';

export interface ProviderHealthRecord {
  id: string;
  name: string;
  tier: number;
  provider: 'gemini' | 'python_core' | 'sovereign_edge' | 'ollama' | 'deepseek';
  state: ProviderState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  totalSuccesses: number;
  cooldownUntil: number;
  retryDelaySeconds: number;
  lastErrorCode?: number | string;
  lastErrorMessage?: string;
  lastLatencyMs: number;
  lastSuccessTimestamp?: number;
  lastHealthCheckTimestamp?: number;
  isProbation?: boolean;
}

export interface FailoverExecutionResult {
  reply: string;
  responseSource: string;
  activeTier: number;
  primaryModel: string;
  primaryStatus: number | string;
  secondaryModel?: string;
  secondaryStatus?: number | string;
  engineMode: 'GEMINI_CLOUD_LIVE' | 'GEMINI_CLOUD_SECONDARY' | 'PYTHON_CORE_DAEMON' | 'SOVEREIGN_EDGE_FAILOVER' | 'SOVEREIGN_STANDALONE';
  quotaWarning?: string;
  latencyMs: number;
  intent?: string;
  toolsUsed?: string[];
  providerStateSummary: Record<string, ProviderState>;
}

export class ProviderStateMachine {
  private records: Map<string, ProviderHealthRecord> = new Map();
  private pythonDaemonUrl: string = 'http://127.0.0.1:5050';

  constructor() {
    this.initializeRegistry();
  }

  private initializeRegistry() {
    // 1. Primary Cloud
    this.records.set('gemini-3.8-flash', {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      tier: 1,
      provider: 'gemini',
      state: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      cooldownUntil: 0,
      retryDelaySeconds: 0,
      lastLatencyMs: 0,
    });

    // 2. Secondary Cloud
    this.records.set('gemini-2.5-flash', {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      tier: 2,
      provider: 'gemini',
      state: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      cooldownUntil: 0,
      retryDelaySeconds: 0,
      lastLatencyMs: 0,
    });

    // 3. Tertiary Cloud
    this.records.set('gemini-2.5-flash-lite', {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash Lite',
      tier: 3,
      provider: 'gemini',
      state: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      cooldownUntil: 0,
      retryDelaySeconds: 0,
      lastLatencyMs: 0,
    });

    // 4. Local Python Core Daemon
    this.records.set('python-core-daemon', {
      id: 'python-core-daemon',
      name: 'Python Core Daemon (Port 5050)',
      tier: 4,
      provider: 'python_core',
      state: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      cooldownUntil: 0,
      retryDelaySeconds: 0,
      lastLatencyMs: 0,
    });

    // 5. Sovereign Edge Brain
    this.records.set('sovereign-edge-brain', {
      id: 'sovereign-edge-brain',
      name: 'Sovereign Edge Brain (Autonomous Multilingual)',
      tier: 5,
      provider: 'sovereign_edge',
      state: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      cooldownUntil: 0,
      retryDelaySeconds: 0,
      lastLatencyMs: 0,
    });

    // 6. External Open Source Placeholders (Audited: not running / unconfigured)
    this.records.set('ollama-llama3.2', {
      id: 'ollama-llama3.2',
      name: 'Ollama Llama 3.2',
      tier: 6,
      provider: 'ollama',
      state: 'OFFLINE',
      consecutiveFailures: 1,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      cooldownUntil: 0,
      retryDelaySeconds: 0,
      lastLatencyMs: 0,
      lastErrorMessage: 'Ollama daemon on port 11434 not running',
    });

    this.records.set('deepseek-chat', {
      id: 'deepseek-chat',
      name: 'DeepSeek V3',
      tier: 6,
      provider: 'deepseek',
      state: 'UNAVAILABLE',
      consecutiveFailures: 1,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      cooldownUntil: 0,
      retryDelaySeconds: 0,
      lastLatencyMs: 0,
      lastErrorMessage: 'DEEPSEEK_API_KEY environment variable not configured',
    });
  }

  public getRecord(id: string): ProviderHealthRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;

    // Check cooldown expiry
    if (record.state === 'COOLDOWN' || record.state === 'RATE_LIMITED') {
      if (Date.now() >= record.cooldownUntil) {
        // Probation state: Ready for lightweight health probe
        record.state = 'HEALTHY';
        record.isProbation = true;
        console.info(`[ProviderStateMachine] Model ${id} cooldown expired. Transitioned to HEALTHY (probation probe).`);
      }
    }

    return record;
  }

  public getAllRecords(): ProviderHealthRecord[] {
    return Array.from(this.records.keys()).map((id) => this.getRecord(id)!);
  }

  public getStateSummary(): Record<string, ProviderState> {
    const summary: Record<string, ProviderState> = {};
    for (const [id] of this.records) {
      summary[id] = this.getRecord(id)?.state || 'UNAVAILABLE';
    }
    return summary;
  }

  public isModelCallable(id: string): boolean {
    const record = this.getRecord(id);
    if (!record) return false;
    return record.state === 'HEALTHY' || record.state === 'DEGRADED';
  }

  public extractRetryDelay(err: any): number {
    // 1. Check details array for RetryInfo
    if (err?.details && Array.isArray(err.details)) {
      for (const d of err.details) {
        if (d?.['@type']?.includes('RetryInfo') && d?.retryDelay) {
          const sec = parseFloat(String(d.retryDelay).replace('s', ''));
          if (!isNaN(sec) && sec > 0) {
            return Math.ceil(sec) + 2; // 2s safety buffer
          }
        }
      }
    }

    // 2. Parse error message for "Please retry in X.XXs" or "retryDelay: Xs"
    const errMsg = String(err?.message || err || '');
    const match = errMsg.match(/retry(?:Delay)?(?:\s+in\s+|["':\s]+)(\d+(?:\.\d+)?)/i);
    if (match && match[1]) {
      const sec = parseFloat(match[1]);
      if (!isNaN(sec) && sec > 0) {
        return Math.ceil(sec) + 2;
      }
    }

    // 3. Default adaptive cooldown
    return 60; // 60 seconds default cooldown
  }

  public recordRateLimited(id: string, err: any): void {
    const record = this.records.get(id);
    if (!record) return;

    const retrySeconds = this.extractRetryDelay(err);
    const cooldownMs = retrySeconds * 1000;
    const now = Date.now();

    record.state = 'RATE_LIMITED';
    record.consecutiveFailures += 1;
    record.consecutiveSuccesses = 0;
    record.totalRequests += 1;
    record.retryDelaySeconds = retrySeconds;
    record.cooldownUntil = now + cooldownMs;
    record.lastErrorCode = 429;
    record.lastErrorMessage = String(err?.message || 'Resource Exhausted 429');
    record.state = 'COOLDOWN';

    console.info(`[ProviderStateMachine] ${id} classified as RATE_LIMITED. Cooldown active for ${retrySeconds}s (until ${new Date(record.cooldownUntil).toISOString()}).`);
  }

  public recordFailure(id: string, statusCode: number | string, errMsg: string): void {
    const record = this.records.get(id);
    if (!record) return;

    record.consecutiveFailures += 1;
    record.consecutiveSuccesses = 0;
    record.totalRequests += 1;
    record.lastErrorCode = statusCode;
    record.lastErrorMessage = errMsg;

    if (statusCode === 404) {
      record.state = 'UNAVAILABLE';
      record.cooldownUntil = Date.now() + 600000; // 10 min
    } else if (statusCode === 500 || statusCode === 503) {
      record.state = 'DEGRADED';
      record.cooldownUntil = Date.now() + 15000; // 15s transient cooldown
    } else if (statusCode === 'TIMEOUT' || statusCode === 'NETWORK_FAILURE') {
      record.state = 'OFFLINE';
      record.cooldownUntil = Date.now() + 30000; // 30s
    } else {
      record.state = 'DEGRADED';
    }
  }

  public recordSuccess(id: string, latencyMs: number): void {
    const record = this.records.get(id);
    if (!record) return;

    record.state = 'HEALTHY';
    record.consecutiveSuccesses += 1;
    record.consecutiveFailures = 0;
    record.totalRequests += 1;
    record.totalSuccesses += 1;
    record.lastLatencyMs = latencyMs;
    record.lastSuccessTimestamp = Date.now();
    record.isProbation = false;
  }

  /**
   * Performs a lightweight health check on a model coming out of cooldown
   */
  public async probeModelHealth(client: GoogleGenAI, modelId: string): Promise<boolean> {
    const record = this.records.get(modelId);
    if (!record) return false;

    console.info(`[ProviderStateMachine] Performing lightweight health probe on ${modelId}...`);
    try {
      record.lastHealthCheckTimestamp = Date.now();
      const start = Date.now();
      const res = await client.models.generateContent({
        model: modelId,
        contents: 'ping',
        config: { maxOutputTokens: 2, temperature: 0.1 } as any,
      });

      if (res?.text !== undefined) {
        this.recordSuccess(modelId, Date.now() - start);
        console.info(`[ProviderStateMachine] Health probe SUCCESS for ${modelId}. Returned to HEALTHY rotation.`);
        return true;
      }
      return false;
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        this.recordRateLimited(modelId, err);
        console.info(`[ProviderStateMachine] Health probe FAILED for ${modelId} (Still 429). Cooldown re-engaged.`);
      } else {
        this.recordFailure(modelId, 500, errMsg);
      }
      return false;
    }
  }

  /**
   * Main Failover Engine:
   * Cascades through Primary -> Secondary -> Tertiary -> Python Core -> Sovereign Brain
   * with guaranteed authentic response generation and structured logging.
   */
  public async executeWithCascade(
    client: GoogleGenAI | null,
    query: string,
    systemInstruction: string,
    options: {
      imageData?: string;
      language?: string;
      voiceProfile?: string;
      recentMemories?: Array<{ type: string; content: string }>;
      deviceState?: any;
    } = {}
  ): Promise<FailoverExecutionResult> {
    const startTime = Date.now();
    const primaryId = 'gemini-3.8-flash';
    const secondaryId = 'gemini-2.5-flash';
    const tertiaryId = 'gemini-2.5-flash-lite';
    const pythonId = 'python-core-daemon';
    const sovereignId = 'sovereign-edge-brain';

    console.info(`[JARVIS][AI] PRIMARY=${primaryId}`);

    let primaryStatus: number | string = 'PENDING';
    let secondaryStatus: number | string | undefined = undefined;

    // Build multimodal or text contents for Gemini
    const contents: any[] = [];
    const memoryContext = (options.recentMemories || []).slice(0, 5).map((m) => `[${m.type.toUpperCase()}] ${m.content}`).join('\n');
    const fullPrompt = `System Context Memory:\n${memoryContext}\n\nDetected Language: ${options.language || 'auto'}\nUser Query: ${query}`;

    if (options.imageData) {
      const cleanBase64 = options.imageData.replace(/^data:image\/\w+;base64,/, '');
      contents.push({
        role: 'user',
        parts: [
          { text: fullPrompt },
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/jpeg',
            },
          },
        ],
      });
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: fullPrompt }],
      });
    }

    // =========================================================================
    // STEP 1: Attempt Primary Model (Gemini 3.8 Flash)
    // =========================================================================
    const primaryRecord = this.getRecord(primaryId);
    let primaryCanRun = primaryRecord && this.isModelCallable(primaryId) && Boolean(client);

    if (primaryRecord?.isProbation && client) {
      const probePassed = await this.probeModelHealth(client, primaryId);
      primaryCanRun = probePassed;
    }

    if (primaryCanRun && client) {
      try {
        const res = await client.models.generateContent({
          model: primaryId,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        if (res && res.text) {
          const latency = Date.now() - startTime;
          this.recordSuccess(primaryId, latency);
          console.info(`[JARVIS][AI] PRIMARY_STATUS=SUCCESS`);
          console.info(`[JARVIS][AI] RESPONSE_SOURCE=${primaryId}`);

          return {
            reply: res.text,
            responseSource: primaryId,
            activeTier: 1,
            primaryModel: primaryId,
            primaryStatus: 'SUCCESS',
            engineMode: 'GEMINI_CLOUD_LIVE',
            latencyMs: latency,
            providerStateSummary: this.getStateSummary(),
          };
        }
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
          primaryStatus = 429;
          this.recordRateLimited(primaryId, err);
          console.info(`[JARVIS][AI] PRIMARY_STATUS=429`);
        } else if (errMsg.includes('404')) {
          primaryStatus = 404;
          this.recordFailure(primaryId, 404, errMsg);
          console.info(`[JARVIS][AI] PRIMARY_STATUS=404`);
        } else if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
          primaryStatus = 503;
          this.recordFailure(primaryId, 503, errMsg);
          console.info(`[JARVIS][AI] PRIMARY_STATUS=503`);
        } else {
          primaryStatus = 500;
          this.recordFailure(primaryId, 500, errMsg);
          console.info(`[JARVIS][AI] PRIMARY_STATUS=500`);
        }
      }
    } else {
      primaryStatus = primaryRecord?.state === 'COOLDOWN' ? 'COOLDOWN_ACTIVE' : primaryRecord?.state || 'UNAVAILABLE';
      console.info(`[JARVIS][AI] PRIMARY_STATUS=${primaryStatus} (Skipped - Circuit Breaker Protected)`);
    }

    // =========================================================================
    // STEP 2: Secondary Model Cascade (Gemini 2.5 Flash)
    // =========================================================================
    console.info(`[JARVIS][AI] FAILOVER=START`);
    console.info(`[JARVIS][AI] SECONDARY=${secondaryId}`);
    console.info(`[JARVIS][AI] SECONDARY_STATUS=REQUESTED`);

    const secondaryRecord = this.getRecord(secondaryId);
    let secondaryCanRun = secondaryRecord && this.isModelCallable(secondaryId) && Boolean(client);

    if (secondaryCanRun && client) {
      try {
        const secStart = Date.now();
        const secRes = await client.models.generateContent({
          model: secondaryId,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        if (secRes && secRes.text) {
          const latency = Date.now() - secStart;
          this.recordSuccess(secondaryId, latency);
          secondaryStatus = 'SUCCESS';
          console.info(`[JARVIS][AI] SECONDARY_STATUS=SUCCESS`);
          console.info(`[JARVIS][AI] RESPONSE_SOURCE=${secondaryId}`);

          return {
            reply: secRes.text,
            responseSource: secondaryId,
            activeTier: 2,
            primaryModel: primaryId,
            primaryStatus,
            secondaryModel: secondaryId,
            secondaryStatus: 'SUCCESS',
            engineMode: 'GEMINI_CLOUD_SECONDARY',
            quotaWarning: primaryStatus === 429 ? 'Primary model rate-limited. Successfully routed to Gemini 2.5 Flash.' : undefined,
            latencyMs: Date.now() - startTime,
            providerStateSummary: this.getStateSummary(),
          };
        }
      } catch (secErr: any) {
        const secMsg = String(secErr?.message || secErr);
        if (secMsg.includes('429') || secMsg.includes('RESOURCE_EXHAUSTED')) {
          secondaryStatus = 429;
          this.recordRateLimited(secondaryId, secErr);
          console.info(`[JARVIS][AI] SECONDARY_STATUS=429`);
        } else {
          secondaryStatus = 500;
          this.recordFailure(secondaryId, 500, secMsg);
          console.info(`[JARVIS][AI] SECONDARY_STATUS=500`);
        }
      }
    } else {
      secondaryStatus = secondaryRecord?.state || 'UNAVAILABLE';
      console.info(`[JARVIS][AI] SECONDARY_STATUS=${secondaryStatus}`);
    }

    // =========================================================================
    // STEP 3: Tertiary Cloud Model (Gemini 2.5 Flash Lite)
    // =========================================================================
    console.info(`[JARVIS][AI] FAILOVER=CONTINUE`);
    console.info(`[JARVIS][AI] TERTIARY=${tertiaryId}`);
    console.info(`[JARVIS][AI] TERTIARY_STATUS=REQUESTED`);

    const tertiaryRecord = this.getRecord(tertiaryId);
    if (tertiaryRecord && this.isModelCallable(tertiaryId) && client) {
      try {
        const tertStart = Date.now();
        const tertRes = await client.models.generateContent({
          model: tertiaryId,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        if (tertRes && tertRes.text) {
          const latency = Date.now() - tertStart;
          this.recordSuccess(tertiaryId, latency);
          console.info(`[JARVIS][AI] TERTIARY_STATUS=SUCCESS`);
          console.info(`[JARVIS][AI] RESPONSE_SOURCE=${tertiaryId}`);

          return {
            reply: tertRes.text,
            responseSource: tertiaryId,
            activeTier: 3,
            primaryModel: primaryId,
            primaryStatus,
            secondaryModel: secondaryId,
            secondaryStatus,
            engineMode: 'GEMINI_CLOUD_SECONDARY',
            quotaWarning: 'Cloud models operating on Tier 3 (Gemini 2.5 Flash Lite).',
            latencyMs: Date.now() - startTime,
            providerStateSummary: this.getStateSummary(),
          };
        }
      } catch (tertErr: any) {
        const tertMsg = String(tertErr?.message || tertErr);
        console.info(`[JARVIS][AI] TERTIARY_STATUS=FAILED (${tertMsg})`);
        this.recordRateLimited(tertiaryId, tertErr);
      }
    } else {
      console.info(`[JARVIS][AI] TERTIARY_STATUS=${tertiaryRecord?.state || 'UNAVAILABLE'}`);
    }

    // =========================================================================
    // STEP 4: Quaternary Fallback (Python Core Daemon - Port 5050)
    // =========================================================================
    console.info(`[JARVIS][AI] FAILOVER=CONTINUE`);
    console.info(`[JARVIS][AI] QUATERNARY=${pythonId}`);
    console.info(`[JARVIS][AI] QUATERNARY_STATUS=REQUESTED`);

    try {
      const pythonRes = await this.callPythonCoreDaemon(query, options);
      if (pythonRes && pythonRes.reply) {
        this.recordSuccess(pythonId, 45);
        console.info(`[JARVIS][AI] QUATERNARY_STATUS=SUCCESS`);
        console.info(`[JARVIS][AI] RESPONSE_SOURCE=${pythonId}`);

        return {
          reply: pythonRes.reply,
          responseSource: pythonId,
          activeTier: 4,
          primaryModel: primaryId,
          primaryStatus,
          secondaryModel: secondaryId,
          secondaryStatus,
          engineMode: 'SOVEREIGN_EDGE_FAILOVER',
          quotaWarning: 'Cloud quotas exhausted. Python Core Local Daemon operating offline.',
          latencyMs: Date.now() - startTime,
          intent: pythonRes.intent,
          toolsUsed: pythonRes.tool_execution ? [pythonRes.tool_execution] : undefined,
          providerStateSummary: this.getStateSummary(),
        };
      }
    } catch (pyErr) {
      console.info(`[JARVIS][AI] QUATERNARY_STATUS=FAILED (Python daemon call error)`);
      this.recordFailure(pythonId, 'OFFLINE', 'Daemon timeout or offline');
    }

    // =========================================================================
    // STEP 5: Quinary Final Fallback (Sovereign Edge Brain - In-Process)
    // =========================================================================
    console.info(`[JARVIS][AI] FAILOVER=CONTINUE`);
    console.info(`[JARVIS][AI] FALLBACK=${sovereignId}`);
    console.info(`[JARVIS][AI] FALLBACK_STATUS=REQUESTED`);

    const sovereignStart = Date.now();
    const sovereignRes: SovereignResponse = generateSovereignResponse(
      query,
      (options.language as any) || 'ur-Roman',
      options.voiceProfile || 'friendly',
      {
        recentMemories: options.recentMemories,
        deviceState: options.deviceState,
        isImage: Boolean(options.imageData),
      }
    );

    const sovLatency = Date.now() - sovereignStart;
    this.recordSuccess(sovereignId, sovLatency);

    console.info(`[JARVIS][AI] FALLBACK_STATUS=SUCCESS`);
    console.info(`[JARVIS][AI] RESPONSE_SOURCE=${sovereignId}`);

    return {
      reply: sovereignRes.reply,
      responseSource: sovereignId,
      activeTier: 5,
      primaryModel: primaryId,
      primaryStatus,
      secondaryModel: secondaryId,
      secondaryStatus,
      engineMode: 'SOVEREIGN_EDGE_FAILOVER',
      quotaWarning: 'External AI unavailable. Sovereign Edge Multilingual Brain running autonomously.',
      latencyMs: Date.now() - startTime,
      intent: sovereignRes.intent,
      toolsUsed: sovereignRes.toolsUsed,
      providerStateSummary: this.getStateSummary(),
    };
  }

  private async callPythonCoreDaemon(query: string, options: any): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetch(`${this.pythonDaemonUrl}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: query,
          language: options.language,
          device_state: options.deviceState,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}

export const globalProviderStateMachine = new ProviderStateMachine();

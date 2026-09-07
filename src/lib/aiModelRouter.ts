/**
 * MURSAL JARVIS — Multi-Tier AI Model Router & Failover Engine
 * 
 * Strict Cascading Tier Architecture:
 * 1. Primary Cloud Model (Gemini 3.8 Flash)
 *    ↓ (404/429/503/Timeout/COOLDOWN)
 * 2. Secondary Cloud Model (Gemini 2.5 Flash)
 *    ↓ (404/429/503/Timeout/COOLDOWN)
 * 3. Open-Source API Model (Local Ollama / Open-Source Gateway)
 *    ↓ (Offline / Unavailable)
 * 4. Sovereign Edge Brain (Local Edge Intelligence in sovereignBrain.ts)
 *    ↓ (Fallback)
 * 5. Rule-Based Fallback
 * 
 * Circuit Breaker Pattern Invariants:
 * - Tracks 429 (Too Many Requests / Quota / RESOURCE_EXHAUSTED) errors for Gemini models
 * - Moves the model to a 'COOLDOWN' state for a configurable duration (default: 60s)
 * - Immediately routes subsequent requests to the secondary fallback model (bypassing the primary with zero latency)
 * - Provides HALF_OPEN canary probing after cooldown expiration to gracefully recover back to 'ONLINE'
 * - Transparent telemetry and model routing reports
 */

import { ModelHealthStatus, ModelRoutingReport } from '../types';
import { generateSovereignResponse } from './sovereignBrain';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /**
   * Configurable duration in milliseconds that a model stays in COOLDOWN
   * after encountering a 429 rate limit error. Default: 60,000ms (60 seconds).
   */
  cooldownDurationMs: number;
  /**
   * Number of 429 errors required to trip the circuit breaker. Default: 1.
   */
  failureThreshold: number;
  /**
   * Number of successful canary/probation requests required in HALF_OPEN to close the circuit. Default: 1.
   */
  halfOpenSuccessThreshold: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  consecutive429Count: number;
  total429Count: number;
  last429Timestamp?: number;
  last429ErrorMessage?: string;
  cooldownUntil?: number;
  cooldownDurationMs: number;
  probationSuccessCount: number;
}

export interface ModelDescriptor {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  status: ModelHealthStatus;
  failureCount: number;
  lastFailureTime?: number;
  cooldownUntil?: number;
  lastLatencyMs?: number;
  supportsVision: boolean;
  circuitBreaker?: CircuitBreakerMetrics;
}

export interface ModelInferenceRequest {
  prompt: string;
  language: string;
  voiceProfile?: string;
  imageData?: string;
  systemInstruction?: string;
  deviceContext?: any;
  screenContext?: any;
}

export interface ModelInferenceResult {
  reply: string;
  activeModel: string;
  modelTier: number;
  routingReport: ModelRoutingReport;
  engineMode: 'GEMINI_CLOUD_PRIMARY' | 'GEMINI_CLOUD_SECONDARY' | 'OPEN_SOURCE_GATEWAY' | 'SOVEREIGN_EDGE_BRAIN' | 'RULE_BASED_FALLBACK';
  latencyMs: number;
}

export class AIModelRouter {
  private circuitBreakerConfig: CircuitBreakerConfig = {
    cooldownDurationMs: 60000, // Configurable default: 60 seconds
    failureThreshold: 1,       // 1 rate-limit error trips to COOLDOWN
    halfOpenSuccessThreshold: 1,
  };

  // Per-model circuit breaker metrics
  private circuitBreakers: Map<string, CircuitBreakerMetrics> = new Map();

  // Per-model custom cooldown overrides (ms)
  private modelCooldownOverrides: Map<string, number> = new Map();

  private models: ModelDescriptor[] = [
    {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash (Primary Cloud)',
      tier: 1,
      status: 'ONLINE',
      failureCount: 0,
      supportsVision: true,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash (Secondary Cloud)',
      tier: 2,
      status: 'ONLINE',
      failureCount: 0,
      supportsVision: true,
    },
    {
      id: 'ollama-local-router',
      name: 'Ollama Open-Source Gateway',
      tier: 3,
      status: 'UNKNOWN',
      failureCount: 0,
      supportsVision: false,
    },
    {
      id: 'sovereign-edge-brain',
      name: 'Mursal Sovereign Edge Brain (On-Device)',
      tier: 4,
      status: 'ONLINE',
      failureCount: 0,
      supportsVision: true,
    },
    {
      id: 'rule-based-fallback',
      name: 'Local Rule Matrix Fallback',
      tier: 5,
      status: 'ONLINE',
      failureCount: 0,
      supportsVision: false,
    },
  ];

  private reportListeners: Set<(report: ModelRoutingReport) => void> = new Set();
  private activeModelId: string = 'gemini-3.8-flash';

  constructor() {
    // Initialize circuit breaker tracking for all Gemini models
    this.models.forEach((m) => {
      this.initCircuitBreaker(m.id);
    });
  }

  private initCircuitBreaker(modelId: string): CircuitBreakerMetrics {
    if (!this.circuitBreakers.has(modelId)) {
      this.circuitBreakers.set(modelId, {
        state: 'CLOSED',
        consecutive429Count: 0,
        total429Count: 0,
        cooldownDurationMs: this.getCooldownDuration(modelId),
        probationSuccessCount: 0,
      });
    }
    return this.circuitBreakers.get(modelId)!;
  }

  // ---------------------------------------------------------------------------
  // Circuit Breaker Configuration & Inspection API
  // ---------------------------------------------------------------------------

  /**
   * Configures global circuit breaker options
   */
  public configureCircuitBreaker(config: Partial<CircuitBreakerConfig>): void {
    this.circuitBreakerConfig = {
      ...this.circuitBreakerConfig,
      ...config,
    };
    console.info(`[AIModelRouter][CircuitBreaker] Global config updated: cooldown=${this.circuitBreakerConfig.cooldownDurationMs}ms, threshold=${this.circuitBreakerConfig.failureThreshold}`);
  }

  /**
   * Returns current global circuit breaker configuration
   */
  public getCircuitBreakerConfig(): CircuitBreakerConfig {
    return { ...this.circuitBreakerConfig };
  }

  /**
   * Sets the cooldown duration globally in milliseconds
   */
  public setCooldownDuration(durationMs: number): void {
    if (durationMs > 0) {
      this.circuitBreakerConfig.cooldownDurationMs = durationMs;
      console.info(`[AIModelRouter][CircuitBreaker] Global cooldown duration set to ${durationMs}ms (${durationMs / 1000}s)`);
    }
  }

  /**
   * Sets a model-specific cooldown duration override in milliseconds
   */
  public setModelCooldownDuration(modelId: string, durationMs: number): void {
    if (durationMs > 0) {
      this.modelCooldownOverrides.set(modelId, durationMs);
      const cb = this.circuitBreakers.get(modelId);
      if (cb) {
        cb.cooldownDurationMs = durationMs;
      }
      console.info(`[AIModelRouter][CircuitBreaker] Cooldown duration for ${modelId} set to ${durationMs}ms (${durationMs / 1000}s)`);
    }
  }

  /**
   * Returns the effective cooldown duration for a model in milliseconds
   */
  public getCooldownDuration(modelId?: string): number {
    if (modelId && this.modelCooldownOverrides.has(modelId)) {
      return this.modelCooldownOverrides.get(modelId)!;
    }
    return this.circuitBreakerConfig.cooldownDurationMs;
  }

  /**
   * Returns the current circuit breaker state for a model ('CLOSED' | 'OPEN' | 'HALF_OPEN')
   */
  public getCircuitBreakerState(modelId: string): CircuitBreakerState {
    const cb = this.circuitBreakers.get(modelId);
    if (!cb) return 'CLOSED';

    // If marked OPEN but cooldown duration has passed, it is effectively HALF_OPEN
    if (cb.state === 'OPEN' && cb.cooldownUntil && Date.now() >= cb.cooldownUntil) {
      return 'HALF_OPEN';
    }
    return cb.state;
  }

  /**
   * Returns circuit breaker metrics for a model
   */
  public getCircuitBreakerMetrics(modelId: string): CircuitBreakerMetrics {
    const cb = this.initCircuitBreaker(modelId);
    return {
      ...cb,
      state: this.getCircuitBreakerState(modelId),
      cooldownDurationMs: this.getCooldownDuration(modelId),
    };
  }

  /**
   * Returns the remaining cooldown time in milliseconds (0 if not in cooldown)
   */
  public getCooldownRemainingMs(modelId: string): number {
    const model = this.models.find((m) => m.id === modelId);
    if (!model || !model.cooldownUntil) return 0;
    const remaining = model.cooldownUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Programmatically trips the circuit breaker for a model into 'COOLDOWN' state
   */
  public tripCircuitBreaker(modelId: string, customDurationMs?: number, reason?: string): void {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) return;

    const cb = this.initCircuitBreaker(modelId);
    const durationMs = customDurationMs || this.getCooldownDuration(modelId);
    const cooldownUntil = Date.now() + durationMs;

    cb.state = 'OPEN';
    cb.consecutive429Count += 1;
    cb.total429Count += 1;
    cb.last429Timestamp = Date.now();
    cb.last429ErrorMessage = reason || 'Manual or programmatic trip';
    cb.cooldownUntil = cooldownUntil;
    cb.cooldownDurationMs = durationMs;
    cb.probationSuccessCount = 0;

    model.status = 'COOLDOWN';
    model.cooldownUntil = cooldownUntil;
    model.failureCount += 1;
    model.lastFailureTime = Date.now();

    console.warn(
      `[AIModelRouter][CircuitBreaker] Model ${model.name} (${model.id}) TRIPPED into 'COOLDOWN' state for ${durationMs}ms (until ${new Date(cooldownUntil).toISOString()}). Reason: ${reason || '429 Rate Limit'}. Subsequent requests will immediately route to secondary fallback.`
    );
  }

  /**
   * Resets the circuit breaker for a model back to 'CLOSED' / 'ONLINE'
   */
  public resetCircuitBreaker(modelId: string): void {
    const model = this.models.find((m) => m.id === modelId);
    const cb = this.circuitBreakers.get(modelId);

    if (cb) {
      cb.state = 'CLOSED';
      cb.consecutive429Count = 0;
      cb.cooldownUntil = undefined;
      cb.probationSuccessCount = 0;
    }

    if (model) {
      model.status = 'ONLINE';
      model.cooldownUntil = undefined;
      model.failureCount = 0;
    }

    console.info(`[AIModelRouter][CircuitBreaker] Model ${modelId} circuit breaker RESET to CLOSED ('ONLINE').`);
  }

  // ---------------------------------------------------------------------------
  // Model Descriptor Access & Telemetry
  // ---------------------------------------------------------------------------

  public getActiveModelId(): string {
    return this.activeModelId;
  }

  public getModelDescriptors(): ModelDescriptor[] {
    return this.models.map((m) => ({
      ...m,
      circuitBreaker: this.getCircuitBreakerMetrics(m.id),
    }));
  }

  public subscribeReports(listener: (report: ModelRoutingReport) => void): () => void {
    this.reportListeners.add(listener);
    return () => {
      this.reportListeners.delete(listener);
    };
  }

  private notifyReport(report: ModelRoutingReport) {
    this.reportListeners.forEach((l) => {
      try {
        l(report);
      } catch (e) {
        console.warn('[AIModelRouter] Listener error:', e);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Callability & Lifecycle State Machine
  // ---------------------------------------------------------------------------

  /**
   * Check if a model is currently allowed to be called.
   * If in COOLDOWN, returns false while cooldownUntil > now.
   * When cooldown expires, transitions to HALF_OPEN (probationary canary request).
   */
  public isModelCallable(model: ModelDescriptor): boolean {
    const now = Date.now();

    if (model.status === 'UNAVAILABLE' || model.status === 'OFFLINE') {
      return false;
    }

    const cb = this.initCircuitBreaker(model.id);

    // If model is in COOLDOWN or circuit is OPEN:
    if (model.status === 'COOLDOWN' || cb.state === 'OPEN') {
      if (model.cooldownUntil && now < model.cooldownUntil) {
        // Cooldown active -> Circuit is OPEN. Immediately reject/bypass call.
        return false;
      }

      // Cooldown expired -> Transition to HALF_OPEN for probationary canary probe
      cb.state = 'HALF_OPEN';
      cb.probationSuccessCount = 0;
      console.info(
        `[AIModelRouter][CircuitBreaker] Cooldown expired for ${model.name} (${model.id}). Transitioning to HALF_OPEN for canary probe.`
      );
      return true;
    }

    if (model.cooldownUntil && now < model.cooldownUntil) {
      return false;
    }

    return true;
  }

  /**
   * Evaluates if an error or status code is a 429 rate-limit error
   */
  private is429Error(error: any, statusCode?: number): boolean {
    if (statusCode === 429) return true;
    const errStr = String(error?.message || error?.statusText || error || '').toLowerCase();
    return (
      errStr.includes('429') ||
      errStr.includes('resource_exhausted') ||
      errStr.includes('quota') ||
      errStr.includes('too many requests') ||
      errStr.includes('rate limit') ||
      errStr.includes('rate-limited')
    );
  }

  /**
   * Records failure, tracks 429 errors for Gemini, and trips the circuit breaker to 'COOLDOWN'
   */
  public recordFailure(modelId: string, error: any, statusCode?: number) {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) return;

    model.failureCount += 1;
    model.lastFailureTime = Date.now();

    const errStr = String(error?.message || error || '');
    const cb = this.initCircuitBreaker(modelId);

    // 1. 429 Rate Limit Error -> Trip Circuit Breaker into 'COOLDOWN' state
    if (this.is429Error(error, statusCode)) {
      cb.consecutive429Count += 1;
      cb.total429Count += 1;
      cb.last429Timestamp = Date.now();
      cb.last429ErrorMessage = errStr;

      // Check if threshold reached (default: 1)
      if (cb.consecutive429Count >= this.circuitBreakerConfig.failureThreshold) {
        const cooldownMs = this.getCooldownDuration(modelId);
        const cooldownUntil = Date.now() + cooldownMs;

        cb.state = 'OPEN';
        cb.cooldownUntil = cooldownUntil;
        cb.cooldownDurationMs = cooldownMs;

        model.status = 'COOLDOWN';
        model.cooldownUntil = cooldownUntil;

        console.warn(
          `[AIModelRouter][CircuitBreaker] 429 RATE LIMIT on Gemini model ${model.name} (${model.id})! Tripping circuit breaker to 'COOLDOWN' state for ${cooldownMs}ms (until ${new Date(cooldownUntil).toISOString()}). Subsequent requests will immediately route to secondary fallback.`
        );
      }
    } else if (statusCode === 404 || errStr.includes('404') || errStr.includes('NOT_FOUND')) {
      model.status = 'UNAVAILABLE';
      model.cooldownUntil = Date.now() + 600000; // 10-minute cooldown
      console.warn(`[AIModelRouter] Model ${model.id} marked UNAVAILABLE (404 Not Found). Cooldown: 10m.`);
    } else if (statusCode === 503 || errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE')) {
      model.status = 'DEGRADED';
      model.cooldownUntil = Date.now() + 15000; // 15-second cooldown
      console.warn(`[AIModelRouter] Model ${model.id} DEGRADED (503 High Demand). Cooldown: 15s.`);
    } else {
      model.status = 'DEGRADED';
      model.cooldownUntil = Date.now() + 10000;
      console.warn(`[AIModelRouter] Model ${model.id} connection condition. Cooldown: 10s.`);
    }
  }

  /**
   * Records a successful inference. If the model was in HALF_OPEN probation,
   * closes the circuit breaker and restores status to 'ONLINE'.
   */
  public recordSuccess(modelId: string, latencyMs: number) {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) return;

    const cb = this.initCircuitBreaker(modelId);

    if (cb.state === 'HALF_OPEN' || model.status === 'COOLDOWN') {
      cb.probationSuccessCount += 1;
      if (cb.probationSuccessCount >= this.circuitBreakerConfig.halfOpenSuccessThreshold) {
        cb.state = 'CLOSED';
        cb.consecutive429Count = 0;
        cb.cooldownUntil = undefined;
        model.status = 'ONLINE';
        model.cooldownUntil = undefined;
        console.info(
          `[AIModelRouter][CircuitBreaker] Canary probe succeeded for ${model.name} (${model.id})! Circuit breaker CLOSED -> Status: 'ONLINE'.`
        );
      }
    } else {
      model.status = 'ONLINE';
      model.cooldownUntil = undefined;
    }

    model.failureCount = 0;
    model.lastLatencyMs = latencyMs;
    this.activeModelId = modelId;
  }

  // ---------------------------------------------------------------------------
  // Cascading Routing Execution with Circuit Breaker Immediate Failover
  // ---------------------------------------------------------------------------

  /**
   * Executes prompt against the resilient cascade.
   * If the primary model is in COOLDOWN, immediately bypasses it and routes
   * to the secondary fallback model with zero overhead.
   */
  public async routeAndExecute(req: ModelInferenceRequest): Promise<ModelInferenceResult> {
    const startTime = Date.now();
    const primary = this.models[0];     // Tier 1: Gemini 3.8 Flash
    const secondary = this.models[1];   // Tier 2: Gemini 2.5 Flash
    const sovereign = this.models[3];   // Tier 4: Sovereign Edge Brain

    // -------------------------------------------------------------------------
    // Tier 1: Primary Cloud Model (Gemini 3.8 Flash)
    // -------------------------------------------------------------------------
    const isPrimaryCallable = this.isModelCallable(primary);

    if (isPrimaryCallable) {
      try {
        const res = await this.invokeServerBackend(req, primary.id);
        if (res && res.reply) {
          const latency = Date.now() - startTime;
          this.recordSuccess(primary.id, latency);
          const report: ModelRoutingReport = {
            taskType: req.imageData ? 'VISION_SCREEN' : 'VOICE_CHAT',
            primaryModel: primary.id,
            fallbackModel: secondary.id,
            selectedModel: primary.id,
            fallbackStatus: 'NOT_NEEDED',
            latencyMs: latency,
            timestamp: Date.now(),
          };
          this.notifyReport(report);
          return {
            reply: res.reply,
            activeModel: primary.name,
            modelTier: 1,
            routingReport: report,
            engineMode: 'GEMINI_CLOUD_PRIMARY',
            latencyMs: latency,
          };
        }
      } catch (err: any) {
        const status = err.status || err.statusCode || (this.is429Error(err) ? 429 : undefined);
        this.recordFailure(primary.id, err, status);
        console.warn(`[AIModelRouter] Primary model ${primary.id} failed (${err.message}). Cascading immediately to secondary fallback (${secondary.id}).`);
      }
    } else {
      const remainingSec = Math.ceil(this.getCooldownRemainingMs(primary.id) / 1000);
      console.info(
        `[AIModelRouter][CircuitBreaker] Primary model (${primary.id}) is in COOLDOWN (${remainingSec}s remaining). Immediately routing to secondary fallback model (${secondary.id}).`
      );
    }

    // -------------------------------------------------------------------------
    // Tier 2: Secondary Fallback Model (Gemini 2.5 Flash)
    // -------------------------------------------------------------------------
    const isSecondaryCallable = this.isModelCallable(secondary);

    if (isSecondaryCallable) {
      try {
        console.info(`[AIModelRouter] Routing request to Tier 2 Secondary Fallback: ${secondary.id}`);
        const res = await this.invokeServerBackend(req, secondary.id);
        if (res && res.reply) {
          const latency = Date.now() - startTime;
          this.recordSuccess(secondary.id, latency);
          const report: ModelRoutingReport = {
            taskType: req.imageData ? 'VISION_SCREEN' : 'VOICE_CHAT',
            primaryModel: primary.id,
            fallbackModel: secondary.id,
            selectedModel: secondary.id,
            fallbackStatus: 'RETRY_SUCCEEDED',
            failureReason: primary.status === 'COOLDOWN'
              ? `Primary model (${primary.id}) in COOLDOWN (429 circuit breaker active)`
              : `Primary model (${primary.id}) encountered execution error`,
            latencyMs: latency,
            timestamp: Date.now(),
          };
          this.notifyReport(report);
          return {
            reply: res.reply,
            activeModel: secondary.name,
            modelTier: 2,
            routingReport: report,
            engineMode: 'GEMINI_CLOUD_SECONDARY',
            latencyMs: latency,
          };
        }
      } catch (err: any) {
        const status = err.status || err.statusCode || (this.is429Error(err) ? 429 : undefined);
        this.recordFailure(secondary.id, err, status);
        console.warn(`[AIModelRouter] Secondary model ${secondary.id} failed (${err.message}). Cascading to Tier 4 Sovereign Edge Brain.`);
      }
    } else {
      const remainingSec = Math.ceil(this.getCooldownRemainingMs(secondary.id) / 1000);
      console.info(
        `[AIModelRouter][CircuitBreaker] Secondary model (${secondary.id}) is in COOLDOWN (${remainingSec}s remaining). Cascading to Sovereign Edge Brain.`
      );
    }

    // -------------------------------------------------------------------------
    // Tier 4: Sovereign Edge Brain (Local Edge Intelligence)
    // -------------------------------------------------------------------------
    console.info(`[AIModelRouter] Cascading to Tier 4 Sovereign Edge Brain: ${sovereign.name}`);
    const edgeResult = generateSovereignResponse(
      req.prompt,
      (req.language as any) || 'ur-Roman',
      (req.voiceProfile as any) || 'friendly',
      {
        deviceState: req.deviceContext,
        isImage: Boolean(req.imageData),
      }
    );

    const latency = Date.now() - startTime;
    this.recordSuccess(sovereign.id, latency);
    this.activeModelId = sovereign.id;

    const report: ModelRoutingReport = {
      taskType: req.imageData ? 'VISION_SCREEN' : 'VOICE_CHAT',
      primaryModel: primary.id,
      fallbackModel: sovereign.id,
      selectedModel: sovereign.id,
      failureReason: 'Cloud models in COOLDOWN/Rate-limited. Autonomous Sovereign Edge Brain active.',
      fallbackStatus: 'EDGE_FAILOVER_ACTIVE',
      latencyMs: latency,
      timestamp: Date.now(),
    };
    this.notifyReport(report);

    return {
      reply: edgeResult.reply,
      activeModel: sovereign.name,
      modelTier: 4,
      routingReport: report,
      engineMode: 'SOVEREIGN_EDGE_BRAIN',
      latencyMs: latency,
    };
  }

  /**
   * Invokes the server backend API with abort timeout and error status extraction
   */
  private async invokeServerBackend(req: ModelInferenceRequest, modelId: string): Promise<{ reply: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);

    try {
      const res = await fetch('/api/jarvis/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: req.prompt,
          language: req.language,
          voiceProfile: req.voiceProfile,
          imageData: req.imageData,
          requestedModel: modelId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        let errDetail = '';
        try {
          const errJson = await res.json();
          errDetail = errJson.error || errJson.message || JSON.stringify(errJson);
        } catch {
          errDetail = await res.text().catch(() => '');
        }

        const err: any = new Error(`HTTP Error ${res.status}: ${errDetail || res.statusText}`);
        err.status = res.status;
        err.statusCode = res.status;
        throw err;
      }

      const data = await res.json();
      return { reply: data.reply || '' };
    } catch (err: any) {
      clearTimeout(timeout);
      throw err;
    }
  }
}

export const globalAIModelRouter = new AIModelRouter();

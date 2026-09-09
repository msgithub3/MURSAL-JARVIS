/**
 * MURSAL JARVIS — OpenJarvis-Inspired Local Engine Adapter
 * 
 * Provides native integration with local inference engines (Ollama):
 * - Configurable endpoint (default: http://localhost:11434/v1, or OLLAMA_BASE_URL env)
 * - Dynamic model discovery (queries /v1/models and /api/tags with TTL caching)
 * - Connection health detection & latency benchmarking
 * - Resilient streaming using BufferedSseParser
 * - Full AbortSignal & barge-in interruption compatibility
 * - Graceful degradation: never crashes if local engine is offline
 */

import { BufferedSseParser } from './bufferedSseParser';

export interface LocalModelInfo {
  id: string;
  name: string;
  sizeBytes?: number;
  format?: string;
  family?: string;
  modifiedAt?: string;
  capabilities?: string[];
}

export interface LocalEngineConfig {
  baseUrl: string;
  timeoutMs: number;
  discoveryTtlMs: number;
  preferredModels: string[];
}

export interface LocalHealthStatus {
  reachable: boolean;
  latencyMs: number;
  installedModelsCount: number;
  selectedModel?: string;
  version?: string;
  error?: string;
}

export interface LocalStreamParams {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: string) => void;
}

export interface LocalStreamResult {
  fullText: string;
  model: string;
  metrics: {
    ttftMs: number;
    totalLatencyMs: number;
  };
}

export const DEFAULT_LOCAL_CONFIG: LocalEngineConfig = {
  baseUrl: (typeof process !== 'undefined' && process.env?.OLLAMA_BASE_URL) || 'http://localhost:11434/v1',
  timeoutMs: 15000,
  discoveryTtlMs: 45000, // 45 seconds cache TTL
  preferredModels: ['qwen2.5:7b', 'deepseek-r1:8b', 'qwen2.5:latest', 'llama3.2:latest'],
};

export class LocalEngineAdapter {
  private config: LocalEngineConfig;
  private cachedModels: LocalModelInfo[] = [];
  private lastDiscoveryTimestamp: number = 0;
  private isCheckingHealth: boolean = false;
  private lastFetchSucceeded: boolean = false;

  constructor(config: Partial<LocalEngineConfig> = {}) {
    this.config = { ...DEFAULT_LOCAL_CONFIG, ...config };
  }

  public setBaseUrl(url: string): void {
    this.config.baseUrl = url.replace(/\/$/, '');
    this.invalidateCache();
  }

  public getBaseUrl(): string {
    return this.config.baseUrl;
  }

  public invalidateCache(): void {
    this.cachedModels = [];
    this.lastDiscoveryTimestamp = 0;
    this.lastFetchSucceeded = false;
  }

  /**
   * Probes Ollama server connectivity and latency
   */
  public async checkHealth(): Promise<LocalHealthStatus> {
    const startTime = Date.now();
    try {
      const models = await this.discoverModels(true);
      const latencyMs = Date.now() - startTime;

      if (!this.lastFetchSucceeded) {
        return {
          reachable: false,
          latencyMs,
          installedModelsCount: 0,
          error: 'Ollama local engine offline or unreachable',
        };
      }

      const selected = this.selectBestModel(models);
      return {
        reachable: true,
        latencyMs,
        installedModelsCount: models.length,
        selectedModel: selected?.id,
      };
    } catch (err: any) {
      return {
        reachable: false,
        latencyMs: Date.now() - startTime,
        installedModelsCount: 0,
        error: err?.message || 'Ollama local engine offline or unreachable',
      };
    }
  }

  /**
   * Dynamically discovers installed models with brief TTL caching
   */
  public async discoverModels(forceRefresh = false): Promise<LocalModelInfo[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedModels.length > 0 && now - this.lastDiscoveryTimestamp < this.config.discoveryTtlMs) {
      return this.cachedModels;
    }

    try {
      const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/models`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).catch(async () => {
        // Fallback to Ollama native /api/tags endpoint if /v1/models fails
        const rootUrl = this.config.baseUrl.replace(/\/v1\/?$/, '');
        return fetch(`${rootUrl}/api/tags`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      });

      clearTimeout(timeout);

      if (!resp || !resp.ok) {
        throw new Error(`Failed to fetch local models (status: ${resp?.status || 'network_error'})`);
      }

      const json = await resp.json();
      const discovered: LocalModelInfo[] = [];

      // Parse OpenAI-compatible /v1/models response
      if (Array.isArray(json?.data)) {
        for (const m of json.data) {
          discovered.push({
            id: m.id,
            name: m.id,
            capabilities: ['chat', 'streaming'],
          });
        }
      } else if (Array.isArray(json?.models)) {
        // Parse Ollama native /api/tags response
        for (const m of json.models) {
          discovered.push({
            id: m.name || m.model,
            name: m.name || m.model,
            sizeBytes: m.size,
            modifiedAt: m.modified_at,
            capabilities: ['chat', 'streaming'],
          });
        }
      }

      this.cachedModels = discovered;
      this.lastDiscoveryTimestamp = now;
      this.lastFetchSucceeded = true;
      return discovered;
    } catch (err: any) {
      // Offline or unreachable — return empty without crashing
      this.lastFetchSucceeded = false;
      return [];
    }
  }

  /**
   * Selects the highest priority installed model based on preference list
   */
  public selectBestModel(installedModels?: LocalModelInfo[]): LocalModelInfo | null {
    const list = installedModels || this.cachedModels;
    if (list.length === 0) return null;

    for (const preferred of this.config.preferredModels) {
      const matched = list.find((m) => m.id.toLowerCase() === preferred.toLowerCase() || m.name.toLowerCase().startsWith(preferred.toLowerCase()));
      if (matched) return matched;
    }

    // Default to first available model if preferred ones are not found
    return list[0];
  }

  /**
   * Verifies whether a specific model is currently available locally
   */
  public async isModelAvailable(modelName: string): Promise<boolean> {
    const models = await this.discoverModels();
    return models.some((m) => m.id.toLowerCase() === modelName.toLowerCase());
  }

  /**
   * Executes streaming chat completion against local Ollama endpoint
   */
  public async streamChat(params: LocalStreamParams): Promise<LocalStreamResult | null> {
    const startedAt = Date.now();
    let modelToUse = params.model;

    if (!modelToUse) {
      const best = this.selectBestModel();
      if (!best) {
        // Try discovery once
        const discovered = await this.discoverModels(true);
        const resolved = this.selectBestModel(discovered);
        if (!resolved) {
          throw new Error('No local models installed in Ollama runtime.');
        }
        modelToUse = resolved.id;
      } else {
        modelToUse = best.id;
      }
    }

    const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();

    if (params.abortSignal) {
      params.abortSignal.addEventListener('abort', () => controller.abort());
    }

    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          messages: params.messages,
          temperature: params.temperature ?? 0.4,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      if (!response.ok || !response.body) {
        throw new Error(`Local Ollama error: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new BufferedSseParser();

      let fullText = '';
      let ttftMs = 0;

      while (true) {
        if (params.abortSignal?.aborted) {
          try { await reader.cancel(); } catch (_) {}
          return null;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const messages = parser.feed(chunkText);

        for (const msg of messages) {
          if (msg.data === '[DONE]') break;

          try {
            const parsed = JSON.parse(msg.data);
            const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content || '';
            if (delta) {
              if (ttftMs === 0) {
                ttftMs = Date.now() - startedAt;
              }
              fullText += delta;
              params.onChunk?.(delta);
            }
          } catch (_) {
            // Silently ignore non-JSON frames
          }
        }
      }

      return {
        fullText,
        model: modelToUse,
        metrics: {
          ttftMs: ttftMs || (Date.now() - startedAt),
          totalLatencyMs: Date.now() - startedAt,
        },
      };
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      if (params.abortSignal?.aborted) {
        return null;
      }
      throw err;
    }
  }
}

export const globalLocalEngine = new LocalEngineAdapter();

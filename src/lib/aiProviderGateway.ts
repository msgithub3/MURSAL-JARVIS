/**
 * MURSAL JARVIS — Open-Source & Local AI Provider Gateway
 *
 * Integrated Multi-Tier Routing:
 * - Primary: Qwen (qwen-plus / OpenAI-compatible endpoint)
 * - Fallback: DeepSeek (deepseek-chat / deepseek-reasoner)
 * - Local Engine: Ollama (qwen2.5:7b / deepseek-r1:8b)
 * - Cloud Optional: Gemini Live / Flash
 *
 * Routing Modes:
 * - CLOUD_FIRST (Default): Qwen -> DeepSeek -> Ollama -> Sovereign Edge
 * - LOCAL_FIRST: Ollama (if healthy & has models) -> Qwen -> DeepSeek -> Sovereign Edge
 * - AUTO: Dynamically selects best available engine based on health & latency
 *
 * Streaming uses BufferedSseParser to guarantee zero token loss on fragmented network frames.
 */

import { LocalEngineAdapter, globalLocalEngine } from './localEngineAdapter';
import { BufferedSseParser } from './bufferedSseParser';

export type ProviderRoutingMode = 'CLOUD_FIRST' | 'LOCAL_FIRST' | 'AUTO';

export interface StreamingTelemetry {
  provider: string;
  model: string;
  requestId: string;
  firstTokenLatencyMs: number;
  tokensPerSec: number;
  totalTokens: number;
  sentenceCount: number;
  streamDurationMs: number;
  engineMode:
    | 'OPEN_SOURCE_PRIMARY'
    | 'OPEN_SOURCE_SECONDARY'
    | 'LOCAL_OLLAMA_ENGINE'
    | 'GEMINI_OPTIONAL'
    | 'SOVEREIGN_EDGE_FAILOVER';
  status: 'IDLE' | 'STREAMING' | 'COMPLETED' | 'CANCELLED' | 'ERROR';
  cancellationState: boolean;
}

export interface RuntimeDiagnosticEntry {
  id: string;
  timestamp: number;
  requestId: string;
  providerSelected: string;
  model: string;
  reasonForSelection: string;
  fallbackReason?: string;
  latencyMs: number;
  firstTokenLatencyMs: number;
  tokensPerSec: number;
  totalTokens: number;
  sentenceCount: number;
  streamCompleted: boolean;
  error?: string;
  cancelled: boolean;
}

export interface AIStreamParams {
  contents: any;
  config?: {
    systemInstruction?: string;
    temperature?: number;
  };
  mode?: 'FAST' | 'SMART' | 'DEEP' | string;
  routingMode?: ProviderRoutingMode;
  allowGemini?: boolean;
  providerTimeoutMs?: number;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  onSentence?: (sentence: string, isFirst: boolean) => void;
  onTelemetry?: (telemetry: StreamingTelemetry) => void;
}

export interface AIStreamResult {
  fullText: string;
  activeModel: string;
  provider: string;
  engineMode:
    | 'OPEN_SOURCE_PRIMARY'
    | 'OPEN_SOURCE_SECONDARY'
    | 'LOCAL_OLLAMA_ENGINE'
    | 'GEMINI_OPTIONAL'
    | 'SOVEREIGN_EDGE_FAILOVER';
  metrics: {
    model_ttft: number;
    model_total_latency: number;
    tokensPerSec: number;
    totalTokens: number;
    sentenceCount: number;
    streamDurationMs: number;
  };
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isLocal?: boolean;
  isGemini?: boolean;
}

function getEnv(name: string): string {
  return (
    (typeof process !== 'undefined' && process.env?.[name]) ||
    ''
  ).trim();
}

export class AIProviderGateway {
  private localEngine: LocalEngineAdapter;
  private routingMode: ProviderRoutingMode = 'CLOUD_FIRST';
  private customProviders: ProviderConfig[] | null = null;
  private lastTelemetry: StreamingTelemetry | null = null;
  private diagnosticsLog: RuntimeDiagnosticEntry[] = [];

  constructor(localEngine: LocalEngineAdapter = globalLocalEngine) {
    this.localEngine = localEngine;
  }

  public getRuntimeDiagnostics(): RuntimeDiagnosticEntry[] {
    return [...this.diagnosticsLog];
  }

  public clearRuntimeDiagnostics(): void {
    this.diagnosticsLog = [];
  }

  public recordDiagnostic(entry: RuntimeDiagnosticEntry): void {
    this.diagnosticsLog.push(entry);
    if (this.diagnosticsLog.length > 150) {
      this.diagnosticsLog.shift();
    }
  }

  public setRoutingMode(mode: ProviderRoutingMode): void {
    this.routingMode = mode;
  }

  public getRoutingMode(): ProviderRoutingMode {
    return this.routingMode;
  }

  public getLocalEngine(): LocalEngineAdapter {
    return this.localEngine;
  }

  public setCustomProviders(providers: ProviderConfig[] | null): void {
    this.customProviders = providers;
  }

  public getCustomProviders(): ProviderConfig[] | null {
    return this.customProviders;
  }

  public getLastTelemetry(): StreamingTelemetry | null {
    return this.lastTelemetry;
  }

  /**
   * Resolves active provider priority chain:
   * 1. PRIMARY: Qwen (qwen-plus / OpenAI-compatible endpoint)
   * 2. FIRST FALLBACK: DeepSeek (deepseek-chat / deepseek-reasoner)
   * 3. LOCAL FALLBACK: Ollama (qwen2.5:7b / deepseek-r1:8b)
   * 4. OPTIONAL: Gemini (ONLY when explicitly configured/permitted)
   */
  public async getResolvedProviders(
    mode: string,
    requestedRouting?: ProviderRoutingMode,
    allowGemini = false
  ): Promise<ProviderConfig[]> {
    if (this.customProviders && this.customProviders.length > 0) {
      return [...this.customProviders];
    }

    const routing = requestedRouting || this.routingMode;
    const cloudProviders: ProviderConfig[] = [];

    // 1. PRIMARY: Qwen
    const qwenKey = getEnv('QWEN_API_KEY') || getEnv('OPENAI_API_KEY');
    const qwenUrl = getEnv('QWEN_BASE_URL') || getEnv('OPENAI_BASE_URL');
    const qwenModel = getEnv('QWEN_MODEL') || 'qwen-plus';

    if (qwenKey && qwenUrl) {
      cloudProviders.push({
        name: 'QWEN',
        baseUrl: qwenUrl,
        apiKey: qwenKey,
        model: qwenModel,
      });
    }

    // 2. FIRST FALLBACK: DeepSeek
    const deepseekKey = getEnv('DEEPSEEK_API_KEY');
    const deepseekUrl = getEnv('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
    const deepseekModel = getEnv('DEEPSEEK_MODEL') || (mode === 'DEEP' ? 'deepseek-reasoner' : 'deepseek-chat');

    if (deepseekKey) {
      cloudProviders.push({
        name: 'DEEPSEEK',
        baseUrl: deepseekUrl,
        apiKey: deepseekKey,
        model: deepseekModel,
      });
    }

    // 3. LOCAL FALLBACK: Ollama
    let localProvider: ProviderConfig | null = null;
    try {
      const localModels = await this.localEngine.discoverModels();
      if (localModels.length > 0) {
        const selected = this.localEngine.selectBestModel(localModels);
        if (selected) {
          localProvider = {
            name: 'OLLAMA_LOCAL',
            baseUrl: this.localEngine.getBaseUrl(),
            apiKey: 'ollama-local-no-key',
            model: selected.id,
            isLocal: true,
          };
        }
      }
    } catch (_) {
      // Local engine offline — ignore
    }

    // 4. OPTIONAL: Gemini (only when explicitly enabled or requested)
    const geminiKey = getEnv('GEMINI_API_KEY');
    const isGeminiExplicitlyEnabled =
      allowGemini ||
      getEnv('ENABLE_GEMINI') === 'true' ||
      getEnv('GEMINI_ENABLED') === 'true';

    let optionalGeminiProvider: ProviderConfig | null = null;
    if (geminiKey && isGeminiExplicitlyEnabled) {
      optionalGeminiProvider = {
        name: 'GEMINI',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: geminiKey,
        model: mode === 'DEEP' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite',
        isGemini: true,
      };
    }

    // Combine according to routing mode
    let ordered: ProviderConfig[] = [];

    if (routing === 'LOCAL_FIRST' && localProvider) {
      ordered = [localProvider, ...cloudProviders];
    } else if (routing === 'AUTO') {
      if (localProvider && cloudProviders.length === 0) {
        ordered = [localProvider];
      } else {
        ordered = localProvider ? [...cloudProviders, localProvider] : cloudProviders;
      }
    } else {
      // Default: CLOUD_FIRST -> Qwen -> DeepSeek -> Ollama
      ordered = localProvider ? [...cloudProviders, localProvider] : cloudProviders;
    }

    // Append optional Gemini fallback at the end if explicitly enabled
    if (optionalGeminiProvider) {
      ordered.push(optionalGeminiProvider);
    }

    return ordered;
  }

  /**
   * Main streaming execution method
   */
  public async stream(params: AIStreamParams): Promise<AIStreamResult | null> {
    const startedAt = Date.now();
    const providers = await this.getResolvedProviders(params.mode || 'FAST', params.routingMode);

    if (providers.length === 0) {
      console.warn('[AIProviderGateway] No open-source or local providers reachable.');
      return null;
    }

    const userText =
      typeof params.contents?.[0]?.parts?.[0]?.text === 'string'
        ? params.contents[0].parts[0].text
        : typeof params.contents === 'string'
        ? params.contents
        : '';

    const messages: Array<{ role: string; content: string }> = [];
    if (params.config?.systemInstruction) {
      messages.push({ role: 'system', content: params.config.systemInstruction });
    }
    messages.push({ role: 'user', content: userText });

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const providerTimeout = params.providerTimeoutMs || 10000;
    let lastFallbackReason: string | undefined = undefined;

    for (let providerIndex = 0; providerIndex < providers.length; providerIndex++) {
      const provider = providers[providerIndex];
      if (params.abortSignal?.aborted) return null;

      const modelStartedAt = Date.now();
      let firstTokenLatency = 0;
      let fullText = '';
      let sentenceBuffer = '';
      let firstSentence = true;
      let tokenCount = 0;
      let sentenceCount = 0;

      const engineMode: AIStreamResult['engineMode'] = provider.isLocal
        ? 'LOCAL_OLLAMA_ENGINE'
        : provider.isGemini
        ? 'GEMINI_OPTIONAL'
        : providerIndex === 0
        ? 'OPEN_SOURCE_PRIMARY'
        : 'OPEN_SOURCE_SECONDARY';

      const reasonForSelection = provider.isLocal
        ? 'Local Ollama sovereign engine prioritized'
        : provider.isGemini
        ? 'Gemini optional compatibility provider selected'
        : providerIndex === 0
        ? 'Primary open-source model configured'
        : 'Fallback open-source model tier selected';

      const fallbackReason = providerIndex > 0 ? (lastFallbackReason || 'Previous provider failed') : undefined;

      // Emit initial telemetry
      const emitTelemetry = (status: StreamingTelemetry['status'], isCancelled = false) => {
        const streamDuration = Math.max(1, Date.now() - modelStartedAt);
        const tokensPerSec = Number(((tokenCount / streamDuration) * 1000).toFixed(1));
        const telemetry: StreamingTelemetry = {
          provider: provider.name,
          model: provider.model,
          requestId,
          firstTokenLatencyMs: firstTokenLatency,
          tokensPerSec,
          totalTokens: tokenCount,
          sentenceCount,
          streamDurationMs: streamDuration,
          engineMode,
          status,
          cancellationState: isCancelled,
        };
        this.lastTelemetry = telemetry;
        params.onTelemetry?.(telemetry);
      };

      emitTelemetry('STREAMING');

      // Create provider-level abort controller for timeout race
      const providerAbortCtrl = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;

      if (params.abortSignal) {
        params.abortSignal.addEventListener('abort', () => {
          providerAbortCtrl.abort();
          emitTelemetry('CANCELLED', true);
        });
      }

      timeoutId = setTimeout(() => {
        providerAbortCtrl.abort();
      }, providerTimeout);

      try {
        // 1. If local provider, dispatch via LocalEngineAdapter
        if (provider.isLocal) {
          const res = await this.localEngine.streamChat({
            model: provider.model,
            messages,
            temperature: params.config?.temperature ?? 0.3,
            abortSignal: providerAbortCtrl.signal,
            onChunk: (chunk) => {
              if (firstTokenLatency === 0) {
                firstTokenLatency = Date.now() - modelStartedAt;
              }
              tokenCount++;
              fullText += chunk;
              sentenceBuffer += chunk;
              params.onChunk?.(chunk);

              const sentenceResult = splitSentences(sentenceBuffer);
              sentenceBuffer = sentenceResult.remainder;
              for (const sentence of sentenceResult.complete) {
                sentenceCount++;
                params.onSentence?.(sentence, firstSentence);
                firstSentence = false;
              }
              emitTelemetry('STREAMING');
            },
          });

          if (timeoutId) clearTimeout(timeoutId);

          if (sentenceBuffer.trim()) {
            sentenceCount++;
            params.onSentence?.(sentenceBuffer.trim(), firstSentence);
          }

          if (res) {
            emitTelemetry('COMPLETED');
            const totalDuration = Date.now() - modelStartedAt;
            const tps = Number(((tokenCount / Math.max(1, totalDuration)) * 1000).toFixed(1));

            this.recordDiagnostic({
              id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: Date.now(),
              requestId,
              providerSelected: provider.name,
              model: provider.model,
              reasonForSelection,
              fallbackReason,
              latencyMs: totalDuration,
              firstTokenLatencyMs: res.metrics.ttftMs,
              tokensPerSec: tps,
              totalTokens: tokenCount,
              sentenceCount,
              streamCompleted: true,
              cancelled: false,
            });

            return {
              fullText: res.fullText,
              activeModel: res.model,
              provider: provider.name,
              engineMode: 'LOCAL_OLLAMA_ENGINE',
              metrics: {
                model_ttft: res.metrics.ttftMs,
                model_total_latency: res.metrics.totalLatencyMs,
                tokensPerSec: tps,
                totalTokens: tokenCount,
                sentenceCount,
                streamDurationMs: totalDuration,
              },
            };
          }
        }

        // 2. Cloud provider streaming via BufferedSseParser
        const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            temperature: params.config?.temperature ?? 0.3,
            stream: true,
          }),
          signal: providerAbortCtrl.signal,
        });

        if (!response.ok || !response.body) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`${provider.name} HTTP ${response.status}: ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new BufferedSseParser();

        while (true) {
          if (params.abortSignal?.aborted || providerAbortCtrl.signal.aborted) {
            try { await reader.cancel(); } catch (_) {}
            emitTelemetry('CANCELLED', true);
            this.recordDiagnostic({
              id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: Date.now(),
              requestId,
              providerSelected: provider.name,
              model: provider.model,
              reasonForSelection,
              fallbackReason,
              latencyMs: Date.now() - modelStartedAt,
              firstTokenLatencyMs: firstTokenLatency,
              tokensPerSec: 0,
              totalTokens: tokenCount,
              sentenceCount,
              streamCompleted: false,
              cancelled: true,
            });
            return null;
          }

          const { done, value } = await reader.read();
          if (done) break;

          const raw = decoder.decode(value, { stream: true });
          const streamMsgs = parser.feed(raw);

          for (const msg of streamMsgs) {
            if (msg.data === '[DONE]') break;

            try {
              const parsed = JSON.parse(msg.data);
              const text = extractText(parsed);
              if (!text) continue;

              if (firstTokenLatency === 0) {
                firstTokenLatency = Date.now() - modelStartedAt;
              }

              tokenCount++;
              fullText += text;
              sentenceBuffer += text;
              params.onChunk?.(text);

              const sentenceResult = splitSentences(sentenceBuffer);
              sentenceBuffer = sentenceResult.remainder;
              for (const sentence of sentenceResult.complete) {
                sentenceCount++;
                params.onSentence?.(sentence, firstSentence);
                firstSentence = false;
              }
              emitTelemetry('STREAMING');
            } catch (_) {
              // Ignore non-JSON frames
            }
          }
        }

        if (timeoutId) clearTimeout(timeoutId);

        // Flush final sentence
        if (sentenceBuffer.trim()) {
          sentenceCount++;
          params.onSentence?.(sentenceBuffer.trim(), firstSentence);
        }

        const totalDuration = Date.now() - modelStartedAt;
        const tps = Number(((tokenCount / Math.max(1, totalDuration)) * 1000).toFixed(1));
        emitTelemetry('COMPLETED');

        this.recordDiagnostic({
          id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          requestId,
          providerSelected: provider.name,
          model: provider.model,
          reasonForSelection,
          fallbackReason,
          latencyMs: totalDuration,
          firstTokenLatencyMs: firstTokenLatency,
          tokensPerSec: tps,
          totalTokens: tokenCount,
          sentenceCount,
          streamCompleted: true,
          cancelled: false,
        });

        return {
          fullText,
          activeModel: provider.model,
          provider: provider.name,
          engineMode,
          metrics: {
            model_ttft: firstTokenLatency,
            model_total_latency: totalDuration,
            tokensPerSec: tps,
            totalTokens: tokenCount,
            sentenceCount,
            streamDurationMs: totalDuration,
          },
        };
      } catch (error: any) {
        if (timeoutId) clearTimeout(timeoutId);
        lastFallbackReason = `${provider.name} failed: ${error?.message || error}`;

        this.recordDiagnostic({
          id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          requestId,
          providerSelected: provider.name,
          model: provider.model,
          reasonForSelection,
          fallbackReason,
          latencyMs: Date.now() - modelStartedAt,
          firstTokenLatencyMs: firstTokenLatency,
          tokensPerSec: 0,
          totalTokens: tokenCount,
          sentenceCount,
          streamCompleted: false,
          error: error?.message || String(error),
          cancelled: Boolean(params.abortSignal?.aborted),
        });

        if (params.abortSignal?.aborted) {
          emitTelemetry('CANCELLED', true);
          return null;
        }
        console.warn(`[AIProviderGateway] ${provider.name} failed:`, error?.message || error);
        emitTelemetry('ERROR');
        continue;
      }
    }

    console.error('[AIProviderGateway] All open-source & local providers failed.');
    return null;
  }

  public async streamGenerate(params: AIStreamParams): Promise<AIStreamResult | null> {
    return this.stream(params);
  }
}

export const globalAIProviderGateway = new AIProviderGateway();

/**
 * Backward-compatible helper preserving existing call sites
 */
export async function generateOpenSourceStream(params: AIStreamParams): Promise<AIStreamResult | null> {
  return globalAIProviderGateway.stream(params);
}

function extractText(delta: any): string {
  return (
    delta?.choices?.[0]?.delta?.content ||
    delta?.choices?.[0]?.message?.content ||
    ''
  );
}

function splitSentences(buffer: string): { complete: string[]; remainder: string } {
  const parts = buffer.split(/(?<=[.!?؟])\s+/);
  const remainder = parts.pop() || '';
  return {
    complete: parts.filter((x) => x.trim().length > 0),
    remainder,
  };
}

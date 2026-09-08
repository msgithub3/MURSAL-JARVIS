/**
 * MURSAL JARVIS — Open-Source AI Provider Gateway
 *
 * Primary: Qwen / configurable OpenAI-compatible provider
 * Fallback: DeepSeek / configurable OpenAI-compatible provider
 *
 * Streaming is exposed as chunks so the existing SentenceChunker,
 * AI_STREAM_SENTENCE and TTS pipeline remain unchanged.
 */

export interface AIStreamParams {
  contents: any;
  config?: {
    systemInstruction?: string;
    temperature?: number;
  };
  mode?: 'FAST' | 'SMART' | 'DEEP' | string;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  onSentence?: (sentence: string, isFirst: boolean) => void;
}

export interface AIStreamResult {
  fullText: string;
  activeModel: string;
  engineMode: 'OPEN_SOURCE_PRIMARY' | 'OPEN_SOURCE_SECONDARY' | 'SOVEREIGN_EDGE_FAILOVER';
  metrics: {
    model_ttft: number;
    model_total_latency: number;
  };
}

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getEnv(name: string): string {
  return (
    (typeof process !== 'undefined' && process.env?.[name]) ||
    ''
  ).trim();
}

function getProviders(mode: string): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  const qwenKey = getEnv('QWEN_API_KEY') || getEnv('OPENAI_API_KEY');
  const qwenUrl =
    getEnv('QWEN_BASE_URL') ||
    getEnv('OPENAI_BASE_URL');

  const qwenModel =
    getEnv('QWEN_MODEL') ||
    'qwen-plus';

  if (qwenKey && qwenUrl) {
    providers.push({
      name: 'QWEN',
      baseUrl: qwenUrl,
      apiKey: qwenKey,
      model: qwenModel,
    });
  }

  const deepseekKey =
    getEnv('DEEPSEEK_API_KEY');

  const deepseekUrl =
    getEnv('DEEPSEEK_BASE_URL') ||
    'https://api.deepseek.com';

  const deepseekModel =
    getEnv('DEEPSEEK_MODEL') ||
    (mode === 'DEEP' ? 'deepseek-reasoner' : 'deepseek-chat');

  if (deepseekKey) {
    providers.push({
      name: 'DEEPSEEK',
      baseUrl: deepseekUrl,
      apiKey: deepseekKey,
      model: deepseekModel,
    });
  }

  return providers;
}

function extractText(delta: any): string {
  return (
    delta?.choices?.[0]?.delta?.content ||
    delta?.choices?.[0]?.message?.content ||
    ''
  );
}

function splitSentences(
  buffer: string
): { complete: string[]; remainder: string } {
  const parts = buffer.split(/(?<=[.!?؟])\s+/);
  const remainder = parts.pop() || '';

  return {
    complete: parts.filter(
      (x) => x.trim().length > 0
    ),
    remainder,
  };
}

export async function generateOpenSourceStream(
  params: AIStreamParams
): Promise<AIStreamResult | null> {
  const startedAt = Date.now();
  const providers = getProviders(params.mode || 'FAST');

  if (providers.length === 0) {
    console.warn(
      '[AIProviderGateway] No open-source provider configured.'
    );
    return null;
  }

  for (let providerIndex = 0; providerIndex < providers.length; providerIndex++) {
    const provider = providers[providerIndex];

    if (params.abortSignal?.aborted) {
      return null;
    }

    const modelStartedAt = Date.now();
    let firstTokenLatency = 0;
    let fullText = '';
    let sentenceBuffer = '';
    let firstSentence = true;

    try {
      const endpoint =
        `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

      const userText =
        typeof params.contents?.[0]?.parts?.[0]?.text === 'string'
          ? params.contents[0].parts[0].text
          : '';

      const messages: any[] = [];

      if (params.config?.systemInstruction) {
        messages.push({
          role: 'system',
          content: params.config.systemInstruction,
        });
      }

      messages.push({
        role: 'user',
        content: userText,
      });

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
        signal: params.abortSignal,
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `${provider.name} HTTP ${response.status}: ${errorText}`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (params.abortSignal?.aborted) {
          try {
            await reader.cancel();
          } catch (_) {}

          return null;
        }

        const { done, value } = await reader.read();

        if (done) break;

        const raw = decoder.decode(value, {
          stream: true,
        });

        const lines = raw.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || !trimmed.startsWith('data:')) {
            continue;
          }

          const data = trimmed.slice(5).trim();

          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const text = extractText(parsed);

            if (!text) continue;

            if (firstTokenLatency === 0) {
              firstTokenLatency =
                Date.now() - modelStartedAt;
            }

            fullText += text;
            sentenceBuffer += text;

            params.onChunk?.(text);

            const sentenceResult =
              splitSentences(sentenceBuffer);

            sentenceBuffer =
              sentenceResult.remainder;

            for (const sentence of sentenceResult.complete) {
              params.onSentence?.(
                sentence,
                firstSentence
              );

              firstSentence = false;
            }
          } catch (_) {
            // Ignore malformed/non-JSON SSE frames.
          }
        }
      }

      // Flush final sentence.
      if (sentenceBuffer.trim()) {
        params.onSentence?.(
          sentenceBuffer.trim(),
          firstSentence
        );
      }

      return {
        fullText,
        activeModel: provider.model,
        engineMode:
          providerIndex === 0
            ? 'OPEN_SOURCE_PRIMARY'
            : 'OPEN_SOURCE_SECONDARY',
        metrics: {
          model_ttft: firstTokenLatency,
          model_total_latency:
            Date.now() - modelStartedAt,
        },
      };
    } catch (error: any) {
      if (params.abortSignal?.aborted) {
        return null;
      }

      console.warn(
        `[AIProviderGateway] ${provider.name} failed:`,
        error?.message || error
      );

      // Automatically try the next provider.
      continue;
    }
  }

  console.error(
    '[AIProviderGateway] All open-source providers failed.'
  );

  return null;
}

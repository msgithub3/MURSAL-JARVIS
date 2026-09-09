/**
 * MURSAL JARVIS — Sentence Chunker for Streaming Voice & TTS
 * 
 * Splits incoming AI token stream into natural, grammatical sentences
 * supporting English, Urdu (۔, ؟), and Hindi/Arabic punctuation marks.
 * Emits sentences immediately to TTS so audio begins playing with minimum TTFT.
 */

export type SentenceCallback = (sentence: string, isFirst: boolean) => void;

export class SentenceChunker {
  private buffer: string = '';
  private listeners: SentenceCallback[] = [];
  private isFirst: boolean = true;
  private sentenceCount: number = 0;

  public onSentence(callback: SentenceCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public append(chunk: string): void {
    this.buffer += chunk;

    // Look for sentence terminators followed by whitespace or quotes
    const parts = this.buffer.split(/(?<=[.!?؟\n])\s+/);
    if (parts.length > 1) {
      // The last element is the incomplete remainder
      const remainder = parts.pop() || '';
      for (const completeSentence of parts) {
        const trimmed = completeSentence.trim();
        if (trimmed.length > 0) {
          this.emit(trimmed);
        }
      }
      this.buffer = remainder;
    }
  }

  public flush(): void {
    const trimmed = this.buffer.trim();
    if (trimmed.length > 0) {
      this.emit(trimmed);
      this.buffer = '';
    }
  }

  public reset(): void {
    this.buffer = '';
    this.isFirst = true;
    this.sentenceCount = 0;
  }

  public getSentenceCount(): number {
    return this.sentenceCount;
  }

  private emit(sentence: string): void {
    const isFirstSentence = this.isFirst;
    this.isFirst = false;
    this.sentenceCount++;
    for (const listener of this.listeners) {
      try {
        listener(sentence, isFirstSentence);
      } catch (err) {
        console.warn('[SentenceChunker] Error in sentence listener:', err);
      }
    }
  }
}

export function splitSentences(buffer: string): { complete: string[]; remainder: string } {
  const parts = buffer.split(/(?<=[.!?؟])\s+/);
  const remainder = parts.pop() || '';
  return {
    complete: parts.filter((x) => x.trim().length > 0),
    remainder,
  };
}

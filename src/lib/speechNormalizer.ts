/**
 * MURSAL JARVIS — Voice & Pronunciation Normalization Engine
 * 
 * Mandates:
 * 1. MursalCart Pronunciation Fix:
 *    "MursalCart", "Mursal Cart", "MURSALCART" MUST be pronounced as ONE WORD.
 *    Never spelled character-by-character (e.g., M - U - R - S - A - L) unless
 *    user explicitly asks "spell MursalCart" or "letters batao".
 * 2. Pronunciation Dictionary for Technical Acronyms (API, OCR, GPU, CPU, AI, STT, TTS, etc.)
 * 3. Text Normalization:
 *    - Strips markdown (bold, italic, code blocks, headers, blockquotes)
 *    - Strips raw JSON objects and logs
 *    - Normalizes emojis to empty or spoken equivalents
 *    - Natural sentence phrasing (removing robot repetition like repetitive "Jani")
 */

export interface PronunciationRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...args: any[]) => string);
  description: string;
}

export class SpeechNormalizer {
  // Canonical dictionary of terms that require specific acoustic phonetic expansions
  private pronunciationDictionary: PronunciationRule[] = [
    // 1. MursalCart — Critical Brand Pronunciation Fix
    // Must be spoken smoothly as a single unit without pausing or individual letters
    {
      pattern: /\b(?:MursalCart|Mursal\s+Cart|MURSALCART|mursalcart|Mursalcart)\b/g,
      replacement: 'MursalCart',
      description: 'Canonical single-word brand name for MursalCart',
    },
    // 2. Technical Acronyms & AI Ecosystem terms
    {
      pattern: /\bMURSAL\s+JARVIS\b/gi,
      replacement: 'Mursal Jarvis',
      description: 'Mursal Jarvis title case natural cadence',
    },
    {
      pattern: /\bJARVIS\b/g,
      replacement: 'Jarvis',
      description: 'Jarvis natural case',
    },
    {
      pattern: /\bGemini\s+3\.8\s+Flash\b/gi,
      replacement: 'Jemini three point eight Flash',
      description: 'Gemini model acoustic name',
    },
    {
      pattern: /\bGemini\b/gi,
      replacement: 'Jemini',
      description: 'Phonetic English/Urdu match for Gemini',
    },
    {
      pattern: /\bWebSocket(?:s)?\b/gi,
      replacement: 'Web Socket',
      description: 'WebSocket split phonetics for clean TTS',
    },
    {
      pattern: /\bAPI(?:s)?\b/g,
      replacement: 'A P I',
      description: 'Spell out API acronym',
    },
    {
      pattern: /\bOCR\b/g,
      replacement: 'O C R',
      description: 'Spell out OCR acronym',
    },
    {
      pattern: /\bGPU(?:s)?\b/g,
      replacement: 'G P U',
      description: 'Spell out GPU acronym',
    },
    {
      pattern: /\bCPU(?:s)?\b/g,
      replacement: 'C P U',
      description: 'Spell out CPU acronym',
    },
    {
      pattern: /\bAI\b/g,
      replacement: 'A I',
      description: 'Spell out AI acronym',
    },
    {
      pattern: /\bSTT\b/g,
      replacement: 'S T T',
      description: 'Spell out STT acronym',
    },
    {
      pattern: /\bTTS\b/g,
      replacement: 'T T S',
      description: 'Spell out TTS acronym',
    },
    {
      pattern: /\bMediaProjection\b/gi,
      replacement: 'Media Projection',
      description: 'MediaProjection split phonetics',
    },
    {
      pattern: /\bAccessibilityService\b/gi,
      replacement: 'Accessibility Service',
      description: 'AccessibilityService split phonetics',
    },
    {
      pattern: /\bHUD\b/g,
      replacement: 'H U D',
      description: 'Spell out HUD',
    },
    {
      pattern: /\bCOD\b/g,
      replacement: 'Cash on Delivery',
      description: 'Expand COD for Pakistani ecommerce',
    },
    {
      pattern: /\bPKR\b/g,
      replacement: 'Rupees',
      description: 'Currency phonetic expansion',
    },
    {
      pattern: /\bWi-Fi\s*6\b/gi,
      replacement: 'Wi-Fi six',
      description: 'Wi-Fi 6 phonetic expansion',
    },
    {
      pattern: /\b5G\b/gi,
      replacement: 'Five G',
      description: '5G network phonetic expansion',
    },
    {
      pattern: /\b4G\b/gi,
      replacement: 'Four G',
      description: '4G network phonetic expansion',
    },
  ];

  /**
   * Cleans and normalizes text before feeding it to SpeechSynthesis / TTS.
   * Ensures markdown is stripped, technical terms are pronounced naturally,
   * and MursalCart is never spelled character by character.
   */
  public normalizeForSpeech(rawText: string, userQuery?: string): string {
    if (!rawText) return '';

    // Check if user specifically requested character-by-character spelling
    const isSpellingRequested = userQuery && /(?:spell|spelling|letters batao|alphabet|haraf)/i.test(userQuery);

    let text = rawText;

    // 1. Remove code blocks (```...```) entirely from spoken output
    text = text.replace(/```[\s\S]*?```/g, '');

    // 2. Remove inline code snippets (`code`)
    text = text.replace(/`([^`]+)`/g, '$1');

    // 3. Remove markdown images & links: [text](url) -> text
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

    // 4. Remove Markdown headers (# Header)
    text = text.replace(/^#{1,6}\s+/gm, '');

    // 5. Remove bold & italics (**bold**, *italic*, __bold__, _italic_)
    text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');

    // 6. Remove HTML tags (<p>, <div>, <br/>)
    text = text.replace(/<[^>]*>/g, ' ');

    // 7. Remove raw JSON objects or stack traces
    text = text.replace(/\{[^{}]*"[^"]+"\s*:[^{}]*\}/g, '');

    // 8. Remove raw URLs (https://...)
    text = text.replace(/https?:\/\/\S+/gi, 'link');

    // 9. Remove emojis and visual decorative glyphs
    text = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');

    // 10. Clean up bullet points, asterisks, and numbering prefixes (e.g., "1. ", "- ")
    text = text.replace(/^\s*[-*•]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');

    // 11. Apply Pronunciation Dictionary
    for (const rule of this.pronunciationDictionary) {
      if (rule.description.includes('MursalCart') && isSpellingRequested) {
        // If user explicitly asked to spell MursalCart, expand it letter by letter
        text = text.replace(rule.pattern, 'M, U, R, S, A, L, C, A, R, T');
      } else {
        text = text.replace(rule.pattern, rule.replacement as any);
      }
    }

    // 12. De-duplicate excessive conversational catchphrases like "Jani"
    // If "Jani" or "jani" appears more than once in a response, keep only the first one
    let janiCount = 0;
    text = text.replace(/\b([Jj]ani)\b/g, (match) => {
      janiCount++;
      return janiCount === 1 ? match : '';
    });

    // 13. Normalize punctuation and collapse multi-spaces
    text = text.replace(/[—_~|\\/[\]{}()<>]/g, ' ');
    text = text.replace(/\s{2,}/g, ' ');
    text = text.replace(/\s+([.,!?])/g, '$1');
    text = text.trim();

    return text;
  }

  /**
   * Tests if text contains MursalCart and confirms it is canonicalized
   */
  public isCanonicalMursalCart(text: string): boolean {
    return text.includes('MursalCart') && !/M\s*-\s*U\s*-\s*R\s*-\s*S\s*-\s*A\s*-\s*L/i.test(text);
  }
}

export const globalSpeechNormalizer = new SpeechNormalizer();

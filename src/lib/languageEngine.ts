/**
 * MURSAL JARVIS — Pakistani Multilingual Intelligence Engine
 * 
 * Supports:
 * - English (en)
 * - Urdu (ur)
 * - Roman Urdu (ur-Roman) [First-class language]
 * - Punjabi (pa)
 * - Saraiki (skr)
 * - Pashto (ps)
 * - Sindhi (sd)
 * - Automatic Language Detection
 * - Roman Urdu Normalization
 * - Interruption / Barge-in Detection
 * - Authentic Pakistani Conversational Tone (slang: jani, yaar, scene on, etc.)
 */

export type LanguageCode = 'auto' | 'en' | 'ur' | 'ur-Roman' | 'pa' | 'skr' | 'ps' | 'sd';

export interface LanguageDetectionResult {
  detectedLanguage: LanguageCode;
  confidence: number;
  isMultilingual: boolean;
  script: 'latin' | 'arabic' | 'mixed';
  detectedTokens: string[];
}

export interface RomanUrduNormalizationResult {
  original: string;
  normalized: string;
  corrections: Array<{ from: string; to: string }>;
}

// Common Roman Urdu spelling normalizations
const ROMAN_URDU_NORMALIZATION_MAP: Record<string, string> = {
  kia: 'kya',
  kyu: 'kyun',
  q: 'kyun',
  kyunkay: 'kyunke',
  he: 'hai',
  hen: 'hain',
  h: 'hai',
  mje: 'mujhe',
  mjhe: 'mujhe',
  muje: 'mujhe',
  mujhy: 'mujhe',
  tje: 'tujhe',
  tjhe: 'tujhe',
  krna: 'karna',
  krne: 'karne',
  kro: 'karo',
  krdo: 'kar do',
  kardo: 'kar do',
  krde: 'kar de',
  karde: 'kar de',
  kry: 'kare',
  kre: 'kare',
  ni: 'nahi',
  nhi: 'nahi',
  nh: 'nahi',
  nai: 'nahi',
  accha: 'acha',
  achha: 'acha',
  achaa: 'acha',
  thk: 'theek',
  thik: 'theek',
  thek: 'theek',
  bhae: 'bhai',
  bhaye: 'bhai',
  shukrya: 'shukriya',
  tnx: 'shukriya',
  thx: 'shukriya',
  ty: 'shukriya',
  zra: 'zara',
  btao: 'batao,',
  btaen: 'batayein',
  btaye: 'batayein',
  sunoo: 'suno',
  bhejo: 'bhej do',
  bhjo: 'bhej do',
  chla: 'chala',
  chlao: 'chala do',
  bandkrdo: 'band kar do',
  kholdo: 'khol do',
  kholoo: 'khol do',
  kal: 'kal',
  aj: 'aaj',
  subha: 'subah',
  shm: 'shaam',
  plz: 'bara-e-meherbani',
  pls: 'bara-e-meherbani',
};

// Language specific vocabulary indicators
const VOCAB_INDICATORS = {
  punjabi: [
    'kiddan', 'kidan', 'kiwe', 'kiwein', 'changa', 'kiven', 'sadda', 'twada',
    'tussi', 'assi', 'aaho', 'hanji', 'hor', 'dso', 'dasso', 'gal', 'karange',
    'kiti', 'changi', 'sohna', 'pind', 'mundeyo', 'kudiye', 'veere', 'paaji'
  ],
  saraiki: [
    'kivein', 'kevein', 'saeen', 'sain', 'thia', 'thea', 'thinda', 'thi',
    'vanj', 'vanjo', 'kon', 'kay', 'koon', 'asan', 'tusan', 'meda', 'teda',
    'kithan', 'hik', 'changa', 'bhalya', 'mitha'
  ],
  pashto: [
    'tsenga', 'sanga', 'ye', 'de', 'wrora', 'zama', 'staso', 'kor', 'der',
    'kha', 'manana', 'da', 'na', 'ao', 'pa', 'khudaay', 'pakhair', 'dera',
    'kho', 'kar'
  ],
  sindhi: [
    'kian', 'cha', 'ahyo', 'ada', 'muhinjo', 'tuhinjo', 'saeen', 'thendo',
    'theeyo', 'kon', 'na', 'bhala', 'mehrbani', 'kithay', 'tokhe', 'man'
  ],
  romanUrdu: [
    'kya', 'hai', 'hain', 'mujhe', 'mera', 'meri', 'aap', 'tum', 'kaisa', 'kaise',
    'theek', 'bilkul', 'jani', 'yaar', 'scene', 'kar', 'karo', 'kar do', 'chala',
    'band', 'khol', 'nahi', 'zara', 'abhi', 'baad', 'mein', 'se', 'ko', 'pe',
    'par', 'kal', 'aaj', 'suno', 'batao', 'dekh', 'dekho', 'bhej', 'shukriya',
    'walaykum', 'salam', 'karna', 'hoga', 'hogi', 'rakho', 'bolo', 'kaam', 'hukm'
  ]
};

// Interruption / Barge-in trigger tokens
const INTERRUPTION_PHRASES = [
  'ruk jao',
  'ruko',
  'ruk jao jani',
  'bas',
  'bas karo',
  'stop',
  'cancel',
  'chup',
  'chup ho jao',
  'chup kar',
  'never mind',
  'hold on',
  'wait',
  'band karo',
  'rehne do',
  'khatam karo',
  'silent',
  'mute'
];

/**
 * Normalizes Roman Urdu text to standardized spelling.
 */
export function normalizeRomanUrdu(text: string): RomanUrduNormalizationResult {
  const words = text.split(/(\s+|[.,!?;:])/);
  const corrections: Array<{ from: string; to: string }> = [];

  const normalizedWords = words.map((token) => {
    const clean = token.toLowerCase().trim();
    if (ROMAN_URDU_NORMALIZATION_MAP[clean]) {
      const replacement = ROMAN_URDU_NORMALIZATION_MAP[clean];
      corrections.push({ from: token, to: replacement });
      return replacement;
    }
    return token;
  });

  return {
    original: text,
    normalized: normalizedWords.join(''),
    corrections,
  };
}

/**
 * Detects whether a spoken or typed text is an interruption / barge-in command.
 */
export function isInterruptionCommand(text: string): boolean {
  if (!text) return false;
  const clean = text.toLowerCase().trim().replace(/[.,!?;:]/g, '');
  return INTERRUPTION_PHRASES.some((phrase) => clean === phrase || clean.startsWith(phrase + ' ') || clean.endsWith(' ' + phrase));
}

/**
 * Detects language and script from input text.
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      detectedLanguage: 'en',
      confidence: 0.5,
      isMultilingual: false,
      script: 'latin',
      detectedTokens: [],
    };
  }

  // Check script
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const latinRegex = /[A-Za-z]/g;

  const arabicChars = (text.match(arabicRegex) || []).length;
  const latinChars = (text.match(latinRegex) || []).length;

  let script: 'latin' | 'arabic' | 'mixed' = 'latin';
  if (arabicChars > 0 && latinChars > 0) {
    script = 'mixed';
  } else if (arabicChars > latinChars) {
    script = 'arabic';
  }

  // If written in Arabic/Perso-Arabic script:
  if (script === 'arabic' || (script === 'mixed' && arabicChars > 5)) {
    // Specific Pashto characters: ټ, څ, ځ, ډ, ړ, ږ, ښ, ڼ, ۍ, ې
    if (/[ټڅځډړږښڼۍې]/.test(text)) {
      return {
        detectedLanguage: 'ps',
        confidence: 0.9,
        isMultilingual: script === 'mixed',
        script,
        detectedTokens: ['pashto_script_chars'],
      };
    }
    // Specific Sindhi characters: ٻ, ڄ, ڃ, ڇ, ڌ, ڏ, ڊ, ڍ, ڙ, ڦ, ڪ, ڳ, ڱ, ڻ
    if (/[ٻڄڃڇڌڏڊڍڙڦڪڳڱڻ]/.test(text)) {
      return {
        detectedLanguage: 'sd',
        confidence: 0.9,
        isMultilingual: script === 'mixed',
        script,
        detectedTokens: ['sindhi_script_chars'],
      };
    }
    // Urdu / Shahmukhi Punjabi / Saraiki
    if (/[ٹڈڑںےہھ]/.test(text)) {
      // Check Punjabi words in Shahmukhi
      if (text.includes('کی حال') || text.includes('چنگا') || text.includes('تسی') || text.includes('اسی')) {
        return {
          detectedLanguage: 'pa',
          confidence: 0.85,
          isMultilingual: script === 'mixed',
          script,
          detectedTokens: ['punjabi_shahmukhi'],
        };
      }
      if (text.includes('سائیں') || text.includes('تھی گیا') || text.includes('کینویں')) {
        return {
          detectedLanguage: 'skr',
          confidence: 0.85,
          isMultilingual: script === 'mixed',
          script,
          detectedTokens: ['saraiki_shahmukhi'],
        };
      }
      return {
        detectedLanguage: 'ur',
        confidence: 0.95,
        isMultilingual: script === 'mixed',
        script,
        detectedTokens: ['urdu_script'],
      };
    }
  }

  // Latin / Romanized text analysis
  const normalized = normalizeRomanUrdu(text).normalized.toLowerCase();
  const words = normalized.split(/\W+/).filter(Boolean);

  const matchedTokens: string[] = [];

  // Punjabi check
  let punjabiScore = 0;
  VOCAB_INDICATORS.punjabi.forEach((w) => {
    if (words.includes(w)) {
      punjabiScore += 1;
      matchedTokens.push(`pa:${w}`);
    }
  });

  // Saraiki check
  let saraikiScore = 0;
  VOCAB_INDICATORS.saraiki.forEach((w) => {
    if (words.includes(w)) {
      saraikiScore += 1;
      matchedTokens.push(`skr:${w}`);
    }
  });

  // Pashto check
  let pashtoScore = 0;
  VOCAB_INDICATORS.pashto.forEach((w) => {
    if (words.includes(w)) {
      pashtoScore += 1;
      matchedTokens.push(`ps:${w}`);
    }
  });

  // Sindhi check
  let sindhiScore = 0;
  VOCAB_INDICATORS.sindhi.forEach((w) => {
    if (words.includes(w)) {
      sindhiScore += 1;
      matchedTokens.push(`sd:${w}`);
    }
  });

  // Roman Urdu check
  let romanUrduScore = 0;
  VOCAB_INDICATORS.romanUrdu.forEach((w) => {
    if (words.includes(w)) {
      romanUrduScore += 1;
      matchedTokens.push(`ur-Roman:${w}`);
    }
  });

  if (saraikiScore > 0 && saraikiScore >= punjabiScore && saraikiScore >= romanUrduScore) {
    return {
      detectedLanguage: 'skr',
      confidence: 0.85,
      isMultilingual: words.length > saraikiScore,
      script,
      detectedTokens: matchedTokens,
    };
  }

  if (punjabiScore > 0 && punjabiScore >= romanUrduScore) {
    return {
      detectedLanguage: 'pa',
      confidence: 0.85,
      isMultilingual: words.length > punjabiScore,
      script,
      detectedTokens: matchedTokens,
    };
  }

  if (pashtoScore > 0 && pashtoScore >= romanUrduScore) {
    return {
      detectedLanguage: 'ps',
      confidence: 0.85,
      isMultilingual: words.length > pashtoScore,
      script,
      detectedTokens: matchedTokens,
    };
  }

  if (sindhiScore > 0 && sindhiScore >= romanUrduScore) {
    return {
      detectedLanguage: 'sd',
      confidence: 0.85,
      isMultilingual: words.length > sindhiScore,
      script,
      detectedTokens: matchedTokens,
    };
  }

  if (romanUrduScore > 0) {
    return {
      detectedLanguage: 'ur-Roman',
      confidence: Math.min(0.95, 0.4 + romanUrduScore * 0.15),
      isMultilingual: words.some(w => ['open', 'battery', 'wifi', 'bluetooth', 'call', 'daraz', 'status', 'check', 'product'].includes(w)),
      script,
      detectedTokens: matchedTokens,
    };
  }

  // Default to English
  return {
    detectedLanguage: 'en',
    confidence: 0.8,
    isMultilingual: false,
    script: 'latin',
    detectedTokens: [],
  };
}

/**
 * Returns conversational Pakistani localized feedback based on target language.
 */
export function getLocalizedVoiceAck(action: string, lang: LanguageCode, params?: Record<string, any>): string {
  switch (action) {
    case 'BATTERY_STATUS': {
      const level = params?.level ?? 88;
      switch (lang) {
        case 'ur-Roman':
          return `Jani, battery ${level} percent hai aur device bilkul theek chal raha hai.`;
        case 'ur':
          return `جانی، بیٹری ${level} فیصد ہے اور ڈیوائس بالکل ٹھیک چل رہی ہے۔`;
        case 'pa':
          return `یار، بیٹری ${level} فیصد اے تے فون بالکل فِٹ چل ریا اے۔`;
        case 'skr':
          return `سائیں، بیٹری ${level} فیصد ہے تے سب کجھ ٹھیک ہے۔`;
        case 'ps':
          return `وروره، بیٹری ${level} سلنه ده او موبایل بالکل صحیح دی.`;
        case 'sd':
          return `ادا، بيٽري ${level} سيڪڙو آهي ۽ فون زبردست هلي رهيو آهي.`;
        case 'en':
        default:
          return `Mursaleen, battery level is at ${level} percent. System is nominal.`;
      }
    }

    case 'FLASHLIGHT_TOGGLE': {
      const state = params?.state ? 'on' : 'off';
      switch (lang) {
        case 'ur-Roman':
          return state === 'on' ? 'Done jani! Flashlight on kar di hai.' : 'Done jani! Flashlight band kar di hai.';
        case 'ur':
          return state === 'on' ? 'لیجیے جانی! فلیش لائٹ آن کر دی ہے۔' : 'لیجیے جانی! فلیش لائٹ بند کر دی ہے۔';
        case 'pa':
          return state === 'on' ? 'ہاں جی، ٹارچ جلا دتی اے!' : 'ٹارچ بند کر دتی اے جی!';
        case 'skr':
          return state === 'on' ? 'سائیں، لائٹ جل گئی ہے!' : 'سائیں، لائٹ بند تھی گئی ہے۔';
        case 'ps':
          return state === 'on' ? 'وروره، څراغ روښانه شو!' : 'څراغ بند شو وروره!';
        case 'sd':
          return state === 'on' ? 'ادا، فليش آن ڪئي وئي!' : 'ادا، فليش بند ڪئي وئي!';
        case 'en':
        default:
          return `Flashlight turned ${state}.`;
      }
    }

    case 'VOLUME_SET': {
      const level = params?.level ?? 70;
      switch (lang) {
        case 'ur-Roman':
          return `Theek hai jani! Volume ${level} percent pe set kar diya hai.`;
        case 'ur':
          return `ٹھیک ہے جانی! آواز ${level} فیصد پر سیٹ کر دی گئی ہے۔`;
        case 'pa':
          return `والیم ${level} فیصد تے کر دتا اے۔`;
        case 'skr':
          return `سائیں، اواز ${level} فیصد تے سیٹ تھی گئی ہے۔`;
        case 'ps':
          return `آواز ${level} سلنې ته برابر شو وروره.`;
        case 'sd':
          return `ادا، آواز ${level} سيڪڙو تي رکيو ويو آهي.`;
        case 'en':
        default:
          return `Volume adjusted to ${level} percent.`;
      }
    }

    case 'CONFIRM_SENSITIVE': {
      switch (lang) {
        case 'ur-Roman':
          return 'Jani, ye action thora sensitive hai. Kar doon? Aap confirm karein.';
        case 'ur':
          return 'جانی، یہ ایکشن ذرا حساس ہے۔ کیا میں کر دوں؟ تصدیق فرمائیں۔';
        case 'pa':
          return 'یار، ایہ کم حساس اے۔ کی میں پکا کر دیواں؟';
        case 'skr':
          return 'سائیں، اے کم نازک ہے۔ کی ایں کر چھوڑاں؟';
        case 'ps':
          return 'وروره، دا حساس کار دی. ایا زه یې وکړم؟ تایید کړه.';
        case 'sd':
          return 'ادا، هي ڪم نازڪ آهي. ڇا مان ڪري ڇڏيان؟';
        case 'en':
        default:
          return 'This is a sensitive device action. Do you want me to proceed?';
      }
    }

    case 'INTERRUPTED': {
      switch (lang) {
        case 'ur-Roman':
          return 'Ruk gaya jani! Batayein ab kya hukam hai?';
        case 'ur':
          return 'رک گیا جانی! بتائیں اب کیا حکم ہے؟';
        case 'pa':
          return 'ہاں جی، میں رک گیا واں! دسو کی کہندے او؟';
        case 'skr':
          return 'سائیں، میں رک گیاں! حکم کرو۔';
        case 'ps':
          return 'وروره ودریدم! ووایه څه وکړم؟';
        case 'sd':
          return 'ادا، مان بيهي رهيس! چئو ڇا حڪم آهي؟';
        case 'en':
        default:
          return 'Paused. Standing by for your command, Mursaleen.';
      }
    }

    default:
      return 'Hukam karein jani! JARVIS bilkul tayyar hai.';
  }
}

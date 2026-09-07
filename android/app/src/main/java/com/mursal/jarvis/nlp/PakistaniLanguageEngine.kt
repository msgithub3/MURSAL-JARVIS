package com.mursal.jarvis.nlp

/**
 * MURSAL JARVIS — Native Android Pakistani Multilingual NLP Engine
 * 
 * Supports:
 * - Urdu (اردو), Roman Urdu, Punjabi, Saraiki, Pashto, Sindhi, English
 * - Roman Urdu Normalization
 * - Natural Pakistani Conversational Expressions (jani, yaar, theek hai, bilkul)
 * - Interruption / Barge-in detection ("ruk jao", "bas", "stop", "chup")
 */
class PakistaniLanguageEngine {

    enum class Language {
        ENGLISH,
        URDU_SCRIPT,
        ROMAN_URDU,
        PUNJABI,
        SARAIKI,
        PASHTO,
        SINDHI
    }

    private val interruptionPhrases = setOf(
        "ruk jao", "ruko", "bas", "bas karo", "stop", "cancel",
        "chup", "chup ho jao", "chup kar", "never mind", "hold on", "wait", "band karo"
    )

    private val romanUrduMap = mapOf(
        "kia" to "kya",
        "kyu" to "kyun",
        "he" to "hai",
        "hen" to "hain",
        "mje" to "mujhe",
        "mjhe" to "mujhe",
        "krna" to "karna",
        "kro" to "karo",
        "krdo" to "kar do",
        "ni" to "nahi",
        "nhi" to "nahi",
        "accha" to "acha",
        "thk" to "theek",
        "bhae" to "bhai",
        "shukrya" to "shukriya",
        "zra" to "zara",
        "btao" to "batao"
    )

    /**
     * Checks if the user uttered an interruption or barge-in hot-phrase
     */
    fun isInterruption(text: String): Boolean {
        val clean = text.lowercase().trim().replace(Regex("[.,!?;:]"), "")
        return interruptionPhrases.any { clean == it || clean.startsWith("$it ") || clean.endsWith(" $it") }
    }

    /**
     * Normalizes Roman Urdu spelling to standard forms
     */
    fun normalizeRomanUrdu(text: String): String {
        val words = text.split("\\s+".toRegex())
        return words.joinToString(" ") { word ->
            val clean = word.lowercase().trim()
            romanUrduMap[clean] ?: word
        }
    }

    /**
     * Detects language and script
     */
    fun detectLanguage(text: String): Language {
        val arabicCharCount = text.count { it in '\u0600'..'\u06FF' }
        if (arabicCharCount > text.length * 0.3) {
            // Check script features
            if (text.any { it in "ټڅځډړږښڼۍې" }) return Language.PASHTO
            if (text.any { it in "ٻڄڃڇڌڏڊڍڙڦڪڳڱڻ" }) return Language.SINDHI
            if (text.contains("کی حال") || text.contains("چنگا")) return Language.PUNJABI
            if (text.contains("سائیں") || text.contains("تھی گیا")) return Language.SARAIKI
            return Language.URDU_SCRIPT
        }

        val normalized = normalizeRomanUrdu(text).lowercase()
        val words = normalized.split("\\W+".toRegex())

        if (words.any { it in listOf("kiddan", "kiwe", "changa", "sadda", "twada", "tussi", "dso") }) {
            return Language.PUNJABI
        }
        if (words.any { it in listOf("kivein", "saeen", "sain", "thia", "thinda", "meda", "teda") }) {
            return Language.SARAIKI
        }
        if (words.any { it in listOf("tsenga", "sanga", "wrora", "zama", "staso", "manana") }) {
            return Language.PASHTO
        }
        if (words.any { it in listOf("kian", "ahyo", "ada", "muhinjo", "tuhinjo", "thendo") }) {
            return Language.SINDHI
        }
        if (words.any { it in listOf("kya", "hai", "hain", "mujhe", "jani", "yaar", "theek", "bilkul", "karo", "batao", "scene") }) {
            return Language.ROMAN_URDU
        }

        return Language.ENGLISH
    }

    /**
     * Generates a natural Pakistani colloquial spoken greeting or acknowledgement
     */
    fun getConversationalAck(actionKey: String, lang: Language): String {
        return when (lang) {
            Language.ROMAN_URDU -> "Jani, hukam karein! JARVIS tayyar hai."
            Language.URDU_SCRIPT -> "جانی، حکم کریں! جاروس بالکل تیار ہے۔"
            Language.PUNJABI -> "یار، کی حال چال اے؟ جاروس حاضر اے۔"
            Language.SARAIKI -> "سائیں، حکم کرو! جاروس حاضر ہے۔"
            Language.PASHTO -> "وروره، څه امر دی؟ جاروس چمتو دی."
            Language.SINDHI -> "ادا، حڪم ڪيو! جاروس حاضر آهي."
            Language.ENGLISH -> "Online and ready, Mursaleen. What is your command?"
        }
    }
}

package com.mursal.jarvis.core

/**
 * 7-Phase Deterministic Voice & Reasoning State Machine
 * Compliant with MURSAL JARVIS Architecture Specification:
 * STANDBY -> WAKE_WORD_DETECTED -> LISTENING_FOR_COMMAND -> TRANSCRIBING -> THINKING -> TOOL_EXECUTION -> SPEAKING -> STANDBY
 */
enum class JarvisState {
    STANDBY,
    WAKE_WORD_DETECTED,
    LISTENING_FOR_COMMAND,
    TRANSCRIBING,
    THINKING,
    TOOL_EXECUTION,
    SPEAKING
}

sealed class JarvisEvent {
    data class WakeWordTriggered(val phrase: String) : JarvisEvent()
    data class SpeechCaptured(val audioDurationMs: Long) : JarvisEvent()
    data class TranscriptionComplete(val text: String, val language: String) : JarvisEvent()
    data class ReasoningComplete(val responseText: String, val requiresTool: Boolean) : JarvisEvent()
    data class ToolCompleted(val toolName: String, val success: Boolean) : JarvisEvent()
    object SpeechFinished : JarvisEvent()
    object CancelOrTimeout : JarvisEvent()
    object ForceReset : JarvisEvent()
}

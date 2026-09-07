package com.mursal.jarvis.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class JarvisStateMachine(
    private val onStateChanged: ((JarvisState) -> Unit)? = null
) {
    private val _currentState = MutableStateFlow(JarvisState.STANDBY)
    val currentState: StateFlow<JarvisState> = _currentState.asStateFlow()

    val validWakePhrases = setOf(
        "hey jarvis",
        "wake up jarvis",
        "hey mursal",
        "jarvis",
        "hello jarvis"
    )

    fun transition(event: JarvisEvent): JarvisState {
        val current = _currentState.value
        val nextState = when (event) {
            is JarvisEvent.WakeWordTriggered -> {
                if (current == JarvisState.STANDBY) {
                    JarvisState.WAKE_WORD_DETECTED
                } else current
            }
            is JarvisEvent.SpeechCaptured -> {
                if (current == JarvisState.WAKE_WORD_DETECTED || current == JarvisState.LISTENING_FOR_COMMAND) {
                    JarvisState.TRANSCRIBING
                } else current
            }
            is JarvisEvent.TranscriptionComplete -> {
                if (current == JarvisState.TRANSCRIBING) {
                    JarvisState.THINKING
                } else current
            }
            is JarvisEvent.ReasoningComplete -> {
                if (current == JarvisState.THINKING) {
                    if (event.requiresTool) JarvisState.TOOL_EXECUTION else JarvisState.SPEAKING
                } else current
            }
            is JarvisEvent.ToolCompleted -> {
                if (current == JarvisState.TOOL_EXECUTION) {
                    JarvisState.SPEAKING
                } else current
            }
            is JarvisEvent.SpeechFinished -> {
                if (current == JarvisState.SPEAKING) {
                    JarvisState.STANDBY
                } else current
            }
            is JarvisEvent.CancelOrTimeout -> JarvisState.STANDBY
            is JarvisEvent.ForceReset -> JarvisState.STANDBY
        }

        if (nextState != current) {
            _currentState.value = nextState
            onStateChanged?.invoke(nextState)
        }
        return nextState
    }

    fun isWakePhraseMatch(input: String): Boolean {
        val normalized = input.trim().lowercase()
        return validWakePhrases.any { phrase ->
            normalized.contains(phrase)
        }
    }
}

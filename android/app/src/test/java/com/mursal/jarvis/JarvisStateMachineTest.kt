package com.mursal.jarvis

import com.mursal.jarvis.core.JarvisEvent
import com.mursal.jarvis.core.JarvisState
import com.mursal.jarvis.core.JarvisStateMachine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class JarvisStateMachineTest {

    private lateinit var stateMachine: JarvisStateMachine

    @Before
    fun setUp() {
        stateMachine = JarvisStateMachine()
    }

    @Test
    fun testInitialStateIsStandby() {
        assertEquals(JarvisState.STANDBY, stateMachine.currentState.value)
    }

    @Test
    fun testWakeWordDetectionTransitionsState() {
        val newState = stateMachine.transition(JarvisEvent.WakeWordTriggered("Hey JARVIS"))
        assertEquals(JarvisState.WAKE_WORD_DETECTED, newState)
    }

    @Test
    fun testCompleteVoiceReasoningCycle() {
        // STANDBY -> WAKE_WORD_DETECTED
        stateMachine.transition(JarvisEvent.WakeWordTriggered("Hey JARVIS"))
        assertEquals(JarvisState.WAKE_WORD_DETECTED, stateMachine.currentState.value)

        // -> TRANSCRIBING
        stateMachine.transition(JarvisEvent.SpeechCaptured(1200L))
        assertEquals(JarvisState.TRANSCRIBING, stateMachine.currentState.value)

        // -> THINKING
        stateMachine.transition(JarvisEvent.TranscriptionComplete("What is the top e-commerce product?", "en"))
        assertEquals(JarvisState.THINKING, stateMachine.currentState.value)

        // -> TOOL_EXECUTION (requires tool)
        stateMachine.transition(JarvisEvent.ReasoningComplete("Evaluating product...", true))
        assertEquals(JarvisState.TOOL_EXECUTION, stateMachine.currentState.value)

        // -> SPEAKING
        stateMachine.transition(JarvisEvent.ToolCompleted("mursalcart_evaluator", true))
        assertEquals(JarvisState.SPEAKING, stateMachine.currentState.value)

        // -> STANDBY
        stateMachine.transition(JarvisEvent.SpeechFinished)
        assertEquals(JarvisState.STANDBY, stateMachine.currentState.value)
    }

    @Test
    fun testWakePhraseMatcherRecognizesPhrases() {
        assertTrue(stateMachine.isWakePhraseMatch("Hey JARVIS check status"))
        assertTrue(stateMachine.isWakePhraseMatch("WAKE UP JARVIS"))
        assertTrue(stateMachine.isWakePhraseMatch("hey mursal"))
        assertTrue(stateMachine.isWakePhraseMatch("jarvis what time is it?"))
    }
}

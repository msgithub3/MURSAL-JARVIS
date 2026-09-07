package com.mursal.jarvis.service

import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.util.Log

/**
 * MURSAL JARVIS — Native Android VoiceInteractionService
 * 
 * Enables MURSAL JARVIS to serve as the default Assistant application on Android,
 * responding to the system assist gesture (holding home button / power key swipe).
 */
class JarvisVoiceInteractionService : VoiceInteractionService() {

    companion object {
        private const val TAG = "JarvisVoiceInteraction"
        var isServiceActive: Boolean = false
            private set
    }

    override fun onReady() {
        super.onReady()
        isServiceActive = true
        Log.i(TAG, "MURSAL JARVIS is active as default Android Assistant.")
    }

    override fun onShutdown() {
        super.onShutdown()
        isServiceActive = false
        Log.i(TAG, "Jarvis VoiceInteractionService shutdown.")
    }
}

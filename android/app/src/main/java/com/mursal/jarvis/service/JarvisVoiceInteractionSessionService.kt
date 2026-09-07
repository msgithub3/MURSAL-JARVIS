package com.mursal.jarvis.service

import android.content.Context
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log

/**
 * Session service for MURSAL JARVIS voice assist interactions
 */
class JarvisVoiceInteractionSessionService : VoiceInteractionSessionService() {

    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        Log.i("JarvisVoiceSession", "New Voice Assist session initiated.")
        return JarvisVoiceSession(this)
    }

    private class JarvisVoiceSession(context: Context) : VoiceInteractionSession(context) {
        override fun onHandleAssist(
            data: Bundle?,
            structure: android.app.assist.AssistStructure?,
            content: android.app.assist.AssistContent?
        ) {
            super.onHandleAssist(data, structure, content)
            Log.d("JarvisVoiceSession", "Assisting user with contextual screen data.")
        }
    }
}

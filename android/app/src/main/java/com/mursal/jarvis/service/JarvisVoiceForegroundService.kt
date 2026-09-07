package com.mursal.jarvis.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.speech.tts.TextToSpeech
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mursal.jarvis.JarvisApplication
import com.mursal.jarvis.MainActivity
import com.mursal.jarvis.core.JarvisEvent
import com.mursal.jarvis.core.JarvisState
import com.mursal.jarvis.core.JarvisStateMachine
import com.mursal.jarvis.core.WakeWordDetector
import java.util.Locale

class JarvisVoiceForegroundService : Service(), TextToSpeech.OnInitListener {

    companion object {
        private const val TAG = "JarvisVoiceService"
        private const val NOTIFICATION_ID = 1001
        const val ACTION_START_VOICE = "ACTION_START_VOICE"
        const val ACTION_STOP_VOICE = "ACTION_STOP_VOICE"
    }

    private lateinit var stateMachine: JarvisStateMachine
    private var wakeWordDetector: WakeWordDetector? = null
    private var tts: TextToSpeech? = null
    private var isTtsReady = false

    override fun onCreate() {
        super.onCreate()
        stateMachine = JarvisStateMachine { newState ->
            updateNotification(newState)
        }

        wakeWordDetector = WakeWordDetector(this) { phrase ->
            Log.i(TAG, "Wake phrase intercepted: $phrase")
            stateMachine.transition(JarvisEvent.WakeWordTriggered(phrase))
            speak("Online and standing by, Mursaleen.")
        }

        tts = TextToSpeech(this, this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_VOICE -> {
                startForeground(NOTIFICATION_ID, buildNotification(JarvisState.STANDBY))
                wakeWordDetector?.startListening()
                Log.i(TAG, "Foreground voice service engaged.")
            }
            ACTION_STOP_VOICE -> {
                wakeWordDetector?.stopListening()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            isTtsReady = true
        }
    }

    fun speak(text: String) {
        if (isTtsReady) {
            stateMachine.transition(JarvisEvent.ReasoningComplete(text, false))
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "JARVIS_VOICE_OUT")
        }
    }

    private fun buildNotification(state: JarvisState): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        val statusDesc = when (state) {
            JarvisState.STANDBY -> "Standing by for \"Hey JARVIS\""
            JarvisState.WAKE_WORD_DETECTED -> "Wake phrase identified"
            JarvisState.LISTENING_FOR_COMMAND -> "Listening to command..."
            JarvisState.TRANSCRIBING -> "Transcribing speech..."
            JarvisState.THINKING -> "Gemini reasoning engine active..."
            JarvisState.TOOL_EXECUTION -> "Executing system / commerce tool..."
            JarvisState.SPEAKING -> "Delivering audio response..."
        }

        return NotificationCompat.Builder(this, JarvisApplication.VOICE_CHANNEL_ID)
            .setContentTitle("MURSAL JARVIS Sovereign Core")
            .setContentText(statusDesc)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(state: JarvisState) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(state))
    }

    override fun onDestroy() {
        super.onDestroy()
        wakeWordDetector?.stopListening()
        tts?.stop()
        tts?.shutdown()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

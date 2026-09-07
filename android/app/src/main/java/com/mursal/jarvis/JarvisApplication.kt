package com.mursal.jarvis

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log

class JarvisApplication : Application() {

    companion object {
        const val VOICE_CHANNEL_ID = "mursal_jarvis_voice_channel"
        const val ALERT_CHANNEL_ID = "mursal_jarvis_alert_channel"
        const val TAG = "MursalJarvisApp"
        lateinit var instance: JarvisApplication
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannels()
        Log.i(TAG, "MURSAL JARVIS System Initialized. E-Commerce & Voice Core Standing By.")
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            val voiceChannel = NotificationChannel(
                VOICE_CHANNEL_ID,
                "JARVIS Voice Engine",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Persistent foreground listening and audio visualizer"
                setShowBadge(false)
            }

            val alertChannel = NotificationChannel(
                ALERT_CHANNEL_ID,
                "JARVIS Anti-Loss & Commerce Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Priority alerts for device mesh security and order updates"
                enableVibration(true)
            }

            notificationManager.createNotificationChannel(voiceChannel)
            notificationManager.createNotificationChannel(alertChannel)
        }
    }
}

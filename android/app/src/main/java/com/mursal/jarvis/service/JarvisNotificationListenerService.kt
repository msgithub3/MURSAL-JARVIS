package com.mursal.jarvis.service

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class JarvisNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "JarvisNotification"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val packageName = sbn.packageName
        val extras = sbn.notification.extras
        val title = extras.getString("android.title") ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""

        // Specific detection for Pakistani E-Commerce & Customer inquiries (WhatsApp, Daraz, Markaz, Trax courier)
        if (packageName.contains("whatsapp") || packageName.contains("daraz") || packageName.contains("markaz")) {
            Log.i(TAG, "Incoming high-priority commerce/chat alert from $packageName: $title - $text")
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
    }
}

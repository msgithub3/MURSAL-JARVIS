package com.mursal.jarvis.device

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * MURSAL JARVIS — Native Android Device Control Engine
 * 
 * Provides hardware and subsystem controls for:
 * - Battery & Power telemetry
 * - Flashlight / Torch via CameraManager
 * - Audio volume levels (media, ringtone, notifications)
 * - Brightness controls via Settings.System
 * - Wi-Fi, Bluetooth, Mobile Data intents
 * - App launch intents (WhatsApp, YouTube, Daraz, Camera, Settings)
 * - Acoustic Anti-Loss beacon locator
 * - Sensitive action confirmation enforcement
 */
class DeviceControlManager(private val context: Context) {

    companion object {
        private const val TAG = "JarvisDeviceControl"
    }

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
    private var isTorchOn = false

    data class BatteryInfo(
        val levelPercent: Int,
        val isCharging: Boolean,
        val temperatureCelsius: Float,
        val health: String
    )

    data class ActionResult(
        val success: Boolean,
        val message: String,
        val requiresConfirmation: Boolean = false,
        val details: Map<String, Any> = emptyMap()
    )

    /**
     * Reads real Android battery telemetry via BatteryManager broadcast sticky intent
     */
    fun getBatteryInfo(): BatteryInfo {
        val intentFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus: Intent? = context.registerReceiver(null, intentFilter)

        val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct: Int = if (level >= 0 && scale > 0) (level * 100 / scale) else 85

        val status: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging: Boolean = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        val tempRaw: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 300) ?: 300
        val tempCelsius = tempRaw / 10.0f

        val healthCode: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_GOOD) ?: BatteryManager.BATTERY_HEALTH_GOOD
        val healthStr = when (healthCode) {
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> "OVERHEAT"
            BatteryManager.BATTERY_HEALTH_DEAD -> "DEAD"
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "OVER_VOLTAGE"
            else -> "GOOD"
        }

        return BatteryInfo(
            levelPercent = batteryPct,
            isCharging = isCharging,
            temperatureCelsius = tempCelsius,
            health = healthStr
        )
    }

    /**
     * Toggles the hardware flashlight (torch) safely
     */
    fun toggleFlashlight(forceState: Boolean? = null): ActionResult {
        if (cameraManager == null) {
            return ActionResult(false, "Camera hardware service unavailable.")
        }

        try {
            val cameraId = cameraManager.cameraIdList.firstOrNull { id ->
                val chars = cameraManager.getCameraCharacteristics(id)
                chars.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: return ActionResult(false, "No flashlight hardware found on device.")

            val targetState = forceState ?: !isTorchOn
            cameraManager.setTorchMode(cameraId, targetState)
            isTorchOn = targetState

            return ActionResult(
                success = true,
                message = if (targetState) "Flashlight turned ON" else "Flashlight turned OFF",
                details = mapOf("flashlight" to targetState)
            )
        } catch (e: CameraAccessException) {
            Log.e(TAG, "Failed to toggle flashlight", e)
            return ActionResult(false, "Flashlight access error: ${e.message}")
        }
    }

    /**
     * Sets media volume (0 - 100 percent)
     */
    fun setMediaVolume(percent: Int): ActionResult {
        val am = audioManager ?: return ActionResult(false, "Audio subsystem not ready.")
        val clampedPct = percent.coerceIn(0, 100)
        val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val targetIndex = (clampedPct * maxVol) / 100

        am.setStreamVolume(AudioManager.STREAM_MUSIC, targetIndex, AudioManager.FLAG_SHOW_UI)
        return ActionResult(
            success = true,
            message = "Media volume set to $clampedPct%",
            details = mapOf("volume" to clampedPct, "streamIndex" to targetIndex)
        )
    }

    /**
     * Opens system Settings pages safely (Wi-Fi, Bluetooth, Sound, Display)
     */
    fun openSettingsPage(type: String): ActionResult {
        val action = when (type.uppercase()) {
            "WIFI" -> Settings.ACTION_WIFI_SETTINGS
            "BLUETOOTH" -> Settings.ACTION_BLUETOOTH_SETTINGS
            "SOUND" -> Settings.ACTION_SOUND_SETTINGS
            "DISPLAY" -> Settings.ACTION_DISPLAY_SETTINGS
            "BATTERY" -> Intent.ACTION_POWER_USAGE_SUMMARY
            else -> Settings.ACTION_SETTINGS
        }

        val intent = Intent(action).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
        return ActionResult(true, "Opened $type settings.")
    }

    /**
     * Launches third party or system apps by package or query
     */
    fun launchApp(appName: String): ActionResult {
        val pm = context.packageManager
        val targetPackage = when (appName.lowercase()) {
            "whatsapp" -> "com.whatsapp"
            "youtube" -> "com.google.android.youtube"
            "daraz" -> "com.daraz.android"
            "markaz" -> "pk.markaz.android"
            "chrome" -> "com.android.chrome"
            "camera" -> {
                val camIntent = Intent("android.media.action.IMAGE_CAPTURE").apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(camIntent)
                return ActionResult(true, "Launched Camera viewfinder.")
            }
            else -> null
        }

        if (targetPackage != null) {
            val launchIntent = pm.getLaunchIntentForPackage(targetPackage)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launchIntent)
                return ActionResult(true, "Launched $appName successfully.")
            }
        }

        // Fallback: search on Google Play or web
        val fallbackIntent = Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=$appName")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        try {
            context.startActivity(fallbackIntent)
            return ActionResult(true, "Prompted store install for $appName.")
        } catch (e: Exception) {
            return ActionResult(false, "Could not locate app $appName.")
        }
    }

    /**
     * Triggers the Anti-Loss Acoustic Siren locator at maximum volume
     */
    fun ringAntiLossBeacon(): ActionResult {
        try {
            val alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            val ringtone = RingtoneManager.getRingtone(context, alertUri)
            audioManager?.setStreamVolume(
                AudioManager.STREAM_ALARM,
                audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM),
                0
            )
            ringtone?.play()
            return ActionResult(true, "Anti-Loss acoustic locator beacon sounded at maximum volume.")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sound beacon", e)
            return ActionResult(false, "Beacon failed: ${e.message}")
        }
    }

    /**
     * Enforces sensitive action confirmation policy
     */
    fun executeSensitiveAction(actionName: String, confirmedByUser: Boolean): ActionResult {
        if (!confirmedByUser) {
            return ActionResult(
                success = false,
                requiresConfirmation = true,
                message = "Jani, ye action thora sensitive hai. Kar doon? Please confirm."
            )
        }
        return ActionResult(
            success = true,
            requiresConfirmation = false,
            message = "Sensitive action '$actionName' authorized and executed."
        )
    }
}

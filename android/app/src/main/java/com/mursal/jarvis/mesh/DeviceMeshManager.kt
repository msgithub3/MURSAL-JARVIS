package com.mursal.jarvis.mesh

import android.content.Context
import android.os.BatteryManager
import android.util.Log
import java.util.UUID

data class MeshNode(
    val nodeId: String,
    val deviceName: String,
    val deviceType: String,
    val batteryPct: Int,
    val isOnline: Boolean,
    val isLocked: Boolean,
    val lastHeartbeatMs: Long
)

class DeviceMeshManager(private val context: Context) {

    companion object {
        private const val TAG = "DeviceMeshManager"
    }

    private val localNodeId = UUID.randomUUID().toString()
    private var isLocateAcousticAlarmTriggered = false
    private var isDeviceSecurityLocked = false

    fun getLocalBatteryLevel(): Int {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 85
    }

    fun buildLocalTelemetry(): MeshNode {
        return MeshNode(
            nodeId = localNodeId,
            deviceName = "Mursal Android Sovereign Client",
            deviceType = "android_phone",
            batteryPct = getLocalBatteryLevel(),
            isOnline = true,
            isLocked = isDeviceSecurityLocked,
            lastHeartbeatMs = System.currentTimeMillis()
        )
    }

    fun handleMeshCommand(command: String): String {
        return when (command) {
            "PING_LOCATE" -> {
                isLocateAcousticAlarmTriggered = true
                Log.i(TAG, "Anti-loss locator ping received. Emitting loud acoustic beacon.")
                "ACOUSTIC_BEACON_ACTIVE"
            }
            "TOGGLE_LOCK" -> {
                isDeviceSecurityLocked = !isDeviceSecurityLocked
                Log.w(TAG, "Security lock status set to $isDeviceSecurityLocked")
                if (isDeviceSecurityLocked) "DEVICE_SECURELY_LOCKED" else "DEVICE_UNLOCKED"
            }
            else -> "UNKNOWN_COMMAND"
        }
    }
}

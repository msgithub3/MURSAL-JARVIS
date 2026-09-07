package com.mursal.jarvis.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Android System Automation via AccessibilityService
 * Enables JARVIS to interact with the device UI, launch apps, scroll, and execute user commands legitimately.
 * 
 * Safe Action Primitives:
 * - OPEN_APP
 * - CLICK (by node text or coordinates)
 * - TYPE (text input injection)
 * - SCROLL (forward / backward)
 * - BACK & HOME (system global navigation)
 * - READ_TEXT (extract visible on-screen strings)
 * - VERIFY (verify target node or package is in foreground)
 */
class JarvisAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "JarvisAccessibility"
        var instance: JarvisAccessibilityService? = null
            private set
    }

    enum class ActionPrimitive {
        OPEN_APP,
        CLICK,
        TYPE,
        SCROLL,
        BACK,
        HOME,
        LONG_PRESS,
        READ_TEXT,
        VERIFY
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "MURSAL JARVIS Accessibility Engine connected and ready for device automation.")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val packageName = event.packageName?.toString() ?: ""
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            Log.d(TAG, "Window switched to package: $packageName")
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Accessibility service interrupted.")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    /**
     * Executes safe automation actions
     */
    fun performHomeNavigation(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

    fun performBackNavigation(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    fun launchApplication(packageName: String): Boolean {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        return if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(launchIntent)
            true
        } else {
            Log.e(TAG, "Package $packageName not found on device.")
            false
        }
    }

    /**
     * Finds and clicks an on-screen element with matching text
     */
    fun clickElementByText(targetText: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val nodes = root.findAccessibilityNodeInfosByText(targetText)
        for (node in nodes) {
            if (node.isClickable) {
                return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            // Check parent clickable container
            var parent = node.parent
            while (parent != null) {
                if (parent.isClickable) {
                    return parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                }
                parent = parent.parent
            }
        }
        return false
    }

    /**
     * Types text into the currently focused editable field
     */
    fun typeTextIntoFocused(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
        val arguments = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    }

    /**
     * Scrolls the current active scrollable list forward or backward
     */
    fun scrollList(forward: Boolean = true): Boolean {
        val root = rootInActiveWindow ?: return false
        val action = if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        return root.performAction(action)
    }

    /**
     * Reads all visible text on the current active screen
     */
    fun readScreenText(): List<String> {
        val results = mutableListOf<String>()
        val root = rootInActiveWindow ?: return results
        traverseAndCollectText(root, results)
        return results
    }

    private fun traverseAndCollectText(node: AccessibilityNodeInfo?, results: MutableList<String>) {
        if (node == null) return
        val text = node.text?.toString()?.trim()
        if (!text.isNullOrEmpty() && !results.contains(text)) {
            results.add(text)
        }
        for (i in 0 until node.childCount) {
            traverseAndCollectText(node.getChild(i), results)
        }
    }

    /**
     * Verifies if expected text is present on the current screen
     */
    fun verifyTextVisible(expectedText: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val nodes = root.findAccessibilityNodeInfosByText(expectedText)
        return nodes.isNotEmpty()
    }
}

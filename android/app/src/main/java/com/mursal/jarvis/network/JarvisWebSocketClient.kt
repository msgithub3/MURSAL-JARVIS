package com.mursal.jarvis.network

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * MURSAL JARVIS — Native Android Sovereign WebSocket Client
 * 
 * Implements the Unified Real-Time Protocol:
 * - State machine: IDLE, CONNECTING, OPEN, CLOSING, CLOSED, RECONNECTING
 * - Safe Send: Outbound message queueing prior to OPEN
 * - Safe Close: Eliminates "closed without being opened" errors
 * - Controlled Reconnect: Exponential backoff with jitter and max attempts
 * - Heartbeat Ping/Pong with RTT tracking
 * - Synchronizes full device telemetry with backend and web clients
 */
class JarvisWebSocketClient(
    private val context: Context,
    private val serverWsUrl: String = "ws://10.0.2.2:3000/api/jarvis/ws",
    private val sessionToken: String = "tok-mursal-s24-sovereign-mesh",
    private val listener: WebSocketEventListener? = null
) {
    companion object {
        private const val TAG = "JarvisWebSocketClient"
        private const val HEARTBEAT_INTERVAL_MS = 10000L
        private const val MAX_RECONNECT_ATTEMPTS = 10
        private const val INITIAL_BACKOFF_MS = 1000L
        private const val MAX_BACKOFF_MS = 15000L
    }

    enum class State {
        IDLE, CONNECTING, OPEN, CLOSING, CLOSED, ERROR, RECONNECTING
    }

    interface WebSocketEventListener {
        fun onStateChanged(state: State)
        fun onMessageReceived(type: String, payload: JSONObject)
        fun onError(category: String, message: String)
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // Indefinite read for persistent stream
        .pingInterval(10, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var currentState = State.IDLE
    private val isConnecting = AtomicBoolean(false)
    private val explicitDisconnect = AtomicBoolean(false)

    private val mainHandler = Handler(Looper.getMainLooper())
    private var reconnectAttempts = 0
    private val outgoingQueue = ConcurrentLinkedQueue<String>()

    private var lastPingSentAt: Long = 0
    private var lastPongReceivedAt: Long = 0

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            if (currentState == State.OPEN && webSocket != null) {
                lastPingSentAt = System.currentTimeMillis()
                val pingMsg = JSONObject().apply {
                    put("type", "PING")
                    put("timestamp", lastPingSentAt)
                }
                webSocket?.send(pingMsg.toString())
                mainHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    @Synchronized
    fun connect() {
        if (isConnecting.get() || currentState == State.OPEN) {
            Log.d(TAG, "Connect ignored: already connecting or open.")
            return
        }

        explicitDisconnect.set(false)
        isConnecting.set(true)
        updateState(State.CONNECTING)

        val request = Request.Builder()
            .url(serverWsUrl)
            .addHeader("X-Jarvis-Token", sessionToken)
            .addHeader("X-Client-Type", "android-native")
            .build()

        Log.i(TAG, "Initiating WebSocket connection to $serverWsUrl")

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                isConnecting.set(false)
                reconnectAttempts = 0

                if (explicitDisconnect.get()) {
                    Log.i(TAG, "Connection opened after explicit disconnect. Closing cleanly.")
                    ws.close(1000, "Disconnect requested during handshake")
                    return
                }

                updateState(State.OPEN)
                Log.i(TAG, "WebSocket connection established.")

                // Send HELLO handshake frame
                sendHelloHandshake()

                // Start Heartbeat
                mainHandler.post(heartbeatRunnable)

                // Drain pre-open queued messages
                drainQueue()
            }

            override fun onMessage(ws: WebSocket, text: String) {
                handleIncomingMessage(text)
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                updateState(State.CLOSING)
                Log.i(TAG, "WebSocket closing: $code / $reason")
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                isConnecting.set(false)
                mainHandler.removeCallbacks(heartbeatRunnable)
                updateState(State.CLOSED)
                Log.i(TAG, "WebSocket closed: $code / $reason")

                if (!explicitDisconnect.get()) {
                    scheduleReconnect()
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                isConnecting.set(false)
                mainHandler.removeCallbacks(heartbeatRunnable)
                updateState(State.ERROR)
                Log.w(TAG, "WebSocket failure: ${t.message}", t)
                listener?.onError("NETWORK_FAILURE", t.message ?: "Connection failure")

                if (!explicitDisconnect.get()) {
                    scheduleReconnect()
                }
            }
        })
    }

    private fun sendHelloHandshake() {
        val helloEnvelope = JSONObject().apply {
            put("type", "HELLO")
            put("version", "1.0.0")
            put("id", "android-init-${System.currentTimeMillis()}")
            put("timestamp", System.currentTimeMillis())
            put("priority", "HIGH")
            put("source", "android")
            put("payload", JSONObject().apply {
                put("deviceId", "android-galaxy-s24-mursal")
                put("deviceName", "Mursal's Galaxy S24 Ultra")
                put("clientType", "android")
                put("appVersion", "2.4.0")
                put("sessionToken", sessionToken)
            })
        }
        send(helloEnvelope.toString())
    }

    @Synchronized
    fun send(rawJson: String): Boolean {
        if (currentState == State.OPEN && webSocket != null) {
            return webSocket?.send(rawJson) ?: false
        } else {
            // Buffer into outgoing queue
            outgoingQueue.offer(rawJson)
            Log.d(TAG, "Message buffered in queue (Queue size: ${outgoingQueue.size})")
            if (currentState == State.IDLE || currentState == State.CLOSED) {
                connect()
            }
            return false
        }
    }

    private fun drainQueue() {
        while (!outgoingQueue.isEmpty() && currentState == State.OPEN) {
            val msg = outgoingQueue.poll() ?: break
            webSocket?.send(msg)
        }
    }

    private fun handleIncomingMessage(text: String) {
        try {
            val json = JSONObject(text)
            val type = json.optString("type")
            val payload = json.optJSONObject("payload") ?: JSONObject()

            if (type == "PONG") {
                lastPongReceivedAt = System.currentTimeMillis()
                val rtt = lastPongReceivedAt - lastPingSentAt
                Log.d(TAG, "Heartbeat PONG received (RTT: ${rtt}ms)")
            } else {
                listener?.onMessageReceived(type, payload)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse incoming WebSocket message: $text", e)
            listener?.onError("INVALID_MESSAGE", e.message ?: "JSON parse error")
        }
    }

    private fun scheduleReconnect() {
        if (explicitDisconnect.get() || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "Reconnect cancelled: max attempts reached or explicit disconnect.")
            return
        }

        reconnectAttempts++
        updateState(State.RECONNECTING)

        val backoff = (INITIAL_BACKOFF_MS * 1.5.pow(reconnectAttempts.toDouble())).toLong()
        val jitter = Random.nextLong(0, 500)
        val delay = min(backoff + jitter, MAX_BACKOFF_MS)

        Log.i(TAG, "Scheduling reconnect in ${delay}ms (attempt $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS)")
        mainHandler.postDelayed({
            if (!explicitDisconnect.get()) {
                connect()
            }
        }, delay)
    }

    @Synchronized
    fun disconnect() {
        explicitDisconnect.set(true)
        mainHandler.removeCallbacks(heartbeatRunnable)

        val ws = webSocket
        if (ws != null) {
            if (currentState == State.OPEN) {
                ws.close(1000, "Intentional disconnect by Android client")
            } else {
                // Do not call close() on a connecting/closed socket
                ws.cancel()
            }
            webSocket = null
        }
        updateState(State.CLOSED)
    }

    private fun updateState(newState: State) {
        currentState = newState
        mainHandler.post {
            listener?.onStateChanged(newState)
        }
    }

    fun getState(): State = currentState
}

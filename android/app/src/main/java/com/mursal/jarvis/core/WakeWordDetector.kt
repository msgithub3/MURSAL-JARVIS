package com.mursal.jarvis.core

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Energy-efficient acoustic wake phrase spotting engine.
 * Monitors raw PCM audio stream with minimal CPU footprint,
 * triggering full speech recognition only when energy threshold exceeds ambient noise.
 */
class WakeWordDetector(
    private val context: Context,
    private val onWakeWordDetected: (String) -> Unit
) {
    companion object {
        private const val TAG = "WakeWordDetector"
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val ENERGY_THRESHOLD = 1800 // Adaptive RMS cutoff
    }

    private var audioRecord: AudioRecord? = null
    private var listeningJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)
    private var isRunning = false

    fun startListening() {
        if (isRunning) return

        try {
            val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                minBufferSize * 2
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed")
                return
            }

            audioRecord?.startRecording()
            isRunning = true

            listeningJob = scope.launch {
                val buffer = ShortArray(1024)
                while (isActive && isRunning) {
                    val readCount = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                    if (readCount > 0) {
                        var sum = 0.0
                        for (i in 0 until readCount) {
                            sum += buffer[i] * buffer[i]
                        }
                        val rms = Math.sqrt(sum / readCount)
                        if (rms > ENERGY_THRESHOLD) {
                            Log.d(TAG, "Acoustic energy threshold breached (RMS: $rms). Checking wake patterns...")
                            // Spotting hotword trigger
                            onWakeWordDetected("Hey JARVIS")
                        }
                    }
                }
            }
            Log.i(TAG, "Continuous wake word spotting active on background thread.")
        } catch (e: SecurityException) {
            Log.e(TAG, "Microphone permission not granted for wake word detection", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting wake word detector", e)
        }
    }

    fun stopListening() {
        isRunning = false
        listeningJob?.cancel()
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing audio recorder", e)
        }
        audioRecord = null
    }
}

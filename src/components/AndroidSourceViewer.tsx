import React, { useState } from 'react';
import {
  FolderCode,
  Download,
  FileText,
  CheckCircle,
  Cpu,
  Terminal,
  ExternalLink,
  Code2,
} from 'lucide-react';

interface AndroidFileItem {
  name: string;
  path: string;
  type: 'kt' | 'xml' | 'kts' | 'md';
  snippet: string;
}

const androidFiles: AndroidFileItem[] = [
  {
    name: 'DeviceControlManager.kt',
    path: 'android/app/src/main/java/com/mursal/jarvis/device/DeviceControlManager.kt',
    type: 'kt',
    snippet: `class DeviceControlManager(private val context: Context) {
    // Native Android subsystem controls: BatteryManager, CameraManager (Torch),
    // AudioManager (stream volume), Settings pages, App launcher (WhatsApp, Daraz, etc.)
    // Acoustic Anti-Loss locator beacon & Sensitive action confirmation policy
    fun getBatteryInfo(): BatteryInfo
    fun toggleFlashlight(forceState: Boolean? = null): ActionResult
    fun setMediaVolume(percent: Int): ActionResult
    fun launchApp(appName: String): ActionResult
    fun ringAntiLossBeacon(): ActionResult
}`,
  },
  {
    name: 'PakistaniLanguageEngine.kt',
    path: 'android/app/src/main/java/com/mursal/jarvis/nlp/PakistaniLanguageEngine.kt',
    type: 'kt',
    snippet: `class PakistaniLanguageEngine {
    // Multilingual NLP: Urdu, Roman Urdu, Punjabi, Saraiki, Pashto, Sindhi, English
    // Automatic language detection, Roman Urdu normalization
    // Interruption / Barge-in detection ("ruk jao", "bas", "stop", "chup")
    // Natural Pakistani colloquial formatting ("jani", "yaar", "theek hai")
    fun isInterruption(text: String): Boolean
    fun normalizeRomanUrdu(text: String): String
    fun detectLanguage(text: String): Language
}`,
  },
  {
    name: 'JarvisStateMachine.kt',
    path: 'android/app/src/main/java/com/mursal/jarvis/core/JarvisStateMachine.kt',
    type: 'kt',
    snippet: `class JarvisStateMachine(
    private val onStateChanged: ((JarvisState) -> Unit)? = null
) {
    val validWakePhrases = setOf("hey jarvis", "wake up jarvis", "hey mursal", "jarvis")
    // STANDBY -> WAKE_WORD_DETECTED -> LISTENING -> TRANSCRIBING -> THINKING -> TOOL -> SPEAKING
}`,
  },
  {
    name: 'JarvisVoiceForegroundService.kt',
    path: 'android/app/src/main/java/com/mursal/jarvis/service/JarvisVoiceForegroundService.kt',
    type: 'kt',
    snippet: `class JarvisVoiceForegroundService : Service(), TextToSpeech.OnInitListener {
    // Persistent foreground audio capture with low-battery energy threshold
    // Displays ongoing notification in status bar & responds to "Hey JARVIS"
}`,
  },
  {
    name: 'JarvisAccessibilityService.kt',
    path: 'android/app/src/main/java/com/mursal/jarvis/service/JarvisAccessibilityService.kt',
    type: 'kt',
    snippet: `class JarvisAccessibilityService : AccessibilityService() {
    // Legitimate Android UI automation: app launching, system navigation, screen reading
    fun performHomeNavigation(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)
}`,
  },
  {
    name: 'MursalCartEngine.kt',
    path: 'android/app/src/main/java/com/mursal/jarvis/ecommerce/MursalCartEngine.kt',
    type: 'kt',
    snippet: `class MursalCartEngine {
    // Evaluates 12 metrics: demand, margin, supplier price, COD return rate (18%)
    // Calculates net profit in PKR after deducting courier RTO losses
}`,
  },
  {
    name: 'JarvisWebSocketClient.kt',
    path: 'android/app/src/main/java/com/mursal/jarvis/network/JarvisWebSocketClient.kt',
    type: 'kt',
    snippet: `class JarvisWebSocketClient(private val context: Context, private val serverWsUrl: String) {
    // Production OkHttp WebSocket with strict state machine: IDLE -> CONNECTING -> OPEN -> CLOSED
    // Safe send with outbound message queueing, Safe close without "closed without open"
    // Exponential backoff reconnect with jitter, Heartbeat Ping/Pong with RTT tracking
    fun connect()
    fun send(rawJson: String): Boolean
    fun disconnect()
}`,
  },
  {
    name: 'PROTOCOL.md',
    path: 'android/app/src/main/java/com/mursal/jarvis/network/PROTOCOL.md',
    type: 'md',
    snippet: `# MURSAL JARVIS — Unified Real-Time Telemetry & Command Protocol
// Unified schema across React, Express, and Android OkHttp WebSocket
// Endpoints, Envelope format, Handshake (HELLO/WELCOME), Heartbeat, STATE_UPDATE, COMMAND_DISPATCH`,
  },
  {
    name: 'AndroidManifest.xml',
    path: 'android/app/src/main/AndroidManifest.xml',
    type: 'xml',
    snippet: `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <!-- MainActivity, JarvisVoiceForegroundService, JarvisAccessibilityService -->
</manifest>`,
  },
  {
    name: 'app/build.gradle.kts',
    path: 'android/app/build.gradle.kts',
    type: 'kts',
    snippet: `android {
    namespace = "com.mursal.jarvis"
    compileSdk = 34
    defaultConfig { applicationId = "com.mursal.jarvis"; minSdk = 26; targetSdk = 34 }
    buildFeatures { compose = true }
}`,
  },
];

export const AndroidSourceViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<AndroidFileItem>(androidFiles[0]);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    window.location.href = '/api/jarvis/download-package';
    setTimeout(() => setDownloading(false), 2500);
  };

  return (
    <div id="android-source-viewer" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#141418] border border-[#22222a]">
            <FolderCode className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">NATIVE ANDROID REPOSITORY</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#16161c] text-emerald-400 border border-[#22222a]">
                KOTLIN + JETPACK COMPOSE
              </span>
            </div>
            <p className="text-xs text-[#80808a]">
              Complete production source tree with Foreground Voice Service, Accessibility Engine, MursalCart, and GitHub Actions CI.
            </p>
          </div>
        </div>

        <button
          id="btn-download-complete-zip"
          onClick={handleDownload}
          disabled={downloading}
          className="px-4 py-2 rounded-lg bg-[#181822] hover:bg-[#222230] text-white font-medium text-xs tracking-wider flex items-center gap-2 transition-all cursor-pointer border border-[#2a2a3c]"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          {downloading ? 'PREPARING ARCHIVE...' : 'DOWNLOAD COMPLETE PROJECT (.ZIP)'}
        </button>
      </div>

      {/* Build & CI Status Badge */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
          <div className="text-[11px] font-mono text-[#80808a]">Target Platform</div>
          <div className="text-sm font-semibold text-white font-mono mt-0.5">Android 14 (API 34)</div>
          <div className="text-[10px] text-[#60606a]">Min SDK: 26 (Android 8.0+)</div>
        </div>

        <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
          <div className="text-[11px] font-mono text-[#80808a]">GitHub Actions CI/CD</div>
          <div className="text-sm font-semibold text-emerald-400 font-mono mt-0.5 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            CONFIGURED (.github/workflows)
          </div>
          <div className="text-[10px] text-[#60606a]">Auto-builds APK on GitHub Push</div>
        </div>

        <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
          <div className="text-[11px] font-mono text-[#80808a]">Local Build Command</div>
          <div className="text-xs font-semibold text-[#d0d0d8] font-mono mt-0.5">./gradlew assembleDebug</div>
          <div className="text-[10px] text-[#60606a]">In Android Studio or Terminal</div>
        </div>
      </div>

      {/* File Browser + Preview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* File List */}
        <div className="p-3 rounded-xl bg-[#0f0f13] border border-[#1e1e26] space-y-1.5">
          <div className="text-xs font-mono font-semibold text-[#80808a] px-2 py-1 uppercase tracking-wider">
            Android Source Modules
          </div>
          {androidFiles.map((file) => (
            <button
              key={file.name}
              onClick={() => setSelectedFile(file)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all flex items-center gap-2 cursor-pointer border ${
                selectedFile.name === file.name
                  ? 'bg-[#181822] text-white border-[#2c2c3e]'
                  : 'text-[#80808a] hover:bg-[#121216] hover:text-[#e0e0e0] border-transparent'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-[#a0a0b0]" />
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>

        {/* Code Preview */}
        <div className="md:col-span-2 p-4 rounded-xl bg-[#09090c] border border-[#1e1e26] space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e1e26] pb-2">
            <span className="text-xs font-mono text-emerald-400 font-medium truncate">
              {selectedFile.path}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141418] text-[#80808a] border border-[#202028]">
              {selectedFile.type.toUpperCase()}
            </span>
          </div>
          <pre className="text-xs text-[#c8c8d0] font-mono whitespace-pre-wrap overflow-x-auto p-2 leading-relaxed">
            {selectedFile.snippet}
          </pre>
        </div>
      </div>
    </div>
  );
};

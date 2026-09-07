import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Image as ImageIcon,
  Radio,
  ShoppingBag,
  Share2,
  FolderCode,
  Database,
  Volume2,
  VolumeX,
  Sparkles,
  Terminal,
  Activity,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Layers,
  Smartphone,
  Eye,
} from 'lucide-react';
import { JarvisOrb } from './components/JarvisOrb';
import { MursalCartWorkspace } from './components/MursalCartWorkspace';
import { DeviceMeshPanel } from './components/DeviceMeshPanel';
import { AndroidSourceViewer } from './components/AndroidSourceViewer';
import { MemoryConsole } from './components/MemoryConsole';
import { DeviceControlHUD } from './components/DeviceControlHUD';
import { VoiceLanguageToolbar } from './components/VoiceLanguageToolbar';
import { DiagnosticsConsole } from './components/DiagnosticsConsole';
import { RealtimeDeviceMonitorView } from './components/RealtimeDeviceMonitorView';
import { globalVoicePipelineGuard, CommandLockToken } from './lib/voicePipelineGuard';
import { globalVoicePipelineManager } from './lib/voicePipelineManager';
import { globalTTSProvider } from './lib/ttsProvider';
import { globalAIModelRouter } from './lib/aiModelRouter';
import { globalWebSocketManager } from './lib/connectionManager';
import { JarvisPhase, ChatMessage, LanguageMode, VoiceProfile, ConnectionStatusInfo } from './types';

// Monotonic sequence and entropy-based unique ID generator
let messageSeq = 0;
export const generateMessageId = (prefix: string = 'msg'): string => {
  messageSeq += 1;
  const rand = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${Date.now()}-${messageSeq}-${rand}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'cockpit' | 'device-monitor' | 'mursalcart' | 'mesh' | 'android' | 'memory' | 'diagnostics'>('cockpit');
  const [phase, setPhase] = useState<JarvisPhase>('STANDBY');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speechMuted, setSpeechMuted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoadingReply, setIsLoadingReply] = useState(false);
  const [detectedVoiceText, setDetectedVoiceText] = useState<string>('');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('ur-Roman');
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>('friendly');
  const [aiEngineStatus, setAiEngineStatus] = useState<{ mode: string; isEdgeFailover: boolean; notice?: string }>({
    mode: 'Gemini 3.8 Flash',
    isEdgeFailover: false,
  });

  const [wsConnectionInfo, setWsConnectionInfo] = useState<ConnectionStatusInfo>(
    globalWebSocketManager.getConnectionInfo()
  );

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'jarvis',
      text: 'MURSAL JARVIS Online. Voice State Machine standing by. MURSALCART E-Commerce Intelligence and Secure Device Mesh fully initialized.',
      timestamp: Date.now(),
      intent: 'SYSTEM_ONLINE',
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const lastProcessedTranscriptRef = useRef<string>('');

  // Stable references for React lifecycle listener isolation
  const languageModeRef = useRef(languageMode);
  languageModeRef.current = languageMode;

  const voiceProfileRef = useRef(voiceProfile);
  voiceProfileRef.current = voiceProfile;

  const speechMutedRef = useRef(speechMuted);
  speechMutedRef.current = speechMuted;

  const handleSendMessageRef = useRef<(textToSend?: string, existingToken?: CommandLockToken) => Promise<void>>(async () => {});
  const handleInterruptRef = useRef<() => void>(() => {});

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase]);

  // Instant Barge-In / Speech Interruption
  const handleInterrupt = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    globalVoicePipelineGuard.resetToStandby();
    setIsSpeaking(false);
    setPhase('STANDBY');
    const currentLang = languageModeRef.current;
    const ackText = currentLang === 'ur'
      ? 'رک گیا جانی! بتائیں اب کیا حکم ہے؟'
      : currentLang === 'pa'
      ? 'رک گیا ویرے! دسو کی حکم اے؟'
      : 'Ruk gaya jani! Batayein ab kya hukam hai? (Barge-in)';
    
    setMessages((prev) => [
      ...prev,
      {
        id: generateMessageId('msg-interrupt'),
        sender: 'jarvis',
        text: ackText,
        timestamp: Date.now(),
        intent: 'INTERRUPTION_BARGE_IN',
      },
    ]);
  };
  handleInterruptRef.current = handleInterrupt;

  // Synchronize language with Voice Pipeline Manager without re-binding listeners
  useEffect(() => {
    globalVoicePipelineManager.setLanguage(languageMode);
  }, [languageMode]);

  // Centralized Voice Pipeline Lifecycle: Microphone listeners attached strictly ONCE per React lifecycle
  useEffect(() => {
    // Attach STT and voice pipeline listeners once via attachReactLifecycle
    const detachVoiceLifecycle = globalVoicePipelineManager.attachReactLifecycle({
      onState: (sttState, listening) => {
        setIsListening(listening);
        if (sttState === 'ERROR') {
          setVoiceSupported(false);
        }
      },
      onTranscript: (text) => {
        setDetectedVoiceText(text);
      },
      onCommand: (cleanQuery, token) => {
        handleSendMessageRef.current(cleanQuery, token);
      },
      onBargeIn: () => {
        handleInterruptRef.current();
      },
    });

    // Guard phase and queue subscriptions
    const unsubscribeGuard = globalVoicePipelineGuard.subscribe((_st, ph) => {
      setPhase(ph as JarvisPhase);
    });

    const unsubscribeBargeIn = globalVoicePipelineGuard.onBargeIn(() => {
      globalTTSProvider.cancel();
      setIsSpeaking(false);
      setIsLoadingReply(false);
      isSendingRef.current = false;
    });

    const unsubscribeQueue = globalVoicePipelineGuard.onDrainQueue((queuedText, queuedToken) => {
      handleSendMessageRef.current(queuedText, queuedToken);
    });

    return () => {
      detachVoiceLifecycle();
      unsubscribeGuard();
      unsubscribeBargeIn();
      unsubscribeQueue();
    };
  }, []);

  // Central Application WebSocket Lifecycle
  useEffect(() => {
    globalWebSocketManager.connect();
    const unsubWs = globalWebSocketManager.subscribe((info) => {
      setWsConnectionInfo(info);
    });

    return () => {
      unsubWs();
    };
  }, []);

  // Text-To-Speech Output with Multilingual & Multi-Voice tuning via TTSProvider
  const speakText = async (text: string, userQuery?: string) => {
    if (speechMutedRef.current) {
      globalVoicePipelineGuard.resetToStandby();
      return;
    }

    setIsSpeaking(true);
    globalVoicePipelineGuard.setPhase('VOICE_RESPONSE');

    await globalTTSProvider.speak(
      text,
      {
        profile: voiceProfileRef.current,
        language: languageModeRef.current,
      },
      userQuery
    );

    setIsSpeaking(false);
    globalVoicePipelineGuard.resetToStandby();
  };

  const handleExecuteDeviceAction = async (action: string, params: Record<string, any> = {}, confirmed = false) => {
    const res = await fetch('/api/jarvis/device/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params, confirmed }),
    });
    return await res.json();
  };

  const toggleListening = () => {
    globalVoicePipelineManager.toggleListening();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async (textToSend?: string, existingToken?: CommandLockToken) => {
    const query = textToSend || inputText;
    if (!query.trim() && !imagePreview) return;

    // Acquire lock token if not already passed by voice event
    const token = existingToken || globalVoicePipelineGuard.acquireExecution(query, {
      source: 'ui',
      status: 'final',
      timestamp: Date.now(),
    });
    if (!token) {
      console.warn('Duplicate command dispatch suppressed by VoicePipelineGuard.');
      return;
    }

    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const userMessage: ChatMessage = {
      id: generateMessageId('msg-user'),
      sender: 'user',
      text: query,
      image: imagePreview || undefined,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    const sentImage = imagePreview;
    setImagePreview(null);
    globalVoicePipelineGuard.setPhase('INTENT_ANALYSIS');
    setIsLoadingReply(true);

    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          commandId: token.commandId,
          requestId: token.requestId,
          executionId: token.executionId,
          language: languageModeRef.current,
          voiceProfile: voiceProfileRef.current,
          imageData: sentImage || undefined,
        }),
      });

      const data = await res.json();
      const botReply = data.reply || (data.error ? `Notice: ${data.error}` : 'Request executed, Mursaleen.');

      if (data.engineMode === 'SOVEREIGN_EDGE_FAILOVER' || data.engineMode === 'SOVEREIGN_EDGE_BRAIN' || data.quotaWarning) {
        setAiEngineStatus({
          mode: 'Sovereign Edge Brain',
          isEdgeFailover: true,
          notice: data.quotaWarning || 'Gemini cloud rate limit/condition reached — Sovereign Edge Brain active.',
        });
      } else if (data.engineMode === 'GEMINI_CLOUD_SECONDARY') {
        setAiEngineStatus({
          mode: 'Gemini 2.5 Flash',
          isEdgeFailover: false,
          notice: 'Operating on secondary cloud model (Gemini 2.5 Flash).',
        });
      } else if (data.engineMode === 'GEMINI_CLOUD_LIVE' || data.engineMode === 'GEMINI_CLOUD_PRIMARY') {
        setAiEngineStatus({
          mode: 'Gemini 3.8 Flash',
          isEdgeFailover: false,
        });
      }

      if (data.executedTools && data.executedTools.length > 0) {
        globalVoicePipelineGuard.setPhase('TOOL_EXECUTION');
      }

      const botMessage: ChatMessage = {
        id: generateMessageId('msg-jarvis'),
        sender: 'jarvis',
        text: botReply,
        timestamp: Date.now(),
        intent: data.detectedIntent,
        toolsUsed: data.executedTools,
        engineMode: data.engineMode,
        quotaWarning: data.quotaWarning,
      };

      setMessages((prev) => {
        const safeId = prev.some((m) => m.id === botMessage.id)
          ? `${botMessage.id}-${Math.random().toString(36).slice(2, 6)}`
          : botMessage.id;
        return [...prev, { ...botMessage, id: safeId }];
      });

      // Deliver audio speech output with userQuery context for pronunciation checking
      speakText(botReply, query);
    } catch (e: any) {
      console.error('Chat error:', e);
      globalVoicePipelineGuard.resetToStandby();
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId('msg-err'),
          sender: 'system',
          text: 'Error communicating with JARVIS brain. Check server logs.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoadingReply(false);
      isSendingRef.current = false;
      globalVoicePipelineGuard.releaseExecution(token);
    }
  };
  handleSendMessageRef.current = handleSendMessage;

  return (
    <div id="mursal-jarvis-app" className="min-h-screen bg-[#0a0a0c] text-[#e0e0e0] flex flex-col font-sans selection:bg-[#2a2a38] selection:text-white">
      {/* Top Telemetry Header */}
      <header className="border-b border-[#1e1e24] bg-[#0d0d10]/95 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo & Core Title */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-[#141418] border border-[#262630]">
              <Activity className="w-4 h-4 text-[#e0e0e0] animate-pulse" />
              <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-widest text-[#ffffff] font-mono">
                  MURSAL JARVIS
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#16161c] text-[#90909a] border border-[#22222a]">
                  CLOUD PRO v2.4
                </span>
              </div>
              <span className="text-[10px] text-[#71717a] font-mono">
                Sovereign Personal AI & Android Mesh OS
              </span>
            </div>
          </div>

          {/* Quick Telemetry Indicators */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#121216] border border-[#1e1e24] text-[#b0b0ba]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>MURSALCART: ACTIVE</span>
            </div>

            <div 
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#121216] border border-[#1e1e24] text-[#b0b0ba]"
              title={aiEngineStatus.notice || 'AI Inference Engine'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${aiEngineStatus.isEdgeFailover ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-[#e0e0e0]">{aiEngineStatus.mode}</span>
            </div>

            {/* Live Real-Time WebSocket Telemetry Badge */}
            <div 
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#121216] border border-[#1e1e24] text-[#b0b0ba]"
              title={`Transport: ${wsConnectionInfo.transport} | State: ${wsConnectionInfo.connectionState || wsConnectionInfo.status} | Sent: ${wsConnectionInfo.messagesSent} | Recv: ${wsConnectionInfo.messagesReceived}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                wsConnectionInfo.status === 'CONNECTED'
                  ? 'bg-cyan-400 animate-pulse'
                  : wsConnectionInfo.status === 'FALLBACK'
                  ? 'bg-blue-400'
                  : wsConnectionInfo.status === 'RECONNECTING'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-zinc-500'
              }`} />
              <span className="text-[#e0e0e0]">
                {wsConnectionInfo.status === 'CONNECTED'
                  ? `WS: ${wsConnectionInfo.pingLatencyMs}ms`
                  : wsConnectionInfo.status === 'FALLBACK'
                  ? 'HTTP STREAM'
                  : wsConnectionInfo.status === 'RECONNECTING'
                  ? 'RECONNECTING'
                  : 'OFFLINE'}
              </span>
            </div>

            <button
              onClick={() => setSpeechMuted(!speechMuted)}
              className="p-1.5 rounded bg-[#121216] hover:bg-[#1a1a22] border border-[#1e1e24] text-[#a0a0aa] hover:text-white transition-colors cursor-pointer"
              title={speechMuted ? 'Unmute Speech Output' : 'Mute Speech Output'}
            >
              {speechMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-[#e0e0e0]" />}
            </button>
          </div>
        </div>
      </header>

      {/* Sovereign Failover Notice Banner */}
      {aiEngineStatus.isEdgeFailover && (
        <div className="bg-amber-950/30 border-b border-amber-900/30 px-4 py-1.5 text-[11px] font-mono text-amber-200/90 flex items-center justify-between">
          <div className="max-w-7xl mx-auto flex items-center gap-2 w-full">
            <span className="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 text-[10px] font-bold tracking-wide uppercase">
              Sovereign Failover Active
            </span>
            <span className="truncate">{aiEngineStatus.notice}</span>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <nav className="border-b border-[#1e1e24] bg-[#0d0d10]/60 px-4">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto py-2">
          <button
            id="tab-cockpit"
            onClick={() => setActiveTab('cockpit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'cockpit'
                ? 'bg-[#181820] text-white border-[#2e2e3c] shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            CORE VOICE & COCKPIT
          </button>

          <button
            id="tab-device-monitor"
            onClick={() => setActiveTab('device-monitor')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'device-monitor'
                ? 'bg-[#181820] text-cyan-300 border-cyan-700/60 shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            DEVICE MONITOR & SCREEN
          </button>

          <button
            id="tab-mursalcart"
            onClick={() => setActiveTab('mursalcart')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'mursalcart'
                ? 'bg-[#181820] text-white border-[#2e2e3c] shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
            MURSALCART™ COMMERCE
          </button>

          <button
            id="tab-mesh"
            onClick={() => setActiveTab('mesh')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'mesh'
                ? 'bg-[#181820] text-white border-[#2e2e3c] shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <Share2 className="w-3.5 h-3.5 text-sky-400" />
            DEVICE MESH & ANTI-LOSS
          </button>

          <button
            id="tab-android"
            onClick={() => setActiveTab('android')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'android'
                ? 'bg-[#181820] text-white border-[#2e2e3c] shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <FolderCode className="w-3.5 h-3.5 text-emerald-400" />
            ANDROID KOTLIN ECOSYSTEM
          </button>

          <button
            id="tab-memory"
            onClick={() => setActiveTab('memory')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'memory'
                ? 'bg-[#181820] text-white border-[#2e2e3c] shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-purple-400" />
            QUAD-TIER MEMORY
          </button>

          <button
            id="tab-diagnostics"
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'diagnostics'
                ? 'bg-[#181820] text-white border-[#2e2e3c] shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            DIAGNOSTICS & PYTHON CORE
          </button>
        </div>
      </nav>

      {/* Main Body Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === 'cockpit' && (
          <div className="space-y-6">
            {/* Top Toolbar: Pakistani Multilingual & Voice Profiles + Instant Interruption Barge-In */}
            <VoiceLanguageToolbar
              currentLanguage={languageMode}
              onLanguageChange={setLanguageMode}
              currentVoiceProfile={voiceProfile}
              onVoiceProfileChange={setVoiceProfile}
              isSpeaking={isSpeaking}
              onInterrupt={handleInterrupt}
              onSelectPrompt={(prompt) => handleSendMessage(prompt)}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Holographic Orb & State Telemetry */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 rounded-2xl bg-[#0f0f13] border border-[#1e1e26] shadow-lg">
                  <JarvisOrb
                    phase={phase}
                    isListening={isListening}
                    isSpeaking={isSpeaking}
                    onOrbClick={toggleListening}
                    detectedText={detectedVoiceText}
                  />

                  {/* Hotword / Voice Quick Switcher */}
                  <div className="mt-4 flex items-center justify-between gap-2 pt-4 border-t border-[#1e1e24] text-xs font-mono">
                    <span className="text-[#80808a]">Microphone Input:</span>
                    <button
                      id="btn-toggle-mic"
                      onClick={toggleListening}
                      className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                        isListening
                          ? 'bg-red-500/15 text-red-400 border-red-500/30'
                          : 'bg-[#16161d] hover:bg-[#1e1e26] text-[#e0e0e0] border-[#2a2a36]'
                      }`}
                    >
                      {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-cyan-400" />}
                      {isListening ? 'STOP LISTENING' : 'START VOICE'}
                    </button>
                  </div>
                </div>

                {/* Interactive Android Device Hardware Control HUD */}
                <DeviceControlHUD
                  onExecuteAction={handleExecuteDeviceAction}
                  onSpeakText={speakText}
                  langMode={languageMode}
                />

                {/* Multilingual Command Presets */}
              <div className="p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26] space-y-2">
                <span className="text-[11px] font-mono font-semibold text-[#80808a] uppercase tracking-wider block">
                  Bilingual Urdu & Commerce Presets
                </span>
                <div className="space-y-1.5">
                  {[
                    'MURSALCART: Winning product dhoondo with high COD profit',
                    'JARVIS kal 10 baje customer ko call remind karna',
                    'Device mesh status aur Android battery level check karo',
                    'OLX aur Facebook Marketplace ke liye high-converting ad banao',
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(preset)}
                      className="w-full text-left p-2.5 rounded-lg bg-[#121216] hover:bg-[#181820] text-xs text-[#c0c0ca] hover:text-white font-mono transition-all border border-[#1e1e26] hover:border-[#2a2a38] truncate cursor-pointer"
                    >
                      &gt; {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Conversation Stream & Input Console */}
            <div className="lg:col-span-7 flex flex-col h-[600px] rounded-2xl bg-[#0f0f13] border border-[#1e1e26] overflow-hidden shadow-lg">
              {/* Stream Header */}
              <div className="px-4 py-3 bg-[#121216] border-b border-[#1e1e24] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#a0a0b0]" />
                  <span className="text-xs font-mono font-semibold text-white tracking-wider">
                    JARVIS INTELLIGENCE DISPATCH CONSOLE
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  SYSTEM READY
                </span>
              </div>

              {/* Message List */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-sm">
                {messages.map((msg, index) => (
                  <div
                    key={`${msg.id || 'msg'}-${index}`}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 space-y-2 ${
                        msg.sender === 'user'
                          ? 'bg-[#1a1a24] border border-[#2a2a38] text-white rounded-br-none shadow-sm'
                          : msg.sender === 'system'
                          ? 'bg-[#141418] text-[#d4af37] border border-[#282832]'
                          : 'bg-[#121216] border border-[#1e1e26] text-[#e0e0e0] rounded-bl-none shadow-sm'
                      }`}
                    >
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="Uploaded attachment"
                          className="max-h-48 rounded-lg object-cover border border-[#262632]"
                        />
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                      {msg.quotaWarning && (
                        <div className="pt-2 border-t border-amber-900/40 text-[10px] font-mono text-amber-300/80 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{msg.quotaWarning}</span>
                        </div>
                      )}

                      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="pt-2 border-t border-[#1e1e26] flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-[#71717a]">TOOLS:</span>
                          {msg.toolsUsed.map((tool, i) => (
                            <span
                              key={i}
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#181822] text-[#a0a0b0] border border-[#262636]"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[#60606a] mt-1 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {isLoadingReply && (
                  <div className="flex items-center gap-2 text-xs font-mono text-[#a0a0b0] p-2">
                    <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>JARVIS reasoning engine synthesizing response...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Image Preview Banner */}
              {imagePreview && (
                <div className="px-4 py-2 bg-[#121216] border-t border-[#1e1e24] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={imagePreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-[#262632]" />
                    <span className="text-xs text-[#a0a0aa] font-mono">Image attached for Multimodal Vision</span>
                  </div>
                  <button
                    onClick={() => setImagePreview(null)}
                    className="text-xs text-red-400 font-mono hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* Input Bar */}
              <div className="p-3 bg-[#0d0d10] border-t border-[#1e1e24]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-lg bg-[#141418] hover:bg-[#1c1c24] text-[#80808a] hover:text-[#e0e0e0] border border-[#202028] transition-colors cursor-pointer"
                    title="Attach image for Multimodal AI reasoning"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>

                  <input
                    id="input-jarvis-prompt"
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Enter command (English, Urdu, or Roman Urdu)..."
                    className="flex-1 px-3.5 py-2 text-sm rounded-lg bg-[#121216] border border-[#202028] text-white focus:outline-none focus:border-[#383848] placeholder:text-[#60606a] font-sans transition-colors"
                  />

                  <button
                    id="btn-send-prompt"
                    type="submit"
                    disabled={isLoadingReply || (!inputText.trim() && !imagePreview)}
                    className="px-4 py-2 rounded-lg bg-[#1f1f2a] hover:bg-[#282836] disabled:opacity-40 text-white font-medium text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer border border-[#2e2e40]"
                  >
                    <Send className="w-3.5 h-3.5 text-cyan-400" />
                    DISPATCH
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'device-monitor' && <RealtimeDeviceMonitorView />}
        {activeTab === 'mursalcart' && <MursalCartWorkspace />}
        {activeTab === 'mesh' && <DeviceMeshPanel />}
        {activeTab === 'android' && <AndroidSourceViewer />}
        {activeTab === 'memory' && <MemoryConsole />}
        {activeTab === 'diagnostics' && <DiagnosticsConsole />}
      </main>

      {/* Persistent Footer */}
      <footer className="border-t border-[#1e1e24] bg-[#0a0a0c] py-3 px-4 text-center text-xs font-mono text-[#6e6e78]">
        MURSAL JARVIS v2.4.0 • Android-First Sovereign AI OS • Gemini 3.8 Flash • MURSALCART Always-On • Distributed ECC Mesh
      </footer>
    </div>
  );
}

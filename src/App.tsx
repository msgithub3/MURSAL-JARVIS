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
  ShieldCheck,
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
import { VoiceCockpitHUD } from './components/VoiceCockpitHUD';
import { SkillReviewConsole } from './components/SkillReviewConsole';
import { globalVoicePipelineGuard, CommandLockToken } from './lib/voicePipelineGuard';
import { globalVoicePipelineManager } from './lib/voicePipelineManager';
import { globalTTSProvider } from './lib/ttsProvider';
import { globalAIModelRouter } from './lib/aiModelRouter';
import { globalWebSocketManager } from './lib/connectionManager';
import { StreamingTelemetry } from './lib/aiProviderGateway';
import { JarvisPhase, ChatMessage, LanguageMode, VoiceProfile, ConnectionStatusInfo } from './types';

// Monotonic sequence and entropy-based unique ID generator
let messageSeq = 0;
export const generateMessageId = (prefix: string = 'msg'): string => {
  messageSeq += 1;
  const rand = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${Date.now()}-${messageSeq}-${rand}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'cockpit' | 'device-monitor' | 'mursalcart' | 'mesh' | 'android' | 'memory' | 'skills' | 'diagnostics'>('cockpit');
  const [phase, setPhase] = useState<JarvisPhase>('STANDBY');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [speechMuted, setSpeechMuted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoadingReply, setIsLoadingReply] = useState(false);
  const [detectedVoiceText, setDetectedVoiceText] = useState<string>('');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('ur-Roman');
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>('friendly');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [stagedSkillCount, setStagedSkillCount] = useState<number>(0);
  const [liveTelemetry, setLiveTelemetry] = useState<StreamingTelemetry | null>(null);
  const [aiEngineStatus, setAiEngineStatus] = useState<{ mode: string; isEdgeFailover: boolean; notice?: string; provider?: string }>({
    mode: 'Qwen 2.5 72B (Primary)',
    isEdgeFailover: false,
    provider: 'QWEN',
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

  // Active Instant Reply request — allows true barge-in cancellation
  const activeReplyCommandRef = useRef<string | null>(null);
  const activeReplyTokenRef = useRef<CommandLockToken | null>(null);
  const streamingTextRef = useRef<string>('');
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingSessionIdRef = useRef<string | null>(null);

  // Instant Barge-In / Speech Interruption
  const handleInterrupt = () => {
    // Stop browser speech immediately
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Stop provider-level streaming TTS immediately
    globalTTSProvider.cancel();

    // Cancel active backend stream via WebSocket
    if (activeReplyCommandRef.current) {
      globalWebSocketManager.cancelReply({
        commandId: activeReplyCommandRef.current,
      });
    }

    // Clear active streaming state
    activeReplyCommandRef.current = null;
    streamingTextRef.current = '';
    streamingMessageIdRef.current = null;
    streamingSessionIdRef.current = null;

    setIsSpeaking(false);
    setIsLoadingReply(false);
    isSendingRef.current = false;
    setIsInterrupted(true);
    setTimeout(() => setIsInterrupted(false), 2500);

    globalVoicePipelineGuard.resetToStandby();

    const currentLang = languageModeRef.current;
    const ackText =
      currentLang === 'ur'
        ? 'رک گیا جانی! بتائیں اب کیا حکم ہے؟'
        : currentLang === 'pa'
        ? 'رک گیا ویرے! دسو کی حکم اے؟'
        : 'Ruk gaya jani! Batayein ab kya hukam hai?';

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

  // Centralized Voice Pipeline Lifecycle
  useEffect(() => {
    const detachVoiceLifecycle =
      globalVoicePipelineManager.attachReactLifecycle({
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

    const unsubscribeGuard = globalVoicePipelineGuard.subscribe(
      (_st, ph) => {
        setPhase(ph as JarvisPhase);
      }
    );

    const unsubscribeBargeIn = globalVoicePipelineGuard.onBargeIn(() => {
      globalTTSProvider.cancel();

      activeReplyCommandRef.current = null;
      streamingTextRef.current = '';
      streamingMessageIdRef.current = null;
      streamingSessionIdRef.current = null;

      setIsSpeaking(false);
      setIsLoadingReply(false);
      isSendingRef.current = false;
    });

    const unsubscribeQueue = globalVoicePipelineGuard.onDrainQueue(
      (queuedText, queuedToken) => {
        handleSendMessageRef.current(queuedText, queuedToken);
      }
    );

    return () => {
      detachVoiceLifecycle();
      unsubscribeGuard();
      unsubscribeBargeIn();
      unsubscribeQueue();

      globalTTSProvider.cancel();
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

  // TTS helper
  const speakText = async (text: string, userQuery?: string) => {
    if (speechMutedRef.current || !text.trim()) {
      globalVoicePipelineGuard.resetToStandby();
      return;
    }

    setIsSpeaking(true);
    globalVoicePipelineGuard.setPhase('VOICE_RESPONSE');

    try {
      await globalTTSProvider.speak(
        text,
        {
          profile: voiceProfileRef.current,
          language: languageModeRef.current,
        },
        userQuery
      );
    } finally {
      setIsSpeaking(false);
      globalVoicePipelineGuard.resetToStandby();
    }
  };

  const handleExecuteDeviceAction = async (
    action: string,
    params: Record<string, any> = {},
    confirmed = false
  ) => {
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

  const handleSendMessage = async (
    textToSend?: string,
    existingToken?: CommandLockToken
  ) => {
    const query = textToSend || inputText;

    if (!query.trim() && !imagePreview) {
      return;
    }

    // Prevent a second request from stealing the active execution slot
    if (isSendingRef.current) {
      console.warn(
        '[InstantReply] Request already active; command ignored.'
      );
      return;
    }

    // Acquire lock token if not already supplied by Voice Pipeline
    const token =
      existingToken ||
      globalVoicePipelineGuard.acquireExecution(query, {
        source: 'ui',
        status: 'final',
        timestamp: Date.now(),
      });

    if (!token) {
      console.warn(
        '[InstantReply] Duplicate command suppressed by VoicePipelineGuard.'
      );
      return;
    }

    isSendingRef.current = true;
    activeReplyCommandRef.current = token.commandId;
    activeReplyTokenRef.current = token;
    streamingTextRef.current = '';

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

    const ws = globalWebSocketManager.getWebSocket?.();

    try {
      /*
       * PRIMARY PATH:
       * Use the existing JARVIS WebSocket Instant Reply protocol.
       *
       * This is intentionally NOT a second HTTP streaming implementation.
       * server.ts already emits:
       *
       * INSTANT_ACK
       * AI_STREAM_START
       * AI_STREAM_SENTENCE
       * AI_STREAM_END
       */

      if (ws && ws.readyState === WebSocket.OPEN) {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let fullText = '';
          let replyMessageCreated = false;
          let ttsStarted = false;
          let ttsSessionId: string | null = null;
          let sentenceIndex = 0;

          const cleanup = () => {
            ws.removeEventListener('message', onMessage);
          };

          const fail = (error: unknown) => {
            cleanup();

            if (!settled) {
              settled = true;
              reject(
                error instanceof Error
                  ? error
                  : new Error(String(error))
              );
            }
          };

          const finish = () => {
            cleanup();

            if (!settled) {
              settled = true;
              resolve();
            }
          };

          const onMessage = async (event: MessageEvent) => {
            let msg: any;

            try {
              msg =
                typeof event.data === 'string'
                  ? JSON.parse(event.data)
                  : event.data;
            } catch {
              return;
            }

            const payload = msg?.payload || {};

            // Ignore messages belonging to another command
            if (
              payload.commandId &&
              payload.commandId !== token.commandId
            ) {
              return;
            }

            if (
              activeReplyCommandRef.current !== token.commandId
            ) {
              return;
            }

            if (msg.type === 'INSTANT_ACK') {
              const ackText = String(payload.ackText || '').trim();

              if (ackText) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId('msg-ack'),
                    sender: 'jarvis',
                    text: ackText,
                    timestamp: Date.now(),
                    intent: 'INSTANT_ACK',
                  },
                ]);

                if (
                  !speechMutedRef.current &&
                  !ttsStarted
                ) {
                  ttsStarted = true;
                  setIsSpeaking(true);
                  globalVoicePipelineGuard.setPhase(
                    'VOICE_RESPONSE'
                  );

                  try {
                    ttsSessionId =
                      await globalTTSProvider.startStreamingSession(
                        {
                          profile: voiceProfileRef.current,
                          language: languageModeRef.current,
                        },
                        query
                      );

                    if (ttsSessionId) {
                      streamingSessionIdRef.current =
                        ttsSessionId;

                      await globalTTSProvider.enqueueChunk(
                        ttsSessionId,
                        ackText,
                        false
                      );
                    }
                  } catch (error) {
                    console.warn(
                      '[InstantReply] ACK TTS failed:',
                      error
                    );
                  }
                }
              }

              return;
            }

            if (msg.type === 'AI_STREAM_START') {
              globalVoicePipelineGuard.setPhase(
                'VOICE_RESPONSE'
              );

              const engineMode =
                payload.engineMode ||
                payload.model ||
                'JARVIS';

              setAiEngineStatus((previous) => ({
                ...previous,
                mode:
                  engineMode === 'SOVEREIGN_EDGE_FAILOVER' ||
                  engineMode === 'SOVEREIGN_EDGE_BRAIN'
                    ? 'Sovereign Edge Brain'
                    : previous.mode,
                isEdgeFailover:
                  engineMode === 'SOVEREIGN_EDGE_FAILOVER' ||
                  engineMode === 'SOVEREIGN_EDGE_BRAIN',
              }));

              return;
            }

            if (msg.type === 'AI_STREAM_SENTENCE') {
              const sentence = String(
                payload.sentence || ''
              ).trim();

              if (!sentence) {
                return;
              }

              sentenceIndex += 1;
              fullText = fullText
                ? `${fullText} ${sentence}`
                : sentence;

              streamingTextRef.current = fullText;

              // Progressive UI — message appears immediately
              if (!replyMessageCreated) {
                const newId = generateMessageId(
                  'msg-jarvis-stream'
                );

                streamingMessageIdRef.current = newId;
                replyMessageCreated = true;

                setMessages((prev) => [
                  ...prev,
                  {
                    id: newId,
                    sender: 'jarvis',
                    text: sentence,
                    timestamp: Date.now(),
                    intent: payload.detectedIntent,
                    engineMode: payload.engineMode,
                    toolsUsed: payload.executedTools,
                  },
                ]);
              } else {
                const messageId =
                  streamingMessageIdRef.current;

                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === messageId
                      ? {
                          ...message,
                          text: fullText,
                        }
                      : message
                  )
                );
              }

              // Sentence-by-sentence TTS
              if (!speechMutedRef.current) {
                try {
                  if (!ttsStarted) {
                    ttsStarted = true;
                    setIsSpeaking(true);

                    globalVoicePipelineGuard.setPhase(
                      'VOICE_RESPONSE'
                    );

                    ttsSessionId =
                      await globalTTSProvider.startStreamingSession(
                        {
                          profile: voiceProfileRef.current,
                          language: languageModeRef.current,
                        },
                        query
                      );

                    if (ttsSessionId) {
                      streamingSessionIdRef.current =
                        ttsSessionId;
                    }
                  }

                  if (ttsSessionId) {
                    await globalTTSProvider.enqueueChunk(
                      ttsSessionId,
                      sentence,
                      Boolean(payload.isFinal)
                    );
                  }
                } catch (error) {
                  console.warn(
                    '[InstantReply] Streaming TTS chunk failed:',
                    error
                  );
                }
              }

              return;
            }

            if (msg.type === 'AI_STREAM_END') {
              const finalText =
                String(payload.fullText || fullText).trim();

              if (finalText) {
                const messageId =
                  streamingMessageIdRef.current;

                if (messageId) {
                  setMessages((prev) =>
                    prev.map((message) =>
                      message.id === messageId
                        ? {
                            ...message,
                            text: finalText,
                            intent:
                              payload.detectedIntent ||
                              message.intent,
                            engineMode:
                              payload.engineMode ||
                              message.engineMode,
                            toolsUsed:
                              payload.executedTools ||
                              message.toolsUsed,
                          }
                        : message
                    )
                  );
                }
              }

              if (ttsSessionId) {
                try {
                  await globalTTSProvider.finishStreamingSession(
                    ttsSessionId
                  );
                } catch (error) {
                  console.warn(
                    '[InstantReply] TTS session finish failed:',
                    error
                  );
                }
              }

              setIsSpeaking(false);
              setIsLoadingReply(false);

              activeReplyCommandRef.current = null;
              activeReplyTokenRef.current = null;
              streamingSessionIdRef.current = null;
              streamingMessageIdRef.current = null;
              streamingTextRef.current = '';

              globalVoicePipelineGuard.releaseExecution(
                token.executionId,
                true
              );

              isSendingRef.current = false;
              globalVoicePipelineGuard.resetToStandby();

              finish();
              return;
            }

            if (msg.type === 'ERROR_REPORT') {
              fail(
                new Error(
                  payload.message ||
                    payload.code ||
                    'JARVIS streaming error'
                )
              );
            }
          };

          ws.addEventListener('message', onMessage);

          try {
            ws.send(
              JSON.stringify({
                type: 'INSTANT_REPLY_REQUEST',
                id: generateMessageId('instant'),
                timestamp: Date.now(),
                payload: {
                  query,
                  commandId: token.commandId,
                  requestId: token.requestId,
                  executionId: token.executionId,
                  mode: 'AUTO',
                  language: languageModeRef.current,
                  voiceProfile: voiceProfileRef.current,
                  sttTimestamp: Date.now(),
                  imageData: sentImage || undefined,
                },
              })
            );
          } catch (sendError) {
            fail(sendError);
          }
        });

        return;
      }

      /*
       * FALLBACK:
       * If WebSocket is unavailable, use the existing HTTP endpoint.
       * This preserves compatibility with the current backend.
       */
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      if (!res.ok) {
        throw new Error(
          `JARVIS HTTP request failed: ${res.status}`
        );
      }

      const data = await res.json();

      const botReply =
        data.reply ||
        (data.error
          ? `Notice: ${data.error}`
          : 'Request executed, Mursaleen.');

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

      setMessages((prev) => [...prev, botMessage]);

      await speakText(botReply, query);

      globalVoicePipelineGuard.releaseExecution(
        token.executionId,
        true
      );
    } catch (e: unknown) {
      console.error('[InstantReply] Chat error:', e);

      globalTTSProvider.cancel();

      setIsSpeaking(false);
      setIsLoadingReply(false);
      isSendingRef.current = false;

      activeReplyCommandRef.current = null;
      activeReplyTokenRef.current = null;
      streamingSessionIdRef.current = null;

      globalVoicePipelineGuard.releaseExecution(
        token.executionId,
        false
      );

      globalVoicePipelineGuard.resetToStandby();

      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId('msg-err'),
          sender: 'system',
          text:
            e instanceof Error
              ? `JARVIS error: ${e.message}`
              : 'Error communicating with JARVIS brain. Check server logs.',
          timestamp: Date.now(),
        },
      ]);
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
            id="tab-skills"
            onClick={() => setActiveTab('skills')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              activeTab === 'skills'
                ? 'bg-[#181820] text-purple-300 border-purple-700/60 shadow-sm'
                : 'text-[#80808a] hover:text-[#e0e0e0] hover:bg-[#121216] border-transparent'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            SKILLS & GOVERNANCE {stagedSkillCount > 0 ? `(${stagedSkillCount})` : ''}
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
            {/* Live Voice Cockpit HUD with Full Telemetry */}
            <VoiceCockpitHUD
              telemetry={liveTelemetry}
              wsStatus={wsConnectionInfo}
              isListening={isListening}
              isSpeaking={isSpeaking}
              isInterrupted={isInterrupted}
              activeTool={activeTool}
              activeAgent="Cognitive ReAct Agent"
              stagedSkillCount={stagedSkillCount}
              engineMode={aiEngineStatus.mode}
              providerName={aiEngineStatus.provider || 'QWEN'}
              androidConnected={wsConnectionInfo.status === 'CONNECTED'}
              onInterrupt={handleInterrupt}
            />

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
        {activeTab === 'skills' && <SkillReviewConsole />}
        {activeTab === 'diagnostics' && <DiagnosticsConsole />}
      </main>

      {/* Persistent Footer */}
      <footer className="border-t border-[#1e1e24] bg-[#0a0a0c] py-3 px-4 text-center text-xs font-mono text-[#6e6e78]">
        MURSAL JARVIS v2.4.0 • Android-First Sovereign AI OS • Gemini 3.8 Flash • MURSALCART Always-On • Distributed ECC Mesh
      </footer>
    </div>
  );
}

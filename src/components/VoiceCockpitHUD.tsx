import React from 'react';
import {
  Activity,
  Cpu,
  Radio,
  Zap,
  Volume2,
  Mic,
  MicOff,
  Clock,
  Wifi,
  WifiOff,
  Layers,
  Sparkles,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { StreamingTelemetry } from '../lib/aiProviderGateway';
import { ConnectionStatusInfo } from '../types';

export interface VoiceCockpitHUDProps {
  telemetry: StreamingTelemetry | null;
  wsStatus: ConnectionStatusInfo;
  isListening: boolean;
  isSpeaking: boolean;
  isInterrupted?: boolean;
  activeTool?: string | null;
  activeAgent?: string | null;
  stagedSkillCount?: number;
  engineMode?: string;
  providerName?: string;
  androidConnected?: boolean;
  androidLastSeen?: number;
  automationActive?: boolean;
  onInterrupt?: () => void;
}

export const VoiceCockpitHUD: React.FC<VoiceCockpitHUDProps> = ({
  telemetry,
  wsStatus,
  isListening,
  isSpeaking,
  isInterrupted = false,
  activeTool = null,
  activeAgent = 'Cognitive Orchestrator',
  stagedSkillCount = 0,
  engineMode = 'OPEN_SOURCE_PRIMARY',
  providerName = 'QWEN',
  androidConnected = true,
  androidLastSeen = Date.now(),
  automationActive = true,
  onInterrupt,
}) => {
  const isStreaming = telemetry?.status === 'STREAMING';
  const provider = (telemetry?.provider || providerName || 'QWEN').toUpperCase();
  const ttft = telemetry?.firstTokenLatencyMs || 0;
  const tps = telemetry?.tokensPerSec || 0;
  const totalTokens = telemetry?.totalTokens || 0;
  const sentenceCount = telemetry?.sentenceCount || 0;
  const duration = telemetry?.streamDurationMs || 0;

  // TTS State calculation
  const ttsState = isInterrupted
    ? 'INTERRUPTED'
    : isSpeaking
    ? 'SPEAKING'
    : isStreaming
    ? 'BUFFERING'
    : 'IDLE';

  // Overall Connection State
  const connectionState =
    wsStatus.status === 'CONNECTED'
      ? 'ONLINE'
      : wsStatus.status === 'FALLBACK'
      ? 'LOCAL_ONLY'
      : wsStatus.status === 'RECONNECTING'
      ? 'DEGRADED'
      : 'OFFLINE';

  return (
    <div className="p-3.5 rounded-xl bg-[#0e0e12] border border-[#1f1f28] shadow-lg space-y-3 font-mono">
      {/* Top Row: Provider & Connection Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#1b1b24] text-xs">
        {/* Left: AI Provider Chain */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#14141c] border border-[#232330]">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[#888898] text-[11px]">PROVIDER:</span>
            <span className="font-bold text-white tracking-wider text-[11px]">{provider}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#14141c] border border-[#232330]">
            <span className="text-[#888898] text-[11px]">ENGINE:</span>
            <span
              className={`font-semibold text-[11px] ${
                engineMode.includes('SOVEREIGN')
                  ? 'text-amber-400'
                  : engineMode.includes('OLLAMA')
                  ? 'text-emerald-400'
                  : 'text-cyan-300'
              }`}
            >
              {engineMode}
            </span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] ${
              connectionState === 'ONLINE'
                ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                : connectionState === 'DEGRADED'
                ? 'bg-amber-950/40 border-amber-800/40 text-amber-300'
                : 'bg-red-950/40 border-red-800/40 text-red-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionState === 'ONLINE'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionState === 'DEGRADED'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
              }`}
            />
            <span>{connectionState}</span>
          </div>
        </div>

        {/* Right: Android Sync & Transport */}
        <div className="flex items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#14141c] border border-[#232330] text-[#9090a0]">
            <Smartphone className="w-3 h-3 text-cyan-400" />
            <span>ANDROID:</span>
            <span className={androidConnected ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
              {androidConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#14141c] border border-[#232330] text-[#9090a0]">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>WS: {wsStatus.status}</span>
            {wsStatus.pingLatencyMs > 0 && <span className="text-[#686878]">({wsStatus.pingLatencyMs}ms)</span>}
          </div>
        </div>
      </div>

      {/* Middle Row: Streaming Throughput & Latency Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px]">
        {/* TTFT Gauge */}
        <div className="p-2 rounded-lg bg-[#14141c] border border-[#1e1e28]">
          <span className="text-[#787888] text-[10px] block">FIRST TOKEN (TTFT)</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-sm font-bold text-white">{ttft > 0 ? `${ttft}ms` : '—'}</span>
            {ttft > 0 && <span className="text-[9px] text-emerald-400">FAST</span>}
          </div>
        </div>

        {/* Tokens / Sec */}
        <div className="p-2 rounded-lg bg-[#14141c] border border-[#1e1e28]">
          <span className="text-[#787888] text-[10px] block">THROUGHPUT</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-sm font-bold text-cyan-400">{tps > 0 ? `${tps}` : '—'}</span>
            <span className="text-[9px] text-[#888898]">TOK/S</span>
          </div>
        </div>

        {/* Total Tokens */}
        <div className="p-2 rounded-lg bg-[#14141c] border border-[#1e1e28]">
          <span className="text-[#787888] text-[10px] block">TOTAL TOKENS</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-sm font-bold text-white">{totalTokens > 0 ? totalTokens : '0'}</span>
            <span className="text-[9px] text-[#888898]">TOK</span>
          </div>
        </div>

        {/* Sentences Streamed */}
        <div className="p-2 rounded-lg bg-[#14141c] border border-[#1e1e28]">
          <span className="text-[#787888] text-[10px] block">SENTENCE CHUNKS</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-sm font-bold text-purple-300">{sentenceCount}</span>
            <span className="text-[9px] text-[#888898]">CHUNKS</span>
          </div>
        </div>

        {/* Voice Pipeline & Mic State */}
        <div className="p-2 rounded-lg bg-[#14141c] border border-[#1e1e28]">
          <span className="text-[#787888] text-[10px] block">MIC / WAKE-WORD</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isListening ? (
              <>
                <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400">LISTENING</span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs font-bold text-zinc-500">STANDBY</span>
              </>
            )}
          </div>
        </div>

        {/* TTS State & Barge-in Status */}
        <div className="p-2 rounded-lg bg-[#14141c] border border-[#1e1e28] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[#787888] text-[10px]">TTS STATE</span>
            {isSpeaking && onInterrupt && (
              <button
                onClick={onInterrupt}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                title="Barge-In / Stop Speech immediately"
              >
                STOP
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Volume2
              className={`w-3.5 h-3.5 ${
                ttsState === 'SPEAKING'
                  ? 'text-cyan-400 animate-pulse'
                  : ttsState === 'INTERRUPTED'
                  ? 'text-red-400'
                  : 'text-zinc-600'
              }`}
            />
            <span
              className={`text-xs font-bold ${
                ttsState === 'SPEAKING'
                  ? 'text-cyan-400'
                  : ttsState === 'INTERRUPTED'
                  ? 'text-red-400'
                  : ttsState === 'BUFFERING'
                  ? 'text-amber-400'
                  : 'text-zinc-500'
              }`}
            >
              {ttsState}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Active Subsystems & Governance Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1b1b24] text-[10px] text-[#808090]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[#606070]">AGENT:</span>
            <span className="text-white font-semibold">{activeAgent}</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[#606070]">ACTIVE TOOL:</span>
            <span className={activeTool ? 'text-cyan-300 font-semibold' : 'text-zinc-500'}>
              {activeTool || 'NONE (AWAITING)'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[#606070]">AUTOMATION:</span>
            <span className={automationActive ? 'text-emerald-400' : 'text-zinc-500'}>
              {automationActive ? 'ARMED' : 'DISABLED'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161620] border border-[#222230]">
            <ShieldCheck className="w-3 h-3 text-purple-400" />
            <span>STAGED SKILLS:</span>
            <span className="text-purple-300 font-bold">{stagedSkillCount}</span>
          </div>

          {duration > 0 && (
            <div className="flex items-center gap-1 text-[#606070]">
              <Clock className="w-3 h-3" />
              <span>{duration}ms total</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

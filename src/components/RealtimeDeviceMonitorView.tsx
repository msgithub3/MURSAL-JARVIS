import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Wifi,
  Battery,
  Shield,
  Eye,
  EyeOff,
  Cpu,
  Activity,
  Radio,
  Zap,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Send,
  CornerDownRight,
  Sparkles,
  Server,
  Layers,
  Search,
  ChevronRight,
  Clock,
  Terminal,
  Monitor,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  FullDeviceState,
  RealtimeEvent,
  RealtimeScreenState,
  ConnectionStatusInfo,
  MonitoringProfile,
  CommandQueueItem,
  PrivacySettings,
} from '../types';
import { globalDeviceMonitor } from '../lib/deviceMonitorEngine';
import { globalConnectionManager } from '../lib/connectionManager';
import { globalScreenIntelligence } from '../lib/screenIntelligenceEngine';
import { globalVoicePipelineGuard } from '../lib/voicePipelineGuard';

export const RealtimeDeviceMonitorView: React.FC = () => {
  // Real-time states
  const [deviceState, setDeviceState] = useState<FullDeviceState>(() => globalDeviceMonitor.getFullDeviceState());
  const [connectionState, setConnectionState] = useState<ConnectionStatusInfo>(() => globalConnectionManager.getConnectionInfo());
  const [screenState, setScreenState] = useState<RealtimeScreenState>(() => globalScreenIntelligence.getCurrentScreenState());
  const [events, setEvents] = useState<RealtimeEvent[]>(() => globalDeviceMonitor.getRecentEvents(25));
  const [commandQueue, setCommandQueue] = useState<CommandQueueItem[]>(() => globalVoicePipelineGuard.getCommandQueue());
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(() => globalDeviceMonitor.getPrivacySettings());

  // Interactive controls
  const [screenQueryInput, setScreenQueryInput] = useState('');
  const [isQueryingScreen, setIsQueryingScreen] = useState(false);
  const [screenQueryResult, setScreenQueryResult] = useState<string | null>(null);
  const [selectedEventFilter, setSelectedEventFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'NORMAL'>('ALL');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Laptop/Desktop Web Screen Capture State
  const [isLaptopCapturing, setIsLaptopCapturing] = useState(false);
  const [laptopFramesSent, setLaptopFramesSent] = useState(0);
  const [laptopCaptureError, setLaptopCaptureError] = useState<string | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const captureTimerRef = React.useRef<any>(null);
  const hiddenVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Subscriptions to singletons
  useEffect(() => {
    const unsubDevice = globalDeviceMonitor.subscribe((state) => setDeviceState(state));
    const unsubConn = globalConnectionManager.subscribe((state) => setConnectionState(state));
    const unsubScreen = globalScreenIntelligence.subscribe((state) => setScreenState(state));
    const unsubEvents = globalDeviceMonitor.subscribeToEvents((_evt, allEvents) => setEvents([...allEvents]));
    const unsubQueue = globalVoicePipelineGuard.subscribeQueue((queue) => setCommandQueue([...queue]));

    // Start live connection manager
    globalConnectionManager.connect();

    return () => {
      unsubDevice();
      unsubConn();
      unsubScreen();
      unsubEvents();
      unsubQueue();
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startLaptopScreenCapture = async () => {
    setLaptopCaptureError(null);
    try {
      if (!navigator?.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen capture API (getDisplayMedia) not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' as any },
        audio: false,
      });
      streamRef.current = stream;

      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      hiddenVideoRef.current = video;

      await video.play();

      setIsLaptopCapturing(true);
      globalScreenIntelligence.startContinuousMonitoring('PERIODIC_SAMPLING', 1200);
      setActionFeedback('Laptop Screen Capture active. Ephemeral sampling engaged.');

      stream.getVideoTracks()[0].onended = () => {
        stopLaptopScreenCapture();
      };

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      hiddenCanvasRef.current = canvas;
      const ctx = canvas.getContext('2d');

      captureTimerRef.current = setInterval(async () => {
        if (!video.videoWidth || !video.videoHeight || !ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

        setLaptopFramesSent((prev) => prev + 1);

        try {
          await fetch('/api/jarvis/screen/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              foregroundPackage: 'com.mursal.laptop.desktop',
              foregroundActivity: document.title || 'Laptop Display',
              imageThumbnailUrl: dataUrl,
              ocrText: `Active Web Cockpit: ${document.title}. Screen capture stream active.`,
              clientTimestamp: Date.now(),
              screenWidth: window.innerWidth,
              screenHeight: window.innerHeight,
            }),
          });
        } catch {
          // ignore transient post error
        }
      }, 1200);
    } catch (err: any) {
      console.error('getDisplayMedia error:', err);
      setLaptopCaptureError(err?.message || 'Permission denied or capture failed');
      setIsLaptopCapturing(false);
    }
  };

  const stopLaptopScreenCapture = () => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsLaptopCapturing(false);
    globalScreenIntelligence.stopContinuousMonitoring();
    setActionFeedback('Laptop Screen Capture stopped. Buffers cleared.');
  };

  const handleProfileChange = (profile: MonitoringProfile) => {
    globalDeviceMonitor.setMonitoringProfile(profile);
    setActionFeedback(`Monitoring Profile set to ${profile}`);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleToggleScreenAuth = () => {
    const next = !screenState.isMediaProjectionAuthorized;
    globalScreenIntelligence.setMediaProjectionAuthorization(next);
    setActionFeedback(`MediaProjection Screen Sharing ${next ? 'AUTHORIZED' : 'REVOKED'}`);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleToggleControlPermission = () => {
    const next = !deviceState.controlPermissionGranted;
    globalDeviceMonitor.setControlPermission(next);
    setActionFeedback(`Remote Device Control Permission ${next ? 'GRANTED' : 'REVOKED'}`);
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleTogglePrivacySetting = (key: keyof PrivacySettings) => {
    const current = privacySettings[key];
    if (typeof current === 'boolean') {
      const updated = globalDeviceMonitor.updatePrivacySettings({ [key]: !current });
      setPrivacySettings(updated);
    }
  };

  const handleScreenQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!screenQueryInput.trim()) return;

    setIsQueryingScreen(true);
    setScreenQueryResult(null);
    try {
      const res = await globalScreenIntelligence.analyzeScreenForQuestion(screenQueryInput, 'ur-Roman');
      setScreenQueryResult(res.answerText);
    } catch (err: any) {
      setScreenQueryResult(`Screen Query Error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsQueryingScreen(false);
    }
  };

  const handleSimulateScreenAction = (actionType: 'CLICK' | 'SCROLL_DOWN' | 'SCROLL_UP' | 'BACK', target?: string) => {
    const res = globalScreenIntelligence.executeScreenAction({
      actionType,
      targetElementText: target,
      requiresConfirmation: false,
    });
    setActionFeedback(res.message);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const filteredEvents = events.filter((ev) => {
    if (selectedEventFilter === 'ALL') return true;
    return ev.priority === selectedEventFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#0f0f14] border border-[#22222c]">
        <div className="flex items-center gap-3">
          <div className="relative p-2.5 rounded-lg bg-[#161620] border border-[#2c2c3a] text-cyan-400">
            <Smartphone className="w-5 h-5" />
            <span
              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                connectionState.status === 'CONNECTED'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionState.status === 'FALLBACK'
                  ? 'bg-amber-400 animate-bounce'
                  : 'bg-red-500'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                {deviceState.model} ({deviceState.manufacturer})
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1c1c28] text-cyan-300 border border-[#2a2a3e]">
                Android {deviceState.androidVersion} (API {deviceState.apiLevel})
              </span>
              {deviceState.isPaired && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> PAIRED & TRUSTED
                </span>
              )}
            </div>
            <p className="text-xs text-[#808090] font-mono mt-0.5">
              Device ID: {deviceState.deviceId} • Battery: {deviceState.batteryLevel}% ({deviceState.batteryState}) • Temp: {deviceState.batteryTemperatureCelsius}°C
            </p>
          </div>
        </div>

        {/* Profile Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#8a8a9a] flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Mode:
          </span>
          {(['ECO', 'BALANCED', 'REAL-TIME'] as MonitoringProfile[]).map((prof) => (
            <button
              key={prof}
              onClick={() => handleProfileChange(prof)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition-all cursor-pointer border ${
                deviceState.monitoringProfile === prof
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80 font-bold shadow-sm'
                  : 'bg-[#14141a] text-[#7a7a8a] border-[#22222a] hover:text-white hover:bg-[#1a1a24]'
              }`}
            >
              {prof}
            </button>
          ))}
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs font-mono flex items-center gap-2 animate-fadeIn">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Main 3-Column Cockpit Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Device Telemetry & Transport */}
        <div className="space-y-6">
          {/* Connection Status Card */}
          <div className="p-4 rounded-xl bg-[#0f0f14] border border-[#22222c] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5 uppercase tracking-wider">
                <Radio className="w-4 h-4 text-cyan-400" /> Transport & Connection
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  connectionState.status === 'CONNECTED'
                    ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                    : connectionState.status === 'FALLBACK'
                    ? 'bg-amber-950/70 text-amber-400 border border-amber-800/60'
                    : 'bg-red-950/70 text-red-400 border border-red-800/60'
                }`}
              >
                {connectionState.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[10px] text-[#7a7a8a] block">Transport</span>
                <span className="text-white font-semibold">{connectionState.transport}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[10px] text-[#7a7a8a] block">Ping RTT</span>
                <span className="text-cyan-300 font-semibold">{connectionState.pingLatencyMs} ms</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[10px] text-[#7a7a8a] block">Messages Sent</span>
                <span className="text-white">{connectionState.messagesSent}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[10px] text-[#7a7a8a] block">Messages Received</span>
                <span className="text-white">{connectionState.messagesReceived}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1a1a24] flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#808090]">Reconnect Backoff: {connectionState.currentBackoffMs}ms</span>
              <button
                onClick={() => globalConnectionManager.reconnect()}
                className="px-2.5 py-1 rounded bg-[#1a1a24] hover:bg-[#252534] text-[#c0c0d0] hover:text-white border border-[#2e2e3e] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Force Reconnect
              </button>
            </div>
          </div>

          {/* Deep Device Telemetry Card */}
          <div className="p-4 rounded-xl bg-[#0f0f14] border border-[#22222c] space-y-3">
            <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5 uppercase tracking-wider">
              <Cpu className="w-4 h-4 text-emerald-400" /> Device Telemetry
            </h3>

            <div className="space-y-2 text-xs font-mono">
              {/* Battery Level Progress */}
              <div className="p-2.5 rounded-lg bg-[#14141c] border border-[#20202a] space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-[#808090] flex items-center gap-1">
                    <Battery className="w-3.5 h-3.5 text-emerald-400" /> Battery Level
                  </span>
                  <span className="text-emerald-400 font-bold">{deviceState.batteryLevel}% ({deviceState.batteryState})</span>
                </div>
                <div className="w-full bg-[#20202c] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      deviceState.batteryLevel > 20 ? 'bg-emerald-400' : 'bg-red-500'
                    }`}
                    style={{ width: `${deviceState.batteryLevel}%` }}
                  />
                </div>
              </div>

              {/* Network */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                  <span className="text-[10px] text-[#7a7a8a] block">Network</span>
                  <span className="text-white flex items-center gap-1 truncate">
                    <Wifi className="w-3 h-3 text-sky-400" /> {deviceState.networkType}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                  <span className="text-[10px] text-[#7a7a8a] block">Local IP</span>
                  <span className="text-white truncate">{deviceState.ipAddress}</span>
                </div>
              </div>

              {/* Hardware Sensors */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                  <span className="text-[10px] text-[#7a7a8a] block">Storage Free</span>
                  <span className="text-white">{deviceState.freeStorageGb} GB / {deviceState.totalStorageGb} GB</span>
                </div>
                <div className="p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                  <span className="text-[10px] text-[#7a7a8a] block">RAM Free</span>
                  <span className="text-white">{deviceState.freeRamMb} MB</span>
                </div>
              </div>

              {/* State Flags */}
              <div className="p-2.5 rounded-lg bg-[#14141c] border border-[#20202a] flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] bg-[#1a1a24] text-[#a0a0b0] border border-[#262632]">
                  Screen: {deviceState.isScreenOn ? 'ON' : 'OFF'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-[#1a1a24] text-[#a0a0b0] border border-[#262632]">
                  Lock: {deviceState.isLocked ? 'LOCKED' : 'UNLOCKED'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-[#1a1a24] text-[#a0a0b0] border border-[#262632]">
                  Audio: {deviceState.ringerMode}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-[#1a1a24] text-[#a0a0b0] border border-[#262632]">
                  DND: {deviceState.isDoNotDisturb ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            </div>
          </div>

          {/* Privacy & Security Settings Card */}
          <div className="p-4 rounded-xl bg-[#0f0f14] border border-[#22222c] space-y-3">
            <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5 uppercase tracking-wider">
              <Shield className="w-4 h-4 text-amber-400" /> Privacy & Authorization
            </h3>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[#c0c0d0]">MediaProjection Authorization</span>
                <button
                  onClick={handleToggleScreenAuth}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    screenState.isMediaProjectionAuthorized
                      ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
                      : 'bg-[#22222e] text-[#808090] border border-[#333342] hover:text-white'
                  }`}
                >
                  {screenState.isMediaProjectionAuthorized ? 'GRANTED' : 'REVOKED'}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[#c0c0d0]">Remote Device Control</span>
                <button
                  onClick={handleToggleControlPermission}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    deviceState.controlPermissionGranted
                      ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/60'
                      : 'bg-[#22222e] text-[#808090] border border-[#333342] hover:text-white'
                  }`}
                >
                  {deviceState.controlPermissionGranted ? 'ALLOWED' : 'DISABLED'}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[#c0c0d0]">Auto-Redact Passwords & Banking</span>
                <button
                  onClick={() => handleTogglePrivacySetting('autoRedactPasswordsAndPins')}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    privacySettings.autoRedactPasswordsAndPins
                      ? 'bg-amber-900/60 text-amber-300 border border-amber-700/60'
                      : 'bg-[#22222e] text-[#808090]'
                  }`}
                >
                  {privacySettings.autoRedactPasswordsAndPins ? 'ENABLED' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#14141c] border border-[#20202a]">
                <span className="text-[#c0c0d0]">Local-Only Mode</span>
                <button
                  onClick={() => handleTogglePrivacySetting('localProcessingOnly')}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    privacySettings.localProcessingOnly
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60'
                      : 'bg-[#22222e] text-[#808090]'
                  }`}
                >
                  {privacySettings.localProcessingOnly ? 'LOCAL EDGE' : 'CLOUD ENABLED'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Center Column: Screen Intelligence & Accessibility Inspector */}
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#0f0f14] border border-[#22222c] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5 uppercase tracking-wider">
                <Eye className="w-4 h-4 text-cyan-400" /> Screen Intelligence Engine
              </h3>
              <div className="flex items-center gap-1.5">
                {screenState.isPrivacyOverlayActive && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950/80 text-red-300 border border-red-800/80 flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> PRIVACY MASK ACTIVE
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1a1a24] text-cyan-300 border border-[#28283a]">
                  {screenState.accessibilityTree.length} UI NODES
                </span>
              </div>
            </div>

            {/* Foreground Context */}
            <div className="p-3 rounded-lg bg-[#14141c] border border-[#20202a] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#7a7a8a]">Foreground App:</span>
                <span className="text-white font-semibold">{screenState.foregroundPackage}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#7a7a8a]">Activity:</span>
                <span className="text-cyan-300 truncate max-w-[240px]">{screenState.foregroundActivity}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-[#7a7a8a]">
                <span>Resolution: {screenState.screenWidth}x{screenState.screenHeight}</span>
                <span>Hash: {screenState.visualHash}</span>
              </div>
            </div>

            {/* Simulated/Live Screen Frame Preview */}
            <div className="relative rounded-lg bg-[#08080a] border border-[#22222e] p-3 min-h-[160px] flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#181824] pb-2 text-[10px] font-mono text-[#666678]">
                <span>MURSAL SCREEN BUFFER (EPHEMERAL RAM)</span>
                <span>{new Date(screenState.timestamp).toLocaleTimeString()}</span>
              </div>

              {/* Visualized Screen Nodes */}
              <div className="my-2 space-y-1 max-h-[140px] overflow-y-auto pr-1">
                {screenState.accessibilityTree.length === 0 ? (
                  <div className="text-center py-6 text-xs text-[#555566] font-mono">
                    No active screen elements captured. MediaProjection standby.
                  </div>
                ) : (
                  screenState.accessibilityTree.slice(0, 6).map((node) => (
                    <div
                      key={node.nodeId}
                      className="p-1.5 rounded bg-[#101016] border border-[#1e1e28] flex items-center justify-between text-[11px] font-mono"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a24] text-cyan-400">
                          {node.className.split('.').pop()}
                        </span>
                        <span className="text-[#d0d0dc] truncate">{node.text || node.contentDescription || node.viewId || 'Interactive Node'}</span>
                      </div>
                      {node.isClickable && (
                        <button
                          onClick={() => handleSimulateScreenAction('CLICK', node.text || node.viewId)}
                          className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-950/70 text-cyan-300 border border-cyan-800 hover:bg-cyan-900 cursor-pointer"
                        >
                          Tap
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Interactive Action Shortcuts */}
              <div className="pt-2 border-t border-[#181824] flex items-center gap-1.5 overflow-x-auto text-[10px] font-mono">
                <span className="text-[#666678] uppercase">Actions:</span>
                <button
                  onClick={() => handleSimulateScreenAction('SCROLL_DOWN')}
                  className="px-2 py-0.5 rounded bg-[#161622] hover:bg-[#202030] text-[#a0a0b0] border border-[#242432] cursor-pointer"
                >
                  Scroll Down
                </button>
                <button
                  onClick={() => handleSimulateScreenAction('SCROLL_UP')}
                  className="px-2 py-0.5 rounded bg-[#161622] hover:bg-[#202030] text-[#a0a0b0] border border-[#242432] cursor-pointer"
                >
                  Scroll Up
                </button>
                <button
                  onClick={() => handleSimulateScreenAction('BACK')}
                  className="px-2 py-0.5 rounded bg-[#161622] hover:bg-[#202030] text-[#a0a0b0] border border-[#242432] cursor-pointer"
                >
                  Back Key
                </button>
              </div>
            </div>

            {/* Live Screen AI Reasoning Prompt */}
            <form onSubmit={handleScreenQuery} className="space-y-2">
              <label className="text-[11px] font-mono text-[#8a8a9a] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Ask JARVIS About Current Screen Context:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={screenQueryInput}
                  onChange={(e) => setScreenQueryInput(e.target.value)}
                  placeholder="e.g. Screen par kya chal raha hai? / Explain this screen"
                  className="flex-1 bg-[#121218] border border-[#242432] focus:border-cyan-500 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#505060] outline-none"
                />
                <button
                  type="submit"
                  disabled={isQueryingScreen || !screenQueryInput.trim()}
                  className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-mono text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isQueryingScreen ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Ask
                </button>
              </div>
            </form>

            {/* Screen Reasoning Answer */}
            {screenQueryResult && (
              <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-900/60 text-xs font-mono text-cyan-100 space-y-1">
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">
                  JARVIS Screen Vision Analysis:
                </span>
                <p className="leading-relaxed">{screenQueryResult}</p>
              </div>
            )}

            {/* Laptop / Desktop Realtime Screen Intelligence Sub-Panel */}
            <div className="p-3 rounded-lg bg-[#0e0e14] border border-[#222230] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Laptop / Desktop Screen Capture
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isLaptopCapturing ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                    }`}
                  />
                  <span className="text-[10px] font-mono text-[#8a8a9a]">
                    {isLaptopCapturing ? 'STREAMING ACTIVE' : 'STANDBY'}
                  </span>
                </div>
              </div>

              {/* Real-time Telemetry Metrics */}
              <div className="grid grid-cols-4 gap-2 text-center font-mono">
                <div className="p-2 rounded bg-[#14141c] border border-[#1e1e28]">
                  <span className="text-[9px] text-[#666678] block">MODE</span>
                  <span className="text-[11px] font-bold text-cyan-300">
                    {screenState.monitoringMetrics?.mode || 'SAMPLING'}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#14141c] border border-[#1e1e28]">
                  <span className="text-[9px] text-[#666678] block">SAMPLING</span>
                  <span className="text-[11px] font-bold text-emerald-400">
                    {isLaptopCapturing ? '0.8 Hz' : 'Standby'}
                  </span>
                </div>
                <div className="p-2 rounded bg-[#14141c] border border-[#1e1e28]">
                  <span className="text-[9px] text-[#666678] block">TRANSPORT</span>
                  <span className="text-[11px] font-bold text-white">
                    {screenState.monitoringMetrics?.transportLatencyMs ?? 4} ms
                  </span>
                </div>
                <div className="p-2 rounded bg-[#14141c] border border-[#1e1e28]">
                  <span className="text-[9px] text-[#666678] block">FRAMES</span>
                  <span className="text-[11px] font-bold text-cyan-400">
                    {isLaptopCapturing ? laptopFramesSent : screenState.monitoringMetrics?.framesIngested ?? 0}
                  </span>
                </div>
              </div>

              {/* Start / Stop Screen Capture Trigger */}
              <div className="flex items-center gap-2">
                {!isLaptopCapturing ? (
                  <button
                    type="button"
                    onClick={startLaptopScreenCapture}
                    className="flex-1 py-2 px-3 bg-cyan-600/90 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-2 border border-cyan-400/30 cursor-pointer transition-colors"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Start Laptop Screen Monitoring (getDisplayMedia)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLaptopScreenCapture}
                    className="flex-1 py-2 px-3 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-2 border border-red-400/30 cursor-pointer transition-colors"
                  >
                    <VideoOff className="w-3.5 h-3.5" />
                    Stop Laptop Screen Monitoring
                  </button>
                )}
              </div>

              {/* Capture Error Notification */}
              {laptopCaptureError && (
                <div className="p-2 rounded bg-red-950/40 border border-red-800/60 text-[11px] font-mono text-red-200">
                  Screen capture notification: {laptopCaptureError}
                </div>
              )}

              {/* Live Captured Thumbnail Preview */}
              {screenState.imageThumbnailUrl && (
                <div className="rounded border border-[#242434] overflow-hidden bg-black flex flex-col items-center">
                  <div className="w-full bg-[#121218] px-2 py-1 text-[9px] font-mono text-[#777788] flex justify-between">
                    <span>LATEST SCREEN INGESTION FRAME</span>
                    <span>JPEG • EPHEMERAL RAM</span>
                  </div>
                  <img
                    src={screenState.imageThumbnailUrl}
                    alt="Active Screen Ingestion"
                    className="max-h-40 w-auto object-contain"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Voice Pipeline Command Queue */}
          <div className="p-4 rounded-xl bg-[#0f0f14] border border-[#22222c] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5 uppercase tracking-wider">
                <Terminal className="w-4 h-4 text-purple-400" /> Voice Pipeline Command Queue
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1a1a24] text-purple-300 border border-[#28283a]">
                {commandQueue.length} TASKS
              </span>
            </div>

            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {commandQueue.length === 0 ? (
                <div className="text-center py-4 text-xs text-[#555566] font-mono">
                  Queue empty. Ready for utterances without dropping.
                </div>
              ) : (
                commandQueue.map((item) => (
                  <div
                    key={item.commandId}
                    className="p-2 rounded bg-[#14141c] border border-[#20202a] flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          item.status === 'RUNNING'
                            ? 'bg-cyan-400 animate-ping'
                            : item.status === 'COMPLETED'
                            ? 'bg-emerald-400'
                            : item.status === 'QUEUED'
                            ? 'bg-amber-400'
                            : 'bg-red-400'
                        }`}
                      />
                      <span className="text-white truncate">"{item.rawText}"</span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        item.status === 'RUNNING'
                          ? 'bg-cyan-950 text-cyan-300'
                          : item.status === 'COMPLETED'
                          ? 'bg-emerald-950 text-emerald-300'
                          : item.status === 'QUEUED'
                          ? 'bg-amber-950 text-amber-300'
                          : 'bg-red-950 text-red-300'
                      }`}
                    >
                      {item.status} ({item.priority})
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Real-Time EventBus Stream */}
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#0f0f14] border border-[#22222c] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-emerald-400" /> EventBus Stream ({filteredEvents.length})
              </h3>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                {(['ALL', 'CRITICAL', 'HIGH', 'NORMAL'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedEventFilter(filter)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${
                      selectedEventFilter === filter
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'text-[#777788] hover:text-white'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#555566] font-mono">
                  No events matching filter.
                </div>
              ) : (
                filteredEvents.map((evt) => (
                  <div
                    key={evt.eventId}
                    className="p-2.5 rounded-lg bg-[#121218] border border-[#1e1e28] text-xs font-mono space-y-1.5 hover:border-[#2e2e3e] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          evt.priority === 'CRITICAL'
                            ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                            : evt.priority === 'HIGH'
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                            : 'bg-[#1a1a24] text-cyan-300 border border-[#2a2a3e]'
                        }`}
                      >
                        {evt.eventType}
                      </span>
                      <span className="text-[10px] text-[#666678] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#a0a0b0]">
                      <span className="text-[#666678]">Source:</span> {evt.source} • <span className="text-[#666678]">Privacy:</span> {evt.privacyLevel}
                    </div>

                    <pre className="text-[10px] text-emerald-300/90 bg-[#0a0a0e] p-1.5 rounded overflow-x-auto">
                      {JSON.stringify(evt.payload, null, 1)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

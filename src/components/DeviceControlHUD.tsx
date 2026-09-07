import React, { useState, useEffect } from 'react';
import {
  Battery,
  BatteryCharging,
  Flashlight,
  Volume2,
  VolumeX,
  Sun,
  Wifi,
  WifiOff,
  Bluetooth,
  Play,
  Pause,
  SkipForward,
  Bell,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Radio,
} from 'lucide-react';
import { DeviceTelemetryState } from '../lib/deviceActionRouter';
import { globalDeviceMonitor } from '../lib/deviceMonitorEngine';
import { globalWebSocketManager } from '../lib/connectionManager';

interface DeviceControlHUDProps {
  onExecuteAction: (action: string, params?: Record<string, any>, confirmed?: boolean) => Promise<any>;
  onSpeakText?: (text: string) => void;
  langMode?: string;
}

const defaultDeviceState: DeviceTelemetryState = {
  battery: {
    level: 84,
    isCharging: false,
    temperature: 32,
    health: 'GOOD',
  },
  flashlight: false,
  volume: {
    media: 75,
    ring: 80,
    alarm: 90,
  },
  brightness: 80,
  wifi: {
    enabled: true,
    ssid: 'Jazz-Super4G-Fiber',
    ipAddress: '192.168.100.42',
  },
  bluetooth: {
    enabled: true,
    connectedDevices: ['JARVIS-Mesh-Node-1'],
  },
  hotspot: false,
  mobileData: true,
  mediaPlayback: {
    isPlaying: false,
    currentTrack: 'Coke Studio Season 15',
    artist: 'Pakistani Fusion',
  },
  recentNotifications: [
    {
      id: 'notif-1',
      app: 'WhatsApp',
      title: 'Customer Order',
      body: 'Bhai COD order confirm hai?',
      timestamp: Date.now() - 120000,
    },
    {
      id: 'notif-2',
      app: 'MursalCart',
      title: 'Profit Alert',
      body: 'Winning product +4,200 PKR margin',
      timestamp: Date.now() - 360000,
    },
  ],
  securityLock: false,
  lastUpdated: Date.now(),
};

export const DeviceControlHUD: React.FC<DeviceControlHUDProps> = ({
  onExecuteAction,
  onSpeakText,
  langMode = 'ur-Roman',
}) => {
  const [deviceState, setDeviceState] = useState<DeviceTelemetryState>(defaultDeviceState);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [sensitivePrompt, setSensitivePrompt] = useState<{ action: string; prompt: string } | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);

  // Synchronize state from full device state
  const syncFromFull = (full: any) => {
    if (!full) return;
    setDeviceState((prev) => ({
      battery: {
        level: full.battery?.level ?? full.batteryLevel ?? prev?.battery?.level ?? 84,
        isCharging: Boolean(
          full.battery?.status === 'CHARGING' ||
          full.battery?.charging ||
          full.battery?.isCharging ||
          full.batteryState === 'CHARGING' ||
          prev?.battery?.isCharging
        ),
        temperature: full.battery?.temperatureCelsius ?? full.battery?.temperature ?? prev?.battery?.temperature ?? 32,
        health: full.battery?.health ?? prev?.battery?.health ?? 'GOOD',
      },
      flashlight: Boolean(full.flashlight ?? full.services?.flashlightActive ?? prev?.flashlight),
      volume: {
        media: full.volume?.volumeLevels?.media ?? full.volume?.media ?? full.audio?.volumeLevels?.media ?? prev?.volume?.media ?? 75,
        ring: full.volume?.volumeLevels?.ring ?? full.volume?.ring ?? full.audio?.volumeLevels?.ring ?? prev?.volume?.ring ?? 80,
        alarm: full.volume?.volumeLevels?.alarm ?? full.volume?.alarm ?? full.audio?.volumeLevels?.alarm ?? prev?.volume?.alarm ?? 90,
      },
      brightness: full.screen?.brightness ?? full.brightness ?? prev?.brightness ?? 80,
      wifi: {
        enabled: Boolean(
          full.wifi?.enabled !== undefined
            ? full.wifi.enabled
            : full.network?.wifiState === 'ENABLED' ||
              full.network?.type === 'WIFI' ||
              (full.network?.wifiConnected !== undefined ? full.network.wifiConnected : (prev?.wifi?.enabled ?? true))
        ),
        ssid: full.network?.wifiSsid ?? full.wifi?.ssid ?? prev?.wifi?.ssid ?? 'Jazz-Super4G-Fiber',
        ipAddress: full.network?.ipAddress ?? full.wifi?.ipAddress ?? prev?.wifi?.ipAddress ?? '192.168.100.42',
      },
      bluetooth: {
        enabled: Boolean(
          full.bluetooth?.enabled !== undefined
            ? full.bluetooth.enabled
            : full.bluetooth?.state === 'ON' ||
              (full.bluetooth?.connectedDevices && full.bluetooth.connectedDevices.length > 0) ||
              (prev?.bluetooth?.enabled ?? true)
        ),
        connectedDevices: full.bluetooth?.connectedDevices ?? prev?.bluetooth?.connectedDevices ?? ['JARVIS-Mesh-Node-1'],
      },
      hotspot: Boolean(full.hotspot ?? full.network?.hotspotActive ?? prev?.hotspot),
      mobileData: full.mobileData !== undefined ? Boolean(full.mobileData) : (full.network?.mobileDataEnabled ?? prev?.mobileData ?? true),
      mediaPlayback: full.mediaPlayback ?? prev?.mediaPlayback ?? {
        isPlaying: false,
        currentTrack: 'Coke Studio Season 15',
        artist: 'Pakistani Fusion',
      },
      recentNotifications: full.recentNotifications ?? prev?.recentNotifications ?? [
        {
          id: 'notif-1',
          app: 'WhatsApp',
          title: 'Customer Order',
          body: 'Bhai COD order confirm hai?',
          timestamp: Date.now() - 120000,
        },
      ],
      securityLock: Boolean(full.screen?.isLocked ?? full.isLocked ?? full.securityLock ?? prev?.securityLock),
      lastUpdated: full.lastUpdated ?? Date.now(),
    }));
  };

  // Fetch initial state with timeout & offline tolerance (never throws or crashes)
  const fetchState = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch('/api/jarvis/device/state', { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.fullDeviceState) {
          syncFromFull(data.fullDeviceState);
        } else if (data.state || data.legacyState) {
          const raw = data.state || data.legacyState;
          syncFromFull(raw);
        }
      } else {
        // Fallback to local memory engine
        syncFromFull(globalDeviceMonitor.getFullDeviceState());
      }
    } catch (_) {
      clearTimeout(timer);
      // Offline fallback: sync directly from local monitor engine
      syncFromFull(globalDeviceMonitor.getFullDeviceState());
    }
  };

  useEffect(() => {
    // Initial sync from reactive engine immediately
    syncFromFull(globalDeviceMonitor.getFullDeviceState());
    fetchState();

    // Subscribe to real-time updates from device monitor
    const unsubMonitor = globalDeviceMonitor.subscribeToFullState((full) => {
      syncFromFull(full);
    });

    // Also subscribe to incoming WebSocket messages for immediate state updates
    const unsubWs = globalWebSocketManager.subscribeMessage((envelope) => {
      if (envelope.type === 'STATE_UPDATE' && envelope.payload) {
        const payload = envelope.payload;
        syncFromFull(payload.deviceState || payload.fullDeviceState || payload);
      }
    });

    return () => {
      unsubMonitor();
      unsubWs();
    };
  }, []);

  const handleAction = async (action: string, params: Record<string, any> = {}, confirmed = false) => {
    setLoadingAction(action);
    try {
      const res = await fetch('/api/jarvis/device/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params, confirmed }),
      });
      const data = await res.json();
      if (data.result?.requiresConfirmation) {
        setSensitivePrompt({ action, prompt: data.result.confirmationPrompt || 'Jani, ye action thora sensitive hai. Kar doon?' });
      } else {
        setSensitivePrompt(null);
        if (data.currentState) {
          syncFromFull(data.currentState);
        }
        if (onSpeakText && data.result?.message) {
          onSpeakText(data.result.message);
        }
      }
    } catch (e) {
      console.error('Device action failed', e);
    } finally {
      setLoadingAction(null);
    }
  };

  if (!deviceState) {
    return (
      <div className="p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26] text-xs font-mono text-[#80808a] flex items-center justify-center">
        Connecting to Android Device Subsystems...
      </div>
    );
  }

  return (
    <div id="device-control-hud" className="p-4 rounded-2xl bg-[#0f0f13] border border-[#1e1e26] shadow-lg space-y-4 font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e1e24] pb-2.5">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span className="font-mono font-bold text-[#f0f0f5] tracking-wider uppercase">
            Android Hardware & Subsystems Control
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#71717a]">Mursal Android Pro (Lahore Node)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        </div>
      </div>

      {/* Sensitive Confirmation Alert if active */}
      {sensitivePrompt && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold font-mono text-[11px]">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>SENSITIVE ACTION CONFIRMATION</span>
          </div>
          <p className="text-xs text-[#e0e0e0] font-sans">{sensitivePrompt.prompt}</p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => handleAction(sensitivePrompt.action, {}, true)}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-[11px] transition-colors cursor-pointer"
            >
              Han, Kar Do (Confirm)
            </button>
            <button
              onClick={() => setSensitivePrompt(null)}
              className="px-3 py-1 rounded bg-[#1e1e26] hover:bg-[#2a2a38] text-[#c0c0ca] font-mono text-[11px] transition-colors cursor-pointer"
            >
              Cancel (Nahi)
            </button>
          </div>
        </div>
      )}

      {/* Quick Controls Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Battery Telemetry */}
        <div className="p-3 rounded-xl bg-[#131318] border border-[#1e1e26] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono text-[#80808a] block uppercase">Battery</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-bold font-mono text-white">{deviceState?.battery?.level ?? 84}%</span>
              <span className="text-[10px] text-emerald-400 font-mono">{deviceState?.battery?.temperature ?? 32}°C</span>
            </div>
            <span className="text-[9px] text-[#71717a] font-mono block">Health: {deviceState?.battery?.health ?? 'GOOD'}</span>
          </div>
          {deviceState?.battery?.isCharging ? (
            <BatteryCharging className="w-6 h-6 text-emerald-400 animate-pulse" />
          ) : (
            <Battery className="w-6 h-6 text-cyan-400" />
          )}
        </div>

        {/* Flashlight / Torch Toggle */}
        <button
          onClick={() => handleAction('control_flashlight')}
          disabled={loadingAction === 'control_flashlight'}
          className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
            deviceState?.flashlight
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-[#131318] hover:bg-[#181820] border-[#1e1e26] text-[#c0c0ca]'
          }`}
        >
          <div>
            <span className="text-[10px] font-mono text-[#80808a] block uppercase">Torch / Flashlight</span>
            <span className="text-sm font-bold font-mono mt-0.5 block text-white">
              {deviceState?.flashlight ? 'ACTIVE (ON)' : 'OFF'}
            </span>
            <span className="text-[9px] text-[#71717a] font-mono block">Camera Torch API</span>
          </div>
          <Flashlight className={`w-5 h-5 ${deviceState?.flashlight ? 'text-amber-400 fill-amber-400 animate-pulse' : 'text-[#71717a]'}`} />
        </button>

        {/* Wi-Fi Toggle */}
        <button
          onClick={() => handleAction('control_wifi')}
          disabled={loadingAction === 'control_wifi'}
          className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
            deviceState?.wifi?.enabled
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
              : 'bg-[#131318] hover:bg-[#181820] border-[#1e1e26] text-[#80808a]'
          }`}
        >
          <div>
            <span className="text-[10px] font-mono text-[#80808a] block uppercase">Wi-Fi Network</span>
            <span className="text-sm font-bold font-mono mt-0.5 block text-white truncate max-w-[90px]">
              {deviceState?.wifi?.enabled ? 'Wi-Fi 6' : 'DISABLED'}
            </span>
            <span className="text-[9px] text-[#71717a] font-mono block">{deviceState?.wifi?.ipAddress || '192.168.100.42'}</span>
          </div>
          {deviceState?.wifi?.enabled ? <Wifi className="w-5 h-5 text-sky-400" /> : <WifiOff className="w-5 h-5 text-red-400" />}
        </button>

        {/* Anti-Loss Siren Locator */}
        <button
          onClick={() => handleAction('ring_device')}
          disabled={loadingAction === 'ring_device'}
          className="p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-left flex items-center justify-between transition-all cursor-pointer"
          title="Sound Anti-Loss acoustic alarm on Android device at maximum volume"
        >
          <div>
            <span className="text-[10px] font-mono text-red-400/80 block uppercase">Anti-Loss Siren</span>
            <span className="text-sm font-bold font-mono mt-0.5 block text-white">LOCATE PHONE</span>
            <span className="text-[9px] text-red-400/60 font-mono block">Max Audio Beacon</span>
          </div>
          <Radio className="w-5 h-5 text-red-400 animate-pulse" />
        </button>
      </div>

      {/* Sliders & Media Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        {/* Volume Slider */}
        <div className="p-3 rounded-xl bg-[#131318] border border-[#1e1e26] space-y-1.5">
          <div className="flex items-center justify-between text-[#a0a0b0]">
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] font-mono uppercase">Media Volume</span>
            </div>
            <span className="font-mono font-bold text-white text-xs">{deviceState?.volume?.media ?? 75}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={deviceState?.volume?.media ?? 75}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setDeviceState((prev) => ({
                ...prev,
                volume: { ...(prev?.volume || { ring: 80, alarm: 90 }), media: val },
              }));
            }}
            onMouseUp={(e) => handleAction('set_volume', { level: parseInt((e.target as HTMLInputElement).value, 10) })}
            onTouchEnd={(e) => handleAction('set_volume', { level: parseInt((e.target as HTMLInputElement).value, 10) })}
            className="w-full accent-cyan-400 h-1.5 bg-[#22222d] rounded-lg cursor-pointer"
          />
        </div>

        {/* Brightness Slider */}
        <div className="p-3 rounded-xl bg-[#131318] border border-[#1e1e26] space-y-1.5">
          <div className="flex items-center justify-between text-[#a0a0b0]">
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-mono uppercase">Brightness</span>
            </div>
            <span className="font-mono font-bold text-white text-xs">{deviceState?.brightness ?? 80}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            value={deviceState?.brightness ?? 80}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setDeviceState((prev) => ({ ...prev, brightness: val }));
            }}
            onMouseUp={(e) => handleAction('set_brightness', { level: parseInt((e.target as HTMLInputElement).value, 10) })}
            onTouchEnd={(e) => handleAction('set_brightness', { level: parseInt((e.target as HTMLInputElement).value, 10) })}
            className="w-full accent-amber-400 h-1.5 bg-[#22222d] rounded-lg cursor-pointer"
          />
        </div>

        {/* Media Playback Controller */}
        <div className="p-3 rounded-xl bg-[#131318] border border-[#1e1e26] flex items-center justify-between">
          <div className="truncate pr-2">
            <span className="text-[10px] font-mono text-[#80808a] block uppercase">Media Engine</span>
            <span className="text-xs font-bold text-white block truncate">
              {deviceState?.mediaPlayback?.currentTrack || 'Coke Studio Season 15'}
            </span>
            <span className="text-[9px] text-[#71717a] block truncate">
              {deviceState?.mediaPlayback?.artist || 'Pakistani Fusion'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleAction('control_media', { action: 'toggle' })}
              className="p-2 rounded-lg bg-[#1e1e26] hover:bg-[#2a2a38] text-white transition-colors cursor-pointer"
              title={deviceState?.mediaPlayback?.isPlaying ? 'Pause' : 'Play'}
            >
              {deviceState?.mediaPlayback?.isPlaying ? (
                <Pause className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Play className="w-3.5 h-3.5 text-white" />
              )}
            </button>
            <button
              onClick={() => handleAction('control_media', { action: 'next' })}
              className="p-2 rounded-lg bg-[#1e1e26] hover:bg-[#2a2a38] text-[#a0a0b0] hover:text-white transition-colors cursor-pointer"
              title="Next Track"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications Drawer Toggle */}
      <div className="pt-1 border-t border-[#1e1e24] flex items-center justify-between">
        <button
          onClick={() => setNotificationOpen(!notificationOpen)}
          className="text-xs font-mono text-[#a0a0b0] hover:text-white flex items-center gap-1.5 cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5 text-purple-400" />
          <span>Status Bar Notifications ({deviceState?.recentNotifications?.length || 0})</span>
        </button>
        <span className="text-[10px] font-mono text-[#71717a]">
          Last Telemetry Sync: {new Date(deviceState?.lastUpdated || Date.now()).toLocaleTimeString()}
        </span>
      </div>

      {notificationOpen && (
        <div className="space-y-1.5 pt-1">
          {(deviceState?.recentNotifications || []).map((n, idx) => (
            <div key={`${n.id}-${idx}`} className="p-2 rounded-lg bg-[#14141a] border border-[#1e1e26] flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-purple-400 font-semibold block">{n.app}</span>
                <span className="text-xs font-medium text-white block">{n.title}</span>
                <span className="text-[11px] text-[#a0a0b0] block">{n.body}</span>
              </div>
              <span className="text-[9px] font-mono text-[#71717a] whitespace-nowrap">
                {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

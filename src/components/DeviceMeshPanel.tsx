import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Server,
  Battery,
  Wifi,
  Shield,
  ShieldAlert,
  Radio,
  MapPin,
  RefreshCw,
  BellRing,
  Lock,
  Unlock,
} from 'lucide-react';
import { MeshDevice, AuditLog } from '../types';

export const DeviceMeshPanel: React.FC = () => {
  const [devices, setDevices] = useState<MeshDevice[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchMeshData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/jarvis/mesh/devices');
      const data = await res.json();
      setDevices(data.devices || []);
      setAuditLogs(data.auditLogs || []);
    } catch (e) {
      console.error('Failed to fetch mesh devices:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeshData();
    const timer = setInterval(fetchMeshData, 12000);
    return () => clearInterval(timer);
  }, []);

  const handleDeviceAction = async (deviceId: string, action: 'LOCATE_PING' | 'TOGGLE_LOCK') => {
    try {
      const res = await fetch('/api/jarvis/mesh/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, action }),
      });
      const data = await res.json();
      if (data.message) {
        setActionMessage(data.message);
        setTimeout(() => setActionMessage(null), 5000);
      }
      fetchMeshData();
    } catch (e) {
      console.error('Error triggering device mesh action:', e);
    }
  };

  return (
    <div id="device-mesh-panel" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#141418] border border-[#22222a]">
            <Radio className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">SECURE DEVICE MESH & ANTI-LOSS</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#16161c] text-emerald-400 border border-[#22222a]">
                ECC ENCRYPTED
              </span>
            </div>
            <p className="text-xs text-[#80808a]">
              Synchronous P2P telemetry between Android Primary Client, Cloud Brain, and Paired Nodes with Anti-Loss Remote Alarm.
            </p>
          </div>
        </div>

        <button
          id="btn-refresh-mesh"
          onClick={fetchMeshData}
          disabled={isLoading}
          className="px-3.5 py-1.5 rounded-lg bg-[#141418] hover:bg-[#1e1e26] text-[#e0e0e0] text-xs font-mono flex items-center gap-2 transition-all cursor-pointer border border-[#22222a]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          SYNC TELEMETRY
        </button>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-lg bg-[#141418] border border-[#2e2e40] text-[#e0e0e0] text-xs font-mono flex items-center gap-2">
          <BellRing className="w-4 h-4 text-cyan-400 animate-bounce" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Nodes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((device, idx) => (
          <div
            key={`${device.id}-${idx}`}
            className={`p-4 rounded-xl bg-[#0f0f13] border ${
              device.isLocked ? 'border-red-500/40' : 'border-[#1e1e26]'
            } space-y-4`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {device.type === 'android_phone' ? (
                  <Smartphone className="w-5 h-5 text-sky-400" />
                ) : (
                  <Server className="w-5 h-5 text-purple-400" />
                )}
                <div>
                  <h3 className="text-sm font-semibold text-white">{device.name}</h3>
                  <span className="text-[10px] font-mono text-[#71717a]">{device.id}</span>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  device.status === 'online'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                {device.status.toUpperCase()}
              </span>
            </div>

            {/* Telemetry Gauges */}
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-2 rounded-lg bg-[#121216] border border-[#1e1e24] flex items-center gap-2">
                <Battery className={`w-4 h-4 ${device.battery < 20 ? 'text-red-400' : 'text-emerald-400'}`} />
                <span className="text-[#d0d0d8]">{device.battery}%</span>
              </div>
              <div className="p-2 rounded-lg bg-[#121216] border border-[#1e1e24] flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                <span className="truncate text-[#d0d0d8]">{device.network}</span>
              </div>
              <div className="p-2 rounded-lg bg-[#121216] border border-[#1e1e24] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="truncate text-[#d0d0d8]">{device.lastLocation.label}</span>
              </div>
            </div>

            {/* Actions for Anti-Loss & Security */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#1e1e26]">
              <button
                id={`btn-locate-${device.id}`}
                onClick={() => handleDeviceAction(device.id, 'LOCATE_PING')}
                className="flex-1 py-1.5 px-3 rounded-lg bg-[#181822] hover:bg-[#20202e] text-white text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-[#28283a]"
              >
                <BellRing className="w-3.5 h-3.5 text-cyan-400" />
                ANTI-LOSS BEACON
              </button>

              <button
                id={`btn-lock-${device.id}`}
                onClick={() => handleDeviceAction(device.id, 'TOGGLE_LOCK')}
                className={`py-1.5 px-3 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                  device.isLocked
                    ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25'
                    : 'bg-[#141418] hover:bg-[#1e1e26] text-[#b0b0ba] border-[#22222a]'
                }`}
              >
                {device.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {device.isLocked ? 'LOCKED' : 'LOCK'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Audit Log Stream */}
      <div className="p-4 rounded-xl bg-[#0f0f13] border border-[#1e1e26]">
        <h3 className="text-xs font-mono font-semibold text-white tracking-wider mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          CRYPTOGRAPHIC MESH AUDIT TRAIL
        </h3>
        <div className="space-y-1.5 font-mono text-xs max-h-48 overflow-y-auto">
          {auditLogs.map((log, idx) => (
            <div
              key={`${log.id}-${idx}`}
              className="flex items-center justify-between p-2 rounded bg-[#121216] border border-[#1e1e24] text-[#c0c0ca]"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    log.level === 'SECURE'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : log.level === 'SECURITY'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'bg-[#181822] text-[#a0a0b0] border border-[#262636]'
                  }`}
                >
                  {log.level}
                </span>
                <span className="text-white">{log.event}</span>
              </div>
              <span className="text-[#60606a] text-[10px]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

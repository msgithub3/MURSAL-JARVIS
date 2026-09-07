import React from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Cpu, Radio, Sparkles, Volume2 } from 'lucide-react';
import { JarvisPhase } from '../types';

interface JarvisOrbProps {
  phase: JarvisPhase;
  isListening: boolean;
  isSpeaking: boolean;
  onOrbClick: () => void;
  detectedText?: string;
}

export const JarvisOrb: React.FC<JarvisOrbProps> = ({
  phase,
  isListening,
  isSpeaking,
  onOrbClick,
  detectedText,
}) => {
  const getPhaseColor = () => {
    switch (phase) {
      case 'WAKE_WORD_DETECTED':
      case 'LISTENING_FOR_COMMAND':
        return 'from-[#22d3ee]/80 via-[#0284c7] to-[#1e293b]';
      case 'TRANSCRIBING':
      case 'THINKING':
        return 'from-[#fbbf24]/80 via-[#d97706] to-[#1e1e24]';
      case 'TOOL_EXECUTION':
        return 'from-[#34d399]/80 via-[#059669] to-[#1e1e24]';
      case 'SPEAKING':
        return 'from-[#38bdf8]/80 via-[#0284c7] to-[#1e1e24]';
      case 'STANDBY':
      default:
        return 'from-[#383848] via-[#22222d] to-[#14141a]';
    }
  };

  const getBorderGlow = () => {
    switch (phase) {
      case 'WAKE_WORD_DETECTED':
      case 'LISTENING_FOR_COMMAND':
        return 'shadow-[0_0_35px_rgba(6,182,212,0.3)] border-cyan-400/80';
      case 'THINKING':
        return 'shadow-[0_0_35px_rgba(245,158,11,0.3)] border-amber-400/80';
      case 'TOOL_EXECUTION':
        return 'shadow-[0_0_35px_rgba(16,185,129,0.3)] border-emerald-400/80';
      case 'SPEAKING':
        return 'shadow-[0_0_40px_rgba(56,189,248,0.35)] border-sky-400/80';
      case 'STANDBY':
      default:
        return 'shadow-[0_0_20px_rgba(255,255,255,0.04)] border-[#2e2e3c]';
    }
  };

  return (
    <div id="jarvis-orb-container" className="flex flex-col items-center justify-center relative py-6">
      {/* Outer Orbit Rings */}
      <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
        {/* Ambient Ring 1 */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border border-[#2a2a38] border-dashed"
        />

        {/* Ambient Ring 2 */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-2 rounded-full border border-[#222230]"
        />

        {/* Dynamic Wave Ring during voice or speaking */}
        {(isListening || isSpeaking || phase === 'THINKING') && (
          <motion.div
            animate={{
              scale: [1, 1.22, 1],
              opacity: [0.6, 0.1, 0.6],
            }}
            transition={{
              duration: isSpeaking ? 1.2 : 2.0,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-[-14px] rounded-full border border-cyan-400/40"
          />
        )}

        {/* Central Glowing Holographic Orb */}
        <motion.button
          id="jarvis-orb-button"
          onClick={onOrbClick}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-tr ${getPhaseColor()} p-1 transition-all duration-500 cursor-pointer flex items-center justify-center border ${getBorderGlow()}`}
          title="Click to toggle Voice Hotword / Command Listening"
        >
          {/* Internal Iris / Core */}
          <div className="w-full h-full rounded-full bg-[#0a0a0c]/90 backdrop-blur-md flex flex-col items-center justify-center relative overflow-hidden">
            {/* Holographic grid texture */}
            <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:12px_12px] opacity-10 pointer-events-none" />

            {/* Icon depending on state */}
            <div className="z-10 flex flex-col items-center">
              {isSpeaking ? (
                <Volume2 className="w-10 h-10 text-cyan-300 animate-pulse" />
              ) : isListening ? (
                <Mic className="w-10 h-10 text-cyan-300 animate-bounce" />
              ) : phase === 'THINKING' ? (
                <Cpu className="w-10 h-10 text-amber-300 animate-spin" />
              ) : phase === 'TOOL_EXECUTION' ? (
                <Sparkles className="w-10 h-10 text-emerald-300 animate-pulse" />
              ) : (
                <Radio className="w-10 h-10 text-[#d0d0d8]" />
              )}
              <span className="text-[10px] font-mono tracking-widest text-[#a0a0b0] mt-1 uppercase font-semibold">
                {isListening ? 'LISTENING' : isSpeaking ? 'SPEAKING' : 'JARVIS'}
              </span>
            </div>

            {/* Reactive Audio Visualizer Bars */}
            <div className="absolute bottom-4 flex items-center gap-1">
              {[6, 14, 22, 12, 18, 26, 16, 8, 14, 20].map((height, idx) => (
                <motion.div
                  key={idx}
                  animate={
                    isListening || isSpeaking
                      ? { height: [4, height, 4] }
                      : { height: 3 }
                  }
                  transition={{
                    duration: 0.5 + (idx % 3) * 0.2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className={`w-1 rounded-full ${
                    phase === 'THINKING' ? 'bg-amber-400' : 'bg-cyan-400'
                  }`}
                  style={{ minHeight: '3px' }}
                />
              ))}
            </div>
          </div>
        </motion.button>
      </div>

      {/* State Badge & Wake phrase guide */}
      <div className="mt-4 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#121216] border border-[#22222a] text-xs font-mono">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isListening ? 'bg-emerald-400' : isSpeaking ? 'bg-cyan-400' : 'bg-[#71717a]'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isListening ? 'bg-emerald-500' : isSpeaking ? 'bg-cyan-500' : 'bg-[#71717a]'
              }`}
            />
          </span>
          <span className="text-white font-semibold tracking-wider">{phase}</span>
          <span className="text-[#505058]">|</span>
          <span className="text-[#8a8a96]">Wake: "Hey JARVIS" / "Wake up JARVIS"</span>
        </div>

        {detectedText && (
          <p className="text-xs text-[#b0b0ba] font-mono italic max-w-md text-center truncate mt-1">
            "{detectedText}"
          </p>
        )}
      </div>
    </div>
  );
};

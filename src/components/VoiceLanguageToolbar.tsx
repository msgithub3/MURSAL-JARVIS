import React from 'react';
import {
  Globe,
  Mic,
  Volume2,
  StopCircle,
  Sparkles,
  Zap,
  Check,
} from 'lucide-react';
import { LanguageMode, VoiceProfile } from '../types';

interface VoiceLanguageToolbarProps {
  currentLanguage: LanguageMode;
  onLanguageChange: (lang: LanguageMode) => void;
  currentVoiceProfile: VoiceProfile;
  onVoiceProfileChange: (voice: VoiceProfile) => void;
  isSpeaking: boolean;
  onInterrupt: () => void;
  onSelectPrompt: (prompt: string) => void;
}

const LANGUAGES: { id: LanguageMode; label: string; flag: string; native: string }[] = [
  { id: 'auto', label: 'Auto Detect', flag: '🌐', native: 'خودکار' },
  { id: 'ur-Roman', label: 'Roman Urdu', flag: '🇵🇰', native: 'Jani / Yaar' },
  { id: 'ur', label: 'Urdu Script', flag: '🇵🇰', native: 'اردو' },
  { id: 'pa', label: 'Punjabi', flag: '🇵🇰', native: 'پنجابی' },
  { id: 'skr', label: 'Saraiki', flag: '🇵🇰', native: 'سرائیکی' },
  { id: 'ps', label: 'Pashto', flag: '🇵🇰', native: 'پښتو' },
  { id: 'sd', label: 'Sindhi', flag: '🇵🇰', native: 'سنڌي' },
  { id: 'en', label: 'English', flag: '🇬🇧', native: 'Standard' },
];

const VOICES: { id: VoiceProfile; name: string; desc: string }[] = [
  { id: 'friendly', name: 'Friendly (Pakistani)', desc: 'Warm, brotherly cadence ("jani", "yaar")' },
  { id: 'classic', name: 'Classic', desc: 'Crisp, confident British AI style' },
  { id: 'calm', name: 'Calm', desc: 'Gentle, soothing cadence' },
  { id: 'professional', name: 'Professional', desc: 'Direct, crisp executive delivery' },
  { id: 'energetic', name: 'Energetic', desc: 'High-drive, proactive enthusiasm' },
  { id: 'deep', name: 'Deep Baritone', desc: 'Resonant, cinematic authority' },
];

const QUICK_PROMPTS = [
  { label: '🔋 Battery & Status', text: 'Jani, battery kitni hai aur phone ka status kya hai?' },
  { label: '🔦 Flashlight & Sound', text: 'Flashlight on kar do aur volume 80 percent karo' },
  { label: '🛍️ MursalCart Winning Sourcing', text: 'MURSALCART: Winning product dhoondo with high margin for Daraz COD' },
  { label: '🛑 Stop/Interrupt', text: 'Ruk jao jani, bas karo' },
  { label: '🌾 Punjabi Check', text: 'Kiddan paaji! Daraz te ki scene chal reya ae?' },
  { label: '🔍 Locate Phone Siren', text: 'Mera phone dhoondo, siren chala do' },
];

export const VoiceLanguageToolbar: React.FC<VoiceLanguageToolbarProps> = ({
  currentLanguage,
  onLanguageChange,
  currentVoiceProfile,
  onVoiceProfileChange,
  isSpeaking,
  onInterrupt,
  onSelectPrompt,
}) => {
  return (
    <div id="voice-language-toolbar" className="p-3.5 rounded-2xl bg-[#0f0f13] border border-[#1e1e26] space-y-3 font-sans text-xs shadow-md">
      {/* Top Row: Language & Voice Selectors + Barge-In button */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Languages */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <div className="flex items-center gap-1 text-[#80808a] font-mono text-[10px] uppercase pr-1">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Dialect:</span>
          </div>
          {LANGUAGES.map((lang) => {
            const isSelected = currentLanguage === lang.id;
            return (
              <button
                key={lang.id}
                onClick={() => onLanguageChange(lang.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                  isSelected
                    ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold'
                    : 'bg-[#141418] hover:bg-[#1a1a22] text-[#90909e] border border-[#1e1e26]'
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right side: Voice Profile & Instant Interruption Button */}
        <div className="flex items-center gap-2">
          {/* Voice Profile Selector */}
          <div className="flex items-center gap-1.5 bg-[#141418] border border-[#1e1e26] px-2 py-1 rounded-lg">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={currentVoiceProfile}
              onChange={(e) => onVoiceProfileChange(e.target.value as VoiceProfile)}
              className="bg-transparent text-white font-mono text-[11px] outline-none cursor-pointer"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id} className="bg-[#141418] text-white">
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Instant Interruption / Barge-in Button */}
          <button
            onClick={onInterrupt}
            className={`px-3 py-1 rounded-lg font-mono text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isSpeaking
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30'
                : 'bg-[#1c1418] hover:bg-[#2a1b22] text-red-400 border border-red-900/40'
            }`}
            title="Immediately interrupt speech output (Barge-In)"
          >
            <StopCircle className="w-3.5 h-3.5" />
            <span>RUK JAO (STOP)</span>
          </button>
        </div>
      </div>

      {/* Pakistani Conversational Quick Prompts */}
      <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-[#1a1a22]">
        <div className="flex items-center gap-1 text-[#80808a] font-mono text-[10px] whitespace-nowrap uppercase pr-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Quick Commands:</span>
        </div>
        {QUICK_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(p.text)}
            className="px-2.5 py-1 rounded-lg bg-[#141418] hover:bg-[#1a1a24] hover:text-white text-[#a0a0b0] border border-[#1e1e26] whitespace-nowrap text-[11px] font-sans transition-colors cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};

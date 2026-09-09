import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Code,
  Lock,
  Flame,
  Terminal,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';

interface StagedSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  status: 'STAGED' | 'ACTIVE' | 'REJECTED' | 'DISABLED';
  riskClass: 'P0_SAFE' | 'P1_CONFIRM' | 'P2_DESTRUCTIVE';
  toolsRequired: string[];
  permissionsRequired: string[];
  systemPromptAddition?: string;
  source?: string;
  createdAt: number;
}

interface AuditResult {
  passed: boolean;
  score: number;
  checks: {
    schemaValid: boolean;
    toolsValid: boolean;
    permissionsValid: boolean;
    safetyLevelClassified: boolean;
    secretScrubClean: boolean;
    promptInjectionSafe: boolean;
    destructivePolicyEnforced: boolean;
    networkBoundaryValid: boolean;
    filesystemBoundaryValid: boolean;
  };
  details: string[];
  riskClass: string;
  warnings: string[];
}

export const SkillReviewConsole: React.FC = () => {
  const [skills, setSkills] = useState<StagedSkill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [auditMap, setAuditMap] = useState<Record<string, AuditResult>>({});
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/jarvis/skills/staged');
      if (res.ok) {
        const data = await res.json();
        const list = data.staged || [];
        setSkills(list);
        if (list.length > 0 && !selectedSkillId) {
          setSelectedSkillId(list[0].id);
        }
      }
    } catch (e) {
      console.warn('Failed to load staged skills:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const selectedSkill = skills.find((s) => s.id === selectedSkillId) || skills[0];

  const handleRunAudit = async (skillId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/jarvis/skills/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      if (res.ok) {
        const result = await res.json();
        setAuditMap((prev) => ({ ...prev, [skillId]: result }));
        setActionFeedback(`Audit complete for ${skillId}. Score: ${result.score}/100`);
      }
    } catch (e) {
      setActionFeedback(`Audit failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (skillId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/jarvis/skills/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      if (res.ok) {
        const data = await res.json();
        setActionFeedback(`Skill approved! Status: ${data.skill?.status}`);
        fetchSkills();
      }
    } catch (e) {
      setActionFeedback(`Approve failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (skillId: string) => {
    const reason = window.prompt('Enter rejection reason:', 'Security compliance barrier failed') || 'Security compliance barrier failed';
    try {
      setLoading(true);
      const res = await fetch('/api/jarvis/skills/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, reason }),
      });
      if (res.ok) {
        setActionFeedback(`Skill rejected.`);
        fetchSkills();
      }
    } catch (e) {
      setActionFeedback(`Reject failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (skillId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/jarvis/skills/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      if (res.ok) {
        setActionFeedback(`Skill disabled.`);
        fetchSkills();
      }
    } catch (e) {
      setActionFeedback(`Disable failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const activeAudit = selectedSkill ? auditMap[selectedSkill.id] : null;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="p-4 rounded-xl bg-[#111116] border border-[#22222a] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-mono font-bold text-white tracking-wider">
              AUTONOMOUS SKILL GOVERNANCE & STAGED REVIEW
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50">
              HERMES-INSPIRED /LEARN SANDBOX
            </span>
          </div>
          <p className="text-xs text-[#80808a] mt-1 font-sans">
            Autonomous skills synthesized from voice workflows are quarantined in STAGED status. No skill enters production without security invariant validation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSkills}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-[#181820] hover:bg-[#22222c] border border-[#2e2e3c] text-xs font-mono text-[#c0c0ca] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="px-4 py-2 rounded-lg bg-purple-950/40 border border-purple-800/40 text-xs font-mono text-purple-200 flex items-center justify-between">
          <span>{actionFeedback}</span>
          <button onClick={() => setActionFeedback(null)} className="text-purple-400 hover:text-white ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Staged Skills List */}
        <div className="lg:col-span-1 space-y-2">
          <span className="text-xs font-mono font-bold text-[#80808a] uppercase tracking-wider block px-1">
            Staged Queue ({skills.length})
          </span>

          {skills.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#111116] border border-[#22222a] text-center space-y-2">
              <Sparkles className="w-8 h-8 text-[#505060] mx-auto" />
              <p className="text-xs font-mono text-[#70707a]">No skills currently in staged queue.</p>
              <p className="text-[11px] text-[#505060]">Skills generated via /learn will appear here for review.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {skills.map((skill) => {
                const isSelected = skill.id === selectedSkillId;
                return (
                  <div
                    key={skill.id}
                    onClick={() => {
                      setSelectedSkillId(skill.id);
                      if (!auditMap[skill.id]) {
                        handleRunAudit(skill.id);
                      }
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#181822] border-purple-500/50 shadow-sm'
                        : 'bg-[#111116] hover:bg-[#15151c] border-[#22222a]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-xs font-bold text-white truncate">{skill.name}</div>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                          skill.status === 'ACTIVE'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                            : skill.status === 'REJECTED'
                            ? 'bg-red-950/60 text-red-300 border border-red-800/40'
                            : skill.status === 'DISABLED'
                            ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            : 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                        }`}
                      >
                        {skill.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#80808a] mt-1 line-clamp-2">{skill.description}</p>

                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#1e1e26] text-[10px] font-mono text-[#71717a]">
                      <span>v{skill.version}</span>
                      <span>•</span>
                      <span
                        className={`${
                          skill.riskClass === 'P2_DESTRUCTIVE'
                            ? 'text-red-400'
                            : skill.riskClass === 'P1_CONFIRM'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {skill.riskClass}
                      </span>
                      <span>•</span>
                      <span>{skill.toolsRequired?.length || 0} tools</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Skill Detail & Security Invariants */}
        <div className="lg:col-span-2 space-y-4">
          {selectedSkill ? (
            <div className="p-4 rounded-xl bg-[#111116] border border-[#22222a] space-y-4">
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#22222a]">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-mono font-bold text-white">{selectedSkill.name}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#181822] text-[#a0a0ba] border border-[#2a2a38]">
                      {selectedSkill.id}
                    </span>
                  </div>
                  <p className="text-xs text-[#90909a] mt-1">{selectedSkill.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedSkill.status !== 'ACTIVE' && (
                    <button
                      onClick={() => handleApprove(selectedSkill.id)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-black font-mono font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  )}

                  {selectedSkill.status !== 'REJECTED' && (
                    <button
                      onClick={() => handleReject(selectedSkill.id)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  )}

                  <button
                    onClick={() => handleRunAudit(selectedSkill.id)}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] text-purple-300 border border-purple-500/40 font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Deep Audit
                  </button>
                </div>
              </div>

              {/* Security Invariants Card */}
              <div className="p-3.5 rounded-xl bg-[#14141c] border border-[#22222e] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-purple-400" />
                    Security Invariants & Compliance Status
                  </span>
                  {activeAudit && (
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        activeAudit.score >= 80
                          ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/50'
                          : 'bg-red-950/70 text-red-300 border border-red-700/50'
                      }`}
                    >
                      Compliance Score: {activeAudit.score}/100
                    </span>
                  )}
                </div>

                {activeAudit ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 rounded-lg bg-[#181824] border border-[#222232] flex items-center justify-between">
                      <span className="text-[#a0a0b0]">Schema Valid:</span>
                      {activeAudit.checks.schemaValid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>

                    <div className="p-2 rounded-lg bg-[#181824] border border-[#222232] flex items-center justify-between">
                      <span className="text-[#a0a0b0]">Tools Verified:</span>
                      {activeAudit.checks.toolsValid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>

                    <div className="p-2 rounded-lg bg-[#181824] border border-[#222232] flex items-center justify-between">
                      <span className="text-[#a0a0b0]">Secret Scrubbing:</span>
                      {activeAudit.checks.secretScrubClean ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>

                    <div className="p-2 rounded-lg bg-[#181824] border border-[#222232] flex items-center justify-between">
                      <span className="text-[#a0a0b0]">Injection Safe:</span>
                      {activeAudit.checks.promptInjectionSafe ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>

                    <div className="p-2 rounded-lg bg-[#181824] border border-[#222232] flex items-center justify-between">
                      <span className="text-[#a0a0b0]">P2 Barrier Enforced:</span>
                      {activeAudit.checks.destructivePolicyEnforced ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>

                    <div className="p-2 rounded-lg bg-[#181824] border border-[#222232] flex items-center justify-between">
                      <span className="text-[#a0a0b0]">Network Boundary:</span>
                      {activeAudit.checks.networkBoundaryValid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-[#181824] text-center text-xs font-mono text-[#808090]">
                    Click "Deep Audit" to run the full static analyzer and security verification on this skill.
                  </div>
                )}

                {activeAudit && activeAudit.details && activeAudit.details.length > 0 && (
                  <div className="pt-2 border-t border-[#1e1e28] space-y-1">
                    <span className="text-[11px] font-mono text-[#808090] block">Audit Log:</span>
                    <ul className="text-[11px] font-mono text-emerald-300/90 space-y-0.5 list-disc list-inside">
                      {activeAudit.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Tools & Permissions Declared */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-[#14141c] border border-[#22222e] space-y-2">
                  <span className="text-[#808090] uppercase font-bold block text-[10px]">
                    Tools Bound ({selectedSkill.toolsRequired?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSkill.toolsRequired?.length ? (
                      selectedSkill.toolsRequired.map((tool) => (
                        <span key={tool} className="px-2 py-0.5 rounded bg-[#1c1c28] text-purple-300 border border-purple-800/40 text-[11px]">
                          {tool}
                        </span>
                      ))
                    ) : (
                      <span className="text-[#606070] italic">None required</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#14141c] border border-[#22222e] space-y-2">
                  <span className="text-[#808090] uppercase font-bold block text-[10px]">
                    Permissions Bound ({selectedSkill.permissionsRequired?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSkill.permissionsRequired?.length ? (
                      selectedSkill.permissionsRequired.map((perm) => (
                        <span key={perm} className="px-2 py-0.5 rounded bg-[#1c1c28] text-cyan-300 border border-cyan-800/40 text-[11px]">
                          {perm}
                        </span>
                      ))
                    ) : (
                      <span className="text-[#606070] italic">None required</span>
                    )}
                  </div>
                </div>
              </div>

              {/* System Prompt Additions */}
              {selectedSkill.systemPromptAddition && (
                <div className="p-3 rounded-xl bg-[#14141c] border border-[#22222e] space-y-1.5">
                  <span className="text-[10px] font-mono uppercase font-bold text-[#808090] block">
                    System Instruction Injection
                  </span>
                  <pre className="p-2.5 rounded-lg bg-[#0c0c10] border border-[#1e1e24] text-[11px] font-mono text-[#d0d0dc] overflow-x-auto whitespace-pre-wrap">
                    {selectedSkill.systemPromptAddition}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-[#111116] border border-[#22222a] text-center text-xs font-mono text-[#70707a]">
              Select a skill from the staged queue to view its security analysis and compliance audit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

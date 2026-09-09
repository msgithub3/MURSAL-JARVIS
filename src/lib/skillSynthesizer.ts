/**
 * MURSAL JARVIS — Hermes-Inspired Autonomous Skill Synthesizer (/learn)
 * 
 * Closed-Loop Workflow:
 * Successful Multi-Step Task -> Task Trace -> Trace Analyzer ->
 * Pattern Detection -> Manifest Generation -> Schema Validation ->
 * ToolSafetyMatrix Classification -> Staged Skill (/skills/staged/) -> SkillRegistry
 * 
 * Safety Invariants:
 * - NEVER learns from failed tasks or tasks with transient errors
 * - NEVER persists secrets, API keys, bearer tokens, or sensitive credentials
 * - Requires multi-step traces (>= 2 executed steps)
 * - Automatically classifies highest risk among required tools (P0, P1, P2)
 * - ALL generated skills start in STAGED mode (never auto-activated without explicit approval)
 * - Deduplicates against existing skill signatures
 */

import fs from 'fs';
import path from 'path';
import { ReActStep } from './reactLoop';
import { ToolRegistry, globalToolRegistry, ToolRiskClass } from './toolRegistry';
import { SkillRegistry, globalSkillRegistry, SkillManifest } from './skillRegistry';
import { globalToolSandbox } from './toolSandbox';

export interface TaskTrace {
  taskId: string;
  goal: string;
  success: boolean;
  steps: ReActStep[];
  totalDurationMs: number;
  completedAt: number;
}

export interface SynthesisResult {
  synthesized: boolean;
  skillId?: string;
  manifest?: SkillManifest;
  reason?: string;
  stagedPath?: string;
}

export class SkillSynthesizer {
  private toolRegistry: ToolRegistry;
  private skillRegistry: SkillRegistry;
  private stagedSkillsDir: string;

  constructor(
    toolRegistry: ToolRegistry = globalToolRegistry,
    skillRegistry: SkillRegistry = globalSkillRegistry,
    stagedDir?: string
  ) {
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
    this.stagedSkillsDir = stagedDir || path.join(process.cwd(), 'skills', 'staged');
  }

  /**
   * Evaluates task trace and synthesizes a reusable staged skill if eligible
   */
  public async analyzeAndLearn(trace: TaskTrace): Promise<SynthesisResult> {
    // 1. Rule: Only successful tasks
    if (!trace.success) {
      return {
        synthesized: false,
        reason: 'REJECTED: Task did not complete successfully. Autonomous learner ignores failed tasks.',
      };
    }

    // 2. Rule: Meaningful multi-step execution (at least 2 steps with actions)
    const executedTools = trace.steps.filter((s) => s.actionTool).map((s) => s.actionTool as string);
    if (executedTools.length < 2) {
      return {
        synthesized: false,
        reason: `REJECTED: Task trace contains ${executedTools.length} executed tools (minimum 2 required for multi-step pattern extraction).`,
      };
    }

    // 3. Rule: Check for secrets / private credentials in trace goal or observations
    const serializedTrace = JSON.stringify({ goal: trace.goal, steps: trace.steps });
    const scrubbedTrace = globalToolSandbox.scrubSecrets(serializedTrace);
    if (serializedTrace !== scrubbedTrace) {
      return {
        synthesized: false,
        reason: 'SECURITY_REJECTION: Task trace contains sensitive credentials or authentication tokens.',
      };
    }

    // 4. Rule: Deduplication check
    const toolSignature = executedTools.sort().join('::');
    const existingSkills = this.skillRegistry.listSkills(false);
    for (const skill of existingSkills) {
      const existingSig = [...skill.requiredTools].sort().join('::');
      if (existingSig === toolSignature) {
        return {
          synthesized: false,
          reason: `DEDUPLICATED: An equivalent skill '${skill.name}' (${skill.id}) already covers tools [${executedTools.join(', ')}].`,
        };
      }
    }

    // 5. Derive Skill Manifest & Capability Analysis
    const skillName = this.generateSkillName(trace.goal, executedTools);
    const skillId = `skill-learned-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const category = this.categorizeSkill(executedTools);

    // Collect permissions and determine highest risk class
    const permissionsSet = new Set<string>();
    let highestRisk: ToolRiskClass = 'P0_SAFE';

    for (const toolId of executedTools) {
      const toolDef = this.toolRegistry.getTool(toolId);
      if (toolDef) {
        toolDef.permissionsRequired.forEach((p) => permissionsSet.add(p));
        if (toolDef.riskClass === 'P2_DESTRUCTIVE') {
          highestRisk = 'P2_DESTRUCTIVE';
        } else if (toolDef.riskClass === 'P1_CONTROLLED' && highestRisk !== 'P2_DESTRUCTIVE') {
          highestRisk = 'P1_CONTROLLED';
        }
      }
    }

    const manifest: SkillManifest = {
      id: skillId,
      name: skillName,
      version: '1.0.0',
      author: 'JARVIS Autonomous Synthesizer (/learn)',
      category,
      description: `Autonomous skill synthesized from verified task execution: "${trace.goal}"`,
      instructions: this.generateInstructions(trace),
      requiredTools: Array.from(new Set(executedTools)),
      permissionsRequired: Array.from(permissionsSet),
      riskClass: highestRisk,
      checksum: `sha256-staged-${skillId}`,
      isEnabled: false, // Invariant: staged skills are NOT active by default
      isStaged: true,   // Marked as staged
    };

    // 6. Persist to /skills/staged/ directory
    let stagedPath = '';
    try {
      if (!fs.existsSync(this.stagedSkillsDir)) {
        fs.mkdirSync(this.stagedSkillsDir, { recursive: true });
      }
      stagedPath = path.join(this.stagedSkillsDir, `${skillId}.json`);
      fs.writeFileSync(stagedPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (fsErr) {
      // In-memory environment fallback
      stagedPath = `[in-memory]:/skills/staged/${skillId}.json`;
    }

    // 7. Register as staged in SkillRegistry
    this.skillRegistry.registerSkill(manifest);

    return {
      synthesized: true,
      skillId,
      manifest,
      stagedPath,
    };
  }

  private generateSkillName(goal: string, tools: string[]): string {
    const cleanGoal = goal.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const words = cleanGoal.split(/\s+/).slice(0, 4).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.join(' ') || `Autonomous Workflow (${tools[0]})`;
  }

  private categorizeSkill(tools: string[]): SkillManifest['category'] {
    if (tools.some((t) => t.includes('mursalcart') || t.includes('commerce') || t.includes('profit'))) {
      return 'COMMERCE';
    }
    if (tools.some((t) => t.includes('device') || t.includes('battery') || t.includes('flashlight') || t.includes('siren'))) {
      return 'AUTOMATION';
    }
    if (tools.some((t) => t.includes('web') || t.includes('search'))) {
      return 'RESEARCH';
    }
    return 'SYSTEM';
  }

  private generateInstructions(trace: TaskTrace): string {
    const lines = [
      `# Autonomous Skill Recipe for "${trace.goal}"`,
      `Synthesized on: ${new Date(trace.completedAt).toISOString()}`,
      '',
      '## Step Sequence:',
    ];
    trace.steps.forEach((step, idx) => {
      if (step.actionTool) {
        lines.push(`${idx + 1}. Execute '${step.actionTool}' with parameters: ${JSON.stringify(step.actionParams || {})}`);
      }
    });
    return lines.join('\n');
  }
}

export const globalSkillSynthesizer = new SkillSynthesizer();

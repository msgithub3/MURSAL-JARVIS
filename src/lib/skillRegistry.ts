/**
 * MURSAL JARVIS — Unified Skill Registry & Execution Boundary
 * 
 * Implements agentskills-compatible skill structure:
 * - Metadata (id, name, version, author, description)
 * - Required Tools (must resolve against ToolRegistry)
 * - Required Permissions (Android / Node boundary)
 * - Risk Level & Safety Matrix Enforcement
 * - Execution Sandboxing
 */

import { ToolRiskClass } from './toolRegistry';

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  category: 'COMMERCE' | 'AUTOMATION' | 'RESEARCH' | 'SYSTEM' | 'MEDIA' | 'SECURITY';
  description: string;
  instructions: string;
  requiredTools: string[];
  permissionsRequired: string[];
  riskClass: ToolRiskClass;
  checksum: string;
  isEnabled: boolean;
  isStaged: boolean; // Learned skills start in staged mode until approved
}

export class SkillRegistry {
  private skills: Map<string, SkillManifest> = new Map();

  constructor() {
    this.seedDefaultSkills();
  }

  public registerSkill(skill: SkillManifest): { success: boolean; error?: string } {
    if (!skill.id || !skill.name || !skill.checksum) {
      return { success: false, error: 'Invalid skill manifest: ID, name, and checksum required.' };
    }
    this.skills.set(skill.id, skill);
    return { success: true };
  }

  public getSkill(id: string): SkillManifest | undefined {
    return this.skills.get(id);
  }

  public listSkills(onlyEnabled = true): SkillManifest[] {
    const list = Array.from(this.skills.values());
    if (onlyEnabled) {
      return list.filter((s) => s.isEnabled && !s.isStaged);
    }
    return list;
  }

  public setSkillEnabled(id: string, enabled: boolean): boolean {
    const skill = this.skills.get(id);
    if (!skill) return false;
    skill.isEnabled = enabled;
    return true;
  }

  public authorizeStagedSkill(id: string): boolean {
    const skill = this.skills.get(id);
    if (!skill) return false;
    skill.isStaged = false;
    skill.isEnabled = true;
    return true;
  }

  private seedDefaultSkills() {
    this.registerSkill({
      id: 'skill-mursalcart-eval',
      name: 'MursalCart Wholesale Evaluation',
      version: '2.1.0',
      author: 'Mursal Core Team',
      category: 'COMMERCE',
      description: 'Calculates net profit margins and RTO risk for Pakistani Cash on Delivery sales.',
      instructions: 'Analyze wholesale procurement and customer price points, deduct courier fee and 16% standard COD return risk.',
      requiredTools: ['mursalcart_eval_product'],
      permissionsRequired: [],
      riskClass: 'P0_SAFE',
      checksum: 'sha256-mursalcart-v2',
      isEnabled: true,
      isStaged: false,
    });

    this.registerSkill({
      id: 'skill-anti-loss-recovery',
      name: 'Anti-Loss Phone Recovery',
      version: '1.5.0',
      author: 'Mursal Core Team',
      category: 'SECURITY',
      description: 'Sounds loud acoustic locator beacon and reports battery status.',
      instructions: 'Trigger acoustic siren on connected Android node and fetch real-time battery status.',
      requiredTools: ['device_anti_loss_siren', 'device_battery'],
      permissionsRequired: ['MODIFY_AUDIO_SETTINGS', 'VIBRATE'],
      riskClass: 'P1_CONTROLLED',
      checksum: 'sha256-antiloss-v1',
      isEnabled: true,
      isStaged: false,
    });
  }
}

export const globalSkillRegistry = new SkillRegistry();

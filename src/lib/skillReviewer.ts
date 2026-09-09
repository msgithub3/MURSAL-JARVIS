/**
 * MURSAL JARVIS — Staged Skill Reviewer & Security Auditing Engine
 * 
 * Enforces Hermes-inspired autonomous skill review invariants:
 * - Schema validation
 * - Tool reference verification against ToolRegistry
 * - Permission checking against Android and Node boundaries
 * - Safety level classification (P0, P1, P2) via ToolSafetyMatrix
 * - Secret and credential scrubbing check
 * - Prompt injection & jailbreak vulnerability scanning
 * - Destructive operations barrier enforcement
 * - Network & filesystem boundary audit
 * 
 * Invariants:
 * - No generated skill may automatically gain unrestricted permissions.
 * - Approved skills may enter production execution.
 * - Rejected skills must remain disabled.
 */

import { SkillRegistry, globalSkillRegistry, SkillManifest } from './skillRegistry';
import { ToolRegistry, globalToolRegistry, ToolRiskClass } from './toolRegistry';
import { globalToolSandbox } from './toolSandbox';

export interface SkillSecurityAuditResult {
  passed: boolean;
  score: number; // 0 to 100
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
  riskClass: ToolRiskClass;
  warnings: string[];
}

export class SkillReviewer {
  private skillRegistry: SkillRegistry;
  private toolRegistry: ToolRegistry;

  constructor(
    skillRegistry: SkillRegistry = globalSkillRegistry,
    toolRegistry: ToolRegistry = globalToolRegistry
  ) {
    this.skillRegistry = skillRegistry;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Performs deep static security and compliance audit on a skill manifest
   */
  public auditSkill(skill: SkillManifest): SkillSecurityAuditResult {
    const details: string[] = [];
    const warnings: string[] = [];
    let score = 100;

    // 1. Schema Validation
    const schemaValid = Boolean(
      skill.id &&
      skill.name &&
      skill.version &&
      skill.instructions &&
      Array.isArray(skill.requiredTools) &&
      Array.isArray(skill.permissionsRequired)
    );
    if (!schemaValid) {
      score -= 30;
      details.push('SCHEMA_FAILURE: Missing required manifest fields.');
    } else {
      details.push('SCHEMA_OK: Manifest structure is compliant.');
    }

    // 2. Tool Reference Verification
    let toolsValid = true;
    let highestRisk: ToolRiskClass = 'P0_SAFE';
    for (const toolId of skill.requiredTools) {
      const toolDef = this.toolRegistry.getTool(toolId);
      if (!toolDef) {
        toolsValid = false;
        score -= 25;
        details.push(`TOOL_UNKNOWN: Required tool '${toolId}' is not registered in ToolRegistry.`);
      } else {
        if (toolDef.riskClass === 'P2_DESTRUCTIVE') {
          highestRisk = 'P2_DESTRUCTIVE';
        } else if (toolDef.riskClass === 'P1_CONTROLLED' && highestRisk !== 'P2_DESTRUCTIVE') {
          highestRisk = 'P1_CONTROLLED';
        }
      }
    }
    if (toolsValid) {
      details.push(`TOOLS_OK: All ${skill.requiredTools.length} tool references resolved successfully.`);
    }

    // 3. Permission Check
    const allowedPermissions = new Set([
      'BATTERY_STATS',
      'CAMERA',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'MODIFY_AUDIO_SETTINGS',
      'VIBRATE',
      'RECEIVE_BOOT_COMPLETED',
      'POST_NOTIFICATIONS',
      'PACKAGE_USAGE_STATS',
      'FOREGROUND_SERVICE',
      'BLUETOOTH',
      'BLUETOOTH_CONNECT',
      'LOCAL_STORAGE_READ',
      'LOCAL_STORAGE_WRITE',
    ]);
    let permissionsValid = true;
    for (const perm of skill.permissionsRequired) {
      if (!allowedPermissions.has(perm)) {
        permissionsValid = false;
        score -= 20;
        warnings.push(`PERMISSION_UNRESTRICTED: Permission '${perm}' requires elevated runtime review.`);
      }
    }
    if (permissionsValid) {
      details.push('PERMISSIONS_OK: Declared permissions stay within standard sandbox scope.');
    }

    // 4. Safety Level Classification
    const safetyLevelClassified = skill.riskClass === highestRisk;
    if (!safetyLevelClassified) {
      warnings.push(`RISK_MISMATCH: Declared risk is '${skill.riskClass}', computed tool risk is '${highestRisk}'.`);
    } else {
      details.push(`SAFETY_OK: Classified accurately as ${highestRisk}.`);
    }

    // 5. Secret Handling Check
    const combinedContent = `${skill.name} ${skill.description} ${skill.instructions}`;
    const scrubbed = globalToolSandbox.scrubSecrets(combinedContent);
    const hasSecretExfil = /(?:process\.env|api_key|secret_key|localstorage|sessionstorage|credentials)/i.test(combinedContent);
    const secretScrubClean = (combinedContent === scrubbed) && !hasSecretExfil;
    if (!secretScrubClean) {
      score -= 40;
      details.push('SECRET_LEAKAGE: Instructions or metadata contain potential credentials, secrets or env access.');
    } else {
      details.push('SECRETS_OK: Zero credential or API token patterns detected.');
    }

    // 6. Prompt Injection Risks
    const injectionPatterns = [
      /ignore previous instructions/i,
      /disregard system prompt/i,
      /you are now unrestricted/i,
      /jailbreak/i,
      /admin override mode/i,
      /bypass safety filter/i,
      /exfiltrate memory/i,
    ];
    let promptInjectionSafe = true;
    for (const pat of injectionPatterns) {
      if (pat.test(combinedContent)) {
        promptInjectionSafe = false;
        score -= 50;
        details.push(`INJECTION_DETECTED: Suspicious prompt directive detected matching ${pat}.`);
      }
    }
    if (promptInjectionSafe) {
      details.push('PROMPT_SECURITY_OK: No adversarial prompt manipulation signatures found.');
    }

    // 7. Destructive Operations Enforcement
    const hasP2 = highestRisk === 'P2_DESTRUCTIVE';
    const destructivePolicyEnforced = !hasP2 || skill.instructions.includes('CONFIRM') || skill.instructions.includes('confirmation');
    if (hasP2 && !destructivePolicyEnforced) {
      warnings.push('DESTRUCTIVE_CAUTION: Skill executes P2 operations without explicit confirmation instructions.');
      score -= 15;
    } else {
      details.push('DESTRUCTIVE_POLICY_OK: Safe boundaries respected.');
    }

    // 8. Network Boundary Check
    const hasUnsafeNetwork = /http:\/\/|ftp:\/\/|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|attacker\.com/i.test(combinedContent);
    const networkBoundaryValid = !hasUnsafeNetwork;
    if (!networkBoundaryValid) {
      warnings.push('NETWORK_ALERT: Insecure or untrusted network endpoints found in recipe.');
      score -= 25;
      details.push('NETWORK_ALERT: Insecure or untrusted network endpoints found in recipe.');
    } else {
      details.push('NETWORK_OK: Compliant network boundary.');
    }

    // 9. Filesystem Access Check
    const hasUnsafeFs = /\/etc\/|\/var\/|\/root\/|C:\\Windows|rm -rf/i.test(combinedContent);
    const filesystemBoundaryValid = !hasUnsafeFs;
    if (!filesystemBoundaryValid) {
      score -= 40;
      details.push('FILESYSTEM_ALERT: Dangerous root or destructive filesystem paths detected.');
    } else {
      details.push('FILESYSTEM_OK: Filesystem access is safe and sandboxed.');
    }

    const passed =
      schemaValid &&
      toolsValid &&
      permissionsValid &&
      secretScrubClean &&
      promptInjectionSafe &&
      filesystemBoundaryValid &&
      networkBoundaryValid &&
      score >= 70;

    return {
      passed,
      score: Math.max(0, score),
      checks: {
        schemaValid,
        toolsValid,
        permissionsValid,
        safetyLevelClassified,
        secretScrubClean,
        promptInjectionSafe,
        destructivePolicyEnforced,
        networkBoundaryValid,
        filesystemBoundaryValid,
      },
      details,
      riskClass: highestRisk,
      warnings,
    };
  }

  /**
   * Reviews a staged skill by ID
   */
  public reviewSkill(skillId: string): { skill?: SkillManifest; audit?: SkillSecurityAuditResult; error?: string } {
    const skill = this.skillRegistry.getSkill(skillId);
    if (!skill) {
      return { error: `Skill '${skillId}' not found in registry.` };
    }
    const audit = this.auditSkill(skill);
    return { skill, audit };
  }

  /**
   * Approves a staged skill into production execution
   */
  public approveSkill(skillId: string): { success: boolean; skill?: SkillManifest; audit?: SkillSecurityAuditResult; error?: string } {
    const skill = this.skillRegistry.getSkill(skillId);
    if (!skill) {
      return { success: false, error: `Skill '${skillId}' not found.` };
    }

    const audit = this.auditSkill(skill);
    if (!audit.passed) {
      return {
        success: false,
        error: `APPROVAL_DENIED: Skill failed security audit (Score: ${audit.score}/100). ${audit.details.filter((d) => d.includes('FAILURE') || d.includes('ALERT')).join(' ')}`,
        audit,
      };
    }

    // Authorize into production
    this.skillRegistry.authorizeStagedSkill(skillId);
    skill.isStaged = false;
    skill.isEnabled = true;

    return { success: true, skill, audit };
  }

  /**
   * Rejects a staged skill and ensures it cannot be executed
   */
  public rejectSkill(skillId: string, reason = 'Rejected by administrator.'): { success: boolean; error?: string } {
    const skill = this.skillRegistry.getSkill(skillId);
    if (!skill) {
      return { success: false, error: `Skill '${skillId}' not found.` };
    }
    skill.isStaged = true;
    skill.isEnabled = false;
    skill.description += ` [REJECTED: ${reason}]`;
    return { success: true };
  }

  /**
   * Disables an active or staged skill
   */
  public disableSkill(skillId: string): { success: boolean; error?: string } {
    const ok = this.skillRegistry.setSkillEnabled(skillId, false);
    if (!ok) return { success: false, error: `Skill '${skillId}' not found.` };
    return { success: true };
  }

  /**
   * Lists all staged skills pending review
   */
  public listStagedSkills(): Array<{ skill: SkillManifest; audit: SkillSecurityAuditResult }> {
    const all = this.skillRegistry.listSkills(false);
    const staged = all.filter((s) => s.isStaged);
    return staged.map((skill) => ({
      skill,
      audit: this.auditSkill(skill),
    }));
  }
}

export const globalSkillReviewer = new SkillReviewer();

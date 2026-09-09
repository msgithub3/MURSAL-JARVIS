/**
 * MURSAL JARVIS — Closed-Loop Autonomous Automation Engine
 * 
 * Flow Architecture:
 * TRIGGER -> RULE -> INTENT -> AGENT -> TOOLS -> SAFETY CHECK -> ACTION -> OBSERVATION -> MEMORY
 * 
 * Supported Trigger Types:
 * - BATTERY_THRESHOLD (e.g. Battery < 20% or > 80%)
 * - CHARGING_STATE (Charger connected / disconnected)
 * - WIFI_STATE (Connected / Disconnected / SSID match)
 * - NOTIFICATION (Incoming urgent notification)
 * - SCHEDULE_CRON (Timed background task)
 * - LOCATION_GEOFENCE (Arriving or leaving coordinates)
 * - VOICE_SHORTCUT (Direct voice macro)
 * 
 * Safety Matrix Enforcement:
 * - P0_SAFE: Automatic execution, silent observation & memory write
 * - P1_CONTROLLED: Automated execution with persistent audit trail
 * - P2_DESTRUCTIVE: PAUSES automation loop and requires explicit user confirmation before action
 */

import { ToolRegistry, globalToolRegistry, ToolRiskClass } from './toolRegistry';
import { UnifiedMemoryManager } from './memoryManager';

export type AutomationTriggerType =
  | 'BATTERY_THRESHOLD'
  | 'CHARGING_STATE'
  | 'WIFI_STATE'
  | 'NOTIFICATION'
  | 'SCHEDULE_CRON'
  | 'LOCATION_GEOFENCE'
  | 'VOICE_SHORTCUT';

export interface AutomationRule {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  condition: (context: Record<string, any>) => boolean;
  intent: string;
  targetTool: string;
  toolParams: Record<string, any>;
  riskClass: ToolRiskClass;
  isEnabled: boolean;
  cooldownMs: number;
  lastExecutedAt?: number;
}

export interface AutomationExecutionResult {
  ruleId: string;
  ruleName: string;
  intent: string;
  status: 'EXECUTED' | 'CONFIRMATION_REQUIRED' | 'COOLDOWN_ACTIVE' | 'SKIPPED' | 'FAILED';
  actionTaken?: string;
  observation?: string;
  memoryLogged?: boolean;
  durationMs: number;
}

export class AutomationEngine {
  private rules: Map<string, AutomationRule> = new Map();
  private toolRegistry: ToolRegistry;
  private memoryManager?: UnifiedMemoryManager;
  private executionHistory: AutomationExecutionResult[] = [];

  constructor(
    toolRegistry: ToolRegistry = globalToolRegistry,
    memoryManager?: UnifiedMemoryManager
  ) {
    this.toolRegistry = toolRegistry;
    this.memoryManager = memoryManager;
    this.seedDefaultRules();
  }

  public registerRule(rule: AutomationRule): void {
    this.rules.set(rule.id, rule);
  }

  public getRules(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  public setRuleEnabled(id: string, enabled: boolean): boolean {
    const r = this.rules.get(id);
    if (!r) return false;
    r.isEnabled = enabled;
    return true;
  }

  /**
   * Closed-Loop Evaluation Pipeline:
   * Evaluates context against rules and executes compliant tools safely
   */
  public async evaluateTriggers(
    triggerType: AutomationTriggerType,
    context: Record<string, any>,
    userConfirmed = false
  ): Promise<AutomationExecutionResult[]> {
    const results: AutomationExecutionResult[] = [];
    const now = Date.now();

    for (const rule of this.rules.values()) {
      if (!rule.isEnabled || rule.triggerType !== triggerType) continue;

      // 1. Evaluate Condition
      let matches = false;
      try {
        matches = rule.condition(context);
      } catch (_) {
        matches = false;
      }
      if (!matches) continue;

      // 2. Cooldown check
      if (rule.lastExecutedAt && now - rule.lastExecutedAt < rule.cooldownMs) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          intent: rule.intent,
          status: 'COOLDOWN_ACTIVE',
          durationMs: 0,
        });
        continue;
      }

      // 3. Safety Check: P2 Destructive barrier
      if (rule.riskClass === 'P2_DESTRUCTIVE' && !userConfirmed) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          intent: rule.intent,
          status: 'CONFIRMATION_REQUIRED',
          actionTaken: `Action '${rule.targetTool}' requires explicit confirmation.`,
          durationMs: 0,
        });
        continue;
      }

      // 4. Tool Execution Gate
      const startExec = Date.now();
      const toolRes = await this.toolRegistry.executeTool(
        rule.targetTool,
        rule.toolParams,
        {
          sessionId: 'automation-session-main',
          commandId: `auto-${rule.id}-${now}`,
          userConfirmed,
          initiator: 'AUTOMATION',
        }
      );

      rule.lastExecutedAt = now;
      const durationMs = Date.now() - startExec;
      const observation = toolRes.success
        ? `Successfully executed ${rule.targetTool}: ${JSON.stringify(toolRes.data || {})}`
        : `Execution failed on ${rule.targetTool}: ${toolRes.error}`;

      // 5. Memory Write: Persist observation into Memory store
      let memoryLogged = false;
      if (this.memoryManager && toolRes.success) {
        try {
          await this.memoryManager.save({
            scope: 'TASK',
            key: `auto_${rule.id}`,
            content: `Automation [${rule.name}] executed: ${observation}`,
            tags: ['automation', rule.triggerType.toLowerCase()],
            importance: 6,
          });
          memoryLogged = true;
        } catch (_) {}
      }

      const execResult: AutomationExecutionResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        intent: rule.intent,
        status: toolRes.success ? 'EXECUTED' : 'FAILED',
        actionTaken: rule.targetTool,
        observation,
        memoryLogged,
        durationMs,
      };

      this.executionHistory.unshift(execResult);
      if (this.executionHistory.length > 50) this.executionHistory.pop();
      results.push(execResult);
    }

    return results;
  }

  public getExecutionHistory(): AutomationExecutionResult[] {
    return this.executionHistory;
  }

  private seedDefaultRules(): void {
    // 1. Low Battery Saver Rule (P0_SAFE)
    this.registerRule({
      id: 'rule-low-battery',
      name: 'Low Battery Optimization',
      triggerType: 'BATTERY_THRESHOLD',
      condition: (ctx) => (ctx.batteryLevel ?? 100) <= 20 && !ctx.isCharging,
      intent: 'Audit battery health when phone drops below 20%',
      targetTool: 'device_battery',
      toolParams: {},
      riskClass: 'P0_SAFE',
      isEnabled: true,
      cooldownMs: 300000, // 5 min
    });

    // 2. Wi-Fi Connection Sync Rule (P0_SAFE)
    this.registerRule({
      id: 'rule-wifi-connected',
      name: 'Workstation Mesh Link on Wi-Fi Connect',
      triggerType: 'WIFI_STATE',
      condition: (ctx) => ctx.connected === true,
      intent: 'Sync device state when connected to trusted home/work mesh',
      targetTool: 'device_battery',
      toolParams: {},
      riskClass: 'P0_SAFE',
      isEnabled: true,
      cooldownMs: 60000,
    });

    // 3. Acoustic Locator Beacon (P1_CONTROLLED)
    this.registerRule({
      id: 'rule-anti-loss-siren',
      name: 'Anti-Loss Phone Recovery Siren',
      triggerType: 'VOICE_SHORTCUT',
      condition: (ctx) => ctx.shortcut === 'FIND_PHONE',
      intent: 'Trigger loud acoustic beacon to locate phone',
      targetTool: 'device_anti_loss_siren',
      toolParams: { maxVolume: true },
      riskClass: 'P1_CONTROLLED',
      isEnabled: true,
      cooldownMs: 15000,
    });
  }

  public getScheduledTasks(): any[] {
    return Array.from(this.rules.values()).map((r) => ({
      id: r.id,
      name: r.name,
      trigger: r.triggerType,
      intent: r.intent,
      riskClass: r.riskClass,
      enabled: r.isEnabled,
      lastFired: r.lastExecutedAt,
    }));
  }

  public getRecentEvents(): any[] {
    return this.executionHistory.slice(-20);
  }

  public toggleTask(taskId: string): boolean {
    const rule = this.rules.get(taskId);
    if (rule) {
      rule.isEnabled = !rule.isEnabled;
      return true;
    }
    return false;
  }

  public generateMorningBriefing(batteryPct: number = 88, lang: string = 'ur-Roman'): string {
    const isUrdu = lang === 'ur' || lang === 'ur-Roman';
    const activeRuleCount = Array.from(this.rules.values()).filter((r) => r.isEnabled).length;
    if (isUrdu) {
      return `Subha bakhair Mursaleen bhai! MURSAL JARVIS Online hai. Phone battery is waqt ${batteryPct}% hai, aur ${activeRuleCount} automated rules active hain. MursalCart e-commerce orders monitoring standby par hai.`;
    }
    return `Good morning Commander Mursaleen! MURSAL JARVIS is standing by. Battery is at ${batteryPct}%, ${activeRuleCount} closed-loop automation rules active. MursalCart business monitoring ready.`;
  }
}

export const globalAutomationEngine = new AutomationEngine();

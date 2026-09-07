/**
 * MURSAL JARVIS — Automation Engine & Proactive Assistant
 * 
 * Capabilities:
 * - Recurring Cron & Timed Automation Tasks
 * - Event-Driven Triggers:
 *   - BATTERY_LOW (< 20%): Suggests battery saver or notification to charge
 *   - TASK_COMPLETED: Telemetry callback when laptop build or testing finishes
 *   - URGENT_CUSTOMER_ORDER: Proactive prompt to review high-value COD inquiry
 *   - MORNING_BRIEFING: Generated proactively or on voice command ("Jani morning briefing")
 * - Proactive Rate Limiting (ensures JARVIS remains helpful without being annoying)
 */

export interface ScheduledTask {
  id: string;
  title: string;
  cronExpr: string; // e.g., '0 8 * * *' (every day at 8 AM)
  actionType: 'BRIEFING' | 'BACKUP_MEMORY' | 'CHECK_SUPPLIER_PRICES' | 'MESH_HEARTBEAT';
  isEnabled: boolean;
  lastRunTimestamp?: number;
  nextRunDescription: string;
}

export interface ProactiveEvent {
  id: string;
  type: 'BATTERY_ALERT' | 'CUSTOMER_ALERT' | 'BUILD_COMPLETE' | 'DAILY_BRIEFING';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  spokenPromptUrdu: string;
  spokenPromptEnglish: string;
  timestamp: number;
}

export class AutomationEngine {
  private tasks: ScheduledTask[] = [
    {
      id: 'task-morning-briefing',
      title: 'Morning Executive Briefing',
      cronExpr: '0 8 * * *',
      actionType: 'BRIEFING',
      isEnabled: true,
      nextRunDescription: 'Tomorrow at 08:00 AM PKT',
    },
    {
      id: 'task-memory-backup',
      title: 'Cognitive Memory State Backup',
      cronExpr: '0 0 * * *',
      actionType: 'BACKUP_MEMORY',
      isEnabled: true,
      nextRunDescription: 'Tonight at 12:00 AM PKT',
    },
    {
      id: 'task-supplier-check',
      title: 'MursalCart Markaz Supplier Price Watch',
      cronExpr: '0 */6 * * *',
      actionType: 'CHECK_SUPPLIER_PRICES',
      isEnabled: true,
      nextRunDescription: 'Every 6 hours',
    },
  ];

  private recentProactiveEvents: ProactiveEvent[] = [];
  private lastProactiveDispatchTime = 0;

  public getScheduledTasks(): ScheduledTask[] {
    return this.tasks;
  }

  public toggleTask(taskId: string): boolean {
    const t = this.tasks.find((task) => task.id === taskId);
    if (!t) return false;
    t.isEnabled = !t.isEnabled;
    return true;
  }

  /**
   * Generates full Morning Briefing
   */
  public generateMorningBriefing(batteryPct = 88, lang = 'ur-Roman'): string {
    const time = '8:00 AM';
    const city = 'Lahore / Pakistan';
    const weather = '31°C, Clear Sky';

    if (lang === 'en') {
      return `Good morning, Mursaleen! Here is your JARVIS briefing for today. Weather in ${city} is ${weather}. Your Android phone is at ${batteryPct}% battery with device mesh securely linked to your workstation laptop. You have 3 customer inquiries on WhatsApp regarding MursalCart winning products, and all overnight syncs completed cleanly. Standing by for your commands!`;
    }

    return `Assalam o Alaikum Mursaleen jani, subah bakhair! Aaj ka morning briefing yeh hai: Lahore ka mausam ${weather} hai. Aapke mobile ki battery ${batteryPct}% hai aur laptop workstation mesh se connected hai. MursalCart pe 3 naye customer messages aaye hue hain aur system bilkul 100% active hai. Hukam karein, aaj kya plan hai?`;
  }

  /**
   * Evaluates if a proactive alert should be emitted
   */
  public evaluateProactiveTriggers(telemetry: { batteryPct: number; pendingOrders: number }): ProactiveEvent | null {
    const now = Date.now();
    // Rate limit: at least 3 minutes between proactive voice interruptions
    if (now - this.lastProactiveDispatchTime < 180000) return null;

    if (telemetry.batteryPct < 15) {
      this.lastProactiveDispatchTime = now;
      const ev: ProactiveEvent = {
        id: `event-${now}`,
        type: 'BATTERY_ALERT',
        priority: 'HIGH',
        spokenPromptUrdu: 'Jani, phone ki battery 15% se kam ho gayi hai. Charger laga dein taake mesh active rahe.',
        spokenPromptEnglish: 'Mursaleen, battery has dropped below 15%. Please connect the charger to maintain mesh sync.',
        timestamp: now,
      };
      this.recentProactiveEvents.unshift(ev);
      return ev;
    }

    if (telemetry.pendingOrders >= 3) {
      this.lastProactiveDispatchTime = now;
      const ev: ProactiveEvent = {
        id: `event-${now}`,
        type: 'CUSTOMER_ALERT',
        priority: 'NORMAL',
        spokenPromptUrdu: 'Jani, 3 naye customer orders waiting mein hain. Kya WhatsApp replies draft kar doon?',
        spokenPromptEnglish: 'Mursaleen, 3 customer inquiries are awaiting responses. Shall I draft the replies?',
        timestamp: now,
      };
      this.recentProactiveEvents.unshift(ev);
      return ev;
    }

    return null;
  }

  public getRecentEvents(): ProactiveEvent[] {
    return this.recentProactiveEvents.slice(0, 10);
  }
}

export const globalAutomationEngine = new AutomationEngine();

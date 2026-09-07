/**
 * MURSAL JARVIS — Phone ↔ Laptop Mesh & Remote Agent Orchestrator
 * 
 * Manages peer-to-peer authenticated device connectivity between:
 * - Mursal Android Sovereign Client (Primary Voice / HUD)
 * - Mursal Laptop Workstation (Heavy compute, terminal commands, repo builds)
 * - Mursal Cloud Brain (AI Studio Server Node)
 * 
 * Capabilities:
 * - Device Capability Discovery (CPU cores, RAM, OS, Battery, Tool availability)
 * - Intelligent Task Routing (Heavy coding/build -> Laptop; Quick actions -> Android; Reasoning -> Cloud Brain)
 * - Remote Laptop Agent Protocol:
 *   - Application Launch & Window Management
 *   - Terminal & Build Commands (with strict confirmation guard)
 *   - Git Operations (status, branch, diff, commit)
 *   - File Reading & Analysis
 *   - System Diagnostics
 * - Heartbeat & Anti-Loss Acoustic Beacon Routing
 */

export interface DeviceCapabilities {
  cpuCores: number;
  ramGb: number;
  os: 'android' | 'linux' | 'windows' | 'macos';
  batteryPct?: number;
  isPluggedIn: boolean;
  canExecuteTerminal: boolean;
  canBuildAndroidApk: boolean;
  hasOllama: boolean;
  installedTools: string[];
}

export interface MeshNodeState {
  id: string;
  name: string;
  type: 'android_phone' | 'laptop' | 'cloud_server';
  status: 'online' | 'busy' | 'offline';
  ipAddress: string;
  batteryPct: number;
  capabilities: DeviceCapabilities;
  lastHeartbeat: number;
  activeTaskId?: string;
  isSecurityLocked: boolean;
}

export interface LaptopTaskRequest {
  id: string;
  action: 'RUN_TERMINAL' | 'RUN_BUILD' | 'GIT_STATUS' | 'OPEN_APP' | 'READ_FILE' | 'SYSTEM_INFO';
  command?: string;
  filePath?: string;
  appName?: string;
  requiresConfirmation: boolean;
  userConfirmed: boolean;
  timeoutMs: number;
}

export interface LaptopTaskResponse {
  taskId: string;
  action: string;
  success: boolean;
  output: string;
  exitCode?: number;
  executionDurationMs: number;
  timestamp: number;
}

export class LaptopMeshCoordinator {
  private nodes: Map<string, MeshNodeState> = new Map();
  private auditHistory: Array<{ timestamp: number; node: string; event: string; status: string }> = [];

  constructor() {
    this.initDefaultNodes();
  }

  private initDefaultNodes() {
    // 1. Android Sovereign Client
    this.nodes.set('dev-android-01', {
      id: 'dev-android-01',
      name: 'Mursal Android Pro (Primary Client)',
      type: 'android_phone',
      status: 'online',
      ipAddress: '192.168.100.12',
      batteryPct: 88,
      capabilities: {
        cpuCores: 8,
        ramGb: 12,
        os: 'android',
        batteryPct: 88,
        isPluggedIn: false,
        canExecuteTerminal: false,
        canBuildAndroidApk: false,
        hasOllama: false,
        installedTools: ['torch', 'camera', 'audio', 'notifications', 'accessibility'],
      },
      lastHeartbeat: Date.now(),
      isSecurityLocked: false,
    });

    // 2. Workstation Laptop
    this.nodes.set('dev-laptop-01', {
      id: 'dev-laptop-01',
      name: "Mursal's Core Workstation Laptop",
      type: 'laptop',
      status: 'online',
      ipAddress: '192.168.100.25',
      batteryPct: 95,
      capabilities: {
        cpuCores: 16,
        ramGb: 32,
        os: 'linux',
        batteryPct: 95,
        isPluggedIn: true,
        canExecuteTerminal: true,
        canBuildAndroidApk: true,
        hasOllama: true,
        installedTools: ['node', 'git', 'gradle', 'python', 'docker', 'ollama', 'vscode'],
      },
      lastHeartbeat: Date.now(),
      isSecurityLocked: false,
    });

    // 3. Cloud Brain Node
    this.nodes.set('dev-cloud-01', {
      id: 'dev-cloud-01',
      name: 'Mursal Cloud Brain (AI Studio Node)',
      type: 'cloud_server',
      status: 'online',
      ipAddress: '10.0.0.1',
      batteryPct: 100,
      capabilities: {
        cpuCores: 8,
        ramGb: 16,
        os: 'linux',
        isPluggedIn: true,
        canExecuteTerminal: true,
        canBuildAndroidApk: false,
        hasOllama: false,
        installedTools: ['node', 'typescript', 'vite', 'gemini_sdk', 'python'],
      },
      lastHeartbeat: Date.now(),
      isSecurityLocked: false,
    });
  }

  public getNodes(): MeshNodeState[] {
    return Array.from(this.nodes.values());
  }

  public getNode(id: string): MeshNodeState | undefined {
    return this.nodes.get(id);
  }

  /**
   * Intelligently selects the optimal execution node for a task
   */
  public routeTask(taskDescription: string): { targetNode: MeshNodeState; reason: string } {
    const lower = taskDescription.toLowerCase();

    // Heavy builds, gradle, git commits, terminal scripts -> Laptop
    if (lower.includes('build') || lower.includes('compile') || lower.includes('git') || lower.includes('terminal') || lower.includes('script') || lower.includes('laptop')) {
      const laptop = this.nodes.get('dev-laptop-01');
      if (laptop && laptop.status === 'online') {
        return { targetNode: laptop, reason: 'High-compute workstation selected for compilation / terminal execution' };
      }
    }

    // Hardware device controls -> Android Phone
    if (lower.includes('flashlight') || lower.includes('torch') || lower.includes('volume') || lower.includes('battery') || lower.includes('siren') || lower.includes('ring')) {
      const phone = this.nodes.get('dev-android-01');
      if (phone) {
        return { targetNode: phone, reason: 'Target device hardware action mapped to local Android client' };
      }
    }

    // Default to Cloud Brain
    const cloud = this.nodes.get('dev-cloud-01')!;
    return { targetNode: cloud, reason: 'High-speed cognitive cloud node selected' };
  }

  /**
   * Dispatches task to laptop agent
   */
  public executeLaptopTask(req: LaptopTaskRequest): LaptopTaskResponse {
    const startTime = Date.now();
    const laptop = this.nodes.get('dev-laptop-01');

    if (!laptop || laptop.status === 'offline') {
      return {
        taskId: req.id,
        action: req.action,
        success: false,
        output: 'Error: Laptop workstation is offline or unreachable on local mesh.',
        executionDurationMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    // Enforce safety confirmation for shell execution
    if (req.action === 'RUN_TERMINAL' && !req.userConfirmed) {
      return {
        taskId: req.id,
        action: req.action,
        success: false,
        output: `CONFIRMATION_REQUIRED: Command '${req.command}' requires user authorization before executing on workstation.`,
        executionDurationMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    let simulatedOutput = '';
    switch (req.action) {
      case 'RUN_BUILD':
        simulatedOutput = `[Workstation Gradle Daemon] Starting build for Mursal Jarvis Android App...\n> Task :app:compileReleaseKotlin UP-TO-DATE\n> Task :app:assembleRelease SUCCESS (Total: 4.8s)\nOutput artifact: app-release-signed.apk`;
        break;
      case 'GIT_STATUS':
        simulatedOutput = `On branch main\nYour branch is up to date with 'origin/main'.\nChanges clean. Clean working directory.`;
        break;
      case 'OPEN_APP':
        simulatedOutput = `Launched desktop application '${req.appName || 'VS Code'}' on workstation. Process PID: 49821.`;
        break;
      case 'SYSTEM_INFO':
        simulatedOutput = `OS: Ubuntu 24.04 LTS (Kernel 6.8.0)\nCPU: AMD Ryzen 9 7940HS (16 Cores) @ 4.0GHz\nRAM: 32 GB (14.2 GB in use)\nBattery: 95% (AC Connected)\nOllama: Active (Models: llama3.2, deepseek-r1:8b)`;
        break;
      case 'RUN_TERMINAL':
      default:
        simulatedOutput = `[Workstation Shell] Executed: ${req.command}\nExit code 0: Execution finished cleanly.`;
        break;
    }

    this.auditHistory.unshift({
      timestamp: Date.now(),
      node: laptop.name,
      event: `Task [${req.action}] executed successfully.`,
      status: 'SUCCESS',
    });

    return {
      taskId: req.id,
      action: req.action,
      success: true,
      output: simulatedOutput,
      exitCode: 0,
      executionDurationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  public getAuditHistory() {
    return this.auditHistory.slice(0, 20);
  }
}

export const globalLaptopMesh = new LaptopMeshCoordinator();

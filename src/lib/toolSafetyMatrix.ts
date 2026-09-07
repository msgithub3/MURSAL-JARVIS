/**
 * MURSAL JARVIS — Tool Safety Matrix & Safe Primitives
 * 
 * Strict 5-Tier Risk Classification:
 * - READ_ONLY: Querying state, battery, telemetry, memory search (Auto-approved)
 * - SAFE: Benign local toggles (torch, volume, brightness) (Auto-approved)
 * - MODERATE: App launches, scratchpad writes, web research queries (Policy logged)
 * - HIGH: Sending WhatsApp messages, placing orders, executing terminal commands (Interactive Confirmation required)
 * - DESTRUCTIVE: Memory wipe, factory reset, file deletion (Strict Two-Factor Voice/Touch Confirmation)
 * 
 * Every tool implements:
 * - name, description, parameters, riskLevel, confirmationRequirement, timeoutMs, verifier, rollback
 */

export type RiskLevel = 'READ_ONLY' | 'SAFE' | 'MODERATE' | 'HIGH' | 'DESTRUCTIVE';

export interface ToolDefinition {
  name: string;
  category: 'device' | 'mesh' | 'memory' | 'commerce' | 'laptop' | 'automation' | 'screen';
  description: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  timeoutMs: number;
  permissionsRequired: string[];
  parameters: Record<string, { type: string; required: boolean; description: string }>;
  verifier?: string;
  rollbackAction?: string;
}

export const TOOL_SAFETY_MATRIX: Record<string, ToolDefinition> = {
  // Device Tools
  get_battery_status: {
    name: 'get_battery_status',
    category: 'device',
    description: 'Read real-time battery percentage, temperature, and charging status',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    timeoutMs: 1500,
    permissionsRequired: ['BATTERY_STATS'],
    parameters: {},
  },
  toggle_flashlight: {
    name: 'toggle_flashlight',
    category: 'device',
    description: 'Toggle hardware Camera2 torch/flashlight',
    riskLevel: 'SAFE',
    requiresConfirmation: false,
    timeoutMs: 2000,
    permissionsRequired: ['CAMERA'],
    parameters: {
      state: { type: 'boolean', required: false, description: 'Optional explicit on/off state' },
    },
    rollbackAction: 'toggle_flashlight',
  },
  adjust_volume: {
    name: 'adjust_volume',
    category: 'device',
    description: 'Adjust audio stream volume (media, notification, alarm)',
    riskLevel: 'SAFE',
    requiresConfirmation: false,
    timeoutMs: 2000,
    permissionsRequired: ['MODIFY_AUDIO_SETTINGS'],
    parameters: {
      percent: { type: 'number', required: true, description: 'Target volume 0 - 100%' },
    },
  },
  open_system_settings: {
    name: 'open_system_settings',
    category: 'device',
    description: 'Launch system settings screen (Wi-Fi, Bluetooth, Display)',
    riskLevel: 'SAFE',
    requiresConfirmation: false,
    timeoutMs: 3000,
    permissionsRequired: [],
    parameters: {
      target: { type: 'string', required: true, description: 'Settings screen: wifi, bluetooth, display, sound' },
    },
  },
  launch_app: {
    name: 'launch_app',
    category: 'device',
    description: 'Launch installed Android application by package or recognized name',
    riskLevel: 'MODERATE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    permissionsRequired: [],
    parameters: {
      appName: { type: 'string', required: true, description: 'App to launch: whatsapp, youtube, daraz, etc.' },
    },
    verifier: 'verify_app_foreground',
  },
  ring_anti_loss_siren: {
    name: 'ring_anti_loss_siren',
    category: 'mesh',
    description: 'Sound acoustic locator siren at maximum volume to recover phone',
    riskLevel: 'SAFE',
    requiresConfirmation: false,
    timeoutMs: 3000,
    permissionsRequired: ['MODIFY_AUDIO_SETTINGS', 'VIBRATE'],
    parameters: {},
  },

  // High & Destructive Actions
  send_whatsapp_message: {
    name: 'send_whatsapp_message',
    category: 'device',
    description: 'Dispatch an outgoing WhatsApp message to a customer or contact',
    riskLevel: 'HIGH',
    requiresConfirmation: true,
    timeoutMs: 8000,
    permissionsRequired: ['ACCESSIBILITY_SERVICE'],
    parameters: {
      recipient: { type: 'string', required: true, description: 'Contact name or phone number' },
      message: { type: 'string', required: true, description: 'Text message content' },
    },
    verifier: 'verify_message_sent',
  },
  execute_laptop_command: {
    name: 'execute_laptop_command',
    category: 'laptop',
    description: 'Execute build or terminal command on paired workstation laptop',
    riskLevel: 'HIGH',
    requiresConfirmation: true,
    timeoutMs: 60000,
    permissionsRequired: ['MESH_NETWORK_AUTH'],
    parameters: {
      command: { type: 'string', required: true, description: 'Terminal command to run' },
      cwd: { type: 'string', required: false, description: 'Working directory on laptop' },
    },
  },
  purge_cognitive_memories: {
    name: 'purge_cognitive_memories',
    category: 'memory',
    description: 'Delete user memories from the 10-layer cognitive store',
    riskLevel: 'DESTRUCTIVE',
    requiresConfirmation: true,
    timeoutMs: 3000,
    permissionsRequired: ['ADMIN_MASTER_AUTH'],
    parameters: {
      layer: { type: 'string', required: false, description: 'Target memory layer or all' },
    },
  },

  // Screen Vision
  capture_screen_vision: {
    name: 'capture_screen_vision',
    category: 'screen',
    description: 'Capture screenshot and analyze visible UI elements and text',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    timeoutMs: 5000,
    permissionsRequired: ['MEDIA_PROJECTION_OR_ACCESSIBILITY'],
    parameters: {},
    verifier: 'verify_screen_captured',
  },

  // E-Commerce
  evaluate_mursalcart_product: {
    name: 'evaluate_mursalcart_product',
    category: 'commerce',
    description: 'Run 12-metric evaluation on candidate e-commerce product',
    riskLevel: 'READ_ONLY',
    requiresConfirmation: false,
    timeoutMs: 4000,
    permissionsRequired: [],
    parameters: {
      productName: { type: 'string', required: true, description: 'Name of product' },
      supplierPricePkr: { type: 'number', required: true, description: 'Procurement price' },
      sellingPricePkr: { type: 'number', required: true, description: 'Target selling price' },
    },
  },
};

export class ToolSafetyEngine {
  /**
   * Validates tool request against safety policy
   */
  public evaluateRequest(
    toolName: string,
    params: Record<string, any>,
    userConfirmed = false
  ): {
    canExecute: boolean;
    requiresConfirmation: boolean;
    confirmationPrompt?: string;
    reason?: string;
  } {
    const tool = TOOL_SAFETY_MATRIX[toolName];
    if (!tool) {
      return { canExecute: false, requiresConfirmation: false, reason: `Unregistered tool: ${toolName}` };
    }

    if (tool.requiresConfirmation && !userConfirmed) {
      const prompt =
        tool.riskLevel === 'DESTRUCTIVE'
          ? `⚠️ SENSITIVE ACTION GUARD: ${tool.description}. Confirm karo jani to proceed?`
          : `Confirm action: ${tool.description}?`;

      return {
        canExecute: false,
        requiresConfirmation: true,
        confirmationPrompt: prompt,
        reason: 'Policy requires explicit confirmation for HIGH or DESTRUCTIVE risk level.',
      };
    }

    return { canExecute: true, requiresConfirmation: false };
  }

  public getAllTools(): ToolDefinition[] {
    return Object.values(TOOL_SAFETY_MATRIX);
  }
}

export const globalToolSafety = new ToolSafetyEngine();

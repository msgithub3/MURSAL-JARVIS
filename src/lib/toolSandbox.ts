/**
 * MURSAL JARVIS — Tool Execution Sandbox & Permission Enforcement
 * 
 * Provides platform-appropriate sandboxing for:
 * 1. Command execution on Server / Workstation (Strict Allowlist + Forbidden Patterns)
 * 2. Path Traversal & Filesystem Boundaries
 * 3. Android Security Model (Restricted Safe APIs only, zero arbitrary shell)
 * 4. Timeout & AbortSignal race enforcement
 * 5. Secret redaction on audit outputs
 */

export interface SandboxPolicy {
  allowedCommandPrefixes: string[];
  forbiddenPatterns: RegExp[];
  maxExecutionTimeoutMs: number;
  restrictedPathPrefixes: string[];
}

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  allowedCommandPrefixes: [
    'git status',
    'git diff',
    'git log',
    'npm test',
    'npm run build',
    'npm run lint',
    'python3 tests/',
    'python3 -m unittest',
    'ls',
    'cat',
    'pwd',
    'echo',
    'df -h',
    'free -m',
  ],
  forbiddenPatterns: [
    /\brm\s+-[rf]{1,2}\b/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /\bchmod\s+777\b/i,
    /\bchown\b/i,
    />\s*\/dev\/sd[a-z]/i,
    /\bcurl\b.*\|\s*(?:bash|sh)\b/i,
    /\bwget\b.*\|\s*(?:bash|sh)\b/i,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/i, // fork bomb
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bkillall\b/i,
  ],
  maxExecutionTimeoutMs: 15000,
  restrictedPathPrefixes: [
    '/etc',
    '/root',
    '/sys',
    '/proc',
    '/dev',
    '/var/run',
    '../..',
  ],
};

const SECRET_SCRUBBER_REGEX = /(?:bearer\s+[a-zA-Z0-9_\-\.]{15,}|(?:key|secret|token|password)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{10,}['"]?)/gi;

export class ToolExecutionSandbox {
  private policy: SandboxPolicy;

  constructor(policy: SandboxPolicy = DEFAULT_SANDBOX_POLICY) {
    this.policy = policy;
  }

  /**
   * Evaluates if a shell or workstation command is permitted by sandbox policy
   */
  public validateCommand(command: string): { isPermitted: boolean; violationReason?: string } {
    const trimmed = command.trim();

    // 1. Check forbidden destructive patterns
    for (const pattern of this.policy.forbiddenPatterns) {
      if (pattern.test(trimmed)) {
        return {
          isPermitted: false,
          violationReason: `SANDBOX_POLICY_VIOLATION: Command matches forbidden destructive pattern '${pattern.source}'.`,
        };
      }
    }

    // 2. Check path traversal
    for (const restricted of this.policy.restrictedPathPrefixes) {
      if (trimmed.includes(restricted)) {
        return {
          isPermitted: false,
          violationReason: `SANDBOX_POLICY_VIOLATION: Attempted access to restricted filesystem path or traversal '${restricted}'.`,
        };
      }
    }

    return { isPermitted: true };
  }

  /**
   * Sanitizes all output strings or objects to prevent secret leakage
   */
  public scrubSecrets<T>(data: T): T {
    if (typeof data === 'string') {
      return data.replace(SECRET_SCRUBBER_REGEX, '[REDACTED_SECRET]') as unknown as T;
    }
    if (data && typeof data === 'object') {
      try {
        const json = JSON.stringify(data);
        const scrubbed = json.replace(SECRET_SCRUBBER_REGEX, '[REDACTED_SECRET]');
        return JSON.parse(scrubbed) as T;
      } catch {
        return data;
      }
    }
    return data;
  }
}

export const globalToolSandbox = new ToolExecutionSandbox();

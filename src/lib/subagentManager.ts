/**
 * MURSAL JARVIS — Subagent Delegation Manager
 * 
 * Enforces strict delegation constraints:
 * - Maximum recursion depth (Depth <= 2)
 * - Maximum concurrent child agents (Max 3)
 * - Strict cancellation propagation (Aborting parent aborts all child agents)
 * - Safety Matrix propagation (Subagents inherit parent's permission bounds)
 * - Budget / step limits per child agent
 */

import { ReActLoop, ReActExecutionResult } from './reactLoop';
import { ToolExecutionContext } from './toolRegistry';

export type SubagentRole = 'RESEARCH_AGENT' | 'BROWSER_AGENT' | 'CODING_AGENT' | 'COMMUNICATION_AGENT';

export interface SubagentTask {
  id: string;
  role: SubagentRole;
  goal: string;
  depth: number;
  maxSteps: number;
  timeoutMs: number;
}

export interface SubagentExecutionResult {
  taskId: string;
  role: SubagentRole;
  success: boolean;
  resultSummary: string;
  durationMs: number;
}

export interface SubagentManagerConfig {
  maxDepth: number;
  maxConcurrentChildAgents: number;
}

export const DEFAULT_SUBAGENT_CONFIG: SubagentManagerConfig = {
  maxDepth: 2,
  maxConcurrentChildAgents: 3,
};

export class SubagentManager {
  private config: SubagentManagerConfig;
  private activeChildren: Map<string, AbortController> = new Map();

  constructor(config: SubagentManagerConfig = DEFAULT_SUBAGENT_CONFIG) {
    this.config = config;
  }

  /**
   * Spawns an isolated subagent worker task
   */
  public async delegateTask(
    task: SubagentTask,
    parentContext: ToolExecutionContext
  ): Promise<SubagentExecutionResult> {
    const startTime = Date.now();

    // 1. Guard recursion depth
    if (task.depth > this.config.maxDepth) {
      return {
        taskId: task.id,
        role: task.role,
        success: false,
        resultSummary: `RECURSION_DEPTH_EXCEEDED: Requested depth ${task.depth} exceeds limit of ${this.config.maxDepth}.`,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Guard concurrent child agents
    if (this.activeChildren.size >= this.config.maxConcurrentChildAgents) {
      return {
        taskId: task.id,
        role: task.role,
        success: false,
        resultSummary: `CONCURRENT_CHILDREN_EXCEEDED: Active subagents (${this.activeChildren.size}) reached limit of ${this.config.maxConcurrentChildAgents}.`,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Setup child abort controller chained to parent abort signal
    const childAbortController = new AbortController();
    this.activeChildren.set(task.id, childAbortController);

    if (parentContext.abortSignal?.aborted) {
      childAbortController.abort();
    } else if (parentContext.abortSignal) {
      parentContext.abortSignal.addEventListener('abort', () => {
        childAbortController.abort();
      });
    }

    const childContext: ToolExecutionContext = {
      ...parentContext,
      sessionId: `sub-${task.id}`,
      initiator: 'SUBAGENT',
      abortSignal: childAbortController.signal,
    };

    try {
      const childLoop = new ReActLoop(undefined, undefined, {
        maxSteps: Math.min(task.maxSteps, 8),
        timeoutMs: Math.min(task.timeoutMs, 20000),
        agentName: task.role,
      });

      const result: ReActExecutionResult = await childLoop.execute(task.goal, childContext);

      return {
        taskId: task.id,
        role: task.role,
        success: result.success && !result.cancelled,
        resultSummary: result.finalAnswer,
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.activeChildren.delete(task.id);
    }
  }

  public getActiveChildCount(): number {
    return this.activeChildren.size;
  }

  public cancelAll(): void {
    for (const controller of this.activeChildren.values()) {
      controller.abort();
    }
    this.activeChildren.clear();
  }
}

export const globalSubagentManager = new SubagentManager();

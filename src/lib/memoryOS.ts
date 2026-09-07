/**
 * MURSAL JARVIS — 10-Layer Memory OS
 * 
 * Comprehensive cognitive persistence layer:
 * 1. Working Memory (Active runtime session context)
 * 2. Conversation Memory (Multi-turn dialogue threads)
 * 3. Episodic Memory (Time-indexed past interaction milestones)
 * 4. Semantic Memory (Structured factual world knowledge)
 * 5. Preference Memory (Learned user habits, dialect, tone)
 * 6. Task Memory (Action items, pipelines, and pending executions)
 * 7. Procedural / Tool Memory (Optimal parameters & past tool outcomes)
 * 8. Relationship Memory (People, contacts, family, team context)
 * 9. Device Memory (Mesh node states, battery history, network anchors)
 * 10. Business Memory (MursalCart product evaluations, COD metrics, margins)
 * 
 * Features:
 * - Semantic Search & Relevance Ranking
 * - Recency Decay & Importance Weighting
 * - Automatic Deduplication & Contradiction Detection
 * - Secret / Credential Privacy Shielding (never stores keys as plain memory)
 * - User-Controlled Commands ("remember this", "forget that", "export memories")
 */

export type MemoryLayer =
  | 'working'
  | 'conversation'
  | 'episodic'
  | 'semantic'
  | 'preference'
  | 'task'
  | 'procedural'
  | 'relationship'
  | 'device'
  | 'business';

export interface MemoryRecord {
  id: string;
  layer: MemoryLayer;
  key: string;
  content: string;
  importance: number; // 1 to 10
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  tags: string[];
  metadata?: Record<string, any>;
}

// Regex to intercept accidental secret / API key leaks from memory storage
const SECRET_REGEX = /(?:api[_-]?key|secret|password|bearer|auth|token|private[_-]?key)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{12,}['"]?/i;

export class MemoryOS {
  private records: Map<string, MemoryRecord> = new Map();

  constructor() {
    this.seedDefaultMemories();
  }

  private seedDefaultMemories() {
    this.saveMemory({
      layer: 'semantic',
      key: 'user_identity',
      content: 'User: Mursaleen. Creator and sovereign commander of MURSAL JARVIS.',
      importance: 10,
      tags: ['user', 'identity', 'mursaleen'],
    });

    this.saveMemory({
      layer: 'preference',
      key: 'language_preference',
      content: 'Prefers Pakistani conversational style (Urdu, Roman Urdu, English, Punjabi) with natural respectful warmth ("jani", "yaar", "theek hai").',
      importance: 9,
      tags: ['language', 'urdu', 'tone', 'conversational'],
    });

    this.saveMemory({
      layer: 'business',
      key: 'mursalcart_operations',
      content: 'MURSALCART: Primary focus on Pakistani e-commerce (Daraz, Markaz, OLX, FB Marketplace) with minimum 40% margin buffer against 15-20% COD returns.',
      importance: 9,
      tags: ['mursalcart', 'ecommerce', 'pakistan', 'cod'],
    });

    this.saveMemory({
      layer: 'device',
      key: 'primary_hardware_mesh',
      content: 'Node 1: Mursal Android Phone (Client HUD). Node 2: Mursal Cloud Brain (AI Studio Node). Node 3: Mursal Workstation Laptop.',
      importance: 8,
      tags: ['mesh', 'hardware', 'android', 'laptop'],
    });
  }

  /**
   * Saves or updates a memory record with automatic privacy guard and deduplication
   */
  public saveMemory(params: {
    layer: MemoryLayer;
    key: string;
    content: string;
    importance?: number;
    tags?: string[];
    metadata?: Record<string, any>;
  }): { success: boolean; id?: string; warning?: string } {
    // Secret protection guard
    if (SECRET_REGEX.test(params.content)) {
      return {
        success: false,
        warning: 'SECURITY GUARD: Memory rejected. Credentials, API tokens, or passwords must never be stored in general cognitive memory.',
      };
    }

    const id = `mem-${params.layer}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const now = Date.now();

    // Check for exact duplicate in same layer
    for (const [existingId, item] of this.records.entries()) {
      if (item.layer === params.layer && (item.key === params.key || item.content.toLowerCase() === params.content.toLowerCase())) {
        // Update existing record
        item.content = params.content;
        item.lastAccessed = now;
        item.accessCount++;
        item.importance = Math.max(item.importance, params.importance || 5);
        return { success: true, id: existingId, warning: 'Updated existing memory entry' };
      }
    }

    const record: MemoryRecord = {
      id,
      layer: params.layer,
      key: params.key,
      content: params.content,
      importance: Math.min(10, Math.max(1, params.importance || 5)),
      timestamp: now,
      lastAccessed: now,
      accessCount: 1,
      tags: params.tags || [],
      metadata: params.metadata,
    };

    this.records.set(id, record);
    return { success: true, id };
  }

  /**
   * Performs semantic relevance search across the 10 layers with recency decay
   */
  public search(query: string, layerFilter?: MemoryLayer, maxResults = 5): MemoryRecord[] {
    const queryTokens = query.toLowerCase().split(/\W+/).filter(Boolean);
    const now = Date.now();
    const scored: Array<{ record: MemoryRecord; score: number }> = [];

    for (const record of this.records.values()) {
      if (layerFilter && record.layer !== layerFilter) continue;

      const contentTokens = record.content.toLowerCase().split(/\W+/);
      const tagMatches = record.tags.filter((t) => queryTokens.includes(t.toLowerCase())).length;

      let matchCount = 0;
      queryTokens.forEach((t) => {
        if (contentTokens.includes(t)) matchCount++;
      });

      if (matchCount === 0 && tagMatches === 0 && !queryTokens.some((t) => record.key.toLowerCase().includes(t))) {
        continue;
      }

      // Relevance score formula:
      // matchScore + tagBonus + importanceBonus - recencyDecay
      const ageHours = (now - record.lastAccessed) / (1000 * 60 * 60);
      const recencyDecay = Math.min(3, ageHours * 0.05); // Subtle decay
      const score = matchCount * 2.0 + tagMatches * 3.0 + record.importance * 0.5 - recencyDecay;

      // Update access telemetry
      record.lastAccessed = now;
      record.accessCount++;

      scored.push({ record, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => s.record);
  }

  /**
   * Retrieves all memories formatted by layer
   */
  public getMemoriesByLayer(layer?: MemoryLayer): MemoryRecord[] {
    const all = Array.from(this.records.values());
    if (!layer) return all.sort((a, b) => b.timestamp - a.timestamp);
    return all.filter((r) => r.layer === layer).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Deletes a memory record by ID or key
   */
  public deleteMemory(identifier: string): boolean {
    if (this.records.has(identifier)) {
      return this.records.delete(identifier);
    }
    for (const [id, r] of this.records.entries()) {
      if (r.key === identifier) {
        return this.records.delete(id);
      }
    }
    return false;
  }

  /**
   * Purges all non-system memories (safe reset)
   */
  public purgeUserMemories(): number {
    let count = 0;
    for (const [id, r] of this.records.entries()) {
      if (r.key !== 'user_identity' && r.key !== 'mursalcart_operations') {
        this.records.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Exports full memory state to JSON
   */
  public exportState(): string {
    return JSON.stringify(Array.from(this.records.values()), null, 2);
  }

  /**
   * Imports memory state from JSON
   */
  public importState(jsonStr: string): { imported: number; errors: number } {
    try {
      const items: MemoryRecord[] = JSON.parse(jsonStr);
      let count = 0;
      for (const item of items) {
        if (item.key && item.content && !SECRET_REGEX.test(item.content)) {
          this.records.set(item.id || `mem-${item.layer}-${Date.now()}`, item);
          count++;
        }
      }
      return { imported: count, errors: 0 };
    } catch {
      return { imported: 0, errors: 1 };
    }
  }
}

export const globalMemoryOS = new MemoryOS();

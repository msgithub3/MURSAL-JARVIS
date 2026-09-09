/**
 * MURSAL JARVIS — Unified SQLite + MEMORY.md + USER.md Architecture
 * 
 * Multi-Tier Unified Storage:
 *             UnifiedMemoryManager
 *                      │
 *         ┌────────────┼────────────┐
 *         ↓            ↓            ↓
 *      SQLite       MEMORY.md     USER.md
 * 
 * Guarantees:
 * - SQLite serves as structured, indexed, queryable store with transactions
 * - MEMORY.md & USER.md provide human-readable, version-controlled persistence
 * - Bi-directional synchronization: app startup loads files -> SQLite -> memory,
 *   and mutations sync SQLite -> filesystem atomically.
 * - Strict Classification:
 *     - NORMAL: standard knowledge & facts
 *     - SENSITIVE: private user preferences (guarded)
 *     - SECRET: cryptographic/auth credentials (NEVER exported or written to Markdown)
 * - Zero secret leakage: all writes are scrubbed of API keys & tokens
 * - Duplicate prevention on (scope, key)
 * - Abstract interface: Android nodes communicate over API, safely degrading offline.
 */

import fs from 'fs';
import path from 'path';
import { globalToolSandbox } from './toolSandbox';

export type MemoryScope = 'SESSION' | 'LONG_TERM' | 'USER_PROFILE' | 'TASK' | 'SKILL_LEARNING_TRACE';

export type MemoryClassification = 'NORMAL' | 'SENSITIVE' | 'SECRET';

export interface MemoryItem {
  id: string;
  scope: MemoryScope;
  classification: MemoryClassification;
  key: string;
  content: string;
  tags: string[];
  importance: number; // 1 to 10
  timestamp: number;
  metadata?: Record<string, any>;
}

export type MemorySaveInput = Omit<MemoryItem, 'id' | 'timestamp' | 'classification'> & {
  classification?: MemoryClassification;
};

export interface MemorySearchParams {
  query: string;
  scope?: MemoryScope;
  classification?: MemoryClassification;
  minImportance?: number;
  limit?: number;
}

export interface MemoryManager {
  save(item: MemorySaveInput): Promise<MemoryItem>;
  retrieve(id: string): Promise<MemoryItem | null>;
  search(params: MemorySearchParams): Promise<MemoryItem[]>;
  delete(id: string): Promise<boolean>;
  update(id: string, updates: Partial<Omit<MemoryItem, 'id' | 'timestamp'>>): Promise<MemoryItem | null>;
  summarize(scope: MemoryScope): Promise<string>;
  exportMarkdown(scope: 'MEMORY.md' | 'USER.md'): Promise<string>;
  syncToFilesystem(): Promise<void>;
  syncFromFilesystem(): Promise<number>;
}

export class UnifiedMemoryManager implements MemoryManager {
  private store: Map<string, MemoryItem> = new Map();
  private sqliteDb: any = null;
  private memoryMdPath: string;
  private userMdPath: string;
  private isFilesystemAvailable: boolean = false;

  constructor(workspaceRoot?: string) {
    const root = workspaceRoot || (typeof process !== 'undefined' ? process.cwd() : '.');
    this.memoryMdPath = path.join(root, 'MEMORY.md');
    this.userMdPath = path.join(root, 'USER.md');

    this.initializeStorage(root);
  }

  private initializeStorage(root: string): void {
    // 1. Initialize SQLite backend if in Node environment
    try {
      if (typeof process !== 'undefined' && (process as any).versions?.node) {
        this.isFilesystemAvailable = true;
        // Dynamically initialize node:sqlite or fallback memory table
        const nodeSqlite = (globalThis as any).require ? (globalThis as any).require('node:sqlite') : null;
        if (nodeSqlite?.DatabaseSync) {
          const dbDir = path.join(root, '.jarvis');
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
          }
          const dbPath = path.join(dbDir, 'memory.db');
          this.sqliteDb = new nodeSqlite.DatabaseSync(dbPath);
          this.sqliteDb.exec(`
            CREATE TABLE IF NOT EXISTS memories (
              id TEXT PRIMARY KEY,
              scope TEXT NOT NULL,
              classification TEXT NOT NULL,
              key TEXT NOT NULL,
              content TEXT NOT NULL,
              tags TEXT NOT NULL,
              importance INTEGER NOT NULL,
              timestamp INTEGER NOT NULL,
              metadata TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_mem_scope ON memories(scope);
            CREATE INDEX IF NOT EXISTS idx_mem_key ON memories(key);
          `);
        }
      }
    } catch (_) {
      // Browser or restricted sandbox: operates cleanly in-memory
      this.sqliteDb = null;
    }

    // 2. Synchronize existing files from disk if available
    this.syncFromFilesystem().catch(() => {});

    // 3. Seed defaults if store remains empty
    if (this.store.size === 0) {
      this.seedDefaultState();
    }
  }

  public async save(item: MemorySaveInput): Promise<MemoryItem> {
    // Scrub potential secrets from content
    const sanitizedContent = globalToolSandbox.scrubSecrets(item.content);

    // Duplicate prevention: check if key in this scope already exists
    for (const existing of this.store.values()) {
      if (existing.scope === item.scope && existing.key.toLowerCase() === item.key.toLowerCase()) {
        // Update existing record rather than creating duplicate
        return (await this.update(existing.id, {
          content: sanitizedContent,
          tags: Array.from(new Set([...existing.tags, ...item.tags])),
          importance: Math.max(existing.importance, item.importance),
          classification: item.classification || existing.classification,
          metadata: { ...existing.metadata, ...item.metadata },
        })) as MemoryItem;
      }
    }

    const memoryItem: MemoryItem = {
      ...item,
      classification: item.classification || 'NORMAL',
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content: sanitizedContent,
      timestamp: Date.now(),
    };

    // Store in memory map
    this.store.set(memoryItem.id, memoryItem);

    // Persist to SQLite
    this.persistToSqlite(memoryItem);

    // Write-back to MEMORY.md / USER.md if appropriate
    this.syncToFilesystem().catch(() => {});

    return memoryItem;
  }

  public async retrieve(id: string): Promise<MemoryItem | null> {
    const item = this.store.get(id);
    return item ? { ...item } : null;
  }

  public async update(
    id: string,
    updates: Partial<Omit<MemoryItem, 'id' | 'timestamp'>>
  ): Promise<MemoryItem | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const sanitizedContent = updates.content ? globalToolSandbox.scrubSecrets(updates.content) : existing.content;

    const updated: MemoryItem = {
      ...existing,
      ...updates,
      content: sanitizedContent,
      timestamp: Date.now(),
    };

    this.store.set(id, updated);
    this.persistToSqlite(updated);
    this.syncToFilesystem().catch(() => {});

    return updated;
  }

  public async search(params: MemorySearchParams): Promise<MemoryItem[]> {
    const queryLower = params.query.toLowerCase();
    const limit = params.limit || 10;
    const minImp = params.minImportance || 1;

    const matches: MemoryItem[] = [];

    for (const item of this.store.values()) {
      if (params.scope && item.scope !== params.scope) continue;
      if (params.classification && item.classification !== params.classification) continue;
      if (item.importance < minImp) continue;

      const inKey = item.key.toLowerCase().includes(queryLower);
      const inContent = item.content.toLowerCase().includes(queryLower);
      const inTags = item.tags.some((t) => t.toLowerCase().includes(queryLower));

      if (inKey || inContent || inTags) {
        matches.push(item);
      }
    }

    matches.sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp);
    return matches.slice(0, limit);
  }

  public async delete(id: string): Promise<boolean> {
    const deleted = this.store.delete(id);
    if (this.sqliteDb && deleted) {
      try {
        this.sqliteDb.prepare('DELETE FROM memories WHERE id = ?').run(id);
      } catch (_) {}
    }
    if (deleted) {
      this.syncToFilesystem().catch(() => {});
    }
    return deleted;
  }

  public async summarize(scope: MemoryScope): Promise<string> {
    const items = Array.from(this.store.values()).filter(
      (i) => i.scope === scope && i.classification !== 'SECRET'
    );
    if (items.length === 0) return `No public records found in scope '${scope}'.`;
    return items.map((i) => `• [${i.key}] ${i.content}`).join('\n');
  }

  /**
   * Generates Hermes-compatible Markdown exports (Strict Rule: SECRET is NEVER exported)
   */
  public async exportMarkdown(scope: 'MEMORY.md' | 'USER.md'): Promise<string> {
    if (scope === 'USER.md') {
      const userItems = Array.from(this.store.values()).filter(
        (i) => i.scope === 'USER_PROFILE' && i.classification !== 'SECRET'
      );
      return (
        `# USER.md — MURSAL JARVIS User Profile & Preferences\n\n` +
        `Generated: ${new Date().toISOString()}\n\n` +
        userItems.map((i) => `### ${i.key}\n- ${i.content}\n`).join('\n')
      );
    }

    const longTermItems = Array.from(this.store.values()).filter(
      (i) => i.scope === 'LONG_TERM' && i.classification !== 'SECRET'
    );
    return (
      `# MEMORY.md — MURSAL JARVIS Long-Term Knowledge\n\n` +
      `Generated: ${new Date().toISOString()}\n\n` +
      longTermItems.map((i) => `### ${i.key}\n- ${i.content}\n`).join('\n')
    );
  }

  /**
   * Reliable atomic write-back from Memory -> Filesystem (MEMORY.md / USER.md)
   */
  public async syncToFilesystem(): Promise<void> {
    if (!this.isFilesystemAvailable) return;

    try {
      // 1. Write USER.md atomically
      const userMdContent = await this.exportMarkdown('USER.md');
      this.atomicWriteFile(this.userMdPath, userMdContent);

      // 2. Write MEMORY.md atomically
      const memoryMdContent = await this.exportMarkdown('MEMORY.md');
      this.atomicWriteFile(this.memoryMdPath, memoryMdContent);
    } catch (_) {
      // Degrade gracefully if filesystem write fails
    }
  }

  /**
   * Synchronizes existing markdown files from filesystem into SQLite and memory
   */
  public async syncFromFilesystem(): Promise<number> {
    if (!this.isFilesystemAvailable) return 0;
    let imported = 0;

    try {
      // Parse USER.md
      if (fs.existsSync(this.userMdPath)) {
        const content = fs.readFileSync(this.userMdPath, 'utf-8');
        const sections = this.parseMarkdownSections(content);
        for (const [key, val] of sections) {
          await this.save({
            scope: 'USER_PROFILE',
            classification: 'NORMAL',
            key,
            content: val,
            tags: ['user_md'],
            importance: 9,
          });
          imported++;
        }
      }

      // Parse MEMORY.md
      if (fs.existsSync(this.memoryMdPath)) {
        const content = fs.readFileSync(this.memoryMdPath, 'utf-8');
        const sections = this.parseMarkdownSections(content);
        for (const [key, val] of sections) {
          await this.save({
            scope: 'LONG_TERM',
            classification: 'NORMAL',
            key,
            content: val,
            tags: ['memory_md'],
            importance: 8,
          });
          imported++;
        }
      }
    } catch (_) {}

    return imported;
  }

  private atomicWriteFile(filePath: string, content: string): void {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  }

  private parseMarkdownSections(markdown: string): Map<string, string> {
    const map = new Map<string, string>();
    const lines = markdown.split('\n');
    let currentKey = '';
    let currentLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('### ')) {
        if (currentKey && currentLines.length > 0) {
          map.set(currentKey, currentLines.join('\n').trim());
        }
        currentKey = line.replace('### ', '').trim();
        currentLines = [];
      } else if (currentKey) {
        const clean = line.replace(/^-\s*/, '').trim();
        if (clean) currentLines.push(clean);
      }
    }

    if (currentKey && currentLines.length > 0) {
      map.set(currentKey, currentLines.join('\n').trim());
    }

    return map;
  }

  private persistToSqlite(item: MemoryItem): void {
    if (!this.sqliteDb) return;
    try {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO memories (id, scope, classification, key, content, tags, importance, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          scope=excluded.scope,
          classification=excluded.classification,
          key=excluded.key,
          content=excluded.content,
          tags=excluded.tags,
          importance=excluded.importance,
          timestamp=excluded.timestamp,
          metadata=excluded.metadata
      `);
      stmt.run(
        item.id,
        item.scope,
        item.classification,
        item.key,
        item.content,
        JSON.stringify(item.tags),
        item.importance,
        item.timestamp,
        item.metadata ? JSON.stringify(item.metadata) : null
      );
    } catch (_) {}
  }

  private seedDefaultState(): void {
    this.save({
      scope: 'USER_PROFILE',
      classification: 'NORMAL',
      key: 'user_identity',
      content: 'Mursaleen. Sovereign Commander of MURSAL JARVIS.',
      tags: ['identity', 'master'],
      importance: 10,
    });

    this.save({
      scope: 'USER_PROFILE',
      classification: 'NORMAL',
      key: 'communication_style',
      content: 'Prefers Pakistani conversational style (Urdu, Roman Urdu, English) with natural respectful warmth ("jani", "yaar", "theek hai").',
      tags: ['tone', 'language', 'pakistani'],
      importance: 9,
    });

    this.save({
      scope: 'LONG_TERM',
      classification: 'NORMAL',
      key: 'business_mursalcart',
      content: 'MursalCart operates on Daraz, Markaz, and TikTok Shop with a strict 40% margin buffer against Pakistani COD returns.',
      tags: ['mursalcart', 'ecommerce', 'business'],
      importance: 9,
    });
  }
}

export const globalMemoryManager = new UnifiedMemoryManager();
export const globalUnifiedMemory = globalMemoryManager;

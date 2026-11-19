// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { type AuditEntry, type Store, type StoredResult, windowEnd, windowKey } from './types';

/** For tests and local development. Same behaviour as the MongoDB store, kept in memory. */
export class MemoryStore implements Store {
  readonly results = new Map<string, StoredResult>();
  readonly counters = new Map<string, { count: number; expiresAt: Date }>();
  readonly auditLog: AuditEntry[] = [];

  async saveResult(result: StoredResult): Promise<void> {
    this.results.set(result.id, structuredClone(result));
  }

  async getResult(id: string, now: Date): Promise<StoredResult | null> {
    const r = this.results.get(id);
    return r && r.expiresAt > now ? structuredClone(r) : null;
  }

  async recentResult(target: string, since: Date, now: Date): Promise<StoredResult | null> {
    let best: StoredResult | null = null;
    for (const r of this.results.values()) {
      if (r.target !== target || r.createdAt < since || r.expiresAt <= now) continue;
      if (!best || r.createdAt > best.createdAt) best = r;
    }
    return best ? structuredClone(best) : null;
  }

  async hit(key: string, windowMs: number, now: Date): Promise<number> {
    const k = windowKey(key, windowMs, now);
    // The key names the window, so a new window starts from zero by itself.
    const count = (this.counters.get(k)?.count ?? 0) + 1;
    this.counters.set(k, { count, expiresAt: windowEnd(windowMs, now) });
    return count;
  }

  async audit(entry: AuditEntry): Promise<void> {
    this.auditLog.push(structuredClone(entry));
  }

  async close(): Promise<void> {}
}

// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  type AuditEntry,
  type LoginToken,
  type OwnerResult,
  type OwnerSession,
  type Store,
  type StoredResult,
  windowKey,
  windowEnd,
} from './types';

/** For tests and local development. Same behaviour as the MongoDB store, kept in memory. */
export class MemoryStore implements Store {
  readonly results = new Map<string, StoredResult>();
  readonly counters = new Map<string, { count: number; expiresAt: Date }>();
  readonly auditLog: AuditEntry[] = [];
  readonly loginTokens = new Map<string, LoginToken>();
  readonly sessions = new Map<string, OwnerSession>();
  readonly ownerResults = new Map<string, OwnerResult>();

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

  async saveLoginToken(token: LoginToken): Promise<void> {
    this.loginTokens.set(token.hash, structuredClone(token));
  }

  async peekLoginToken(hash: string, now: Date): Promise<LoginToken | null> {
    const t = this.loginTokens.get(hash);
    return t && t.expiresAt > now ? structuredClone(t) : null;
  }

  async takeLoginToken(hash: string, now: Date): Promise<LoginToken | null> {
    const t = this.loginTokens.get(hash);
    this.loginTokens.delete(hash);
    return t && t.expiresAt > now ? t : null;
  }

  async saveSession(session: OwnerSession): Promise<void> {
    this.sessions.set(session.hash, structuredClone(session));
  }

  async getSession(hash: string, now: Date): Promise<OwnerSession | null> {
    const s = this.sessions.get(hash);
    return s && s.expiresAt > now ? structuredClone(s) : null;
  }

  async deleteSession(hash: string): Promise<void> {
    this.sessions.delete(hash);
  }

  async saveOwnerResult(result: OwnerResult): Promise<void> {
    this.ownerResults.set(result.id, structuredClone(result));
  }

  async getOwnerResult(id: string, now: Date): Promise<OwnerResult | null> {
    const r = this.ownerResults.get(id);
    return r && r.expiresAt > now ? structuredClone(r) : null;
  }

  async close(): Promise<void> {}
}

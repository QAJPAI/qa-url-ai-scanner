// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PublicSummary } from 'qa-jp-ai-scanner';

/** A public result, shown at /r/<id>. It holds the public summary and nothing more. */
export interface StoredResult {
  id: string;
  /** The page as checked (normalized URL), the key for reusing a recent result. */
  target: string;
  summary: PublicSummary;
  createdAt: Date;
  expiresAt: Date;
}

export type AuditAction = 'public_check';
export type AuditOutcome = 'checked' | 'reused' | 'rate_limited' | 'busy' | 'invalid_input' | 'refused_origin' | `error:${string}`;

/** One line of the audit log: who asked for what, and what happened. Kept for a limited time. */
export interface AuditEntry {
  at: Date;
  ip: string;
  action: AuditAction;
  target?: string;
  outcome: AuditOutcome;
  resultId?: string;
  expiresAt: Date;
}

export interface Store {
  saveResult(result: StoredResult): Promise<void>;
  getResult(id: string, now: Date): Promise<StoredResult | null>;
  /** The newest result for this page created at or after `since`, if any. */
  recentResult(target: string, since: Date, now: Date): Promise<StoredResult | null>;
  /**
   * Count one more event under `key` in the window that contains `now`, and
   * return the count including it. Windows are fixed (start at multiples of
   * windowMs) and expire on their own.
   */
  hit(key: string, windowMs: number, now: Date): Promise<number>;
  audit(entry: AuditEntry): Promise<void>;
  close(): Promise<void>;
}

export const windowKey = (key: string, windowMs: number, now: Date): string =>
  `${key}:${windowMs}:${Math.floor(now.getTime() / windowMs)}`;

export const windowEnd = (windowMs: number, now: Date): Date =>
  new Date((Math.floor(now.getTime() / windowMs) + 1) * windowMs);

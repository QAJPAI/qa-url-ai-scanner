// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Assessment, Comparison, PublicSummary } from 'qa-jp-ai-scanner';

/** A public result, shown at /r/<id>. It holds the public summary and nothing more. */
export interface StoredResult {
  id: string;
  /** The page as checked (normalized URL), the key for reusing a recent result. */
  target: string;
  summary: PublicSummary;
  createdAt: Date;
  expiresAt: Date;
}

export type AuditAction =
  | 'public_check'
  | 'owner_mail'
  | 'owner_verify'
  | 'owner_check'
  | 'owner_view'
  | 'owner_sign_out';
export type AuditOutcome =
  | 'checked'
  | 'reused'
  | 'rate_limited'
  | 'busy'
  | 'invalid_input'
  | 'refused_origin'
  | 'sent'
  | 'ineligible'
  | 'unavailable'
  | 'verified'
  | 'not_verified'
  | 'expired'
  | 'shown'
  | 'signed_out'
  | `error:${string}`;

/** One line of the audit log: who asked for what, and what happened. Kept for a limited time. */
export interface AuditEntry {
  at: Date;
  ip: string;
  action: AuditAction;
  target?: string;
  outcome: AuditOutcome;
  resultId?: string;
  /** Owner actions: how ownership was shown, and by which address for the email method. */
  method?: 'email' | 'file' | 'dns';
  email?: string;
  expiresAt: Date;
}

/** A sign-in link that was emailed. Only a hash of the link's secret is stored. */
export interface LoginToken {
  hash: string;
  email: string;
  target: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * A verified owner's session. The cookie carries a random id; only its hash is
 * stored, with the engine-sealed proof. Lives no longer than the proof.
 */
export interface OwnerSession {
  hash: string;
  sealed: string;
  target: string;
  method: 'email' | 'file' | 'dns';
  email?: string;
  createdAt: Date;
  expiresAt: Date;
}

/** An owner's detailed result. Visible only to the session that ran it, and kept only as long. */
export interface OwnerResult {
  id: string;
  sessionHash: string;
  assessment: Assessment;
  /**
   * What changed since the first check of this session, as the engine judged
   * it when this check ran. Absent on the first check.
   */
  comparison?: Comparison;
  createdAt: Date;
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

  saveLoginToken(token: LoginToken): Promise<void>;
  /** Look without using it up (the confirmation page). */
  peekLoginToken(hash: string, now: Date): Promise<LoginToken | null>;
  /** Use it up: returns it at most once, atomically. */
  takeLoginToken(hash: string, now: Date): Promise<LoginToken | null>;

  saveSession(session: OwnerSession): Promise<void>;
  getSession(hash: string, now: Date): Promise<OwnerSession | null>;
  deleteSession(hash: string): Promise<void>;

  saveOwnerResult(result: OwnerResult): Promise<void>;
  getOwnerResult(id: string, now: Date): Promise<OwnerResult | null>;
  /** The earliest result of this session that is still kept: what later checks are compared with. */
  firstOwnerResult(sessionHash: string, now: Date): Promise<OwnerResult | null>;

  close(): Promise<void>;
}

export const windowKey = (key: string, windowMs: number, now: Date): string =>
  `${key}:${windowMs}:${Math.floor(now.getTime() / windowMs)}`;

export const windowEnd = (windowMs: number, now: Date): Date =>
  new Date((Math.floor(now.getTime() / windowMs) + 1) * windowMs);

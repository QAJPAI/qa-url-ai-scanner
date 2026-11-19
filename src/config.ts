// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Settings, from environment variables only. Every limit has a safe default,
 * so a missing variable never means "no limit".
 */
export interface Limits {
  /** Checks one address may start per minute, and per day. */
  perIpPerMinute: number;
  perIpPerDay: number;
  /** Checks the whole service runs per day; protects the server and the sites it reads. */
  totalPerDay: number;
  /** A page checked again within this time gets the earlier result: the site is not read twice. */
  reuseResultMs: number;
  /** Checks running at once, and waiting; beyond that the visitor is asked to try later. */
  maxConcurrent: number;
  maxQueued: number;
  /** Time budget for one check, all requests included. */
  scanBudgetMs: number;
  /** How long a result page and an audit entry are kept. */
  resultTtlMs: number;
  auditTtlMs: number;
}

export interface Config {
  host: string;
  port: number;
  /** The public address, e.g. https://url.jp.ai. Used for the same-origin check and links. */
  baseUrl: URL;
  /**
   * Trust X-Real-IP, but only on connections from this machine (nginx in front).
   * Off: every visitor is identified by the connection's own address.
   */
  trustProxy: boolean;
  mongoUri?: string;
  mongoDb: string;
  /** Shown in the privacy policy as the operator. */
  operatorName: string;
  contactEmail: string;
  sourceUrl: string;
  engineSourceUrl: string;
  preReleaseGuideUrl: string;
  limits: Limits;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = new URL(env.BASE_URL ?? 'http://localhost:3000');
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost' && baseUrl.hostname !== '127.0.0.1') {
    throw new Error('BASE_URL must be https outside local development');
  }
  return {
    // Listen on this machine only by default: nginx is the way in.
    host: env.HOST ?? '127.0.0.1',
    port: int(env, 'PORT', 3000, 1, 65535),
    baseUrl,
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    mongoUri: env.MONGODB_URI || undefined,
    mongoDb: env.MONGODB_DB ?? 'url_jp_ai',
    operatorName: env.OPERATOR_NAME ?? 'QA.JP.AI',
    contactEmail: env.CONTACT_EMAIL ?? 'qa@email.jp.ai',
    sourceUrl: 'https://github.com/QAJPAI/qa-url-ai-scanner',
    engineSourceUrl: 'https://github.com/QAJPAI/qa-jp-ai-scanner',
    preReleaseGuideUrl: 'https://github.com/QAJPAI/qa-jp-ai-scanner/blob/main/integrations/README.ja.md',
    limits: {
      perIpPerMinute: int(env, 'LIMIT_PER_IP_PER_MINUTE', 3, 1, 1000),
      perIpPerDay: int(env, 'LIMIT_PER_IP_PER_DAY', 30, 1, 100_000),
      totalPerDay: int(env, 'LIMIT_TOTAL_PER_DAY', 3000, 1, 10_000_000),
      reuseResultMs: int(env, 'REUSE_RESULT_MINUTES', 10, 0, 24 * 60) * MINUTE,
      maxConcurrent: int(env, 'MAX_CONCURRENT_SCANS', 4, 1, 64),
      maxQueued: int(env, 'MAX_QUEUED_SCANS', 16, 0, 1000),
      scanBudgetMs: int(env, 'SCAN_BUDGET_SECONDS', 30, 5, 120) * 1000,
      resultTtlMs: int(env, 'RESULT_TTL_DAYS', 30, 1, 365) * DAY,
      auditTtlMs: int(env, 'AUDIT_TTL_DAYS', 30, 1, 365) * DAY,
    },
  };
}

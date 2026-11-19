// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes } from 'node:crypto';

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
  /** Sign-in emails: per address and per site per day, and for the whole service (below the provider's cap). */
  mailPerAddressPerDay: number;
  mailPerSitePerDay: number;
  mailTotalPerDay: number;
  mailPerIpPerDay: number;
  /** File and DNS verification attempts per address per minute. */
  verifyPerIpPerMinute: number;
  /** Owner checks per verified session per hour. */
  ownerChecksPerHour: number;
  /** How long a sign-in link works. */
  loginLinkTtlMs: number;
}

export interface MailConfig {
  /** Resend API key. Without one, email verification is unavailable (development: links go to the log). */
  resendApiKey?: string;
  from: string;
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
  /**
   * Seals ownership proofs and derives verification tokens. 32+ characters,
   * required in production; changing it signs every owner out.
   */
  sessionSecret: string;
  /** Run active checks (e.g. requesting /.env) for verified owners. The off switch. */
  activeChecks: boolean;
  mail: MailConfig;
  /** Beta (test operation): a notice on every page, and nothing is indexed by search engines. */
  beta: boolean;
  production: boolean;
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
  const production = env.NODE_ENV === 'production';
  const baseUrl = new URL(env.BASE_URL ?? 'http://localhost:3000');
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost' && baseUrl.hostname !== '127.0.0.1') {
    throw new Error('BASE_URL must be https outside local development');
  }
  let sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) {
    if (production || sessionSecret) throw new Error('SESSION_SECRET must be at least 32 characters');
    // Development only: a new secret per start, so owners are signed out on restart.
    sessionSecret = randomBytes(32).toString('base64url');
  }
  const betaRaw = (env.SITE_BETA ?? 'off').toLowerCase();
  if (!['on', 'off'].includes(betaRaw)) throw new Error('SITE_BETA must be on or off');
  const activeRaw = (env.ACTIVE_CHECKS ?? 'on').toLowerCase();
  if (!['on', 'off'].includes(activeRaw)) throw new Error('ACTIVE_CHECKS must be on or off');
  return {
    // Listen on this machine only by default: nginx is the way in.
    host: env.HOST ?? '127.0.0.1',
    port: int(env, 'PORT', 3000, 1, 65535),
    baseUrl,
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    mongoUri: env.MONGODB_URI || undefined,
    mongoDb: env.MONGODB_DB ?? 'url_jp_ai',
    operatorName: env.OPERATOR_NAME ?? 'Agentic AI LLC',
    contactEmail: env.CONTACT_EMAIL ?? 'qa@email.jp.ai',
    sourceUrl: 'https://github.com/QAJPAI/qa-url-ai-scanner',
    engineSourceUrl: 'https://github.com/QAJPAI/qa-jp-ai-scanner',
    preReleaseGuideUrl: 'https://github.com/QAJPAI/qa-jp-ai-scanner/blob/main/integrations/README.ja.md',
    sessionSecret,
    activeChecks: activeRaw === 'on',
    mail: { resendApiKey: env.RESEND_API_KEY || undefined, from: env.MAIL_FROM ?? 'url.jp.ai <noreply@url.jp.ai>' },
    beta: betaRaw === 'on',
    production,
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
      mailPerAddressPerDay: int(env, 'MAIL_PER_ADDRESS_PER_DAY', 3, 1, 100),
      mailPerSitePerDay: int(env, 'MAIL_PER_SITE_PER_DAY', 10, 1, 1000),
      mailTotalPerDay: int(env, 'MAIL_TOTAL_PER_DAY', 90, 1, 100_000),
      mailPerIpPerDay: int(env, 'MAIL_PER_IP_PER_DAY', 10, 1, 1000),
      verifyPerIpPerMinute: int(env, 'VERIFY_PER_IP_PER_MINUTE', 5, 1, 1000),
      ownerChecksPerHour: int(env, 'OWNER_CHECKS_PER_HOUR', 10, 1, 1000),
      loginLinkTtlMs: int(env, 'LOGIN_LINK_MINUTES', 15, 5, 60) * MINUTE,
    },
  };
}

// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type Assessment,
  ASSESSMENT_SCHEMA,
  buildLedger,
  ENGINE_VERSION,
  proofCovers,
  type PublicSummary,
  recordFactory,
  RULES_VERSION,
  verifyByDns,
  verifyByFile,
} from 'qa-jp-ai-scanner';
import { type AppDeps, createApp, type PublicScan } from '../src/app';
import type { Mail } from '../src/mail';
import type { OwnerDeps } from '../src/owner';
import { type Config, loadConfig } from '../src/config';
import { MemoryStore } from '../src/store/memory';

export function summaryFor(host: string, over: Partial<PublicSummary> = {}): PublicSummary {
  return {
    host,
    scannedAt: '2026-11-20T00:00:00.000Z',
    rulesVersion: '0.1.0',
    layer: 'url',
    grade: 'B',
    counts: { P0: 0, P1: 0, P2: 2 },
    coverage: { total: 15, checked: 1, partial: 2, notRun: 12, error: 0 },
    ...over,
  };
}

/** A detailed owner result as the engine would produce it, with hostile text in it. */
export function ownerAssessment(host: string, startedAt = '2026-11-20T03:00:00.000Z'): Assessment {
  const make = recordFactory('test.checker', 'url', 'passive');
  return {
    schema: ASSESSMENT_SCHEMA,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    target: { layer: 'url', host },
    tier: 'owner',
    startedAt,
    records: [
      make.confirmed({
        ruleId: 'R02',
        code: 'secret.openai',
        key: 'k1',
        location: `https://${host}/assets/app.js`,
        evidence: 'sk-pr…（値は記録していません）<img src=x onerror=alert(1)>',
        severity: 'P0',
      }),
      make.needsValidation({
        ruleId: 'R01',
        code: 'baas.supabase_rls_unverified',
        key: 'k2',
        location: `https://${host}/`,
        evidence: 'Supabase',
        blocker: 'requires_owner_intent',
      }),
    ],
    coverage: buildLedger('url', [
      { checker: 'test.checker', mode: 'passive', reports: [{ ruleId: 'R02', status: 'checked' }, { ruleId: 'R01', status: 'partial', note: 'presence_hint_only' }] },
    ]),
  };
}

export interface TestApp {
  base: string;
  store: MemoryStore;
  config: Config;
  scans: string[];
  errors: Array<{ message: string; err: unknown }>;
  clock: { now: Date };
  mails: Mail[];
  dns: Map<string, string[][]>;
  ownerScans: Array<{ url: string; activeChecks: boolean }>;
  close(): Promise<void>;
  post(body: Record<string, string>, headers?: Record<string, string>): Promise<Response>;
  /** POST a form to any path, as a browser on our own page would. */
  form(path: string, body: Record<string, string>, cookie?: string, headers?: Record<string, string>): Promise<Response>;
  get(path: string, cookie?: string): Promise<Response>;
}

export async function startApp(
  options: {
    env?: Record<string, string>;
    scan?: PublicScan;
    configure?: (c: Config) => void;
    owner?: Partial<OwnerDeps>;
    noMailer?: boolean;
  } = {},
): Promise<TestApp> {
  const store = new MemoryStore();
  const scans: string[] = [];
  const errors: TestApp['errors'] = [];
  const clock = { now: new Date('2026-11-20T03:00:00.000Z') };

  // The base URL is fixed before the port is known; the same-origin check compares with it.
  const config = loadConfig({ BASE_URL: 'http://localhost:3000', ...options.env });
  options.configure?.(config);

  const mails: Mail[] = [];
  const dns = new Map<string, string[][]>();
  const ownerScans: TestApp['ownerScans'] = [];
  const owner: OwnerDeps = {
    // The engine's own verification; only the network side is replaced.
    verifyFile: (origin, token) => verifyByFile(origin, token, { allowPrivate: true }),
    verifyDns: (host, token) =>
      verifyByDns(host, token, async (name) => {
        const found = dns.get(name);
        if (!found) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
        return found;
      }),
    scanOwner: async (url, proof, o) => {
      const host = new URL(url).hostname;
      // As the engine does: the proof must cover the site, judged at the test clock's time
      // (the real clock would make every proof issued at the fixed test date look expired).
      if (!proofCovers(proof, host, clock.now.getTime())) throw new Error('proof does not cover');
      ownerScans.push({ url, activeChecks: o.activeChecks });
      return ownerAssessment(host);
    },
    mailer: options.noMailer ? undefined : { send: async (m) => void mails.push(m) },
    ...options.owner,
  };

  let counter = 0;
  const deps: AppDeps = {
    config,
    store,
    stylesheet: 'body{}',
    favicon: '<svg/>',
    owner,
    now: () => clock.now,
    newId: () => `id${String(++counter).padStart(20, '0')}`,
    logError: (message, err) => errors.push({ message, err }),
    scanPublic:
      options.scan ??
      (async (url) => {
        scans.push(url);
        return summaryFor(new URL(url).hostname);
      }),
  };
  if (options.scan) {
    const inner = options.scan;
    deps.scanPublic = async (url, o) => {
      scans.push(url);
      return inner(url, o);
    };
  }

  // One app instance for the whole server, as in production.
  const handler = createApp(deps);
  const server: Server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    base,
    store,
    config,
    scans,
    errors,
    clock,
    mails,
    dns,
    ownerScans,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    post: (body, headers = { Origin: config.baseUrl.origin }) =>
      fetch(`${base}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams(body).toString(),
        redirect: 'manual',
      }),
    form: (path, body, cookie, headers = {}) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: config.baseUrl.origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: new URLSearchParams(body).toString(),
        redirect: 'manual',
      }),
    get: (path, cookie) => fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }),
  };
}

/** The name=value part of a Set-Cookie header. */
export const cookieOf = (r: Response): string => (r.headers.get('set-cookie') ?? '').split(';')[0]!;

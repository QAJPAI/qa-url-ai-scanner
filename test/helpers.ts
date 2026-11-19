// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PublicSummary } from 'qa-jp-ai-scanner';
import { type AppDeps, createApp, type PublicScan } from '../src/app';
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

export interface TestApp {
  base: string;
  store: MemoryStore;
  config: Config;
  scans: string[];
  errors: Array<{ message: string; err: unknown }>;
  clock: { now: Date };
  close(): Promise<void>;
  post(body: Record<string, string>, headers?: Record<string, string>): Promise<Response>;
}

export async function startApp(
  options: {
    env?: Record<string, string>;
    scan?: PublicScan;
    configure?: (c: Config) => void;
  } = {},
): Promise<TestApp> {
  const store = new MemoryStore();
  const scans: string[] = [];
  const errors: TestApp['errors'] = [];
  const clock = { now: new Date('2026-11-20T03:00:00.000Z') };

  // The base URL is fixed before the port is known; the same-origin check compares with it.
  const config = loadConfig({ BASE_URL: 'http://localhost:3000', ...options.env });
  options.configure?.(config);

  let counter = 0;
  const deps: AppDeps = {
    config,
    store,
    stylesheet: 'body{}',
    favicon: '<svg/>',
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
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    post: (body, headers = { Origin: config.baseUrl.origin }) =>
      fetch(`${base}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams(body).toString(),
        redirect: 'manual',
      }),
  };
}

// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { closeAgents, inspectOwner, scanPublic, verifyByDns, verifyByFile } from 'qa-jp-ai-scanner';
import { createApp } from './app';
import { loadConfig } from './config';
import { LogMailer, type Mailer, ResendMailer } from './mail';
import { MemoryStore } from './store/memory';
import { MongoStore } from './store/mongo';
import type { Store } from './store/types';

const config = loadConfig();

let store: Store;
if (config.mongoUri) {
  store = await MongoStore.connect(config.mongoUri, config.mongoDb);
} else {
  // Development only: loadConfig refuses production without MONGODB_URI.
  console.warn('MONGODB_URI is not set: results, limits and the audit log are kept in memory only');
  store = new MemoryStore();
}

let mailer: Mailer | undefined;
if (config.mail.resendApiKey) mailer = new ResendMailer(config.mail.resendApiKey, config.mail.from);
else if (!config.production) {
  console.warn('RESEND_API_KEY is not set: sign-in emails are written to this log instead');
  mailer = new LogMailer();
} else {
  console.warn('RESEND_API_KEY is not set: email verification is unavailable (file and DNS still work)');
}
if (!config.activeChecks) console.warn('ACTIVE_CHECKS=off: owners get passive checks only');

const stylesheet = readFileSync(new URL('../static/site.css', import.meta.url), 'utf8');
const favicon = readFileSync(new URL('../static/favicon.svg', import.meta.url), 'utf8');
const handler = createApp({
  config,
  store,
  stylesheet,
  favicon,
  scanPublic: (url, options) => scanPublic(url, options),
  owner: {
    verifyFile: (origin, token) => verifyByFile(origin, token),
    verifyDns: (host, token) => verifyByDns(host, token),
    inspectOwner: (url, proof, options) => inspectOwner(url, proof, options),
    mailer,
  },
});

const server = createServer((req, res) => void handler(req, res));
// A check takes at most the scan budget; nothing else needs long.
server.headersTimeout = 10_000;
server.requestTimeout = config.limits.scanBudgetMs + 15_000;
server.keepAliveTimeout = 5_000;

server.listen(config.port, config.host, () => {
  console.log(`url.jp.ai listening on http://${config.host}:${config.port} (public address ${config.baseUrl.origin})`);
});

async function shutdown(signal: string) {
  console.log(`${signal}: shutting down`);
  server.close();
  await Promise.allSettled([store.close(), closeAgents()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

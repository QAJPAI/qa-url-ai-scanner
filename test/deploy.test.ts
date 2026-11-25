// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { loadConfig } from '../src/config';

// The settings pm2 hands to the server, with no secrets file (never the real one).
process.env.URL_JP_AI_SECRETS = '/nonexistent/secrets.env';
const pm2 = createRequire(import.meta.url)('../deploy/ecosystem.config.cjs') as {
  apps: [{ env: Record<string, string> }];
};
const env = pm2.apps[0].env;

test('pm2 is handed every setting the server reads, so that a line deleted from the secrets file takes effect', () => {
  // pm2 merges new settings over the ones a process already has and never
  // removes one. A setting it is not handed keeps its old value for ever.
  const source = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
  const read = new Set([...source.matchAll(/env\.([A-Z][A-Z_]+)|int\(env, '([A-Z_]+)'/g)].flatMap((m) => m[1] ?? m[2] ?? []));
  assert.ok(read.size > 20, 'the settings were found in src/config.ts');
  const missing = [...read].filter((name) => !(name in env));
  assert.deepEqual(missing, [], 'add these to deploy/ecosystem.config.cjs');
});

test('the pm2 settings pass the server\'s own rules once the secrets file adds SESSION_SECRET', () => {
  assert.throws(() => loadConfig(env), /SESSION_SECRET/, 'empty until the secrets file sets it');
  const config = loadConfig({ ...env, SESSION_SECRET: 's'.repeat(32) });
  assert.equal(config.production, true);
  assert.equal(config.beta, true, 'the test run starts as a beta');
  assert.equal(config.mail.resendApiKey, undefined, 'an empty key means no key');
  assert.equal(config.limits.perIpPerMinute, 3, 'an empty number means the default');
});

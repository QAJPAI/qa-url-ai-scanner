// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Bundle the server into dist/server.mjs for pm2. Dependencies (the engine,
// the MongoDB driver) stay external and are installed by npm.
import { build } from 'esbuild';

await build({
  entryPoints: [new URL('../src/server.ts', import.meta.url).pathname],
  outfile: new URL('../dist/server.mjs', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  legalComments: 'inline',
  banner: { js: '// url.jp.ai — Copyright (C) 2026 iQi — AGPL-3.0-or-later\n// Source: https://github.com/QAJPAI/qa-url-ai-scanner' },
  logLevel: 'warning',
});

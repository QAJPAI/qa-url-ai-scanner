// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Could the server start with the settings pm2 would hand it? scripts/deploy.sh
// asks before it touches pm2: a mistyped value or a wrong database password
// must not replace a running server with one that cannot start.
//
//   node --import tsx scripts/preflight.ts settings   the server's own rules (src/config.ts)
//   node --import tsx scripts/preflight.ts database   and can it open its database?
//
// Reads only: nothing is created or changed, in the database either. Prints
// what is wrong and exits 3; prints nothing when all is well. Any other exit
// code means the question itself failed (packages missing after an interrupted
// install), which deploy.sh must not report as a wrong setting.
import { createRequire } from 'node:module';
import { MongoClient } from 'mongodb';
import { loadConfig } from '../src/config';

const pm2 = createRequire(import.meta.url)('../deploy/ecosystem.config.cjs') as {
  apps: [{ env: NodeJS.ProcessEnv }];
};

try {
  const config = loadConfig({ ...process.env, ...pm2.apps[0].env });
  if (process.argv[2] === 'database' && config.mongoUri) {
    const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    try {
      // Listing needs a signed-in user wherever the database asks for one; a ping does not.
      await client.db(config.mongoDb).listCollections({}, { nameOnly: true }).toArray();
    } finally {
      await client.close();
    }
  }
} catch (err) {
  // The message only, and never an address with its password.
  const message = err instanceof Error ? err.message : String(err);
  console.log(message.replace(/\/\/[^@\s/]*@/g, '//***@'));
  process.exit(3);
}

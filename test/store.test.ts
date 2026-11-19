// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConcurrencyLimiter, BusyError } from '../src/limiter';
import { MemoryStore } from '../src/store/memory';
import { MongoClient } from 'mongodb';
import { MongoStore } from '../src/store/mongo';
import type { Store } from '../src/store/types';
import { summaryFor } from './helpers';

/**
 * The same contract for every store. MongoDB is tested when MONGODB_URI points
 * at a database that may be written to (a throwaway one); otherwise only the
 * in-memory store runs here.
 */
const stores: Array<[string, () => Promise<Store>, () => Promise<void>]> = [
  ['memory', async () => new MemoryStore(), async () => {}],
];
if (process.env.MONGODB_URI) {
  const uri = process.env.MONGODB_URI;
  const dbName = `url_jp_ai_test_${Date.now()}`;
  const drop = async () => {
    const client = await MongoClient.connect(uri);
    await client.db(dbName).dropDatabase();
    await client.close();
  };
  stores.push(['mongodb', () => MongoStore.connect(uri, dbName), drop]);
}

for (const [name, open, cleanUp] of stores) {
  test(`${name} store: results, reuse, windows, audit`, async () => {
    const store = await open();
    try {
      const t0 = new Date('2026-11-20T00:00:00Z');
      const later = (ms: number) => new Date(t0.getTime() + ms);
      const result = (id: string, target: string, at: Date) => ({
        id,
        target,
        summary: summaryFor('example.jp'),
        createdAt: at,
        expiresAt: later(3_600_000),
      });

      await store.saveResult(result('a'.repeat(22), 'https://example.jp/', t0));
      await store.saveResult(result('b'.repeat(22), 'https://example.jp/', later(1000)));
      assert.equal((await store.getResult('a'.repeat(22), t0))?.target, 'https://example.jp/');
      assert.equal(await store.getResult('a'.repeat(22), later(3_600_000)), null, 'expired');
      assert.equal((await store.recentResult('https://example.jp/', t0, later(2000)))?.id, 'b'.repeat(22), 'newest');
      assert.equal(await store.recentResult('https://example.jp/', later(5000), later(5000)), null, 'too old');
      assert.equal(await store.recentResult('https://other.jp/', t0, t0), null);

      assert.equal(await store.hit('k', 60_000, t0), 1);
      assert.equal(await store.hit('k', 60_000, later(59_000)), 2);
      assert.equal(await store.hit('k', 60_000, later(60_000)), 1, 'a new window');
      assert.equal(await store.hit('other', 60_000, t0), 1, 'keys are separate');

      await store.audit({ at: t0, ip: '203.0.113.9', action: 'public_check', outcome: 'checked', expiresAt: later(1000) });
    } finally {
      await store.close();
      await cleanUp();
    }
  });
}

test('the limiter never runs more than allowed, and refuses beyond the queue', async () => {
  const limiter = new ConcurrencyLimiter(2, 2);
  let running = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  const job = () =>
    limiter.run(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise<void>((r) => releases.push(r));
      running--;
    });

  const jobs = [job(), job(), job(), job()];
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(limiter.active, 2);
  assert.equal(limiter.queued, 2);
  await assert.rejects(job(), BusyError);

  while (releases.length > 0 || running > 0) {
    releases.shift()?.();
    await new Promise((r) => setTimeout(r, 5));
  }
  await Promise.all(jobs);
  assert.equal(peak, 2);
  assert.equal(limiter.active, 0);
  assert.equal(limiter.queued, 0);
});

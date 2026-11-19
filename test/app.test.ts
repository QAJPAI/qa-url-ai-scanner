// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { after, test } from 'node:test';
import { ScanError } from 'qa-jp-ai-scanner';
import { loadConfig } from '../src/config';
import { esc } from '../src/pages/html';
import { SITE_VERSION } from '../src/version';
import { startApp, summaryFor, type TestApp } from './helpers';

const apps: TestApp[] = [];
after(async () => {
  for (const a of apps) await a.close();
});
const start = async (...args: Parameters<typeof startApp>) => {
  const a = await startApp(...args);
  apps.push(a);
  return a;
};

const text = async (r: Response) => r.text();

test('pages carry the security headers and no script', async () => {
  const app = await start();
  for (const path of ['/', '/about', '/terms', '/privacy']) {
    const r = await fetch(app.base + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-security-policy')!, /default-src 'none'/);
    assert.match(r.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('referrer-policy'), 'same-origin');
    const body = await text(r);
    assert.equal(/<script/i.test(body), false, `${path} has no script`);
    assert.match(body, /<html lang="ja">/);
  }
});

test('a check from our own page runs once and shows the public result', async () => {
  const app = await start();
  const r = await app.post({ url: 'example.jp' });
  assert.equal(r.status, 303);
  const location = r.headers.get('location')!;
  assert.match(location, /^\/r\/[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(app.scans, ['https://example.jp/']);

  const page = await fetch(app.base + location);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  const body = await text(page);
  assert.match(body, /example\.jp/);
  assert.match(body, /<span class="letter">B<\/span>/);
  assert.match(body, /P2（改善推奨）2 件/);
  assert.match(body, /すべてのサイトで同じ内容です/);
  assert.match(body, /キーの露出など、重大な問題になり得る項目はこの評価に含まれていません/);
  // The public result never shows the owner-only severity.
  assert.equal(body.includes('P0'), false);
  assert.equal(app.store.auditLog.at(-1)?.outcome, 'checked');
});

test('a check started from another site is refused before anything runs', async () => {
  const app = await start();
  for (const headers of [{ Origin: 'https://evil.example' }, {}, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const r = await app.post({ url: 'example.jp' }, headers as Record<string, string>);
    assert.equal(r.status, 403, JSON.stringify(headers));
  }
  assert.deepEqual(app.scans, []);
  assert.ok(app.store.auditLog.every((e) => e.outcome === 'refused_origin'));
  // A same-origin form post without Origin, or with "Origin: null", is decided by Sec-Fetch-Site.
  assert.equal((await app.post({ url: 'example.jp' }, { 'Sec-Fetch-Site': 'same-origin' })).status, 303);
  assert.equal((await app.post({ url: 'b.example.jp' }, { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' })).status, 303);
  assert.equal((await app.post({ url: 'c.example.jp' }, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await app.post({ url: 'd.example.jp' }, { Origin: 'null' })).status, 403);
});

test('bad input is refused without a check', async () => {
  const app = await start();
  const bad = await app.post({ url: 'ftp://example.jp' });
  assert.equal(bad.status, 400);
  assert.match(await text(bad), /URL の形式が正しくありません/);
  const creds = await app.post({ url: 'https://user:pass@example.jp' });
  assert.equal(creds.status, 400);
  assert.match(await text(creds), /ユーザー名やパスワードを含む URL/);
  const empty = await app.post({});
  assert.equal(empty.status, 400);
  assert.deepEqual(app.scans, []);
});

test('what was typed is echoed back escaped', async () => {
  const app = await start();
  const r = await app.post({ url: 'ftp://"><img src=x onerror=alert(1)>' });
  const body = await text(r);
  assert.equal(body.includes('<img src=x'), false);
  assert.ok(body.includes(esc('"><img src=x onerror=alert(1)>')));
});

test('a hostile host name in a result is escaped', async () => {
  const app = await start({ scan: async () => summaryFor('<script>alert(1)</script>.example') });
  const r = await app.post({ url: 'example.jp' });
  const body = await text(await fetch(app.base + r.headers.get('location')!));
  assert.equal(body.includes('<script>alert'), false);
  assert.ok(body.includes('&lt;script&gt;'));
});

test('one address is limited per minute and per day; every attempt counts', async () => {
  const app = await start({ env: { LIMIT_PER_IP_PER_MINUTE: '3', LIMIT_PER_IP_PER_DAY: '5', REUSE_RESULT_MINUTES: '0' } });
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await app.post({ url: `a${i}.example.jp` })).status);
  assert.deepEqual(statuses, [303, 303, 303, 429]);
  assert.equal(app.scans.length, 3);

  app.clock.now = new Date(app.clock.now.getTime() + 61_000);
  const later: number[] = [];
  for (let i = 0; i < 3; i++) later.push((await app.post({ url: `b${i}.example.jp` })).status);
  // 4 attempts in the first minute, refused one included: the 5th of the day is allowed, the 6th is not.
  assert.deepEqual(later, [303, 429, 429]);
  assert.equal(app.scans.length, 4);
  assert.equal(app.store.auditLog.filter((e) => e.outcome === 'rate_limited').length, 3);
});

test('the same page checked again shortly gets the earlier result; the site is read once', async () => {
  const app = await start({ env: { REUSE_RESULT_MINUTES: '10' } });
  const first = (await app.post({ url: 'example.jp' })).headers.get('location');
  const second = (await app.post({ url: 'https://example.jp/' })).headers.get('location');
  assert.equal(second, first);
  assert.equal(app.scans.length, 1);
  assert.equal(app.store.auditLog.at(-1)?.outcome, 'reused');

  app.clock.now = new Date(app.clock.now.getTime() + 11 * 60_000);
  const third = (await app.post({ url: 'example.jp' })).headers.get('location');
  assert.notEqual(third, first);
  assert.equal(app.scans.length, 2);
});

test('the service-wide daily cap stops new checks', async () => {
  const app = await start({ env: { LIMIT_TOTAL_PER_DAY: '2', REUSE_RESULT_MINUTES: '0' } });
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await app.post({ url: `c${i}.example.jp` })).status);
  assert.deepEqual(statuses, [303, 303, 503]);
  assert.equal(app.scans.length, 2);
});

test('beyond the running and waiting checks, visitors are asked to try later', { timeout: 15_000 }, async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const app = await start({
    env: { MAX_CONCURRENT_SCANS: '1', MAX_QUEUED_SCANS: '0', LIMIT_PER_IP_PER_MINUTE: '10' },
    scan: async (url) => {
      await gate;
      return summaryFor(new URL(url).hostname);
    },
  });
  const first = app.post({ url: 'slow.example.jp' });
  await new Promise((r) => setTimeout(r, 50));
  // If the second check were queued instead of refused, it would wait for the
  // first; give it a short deadline, and always let the first one finish.
  const second = await Promise.race([
    app.post({ url: 'other.example.jp' }),
    new Promise<'waited'>((r) => setTimeout(() => r('waited'), 2000)),
  ]).finally(release);
  assert.notEqual(second, 'waited', 'refused at once, not queued');
  assert.equal((second as Response).status, 503);
  assert.match(await text(second as Response), /混み合っています/);
  assert.equal((await first).status, 303);
  assert.equal(app.store.auditLog.filter((e) => e.outcome === 'busy').length, 1);
});

test('a check that cannot run says so in fixed words, never with internal detail', async () => {
  const app = await start({
    env: { LIMIT_PER_IP_PER_MINUTE: '10', REUSE_RESULT_MINUTES: '0' },
    scan: async (url) => {
      if (url.includes('down')) throw new ScanError('page_unavailable', 'HTTP 503 from upstream');
      throw new Error('connect ECONNREFUSED 10.0.0.5:443');
    },
  });
  const down = await app.post({ url: 'down.example.jp' });
  assert.equal(down.status, 422);
  const downBody = await text(down);
  assert.match(downBody, /ページを正常に取得できなかったため/);
  assert.equal(downBody.includes('HTTP 503'), false);

  const internal = await app.post({ url: 'internal.example.jp' });
  const body = await text(internal);
  assert.match(body, /検査中に問題が発生しました/);
  assert.equal(body.includes('10.0.0.5'), false);
  assert.equal(body.includes('ECONNREFUSED'), false);
  // Unexpected errors are logged for the operator.
  assert.equal(app.errors.length, 1);
  assert.deepEqual(
    app.store.auditLog.map((e) => e.outcome),
    ['error:page_unavailable', 'error:generic'],
  );
});

test('result pages: unknown, malformed and expired ids are not found', async () => {
  const app = await start({ env: { RESULT_TTL_DAYS: '1' } });
  const location = (await app.post({ url: 'example.jp' })).headers.get('location')!;
  for (const path of ['/r/AAAAAAAAAAAAAAAAAAAAAA', '/r/../../etc', '/r/x', '/r/']) {
    assert.equal((await fetch(app.base + path)).status, 404, path);
  }
  assert.equal((await fetch(app.base + location)).status, 200);
  app.clock.now = new Date(app.clock.now.getTime() + 86_400_000 + 1);
  assert.equal((await fetch(app.base + location)).status, 404);
});

test('X-Real-IP is believed only from this machine, and only when the proxy is trusted', async () => {
  const limits = { LIMIT_PER_IP_PER_MINUTE: '1', REUSE_RESULT_MINUTES: '0' };
  const untrusted = await start({ env: limits });
  const a = await untrusted.post({ url: 'a.example.jp' }, { Origin: 'http://localhost:3000', 'X-Real-IP': '203.0.113.1' });
  const b = await untrusted.post({ url: 'b.example.jp' }, { Origin: 'http://localhost:3000', 'X-Real-IP': '203.0.113.2' });
  assert.deepEqual([a.status, b.status], [303, 429], 'a forged header does not reset the limit');
  assert.equal(untrusted.store.auditLog[0]?.ip, '127.0.0.1');

  const trusted = await start({ env: { ...limits, TRUST_PROXY: '1' } });
  const c = await trusted.post({ url: 'a.example.jp' }, { Origin: 'http://localhost:3000', 'X-Real-IP': '203.0.113.1' });
  const d = await trusted.post({ url: 'b.example.jp' }, { Origin: 'http://localhost:3000', 'X-Real-IP': '203.0.113.2' });
  assert.deepEqual([c.status, d.status], [303, 303], 'nginx on this machine tells visitors apart');
  assert.deepEqual(trusted.store.auditLog.map((e) => e.ip), ['203.0.113.1', '203.0.113.2']);
  // Not an address: ignored.
  await trusted.post({ url: 'e.example.jp' }, { Origin: 'http://localhost:3000', 'X-Real-IP': 'not-an-ip' });
  assert.equal(trusted.store.auditLog.at(-1)?.ip, '127.0.0.1');
});

test('an oversized form is refused, whether its size is declared or not', async () => {
  const app = await start();
  const declared = await app.post({ url: 'x'.repeat(10_000) });
  assert.equal(declared.status, 413);

  // Sent in chunks without Content-Length: the size is counted as it arrives.
  const streamed = await new Promise<number>((resolve, reject) => {
    const req = request(
      app.base + '/check',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: app.config.baseUrl.origin } },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.on('error', reject);
    req.write('url=');
    for (let i = 0; i < 10; i++) req.write('x'.repeat(1000));
    req.end();
  });
  assert.equal(streamed, 413);
  assert.deepEqual(app.scans, []);
});

test('a malformed result id never reaches the database', async () => {
  const app = await start();
  const asked: string[] = [];
  const get = app.store.getResult.bind(app.store);
  app.store.getResult = async (id, now) => {
    asked.push(id);
    return get(id, now);
  };
  for (const path of ['/r/x', '/r/%7B%22%24ne%22%3A1%7D', '/r/' + 'a'.repeat(23), '/r/a.b']) {
    assert.equal((await fetch(app.base + path)).status, 404, path);
  }
  assert.deepEqual(asked, []);
  await fetch(app.base + '/r/' + 'a'.repeat(22));
  assert.deepEqual(asked, ['a'.repeat(22)]);
});

test('methods, HEAD, robots and unknown paths', async () => {
  const app = await start();
  assert.equal((await fetch(app.base + '/check')).status, 405);
  assert.equal((await fetch(app.base + '/', { method: 'POST' })).status, 405);
  assert.equal((await fetch(app.base + '/nope')).status, 404);
  const robots = await text(await fetch(app.base + '/robots.txt'));
  assert.match(robots, /Disallow: \/r\//);
  assert.equal((await fetch(app.base + '/healthz')).status, 200);

  const head = await new Promise<{ status: number; length: number }>((resolve, reject) => {
    const req = request(app.base + '/', { method: 'HEAD' }, (res) => {
      let length = 0;
      res.on('data', (c: Buffer) => (length += c.length));
      res.on('end', () => resolve({ status: res.statusCode!, length }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.deepEqual(head, { status: 200, length: 0 });
});

test('the audit log keeps who, what, outcome, and an expiry', async () => {
  const app = await start({ env: { AUDIT_TTL_DAYS: '30' } });
  await app.post({ url: 'example.jp' });
  const entry = app.store.auditLog[0]!;
  assert.equal(entry.action, 'public_check');
  assert.equal(entry.target, 'https://example.jp/');
  assert.equal(entry.ip, '127.0.0.1');
  assert.equal(entry.expiresAt.getTime() - entry.at.getTime(), 30 * 86_400_000);
});

test('the privacy policy states the retention actually configured', async () => {
  const app = await start({ env: { AUDIT_TTL_DAYS: '14', RESULT_TTL_DAYS: '7', OPERATOR_NAME: 'テスト運営' } });
  const body = await text(await fetch(app.base + '/privacy'));
  assert.match(body, /検査結果は 7 日間、IP アドレス・日時・確認に使ったメールアドレスの記録は 14 日間保存/);
  assert.match(body, /Resend/);
  assert.match(body, /テスト運営/);
});

test('beta: a notice on every page, and nothing is indexed', async () => {
  const beta = await start({ env: { SITE_BETA: 'on' } });
  for (const path of ['/', '/about', '/terms', '/privacy', '/owner?u=example.jp', '/nope']) {
    const r = await fetch(beta.base + path);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', path);
    const body = await text(r);
    assert.match(body, /β版（テスト運用中）です/, path);
    assert.match(body, /<meta name="robots" content="noindex, nofollow">/, path);
  }
  assert.equal(await text(await fetch(beta.base + '/robots.txt')), 'User-agent: *\nDisallow: /\n');

  const normal = await start();
  const home = await fetch(normal.base + '/');
  assert.equal(home.headers.get('x-robots-tag'), null);
  assert.equal((await text(home)).includes('β版'), false);
  assert.match(await text(await fetch(normal.base + '/robots.txt')), /Disallow: \/owner/);
  assert.throws(() => loadConfig({ SITE_BETA: 'yes' }), /on or off/);
});

test('settings: safe defaults and refused values', () => {
  const c = loadConfig({});
  assert.equal(c.operatorName, 'Agentic AI LLC');
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.trustProxy, false);
  assert.ok(c.limits.perIpPerMinute > 0 && c.limits.totalPerDay > 0);
  assert.throws(() => loadConfig({ BASE_URL: 'http://url.jp.ai' }), /https/);
  assert.throws(() => loadConfig({ LIMIT_PER_IP_PER_MINUTE: '0' }));
  assert.throws(() => loadConfig({ LIMIT_PER_IP_PER_MINUTE: 'lots' }));
  assert.doesNotThrow(() => loadConfig({ BASE_URL: 'https://url.jp.ai' }));
});

test('the site version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(SITE_VERSION, pkg.version);
});

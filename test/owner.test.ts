// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { closeAgents, WELL_KNOWN_PATH } from 'qa-jp-ai-scanner';
import { loadConfig } from '../src/config';
import { cookieNames } from '../src/http/cookies';
import { type Assessment, buildLedger, proofCovers, recordFactory, type UrlInspection } from 'qa-jp-ai-scanner';
import { cookieOf, inspected, ownerAssessment, startApp, type TestApp } from './helpers';

const apps: TestApp[] = [];
const closers: Array<() => Promise<void>> = [];
after(async () => {
  for (const a of apps) await a.close();
  for (const c of closers) await c();
  await closeAgents();
});
const start = async (...args: Parameters<typeof startApp>) => {
  const a = await startApp(...args);
  apps.push(a);
  return a;
};

const TARGET = 'https://example.jp/';
const text = (r: Response) => r.text();
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Run the email method to the end; returns the owner's session cookie. */
async function signInByEmail(app: TestApp, address = 'info@example.jp', target = TARGET): Promise<string> {
  const sent = await app.form('/owner/email', { u: target, email: address });
  assert.equal(sent.status, 200, await sent.clone().text());
  const link = /https?:\/\/\S+\/owner\/login\?t=([A-Za-z0-9_-]+)/.exec(app.mails.at(-1)!.text)!;
  const login = await app.form('/owner/login', { t: link[1]! });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('location'), '/owner/session');
  return cookieOf(login);
}

async function runOwnerCheck(app: TestApp, cookie: string): Promise<string> {
  const r = await app.form('/owner/check', {}, cookie);
  assert.equal(r.status, 303);
  return r.headers.get('location')!;
}

test('the public result leads the owner to verification', async () => {
  const app = await start();
  const r = await app.post({ url: 'example.jp' });
  const body = await text(await app.get(r.headers.get('location')!));
  assert.match(body, /href="\/owner\?u=https%3A%2F%2Fexample\.jp%2F"/);
});

test('the start page offers email, file and DNS, and gives a stable code', async () => {
  const app = await start();
  const r = await app.get('/owner?u=' + encodeURIComponent(TARGET));
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie')!;
  assert.match(cookie, /^vid=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; HttpOnly; SameSite=Lax$/);
  const body = await text(r);
  assert.match(body, /action="\/owner\/email"/);
  assert.match(body, /\/\.well-known\/qa-jp-ai\.txt/);
  assert.match(body, /_qa-jp-ai\.example\.jp/);
  const code = /qa-jp-ai-verify-[A-Za-z0-9_-]{32}/.exec(body)![0];

  // The same browser sees the same code again; another browser another one.
  const again = await text(await app.get('/owner?u=' + encodeURIComponent(TARGET), cookieOf(r)));
  assert.ok(again.includes(code));
  const other = await text(await app.get('/owner?u=' + encodeURIComponent(TARGET)));
  assert.equal(other.includes(code), false);

  assert.equal((await app.get('/owner?u=ftp%3A%2F%2Fx')).status, 400);
  assert.equal((await app.get('/owner')).status, 400);
});

test('email: link, confirm button, session, check, detailed result', async () => {
  const app = await start();
  const cookie = await signInByEmail(app);
  assert.match(cookie, /^sid=[A-Za-z0-9_-]{43}$/);
  const mail = app.mails[0]!;
  assert.equal(mail.to, 'info@example.jp');
  assert.match(mail.subject, /example\.jp の所有者確認/);
  assert.match(mail.text, /15 分間、1 回だけ/);

  const session = await text(await app.get('/owner/session', cookie));
  assert.match(session, /所有者として確認できました/);
  assert.match(session, /メールアドレス（info@example\.jp）/);

  const location = await runOwnerCheck(app, cookie);
  assert.match(location, /^\/owner\/r\/[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(app.ownerScans, [{ url: TARGET, activeChecks: true }]);

  const result = await app.get(location, cookie);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
  const body = await text(result);
  assert.match(body, /詳しい検査結果（所有者向け）/);
  assert.match(body, /P0・至急/);
  assert.match(body, /確認をお願いしたい項目/);
  assert.match(body, /検査した範囲（全 15 項目のうち 2 項目）についての評価です/);
  assert.equal(body.includes('<img src=x'), false, 'evidence is escaped');
  // The fake result ran no active check, so the page must not claim one.
  assert.match(body, /実施した検査: 通常のページ表示と同等のアクセスと、DNS に公開されている情報（メールの送信ドメイン認証）の確認のみ/);

  assert.deepEqual(
    app.store.auditLog.map((e) => `${e.action}:${e.outcome}`),
    ['owner_mail:sent', 'owner_verify:verified', 'owner_check:checked', 'owner_view:shown'],
  );
  assert.equal(app.store.auditLog[1]!.email, 'info@example.jp');
});

test('opening the link signs nobody in; the button does, once', async () => {
  const app = await start();
  await app.form('/owner/email', { u: TARGET, email: 'info@example.jp' });
  const secret = /t=([A-Za-z0-9_-]+)/.exec(app.mails[0]!.text)![1]!;

  // A mail scanner may open the link any number of times.
  for (let i = 0; i < 3; i++) {
    const page = await app.get(`/owner/login?t=${secret}`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('set-cookie'), null);
  }
  assert.equal((await app.form('/owner/login', { t: secret })).status, 303);
  assert.equal((await app.form('/owner/login', { t: secret })).status, 410, 'used up');
  assert.equal((await app.get(`/owner/login?t=${secret}`)).status, 410);
});

test('a link expires', async () => {
  const app = await start({ env: { LOGIN_LINK_MINUTES: '15' } });
  await app.form('/owner/email', { u: TARGET, email: 'info@example.jp' });
  const secret = /t=([A-Za-z0-9_-]+)/.exec(app.mails[0]!.text)![1]!;
  app.clock.now = new Date(app.clock.now.getTime() + 15 * 60_000 + 1);
  assert.equal((await app.form('/owner/login', { t: secret })).status, 410);
});

test('addresses that cannot speak for the site get the engine\'s reason, and no mail', async () => {
  const app = await start();
  const cases: Array<[string, string, RegExp]> = [
    ['someone@gmail.com', TARGET, /フリーメール/],
    ['info@other.jp', TARGET, /ドメインが、検査対象のサイトのドメインと一致しません/],
    ['info@mail.example.jp', TARGET, /サイトのドメインそのもの/],
    ['info@myapp.vercel.app', 'https://myapp.vercel.app/', /ホスティングサービスの共用ドメイン/],
    ['student@u-tokyo.ac.jp', 'https://u-tokyo.ac.jp/', /管理用アドレス/],
    ['not an address', TARGET, /形式が正しくありません/],
  ];
  for (const [address, target, reason] of cases) {
    const r = await app.form('/owner/email', { u: target, email: address });
    assert.equal(r.status, 400, address);
    assert.match(await text(r), reason, address);
  }
  assert.equal(app.mails.length, 0);
});

test('sign-in mail is limited per address, per site and per day', async () => {
  const app = await start({ env: { MAIL_PER_ADDRESS_PER_DAY: '2', MAIL_PER_SITE_PER_DAY: '3', MAIL_TOTAL_PER_DAY: '50' } });
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await app.form('/owner/email', { u: TARGET, email: 'info@example.jp' })).status);
  statuses.push((await app.form('/owner/email', { u: TARGET, email: 'admin@example.jp' })).status);
  statuses.push((await app.form('/owner/email', { u: TARGET, email: 'webmaster@example.jp' })).status);
  // Address limit 2, then the site limit 3 counts every attempt for the site.
  assert.deepEqual(statuses, [200, 200, 429, 429, 429]);
  assert.equal(app.mails.length, 2);
});

test('without a mail service, the email method is not offered', async () => {
  const app = await start({ noMailer: true });
  const body = await text(await app.get('/owner?u=' + encodeURIComponent(TARGET)));
  assert.equal(body.includes('action="/owner/email"'), false);
  assert.match(body, /メールによる確認は利用できません/);
  assert.equal((await app.form('/owner/email', { u: TARGET, email: 'info@example.jp' })).status, 503);
});

test('a detailed result is shown only to the session that ran it, and only while verified', async () => {
  const app = await start();
  const owner = await signInByEmail(app);
  const location = await runOwnerCheck(app, owner);

  // Another verified owner, of another site.
  const other = await signInByEmail(app, 'info@other.jp', 'https://other.jp/');
  assert.equal((await app.get(location, other)).status, 404);
  assert.equal((await app.get(location)).status, 404, 'no cookie');
  assert.equal((await app.get(location, 'sid=' + 'A'.repeat(43))).status, 404, 'a made-up session');
  assert.equal((await app.get(location, owner)).status, 200);

  // A tampered sealed proof in the database opens nothing.
  const [hash, session] = [...app.store.sessions.entries()][0]!;
  app.store.sessions.set(hash, { ...session, sealed: session.sealed.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) });
  assert.equal((await app.get(location, owner)).status, 404);
  app.store.sessions.set(hash, session);

  // 24 hours later the proof has expired, and with it the result.
  app.clock.now = new Date(app.clock.now.getTime() + 24 * 3_600_000 + 1000);
  assert.equal((await app.get(location, owner)).status, 404);
  assert.equal((await app.get('/owner/session', owner)).status, 401);
});

test('two people verified for the same site do not see each other\'s results', async () => {
  const app = await start();
  const first = await signInByEmail(app, 'info@example.jp');
  const second = await signInByEmail(app, 'admin@example.jp');
  const location = await runOwnerCheck(app, first);
  assert.equal((await app.get(location, first)).status, 200);
  assert.equal((await app.get(location, second)).status, 404);
});

test('a malformed owner result id never reaches the database', async () => {
  const app = await start();
  const owner = await signInByEmail(app);
  const asked: string[] = [];
  const get = app.store.getOwnerResult.bind(app.store);
  app.store.getOwnerResult = async (id, now) => {
    asked.push(id);
    return get(id, now);
  };
  for (const id of ['x', '%7B%22%24ne%22%3A1%7D', 'a'.repeat(23)]) {
    assert.equal((await app.get(`/owner/r/${id}`, owner)).status, 404, id);
  }
  assert.deepEqual(asked, []);
});

test('signing out ends the session and hides the result', async () => {
  const app = await start();
  const owner = await signInByEmail(app);
  const location = await runOwnerCheck(app, owner);
  const out = await app.form('/owner/sign-out', {}, owner);
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie')!, /^sid=; Path=\/; Max-Age=0/);
  assert.equal((await app.get(location, owner)).status, 404);
  assert.equal((await app.get('/owner/session', owner)).status, 401);
  assert.equal((await app.form('/owner/check', {}, owner)).status, 401);
});

test('every owner form refuses requests from other sites', async () => {
  const app = await start();
  const owner = await signInByEmail(app);
  const evil = { Origin: 'https://evil.example' };
  for (const [path, body] of [
    ['/owner/email', { u: TARGET, email: 'info@example.jp' }],
    ['/owner/login', { t: 'x' }],
    ['/owner/file', { u: TARGET }],
    ['/owner/dns', { u: TARGET }],
    ['/owner/check', {}],
    ['/owner/sign-out', {}],
  ] as const) {
    assert.equal((await app.form(path, body, owner, evil)).status, 403, path);
  }
  assert.equal(app.ownerScans.length, 0);
  assert.equal((await app.get('/owner/session', owner)).status, 200, 'still signed in');
});

test('file method: the engine fetches the code from the site itself', async () => {
  const app = await start();
  let served = '';
  const fixture = createServer((req, res) => {
    if (req.url === WELL_KNOWN_PATH && served) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(served);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r));
  closers.push(() => new Promise((r) => fixture.close(() => r())));
  const target = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}/`;

  const startPage = await app.get('/owner?u=' + encodeURIComponent(target));
  const vid = cookieOf(startPage);
  const code = /qa-jp-ai-verify-[A-Za-z0-9_-]{32}/.exec(await text(startPage))![0];

  const missing = await app.form('/owner/file', { u: target }, vid);
  assert.equal(missing.status, 422);
  assert.match(unescape(await text(missing)), /指定した 1 行が見つかりませんでした/);

  served = 'qa-jp-ai-verify-' + 'x'.repeat(32);
  assert.equal((await app.form('/owner/file', { u: target }, vid)).status, 422, 'a wrong code');

  served = `${code}\n`;
  assert.equal((await app.form('/owner/file', { u: target })).status, 400, 'without the browser\'s id');
  const ok = await app.form('/owner/file', { u: target }, vid);
  assert.equal(ok.status, 303);
  const session = cookieOf(ok);
  assert.match(await text(await app.get('/owner/session', session)), /確認ファイル/);
  assert.deepEqual(
    app.store.auditLog.filter((e) => e.action === 'owner_verify').map((e) => [e.method, e.outcome]),
    [['file', 'not_verified'], ['file', 'not_verified'], ['file', 'verified']],
  );
});

test('DNS method', async () => {
  const app = await start();
  const startPage = await app.get('/owner?u=' + encodeURIComponent(TARGET));
  const vid = cookieOf(startPage);
  const body = unescape(await text(startPage));
  const value = /名前: _qa-jp-ai\.example\.jp\n\s+値: (qa-jp-ai-verify-[A-Za-z0-9_-]{32})/.exec(body)![1]!;

  assert.equal((await app.form('/owner/dns', { u: TARGET }, vid)).status, 422);
  app.dns.set('_qa-jp-ai.example.jp', [['unrelated'], [value]]);
  const ok = await app.form('/owner/dns', { u: TARGET }, vid);
  assert.equal(ok.status, 303);
  assert.match(await text(await app.get('/owner/session', cookieOf(ok))), /DNS レコード/);
});

test('file and DNS attempts are limited per address', async () => {
  const app = await start({ env: { VERIFY_PER_IP_PER_MINUTE: '2' } });
  const vid = cookieOf(await app.get('/owner?u=' + encodeURIComponent(TARGET)));
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await app.form('/owner/dns', { u: TARGET }, vid)).status);
  assert.deepEqual(statuses, [422, 422, 429]);
});

test('owner checks are limited per session; the switch turns active checks off', async () => {
  const app = await start({ env: { OWNER_CHECKS_PER_HOUR: '2', ACTIVE_CHECKS: 'off' } });
  const owner = await signInByEmail(app);
  assert.match(await text(await app.get('/owner/session', owner)), /運営者の設定により/);
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await app.form('/owner/check', {}, owner)).status);
  assert.deepEqual(statuses, [303, 303, 429]);
  assert.deepEqual(app.ownerScans.map((s) => s.activeChecks), [false, false]);
});

test('when an active check ran, the result says so', async () => {
  const app = await start({
    owner: {
      inspectOwner: async (url, proof) => {
        const host = new URL(url).hostname;
        assert.ok(proofCovers(proof, host, app.clock.now.getTime()));
        const a = ownerAssessment(host);
        a.coverage = buildLedger('url', [
          { checker: 'files', mode: 'active', reports: [{ ruleId: 'R11', status: 'checked' }] },
        ]);
        return inspected(a);
      },
    },
  });
  const owner = await signInByEmail(app);
  const body = await text(await app.get(await runOwnerCheck(app, owner), owner));
  assert.match(body, /所有者確認後にのみ行う検査/);
});

// ---------------------------------------------------------------- fixing, and confirming the fix

const keyRecord = () =>
  recordFactory('url.secrets', 'url', 'passive').confirmed({
    ruleId: 'R02',
    code: 'secret.openai',
    key: 'k1',
    location: 'https://example.jp/assets/app.js (offset 10)',
    evidence: '先頭「sk-pro」で始まる 48 文字の文字列 <img src=x onerror=alert(1)>',
    severity: 'P0',
  });

/** An owner result with or without the key, as the engine's own checker would report it. */
function siteCheck(withKey: boolean, startedAt: string): Assessment {
  const a = ownerAssessment('example.jp', startedAt);
  a.records = withKey ? [keyRecord()] : [];
  a.coverage = buildLedger('url', [
    { checker: 'url.secrets', mode: 'passive', reports: [{ ruleId: 'R02', status: 'partial', note: 'html_referenced_scripts_only' }] },
  ]);
  return a;
}

/** An app whose owner checks return the given results in turn. */
async function startWithChecks(checks: UrlInspection[]) {
  let n = 0;
  return start({ owner: { inspectOwner: async () => checks[Math.min(n++, checks.length - 1)]! } });
}

const T1 = '2026-11-20T03:00:00.000Z';
const T2 = '2026-11-20T04:00:00.000Z';
const T3 = '2026-11-20T05:00:00.000Z';

test('the first result offers a fix request for an AI coding tool, and no comparison', async () => {
  const app = await startWithChecks([inspected(siteCheck(true, T1))]);
  const owner = await signInByEmail(app);
  const body = await text(await app.get(await runOwnerCheck(app, owner), owner));

  assert.match(body, /<h2>AI に修正を依頼する<\/h2>/);
  // The engine's text for a site, with the problem's ID, inside one block that can be copied whole.
  const request = unescape(/<pre class="copy fixrequest"[^>]*>([\s\S]*?)<\/pre>/.exec(body)![1]!);
  assert.match(request, /^# QA\.JP\.AI 修正依頼/);
  assert.match(request, /URL 検査（公開中のサイトを外部から見る検査）/);
  assert.ok(request.includes(keyRecord().fingerprint));
  assert.match(request, /再検査は利用者が行います/);
  assert.equal(request.includes('npx'), false);
  // Text from the checked site stays text.
  assert.equal(body.includes('<img src=x'), false);
  // The owner is told how long a fix can be confirmed.
  assert.match(body, /修正の確認は、所有者の確認が有効な間（2026\/11\/21 12:00（日本時間） まで）/);

  assert.equal(body.includes('<h2>前回からの変化</h2>'), false);
  assert.equal([...app.store.ownerResults.values()][0]!.comparison, undefined);
});

test('checking again shows what the engine confirms as fixed', async () => {
  const app = await startWithChecks([inspected(siteCheck(true, T1)), inspected(siteCheck(false, T2))]);
  const owner = await signInByEmail(app);
  const first = await runOwnerCheck(app, owner);
  const body = await text(await app.get(await runOwnerCheck(app, owner), owner));

  assert.match(body, /<h2>前回からの変化<\/h2>/);
  assert.match(body, /最初の検査: 2026\/11\/20 12:00（日本時間）。/);
  assert.match(body, /<h3>修正を確認しました（1 件）<\/h3>/);
  assert.match(body, /OpenAI の API キーがフロントエンドに含まれています（R02）/);
  // What the tool cannot see is said next to the fixed item.
  assert.match(body, /キーの無効化・再発行が済んだかどうかは、ツールでは確認できません/);
  assert.match(body, /<h3>見つからなくなりましたが、修正とは確認できません（0 件）<\/h3>/);
  assert.match(body, /安全性を保証するものではありません/);
  // Nothing left to fix: no request to hand to an AI.
  assert.equal(body.includes('AI に修正を依頼する'), false);
  assert.equal(body.includes('<img src=x'), false);

  // The first result is unchanged and still has no comparison.
  assert.equal((await text(await app.get(first, owner))).includes('<h2>前回からの変化</h2>'), false);
});

test('a key that is gone because a script was not read is not shown as fixed', async () => {
  const app = await startWithChecks([inspected(siteCheck(true, T1)), inspected(siteCheck(false, T2), false)]);
  const owner = await signInByEmail(app);
  await runOwnerCheck(app, owner);
  const body = await text(await app.get(await runOwnerCheck(app, owner), owner));

  assert.match(body, /<h3>修正を確認しました（0 件）<\/h3>/);
  assert.match(body, /<h3>見つからなくなりましたが、修正とは確認できません（1 件）<\/h3>/);
  assert.match(body, /問題のあったスクリプトも読んでいません/);
});

test('every later check is compared with the first one of the session', async () => {
  const app = await startWithChecks([
    inspected(siteCheck(true, T1)),
    inspected(siteCheck(false, T2)),
    inspected(siteCheck(false, T3)),
  ]);
  const owner = await signInByEmail(app);
  await runOwnerCheck(app, owner);
  app.clock.now = new Date(T2);
  await runOwnerCheck(app, owner);
  app.clock.now = new Date(T3);
  const body = await text(await app.get(await runOwnerCheck(app, owner), owner));
  // Compared with the second check, nothing would have changed.
  assert.match(body, /<h3>修正を確認しました（1 件）<\/h3>/);
  assert.match(body, /最初の検査: 2026\/11\/20 12:00（日本時間）。/);
});

test('a comparison never crosses sessions', async () => {
  const app = await startWithChecks([inspected(siteCheck(true, T1)), inspected(siteCheck(false, T2))]);
  const first = await signInByEmail(app, 'info@example.jp');
  await runOwnerCheck(app, first);
  // Another verified person, same site: their first check has nothing to be compared with.
  const second = await signInByEmail(app, 'admin@example.jp');
  const body = await text(await app.get(await runOwnerCheck(app, second), second));
  assert.equal(body.includes('<h2>前回からの変化</h2>'), false);
});

test('a result for another host of the site is shown without a comparison', async () => {
  const moved = siteCheck(false, T2);
  moved.target = { layer: 'url', host: 'www.example.jp' };
  const app = await startWithChecks([inspected(siteCheck(true, T1)), inspected(moved)]);
  const owner = await signInByEmail(app);
  await runOwnerCheck(app, owner);
  const location = await runOwnerCheck(app, owner);
  assert.equal([...app.store.ownerResults.values()].at(-1)!.comparison, undefined);
  assert.equal(app.errors.length, 0);
  // The session's proof is for example.jp only (email method), so this result is not shown at all.
  assert.equal((await app.get(location, owner)).status, 404);
});

test('owner paths accept only their methods', async () => {
  const app = await start();
  assert.equal((await app.get('/owner/check')).status, 405);
  assert.equal((await app.get('/owner/email')).status, 405);
  assert.equal((await fetch(app.base + '/owner', { method: 'POST' })).status, 405);
  assert.equal((await app.get('/owner/nope')).status, 404);
});

test('settings: the session secret, the switch, and secure cookie names', () => {
  assert.throws(() => loadConfig({ SESSION_SECRET: 'short' }), /at least 32/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', BASE_URL: 'https://url.jp.ai' }), /SESSION_SECRET/);
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', BASE_URL: 'https://url.jp.ai', SESSION_SECRET: 's'.repeat(32) }),
    /MONGODB_URI/,
    'production keeps nothing in memory only',
  );
  assert.throws(() => loadConfig({ ACTIVE_CHECKS: 'maybe' }), /on or off/);
  assert.equal(loadConfig({}).activeChecks, true);
  assert.equal(loadConfig({}).sessionSecret.length >= 32, true, 'a development secret is made up');
  assert.deepEqual(cookieNames(new URL('https://url.jp.ai')), { session: '__Host-sid', verifier: '__Host-vid', secure: true });
});

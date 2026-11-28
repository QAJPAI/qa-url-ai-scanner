// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { ja, validateAssessment } from 'qa-jp-ai-scanner';
import { SAMPLE_HOST, sampleCheck } from '../src/pages/sample';
import { startApp, type TestApp } from './helpers';

const apps: TestApp[] = [];
after(async () => {
  for (const a of apps) await a.close();
});
const start = async (...args: Parameters<typeof startApp>) => {
  const a = await startApp(...args);
  apps.push(a);
  return a;
};
const page = async (app: TestApp, path: string) => {
  const r = await app.get(path);
  return { r, body: await r.text() };
};
const count = (body: string, needle: string) => body.split(needle).length - 1;

test('the home page says who it is for, what sets it apart, and answers the usual questions', async () => {
  const app = await start();
  const { r, body } = await page(app, '/');
  assert.equal(r.status, 200);
  assert.match(body, /こんな方のためのチェックです/);
  assert.match(body, /AI に頼んで、Web サイトやアプリを作ってもらった/);
  assert.equal(count(body, '<li><strong>'), 4, 'four points');
  for (const point of ['登録は要りません', 'その場で結果が出ます', '追跡しません', '直して、確かめるまで無料']) {
    assert.ok(body.includes(point), point);
  }
  assert.match(body, /よくある質問/);
  assert.equal(count(body, '<details>'), 9, 'nine questions');
  // Questions open without script.
  assert.equal(/<script/i.test(body), false);
});

test('what the home page promises is what the settings say', async () => {
  const app = await start({
    env: {
      SCAN_BUDGET_SECONDS: '45',
      REUSE_RESULT_MINUTES: '7',
      RESULT_TTL_DAYS: '12',
      AUDIT_TTL_DAYS: '21',
      OPERATOR_NAME: 'Example Operator',
    },
  });
  const { body } = await page(app, '/');
  assert.match(body, /チェックは通常 45 秒以内に終わり/);
  assert.match(body, /7 分以内は前回の結果を表示し、サイトを読み直しません/);
  assert.match(body, /URL とその評価は 12 日間、IP アドレスと日時の記録は 21 日間保存/);
  assert.match(body, /Example Operator が運営しています/);
  assert.match(body, /\.env など）が公開されていないかを、数回のアクセスで確かめます/);
});

test('the home page does not describe what is switched off', async () => {
  const app = await start({ env: { REUSE_RESULT_MINUTES: '0', ACTIVE_CHECKS: 'off' } });
  const { body } = await page(app, '/');
  const faq = body.slice(body.indexOf('<section class="faq">'));
  assert.equal(faq.includes('前回の結果を表示し'), false, 'no reuse, so no promise of it');
  assert.equal(faq.includes('数回のアクセスで確かめます'), false, 'active checks are off');
});

test('the home page shows the most serious problem of the sample, in the engine’s words, and links to the rest', async () => {
  const app = await start();
  const { body } = await page(app, '/');
  const teaser = body.slice(body.indexOf('<section class="box sample">'), body.indexOf('このチェックで行うこと'));
  assert.match(teaser, /架空のサイト（example\.jp）/);
  assert.ok(teaser.includes(ja.findingTextFor('url', 'secret.supabase_service_role')!.title));
  assert.match(teaser, /P0・至急/);
  assert.match(teaser, /修正を確認しました（2 件）/);
  assert.match(teaser, /<a class="button secondary" href="\/sample">/);
});

test('the sample page is marked as a sample, offers no action, and runs no check', async () => {
  const app = await start();
  const { r, body } = await page(app, '/sample');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy')!, /default-src 'none'/);
  assert.equal(/<script/i.test(body), false);
  // Said at the top and again at the end: it is not a real site's result.
  assert.equal(count(body, '実在するサイトの検査結果ではありません'), 2);
  assert.match(body, /example\.jp（架空のサイト）/);
  // Nothing to submit: a sample must not look like a session someone is signed in to.
  assert.equal(/<form/i.test(body), false);
  assert.equal(/<button/i.test(body), false);
  assert.equal(body.includes('確認の方法'), false);
  // It may be found by search engines: it is not anyone's result.
  assert.equal(r.headers.get('x-robots-tag'), null);
  assert.equal(body.includes('noindex'), false);

  // Every address shown belongs to the reserved sample host.
  const shown = [...body.matchAll(/https?:\/\/[^\s<"'）)]+/g)].map((m) => new URL(m[0]).hostname);
  const foreign = shown.filter((h) => h !== SAMPLE_HOST && h !== 'github.com');
  assert.deepEqual(foreign, []);

  assert.deepEqual(app.scans, []);
  assert.deepEqual(app.ownerScans, []);
  assert.deepEqual(app.store.auditLog, []);
});

test('the sample page walks through the first result, the fix request and the re-check', async () => {
  const app = await start();
  const { body } = await page(app, '/sample');
  const step = (n: number) => body.indexOf(`見本 ${n}：`);
  assert.ok(step(1) > 0 && step(1) < step(2) && step(2) < step(3));

  const first = body.slice(step(1), step(2));
  assert.match(first, /<span class="letter">E<\/span>/);
  assert.match(first, /P0（至急）1 件 \/ P1（重大）0 件 \/ P2（改善推奨）2 件/);
  assert.match(first, /https:\/\/example\.jp\/assets\/app\.js \(offset 341\)/);
  assert.ok(first.includes(ja.needsValidationText['baas.supabase_rls_unverified']!.title));
  // Rules that were not examined are listed as such, never as passed.
  assert.equal(count(first, '未検査'), 11);

  const request = body.slice(step(2), step(3));
  assert.match(request, /# QA\.JP\.AI 修正依頼（AI コーディングツールへ）/);
  assert.match(request, /対象: example\.jp/);

  const recheck = body.slice(step(3));
  assert.match(recheck, /<span class="letter">B<\/span>/);
  assert.match(recheck, /修正を確認しました（2 件）/);
  assert.match(recheck, /まだ修正されていません（1 件）/);
  // The first check is dated before the re-check, both from the server's clock.
  assert.match(recheck, /最初の検査: 2026\/11\/20 11:20（日本時間）/);
});

test('in beta the sample page is not indexed either', async () => {
  const app = await start({ env: { SITE_BETA: 'on' } });
  const { r, body } = await page(app, '/sample');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(body, /<meta name="robots" content="noindex, nofollow">/);
});

test('the sample is a result the engine accepts, worded and judged by the engine', () => {
  const now = new Date('2026-11-20T03:00:00.000Z');
  const { before, after: recheck, comparison } = sampleCheck(now);

  // Both are consistent assessments under the installed engine's own validator.
  assert.deepEqual(validateAssessment(before), []);
  assert.deepEqual(validateAssessment(recheck), []);
  assert.equal(before.startedAt, '2026-11-20T02:20:00.000Z');
  assert.equal(recheck.startedAt, now.toISOString());

  // Every record has the engine's Japanese text: a renamed code would show as a raw code.
  for (const r of [...before.records, ...recheck.records]) {
    if (r.verdict === 'confirmed') assert.ok(ja.findingTextFor(r.layer, r.code), r.code);
    if (r.verdict === 'needs_validation') assert.ok(ja.needsValidationText[r.code], r.code);
    assert.ok(r.location.startsWith(`https://${SAMPLE_HOST}/`), r.location);
  }

  // What counts as fixed is the engine's decision, not written into the sample.
  assert.equal(comparison.toolChanged, false);
  assert.deepEqual(comparison.fixed.map((r) => r.code).sort(), ['header.csp_missing', 'secret.supabase_service_role']);
  assert.deepEqual(comparison.stillPresent.map((r) => r.code), ['header.clickjacking']);
  assert.deepEqual(comparison.unverified, []);
  assert.deepEqual(comparison.newConfirmed, []);
  assert.deepEqual(comparison.questionsOpen.map((r) => r.code), ['baas.supabase_rls_unverified']);
});

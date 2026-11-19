// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeTarget, type PublicSummary, scanErrorKind, scanErrorMessage } from 'qa-jp-ai-scanner';
import type { Config } from './config';
import { SECURITY_HEADERS, redirect, send } from './http/headers';
import { BodyTooLargeError, clientIp, isSameOrigin, readForm } from './http/request';
import { BusyError, ConcurrencyLimiter } from './limiter';
import { aboutPage, homePage, messagePage, privacyPage, resultPage, termsPage } from './pages/pages';
import { site } from './pages/text';
import type { AuditOutcome, Store } from './store/types';

/** How a public check is run. The real one is the engine's scanPublic(); tests pass their own. */
export type PublicScan = (url: string, options: { maxDurationMs: number }) => Promise<PublicSummary>;

export interface AppDeps {
  config: Config;
  store: Store;
  scanPublic: PublicScan;
  stylesheet: string;
  favicon: string;
  now?: () => Date;
  newId?: () => string;
  /** Where unexpected errors are reported (server log). Never shown to the visitor. */
  logError?: (message: string, err: unknown) => void;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const RESULT_ID = /^[A-Za-z0-9_-]{22}$/;
const ROBOTS = 'User-agent: *\nDisallow: /r/\n';

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export function createApp(deps: AppDeps): Handler {
  const { config, store, stylesheet, favicon } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomBytes(16).toString('base64url'));
  const logError = deps.logError ?? ((message, err) => console.error(message, err));
  const limiter = new ConcurrencyLimiter(config.limits.maxConcurrent, config.limits.maxQueued);
  const ctx = { config };

  const audit = async (ip: string, outcome: AuditOutcome, target?: string, resultId?: string) => {
    const at = now();
    try {
      await store.audit({
        at,
        ip,
        action: 'public_check',
        target,
        outcome,
        resultId,
        expiresAt: new Date(at.getTime() + config.limits.auditTtlMs),
      });
    } catch (err) {
      // A failed log line must not turn into a failed page, but it must be seen.
      logError('audit write failed', err);
    }
  };

  async function check(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = clientIp(req, config.trustProxy);
    const fail = (status: number, message: string, formValue?: string) =>
      send(res, status, messagePage(ctx, site.errorHeading, message, formValue));

    if (!isSameOrigin(req, config.baseUrl)) {
      await audit(ip, 'refused_origin');
      return fail(403, site.refusedOrigin);
    }

    let form: URLSearchParams;
    try {
      form = await readForm(req);
    } catch (err) {
      if (err instanceof BodyTooLargeError) return fail(413, site.tooLarge);
      throw err;
    }
    const input = form.get('url') ?? '';

    let target: URL;
    try {
      target = normalizeTarget(input);
    } catch {
      await audit(ip, 'invalid_input');
      return fail(400, site.invalidInput, input.slice(0, 2048));
    }
    if (target.username || target.password) {
      await audit(ip, 'invalid_input');
      return fail(400, site.credentialsInUrl);
    }
    const key = target.href;

    // Every attempt counts, reused or not: a flood of requests is limited even
    // when it asks for the same page.
    const at = now();
    const perMinute = await store.hit(`ip:${ip}`, MINUTE, at);
    const perDay = await store.hit(`ipday:${ip}`, DAY, at);
    if (perMinute > config.limits.perIpPerMinute || perDay > config.limits.perIpPerDay) {
      await audit(ip, 'rate_limited', key);
      return fail(429, site.rateLimited);
    }

    // The same page checked a moment ago: show that result, and leave the site alone.
    if (config.limits.reuseResultMs > 0) {
      const recent = await store.recentResult(key, new Date(at.getTime() - config.limits.reuseResultMs), at);
      if (recent) {
        await audit(ip, 'reused', key, recent.id);
        return redirect(res, `/r/${recent.id}`);
      }
    }

    if ((await store.hit('total', DAY, at)) > config.limits.totalPerDay) {
      await audit(ip, 'rate_limited', key);
      return fail(503, site.dailyCapReached);
    }

    let summary: PublicSummary;
    try {
      summary = await limiter.run(() => deps.scanPublic(key, { maxDurationMs: config.limits.scanBudgetMs }));
    } catch (err) {
      if (err instanceof BusyError) {
        await audit(ip, 'busy', key);
        return fail(503, site.busy);
      }
      const kind = scanErrorKind(err);
      if (kind === 'generic') logError('check failed', err);
      await audit(ip, `error:${kind}`, key);
      // One fixed message per kind: nothing about why a guard refused.
      return fail(422, scanErrorMessage(err), input.slice(0, 2048));
    }

    const id = newId();
    const createdAt = now();
    await store.saveResult({
      id,
      target: key,
      summary,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + config.limits.resultTtlMs),
    });
    await audit(ip, 'checked', key, id);
    return redirect(res, `/r/${id}`);
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const method = req.method ?? 'GET';
    const isGet = method === 'GET' || method === 'HEAD';

    if (path === '/check') {
      if (method === 'POST') return check(req, res);
      return send(res, 405, messagePage(ctx, site.errorHeading, site.methodNotAllowed), undefined, { Allow: 'POST' });
    }
    if (!isGet) {
      return send(res, 405, messagePage(ctx, site.errorHeading, site.methodNotAllowed), undefined, {
        Allow: 'GET, HEAD',
      });
    }

    switch (path) {
      case '/':
        return send(res, 200, homePage(ctx));
      case '/about':
        return send(res, 200, aboutPage(ctx));
      case '/terms':
        return send(res, 200, termsPage(ctx));
      case '/privacy':
        return send(res, 200, privacyPage(ctx));
      case '/static/site.css':
        return send(res, 200, stylesheet, 'text/css; charset=utf-8', { 'Cache-Control': 'public, max-age=86400' });
      case '/static/favicon.svg':
        return send(res, 200, favicon, 'image/svg+xml', { 'Cache-Control': 'public, max-age=86400' });
      case '/favicon.ico':
        return redirect(res, '/static/favicon.svg');
      case '/robots.txt':
        return send(res, 200, ROBOTS, 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=86400' });
      case '/healthz':
        return send(res, 200, 'ok\n', 'text/plain; charset=utf-8');
    }

    if (path.startsWith('/r/')) {
      const id = path.slice(3);
      const result = RESULT_ID.test(id) ? await store.getResult(id, now()) : null;
      if (!result) return send(res, 404, messagePage(ctx, site.resultHeading, site.resultNotFound));
      return send(res, 200, resultPage(ctx, result.summary), undefined, { 'X-Robots-Tag': 'noindex, nofollow' });
    }

    return send(res, 404, messagePage(ctx, site.errorHeading, site.notFound));
  }

  // HEAD is answered like GET; Node itself leaves the body out.
  return async (req, res) => {
    try {
      await route(req, res);
    } catch (err) {
      logError('request failed', err);
      if (!res.headersSent) {
        res.writeHead(500, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      }
      res.end(ja500);
    }
  };
}

const ja500 = 'エラーが発生しました。時間をおいて再度お試しください。\n';

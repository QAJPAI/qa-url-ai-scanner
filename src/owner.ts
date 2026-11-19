// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type Assessment,
  dnsRecordName,
  evaluateEmailOwnership,
  issueEmailProofAfterLinkClick,
  ja,
  mintVerificationToken,
  normalizeTarget,
  openProof,
  type OwnershipProof,
  ownershipSubject,
  proofCovers,
  scanErrorKind,
  scanErrorMessage,
  sealProof,
  WELL_KNOWN_PATH,
} from 'qa-jp-ai-scanner';
import type { Config } from './config';
import { clearCookie, cookieNames, hashSecret, newSecret, readCookie, setCookie } from './http/cookies';
import { redirect, send } from './http/headers';
import { BodyTooLargeError, clientIp, isSameOrigin, readForm } from './http/request';
import { BusyError, type ConcurrencyLimiter } from './limiter';
import { type Mailer, signInMail } from './mail';
import { confirmPage, ownerReportPage, ownerStartPage, ownerText as o, sessionPage } from './pages/owner';
import { messagePage } from './pages/pages';
import { site } from './pages/text';
import type { AuditAction, AuditOutcome, OwnerSession, Store } from './store/types';

/** Ways to verify and to run the owner check. The real ones are the engine's; tests pass their own. */
export interface OwnerDeps {
  verifyFile: (origin: string, token: string) => Promise<OwnershipProof | undefined>;
  verifyDns: (host: string, token: string) => Promise<OwnershipProof | undefined>;
  scanOwner: (
    url: string,
    proof: OwnershipProof,
    options: { maxDurationMs: number; activeChecks: boolean },
  ) => Promise<Assessment>;
  /** Missing: email verification is unavailable. */
  mailer?: Mailer;
}

interface Context {
  config: Config;
  store: Store;
  deps: OwnerDeps;
  limiter: ConcurrencyLimiter;
  now: () => Date;
  newId: () => string;
  logError: (message: string, err: unknown) => void;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const VERIFIER_DAYS = 7;
const RESULT_ID = /^[A-Za-z0-9_-]{22}$/;

export function createOwnerRoutes(c: Context) {
  const { config, store } = c;
  const ctx = { config };
  const names = cookieNames(config.baseUrl);
  // File and DNS codes are derived, not stored: a separate key from the one that seals proofs.
  const tokenKey = createHmac('sha256', config.sessionSecret).update('qa-jp-ai/verification-token').digest('base64url');

  const audit = async (
    ip: string,
    action: AuditAction,
    outcome: AuditOutcome,
    extra: { target?: string; method?: 'email' | 'file' | 'dns'; email?: string; resultId?: string } = {},
  ) => {
    const at = c.now();
    try {
      await store.audit({ at, ip, action, outcome, ...extra, expiresAt: new Date(at.getTime() + config.limits.auditTtlMs) });
    } catch (err) {
      c.logError('audit write failed', err);
    }
  };

  const page = (res: ServerResponse, status: number, heading: string, message: string, extra: Record<string, string> = {}) =>
    send(res, status, messagePage(ctx, heading, message), undefined, extra);

  /** The target from a form or query value, normalized as the public check does. */
  function parseTarget(value: string | null): URL | undefined {
    if (!value) return undefined;
    try {
      const url = normalizeTarget(value);
      return url.username || url.password ? undefined : url;
    } catch {
      return undefined;
    }
  }

  async function postForm(req: IncomingMessage, res: ServerResponse): Promise<URLSearchParams | undefined> {
    if (!isSameOrigin(req, config.baseUrl)) {
      page(res, 403, site.errorHeading, site.refusedOrigin);
      return undefined;
    }
    try {
      return await readForm(req);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        page(res, 413, site.errorHeading, site.tooLarge);
        return undefined;
      }
      throw err;
    }
  }

  /** The session behind the cookie, with its proof opened again by the engine. */
  async function currentSession(req: IncomingMessage) {
    const id = readCookie(req, names.session);
    if (!id) return undefined;
    const hash = hashSecret(id);
    const session = await store.getSession(hash, c.now());
    if (!session) return undefined;
    const proof = openProof(session.sealed, config.sessionSecret, c.now().getTime());
    if (!proof) return undefined;
    const host = new URL(session.target).hostname;
    if (!proofCovers(proof, host, c.now().getTime())) return undefined;
    return { hash, session, proof, host };
  }

  /** Start a session for a proof that was just obtained, and send the owner to it. */
  async function startSession(
    res: ServerResponse,
    proof: OwnershipProof,
    target: URL,
    method: OwnerSession['method'],
    email?: string,
  ) {
    const id = newSecret();
    const createdAt = c.now();
    const expiresAt = new Date(proof.expiresAt);
    await store.saveSession({
      hash: hashSecret(id),
      sealed: sealProof(proof, config.sessionSecret),
      target: target.href,
      method,
      email,
      createdAt,
      expiresAt,
    });
    res.setHeader('Set-Cookie', setCookie(names, names.session, id, (expiresAt.getTime() - createdAt.getTime()) / 1000));
    return redirect(res, '/owner/session');
  }

  /** The anonymous id behind file / DNS codes; issued when the start page is first shown. */
  function verifierId(req: IncomingMessage, res: ServerResponse, issue: boolean): string | undefined {
    const existing = readCookie(req, names.verifier);
    if (existing || !issue) return existing;
    const id = newSecret();
    res.setHeader('Set-Cookie', setCookie(names, names.verifier, id, VERIFIER_DAYS * 86_400));
    return id;
  }

  const fileToken = (vid: string, host: string) => mintVerificationToken(tokenKey, vid, host);
  const dnsToken = (vid: string, host: string) => mintVerificationToken(tokenKey, vid, `dns:${ownershipSubject(host)}`);

  // GET /owner?u=<url>
  async function start(req: IncomingMessage, res: ServerResponse) {
    const target = parseTarget(new URL(req.url ?? '/', 'http://x').searchParams.get('u'));
    if (!target) return page(res, 400, site.errorHeading, site.invalidInput);
    const vid = verifierId(req, res, true)!;
    const host = target.hostname;
    const dnsName = dnsRecordName(host);
    return send(
      res,
      200,
      ownerStartPage(ctx, {
        target: target.href,
        host,
        domain: ownershipSubject(host),
        fileToken: fileToken(vid, host),
        fileUrl: new URL(WELL_KNOWN_PATH, target.origin).href,
        dns: dnsName ? { name: dnsName, value: dnsToken(vid, host) } : undefined,
        emailAvailable: Boolean(c.deps.mailer),
        activeChecks: config.activeChecks,
      }),
    );
  }

  // POST /owner/email
  async function email(req: IncomingMessage, res: ServerResponse) {
    const ip = clientIp(req, config.trustProxy);
    const form = await postForm(req, res);
    if (!form) return;
    const target = parseTarget(form.get('u'));
    const address = (form.get('email') ?? '').trim();
    if (!target) return page(res, 400, site.errorHeading, site.invalidInput);
    if (!c.deps.mailer) {
      await audit(ip, 'owner_mail', 'unavailable', { target: target.href, method: 'email' });
      return page(res, 503, o.ineligibleHeading, o.emailUnavailable);
    }

    // The engine decides whether this address can speak for this site at all.
    const decision = evaluateEmailOwnership(address, target.hostname);
    if (decision.status !== 'eligible') {
      await audit(ip, 'owner_mail', 'ineligible', { target: target.href, method: 'email' });
      return page(res, 400, o.ineligibleHeading, ja.ownership.email[decision.reason]);
    }
    const normalized = address.toLowerCase();

    const at = c.now();
    const counts = await Promise.all([
      store.hit(`mail:addr:${normalized}`, DAY, at),
      store.hit(`mail:site:${target.hostname}`, DAY, at),
      store.hit('mail:total', DAY, at),
      store.hit(`mail:ip:${ip}`, DAY, at),
    ]);
    const limits = config.limits;
    if (
      counts[0] > limits.mailPerAddressPerDay ||
      counts[1] > limits.mailPerSitePerDay ||
      counts[2] > limits.mailTotalPerDay ||
      counts[3] > limits.mailPerIpPerDay
    ) {
      await audit(ip, 'owner_mail', 'rate_limited', { target: target.href, method: 'email', email: normalized });
      return page(res, 429, o.ineligibleHeading, o.mailLimit);
    }

    const secret = newSecret();
    await store.saveLoginToken({
      hash: hashSecret(secret),
      email: normalized,
      target: target.href,
      createdAt: at,
      expiresAt: new Date(at.getTime() + limits.loginLinkTtlMs),
    });
    const link = new URL(`/owner/login?t=${secret}`, config.baseUrl).href;
    try {
      await c.deps.mailer.send(
        signInMail({
          to: normalized,
          host: target.hostname,
          link,
          minutes: Math.round(limits.loginLinkTtlMs / MINUTE),
          operatorName: config.operatorName,
          contactEmail: config.contactEmail,
        }),
      );
    } catch (err) {
      c.logError('mail failed', err);
      await audit(ip, 'owner_mail', 'error:mail', { target: target.href, method: 'email', email: normalized });
      return page(res, 502, o.ineligibleHeading, o.mailFailed);
    }
    await audit(ip, 'owner_mail', 'sent', { target: target.href, method: 'email', email: normalized });
    return page(res, 200, o.mailSentHeading, o.mailSent(normalized, Math.round(limits.loginLinkTtlMs / MINUTE)));
  }

  // GET /owner/login?t=  — only shows a button: opening the link alone signs nobody in.
  async function loginPage(req: IncomingMessage, res: ServerResponse) {
    const secret = new URL(req.url ?? '/', 'http://x').searchParams.get('t') ?? '';
    const token = /^[A-Za-z0-9_-]{43}$/.test(secret) ? await store.peekLoginToken(hashSecret(secret), c.now()) : null;
    if (!token) return page(res, 410, o.confirmHeading, o.linkInvalid);
    return send(res, 200, confirmPage(ctx, new URL(token.target).hostname, secret));
  }

  // POST /owner/login
  async function login(req: IncomingMessage, res: ServerResponse) {
    const ip = clientIp(req, config.trustProxy);
    const form = await postForm(req, res);
    if (!form) return;
    const secret = form.get('t') ?? '';
    const token = /^[A-Za-z0-9_-]{43}$/.test(secret) ? await store.takeLoginToken(hashSecret(secret), c.now()) : null;
    if (!token) {
      await audit(ip, 'owner_verify', 'expired', { method: 'email' });
      return page(res, 410, o.confirmHeading, o.linkInvalid);
    }
    const target = new URL(token.target);
    // The engine checks the address against the site again before it issues a proof.
    const proof = issueEmailProofAfterLinkClick(token.email, target.hostname, c.now().getTime());
    if (!proof) {
      await audit(ip, 'owner_verify', 'ineligible', { target: token.target, method: 'email', email: token.email });
      return page(res, 400, o.ineligibleHeading, o.sessionMissing);
    }
    await audit(ip, 'owner_verify', 'verified', { target: token.target, method: 'email', email: token.email });
    return startSession(res, proof, target, 'email', token.email);
  }

  // POST /owner/file and /owner/dns
  async function verify(req: IncomingMessage, res: ServerResponse, method: 'file' | 'dns') {
    const ip = clientIp(req, config.trustProxy);
    const form = await postForm(req, res);
    if (!form) return;
    const target = parseTarget(form.get('u'));
    if (!target) return page(res, 400, site.errorHeading, site.invalidInput);
    const vid = verifierId(req, res, false);
    if (!vid) return page(res, 400, o.notVerifiedHeading, o.noVerifier);

    if ((await store.hit(`verify:ip:${ip}`, MINUTE, c.now())) > config.limits.verifyPerIpPerMinute) {
      await audit(ip, 'owner_verify', 'rate_limited', { target: target.href, method });
      return page(res, 429, o.notVerifiedHeading, o.verifyLimit);
    }

    const host = target.hostname;
    let proof: OwnershipProof | undefined;
    try {
      proof =
        method === 'file'
          ? await c.deps.verifyFile(target.origin, fileToken(vid, host))
          : await c.deps.verifyDns(host, dnsToken(vid, host));
    } catch (err) {
      c.logError('verification failed', err);
      proof = undefined;
    }
    if (!proof || !proofCovers(proof, host, c.now().getTime())) {
      await audit(ip, 'owner_verify', 'not_verified', { target: target.href, method });
      const message =
        method === 'file'
          ? o.fileNotFound(new URL(WELL_KNOWN_PATH, target.origin).href)
          : o.dnsNotFound(dnsRecordName(host) ?? host);
      return send(res, 422, messagePage(ctx, o.notVerifiedHeading, message), undefined);
    }
    await audit(ip, 'owner_verify', 'verified', { target: target.href, method });
    return startSession(res, proof, target, method);
  }

  // GET /owner/session
  async function sessionView(req: IncomingMessage, res: ServerResponse) {
    const current = await currentSession(req);
    if (!current) return page(res, 401, o.confirmHeading, o.sessionMissing);
    return send(res, 200, sessionPage(ctx, current.session, current.host, config.activeChecks));
  }

  // POST /owner/check
  async function check(req: IncomingMessage, res: ServerResponse) {
    const ip = clientIp(req, config.trustProxy);
    const form = await postForm(req, res);
    if (!form) return;
    const current = await currentSession(req);
    if (!current) return page(res, 401, o.confirmHeading, o.sessionMissing);
    const { session, proof, hash } = current;

    if ((await store.hit(`owner:check:${hash}`, HOUR, c.now())) > config.limits.ownerChecksPerHour) {
      await audit(ip, 'owner_check', 'rate_limited', { target: session.target, method: session.method });
      return page(res, 429, site.errorHeading, o.checkLimit);
    }

    let assessment: Assessment;
    try {
      assessment = await c.limiter.run(() =>
        c.deps.scanOwner(session.target, proof, {
          maxDurationMs: config.limits.scanBudgetMs,
          activeChecks: config.activeChecks,
        }),
      );
    } catch (err) {
      if (err instanceof BusyError) {
        await audit(ip, 'owner_check', 'busy', { target: session.target, method: session.method });
        return page(res, 503, site.errorHeading, site.busy);
      }
      const kind = scanErrorKind(err);
      if (kind === 'generic') c.logError('owner check failed', err);
      await audit(ip, 'owner_check', `error:${kind}`, { target: session.target, method: session.method });
      return page(res, 422, site.errorHeading, scanErrorMessage(err));
    }

    const id = c.newId();
    await store.saveOwnerResult({
      id,
      sessionHash: hash,
      assessment,
      createdAt: c.now(),
      // Owner details live no longer than the verification that allowed them.
      expiresAt: session.expiresAt,
    });
    await audit(ip, 'owner_check', 'checked', {
      target: session.target,
      method: session.method,
      email: session.email,
      resultId: id,
    });
    return redirect(res, `/owner/r/${id}`);
  }

  // GET /owner/r/<id> — only for the session that ran it, while its proof still covers the site.
  async function result(req: IncomingMessage, res: ServerResponse, id: string) {
    const ip = clientIp(req, config.trustProxy);
    const current = await currentSession(req);
    const stored = current && RESULT_ID.test(id) ? await store.getOwnerResult(id, c.now()) : null;
    const assessment = stored?.assessment;
    const allowed =
      current &&
      stored &&
      assessment &&
      stored.sessionHash === current.hash &&
      assessment.tier === 'owner' &&
      assessment.target.layer === 'url' &&
      proofCovers(current.proof, assessment.target.host, c.now().getTime());
    // Not found, someone else's, or no longer verified: the same answer.
    if (!allowed) return page(res, 404, site.resultHeading, site.resultNotFound, { 'X-Robots-Tag': 'noindex, nofollow' });
    await audit(ip, 'owner_view', 'shown', { target: current.session.target, method: current.session.method, resultId: id });
    return send(res, 200, ownerReportPage(ctx, assessment, current.session), undefined, {
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }

  // POST /owner/sign-out
  async function signOut(req: IncomingMessage, res: ServerResponse) {
    const ip = clientIp(req, config.trustProxy);
    const form = await postForm(req, res);
    if (!form) return;
    const id = readCookie(req, names.session);
    if (id) await store.deleteSession(hashSecret(id));
    await audit(ip, 'owner_sign_out', 'signed_out');
    return page(res, 200, o.signedOutHeading, o.signedOut, { 'Set-Cookie': clearCookie(names, names.session) });
  }

  /** Returns true when the path belongs to the owner area (handled, or refused for its method). */
  return async function route(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    const method = req.method ?? 'GET';
    const get = method === 'GET' || method === 'HEAD';
    const post = method === 'POST';
    const only = (allowed: 'GET' | 'POST', run: () => Promise<void>) => {
      if ((allowed === 'GET' && get) || (allowed === 'POST' && post)) return run().then(() => true);
      send(res, 405, messagePage(ctx, site.errorHeading, site.methodNotAllowed), undefined, {
        Allow: allowed === 'GET' ? 'GET, HEAD' : 'POST',
      });
      return Promise.resolve(true);
    };
    switch (path) {
      case '/owner':
        return only('GET', () => start(req, res));
      case '/owner/email':
        return only('POST', () => email(req, res));
      case '/owner/login':
        return get ? loginPage(req, res).then(() => true) : only('POST', () => login(req, res));
      case '/owner/file':
        return only('POST', () => verify(req, res, 'file'));
      case '/owner/dns':
        return only('POST', () => verify(req, res, 'dns'));
      case '/owner/session':
        return only('GET', () => sessionView(req, res));
      case '/owner/check':
        return only('POST', () => check(req, res));
      case '/owner/sign-out':
        return only('POST', () => signOut(req, res));
    }
    if (path.startsWith('/owner/r/')) return only('GET', () => result(req, res, path.slice('/owner/r/'.length)));
    return false;
  };
}

export const randomId = () => randomBytes(16).toString('base64url');

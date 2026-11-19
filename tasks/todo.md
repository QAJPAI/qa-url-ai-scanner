# url.jp.ai — plan and progress

## What it is

| | url.jp.ai (this repo: `QAJPAI/qa-url-ai-scanner`) | QA.JP.AI (`QAJPAI/qa-jp-ai-scanner`) |
|---|---|---|
| For | Checking a live website for vulnerabilities | QA evaluation of an app, with detailed advice |
| Who sees details | The verified owner only | The owner (it runs on their own code) |
| Today | To build | Engine, CLI, AI hand-off, fix loop (v0.7.0) |

url.jp.ai is a thin web layer. Every check and every verdict comes from the
engine (`scanPublic()` / `scanOwner()`); this repo adds no check logic of its
own. Licence: AGPL-3.0-or-later, the same as the engine. The result page points
visitors to QA.JP.AI's free pre-release check and rules file. It never points to
training, consulting or outsourcing.

## Runtime

- iQi's own dedicated server, already running: nginx (TLS) + pm2 + Node.js + MongoDB.
- Storage: MongoDB (official driver). TTL indexes expire the audit log after 30
  days, and rate-limit windows and cached results on their own. Tests use an
  in-memory store behind the same interface.
- Few dependencies otherwise: `node:http` with a small router, server-rendered
  Japanese HTML with no front-end framework.
- Email for sign-in links: Resend to start (free plan: 3,000 a month, at most
  100 a day, one domain). Behind a small mail interface, so Cloudflare Email
  Service (REST or SMTP; needs the Workers Paid plan) can replace it later. Our
  own daily cap stays below the provider's, with a clear message when reached.
  The sender needs SPF and DKIM on url.jp.ai.
- The engine is a git dependency pinned to a tag. This needs one engine change:
  a library entry point (`exports`) next to the CLI bundle.

## Order

Phase 1 is url.jp.ai on its own, open source, polished before anything else.
QA.JP.AI's own service comes after it.

## Step 1: public check (no sign-in)

- [x] `/`: one input box. `/r/<id>`: the result.
- [x] Shows only what the engine's public view gives: the basic-configuration
      grade and coverage, plus one sentence identical for every site
      ("serious problems are shown after the owner is confirmed").
- [x] A link to the pre-release check (QA.JP.AI) on every result.
- [x] Rate limits: per IP, and per target host (repeat checks of a host within a
      few minutes reuse the cached result, which also spares the target).
- [x] Audit log in MongoDB: time, IP, target, outcome. Kept 30 days (TTL index).
- [x] Terms, privacy policy, about page (Japanese) — drafts, for a lawyer's review.
- [x] The service's own security: CSP, every output escaped, CSRF protection on
      forms, X-Forwarded-For trusted from nginx only, outbound firewall advice
      on top of the engine's SSRF guard.
- [ ] Dogfooding: url.jp.ai checks itself once deployed. (The repo passes QA.JP.AI's check: done.)

Also done in step 1: a service-wide daily cap; at most 4 checks running and 16
waiting, a 30-second budget each; same-origin check on the form; one fixed
message per kind of failure; a magnifying-glass favicon (not a shield or a
check mark, which would read as "certified").

Still open for step 1:
- [x] Engine dependency: `github:QAJPAI/qa-jp-ai-scanner#v0.8.0` (2026-11-20).
      A clean `npm ci` with SSH blocked installs and builds it over HTTPS.
- [ ] Run the MongoDB store tests on the server (`MONGODB_URI=… npm test`).
- [ ] Deploy behind nginx.
- [x] Operator in the terms and privacy policy: Agentic AI LLC (iQi, 2026-11-20).

## Step 2: owner results

- [x] Ownership methods A / B / C, as the engine already decides them:
      same-domain email with a sign-in link (main); a verification file placed by
      the owner's AI; DNS TXT.
- [x] Owner session: `__Host-` HttpOnly / Secure / SameSite=Lax cookie, at most 24 hours (the proof's life), engine-sealed proof stored server-side.
- [x] Owner report at `/owner/r/<id>`: only for the session that ran it, while its proof still covers the site.
- [x] Limits per email address, site, sender address and day; per-minute limits on file / DNS attempts; per-session limit on owner checks. The audit log records who verified (method, address) and who opened details, and when.
- [x] Active checks (requesting `.env` and similar paths) run for verified
      owners from the start (iQi, 2026-11-20). What makes them acceptable is the
      owner's consent, proven by verification, and that they are a few ordinary
      requests for public paths. They sit behind a server switch
      (`ACTIVE_CHECKS=on|off`) so they can be turned off at once, every run is
      in the audit log, and the terms say: only sites you own or are
      authorised to check. Legal review is still to be done before wide use.

Still open for step 2:
- [ ] Resend: account, url.jp.ai domain verified (SPF, DKIM), `RESEND_API_KEY` on the server.
- [ ] `SESSION_SECRET` on the server.
- [ ] Decide whether to tell a domain's admin address when someone unlocks
      details by email (the engine suggests it for large organisations).
- [ ] Switch the engine dependency to `github:QAJPAI/qa-jp-ai-scanner#v0.9.0` once pushed.

## Step 3

- [ ] A fix request and re-check for verified owners (the engine already
      supports the URL layer).

## Decided (2026-11-20)

1. Email: Resend first; Cloudflare Email Service possible later.
2. Owner report includes active checks, behind a switch, from the start.
3. Server: nginx + pm2 + Node.js + MongoDB, already in operation.

## Review (2026-11-20, step 1)

- 22 tests pass, type check clean; the repo passes QA.JP.AI's pre-release check.
- Real run: the service checked github.com end to end and rendered the result;
  a check of `127.0.0.1:22` was refused with the fixed message "この URL は検査できません".
- Pages looked at in a browser: desktop, mobile, dark mode. Two changes came
  from that: the grade is now labelled "基本設定の評価" with "key exposure and
  similar problems are not included", because a big green "A" alone reads as
  "safe"; and the dark-mode button text was made readable.
- Mutation check: 23 safeguards removed one at a time. Four survived at first.
  Two were redundant and were removed (Node already omits HEAD bodies; counter
  keys already name their window), one was a shortcut covered by another check
  (declared body size) and was removed, and two lacked tests (streamed body
  size, malformed result ids reaching the database), which were added. The
  concurrency mutation first made a test hang instead of fail; that test now
  fails within two seconds.
- Not verified here: the MongoDB store against a real MongoDB (none in this
  environment; the download was blocked).

## Review (2026-11-20, step 2)

- 42 tests pass; type check clean; the repo passes QA.JP.AI's check.
- Engine 0.9.0 added what a web service needs: sealed proofs (only the engine
  creates and opens them; a changed sealed text, another secret or an expired
  one opens nothing) and an off switch for active checks that the ledger reports.
- Walked through in a real browser (Chromium): public check → owner start →
  email → link → button → session → detailed result → sign-out, no console
  errors, both cookies HttpOnly and SameSite=Lax. Active checks were off,
  because this environment owns no site to probe.
- That walk found a bug no test had: with `Referrer-Policy: no-referrer`,
  browsers send `Origin: null` on our own form posts, so every form was refused
  as cross-site — including the step-1 check form, already on GitHub. Fixed
  (`same-origin`, and Sec-Fetch-Site decides when Origin is null), with tests.
- Also from looking at the pages: the owner result claimed owner-only checks
  had run when the switch was off; it now says what actually ran, and the
  grade carries its scope.
- Mutation check: 19 owner safeguards removed one at a time; four survived at
  first. Tests were added for three (a second session for the same site, store
  expiry, malformed owner result ids); one (cookie value format) changed
  nothing and was removed.
- Not verified here: sending through Resend (no key), the MongoDB store against
  a real MongoDB, and active checks against a real site.

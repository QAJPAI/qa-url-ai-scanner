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
- [x] The MongoDB store tests against a real MongoDB: 4.4, 6.0, 7.0 and 8.0
      (2026-11-26, see the review below). Running them once on the server's
      own MongoDB stays in the launch procedure, as a confirmation.
- [ ] Deploy behind nginx. Deploy from git with `scripts/deploy.sh`; secrets in
      `~/.config/url-jp-ai/secrets.env`, not in the repository (2026-11-22).
      Production is not built yet (iQi, 2026-11-24): first the basics, then
      the server. The procedure was rehearsed on a clean machine (2026-11-26).
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
- [x] Admin-address notice when details are unlocked by email: not for now;
      the audit log records it (iQi, 2026-11-20). Revisit after the test run.
- [x] Engine dependency: `github:QAJPAI/qa-jp-ai-scanner#v0.9.0` (clean `npm ci` with SSH blocked: OK).
- [x] Engine dependency: `v0.10.1` (2026-11-22).
- [x] Beta switch `SITE_BETA=on` for the test run: β notice on every page, noindex everywhere, robots.txt disallows all.

## Step 3

- [x] A fix request and re-check for verified owners (2026-11-23, engine 0.11.0).
      - The result page shows the engine's fix request when problems were found.
      - Every later check of a session is compared with its first one
        (`Store.firstOwnerResult`), by the engine (`compareAssessments` with
        `servedTextReader`). The comparison is stored with the result.
      - 49 tests; each new safeguard removed once to see a test fail. Walked in
        Chromium with the real engine against the engine's case site: first
        result, fix published, re-check shows the key as confirmed fixed.
- [x] Engine dependency: `v0.11.0` (2026-11-24).
- [ ] MongoDB: `firstOwnerResult` has not run against a real MongoDB yet (the
      download of a test server is blocked in the build sandbox). Run
      `MONGODB_URI=… npm test` on the server.
- [x] Decided (iQi, 2026-11-24): the comparison stays within the 24 hours a
      session lasts. The longer the gap, the more the site may have changed
      for other reasons, so a comparison with an old result says less; and
      owner details never outlive the proof that allowed them. After 24 hours
      the owner verifies again and starts from a fresh first check.

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

## Review (2026-11-26, the launch procedure)

iQi asked for the procedure to be reviewed again and rewritten. The first one
(2026-11-22) had been written from reading the files; this time it was run.

- Rehearsed start to finish on a clean Ubuntu 24.04 as an unprivileged user:
  nginx 1.24 from apt, pm2 7, MongoDB 8.0, a self-signed certificate in the
  place of certbot's. `npm ci` fetched the engine over HTTPS with no SSH key
  and no URL rewriting. Through nginx, in production mode: the pages, the
  check form (same-origin behind the proxy), the `__Host-` cookie, the audit
  entry and the TTL indexes in MongoDB.
- Found by running it, and fixed (see the commit of the same date):
  - `deploy/nginx.conf.example` did not pass `nginx -t` on Ubuntu 24.04's
    nginx (`http2 on;` needs 1.25.1). Now passes on 1.18, 1.24, 1.26, 1.29.
  - With the port held by another program, `deploy.sh` reported OK while pm2
    restarted the app in a loop. The health check asked "does something
    answer", not "does our process answer".
  - A mistake in the secrets file took the running server down on reload.
    The settings are now loaded with `src/config.ts` before pm2 is touched.
  - The health check read the port from the shell, not from pm2's settings.
- Found by a second rehearsal, with a MongoDB that asks for a password:
  - A wrong database password still took the running server down on reload.
    The check before pm2 looked for a listening port, and anything listens.
    `scripts/preflight.ts` now opens the database (a read-only listing) in
    `--check` and again after the build, before pm2 is touched. Tried: right
    password, wrong password, no credentials where they are needed, nothing
    listening, a malformed address, an `mongodb+srv` name that does not
    resolve. With the right one: 50 of 50 store tests through the same address.
  - A deploy that stopped at a failing test left the new version's files and
    packages under the process still running the old one. pm2 would have
    started the old build against them after a crash or a reboot. The files
    of the running version are now put back; a pm2 restart afterwards came up.
  - `--reload` before the first deploy started nothing and printed a log; it
    now says to deploy first.
  - Rolling back to a version from before `preflight.ts` (today's main) and
    forward again works with either script on disk.
- An independent review of `deploy.sh` (a second reader given the code, not
  my conclusions) returned ten findings. Each was reproduced on the rehearsal
  machine, fixed, and tried again there:
  - An interrupted `npm ci` left the packages incomplete; every later run
    then reported a module error as a wrong setting and stopped, the
    repairing deploy included. Now: `--check` says the install is incomplete,
    a deploy installs again, `--reload` refuses.
  - `NODE_ENV=production` in the operator's shell made `npm ci` leave out tsx
    and esbuild. Now `npm ci --include=dev`.
  - A `PORT` changed to one another program holds passed the check, because
    the process was "online". The check compares with the running port.
  - A pm2 process named url-jp-ai started from another folder: `startOrReload`
    restarts that folder's build. Now an NG that names the folder.
  - `MONGODB_URI=` (empty) passed and the server then refused to start. The
    rule moved from `server.ts` into `loadConfig`.
  - pm2 keeps a setting after its line is deleted (confirmed in
    `/proc/<pid>/environ`): a removed `RESEND_API_KEY` stayed in the process
    while the script said mail was off. The pm2 file now declares every
    setting; `test/deploy.test.ts` keeps it in step with `src/config.ts`.
  - A database password with an unescaped `@` showed its tail as a host name.
  - Node 24 prints test results in another format; both are read.
  - A secrets file made with sudo ended in a stack trace; one mistake was
    reported twice; advice pointed at `--check` after the files were put back.
  - The nginx example names the certbot command and the SELinux boolean.
- Left as it is, and why: installing in place means the packages change under
  a running process for the seconds an install takes. Page requests during a
  deploy did not fail (measured below); the reviewer read that the HTTP client
  the engine uses may load a file on its first outgoing request, so the very
  first check after a start could fail if it falls in those seconds. Not
  reproduced here (no outbound network). Building each version in its own
  folder and switching would remove it; not worth the moving parts for a beta.
- Measured: a deploy makes nginx answer 502 for about 0.4 seconds, at the
  moment pm2 swaps the process (6 of 254 requests at 20 a second). Nothing
  fails during install, test or build.
- MongoDB store tests: 50 of 50 against 4.4.30, 6.0.28, 7.0.48 and 8.0; the
  app starts in production mode on 4.4. PR #3's branch: 54 of 54 on 8.0.
  This answers the open box "firstOwnerResult has not run against a real
  MongoDB" in step 3. The box itself is ticked after PR #3 merges: that PR
  edits the lines next to it, and changing it here would make the two conflict.
- The store test's fixed past date let MongoDB's TTL monitor delete a
  document mid-test: 4 of 85 runs failed with the monitor at 1 second, none
  of 60 after moving the date into the future. At the default 60 seconds it
  would have been about one run in a thousand.
- What url.jp.ai will say about itself, from the engine against this nginx
  setup with stand-in DNS answers: grade A when jp.ai (the domain whose mail
  settings apply to url.jp.ai) has SPF and DMARC `p=quarantine` or `reject`;
  B with `p=none` or without SPF; D without DMARC. Nothing else is reported.
- Found outside this repository: the engine's tag `v0.12.0` points at the
  commit of `v0.11.0` (it was made before engine PR #2 was merged). PR #3
  here must not be pinned to it until the tag is moved.
- Not verified here: a real check of a site on the internet (the build
  sandbox has no outbound network for the engine), certbot, Resend, DNS for
  url.jp.ai, pm2's start at boot, and the server's own versions.

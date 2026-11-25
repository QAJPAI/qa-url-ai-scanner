# url.jp.ai

A free check of a website's security, for everyone. Enter a URL; url.jp.ai
reads the page the way a browser does and grades its basic configuration.

Built on the QA.JP.AI engine ([qa-jp-ai-scanner](https://github.com/QAJPAI/qa-jp-ai-scanner)).
Every check and every verdict comes from the engine; this repository is the web
layer only, so url.jp.ai and the engine's reports never disagree.

## What visitors see

- **Anyone**: the basic-configuration grade (what any browser's developer tools
  show), how much was examined, and one sentence that is identical for every
  site: serious problems such as exposed keys are shown only to the verified
  owner. A site with a leaked key and a clean site look the same here, so the
  service cannot be used to find other people's weak spots.
- **Verified owners**: the full result, with the problems' locations and fixes,
  after one of three ways of showing ownership (decided by the engine):
  1. a mailbox on the site's own domain: a one-time sign-in link (15 minutes)
     that opens a page with a button, so a mail scanner opening the link signs
     nobody in;
  2. a verification file the owner's AI places at `/.well-known/qa-jp-ai.txt`;
  3. a DNS TXT record.

  The proof lasts 24 hours at most, in that browser only. The server keeps it
  sealed by the engine (`sealProof`), and only the engine opens it again. A
  detailed result is visible only to the session that ran it, while its proof
  still covers the site, and is deleted when the proof expires. Owner checks
  include active checks (requesting `.env` and similar paths); `ACTIVE_CHECKS=off`
  turns them off at once, and the result then says only page-view-level access
  was made.

  **Fixing, and confirming the fix.** When problems were found, the result
  holds a fix request: one text the owner pastes into their AI coding tool,
  with steps per problem and the conditions the AI must keep (the engine's
  `renderFixRequest()`). After publishing the fix, the owner presses
  「もう一度検査する」 and the result shows what changed since the first check of
  that session: *confirmed fixed*, *gone but not verified* (with the reason),
  *still present*, *new*. What counts as fixed is decided by the engine
  (`compareAssessments()`), never by this layer: a key that is gone only
  because a script could not be read, or was swapped for another key, is not
  shown as fixed. The comparison lives as long as the session (24 hours at
  most), because the first result is deleted with the proof. This is
  deliberate: over a longer gap a site changes for other reasons too, and a
  comparison with an old result would say less.

The result page also points to QA.JP.AI's free pre-release check, for finding
problems in the code before it is published.

## Safeguards

| | |
|---|---|
| Same origin | Every form (check, owner verification, sign-out) works only from url.jp.ai's own pages (Origin, or Sec-Fetch-Site when Origin is absent or "null"), so other sites cannot make their visitors start anything. |
| Limits | Per address per minute and per day, and for the whole service per day. Every attempt counts. |
| Reuse | The same page checked again within 10 minutes gets the earlier result: the site is read once. |
| Concurrency | At most 4 checks run and 16 wait; beyond that visitors are asked to try later. Each check has a 30-second budget. |
| Addresses | X-Real-IP is believed only from this machine and only with `TRUST_PROXY=1` (nginx in front). |
| Errors | One fixed message per kind of failure; nothing about which guard refused or why. Unexpected errors go to the server log. |
| Pages | No script at all; `default-src 'none'`. Every value is escaped. Result pages have unguessable addresses, `noindex`, and `Referrer-Policy: same-origin` (nothing is sent to other sites). |
| Owner sign-in | Links are single-use, stored only as hashes; sessions likewise. Mail is limited per address, per site, per address of the sender and per day (below Resend's free 100 a day). File and DNS attempts are limited per minute. Cookies (`__Host-`, HttpOnly, SameSite=Lax) are given only to people verifying ownership. |
| Retention | Results and the audit log (time, address, URL, outcome, and the email address used to verify) expire after 30 days; owner results with their proof (24 hours). Enforced by MongoDB TTL indexes. No analytics. |

Each safeguard has a test that fails when the safeguard is removed.

## Run

Requires Node.js 22 and MongoDB.

```sh
npm install
npm test
npm run build
```

### On the server (git + pm2)

Once:

```sh
git clone https://github.com/QAJPAI/qa-url-ai-scanner.git ~/url-jp-ai
mkdir -p ~/.config/url-jp-ai && touch ~/.config/url-jp-ai/secrets.env && chmod 600 ~/.config/url-jp-ai/secrets.env
echo "SESSION_SECRET=$(openssl rand -base64 48)" >> ~/.config/url-jp-ai/secrets.env
# add RESEND_API_KEY=... when the url.jp.ai domain is verified at Resend
```

Then, from anywhere:

```sh
~/url-jp-ai/scripts/deploy.sh --check    # is this server ready? changes nothing
~/url-jp-ai/scripts/deploy.sh            # deploy the latest main
~/url-jp-ai/scripts/deploy.sh <commit>   # deploy a tag or commit (how to roll back)
~/url-jp-ai/scripts/deploy.sh --reload   # apply a changed secrets.env; same code
```

Every run starts with the checks of `--check`: Node.js 22, the secrets file and
its permissions, `SESSION_SECRET`, that the port is free or ours, that MongoDB
answers. It stops there, having changed nothing, if one fails, and says what
to do. A deploy then checks out the version, runs `npm ci`, the tests and the
build, and only after all of that reloads pm2. It then makes sure that it is
this process that answers on `/healthz` and that it stays up: a port held by
another program also answers, and a process that crashes every second looks
"online" each time pm2 is asked. On failure it prints the last log lines and
the command that returns to the version before. What the script prints is
Japanese, like everything else an operator or visitor reads.

`deploy/ecosystem.config.cjs` holds no secrets. They come from
`~/.config/url-jp-ai/secrets.env` (or the file named by `URL_JP_AI_SECRETS`),
whose values override the defaults in that file, so nothing on the server
needs editing inside the repository. Server-specific settings go there too:
`PORT=3100` when 3000 is taken, `SITE_BETA=off` to end the beta,
`ACTIVE_CHECKS=off` to stop active checks at once (then `deploy.sh --reload`).

nginx in front: see [deploy/nginx.conf.example](deploy/nginx.conf.example).
Without `MONGODB_URI` the server keeps everything in memory (development only;
refused when `NODE_ENV=production`).

The MongoDB store's tests run only when `MONGODB_URI` is set, against a
throwaway database that is dropped afterwards:

```sh
MONGODB_URI=mongodb://127.0.0.1:27017 npm test
```

| Setting | Default |
|---|---|
| `BASE_URL` | `http://localhost:3000` (must be https elsewhere) |
| `SESSION_SECRET` | random per start in development; **required** (32+ characters) in production. Changing it signs every owner out. Make one with `openssl rand -base64 48`. |
| `RESEND_API_KEY`, `MAIL_FROM` | none (development: links go to the log; production: email method unavailable), `url.jp.ai <noreply@url.jp.ai>` |
| `ACTIVE_CHECKS` | `on` |
| `SITE_BETA` | `off` (`on`: a β notice on every page, `noindex` everywhere, robots.txt disallows all) |
| `MAIL_PER_ADDRESS_PER_DAY`, `MAIL_PER_SITE_PER_DAY`, `MAIL_PER_IP_PER_DAY`, `MAIL_TOTAL_PER_DAY` | 3, 10, 10, 90 |
| `VERIFY_PER_IP_PER_MINUTE`, `OWNER_CHECKS_PER_HOUR`, `LOGIN_LINK_MINUTES` | 5, 10, 15 |
| `HOST`, `PORT` | `127.0.0.1`, `3000` |
| `TRUST_PROXY` | off |
| `MONGODB_URI`, `MONGODB_DB` | none, `url_jp_ai` |
| `OPERATOR_NAME`, `CONTACT_EMAIL` | `Agentic AI LLC`, `qa@email.jp.ai` |
| `LIMIT_PER_IP_PER_MINUTE`, `LIMIT_PER_IP_PER_DAY`, `LIMIT_TOTAL_PER_DAY` | 3, 30, 3000 |
| `REUSE_RESULT_MINUTES` | 10 |
| `MAX_CONCURRENT_SCANS`, `MAX_QUEUED_SCANS`, `SCAN_BUDGET_SECONDS` | 4, 16, 30 |
| `RESULT_TTL_DAYS`, `AUDIT_TTL_DAYS` | 30, 30 |

## Before going public

- The terms and privacy policy are drafts; have them reviewed by a lawyer.
- Run the MongoDB store tests against the server's MongoDB
  (`MONGODB_URI=… npm test`). They pass against MongoDB 8.0 (2026-11-26),
  including the lookup that the re-check comparison uses
  (`firstOwnerResult`); the server's own version has not been tried.

## Licence

AGPL-3.0-or-later. Anyone who runs a modified version as a network service must
offer its source to its users; the footer of every page links to this
repository. Copyright (C) 2026 iQi. Contact: qa@email.jp.ai

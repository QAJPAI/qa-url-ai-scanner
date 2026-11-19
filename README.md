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
- **Verified owners**: details, with the problems' locations and fixes. *Not yet
  built* (step 2 in [tasks/todo.md](tasks/todo.md)).

The result page also points to QA.JP.AI's free pre-release check, for finding
problems in the code before it is published.

## Safeguards

| | |
|---|---|
| Same origin | A check can only be started from url.jp.ai's own form (Origin / Sec-Fetch-Site), so other sites cannot make their visitors start checks. |
| Limits | Per address per minute and per day, and for the whole service per day. Every attempt counts. |
| Reuse | The same page checked again within 10 minutes gets the earlier result: the site is read once. |
| Concurrency | At most 4 checks run and 16 wait; beyond that visitors are asked to try later. Each check has a 30-second budget. |
| Addresses | X-Real-IP is believed only from this machine and only with `TRUST_PROXY=1` (nginx in front). |
| Errors | One fixed message per kind of failure; nothing about which guard refused or why. Unexpected errors go to the server log. |
| Pages | No script at all; `default-src 'none'`. Every value is escaped. Result pages have unguessable addresses, `noindex`, and `Referrer-Policy: no-referrer`. |
| Retention | Results and the audit log (time, address, URL, outcome) expire after 30 days, enforced by MongoDB TTL indexes. No cookies, no analytics. |

Each safeguard has a test that fails when the safeguard is removed.

## Run

Requires Node.js 22 and MongoDB.

```sh
npm install
npm test
npm run build
pm2 start deploy/ecosystem.config.cjs   # edit the values marked CHANGE first
```

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
- Run the MongoDB store tests against the server's MongoDB.

## Licence

AGPL-3.0-or-later. Anyone who runs a modified version as a network service must
offer its source to its users; the footer of every page links to this
repository. Copyright (C) 2026 iQi. Contact: qa@email.jp.ai

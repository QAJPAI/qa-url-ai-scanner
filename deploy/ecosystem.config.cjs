// pm2 settings for url.jp.ai. Deploy with scripts/deploy.sh (it runs pm2 for you).
//
// This file is tracked by git and holds no secrets, so `git pull` never conflicts.
// Secrets and server-specific values live in a file outside the repository:
//   ~/.config/url-jp-ai/secrets.env   (or the path in URL_JP_AI_SECRETS)
// one KEY=value per line, chmod 600. Its values override the ones below:
//   SESSION_SECRET=...   (32+ random characters: `openssl rand -base64 48`)
//   RESEND_API_KEY=...   (from resend.com after verifying url.jp.ai: SPF and DKIM)
//   MONGODB_URI=...      (only if MongoDB needs credentials)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseEnv } = require('node:util');

const secretsFile =
  process.env.URL_JP_AI_SECRETS || path.join(os.homedir(), '.config', 'url-jp-ai', 'secrets.env');
// A missing file is not an error here: the server itself refuses to start in
// production without SESSION_SECRET, which says plainly what is missing.
const secrets = fs.existsSync(secretsFile) ? parseEnv(fs.readFileSync(secretsFile, 'utf8')) : {};

module.exports = {
  apps: [
    {
      name: 'url-jp-ai',
      script: 'dist/server.mjs',
      cwd: __dirname + '/..',
      // One process: limits and the concurrency cap are per process.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000',
        BASE_URL: 'https://url.jp.ai',
        // nginx on this machine sets X-Real-IP; see deploy/nginx.conf.example.
        TRUST_PROXY: '1',
        MONGODB_URI: 'mongodb://127.0.0.1:27017', // override in the secrets file if it needs credentials
        MONGODB_DB: 'url_jp_ai',
        OPERATOR_NAME: 'Agentic AI LLC', // the operator named in the terms and privacy policy
        CONTACT_EMAIL: 'qa@email.jp.ai',
        MAIL_FROM: 'url.jp.ai <noreply@url.jp.ai>',
        // 'off' stops active checks for owners at once.
        ACTIVE_CHECKS: 'on',
        // Beta (test operation): a notice on every page, no search indexing. 'off' when it ends.
        SITE_BETA: 'on',
        // SESSION_SECRET, RESEND_API_KEY and any overrides: from the secrets file.
        ...secrets,
      },
    },
  ],
};

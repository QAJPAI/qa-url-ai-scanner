// pm2 settings for url.jp.ai. Start with:  pm2 start deploy/ecosystem.config.cjs
// Copy this file and fill in the values marked CHANGE; keep secrets out of git.
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
        MONGODB_URI: 'mongodb://127.0.0.1:27017', // CHANGE if MongoDB needs credentials
        MONGODB_DB: 'url_jp_ai',
        OPERATOR_NAME: 'Agentic AI LLC', // the operator named in the terms and privacy policy
        CONTACT_EMAIL: 'qa@email.jp.ai',
      },
    },
  ],
};

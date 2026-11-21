#!/usr/bin/env bash
# Copyright (C) 2026 iQi
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Deploy url.jp.ai on the server from git. Run it from anywhere:
#   ~/url-jp-ai/scripts/deploy.sh            # latest main
#   ~/url-jp-ai/scripts/deploy.sh v0.2.0     # a tag or commit (also how to roll back)
#
# Stops at the first failure, before pm2 is touched, so a broken build or a
# failing test never replaces the running server.
set -euo pipefail

# Everything runs inside main(): bash reads a script as it goes, and the
# checkout below may replace this very file.
main() {
  cd "$(dirname "$0")/.."
  ref="${1:-origin/main}"
  port="${PORT:-3000}"

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Tracked files were changed on this server. Commit them elsewhere or run 'git stash' first." >&2
    git status --short --untracked-files=no >&2
    exit 1
  fi

  echo "== fetch and check out $ref"
  git fetch --tags origin
  git checkout --quiet --detach "$ref"
  git log -1 --format='   %h %s (%cr)'

  echo "== install, test, build"
  npm ci --no-audit --no-fund
  npm test
  npm run build

  echo "== start or reload with pm2"
  pm2 startOrReload deploy/ecosystem.config.cjs --update-env
  pm2 save

  echo "== health check"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -o /dev/null "http://127.0.0.1:${port}/"; then
      echo "   OK: url.jp.ai answers on 127.0.0.1:${port}"
      exit 0
    fi
    sleep 1
  done
  echo "url.jp.ai did not answer on 127.0.0.1:${port}. See: pm2 logs url-jp-ai --lines 50" >&2
  exit 1
}

main "$@"

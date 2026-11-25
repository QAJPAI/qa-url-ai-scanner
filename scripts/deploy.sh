#!/usr/bin/env bash
# Copyright (C) 2026 iQi
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Deploy url.jp.ai on the server from git. Run it from anywhere:
#   ~/url-jp-ai/scripts/deploy.sh --check    # check this server; changes nothing
#   ~/url-jp-ai/scripts/deploy.sh            # deploy the latest main
#   ~/url-jp-ai/scripts/deploy.sh <commit>   # deploy a tag or commit (how to roll back)
#   ~/url-jp-ai/scripts/deploy.sh --reload   # apply a changed secrets.env; same code
#
# Every run starts with the checks of --check and stops there if the server is
# not ready. A deploy then installs, tests and builds, and only after all of
# that touches pm2, so a broken build or a failing test never replaces the
# running server. What the operator reads is Japanese.
set -euo pipefail

APP=url-jp-ai
ng=0

step() { printf '\n== %s\n' "$1"; }
ok() { printf '  OK    %s\n' "$1"; }
warn() { printf '  注意  %s\n        → %s\n' "$1" "$2"; }
bad() {
  printf '  NG    %s\n        → %s\n' "$1" "$2"
  ng=$((ng + 1))
}

# One setting as pm2 will see it: the defaults in deploy/ecosystem.config.cjs,
# overridden by the secrets file.
conf() {
  node -p 'String(require("./deploy/ecosystem.config.cjs").apps[0].env[process.argv[1]] ?? "")' "$1"
}

# "<status> <restarts>" of our pm2 process, or nothing when pm2 has none.
# pm2 may print notices around the JSON, so only the JSON line is read.
pm2_app() {
  pm2 jlist 2>/dev/null | APP="$APP" node -e '
    let text = "";
    process.stdin.on("data", (d) => (text += d)).on("end", () => {
      const line = text.split("\n").find((l) => l.startsWith("[{") || l.trim() === "[]");
      try {
        const app = JSON.parse(line ?? "[]").find((a) => a.name === process.env.APP);
        if (app) console.log(app.pm2_env.status, app.pm2_env.restart_time);
      } catch {}
    });' || true
}

port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Is this server ready? Changes nothing. Counts in $ng what would make a deploy
# fail or be unsafe, and says what to do about each.
check() {

  local missing=0 cmd
  for cmd in git node npm pm2 curl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      bad "$cmd が見つかりません" "$cmd をインストールしてください（pm2 は: npm install -g pm2）"
      missing=1
    fi
  done
  if ! command -v node >/dev/null 2>&1; then return; fi

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$node_major" -ge 22 ]; then
    ok "Node.js $(node -v)"
  else
    bad "Node.js $(node -v) は古すぎます（22 以上が必要）" "Node.js 22 以上を入れてください。pm2 もその Node.js で動かします"
    return # the settings below are read with Node 22's parser
  fi
  if [ "$missing" -eq 0 ]; then ok "git, npm, pm2, curl"; fi

  local secrets="${URL_JP_AI_SECRETS:-$HOME/.config/url-jp-ai/secrets.env}"
  if [ ! -f "$secrets" ]; then
    bad "秘密情報ファイルがありません: $secrets" "公開手順の「初回セットアップ」のコマンドで作ってください"
  else
    local mode
    mode="$(stat -c '%a' "$secrets" 2>/dev/null || echo 600)"
    if [ "$mode" = "600" ] || [ "$mode" = "400" ]; then
      ok "秘密情報ファイル（本人だけが読めます）"
    else
      bad "秘密情報ファイルをほかのユーザーが読めます（権限 $mode）" "chmod 600 $secrets"
    fi
  fi

  local secret_length
  secret_length="$(conf SESSION_SECRET | tr -d '\n' | wc -c)"
  if [ "$secret_length" -ge 32 ]; then
    ok "SESSION_SECRET（${secret_length} 文字）"
  else
    bad "SESSION_SECRET がないか、32 文字未満です" "echo \"SESSION_SECRET=\$(openssl rand -base64 48)\" >> $secrets"
  fi

  local port status
  port="$(conf PORT)"
  status="$(pm2_app | cut -d' ' -f1)"
  if [ "$status" = "online" ]; then
    ok "ポート $port（url.jp.ai が稼働中）"
  elif port_in_use "$port"; then
    bad "ポート $port は別のプログラムが使っています" "$secrets に PORT=3100 のように空いている番号を書き、nginx の proxy_pass も同じ番号にしてください"
  else
    ok "ポート $port（空いています）"
  fi

  # The address only, never the whole setting: it may hold a password.
  local mongo
  # shellcheck disable=SC2016 # the backticks and ${} below are JavaScript
  if mongo="$(node -e '
      const m = /^mongodb:\/\/(?:[^@\/]*@)?(\[[^\]]+\]|[^:\/,?]+)(?::(\d+))?/.exec(process.argv[1]);
      if (!m) process.exit(2);
      const host = m[1].replace(/^\[|\]$/g, ""), port = Number(m[2] || 27017);
      console.log(`${host}:${port}`);
      const socket = require("node:net").connect({ host, port, timeout: 3000 });
      socket.on("connect", () => process.exit(0)).on("timeout", () => process.exit(1)).on("error", () => process.exit(1));
    ' "$(conf MONGODB_URI)")"; then
    ok "MongoDB に接続できます（$mongo）"
    local mongo_port="${mongo##*:}"
    case "$mongo" in
      127.0.0.1:* | localhost:* | ::1:*)
        if command -v ss >/dev/null 2>&1 &&
          ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "^(0\.0\.0\.0|\*|\[::\]):${mongo_port}\$"; then
          warn "MongoDB が外部からの接続も受け付ける設定です" "ファイアウォールでポート ${mongo_port} を閉じているか確認してください。閉じていなければ /etc/mongod.conf の bindIp を 127.0.0.1 にします"
        fi
        ;;
    esac
  elif [ -n "$mongo" ]; then
    bad "MongoDB に接続できません（$mongo）" "MongoDB が動いているか確認してください（例: sudo systemctl status mongod）"
  else
    warn "MONGODB_URI の接続先は、ここでは確認していません" "起動後の動作確認の結果を見てください"
  fi

  if command -v systemctl >/dev/null 2>&1 &&
    [ "$(systemctl is-enabled "pm2-$(id -un).service" 2>/dev/null || true)" != "enabled" ]; then
    warn "サーバーを再起動したあと、pm2 が自動では立ち上がりません" "pm2 startup を実行し、表示された sudo で始まるコマンドを実行してください（最初のデプロイのあとで構いません）"
  fi
}

ready() {
  step "事前確認"
  check
  if [ "$ng" -gt 0 ]; then
    printf '\nNG が %s 件あります。「→」の対処をしてから、もう一度実行してください。何も変更していません。\n' "$ng" >&2
    exit 1
  fi
}

settings() {
  local mail="使えません（RESEND_API_KEY が未設定。確認ファイルと DNS は使えます）"
  if [ -n "$(conf RESEND_API_KEY)" ]; then mail="使えます"; fi
  printf '   公開アドレス %s ／ ポート %s ／ β 表示 %s ／ 所有者向けの追加検査 %s\n' \
    "$(conf BASE_URL)" "$(conf PORT)" "$(conf SITE_BETA)" "$(conf ACTIVE_CHECKS)"
  printf '   メールでの所有者確認: %s\n' "$mail"
}

healthy() {
  [ "$(curl -fs --noproxy '*' --max-time 3 "http://127.0.0.1:$1/healthz" 2>/dev/null)" = "ok" ]
}

# Start or reload with pm2, then make sure it is our process that answers and
# that it stays up. A port another program holds would also answer, and a
# process that crashes every second is "online" each time pm2 looks.
restart() {
  local port="$1" undo="$2"

  step "pm2 で起動（再読み込み）"
  pm2 startOrReload deploy/ecosystem.config.cjs --update-env >/dev/null
  pm2 save >/dev/null

  step "動作確認"
  local up=0 before after
  for _ in $(seq 1 20); do
    if healthy "$port"; then
      up=1
      break
    fi
    sleep 1
  done
  before="$(pm2_app)"
  sleep 3
  after="$(pm2_app)"
  if [ "$up" -eq 1 ] && healthy "$port" && [ "${after%% *}" = "online" ] && [ "$before" = "$after" ]; then
    ok "url.jp.ai が 127.0.0.1:${port} で応答しています"
    settings
    return
  fi

  {
    printf '  NG    url.jp.ai が起動していません。直前のログ:\n\n'
    pm2 logs "$APP" --lines 30 --nostream --no-color 2>&1 | tail -n 40
    printf '\n上のログをそのまま Claude に貼ってください。\n'
    if [ -n "$undo" ]; then printf '元の版に戻すには: %s/scripts/deploy.sh %s\n' "$PWD" "$undo"; fi
  } >&2
  exit 1
}

# Everything runs inside main(): bash reads a script as it goes, and the
# checkout below may replace this very file.
main() {
  cd "$(dirname "$0")/.."

  case "${1:-}" in
    --check)
      ready
      printf '\nすべて OK です。デプロイできます: %s/scripts/deploy.sh\n' "$PWD"
      exit 0
      ;;
    --reload)
      ready
      restart "$(conf PORT)" ""
      exit 0
      ;;
    -*)
      echo "使い方: deploy.sh [--check | --reload | <タグまたはコミット>]" >&2
      exit 2
      ;;
  esac
  local ref="${1:-origin/main}"

  ready

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    {
      echo "このサーバー上で、git が管理しているファイルが書き換えられています。"
      echo "変更を捨ててよければ: git -C $PWD checkout -- .   （設定は secrets.env に書きます）"
      git status --short --untracked-files=no
    } >&2
    exit 1
  fi

  local previous
  previous="$(git rev-parse --short HEAD)"

  step "取得: $ref"
  git fetch --quiet --tags origin
  git checkout --quiet --detach "$ref"
  git log -1 --format='   %h %s（%cr）'

  step "インストール、テスト、ビルド（終わるまで、動いているサーバーには触れません）"
  npm ci --no-audit --no-fund --loglevel=error
  local log
  log="$(mktemp -t url-jp-ai-test.XXXXXX)"
  if ! npm test >"$log" 2>&1; then
    grep -E '^not ok|^# (tests|pass|fail)' "$log" >&2 || true
    echo "テストが失敗しました。動いているサーバーには触れていません。全文: $log" >&2
    exit 1
  fi
  printf '   テスト: %s 件すべて通過\n' "$(sed -n 's/^# pass //p' "$log")"
  rm -f "$log"
  npm run --silent build

  restart "$(conf PORT)" "$previous"
  printf '   版: %s（ひとつ前は %s。戻すには: %s/scripts/deploy.sh %s）\n' \
    "$(git rev-parse --short HEAD)" "$previous" "$PWD" "$previous"
}

# "exit" on the same line: nothing more is read from a file that may have changed.
main "$@"; exit

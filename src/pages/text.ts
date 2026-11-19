// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The site's own Japanese wording. Anything about a result (grades, counts,
 * coverage, what is shown to whom) comes from the engine's texts instead, so
 * the site and the reports never say different things.
 */
export const site = {
  name: 'url.jp.ai',
  tagline: 'Web サイトのセキュリティ簡易チェック（無料）',
  description:
    'URL を入力するだけで、Web サイトの基本的なセキュリティ設定を無料でチェックします。QA.JP.AI のオープンソースの検査エンジンを使っています。',
  inputLabel: '検査する URL',
  inputPlaceholder: 'https://example.jp',
  submit: 'チェックする',
  agreement: (termsHref: string) => ({ before: 'チェックを始めると、', link: '利用規約', after: 'に同意したものとみなします。', href: termsHref }),
  whatWeDoHeading: 'このチェックで行うこと',
  whatWeDo: [
    '入力されたページを、通常のブラウザーと同じように読み込みます。そのページが読み込むよう指定している同じサイトのスクリプトも読みます。',
    '攻撃や、ログインを試すようなアクセスは一切行いません。',
    '公開されるのは、誰でもブラウザーの開発者ツールで確認できる「基本設定」の評価だけです。',
  ],
  gradeScope: 'キーの露出など、重大な問題になり得る項目はこの評価に含まれていません。',
  ownerPending: '所有者の確認（サイトと同じドメインのメールアドレスなど）は、現在準備中です。',
  ownerHeading: 'サイトの所有者の方へ',
  ownerText:
    'キーの露出など重大な問題の有無と、その場所・直し方は、サイトの所有者であることを確認できた方にだけお見せします。所有者の確認（サイトと同じドメインのメールアドレスなど）は、現在準備中です。',
  preReleaseHeading: '公開する前に、コードの段階でチェックしませんか',
  preReleaseText:
    'AI に作ってもらったアプリは、公開前に QA.JP.AI の「公開前チェック」で確認できます。データベースのアクセス制御や秘密のキーの扱いを、手元のコードで検査します。無料で、コードが外部に送られることはありません。',
  preReleaseLink: '公開前チェックの使い方',
  checkAgain: '別の URL をチェックする',
  resultHeading: '簡易チェック結果',
  resultNotFound: 'この結果は見つかりませんでした。保存期間（30 日）を過ぎたか、URL が正しくない可能性があります。',
  errorHeading: 'チェックできませんでした',
  invalidInput: 'URL の形式が正しくありません。「https://」から始まるサイトの URL を入力してください。',
  credentialsInUrl: 'ユーザー名やパスワードを含む URL はチェックできません。',
  rateLimited: 'チェックの回数が上限に達しました。しばらく時間をおいてから、もう一度お試しください。',
  dailyCapReached: '本日のチェックの受付数が上限に達しました。明日以降に、もう一度お試しください。',
  busy: 'ただいま混み合っています。少し時間をおいてから、もう一度お試しください。',
  refusedOrigin: 'このページからはチェックを開始できません。url.jp.ai のページから、もう一度お試しください。',
  tooLarge: '送信された内容が大きすぎます。',
  notFound: 'ページが見つかりません。',
  methodNotAllowed: 'この操作はできません。',
  footerSource: 'ソースコード（AGPL-3.0）',
  footerEngine: '検査エンジン',
  footerTerms: '利用規約',
  footerPrivacy: 'プライバシーポリシー',
  footerAbout: 'url.jp.ai について',
  footerVersion: (site: string, engine: string, rules: string) => `url.jp.ai v${site} ・ エンジン v${engine} ・ 検査ルール v${rules}`,
};

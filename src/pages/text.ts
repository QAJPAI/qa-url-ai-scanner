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
    'メールの送信ドメイン認証（SPF・DMARC）が設定されているかを、DNS に公開されている情報から確認します。設定がないと、誰でもこのドメインを名乗る偽のメールを送れてしまいます。',
    '攻撃や、ログインを試すようなアクセスは一切行いません。',
    '公開されるのは、誰でもブラウザーの開発者ツールで確認できる「基本設定」の評価だけです。',
  ],
  gradeScope: 'キーの露出など、重大な問題になり得る項目はこの評価に含まれていません。',
  pointsLabel: 'url.jp.ai の特長',
  points: (budgetSeconds: number) => [
    { title: '登録は要りません', text: 'URL を入力するだけです。アカウントの登録は要りません。' },
    { title: 'その場で結果が出ます', text: `チェックは通常 ${budgetSeconds} 秒以内に終わり、結果はすぐに表示されます。` },
    { title: '追跡しません', text: 'アクセス解析も広告も使っていません。このサイトのページは、スクリプトを一切読み込みません。' },
    {
      title: '直して、確かめるまで無料',
      text: '所有者の方には、直し方と、AI に渡せる修正依頼文をお見せします。修正のあとにもう一度検査すると、直ったことを確認できます。',
    },
  ],
  audienceHeading: 'こんな方のためのチェックです',
  audience: [
    'AI に頼んで、Web サイトやアプリを作ってもらった',
    '公開している、または公開する予定があるが、セキュリティを誰にも確認してもらっていない',
    '利用者の名前やメールアドレスなど、預かっている情報がある',
  ],
  sample: {
    heading: '結果の見本',
    notice: (host: string) =>
      `このページは見本です。架空のサイト（${host}）を、所有者として確認したうえで検査した場合の表示例です。実在するサイトの検査結果ではありません。`,
    intro:
      '所有者であることを確認すると、問題の場所と直し方、AI に渡せる修正依頼文、修正後の再検査の結果が表示されます。確認をしていない方に表示されるのは、基本設定の評価と件数だけです。',
    target: (host: string) => `${host}（架空のサイト）`,
    step1: '見本 1：最初の検査の結果',
    step2: '見本 2：AI に渡す修正依頼文',
    step3: '見本 3：修正を公開したあとの再検査',
    recheckIntro:
      'この見本では、キーをフロントエンドから取り除き、CSP ヘッダーを追加して、サイトを公開し直しました。もう一度検査すると、次のように表示されます。',
    teaserIntro: (host: string) =>
      `所有者であることを確認すると、問題の場所と直し方まで表示されます。次は、架空のサイト（${host}）の例です。`,
    teaserAfter: (fixedHeading: string) =>
      `AI に渡せる修正依頼文も表示されます。修正を公開してもう一度検査すると、「${fixedHeading}」のように、直ったことを確認できます。`,
    link: '見本の全体を見る',
    tryIt: '自分のサイトをチェックする',
  },
  faqHeading: 'よくある質問',
  ownerHeading: 'サイトの所有者の方へ',
  ownerText:
    'キーの露出など重大な問題の有無と、その場所・直し方は、サイトの所有者であることを確認できた方にだけお見せします。確認は、サイトと同じドメインのメールアドレス、確認ファイル（サイトを作った AI に頼めます）、DNS のいずれかで行えます。簡易チェックの結果ページから始められます。',
  ownerLink: '所有者として詳しい結果を見る',
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
  betaBadge: 'β',
  betaNotice: 'β版（テスト運用中）です。判定の正確さを検証しています。結果は参考としてご覧ください。',
  footerVersion: (site: string, engine: string, rules: string) => `url.jp.ai v${site} ・ エンジン v${engine} ・ 検査ルール v${rules}`,
};

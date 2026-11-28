// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Config } from '../config';
import { type Html, html } from './html';
import { site } from './text';

/**
 * Questions people ask before they type a URL. Every answer restates
 * something the service already does or the terms and privacy policy already
 * say, and the numbers come from the settings in force, so an answer cannot
 * drift from what the server does.
 */
interface Entry {
  q: string;
  a: Html;
}

const DAY = 86_400_000;

function entries(config: Config): Entry[] {
  const { limits } = config;
  const reuseMinutes = Math.round(limits.reuseResultMs / 60_000);
  const resultDays = Math.round(limits.resultTtlMs / DAY);
  const auditDays = Math.round(limits.auditTtlMs / DAY);
  return [
    {
      q: '料金はかかりますか？',
      a: html`<p>かかりません。簡易チェックも、所有者向けの詳しい結果も、AI に渡す修正依頼文も、修正後の再検査も、すべて無料です。アカウントの登録も要りません。</p>`,
    },
    {
      q: 'チェックをすると、サイトに負荷や影響はありますか？',
      a: html`<p>通常のページ表示と同じ程度のアクセスです。入力されたページと、そのページが読み込むよう指定している同じサイトのスクリプトを、ブラウザーと同じように読み込みます。攻撃、ログインの試行、データの変更は行いません。</p>
${reuseMinutes > 0 ? html`<p>同じページを続けてチェックした場合、${reuseMinutes} 分以内は前回の結果を表示し、サイトを読み直しません。</p>` : ''}
${config.activeChecks ? html`<p>所有者であることを確認できた場合に限り、公開されていてはいけないファイル（.env など）が公開されていないかを、数回のアクセスで確かめます。</p>` : ''}`,
    },
    {
      q: '入力した URL や結果は、どのように扱われますか？',
      a: html`<p>入力された URL とその評価は ${resultDays} 日間、IP アドレスと日時の記録は ${auditDays} 日間保存し、その後自動的に削除します。回数の制限と、不正な利用の防止のためです。所有者の確認にメールアドレスを使った場合は、そのメールアドレスも ${auditDays} 日間保存します。検査したページの内容そのものは保存しません。</p>
<p>アクセス解析や広告のためのサービスは使っていません。簡易チェックだけを利用する方には、Cookie も使いません。詳しくは<a href="/privacy">プライバシーポリシー</a>をご覧ください。</p>`,
    },
    {
      q: '評価が「A」なら、安全ということですか？',
      a: html`<p>いいえ。簡易チェックの評価は、検査した範囲の「基本設定」についてのものです。キーの露出など、重大な問題になり得る項目は含まれていません。検査していない項目があることは、結果の画面に表示します。結果は、サイトの安全性を保証するものではありません。</p>`,
    },
    {
      q: 'なぜ、詳しい結果は所有者にしか表示されないのですか？',
      a: html`<p>問題の場所が分かると、攻撃の手がかりになるからです。そのため、キーの露出など重大な問題については、問題があってもなくても、すべてのサイトで同じ案内を表示します。第三者が、他人のサイトの弱点を調べる道具として使えないようにするためです。</p>`,
    },
    {
      q: '所有者であることは、どうやって確認しますか？',
      a: html`<p>次のいずれかの方法で確認します。簡易チェックの結果ページから始められます。</p>
<ul>
<li>サイトと同じドメインのメールアドレスに届く、確認メールのリンクを開く</li>
<li>確認ファイルをサイトに置く（サイトを作った AI に頼めます）</li>
<li>DNS に TXT レコードを追加する</li>
</ul>
<p>確認できた状態は、最長 24 時間、そのブラウザーでだけ有効です。</p>`,
    },
    {
      q: '見つかった問題は、どう直せばよいですか？',
      a: html`<p>所有者向けの結果に、問題ごとの直し方と、AI コーディングツール（Claude Code、Cursor など）にそのまま渡せる修正依頼文を表示します。修正を公開してからもう一度検査すると、直ったことを確認できた項目が表示されます。表示の例は、<a href="/sample">結果の見本</a>でご覧いただけます。</p>`,
    },
    {
      q: 'AI で作ったサイトでなくても使えますか？',
      a: html`<p>使えます。通信の暗号化やレスポンスヘッダーなどの基本設定は、どのサイトにも当てはまります。所有者向けの検査は、AI で作ったアプリで起きやすい問題（秘密のキーの露出など）を中心にしています。</p>`,
    },
    {
      q: '運営しているのは誰ですか？',
      a: html`<p>${config.operatorName} が運営しています。このサイトと検査エンジンのソースコードは公開しており、何をどう判定しているかを、誰でも確かめられます。詳しくは「<a href="/about">url.jp.ai について</a>」をご覧ください。</p>`,
    },
  ];
}

/** Each question opens in place: `<details>` needs no script. */
export function faqSection(config: Config): Html {
  return html`<section class="faq">
<h2>${site.faqHeading}</h2>
${entries(config).map((e) => html`<details><summary>${e.q}</summary>${e.a}</details>`)}
</section>`;
}

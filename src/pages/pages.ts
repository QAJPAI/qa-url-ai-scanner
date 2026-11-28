// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { cleanText, ENGINE_VERSION, ja, type PublicSummary, RULES_VERSION } from 'qa-jp-ai-scanner';
import type { Config } from '../config';
import { SITE_VERSION } from '../version';
import { faqSection } from './faq';
import { type Html, html } from './html';
import { site } from './text';

const t = ja.report;

const JST = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export interface PageContext {
  config: Config;
}

export function layout(ctx: PageContext, title: string, body: Html, options: { noindex?: boolean } = {}): string {
  const { config } = ctx;
  return html`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title === site.name ? `${site.name} — ${site.tagline}` : `${title} — ${site.name}`}</title>
<meta name="description" content="${site.description}">
${options.noindex || config.beta ? html`<meta name="robots" content="noindex, nofollow">` : ''}
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/site.css">
</head>
<body>
${config.beta ? html`<p class="beta-notice" role="note">${site.betaNotice}</p>` : ''}
<header class="top"><a class="brand" href="/" aria-label="${site.name}"><span class="logo-mark">URL<span class="tld">.jp.ai</span></span>${config.beta ? html`<span class="beta">${site.betaBadge}</span>` : ''}</a><span class="tagline">${site.tagline}</span></header>
<main>
${body}
</main>
<footer>
<nav>
<a href="/about">${site.footerAbout}</a>
<a href="/terms">${site.footerTerms}</a>
<a href="/privacy">${site.footerPrivacy}</a>
<a href="${config.sourceUrl}">${site.footerSource}</a>
<a href="${config.engineSourceUrl}">${site.footerEngine}</a>
</nav>
<p class="version">${site.footerVersion(SITE_VERSION, ENGINE_VERSION, RULES_VERSION)}</p>
</footer>
</body>
</html>
`.value;
}

function checkForm(value = ''): Html {
  const agreement = site.agreement('/terms');
  return html`<form class="check" method="post" action="/check">
<label for="url">${site.inputLabel}</label>
<div class="row">
<input id="url" name="url" type="text" inputmode="url" autocomplete="url" spellcheck="false" maxlength="2048" required placeholder="${site.inputPlaceholder}" value="${value}">
<button type="submit">${site.submit}</button>
</div>
<p class="note">${agreement.before}<a href="${agreement.href}">${agreement.link}</a>${agreement.after}</p>
</form>`;
}

export function preReleaseBox(ctx: PageContext): Html {
  return html`<section class="box prerelease">
<h2>${site.preReleaseHeading}</h2>
<p>${site.preReleaseText}</p>
<p><a href="${ctx.config.preReleaseGuideUrl}">${site.preReleaseLink}</a></p>
</section>`;
}

/**
 * The home page. `sample` is the excerpt of the sample result; it is passed in
 * because the sample is laid out by the owner pages, which build on this file.
 */
export function homePage(ctx: PageContext, sample: Html): string {
  const budgetSeconds = Math.round(ctx.config.limits.scanBudgetMs / 1000);
  return layout(
    ctx,
    site.name,
    html`<section class="hero">
<h1>${site.tagline}</h1>
<p>${site.description}</p>
${checkForm()}
</section>
<ul class="points" aria-label="${site.pointsLabel}">
${site.points(budgetSeconds).map((p) => html`<li><strong>${p.title}</strong><span>${p.text}</span></li>`)}
</ul>
<section class="box">
<h2>${site.audienceHeading}</h2>
<ul>${site.audience.map((line) => html`<li>${line}</li>`)}</ul>
</section>
${sample}
<section class="box">
<h2>${site.whatWeDoHeading}</h2>
<ul>${site.whatWeDo.map((line) => html`<li>${line}</li>`)}</ul>
</section>
<section class="box">
<h2>${site.ownerHeading}</h2>
<p>${site.ownerText}</p>
</section>
${preReleaseBox(ctx)}
${faqSection(ctx.config)}`,
  );
}

/**
 * The public result. Built from the engine's public summary only: it has no
 * field that could carry anything about owner-only rules, and the sentence
 * about serious problems is the same for every site.
 */
export function resultPage(ctx: PageContext, summary: PublicSummary, target: string): string {
  const grade = summary.grade;
  return layout(
    ctx,
    site.resultHeading,
    html`<section class="result">
<h1>${site.resultHeading}</h1>
<dl class="meta">
<dt>${t.target}</dt><dd class="host">${cleanText(summary.host, 120)}</dd>
<dt>${t.scannedAt}</dt><dd>${JST.format(new Date(summary.scannedAt))}（日本時間）</dd>
</dl>
<p class="kicker">${t.basicGrade}<small>${site.gradeScope}</small></p>
<div class="grade grade-${grade}">
<span class="letter">${grade}</span>
<span class="label">${ja.publicGradeLabel[grade]}</span>
</div>
<ul class="facts">
<li>${t.basicCounts}: P1（${ja.severityLabel.P1}）${summary.counts.P1} ${t.countUnit} / P2（${ja.severityLabel.P2}）${summary.counts.P2} ${t.countUnit}</li>
<li>${t.coverageLine(summary.coverage.total, summary.coverage.checked, summary.coverage.partial)}</li>
${summary.coverage.error > 0 ? html`<li class="warn">${t.incomplete(summary.coverage.error)}</li>` : ''}
<li>${t.checksPublic}</li>
</ul>
<div class="box gated">
<h2>${site.ownerHeading}</h2>
<p>${t.seriousGated}</p>
<p>${t.sameForEverySite}</p>
<p><a class="button" href="/owner?u=${encodeURIComponent(target)}">${site.ownerLink}</a></p>
</div>
<p class="note">${t.disclaimer}</p>
<p class="note">${t.rulesVersion}: v${summary.rulesVersion}</p>
</section>
${preReleaseBox(ctx)}
<p><a href="/">${site.checkAgain}</a></p>`,
    { noindex: true },
  );
}

export function messagePage(ctx: PageContext, heading: string, message: string, formValue?: string): string {
  return layout(
    ctx,
    heading,
    html`<section class="message">
<h1>${heading}</h1>
<p>${message}</p>
</section>
${formValue === undefined ? html`<p><a href="/">${site.checkAgain}</a></p>` : checkForm(formValue)}`,
    { noindex: true },
  );
}

export function aboutPage(ctx: PageContext): string {
  const { config } = ctx;
  return layout(
    ctx,
    site.footerAbout,
    html`<article class="doc">
<h1>${site.footerAbout}</h1>
<p>url.jp.ai は、Web サイトのセキュリティ設定を無料で確かめられるサービスです。情報漏えいを心配して自社のサイトを持つことをためらう方が、まず現状を知るための入口として作りました。</p>
<h2>何をしているか</h2>
<p>入力されたページを、通常のブラウザーと同じように読み込みます。結果として公開するのは、誰でもブラウザーの開発者ツールで確認できる「基本設定」の評価だけです。キーの露出など重大な問題については、問題の有無にかかわらず、すべてのサイトで同じ案内を表示します。第三者が、他人のサイトの弱点を調べる道具として使えないようにするためです。</p>
<h2>オープンソース</h2>
<p>このサイトと、判定を行う検査エンジン（QA.JP.AI）は、どちらもソースコードを公開しています（AGPL-3.0）。何をどう判定しているかは、誰でも確かめられます。</p>
<ul>
<li><a href="${config.sourceUrl}">url.jp.ai のソースコード</a></li>
<li><a href="${config.engineSourceUrl}">検査エンジン（QA.JP.AI）のソースコード</a></li>
</ul>
<h2>お問い合わせ</h2>
<p>ご意見、誤った判定のご報告、セキュリティ上の問題のご報告は、<a href="mailto:${config.contactEmail}">${config.contactEmail}</a> までお送りください。</p>
</article>`,
  );
}

const ENACTED = '2026年11月20日';

export function termsPage(ctx: PageContext): string {
  const { config } = ctx;
  return layout(
    ctx,
    site.footerTerms,
    html`<article class="doc">
<h1>${site.footerTerms}</h1>
<p>この利用規約は、${config.operatorName}（以下「運営者」）が提供する url.jp.ai（以下「本サービス」）の利用条件を定めるものです。</p>
<h2>第1条（本サービスの内容）</h2>
<p>本サービスは、利用者が入力した Web ページを、通常のブラウザーと同等の方法で読み込み、基本的なセキュリティ設定を評価して表示する無料のサービスです。攻撃、ログインの試行、その他通常のページ表示を超えるアクセスは行いません。</p>
<h2>第2条（禁止事項）</h2>
<p>利用者は、次の行為をしてはなりません。</p>
<ol>
<li>法令または公序良俗に反する目的で本サービスを利用すること。</li>
<li>本サービスの結果を、他人のサイトへの攻撃や、その準備のために利用すること。</li>
<li>プログラム等を用いて大量の検査を行うなど、本サービスまたは検査先のサイトに過大な負荷をかけること。</li>
<li>本サービスの運営を妨げること。</li>
</ol>
<h2>第3条（所有者向けの検査）</h2>
<p>サイトの所有者であることを確認できた方には、詳しい検査結果を表示します。所有者向けの検査では、公開されていてはいけないファイルが公開されていないかを、数回のアクセスで確かめることがあります。利用者は、自らが所有するサイト、または検査について権限を持つ者から許可を得たサイトについてのみ、所有者の確認を行うものとします。他人になりすまして確認を行ってはなりません。</p>
<h2>第3条の2（検査結果）</h2>
<p>検査結果は、検査した時点で、検査した範囲について得られた評価です。サイトの安全性を保証するものではありません。検査していない項目があることは、結果の画面に表示します。</p>
<h2>第4条（回数の制限）</h2>
<p>運営者は、本サービスを安定して提供するため、検査の回数や同時に実行する検査の数を制限することがあります。</p>
<h2>第5条（免責）</h2>
<p>運営者は、本サービスの利用によって利用者または第三者に生じた損害について、法令で認められる範囲で、責任を負いません。</p>
<h2>第6条（サービスの変更・停止）</h2>
<p>運営者は、予告なく本サービスの内容を変更し、または提供を停止することがあります。</p>
<h2>第7条（規約の変更）</h2>
<p>運営者は、必要に応じてこの規約を変更することがあります。変更後の規約は、本サービス上に掲示した時点から効力を生じます。</p>
<h2>第8条（準拠法）</h2>
<p>この規約は、日本法に従って解釈されます。</p>
<p class="note">${ENACTED} 制定</p>
</article>`,
  );
}

export function privacyPage(ctx: PageContext): string {
  const { config } = ctx;
  const days = Math.round(config.limits.auditTtlMs / 86_400_000);
  const resultDays = Math.round(config.limits.resultTtlMs / 86_400_000);
  return layout(
    ctx,
    site.footerPrivacy,
    html`<article class="doc">
<h1>${site.footerPrivacy}</h1>
<p>${config.operatorName}（以下「運営者」）は、url.jp.ai（以下「本サービス」）で取得する情報を、次のとおり取り扱います。</p>
<h2>1. 取得する情報</h2>
<ul>
<li>入力された URL と、その検査結果（評価と件数）</li>
<li>検査を依頼した方の IP アドレスと、依頼した日時</li>
<li>所有者の確認にメールアドレスを使った場合は、そのメールアドレス</li>
<li>所有者向けの詳しい検査結果（問題の場所と内容）</li>
</ul>
<p>検査したページの内容そのものは保存しません。アカウント登録はありません。アクセス解析や広告のためのサービスは使用していません。</p>
<h2>Cookie</h2>
<p>Cookie は、所有者の確認を行う方にだけ使用します。確認の途中で使う識別子（最長 7 日間）と、確認できた状態を保つための識別子（最長 24 時間）の 2 つで、どちらも確認以外の目的には使いません。簡易チェックだけを利用する方には Cookie を使用しません。</p>
<h2>2. 利用目的</h2>
<ul>
<li>本サービスを提供するため（検査結果のページを表示するため）</li>
<li>回数の制限を行い、不正な利用を防止・調査するため</li>
<li>所有者の確認のため（確認メールの送信を含みます）</li>
</ul>
<h2>3. 保存期間</h2>
<p>検査結果は ${resultDays} 日間、IP アドレス・日時・確認に使ったメールアドレスの記録は ${days} 日間保存し、その後自動的に削除します。所有者向けの詳しい検査結果は、確認の有効期限（最長 24 時間）が過ぎると自動的に削除します。</p>
<h2>4. 第三者への提供</h2>
<p>法令に基づく場合を除き、取得した情報を第三者に提供しません。確認メールの送信は、メール送信サービス（Resend）に委託しています。委託先には、送信に必要な範囲（宛先のメールアドレスとメールの内容）だけを渡します。</p>
<h2>5. 検査結果のページ</h2>
<p>検査結果のページは、推測できない URL で表示します。検索エンジンには登録されないよう設定しています。ただし、その URL を知った人は誰でも閲覧できます。表示されるのは基本設定の評価だけです。</p>
<h2>6. お問い合わせ</h2>
<p>取り扱いについてのお問い合わせは、<a href="mailto:${config.contactEmail}">${config.contactEmail}</a> までお送りください。</p>
<p class="note">${ENACTED} 制定</p>
</article>`,
  );
}

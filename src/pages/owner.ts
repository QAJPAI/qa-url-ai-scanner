// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  type Assessment,
  type AssessmentRecord,
  cleanText,
  type Comparison,
  ja,
  renderFixRequest,
  renderSourceReview,
  sourceReviewRules,
  summarize,
} from 'qa-jp-ai-scanner';
import type { OwnerSession } from '../store/types';
import { type Html, html } from './html';
import { layout, type PageContext, preReleaseBox } from './pages';

const t = ja.report;
const c = ja.comparison;
/** The engine's report headings start with a mark for plain text; a page has real headings. */
const heading = (text: string) => text.replace(/^■ /, '');

const JST = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const when = (d: Date | string) => `${JST.format(new Date(d))}（日本時間）`;

export const ownerText = {
  startHeading: '所有者の確認',
  startIntro: (host: string) =>
    `${host} の所有者であることを確認できると、キーの露出など重大な問題の有無と、その場所・直し方をお見せします。次のいずれかの方法で確認してください。`,
  whatOwnerCheckDoes:
    '所有者向けの検査では、通常のページ表示に加えて、次の二つを行います。ページのスクリプトが後から読み込む別のスクリプト（画面を操作したときに読み込まれるもの）も読み、キーが含まれていないかを確かめます。公開されていてはいけないファイル（.env など）が公開されていないかを、数回のアクセスで確かめます。攻撃やログインの試行は行いません。',
  activeOff: '現在、運営者の設定により、ファイルの公開状況を確かめる検査は行っていません。',
  validity: '確認できた状態は、最長 24 時間、このブラウザーでだけ有効です。',
  emailHeading: '方法 1：サイトと同じドメインのメールアドレスで確認する',
  emailHelp: (domain: string) => `例：${domain} のサイトなら、info@${domain} のようなアドレスです。届いたメールのリンクを開いて確認します。`,
  emailLabel: 'メールアドレス',
  emailSubmit: '確認メールを送る',
  emailUnavailable: '現在、メールによる確認は利用できません。方法 2 または方法 3 をご利用ください。',
  fileHeading: '方法 2：確認ファイルを置く（AI に頼めます）',
  fileHelp:
    'ホスティングサービスのドメイン（〜.vercel.app など）のサイトや、同じドメインのメールアドレスがない場合に使えます。次の文章を、サイトを作った AI にそのまま貼り付けてください。',
  fileSubmit: 'ファイルを置いたので確認する',
  dnsHeading: '方法 3：DNS に TXT レコードを追加する',
  dnsHelp: 'DNS の設定に慣れている方向けです。',
  dnsSubmit: 'レコードを追加したので確認する',
  dnsNote: '反映まで数分から数時間かかることがあります。',
  mailSentHeading: '確認メールを送りました',
  mailSent: (email: string, minutes: number) =>
    `${email} 宛に確認メールを送りました。${minutes} 分以内にメールのリンクを開き、表示されたページのボタンを押してください。届かない場合は、迷惑メールのフォルダーもご確認ください。`,
  ineligibleHeading: 'このメールアドレスでは確認できません',
  mailFailed: '確認メールを送信できませんでした。時間をおいてもう一度お試しいただくか、方法 2 をご利用ください。',
  mailLimit: '確認メールの送信回数が上限に達しました。時間をおいてもう一度お試しいただくか、方法 2 をご利用ください。',
  confirmHeading: '所有者の確認',
  confirm: (host: string) => `${host} の詳しい検査結果を見るには、下のボタンを押してください。`,
  confirmWhy: 'メールのセキュリティ機能がリンクを自動で開いても確認が済んでしまわないよう、ボタンを押していただいています。',
  confirmSubmit: '詳しい結果を見る',
  linkInvalid: 'このリンクは使用済みか、有効期限が切れています。お手数ですが、もう一度確認メールを送ってください。',
  notVerifiedHeading: '確認できませんでした',
  fileNotFound: (path: string) =>
    `${path} に、指定した 1 行が見つかりませんでした。ファイルの場所と内容（この 1 行だけ）をご確認ください。本番環境に反映されているかもご確認ください。`,
  dnsNotFound: (name: string) =>
    `${name} に、指定した値の TXT レコードが見つかりませんでした。反映まで時間がかかることがあります。少し待ってから、もう一度お試しください。`,
  noVerifier: 'ブラウザーの Cookie が無効なため、確認を続けられません。Cookie を有効にして、もう一度お試しください。',
  verifyLimit: '確認の回数が上限に達しました。1 分ほど待ってから、もう一度お試しください。',
  sessionHeading: '所有者として確認できました',
  sessionMethod: { email: 'メールアドレス', file: '確認ファイル', dns: 'DNS レコード' } as const,
  sessionTarget: '対象',
  sessionHow: '確認の方法',
  sessionUntil: '有効期限',
  checkSubmit: '詳しい検査を始める',
  checkAgain: 'もう一度検査する',
  signOut: '確認を終了する',
  signedOutHeading: '確認を終了しました',
  signedOut: '詳しい結果は、もう表示されません。もう一度見るには、所有者の確認からやり直してください。',
  gradeScope: (total: number, examined: number) => `検査した範囲（全 ${total} 項目のうち ${examined} 項目）についての評価です。検査していない項目は含まれていません。`,
  sessionMissing: '所有者の確認が済んでいないか、有効期限が切れています。もう一度確認してください。',
  checkLimit: '検査の回数が上限に達しました。しばらく時間をおいてから、もう一度お試しください。',
  reportHeading: '詳しい検査結果（所有者向け）',
  reportPrivate: 'この結果は、所有者として確認したこのブラウザーでだけ、確認の有効期限まで表示できます。問題の場所が書かれているため、共有しないでください。',
  verifiedBy: (how: string, email?: string) => `確認の方法: ${how}${email ? `（${email}）` : ''}`,
  findingsNone: '今回の検査範囲では、問題は見つかりませんでした。',
  needsNone: 'ありません。',
  coverageRule: 'ルール',
  coverageStatus: '状態',
  changesHeading: '前回からの変化',
  changesIntro: (previous: string) =>
    `最初の検査: ${previous}。もう一度検査するたびに、この確認で最初に行った検査からの変化を表示します。`,
  changesStillBelow: '詳しい内容は、下の「見つかった問題」に表示しています。',
  fixHeading: 'AI に修正を依頼する',
  fixIntro:
    '見つかった問題の直し方を、AI コーディングツール（Claude Code、Cursor など）にそのまま渡せる文章にまとめました。問題ごとの手順と、AI に守ってほしいことが書かれています。',
  fixSteps: [
    'サイトを作ったプロジェクトを AI コーディングツールで開き、下の枠の文章をすべてコピーして貼り付けます（枠の中を押すと、全体が選択されます）。',
    'AI の説明を確認しながら修正を進め、サイトを公開し直します。キーの無効化と再発行は、ご自身で発行元の管理画面から行ってください。',
    'このページの「もう一度検査する」を押します。修正を確認できた項目が「前回からの変化」に表示されます。',
  ],
  fixWindow: (until: string) =>
    `修正の確認は、所有者の確認が有効な間（${until} まで）に、このブラウザーでもう一度検査すると表示されます。有効期限を過ぎたあとは、所有者の確認からやり直すと検査できますが、今回の結果との比較は表示されません。`,
  fixPrivate: 'この文章には、問題の場所が書かれています。修正を依頼する AI コーディングツール以外には、共有しないでください。',
  sourceHeading: 'URL から調べられない項目を、ソースコードで確認する',
  sourceIntro: (total: number, count: number) =>
    `この検査は、公開中のサイトを外側から見るものです。全 ${total} 項目のうち次の ${count} 項目は、外側からは調べられないか、URL 検査がまだ対応していません。上の表では「未検査」と表示されています。ソースコードがあれば、AI コーディングツール（Claude Code、Cursor など）で確認できます。`,
  sourceSteps: [
    'サイトを作ったプロジェクトを AI コーディングツールで開き、下の枠の文章をすべてコピーして貼り付けます（枠の中を押すと、全体が選択されます）。',
    'AI が QA.JP.AI の「公開前チェック」を実行します。キーの混入やデータベースのアクセス制御など、ツールが根拠を確認できる問題は、ここで確定します。このツールが、コードを外部に送ることはありません。',
    '続けて、AI がコードを読んで下の項目を確認し、「AI による確認」として報告します。',
  ],
  sourceNotOurResult:
    '「AI による確認」は、AI がコードを読んで出した判断で、QA.JP.AI のツールの検査結果ではありません。このページの評価と検査範囲には反映されず、これらの項目は「未検査」のままです。',
  sourceGuide: '公開前チェックの使い方',
};

function startPart(target: string): Html {
  return html`<input type="hidden" name="u" value="${target}">`;
}

export interface StartOptions {
  target: string;
  host: string;
  domain: string;
  fileToken: string;
  fileUrl: string;
  dns?: { name: string; value: string };
  emailAvailable: boolean;
  activeChecks: boolean;
}

export function ownerStartPage(ctx: PageContext, o: StartOptions): string {
  const o_ = ownerText;
  return layout(
    ctx,
    o_.startHeading,
    html`<section>
<h1>${o_.startHeading}</h1>
<p>${o_.startIntro(cleanText(o.host, 120))}</p>
<p class="note">${o_.whatOwnerCheckDoes}${o.activeChecks ? '' : o_.activeOff}</p>
<p class="note">${o_.validity}</p>
</section>
<section class="box">
<h2>${o_.emailHeading}</h2>
${
  o.emailAvailable
    ? html`<p>${o_.emailHelp(o.domain)}</p>
<form class="check" method="post" action="/owner/email">
${startPart(o.target)}
<label for="email">${o_.emailLabel}</label>
<div class="row">
<input id="email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="info@${o.domain}">
<button type="submit">${o_.emailSubmit}</button>
</div>
</form>`
    : html`<p>${o_.emailUnavailable}</p>`
}
</section>
<section class="box">
<h2>${o_.fileHeading}</h2>
<p>${o_.fileHelp}</p>
<pre class="copy">${ja.ownership.aiPrompt(o.fileToken)}</pre>
<p class="note">${o.fileUrl}</p>
<form method="post" action="/owner/file">${startPart(o.target)}<button type="submit" class="secondary">${o_.fileSubmit}</button></form>
</section>
${
  o.dns
    ? html`<section class="box">
<h2>${o_.dnsHeading}</h2>
<p>${o_.dnsHelp}</p>
<pre class="copy">${ja.ownership.dnsInstruction(o.dns.name, o.dns.value)}</pre>
<p class="note">${o_.dnsNote}</p>
<form method="post" action="/owner/dns">${startPart(o.target)}<button type="submit" class="secondary">${o_.dnsSubmit}</button></form>
</section>`
    : ''
}`,
    { noindex: true },
  );
}

export function confirmPage(ctx: PageContext, host: string, token: string): string {
  return layout(
    ctx,
    ownerText.confirmHeading,
    html`<section>
<h1>${ownerText.confirmHeading}</h1>
<p>${ownerText.confirm(cleanText(host, 120))}</p>
<form method="post" action="/owner/login">
<input type="hidden" name="t" value="${token}">
<button type="submit">${ownerText.confirmSubmit}</button>
</form>
<p class="note">${ownerText.confirmWhy}</p>
</section>`,
    { noindex: true },
  );
}

export function sessionPage(ctx: PageContext, session: OwnerSession, host: string, activeChecks: boolean): string {
  const o_ = ownerText;
  return layout(
    ctx,
    o_.sessionHeading,
    html`<section>
<h1>${o_.sessionHeading}</h1>
<dl class="meta">
<dt>${o_.sessionTarget}</dt><dd class="host">${cleanText(host, 120)}</dd>
<dt>${o_.sessionHow}</dt><dd>${o_.sessionMethod[session.method]}${session.email ? `（${session.email}）` : ''}</dd>
<dt>${o_.sessionUntil}</dt><dd>${when(session.expiresAt)}</dd>
</dl>
<p>${o_.whatOwnerCheckDoes}${activeChecks ? '' : o_.activeOff}</p>
<form method="post" action="/owner/check"><button type="submit">${o_.checkSubmit}</button></form>
</section>
${signOutForm()}`,
    { noindex: true },
  );
}

function signOutForm(): Html {
  return html`<form method="post" action="/owner/sign-out" class="signout"><button type="submit" class="secondary">${ownerText.signOut}</button></form>`;
}

function finding(r: Extract<AssessmentRecord, { verdict: 'confirmed' }>): Html {
  const text = ja.findingTextFor(r.layer, r.code);
  return html`<li class="finding sev-${r.severity}">
<p class="title"><span class="sev">${r.severity}・${ja.severityLabel[r.severity]}</span> ${text?.title ?? r.code}（${r.ruleId}）</p>
<dl>
<dt>${t.location}</dt><dd>${cleanText(r.location)}</dd>
<dt>${t.evidence}</dt><dd>${cleanText(r.evidence)}</dd>
<dt>${t.fix}</dt><dd>${text?.fix ?? '-'}</dd>
</dl>
</li>`;
}

function question(r: Extract<AssessmentRecord, { verdict: 'needs_validation' }>): Html {
  const text = ja.needsValidationText[r.code];
  return html`<li class="finding">
<p class="title">${text?.title ?? r.code}（${r.ruleId}）</p>
<dl>
<dt>${t.location}</dt><dd>${cleanText(r.location)}</dd>
<dt>${t.evidence}</dt><dd>${cleanText(r.evidence)}</dd>
<dt>${t.reason}</dt><dd>${ja.blockerLabel[r.blocker]}</dd>
<dt>${t.whatToCheck}</dt><dd>${text?.plan ?? '-'}</dd>
</dl>
</li>`;
}

type Confirmed = Extract<AssessmentRecord, { verdict: 'confirmed' }>;

/** One line of "what changed": the problem, where it was, and one remark (a note or a reason). */
function change(r: Confirmed, remark?: { label: string; text: string }): Html {
  const text = ja.findingTextFor(r.layer, r.code);
  return html`<li class="finding sev-${r.severity}">
<p class="title"><span class="sev">${r.severity}・${ja.severityLabel[r.severity]}</span> ${text?.title ?? r.code}（${r.ruleId}）</p>
<dl>
<dt>${t.location}</dt><dd>${cleanText(r.location)}</dd>
${remark ? html`<dt>${remark.label}</dt><dd>${remark.text}</dd>` : ''}
</dl>
</li>`;
}

function changeList(title: string, items: Html[], after?: string): Html {
  return html`<h3>${heading(title)}</h3>
${items.length === 0 ? html`<p class="none">${c.none}</p>` : html`<ol class="findings">${items}</ol>${after ? html`<p class="note">${after}</p>` : ''}`}`;
}

/**
 * What changed since the first check of this session. Every judgement here
 * is the engine's (compareAssessments); the page only lays it out.
 */
function changesSection(cmp: Comparison): Html {
  const bySeverity = (a: Confirmed, b: Confirmed) => a.severity.localeCompare(b.severity);
  const fixed = [...cmp.fixed].sort(bySeverity).map((r) => {
    const note = ja.afterFixNoteFor(r.layer, r.code);
    return change(r, note ? { label: c.note, text: note } : undefined);
  });
  const unverified = [...cmp.unverified]
    .sort((a, b) => bySeverity(a.record, b.record))
    .map((u) => change(u.record, { label: c.reason, text: ja.unverifiedReasonLabelFor(u.record.layer, u.reason) }));
  return html`<section class="box changes">
<h2>${ownerText.changesHeading}</h2>
<p class="note">${ownerText.changesIntro(when(cmp.previousAt))}</p>
${cmp.toolChanged ? html`<p class="warn">${c.toolChanged}</p>` : ''}
${changeList(c.fixedHeading(cmp.fixed.length), fixed)}
${changeList(c.unverifiedHeading(cmp.unverified.length), unverified)}
${changeList(c.stillHeading(cmp.stillPresent.length), [...cmp.stillPresent].sort(bySeverity).map((r) => change(r)), ownerText.changesStillBelow)}
${changeList(c.newHeading(cmp.newConfirmed.length), [...cmp.newConfirmed].sort(bySeverity).map((r) => change(r)), ownerText.changesStillBelow)}
<h3>${heading(c.questionsHeading)}</h3>
<p>${c.questionsLine(cmp.questionsResolved.length, cmp.questionsOpen.length, cmp.questionsNew.length, cmp.questionsUnverified.length)}</p>
<p class="note">${c.meaning}</p>
</section>`;
}

/** The request to paste into an AI coding tool. The text is the engine's; shown when there is something to fix. */
function fixRequestSection(assessment: Assessment, session: OwnerSession): Html {
  return html`<section>
<h2>${ownerText.fixHeading}</h2>
<p>${ownerText.fixIntro}</p>
<ol class="steps">${ownerText.fixSteps.map((step) => html`<li>${step}</li>`)}</ol>
<pre class="copy fixrequest" tabindex="0">${renderFixRequest(assessment)}</pre>
<p class="note">${ownerText.fixPrivate}</p>
<p class="note">${ownerText.fixWindow(when(session.expiresAt))}</p>
</section>`;
}

/**
 * The next step for the rules a site check cannot examine. Which rules, and
 * the text to paste, are the engine's. The text names rules only: nothing of
 * this site's result is in it.
 */
function sourceReviewSection(ctx: PageContext, assessment: Assessment): Html | undefined {
  const rules = sourceReviewRules(assessment);
  if (rules.length === 0) return undefined;
  return html`<section>
<h2>${ownerText.sourceHeading}</h2>
<p>${ownerText.sourceIntro(assessment.coverage.length, rules.length)}</p>
<ul class="rules">${rules.map((u) => html`<li>${u.ruleId} ${ja.ruleTitle[u.ruleId]}</li>`)}</ul>
<ol class="steps">${ownerText.sourceSteps.map((step) => html`<li>${step}</li>`)}</ol>
<pre class="copy fixrequest sourcereview" tabindex="0">${renderSourceReview(assessment)}</pre>
<p class="note">${ownerText.sourceNotOurResult}</p>
<p><a href="${ctx.config.preReleaseGuideUrl}">${ownerText.sourceGuide}</a></p>
</section>`;
}

function coverageDetail(unit: Assessment['coverage'][number]): string {
  if (unit.status === 'not_run' && unit.reason) return ja.notRunReasonLabel[unit.reason];
  if (unit.status === 'partial' && unit.note) return ja.coverageNoteLabel[unit.note];
  if (unit.status === 'error' && unit.passive?.note) return ja.coverageNoteLabel[unit.passive.note];
  return '';
}

/**
 * The owner's detailed result. Rendered only after the caller has checked that
 * this session ran it and that the session's proof still covers the site.
 */
export function ownerReportPage(
  ctx: PageContext,
  assessment: Assessment,
  session: OwnerSession,
  comparison?: Comparison,
): string {
  const s = summarize(assessment, 'owner');
  // Say what actually ran: with active checks switched off, only page-view-level access did.
  const ranActive = assessment.coverage.some((u) => u.mode === 'active');
  const host = assessment.target.layer === 'url' ? assessment.target.host : assessment.target.ref;
  const confirmed = assessment.records
    .filter((r): r is Extract<AssessmentRecord, { verdict: 'confirmed' }> => r.verdict === 'confirmed')
    .sort((a, b) => a.severity.localeCompare(b.severity));
  const questions = assessment.records.filter(
    (r): r is Extract<AssessmentRecord, { verdict: 'needs_validation' }> => r.verdict === 'needs_validation',
  );
  // Where this is shown it says everything the general pointer to the pre-release check would.
  const sourceReview = sourceReviewSection(ctx, assessment);
  return layout(
    ctx,
    ownerText.reportHeading,
    html`<section class="result">
<h1>${ownerText.reportHeading}</h1>
<dl class="meta">
<dt>${t.target}</dt><dd class="host">${cleanText(host, 120)}</dd>
<dt>${t.scannedAt}</dt><dd>${when(assessment.startedAt)}</dd>
</dl>
<p class="note">${ownerText.verifiedBy(ownerText.sessionMethod[session.method], session.email)}</p>
<p class="kicker">${t.grade}<small>${ownerText.gradeScope(s.coverage.total, s.coverage.checked + s.coverage.partial)}</small></p>
<div class="grade grade-${s.grade}">
<span class="letter">${s.grade}</span>
<span class="label">${ja.gradeLabel[s.grade]}</span>
</div>
<ul class="facts">
<li>${t.counts}: P0（${ja.severityLabel.P0}）${s.counts.P0} ${t.countUnit} / P1（${ja.severityLabel.P1}）${s.counts.P1} ${t.countUnit} / P2（${ja.severityLabel.P2}）${s.counts.P2} ${t.countUnit}</li>
<li>${t.needsValidationCount}: ${s.needsValidation} ${t.countUnit}</li>
<li>${t.coverageLine(s.coverage.total, s.coverage.checked, s.coverage.partial)}</li>
${s.coverage.error > 0 ? html`<li class="warn">${t.incomplete(s.coverage.error)}</li>` : ''}
<li>${ranActive ? t.checksOwner : t.checksPublic}</li>
</ul>
<p class="box gated">${ownerText.reportPrivate}</p>
</section>
${comparison ? changesSection(comparison) : ''}
<section>
<h2>${heading(t.findingsHeading)}</h2>
${confirmed.length === 0 ? html`<p>${ownerText.findingsNone}</p>` : html`<ol class="findings">${confirmed.map(finding)}</ol>`}
</section>
<section>
<h2>${heading(t.needsValidationHeading)}</h2>
${questions.length === 0 ? html`<p>${ownerText.needsNone}</p>` : html`<ol class="findings">${questions.map(question)}</ol>`}
</section>
${confirmed.length > 0 ? fixRequestSection(assessment, session) : ''}
<section>
<h2>${heading(t.coverageHeading)}</h2>
<table class="coverage">
<thead><tr><th>${ownerText.coverageRule}</th><th>${ownerText.coverageStatus}</th></tr></thead>
<tbody>
${assessment.coverage.map(
  (u) => html`<tr><td>${u.ruleId} ${ja.ruleTitle[u.ruleId]}</td><td>${ja.coverageStatusLabel[u.status]}${coverageDetail(u) ? `（${coverageDetail(u)}）` : ''}</td></tr>`,
)}
</tbody>
</table>
<p class="note">${t.disclaimer}</p>
<p class="note">${t.rulesVersion}: v${assessment.rulesVersion}</p>
</section>
${sourceReview ?? ''}
<form method="post" action="/owner/check"><button type="submit">${ownerText.checkAgain}</button></form>
${signOutForm()}
${sourceReview ? '' : preReleaseBox(ctx)}`,
    { noindex: true },
  );
}

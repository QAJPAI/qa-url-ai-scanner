// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  type Assessment,
  ASSESSMENT_SCHEMA,
  type AssessmentRecord,
  buildLedger,
  compareAssessments,
  type Comparison,
  ENGINE_VERSION,
  ja,
  recordFactory,
  renderFixRequest,
  RULES_VERSION,
  servedTextReader,
} from 'qa-jp-ai-scanner';
import { type Html, html } from './html';
import { changesSection, coverageTable, finding, gradeSummary, ownerText, question } from './owner';
import { layout, type PageContext } from './pages';
import { site } from './text';

/**
 * The sample result: what a verified owner sees, shown before anyone types a
 * URL.
 *
 * It is a made-up site, and says so on the page. Everything else is the real
 * thing: the two assessments below are built with the engine's own record
 * factory and coverage ledger, they mirror what the engine reports for its
 * case site (`evals/case-site` in the engine), every sentence about a problem
 * is the engine's, "what changed" is decided by the engine's
 * compareAssessments(), and the page is laid out by the same functions as a
 * real owner result. So the sample cannot promise something a real result
 * does not show.
 */

/** Reserved for documentation (JPRS): no real site answers here. */
export const SAMPLE_HOST = 'example.jp';
const ORIGIN = `https://${SAMPLE_HOST}`;
const SCRIPT = `${ORIGIN}/assets/app.js`;

/** The first check was this long before the re-check. */
const BETWEEN_CHECKS_MS = 40 * 60_000;

type Confirmed = Extract<AssessmentRecord, { verdict: 'confirmed' }>;
type Question = Extract<AssessmentRecord, { verdict: 'needs_validation' }>;

export interface SampleCheck {
  /** The first check: a key in the front-end code, two headers missing, one question. */
  before: Assessment;
  /** The same site after the owner published a fix for the key and one header. */
  after: Assessment;
  /** What the engine says changed between the two. */
  comparison: Comparison;
}

function assessment(startedAt: Date, fixed: boolean): Assessment {
  const secrets = recordFactory('url.secrets', 'url', 'passive');
  const baas = recordFactory('url.baas-hint', 'url', 'passive');
  const transport = recordFactory('url.transport', 'url', 'passive');

  const key = secrets.confirmed({
    ruleId: 'R02',
    code: 'secret.supabase_service_role',
    key: 'sample-service-role',
    location: `${SCRIPT} (offset 341)`,
    evidence: ja.evidence.redactedSecret('eyJhbG', 195),
    severity: 'P0',
  });
  const csp = transport.confirmed({
    ruleId: 'R14',
    code: 'header.csp_missing',
    key: 'csp',
    location: `${ORIGIN}/`,
    evidence: ja.evidence.missingHeader('Content-Security-Policy'),
    severity: 'P2',
  });
  const framing = transport.confirmed({
    ruleId: 'R14',
    code: 'header.clickjacking',
    key: 'clickjacking',
    location: `${ORIGIN}/`,
    evidence: ja.evidence.missingHeader('X-Frame-Options / frame-ancestors'),
    severity: 'P2',
  });
  const rls = baas.needsValidation({
    ruleId: 'R01',
    code: 'baas.supabase_rls_unverified',
    key: 'supabase',
    location: SCRIPT,
    evidence: ja.evidence.directConnection('Supabase'),
    blocker: 'not_observable_from_outside',
  });

  return {
    schema: ASSESSMENT_SCHEMA,
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    target: { layer: 'url', host: SAMPLE_HOST },
    tier: 'owner',
    startedAt: startedAt.toISOString(),
    // The fix removed the key and added a CSP. One header is still missing, and
    // the question stays: the site still talks to Supabase from the browser.
    records: fixed ? [rls, framing] : [key, rls, csp, framing],
    coverage: buildLedger('url', [
      { checker: 'url.baas-hint', mode: 'passive', reports: [{ ruleId: 'R01', status: 'partial', note: 'presence_hint_only' }] },
      { checker: 'url.secrets', mode: 'passive', reports: [{ ruleId: 'R02', status: 'partial', note: 'html_referenced_scripts_only' }] },
      { checker: 'url.exposed-files', mode: 'active', reports: [{ ruleId: 'R11', status: 'checked' }] },
      { checker: 'url.transport', mode: 'passive', reports: [{ ruleId: 'R14', status: 'checked' }] },
    ]),
  };
}

/** The sample as of `now`: a first check a little while ago, and a re-check just now. */
export function sampleCheck(now: Date): SampleCheck {
  const before = assessment(new Date(now.getTime() - BETWEEN_CHECKS_MS), false);
  const after = assessment(now, true);
  // The re-check read the page and every script in full, as a real one of this site would.
  const wasRead = servedTextReader({ everythingRead: true, textsRead: new Set([`${ORIGIN}/`, SCRIPT]) });
  return { before, after, comparison: compareAssessments(before, after, { wasRead }) };
}

const confirmedOf = (a: Assessment): Confirmed[] =>
  a.records.filter((r): r is Confirmed => r.verdict === 'confirmed').sort((x, y) => x.severity.localeCompare(y.severity));
const questionsOf = (a: Assessment): Question[] => a.records.filter((r): r is Question => r.verdict === 'needs_validation');
/** The engine's report headings start with a mark for plain text; a page has real headings. */
const heading = (text: string) => text.replace(/^■ /, '');

const notice = (): Html => html`<p class="box sample-note" role="note">${site.sample.notice(SAMPLE_HOST)}</p>`;

/** On the home page: the most serious problem of the sample, and where the rest is. */
export function sampleTeaser(now: Date): Html {
  const { before, comparison } = sampleCheck(now);
  const [worst] = confirmedOf(before);
  return html`<section class="box sample">
<h2>${site.sample.heading}</h2>
<p>${site.sample.teaserIntro(SAMPLE_HOST)}</p>
${worst ? html`<ul class="findings plain">${finding(worst)}</ul>` : ''}
<p>${site.sample.teaserAfter(heading(ja.comparison.fixedHeading(comparison.fixed.length)))}</p>
<p><a class="button secondary" href="/sample">${site.sample.link}</a></p>
</section>`;
}

/** The whole sample: the first result, the fix request, and the re-check after the fix, each in the order a real result has. */
export function samplePage(ctx: PageContext, now: Date): string {
  const t = ja.report;
  const { before, after, comparison } = sampleCheck(now);
  const confirmed = confirmedOf(before);
  const questions = questionsOf(before);
  return layout(
    ctx,
    site.sample.heading,
    html`<section class="result">
<h1>${site.sample.heading}</h1>
${notice()}
<p>${site.sample.intro}</p>
</section>
<p class="step">${site.sample.step1}</p>
<section class="result">
<dl class="meta">
<dt>${t.target}</dt><dd class="host">${site.sample.target(SAMPLE_HOST)}</dd>
</dl>
${gradeSummary(before)}
</section>
<section>
<h2>${heading(t.findingsHeading)}</h2>
<ol class="findings">${confirmed.map(finding)}</ol>
</section>
<section>
<h2>${heading(t.needsValidationHeading)}</h2>
<ol class="findings">${questions.map(question)}</ol>
</section>
<section>
<h2>${heading(t.coverageHeading)}</h2>
${coverageTable(before)}
<p class="note">${t.disclaimer}</p>
</section>
<p class="step">${site.sample.step2}</p>
<section>
<h2>${ownerText.fixHeading}</h2>
<p>${ownerText.fixIntro}</p>
<pre class="copy fixrequest" tabindex="0">${renderFixRequest(before)}</pre>
</section>
<p class="step">${site.sample.step3}</p>
<p>${site.sample.recheckIntro}</p>
<section class="result">
${gradeSummary(after)}
</section>
${changesSection(comparison)}
<section>
<h2>${heading(t.findingsHeading)}</h2>
<ol class="findings">${confirmedOf(after).map(finding)}</ol>
</section>
${notice()}
<p><a class="button" href="/">${site.sample.tryIt}</a></p>`,
  );
}

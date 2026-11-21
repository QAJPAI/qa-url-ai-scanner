# Lessons (url.jp.ai)

## A safeguard that changes nothing when removed

2026-11-20: four of 23 safeguards could be removed without any test failing.
Two were redundant (the platform already did it), one duplicated another check,
and two were real but untested.

- Rule: when removing a guard breaks no test, decide which it is. Redundant or
  duplicate: delete it (less code to trust). Real: write the test that fails
  without it.
- Rule: a test must fail, not hang, when its guard is removed. Give waits a
  deadline and always release what the test holds.

## A grade is read as a verdict on the whole site

2026-11-20: the result page showed a large green "A" for basic configuration
only. Seen in a browser, it said "safe".

- Rule: look at every page that shows a verdict, and label what the verdict
  covers next to it, in the same place.

## Tests that set headers by hand cannot see what browsers do

2026-11-20: every form was refused in a real browser, while all tests passed.
`Referrer-Policy: no-referrer` makes browsers send `Origin: null` on form
posts; the tests set `Origin` themselves.

- Rule: walk every form in a real browser before calling a page done, and turn
  what the browser actually sent into a test.
- Rule: a security header can change how other security checks see requests.
  When changing one, test the flows it touches, not only the header.

## Commands for the user start from a known place (2026-11-20)
- I wrote "run `node dist/qa-scan.mjs`" while the user was in the other repo; it failed twice.
- Rule: every command I hand over runs from anywhere — an absolute path (`node ~/Claude/QA/qa-jp-ai-scanner/dist/qa-scan.mjs …`) or a `cd` in the same line.

## A fixed test date is a time bomb when anything reads the real clock (2026-11-22)
- Owner tests issued proofs at a fixed test date (2026-11-20 03:00 UTC) but checked
  them with the engine's `proofCovers()`, which defaults to `Date.now()`. 24 hours
  later every proof looked expired and 6 tests failed, with no code change.
- Rule: when tests use a fake clock, pass that clock to every function that takes
  a time, including the engine's. Grep the tests for calls that default to now.

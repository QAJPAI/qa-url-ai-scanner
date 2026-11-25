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

## Commands for the user must not assume the state of their machine (2026-11-24)
- I gave `git checkout main && git pull && git tag … && git push origin …` to tag a release. The owner's local `main` had one unpushed commit, so `git pull` stopped on divergent branches. The `&&` chain kept anything wrong from happening, but the tag was not made.
- Rule: when a command only needs what is on GitHub, name it directly (`git fetch origin && git tag vX.Y.Z origin/main && git push origin vX.Y.Z`) and leave local branches alone. Never route a release step through `git pull` on a machine I cannot see. Keep chaining with `&&` so a failed step stops the rest.

## A procedure nobody has run is a draft (2026-11-26)
- The first server procedure (2026-11-22) was written from reading the files. The owner found it hard to follow and asked for a second review. Run on a clean machine, it failed at `nginx -t` on Ubuntu 24.04's stock nginx, and `deploy.sh` could print OK while the app was crash-looping, because another program answered on the port.
- Rule: before handing over a procedure, run every command of it on a clean machine as an unprivileged user, and write down what could not be run there (certbot, DNS, mail) as "not verified".
- Rule: a health check must prove identity and stability, not reachability: ask the app's own endpoint, and require the process manager to report the same process, still up, a few seconds later.
- Rule: validate settings with the program's own rules before restarting it. A typing mistake must fail the command, not the running service.
- Rule: check the facts a step depends on rather than the user's report of them ("the tag is made"): `v0.12.0` existed but pointed at the commit of `v0.11.0`.


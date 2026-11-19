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

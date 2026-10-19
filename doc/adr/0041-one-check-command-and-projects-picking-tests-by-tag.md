# 41. One check command, Playwright projects pick tests by tag, and flaky tests leave the gate

- **Status:** accepted, 2026-10-20
- **Applies to:** `package.json`, `playwright.config.ts`, `e2e/skip-gate.ts`, `tests/playwright-projects.test.ts`, the spec files' tags

## Context

Each session ran the build, the unit suite and Playwright by hand before a
merge and counted the skipped tests itself. The projects picked spec files
by name, so the phone ran only `mobile`, `screenshots`, `columns` and
`board`, and `keyboard` because the pattern `board` matched it; a phone
bug's test written into `regressions.spec.ts` never ran on the phone. Martin
approved the proposal on the Testing card on 2026-10-19.

## Decision

**`npm run check` is the merge gate.** It builds, runs the unit suite and
every Playwright project (desktop, phone, iPhone, Firefox). A reporter,
`e2e/skip-gate.ts`, fails the run when a test is skipped in a project that
its `expectedSkips` list does not name; the list holds the touch and
clipboard tests that need Chromium. Under `CHECK=1` a `test.only` fails the
run too.

**Projects pick tests by tag.** Untagged tests run on desktop Chromium.
`@phone` also runs on the Pixel phone, `@touch` runs only on the phones
(Pixel and iPhone), `@keys` also runs in Firefox and in WebKit when
`WEBKIT=1`. The tags were given so that each project runs the same 278
tests as before, `keyboard` on the phone included. A unit test lists the
projects with `playwright test --list` and fails when a spec file runs in
none of them.

**The performance tests run in a project of their own**, tagged
`@performance`, which depends on every other project and so starts once
they are done, its two tests one after the other, each retried up to
twice. Under the full run they missed their 50 ms budget with the machine
loaded and passed alone; other sessions' suites load the machine even when this one runs
nothing else, so a slowdown counts only when all three tries see it.

**The sync tests' servers stop for sure.** `e2e/sync-server.ts` starts
again at another random port when the first is taken (it was, once, in a
full run), and kills a server still running 3 s after SIGTERM. In 320 runs
of `sync.spec.ts` under load three servers were still running then,
because `server.close()` waits for the browsers' open connections; the
afterEach hook used to wait for them until the test's 30 s ran out, as
the test "the CLI and the app see each other's changes" once did. The
server's own fix is a card of its own, as it changes `server/`.

**A new test runs with `--repeat-each 5` before a merge.**

**No CI on GitHub.** The repository is private, the suite needs the
Playwright image, and every merge already runs the suite on this machine.

## Consequences

A tag is one more thing to remember when writing a test, and nothing
catches a phone test that lacks `@phone`; it runs on desktop only. A new
Chromium-only skip has to be added to `expectedSkips` by name.

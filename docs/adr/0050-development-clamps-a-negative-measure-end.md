# 0050 — Development clamps a negative measure end

Adds to ADR 0023 (`src/instrumentation-client.ts`). Production is unchanged.

## Context

In development, React draws each Server Component on a „Server Components“
track of the browser's performance panel. It places the server's times on
the page's clock: the server's time origin, less the page's. Node's clock
stops while the machine sleeps, so after a laptop suspend a `pnpm dev`
started the day before is hours behind wall time, and every placed time is
negative.

React clamps a negative start to zero. For a component whose render was
rejected (a redirect to sign-in, `notFound`, a `PageFailure`) or aborted, it
does not clamp the end, and `performance.measure` throws a TypeError on a
negative end. The dev overlay shows „Performance.measure: Given attribute end
cannot be negative“ in place of the redirect or error behind it, until the dev
server restarts. Next.js 16.4.3, 16.5 canary and React's main branch all
still pass the end unclamped.

## Decision

1. **In development, `instrumentation-client.ts` wraps
   `performance.measure`.** A call whose options carry a numeric `end` below
   zero is measured with `end: 0`, as React treats the start. Every other
   call goes through unchanged.
2. **Production never runs it.** The call sits behind `NODE_ENV`, which
   Next.js inlines, so a production build drops it. The file joins the
   list ESLint lets read `process.env` for that constant only.
3. **Remove it once React clamps the end** of an errored or aborted
   component in `ReactFlightPerformanceTrack`.

## Consequences

- A dev server that outlived a suspend shows the real redirect or error.
  Its Server Components entries still sit at the start of the timeline,
  since their times are wrong; restarting the dev server corrects them.
- Nothing else the page measures changes, and the file still imports zod
  only.

## Options rejected

- **A `pnpm patch` of Next.js's compiled Flight client.** It fixes the line
  that throws, but it has to be made again on every Next.js release, which
  this project takes as soon as one ships, and the image build has to copy
  the patch before `pnpm install`.
- **Restarting the dev server after every suspend.** It works, but nothing
  says so: the overlay names `performance.measure`, not the clock.

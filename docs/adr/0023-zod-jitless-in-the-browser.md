# 0023 — Zod runs jitless in the browser

Supersedes in part: ADR 0004 (the layer table gains a root module,
`src/instrumentation-client.ts`, which may import zod only).

## Context

The people search box (M8, ADR 0019) parses the search route's answer in the
browser with the `directorySearchResponse` contract, so contracts are built
on the client for the first time. Zod 4 probes `new Function('')` when it
builds an object schema, to choose its compiled fast path. The page's policy
(ADR 0012 item 7) has no `'unsafe-eval'`: the probe's throw is caught, but the
browser still reports a violation, and every end-to-end test fails on one.

Switching the probe off inside the first module that builds a schema works
only while that module is evaluated first. Any later client import of a
contract value, or of a snapshot value through `document/`, could be
evaluated earlier and bring the violation back.

## Decision

1. `src/instrumentation-client.ts` (the Next.js client instrumentation file,
   run before hydration) calls zod's `config({ jitless: true })`. Every
   schema built in the browser skips the probe, whichever module builds it.
2. The file imports zod's core only; dependency-cruiser keeps it that way
   (`instrumentation-client-is-light`) and exempts it from the orphan rule
   like `instrumentation.ts`.
3. The server is untouched: it never loads the file and keeps the fast path.

## Options rejected

- **`'unsafe-eval'` in the policy.** It reopens what the nonce policy closes,
  for a speed-up the browser does not need on a few small answers.
- **A side-effect import at the top of `contracts/index.ts`.** It misses
  schemas built through `document/` and `snapshot/`, and makes the barrel
  impure for tree shaking.
- **A hand-written parser for the search answer.** A second reader of a wire
  shape the contract already states, which can drift from it.

## Consequences

- Client parsing is slower than the compiled path; the answers parsed there
  are a few hundred bytes.
- Code that needs a setting before any client module runs goes in this file,
  synchronous and light: Next.js warns when it takes longer than 16 ms.

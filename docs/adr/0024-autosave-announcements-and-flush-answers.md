# 0024 — Autosave: one announcement, flush answers while the page lives

Supersedes in part: ADR 0017 item 5 (the result of a flush is dropped) and
item 7 (the four states are announced through `LiveStatus`).

## Context

Building the autosave hook (M8, row 27) showed two places where ADR 0017's
wording does not hold.

Item 7 has the four states that need the author (failed, conflict, locked,
signedOut) announced through `LiveStatus`, while design §8 makes their
banners `role=alert`. Both together say each sentence twice. `LiveStatus` also
shows its message as a visible notice, so the banner's sentence appeared twice
on screen and stayed under „Uloženo v…“ after the banner was resolved.

Item 5 drops the answer of a flush because "the next visit loads the server
version". That holds when the editor unmounts. It does not hold when the page
survives the `pagehide`: the back/forward cache restores it, or „Načíst
aktuální stav“ flushes in place. The page then kept the old version and an
armed debounce, resent the same text, and showed the author a conflict with
their own flush.

## Decision

1. **The banner is the one announcement.** Each of the four banners is a
   problem `Notice` (`role=alert`) mounted on entry into its state, so its
   insertion is spoken once per entry. Autosave has no `LiveStatus`; the
   status line stays `aria-live="off"`.
2. **A flush cancels the pending timers.** `pagehide` and a flushing
   „Načíst aktuální stav“ cancel the debounce and the retry, so nothing resends
   the flushed text.
3. **A flush's answer counts while the editor lives.** While the hook is
   mounted, a flush's answer reaches the machine. A success adopts the new
   version and shows „Uloženo v…“ when nothing newer is unsent, from any
   state. Any other answer marks the flushed text unsent again: from dirty or
   saved the debounce is armed, so the ordinary save path runs and ends in the
   right banner; a state with a banner keeps it. Once the editor has unmounted
   the answer is dropped, as ADR 0017 item 5 says. A pause, blur or hidden page
   saves only text that is unsent, so nothing resends what a flush took.
4. **Focus returns after a banner action.** „Ponechat moji verzi“, „Zkusit
   znovu“ and „Uložit“ close their banner; focus goes back to the field the
   author last edited, if it is still there. Entering a banner still moves no
   focus (ADR 0017 item 7).

## Options rejected

- **`LiveStatus` only, banners without `role=alert`.** The sentence would
  still show twice, and the status region would need clearing on every way out
  of the four states.
- **Re-check the status on `pageshow`.** A second call on every restore, to
  learn what the flush's own answer already says.

## Consequences

- The remaining ADR 0017 rules stand: one save in flight, the retry ladder,
  conflicts asked through `points.status`, no browser storage, no beacon route.
- A save the author starts after a restore, before the flush's answer arrives,
  still goes out with the old version and can conflict. The window is the
  flush's round trip.

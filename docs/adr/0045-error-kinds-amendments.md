# 0045 — Error kinds and surfaces: amendments to 0044

Amends ADR 0044, which is never edited. The cause set and the rule stand;
this records what review of the commits that built 0044 changed or left
unsaid.

## Context

0044 was built in several commits. Reading them against the ADR found six
places where the code and the record differ, or where the record says nothing
about a choice the code made. Each is small; together they would send the next
reader to the code to find out what the decision was.

## Decision

1. **`LockTimeout`, `25P03` and `25P04` are `timeout`.** `LockTimeout` (a lock
   not granted in time) was already classified so, but the 0044 table did not
   list it. `25P03` (`idle_in_transaction_session_timeout`) and `25P04`
   (`transaction_timeout`) are set on every transaction in `infra/db/pg-db.ts`
   and are waits that ran out like `57014`. `TransactionConflict` stays `bug`,
   and the session lookup no longer rethrows it as a port error: a conflict
   there is a plain `Error`, which is a `bug` too.
2. **A failed download lands on `/porada/archiv?chyba=<kind>`, not on the
   porada page.** 0044 said „the porada page“. A reviewer who is not the
   headmaster is redirected from `/porada/<datum>` to `/nahled`, which drops
   `chyba`, and a Monday outside the calendar is a 404. The archive needs only
   `archive.view`, which is what the download itself asks, and a download
   started from another site already landed there.
3. **Download links carry no `download` attribute.** A `download` link follows
   a redirect and saves the final response as a file, so the 303 to the
   archive saved the archive page as `archiv.html` and the reader saw no
   notice. The 200 already sends `Content-Disposition: attachment`, so a
   successful download still leaves the page where it was, and the 303 is an
   ordinary navigation.
4. **Sign-in failures read „Přihlášení se nepodařilo.“ with a full stop.** The
   cause's sentence follows it, as a separate sentence. 0044 wrote the prefix
   with a colon.
5. **The autosave banner names the cause.** It shows the failure's sentence
   (`failures`) or the error's own text (`errors`); „Zkontrolujte připojení.“
   (`network`) only when the request never arrived. A server failure no longer
   reads as a lost connection.
6. **The people search receives the development `detail` but does not
   display it.** 0044 said a failure „carries“ the technical line. The
   search's notices show the cause's sentence and „Osobu můžete zadat
   ručně.“ only; the line reaches the client and is left unused. Production
   sends none.

## Consequences

- `classifyFailure`'s table test gains rows for `25P03` and `25P04`.
- The Czech copy is unchanged apart from the sign-in full stop.
- A new download link uses `DownloadLink`, never an anchor with `download`.

## Options rejected

- **Make the porada page the target for every reader.** It would need to keep
  `chyba` through the reviewer redirect and answer a Monday it does not have.
- **Keep `download` and answer the failure with a status.** A bare status is
  the browser-worded error 0044 set out to remove.
- **Show the people search's `detail`.** It is its own change, with its own
  place in the search's notice.

# Smoke test against the real tenant

> **Status: not run yet.** It waits for school IT to finish
> [ENTRA-SETUP.md](../docs/ENTRA-SETUP.md) (the app registration, the
> certificate, DNS and the server). Until then, development and CI use
> stand-ins: the in-process TestIdp (`test/security`), mock-oauth2-server
> (`pnpm test:e2e`) and `scripts/check-deploy.sh`, which boots this compose
> stack with throwaway secrets.

Run it once on the school server before go-live, and again after any change
to the Entra registration. Each step says what to check; stop at the first
one that fails and look it up in [Troubleshooting](#troubleshooting).

`psql` below means:

```sh
docker compose exec postgres psql -U pgadmin -d autoporada
```

## Before the first start

1. **Entra is ready** (ENTRA-SETUP §1–2). There are two registrations (ADR 0021).
   - [ ] The web registration has the redirect URI exactly
         `https://autoporada.ssps.cz/auth/callback`; the mail registration has none.
   - [ ] Each registration has its own certificate uploaded and no client secret.
   - [ ] The optional claims `acct`, `auth_time`, `email` and `upn` are
         configured on the web registration, `upn` with *externally authenticated*.
   - [ ] Admin consent is granted for `User.ReadBasic.All` on the web
         registration; the mail registration has no API permissions.
2. **The server is ready** (ENTRA-SETUP §4–6).
   - [ ] DNS points at it, and TCP 80 and 443 are open from the internet.
   - [ ] It reaches `login.microsoftonline.com` and Let's Encrypt, and the web
         reaches `graph.microsoft.com` (from `ap-edge`, ENTRA-SETUP §4).
   - [ ] `timedatectl` shows the clock NTP-synchronized.
   - [ ] The repository is cloned to `/opt/autoporada`. The web registration's
         key and certificate are `deploy/secrets/web_entra_key` and `web_entra_cert`;
         the mail registration's are `entra_key` and `entra_cert`.
   - [ ] `sudo ./install.sh` ends with „ready“, and `.env` is filled in with
         `HSTS_MAX_AGE=86400` and `BOOTSTRAP_HEADMASTER_OID` set.
   - [ ] `docker compose build` succeeds.
3. **Entra accepts the mail certificate.** `docker compose run --rm cli auth:probe`
   probes the mail registration (the web's is proved by step 6 and step 29) and shows:
   - [ ] the issuer `https://login.microsoftonline.com/<tenant>/v2.0`;
   - [ ] a SHA-1 thumbprint equal to the one in the Entra portal;
   - [ ] more than 45 days left on the certificate;
   - [ ] „Entra accepted the credential“;
   - [ ] no roles and no `Mail.Send` warning (the mail registration has no API
         permissions; its mailbox right lives in Exchange).

## First start

4. **`docker compose up -d`.**
   - [ ] `docker compose ps -a`: `migrate` exited 0; `postgres`, `web` and
         `worker` are healthy.
   - [ ] `docker compose logs worker` shows `worker.ready` with
         `transport: graph` and the pg-boss schema number (`pgbossSchema`).
   - [ ] `docker compose logs caddy` shows the certificate obtained.
   - [ ] `docker compose logs web` shows „web process configured“ with the
         certificate's thumbprint and days left, and the warning that
         `BOOTSTRAP_HEADMASTER_OID` is set.
5. **Headers.**
   - [ ] `curl -sI http://autoporada.ssps.cz/` answers 308 to https.
   - [ ] `curl -sI https://autoporada.ssps.cz/` shows
         `Strict-Transport-Security`, a `Content-Security-Policy` with a
         nonce, `Cache-Control: no-store`, `X-Content-Type-Options`,
         `Referrer-Policy`, `Cross-Origin-Opener-Policy`,
         `Cross-Origin-Resource-Policy`, `X-Frame-Options` and `Permissions-Policy`.
   - [ ] There is no `Server` and no `X-Powered-By` header.

## Sign-in

6. **The headmaster.** The account with the bootstrap oid signs in.
   - [ ] They arrive as headmaster.
   - [ ] `psql`: `SELECT action FROM audit_events ORDER BY at;` lists
         `auth.login` and `user.bootstrapHeadmaster`.
   - [ ] Empty `BOOTSTRAP_HEADMASTER_OID` in `.env`, run `docker compose up -d`;
         the boot warning is gone.
7. **A staff member** lands on „čeká na schválení“.
   - [ ] `psql`: `SELECT octet_length(token_hash), idle_expires_at - created_at, abs_expires_at - created_at FROM sessions ORDER BY created_at DESC LIMIT 1;`
         gives `32 | 04:00:00 | 12:00:00`.
8. **A student** lands on „čeká na schválení“ too.
9. **A guest account** (invited from outside the school) sees that only
   school accounts may sign in.
   - [ ] No `users` row is created for them.
   - [ ] `psql`: `SELECT data->'meta' FROM audit_events WHERE action = 'auth.rejected';`
         shows `"signals": ["acct", "upn"]`, which proves both optional claims.
10. **Cancel and replay.**
    - [ ] Cancelling at Microsoft shows „Přihlášení bylo zrušeno“.
    - [ ] Going back to the callback URL from the history shows
          „Přihlášení vypršelo“, or the home page if already signed in.
11. **DevTools** (Application → Cookies, Console).
    - [ ] `__Host-ap_session` is `Secure`, `HttpOnly`, `SameSite=Lax`,
          `Path=/`, a session cookie, with no `Domain`.
    - [ ] The console shows no CSP violation.
12. **Sign-out.**
    - [ ] „Odhlásit se“ deletes the session row.
    - [ ] „Odhlásit všude“ in browser A also signs out browser B.
13. **Step-up.** Signed in as the headmaster, open
    `https://autoporada.ssps.cz/auth/step-up?returnTo=/`.
    - [ ] Microsoft **asks for the password again**, and the new session's
          `auth_time` is now.
    - [ ] If it answers `step-up-stale` instead, single sign-on (a PRT or
          Windows Hello) skipped the password: record it for M6.
14. **Expiry.** `psql`: `UPDATE sessions SET idle_expires_at = now();`
    - [ ] The next request goes to `/` (the sign-in screen).
15. **Logs.**
    - [ ] `docker compose logs caddy` shows real client addresses, not 172.x
          (otherwise everyone shares one rate-limit bucket).
    - [ ] It shows no `code=` or `state=`.
    - [ ] `docker compose logs web | grep -E 'eyJ|ap_session|ap_signin|#EXT#|@ssps.cz'`
          finds nothing.

## Mail

Every step here waits for the tenant: the shared mailbox and the Exchange role
assignment (ENTRA-SETUP §3) must exist first. `mail:test` takes the id of an
active reviewer or headmaster who is not a student.

16. **The mailbox scope** (Exchange PowerShell).
    - [ ] `Test-ServicePrincipalAuthorization -Identity <AppId> -Resource autoporada@ssps.cz`
          shows `InScope True`, and `False` for another mailbox.
    - [ ] `docker compose run --rm cli auth:probe` shows no `Mail.Send` warning.
17. **A test mail.** `docker compose run --rm cli mail:test --user <id>`.
    - [ ] It arrives from `autoporada@ssps.cz` with the Czech text intact.
    - [ ] There is no copy in the Sent Items of `autoporada@ssps.cz`.
    - [ ] `docker compose logs worker` shows `mail.sent` for it. This proves
          the worker's own egress through the school firewall.
    - [ ] Record what Graph really answers, for ADR 0016: the body of a 403,
          the format of `Retry-After`, whether the 202 carries `request-id`,
          and whether `X-Auto-Response-Suppress` and `X-Autoporada-Dedupe`
          survive in the received headers.
18. **RBAC propagation.** While the scope is new, the first mail may be refused.
    The ledger keeps one row per key and updates it in place, so look while
    the mail is pending, with the key that `mail:test` printed
    (`mail.check:<uuid>`).
    - [ ] `psql`: `SELECT state, code, attempts, claimed_at, settled_at FROM mail_ledger WHERE dedupe_key = '<key>';`
          shows `deferred` with an `auth.*` code while Exchange refuses, then
          `sent`, with no intervention.
    - [ ] Record how long it took: from the `at` of the `cli.mail-test` row in
          `audit_events` to the final `settled_at`. `attempts` counts the tries.
19. **A real decision.** Approve an access request.
    - [ ] The requester gets the mail within a minute.
    - [ ] `docker compose run --rm cli jobs:status` shows `dead: 0`.
20. **Bounces.** Run `mail:test` for a reviewer whose `users.email` you set to
    an address that does not exist at ssps.cz (set it back afterwards).
    - [ ] The bounce lands in the `autoporada@ssps.cz` inbox.
    - [ ] The person IT named for that inbox can open it.
21. **Daylight saving.** After the first night the clocks change:
    - [ ] `docker compose run --rm cli jobs:status` shows no dead job
          (it prints counts only).
    - [ ] `psql`: `SELECT created_on, completed_on, state FROM pgboss.job WHERE name = 'mail.prune' ORDER BY created_on;`
          has one row per Prague day (completed jobs are kept 2 days), none
          missing and none doubled. Or the worker log's `cron.registered` line
          has a `next` at 05:10 Prague time. The only schedule runs at 05:10,
          outside the hour the clocks change, so this checks that it kept its
          wall-clock time, not a double fire inside the hour.
22. **Shutdown.**
    - [ ] `docker compose stop worker` returns within 50 s.

## Points and review (M8a)

These steps wait for the same tenant, mailbox and server as the mail steps.
School IT has no Entra app, Exchange scope or server yet, so none has run.
Use three active accounts: an author, a reviewer who is not that author, and
the headmaster (step 25).

23. **A return mails the author.** The author hands in a point; the reviewer
    returns it with a note.
    - [ ] The author gets one mail through Graph within a minute. The subject
          is „Autoporada: bod byl vrácen k úpravě“.
    - [ ] The body links to `https://autoporada.ssps.cz/#/moje`, and neither the
          title of the point nor the note appears in it.
24. **An approval and a rejection each mail the author.** Approve one point and
    reject another.
    - [ ] The subjects are „Autoporada: bod byl schválen“ and
          „Autoporada: bod nebyl přijat“, each with the `/#/moje` link and no
          title or note.
    - [ ] `docker compose run --rm cli jobs:status` shows `dead: 0`.
25. **A decision on one's own point mails nobody.** The headmaster hands in a
    point of their own and approves it.
    - [ ] No mail arrives, and the ledger has no row for it:
          `psql`: `SELECT template, state, code FROM mail_ledger WHERE template LIKE 'point.%' ORDER BY settled_at DESC NULLS LAST;`
          lists only the rows of steps 23 and 24, none for this event.
26. **The worker reads points under its column grants.** Steps 23 and 24 prove
    it when they end in `sent`; if a mail stays `deferred` or the job is dead
    with a database code:
    - [ ] `psql`: `SELECT grantee, column_name FROM information_schema.column_privileges WHERE table_name IN ('points', 'point_events') AND grantee = 'autoporada_jobs' ORDER BY 1, 2;`
          lists `id`, `author_id` and `state` for `points`, and `id`,
          `point_id`, `event` and `to_state` for `point_events`, and nothing else.
27. **People are added by hand.** `DIRECTORY` stays `off` in `.env` (the only
    production mode until step 29 has run).
    - [ ] In the point editor the people search says „Hledání v adresáři
          školy zatím není zapnuté“, and „Přidat ručně“ and „Vložit seznam“ work.
28. **Native date and time pickers.** On a real Android phone and an iPhone,
    the author opens a report draft and sets both dates and both times with
    the phone's own pickers.
    - [ ] Under each date the Czech echo („čtvrtek 14. ledna 2027“) names
          the picked day.
    - [ ] After a reload the dates and times are the ones picked.

29. **The directory search** (S2 and S9). The web has its own registration with
    `User.ReadBasic.All` (ENTRA-SETUP §1.4). In `.env` set `DIRECTORY=graph`, run
    `docker compose up -d`, and sign in as an author.
    - [ ] The web reaches `graph.microsoft.com` over `ap-edge`. While you type,
          `docker compose logs web` shows no `directory failed` line with `code=directory.unavailable`
          or `code=directory.timeout` (a keystroke that supersedes a search is not logged).
          A line that does appear carries a `detail`: `http-4xx` or `http-5xx` (Graph's status
          class), `network`, `body` (an answer that is not a name list), or `token:` with the stage
          and the AADSTS code. Note it down: it tells a wrong `$search` grammar (`http-4xx` with
          `unavailable`) from a refused consent (`denied`).
    - [ ] Arch has no people picker yet (ADR 0065 item 7), so call the route as the
          signed-in author instead (`POST /api/adresar/hledat`, same-site, from the
          browser console): a search for three letters of a colleague's surname
          lists them by name; guests and rooms are absent.
    - [ ] If `$search` answers 403 (`directory.denied`) under `User.ReadBasic.All`,
          set `DIRECTORY=off` again: the fallback `User.Read.All` needs a new ADR
          and an updated privacy review (`docs/gdpr/privacy-review.md`) before
          IT is asked for it (ADR 0021 item 5).
    - [ ] Record what Graph really answers (S2): the status of `$search`
          with `ConsistencyLevel: eventual`, and whether `$count=true` is accepted.
    - [ ] Record whether Graph folds diacritics (S9): search `novak` (none) and
          `Novák` for a colleague with that surname. If both list the colleague, note
          "folds". If only `Novák` does, note "does not fold": the adapter sends the
          query as typed and filters with its own folding, so `novak` would find nobody;
          raise it for the picker copy or the design before go-live.
    - [ ] `docker compose logs web | grep -E '@ssps.cz|displayName'` finds nothing
          (the log carries codes, never the query or a name).
    - [ ] The mail registration cannot search: the web's token is the web
          registration's (`docker compose exec web /nodejs/bin/node -e "console.log(require('fs').readdirSync('/run/secrets'))"`
          lists `web_entra_key` and `web_entra_cert`, and no `entra_key`).

## Akce, reminders and the digest (M8b)

These steps need the mail steps (16–19) to have passed. In a `psql` shell the
deadline of the coming issues is `SELECT monday, deadline_at FROM issues ORDER BY monday DESC LIMIT 3;`.
Mail steps use `docker compose run --rm cli jobs:run <job> [key]` to start a run
now; the handler works from the clock and the data, so it sends only what is due
(`jobs:run` with no arguments prints the jobs).

30. **The report prompt.** An author writes an akce (every approved akce owes a
    report) and the reviewer approves it. The prompt is due the day after
    its last day, so use an akce whose last day was yesterday, or wait a day. Then
    `docker compose run --rm cli jobs:run future.report-prompt`.
    - [ ] The author gets one mail with the subject „Autoporada: napište zprávu z akce“ and the
          `/#/moje` link; it does not name the akce. A second `jobs:run` sends nothing.
    - [ ] On the home page and in „Moje body“ the card „Akce čekající na zprávu“ offers
          „Napsat zprávu“, which opens a draft prefilled from the akce, and no way to
          decline it.
31. **Deadline reminders.** Near the deadline (two days before it at 13.00, and on its
    day at 12.00 Prague time) the worker mails on its own every 15 minutes; or use
    `jobs:run reminders.deadline` inside that window.
    - [ ] The organiser of an approved akce that has ended and whose report is not handed in
          gets „Autoporada: odevzdejte zprávu z akce“ two days ahead, once; someone with
          nothing owed gets nothing.
    - [ ] An author with a draft or returned point gets „Autoporada: dnes je uzávěrka porady“
          on the deadline day, a student too.
    - [ ] The mails leave spread over about half an hour, not in one burst.
32. **The reviewer digest.** Hand in a point and an akce, then at 7.00 or 15.00 (or
    `jobs:run reviewer.digest morning` or `afternoon`):
    - [ ] Each reviewer and the headmaster gets „Autoporada: novinky ke kontrole“ with counts
          only („Nové položky ke kontrole: 2.“) and no title or name; it links `/#/kontrola`.
    - [ ] With only a pending access request the headmaster's digest links `/#/lide`.
    - [ ] A second run in the same slot sends nothing.
33. **The headmaster summary.** Five minutes after a deadline (or `jobs:run headmaster.summary`
    inside the two hours after it):
    - [ ] Each headmaster gets „Autoporada: uzávěrka porady proběhla“ with approved, waiting and
          returned counts, linking `/#/kontrola`; none for a skipped meeting; sent once.
    - [ ] `docker compose run --rm cli jobs:status` shows `dead: 0`.

## Headmaster tools (M9)

These steps need the mail steps (16–19) and `jobs:status` at `dead: 0`. Sign in as the
headmaster.

34. **The deadline setting.** In „Nastavení“ note the deadline of the porada already shown
    (`SELECT monday, meeting_date, deadline_at FROM issues ORDER BY monday DESC LIMIT 3;`),
    then save a different rule (for example three days before at 18.00).
    - [ ] The porada already shown keeps its `deadline_at` (the save freezes the shown ones first).
    - [ ] A porada created afterwards counts back from its meeting date by the new rule.
    - [ ] A second headmaster tab saving the old form is refused as changed.
35. **A moved porada mails the authors only when the deadline comes earlier.** Move the shown
    porada („Přesunout poradu“) to a date that makes its deadline earlier (the job is enqueued
    by the move, so there is no `jobs:run`; watch `docker compose run --rm cli jobs:status`).
    - [ ] Each author with a draft or returned point (and each active submitter the rule names) gets one
          „Autoporada: porada se přesouvá na <datum>“ with the new deadline and the `/#/moje` link,
          and no title or name; moving the same porada to the same deadline again sends nothing.
    - [ ] A move that makes the deadline later sends no mail.
    - [ ] Known limit: authors of late event reports are not mailed (features.md, Known limits).
36. **The worker reads settings and dates, nothing else new** (migrations 0030 and 0035).
    - [ ] `psql`: `SELECT grantee, column_name FROM information_schema.column_privileges WHERE table_name = 'settings' AND grantee = 'autoporada_jobs' ORDER BY 2;`
          lists `key` and `value` only (`\dp settings` shows the same).
    - [ ] The same for `table_name IN ('future_items', 'points')`: besides the earlier columns the
          jobs role holds `time_to` and `report_point_id` on `future_items`, and `event_date`,
          `end_date` and `time_to` on `points`; it holds no `title`, `body` or `place` column.
    - [ ] `\dp issues` shows `id`, `monday`, `meeting_date`, `deadline_at` and `status` for the jobs role.
    - [ ] `SELECT has_any_column_privilege('autoporada_jobs', t::regclass, 'SELECT') FROM unnest(ARRAY['registry_lists', 'registry_entries', 'issue_items']) AS t;`
          answers `f` three times: the jobs role cannot read the students' names or the outline.
    - [ ] `jobs:run reports.late` ends `sent` or with nothing due, never with a database code.
37. **Paste into the editors on the school's own Office and browsers.** In the outline item
    editor (Pokyny a hospodaření), paste a Word list and a Google Docs paragraph with a link,
    in the browsers the school uses.
    - [ ] Arch keeps plain text only: one line per list item, and no formatting, fonts, colours
          or links survive.
    - [ ] The browser console shows no Content-Security-Policy violation while pasting.
    - [ ] Pasting a list of students into the registry shows a preview that counts the lines it
          could not read, and nothing is stored until it is confirmed.

## At go-live

38. - [ ] Set `HSTS_MAX_AGE=31536000` and run `docker compose up -d`.
    - [ ] Record how many sign-ins per minute the school's NAT address sees;
          the `auth` limit allows 600 per address.

## Troubleshooting

| In the log | Meaning | Fix |
|---|---|---|
| `unavailable` with `discovery` | No way out to Microsoft: egress, DNS or a proxy | Open `login.microsoftonline.com`, or set `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY` for web |
| `AADSTS50011` | Redirect URI mismatch | Compare `APP_HOST` with the registration (ENTRA-SETUP §1.1) |
| `AADSTS700027`, `AADSTS7000274` | Entra refused the assertion or the certificate | Run `auth:probe`; check the thumbprint and that key and certificate belong together |
| `AADSTS65001`, `AADSTS90094` | Consent is missing | Grant admin consent (ENTRA-SETUP §1.4) |
| `missing-claim` `acct`, `upn` or `auth_time` | An optional claim is not configured | ENTRA-SETUP §1.3 |
| `OAUTH_JWT_TIMESTAMP_CHECK_FAILED` | The server clock is off | Fix NTP |
| Many `expired` | The browser dropped the `Secure` cookie | Caddy must terminate TLS; nothing in front may speak plain http |
| `web` restarts with `Invalid configuration` | `.env` or a secret file is wrong | The message names the setting; `sudo ./install.sh` again |
| `mail.systemic` | Graph refuses the send (403, 401) or Entra refuses the token | Normal for up to 2 hours after the role assignment; later, check the scope (ENTRA-SETUP §3) |
| `auth.token.AADSTS…` in the ledger `code` | Entra refused the app's token | Look the code up as above; run `auth:probe` |
| `mail.deferred` with a `net.*` code (`net.unavailable`, `net.ECONNREFUSED` …) | The worker cannot reach Microsoft (egress, DNS or a proxy); nothing was sent, and the mail is retried | Open `login.microsoftonline.com` and `graph.microsoft.com` for the worker (ENTRA-SETUP §4), or set `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY` for it as for web |
| `mail.waiting` | The mail waits for the 20-a-minute window or a `Retry-After` | Normal; nothing to do |
| `job.dead` | A job is in the dead-letter queue; `jobs:status` lists it with its code | `ambiguous`: the mail probably arrived, so do not redrive without asking the recipient; a redrive may send up to two more copies. `rejected.*`: Graph refused the mail for good; fix the address or the data first. Other codes: fix the cause, then `docker compose run --rm cli jobs:redrive` (running `cli` with no command prints the usage) |
| `worker.start_failed` with the hint `run migrate` | The job queue's tables are behind the code | `docker compose up -d` runs `migrate` first; check `docker compose logs migrate` |
| `migrate` fails with `pgboss holds what migrate did not make` | A queue or a pending background command in `pgboss` that migrate did not create, for example after a bam wait timed out | Nothing was changed. Look at the named queues and `pgboss.bam` rows; remove them only when you know how they got there (ADR 0015), then run `docker compose up -d` again |
| `migrate` fails with `a session holds pgboss.queue` | A session (normally the running worker) kept writing the queue table for 30 s, so migrate could not check it | Nothing was changed. `docker compose stop worker`, then `docker compose up -d` again |
| `migrate` fails with `permission denied to create role` | A data volume made before the worker (M7) lacks its database roles | Run once (safe to repeat), as `install.sh` prints: `docker compose up -d --wait postgres`, then `docker compose exec -T postgres psql -X -U pgadmin -d postgres -v ON_ERROR_STOP=1 -f - <postgres/upgrade/m7-roles.sql`, then `docker compose up -d` |

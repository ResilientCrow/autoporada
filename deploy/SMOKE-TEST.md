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

1. **Entra is ready** (ENTRA-SETUP §1–2).
   - [ ] The redirect URI is exactly `https://autoporada.ssps.cz/auth/callback`.
   - [ ] The certificate is uploaded, and the registration has no client secret.
   - [ ] The optional claims `acct`, `auth_time`, `email` and `upn` are
         configured, `upn` with *externally authenticated*.
   - [ ] Admin consent is granted.
2. **The server is ready** (ENTRA-SETUP §4–6).
   - [ ] DNS points at it, and TCP 80 and 443 are open from the internet.
   - [ ] It reaches `login.microsoftonline.com` and Let's Encrypt.
   - [ ] `timedatectl` shows the clock NTP-synchronized.
   - [ ] The repository is cloned to `/opt/autoporada`, and the key and
         certificate are `deploy/secrets/entra_key` and `deploy/secrets/entra_cert`.
   - [ ] `sudo ./install.sh` ends with „ready“, and `.env` is filled in with
         `HSTS_MAX_AGE=86400` and `BOOTSTRAP_HEADMASTER_OID` set.
   - [ ] `docker compose build` succeeds.
3. **Entra accepts the certificate.** `docker compose run --rm cli auth:probe` shows:
   - [ ] the issuer `https://login.microsoftonline.com/<tenant>/v2.0`;
   - [ ] a SHA-1 thumbprint equal to the one in the Entra portal;
   - [ ] more than 45 days left on the certificate;
   - [ ] „Entra accepted the credential“;
   - [ ] `User.ReadBasic.All` among the roles, and no `Mail.Send` warning.

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
   - [ ] `curl -sI http://autoporada.ssps.cz/prihlaseni` answers 308 to https.
   - [ ] `curl -sI https://autoporada.ssps.cz/prihlaseni` shows
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
    - [ ] The next request goes to `/prihlaseni`.
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

## At go-live

23. - [ ] Set `HSTS_MAX_AGE=31536000` and run `docker compose up -d`.
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
| `mail.waiting` | The mail waits for the 20-a-minute window or a `Retry-After` | Normal; nothing to do |
| `job.dead` | A job is in the dead-letter queue; `jobs:status` lists it with its code | `ambiguous`: the mail probably arrived, so do not redrive without asking the recipient; a redrive may send up to two more copies. `rejected.*`: Graph refused the mail for good; fix the address or the data first. Other codes: fix the cause, then `docker compose run --rm cli jobs:redrive` (running `cli` with no command prints the usage) |
| `worker.start_failed` with the hint `run migrate` | The job queue's tables are behind the code | `docker compose up -d` runs `migrate` first; check `docker compose logs migrate` |
| `migrate` fails with `pgboss holds what migrate did not make` | A queue or a pending background command in `pgboss` that migrate did not create, for example after a bam wait timed out | Nothing was changed. Look at the named queues and `pgboss.bam` rows; remove them only when you know how they got there (ADR 0015), then run `docker compose up -d` again |
| `migrate` fails with `a session holds pgboss.queue` | A session (normally the running worker) kept writing the queue table for 30 s, so migrate could not check it | Nothing was changed. `docker compose stop worker`, then `docker compose up -d` again |
| `migrate` fails with `permission denied to create role` | A data volume made before the worker (M7) lacks its database roles | Run once (safe to repeat), as `install.sh` prints: `docker compose up -d --wait postgres`, then `docker compose exec -T postgres psql -X -U pgadmin -d postgres -v ON_ERROR_STOP=1 -f - <postgres/upgrade/m7-roles.sql`, then `docker compose up -d` |

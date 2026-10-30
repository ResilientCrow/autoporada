# 0021 — Web access to Graph

Supersedes in part: ADR 0003, "One registration" (the web signs in and
searches the directory with its own registration; the mail registration stays
the worker's) and its first consequence (a compromised web host no longer holds
the mail registration's key).

## Context

ADR 0003 puts sign-in, people search and mail on one registration and accepts
that a compromised web host "can at most send mail as the one shared mailbox",
because the web mounts the certificate key for sign-in. The directory search
(ADR 0019) makes the web call Graph with an application token as well, so the
web would hold that registration's credential for two more reasons. A second
registration for the web only reduces risk if the web takes its sign-in too;
otherwise it adds a secret and removes nothing.

## Decision

1. **The web has a registration of its own.**
   - Delegated: `openid profile email User.Read`, the sign-in.
   - Application: `User.ReadBasic.All` with admin consent, the people search.
   - Never `Mail.Send`, and no Exchange role assignment.
   - It carries the redirect URI `https://<host>/auth/callback` and its own
     certificate.
2. **The mail registration is the worker's and the cli's.** It keeps the
   Exchange RBAC scope on `autoporada@ssps.cz` (ADR 0003, ADR 0016) and loses
   the redirect URI and the directory permission.
3. **The web container holds the web pair and none of the mail pair.**
   `deploy/compose.yaml` gives the web service `WEB_CLIENT_ID`,
   `WEB_CERT_THUMBPRINT` and the secrets `web_entra_key` and `web_entra_cert`
   under the names the app already reads (`OIDC_CLIENT_*`); the worker and cli
   keep `CLIENT_ID`, `CERT_THUMBPRINT`, `entra_key` and `entra_cert`. The
   configuration schema is unchanged. `lint:compose` fails if the web holds an
   `entra_*` secret, shares the worker's client id or reads another key file.
4. **The web's path to Graph.** The `edge` bridge is named `ap-edge`. From it
   the school firewall allows `login.microsoftonline.com` and
   `graph.microsoft.com` (the web) and the ACME host (Caddy); `ap-egress` stays
   the worker's. `check-compose` and `check-deploy` assert both names.
5. **The permission.** `User.ReadBasic.All` is asked for first. Production runs
   `DIRECTORY=off` until the tenant's smoke test shows that `$search` answers
   under it. If Graph answers 403, the fallback is `User.Read.All`, which needs
   a new ADR superseding item 1's permission line and an updated privacy review
   before it is requested.

## Consequences

- A compromised web host holds a credential that can read the names of the
  directory and sign users in, but cannot send mail.
- School IT makes one more registration, one more certificate and its renewal,
  and moves the redirect URI. ENTRA-SETUP §1, §4, §6 and §7, the plan's IT
  checklist and the smoke test say so.
- `auth:probe` (cli) now probes the mail registration; the web registration is
  proven by the sign-in and the directory step of the smoke test.
- Two stacks cannot share a host: both bridge names are fixed.

## Options rejected

- **One registration, `User.ReadBasic.All` on it (ADR 0003 as it stood).** No
  extra work for IT, but the web keeps the mail registration's key.
- **A second registration for the directory only.** A third credential in the
  web and the same risk as before.
- **`User.Read.All` from the start.** Reads more than the search needs; kept as
  the documented fallback only.

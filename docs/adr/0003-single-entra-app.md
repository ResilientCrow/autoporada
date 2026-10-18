# 0003 — One Entra app; Mail.Send scoped by Exchange RBAC

## Context

The app needs three things from Microsoft:

- sign-in;
- people search (Graph `/users`);
- outgoing reminder e-mail.

Two app registrations would isolate the mail key, but they double the setup
work for school IT and the number of certificates to renew.

## Decision

- **One registration.**
  - Delegated: `openid profile email User.Read`. No `offline_access`, and no
    user tokens are stored.
  - Application: `User.ReadBasic.All` (admin consent) for people search.
  - Mail: `Application Mail.Send` granted **only** through an Exchange Online
    RBAC for Applications management scope limited to `autoporada@ssps.cz`.
    Never granted in Entra, because Entra grants would widen the scope.
- **Mail goes out from the worker container only.** The web container
  enqueues jobs and never calls `sendMail`.

## Consequences

- If the web host is compromised, it can at most send mail as the one shared
  mailbox. The certificate key is still mounted there, for sign-in.
- `docs/ENTRA-SETUP.md` gives IT the exact cmdlets and the
  `Test-ServicePrincipalAuthorization` check.

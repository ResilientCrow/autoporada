# 0002 — Entra ID OIDC via openid-client, own DB sessions

## Context

Every student and employee already has a school Microsoft 365 account with
MFA and lockout policies. Storing passwords would add risk without adding
value.

The candidate libraries:

- **Auth.js** is in maintenance mode.
- **Better Auth** has had several critical advisories in 2026, in the OAuth
  and account-linking code we would rely on.

## Decision

- Use `openid-client` (OpenID certified) for the authorization code flow:
  PKCE S256, `state`, `nonce`.
- Pin the authority to the school tenant
  (`https://login.microsoftonline.com/{tenant}/v2.0`).
- Validate the ID token claims `iss`, `aud`, `tid`, `nonce`, `exp` and `nbf`.
  Reject guests (`acct ≠ 0` or `#EXT#` in the UPN).
- Key users by `(tid, oid)`. E-mail and UPN are for display only.
- The confidential client authenticates with a certificate
  (`private_key_jwt`), not a client secret.
- Sessions are server-side:
  - a random 256-bit token in a `__Host-` cookie (HttpOnly, Secure,
    SameSite=Lax);
  - only its SHA-256 is stored;
  - idle timeout 4 h, absolute 12 h;
  - the role is re-read on every request.
- Step-up re-authentication (`prompt=login`, `auth_time` ≤ 10 min) is
  required only for role and user changes and for „Nový školní rok“.

## Consequences

- About 300 lines of our own session code. It is security-critical and gets
  a dedicated negative test suite against a mock IdP.
- The school's Conditional Access governs MFA. The app does not duplicate it.

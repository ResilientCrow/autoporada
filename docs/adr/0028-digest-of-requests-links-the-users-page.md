# 0028 — A digest of access requests links the users page

Supersedes in part: ADR 0020 item 2 (the set of links a mail may carry) and,
in item 1, the digest's constant subject wording.

## Context

ADR 0020 let a mail link `/prihlaseni`, `/body` or `/kontrola`, and fixed the
reviewer digest's subject as „Nové body ke kontrole“. The headmaster's digest
also counts access requests, and an akce is not a „bod“. A digest with only
requests said „nové body“ and linked the review queue, which does not list
requests: they are decided on `/uzivatele`.

## Decision

1. **The link set gains `/uzivatele`.** The frame's `link` is
   `'/prihlaseni' | '/body' | '/kontrola' | '/uzivatele'`. A signed-out reader is
   sent to sign-in and back, as for the other links.
2. **The digest links `/uzivatele` when it has nothing to review**, that is
   when only access requests are new. Otherwise it links `/kontrola`.
3. **The subject stays constant but neutral**: „Autoporada: novinky ke
   kontrole“. The count line says „položky ke kontrole“ (points and akce), and
   „žádosti o přístup“ for requests, both in colon form so no noun agrees with
   its number.

# Microsoft 365 setup for Autoporada

This guide is for the school's Microsoft 365 / Entra ID administrators. It
lists everything the app needs from the tenant, and why.

Allow 1–2 weeks. Exchange permission changes alone take up to 2 hours to
apply.

This guide covers the Microsoft side only. Installing the app on the server
is in [DEPLOYMENT.md](DEPLOYMENT.md), which calls this guide at its step 5,
and keeping the app running (backups, updates, renewing the certificates) is
in [OPERATIONS.md](OPERATIONS.md).

**Do not paste secrets into e-mail or chat.** The certificate's private key
is created on the server and never leaves it. Only the public certificate is
uploaded to Entra.

## What the app will and will not do

| The app will | The app will not |
|---|---|
| Sign users in (OpenID Connect) and read their basic profile | Store passwords or Microsoft access tokens |
| Search the school's users by display name or surname and read each hit's name, e-mail address and sign-in name, from the web's own registration. The search is switched off until `DIRECTORY=graph` is set, and no screen of the app uses it yet | Read mail, files, calendars, Teams or groups |
| Send reminder e-mails **as `autoporada@ssps.cz` only**, from the mail registration the web never holds | Send mail as any other mailbox, or from the web |
| Accept members of the ssps.cz tenant | Accept guest (B2B) accounts or other tenants |

## 1. App registrations

Two registrations (ADR 0021). The **web registration** signs users in and
searches the directory; the web container holds its certificate. The **mail
registration** (step 5) sends the e-mail; only the worker and the maintenance
container hold its certificate. A compromised web server therefore cannot send
mail.

Go to Entra admin center → **App registrations** → **New registration** for
the web registration:

| Field | Value |
|---|---|
| Name | `Autoporada` |
| Supported account types | **Accounts in this organizational directory only** (single tenant) |
| Redirect URI | Platform **Web**: `https://autoporada.ssps.cz/auth/callback` |

After creating it:

1. **Authentication.**
   - Leave the implicit grant options (access tokens, ID tokens) **unchecked**.
   - Front-channel logout URL: leave empty.
2. **Certificates & secrets → Certificates → Upload certificate.**
   - Upload the public certificate `autoporada-entra.crt`, generated on the
     server (see §6). Note its thumbprint.
   - Do **not** create a client secret.
3. **Token configuration → Add optional claim → ID token.** Add:
   - `acct`, used to reject guest accounts. The app refuses tokens without it;
   - `auth_time`, used for re-authentication before role changes;
   - `email`;
   - `upn`. Then edit the `upn` claim and turn on **Externally
     authenticated** (`include_externally_authenticated_upn`). Without it,
     guests get their home UPN and the app's second guest check cannot work.
4. **API permissions** (Microsoft Graph):

   | Type | Permission | Admin consent | Why |
   |---|---|---|---|
   | Delegated | `openid`, `profile`, `email`, `User.Read` | not required | Sign-in |
   | Application | `User.ReadBasic.All` | **required, please grant** | People search when filling in participants |

   Then click **Grant admin consent for ssps.cz**.

   **Do not add `Mail.Send` here, or to any registration in Entra.** Mail
   permission is granted in Exchange (§3), limited to one mailbox. A Mail.Send
   grant in Entra would apply to every mailbox in the tenant.

   `User.ReadBasic.All` is the smallest permission that lists users. Whether
   Graph answers `$search` under it is checked in the smoke test
   (`deploy/SMOKE-TEST.md`); if it answers 403, the app will ask for
   `User.Read.All` instead, after a new decision record and an updated
   privacy review. Please do not grant `User.Read.All` unasked.
5. **The mail registration.** A second **New registration**:

   | Field | Value |
   |---|---|
   | Name | `Autoporada mail` |
   | Supported account types | **Accounts in this organizational directory only** (single tenant) |
   | Redirect URI | **None** |

   - Upload its own public certificate (§6), and do **not** create a client
     secret.
   - Add **no API permissions** at all: no delegated ones, no application
     ones, no `Mail.Send`. Its only power is the Exchange role assignment of
     §3.

## 2. Enterprise application

Go to Entra admin center → **Enterprise applications** → `Autoporada`:

- **Properties.**
  - *Assignment required?* **No.** Anyone in the tenant may sign in; the app
    has its own allow-list with access requests.
  - *Visible to users?* Optional.
- **Note the Object ID of the mail registration's enterprise application**
  (`Autoporada mail`, the service principal). It differs from the app registration's object ID, and §3 needs
  it.
- **Recommended:** a Conditional Access policy that requires MFA for this
  app, if MFA is not already required tenant-wide.

## 3. Shared mailbox and scoped Mail.Send

These steps use Exchange Online PowerShell and need the Exchange Administrator
or Organization Management role.

```powershell
Connect-ExchangeOnline

# 3.1 Shared mailbox (no licence needed under 50 GB)
New-Mailbox -Shared -Name "Autoporada" -DisplayName "Autoporada" `
  -PrimarySmtpAddress autoporada@ssps.cz

# 3.2 Register the app's service principal in Exchange
#     AppId    = Application (client) ID of the MAIL registration (`Autoporada mail`)
#     ObjectId = Object ID of its ENTERPRISE APPLICATION (not the registration)
New-ServicePrincipal -AppId <AppId> -ObjectId <EnterpriseAppObjectId> `
  -DisplayName "Autoporada mail"

# 3.3 A scope that matches exactly one mailbox
New-ManagementScope -Name "Autoporada mailbox" `
  -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'autoporada@ssps.cz'"

# 3.4 Grant Mail.Send only within that scope
New-ManagementRoleAssignment -App <EnterpriseAppObjectId> `
  -Role "Application Mail.Send" -CustomResourceScope "Autoporada mailbox"
```

Verify right away: the test cmdlet bypasses Exchange's permission cache.
The app's real `sendMail` calls may need 30 minutes to 2 hours before the new
scope applies.

```powershell
Test-ServicePrincipalAuthorization -Identity <AppId> -Resource autoporada@ssps.cz
# expected: InScope = True

Test-ServicePrincipalAuthorization -Identity <AppId> -Resource <any-other-user>@ssps.cz
# expected: InScope = False
```

The first mails can be refused (403) for up to 2 hours while the scope
propagates. The worker retries on its own for about 2.8 hours, one Graph call
a minute, and logs each refusal as `mail.systemic`. Within that time nobody
has to act. A message still refused after it is given up and waits in the
dead queue: `docker compose run --rm cli jobs:status` shows it, and
[OPERATIONS.md](OPERATIONS.md), "E-mail", says how to send it again. Then
send a test mail from the server:

```sh
docker compose run --rm cli mail:test --user <id>
```

`<id>` is the id of an active reviewer or headmaster, not a student. The
Entra consent must not hold `Mail.Send`; `cli auth:probe` warns if it does.

Bounces (non-delivery reports) land in the inbox of `autoporada@ssps.cz` and
quote the full text of the mail. Name a person who reads that inbox, and set
an Exchange retention policy on it.

## 4. DNS and network

- **DNS:** an `A` (and optionally `AAAA`) record for `autoporada.ssps.cz`
  pointing to the server.
- **Inbound:** TCP 80 and 443 to the server. Port 80 serves the Let's Encrypt
  HTTP challenge and the redirect to HTTPS.
- **Outbound from the server (HTTPS):**
  - always: `login.microsoftonline.com`, `graph.microsoft.com`,
    `acme-v02.api.letsencrypt.org`;
  - the worker (the mail sender) needs only `login.microsoftonline.com` and
    `graph.microsoft.com`. Where the firewall can limit a service, please
    allow only those two from the server for it. The worker's network has
    the fixed bridge name `ap-egress` (`deploy/compose.yaml`): match it in a
    host firewall rule (the `DOCKER-USER` chain or nftables);
  - the web (sign-in and directory search) needs `login.microsoftonline.com`
    and `graph.microsoft.com`, and Caddy needs `acme-v02.api.letsencrypt.org`.
    Both are on the `edge` network, whose fixed bridge name is `ap-edge`:
    allow those three hosts from it and nothing else. The two containers
    share this bridge, so a rule per service needs their container addresses,
    which the stack does not fix; the three-host rule on `ap-edge` is what
    the stack supports. Two stacks cannot share one host with either bridge
    name;
  - during installs and updates, which build the images on the server:
    `github.com` (the source), `registry.npmjs.org` (packages), and the
    container registries `registry-1.docker.io`, `auth.docker.io`,
    `production.cloudflare.docker.com`, `gcr.io`, `ghcr.io`,
    `pkg-containers.githubusercontent.com`, and `deb.debian.org` over plain
    HTTP (port 80; one font package for the PDF image).

## 5. Server

The full list of what the server needs, and every step of the install, is
in [DEPLOYMENT.md](DEPLOYMENT.md). In short:

- Linux with Docker Engine 27+, the Compose plugin, git and openssl.
- At least 2 vCPU, 6 GB RAM and 40 GB disk.
- The repository is cloned to `/opt/autoporada`. Its `deploy/` directory holds
  the compose stack; `deploy/SMOKE-TEST.md` is the checklist for the first
  start.
- Named people:
  - an **IT contact** who does the weekly check
    ([OPERATIONS.md](OPERATIONS.md), "The weekly check"). The app sends no
    alerts of its own, not about backups, certificate expiry or disk space;
  - who applies security updates. Critical fixes should be applied within
    72 hours.
- An **off-site backup target** on school-controlled infrastructure: SFTP or
  rsync over SSH, an SMB share on the school NAS, or S3-compatible storage.
  The app makes no backups itself: IT sets up the nightly dump and the copy
  as [OPERATIONS.md](OPERATIONS.md), "Backup", describes. A dump holds
  personal data unencrypted, so encrypt the copy or keep the target readable
  by IT only.

## 6. Certificates (done on the server)

[DEPLOYMENT.md](DEPLOYMENT.md), step 4, runs these commands in the right
directory and puts the files in place; this section is the reference.

One pair for each registration, made with the same command:

```sh
openssl req -x509 -newkey rsa:3072 -sha256 -days 730 -nodes \
  -keyout autoporada-entra.key -out autoporada-entra.crt \
  -subj "/CN=autoporada.ssps.cz"
chmod 600 autoporada-entra.key
openssl req -x509 -newkey rsa:3072 -sha256 -days 730 -nodes \
  -keyout autoporada-mail.key -out autoporada-mail.crt \
  -subj "/CN=autoporada-mail.ssps.cz"
chmod 600 autoporada-mail.key
```

- Upload `autoporada-entra.crt` to the web registration (step 1.2) and
  `autoporada-mail.crt` to the mail registration (step 1.5).
- The keys **and** the certificates become Docker secrets on the server, in
  `/opt/autoporada/deploy/secrets/`: the web pair as `web_entra_key` and
  `web_entra_cert`, the mail pair as `entra_key` and `entra_cert`. Then run
  `sudo ./install.sh` there, which sets their owner and mode. The keys never
  leave the server, and the web container never sees the mail pair.
- The app checks at start-up that the key belongs to the certificate, that
  the key has at least 2048 bits, and that the SHA-1 thumbprint matches the
  one the portal shows. The deploy stack requires both thumbprints
  (`WEB_CERT_THUMBPRINT` for the web pair and `CERT_THUMBPRINT` for the mail
  pair, in `deploy/.env`).
- The app signs its client assertion with PS256 and names the certificate by
  its SHA-256 (`x5t#S256`), as Microsoft documents for certificate
  credentials.
- From 45 days before a certificate expires, `web` (its own pair) and
  `worker` (the mail pair) log a warning each time they start, and
  `cli auth:probe` prints it for the mail pair. Nobody is e-mailed, and an
  expired certificate stops sign-in or e-mail. Write both end dates into a
  calendar; [OPERATIONS.md](OPERATIONS.md), "Certificates", shows how to read
  them.
- **Renewal**, before the old certificate expires, for each pair:
  1. make a new pair with the command above and upload the new certificate
     to its registration (step 1.2 or 1.5), keeping the old one in Entra for
     now;
  2. replace the pair's secret files (`web_entra_key` and `web_entra_cert`,
     or `entra_key` and `entra_cert`), set `WEB_CERT_THUMBPRINT` or
     `CERT_THUMBPRINT` in `deploy/.env` to the new thumbprint from the
     portal, run `sudo ./install.sh` and `docker compose up -d`;
  3. check with `docker compose run --rm cli auth:probe` (the mail pair) or
     by signing in (the web pair), then remove the old certificate in Entra.

  A thumbprint left at the old value stops that service at start-up: the
  boot check refuses the mismatch.

## 7. Values to hand over to the deployer

| Value | Where it comes from |
|---|---|
| Directory (tenant) ID | App registration → Overview |
| Web registration: Application (client) ID | `Autoporada` → Overview. It becomes `WEB_CLIENT_ID`. |
| Web registration: certificate thumbprint (SHA-1) | `Autoporada` → Certificates & secrets. It becomes `WEB_CERT_THUMBPRINT`; the app compares it with the certificate at start-up. |
| Mail registration: Application (client) ID | `Autoporada mail` → Overview. It becomes `CLIENT_ID`. |
| Mail registration: certificate thumbprint (SHA-1) | `Autoporada mail` → Certificates & secrets. It becomes `CERT_THUMBPRINT`. |
| Mail registration: enterprise application object ID | Enterprise applications → Autoporada mail |
| Shared mailbox | `autoporada@ssps.cz` |
| Headmaster's user object ID | Entra → Users → the headmaster → Object ID. It becomes the first administrator. |
| IT contact (name and e-mail) | §5. For the school's own records; no setting of the app takes it. |
| Off-site backup target and credentials | §5. Used by the backup copy that IT sets up, not by the app. Hand these over in person or through a password manager. |

## 8. Staging / development (optional)

Developers use a local mock identity provider and need no tenant access. For a
staging server, create a **separate** pair of registrations, `Autoporada (staging)` and
`Autoporada mail (staging)`, with their own certificates, the redirect URI
on the first and **no** Exchange role assignment on the production mailbox.

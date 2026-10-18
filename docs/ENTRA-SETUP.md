# Microsoft 365 setup for Autoporada

This guide is for the school's Microsoft 365 / Entra ID administrators. It
lists everything the app needs from the tenant, and why.

Allow 1–2 weeks: Exchange permission changes take up to 2 hours to apply, and
a first sign-in test is planned early in development.

**Do not paste secrets into e-mail or chat.** The certificate's private key
is created on the server and never leaves it. Only the public certificate is
uploaded to Entra.

## What the app will and will not do

| The app will | The app will not |
|---|---|
| Sign users in (OpenID Connect) and read their basic profile | Store passwords or Microsoft access tokens |
| Search the directory by name (display name, given name, surname, mail) | Read mail, files, calendars, Teams or groups |
| Send reminder e-mails **as `autoporada@ssps.cz` only** | Send mail as any other mailbox |
| Accept members of the ssps.cz tenant | Accept guest (B2B) accounts or other tenants |

## 1. App registration

Go to Entra admin center → **App registrations** → **New registration**:

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

   **Do not add `Mail.Send` here.** Mail permission is granted in Exchange
   (§3), limited to one mailbox. A Mail.Send grant in Entra would apply to
   every mailbox in the tenant.

## 2. Enterprise application

Go to Entra admin center → **Enterprise applications** → `Autoporada`:

- **Properties.**
  - *Assignment required?* **No.** Anyone in the tenant may sign in; the app
    has its own allow-list with access requests.
  - *Visible to users?* Optional.
- **Note the Object ID of the enterprise application** (the service
  principal). It differs from the app registration's object ID, and §3 needs
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
#     AppId    = Application (client) ID from the app registration
#     ObjectId = Object ID of the ENTERPRISE APPLICATION (not the registration)
New-ServicePrincipal -AppId <AppId> -ObjectId <EnterpriseAppObjectId> `
  -DisplayName "Autoporada"

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

## 4. DNS and network

- **DNS:** an `A` (and optionally `AAAA`) record for `autoporada.ssps.cz`
  pointing to the server.
- **Inbound:** TCP 80 and 443 to the server. Port 80 serves the Let's Encrypt
  HTTP challenge and the redirect to HTTPS.
- **Outbound from the server (HTTPS):**
  - always: `login.microsoftonline.com`, `graph.microsoft.com`,
    `acme-v02.api.letsencrypt.org`;
  - during installs and updates, the container registries:
    `registry-1.docker.io`, `auth.docker.io`,
    `production.cloudflare.docker.com`, `ghcr.io`,
    `pkg-containers.githubusercontent.com`.

## 5. Server

- Linux with Docker Engine 27+ and the Compose plugin.
- At least 2 vCPU, 6 GB RAM and 40 GB disk.
- Named people:
  - an **IT contact** e-mail for alerts (backups, certificate expiry, disk
    space);
  - who applies security updates. Critical fixes should be applied within
    72 hours.
- An **off-site backup target** on school-controlled infrastructure: SFTP or
  rsync over SSH, an SMB share on the school NAS, or S3-compatible storage.
  Backups are encrypted before they leave the server.

## 6. Certificate (done on the server)

```sh
openssl req -x509 -newkey rsa:3072 -sha256 -days 730 -nodes \
  -keyout autoporada-entra.key -out autoporada-entra.crt \
  -subj "/CN=autoporada.ssps.cz"
chmod 600 autoporada-entra.key
```

- Upload `autoporada-entra.crt` in step 1.2.
- The key becomes a Docker secret on the server.
- The app warns the IT contact 45 days before the certificate expires.
  Renewal is the same two steps, done before the old certificate is removed.

## 7. Values to hand over to the deployer

| Value | Where it comes from |
|---|---|
| Directory (tenant) ID | App registration → Overview |
| Application (client) ID | App registration → Overview |
| Certificate thumbprint | App registration → Certificates & secrets |
| Enterprise application object ID | Enterprise applications → Autoporada |
| Shared mailbox | `autoporada@ssps.cz` |
| Headmaster's user object ID | Entra → Users → the headmaster → Object ID. It becomes the first administrator. |
| IT contact e-mail | §5 |
| Off-site backup target and credentials | §5. Hand these over in person or through a password manager. |

## 8. Staging / development (optional)

Developers use a local mock identity provider and need no tenant access. For a
staging server, create a **second** registration, `Autoporada (staging)`,
with its own redirect URI and certificate and **no** Exchange role
assignment.

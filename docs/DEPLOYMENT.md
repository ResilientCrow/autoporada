# Installing Autoporada on the school server

This guide takes an empty Linux server to a running Autoporada that the school
can use. It is written for the school's IT department and assumes no knowledge
of the app and no contact with its developer. What the app is and does is in
the [README](../README.md).

Two roles do the work. They can be one person:

- the **server administrator** follows this guide;
- the **Microsoft 365 administrator** follows
  [ENTRA-SETUP.md](ENTRA-SETUP.md) when this guide says so.

Plan for one to two weeks from start to go-live. The work itself is a few
hours, but it waits on DNS, on the Microsoft 365 changes (a change in Exchange
takes up to two hours to apply) and on the test with real people.

After the installation, [OPERATIONS.md](OPERATIONS.md) is the guide for
running the app.

## Contents

- [What ends up on the server](#what-ends-up-on-the-server)
- [Before you start](#before-you-start)
- [Step 1. Prepare the server](#step-1-prepare-the-server)
- [Step 2. Get the code](#step-2-get-the-code)
- [Step 3. First run of the install script](#step-3-first-run-of-the-install-script)
- [Step 4. Make the two certificates](#step-4-make-the-two-certificates)
- [Step 5. Microsoft 365](#step-5-microsoft-365)
- [Step 6. Finish the secrets](#step-6-finish-the-secrets)
- [Step 7. Fill in the configuration](#step-7-fill-in-the-configuration)
- [Step 8. Build the images](#step-8-build-the-images)
- [Step 9. Check that Microsoft accepts the server](#step-9-check-that-microsoft-accepts-the-server)
- [Step 10. Start](#step-10-start)
- [Step 11. The first headmaster](#step-11-the-first-headmaster)
- [Step 12. The smoke test](#step-12-the-smoke-test)
- [Step 13. Go-live](#step-13-go-live)
- [Optional settings](#optional-settings)
- [If a step fails](#if-a-step-fails)

## What ends up on the server

| Where | What it is | Does it need a backup? |
|---|---|---|
| `/opt/autoporada` | The repository: the code and the files of the production stack | No, but keep a second copy of the repository somewhere else |
| `/opt/autoporada/deploy/.env` | The configuration. It holds no secret. | Keep a copy; it is a dozen lines |
| `/opt/autoporada/deploy/secrets/` | The database passwords and the two private keys for Microsoft Entra | No. Each can be made again ([OPERATIONS.md](OPERATIONS.md), "Restore"). If you do copy them, treat the copy as a secret. |
| `/opt/autoporada/deploy/state/caddy/` | The HTTPS certificate that Caddy got from Let's Encrypt | No. Caddy gets a new one. |
| Docker volume `autoporada_pgdata` | The database: **every piece of the school's data**, including the generated documents | **Yes.** This is the only thing that cannot be made again. |

The stack is seven services, described in the README under "What it is made
of". Only one of them, `caddy`, is reachable from outside, on ports 80 and 443.

## Before you start

Have these ready. The installation stops without any one of them.

**A server**

- [ ] Linux, 64-bit x86. The project is built and tested on that; other
      processor types are untried.
- [ ] At least 2 CPU cores, 6 GB of memory and 40 GB of disk.
- [ ] The clock is synchronised (`timedatectl` shows
      `System clock synchronized: yes`). Sign-in fails when the clock is off.
      The server's time zone does not matter: the app counts in Europe/Prague
      on its own.

**A name and a way in**

- [ ] A DNS name for the app, in this guide `autoporada.ssps.cz`, with an `A`
      record (and optionally `AAAA`) that points to the server.
- [ ] TCP ports **80 and 443 open from the internet** to the server. This is
      needed even if only people inside the school will use the app: Let's
      Encrypt checks from the internet that the school owns the name before
      it issues the HTTPS certificate. The stack as shipped has no other way
      to get a certificate.

**A way out** (HTTPS, port 443, unless stated)

- [ ] Always: `login.microsoftonline.com`, `graph.microsoft.com`,
      `acme-v02.api.letsencrypt.org`.
- [ ] While installing and updating, because the images are built on the
      server: `github.com`, `registry.npmjs.org`, `registry-1.docker.io`,
      `auth.docker.io`, `production.cloudflare.docker.com`, `gcr.io`,
      `ghcr.io`, `pkg-containers.githubusercontent.com`, and
      `deb.debian.org` over plain HTTP (port 80).
- [ ] If the school's network allows the internet only through a proxy, read
      [A proxy](#a-proxy) first.

**People and facts**

- [ ] The Microsoft 365 administrator has time for
      [ENTRA-SETUP.md](ENTRA-SETUP.md) §1–§3 (about an hour, plus waiting).
- [ ] The headmaster's **Object ID** in Entra (Entra admin center → Users →
      the headmaster → Object ID). The headmaster becomes the app's first
      administrator.
- [ ] An e-mail address of the IT department, for Let's Encrypt.
- [ ] A place for backups that is not this server
      ([OPERATIONS.md](OPERATIONS.md), "Backup").

## Step 1. Prepare the server

Install Docker Engine **27 or newer** with the Compose plugin, from Docker's
own instructions for your distribution (<https://docs.docker.com/engine/install/>),
and `git`, `openssl` and `curl` from the distribution's packages.

Check:

```sh
docker --version          # 27.0 or newer
docker compose version    # prints a version: the plugin is installed
git --version
openssl version
systemctl is-enabled docker   # "enabled": Docker starts after a reboot
```

The commands in this guide are written for an administrator who may use
`sudo` and is a member of the `docker` group
(`sudo usermod -aG docker <name>`, then sign in again). A member of that group
has root's power over the server, so give it to administrators only. If you
work as root, leave `sudo` out.

## Step 2. Get the code

The app must live in `/opt/autoporada`.

```sh
sudo mkdir /opt/autoporada
sudo chown "$USER": /opt/autoporada
git clone <repository address> /opt/autoporada
cd /opt/autoporada/deploy
```

`<repository address>` is where the school keeps the repository. At the time
of writing the project lives at `github.com/ResilientCrow/autoporada`. If the
repository is not public, the server needs a read-only access key for it, or
you copy the repository onto the server by hand.

**Everything from here on runs in `/opt/autoporada/deploy`.**

## Step 3. First run of the install script

```sh
sudo ./install.sh
```

The script can be run as often as you like; it never overwrites a password or
a key that exists. This first time it:

- creates `secrets/` and `state/caddy/`;
- generates the four database passwords;
- creates `.env` from `.env.example`;
- then stops with `missing Entra certificate files: entra_key entra_cert
  web_entra_key web_entra_cert`. That is expected: you make them next.

## Step 4. Make the two certificates

The app proves who it is to Microsoft with certificates instead of passwords.
There are **two pairs**, because the app is registered in Microsoft 365 twice
([ENTRA-SETUP.md](ENTRA-SETUP.md) §1 says why):

| Pair | Used by | Files in `secrets/` | Names in `.env` |
|---|---|---|---|
| **web** | signing people in, searching the school directory | `web_entra_key`, `web_entra_cert` | `WEB_CLIENT_ID`, `WEB_CERT_THUMBPRINT` |
| **mail** | sending e-mail | `entra_key`, `entra_cert` | `CLIENT_ID`, `CERT_THUMBPRINT` |

Note the names: the ones **without** a prefix belong to the **mail** pair.
Mixing the two up is the easiest mistake in the whole installation.

Make both pairs in a work directory:

```sh
mkdir ~/autoporada-certs && cd ~/autoporada-certs

openssl req -x509 -newkey rsa:3072 -sha256 -days 730 -nodes \
  -keyout autoporada-entra.key -out autoporada-entra.crt \
  -subj "/CN=autoporada.ssps.cz"

openssl req -x509 -newkey rsa:3072 -sha256 -days 730 -nodes \
  -keyout autoporada-mail.key -out autoporada-mail.crt \
  -subj "/CN=autoporada-mail.ssps.cz"
```

Put them where the app reads them, then remove the keys from the work
directory:

```sh
sudo cp autoporada-entra.key /opt/autoporada/deploy/secrets/web_entra_key
sudo cp autoporada-entra.crt /opt/autoporada/deploy/secrets/web_entra_cert
sudo cp autoporada-mail.key  /opt/autoporada/deploy/secrets/entra_key
sudo cp autoporada-mail.crt  /opt/autoporada/deploy/secrets/entra_cert
shred -u autoporada-entra.key autoporada-mail.key
```

What is left in `~/autoporada-certs` are the two `.crt` files. They are
public: these are what the Microsoft 365 administrator uploads. The private
keys now exist only in `secrets/` and must never leave the server.

Print the thumbprint and the expiry date of each certificate and write them
down:

```sh
for c in autoporada-entra.crt autoporada-mail.crt; do
  echo "$c"
  openssl x509 -in "$c" -noout -fingerprint -sha1 | sed 's/.*=//; s/://g'
  openssl x509 -in "$c" -noout -enddate
done
```

The first line of each is the **thumbprint**: 40 characters, the same value
the Entra portal shows after the upload. The second is the day the certificate
stops working, two years from now. **Put that date into the IT department's
calendar now, with a reminder two months before.** Nothing in the app will
tell you; sign-in and mail simply stop on that day
([OPERATIONS.md](OPERATIONS.md), "Certificates").

## Step 5. Microsoft 365

Give the Microsoft 365 administrator the two `.crt` files and
[ENTRA-SETUP.md](ENTRA-SETUP.md). They do §1 (the two app registrations),
§2 (the enterprise application) and §3 (the shared mailbox and its permission),
and hand back the values of §7:

- the tenant ID;
- the client ID of the **web** registration and of the **mail** registration;
- the thumbprint the portal shows for each certificate (compare each with what
  you wrote down in step 4: they must be equal);
- the headmaster's Object ID.

## Step 6. Finish the secrets

```sh
cd /opt/autoporada/deploy
sudo ./install.sh
```

It must now end with `install.sh: ready.` It also prints a note about "a data
volume made before the worker existed (M7)" with two commands. **Ignore that
note on a new installation**; it concerns only a database from an early
development version.

If it stops with `the web and the mail registration must differ`, the same
certificate or key was copied to both pairs, or `.env` has the same client ID
twice. Repeat step 4 or correct `.env`.

## Step 7. Fill in the configuration

```sh
sudoedit .env
```

| Name | Required | What to put there |
|---|---|---|
| `APP_VERSION` | yes | A label for the images you are about to build. Use the commit you are installing: the output of `git -C /opt/autoporada rev-parse --short HEAD`, for example `d701b7b`. It changes with every update. |
| `APP_HOST` | yes | The DNS name alone, without `https://`: `autoporada.ssps.cz`. It must be the name in the redirect URI of the web registration. |
| `ACME_EMAIL` | yes | The IT department's e-mail address. Let's Encrypt uses it for the certificate account. |
| `HSTS_MAX_AGE` | no | Leave `86400` (one day) for now. Step 13 raises it. |
| `TENANT_ID` | yes | The Directory (tenant) ID. |
| `CLIENT_ID` | yes | The Application (client) ID of the **mail** registration (`Autoporada mail`). |
| `CERT_THUMBPRINT` | yes | The thumbprint of the **mail** certificate: 40 characters, no colons or spaces. |
| `WEB_CLIENT_ID` | yes | The Application (client) ID of the **web** registration (`Autoporada`). |
| `WEB_CERT_THUMBPRINT` | yes | The thumbprint of the **web** certificate. |
| `DOMAIN_HINT` | no | `ssps.cz`. It skips Microsoft's "pick an account" screen for school accounts. |
| `MAIL_FROM` | no | `autoporada@ssps.cz`: the shared mailbox of ENTRA-SETUP §3. The app can send from no other address. |
| `BOOTSTRAP_HEADMASTER_OID` | first start | The headmaster's Object ID. Step 11 empties it again. |
| `DIRECTORY` | no | Leave `off`. The smoke test (its step 29) says when it may become `graph`. |

No password and no key goes into this file. Any command that starts with
`docker compose` refuses to run while a required value is empty, and names it
(`set TENANT_ID in .env`).

## Step 8. Build the images

```sh
docker compose build
```

This downloads the base images and the packages and compiles the app. It
takes several minutes and needs the outbound addresses listed under
[Before you start](#before-you-start). It ends without an error and
`docker image ls 'autoporada-*'` then lists `autoporada-web`,
`autoporada-worker`, `autoporada-tools` and `autoporada-gotenberg`, each with
the tag you put in `APP_VERSION`.

## Step 9. Check that Microsoft accepts the server

```sh
docker compose run --rm cli auth:probe
```

This asks Microsoft Entra for a token with the **mail** pair, without starting
anything. It must show:

- the issuer `https://login.microsoftonline.com/<your tenant ID>/v2.0`;
- a SHA-1 thumbprint equal to the one in the Entra portal;
- more than 45 days left on the certificate;
- "Entra accepted the credential";
- no warning about roles or `Mail.Send`.

If Entra refuses, the answer carries a code that starts with `AADSTS`. The
table at the end of [SMOKE-TEST.md](../deploy/SMOKE-TEST.md) says what each
one means. The web pair is proved in step 11, when the first person signs in.

## Step 10. Start

```sh
docker compose up -d
```

The first start creates the database, so allow it a minute or two. Then:

```sh
docker compose ps -a
```

must show:

| Service | State |
|---|---|
| `postgres` | `Up … (healthy)` |
| `migrate` | `Exited (0)`: it created the tables and finished |
| `web` | `Up … (healthy)` |
| `worker` | `Up … (healthy)` |
| `gotenberg`, `gotenberg-import` | `Up … (healthy)` |
| `caddy` | `Up` |

`caddy` starts last, once `web` is healthy, and then fetches the HTTPS
certificate, which takes up to a minute. Check from any computer:

```sh
curl -sI https://autoporada.ssps.cz/
```

The answer starts with `HTTP/2 200` and has a `strict-transport-security`
line. In a browser, the page shows „Porada vedení školy“ and the button
„Přihlásit se školním účtem“.

If something is not as described, go to [If a step fails](#if-a-step-fails).

## Step 11. The first headmaster

The app starts with no users. The account whose Object ID is in
`BOOTSTRAP_HEADMASTER_OID` becomes headmaster („Ředitel“) the first time it
signs in, as long as no active headmaster exists yet.

1. Ask the headmaster to open `https://autoporada.ssps.cz` and sign in with
   the school account. They arrive in the app with the headmaster's screens.
2. Empty the value again and restart the web:

   ```sh
   sudoedit .env          # BOOTSTRAP_HEADMASTER_OID=   (nothing after the =)
   docker compose up -d
   ```

   The setting does nothing once a headmaster exists, but the web logs a
   warning at every start while it is set.

Everybody else who signs in lands on „Zatím tu nemáte přístup“ and asks for
access with „Odeslat žádost“. The headmaster decides the requests and sets
people's roles on the screen „Lidé“.

**Ask the headmaster to give a second person the role „Ředitel“ soon** (a
deputy). Only a headmaster can manage users, and the app refuses to remove
the last one. With two, the school is not locked out when one of them leaves
or is ill. What to do when it happens anyway is in
[OPERATIONS.md](OPERATIONS.md), "The headmaster has left".

## Step 12. The smoke test

[deploy/SMOKE-TEST.md](../deploy/SMOKE-TEST.md) is the checklist that proves
the installation against the school's real Microsoft 365: sign-in, the guest
check, the cookies, the e-mail, the reminders, a generated document. Work
through it in order with a few real accounts (the headmaster, a teacher, a
student). Steps 1 to 6 repeat what you have just done; tick them off.

Stop at the first step that fails and look it up in the table at the end of
that document.

## Step 13. Go-live

When the smoke test has passed:

- [ ] Set `HSTS_MAX_AGE=31536000` in `.env` and run `docker compose up -d`.
      Browsers then insist on HTTPS for this name for a year.
- [ ] Set `DIRECTORY=graph` in `.env` if step 29 of the smoke test passed,
      and run `docker compose up -d`. Otherwise leave it `off`: people then
      type names by hand.
- [ ] **Schedule the backup** and test a restore once
      ([OPERATIONS.md](OPERATIONS.md), "Backup" and "Restore"). Until you do,
      nothing protects the school's data.
- [ ] Check that the expiry date of the two Entra certificates is in the IT
      calendar (step 4).
- [ ] Check that a second headmaster exists (step 11).
- [ ] Name who reads the inbox of `autoporada@ssps.cz`. Messages that could
      not be delivered come back there.
- [ ] Name who looks at the server once a week
      ([OPERATIONS.md](OPERATIONS.md), "The weekly check"). The app sends no
      alerts.
- [ ] Put a copy of the repository and of `.env` somewhere other than this
      server.
- [ ] Give the data protection officer
      [gdpr/privacy-review.md](gdpr/privacy-review.md).

## Optional settings

### A firewall on the server

Two of the stack's networks have fixed interface names so that a host
firewall can limit where the containers may connect: `ap-edge` (`caddy` and
`web`) and `ap-egress` (`worker`). [ENTRA-SETUP.md](ENTRA-SETUP.md) §4 lists
which addresses each needs. The repository ships no firewall rules; write
them in the `DOCKER-USER` chain or in nftables to suit the school's network.
The app works without them.

### The school's own fonts in the PDF

The DOCX is the document of record and uses the fonts named in the school's
template. The PDF is made on the server, where the licensed fonts are
missing, so it uses free fonts of the same widths. To get the original fonts
into the PDF, copy their `.ttf` or `.otf` files into
`/opt/autoporada/docker/gotenberg/fonts/` and run `docker compose build` and
`docker compose up -d`. The school must hold a licence for them; they are not
part of the repository.

### A proxy

The stack as shipped connects directly. Where the school allows the internet
only through an HTTP proxy:

- Docker itself needs the proxy to download images and to build
  (<https://docs.docker.com/engine/daemon/proxy/> and the `proxies` entry of
  `~/.docker/config.json` for builds).
- `web` and `worker` need `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY=<proxy>` in
  their environment. Put them in a file `compose.override.yaml` next to
  `compose.yaml`, which Docker Compose reads automatically, so that
  `compose.yaml` itself stays as the repository has it.
- `caddy` must still be reachable from the internet on ports 80 and 443.

This setup has not been tested by the project. Try it before the people
depend on it.

## If a step fails

| What you see | What it means | What to do |
|---|---|---|
| `docker compose …` prints `set APP_HOST in .env` (or another name) | A required value in `.env` is empty | Fill it in (step 7) |
| `install.sh: run as root` | The script was started without `sudo` | `sudo ./install.sh` |
| `install.sh` ends with `missing Entra certificate files` | One of the four files of step 4 is absent or empty | Repeat step 4 for the missing pair |
| `docker compose build` cannot download | An outbound address is closed | Open the build-time addresses under [Before you start](#before-you-start) |
| `web` or `worker` keeps restarting; its log says `Invalid configuration` | A value in `.env` or a secret file is wrong. The message names the setting. | Correct it. A common cause: the thumbprint of the other pair, or one with colons. Then `docker compose up -d`. |
| `caddy` is `Up` but the browser gets a certificate error | Let's Encrypt could not reach the server | Check DNS and that port 80 is open from the internet; read `docker compose logs caddy` |
| `caddy` never starts | It waits for `web` to become healthy | `docker compose logs web` |
| The sign-in ends at Microsoft with an `AADSTS…` code | Microsoft refused the app | Look the code up in the table at the end of [SMOKE-TEST.md](../deploy/SMOKE-TEST.md) |

To read what a service says: `docker compose logs --tail 100 <service>`.
[OPERATIONS.md](OPERATIONS.md) has the full troubleshooting section.

To start the installation over from nothing, **which deletes the database**:

```sh
docker compose down -v      # stops everything and deletes the data volume
```

Never run that on a server that holds real data.

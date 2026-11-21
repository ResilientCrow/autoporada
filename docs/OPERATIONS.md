# Running Autoporada

This is the guide for the time after the installation: what to look at every
week, how to back the app up and bring it back, how to update it, and what to
do when something breaks or somebody leaves. It is written for the school's
IT department and assumes no knowledge of the app's code and **no contact
with its developer**.

- What the app is and does: the [README](../README.md).
- Installing it: [DEPLOYMENT.md](DEPLOYMENT.md).
- The Microsoft 365 side: [ENTRA-SETUP.md](ENTRA-SETUP.md).

Every command and every SQL statement in this guide was run against the
production stack of this repository before it was written down. Where
something could not be tried (it needs the school's own Microsoft 365 or the
school's server), the text says so.

## Contents

- [Where everything is](#where-everything-is)
- [The weekly check](#the-weekly-check)
- [Starting, stopping, restarting](#starting-stopping-restarting)
- [Logs](#logs)
- [Backup](#backup)
- [Restore](#restore)
- [Updating](#updating)
- [Certificates](#certificates)
- [People and access](#people-and-access)
  - [The headmaster has left](#the-headmaster-has-left)
- [E-mail](#e-mail)
- [Documents and the PDF](#documents-and-the-pdf)
- [Changing the configuration](#changing-the-configuration)
- [Moving to another server](#moving-to-another-server)
- [Shutting the app down for good](#shutting-the-app-down-for-good)
- [Requests about personal data](#requests-about-personal-data)
- [What the app does not do](#what-the-app-does-not-do)
- [If the developer cannot be reached](#if-the-developer-cannot-be-reached)
- [Troubleshooting](#troubleshooting)

## Where everything is

| Where | What |
|---|---|
| `/opt/autoporada` | The repository (the code, these documents) |
| `/opt/autoporada/deploy` | The production stack. **Every command in this guide runs here** unless it says otherwise. |
| `deploy/compose.yaml` | The description of the services. Do not edit it; local changes go into `.env` or a `compose.override.yaml`. |
| `deploy/.env` | The configuration (no secrets). Root owns it: edit with `sudoedit .env`. |
| `deploy/secrets/` | The database passwords and the two private keys. Only root can read it. |
| `deploy/state/caddy/` | The HTTPS certificate from Let's Encrypt |
| Docker volume `autoporada_pgdata` | The database: all of the school's data |

The services (`docker compose ps -a` lists them):

| Service | What it does | Normal state |
|---|---|---|
| `caddy` | The only door: HTTPS on ports 80 and 443 | `Up` |
| `web` | The app people use | `Up (healthy)` |
| `worker` | Sends the e-mail, makes the PDF, runs the timed jobs | `Up (healthy)` |
| `gotenberg` | Converts the generated DOCX to PDF for the worker | `Up (healthy)` |
| `gotenberg-import` | Converts an old `.doc` that somebody imports as an annex | `Up (healthy)` |
| `postgres` | The database | `Up (healthy)` |
| `migrate` | Runs at every start, brings the database tables up to date, then ends | `Exited (0)` |

Three commands come back all the time:

```sh
docker compose ps -a                     # the state of every service
docker compose logs --tail 100 <service> # what a service said last
docker compose run --rm cli <command>    # the app's maintenance commands
```

The maintenance commands are `auth:probe`, `jobs:status`, `jobs:redrive`,
`jobs:run` and `mail:test`; each is explained where it is needed.
`docker compose run --rm cli` with no command lists them.

Some steps talk to the database directly. This opens a database prompt
(`\q` leaves it):

```sh
docker compose exec postgres psql -U pgadmin -d autoporada
```

It needs no password, because it runs inside the database's own container.
`pgadmin` may do anything in the database, so run only what this guide gives
you, and **take a backup first** whenever a step changes data.

Two things that look wrong and are not:

- `git status` in `/opt/autoporada` shows `deploy/state/` as untracked. That
  is the HTTPS certificate. Never run `git clean` there.
- `install.sh` always prints a note about "a data volume made before the
  worker existed (M7)". It does not concern a server installed with
  [DEPLOYMENT.md](DEPLOYMENT.md).

## The weekly check

The app sends **no alerts**. Nobody is told when a backup fails, when a disk
fills or when e-mail stops. One named person looks once a week; it takes five
minutes.

```sh
cd /opt/autoporada/deploy

# 1. Is everything running?
docker compose ps -a

# 2. Is any e-mail or job stuck?
docker compose run --rm cli jobs:status

# 3. Did anything complain during the last week?
docker compose logs --since 168h web worker | grep -E '"level":"(warn|error|fatal)"' | tail -n 40

# 4. Is the newest backup from last night?
sudo ls -lh /var/backups/autoporada | tail -n 3
sudo tail -n 5 /var/log/autoporada-backup.log

# 5. Is there room on the disks?
df -h / /var/lib/docker /var/backups
```

What to expect:

1. The states of the table under
   [Where everything is](#where-everything-is). A service that shows
   `Restarting` or `unhealthy` is a problem: go to
   [Troubleshooting](#troubleshooting).
2. One line for each job queue and then **`dead: 0`**. Any other number
   means a message or a job was given up: go to [E-mail](#e-mail).
3. Nothing, or lines you can explain with the table in
   [Logs](#logs). Lines about a certificate that expires need action:
   [Certificates](#certificates).
4. A file with yesterday's or today's date and a size close to the one
   before it, and a last log line that starts `autoporada-backup: wrote`.
5. Less than 80 % used.

Also once a week:

- Somebody reads the inbox of `autoporada@ssps.cz`. Messages the app could
  not deliver come back there.
- Install the operating system's security updates. Updating Docker restarts
  the containers; the app is back within a minute.

Every three months, do the restore drill ([Restore](#restore)) and look at
the expiry dates in [Certificates](#certificates).

## Starting, stopping, restarting

```sh
docker compose up -d            # start everything (also applies a changed .env)
docker compose stop             # stop everything; the data stays
docker compose restart web      # restart one service
docker compose down             # stop and remove the containers; the data stays
```

- After a reboot of the server everything starts by itself, as long as
  Docker does (`systemctl is-enabled docker` says `enabled`).
- People who were signed in stay signed in over a restart. Anybody who is
  typing while the app is away sees „Server teď neodpovídá. Zkuste to za
  chvíli.“, and what they typed in that minute may not be saved. Restart
  outside school hours when you can.
- **`docker compose down -v` deletes the database.** The `-v` removes the
  data volume. Never type it on this server, except as a step of
  [Restore](#restore).

## Logs

Each service writes its log to Docker. Docker keeps the last 50 MB for each
service (five files of 10 MB) and **throws a service's log away when its
container is replaced**, which happens at every update and whenever a change
in `.env` touches that service. To keep a log, save it first:

```sh
docker compose logs --no-color --since 24h worker > ~/worker-$(date +%F).log
```

`web` and `worker` write one JSON object on each line, with the fields
`level`, `time`, `service` and `msg`. The logs carry codes and ids. They
never carry a name, an e-mail address, the text somebody wrote or the
subject of a message, so a log can be shown to a person who must not see the
school's data.

Lines worth knowing:

| `msg` | Level | Meaning |
|---|---|---|
| `web process configured` | info | The web started and read its configuration |
| `worker.ready`, `cron.registered` | info | The worker started and its timed jobs are set |
| `the certificate expires in N days: renew it (ENTRA-SETUP §6)` | warn | An Entra certificate has 45 days or less left. Written **only when the service starts**: [Certificates](#certificates) |
| `the certificate has expired: renew it (ENTRA-SETUP §6)` | error | Sign-in or mail has stopped: [Certificates](#certificates) |
| `BOOTSTRAP_HEADMASTER_OID is set: empty it …` | warn | Step 11 of the installation was not finished |
| `mail.sent` | info | A message left for Microsoft |
| `mail.deferred` | warn | The worker could not reach Microsoft or was told to slow down; it tries again by itself |
| `mail.systemic` | warn | Microsoft refuses the app's right to send: [E-mail](#e-mail) |
| `job.retry` | warn | A job failed and will run again |
| `job.dead` | error | A job was given up: [E-mail](#e-mail) |
| `worker.start_failed` | error | The worker cannot start: [Troubleshooting](#troubleshooting) |
| `Invalid configuration` | error | A value in `.env` or a secret file is wrong; the message names it |

The table at the end of [SMOKE-TEST.md](../deploy/SMOKE-TEST.md) explains
more codes, among them Microsoft's `AADSTS…` ones.

`caddy` logs every request (without the parts of an address that could hold a
name or a sign-in code). It is where to look when the browser cannot reach
the app at all.

**Who did what** is not in these logs but in the database, in the table
`audit_events`: sign-ins, role changes, decisions, generated documents,
downloads. It holds ids and codes, never the texts. To read the last 50
entries:

```sh
docker compose exec -T postgres psql -U pgadmin -d autoporada -c \
  "SELECT a.at, u.display_name AS who, a.action, a.target_type FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.at DESC LIMIT 50;"
```

A trigger in the database refuses to change or delete a row of that table.

## Backup

**The repository ships no backup. Until you set one up, nothing protects the
school's data.**

Everything the school has entered lives in the one PostgreSQL database:
people and their roles, every point, akce and jednání, the settings, the
audit log and the generated DOCX and PDF files themselves. A dump of that
database is a complete backup. The dump does **not** hold the database
passwords or the Entra keys, and it does not need to: they are made again at
a restore.

A dump holds personal data in readable form. Keep it where only the IT
department can read it.

### The backup script

Save this as `/usr/local/sbin/autoporada-backup`:

```sh
#!/bin/sh
# One backup of the Autoporada database (docs/OPERATIONS.md, "Backup").
set -eu
umask 077

STACK=/opt/autoporada/deploy       # where compose.yaml is
DEST=/var/backups/autoporada       # where the dumps go
KEEP_DAYS=30                       # older dumps are deleted

mkdir -p "$DEST"
rm -f "$DEST"/*.part
file="$DEST/autoporada-$(date +%Y-%m-%d-%H%M).dump"

cd "$STACK"
docker compose exec -T postgres pg_dump -U pgadmin -d autoporada --format=custom >"$file.part"
# A file that cannot be read back is not a backup.
docker compose exec -T postgres pg_restore --list <"$file.part" >/dev/null
mv "$file.part" "$file"

find "$DEST" -name 'autoporada-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "autoporada-backup: wrote $file ($(du -h "$file" | cut -f1))"
```

Then:

```sh
sudo chmod 0750 /usr/local/sbin/autoporada-backup
sudo /usr/local/sbin/autoporada-backup
```

It prints `autoporada-backup: wrote /var/backups/autoporada/autoporada-<date>.dump (<size>)`.
The dump is readable by root only. The app keeps running during a backup and
people notice nothing. When the database is not running, the script ends
with an error (`service "postgres" is not running`) and writes no dump.

### Every night

Create `/etc/cron.d/autoporada-backup` with this one line:

```
30 2 * * * root /usr/local/sbin/autoporada-backup >>/var/log/autoporada-backup.log 2>&1
```

The next morning, check that `/var/log/autoporada-backup.log` ends with a
`wrote` line and that the file is there. The schedule itself could not be
tried by the project (it is the server's own cron), so do not skip this
check.

### A copy somewhere else

A backup on the same server is lost with the server. Copy
`/var/backups/autoporada` every night to a machine the school controls: let
the school's existing backup system collect that directory, or copy it with
`rsync` or `scp` after the dump. If the copy leaves the school's own systems,
encrypt it first with the tool the school already uses; the repository ships
none.

Keep next to the backups:

- a copy of the repository (`git clone` of it, or a copy of
  `/opt/autoporada` without `deploy/secrets`);
- a copy of `deploy/.env`.

With a dump, the repository and `.env`, the app can be rebuilt on an empty
server. With the dump alone it still can, by anybody who follows
[DEPLOYMENT.md](DEPLOYMENT.md).

## Restore

A backup that was never restored is a hope, not a backup. Do the drill once
after the installation and then every three months.

### The drill: prove that a backup works

This restores the newest dump into a second, empty database next to the real
one. It changes nothing in the real one and people can keep working.

```sh
cd /opt/autoporada/deploy
dump=$(sudo sh -c 'ls -t /var/backups/autoporada/*.dump' | head -n 1)
echo "$dump"                              # the newest dump

docker compose exec -T postgres psql -U pgadmin -d postgres \
  -c "CREATE DATABASE restore_test OWNER autoporada_owner;"

sudo cat "$dump" | \
  docker compose exec -T postgres pg_restore -U pgadmin -d restore_test --exit-on-error

docker compose exec -T postgres psql -U pgadmin -d restore_test -c \
  "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM issues) AS poradas, (SELECT count(*) FROM generated_documents) AS documents, (SELECT max(at) FROM audit_events) AS last_audit_entry;"

docker compose exec -T postgres psql -U pgadmin -d postgres \
  -c "DROP DATABASE restore_test;"
```

`pg_restore` must print nothing. The query then shows how many people,
poradas and generated documents the backup holds and when its last audit
entry was written: that time must be shortly before the backup was taken.

### Restore on the same server

Use this when the database is damaged or when data must go back to the state
of a backup. **Everything written after that backup is lost.**

```sh
cd /opt/autoporada/deploy
docker compose down                       # stop the app
docker volume rm autoporada_pgdata        # delete the damaged database
docker compose up -d --wait postgres      # an empty database, with the app's accounts
sudo cat /var/backups/autoporada/<file>.dump | \
  docker compose exec -T postgres pg_restore -U pgadmin -d autoporada --exit-on-error
docker compose up -d                      # start the app
docker compose ps -a
```

If you can, take one more dump of the damaged database before you delete it,
and keep it apart.

`pg_restore` must end without a message. It restores only into an empty
database: run a second time, it stops at once with
`schema "drizzle" already exists` and changes nothing.

Whoever signed in after that backup was taken has to sign in again.

### Restore on a new server

Use this when the server is lost, and for
[Moving to another server](#moving-to-another-server).

1. Install the new server with [DEPLOYMENT.md](DEPLOYMENT.md), steps 1 to 8
   (up to and including `docker compose build`), with these differences:
   - Use the repository as it is now, or newer. Never restore a dump into
     code that is **older** than the code that wrote it.
   - The Entra certificates: if the old server's `deploy/secrets/` still
     exists, copy its four files `entra_key`, `entra_cert`, `web_entra_key`
     and `web_entra_cert` to the new server's `deploy/secrets/` and run
     `sudo ./install.sh`; `.env` then keeps the old thumbprints. If it is
     gone, make two new pairs (step 4), have the Microsoft 365 administrator
     upload the two new `.crt` files to the two existing app registrations
     ([ENTRA-SETUP.md](ENTRA-SETUP.md) §6, "Renewal") and put the new
     thumbprints into `.env`. Nothing else changes in Microsoft 365.
   - Leave `BOOTSTRAP_HEADMASTER_OID` empty. The people come with the data.
   - The database passwords are new ones. That is fine: they are not part of
     a dump.
2. Copy the newest dump to the new server and restore it **before the first
   start of the app**:

   ```sh
   cd /opt/autoporada/deploy
   docker compose up -d --wait postgres
   docker compose exec -T postgres pg_restore -U pgadmin -d autoporada --exit-on-error < <file>.dump
   docker compose up -d
   ```

3. Point the DNS name to the new server. Caddy fetches a new HTTPS
   certificate as soon as the name leads to it.
4. Check with `docker compose run --rm cli auth:probe`, then ask the
   headmaster to sign in and to open the archive.
5. Set up [Backup](#backup) on the new server.

### When only `deploy/secrets/` is lost

The data volume is intact but the passwords and keys are gone, so the app
cannot reach its database. The database still holds the old passwords, and
new files alone do not change them. The way out is a dump and a fresh
volume:

1. `sudo ./install.sh` makes new database passwords. It then stops because
   the Entra files are missing; that is expected.
2. `docker compose up -d --wait postgres` starts the database alone.
3. `sudo /usr/local/sbin/autoporada-backup` takes a dump. It needs no
   password.
4. Follow [Restore on the same server](#restore-on-the-same-server) with
   that dump, **up to but not including** its last `docker compose up -d`.
   The fresh volume takes the new passwords.
5. Make the Entra keys anew as described under
   [Restore on a new server](#restore-on-a-new-server), run
   `sudo ./install.sh` until it says `ready`, then `docker compose up -d`.

## Updating

An update is a newer state of the repository: the app's own changes together
with newer versions of what it is built from. Every version number is pinned
in the repository, so building again **without** a newer repository changes
nothing.

Plan an update outside school hours. The app is away for about a minute.

```sh
# 1. A backup first. Always.
sudo /usr/local/sbin/autoporada-backup

# 2. What will change?
cd /opt/autoporada
git rev-parse --short HEAD            # write this down: the version you run now
git fetch
git log --oneline HEAD..origin/main   # the changes you are about to install
git diff --stat HEAD origin/main -- drizzle/   # any output: the database will be changed

# 3. Get the code and name the new version.
git pull --ff-only
git rev-parse --short HEAD            # the new version
cd deploy
sudoedit .env                         # APP_VERSION=<the new version>

# 4. Build and start.
sudo ./install.sh
docker compose build
docker compose up -d
docker compose ps -a
```

Afterwards: all services are in their normal state, `migrate` shows
`Exited (0)`, the sign-in works, and
`docker compose run --rm cli jobs:status` ends with `dead: 0`.

If `git pull --ff-only` refuses, somebody changed files in `/opt/autoporada`.
`git status` shows which. Do not force it; find out why first.

Old images stay on the disk. Once the new version has run for a week, remove
the ones you no longer need: `docker image ls 'autoporada-*'` lists them,
`docker image rm autoporada-web:<old version>` (and the same for
`autoporada-worker`, `autoporada-tools`, `autoporada-gotenberg`) removes
one.

### Going back

If the new version does not work:

```sh
cd /opt/autoporada
git checkout <the version you wrote down>
cd deploy
sudoedit .env                         # APP_VERSION=<the version you wrote down>
docker compose up -d                  # the old images are still there
```

This is enough **only if the update did not change the database** (step 2
printed nothing for `drizzle/`). Database changes go forward only: the old
code may not work with the changed tables. In that case also restore the
backup of step 1 ([Restore on the same server](#restore-on-the-same-server)),
which loses what people wrote since.

To return to normal updates later: `git checkout main`.

### Who makes the updates

Updates appear in the repository only while somebody maintains it. The file
`renovate.json` configures Renovate, a service that proposes newer versions
of the app's building blocks as pull requests; it works only while it is
switched on for the repository and somebody reviews and merges what it
proposes. Without a maintainer the app keeps working as it is, but security
fixes for what it is built from (Node.js, Next.js, PostgreSQL, Caddy,
LibreOffice) stop arriving. See
[If the developer cannot be reached](#if-the-developer-cannot-be-reached).

The server's own updates (the operating system, Docker) are independent of
the repository and stay the IT department's job.

## Certificates

There are three certificates. One looks after itself; two do not.

| Certificate | For | Lifetime | Renewal |
|---|---|---|---|
| HTTPS (Let's Encrypt) | The padlock in the browser | 90 days or less | **Automatic**, by Caddy |
| Entra **web** pair (`secrets/web_entra_key`, `web_entra_cert`) | Signing people in, the directory search | 2 years | **By hand** |
| Entra **mail** pair (`secrets/entra_key`, `entra_cert`) | Sending e-mail | 2 years | **By hand** |

### The HTTPS certificate

Caddy renews it well before it ends (when a third of its lifetime is left).
This works as long as the DNS name points to the server and ports 80 and 443
are open from the internet. Let's Encrypt no longer sends warning e-mails,
so check now and then:

```sh
echo | openssl s_client -connect autoporada.ssps.cz:443 -servername autoporada.ssps.cz 2>/dev/null | openssl x509 -noout -enddate
```

If the date is less than a week away, read `docker compose logs caddy` and
check DNS and the two ports.

### The two Entra certificates

**When one of them expires, that part of the app stops on that day**: with
the web pair nobody can sign in, with the mail pair no e-mail leaves. The
app does not send a warning. It only writes a line into the log when `web`
or `worker` starts with 45 days or less left, and `auth:probe` says the
same for the mail pair. The reminder that counts is the one in the IT
calendar (step 4 of the installation).

How long each has left:

```sh
sudo openssl x509 -in secrets/web_entra_cert -noout -enddate   # the web pair
sudo openssl x509 -in secrets/entra_cert -noout -enddate       # the mail pair
```

**Renewing a pair**, at any time before it expires. The app keeps working
throughout, because Microsoft accepts the old and the new certificate side
by side. For the **web** pair:

1. Make the new pair on the server:

   ```sh
   mkdir -p ~/autoporada-certs && cd ~/autoporada-certs
   openssl req -x509 -newkey rsa:3072 -sha256 -days 730 -nodes \
     -keyout autoporada-entra.key -out autoporada-entra.crt \
     -subj "/CN=autoporada.ssps.cz"
   openssl x509 -in autoporada-entra.crt -noout -fingerprint -sha1 | sed 's/.*=//; s/://g'
   openssl x509 -in autoporada-entra.crt -noout -enddate
   ```

   The first of the two last lines is the new thumbprint.
2. The Microsoft 365 administrator uploads `autoporada-entra.crt` to the
   registration `Autoporada` (Certificates & secrets → Certificates → Upload
   certificate) and **leaves the old certificate there** for now.
3. Put the new pair in place and tell the app its thumbprint:

   ```sh
   cd /opt/autoporada/deploy
   sudo cp ~/autoporada-certs/autoporada-entra.key secrets/web_entra_key
   sudo cp ~/autoporada-certs/autoporada-entra.crt secrets/web_entra_cert
   shred -u ~/autoporada-certs/autoporada-entra.key
   sudoedit .env                 # WEB_CERT_THUMBPRINT=<the new thumbprint>
   sudo ./install.sh
   docker compose up -d
   ```

4. Sign in to the app. When it works, the Microsoft 365 administrator
   deletes the old certificate from the registration.
5. Put the new expiry date into the IT calendar.

For the **mail** pair the steps are the same with these names: files
`autoporada-mail.key` and `autoporada-mail.crt`, subject
`/CN=autoporada-mail.ssps.cz`, registration `Autoporada mail`, secret files
`secrets/entra_key` and `secrets/entra_cert`, setting `CERT_THUMBPRINT`. The
check in step 4 is `docker compose run --rm cli auth:probe`, which must say
"Entra accepted the credential", and then
`docker compose run --rm cli mail:test --user <id>` ([E-mail](#e-mail)).

If `web` or `worker` keeps restarting after step 3 with
`Invalid configuration` in its log, the thumbprint in `.env` does not belong
to the certificate file: the app compares them at every start.

**If a certificate has already expired**, do the same steps. People can sign
in again, or mail flows again, as soon as step 3 is done. Mail that waited
is sent afterwards if it waited less than about three hours; older messages
are in the dead queue ([E-mail](#e-mail)).

The renewal needs the school's Microsoft 365 and could not be tried by the
project; the commands on the server were.

## People and access

Who may use the app is decided **inside the app**, by a headmaster
(„Ředitel“) on the screen „Lidé“: accepting requests for access, giving and
taking roles, blocking an account. IT has no part in it, and this is how it
should stay. A change made there ends that person's sessions at once.

Removing somebody's account in Microsoft 365 stops them from signing in to
the app as well, since the app has no passwords of its own. A session that
is already open lasts at most 12 hours (4 hours without activity).

The app's own rule: **there is always at least one active headmaster.** The
app and the database both refuse to demote or block the last one. This is
why the installation guide asks for a second headmaster.

### The headmaster has left

If another headmaster exists, they give the role to the successor on the
screen „Lidé“ and take it from the one who left. Nothing to do on the
server.

If the **only** headmaster is gone (left the school, long illness, account
deleted), nobody can manage people in the app, and only the server can help.
`BOOTSTRAP_HEADMASTER_OID` does **not** work here: it acts only while no
active headmaster exists, and the one who left still counts as one.

Get the school management's decision in writing first: this step gives a
person full control of the app, and it is **not recorded in the app's audit
log**.

1. The successor signs in to the app once (they may land on „Zatím tu nemáte
   přístup“; that is enough).
2. Take a backup: `sudo /usr/local/sbin/autoporada-backup`.
3. Find both people:

   ```sh
   docker compose exec -T postgres psql -U pgadmin -d autoporada -c \
     "SELECT id, display_name, email, role, status, tier FROM users ORDER BY display_name;"
   ```

4. Make the successor a headmaster (put their `id` in):

   ```sh
   docker compose exec -T postgres psql -U pgadmin -d autoporada -c \
     "UPDATE users SET role = 'headmaster', status = 'active', version = version + 1, updated_at = now() WHERE id = '<id>' AND tier IS DISTINCT FROM 'student' AND tier IS DISTINCT FROM 'absolvent';"
   ```

   It must answer `UPDATE 1`. `UPDATE 0` means the id is wrong or the
   account is a student's or an absolvent's; they can never hold this role.
5. The successor signs in again and now has the screen „Lidé“. There they
   take the role from the headmaster who left, or block that account. From
   here on everything is recorded in the audit log again.

### Blocking an account from the server

Only when no headmaster can do it in the app and it cannot wait. The first
statement blocks the account and ends its sessions:

```sh
docker compose exec -T postgres psql -U pgadmin -d autoporada -c \
  "UPDATE users SET status = 'blocked', version = version + 1, updated_at = now() WHERE id = '<id>';"
```

For the last active headmaster the database answers
`ERROR:  at least one active headmaster must remain`; make somebody else a
headmaster first. To undo a block, a headmaster uses „Odblokovat účet“ on
the person's page in „Lidé“.

### Signing everybody out

After a suspected break-in, or when a signed-in computer was lost:

```sh
docker compose exec -T postgres psql -U pgadmin -d autoporada -c "DELETE FROM sessions;"
```

Everybody signs in again with their school account; nothing else is lost.
For one person, add `WHERE user_id = '<id>'` before the semicolon.

## E-mail

The app sends short messages from `autoporada@ssps.cz`: the answer to a
request for access, the decision about a point, the request to write a
report after an akce, reminders before the deadline and notices about late
reports. The headmaster can switch the reminders off in the app („Nastavení“
→ „Připomínky e-mailem“). No message carries the text of a point; each only
says what happened and links to the app.

How a message travels: `web` puts it into a queue in the database, `worker`
hands it to Microsoft Graph, Microsoft delivers it. When Microsoft cannot be
reached or refuses, the worker tries again by itself, 16 times over about
three hours. After that the message goes to the **dead queue** and waits
there for 90 days for a person to decide.

```sh
docker compose run --rm cli jobs:status
```

prints one line for each queue, for example `mail.send: 3 completed`, then
`dead: <number>` and one line for each dead job: its id, the queue it came
from, the kind of message, a key, the time and a **code** that says why it
was given up.

**"People get no e-mail"**, in this order:

1. `docker compose ps worker`: is the worker `Up (healthy)`?
2. `docker compose run --rm cli auth:probe`: does Microsoft still accept the
   mail certificate? If it has expired: [Certificates](#certificates).
3. `docker compose logs --since 3h worker | grep -E 'mail\.|job\.'`:
   - `mail.sent`: the app did its part. Look in the inbox of
     `autoporada@ssps.cz` for a message that came back, and in the
     recipient's junk folder.
   - `mail.systemic`: Microsoft refuses the app's right to send. Normal for
     up to two hours after the Microsoft 365 administrator set the
     permission; later it means the permission of
     [ENTRA-SETUP.md](ENTRA-SETUP.md) §3 was removed or changed.
   - `mail.deferred` with a `net.` code: the server cannot reach
     `login.microsoftonline.com` or `graph.microsoft.com` (firewall, DNS).
4. Send a test message to a headmaster or a member of „Vedení“ (their `id`
   is in the list of step 3 of [The headmaster has left](#the-headmaster-has-left)):

   ```sh
   docker compose run --rm cli mail:test --user <id>
   ```

   It prints `Test mail queued: …`; the message „Autoporada: zkušební
   zpráva“ should arrive within a few minutes. The command refuses anybody
   who is not an active member of „Vedení“ or a headmaster.

**Dead jobs.** Fix the cause first, then send them again:

```sh
docker compose run --rm cli jobs:redrive --source mail.send     # every dead message
docker compose run --rm cli jobs:redrive --id <id>              # one job
```

It prints `Redrove N job(s).` Two codes need care before a redrive:

- `ambiguous`: the message was probably delivered but Microsoft's answer was
  lost. Ask the recipient first; a redrive may send it again.
- a code that starts with `rejected`: Microsoft refused this message for
  good, usually because of the address. A redrive will be refused again.

A reminder that is days late helps nobody: for old reminders it is usually
right to leave them dead. They disappear after 90 days.

**The timed jobs** run in the worker, in Prague time: reminders and late
reports are checked every 15 minutes, the request for a report goes out at
08:00, old delivery records are deleted at 05:10. A job that was missed
while the server was off runs when the worker is back. To run one now:
`docker compose run --rm cli jobs:run <job>`; without a name it lists the
jobs.

## Documents and the PDF

When the headmaster generates a porada, `web` builds the **DOCX** and stores
it in the database at once. The DOCX is the document of record. The `worker`
then has `gotenberg` convert it to **PDF**, which takes a few seconds, and
stores the PDF too. Both are downloaded from the archive in the app.

If the conversion fails, the worker tries six times and then marks the PDF
as failed; the archive then says so and offers the DOCX only. **The app
cannot make the PDF again**, and a generated porada cannot be reopened or
generated a second time. When a PDF is needed, open the DOCX in Word and
save it as PDF.

When PDFs fail: `docker compose ps gotenberg` must show `Up (healthy)`;
`docker compose logs --tail 50 gotenberg` and
`docker compose logs --since 1h worker | grep pdf.render` show why.
`docker compose restart gotenberg` is safe at any time.

To see what is stored:

```sh
docker compose exec -T postgres psql -U pgadmin -d autoporada -c \
  "SELECT i.meeting_date, d.pdf_status, d.pdf_failure, pg_size_pretty(octet_length(d.docx)::bigint) AS docx, pg_size_pretty(octet_length(d.pdf)::bigint) AS pdf FROM generated_documents d JOIN issues i ON i.id = d.issue_id ORDER BY i.meeting_date;"
```

To take the documents out of the database without the app, see
[Shutting the app down for good](#shutting-the-app-down-for-good).

## Changing the configuration

Edit `deploy/.env` with `sudoedit .env`, then run `docker compose up -d`.
Docker restarts only the services the change touches.

| To change | Do this |
|---|---|
| The address of the app (`APP_HOST`) | New DNS record; the Microsoft 365 administrator adds the new redirect URI `https://<new name>/auth/callback` to the registration `Autoporada`; then `APP_HOST` in `.env`. Everybody signs in again. Links in old e-mails stop working. |
| The sender (`MAIL_FROM`) | Only together with [ENTRA-SETUP.md](ENTRA-SETUP.md) §3: the app may send from the one mailbox named there |
| The people search (`DIRECTORY`) | `graph` or `off`; see step 13 of the installation |
| HTTPS strictness (`HSTS_MAX_AGE`) | See step 13 of the installation |
| A database password | Do not. A new password in `secrets/` is not enough; the database keeps the old one. If you must, restore into a fresh volume ([Restore](#restore)). |
| Anything about the porada: the deadline, reminders, people, lists of students, a new school year | Not on the server. The headmaster does it in the app. |

Values the stack sets itself (addresses of the other services, file paths)
are in `compose.yaml` and need no change. If the school needs one (a proxy,
for example), write it into a `compose.override.yaml` next to it, so that an
update does not collide with a local edit.

## Moving to another server

1. Install the new server up to `docker compose build`
   ([Restore on a new server](#restore-on-a-new-server), step 1).
2. Tell people when the app will be away (about half an hour).
3. On the old server, stop the app but leave the database running, and take
   the last dump:

   ```sh
   cd /opt/autoporada/deploy
   docker compose stop caddy web worker
   sudo /usr/local/sbin/autoporada-backup
   ```

4. Copy that dump to the new server and continue with
   [Restore on a new server](#restore-on-a-new-server), steps 2 to 5.
5. Keep the old server switched off but untouched for two weeks. Then delete
   its data, once the new server has backups of its own: on the old server
   `docker compose down -v` deletes the database, and the directories
   `/opt/autoporada/deploy/secrets` and `/var/backups/autoporada` go too.

## Shutting the app down for good

When the school stops using Autoporada, the generated documents are what is
worth keeping. Download them from the archive in the app, or take all of
them out of the database at once:

```sh
cd /opt/autoporada/deploy
out=~/autoporada-export; mkdir -p "$out"
q() { docker compose exec -T postgres psql -U pgadmin -d autoporada -At -c "$1"; }

for d in $(q "SELECT i.meeting_date FROM generated_documents d JOIN issues i ON i.id = d.issue_id ORDER BY 1"); do
  q "SELECT encode(d.docx, 'base64') FROM generated_documents d JOIN issues i ON i.id = d.issue_id WHERE i.meeting_date = '$d' ORDER BY d.version DESC LIMIT 1" | base64 -d > "$out/porada-$d.docx"
  q "SELECT encode(d.pdf, 'base64') FROM generated_documents d JOIN issues i ON i.id = d.issue_id WHERE i.meeting_date = '$d' AND d.pdf IS NOT NULL ORDER BY d.version DESC LIMIT 1" | base64 -d > "$out/porada-$d.pdf"
  [ -s "$out/porada-$d.pdf" ] || rm "$out/porada-$d.pdf"
done

# The checksums the app stored when it generated each file:
q "SELECT d.docx_sha256 || '  porada-' || i.meeting_date || '.docx' FROM generated_documents d JOIN issues i ON i.id = d.issue_id UNION ALL SELECT d.pdf_sha256 || '  porada-' || i.meeting_date || '.pdf' FROM generated_documents d JOIN issues i ON i.id = d.issue_id WHERE d.pdf IS NOT NULL" > "$out/SHA256SUMS"
(cd "$out" && sha256sum -c SHA256SUMS)
```

This writes `porada-<date of the meeting>.docx` for every generated porada,
and the `.pdf` where one exists. `sha256sum` must print `OK` for every file:
each is then exactly what the headmaster generated.

Then:

1. Decide with the school management and the data protection officer how
   long a last dump of the database is kept and who may read it. It holds
   everything, including the audit log.
2. `docker compose down -v` deletes the database. Delete `deploy/secrets/`
   and the backups that are not to be kept.
3. The Microsoft 365 administrator removes the two app registrations
   (`Autoporada`, `Autoporada mail`), the Exchange role assignment and scope
   of [ENTRA-SETUP.md](ENTRA-SETUP.md) §3 and, if nobody needs it, the shared
   mailbox.
4. Remove the DNS record.

## Requests about personal data

The school is the controller of the data;
[gdpr/privacy-review.md](gdpr/privacy-review.md) describes what the app
holds and why. The app has **no tool** for a person's request to see or to
erase their data. Until one exists, IT answers with the database.

**What the app holds about one person.** Find the person's `id` first, then
put it into the other queries:

```sql
-- who (part of the name or of the address)
SELECT id, display_name, email, role, status, tier, created_at
  FROM users WHERE display_name ILIKE '%novák%' OR email ILIKE '%novak%';

-- what they wrote
SELECT id, kind, state, title, created_at, updated_at
  FROM points WHERE author_id = '<id>' ORDER BY created_at;
SELECT id, kind, state, title, start_date, organizer, participants, note, created_at
  FROM future_items WHERE author_id = '<id>' ORDER BY created_at;
SELECT reason, state, created_at, decided_at
  FROM access_requests WHERE user_id = '<id>' ORDER BY created_at;

-- what the app recorded about their actions, and which messages it sent them
SELECT at, action, target_type, target_id
  FROM audit_events WHERE actor_id = '<id>' ORDER BY at;
SELECT template, state, claimed_at, settled_at
  FROM mail_ledger WHERE recipient_id = '<id>' ORDER BY claimed_at;
```

A person can also be **named in texts other people wrote** (a report about
an event names its participants) and so in the generated documents. To find
those:

```sql
SELECT 'point' AS found_in, id, title FROM points
  WHERE concat_ws(' ', title, opening, place, body::text, bullets::text, statements::text) ILIKE '%Novák%'
UNION ALL
SELECT 'akce or jednani', id, title FROM future_items
  WHERE concat_ws(' ', title, place, organizer, participants, note) ILIKE '%Novák%';

SELECT i.meeting_date FROM generated_documents d JOIN issues i ON i.id = d.issue_id
  WHERE d.snapshot::text ILIKE '%Novák%' ORDER BY i.meeting_date;
```

Czech names change their endings (Novák, Nováka, Novákovi), so search for the
part that stays the same. Run the queries in the database prompt
([Where everything is](#where-everything-is)).

**Correcting.** The name and the e-mail address come from Microsoft 365 and
are refreshed every time the person signs in. Correct them there.

**Erasing.** There is no safe statement to give here. A person's row is
referred to by what they wrote, by the history of every point and by the
audit log, and the audit log cannot be changed. What IT can do at once is
have a headmaster block the account („Lidé“ → „Zablokovat účet“) or take
its role away. Whether texts and generated minutes of the school's
management must be changed at all is a legal question for the data
protection officer; if the answer is yes, it is a task for a developer.

## What the app does not do

Older planning documents in this repository ([plan.md](plan.md), the privacy
review) describe some of these as if they existed. They do not. Each is
something the IT department does by hand, or lives without:

| Not built | What to do instead |
|---|---|
| Automatic backups, encrypted or off-site | [Backup](#backup) |
| Alerts by e-mail (failed backup, full disk, expiring certificate, stuck mail) | [The weekly check](#the-weekly-check); the IT calendar for the certificates |
| A health address for a monitoring system | If the school monitors its servers, watch `https://autoporada.ssps.cz/` for the answer 200 and the output of `docker compose ps` |
| Deleting old data after a time | Nothing is deleted automatically except delivery records of e-mail (after 91 days) and finished jobs. Drafts, requests, the audit log and old sessions stay. The database grows slowly; watch the disk. |
| Making a generated porada or its PDF again | [Documents and the PDF](#documents-and-the-pdf) |
| A command for a lost headmaster, and for requests about personal data | [The headmaster has left](#the-headmaster-has-left), [Requests about personal data](#requests-about-personal-data) |

The app shows its users no privacy notice (ADR 0075). The school publishes
its GDPR notice itself, for example on its website. Tell the data protection
officer, and make sure the notice does not promise a clean-up the app does
not do.

## If the developer cannot be reached

The school does not depend on the person who wrote the app:

- **Nothing is hidden.** The app uses no service, account or licence key
  that belongs to the developer. The code is under the MIT licence: the
  school may use, copy and change it, and may pay anybody to do so.
- **Keep your own copy of the repository**, with its history: the clone in
  `/opt/autoporada` is a full one, and a second copy belongs with the
  backups. Do not rely on the repository staying on GitHub.
- **Running it needs no developer.** This guide, the installation guide and
  the Microsoft 365 guide cover the server. The cases that need a decision
  rather than a command are named in them.

What does need a developer:

- a change in what the app does or how the document looks;
- security updates of what the app is built from
  ([Who makes the updates](#who-makes-the-updates));
- a problem that this guide does not solve and that is not in the server,
  the network or Microsoft 365.

What to give a new developer:

1. The repository. The [README](../README.md) section "Development" gets the
   app running on their own computer in a few minutes, with stand-ins for
   Microsoft 365, so they need **no access to the school's tenant or
   server** to work on it.
2. [CLAUDE.md](../CLAUDE.md) (the rules of the code), [adr/](adr/README.md)
   (why each decision was made), [features.md](features.md) and
   [glossary.md](glossary.md) (what the app does, in the school's words).
3. The school's Word template of the porada, if the look of the document is
   to change. It is not in the repository.
4. A description of the problem, with the lines from the logs. The logs hold
   no personal data ([Logs](#logs)). **Do not hand over a database dump**
   unless the school's rules for personal data allow it; a developer rarely
   needs one.

The app is a common kind of program (TypeScript, Next.js, PostgreSQL,
Docker) with tests that run on every change, so a developer who knows these
can take it over.

## Troubleshooting

Start with `docker compose ps -a`, then read the log of the service that is
not in its normal state: `docker compose logs --tail 100 <service>`.

| What you see | Likely cause | What to do |
|---|---|---|
| The browser cannot reach the app at all | The server, Docker or `caddy` is down; DNS; a firewall | `docker compose ps -a`; `docker compose up -d`; check DNS and ports 80 and 443 |
| The browser warns about the certificate | Caddy could not renew it | [The HTTPS certificate](#the-https-certificate) |
| The page says 502, or loads without end | `web` is starting or keeps restarting | `docker compose logs --tail 100 web` |
| `web` or `worker` shows `Restarting`, log says `Invalid configuration` | A value in `.env` or a file in `secrets/` is wrong; the message names it | Correct it, `sudo ./install.sh`, `docker compose up -d` |
| Nobody can sign in; Microsoft shows a code `AADSTS…` | The web certificate expired or was removed in Entra; the redirect URI changed | [Certificates](#certificates); the table in [SMOKE-TEST.md](../deploy/SMOKE-TEST.md) |
| Sign-in fails for everybody with a time error | The server's clock is off | Fix time synchronisation (`timedatectl`) |
| One person cannot sign in | A guest account, an account outside the school's tenant, or a blocked one | Nothing on the server. The headmaster looks at „Lidé“. |
| Somebody signs in and sees „Zatím tu nemáte přístup“ | They have no role yet | They send a request; a headmaster decides it in „Lidé“ |
| No e-mail arrives | See [E-mail](#e-mail) | |
| `jobs:status` shows `dead:` above 0 | A message or a job was given up | [E-mail](#e-mail) |
| The PDF is missing in the archive | The conversion failed | [Documents and the PDF](#documents-and-the-pdf) |
| `migrate` shows `Exited (1)` and `web` does not start | A database change failed | `docker compose logs migrate`; the table in [SMOKE-TEST.md](../deploy/SMOKE-TEST.md). After an update: [Going back](#going-back) |
| `worker.start_failed` in the worker's log | The job tables do not match the code, or the database cannot be reached | `docker compose up -d` (it runs `migrate` first); `docker compose logs migrate` |
| `postgres` is not healthy | The disk is full, or the data volume is damaged | `df -h`; `docker compose logs --tail 100 postgres`; if it cannot be repaired: [Restore](#restore) |
| The disk fills up | Old images, old backups | `docker system df`; remove old images ([Updating](#updating)); lower `KEEP_DAYS` in the backup script |
| Somebody deleted or changed something by mistake | | The app has no undo for the database. Decide whether a [Restore](#restore) is worth losing what was written since. |

If none of this helps, collect before you ask anybody: the output of
`docker compose ps -a`, the last 200 lines of the log of each service that
is not in its normal state, the output of `git -C /opt/autoporada rev-parse
--short HEAD`, and what changed on the server or in Microsoft 365 just
before the problem began.

#!/bin/sh
# Boots deploy/compose.yaml on this machine the way the school server runs
# it, with throwaway secrets and an unreal tenant: install.sh, the roles of
# initdb, migrate as the owner, web as autoporada_web, the worker as
# autoporada_worker, Caddy in front (its own CA for localhost). Checks what a browser gets and what each role may
# do, then removes everything. Needs Docker, openssl and ports 80 and 443.
#   docker build -f docker/app/Dockerfile --target web -t autoporada-web:check .
#   docker build -f docker/app/Dockerfile --target worker -t autoporada-worker:check .
#   docker build -f docker/app/Dockerfile --target tools -t autoporada-tools:check .
#   scripts/check-deploy.sh
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
project="autoporada-check-$$"
# Runs as root in the pinned Postgres image, which has sh and openssl.
pg_image=$(grep -o 'postgres:[^ ]*@sha256:[0-9a-f]*' "$root/deploy/compose.yaml")
as_root() { docker run --rm -v "$work:/work" -w /work/deploy --entrypoint sh "$pg_image" -c "$1"; }
compose() { docker compose -p "$project" --project-directory "$work/deploy" -f "$work/deploy/compose.yaml" "$@"; }

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  # install.sh gave the secrets and state to other users.
  as_root 'rm -rf /work/deploy' >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

fail() {
  echo "check-deploy: $1" >&2
  compose logs --no-color >&2 2>&1 || true
  exit 1
}

cp -R "$root/deploy" "$work/deploy"
mkdir "$work/deploy/secrets"
openssl req -x509 -newkey rsa:3072 -sha256 -days 1 -nodes -subj '/CN=autoporada-check' \
  -keyout "$work/deploy/secrets/entra_key" -out "$work/deploy/secrets/entra_cert" 2>/dev/null
thumbprint=$(openssl x509 -in "$work/deploy/secrets/entra_cert" -noout -fingerprint -sha1 |
  sed 's/.*=//; s/://g')
tenant=00000000-0000-4000-8000-000000000001

as_root './install.sh' || fail 'install.sh failed'
# It made .env from the example; compose runs as an ordinary user here.
[ -r "$work/deploy/.env" ] || fail '.env is not readable without root'
cat >"$work/env" <<ENV
APP_VERSION=check
APP_HOST=localhost
ACME_EMAIL=it@example.org
TENANT_ID=$tenant
CLIENT_ID=autoporada-check
CERT_THUMBPRINT=$thumbprint
ENV
as_root 'cp /work/env .env' || fail 'could not fill in .env'
as_root './install.sh' >/dev/null || fail 'install.sh is not idempotent'
compose up -d --no-build >/dev/null 2>&1 || fail 'compose up failed'

i=0
until curl -fsk -o /dev/null https://localhost/prihlaseni 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -lt 90 ] || fail 'https://localhost/prihlaseni never answered'
  sleep 2
done

headers=$(curl -sk -D - -o /dev/null https://localhost/prihlaseni | tr -d '\r' | tr '[:upper:]' '[:lower:]')
expect() { printf '%s\n' "$headers" | grep -q "$1" || fail "https://localhost/prihlaseni: missing $1"; }
expect '^http/2 200'
expect '^strict-transport-security: max-age=86400$'
expect "^content-security-policy: default-src 'self'; script-src 'self' 'nonce-"
expect '^x-content-type-options: nosniff$'
if printf '%s\n' "$headers" | grep -Eq '^(server|x-powered-by):'; then fail 'server or x-powered-by is sent'; fi
plain=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost/prihlaseni)
[ "$plain" = '308 https://localhost/prihlaseni' ] || fail "http is not redirected to https: $plain"

# A well-formed unknown session: web looks it up as autoporada_web and
# sends the browser to sign in. A missing privilege would be a 500.
token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
home=$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' -H "Cookie: __Host-ap_session=$token" https://localhost/)
case "$home" in
  30[37]' https://localhost/prihlaseni?returnTo=%2F') ;;
  *) fail "an unknown session got: $home" ;;
esac

sql() { compose exec -T postgres psql -X -U pgadmin -d autoporada -tAc "$1"; }
privileges=$(sql "SELECT concat_ws(' ',
  (SELECT tableowner FROM pg_tables WHERE tablename = 'sessions'),
  has_table_privilege('autoporada_web', 'sessions', 'DELETE'),
  has_table_privilege('autoporada_web', 'audit_events', 'UPDATE'),
  has_database_privilege('autoporada_web', 'autoporada', 'TEMP'),
  has_database_privilege('autoporada_web', 'autoporada', 'CREATE'),
  has_schema_privilege('autoporada_web', 'public', 'CREATE'),
  (SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'autoporada_owner'))") ||
  fail 'could not read the privileges'
[ "$privileges" = 'autoporada_owner t f f f f f' ] || fail "unexpected privileges: $privileges"

# pg-boss (ADR 0015): web inserts jobs and reads back their ids, nothing else.
jobs=$(sql "SELECT concat_ws(' ',
  has_table_privilege('autoporada_web', 'pgboss.job_common', 'INSERT'),
  has_column_privilege('autoporada_web', 'pgboss.job_common', 'id', 'SELECT'),
  has_column_privilege('autoporada_web', 'pgboss.job_common', 'data', 'SELECT'),
  has_table_privilege('autoporada_web', 'pgboss.job_common', 'UPDATE'),
  has_table_privilege('autoporada_web', 'pgboss.job_common', 'DELETE'),
  has_table_privilege('autoporada_web', 'pgboss.schedule', 'INSERT'),
  has_schema_privilege('autoporada_web', 'pgboss', 'CREATE'),
  has_function_privilege('autoporada_web', 'pgboss.create_queue(text, jsonb)', 'EXECUTE'))") ||
  fail 'could not read the pgboss privileges'
[ "$jobs" = 't t f f f f f f' ] || fail "unexpected pgboss privileges: $jobs"

# The mail ledger and gate (ADR 0016): only the worker group writes delivery
# state; web can neither read nor write them. The gate has its one row.
mail=$(sql "SELECT concat_ws(' ',
  has_table_privilege('autoporada_web', 'mail_ledger', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'),
  has_table_privilege('autoporada_web', 'mail_gate', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'),
  (SELECT bool_and(has_table_privilege('autoporada_jobs', t, p))
     FROM unnest(ARRAY['mail_ledger', 'mail_gate']) t, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p),
  (SELECT count(*) FROM mail_gate))") ||
  fail 'could not read the mail table privileges'
[ "$mail" = 'f f t 1' ] || fail "unexpected mail table privileges: $mail"

# Caddy logs the request, but not what Entra puts in the callback URL.
curl -sk -o /dev/null 'https://localhost/auth/callback?code=leaked-code&state=leaked-state'
sleep 1
access=$(compose logs --no-color caddy 2>&1)
printf '%s\n' "$access" | grep -q '/auth/callback' || fail 'caddy did not log the callback'
if printf '%s\n' "$access" | grep -q 'leaked-'; then fail 'caddy logged code or state'; fi

# Nor the users-list search (names, e-mails), in the URL or in a Referer.
curl -sk -o /dev/null -H 'Referer: https://localhost/uzivatele?hledat=leaked-referer' \
  'https://localhost/uzivatele?hledat=leaked-search&skupina=vsichni'
sleep 1
access=$(compose logs --no-color caddy 2>&1)
printf '%s\n' "$access" | grep -q '/uzivatele' || fail 'caddy did not log the users list'
if printf '%s\n' "$access" | grep -q 'leaked-'; then fail 'caddy logged the search text'; fi

# pg-boss runs inside the standalone server: the job producer connected as autoporada_web.
compose logs --no-color web 2>&1 | grep -q 'jobs.producer_ready' || fail 'the web job producer never became ready'
if compose logs --no-color web 2>&1 | grep -q '"level":"\(error\|fatal\)"'; then fail 'web logged an error'; fi

# The worker (ADR 0015) on distroless: healthy, never restarted, and no Graph call at boot, so the
# unreal tenant does not crash-loop it.
worker=$(compose ps -q worker)
[ -n "$worker" ] || fail 'the worker container is missing'
i=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$worker")" = healthy ]; do
  i=$((i + 1))
  [ "$i" -lt 45 ] || fail "the worker is not healthy after 90 s (state: $(docker inspect -f '{{.State.Health.Status}}' "$worker"))"
  sleep 2
done
[ "$(docker inspect -f '{{.RestartCount}}' "$worker")" = 0 ] || fail 'the worker restarted while booting'

worker_logs=$(compose logs --no-color worker 2>&1)
printf '%s\n' "$worker_logs" | grep -q '"msg":"worker.ready"' || fail 'the worker never logged worker.ready'
if printf '%s\n' "$worker_logs" | grep -q '"level":"\(error\|fatal\)"'; then fail 'the worker logged an error'; fi
if printf '%s\n' "$worker_logs" | grep -q '@'; then fail 'the worker logged an @ (an address?)'; fi

# The schema is the one this image's pg-boss expects (it logs its number), the queues exist, and the
# cron entry is registered in Prague time.
expected=$(printf '%s\n' "$worker_logs" | grep -o '"pgbossSchema":[0-9]*' | head -1 | cut -d: -f2)
[ -n "$expected" ] || fail 'worker.ready did not say which pg-boss schema it expects'
installed=$(sql 'SELECT version FROM pgboss.version') || fail 'could not read pgboss.version'
[ "$installed" = "$expected" ] || fail "pgboss.version is $installed, the worker expects $expected"
queues=$(sql "SELECT string_agg(name, ',' ORDER BY name) FROM pgboss.queue WHERE name <> '__pgboss__send-it'") ||
  fail 'could not read the queues'
[ "$queues" = 'dead,mail.prune,mail.send' ] || fail "unexpected queues: $queues"
schedule=$(sql "SELECT string_agg(name || ' ' || timezone, ',' ORDER BY name) FROM pgboss.schedule") ||
  fail 'could not read the schedule'
[ "$schedule" = 'mail.prune Europe/Prague' ] || fail "unexpected schedule: $schedule"

# The worker's own rights: the queue tables and the mail tables, no schema, no role, no business writes.
# Nothing on pgboss.bam (the owner's migrate runs its rows as SQL), nor on a queue's table or the
# schema version.
worker_rights=$(sql "SELECT concat_ws(' ',
  has_table_privilege('autoporada_worker', 'pgboss.job_common', 'UPDATE'),
  has_table_privilege('autoporada_worker', 'pgboss.job_common', 'DELETE'),
  has_table_privilege('autoporada_worker', 'pgboss.bam', 'INSERT'),
  has_table_privilege('autoporada_worker', 'pgboss.bam', 'UPDATE'),
  has_table_privilege('autoporada_worker', 'pgboss.bam', 'DELETE'),
  has_column_privilege('autoporada_worker', 'pgboss.version', 'version', 'UPDATE'),
  has_column_privilege('autoporada_worker', 'pgboss.queue', 'table_name', 'UPDATE'),
  (SELECT count(*) FROM pg_default_acl WHERE defaclnamespace = 'pgboss'::regnamespace),
  has_schema_privilege('autoporada_worker', 'pgboss', 'CREATE'),
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'pgboss' AND tableowner = 'autoporada_worker'),
  has_table_privilege('autoporada_worker', 'users', 'INSERT, UPDATE, DELETE'),
  has_table_privilege('autoporada_worker', 'sessions', 'INSERT, UPDATE, DELETE'),
  has_table_privilege('autoporada_worker', 'audit_events', 'INSERT, UPDATE, DELETE'),
  (SELECT rolsuper FROM pg_roles WHERE rolname = 'autoporada_worker'),
  (SELECT rolcreaterole FROM pg_roles WHERE rolname = 'autoporada_worker'))") ||
  fail 'could not read the worker privileges'
[ "$worker_rights" = 't t f f f f f 0 f 0 f f f f f' ] || fail "unexpected worker privileges: $worker_rights"

# The probe of SMOKE-TEST step 3 starts and asks Entra (which does not know
# this tenant): its configuration is complete without the web-only secrets.
probe=$(compose run --rm --no-deps cli auth:probe 2>&1) || true
for line in "issuer: https://login.microsoftonline.com/$tenant/v2.0" 'credential: certificate CN=autoporada-check'; do
  printf '%s\n' "$probe" | grep -qF "$line" || fail "auth:probe did not report: $line ($probe)"
done

# While web is down, Caddy answers 502 and logs the error with the request:
# filtered too.
compose stop web >/dev/null 2>&1
down=$(curl -sk -o /dev/null -w '%{http_code}' 'https://localhost/auth/callback?code=leaked-down&state=leaked-down')
[ "$down" = 502 ] || fail "with web stopped, the callback got $down"
sleep 1
access=$(compose logs --no-color caddy 2>&1)
printf '%s\n' "$access" | grep -q 'http.log.error' || fail 'caddy did not log the 502'
if printf '%s\n' "$access" | grep -q 'leaked-'; then fail 'caddy logged code or state of a failed request'; fi
# jobs:status runs as the owner through the tools image and finds no dead job (ADR 0015).
status=$(compose run --rm --no-deps cli jobs:status 2>&1) || fail "jobs:status failed: $status"
printf '%s\n' "$status" | grep -qx 'dead: 0' || fail "jobs:status did not print dead: 0 ($status)"

# A job through the production stack (ADR 0016): the operator's test mail reaches the worker, which
# cannot deliver it to an unreal tenant. The ledger says "deferred" with an auth or network code,
# the job waits for a retry, the worker warns and neither fails nor restarts.
reviewer=$(sql "WITH added AS (
  INSERT INTO users (tid, oid, display_name, email, role, status)
  VALUES ('$tenant', gen_random_uuid(), 'Check Reviewer', 'check@example.org', 'reviewer', 'active')
  RETURNING id) SELECT id FROM added") || fail 'could not insert the reviewer for mail:test'
sent=$(compose run --rm --no-deps cli mail:test --user "$reviewer" 2>&1) || fail "mail:test failed: $sent"
key=$(printf '%s\n' "$sent" | sed -n 's/^Test mail queued: //p')
[ -n "$key" ] || fail "mail:test did not print the key ($sent)"
i=0
until [ "$(sql "SELECT state FROM mail_ledger WHERE dedupe_key = '$key'")" = deferred ]; do
  i=$((i + 1))
  [ "$i" -lt 30 ] || fail "the ledger row of $key never became deferred ($(sql "SELECT concat_ws(' ', state, code) FROM mail_ledger WHERE dedupe_key = '$key'"))"
  sleep 2
done
code=$(sql "SELECT code FROM mail_ledger WHERE dedupe_key = '$key'")
printf '%s\n' "$code" | grep -Eq '^(auth|net)\.' || fail "the deferred mail has an unexpected code: $code"
job=$(sql "SELECT state FROM pgboss.job WHERE name = 'mail.send' AND singleton_key = '$key'")
case "$job" in
  retry | active) ;;
  *) fail "the test mail job is $job, not retry or active" ;;
esac
audited=$(sql "SELECT count(*) FROM audit_events WHERE action = 'cli.mail-test' AND data -> 'meta' ->> 'dedupeKey' = '$key'")
[ "$audited" = 1 ] || fail "mail:test left $audited audit rows, not 1"
worker_logs=$(compose logs --no-color worker 2>&1)
printf '%s\n' "$worker_logs" | grep -Eq '"level":"warn".*"msg":"mail\.(systemic|deferred)"' ||
  fail 'the worker did not warn mail.systemic or mail.deferred'
if printf '%s\n' "$worker_logs" | grep -q '"level":"\(error\|fatal\)"'; then fail 'the worker logged an error for the test mail'; fi
[ "$(docker inspect -f '{{.State.Running}}' "$worker")" = true ] || fail 'the worker stopped after the test mail'

# The worker was never restarted, and a stop finishes inside its grace period with exit code 0 (a
# SIGKILL after the 50 s would show as 137).
[ "$(docker inspect -f '{{.RestartCount}}' "$worker")" = 0 ] || fail 'the worker restarted during the checks'
started=$(date +%s)
compose stop worker >/dev/null 2>&1
elapsed=$(($(date +%s) - started))
[ "$(docker inspect -f '{{.State.ExitCode}}' "$worker")" = 0 ] ||
  fail "the worker stopped with exit code $(docker inspect -f '{{.State.ExitCode}}' "$worker")"
[ "$elapsed" -le 50 ] || fail "the worker took ${elapsed} s to stop"
echo 'check-deploy: the production stack boots and answers as designed'

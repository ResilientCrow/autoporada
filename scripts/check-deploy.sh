#!/bin/sh
# Boots deploy/compose.yaml on this machine the way the school server runs
# it, with throwaway secrets and an unreal tenant: install.sh, the roles of
# initdb, migrate as the owner, web as autoporada_web, Caddy in front (its
# own CA for localhost). Checks what a browser gets and what each role may
# do, then removes everything. Needs Docker, openssl and ports 80 and 443.
#   docker build -f docker/app/Dockerfile --target web -t autoporada-web:check .
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
cat >"$work/deploy/.env" <<ENV
APP_VERSION=check
APP_HOST=localhost
ACME_EMAIL=it@example.org
TENANT_ID=00000000-0000-4000-8000-000000000001
CLIENT_ID=autoporada-check
CERT_THUMBPRINT=$thumbprint
ENV

as_root './install.sh' || fail 'install.sh failed'
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

# Caddy logs the request, but not what Entra puts in the callback URL.
curl -sk -o /dev/null 'https://localhost/auth/callback?code=leaked-code&state=leaked-state'
sleep 1
access=$(compose logs --no-color caddy 2>&1)
printf '%s\n' "$access" | grep -q '/auth/callback' || fail 'caddy did not log the callback'
if printf '%s\n' "$access" | grep -q 'leaked-'; then fail 'caddy logged code or state'; fi

if compose logs --no-color web 2>&1 | grep -q '"level":"\(error\|fatal\)"'; then fail 'web logged an error'; fi
echo 'check-deploy: the production stack boots and answers as designed'

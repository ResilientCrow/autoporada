#!/bin/sh
# Runs once, on the first start of an empty data volume, as pgadmin
# (ADR 0010). Creates the schema owner, the application database and the
# login roles of the web and worker processes. psql reads the passwords from the secret
# files itself, so the shell never puts one into SQL or onto a command line.
set -eu

psql --no-psqlrc --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\set owner_password `cat /run/secrets/pg_owner_password`
\set web_password `cat /run/secrets/pg_web_password`
\set worker_password `cat /run/secrets/pg_worker_password`

CREATE ROLE autoporada_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  PASSWORD :'owner_password';
-- The owner of the database owns its public schema too (pg_database_owner).
CREATE DATABASE autoporada OWNER autoporada_owner;

-- The group roles of drizzle/0000_roles and 0008_job_roles, made here
-- because the owner cannot create roles.
CREATE ROLE autoporada_app NOLOGIN;
CREATE ROLE autoporada_backup NOLOGIN;
CREATE ROLE autoporada_jobs NOLOGIN;
CREATE ROLE autoporada_web LOGIN PASSWORD :'web_password' IN ROLE autoporada_app;
-- The worker belongs to the jobs group only: no grant of the app role (ADR 0015).
CREATE ROLE autoporada_worker LOGIN PASSWORD :'worker_password' IN ROLE autoporada_jobs;

REVOKE ALL ON DATABASE autoporada FROM PUBLIC;
GRANT CONNECT ON DATABASE autoporada TO autoporada_app, autoporada_backup, autoporada_jobs;
SQL

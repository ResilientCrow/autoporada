-- Brings a data volume made before the worker existed (M7) to what initdb/10-roles.sh gives an
-- empty one: the jobs group, the worker's login role and the right to connect. The owner cannot
-- create roles, so migrate fails on such a volume until this has run. Safe to run again: a
-- missing role is created, an existing one only gets the current password and membership.
-- Run it as pgadmin, with postgres up and before `docker compose up -d` (deploy/install.sh
-- prints the command). The password is read from the secret file by psql itself, so it never
-- reaches a shell command line.
\set ON_ERROR_STOP on
\set worker_password `cat /run/secrets/pg_worker_password`

SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'autoporada_jobs') AS no_group \gset
\if :no_group
  CREATE ROLE autoporada_jobs NOLOGIN;
\endif

SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'autoporada_worker') AS no_worker \gset
\if :no_worker
  CREATE ROLE autoporada_worker LOGIN PASSWORD :'worker_password';
\else
  ALTER ROLE autoporada_worker LOGIN PASSWORD :'worker_password';
\endif

-- The worker belongs to the jobs group only (ADR 0015).
GRANT autoporada_jobs TO autoporada_worker;
GRANT CONNECT ON DATABASE autoporada TO autoporada_jobs;

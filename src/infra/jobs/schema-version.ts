import pgBoss from 'pg-boss/package.json' with { type: 'json' };

/** The pg-boss schema number this build expects; `migrate` installs it and a worker refuses any other. */
export const PGBOSS_SCHEMA_VERSION: number = pgBoss.pgboss.schema;

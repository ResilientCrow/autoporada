// Checks deploy/compose.yaml against the container rules of ADR 0008, on
// the configuration Compose itself resolves (anchors merged, variables
// filled with placeholders). Every service runs read-only, without
// capabilities (Caddy keeps the one its binary needs) or new privileges, as
// a non-root user, and nothing shares a host namespace or the Docker socket. Only Caddy publishes ports, Postgres
// sits on internal networks only, one-shot services never restart, and
// every image is either built here or pinned by digest. The worker (ADR 0015)
// is long-running with a healthcheck and a stop grace period that fits its stop
// timeout, shares no network with Caddy, runs as one replica, and each secret
// reaches only the services named for it: a declared secret's file is the file of its own
// name in deploy/secrets, a secret nobody listed reaches nobody, and no other way carries
// the secrets or the cluster files into a container (a bind mount of deploy/secrets, of
// anything inside it or of anything above it, a symlinked bind source, env_file, configs,
// volumes_from, a volume other than pgdata, pgdata outside postgres). The egress network
// keeps a fixed bridge name so a host firewall rule can target it (docs/ENTRA-SETUP.md §4).
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const PLACEHOLDERS = {
  APP_VERSION: 'check',
  APP_HOST: 'autoporada.example',
  ACME_EMAIL: 'it@example.org',
  TENANT_ID: '00000000-0000-4000-8000-000000000001',
  CLIENT_ID: 'check',
  CERT_THUMBPRINT: '0'.repeat(40),
};
const ONE_SHOT = new Set(['migrate', 'cli']);
/** The stock Caddy binary carries cap_net_bind_service; nothing else may add one. */
const ALLOWED_CAPABILITIES = { caddy: ['NET_BIND_SERVICE'] };
/** Who may hold which secret. Every secret compose.yaml declares must be listed: deny by default. */
const SECRET_HOLDERS = {
  pg_superuser_password: ['postgres'],
  pg_owner_password: ['postgres'],
  pg_web_password: ['postgres'],
  pg_worker_password: ['postgres'],
  owner_database_url: ['migrate', 'cli'],
  worker_database_url: ['worker'],
  web_database_url: ['web'],
  server_actions_key: ['web'],
  entra_key: ['web', 'worker', 'cli'],
  entra_cert: ['web', 'worker', 'cli'],
};
const WORKER_SECRETS = ['worker_database_url', 'entra_key', 'entra_cert'];
/** The host-side handle of the egress network, for a DOCKER-USER or nftables rule. */
const EGRESS_BRIDGE = 'ap-egress';
/** Docker must wait this much longer than the worker's stop timeout before it kills it. */
const GRACE_MARGIN_SECONDS = 10;
/** The one stop timeout (src/infra/worker/limits.ts), read from the source: this script cannot import TS. */
const STOP_TIMEOUT_SECONDS = (() => {
  const source = readFileSync('src/infra/worker/limits.ts', 'utf8');
  const match = /export const STOP_TIMEOUT_MS = ([\d_]+);/.exec(source);
  if (!match)
    throw new Error('check-compose: STOP_TIMEOUT_MS not found in src/infra/worker/limits.ts');
  return Number(match[1].replaceAll('_', '')) / 1000;
})();
const MIN_GRACE_SECONDS = STOP_TIMEOUT_SECONDS + GRACE_MARGIN_SECONDS;
const SECRETS_DIR = resolve('deploy/secrets');
/** The one named volume (the cluster files) and the only service that may mount it. */
const DATA_VOLUME = 'pgdata';
const DATA_VOLUME_HOLDER = 'postgres';
const ARGS = ['compose', '-f', 'deploy/compose.yaml', '--env-file', '/dev/null'];

// --no-env-resolution keeps env_file entries in the output instead of inlining their contents.
const config = JSON.parse(
  execFileSync(
    'docker',
    [...ARGS, '--profile', 'tools', 'config', '--no-env-resolution', '--format', 'json'],
    { env: { ...process.env, ...PLACEHOLDERS }, encoding: 'utf8' },
  ),
);

const problems = [];
for (const [name, service] of Object.entries(config.services)) {
  const problem = (message) => problems.push(`${name}: ${message}`);
  if (service.read_only !== true) problem('needs read_only: true');
  if (!service.cap_drop?.includes('ALL')) problem('needs cap_drop: [ALL]');
  const added = (service.cap_add ?? []).filter((c) => !ALLOWED_CAPABILITIES[name]?.includes(c));
  if (added.length > 0) problem(`adds capabilities: ${added.join(', ')}`);
  if (!service.security_opt?.includes('no-new-privileges:true')) {
    problem('needs security_opt: no-new-privileges:true');
  }
  if (!service.user || /^(0|root)(:|$)/.test(service.user)) problem('must run as a non-root user');
  if (service.privileged) problem('must not be privileged');
  for (const key of ['network_mode', 'pid', 'ipc', 'userns_mode']) {
    if (service[key] === 'host') problem(`must not use ${key}: host`);
  }
  if (service.volumes?.some((v) => v.source === '/var/run/docker.sock')) {
    problem('must not mount the Docker socket');
  }
  if (service.ports?.length && name !== 'caddy') problem('only caddy publishes ports');
  const restart = ONE_SHOT.has(name) ? 'no' : 'unless-stopped';
  if (service.restart !== restart) problem(`needs restart: ${restart}`);
  if (!service.build && !/@sha256:[0-9a-f]{64}$/.test(service.image ?? '')) {
    problem('image must be pinned by digest');
  }
}

/** Compose prints durations as "50s", "1m30s" or nanoseconds. */
function seconds(duration) {
  if (typeof duration === 'number') return duration / 1e9;
  const units = { h: 3600, m: 60, s: 1, ms: 0.001 };
  return [...String(duration).matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)].reduce(
    (sum, [, n, unit]) => sum + Number(n) * units[unit],
    0,
  );
}
const networksOf = (service) => Object.keys(service?.networks ?? {});
const secretsOf = (service) => (service.secrets ?? []).map((secret) => secret.source ?? secret);
/** compose's own `disable: true` and the `['NONE']` test both turn a healthcheck off. */
const hasHealthcheck = (service) => {
  const check = service.healthcheck;
  return Boolean(check?.test) && check.disable !== true && check.test[0] !== 'NONE';
};
/** The path with its symlinks resolved; the path as written when it does not exist (deploy/secrets is made by install.sh). */
function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
const isSymlink = (path) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};
const isWithin = (parent, child) => {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
};
/** deploy/secrets, anything inside it and anything above it (deploy/, the checkout, /) show the secrets. */
const exposesSecrets = (source) =>
  [resolve(source), real(source)].some((path) =>
    [SECRETS_DIR, real(SECRETS_DIR)].some((dir) => isWithin(dir, path) || isWithin(path, dir)),
  );

for (const [secret, declared] of Object.entries(config.secrets ?? {})) {
  if (!SECRET_HOLDERS[secret]) {
    problems.push(`secret ${secret}: has no entry in SECRET_HOLDERS (list who may hold it)`);
  }
  if (declared.file !== resolve(SECRETS_DIR, secret)) {
    problems.push(
      `secret ${secret}: its file must be deploy/secrets/${secret} (is ${declared.file})`,
    );
  }
}
for (const [volume, declared] of Object.entries(config.volumes ?? {})) {
  if (volume !== DATA_VOLUME || Object.keys(declared).some((key) => key !== 'name')) {
    problems.push(
      `volume ${volume}: only a plain ${DATA_VOLUME} volume may be declared (no driver, no bind options)`,
    );
  }
}

for (const [name, service] of Object.entries(config.services)) {
  const problem = (message) => problems.push(`${name}: ${message}`);
  if (!ONE_SHOT.has(name) && name !== 'caddy' && !hasHealthcheck(service)) {
    problem('long-running services other than caddy need a healthcheck');
  }
  if ((service.deploy?.replicas ?? 1) > 1 || (service.scale ?? 1) > 1) {
    problem('runs one replica only: the job queue and the mail gate assume a single worker');
  }
  for (const secret of secretsOf(service)) {
    if (!SECRET_HOLDERS[secret]?.includes(name)) problem(`must not hold the secret ${secret}`);
  }
  for (const volume of service.volumes ?? []) {
    if (volume.type === 'bind') {
      if (exposesSecrets(volume.source)) {
        problem(`must not bind-mount ${volume.source} (it is, holds or is held by deploy/secrets)`);
      } else if (isSymlink(volume.source)) {
        problem(`must not bind-mount ${volume.source}: it is a symlink (mount the real path)`);
      }
    }
    if (volume.source === DATA_VOLUME && name !== DATA_VOLUME_HOLDER) {
      problem(`must not mount ${DATA_VOLUME} (only ${DATA_VOLUME_HOLDER} does)`);
    }
  }
  if (service.env_file) problem('must not use env_file (configuration is .env, secrets are files)');
  if (service.configs) problem('must not use configs');
  if (service.volumes_from)
    problem('must not use volumes_from (it inherits another service mounts)');
}

const worker = config.services.worker;
if (!worker) {
  problems.push('worker: the service is missing');
} else {
  const problem = (message) => problems.push(`worker: ${message}`);
  if (seconds(worker.stop_grace_period) < MIN_GRACE_SECONDS) {
    problem(
      `stop_grace_period must be at least ${MIN_GRACE_SECONDS}s (STOP_TIMEOUT_MS is ${STOP_TIMEOUT_SECONDS} s)`,
    );
  }
  const networks = networksOf(worker);
  if (!networks.includes('data')) problem('must be on the data network');
  const shared = networks.filter((n) => networksOf(config.services.caddy).includes(n));
  if (shared.length > 0) problem(`shares a network with caddy: ${shared.join(', ')}`);
  const held = secretsOf(worker).sort();
  if (held.join() !== [...WORKER_SECRETS].sort().join()) {
    problem(`must hold exactly ${WORKER_SECRETS.join(', ')} (holds ${held.join(', ')})`);
  }
}

const bridge = config.networks?.egress?.driver_opts?.['com.docker.network.bridge.name'];
if (bridge !== EGRESS_BRIDGE) {
  problems.push(
    `network egress: needs the bridge name ${EGRESS_BRIDGE} (driver_opts), has ${bridge}`,
  );
}

const postgres = Object.keys(config.services.postgres?.networks ?? {});
if (postgres.length === 0 || postgres.some((n) => config.networks[n]?.internal !== true)) {
  problems.push('postgres: must be on internal networks only');
}

if (problems.length > 0) {
  console.error(`check-compose: deploy/compose.yaml breaks ADR 0008:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-compose: ${Object.keys(config.services).length} services follow ADR 0008`);

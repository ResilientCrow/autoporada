// Checks deploy/compose.yaml against the container rules of ADR 0008, on
// the configuration Compose itself resolves (anchors merged, variables
// filled with placeholders). Every service runs read-only, without
// capabilities (Caddy keeps the one its binary needs) or new privileges, as
// a non-root user, and nothing shares a host namespace or the Docker socket. Only Caddy publishes ports, Postgres
// sits on internal networks only, one-shot services never restart, and
// every image is either built here or pinned by digest.
import { execFileSync } from 'node:child_process';

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
const ARGS = ['compose', '-f', 'deploy/compose.yaml', '--env-file', '/dev/null'];

const config = JSON.parse(
  execFileSync('docker', [...ARGS, '--profile', 'tools', 'config', '--format', 'json'], {
    env: { ...process.env, ...PLACEHOLDERS },
    encoding: 'utf8',
  }),
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
const postgres = Object.keys(config.services.postgres?.networks ?? {});
if (postgres.length === 0 || postgres.some((n) => config.networks[n]?.internal !== true)) {
  problems.push('postgres: must be on internal networks only');
}

if (problems.length > 0) {
  console.error(`check-compose: deploy/compose.yaml breaks ADR 0008:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-compose: ${Object.keys(config.services).length} services follow ADR 0008`);

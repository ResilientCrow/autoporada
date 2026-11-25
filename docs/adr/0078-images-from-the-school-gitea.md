# 0078 — Images from the school's Gitea

Adds to ADR 0008 (Docker Compose on school infrastructure).

## Context

The school server built its four images itself (`docker compose build`): it
needed a way out to npm, GitHub and several image registries while installing
and updating, and every update compiled the app for minutes. The repository
now also lives on the school's Gitea, which has Actions and a container
registry. Releases are tags (`v0.9.0`), and the server installs a tag, not
`main`.

## Decision

1. **Gitea builds and publishes the images for each release.**
   `.gitea/workflows/images.yml` runs on a pushed `v*` tag, builds `web`,
   `worker`, `tools` and `gotenberg` for `linux/amd64` and pushes them as
   `<gitea host>/<owner>/autoporada-<name>:<tag>`. It logs in with a personal
   access token kept only as the repository secret `REGISTRY_TOKEN` (the
   built-in Actions token is not known to be allowed to push packages).
2. **The server pulls them when told to.** `deploy/compose.yaml` names each image
   `${IMAGE_PREFIX:-}autoporada-<name>:${APP_VERSION}` and keeps its `build`
   section. With `IMAGE_PREFIX=<gitea host>/<owner>/` in `deploy/.env`,
   `docker compose pull` fetches the release; without it,
   `docker compose build` builds on the server as before.
3. **Gitea runs the checks a standard runner allows** (`.gitea/workflows/ci.yml`):
   jobs run in containers on the host's Docker, so services are reached by name
   and nothing is bind-mounted from a job. The browser tests, the PDF render
   check and the production-stack boot need `localhost` and run on GitHub only.
   The Mailpit test takes its host from `MAILPIT_HOST`.
4. **The Gitea's address is not in the repository.** The workflows read the host
   and owner from the run; guides and examples write `<gitea host>/<owner>`.

## Consequences

- An update downloads four images instead of compiling; the server needs a way
  out to the Gitea and Docker Hub only, plus `deb.debian.org` when the school
  adds its own fonts (DEPLOYMENT.md, "Before you start").
- A release is usable only after the Images run has passed for its tag.
- The school's own fonts are built into the Gotenberg image on the server, so
  `docker compose build gotenberg` follows every pull (DEPLOYMENT.md, "The
  school's own fonts in the PDF").
- `.gitea/workflows/ci.yml` follows `.github/workflows/ci.yml` by hand; a check
  added to one belongs in the other where the runner allows it.
- The runner needs the label `ubuntu-latest`, the Docker socket and a way out to
  GitHub, npm and Docker Hub (docs/GITEA.md).

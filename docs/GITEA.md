# Autoporada on the school's Gitea

This is for whoever runs the school's Gitea or keeps the repository there. The
repository lives on GitHub and on the Gitea; both run checks, and the Gitea also
publishes the images the school server runs (ADR 0078).

The Gitea's address is written here as `<gitea host>` and the repository's
owner (a user or an organisation) as `<owner>`. The real address never goes into
the repository: the workflows read it from the run, and the school server keeps
it in its own `deploy/.env`.

## What runs

- **Checks** (`.gitea/workflows/ci.yml`), on every push to `main` and every pull
  request: type check, lint, the layer rules, unused code, characters,
  formatting, the unit tests and the build; the database and e-mail tests; the
  deployment files; the secret scan and the dependency audit. The browser tests,
  the PDF render check and the boot of the production stack need their services
  on `localhost`, which a Gitea runner does not give a job, so only GitHub runs
  them.
- **Images** (`.gitea/workflows/images.yml`), on every pushed tag that starts
  with `v` (a release, for example `v0.9.0`): it builds the four images for
  64-bit x86 and publishes them to the Gitea's container registry as
  `<gitea host>/<owner>/autoporada-web:v0.9.0`, and the same for
  `autoporada-worker`, `autoporada-tools` and `autoporada-gotenberg`.

## What the Gitea needs, once

1. **Actions switched on**, for the site and in the repository's settings.
2. **A runner** (`act_runner`, a recent version: the actions used here run on
   Node 24) on a **64-bit x86** machine, serving this repository, with:
   - the label `ubuntu-latest` mapped to a full Ubuntu image, for example
     `ubuntu-latest:docker://docker.gitea.com/runner-images:ubuntu-latest`
     (older defaults map it to `node:16-bullseye`, which cannot run these
     jobs). The image must have bash, git, tar, openssl and the Docker CLI with
     its compose and buildx plugins;
   - the Docker socket available to jobs, which is `act_runner`'s default
     (`container.docker_host` left empty in its `config.yaml`), and
     `container.network` left empty, so the jobs reach their services by name;
   - a way out to `github.com` and GitHub's download hosts
     (`*.githubusercontent.com`; the actions and Node), `nodejs.org`,
     `registry.npmjs.org`, Docker Hub (`registry-1.docker.io`,
     `auth.docker.io`, `production.cloudflare.docker.com`), `gcr.io`, and
     `deb.debian.org` over plain HTTP (port 80; the PDF image's font package).

   The repository's settings list the runners it can use under Actions →
   Runners. A run that keeps waiting for a runner means none has the label
   `ubuntu-latest`.
3. **The secret `REGISTRY_TOKEN`.** An access token (User settings →
   Applications) with the permission **package: Read and Write**, saved in the
   repository under Settings → Actions → Secrets with the name
   `REGISTRY_TOKEN`. When the owner is a user, that user creates it; when it is
   an organisation, a member whose team may write packages creates it, and the
   variable `REGISTRY_USER` (Settings → Actions → Variables) holds that
   member's name. The token lives only there: never in a file, a commit or an
   issue. A token that expires stops the next publish with a login error; make
   a new one and replace the secret.
4. **Who may download the images.** The packages of a public user or
   organisation are public, and the school server pulls them without logging
   in. If they are private, log in once on the server, as the user who runs
   `docker compose`, with a token that has **package: Read**:
   `docker login <gitea host>`.

**The runner can act as root on its machine.** Every job may use the host's
Docker, and the checks run the code of every pull request. Let this runner
serve only this repository (or only repositories you trust), require approval
before a pull request from a fork runs, and treat the runner machine as a
holder of `REGISTRY_TOKEN`: the publish job logs in with it there.

## Publishing a release

1. Push `main` to the Gitea, and the release tag:

   ```sh
   git push <gitea remote> main
   git push <gitea remote> v0.9.0
   ```

   A tag made on GitHub's website reaches your computer with
   `git fetch origin --tags`.
2. The tag starts **Images**. When it has passed, the owner's Packages page lists
   the four images with the tag `v0.9.0`.
3. On the school server, `deploy/.env` holds `APP_VERSION=v0.9.0` and
   `IMAGE_PREFIX=<gitea host>/<owner>/`; then `docker compose pull` and
   `docker compose up -d` ([DEPLOYMENT.md](DEPLOYMENT.md) step 8,
   [OPERATIONS.md](OPERATIONS.md), "Updating").

A published tag is never published again with other content: a fix is a new
release (`v0.9.1`).

# syntax=docker/dockerfile:1
# The web, worker and tools images (ADR 0008, 0015), built from the repository root:
#   docker build -f docker/app/Dockerfile --target web    -t autoporada-web:<version> .
#   docker build -f docker/app/Dockerfile --target worker -t autoporada-worker:<version> .
#   docker build -f docker/app/Dockerfile --target tools  -t autoporada-tools:<version> .
# Digests are pinned; Renovate updates them.

FROM node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315 AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm build:node

# Next's standalone server on distroless: no shell, no package manager.
# The files belong to root, so the app (uid 65532) cannot change itself.
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:59c479c9b8c123e66047315c968aa2d35e31ae5149c856e4110a79c8b3563f0b AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
USER 65532:65532
EXPOSE 3000
CMD ["server.js"]

# The worker (job queue and mail) as one bundle, on the same distroless base as web: it holds the
# Graph credential, so it gets no shell. esbuild leaves no license file for it, so there is
# nothing to copy beside the bundle.
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:59c479c9b8c123e66047315c968aa2d35e31ae5149c856e4110a79c8b3563f0b AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /src/dist/worker.mjs ./
USER 65532:65532
CMD ["worker.mjs"]

# The maintenance CLI (migrate, auth:probe, …) with a shell for IT.
# migrate reads ./drizzle, so the working directory stays /app.
FROM node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315 AS tools
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /src/dist/cli.mjs /src/dist/cli.mjs.LEGAL.txt ./
COPY --from=build /src/drizzle ./drizzle
USER 65532:65532
ENTRYPOINT ["node", "/app/cli.mjs"]

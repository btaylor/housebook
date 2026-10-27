# Housebook

A self-hosted, shared record of one House. This project skeleton serves a placeholder page.
Setup, sign-in, and domain operations are not implemented yet.

## Install

Housebook images are published at `ghcr.io/btaylor/housebook` for amd64 and arm64.
Docker selects the image for your hardware. Releases provide `X.Y.Z`, `X.Y`, `X`, and `latest`
tags; for example, release `v1.2.3` publishes `1.2.3`, `1.2`, `1`, and `latest`.
Use `latest` for the newest release or pin a specific version for controlled upgrades.

Save this Compose example as `docker-compose.yml` (also included in this repository):

```yaml
services:
  housebook:
    image: ghcr.io/btaylor/housebook:latest
    ports:
      - '3000:3000'
    volumes:
      - ./data:/data
    restart: unless-stopped
```

The container runs as UID/GID 1000. On Linux, give that identity access to the bind mount:

```sh
mkdir -p data
sudo chown 1000:1000 data
docker compose pull
docker compose up -d
```

Open <http://localhost:3000>. There are no other
containers, services, telemetry, update checks, or external fonts/scripts. Runtime works offline;
building the image and installing development tools require network access.

To run without Compose:

```sh
docker run -d --name housebook --restart unless-stopped -p 3000:3000 \
  --mount type=bind,src="$(pwd)/data",dst=/data ghcr.io/btaylor/housebook:latest
```

## Upgrade

Back up `/data` before upgrading. For a pinned version, change the image tag in
`docker-compose.yml` to the newer version first, then pull and recreate the container:

```sh
docker compose pull
docker compose up -d
```

For a `docker run` installation, pull the newer tag, stop and remove the old container,
and repeat the install command with that tag and the **same `/data` mount**:

```sh
docker pull ghcr.io/btaylor/housebook:latest
docker stop housebook
docker rm housebook
```

Startup applies packaged Drizzle migrations before the server listens.
Before applying pending migrations to an existing database, it writes a consistent
`housebook.pre-migration-<UTC timestamp>-<unique id>.sqlite` backup under `/data`.
This includes committed SQLite WAL contents.
An unknown or changed migration stops startup with a downgrade error before database writes.
Downgrades past an applied migration are not supported. Use the matching or a newer image;
do not remove migration history to force a downgrade.
Run only one Housebook process against a data directory.

## Backups

Back up the **entire `data/` directory** mounted at `/data`: it holds `housebook.sqlite`,
SQLite sidecar files, migration backups, and future Document files.
Stop Housebook before copying the directory, then start it again:

```sh
docker compose stop
cp -a data "data-backup-$(date +%Y%m%d-%H%M%S)"
docker compose start
```

For a `docker run` installation, use `docker stop housebook` and `docker start housebook`
around the same copy command. Keep backups outside the mounted directory.
Automatic pre-migration backups cover the database only; they do not replace backups of
the entire `/data` directory.

## Develop

Use Node.js 24 and npm. SQLite uses Node's built-in `node:sqlite`; no native Node add-ons are
needed. Drizzle ORM and Kit are pinned to the same 1.0 release candidate because that release
provides the built-in SQLite driver. Node 24 may print an experimental SQLite warning.

```sh
npm ci
npm run dev
```

Local data defaults to `.data/`. Set `HOUSEBOOK_DATA_DIR` to use another directory:

```sh
HOUSEBOOK_DATA_DIR=/path/to/data npm run dev
npm run build
HOUSEBOOK_DATA_DIR=/path/to/data npm start
```

`HOST` and `PORT` configure the built Node server (defaults: `0.0.0.0:3000`).
Run commands from the repository root so startup can find `drizzle/`.
The production image contains that directory. Building the app does not create a database.

### Checks

```sh
npm run check          # svelte-check
npm run lint           # ESLint
npm run format:check   # Prettier
npm test               # Vitest: temporary on-disk SQLite, no mocks
npx playwright install --with-deps chromium
npm run test:e2e       # builds and starts the app; Chromium at a phone viewport
docker build -t housebook:local .
```

Pull-request CI runs all these checks, then builds and smoke-tests the Docker image on
amd64 and arm64 without runtime networking. It does not publish an image.
`npm run format` formats application/configuration files without rewriting existing domain docs.

### Core and migrations

All future domain rules belong in the server-only Housebook core. Routes use the initialized
core from `event.locals.housebook`; they must remain thin adapters.
The core constructor takes a Drizzle database handle, a data directory, and a clock function.
`src/lib/server/testing/harness.ts` creates that core with temporary SQLite/data files and a
clock that tests can advance. Vitest covers startup, WAL-safe upgrade backups, rollback on failure,
and downgrade refusal. Playwright checks the built app and refusal to listen on incompatible data.

Define future tables in `src/lib/server/schema.ts`, then run:

```sh
npm run db:generate -- --name=describe-the-change
```

Commit the generated migration directory and snapshot. Never edit an applied migration.
The initial custom migration is intentionally a no-op: Drizzle creates and records migration
history, but this skeleton has no domain schema.

## License

MIT. See [LICENSE](LICENSE).

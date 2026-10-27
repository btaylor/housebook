# Housebook

A self-hosted, shared record of one House. Create your House, sign in, and move between
Items, Maintenance Log, Contractors, and Settings. Record-management screens are placeholders.

## Run with Docker Compose

Clone this repository. The included `docker-compose.yml` builds one local image:

```yaml
services:
  housebook:
    build: .
    image: housebook:local
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
docker compose up --build -d
```

Open <http://localhost:3000>. The image supports amd64 and arm64. There are no other
containers, services, telemetry, update checks, or external fonts/scripts. Runtime works offline;
building the image and installing development tools require network access.
Image publishing is not part of this skeleton.

To run without Compose:

```sh
docker build -t housebook:local .
docker run --rm -p 3000:3000 --mount type=bind,src="$(pwd)/data",dst=/data housebook:local
```

### First-start setup and sign-in

On first start, read the one-time setup code from `docker compose logs housebook`.
Open Housebook and enter the code, House name, ISO 4217 currency code, and first Member's
name, email, and password. Passwords need at least 12 characters with no composition rules.
The setup code stops working once the House exists. Restarting before setup prints a new code.

Sign in with email and password. Email matching ignores case. Sessions last 30 days from
the last visit. Settings lets you sign out of the current device only.
Housebook does not send email, verify addresses, or make outgoing runtime requests.

Plain HTTP works directly on a LAN. HTTPS is recommended. Behind an HTTPS reverse proxy,
set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` on the container.
The proxy must overwrite those headers with the external scheme and host, and the container
must only accept traffic from that trusted proxy. Do not enable proxy headers on a directly
exposed installation. Direct HTTP ignores client-supplied transport headers.
The cookie is HTTP-only, SameSite=Lax, and Secure only when the incoming scheme is HTTPS.
SvelteKit checks the request origin for form submissions; this check remains enabled.
The optional `HOUSEBOOK_URL` for future Invite/reset links is not used by sign-in.

### Persistent data and upgrades

Back up the **entire `data/` directory** mounted at `/data`: it holds `housebook.sqlite`,
SQLite sidecar files, migration backups, and future Document files.
Stop Housebook before copying the directory, then start it again:

```sh
docker compose stop
cp -a data "data-backup-$(date +%Y%m%d-%H%M%S)"
docker compose start
```

Startup applies packaged Drizzle migrations before the server listens.
On first start, it creates the database, migration history, and House/Member/Session tables.
Before applying pending migrations to an existing database, it writes a consistent
`housebook.pre-migration-<UTC timestamp>-<unique id>.sqlite` backup under `/data`.
This includes committed SQLite WAL contents. Migration backups cover the database only;
they do not replace backups of the entire directory.
An unknown or changed migration stops startup with a downgrade error before database writes.
Use the matching or a newer image; do not remove migration history to force a downgrade.
Run only one Housebook process against a data directory.

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

All domain rules belong in the server-only Housebook core. Routes use the initialized
core from `event.locals.housebook`; they must remain thin adapters.
The core constructor takes a Drizzle database handle, a data directory, and a clock function.
`src/lib/server/testing/harness.ts` creates that core with temporary SQLite/data files and a
clock that tests can advance. Vitest covers setup, credentials, sliding sessions, startup,
WAL-safe upgrade backups, rollback on failure, and downgrade refusal. Playwright starts an isolated
built app for each journey and reads the real setup code from its startup output. It checks phone
setup/sign-out/sign-in, navigation, themes, route guards, cookies, CSRF, and proxy header handling.

Define future tables in `src/lib/server/schema.ts`, then run:

```sh
npm run db:generate -- --name=describe-the-change
```

Commit the generated migration directory and snapshot. Never edit an applied migration.
The initial custom migration remains a no-op baseline. Later migrations add the domain schema.

## License

MIT. See [LICENSE](LICENSE).

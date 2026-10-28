# Housebook

A self-hosted, shared record of one House. Create your House, sign in, and move between
Items, Maintenance Log, Contractors, and Settings. Add, find, and edit Items. Keep Contractor
contact details and Archive those you no longer use. Log work in Service Records and find it
in the Maintenance Log and on each linked Item and Contractor.

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

## First-start setup and sign-in

On first start, read the one-time setup code from `docker compose logs housebook`.
Open Housebook and enter the code, House name, currency, and first Member's
name, email, and password. Passwords need at least 12 characters with no composition rules.
The setup code stops working once the House exists. Restarting before setup prints a new code.

Sign in with email and password. Email matching ignores case. Sessions last 30 days from
the last visit. Five failed sign-ins within 15 minutes lock that Member's sign-in for 15 minutes.
Settings lets you edit your name and email, change your password with your current password,
review your active sessions, and sign out of this device or all your devices. You can also rename
the House. Email addresses must be unique across Members, ignoring case, and remain unverified.
Housebook does not send email, verify addresses, or make outgoing runtime requests.

Plain HTTP works directly on a LAN. HTTPS is recommended. Behind an HTTPS reverse proxy,
set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` on the container.
The proxy must overwrite those headers with the external scheme and host, and the container
must only accept traffic from that trusted proxy. Do not enable proxy headers on a directly
exposed installation. Direct HTTP ignores client-supplied transport headers.
The cookie is HTTP-only, SameSite=Lax, and Secure only when the incoming scheme is HTTPS.
SvelteKit checks the request origin for form submissions; this check remains enabled.
The optional `HOUSEBOOK_URL` for Invite links is not used by sign-in.

## Members and Invites

Settings lists the Household's Members and unused Invites. Create an Invite, then use
Share Invite for your phone's share sheet or Copy link. On plain HTTP where clipboard
access is unavailable, select and copy the displayed link manually. Housebook sends no email.
Save or share the link when you create it; only its hash is stored.

An Invite works once and expires after 7 days. You can revoke unused Invites in Settings.
The invited person opens the link and enters their name, a unique email address
(case does not matter), and a password of at least 12 characters. They join signed in.
Set `HOUSEBOOK_URL=https://housebook.example` to use your public address in Invite links.
Without it, Housebook uses the incoming request's origin.

## Items

Add an Item with a name and category. Location, make, model, serial number, install date,
warranty end date, and notes are optional. Search by name and filter by category on the Items tab.
Dates stay as calendar dates, without times or time zones. Warranty status uses the core clock's
UTC calendar day: it stays active through the end date and ends the next day.
An Item without a warranty end date shows “No warranty end date recorded,” not an active warranty.
Add a main photo when creating an Item, or take/upload one from its page. Replace or remove it
without changing the Item's details. Attach Documents with a title, then view, download, rename,
or delete them. PDFs, JPEGs, PNGs, and HEIC photos are accepted up to 25 MB (25 × 1024 × 1024 bytes).
Main photos accept images only. HEIC uploads become JPEGs using bundled pure JavaScript;
no system image libraries or runtime network access are required.
Stored files use generated names under the data directory's `files/` folder.
Deleting a Document or replacing/removing a photo removes the old stored file.
The built server accepts request bodies up to 27 MB to allow multipart overhead;
`BODY_SIZE_LIMIT` overrides that transport limit. Set reverse-proxy limits to at least 27 MB.

## Maintenance Log

Use **Log work** to record a calendar date, notes, an optional cost in the House currency,
and exactly one Contractor or Member. Select any number of Items; none means the whole House.
Log work from an Item's page to pre-select it. The Maintenance Log and Item and Contractor
Service Records show newest dates first. You can edit or permanently delete a Service Record.
Costs use a decimal point and at most two decimal places, and are stored as integer cents.
Archived Contractors cannot be assigned to new Service Records, but stay on existing ones.
Retired Items stay linked. An Item with Service Records cannot be deleted.
Documents on Service Records are not yet available.

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
SQLite sidecar files, migration backups, Documents, and Item photos.
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

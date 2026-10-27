# Self-hosted, distributed as one Docker image

Housebook is not a hosted service. Each Household runs its own installation from a single Docker image on their own homelab or NAS, and one installation holds exactly one House. Everything that must persist (the SQLite database and all Documents) lives in one mounted `/data` folder, so a backup is a copy of that folder.

## Consequences

- No multi-tenant code: there is one House per installation, so data is not partitioned by Household.
- The image must not depend on other containers or outside services to run.
- The image is built for both amd64 and arm64.
- Backups are the installer's responsibility; the app documents what to back up.
- The app makes no outgoing network requests: no telemetry, no update checks, no third-party fonts or scripts. It must work fully offline on a LAN.

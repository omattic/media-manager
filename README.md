# Media Manager

Local-first CLI for managing personal photo and video inventory across writable external drives and mounted folders.

The first implementation is intentionally non-centralized:

- Each device keeps its own local SQLite database.
- Each managed root has a `.media-manager/` folder at its root.
- Scans use filesystem metadata only and do not read media file contents.
- W7S sync, cleanup, deletion, and deep content verification are planned later.

## Install

```sh
corepack pnpm install
```

If pnpm prompts to approve native builds, approve `better-sqlite3` and `esbuild`.

Install from npm after publication:

```sh
npm install -g @omattic/media-manager
media-manager --help
```

## Run

```sh
corepack pnpm media-manager -- --help
```

Build the CLI:

```sh
corepack pnpm build
node dist/cli.js --help
```

## Basic Workflow

Initialize the local inventory:

```sh
corepack pnpm media-manager -- init
```

Register a writable external drive or mounted folder:

```sh
corepack pnpm media-manager -- register /Volumes/ArchiveDrive --label archive-drive-01 --kind backup
```

Scan a registered root:

```sh
corepack pnpm media-manager -- scan /Volumes/ArchiveDrive
corepack pnpm media-manager -- scan archive-drive-01
```

List known roots and status:

```sh
corepack pnpm media-manager -- roots
corepack pnpm media-manager -- status
```

Run reports:

```sh
corepack pnpm media-manager -- report unprotected --min-roots 2
corepack pnpm media-manager -- report duplicates
corepack pnpm media-manager -- report stale
```

Verify by relative path, metadata fingerprint, or actual file path:

```sh
corepack pnpm media-manager -- verify photo.jpg
corepack pnpm media-manager -- verify /Volumes/ArchiveDrive/photo.jpg
```

Export or import a portable manifest:

```sh
corepack pnpm media-manager -- manifest export archive-drive-01 --output archive-drive-01.manifest.json
corepack pnpm media-manager -- manifest import archive-drive-01.manifest.json
```

## First External Drive Example

For a user who installed the CLI from npm:

```sh
npm install -g @omattic/media-manager
```

Register the first writable drive:

```sh
media-manager register /Volumes/2TB_B --label google-takeout-drive --kind backup
```

Supported root kinds are:

- `device`: local device storage, such as an internal photos folder.
- `external`: an external drive or mounted folder that is not specifically a backup.
- `backup`: a location intended to count as a backup copy.
- `cloud`: a cloud-mounted or cloud-exported folder.
- `archive`: long-term cold storage that may be mounted less often.

Scan the drive:

```sh
media-manager scan google-takeout-drive
```

Interactive scans print progress logs to stderr while they walk the filesystem, finalize SQLite records, and write the root manifest. Use `--quiet` for silent automation and `--json` for machine-readable output without progress logs.

Check what was recorded:

```sh
media-manager status
media-manager roots
```

After registering and scanning a second location, check protection coverage:

```sh
media-manager report unprotected
media-manager report duplicates
media-manager report stale
```

The `unprotected` report will usually list everything after the first scan because the system has only seen one location. Once a second registered location has overlapping media, the report shows what still needs another copy.

The `duplicates` report uses a portable metadata fingerprint built from filesystem metadata that can survive copying between drives, currently file size and modified time. It is a probable duplicate report, not a content-hash guarantee.

If a scan reports errors, inspect the exact paths and messages from the latest scan:

```sh
media-manager scan-errors google-takeout-drive
```

The same error details are also written to `.media-manager/manifest.json` in the scanned root.

Scans are safe to run again, but they are not true resumable checkpoint scans yet. If a scan is interrupted, run the same command again and it will start a fresh scan from the beginning.

The default database path is:

```text
~/.local/share/media-manager/inventory.sqlite
```

Override it with:

```sh
MEDIA_MANAGER_DB=/path/to/inventory.sqlite corepack pnpm media-manager -- status
corepack pnpm media-manager -- --db /path/to/inventory.sqlite status
```

## Automation

Commands are designed for later cron use:

- `--json` for machine-readable output.
- `--quiet` for silent successful runs.
- `--no-auto-update` to skip the npm update check for one run.
- Stable exit codes.
- Idempotent registration and scanning.

## Auto-Update

When installed from npm, `media-manager` checks npm for a newer `@omattic/media-manager` version before running each command. If a newer version exists, it installs the latest global package and restarts the command once.

Source checkouts and local development runs skip auto-update automatically.

Disable auto-update for one command:

```sh
media-manager --no-auto-update status
```

Disable auto-update through the environment:

```sh
MEDIA_MANAGER_AUTO_UPDATE=0 media-manager status
```

## Development

```sh
corepack pnpm install
corepack pnpm run check
corepack pnpm run test
corepack pnpm run build
```

## Publishing

The npm package is `@omattic/media-manager`.

Publishing is handled by `.github/workflows/publish-npm.yml` with npm trusted publishing. After the npm package is configured to trust this GitHub workflow, publish by running the workflow manually or pushing a version tag:

```sh
git tag v0.1.1
git push origin v0.1.1
```

For a brand-new npm package, trusted publishing cannot be configured until the package exists on npm. Use an npm token or manual publish for the first publish, then switch the package to trusted publishing from npm package settings.

The repository is public, so the workflow publishes with npm provenance.

## Design Notes

- [Architecture](docs/design/architecture.md)
- [Backup Safety Model](docs/design/backup-safety-model.md)
- [Product Plan](docs/design/product-plan.md)

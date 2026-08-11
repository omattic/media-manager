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
- Stable exit codes.
- Idempotent registration and scanning.

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

## Design Notes

- [Architecture](docs/design/architecture.md)
- [Backup Safety Model](docs/design/backup-safety-model.md)
- [Product Plan](docs/design/product-plan.md)

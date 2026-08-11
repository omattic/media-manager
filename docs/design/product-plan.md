# Product Plan

Media Manager exists to make personal photo and video storage auditable without depending on a central service. The first product surface is a TypeScript CLI that can run from macOS or Linux, scan writable external drives and mounted folders, and reconcile state across devices through local SQLite databases plus `.media-manager/` manifests stored at each managed root.

## Approved Direction

- Build the CLI in TypeScript for Node.js.
- Use `pnpm` for package management.
- Use `better-sqlite3` for local SQLite storage, accepting native installs.
- Remove the Python implementation completely during the TypeScript rebuild.
- Support macOS and Linux first.
- Build only a CLI in milestone one.
- Keep command behavior cron-friendly: stable exit codes, non-interactive flags, resumable scans, idempotent writes, and optional JSON output.
- Each device keeps its own local SQLite database.
- W7S sync comes later and should improve coordination, not block local use.
- Managed roots must be writable.
- Each managed external drive or mounted folder gets a `.media-manager/` folder at its root.
- Normal scans use filesystem metadata only and do not read media file contents.
- Full content reads are reserved for a future explicit `deep-verify` command, limited to files that need stronger proof.
- Milestone one excludes deletion and cleanup commands.

## Target Outcome

- The CLI knows which media files exist across laptops, mounted folders, and external drives.
- A managed root can move between devices and still be recognized.
- Any device can scan the same root and reconcile through the root manifest.
- Reports identify probable duplicates, unprotected files, stale observations, and roots that need attention.
- The design leaves room for future backup planning, cleanup, and W7S sync without changing the local data model.

## Product Boundaries

- Media files remain distributed across user-owned storage locations.
- The local SQLite database stores inventory, device observations, scan history, and reportable state for the current device.
- `.media-manager/` stores portable root identity and relative manifest data, not machine-specific paths or secrets.
- The first milestone does not delete files, clean folders, copy backups, parse media content, or sync to W7S.
- W7S should later store synchronized inventory records and expose a backend `/health` endpoint with `branch`, `commitHash`, and `deployedAt`.

## Managed Root Manifest

Each registered root has a `.media-manager/` folder containing:

- Stable root ID.
- Human label.
- Manifest format version.
- Scanner version.
- Created and updated timestamps.
- Detected volume metadata snapshots when available.
- Relative file paths, never absolute paths.
- Filesystem metadata: size, mtime, ctime or birthtime when available, file mode, and file type.
- inode or file ID when available.
- Fast metadata fingerprint.
- Scan checkpoint data.

The manifest must not contain:

- Secrets or auth tokens.
- Machine-specific absolute paths.
- User home paths.
- EXIF or GPS metadata.
- Thumbnails.
- Content hashes by default.
- Deletion logs with private local paths.

## Milestone One Commands

- `media-manager init`: initialize the local device database.
- `media-manager register <path> --label <label> --kind <kind>`: create or validate `.media-manager/`.
- `media-manager roots`: list known managed roots.
- `media-manager scan <path|label>`: scan filesystem metadata into local SQLite and update the root manifest.
- `media-manager status`: show local DB status, known roots, stale roots, and latest scan results.
- `media-manager report unprotected`: show media that appears to exist in fewer than the configured number of roots.
- `media-manager report duplicates`: show probable duplicates based on metadata fingerprints.
- `media-manager report stale`: show roots and file observations that need rescan.
- `media-manager verify <path|query>`: verify current filesystem presence from metadata and local observations.
- `media-manager manifest export <path|label>`: write a portable manifest snapshot.
- `media-manager manifest import <file>`: import a manifest from another device or offline root.

## Data Model

- `devices`: local devices that run the CLI.
- `roots`: managed roots with stable IDs and labels.
- `root_observations`: per-device mount observations and detected volume metadata.
- `files`: logical file observations keyed by root ID and relative path.
- `file_versions`: filesystem metadata snapshots for a file over time.
- `metadata_fingerprints`: fast fingerprints built from filesystem-provided values.
- `scan_runs`: resumable scan history with counts, timings, and errors.
- `manifests`: imported and exported manifest snapshots.
- `reports`: optional cached report results for cron-friendly runs.

## Fingerprint Strategy

Normal scan fingerprints should use filesystem metadata only:

- Relative path.
- File size.
- mtime with nanosecond precision when available.
- ctime or birthtime when available.
- inode or platform file ID when available.
- file type and mode.

These fingerprints are useful for inventory, stale detection, and probable duplicate reporting. They are not cryptographic identity. Future `deep-verify` can compute stronger proof only for selected files.

## Cron-Friendly Requirements

- Every command must have deterministic exit codes.
- Every write command must be safe to rerun.
- Long scans should record progress and recover cleanly after interruption.
- Commands should support `--json` for logs and automation.
- Commands should support `--quiet` for cron.
- Commands should avoid prompts when required flags are present.
- Scan errors should be captured per path and summarized at the end.

## Later Phases

### Phase Two: Backup Planning

- Add backup planning reports without copying or deleting.
- Track location independence so two paths on the same physical disk do not count as two safe copies.
- Add stronger stale checks for backup confidence.

### Phase Three: Deep Verification

- Add `deep-verify` for selected files or suspicious groups.
- Compute content hashes only when explicitly requested.
- Store deep verification evidence separately from normal metadata fingerprints.

### Phase Four: Cleanup And Restore

- Add preview-only cleanup planning first.
- Add deletion ledger before any destructive command exists.
- Require recent verification before any future deletion.
- Add restore planning by root, path pattern, date range, or fingerprint group.

### Phase Five: W7S Sync

- Add a W7S backend with a D1-compatible inventory model and sync API.
- Sync roots, manifests, scan summaries, report state, and optional deep verification evidence.
- Keep secrets out of git.
- Inject `branch`, `commitHash`, and `deployedAt` into deployed backend health metadata.

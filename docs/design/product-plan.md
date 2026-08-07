# Product Plan

Media Manager exists to make personal photo and video storage auditable. The core job is to know what media exists, where each copy lives, whether the inventory is current enough to trust, and whether a file can be cleaned up without risking data loss.

## Target Outcome

- A local CLI manages day-to-day inventory, backup, restore, deduplication, and deletion workflows.
- SQLite remains the local source of truth for each machine or drive workflow.
- A W7S.io database stores synchronized inventory records so multiple devices can share state.
- Every media item is backed up in at least two independent locations before cleanup is allowed.
- Deletion tooling is conservative, explainable, and auditable.

## Product Boundaries

- Media files remain distributed across laptops, phones, mounted drives, NAS paths, cloud exports, and archive disks.
- The database stores inventory, metadata, manifests, and verification evidence. It does not need to store the media bytes.
- The CLI is the authority for destructive actions because it can inspect the actual local filesystem before deletion.
- W7S sync is for coordination, reporting, and recovery planning, not blind remote deletion approval.

## Phases

### Phase 1: Reliable Local Inventory

- Add schema migrations with explicit versions.
- Record stable location identity beyond labels: volume UUID, device serial when available, root fingerprint, and user notes.
- Track copy freshness separately from copy status so stale evidence is visible.
- Add `verify-location` to rescan a location and mark missing files.
- Add reports for unprotected files, duplicate groups, largest duplicates, stale locations, and files seen only once.
- Add tests around scan, backup, verification, deletion refusal, and stale copy handling.

### Phase 2: Media Metadata

- Extract capture time, EXIF camera data, image dimensions, video duration, codec, and GPS presence.
- Normalize dates into queryable fields while keeping raw metadata snapshots.
- Support sidecar metadata files when formats do not expose enough data safely.
- Add search/list commands for date ranges, camera/device, extension, size, and location.

### Phase 3: Backup Planning And Cleanup

- Add `plan-backup` to compute what should be copied to a destination.
- Add `plan-delete` to preview safe cleanup candidates with exact proof.
- Add a deletion ledger containing timestamp, file hash, original path, copy proof, operator, and command arguments.
- Add restore planning by hash, date range, album/folder, or location.
- Require a recent verification window for destructive operations, not only historical scans.

### Phase 4: Distributed Manifests

- Add export/import of signed or checksummed manifests for offline drives.
- Support conflict-safe merges from multiple local SQLite inventories.
- Track location independence so two paths on the same physical disk do not count as two safe copies.
- Add snapshot backups of the SQLite inventory itself.

### Phase 5: W7S Sync Service

- Add a W7S backend with a D1-compatible inventory model and sync API.
- Expose `/health` with `branch`, `commitHash`, and `deployedAt`.
- Sync locations, files, copies, metadata, manifests, and deletion ledger entries.
- Use idempotent writes keyed by stable IDs and content hashes.
- Support push/pull from the CLI with conflict reporting before mutation.
- Keep secrets out of the repo and inject deploy metadata at deployment time.

## Initial Command Roadmap

- `media-manager migrate`
- `media-manager locations`
- `media-manager verify-location <path|label>`
- `media-manager report unprotected`
- `media-manager report duplicates`
- `media-manager report stale`
- `media-manager plan-backup <source> <destination>`
- `media-manager plan-delete <path|query>`
- `media-manager restore-plan <sha256|query>`
- `media-manager manifest export <label>`
- `media-manager manifest import <file>`
- `media-manager sync push`
- `media-manager sync pull`
- `media-manager sync status`

## Safety Rules

- Never delete from inventory evidence alone; hash and stat the target at execution time.
- Require at least two independent present copies by default before deletion.
- Require at least one backup, archive, or cloud class location by default for cleanup workflows.
- Treat stale scans as warnings for reports and blockers for deletion.
- Record every destructive action in an append-only deletion ledger.
- Prefer dry runs and explicit `--yes` confirmation for any filesystem mutation.

## Near-Term MVP Milestone

The next milestone should make the current CLI trustworthy enough for real photo cleanup on one machine plus one backup drive:

1. Add schema migrations and tests.
2. Add location verification that marks missing paths.
3. Add unprotected and duplicate reports.
4. Add deletion ledger entries.
5. Update deletion to require recently verified copies.
6. Document a real backup-and-cleanup runbook.

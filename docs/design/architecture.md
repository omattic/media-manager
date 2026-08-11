# Architecture

Media Manager starts as a local-first TypeScript CLI for media inventory across writable external drives and mounted folders.

## Principles

- Normal scans use filesystem metadata only.
- Metadata fingerprints are useful for inventory and probable matching, but they are not cryptographic identity.
- Content hashes are reserved for a future explicit `deep-verify` command.
- Paths are treated as observations, not permanent identity.
- Managed roots describe external drives, mounted folders, cloud mounts, backup drives, and archives.
- Every managed root must be writable and contain a `.media-manager/` folder.
- Each device keeps its own local SQLite database.
- The inventory should work without a central service.
- W7S sync should be added later as a coordination layer.
- Deletion and cleanup are outside milestone one.

## Data Model

- `devices`: local machines that run the CLI.
- `roots`: named managed roots such as `archive-drive-01`, `icloud-export`, or `family-nas-photos`.
- `root_observations`: detected volume metadata and mount observations per device.
- `files`: relative file observations under a root.
- `file_versions`: filesystem metadata snapshots over time.
- `scan_runs`: resumable scan history.
- `manifests`: portable snapshots imported from or exported to `.media-manager/`.

## Roadmap

1. TypeScript CLI with local SQLite inventory.
2. Writable managed root registration through `.media-manager/`.
3. Metadata-only scan and manifest reconciliation.
4. Reports for probable duplicates, unprotected media, and stale roots.
5. Future explicit `deep-verify` for selected files.
6. Future backup planning, cleanup planning, restore planning, and W7S sync.

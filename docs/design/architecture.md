# Architecture

Photo System starts as a local-first media inventory and backup verification CLI.

## Principles

- Content identity comes from SHA-256 hashes.
- Paths are treated as observations, not permanent identity.
- Locations describe devices, external drives, cloud mounts, backup drives, and archives.
- Deletion must be gated by explicit backup verification.
- The inventory database should be portable and syncable, but media files remain distributed.

## Data Model

- `locations`: named roots such as `macbook-pictures`, `archive-drive-01`, or `icloud-export`.
- `files`: unique content records keyed by SHA-256, with size and extension metadata.
- `file_copies`: observed copies of a file at a location/path, including scan time and status.

## Roadmap

1. Local CLI with SQLite inventory.
2. Better media metadata extraction: EXIF, camera model, dimensions, duration, codec, and capture time.
3. Device manifests that can be exported/imported when drives are offline.
4. Deduplication reports and restore planning.
5. Optional daemon/watch mode for ingest folders.
6. Optional remote inventory sync with conflict-safe merges.

# Media Manager Decisions

## 2026-08-07: Local-First SQLite Inventory

The initial system uses a local SQLite inventory so it works against laptops, mounted external drives, and copied archive folders without requiring a server.

## 2026-08-07: Content Hash Identity, Superseded

The first Python prototype identified files by SHA-256 content hash. This is superseded for normal milestone-one scans by the 2026-08-11 metadata-only decision. Future explicit `deep-verify` may compute content hashes for selected files only.

## 2026-08-07: Deletion Requires Verification, Deferred

The first Python prototype included a guarded `delete` command. Deletion is deferred after the 2026-08-11 TypeScript milestone-one decision.

## 2026-08-07: Local CLI Owns Cleanup, Future

Future deletion and cleanup workflows should stay in the local CLI. W7S sync can coordinate inventory and reporting, but destructive operations must verify the local filesystem before deleting.

## 2026-08-07: W7S Stores Inventory, Not Media Bytes

The remote W7S database should synchronize inventory, metadata, manifests, and deletion ledger records. Media files remain in distributed user-owned storage locations.

## 2026-08-11: TypeScript CLI Rebuild

The next implementation should remove Python completely and rebuild the CLI in TypeScript for Node.js with `pnpm` and `better-sqlite3`.

## 2026-08-11: Non-Centralized First

Each device keeps its own local SQLite database. W7S sync should be added later after local root registration, scanning, manifests, and reports work without a central service.

## 2026-08-11: Writable Managed Roots

Every managed external drive or mounted folder must be writable and contain a `.media-manager/` folder at its root.

## 2026-08-11: Metadata-Only Normal Scans

Normal scans should use filesystem-provided metadata only. They should not read media file contents, parse EXIF, create thumbnails, or compute content hashes.

## 2026-08-11: Deep Verification Is Explicit

A future `deep-verify` command may read selected files only when stronger proof is needed.

## 2026-08-11: No Cleanup In Milestone One

The first TypeScript milestone should not include deletion or cleanup commands. It should focus on registration, scanning, manifests, inventory, reports, and verification.

## 2026-08-11: Published CLI Auto-Updates

Published npm installs should check for new package versions before each command, update the global package when a newer version exists, and re-run the command once. Source checkouts skip auto-update. Operators can disable it with `--no-auto-update` or `MEDIA_MANAGER_AUTO_UPDATE=0`.

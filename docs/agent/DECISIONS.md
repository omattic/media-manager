# Media Manager Decisions

## 2026-08-07: Local-First SQLite Inventory

The initial system uses a local SQLite inventory so it works against laptops, mounted external drives, and copied archive folders without requiring a server.

## 2026-08-07: Content Hash Identity

Files are identified by SHA-256 content hash. Paths are recorded as observed copies, but they are not the canonical identity.

## 2026-08-07: Deletion Requires Verification

The `delete` command refuses to delete unless the inventory meets the requested copy count and backup requirements. Actual deletion also requires `--yes`.

## 2026-08-07: Local CLI Owns Cleanup

Deletion and cleanup workflows should stay in the local CLI. W7S sync can coordinate inventory and reporting, but destructive operations must re-hash and verify the local filesystem before deleting.

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

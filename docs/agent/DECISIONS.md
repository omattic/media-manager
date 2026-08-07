# Photo System Decisions

## 2026-08-07: Local-First SQLite Inventory

The initial system uses a local SQLite inventory so it works against laptops, mounted external drives, and copied archive folders without requiring a server.

## 2026-08-07: Content Hash Identity

Files are identified by SHA-256 content hash. Paths are recorded as observed copies, but they are not the canonical identity.

## 2026-08-07: Deletion Requires Verification

The `delete` command refuses to delete unless the inventory meets the requested copy count and backup requirements. Actual deletion also requires `--yes`.

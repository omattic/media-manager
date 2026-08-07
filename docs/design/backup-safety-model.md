# Backup Safety Model

The first safety rule is simple: a file should not be deleted until the inventory can prove that enough present copies exist.

## Verification Inputs

- SHA-256 content hash of the local file.
- Minimum number of required present copies.
- Optional requirement that at least one copy exists on a backup, cloud, or archive location.

## Delete Flow

1. Hash the target file.
2. Find all present copies in the inventory.
3. Count total present copies.
4. Count backup/archive/cloud copies.
5. Refuse deletion unless requirements are met.
6. Require `--yes` for actual deletion.
7. Mark the deleted path as `deleted` in the inventory after deletion.

## Known Limits

- The inventory is only as accurate as the latest scans.
- A path recorded as present can become stale if a drive is changed outside the tool.
- Future versions should add verification scans that mark missing files before deletion.
- Future versions should distinguish same physical drive aliases from truly independent copies.

# Backup Safety Model

Milestone one does not include deletion or cleanup commands. It only builds inventory and verification reports that can later support safe backup planning.

## Verification Inputs

- Registered managed root identity from `.media-manager/`.
- Current filesystem metadata for observed media files.
- Fast metadata fingerprint.
- Minimum number of expected independent roots.
- Optional imported manifests from other devices or offline roots.

Normal verification does not read file contents.

## Report Flow

1. Register writable managed roots.
2. Scan filesystem metadata.
3. Write local observations into SQLite.
4. Update the root `.media-manager/` manifest.
5. Compare local observations with imported manifests.
6. Report probable protection status, probable duplicates, stale roots, and missing observations.

## Future Deep Verification

Future `deep-verify` may read selected files only when stronger proof is needed. That command can compute content hashes for suspicious duplicate groups, important files, or backup proof. Deep verification evidence should be stored separately from normal metadata fingerprints.

## Future Delete Flow

Deletion is intentionally out of scope for milestone one. Before any future destructive command is added, the system should require:

- Recent root scans.
- Recent selected deep verification when metadata confidence is not enough.
- Minimum number of required present copies.
- At least two independent storage roots.
- An append-only deletion ledger.
- Explicit dry-run output before mutation.
- Explicit confirmation flags for cron safety.

## Known Limits

- The inventory is only as accurate as the latest scans.
- A path recorded as present can become stale if a drive is changed outside the tool.
- Metadata fingerprints can produce probable matches, not cryptographic identity.
- Filesystem metadata differs across macOS, Linux, filesystems, and network mounts.
- Future versions should distinguish same physical drive aliases from truly independent roots.

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { APP_DIR_NAME, MANIFEST_FILE_NAME, MEDIA_EXTENSIONS } from "./constants.js";
import { metadataFingerprint } from "./fingerprint.js";
import { appDir, volumeMetadata } from "./root.js";
import { nowIso } from "./time.js";
import type { FileManifestEntry, RootIdentity, RootManifest } from "./types.js";

export interface ScanResult {
  scanRunId: string;
  rootId: string;
  label: string;
  filesSeen: number;
  errors: number;
  manifestPath: string;
}

interface ScanError {
  path: string;
  message: string;
}

export function scanRoot(
  db: Database.Database,
  deviceId: string,
  rootPath: string,
  identity: RootIdentity,
  scannerVersion: string,
  includeAll: boolean
): ScanResult {
  const scanRunId = randomUUID();
  const startedAt = nowIso();
  const manifestPath = join(appDir(rootPath), MANIFEST_FILE_NAME);
  const entries: FileManifestEntry[] = [];
  const errors: ScanError[] = [];
  const seen = new Set<string>();

  db.prepare(`
    INSERT INTO scan_runs (id, root_id, device_id, started_at, status, manifest_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(scanRunId, identity.rootId, deviceId, startedAt, "running", manifestPath);

  walk(rootPath, rootPath, includeAll, entries, seen, errors);

  const now = nowIso();
  const transaction = db.transaction(() => {
    const upsertFile = db.prepare(`
      INSERT INTO files (root_id, relative_path, file_type, first_seen_at, last_seen_at, status)
      VALUES (?, ?, 'file', ?, ?, 'present')
      ON CONFLICT(root_id, relative_path) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        status = 'present'
    `);
    const insertVersion = db.prepare(`
      INSERT INTO file_versions (
        root_id,
        relative_path,
        size_bytes,
        mtime_ns,
        ctime_ns,
        birthtime_ns,
        mode,
        ino,
        dev,
        metadata_fingerprint,
        observed_at,
        scan_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      upsertFile.run(identity.rootId, entry.relativePath, now, now);
      insertVersion.run(
        identity.rootId,
        entry.relativePath,
        entry.sizeBytes,
        entry.mtimeNs,
        entry.ctimeNs,
        entry.birthtimeNs,
        entry.mode,
        entry.ino,
        entry.dev,
        entry.metadataFingerprint,
        now,
        scanRunId
      );
    }

    const existing = db.prepare("SELECT relative_path FROM files WHERE root_id = ? AND status = 'present'").all(
      identity.rootId
    ) as { relative_path: string }[];
    const markMissing = db.prepare(
      "UPDATE files SET status = 'missing', last_seen_at = ? WHERE root_id = ? AND relative_path = ?"
    );
    for (const row of existing) {
      if (!seen.has(row.relative_path)) {
        markMissing.run(now, identity.rootId, row.relative_path);
      }
    }

    db.prepare(`
      UPDATE scan_runs
      SET completed_at = ?, status = ?, files_seen = ?, errors = ?
      WHERE id = ?
    `).run(now, errors.length > 0 ? "completed_with_errors" : "completed", entries.length, errors.length, scanRunId);
  });
  transaction();

  const manifest: RootManifest = {
    manifestVersion: identity.manifestVersion,
    rootId: identity.rootId,
    label: identity.label,
    kind: identity.kind,
    scannerVersion,
    createdAt: identity.createdAt,
    updatedAt: now,
    volumeMetadata: volumeMetadata(rootPath),
    scan: {
      scanRunId,
      scannedAt: now,
      filesSeen: entries.length,
      errors: errors.length
    },
    files: entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    scanRunId,
    rootId: identity.rootId,
    label: identity.label,
    filesSeen: entries.length,
    errors: errors.length,
    manifestPath
  };
}

function walk(
  rootPath: string,
  currentPath: string,
  includeAll: boolean,
  entries: FileManifestEntry[],
  seen: Set<string>,
  errors: ScanError[]
): void {
  let dirents;
  try {
    dirents = readdirSync(currentPath, { withFileTypes: true });
  } catch (error) {
    errors.push({ path: currentPath, message: error instanceof Error ? error.message : String(error) });
    return;
  }

  for (const dirent of dirents) {
    if (dirent.name === APP_DIR_NAME) {
      continue;
    }
    const absolutePath = join(currentPath, dirent.name);
    if (dirent.isDirectory()) {
      walk(rootPath, absolutePath, includeAll, entries, seen, errors);
      continue;
    }
    if (!dirent.isFile()) {
      continue;
    }
    if (!includeAll && !MEDIA_EXTENSIONS.has(extname(dirent.name).toLowerCase())) {
      continue;
    }
    try {
      const entry = entryForFile(rootPath, absolutePath);
      entries.push(entry);
      seen.add(entry.relativePath);
    } catch (error) {
      errors.push({ path: absolutePath, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

export function entryForFile(rootPath: string, absolutePath: string): FileManifestEntry {
  const stats = statSync(absolutePath, { bigint: true });
  const relativePath = normalizeRelativePath(relative(rootPath, resolve(absolutePath)));
  const entryBase = {
    relativePath,
    sizeBytes: stats.size.toString(),
    mtimeNs: stats.mtimeNs.toString(),
    ctimeNs: stats.ctimeNs.toString(),
    birthtimeNs: stats.birthtimeNs.toString(),
    mode: Number(stats.mode),
    ino: stats.ino.toString(),
    dev: stats.dev.toString()
  };
  return {
    ...entryBase,
    fileType: "file",
    metadataFingerprint: metadataFingerprint(entryBase)
  };
}

export function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

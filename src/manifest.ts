import type Database from "better-sqlite3";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { APP_DIR_NAME, MANIFEST_FILE_NAME } from "./constants.js";
import { CliError } from "./errors.js";
import { nowIso } from "./time.js";
import type { RootManifest } from "./types.js";

export function loadManifest(pathInput: string): RootManifest {
  const manifestPath = resolve(pathInput);
  if (!existsSync(manifestPath)) {
    throw new CliError(`Manifest does not exist: ${manifestPath}`, 2);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as RootManifest;
}

export function importManifest(db: Database.Database, sourcePath: string): RootManifest {
  const manifest = loadManifest(sourcePath);
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO roots (id, label, kind, manifest_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        kind = excluded.kind,
        manifest_version = excluded.manifest_version,
        updated_at = excluded.updated_at
    `).run(
      manifest.rootId,
      manifest.label,
      manifest.kind,
      manifest.manifestVersion,
      manifest.createdAt,
      manifest.updatedAt
    );

    const scanRunId = manifest.scan.scanRunId;
    const scanErrors = manifest.scanErrors ?? [];
    db.prepare(`
      INSERT OR IGNORE INTO scan_runs (id, root_id, device_id, started_at, completed_at, status, files_seen, errors, manifest_path)
      VALUES (?, ?, (SELECT id FROM devices ORDER BY created_at LIMIT 1), ?, ?, ?, ?, ?, ?)
    `).run(
      scanRunId,
      manifest.rootId,
      manifest.scan.scannedAt,
      manifest.scan.scannedAt,
      "imported",
      manifest.scan.filesSeen,
      scanErrors.length,
      resolve(sourcePath)
    );
    db.prepare("DELETE FROM scan_errors WHERE scan_run_id = ?").run(scanRunId);
    const insertError = db.prepare(`
      INSERT INTO scan_errors (scan_run_id, path, message, created_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const error of scanErrors) {
      insertError.run(scanRunId, error.path, error.message, manifest.scan.scannedAt);
    }

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
    for (const file of manifest.files) {
      upsertFile.run(manifest.rootId, file.relativePath, manifest.scan.scannedAt, manifest.scan.scannedAt);
      insertVersion.run(
        manifest.rootId,
        file.relativePath,
        file.sizeBytes,
        file.mtimeNs,
        file.ctimeNs,
        file.birthtimeNs,
        file.mode,
        file.ino,
        file.dev,
        file.metadataFingerprint,
        manifest.scan.scannedAt,
        scanRunId
      );
    }

    db.prepare("INSERT INTO manifests (id, root_id, source_path, imported_at, manifest_json) VALUES (?, ?, ?, ?, ?)").run(
      randomUUID(),
      manifest.rootId,
      resolve(sourcePath),
      now,
      JSON.stringify(manifest)
    );
  });
  tx();
  return manifest;
}

export function exportManifest(rootPathInput: string, destinationInput?: string): string {
  const rootPath = resolve(rootPathInput);
  const source = join(rootPath, APP_DIR_NAME, MANIFEST_FILE_NAME);
  if (!existsSync(source)) {
    throw new CliError(`No manifest found for root: ${rootPath}`, 2);
  }
  const destination = destinationInput ? resolve(destinationInput) : source;
  if (destination !== source) {
    copyFileSync(source, destination);
  }
  return destination;
}

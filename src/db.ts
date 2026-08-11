import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { arch, hostname, platform } from "node:os";
import { nowIso } from "./time.js";
import type { JsonRecord, RootIdentity } from "./types.js";

export interface AppDb {
  db: Database.Database;
  deviceId: string;
}

export function openDb(dbPath: string): AppDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  const deviceId = ensureDevice(db);
  return { db, deviceId };
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      platform TEXT NOT NULL,
      arch TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roots (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      manifest_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS root_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_id TEXT NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      root_path TEXT NOT NULL,
      volume_metadata_json TEXT NOT NULL,
      observed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_runs (
      id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      files_seen INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      manifest_path TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      root_id TEXT NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (root_id, relative_path)
    );

    CREATE TABLE IF NOT EXISTS file_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size_bytes TEXT NOT NULL,
      mtime_ns TEXT NOT NULL,
      ctime_ns TEXT NOT NULL,
      birthtime_ns TEXT NOT NULL,
      mode INTEGER NOT NULL,
      ino TEXT NOT NULL,
      dev TEXT NOT NULL,
      metadata_fingerprint TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      scan_run_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (root_id, relative_path) REFERENCES files(root_id, relative_path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_file_versions_fingerprint ON file_versions(metadata_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(root_id, relative_path, observed_at);

    CREATE TABLE IF NOT EXISTS manifests (
      id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      manifest_json TEXT NOT NULL
    );
  `);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, nowIso());
}

function ensureDevice(db: Database.Database): string {
  const existing = db.prepare("SELECT id FROM devices ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE devices SET updated_at = ? WHERE id = ?").run(nowIso(), existing.id);
    return existing.id;
  }
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    "INSERT INTO devices (id, label, platform, arch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, hostname(), platform(), arch(), now, now);
  return id;
}

export function upsertRoot(db: Database.Database, identity: RootIdentity): void {
  db.prepare(`
    INSERT INTO roots (id, label, kind, manifest_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      kind = excluded.kind,
      manifest_version = excluded.manifest_version,
      updated_at = excluded.updated_at
  `).run(
    identity.rootId,
    identity.label,
    identity.kind,
    identity.manifestVersion,
    identity.createdAt,
    identity.updatedAt
  );
}

export function insertRootObservation(
  db: Database.Database,
  rootId: string,
  deviceId: string,
  rootPath: string,
  volumeMetadata: JsonRecord
): void {
  db.prepare(`
    INSERT INTO root_observations (root_id, device_id, root_path, volume_metadata_json, observed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(rootId, deviceId, rootPath, JSON.stringify(volumeMetadata), nowIso());
}

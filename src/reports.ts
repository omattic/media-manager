import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { posix } from "node:path";

interface LatestFileRow {
  root_id: string;
  root_label: string;
  relative_path: string;
  status: string;
  size_bytes: string | null;
  metadata_fingerprint: string | null;
  observed_at: string | null;
}

interface DuplicateFile {
  root: string;
  relativePath: string;
  sizeBytes: string | null;
  observedAt: string | null;
}

interface DuplicateGroup {
  fingerprint: string;
  matchBasis: "metadata-fingerprint" | "name-size";
  count: number;
  files: DuplicateFile[];
}

export function latestFiles(db: Database.Database): LatestFileRow[] {
  return db.prepare(`
    SELECT
      f.root_id,
      r.label AS root_label,
      f.relative_path,
      f.status,
      fv.size_bytes,
      fv.metadata_fingerprint,
      fv.observed_at
    FROM files f
    JOIN roots r ON r.id = f.root_id
    LEFT JOIN file_versions fv ON fv.id = (
      SELECT id FROM file_versions
      WHERE root_id = f.root_id AND relative_path = f.relative_path
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
    )
    WHERE f.status = 'present'
    ORDER BY r.label, f.relative_path
  `).all() as LatestFileRow[];
}

export function duplicateReport(db: Database.Database): DuplicateGroup[] {
  const rows = latestFiles(db).filter(isReportableFile);
  const groups = new Map<string, LatestFileRow[]>();
  for (const row of rows) {
    if (!row.metadata_fingerprint) {
      continue;
    }
    const list = groups.get(row.metadata_fingerprint) ?? [];
    list.push(row);
    groups.set(row.metadata_fingerprint, list);
  }

  const exactGroups = [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([fingerprint, files]) => duplicateGroup("metadata-fingerprint", fingerprint, files));
  const seenSignatures = new Set(exactGroups.map((group) => fileSetSignature(group.files)));
  const nameSizeGroups = new Map<string, LatestFileRow[]>();
  for (const row of rows) {
    const key = nameSizeCandidateKey(row);
    if (!key) {
      continue;
    }
    const list = nameSizeGroups.get(key) ?? [];
    list.push(row);
    nameSizeGroups.set(key, list);
  }

  const candidateGroups = [...nameSizeGroups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([key, files]) => duplicateGroup("name-size", key, files))
    .filter((group) => {
      const signature = fileSetSignature(group.files);
      if (seenSignatures.has(signature)) {
        return false;
      }
      seenSignatures.add(signature);
      return true;
    });

  return [...exactGroups, ...candidateGroups];
}

function duplicateGroup(
  matchBasis: DuplicateGroup["matchBasis"],
  fingerprint: string,
  files: LatestFileRow[]
): DuplicateGroup {
  return {
    fingerprint,
    matchBasis,
    count: files.length,
    files: files.map((file) => ({
      root: file.root_label,
      relativePath: file.relative_path,
      sizeBytes: file.size_bytes,
      observedAt: file.observed_at
    }))
  };
}

function nameSizeCandidateKey(row: LatestFileRow): string | undefined {
  if (!row.size_bytes) {
    return undefined;
  }
  const fileName = posix.basename(row.relative_path).normalize("NFC").toLowerCase();
  const payload = ["name-size", fileName, row.size_bytes].join("\0");
  return createHash("sha256").update(payload).digest("hex");
}

function isReportableFile(row: LatestFileRow): boolean {
  return !posix.basename(row.relative_path).startsWith("._");
}

function fileSetSignature(files: { root: string; relativePath: string }[]): string {
  return files
    .map((file) => `${file.root}\0${file.relativePath}`)
    .sort()
    .join("\0");
}

export function unprotectedReport(db: Database.Database, minRoots: number): unknown[] {
  const groups = new Map<string, LatestFileRow[]>();
  for (const row of latestFiles(db)) {
    const key = row.metadata_fingerprint ?? `${row.root_id}:${row.relative_path}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, files]) => new Set(files.map((file) => file.root_id)).size < minRoots)
    .map(([fingerprint, files]) => ({
      fingerprint,
      roots: [...new Set(files.map((file) => file.root_label))],
      rootCount: new Set(files.map((file) => file.root_id)).size,
      requiredRoots: minRoots,
      files: files.map((file) => ({
        root: file.root_label,
        relativePath: file.relative_path,
        sizeBytes: file.size_bytes,
        observedAt: file.observed_at
      }))
    }));
}

export function staleReport(db: Database.Database): unknown[] {
  return db.prepare(`
    SELECT
      r.id,
      r.label,
      r.kind,
      MAX(sr.completed_at) AS lastScanAt,
      COALESCE(SUM(CASE WHEN f.status = 'missing' THEN 1 ELSE 0 END), 0) AS missingFiles,
      COALESCE(COUNT(f.relative_path), 0) AS trackedFiles
    FROM roots r
    LEFT JOIN scan_runs sr ON sr.root_id = r.id
    LEFT JOIN files f ON f.root_id = r.id
    GROUP BY r.id
    ORDER BY r.label
  `).all();
}

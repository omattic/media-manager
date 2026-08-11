import type Database from "better-sqlite3";

interface LatestFileRow {
  root_id: string;
  root_label: string;
  relative_path: string;
  status: string;
  size_bytes: string | null;
  metadata_fingerprint: string | null;
  observed_at: string | null;
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

export function duplicateReport(db: Database.Database): unknown[] {
  const groups = new Map<string, LatestFileRow[]>();
  for (const row of latestFiles(db)) {
    if (!row.metadata_fingerprint) {
      continue;
    }
    const list = groups.get(row.metadata_fingerprint) ?? [];
    list.push(row);
    groups.set(row.metadata_fingerprint, list);
  }
  return [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([fingerprint, files]) => ({
      fingerprint,
      count: files.length,
      files: files.map((file) => ({
        root: file.root_label,
        relativePath: file.relative_path,
        sizeBytes: file.size_bytes,
        observedAt: file.observed_at
      }))
    }));
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

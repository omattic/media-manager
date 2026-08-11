#!/usr/bin/env node
import type Database from "better-sqlite3";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { maybeAutoUpdate } from "./auto-update.js";
import { APP_DIR_NAME, IDENTITY_FILE_NAME } from "./constants.js";
import { defaultDbPath } from "./config.js";
import { openDb, insertRootObservation, upsertRoot } from "./db.js";
import { CliError } from "./errors.js";
import { exportManifest, importManifest } from "./manifest.js";
import { duplicateReport, staleReport, unprotectedReport } from "./reports.js";
import { assertRootKind, registerRoot, requireRegisteredRoot, volumeMetadata } from "./root.js";
import { entryForFile, scanRoot, type ScanProgressEvent } from "./scanner.js";
import { writeOutput } from "./output.js";
import type { OutputOptions } from "./types.js";

interface GlobalOptions extends OutputOptions {
  dbPath: string;
}

const packageJson = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")
) as { name: string; version: string };

export function main(argv = process.argv.slice(2)): number {
  try {
    const { globals, args } = parseGlobals(argv);
    const command = args.shift();
    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return 0;
    }
    if (command === "version" || command === "--version") {
      writeOutput(globals, packageJson.version, { version: packageJson.version });
      return 0;
    }
    return runCommand(command, args, globals);
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
}

function runCommand(command: string, args: string[], globals: GlobalOptions): number {
  const app = openDb(globals.dbPath);
  if (command === "init") {
    writeOutput(globals, `Initialized inventory: ${globals.dbPath}`, { dbPath: globals.dbPath });
    return 0;
  }

  if (command === "register") {
    const path = requireArg(args, "path");
    const label = requireOption(args, "--label");
    const kind = assertRootKind(optionValue(args, "--kind") ?? "external");
    const identity = registerRoot(path, label, kind);
    upsertRoot(app.db, identity);
    insertRootObservation(app.db, identity.rootId, app.deviceId, resolve(path), volumeMetadata(resolve(path)));
    writeOutput(globals, `Registered root ${identity.label}: ${resolve(path)}`, identity);
    return 0;
  }

  if (command === "roots") {
    const roots = app.db.prepare("SELECT id, label, kind, updated_at AS updatedAt FROM roots ORDER BY label").all();
    writeOutput(globals, formatRows(roots), roots);
    return 0;
  }

  if (command === "scan") {
    const pathOrLabel = requireArg(args, "path or label");
    const includeAll = hasFlag(args, "--all");
    const rootInput = resolveRootInput(app.db, pathOrLabel);
    const { rootPath, identity } = requireRegisteredRoot(rootInput);
    upsertRoot(app.db, identity);
    insertRootObservation(app.db, identity.rootId, app.deviceId, rootPath, volumeMetadata(rootPath));
    const result = scanRoot(
      app.db,
      app.deviceId,
      rootPath,
      identity,
      packageJson.version,
      includeAll,
      progressLogger(globals, identity.label, rootPath)
    );
    writeOutput(globals, `Scanned ${result.filesSeen} file(s) for ${result.label}`, result);
    return result.errors > 0 ? 1 : 0;
  }

  if (command === "scan-errors") {
    const target = requireArg(args, "path, label, or scan run id");
    const result = scanErrorsFor(app.db, target);
    writeOutput(globals, result.errors.length > 0 ? formatRows(result.errors) : "No scan errors.", result);
    return 0;
  }

  if (command === "status") {
    const status = {
      dbPath: globals.dbPath,
      roots: app.db.prepare(`
        SELECT
          r.id,
          r.label,
          r.kind,
          MAX(sr.completed_at) AS lastScanAt,
          COALESCE(COUNT(DISTINCT f.relative_path), 0) AS trackedFiles
        FROM roots r
        LEFT JOIN scan_runs sr ON sr.root_id = r.id
        LEFT JOIN files f ON f.root_id = r.id AND f.status = 'present'
        GROUP BY r.id
        ORDER BY r.label
      `).all()
    };
    writeOutput(globals, formatRows(status.roots as unknown[]), status);
    return 0;
  }

  if (command === "report") {
    const reportName = requireArg(args, "report");
    if (reportName === "duplicates") {
      const report = duplicateReport(app.db);
      writeOutput(globals, formatRows(report), report);
      return 0;
    }
    if (reportName === "unprotected") {
      const minRoots = Number(optionValue(args, "--min-roots") ?? "2");
      const report = unprotectedReport(app.db, minRoots);
      writeOutput(globals, formatRows(report), report);
      return 0;
    }
    if (reportName === "stale") {
      const report = staleReport(app.db);
      writeOutput(globals, formatRows(report as object[]), report);
      return 0;
    }
    throw new CliError(`Unknown report: ${reportName}`, 2);
  }

  if (command === "verify") {
    const query = requireArg(args, "path or query");
    const pathVerification = verifyPath(app.db, query);
    if (pathVerification) {
      writeOutput(globals, formatRows(pathVerification.matches), pathVerification);
      return pathVerification.matches.length > 0 ? 0 : 1;
    }
    const matches = app.db.prepare(`
      SELECT
        r.label AS root,
        f.relative_path AS relativePath,
        f.status,
        fv.size_bytes AS sizeBytes,
        fv.metadata_fingerprint AS metadataFingerprint,
        fv.observed_at AS observedAt
      FROM files f
      JOIN roots r ON r.id = f.root_id
      LEFT JOIN file_versions fv ON fv.id = (
        SELECT id FROM file_versions
        WHERE root_id = f.root_id AND relative_path = f.relative_path
        ORDER BY observed_at DESC, id DESC
        LIMIT 1
      )
      WHERE f.relative_path = ? OR f.relative_path LIKE ? OR fv.metadata_fingerprint = ?
      ORDER BY r.label, f.relative_path
    `).all(query, `%${query}%`, query);
    writeOutput(globals, formatRows(matches), { query, matches });
    return matches.length > 0 ? 0 : 1;
  }

  if (command === "manifest") {
    const action = requireArg(args, "manifest action");
    if (action === "export") {
      const rootPath = resolveRootInput(app.db, requireArg(args, "path or label"));
      const destination = optionValue(args, "--output");
      const exportedPath = exportManifest(rootPath, destination);
      writeOutput(globals, `Exported manifest: ${exportedPath}`, { exportedPath });
      return 0;
    }
    if (action === "import") {
      const manifestPath = requireArg(args, "manifest path");
      const manifest = importManifest(app.db, manifestPath);
      writeOutput(globals, `Imported manifest for ${manifest.label}`, {
        rootId: manifest.rootId,
        label: manifest.label,
        files: manifest.files.length
      });
      return 0;
    }
    throw new CliError(`Unknown manifest action: ${action}`, 2);
  }

  throw new CliError(`Unknown command: ${command}`, 2);
}

function parseGlobals(argv: string[]): { globals: GlobalOptions; args: string[] } {
  const args = [...argv];
  const globals: GlobalOptions = {
    dbPath: defaultDbPath(),
    json: false,
    quiet: false
  };
  for (let index = 0; index < args.length; ) {
    const arg = args[index];
    if (arg === "--db") {
      globals.dbPath = resolve(args[index + 1] ?? "");
      args.splice(index, 2);
      continue;
    }
    if (arg === "--json") {
      globals.json = true;
      args.splice(index, 1);
      continue;
    }
    if (arg === "--quiet") {
      globals.quiet = true;
      args.splice(index, 1);
      continue;
    }
    if (arg === "--no-auto-update") {
      args.splice(index, 1);
      continue;
    }
    index += 1;
  }
  return { globals, args };
}

function requireArg(args: string[], name: string): string {
  const value = args.shift();
  if (!value || value.startsWith("--")) {
    throw new CliError(`Missing required ${name}`, 2);
  }
  return value;
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliError(`Missing value for ${name}`, 2);
  }
  args.splice(index, 2);
  return value;
}

function requireOption(args: string[], name: string): string {
  const value = optionValue(args, name);
  if (!value) {
    throw new CliError(`Missing required option ${name}`, 2);
  }
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function resolveRootInput(db: Database.Database, pathOrLabel: string): string {
  const resolved = resolve(pathOrLabel);
  if (existsSync(resolved)) {
    return resolved;
  }
  const row = db.prepare(`
    SELECT ro.root_path AS rootPath
    FROM roots r
    JOIN root_observations ro ON ro.id = (
      SELECT id FROM root_observations
      WHERE root_id = r.id
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
    )
    WHERE r.label = ?
  `).get(pathOrLabel) as { rootPath: string } | undefined;
  if (!row) {
    throw new CliError(`No path or registered root label found: ${pathOrLabel}`, 2);
  }
  return row.rootPath;
}

function verifyPath(
  db: Database.Database,
  query: string
): { query: string; metadataFingerprint: string; matches: unknown[] } | undefined {
  const absolutePath = resolve(query);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return undefined;
  }
  const rootPath = findRegisteredAncestor(absolutePath);
  if (!rootPath) {
    throw new CliError(`File is not inside a registered root: ${absolutePath}`, 2);
  }
  const entry = entryForFile(rootPath, absolutePath);
  const matches = db.prepare(`
    SELECT
      r.label AS root,
      f.relative_path AS relativePath,
      f.status,
      fv.size_bytes AS sizeBytes,
      fv.metadata_fingerprint AS metadataFingerprint,
      fv.observed_at AS observedAt
    FROM files f
    JOIN roots r ON r.id = f.root_id
    LEFT JOIN file_versions fv ON fv.id = (
      SELECT id FROM file_versions
      WHERE root_id = f.root_id AND relative_path = f.relative_path
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
    )
    WHERE f.relative_path = ? OR fv.metadata_fingerprint = ?
    ORDER BY r.label, f.relative_path
  `).all(entry.relativePath, entry.metadataFingerprint);
  return {
    query,
    metadataFingerprint: entry.metadataFingerprint,
    matches
  };
}

function findRegisteredAncestor(absolutePath: string): string | undefined {
  let current = dirname(absolutePath);
  while (true) {
    if (existsSync(join(current, APP_DIR_NAME, IDENTITY_FILE_NAME))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

interface ScanErrorsResult {
  target: string;
  scanRunId: string;
  rootLabel: string;
  scannedAt: string;
  errors: {
    path: string;
    message: string;
    createdAt: string;
  }[];
}

function scanErrorsFor(db: Database.Database, target: string): ScanErrorsResult {
  const directRun = scanRunById(db, target);
  if (directRun) {
    return scanErrorsForRun(db, target, directRun);
  }

  const root = rootForScanErrorTarget(db, target);
  const latestRun = db.prepare(`
    SELECT
      sr.id AS scanRunId,
      r.label AS rootLabel,
      COALESCE(sr.completed_at, sr.started_at) AS scannedAt
    FROM scan_runs sr
    JOIN roots r ON r.id = sr.root_id
    WHERE sr.root_id = ?
    ORDER BY COALESCE(sr.completed_at, sr.started_at) DESC, sr.started_at DESC
    LIMIT 1
  `).get(root.rootId) as { scanRunId: string; rootLabel: string; scannedAt: string } | undefined;
  if (!latestRun) {
    throw new CliError(`No scan runs found for root: ${root.label}`, 2);
  }
  return scanErrorsForRun(db, target, latestRun);
}

function scanRunById(
  db: Database.Database,
  scanRunId: string
): { scanRunId: string; rootLabel: string; scannedAt: string } | undefined {
  return db.prepare(`
    SELECT
      sr.id AS scanRunId,
      r.label AS rootLabel,
      COALESCE(sr.completed_at, sr.started_at) AS scannedAt
    FROM scan_runs sr
    JOIN roots r ON r.id = sr.root_id
    WHERE sr.id = ?
  `).get(scanRunId) as { scanRunId: string; rootLabel: string; scannedAt: string } | undefined;
}

function rootForScanErrorTarget(db: Database.Database, target: string): { rootId: string; label: string } {
  const byLabel = db.prepare("SELECT id AS rootId, label FROM roots WHERE label = ?").get(target) as
    | { rootId: string; label: string }
    | undefined;
  if (byLabel) {
    return byLabel;
  }

  const resolved = resolve(target);
  if (existsSync(resolved)) {
    const { identity } = requireRegisteredRoot(resolved);
    return { rootId: identity.rootId, label: identity.label };
  }

  throw new CliError(`No scan run, root label, or registered path found: ${target}`, 2);
}

function scanErrorsForRun(
  db: Database.Database,
  target: string,
  run: { scanRunId: string; rootLabel: string; scannedAt: string }
): ScanErrorsResult {
  const errors = db.prepare(`
    SELECT path, message, created_at AS createdAt
    FROM scan_errors
    WHERE scan_run_id = ?
    ORDER BY id
  `).all(run.scanRunId) as ScanErrorsResult["errors"];
  return {
    target,
    scanRunId: run.scanRunId,
    rootLabel: run.rootLabel,
    scannedAt: run.scannedAt,
    errors
  };
}

function formatRows(rows: unknown[]): string {
  if (rows.length === 0) {
    return "No rows.";
  }
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

function progressLogger(
  globals: GlobalOptions,
  label: string,
  rootPath: string
): ((event: ScanProgressEvent) => void) | undefined {
  if (globals.quiet || globals.json) {
    return undefined;
  }
  return (event) => {
    const summary = `${event.filesSeen} file(s), ${event.directoriesSeen} directories, ${event.errors} error(s)`;
    if (event.phase === "started") {
      process.stderr.write(`Scanning ${label}: ${rootPath}\n`);
      return;
    }
    if (event.phase === "walking") {
      process.stderr.write(`Scanning progress: ${summary}\n`);
      return;
    }
    if (event.phase === "finalizing") {
      process.stderr.write(`Finalizing scan: ${summary}\n`);
      return;
    }
    if (event.phase === "manifest") {
      process.stderr.write(`Writing manifest: ${event.currentPath}\n`);
      return;
    }
    process.stderr.write(`Scan complete: ${summary}\n`);
  };
}

function printHelp(): void {
  process.stdout.write(`media-manager ${packageJson.version}

Usage:
  media-manager [--db path] [--json] [--quiet] [--no-auto-update] <command>

Commands:
  init
  register <path> --label <label> [--kind external|backup|cloud|archive|device]
  roots
  scan <path> [--all]
  scan-errors <path|label|scan-run-id>
  status
  report duplicates
  report unprotected [--min-roots 2]
  report stale
  verify <path|relative-path|metadata-fingerprint>
  manifest export <path> [--output file]
  manifest import <file>
`);
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? realpathSync(process.argv[1]) : undefined;

if (invokedFile === currentFile) {
  const updateExitCode = maybeAutoUpdate({
    argv: process.argv.slice(2),
    currentFile,
    currentVersion: packageJson.version,
    packageName: packageJson.name
  });
  process.exitCode = updateExitCode ?? main();
}

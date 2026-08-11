#!/usr/bin/env node
import type Database from "better-sqlite3";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_DIR_NAME, IDENTITY_FILE_NAME } from "./constants.js";
import { defaultDbPath } from "./config.js";
import { openDb, insertRootObservation, upsertRoot } from "./db.js";
import { CliError } from "./errors.js";
import { exportManifest, importManifest } from "./manifest.js";
import { duplicateReport, staleReport, unprotectedReport } from "./reports.js";
import { assertRootKind, registerRoot, requireRegisteredRoot, volumeMetadata } from "./root.js";
import { entryForFile, scanRoot } from "./scanner.js";
import { writeOutput } from "./output.js";
import type { OutputOptions } from "./types.js";

interface GlobalOptions extends OutputOptions {
  dbPath: string;
}

const packageJson = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")
) as { version: string };

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
    const result = scanRoot(app.db, app.deviceId, rootPath, identity, packageJson.version, includeAll);
    writeOutput(globals, `Scanned ${result.filesSeen} file(s) for ${result.label}`, result);
    return result.errors > 0 ? 1 : 0;
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

function formatRows(rows: unknown[]): string {
  if (rows.length === 0) {
    return "No rows.";
  }
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

function printHelp(): void {
  process.stdout.write(`media-manager ${packageJson.version}

Usage:
  media-manager [--db path] [--json] [--quiet] <command>

Commands:
  init
  register <path> --label <label> [--kind external|backup|cloud|archive|device]
  roots
  scan <path> [--all]
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
  process.exitCode = main();
}

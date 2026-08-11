import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statfsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP_DIR_NAME, IDENTITY_FILE_NAME, MANIFEST_VERSION, ROOT_KINDS, type RootKind } from "./constants.js";
import { CliError } from "./errors.js";
import { nowIso } from "./time.js";
import type { JsonRecord, RootIdentity } from "./types.js";

export function assertRootKind(kind: string): RootKind {
  if ((ROOT_KINDS as readonly string[]).includes(kind)) {
    return kind as RootKind;
  }
  throw new CliError(`Invalid root kind: ${kind}`, 2);
}

export function appDir(rootPath: string): string {
  return join(rootPath, APP_DIR_NAME);
}

export function identityPath(rootPath: string): string {
  return join(appDir(rootPath), IDENTITY_FILE_NAME);
}

export function requireWritableDirectory(pathInput: string): string {
  const rootPath = resolve(pathInput);
  const stat = statSync(rootPath, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) {
    throw new CliError(`Path is not a directory: ${rootPath}`, 2);
  }
  try {
    mkdirSync(appDir(rootPath), { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Managed root must be writable: ${rootPath}: ${message}`, 2);
  }
  return rootPath;
}

export function volumeMetadata(rootPath: string): JsonRecord {
  const rootStat = statSync(rootPath, { bigint: true });
  let statfs: ReturnType<typeof statfsSync> | undefined;
  try {
    statfs = statfsSync(rootPath);
  } catch {
    statfs = undefined;
  }
  return {
    platform: process.platform,
    dev: rootStat.dev.toString(),
    ino: rootStat.ino.toString(),
    mode: Number(rootStat.mode),
    statfs: statfs
      ? {
          type: statfs.type,
          bsize: statfs.bsize,
          blocks: statfs.blocks,
          bfree: statfs.bfree,
          bavail: statfs.bavail,
          files: statfs.files,
          ffree: statfs.ffree
        }
      : null
  };
}

export function readIdentity(rootPath: string): RootIdentity | undefined {
  const file = identityPath(rootPath);
  if (!existsSync(file)) {
    return undefined;
  }
  return JSON.parse(readFileSync(file, "utf8")) as RootIdentity;
}

export function writeIdentity(rootPath: string, identity: RootIdentity): void {
  writeFileSync(identityPath(rootPath), `${JSON.stringify(identity, null, 2)}\n`);
}

export function registerRoot(rootPathInput: string, label: string, kind: RootKind): RootIdentity {
  const rootPath = requireWritableDirectory(rootPathInput);
  const existing = readIdentity(rootPath);
  const now = nowIso();
  const identity: RootIdentity = existing
    ? {
        ...existing,
        label,
        kind,
        updatedAt: now,
        volumeMetadata: volumeMetadata(rootPath)
      }
    : {
        manifestVersion: MANIFEST_VERSION,
        rootId: randomUUID(),
        label,
        kind,
        createdAt: now,
        updatedAt: now,
        volumeMetadata: volumeMetadata(rootPath)
      };
  writeIdentity(rootPath, identity);
  return identity;
}

export function requireRegisteredRoot(rootPathInput: string): { rootPath: string; identity: RootIdentity } {
  const rootPath = requireWritableDirectory(rootPathInput);
  const identity = readIdentity(rootPath);
  if (!identity) {
    throw new CliError(`Root is not registered: ${rootPath}`, 2);
  }
  return { rootPath, identity };
}

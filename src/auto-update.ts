import { execFileSync, spawnSync } from "node:child_process";
import { sep } from "node:path";

export interface AutoUpdateOptions {
  argv: string[];
  currentFile: string;
  currentVersion: string;
  packageName: string;
  env?: NodeJS.ProcessEnv;
}

export function maybeAutoUpdate(options: AutoUpdateOptions): number | undefined {
  const env = options.env ?? process.env;
  if (!shouldCheckForUpdate(options.argv, options.currentFile, env)) {
    return undefined;
  }

  const latest = latestPublishedVersion(options.packageName);
  if (!latest || compareVersions(latest, options.currentVersion) <= 0) {
    return undefined;
  }

  process.stderr.write(`Updating media-manager from ${options.currentVersion} to ${latest}\n`);
  try {
    execFileSync("npm", ["install", "-g", `${options.packageName}@latest`], {
      stdio: "inherit",
      env: process.env
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Auto-update failed, continuing with ${options.currentVersion}: ${message}\n`);
    return undefined;
  }

  const child = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      MEDIA_MANAGER_AUTO_UPDATED: "1"
    }
  });

  if (child.signal) {
    process.stderr.write(`Updated media-manager exited from signal ${child.signal}\n`);
    return 1;
  }
  return child.status ?? 0;
}

export function shouldCheckForUpdate(argv: string[], currentFile: string, env: NodeJS.ProcessEnv): boolean {
  if (argv.includes("--no-auto-update")) {
    return false;
  }
  if (env.MEDIA_MANAGER_AUTO_UPDATE === "0") {
    return false;
  }
  if (env.MEDIA_MANAGER_AUTO_UPDATED === "1") {
    return false;
  }
  const packagePath = `${sep}node_modules${sep}@omattic${sep}media-manager${sep}`;
  return currentFile.includes(packagePath);
}

export function compareVersions(left: string, right: string): number {
  const leftParts = numericParts(left);
  const rightParts = numericParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}

function numericParts(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function latestPublishedVersion(packageName: string): string | undefined {
  try {
    const output = execFileSync("npm", ["view", packageName, "version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000
    });
    return JSON.parse(output.trim()) as string;
  } catch {
    return undefined;
  }
}

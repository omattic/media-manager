import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

function tempWorkspace(): { dir: string; db: string; root: string } {
  const dir = mkdtempSync(join(tmpdir(), "media-manager-test-"));
  const root = join(dir, "drive");
  mkdirSync(root);
  return { dir, db: join(dir, "inventory.sqlite"), root };
}

function run(args: string[]): number {
  return main(args);
}

describe("media-manager CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers and scans a managed root without reading file contents", () => {
    const workspace = tempWorkspace();
    writeFileSync(join(workspace.root, "photo.jpg"), "sample");

    expect(run(["--db", workspace.db, "--quiet", "init"])).toBe(0);
    expect(run(["--db", workspace.db, "--quiet", "register", workspace.root, "--label", "drive-a"])).toBe(0);
    expect(run(["--db", workspace.db, "--quiet", "scan", "drive-a"])).toBe(0);
    expect(run(["--db", workspace.db, "--quiet", "verify", join(workspace.root, "photo.jpg")])).toBe(0);
  });

  it("refuses to scan an unregistered root", () => {
    const workspace = tempWorkspace();
    writeFileSync(join(workspace.root, "photo.jpg"), "sample");

    expect(run(["--db", workspace.db, "--quiet", "scan", workspace.root])).toBe(2);
  });

  it("imports a manifest from another local database", () => {
    const first = tempWorkspace();
    const second = tempWorkspace();
    writeFileSync(join(first.root, "video.mp4"), "sample");

    expect(run(["--db", first.db, "--quiet", "register", first.root, "--label", "drive-a"])).toBe(0);
    expect(run(["--db", first.db, "--quiet", "scan", first.root])).toBe(0);
    expect(run(["--db", second.db, "--quiet", "manifest", "import", join(first.root, ".media-manager", "manifest.json")])).toBe(0);
    expect(run(["--db", second.db, "--quiet", "verify", "video.mp4"])).toBe(0);
  });

  it("shows scan progress logs for interactive runs", () => {
    const workspace = tempWorkspace();
    writeFileSync(join(workspace.root, "photo.jpg"), "sample");

    expect(run(["--db", workspace.db, "--quiet", "register", workspace.root, "--label", "drive-a"])).toBe(0);

    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    expect(run(["--db", workspace.db, "scan", "drive-a"])).toBe(0);

    const logOutput = stderr.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(logOutput).toContain("Scanning drive-a:");
    expect(logOutput).toContain("Finalizing scan:");
    expect(logOutput).toContain("Writing manifest:");
    expect(logOutput).toContain("Scan complete:");
    expect(stdout).toHaveBeenCalled();
  });

  it("stores scan error details for the latest root scan", () => {
    const workspace = tempWorkspace();
    writeFileSync(join(workspace.root, "photo.jpg"), "sample");
    const deniedPath = join(workspace.root, "denied");
    mkdirSync(deniedPath);
    chmodSync(deniedPath, 0);

    try {
      expect(run(["--db", workspace.db, "--quiet", "register", workspace.root, "--label", "drive-a"])).toBe(0);
      expect(run(["--db", workspace.db, "--quiet", "scan", "drive-a"])).toBe(1);

      const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      expect(run(["--db", workspace.db, "--json", "scan-errors", "drive-a"])).toBe(0);

      const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join("");
      const result = JSON.parse(output) as { errors: { path: string; message: string }[] };
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe("denied");

      const manifest = JSON.parse(
        readFileSync(join(workspace.root, ".media-manager", "manifest.json"), "utf8")
      ) as { scanErrors: { path: string; message: string }[] };
      expect(manifest.scanErrors).toHaveLength(1);
      expect(manifest.scanErrors[0]?.path).toBe("denied");
    } finally {
      chmodSync(deniedPath, 0o700);
    }
  });
});

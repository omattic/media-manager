import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
});

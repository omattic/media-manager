import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { compareVersions, shouldCheckForUpdate } from "../src/auto-update.js";

describe("auto update", () => {
  it("compares semantic versions numerically", () => {
    expect(compareVersions("0.1.10", "0.1.2")).toBe(1);
    expect(compareVersions("0.1.2", "0.1.10")).toBe(-1);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
  });

  it("checks only npm-installed package paths", () => {
    const installedPath = `${sep}tmp${sep}prefix${sep}lib${sep}node_modules${sep}@omattic${sep}media-manager${sep}dist${sep}cli.js`;
    expect(shouldCheckForUpdate([], installedPath, {})).toBe(true);
    expect(shouldCheckForUpdate(["--no-auto-update"], installedPath, {})).toBe(false);
    expect(shouldCheckForUpdate([], installedPath, { MEDIA_MANAGER_AUTO_UPDATE: "0" })).toBe(false);
    expect(shouldCheckForUpdate([], installedPath, { MEDIA_MANAGER_AUTO_UPDATED: "1" })).toBe(false);
    expect(shouldCheckForUpdate([], `${sep}home${sep}gnu${sep}media-manager${sep}dist${sep}cli.js`, {})).toBe(false);
  });
});

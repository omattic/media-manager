import { homedir } from "node:os";
import { resolve } from "node:path";

export function defaultDbPath(): string {
  const configured = process.env.MEDIA_MANAGER_DB;
  if (configured && configured.trim() !== "") {
    return resolve(configured);
  }
  return resolve(homedir(), ".local/share/media-manager/inventory.sqlite");
}

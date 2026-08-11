import { createHash } from "node:crypto";

export interface FingerprintInput {
  relativePath: string;
  sizeBytes: string;
  mtimeNs: string;
  ctimeNs: string;
  birthtimeNs: string;
  mode: number;
  ino: string;
  dev: string;
}

export function metadataFingerprint(input: FingerprintInput): string {
  const payload = [
    input.relativePath,
    input.sizeBytes,
    input.mtimeNs,
    input.ctimeNs,
    input.birthtimeNs,
    String(input.mode),
    input.ino,
    input.dev
  ].join("\0");
  return createHash("sha256").update(payload).digest("hex");
}

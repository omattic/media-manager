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
  const payload = [input.sizeBytes, input.mtimeNs].join("\0");
  return createHash("sha256").update(payload).digest("hex");
}

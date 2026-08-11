import type { RootKind } from "./constants.js";

export interface JsonRecord {
  [key: string]: unknown;
}

export interface RootIdentity {
  manifestVersion: number;
  rootId: string;
  label: string;
  kind: RootKind;
  createdAt: string;
  updatedAt: string;
  volumeMetadata: JsonRecord;
}

export interface FileManifestEntry {
  relativePath: string;
  fileType: "file";
  sizeBytes: string;
  mtimeNs: string;
  ctimeNs: string;
  birthtimeNs: string;
  mode: number;
  ino: string;
  dev: string;
  metadataFingerprint: string;
}

export interface RootManifest {
  manifestVersion: number;
  rootId: string;
  label: string;
  kind: RootKind;
  scannerVersion: string;
  createdAt: string;
  updatedAt: string;
  volumeMetadata: JsonRecord;
  scan: {
    scanRunId: string;
    scannedAt: string;
    filesSeen: number;
    errors: number;
  };
  files: FileManifestEntry[];
}

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

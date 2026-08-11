export const APP_DIR_NAME = ".media-manager";
export const IDENTITY_FILE_NAME = "identity.json";
export const MANIFEST_FILE_NAME = "manifest.json";
export const MANIFEST_VERSION = 1;

export const MEDIA_EXTENSIONS = new Set([
  ".3gp",
  ".arw",
  ".avi",
  ".cr2",
  ".cr3",
  ".dng",
  ".heic",
  ".jpeg",
  ".jpg",
  ".m4v",
  ".mov",
  ".mp4",
  ".mts",
  ".nef",
  ".orf",
  ".png",
  ".raf",
  ".rw2",
  ".tif",
  ".tiff",
  ".webm"
]);

export const ROOT_KINDS = ["device", "external", "backup", "cloud", "archive"] as const;
export type RootKind = (typeof ROOT_KINDS)[number];

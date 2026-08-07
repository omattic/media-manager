from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


MEDIA_EXTENSIONS = {
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
    ".webm",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def default_db_path() -> Path:
    return Path(
        os.environ.get(
            "MEDIA_MANAGER_DB",
            os.environ.get("PHOTO_SYSTEM_DB", "~/.local/share/media-manager/inventory.sqlite"),
        )
    ).expanduser()


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL CHECK (kind IN ('device', 'external', 'backup', 'cloud', 'archive')),
            root_path TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sha256 TEXT NOT NULL UNIQUE,
            size_bytes INTEGER NOT NULL,
            extension TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS file_copies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
            absolute_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            mtime_ns INTEGER NOT NULL,
            scanned_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'missing', 'deleted')),
            UNIQUE (location_id, absolute_path)
        );

        CREATE INDEX IF NOT EXISTS idx_file_copies_file_id ON file_copies(file_id);
        CREATE INDEX IF NOT EXISTS idx_file_copies_path ON file_copies(absolute_path);
        """
    )
    conn.commit()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_media_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in MEDIA_EXTENSIONS


def media_files(root: Path, include_all: bool) -> list[Path]:
    if root.is_file():
        return [root]
    files: list[Path] = []
    for path in root.rglob("*"):
        if path.is_file() and (include_all or is_media_file(path)):
            files.append(path)
    return files


def upsert_location(conn: sqlite3.Connection, label: str, kind: str, root: Path | None) -> int:
    now = utc_now()
    root_path = str(root.resolve()) if root else None
    conn.execute(
        """
        INSERT INTO locations (label, kind, root_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(label) DO UPDATE SET
            kind = excluded.kind,
            root_path = excluded.root_path,
            updated_at = excluded.updated_at
        """,
        (label, kind, root_path, now, now),
    )
    row = conn.execute("SELECT id FROM locations WHERE label = ?", (label,)).fetchone()
    if row is None:
        raise RuntimeError(f"failed to create location {label}")
    return int(row["id"])


def upsert_file(conn: sqlite3.Connection, path: Path, digest: str) -> int:
    now = utc_now()
    stat = path.stat()
    conn.execute(
        """
        INSERT INTO files (sha256, size_bytes, extension, first_seen_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(sha256) DO UPDATE SET
            size_bytes = excluded.size_bytes,
            extension = excluded.extension,
            updated_at = excluded.updated_at
        """,
        (digest, stat.st_size, path.suffix.lower(), now, now),
    )
    row = conn.execute("SELECT id FROM files WHERE sha256 = ?", (digest,)).fetchone()
    if row is None:
        raise RuntimeError(f"failed to create file record for {path}")
    return int(row["id"])


def upsert_copy(conn: sqlite3.Connection, file_id: int, location_id: int, path: Path, root: Path) -> None:
    now = utc_now()
    absolute = str(path.resolve())
    try:
        relative = str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        relative = path.name
    conn.execute(
        """
        INSERT INTO file_copies (file_id, location_id, absolute_path, relative_path, mtime_ns, scanned_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'present')
        ON CONFLICT(location_id, absolute_path) DO UPDATE SET
            file_id = excluded.file_id,
            relative_path = excluded.relative_path,
            mtime_ns = excluded.mtime_ns,
            scanned_at = excluded.scanned_at,
            status = 'present'
        """,
        (file_id, location_id, absolute, relative, path.stat().st_mtime_ns, now),
    )


@dataclass(frozen=True)
class Verification:
    digest: str
    total_present: int
    backup_present: int
    paths: list[str]

    def ok(self, min_copies: int, require_backup: bool) -> bool:
        if self.total_present < min_copies:
            return False
        if require_backup and self.backup_present < 1:
            return False
        return True


def verify_digest(conn: sqlite3.Connection, digest: str) -> Verification:
    rows = conn.execute(
        """
        SELECT c.absolute_path, l.kind
        FROM files f
        JOIN file_copies c ON c.file_id = f.id
        JOIN locations l ON l.id = c.location_id
        WHERE f.sha256 = ? AND c.status = 'present'
        ORDER BY l.kind, l.label, c.absolute_path
        """,
        (digest,),
    ).fetchall()
    return Verification(
        digest=digest,
        total_present=len(rows),
        backup_present=sum(1 for row in rows if row["kind"] in {"backup", "cloud", "archive"}),
        paths=[str(row["absolute_path"]) for row in rows],
    )


def cmd_init(args: argparse.Namespace) -> int:
    conn = connect(args.db)
    init_db(conn)
    print(f"Initialized inventory: {args.db}")
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    root = args.path.expanduser().resolve()
    if not root.exists():
        print(f"Path does not exist: {root}", file=sys.stderr)
        return 2
    conn = connect(args.db)
    init_db(conn)
    location_id = upsert_location(conn, args.label, args.kind, root if root.is_dir() else root.parent)
    files = media_files(root, args.all)
    for index, path in enumerate(files, start=1):
        digest = sha256_file(path)
        file_id = upsert_file(conn, path, digest)
        upsert_copy(conn, file_id, location_id, path, root if root.is_dir() else root.parent)
        if args.verbose:
            print(f"[{index}/{len(files)}] {digest} {path}")
    conn.commit()
    print(f"Scanned {len(files)} file(s) into {args.label}")
    return 0


def digest_for_input(path_or_hash: str) -> str:
    candidate = Path(path_or_hash).expanduser()
    if candidate.exists() and candidate.is_file():
        return sha256_file(candidate)
    if len(path_or_hash) == 64 and all(ch in "0123456789abcdefABCDEF" for ch in path_or_hash):
        return path_or_hash.lower()
    raise ValueError(f"not a file path or sha256: {path_or_hash}")


def cmd_copies(args: argparse.Namespace) -> int:
    conn = connect(args.db)
    init_db(conn)
    digest = digest_for_input(args.file_or_hash)
    verification = verify_digest(conn, digest)
    print(f"sha256: {verification.digest}")
    print(f"present copies: {verification.total_present}")
    print(f"backup/archive/cloud copies: {verification.backup_present}")
    for path in verification.paths:
        print(f"- {path}")
    return 0 if verification.total_present else 1


def cmd_verify(args: argparse.Namespace) -> int:
    conn = connect(args.db)
    init_db(conn)
    digest = digest_for_input(args.file)
    verification = verify_digest(conn, digest)
    ok = verification.ok(args.min_copies, args.require_backup)
    print(f"sha256: {verification.digest}")
    print(f"present copies: {verification.total_present}")
    print(f"backup/archive/cloud copies: {verification.backup_present}")
    print(f"required copies: {args.min_copies}")
    print(f"require backup/archive/cloud: {args.require_backup}")
    print(f"safe to delete: {'yes' if ok else 'no'}")
    for path in verification.paths:
        print(f"- {path}")
    return 0 if ok else 1


def cmd_delete(args: argparse.Namespace) -> int:
    target = args.file.expanduser().resolve()
    if not target.exists() or not target.is_file():
        print(f"File does not exist: {target}", file=sys.stderr)
        return 2
    conn = connect(args.db)
    init_db(conn)
    digest = sha256_file(target)
    verification = verify_digest(conn, digest)
    if not verification.ok(args.min_copies, args.require_backup):
        print("Refusing to delete; backup verification failed.", file=sys.stderr)
        print(f"present copies: {verification.total_present}")
        print(f"backup/archive/cloud copies: {verification.backup_present}")
        return 1
    if not args.yes:
        print(f"Verified, but not deleted without --yes: {target}")
        return 0
    target.unlink()
    now = utc_now()
    conn.execute(
        "UPDATE file_copies SET status = 'deleted', scanned_at = ? WHERE absolute_path = ?",
        (now, str(target)),
    )
    conn.commit()
    print(f"Deleted after verification: {target}")
    return 0


def copy_anything(source: Path, destination: Path) -> Path:
    if source.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        final = destination / source.name if destination.exists() and destination.is_dir() else destination
        shutil.copy2(source, final)
        return final
    if source.is_dir():
        destination.mkdir(parents=True, exist_ok=True)
        final = destination / source.name
        if final.exists():
            raise FileExistsError(f"destination already exists: {final}")
        shutil.copytree(source, final)
        return final
    raise FileNotFoundError(source)


def cmd_backup(args: argparse.Namespace) -> int:
    source = args.source.expanduser().resolve()
    destination = args.destination.expanduser().resolve()
    final = copy_anything(source, destination)
    conn = connect(args.db)
    init_db(conn)
    location_root = final if final.is_dir() else final.parent
    location_id = upsert_location(conn, args.label, args.kind, location_root)
    files = media_files(final, args.all)
    for path in files:
        digest = sha256_file(path)
        file_id = upsert_file(conn, path, digest)
        upsert_copy(conn, file_id, location_id, path, location_root)
    conn.commit()
    print(f"Backed up to: {final}")
    print(f"Recorded {len(files)} file(s) in {args.label}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="media-manager")
    parser.add_argument("--db", type=Path, default=default_db_path(), help="inventory SQLite path")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="initialize the inventory database")
    init_parser.set_defaults(func=cmd_init)

    scan_parser = subparsers.add_parser("scan", help="scan files into the inventory")
    scan_parser.add_argument("path", type=Path)
    scan_parser.add_argument("--label", required=True, help="location label, such as macbook or archive-drive-01")
    scan_parser.add_argument("--kind", default="device", choices=["device", "external", "backup", "cloud", "archive"])
    scan_parser.add_argument("--all", action="store_true", help="scan all files instead of known media extensions")
    scan_parser.add_argument("--verbose", action="store_true")
    scan_parser.set_defaults(func=cmd_scan)

    copies_parser = subparsers.add_parser("copies", help="list known copies for a file path or sha256")
    copies_parser.add_argument("file_or_hash")
    copies_parser.set_defaults(func=cmd_copies)

    verify_parser = subparsers.add_parser("verify", help="verify backup coverage for a file")
    verify_parser.add_argument("file")
    verify_parser.add_argument("--min-copies", type=int, default=2)
    verify_parser.add_argument("--require-backup", action="store_true")
    verify_parser.set_defaults(func=cmd_verify)

    delete_parser = subparsers.add_parser("delete", help="delete a file only after backup verification")
    delete_parser.add_argument("file", type=Path)
    delete_parser.add_argument("--min-copies", type=int, default=2)
    delete_parser.add_argument("--require-backup", action="store_true")
    delete_parser.add_argument("--yes", action="store_true", help="actually delete after verification")
    delete_parser.set_defaults(func=cmd_delete)

    backup_parser = subparsers.add_parser("backup", help="copy files to a destination and record the backup")
    backup_parser.add_argument("source", type=Path)
    backup_parser.add_argument("destination", type=Path)
    backup_parser.add_argument("--label", required=True)
    backup_parser.add_argument("--kind", default="backup", choices=["backup", "cloud", "archive", "external"])
    backup_parser.add_argument("--all", action="store_true", help="record all files instead of known media extensions")
    backup_parser.set_defaults(func=cmd_backup)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

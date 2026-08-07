# Media Manager

Central repository for managing photo and video inventory, backup verification, and safe deletion workflows across laptops, phones, external drives, and cloud/archive destinations.

## Goals

- Build a centralized yet distributed inventory of media files across devices and external drives.
- Identify files by content hash, not only by path.
- Track where each file exists and whether a copy is on a backup/archive location.
- Provide a CLI that can verify backup coverage before deleting local files.
- Make backup and restore workflows explicit, repeatable, and auditable.

## CLI MVP

Install locally:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
```

Run without installing:

```sh
PYTHONPATH=src python3 -m media_manager.cli --help
```

Initialize the inventory:

```sh
media-manager init
```

Scan a device or drive:

```sh
media-manager scan ~/Pictures --label macbook-pictures --kind device
media-manager scan /Volumes/ArchiveDrive --label archive-drive-01 --kind backup
```

Verify a file has backup coverage:

```sh
media-manager verify ~/Pictures/photo.jpg --min-copies 2 --require-backup
```

Delete only after verification:

```sh
media-manager delete ~/Pictures/photo.jpg --min-copies 2 --require-backup --yes
```

Copy files to a backup destination and record the destination:

```sh
media-manager backup ~/Pictures/Trip /Volumes/ArchiveDrive/Trip --label archive-drive-01
```

The default database path is:

```text
~/.local/share/media-manager/inventory.sqlite
```

Override it with:

```sh
MEDIA_MANAGER_DB=/path/to/inventory.sqlite media-manager scan /media/drive --label drive-01
```

## Design Notes

- [Architecture](docs/design/architecture.md)
- [Backup Safety Model](docs/design/backup-safety-model.md)

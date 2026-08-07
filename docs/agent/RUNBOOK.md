# Photo System Runbook

## Install

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
```

If `python3-venv` is unavailable, run directly from the checkout:

```sh
PYTHONPATH=src python3 -m photo_system.cli --help
```

## Smoke Test

```sh
PYTHONPATH=src python3 -m photo_system.cli --help
PYTHONPATH=src python3 -m photo_system.cli --db /tmp/photo-system-test.sqlite init
```

## Local Demo

```sh
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/source" "$tmpdir/backup"
printf 'sample image bytes' > "$tmpdir/source/example.jpg"
PYTHONPATH=src python3 -m photo_system.cli --db "$tmpdir/inventory.sqlite" init
PYTHONPATH=src python3 -m photo_system.cli --db "$tmpdir/inventory.sqlite" scan "$tmpdir/source" --label source-device
PYTHONPATH=src python3 -m photo_system.cli --db "$tmpdir/inventory.sqlite" backup "$tmpdir/source/example.jpg" "$tmpdir/backup" --label backup-drive
PYTHONPATH=src python3 -m photo_system.cli --db "$tmpdir/inventory.sqlite" verify "$tmpdir/source/example.jpg" --min-copies 2 --require-backup
```

## Publish

```sh
git status --short
git push origin main
```

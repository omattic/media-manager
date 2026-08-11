# Media Manager Runbook

## Current Python CLI

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
```

If `python3-venv` is unavailable, run directly from the checkout:

```sh
PYTHONPATH=src python3 -m media_manager.cli --help
```

## Smoke Test

```sh
PYTHONPATH=src python3 -m media_manager.cli --help
PYTHONPATH=src python3 -m media_manager.cli --db /tmp/media-manager-test.sqlite init
```

## Local Demo

```sh
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/source" "$tmpdir/backup"
printf 'sample image bytes' > "$tmpdir/source/example.jpg"
PYTHONPATH=src python3 -m media_manager.cli --db "$tmpdir/inventory.sqlite" init
PYTHONPATH=src python3 -m media_manager.cli --db "$tmpdir/inventory.sqlite" scan "$tmpdir/source" --label source-device
PYTHONPATH=src python3 -m media_manager.cli --db "$tmpdir/inventory.sqlite" backup "$tmpdir/source/example.jpg" "$tmpdir/backup" --label backup-drive
PYTHONPATH=src python3 -m media_manager.cli --db "$tmpdir/inventory.sqlite" verify "$tmpdir/source/example.jpg" --min-copies 2 --require-backup
```

## Publish

```sh
git status --short
git push origin main
```

## Planning Documents

```sh
sed -n '1,220p' docs/design/product-plan.md
sed -n '1,220p' docs/design/architecture.md
sed -n '1,220p' docs/design/backup-safety-model.md
```

When W7S sync service work starts, backend deploy verification must include a live `/health` response with `branch`, `commitHash`, and `deployedAt`.

## Planned TypeScript CLI

The next implementation should replace Python completely.

Expected local workflow after the TypeScript rebuild:

```sh
pnpm install
pnpm test
pnpm build
pnpm media-manager --help
```

Milestone one commands should be CLI-only and cron-friendly. Commands should support stable exit codes, non-interactive flags, resumable scans, idempotent writes, `--json`, and `--quiet`.

# Media Manager Runbook

## Install

```sh
corepack pnpm install
```

If pnpm prompts to approve native builds, approve `better-sqlite3` and `esbuild`.

## Smoke Test

```sh
corepack pnpm run check
corepack pnpm run test
corepack pnpm run build
node dist/cli.js --help
node dist/cli.js --db /tmp/media-manager-test.sqlite init
```

## Local Demo

```sh
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/source"
printf 'sample image bytes' > "$tmpdir/source/example.jpg"
node dist/cli.js --db "$tmpdir/inventory.sqlite" init
node dist/cli.js --db "$tmpdir/inventory.sqlite" register "$tmpdir/source" --label source-device --kind device
node dist/cli.js --db "$tmpdir/inventory.sqlite" scan source-device
node dist/cli.js --db "$tmpdir/inventory.sqlite" verify "$tmpdir/source/example.jpg"
node dist/cli.js --db "$tmpdir/inventory.sqlite" status --json
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

Milestone one commands are CLI-only and cron-friendly. Commands should support stable exit codes, non-interactive flags, resumable scans, idempotent writes, `--json`, and `--quiet`.

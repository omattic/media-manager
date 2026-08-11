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
git push omattic main
npm publish --access public
```

The npm package is `@omattic/media-manager`. Run `npm whoami` before publishing to confirm npm auth.

## GitHub Actions npm Publish

Workflow file: `.github/workflows/publish-npm.yml`

The workflow publishes `@omattic/media-manager` to the public npm registry. It runs on:

- Manual workflow dispatch.
- Pushing a tag that starts with `v`, such as `v0.1.0`.

Required setup:

1. Ensure the npm account or npm organization owns the `@omattic` scope.
2. Create an npm access token with publish permission for `@omattic/media-manager` or the `@omattic` scope.
3. In GitHub, open `omattic/media-manager`.
4. Go to Settings, Secrets and variables, Actions.
5. Add a repository secret named `NPM_TOKEN`.
6. Paste the npm token as the value.
7. Trigger the workflow manually, or create and push a release tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow uses Node 24, pnpm 10.15.0, `pnpm install --frozen-lockfile`, typecheck, tests, build, `npm pack --dry-run`, and then `npm publish --access public --provenance`.

If using npm trusted publishing instead of `NPM_TOKEN`, configure npm trusted publishing for:

- Organization or user: `omattic`
- Repository: `media-manager`
- Workflow filename: `publish-npm.yml`
- Allowed action: `npm publish`

Then remove the `NODE_AUTH_TOKEN` environment block from the publish step.

## Planning Documents

```sh
sed -n '1,220p' docs/design/product-plan.md
sed -n '1,220p' docs/design/architecture.md
sed -n '1,220p' docs/design/backup-safety-model.md
```

When W7S sync service work starts, backend deploy verification must include a live `/health` response with `branch`, `commitHash`, and `deployedAt`.

Milestone one commands are CLI-only and cron-friendly. Commands should support stable exit codes, non-interactive flags, resumable scans, idempotent writes, `--json`, and `--quiet`.

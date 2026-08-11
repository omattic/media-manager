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

The workflow publishes `@omattic/media-manager` to the public npm registry through npm trusted publishing. It runs on:

- Manual workflow dispatch.
- Pushing a tag that starts with `v`, such as `v0.1.0`.

Trusted publishing setup:

1. Ensure the npm account or npm organization owns the `@omattic` scope.
2. Ensure `@omattic/media-manager` exists on npm.
3. In npm package settings, configure trusted publishing for:
   - Organization or user: `omattic`
   - Repository: `media-manager`
   - Workflow filename: `publish-npm.yml`
   - Allowed action: `npm publish`
4. Trigger the workflow manually, or create and push a release tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow uses Node 24, pnpm 10.15.0, `pnpm install --frozen-lockfile`, typecheck, tests, build, `npm pack --dry-run`, and then `npm publish --access public --provenance`.

Trusted publishing note:

npm trusted publishing is configured from package settings, so the package must already exist on npm before trusted publishing can be attached. For a brand-new package, bootstrap the first publish with one of these:

- Manual local publish from an npm account that owns the `@omattic` scope:

```sh
npm login
npm publish --access public
```

- GitHub Actions publish using `NPM_TOKEN`, where the token has publish rights and bypass 2FA enabled.

After `@omattic/media-manager` exists on npm, switch to trusted publishing:

- Organization or user: `omattic`
- Repository: `media-manager`
- Workflow filename: `publish-npm.yml`
- Allowed action: `npm publish`

Token fallback:

If trusted publishing is not available, add a GitHub repository secret named `NPM_TOKEN` and add this environment block to the publish step:

```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Planning Documents

```sh
sed -n '1,220p' docs/design/product-plan.md
sed -n '1,220p' docs/design/architecture.md
sed -n '1,220p' docs/design/backup-safety-model.md
```

When W7S sync service work starts, backend deploy verification must include a live `/health` response with `branch`, `commitHash`, and `deployedAt`.

Milestone one commands are CLI-only and cron-friendly. Commands should support stable exit codes, non-interactive flags, resumable scans, idempotent writes, `--json`, and `--quiet`.

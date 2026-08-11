# Media Manager State

Created on 2026-08-07 as `/home/gnu/media-manager` and published to `github.com/guerrerocarlos/media-manager`.

Current repository state:

- Local repo: `/home/gnu/media-manager`
- GitHub remote: `https://github.com/omattic/media-manager.git`
- Telegram manager topic: `media-manager` topic id `8862`, runtime binding id `121`, chat id `-1003996402615`
- Primary package: TypeScript CLI package `media-manager`
- npm package name: `@omattic/media-manager`
- npm publication is wired through `.github/workflows/publish-npm.yml`.
- CLI entrypoint: `media-manager`
- Default inventory DB: `~/.local/share/media-manager/inventory.sqlite`

Current product state:

- Python has been removed.
- The CLI is implemented in TypeScript for Node.js with `pnpm`.
- Local SQLite storage uses `better-sqlite3`.
- The CLI supports `init`, `register`, `roots`, `scan`, `status`, `report`, `verify`, and `manifest`.
- Inventory is SQLite-backed and local-first.
- Managed roots are writable folders or drives with `.media-manager/`.
- Normal scans use filesystem metadata only and do not read media file contents.
- Milestone one does not include deletion or cleanup commands.

Active product direction:

- The project should manage all personal media, mainly photos and videos, across distributed storage locations.
- The implementation should stay TypeScript-only.
- Use `better-sqlite3` for local SQLite storage.
- Support macOS and Linux first.
- Build only a CLI, designed so cron can run it later without prompts.
- Each device should keep its own local SQLite database.
- W7S sync comes after the non-centralized local workflow is solid.
- Managed roots must be writable and contain a `.media-manager/` folder.
- Normal scans should use filesystem-provided metadata only and should not read media file contents.
- Future `deep-verify` may read selected files only when stronger proof is needed.
- Milestone one should not include deletion or cleanup commands.
- The current plan is documented in `docs/design/product-plan.md`.

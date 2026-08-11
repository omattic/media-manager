# Media Manager State

Created on 2026-08-07 as `/home/gnu/media-manager` and published to `github.com/guerrerocarlos/media-manager`.

Current repository state:

- Local repo: `/home/gnu/media-manager`
- GitHub remote: `https://github.com/guerrerocarlos/media-manager.git`
- Telegram manager topic: `media-manager` topic id `8862`, runtime binding id `121`, chat id `-1003996402615`
- Primary package: Python CLI package `media-manager`
- CLI entrypoint: `media-manager`
- Default inventory DB: `~/.local/share/media-manager/inventory.sqlite`

Current product state:

- Initial MVP CLI supports `init`, `scan`, `copies`, `verify`, `delete`, and `backup`.
- Inventory is SQLite-backed and local-first.
- Files are identified by SHA-256 content hash.
- Safe deletion requires backup verification and explicit `--yes`.

Active product direction:

- The project should manage all personal media, mainly photos and videos, across distributed storage locations.
- The next implementation should remove Python completely and rebuild the CLI in TypeScript for Node.js with `pnpm`.
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

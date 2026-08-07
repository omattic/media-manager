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
- The target architecture is local SQLite for day-to-day inventory and cleanup plus synchronized inventory storage in W7S.io.
- The CLI should remain the authority for inventory management, deletion, and cleanup because it can verify local filesystem state before destructive actions.
- The desired safety bar is at least two independent backup/storage locations before cleanup is allowed.
- The current plan is documented in `docs/design/product-plan.md`.

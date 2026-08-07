# Media Manager State

Created on 2026-08-07 as `/home/gnu/media-manager` and published to `github.com/guerrerocarlos/media-manager`.

Current repository state:

- Local repo: `/home/gnu/media-manager`
- GitHub remote: `git@github.com:guerrerocarlos/media-manager.git`
- Primary package: Python CLI package `media-manager`
- CLI entrypoint: `media-manager`
- Default inventory DB: `~/.local/share/media-manager/inventory.sqlite`

Current product state:

- Initial MVP CLI supports `init`, `scan`, `copies`, `verify`, `delete`, and `backup`.
- Inventory is SQLite-backed and local-first.
- Files are identified by SHA-256 content hash.
- Safe deletion requires backup verification and explicit `--yes`.

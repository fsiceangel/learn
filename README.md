# Learning Garden

[learn.sorapinkice.top](https://learn.sorapinkice.top/)

A shared home for Chinese poetry, MathQuest and Chess Puzzle Training.

- `/gushi/` — 古诗词学堂
- `/math/` — MathQuest
- `/chess/` — Chess Puzzle Training
- `/saves/` — local-only `.sav` backup and migration

The three apps retain their own data models and repositories. Build inputs are
pinned in `sources.json`. Clone them into `vendor/<app>/`, check out the pinned
revision and run `npm ci` in each, then `npm run build` in this repository.
`LEARN_BASE=/learn/` builds for GitHub Pages' fallback project path.

Save files include both MathQuest results and unfinished rounds, and the full
Chess save. Family Sync credentials are deliberately excluded. Import never
clears the old website: export on the old address, then import on the new one.
No personal save is stored in this repository or uploaded by the backup page.

Existing application content and artwork retain their original attribution.

# Learning Garden

[learn.sorapinkice.top](https://learn.sorapinkice.top/)

| Repository | Purpose |
| --- | --- |
| [learn](https://github.com/fsiceangel/learn) | Shared home, saves and production build |
| [mathquest](https://github.com/fsiceangel/mathquest) | Math practice |
| [chess-puzzle-training](https://github.com/fsiceangel/chess-puzzle-training) | Chess practice |
| [gushi](https://github.com/fsiceangel/gushi) (private) | Chinese poetry |

```sh
npm run build
npm test
npm run validate
```

Builds use only the pinned GitHub revisions in `sources.json`, prepared under
`.cache/sources/`; adjacent working copies are never used. Git access to the private
gushi repository is required. Dirty or mismatched caches are left untouched and rejected.
`npm run prepare:sources -- --app chess` prepares only the test source.
`LEARN_BASE=/learn/` supports the fallback path; the default publishes at the custom domain.

Save files preserve MathQuest progress and unfinished rounds plus the full Chess save.
Family Sync credentials are excluded. Existing content and artwork retain their attribution.

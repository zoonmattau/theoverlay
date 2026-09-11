# design-sync notes

Repo-specific facts for syncing Overlay to claude.ai/design. Read before re-syncing.

## How this repo is shaped

- This is a Next.js app, not a component library. There is no `dist/`. `.design-sync/build.mjs` (the `buildCmd`) assembles a synthetic package under `.design-sync/dist/` (gitignored): a named `package.json`, an `index.js` barrel over `src/components/*.tsx`, `tsc` declarations under `types/` with `@/` aliases rewritten to relative paths plus an `index.d.ts` barrel, the compiled stylesheet `overlay.css`, and `docs/data-shapes.md`. Pass `--entry .design-sync/dist/index.js`; the converter walks up to that package.json, so every path in config.json is relative to `.design-sync/dist/` (hence the `../` prefixes).
- The converter's synth-entry mode (no `--entry`) would also pull in `src/app/**` pages, which import `server-only` and `next/font`. Always run `buildCmd` first and pass the entry.
- `next/link` is aliased to `.design-sync/shims/next-link.tsx` (a plain `<a>`) through the `paths` map in `.design-sync/tsconfig.json`. The converter's tsconfig-paths plugin does not follow `extends`, so that file repeats the `@/*` alias.
- CSS: `src/app/globals.css` is Tailwind v4 source. `build.mjs` compiles it with `@tailwindcss/postcss` scanning the repo, so only utilities the app uses are emitted. `build.mjs` also appends `:root { --font-archivo; --font-plex }`, the variables `next/font` would set on `<html>`; without them every `font-family` that reads them is discarded.
- Fonts: Archivo (variable, 100-900) and IBM Plex Mono 400/500/600/700, latin subsets, fetched once from Google Fonts (SIL OFL) into `.design-sync/fonts/` and committed. Re-fetch only if the app adds weights or subsets.
- `.d.ts` bodies reference `PublishedRace`, `PublishedMeeting`, `Selection`, `Play`, `RunnerRatings` without defining them (the extractor leaves cross-file names bare). The shapes ship as `guidelines/docs/data-shapes.md`, generated from `src/lib/model/types.ts` by `build.mjs`.
- Previews use `.design-sync/previews/_data.ts`, which runs the real fixture card (`fixtureMeetings` + `publishMeeting` + `selectBestBets`) so sample data tracks the model. Stories that need a specific state (tempo, confidence, no picks) spread over that data rather than relying on what the fixture happens to produce.
- Preview cards paint a white body; every story wraps in `.design-sync/previews/_frame.tsx` (`Frame`) to restore the graphite ground, matching how the app paints `<body>`.
- Wide components (tables, matrix, panel, selection grid, next-to-go strip) use `cardMode: column`.
- Playwright: the cached chromium build is 1243; `.ds-sync/` installs `playwright` whose `browsers.json` pins that build. If the cache changes, match the playwright version to it.

## Known render warns

- None recorded. All 19 components have authored previews.

## Re-sync risks

- `src/components/` was being actively edited during the first sync (files added and renamed mid-run). Re-check the component count against `ls src/components` and author previews for anything new (it ships as a floor card until then).
- `_data.ts` imports `@/lib/formking/fixtures` and `@/lib/model/publish`. If either moves or gains a `server-only` import, every data-driven preview fails to compile and drops to the floor card. The build log names the failing import.
- Story names describe states the data was forced into (`FastTempo`, `NoPicks`, `OverlayOfTheDay`). `race` in `_data.ts` is chosen by shape (four ranked runners and a signal); if the model stops producing that, it falls back to the first race and some stories lose their contrast.
- `MatrixCell`, `NtgCountdown` and `NextToGo` previews compute jump times from `Date.now()`, so their text differs per render by design. Grades key off the source, not the render.
- Tailwind emits only used utilities. A new class used in a preview but not in the app will not exist in the bundle; use inline `style` with tokens or add it to the app.
- The conventions header enumerates classes and tokens from `_ds_bundle.css`; re-run its validation pass after CSS changes (the base skill describes the grep).
- Node 24 and the repo's pinned `next@16.3.4`, `tailwindcss@4.3.3`, `typescript@5` were used. `tsc` declaration emit runs against the repo tsconfig; type errors in `src/components` print but still emit.

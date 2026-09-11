## How to build with Overlay

Overlay is a dark-only racing terminal: graphite ground, paper text, IBM Plex Mono everywhere, Archivo for headings and the wordmark. Acid lime marks value, profit and the top pick, and nothing else. Never use lime for decoration.

### Setup

No provider. Load `styles.css` and `_ds_bundle.js`; components come from `window.Overlay.*`. `styles.css` paints `body` graphite (`--color-bg`) and sets the mono face, so put components straight on the page body or inside a `.card`. If you render into a white container the text (paper white, `--color-ink`) disappears.

Links render as plain `<a href>`: pass `href` strings (`/racing/<date>/<meetingId>/<raceId>`), there is no router.

### Data

`RunnerTable`, `RatingsTable`, `PaceGrid`, `RacePanel`, `RaceConfidence` take a `race: PublishedRace`; `RaceMatrix` and `NextToGo` take `meetings: PublishedMeeting[]` and `date`; `SelectionCard` takes `s: Selection`; `RacePanel` also takes `plays: Play[]`; `RatingTiles` takes `r: RunnerRatings` and `par`. The full shapes are in `guidelines/docs/data-shapes.md`. Ratings are benchmark points (a BM64 horse rates about 64, Group 1 about 120), never percentages. Prices are decimal odds (`ratedPrice: 3.66`), probabilities 0-1, `edge` is a fraction (`0.12` = +12%). `rank` is 1-4 for the top four, otherwise `null`.

### Styling idiom

Semantic classes from `_ds_bundle.css` do the layout work; Tailwind utilities only exist for the classes the app already uses (read `_ds_bundle.css`, an unlisted utility silently does nothing). For anything else use inline `style` with the tokens.

| Family | Classes |
|---|---|
| Surfaces | `.card`, `.card-hover`, `.panel-head` (with an `h2`), `.page`, `.topbar`, `.topbar-brand`, `.topbar-link` |
| Badges | `.badge` + `.badge-accent` / `.badge-muted` / `.badge-ok` / `.badge-warn` / `.badge-back` / `.badge-lay` |
| Buttons | `.btn` + `.btn-primary` (lime) / `.btn-secondary` |
| Tables | `.data-table` on a `<table>`; `.matrix-wrap` > `.matrix-table` for the race grid |
| Stats | `.stat` > `.stat-label` + `.stat-value` |
| Tabs | `.tabs` > `.tab` (+ `.tab-count`) |
| Numbers | `.nums` on anything numeric (tabular figures) |
| Text colour | `text-ink`, `text-ink-secondary`, `text-ink-soft`, `text-muted`, `text-accent`, `text-red` |
| Background | `bg-panel`, `bg-panel-alt`, `bg-surface`, `bg-bg-soft` |
| Border | `border-line`, `border-line-strong` |
| Type | `font-display` for headings, `text-xs` / `text-sm` / `text-lg` / `text-xl` / `text-2xl` |
| Loading / empty | `.skeleton`, `.empty-state` |

Tokens (all on `:root` in `_ds_bundle.css`): ground `--color-bg`, `--color-bg-soft`, `--color-panel`, `--color-panel-alt`, `--color-surface`, `--color-surface-alt`; text `--color-ink`, `--color-ink-secondary`, `--color-ink-soft`, `--color-muted`; lines `--color-line`, `--color-line-strong`; signal `--color-accent`, `--color-accent-dim`, `--color-green`, `--color-red`, `--color-amber`; fonts `--font-mono`, `--font-display`; spacing `--sp-1` (4px) to `--sp-6` (32px); radii `--radius-sm`, `--radius-md`, `--radius-lg`.

Colour rules: lime = value, profit, top pick, brand. Red = lay only. Amber = caution (imminent jump, hot tempo, low confidence). Everything else stays on the ink and surface scale.

### Where the truth lives

`_ds_bundle.css` (tokens, semantic classes, the compiled utilities), `guidelines/docs/data-shapes.md` (types), `components/general/<Name>/<Name>.prompt.md` (props + examples).

### Idiomatic snippet

```jsx
const { RaceConfidence, PaceGrid, RunnerTable } = window.Overlay;

<div className="page space-y-4">
  <header className="card">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">
        Randwick <span className="text-ink-secondary">R{race.raceNumber}</span>
      </h1>
      <RaceConfidence race={race} />
    </div>
  </header>
  <PaceGrid race={race} />
  <RunnerTable race={race} />
</div>
```

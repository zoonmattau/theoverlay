# Claude Design prompt: Saturday wrap graphics

Paste everything below the line into Claude Design, then paste `saturday-wraps.md` after it as the data.

---

Design an Instagram template for The Overlay (theoverlay.com.au), an Australian horse racing ratings service, called the Saturday Wrap. Every Saturday we publish every bet and lay the model called on the day's card and how each one went. Some Saturdays are up, some are down, and the post says so plainly. The graphic has to make a losing day look as considered as a winning one. It is a ledger, not a celebration.

Brand system, use it exactly.
- Page #f3f4f0, panels #ffffff, ink #14161a, secondary ink #454a44, soft ink #6b716a, rules #dfe3db.
- Graphite bar #14161a with paper text #f5f7f2. Lime #c6f24e is the wordmark. On white, lime text uses the darker cut #6f9a12.
- Call colours never change: lime = Prime Overlay and Overlay of the Day, blue #1f6fd6 = bet, red #d93636 = lay. Use them as small solid chips on each row, never as background washes.
- Type: Archivo for everything, IBM Plex Mono for prices, units and numbers, tabular numerals so the columns line up.
- Radius 8px, one soft shadow, no gradients, no emoji, no photos, no horse illustrations, no confetti, no trophies.
- Copy is terse. One sentence explanations. Never an em dash. Units are written +7.50u and −1.00u with a real minus sign. Results are Won, 2nd, 3rd, 5th, Unplaced.
- Wordmark top left, theoverlay.com.au bottom right, small. A small "Backtest" tag under the date for these dated 1 Aug to 12 Sep 2026, so the record is honestly labelled. Live wraps from 19 Sep will drop the tag.

Formats. 1080 x 1350 feed and 1080 x 1920 story, 80px safe margins. A Saturday card has 30 to 60 rows, so the feed version is a carousel: slide one is the summary, slides two onward are the ledger at about 12 rows a slide, last slide is the season to date. The story version is the summary only.

Slide one, the summary.
- Eyebrow: "Saturday Wrap", then the date.
- Three tiles across: Bets (placed, won, units), Lays (placed, held, units), Day (net units). The Day tile is the biggest. When the day is negative the tile is plain white with the number in ink. When positive it is graphite with the number in lime. Never red for a losing day, the ledger rows already carry red for lays.
- Under the tiles, one line: "Best result: Power Hit won at $16, Toowoomba R6" when there was a winner, otherwise "No winners on the day."
- Footer: "Every call we made, settled at the price before the jump, one unit a bet."

Ledger slides.
- A table: chip, race, runner with saddlecloth number, price, rated, result, units. The chip is the call type. Winning rows and held lays get their units in the darker lime; losing rows in soft ink. Rows never change background colour.
- Header row repeats on every slide, small page marker bottom centre like "2 of 5".
- Group bets first, then lays, matching the data order.

Last slide, season to date.
- Same three tiles: Bets, Lays, Net, with the totals from the "Season to date" section. Under it a seven column strip, one column per Saturday, a small bar for bets and a small bar for lays, above or below a baseline, labelled with the date. Negative bars are ink, positive bars are lime, lay bars a shade lighter than bet bars.
- One line: "Seven Saturdays. Everything published, nothing left out."

Rules on the data. Use only the rows in the record, every row, no trimming. Do not invent a horse, a price or a result. Do not reorder to put winners first. If a table row does not fit, add a slide. Build Saturday 1 August first (the best day, 59 bets and 15 lays) and Saturday 5 September (the worst, −24.90u on bets) so I can see both moods before the rest.

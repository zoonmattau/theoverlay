# Shot list: Saturday's big day and Tempted's 163.5

All 1920x1080. `site` = framed screenshot of theoverlay.com.au (dev, 5 Oct 2026), every tips row at full strength. Lime boxes mark what to point at.
Race footage (yours) slots in at section 6, after 10, and over 11.
The webcam corner (x 1460 and up, y 800 and up) is background only on every slide, and the logo sits bottom-left. Zone-outlined copies are in check/; `zone.mts` lists anything that strays into it.

| File | Script section | What to point at on screen |
|---|---|---|
| 01-headline-best-day.png (site) | 1. Open | The +47.64 tile on Saturday's tips page, boxed. Line: best day since launch. |
| 02-day-in-numbers-and-winners.png (card) | 2. Headline, 3. Winners | Bets +31.5u, Lays +16.1u, the day +47.6u, then the seven winners with our price and the price each won at. |
| 03-site-bets-seven-winners.png (site) | 3. Big winners | The seven WON rows from the tips page. Boxed: Bodmin Moor, market $17.56 against our $7.30. Strip: 29 others lost, average bet $7.73. |
| 04-site-bodmin-moor.png (site) | 3. Big winners | Gold Coast R1 result, Bodmin Moor 1st at $17.56, boxed. Rated $7.30, +16.6u. |
| 05-site-shadow-eagle-easy-love.png (site) | 3. Big winners | Murray Bridge R4 and Eagle Farm R6 results, each winner boxed. $7.40 to $11.00, +10.0u; $7.20 to $9.63, +8.6u. |
| 06-lays.png (card) | 4. The lays | 77%: 52 laid, 40 beaten. The dot grid, 40 lime and 12 red. The four that hurt. |
| 07-keep-it-honest.png (card) | 5. Keep it honest | 7 winners against about 6 expected, 12 lays won against 17 or 18. The last four Saturdays: +19.6, −22.3, +23.0, +47.6. |
| 08-site-tempted-result.png (site) | 6. Tempted | Randwick R9 result, Tempted 1st, boxed. Won by 2.98 lengths. |
| 09-site-tempted-rating-and-price.png (site) | 6. Rating and price | The rankings with Tempted's 163.5 row boxed, the next best 128.3. Tile on the right: best since launch, next best Cormier 151.5. Strip under the rankings: ours $1.60 against market $1.65, no bet. |
| 10-site-speed-map-what-to-watch.png (site) | 6. Race shape | Speed map with Tempted boxed in midfield. What to watch: "Best closing sectionals in the field", boxed. Callouts on the right: fast tempo, Tempted midfield, could he hold off Marhoona. |
| 11-tempted-sectionals.png (card) | 6. How he ran | Settled 9th, 10th at the 400, won by 2.98L, last 600 +7.2L, against six rivals. Panel "Pace: fast, as we called it": Mazu led at the 800 and 400 and faded to 10th; only Savvy Hallie held on from the front, 2nd; Tempted came from 10th at the 400. |
| 12-close.png (card) | 7. Close | Guineas Sat 10 Oct, The Everest and the Caulfield Cup Sat 17 Oct, free trial, 18+ line. |

The race data has positions at the settle, 800 and 400, and no 600 position.

To rebuild, from the repo root: `npx tsx --env-file=.env.local marketing/youtube/2026-10-05-saturday-tempted/graphics/shoot-site.mts` reshoots the site into raw/, then crop with the snippet notes in raw/ (c-*.png), then `npx tsx marketing/youtube/2026-10-05-saturday-tempted/graphics/shoot-graphics.mts` renders graphics.html.

# Ad setup, 23 September 2026

**Display link (all ads):** `theoverlay.com.au`

**Destination URLs** below. The site reads `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content` and `utm_term` on arrival and writes them to the member's profile, so each
signup shows the ad that brought it in admin under Campaign.

Paste the URL into Website URL, and `theoverlay.com.au` into Display Link.

## core

| Ad | Website URL |
|---|---|
| `call` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=core&utm_content=call` |
| `map` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=core&utm_content=map` |
| `board` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=core&utm_content=board` |
| `price` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=core&utm_content=price` |
| `record` | `https://theoverlay.com.au/tips?utm_source=meta&utm_medium=paid&utm_campaign=core&utm_content=record` |

## bookies

| Ad | Website URL |
|---|---|
| `beat` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=bookies&utm_content=beat` |
| `edge` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=bookies&utm_content=edge` |
| `priced` | `https://theoverlay.com.au/method?utm_source=meta&utm_medium=paid&utm_campaign=bookies&utm_content=priced` |
| `pass` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=bookies&utm_content=pass` |
| `opinion` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=bookies&utm_content=opinion` |

## spring

| Ad | Website URL |
|---|---|
| `springNow` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=spring&utm_content=springNow` |
| `springSaturday` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=spring&utm_content=springSaturday` |
| `springPriced` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=spring&utm_content=springPriced` |
| `springCrowd` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=spring&utm_content=springCrowd` |
| `springReady` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=spring&utm_content=springReady` |

## app

| Ad | Website URL |
|---|---|
| `terminal` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=app&utm_content=terminal` |
| `everyrace` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=app&utm_content=everyrace` |
| `tipsters` | `https://theoverlay.com.au/tips?utm_source=meta&utm_medium=paid&utm_campaign=app&utm_content=tipsters` |
| `tipsterRecord` | `https://theoverlay.com.au/tips?utm_source=meta&utm_medium=paid&utm_campaign=app&utm_content=tipsterRecord` |

## problem

| Ad | Website URL |
|---|---|
| `heart` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=problem&utm_content=heart` |
| `mate` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=problem&utm_content=mate` |
| `bookietips` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=problem&utm_content=bookietips` |
| `name` | `https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=problem&utm_content=name` |

## Notes

**Landing page.** Most ads land on the board, which is the thing they just showed you.
The tipster ads and the record ad land on `/tips`, and the method ad on `/method`, so the
click lands on the page the ad was about. Worth testing `/pricing` as an alternative for
the offer-led ads once there is traffic to split.

**Placement in utm_term.** Add `&utm_term=square`, `portrait` or `story` per creative if
you want placement in the data as well as the ad.

**Display link** stays the bare domain on every ad. A display link that does not match the
destination domain gets ads rejected, so do not put a path in it.

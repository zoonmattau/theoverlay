# Launch sheet, five ads

One campaign, one ad set, five ads. Each ad is a different argument, so the first round
tells you which message works before you spend anything optimising wording inside it.

Same on every ad:

- **Display link:** `theoverlay.com.au`
- **CTA:** Learn more
- **Media:** the three ratios from the folder, assigned with *Edit per placement*
  (`-portrait` to feed, `-story` to Stories and Reels, `-square` to the rest)

---

## 1. price — the market

`marketing/ads/2026-09-23/core/price-{portrait,story,square}.png`

**Primary text**
> Every runner in the race gets a rating and a price of our own. Where a bookie is paying more than the horse is worth, that is the bet. Every race, every day.

**Headline**
> Find the prices the bookies got wrong

**Description**
> The edge on every runner

**Website URL**
```
https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=core&utm_content=price
```

## 2. terminal — the app

`marketing/ads/2026-09-23/app/terminal-{portrait,story,square}.png`

**Primary text**
> Every meeting and every race on one board, coloured by the call. Blue where we back one, red where we lay one, white where the price is fair.

**Headline**
> The whole day on one screen

**Description**
> Your racing terminal

**Website URL**
```
https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=app&utm_content=terminal
```

## 3. bookietips — who is tipping you

`marketing/ads/2026-09-23/problem/bookietips-{portrait,story,square}.png`

**Primary text**
> A bookie preview is an ad. The horse they push is the one they want the money on, at the price that suits them. We rate every runner and price it ourselves, so you can check theirs against ours.

**Headline**
> The bookie's tipster works for the bookie

**Description**
> A second opinion on the price

**Website URL**
```
https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=problem&utm_content=bookietips
```

## 4. pass — when to sit out

`marketing/ads/2026-09-23/bookies/pass-{portrait,story,square}.png`

**Primary text**
> In 25 of today's 37 races no price was worth taking. Your bookie would rather you had a go at all of them. We rate every runner so you know which races to leave alone.

**Headline**
> Most races, we tell you not to bet

**Description**
> Know which races to skip

**Website URL**
```
https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=bookies&utm_content=pass
```

## 5. mate — where your tips come from

`marketing/ads/2026-09-23/problem/mate-{portrait,story,square}.png`

**Primary text**
> We rate every run on sectional time, class and tempo, then put a price on it. The mail down the pub does neither.

**Headline**
> Your mate has not done the sectionals

**Description**
> Tips with the numbers behind them

**Website URL**
```
https://theoverlay.com.au/?utm_source=meta&utm_medium=paid&utm_campaign=problem&utm_content=mate
```

---

## Before you publish

**Identity.** Every ad needs a Facebook Page, and an Instagram account linked to it for the
Instagram placements. If the Page does not exist yet, nothing will publish.

**One text per ad this round.** Meta will let you load five headlines and five primary
texts per ad. Do not, yet. With five different arguments running, mixing five headlines
into each means twenty-five combinations and no clean read on which argument worked. Pick
the winner first, then test wording inside it.

**Check the pixel.** `CompleteRegistration` fires on the `?registered=1` redirect after
signup. Confirm in Events Manager that it has actually been received, or the ad set has
nothing to optimise towards.

**The numbers in `pass` date.** It quotes 25 of 37 races from 23 September. Re-run
`scripts/meta-ads.ts` before a new flight and update the primary text to match, or reword
it to "most races" with no count.

## What we cannot say

No profit, ROI or strike-rate claim appears in any of this, and none should. The settled
ledger is 449 calls at -6.5%, bets alone at -16.0%.

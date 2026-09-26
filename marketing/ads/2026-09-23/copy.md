# Meta ads, 23 September 2026

Ten concepts, each rendered at 1:1 (`square`), 4:5 (`portrait`) and 9:16 (`story`).
Thirty images: five built from type and data, five built around real screenshots of the
app. Rebuild with:

```
npx tsx --conditions=react-server --env-file=.env.local scripts/meta-ads.ts <date>
```

Every number is read from the card and the ledger at render time. **No concept makes a
profit, return or strike-rate claim.** See "What we cannot say" at the bottom.

Each concept below carries five headlines, five primary texts and five descriptions. Meta
will mix them, so load all five of each into the ad and let it find the pair that works.
The headline burned into the image is the concept's own line; to test a different one in
the artwork, edit that concept's `h1` in `scripts/meta-ads.ts` and re-render.

---

## 1. Rated — the product

Dark. The cold-audience opener: it says what the thing is in one line.
Files: `rated-square.png`, `rated-portrait.png`, `rated-story.png`

**Headlines**
1. Every runner rated
2. All 377, not just the tips
3. A rating for every horse
4. We rate the whole field
5. Every race, every runner

**Primary text**
1. Every runner in every race gets a benchmark rating and a price, not just the ones we fancy. 377 rated today across five meetings.
2. Most services hand you three selections. We rate all 377 runners on today's card and show you the working.
3. A benchmark rating and our own price for every horse in the race. You decide what to do with it.
4. Thirty-seven races today. Every runner in every one of them rated, priced and laid out side by side.
5. You cannot judge a selection without the rest of the field. So we rate the rest of the field.

**Descriptions**
1. A rating and a price for all
2. Every runner on the card
3. See the whole field rated
4. 377 rated today
5. The full card, priced

## 2. Record — the trust play

Light. The differentiator. Most tipping accounts show winners only; this shows the lot.
Files: `record-square.png`, `record-portrait.png`, `record-story.png`

**Headlines**
1. Every call, in the open
2. We publish the losers too
3. 491 calls, all on the record
4. No deleted tips
5. Judge the whole record

**Primary text**
1. We publish every call and settle it in the open, win or lose. 491 so far, every one still there to read.
2. Anyone can post their winners. Our losers are on the same page, at the price we called them, settled the same way.
3. 491 calls published and settled where you can check them. Nothing quietly removed when it runs last.
4. Every bet and lay goes on the record the moment it is published, and stays there after the race.
5. Judge us on the whole record, not the highlights. It is all on one page.

**Descriptions**
1. Read the full record
2. Winners and losers both
3. Every call, still there
4. Settled in the open
5. Check it yourself

## 3. Overlay — the idea

Light. For people who do not know the word. Carries a real call off the day's card.
Files: `overlay-square.png`, `overlay-portrait.png`, `overlay-story.png`

**Headlines**
1. You bet the gap
2. What is an overlay?
3. Only when the price is wrong
4. Our price against theirs
5. The market is the opponent

**Primary text**
1. We rate the horse and price it ourselves. When the market is longer than our price, that gap is the overlay. It is the only time we bet.
2. Shultzy rates $5.30 with us. The market wants $7.00. That gap is the whole idea.
3. A good horse at a bad price is a bad bet. We only call one when the market is paying more than the horse is worth.
4. Two prices on every runner: ours and the market's. You bet the difference, or you pass.
5. We are not trying to pick winners. We are trying to find prices that are wrong.

**Descriptions**
1. How an overlay works
2. Our price against the market
3. Only when the price is wrong
4. See today's gaps
5. Value, not tips

## 4. Free — the offer

Dark. Lowest friction, the only sign-up CTA. Expect this to carry the spend.
Files: `free-square.png`, `free-portrait.png`, `free-story.png`

**Headlines**
1. One free race, every day
2. Start with no card
3. Free race, no signup cost
4. Try it on one race
5. A free race a day

**Primary text**
1. One race a day, free. Full ratings, the speed map and our call on it. No card, nothing to cancel.
2. Pick a race. We will show you every runner rated, the speed map and where we think the price is wrong. Free, every day.
3. No trial to remember to cancel. One race a day is free and stays free.
4. See the whole thing working on one race before you decide whether the rest is worth anything.
5. Full access to one race, every single day, without handing over a card.

**Descriptions**
1. Start with no card
2. Nothing to cancel
3. Free every day
4. See it on one race
5. No card needed

## 5. Method — how it works

Light. For the punter who wants to know what is under it.
Files: `method-square.png`, `method-portrait.png`, `method-story.png`

**Headlines**
1. Every run, six numbers
2. Rated on sectionals
3. Not one number, six
4. The benchmark scale you know
5. How we rate a run

**Primary text**
1. Early, mid, late, pressure, tempo and going. Six ratings for every run, with the sectional times behind them.
2. One overall figure hides everything. We split every run into six, so you can see where a horse actually did its work.
3. On the benchmark scale you already read. A BM64 horse rates about 64, no invented hundred-point index.
4. Sectional times, tempo and track condition, turned into six numbers you can compare across the field.
5. We rate the run, not the result. A horse can be beaten and still rate the best in the race.

**Descriptions**
1. Six ratings a run
2. Built on sectionals
3. On the benchmark scale
4. See how we rate
5. The working, shown

---

# Screenshot ads

Five more concepts, same three placements, each built around a real screenshot of the app
taken from Geelong R3 on 23 September. Re-shoot them any time the UI changes:

```
OVERLAY_OPEN=1 npx next dev
npx tsx scripts/capture-ui.ts <date> <meetingId> <raceId>
```

Shots land in `marketing/ads/shots/` and the ad script picks them up from there. These are
the ones to run when someone has already heard of us: they answer "what do I actually get"
rather than "who are you".

## 6. Board — ten ratings at once

Dark. The densest thing we own, and nobody else shows it.
Files: `board-square.png`, `board-portrait.png`, `board-story.png`

**Headlines**
1. Ten ratings. Every runner
2. The whole field, rated ten ways
3. Not one number, ten
4. Where a horse actually beats this field
5. The board nobody else shows

**Primary text**
1. One number hides where a horse is actually better than this field. We show all ten, green above the race average and red below.
2. Today, class, early, mid, late, pressure, tempo, going, distance and track. Every runner, every column, one screen.
3. A horse can rate well overall and be badly wrong for this race. The board is where you see that before you bet.
4. Green above the race average, red below, deeper the further from it. You can read a field in about four seconds.
5. Every rating we hold on every runner, laid out so you can compare them without clicking anything.

**Descriptions**
1. Ten columns, every runner
2. Read a field in seconds
3. The full ratings board
4. Green good, red bad
5. See the whole field

## 7. Map — the speed map

Light. The most visual thing we have, and it stops a scroll.
Files: `map-square.png`, `map-portrait.png`, `map-story.png`

**Headlines**
1. Know the run before it runs
2. Who leads, who gets back
3. The shape decides most races
4. See the race before it happens
5. Every runner, placed

**Primary text**
1. Who leads, who is caught back, and how much pressure is in it. The shape of the race decides most of them.
2. Every runner placed front to back with the inside runner on the rail, so you can see the trouble before it happens.
3. A good horse three deep with no cover is a bad bet. The map is how you spot it.
4. Tempo, pressure and where each runner settles, drawn for every race on the card.
5. The speed map used to be the thing you drew yourself on the back of the form guide. We do it for every race.

**Descriptions**
1. Every race mapped
2. See the shape first
3. Who leads, who gets back
4. Pressure and tempo
5. Drawn for every race

## 8. Price — the market table

Light. The clearest statement of the whole proposition.
Files: `price-square.png`, `price-portrait.png`, `price-story.png`

**Headlines**
1. Our price, next to theirs
2. Every runner priced
3. The best price, and who has it
4. See the edge on every runner
5. Two prices on every horse

**Primary text**
1. The best price on offer and who is paying it, our rated price beside it, and the edge between the two. For every runner, not just the calls.
2. You cannot tell a good price from a bad one without a price of your own. Here is ours, on all of them.
3. Live prices across the bookies, our rating, and the gap. The gap is the only reason to bet.
4. Every runner in the race with a live price, a rated price and the edge worked out for you.
5. We price the whole field, so the ones we pass on are as visible as the ones we call.

**Descriptions**
1. Live price against ours
2. The edge on every runner
3. Best price, named bookie
4. The whole field priced
5. See what we pass on

## 9. Call — a selection card

Dark. The best single ad in the set. Big numbers, obvious value.
Files: `call-square.png`, `call-portrait.png`, `call-story.png`

**Headlines**
1. Every call shows its working
2. Nothing to take on faith
3. The reason, in plain words
4. Why, not just what
5. The price and where to get it

**Primary text**
1. The rating, the reason in plain words, the price we want and the bookie holding it. Nothing to take on faith.
2. Anyone can name a horse. We show you the rating behind it, what it needs, and the price that makes it worth backing.
3. Fringilla, rated $3.80, $4.40 at Sportsbet. That is the whole call, and the reason is written underneath it.
4. Every selection comes with the number, the sentence and the price. Agree or don't, but you can see the argument.
5. A tip with no reasoning is a guess with a price on it.

**Descriptions**
1. The reasoning, shown
2. Rating, reason, price
3. See the argument
4. Nothing on faith
5. Know why you're on

## 10. Lay — bets and lays

Light. The claim a back-only service cannot answer.
Files: `lay-square.png`, `lay-portrait.png`, `lay-story.png`

**Headlines**
1. We also say what to bet against
2. Bets and lays, both
3. The favourite is often the bet against
4. Short prices are calls too
5. Not just something to back

**Primary text**
1. A horse priced shorter than it is worth is a call too. Most services will only ever hand you something to back.
2. Half our calls are lays. A wrong favourite is the most reliable thing on a card and nobody else will tell you.
3. When the market has a horse too short, that is information. We publish it as a call and settle it like any other.
4. Bets and lays on the same page, priced the same way, settled the same way.
5. Anyone can find you a roughie. Telling you which favourite is false is the harder half.

**Descriptions**
1. Bets and lays both
2. Which favourite is false
3. Short prices are calls
4. The other half of the card
5. What to bet against

---

## Before this can run

**Meta needs to authorise the account for gambling and betting ads.** Betting tips services
sit inside Meta's gambling and gaming policy, which requires written permission per country
before an ad will serve. Without it these get rejected, and repeat rejections put the ad
account at risk. Apply through Meta's gambling and gaming onboarding for Australia and wait
for approval before spending. This is the long pole, not the creative.

Also worth confirming with someone who knows the state rules: a paid racing tipping service
may carry obligations separate from a licensed wagering provider's mandatory taglines.

**Targeting:** 18+ as a hard floor, Australia only.

**Pixel:** `NEXT_PUBLIC_META_PIXEL_ID` is already wired, so sign-up and checkout should
attribute without extra work. Confirm the events fire before spend starts.

## What to test first

Run **Free** and **Record** against each other on cold traffic. Free has the offer, Record
has the only claim a competitor cannot copy. Rated and Method are better as the second
touch, once someone knows what the product is. Overlay is the one to retarget with, because
it needs a reader who already cares about price.

## What we cannot say

The settled ledger over 11 days, 449 calls, is **-28.84u at -6.5%**. Bets alone are
**-16.0%**. The only positive slices are Prime (14 calls) and Long (17 calls), both far too
small to mean anything, and both inside a period where the model's calibration is under
review.

So no ad claims a profit, an ROI, a strike rate or a winning run, and none should until
there is a long positive record to point at. Every claim across these five is about
coverage, method or transparency, each true today and checkable by anyone who clicks. That
also keeps them clear of misleading-advertising exposure, which for a paid tipping service
is a real risk rather than a theoretical one.

import type { Faq } from "@/components/JsonLd";

/** Every question on the site, in one place, so the FAQ page and the pages that cite them agree. */
export const ABOUT_FAQ: Faq[] = [
  { q: "What is The Overlay?", a: "The Overlay is an Australian horse racing tips site that rates every runner on the benchmark scale, turns the ratings into a rated price, and calls a bet when the market price is bigger than ours and a lay when it is shorter." },
  { q: "What is an overlay in horse racing?", a: "An overlay is a horse whose market price is longer than its true chance, so a $5 horse we rate a $4 chance is an overlay and worth a bet." },
  { q: "When are the tips released?", a: "Tips are published at 8:00am AEST on each race day and prices refresh through the day until the jump." },
  { q: "Which races are covered?", a: "Every TAB flat meeting in Australia, every state, with one race a day free and the rest open to members." },
  { q: "How much does it cost?", a: "Saturday tips are $4.40 a week, Saturday plus Wednesday $6.70, every day $11.30, billed monthly at $19, $29 and $49, all with a 7-day free trial, or day passes from $10 each." },
];

export const RATINGS_FAQ: Faq[] = [
  { q: "What scale are the ratings on?", a: "Australian benchmark points, the same scale as the race classes, so a horse rated 64 belongs in a Benchmark 64 race and the best horses in the world sit around 130." },
  { q: "What is the Today rating?", a: "The one number everything adds up to: the horse's class rating plus or minus the factors that matter today, such as going, tempo, distance, track, weight, freshness, jockey and trainer." },
  { q: "What is a rated price?", a: "Our price for the horse, worked out from the Today ratings of the whole field, shown next to its win chance so you can compare it with the market." },
  { q: "What is a bet and what is a lay?", a: "A bet is a horse whose market price is bigger than our rated price, a lay is a horse whose market price is shorter than our rated price and worth opposing on the exchange." },
  { q: "What is the difference between a bet, a Prime Overlay and a Way Overlay?", a: "A bet is any horse whose market price is at least two points of win chance longer than our rated price, at $26 or under. A Prime Overlay is a bet with a gap of five points or more on a horse we give a real chance, 15% or better, with at least two runs behind its rating, the strongest calls on the day and shown in lime. A Way Overlay is a bet at $21 or more, a roughie the market has way over the odds, shown in the lighter blue and struck at small stakes because most of them lose and the ones that win pay for the rest." },
  { q: "Do results change the ratings?", a: "No, the clock does: a run is scored on time against the class benchmark, so winning slowly does not lift a rating and running fast in defeat does." },
];

export const PLANS_FAQ: Faq[] = [
  { q: "Is there a free trial?", a: "Yes, every subscription starts with a 7-day free trial and nothing is charged if you cancel before it ends." },
  { q: "What does a day pass do?", a: "A day pass opens every race on one racing date of your choice, costs $10, never expires, and gets cheaper in bundles of 3, 5 or 10." },
  { q: "Can I cancel any time?", a: "Yes, cancel from your account and the board stays open until the end of the period you have paid for." },
  { q: "Do prices include GST?", a: "Prices are in Australian dollars excluding GST, which is added at checkout." },
  { q: "What is free without a plan?", a: "The race board, jump times, results, the live market and one free race every day." },
];

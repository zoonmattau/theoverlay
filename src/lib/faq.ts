import type { Faq } from "@/components/JsonLd";
import { PASS_PRICE, planById, weeklyLabel } from "@/lib/billing/plans";
import { BRAND_SOCIAL } from "@/lib/social";

const [SAT, MID, DAY] = (["saturday", "midweek", "everyday"] as const).map((id) => planById(id)!);

/** Every question on the site, in one place, so the FAQ page and the pages that cite them agree. */
export const ABOUT_FAQ: Faq[] = [
  { q: "What is The Overlay?", a: "The Overlay is an Australian horse racing tips site that rates every runner on the benchmark scale, turns the ratings into a rated price, and calls a bet when the market price is bigger than ours and a lay when it is shorter.", links: [{ label: "How it works", href: "/method" }, { label: "Today's board", href: "/" }] },
  { q: "What is an overlay in horse racing?", a: "An overlay is a horse whose market price is longer than its true chance, so a $5 horse we rate a $4 chance is an overlay and worth a bet.", links: [{ label: "How we price a race", href: "/method" }] },
  { q: "When are the tips released?", a: "Calls go up on the site at 8am Sydney time on race day, by email and in Discord at 11am, and can change with the market until 30 minutes before each jump, when they lock and the lays go to Discord.", links: [{ label: "Today's tips", href: "/tips" }] },
  { q: "Which races are covered?", a: "Every TAB flat meeting in Australia, every state, with one race a day free and the rest open to members.", links: [{ label: "Today's board", href: "/" }] },
  { q: "Where can I see your results?", a: "Every settled call, won and lost, is on our results page, day by day, and it updates through the day.", links: [{ label: "Results", href: "/results" }] },
  { q: "Is there a Discord?", a: "Yes, members get every call and every lay in our Discord before the jump, and the free race, winners and Saturday review are open to everyone.", links: [{ label: "Join the Discord", href: `${BRAND_SOCIAL.discord}` }, { label: "Link it to your account", href: "/account" }] },
  { q: "How much does it cost?", a: `Saturday tips are ${weeklyLabel(SAT.price)} a week, Saturday plus Wednesday ${weeklyLabel(MID.price)}, every day ${weeklyLabel(DAY.price)}, billed monthly at $${SAT.price}, $${MID.price} and $${DAY.price}, and your first month runs 5 weeks. Pay weekly from $${SAT.weekPrice}, or save 40% quarterly and 50% yearly on the weekly price. Or buy day passes from $${PASS_PRICE} each.`, links: [{ label: "See the plans", href: "/pricing" }] },
];

export const RATINGS_FAQ: Faq[] = [
  { q: "What scale are the ratings on?", a: "Australian benchmark points, the same scale as the race classes, so a horse rated 64 belongs in a Benchmark 64 race and the best horses in the world sit around 130.", links: [{ label: "How it works", href: "/method" }, { label: "Datahub", href: "/data" }] },
  { q: "What is the Today rating?", a: "The one number everything adds up to: the horse's class rating, adjusted for today's race.", links: [{ label: "How it works", href: "/method" }] },
  { q: "What is a rated price?", a: "Our price for the horse, worked out from the Today ratings of the whole field, shown next to its win chance so you can compare it with the market.", links: [{ label: "Today's tips", href: "/tips" }] },
  { q: "What is a bet and what is a lay?", a: "A bet is a horse whose market price is bigger than our rated price, a lay is a horse whose market price is shorter than our rated price and worth opposing on the exchange.", links: [{ label: "Today's tips", href: "/tips" }] },
  { q: "What is the difference between a bet, a Prime Overlay and a Way Overlay?", a: "A bet is a horse the market has longer than our rated price by a clear margin. A Prime Overlay is our strongest bet, a big gap on a horse with a real chance, shown in lime. A Way Overlay is a bet at a big price, a roughie the market has way over the odds, shown in the lighter blue and struck at small stakes because most of them lose and the ones that win pay for the rest.", links: [{ label: "Today's tips", href: "/tips" }] },
];

export const PLANS_FAQ: Faq[] = [
  { q: "How do I sign up?", a: "Create a free account with your email or Google, then pick a plan or buy a day pass to open every race.", links: [{ label: "Create an account", href: "/signup" }, { label: "Plans and passes", href: "/pricing" }] },
  { q: "Is there a free trial?", a: "No, plans are paid from the day you start, but the first bill runs a week longer: a month is 5 weeks, a quarter or a year a week more. One race is free every day without a plan.", links: [{ label: "See the plans", href: "/pricing" }] },
  { q: "What does a day pass do?", a: "A day pass opens every race and our Discord for one race day, costs $10, never expires, gets cheaper in bundles of 3, 5 or 10, and you use it on the day from the home page, Today's tips or any race. Use one after 4pm and it opens tomorrow too.", links: [{ label: "Buy day passes", href: "/pricing#passes" }] },
  { q: "Can I cancel any time?", a: "Yes, cancel from your account and the board stays open until the end of the period you have paid for.", links: [{ label: "Your account", href: "/account" }] },
  { q: "What is free without a plan?", a: "The race board, jump times, results, the live market and one free race every day.", links: [{ label: "Today's board", href: "/" }] },
];

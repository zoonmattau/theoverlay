import type { EmailSpec } from "./template";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" });

/** Every email we send, in one place, so the voice stays consistent. */
export const EMAILS = {
  trialStarted: (plan: string, trialEnds: string): EmailSpec => ({
    subject: `Your ${plan} trial has started`,
    preheader: "Seven days of the full board, on us.",
    heading: "You are in.",
    paragraphs: [
      `Your <strong>${plan}</strong> trial is live and the full board is open on your race days.`,
      `The trial runs until <strong>${trialEnds}</strong>, and you can cancel any time before then from your account with nothing charged.`,
      "Every race we cover gets a top four, ratings across eight categories, a rated price for every runner and our bet or lay calls.",
    ],
    cta: { label: "Open today's board", url: `${SITE}/` },
    note: "No promise of winning: the numbers are a guide and every bet is your own call.",
  }),

  planActive: (plan: string, renews: string): EmailSpec => ({
    subject: `Your ${plan} plan is active`,
    preheader: "Thanks for joining The Overlay.",
    heading: "Your plan is active.",
    paragraphs: [
      `Your <strong>${plan}</strong> plan renews on <strong>${renews}</strong>.`,
      "Manage or cancel it any time from your account.",
    ],
    cta: { label: "Open today's board", url: `${SITE}/` },
  }),

  planCancelled: (plan: string, until: string): EmailSpec => ({
    subject: "Your plan has been cancelled",
    preheader: "Access runs to the end of the paid period.",
    heading: "Cancelled, no hard feelings.",
    paragraphs: [
      `Your <strong>${plan}</strong> plan will not renew, and the board stays open until <strong>${until}</strong>.`,
      "Day passes are there whenever you want a single race day back.",
    ],
    cta: { label: "See plans and passes", url: `${SITE}/pricing` },
  }),

  paymentFailed: (plan: string): EmailSpec => ({
    subject: "Your payment did not go through",
    preheader: "Update your card to keep the board open.",
    heading: "We could not take your payment.",
    paragraphs: [
      `The renewal for your <strong>${plan}</strong> plan failed, and Stripe will retry over the next few days.`,
      "Updating your card from your account fixes it straight away.",
    ],
    cta: { label: "Update payment details", url: `${SITE}/account` },
  }),

  friendJoined: (until: string): EmailSpec => ({
    subject: "Your friend joined, two weeks on us",
    preheader: "The full board is yours for a fortnight.",
    heading: "Your friend is in.",
    paragraphs: [
      "Someone signed up with your invite link, so you both get two weeks of the full board, every race day.",
      until ? `Your fortnight runs until <strong>${fmt(until)}</strong>, on top of anything you already have.` : "It starts now, on top of anything you already have.",
      "Invite as many friends as you like, every one adds another fortnight.",
    ],
    cta: { label: "Open today's board", url: `${SITE}/` },
  }),

  giftReceived: (until: string): EmailSpec => ({
    subject: "Two weeks of The Overlay, on your friend",
    preheader: "Every race day is open for a fortnight.",
    heading: "Welcome, and thank your friend.",
    paragraphs: [
      "You joined on an invite, so the full board is open to you for two weeks, every race day.",
      until ? `It runs until <strong>${fmt(until)}</strong>.` : "It starts now.",
      "Your own invite link is on your account page, and every friend who joins adds a fortnight for you both.",
    ],
    cta: { label: "Open today's board", url: `${SITE}/` },
  }),

  passesAdded: (qty: number, total: number): EmailSpec => ({
    subject: `${qty} day ${qty === 1 ? "pass" : "passes"} added`,
    preheader: "Use them on any race day you like.",
    heading: `${qty} day ${qty === 1 ? "pass" : "passes"} added to your account.`,
    paragraphs: [
      `You now have <strong>${total}</strong> unused ${total === 1 ? "pass" : "passes"}, and they never expire.`,
      "Open any race day and press Use a day pass to unlock every race on that date.",
    ],
    cta: { label: "Open today's board", url: `${SITE}/` },
  }),
};

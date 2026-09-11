import type { EmailSpec } from "./template";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theoverlay.com.au";

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

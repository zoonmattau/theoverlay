import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Writes to profiles happen with the service role, only from Stripe webhooks
 * and the checkout handler. Never import this into anything client-facing.
 */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function grantAccess(input: {
  userId: string;
  plan: string;
  until: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
}) {
  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({
      plan: input.plan,
      access_until: input.until.toISOString(),
      ...(input.stripeCustomerId ? { stripe_customer_id: input.stripeCustomerId } : {}),
      ...(input.stripeSubscriptionId !== undefined ? { stripe_subscription_id: input.stripeSubscriptionId } : {}),
    })
    .eq("id", input.userId);
  if (error) throw error;
}

export async function userIdForCustomer(customerId: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? undefined;
}

/**
 * Credit a pass bundle once per Checkout session, however often Stripe
 * retries. Returns the new balance, or undefined when already credited.
 */
export async function creditPasses(input: {
  sessionId: string;
  userId: string;
  quantity: number;
}): Promise<number | undefined> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("pass_purchases")
    .insert({ session_id: input.sessionId, user_id: input.userId, quantity: input.quantity });
  if (error) {
    if (error.code === "23505") return undefined; // already credited
    throw error;
  }
  const { data } = await admin.from("profiles").select("pass_credits").eq("id", input.userId).maybeSingle();
  const total = (data?.pass_credits ?? 0) + input.quantity;
  await admin.from("profiles").update({ pass_credits: total }).eq("id", input.userId);
  return total;
}

/** The email on a profile, for transactional mail from webhooks. */
export async function emailForUser(userId: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin().from("profiles").select("email").eq("id", userId).maybeSingle();
  return data?.email ?? undefined;
}

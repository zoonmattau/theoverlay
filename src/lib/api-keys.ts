import "server-only";
import { createHash, randomBytes } from "node:crypto";

import { logEvent } from "./admin";
import { supabaseAdmin } from "./billing/access";

/** The fewest seconds between two calls on one key. */
export const API_MIN_INTERVAL_S = 60;

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export interface ApiKeyInfo {
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** The member's live key, without the key itself. */
export async function liveKey(userId: string): Promise<ApiKeyInfo | undefined> {
  const { data } = await supabaseAdmin().from("api_keys").select("prefix, created_at, last_used_at").eq("user_id", userId).is("revoked_at", null).maybeSingle();
  return data ? { prefix: data.prefix, createdAt: data.created_at, lastUsedAt: data.last_used_at ?? undefined } : undefined;
}

/** Revokes any live key and makes a new one. The key is returned once and only its hash is kept. */
export async function issueKey(userId: string): Promise<string> {
  await revokeKeys(userId);
  const key = `ovl_${randomBytes(24).toString("base64url")}`;
  const prefix = key.slice(0, 10);
  const { error } = await supabaseAdmin().from("api_keys").insert({ user_id: userId, key_hash: hash(key), prefix });
  if (error) throw new Error(error.message);
  await logEvent({ user_id: userId, kind: "api_key", plan: null, amount_cents: null, meta: { made: prefix } });
  return key;
}

/** Switches off every live key the member has. `by` names an admin who did it for them. */
export async function revokeKeys(userId: string, by?: string): Promise<void> {
  const { data } = await supabaseAdmin().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null).select("prefix");
  for (const k of data ?? []) await logEvent({ user_id: userId, kind: "api_key", plan: null, amount_cents: null, meta: by ? { revoked: k.prefix, by } : { revoked: k.prefix } });
}

export interface ApiKeyRow {
  prefix: string;
  live: boolean;
  createdAt: string;
  lastUsedAt?: string;
  lastIp?: string;
  uses: number;
  revokedAt?: string;
}

/** Every key ever made, newest first, grouped by member, for the admin pages. */
export async function keysByUser(userId?: string): Promise<Map<string, ApiKeyRow[]>> {
  let q = supabaseAdmin().from("api_keys").select("user_id, prefix, created_at, last_used_at, last_ip, uses, revoked_at").order("created_at", { ascending: false });
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) console.error("[api_keys]", error.message);
  const out = new Map<string, ApiKeyRow[]>();
  for (const k of data ?? []) {
    const list = out.get(k.user_id) ?? [];
    list.push({ prefix: k.prefix, live: !k.revoked_at, createdAt: k.created_at, lastUsedAt: k.last_used_at ?? undefined, lastIp: k.last_ip ?? undefined, uses: Number(k.uses), revokedAt: k.revoked_at ?? undefined });
    out.set(k.user_id, list);
  }
  return out;
}

export type KeyCheck = { ok: true; userId: string } | { ok: false; status: 401 | 429; retryAfter?: number };

/**
 * Who a key belongs to, and whether it may be used now. Each use is counted
 * and a call from a new address is logged, so a key passed around shows up
 * in the events.
 */
export async function checkKey(key: string, ip: string): Promise<KeyCheck> {
  const db = supabaseAdmin();
  const { data } = await db.from("api_keys").select("id, user_id, last_used_at, last_ip, uses").eq("key_hash", hash(key)).is("revoked_at", null).maybeSingle();
  if (!data) return { ok: false, status: 401 };
  const since = data.last_used_at ? (Date.now() - new Date(data.last_used_at).getTime()) / 1000 : Infinity;
  if (since < API_MIN_INTERVAL_S) return { ok: false, status: 429, retryAfter: Math.ceil(API_MIN_INTERVAL_S - since) };
  await db.from("api_keys").update({ last_used_at: new Date().toISOString(), last_ip: ip, uses: Number(data.uses) + 1 }).eq("id", data.id);
  if (ip !== data.last_ip) await logEvent({ user_id: data.user_id, kind: "api_ip", plan: null, amount_cents: null, meta: { ip, was: data.last_ip ?? null } });
  return { ok: true, userId: data.user_id };
}

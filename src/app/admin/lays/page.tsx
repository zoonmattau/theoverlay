import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { listLayBlocks } from "@/lib/model/store";
import { blockLay, unblockLay } from "@/app/admin/actions";
import { LayBlockForm, LayUnblockButton } from "./LayBlockForm";

export const metadata = { title: "Horses we never lay" };

/**
 * Every horse ruled out of the lays, and the box to rule out another by name.
 * A lay risks the price rather than a unit, so this list is the one place a
 * horse can be kept off them for good.
 */
export default function Page() {
  return (
    <div className="page">
      <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
        <Lays />
      </Suspense>
    </div>
  );
}

async function Lays() {
  if (!isAdmin(await getViewer())) notFound();
  const blocks = await listLayBlocks().catch(() => []);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Horses we never lay</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          A horse on this list is never laid, on any card, until it is let back in. Its bets are untouched.
        </p>
      </header>

      <div className="card">
        <LayBlockForm block={blockLay} />
      </div>

      <div className="card p-0 overflow-hidden">
        {blocks.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">No horse is ruled out yet.</p>
        ) : (
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th>Horse</th>
                <th>Why</th>
                <th>Ruled out</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.horse_key}>
                  <td className="font-semibold">{b.horse_name}</td>
                  <td className="text-ink-secondary">{b.reason ?? "—"}</td>
                  <td className="nums text-ink-soft whitespace-nowrap">
                    {new Date(b.added_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    {b.added_by ? ` · ${b.added_by}` : ""}
                  </td>
                  <td className="text-right">
                    <LayUnblockButton horseKey={b.horse_key} horse={b.horse_name} unblock={unblockLay} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

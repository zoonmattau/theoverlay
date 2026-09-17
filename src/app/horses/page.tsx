import { redirect } from "next/navigation";
import { Suspense } from "react";

/** The horse power rankings live in the Datahub now; the old address still works. */
export default function Page({ searchParams }: PageProps<"/horses">) {
  return (
    <Suspense fallback={null}>
      <To searchParams={searchParams} />
    </Suspense>
  );
}

async function To({ searchParams }: { searchParams: PageProps<"/horses">["searchParams"] }): Promise<null> {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) p.set(k, v);
  redirect(`/data/horses${p.size ? `?${p}` : ""}`);
}

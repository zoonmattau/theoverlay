import Link from "next/link";

/**
 * The field for Race 404: the pages a lost visitor most likely wanted, each a
 * runner on its saddlecloth (Australian colours: 1 red, 2 white, 3 blue, 4
 * yellow, 5 green), today's card the top pick.
 */
const FIELD = [
  { no: 1, href: "/", name: "Today's Card", sub: "Every race today, rated", cloth: "bg-[#d62828] text-white", pick: true },
  { no: 2, href: "/tips", name: "Today's Tips", sub: "Every call on the card", cloth: "bg-white text-ink ring-1 ring-inset ring-line" },
  { no: 3, href: "/results", name: "Results", sub: "Every call we have made, settled", cloth: "bg-[#1f4fd6] text-white" },
  { no: 4, href: "/tipsters", name: "Tipsters", sub: "Their calls and their record", cloth: "bg-[#f2c500] text-ink" },
  { no: 5, href: "/data", name: "Datahub", sub: "Horses, jockeys, trainers and tracks", cloth: "bg-[#1d8a3a] text-white" },
];

/**
 * A page that isn't there, as a race card: Race 404 with the missing page
 * scratched and the rest of the field the way back.
 */
export default function NotFound() {
  return (
    <div className="page">
      <div className="card mx-auto mt-8 max-w-2xl overflow-hidden p-0!">
        <div className="bg-bar px-5 py-5 sm:px-8">
          <p className="nums text-[11px] font-extrabold uppercase tracking-[0.14em] text-lime">Race 404 · Nowhere · Jumped</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-bar-ink sm:text-3xl">The Missing Page Plate</h1>
          <p className="nums mt-1 text-xs text-bar-soft">404m · Good 4 · 6 runners, 1 scratched</p>
        </div>

        <div className="flex items-start gap-3 border-b border-line bg-panel-alt px-5 py-4 sm:px-8">
          <span className="nums mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-soft/20 text-xs font-extrabold text-ink-soft">404</span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-ink-soft line-through decoration-2">This Page</span>
              <span className="rounded bg-[#d93636] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">Scratched</span>
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">The link is wrong, the page has moved, or it&apos;s a race from a card we no longer hold.</p>
          </div>
        </div>

        <ol>
          {FIELD.map((r) => (
            <li key={r.href} className="border-b border-line last:border-b-0">
              <Link href={r.href} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-panel-alt sm:px-8">
                <span className={`nums inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-extrabold ${r.cloth}`}>{r.no}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-ink group-hover:underline decoration-lime decoration-2 underline-offset-4">{r.name}</span>
                    {r.pick && <span className="rounded bg-lime px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-ink">Top pick</span>}
                  </span>
                  <span className="block text-sm text-ink-soft">{r.sub}</span>
                </span>
                <span className="text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden>→</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page max-w-3xl">
      <div className="card mt-10">
        <div className="empty-state">
          <p className="nums text-4xl font-semibold text-ink-soft">404</p>
          <h1 className="font-display text-xl font-bold text-ink">Nothing here</h1>
          <p className="max-w-md leading-relaxed">
            That meeting, race or page doesn&apos;t exist, or it&apos;s from a card we no
            longer hold.
          </p>
          <Link href="/" className="btn btn-primary mt-2">
            Today&apos;s card
          </Link>
        </div>
      </div>
    </div>
  );
}

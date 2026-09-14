import { Suspense } from "react";

import { AdminNav } from "./AdminNav";

/** Every admin page: the menu on the left, the page on the right. Pages check the viewer themselves. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-shell">
      {/* The menu reads the URL, so it streams in after the shell. */}
      <Suspense fallback={<nav className="admin-nav" aria-hidden="true" />}>
        <AdminNav />
      </Suspense>
      <div className="admin-main">{children}</div>
    </div>
  );
}

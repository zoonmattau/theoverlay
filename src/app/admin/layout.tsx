import { AdminNav } from "./AdminNav";

/** Every admin page: the menu on the left, the page on the right. Pages check the viewer themselves. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-shell">
      <AdminNav />
      <div className="admin-main">{children}</div>
    </div>
  );
}

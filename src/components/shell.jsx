import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import { logoutAction } from "@/lib/auth-actions";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/sales", label: "Sales" },
  { href: "/price-chart", label: "Price Chart" },
  { href: "/admin", label: "Admin" }
];

export default function Shell({ children, user }) {
  return (
    <div className="min-h-screen bg-zinc-100 text-black">
      <header className="border-b border-zinc-300 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <BrandLogo compact />
          <div className="flex items-center gap-5">
            <nav className="hidden items-center gap-3 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="text-right">
              <p className="text-sm font-semibold">{user?.name || "User"}</p>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{user?.role || "unknown"}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-black bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

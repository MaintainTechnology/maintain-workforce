"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_FOCUS } from "@/lib/ui";

// MVP 14.2's operational workspaces, followed by the shared catalogues.
// MVP has one maintain_admin role, so every admin sees the same destinations.
const NAV = [
  { href: "/admin", label: "Marketplace" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/workers", label: "Workers" },
  { href: "/admin/matching", label: "Matching" },
  { href: "/admin/engagements", label: "Engagements" },
  { href: "/admin/transfers", label: "Transfers" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/catalogue", label: "Catalogue" },
  { href: "/admin/rates", label: "Rates" },
];

export function AdminNavigation() {
  // Layouts persist across client navigation; read the current path here rather
  // than reusing the server layout's pathname header for selected-link state.
  const pathname = usePathname();

  return (
    <nav aria-label="Maintain admin">
      <ul className="flex flex-wrap gap-1">
        {NAV.map((item) => {
          const selected = pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={selected ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-(--radius-pill) border px-3 py-2 text-sm font-semibold transition-colors duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none ${NAV_FOCUS} ${selected
                  ? "border-hairline bg-white/[0.07] text-on-dark"
                  : "border-transparent text-on-dark-muted hover:bg-white/5 hover:text-on-dark active:bg-white/10"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

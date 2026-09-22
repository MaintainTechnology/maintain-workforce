import Link from "next/link";
import { Icon } from "@/components/icon";
import { NAV_FOCUS } from "@/lib/ui";

/** Navigation only. Each destination still checks its own role and membership. */
export function WorkspaceViewSwitch({ view }: { view: "admin" | "user" }) {
  const target = view === "admin" ? "User view" : "Admin view";

  return (
    <Link
      href={view === "admin" ? "/app" : "/admin"}
      aria-label={`Switch to ${target.toLowerCase()}`}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-(--radius-pill) border border-hairline px-3 text-sm font-semibold text-on-dark transition-colors hover:bg-white/5 ${NAV_FOCUS}`}
    >
      {target}
      <Icon name="i-arrow-right" className="size-4" />
    </Link>
  );
}

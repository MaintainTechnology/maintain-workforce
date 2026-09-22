"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { useDismissableDetails } from "@/components/use-dismissable-details";
import { WorkspaceViewSwitch } from "@/components/workspace-view-switch";
import {
  ADMIN_NAV,
  adminDestination,
  adminDetailLabel,
  isAdminDestinationActive,
} from "@/lib/admin-navigation";
import { LABEL, NAV_FOCUS } from "@/lib/ui";

// The Maintain admin shell mirrors the company workspace shell on purpose: the
// same people move between the two, so the sidebar, the translucent top bar and
// the mobile disclosure sit where they already expect them. What differs is the
// brand lockup (an ADMIN tag beside the mark) and the destinations.

type AdminAccount = {
  email: string;
  signOut: ReactNode;
};

function BrandLockup({ href = "/admin" }: { href?: string }) {
  return (
    <Link href={href} aria-label="Maintain admin, marketplace overview" className={`inline-flex min-h-11 items-center gap-(--space-3) ${NAV_FOCUS}`}>
      <Image src="/design-system/assets/logo/mark.svg" alt="" width={36} height={23} priority className="h-auto w-8" />
      <span className="flex items-center gap-(--space-2)">
        <span className="hidden text-sm font-extrabold tracking-(--tracking-tight) text-on-dark sm:inline">Maintain</span>
        <span className={`rounded-(--radius-sm) border border-hairline px-1.5 py-0.5 ${LABEL} text-on-dark-muted`}>Admin</span>
      </span>
    </Link>
  );
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Maintain admin">
      <ul className="space-y-1">
        {ADMIN_NAV.map((item, index) => {
          const selected = isAdminDestinationActive(pathname, item.href);
          const startsGroup = index === 0 || item.group !== ADMIN_NAV[index - 1].group;

          return (
            <li key={item.href} className={startsGroup && index > 0 ? "mt-(--space-5)" : undefined}>
              {startsGroup && (
                <p className={`mb-(--space-2) px-3 ${LABEL}`}>{item.group}</p>
              )}
              <Link
                href={item.href}
                aria-current={selected ? "page" : undefined}
                onNavigate={onNavigate}
                onClick={(event) => {
                  // A link to the current page does not change the pathname, but
                  // should still dismiss the disclosure after a regular click.
                  if (selected && pathname === item.href && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    onNavigate?.();
                  }
                }}
                className={`group flex min-h-11 items-center gap-3 rounded-(--radius-md) border px-3 py-2.5 text-sm font-semibold transition-colors duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none ${NAV_FOCUS} ${selected
                  ? "border-hairline bg-white/[0.07] text-on-dark"
                  : "border-transparent text-on-dark-muted hover:bg-white/5 hover:text-on-dark active:bg-white/10"}`}
              >
                <Icon name={item.icon} className={`size-[18px] shrink-0 ${selected ? "text-teal-mist" : "text-on-dark-faint group-hover:text-on-dark-muted"}`} />
                <span>{item.label}</span>
                {selected && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-teal-mist" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AccountFooter({ email, signOut }: AdminAccount) {
  return (
    <div className="border-t border-hairline pt-4">
      <p className="text-xs text-on-dark-faint">Signed in as</p>
      <p className="mt-1 truncate text-sm font-medium text-on-dark-muted" title={email}>{email}</p>
      <Link href="/app" className={`mt-3 flex min-h-11 items-center justify-center gap-(--space-2) rounded-(--radius-pill) border border-hairline px-4 text-sm font-semibold text-on-dark transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-white/5 ${NAV_FOCUS}`}>
        Switch to user view
        <Icon name="i-arrow-right" className="size-4" />
      </Link>
      <div className="mt-3">{signOut}</div>
    </div>
  );
}

export function AdminSidebar(account: AdminAccount) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-hairline bg-teal-deep lg:flex">
      <div className="flex h-[68px] shrink-0 items-center border-b border-hairline px-6">
        <BrandLockup />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5 pt-6">
        <NavigationLinks />
        <div className="mt-auto pt-8"><AccountFooter {...account} /></div>
      </div>
    </aside>
  );
}

function MobileNavigation(account: AdminAccount) {
  const { detailsRef, summaryRef, close } = useDismissableDetails();

  return (
    <details ref={detailsRef} className="group relative shrink-0 lg:hidden">
      <summary ref={summaryRef} aria-label="Admin menu" className={`flex size-11 cursor-pointer list-none items-center justify-center rounded-(--radius-pill) border border-hairline text-on-dark transition-colors hover:bg-white/5 active:bg-white/10 group-open:bg-white/10 [&::-webkit-details-marker]:hidden ${NAV_FOCUS}`}>
        <Icon name="i-menu" />
      </summary>
      <div className="mw-menu-panel absolute right-0 top-[calc(100%+0.75rem)] max-h-[calc(100dvh-88px)] w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-(--radius-lg) border border-hairline bg-black-2 p-4 shadow-(--shadow-lg)">
        <NavigationLinks onNavigate={() => close(true)} />
        <div className="mt-5"><AccountFooter {...account} /></div>
      </div>
    </details>
  );
}

export function AdminTopBar(account: AdminAccount) {
  const pathname = usePathname();
  const destination = adminDestination(pathname);
  const detail = adminDetailLabel(pathname);

  return (
    <header className="sticky top-0 z-(--z-sticky) border-b border-hairline bg-ink-teal/85 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center justify-between gap-4 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="lg:hidden"><BrandLockup /></span>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
            <span className="text-on-dark-faint">Admin</span>
            <span aria-hidden="true" className="text-on-dark-faint">/</span>
            {detail && destination ? (
              <>
                <Link href={destination.href} className={`truncate font-semibold text-on-dark-muted transition-colors duration-(--dur-base) ease-(--ease-out) hover:text-on-dark ${NAV_FOCUS}`}>
                  {destination.label}
                </Link>
                <span aria-hidden="true" className="text-on-dark-faint">/</span>
                <span aria-current="page" className="truncate font-semibold text-on-dark">{detail}</span>
              </>
            ) : (
              <span aria-current="page" className="truncate font-semibold text-on-dark">{destination?.label ?? "Admin"}</span>
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden max-w-[28ch] truncate text-xs font-medium text-on-dark-faint md:block" title={account.email}>{account.email}</span>
          <WorkspaceViewSwitch view="admin" />
          <MobileNavigation {...account} />
        </div>
      </div>
    </header>
  );
}

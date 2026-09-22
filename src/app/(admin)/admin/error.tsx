"use client";

import Link from "next/link";
import { BTN_GHOST_SM, BTN_PRIMARY_SM, PANEL } from "@/lib/ui";
import { SECTION_TITLE } from "@/lib/admin-ui";

export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className={`${PANEL} max-w-2xl p-(--space-6)`}>
      <div className="flex items-start gap-(--space-3)">
        <span aria-hidden="true" className="mt-[0.55em] size-2 shrink-0 rounded-(--radius-pill) bg-status-critical" />
        <div>
          <h1 className={SECTION_TITLE}>This page couldn’t be loaded</h1>
          <p className="mt-(--space-2) text-sm leading-relaxed text-on-dark-muted">
            Try again to load the latest records, or open another area from the navigation.
          </p>
        </div>
      </div>
      <div className="mt-(--space-5) flex flex-wrap gap-(--space-3)">
        <button type="button" className={BTN_PRIMARY_SM} onClick={() => retry()}>Try again</button>
        <Link href="/admin" className={BTN_GHOST_SM}>Back to dashboard</Link>
      </div>
    </section>
  );
}

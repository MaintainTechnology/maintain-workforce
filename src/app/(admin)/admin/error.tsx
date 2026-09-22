"use client";

import Link from "next/link";
import { BTN_GHOST_SM, BTN_PRIMARY_SM, PANEL } from "@/lib/ui";
<<<<<<< HEAD
import { SECTION_TITLE } from "@/lib/platform-ui";
=======
import { SECTION_TITLE } from "@/lib/admin-ui";
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba

export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className={`${PANEL} max-w-2xl p-(--space-6)`}>
      <div className="flex items-start gap-(--space-3)">
        <span aria-hidden="true" className="mt-[0.55em] size-2 shrink-0 rounded-(--radius-pill) bg-status-critical" />
        <div>
          <h1 className={SECTION_TITLE}>This page couldn’t be loaded</h1>
          <p className="mt-(--space-2) text-sm leading-relaxed text-on-dark-muted">
<<<<<<< HEAD
            Nothing was changed. Try again to load the latest records, or open another area from the navigation.
=======
            Try again to load the latest records, or open another area from the navigation.
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
          </p>
        </div>
      </div>
      <div className="mt-(--space-5) flex flex-wrap gap-(--space-3)">
        <button type="button" className={BTN_PRIMARY_SM} onClick={() => retry()}>Try again</button>
<<<<<<< HEAD
        <Link href="/admin" className={BTN_GHOST_SM}>Back to marketplace</Link>
=======
        <Link href="/admin" className={BTN_GHOST_SM}>Back to dashboard</Link>
>>>>>>> fb1ccdc2a57e4bf8192bcc59dadd4f7c99c31aba
      </div>
    </section>
  );
}

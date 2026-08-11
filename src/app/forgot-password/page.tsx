import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ctas } from "@/lib/site";
import { BTN_GHOST, PANEL, H2, SECTION, SHELL } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Forgot password",
  description:
    "Accounts and passwords arrive with the Maintain Workforce company workspace. There is nothing to reset yet.",
};

// Honest holding page so the footer link tells the truth.

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* Texture, not mode: brand terrain art far under the card. */}
      <Image
        src="/design-system/graphics/web/cover-2.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.14]"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <div
          className={`mw-enter ${PANEL} mx-auto w-full max-w-md p-(--space-6)`}
          style={{ "--enter-step": 0 } as React.CSSProperties}
        >
          {/* Strapline, not an eyebrow: sentence case, no tracking. */}
          <p className="font-semibold text-on-dark-muted">Company workspace</p>
          <h1 className={`${H2} mt-(--space-4)`}>No passwords yet.</h1>
          <p className="mt-(--space-4) text-body text-on-dark-muted">
            Accounts and passwords arrive with the workspace. If you have
            registered, there is nothing to reset, and we will email you at
            launch.
          </p>
          <div className="mt-(--space-6)">
            <Link href={ctas.contact.href} className={BTN_GHOST}>
              {ctas.contact.label}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

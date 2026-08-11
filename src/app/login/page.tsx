import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ctas } from "@/lib/site";
import { BTN_PRIMARY, BTN_GHOST, PANEL, H2, SECTION, SHELL } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "The Maintain Workforce company workspace is in build. Registered companies get first access when it opens.",
};

// Honest holding page: the workspace does not exist yet, so no fake login form.

export default function LoginPage() {
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
        <div className="mx-auto w-full max-w-md">
          <div
            className={`mw-enter ${PANEL} p-(--space-6)`}
            style={{ "--enter-step": 0 } as React.CSSProperties}
          >
            {/* Strapline, not an eyebrow: sentence case, no tracking. */}
            <p className="font-semibold text-on-dark-muted">Company workspace</p>
            <h1 className={`${H2} mt-(--space-4)`}>The workspace is in build.</h1>
            <p className="mt-(--space-4) text-body text-on-dark-muted">
              Registered companies in the pilot get first access when it opens
              [access window]. Until then every
              introduction is handled directly by the team, so nothing waits on
              software.
            </p>
            <div className="mt-(--space-6) flex flex-wrap items-center gap-(--space-4)">
              <Link href={ctas.register.href} className={BTN_PRIMARY}>
                {ctas.register.label}
              </Link>
              <Link href={ctas.contact.href} className={BTN_GHOST}>
                {ctas.contact.label}
              </Link>
            </div>
          </div>
          <p
            className="mw-enter mt-(--space-5) text-sm text-on-dark-faint"
            style={{ "--enter-step": 1 } as React.CSSProperties}
          >
            Already registered? We will email you when your login is ready.
          </p>
        </div>
      </div>
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";
import { PANEL, SHELL } from "@/lib/ui";

// The auth screens share one split layout: the form column on the left, a quote panel
// on the right. Both sit inside SHELL, so their gutter and maximum width are the site's
// own — these pages line up with every other page rather than running to the viewport
// edge. Below lg the quote drops away entirely rather than stacking, because on a phone
// the form should own the fold.
//
// Every value here comes from the token layer (DESIGN.md): the exchange is the hero, so
// these screens stay quiet and let the single amber submit carry the page's one accent.

export type AuthQuote = {
  body: string;
  attribution: string;
  role: string;
};

// Scope Clerk's fluid sizing to these two forms, not the global provider or MFA UI.
// All three layers must shrink: Clerk's default card width exceeds a phone's panel.
export const clerkAuthAppearance = {
  elements: {
    rootBox: { width: "100%", maxWidth: "100%", minWidth: 0 },
    cardBox: { width: "100%", maxWidth: "100%", minWidth: 0 },
    card: {
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      paddingInline: "clamp(var(--space-4), 5vw, 2.5rem)",
    },
  },
};

export function AuthSplit({
  heading,
  subheading,
  quote,
  points,
  footer,
  children,
}: {
  heading: string;
  subheading: string;
  quote: AuthQuote;
  points: string[];
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className={`${SHELL} flex flex-1 flex-col py-(--space-6)`}>
      <Link href="/" className="inline-flex w-fit items-center">
        <Image
          src="/design-system/assets/logo/wordmark-on-dark.svg"
          alt="Maintain Workforce"
          width={168}
          height={28}
          className="h-7 w-auto"
          priority
        />
      </Link>

      <div className="grid grid-cols-1 flex-1 items-center gap-(--space-7) py-(--space-7) lg:grid-cols-2">
        {/* ------------------------------------------------------- form column */}
        <div data-testid="auth-form-column" className="min-w-0 w-full max-w-[420px]">
          <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight text-on-dark">
            {heading}
          </h1>
          <p className="mt-(--space-2) text-body text-on-dark-muted">{subheading}</p>

          <div
            data-testid="auth-form-panel"
            className={`${PANEL} mt-(--space-6) min-w-0 p-(--space-3) sm:p-(--space-5)`}
          >
            {children}
          </div>

          <div className="mt-(--space-5) flex flex-col gap-(--space-3) text-sm text-on-dark-faint">
            <div>{footer}</div>
            <p>
              By continuing you agree to the{" "}
              <Link href="/legal/terms" className="underline underline-offset-4 hover:text-on-dark">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-on-dark">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>

        {/* -------------------------------------------- quote column (lg and up) */}
        <aside className={`${PANEL} relative hidden overflow-hidden p-(--space-7) lg:block`}>
          <Image
            src="/design-system/graphics/web/cover-2.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 0px"
            className="object-cover opacity-[0.14]"
          />
          {/* The quote mark is decoration, not content, so it is hidden from the
              accessibility tree rather than read out as a stray character. */}
          <span aria-hidden className="relative block text-[4rem] leading-none text-on-dark-faint">
            &ldquo;
          </span>
          <blockquote className="relative mt-(--space-3) text-[1.5rem] font-semibold leading-snug text-on-dark">
            {quote.body}
          </blockquote>
          <figcaption className="relative mt-(--space-5) text-body text-on-dark-muted">
            <span className="font-semibold text-on-dark">{quote.attribution}</span>
            <span className="block text-sm">{quote.role}</span>
          </figcaption>

          {/* Supporting points below a hairline, as in the reference. The numerals are
              Manrope like everything else (Single Family Rule) — the reference's serif
              is its brand, not ours. */}
          <ol className="relative mt-(--space-7) flex flex-col gap-(--space-4) border-t border-hairline pt-(--space-6)">
            {points.map((point, index) => (
              <li key={point} className="flex gap-(--space-4) text-body text-on-dark-muted">
                <span aria-hidden className="font-bold text-on-dark-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}

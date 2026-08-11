import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Reveal } from "@/components/reveal";
import { ctas, site } from "@/lib/site";
import {
  BTN_PRIMARY,
  BTN_GHOST,
  PANEL,
  H1,
  H2,
  SECTION,
  SHELL,
} from "@/lib/ui";
import { EnquiryForm } from "./enquiry-form";

// Contact: the secondary conversion. The form is the page, so it sits
// directly under a compact hero. The submit button owns this screen's amber;
// the register band at the foot owns its own.

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Talk to the Maintain Workforce team about the exchange, the pilot, or whether your trade fits.",
};

/* ---------------------------------------------------------------- hero ---- */

function Hero() {
  return (
    <section className="border-b border-hairline">
      <div className={`${SHELL} py-(--space-8) md:py-(--space-9)`}>
        {/* "Contact" eyebrow dropped: the nav link and the h1 carry it. */}
        <h1
          className={`mw-enter ${H1} max-w-2xl`}
          style={{ "--enter-step": 0 } as React.CSSProperties}
        >
          Talk to the team.
        </h1>
        <p
          className="mw-enter mt-(--space-5) max-w-[58ch] text-body-lg text-on-dark-muted"
          style={{ "--enter-step": 1 } as React.CSSProperties}
        >
          Questions about the exchange, the pilot, how it sits alongside
          QuoteMax, or whether your trade fits. The people who make the
          introductions answer this inbox.
        </p>
        <div
          className="mw-enter mt-(--space-6) flex flex-wrap items-center gap-(--space-4)"
          style={{ "--enter-step": 2 } as React.CSSProperties}
        >
          {/* The address is longer than a 320px viewport: step the pill down
              so it fits unbroken, keeping anywhere as the last-resort guard. */}
          <a
            href={`mailto:${site.email}`}
            className={`${BTN_GHOST} max-w-full [overflow-wrap:anywhere] max-[379px]:px-(--space-4) max-[379px]:text-xs`}
          >
            <Icon name="i-mail" className="size-5" />
            {site.email}
          </a>
          {/* Plain text on purpose: the number is bracketed until launch, so
              there is no tel: link to render yet. */}
          <p className="text-sm text-on-dark-faint">
            Phone number [published at launch].
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- form ---- */
/* Form left, supporting rail right on lg, one column on mobile with the form
   first. The form itself is never wrapped in Reveal. */

const WORTH_INCLUDING = [
  "The trades you run or need",
  "The region you operate in",
  "Which side of the exchange you are on right now",
  "Whether you already use QuoteMax",
];

function Enquiry() {
  return (
    <section>
      <div className={`${SHELL} ${SECTION} grid gap-(--space-7) lg:grid-cols-12`}>
        <div className="lg:col-span-7">
          <EnquiryForm />
        </div>

        <Reveal className="lg:col-span-4 lg:col-start-9">
          <div>
            <div className={`${PANEL} p-(--space-5)`}>
              <p className="font-display text-h4 font-bold text-on-dark">
                Worth including
              </p>
              <ul className="mt-(--space-4) flex flex-col gap-(--space-3)">
                {WORTH_INCLUDING.map((item) => (
                  <li key={item} className="text-body text-on-dark-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Image
              src="/generated/contact-band.jpg"
              alt=""
              width={1920}
              height={1080}
              className="mt-(--space-5) h-48 w-full rounded-(--radius-lg) object-cover"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------- before you write ---- */

function BeforeYouWrite() {
  return (
    <section className="border-t border-hairline bg-bg-deep">
      <div className={`${SHELL} py-(--space-7)`}>
        <Reveal>
          <h2 className="font-display text-h3 font-bold text-on-dark">
            Before you write.
          </h2>
          <Link
            href="/#faq"
            className="mw-cta mt-(--space-3) inline-flex min-h-11 items-center gap-(--space-2) font-semibold text-on-dark underline underline-offset-4"
          >
            The five questions everyone asks are answered on the front page.
            <Icon name="i-arrow-right" className="size-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- register band ---- */

function RegisterBand() {
  return (
    <section className="relative overflow-hidden border-t border-hairline">
      {/* The brand's closing surface: terrain art under an ink-teal scrim. */}
      <Image
        src="/design-system/graphics/web/section.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div className="relative bg-bg/50">
        <div className={`${SHELL} ${SECTION}`}>
          <Reveal className="max-w-2xl">
          <h2 className={H2}>Ready instead of curious?</h2>
          <p className="mt-(--space-4) text-body-lg text-on-dark-muted">
            Registration takes a few minutes, verification is manual, and the
            pilot is free.
          </p>
            <div className="mt-(--space-6)">
              <Link href={ctas.register.href} className={BTN_PRIMARY}>
                {ctas.register.label}
                <Icon name="i-arrow-right" className="size-5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default function ContactPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Enquiry />
      <BeforeYouWrite />
      <RegisterBand />
    </main>
  );
}

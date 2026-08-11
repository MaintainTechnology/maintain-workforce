import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { site } from "@/lib/site";
import { PANEL, H1, H2, LINK, SECTION, SHELL } from "@/lib/ui";

// Draft privacy policy: real commitments where the product defines them,
// [bracketed] where counsel must confirm. Single prose column, no images.

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Maintain Workforce collects, uses and shares company information on the workforce exchange. Draft, under legal review.",
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What we collect",
    body: (
      <>
        <p>
          We collect what the exchange needs to run, and nothing speculative:
        </p>
        <ul className="mt-(--space-3) list-disc space-y-(--space-2) pl-(--space-5)">
          <li>Your company details: legal name, trading name, trades, location.</li>
          <li>Your ABN.</li>
          <li>Contact details for the person who registers: name, email, phone.</li>
          <li>The listings you post: available crew or labour needs, with trade, headcount, area and dates.</li>
        </ul>
        <p className="mt-(--space-3)">
          We do not collect information about individual workers. The unit of
          the exchange is the company.
        </p>
      </>
    ),
  },
  {
    title: "How we use it",
    body: (
      <>
        <p>We use this information for three things:</p>
        <ul className="mt-(--space-3) list-disc space-y-(--space-2) pl-(--space-5)">
          <li>Verifying your company against the ABN register before it appears on the board.</li>
          <li>Operating the exchange: showing your listings to verified members and keeping the board current.</li>
          <li>Making the introductions you request, which in the pilot are reviewed and facilitated by a person on our team.</li>
        </ul>
      </>
    ),
  },
  {
    title: "What we share",
    body: (
      <>
        <p>
          Your company appears on the board only after verification, and only to
          verified members. Nothing is public.
        </p>
        <p className="mt-(--space-3)">
          Your contact details are shared with another company only when both
          sides agree to an introduction. Until then, the other side sees your
          listing, not your inbox.
        </p>
        <p className="mt-(--space-3)">We never sell your data. To anyone.</p>
      </>
    ),
  },
  {
    title: "Storage and access",
    body: (
      <>
        <p>
          Your data is stored with [hosting provider] under Australian
          jurisdiction [confirmed before launch].
        </p>
        <p className="mt-(--space-3)">
          You can ask for a copy of your company&apos;s record, or ask us to
          correct or delete it, by emailing{" "}
          <a href={`mailto:${site.email}`} className={LINK}>
            {site.email}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    title: "Contact",
    body: (
      <p>
        Questions about this policy go to{" "}
        <a href={`mailto:${site.email}`} className={LINK}>
          {site.email}
        </a>
        . A person reads every one.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className={`${SHELL} ${SECTION}`}>
        <div className="max-w-[65ch]">
          {/* "Legal" eyebrow dropped: the footer column already categorises
              this page and the h1 names it. */}
          <h1
            className={`mw-enter ${H1}`}
            style={{ "--enter-step": 0 } as React.CSSProperties}
          >
            Privacy policy.
          </h1>

          <div
            className={`mw-enter ${PANEL} mt-(--space-6) p-(--space-5)`}
            style={{ "--enter-step": 1 } as React.CSSProperties}
          >
            <p className="font-display font-bold text-on-dark">Draft for review</p>
            <p className="mt-(--space-3) text-body text-on-dark-muted">
              This document is a working draft and is reviewed by [counsel]
              before launch. It is published so you can see what we intend.
            </p>
          </div>

          {SECTIONS.map(({ title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <section className="mt-(--space-8)">
                <h2 className={H2}>{title}</h2>
                <div className="mt-(--space-4) text-body text-on-dark-muted">
                  {body}
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}

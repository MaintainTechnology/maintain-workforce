import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { site } from "@/lib/site";
import { PANEL, H1, H2, LINK, SECTION, SHELL } from "@/lib/ui";

// Draft terms of use: real commitments where the product defines them,
// [bracketed] where counsel must confirm. Single prose column, no images.

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms of using Maintain Workforce, the B2B workforce exchange for construction companies. Draft, under legal review.",
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "The service",
    body: (
      <>
        <p>
          Maintain Workforce is a facilitated B2B introduction service between
          verified construction companies. One company lists available crew,
          another posts a labour need, and we introduce the two.
        </p>
        <p className="mt-(--space-3)">
          We do not employ, supply or on-hire workers. Crews stay with their
          employer at all times. When an introduction leads to work, the two
          companies contract with each other directly; we are not a party to
          that contract.
        </p>
      </>
    ),
  },
  {
    title: "Your part",
    body: (
      <>
        <p>By registering and listing, you agree to keep three things true:</p>
        <ul className="mt-(--space-3) list-disc space-y-(--space-2) pl-(--space-5)">
          <li>Your company details are accurate and stay current.</li>
          <li>Your ABN is valid and belongs to the company you register.</li>
          <li>Your listings reflect real capacity or a real need, not placeholders.</li>
        </ul>
        <p className="mt-(--space-3)">
          [Listings that turn out to be false can be removed, and repeated
          false listings can end a membership. Enforcement terms confirmed with
          counsel before launch.]
        </p>
      </>
    ),
  },
  {
    title: "Introductions",
    body: (
      <>
        <p>
          We verify both companies and make the introduction. [The terms of
          engagement between matched companies are their own]: rates, scope,
          insurance and site conditions are agreed between the two businesses.
        </p>
        <p className="mt-(--space-3)">
          Our role ends at the introduction [subject to legal review].
        </p>
      </>
    ),
  },
  {
    title: "The pilot",
    body: (
      <>
        <p>
          The service is free during the pilot. There are no listing fees,
          introduction fees or margins on labour.
        </p>
        <p className="mt-(--space-3)">
          [Pricing terms will be published before any charging starts, and
          nothing agreed to while the service was free will be charged for
          retroactively.]
        </p>
      </>
    ),
  },
  {
    title: "Liability",
    body: (
      <p>
        [The liability and insurance model is being confirmed with counsel
        before launch. This section will state plainly what we are responsible
        for and what remains between the contracting companies. We will not
        publish vague liability language and call it protection.]
      </p>
    ),
  },
  {
    title: "Contact",
    body: (
      <p>
        Questions about these terms go to{" "}
        <a href={`mailto:${site.email}`} className={LINK}>
          {site.email}
        </a>
        . A person reads every one.
      </p>
    ),
  },
];

export default function TermsPage() {
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
            Terms of use.
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

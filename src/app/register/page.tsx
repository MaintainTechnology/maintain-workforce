import type { Metadata } from "next";
import Image from "next/image";
import { Reveal } from "@/components/reveal";
import { PANEL, H1, SHELL } from "@/lib/ui";
import { RegisterForm } from "./register-form";

// The primary conversion page. The form IS the page: compact intro, then the
// form, nothing above it competing. The right rail (lg only) answers "then
// what" without pulling attention from the submit, which owns the page's amber.

export const metadata: Metadata = {
  title: "Register your company",
  description:
    "Register your construction company on Maintain Workforce. A person verifies your ABN, your company appears on the board, and the pilot is free.",
};

// Concierge verification is the v1 product, not a stopgap: a person checks the
// ABN, the licence and the insurance before anything goes live. Facts we
// cannot promise stay bracketed.
const NEXT_STEPS = [
  "We verify your ABN, licence and insurance, usually [same day].",
  "Your company appears on the board, visible only to other verified members.",
  "You list a need or available crew and request introductions.",
];

// Registration is one door for both postures: the same company is short a crew
// one month and carrying an idle one the next (blueprint: one audience, two
// postures).
const POSTURES = [
  {
    title: "You need labour",
    body: "You have won work beyond your current crew. Post the need and we find a verified company that can cover it.",
  },
  {
    title: "You have labour available",
    body: "A project is ending and the crew is about to stand idle. List the capacity and we find the site that needs it.",
  },
];

export default function RegisterPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className={`${SHELL} py-(--space-8) md:py-(--space-9)`}>
        <div className="grid gap-(--space-7) lg:grid-cols-12">
          <div className="lg:col-span-7">
            {/* "Company registration" eyebrow dropped: the h1 and the submit
                button both carry the words; the heading stands alone. */}
            <h1
              className={`mw-enter ${H1}`}
              style={{ "--enter-step": 0 } as React.CSSProperties}
            >
              Get your company on the board.
            </h1>
            <p
              className="mw-enter mt-(--space-4) max-w-[52ch] text-body-lg text-on-dark-muted"
              style={{ "--enter-step": 1 } as React.CSSProperties}
            >
              A few minutes, and the pilot is free. Verification is manual: a
              person checks your ABN, licence and insurance before your company
              goes live.
            </p>

            {/* Forms are never animated. */}
            <div className="mt-(--space-7)">
              <RegisterForm />
            </div>
          </div>

          {/* The rail reads as a sidebar on lg and falls under the form on
              smaller screens. It was previously hidden below lg, which left
              every phone visitor submitting the form with no idea what
              happens next. */}
          <Reveal className="lg:col-span-5">
            {/* Sticky on lg so the rail travels with the long form instead of
                stranding a tall empty column beside it. */}
            <aside className="lg:sticky lg:top-[84px]">
              <div className={`${PANEL} p-(--space-6)`}>
                <h2 className="font-display text-h3 font-bold text-on-dark">
                  What happens next
                </h2>
                <ol className="mt-(--space-5) flex flex-col gap-(--space-4)">
                  {NEXT_STEPS.map((body, i) => (
                    <li key={body} className="flex gap-(--space-3)">
                      <span className="font-display text-sm font-bold text-on-dark-faint">
                        {i + 1}.
                      </span>
                      <span className="text-body text-on-dark-muted">
                        {body}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {/* Scaffold elevation at dusk. The photograph is already dark
                  enough that it sits under the submit button rather than
                  competing with it, so it does not need the heavy dimming the
                  old amber wireframe did (DESIGN.md Hi-Vis Rule). */}
              <Image
                src="/generated/register-side.jpg"
                alt=""
                width={1000}
                height={560}
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="mt-(--space-5) hidden h-64 w-full rounded-(--radius-lg) border border-hairline object-cover opacity-90 lg:block"
              />
            </aside>
          </Reveal>
        </div>
      </section>

      {/* One door, two postures. The same company arrives on either side
          depending on the month, so registration never asks them to choose an
          identity, only a listing. */}
      <section className="border-t border-hairline bg-bg-deep">
        <div className={`${SHELL} py-(--space-7)`}>
          <Reveal>
            <h2 className="font-display text-h3 font-bold text-on-dark">
              One registration, either side of the exchange.
            </h2>
          </Reveal>
          <div className="mt-(--space-5) grid gap-(--space-5) md:grid-cols-2">
            {POSTURES.map(({ title, body }, i) => (
              <Reveal key={title} delay={i * 0.08}>
                <div className={`${PANEL} h-full p-(--space-5)`}>
                  <h3 className="font-display text-h4 font-bold text-on-dark">
                    {title}
                  </h3>
                  <p className="mt-(--space-3) text-body text-on-dark-muted">
                    {body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.16}>
            <p className="mt-(--space-5) max-w-[60ch] text-sm text-on-dark-faint">
              Most companies are both across a year. You list whichever is true
              this month and change it whenever it changes.
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Reveal } from "@/components/reveal";
import { RevealImage } from "@/components/reveal-image";
import { ctas, site } from "@/lib/site";
import { BTN_PRIMARY, BTN_GHOST, H1, H2, LABEL, PANEL, SECTION, SHELL } from "@/lib/ui";

// About: what this venture is and why now, for investors, early companies and
// future employees. Six sections: hero → the two states → image band →
// mission → how we run it (with roadmap) → the Maintain family + CTAs.

export const metadata: Metadata = {
  title: "About",
  description:
    "Maintain Workforce is Australia's B2B workforce exchange, where construction companies share skilled crews directly.",
};

/* ---------------------------------------------------------------- hero ---- */

function Hero() {
  return (
    <section className="border-b border-hairline">
      <div className={`${SHELL} py-(--space-8) md:py-(--space-9)`}>
        <div className="max-w-3xl">
          {/* Strapline, not an eyebrow: sentence case, no tracking. */}
          <p
            className="mw-enter font-semibold text-on-dark-muted"
            style={{ "--enter-step": 0 } as React.CSSProperties}
          >
            {site.venture}
          </p>
          <h1
            className={`mw-enter ${H1} mt-(--space-4)`}
            style={{ "--enter-step": 0 } as React.CSSProperties}
          >
            The workforce layer construction is missing.
          </h1>
          <p
            className="mw-enter mt-(--space-5) max-w-[58ch] text-body-lg text-on-dark-muted"
            style={{ "--enter-step": 1 } as React.CSSProperties}
          >
            Our group already helps construction companies win work. Maintain
            Workforce is the other half of that job: the B2B exchange where
            they find the crew to deliver it.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ the two states ---- */

const STATES = [
  {
    title: "Won work, no crew",
    body: "A company wins a job beyond its current capacity. Recruitment is built for permanent roles and cannot start a crew in three weeks, so the work sits at risk.",
  },
  {
    title: "Idle crew, no work",
    body: "A project ends before the next one starts. Wages run on a crew with nothing to bill, or good tradespeople get stood down and many never come back.",
  },
];

function TwoStates() {
  return (
    <section className="border-b border-hairline bg-bg-deep">
      <div className={`${SHELL} ${SECTION}`}>
        <Reveal>
          <h2 className={`${H2} max-w-2xl`}>Two states, one problem.</h2>
          <p className="mt-(--space-4) max-w-[60ch] text-body-lg text-on-dark-muted">
            Construction runs on project cycles that never line up. Companies
            win work they cannot crew while other companies pay crews they
            cannot deploy. The only established fix is a labour hire middleman
            who takes a margin and owns the relationship.
          </p>
        </Reveal>
        <div className="mt-(--space-7) grid gap-(--space-5) md:grid-cols-2">
          {STATES.map(({ title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className={`${PANEL} h-full p-(--space-6)`}>
                <h3 className="font-display text-h3 font-bold text-on-dark">
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
          <p className="mt-(--space-6) max-w-2xl text-body-lg font-semibold text-on-dark">
            Both exist at the same time, in the same city, in the same trade.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- image band ---- */

function ImageBand() {
  // RevealImage, not Reveal: a full-width photograph earns the unclip — it
  // uncovers as you scroll instead of sliding in like a paragraph.
  return (
    <section className={`${SHELL} ${SECTION}`}>
      <RevealImage>
        <Image
          src="/generated/about-band.jpg"
          alt=""
          width={1920}
          height={1080}
          sizes="(min-width: 1400px) 1200px, 100vw"
          className="h-[280px] w-full rounded-(--radius-lg) object-cover sm:h-[380px]"
        />
      </RevealImage>
    </section>
  );
}

/* -------------------------------------------------------------- mission ---- */

const MISSION = [
  {
    point: "Keep workers employed.",
    clause: "Crews stay on their employer's books because the next job is on the board.",
  },
  {
    point: "Help businesses grow.",
    clause: "Companies take on work beyond current capacity without permanent hires.",
  },
  {
    point: "Reduce labour shortages.",
    clause: "Skilled crews that already exist reach the sites that need them.",
  },
  {
    point: "Reduce workforce downtime.",
    clause: "The gap between projects gets filled instead of paid for.",
  },
  {
    point: "Create a trusted workforce ecosystem.",
    clause: "Verified companies deal with each other directly, again and again.",
  },
];

function Mission() {
  return (
    <section className={`${SHELL} ${SECTION} pt-0`}>
      <Reveal>
        <h2 className={`${H2} max-w-2xl`}>Why we exist.</h2>
      </Reveal>
      <div className="mt-(--space-6) divide-y divide-hairline border-t border-hairline">
        {MISSION.map(({ point, clause }, i) => (
          <Reveal key={point} delay={i * 0.06}>
            <p className="max-w-3xl py-(--space-5) text-body-lg">
              <span className="font-semibold text-on-dark">{point}</span>{" "}
              <span className="text-on-dark-muted">{clause}</span>
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- how we run it ---- */

const ROADMAP = [
  {
    version: "V1 · NOW",
    title: "Validate liquidity",
    body: "Website, listings, manual introductions.",
  },
  {
    version: "V2 · ROADMAP",
    title: "Trust and signal",
    body: "Notifications, ratings, self-serve verification.",
  },
  {
    version: "V3 · ROADMAP",
    title: "Intelligence and integration",
    body: "Matching, QuoteMax, scheduling.",
  },
];

function HowWeRunIt() {
  return (
    <section className="relative overflow-hidden border-y border-hairline bg-bg-deep">
      {/* Texture, not mode: brand gradient art held far under the text ramp. */}
      <Image
        src="/design-system/graphics/web/gradient.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.14]"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <Reveal>
          <h2 className={`${H2} max-w-2xl`}>Deliberately manual.</h2>
          <div className="mt-(--space-5) max-w-[60ch] space-y-(--space-4) text-body-lg text-on-dark-muted">
            <p>
              Every company is ABN-verified before it appears on the board, and
              in v1 every introduction is made by a person on our team who
              reviews both sides. Trust comes before automation.
            </p>
            <p>
              That is deliberate. Watching hundreds of manual matches shows
              what works, what fails, and what both sides ask. That record is
              what makes future automation credible; we automate what we have
              proven by hand.
            </p>
          </div>
        </Reveal>
        <div className="mt-(--space-7) divide-y divide-hairline border-t border-hairline">
          {ROADMAP.map(({ version, title, body }, i) => (
            <Reveal key={version} delay={i * 0.06}>
              <div className="grid gap-(--space-3) py-(--space-5) md:grid-cols-12 md:gap-(--space-6)">
                {/* Version stamps are operational labels: the Label style. */}
                <p className={`${LABEL} md:col-span-3`}>{version}</p>
                <h3 className="font-display text-h4 font-bold text-on-dark md:col-span-4">
                  {title}
                </h3>
                <p className="text-body text-on-dark-muted md:col-span-5">
                  {body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- family ---- */

function Family() {
  return (
    <section className="mw-glow-band">
      <div className={`${SHELL} ${SECTION}`}>
        <Reveal className="max-w-2xl">
          <h2 className={H2}>Part of the Maintain group.</h2>
          <div className="mt-(--space-4) space-y-(--space-4) text-body-lg text-on-dark-muted">
            <p>
              Maintain Workforce is a Maintain / The Pep Collective venture and
              the sister product to QuoteMax. {site.groupLine} One helps a
              company get paid to turn up and convert the quote; the other makes
              sure the crew exists when the job starts.
            </p>
            <p>
              They are separate products and you can use either on its own. A
              won job does not yet surface its own labour gap on the exchange:
              that integration is v3 roadmap, not shipped.
            </p>
          </div>
          <div className="mt-(--space-6) flex flex-wrap items-center gap-(--space-4)">
            <Link href={ctas.signUp.href} className={BTN_PRIMARY}>
              {ctas.signUp.label}
              <Icon name="i-arrow-right" className="size-5" />
            </Link>
            <Link href={ctas.contact.href} className={BTN_GHOST}>
              {ctas.contact.label}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <TwoStates />
      <ImageBand />
      <Mission />
      <HowWeRunIt />
      <Family />
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";
import { Chip, TradePill } from "@/components/chip";
import { ExchangeLedger } from "@/components/exchange-ledger";
import { Faq } from "@/components/faq";
import { Icon } from "@/components/icon";
import { Reveal } from "@/components/reveal";
import { RevealImage } from "@/components/reveal-image";
import {
  FAQ_ITEMS,
  LOOP_STAGES,
  PILOT_REGION,
  SAMPLE_DEMAND,
  SAMPLE_SUPPLY,
  TRADES,
} from "@/lib/content";
import { ctas, site } from "@/lib/site";
import { BTN_PRIMARY, BTN_GHOST, H1, H2, LABEL, PANEL, SECTION, SHELL } from "@/lib/ui";

// Maintain Workforce homepage. Section order:
// hero (the exchange) → problem ledger → the loop (win it / crew it / deliver
// it) → how it works → marketplace preview → trades → why us → FAQ → CTA band.
//
// The loop is the spine: QuoteMax wins the work, Maintain Workforce crews it.
// The two are separate products that stand on their own today; the automated
// handoff between them is roadmap and is labelled as roadmap wherever it
// appears (PRODUCT.md honesty rules).
//
// Amber budget: exactly one primary amber per viewport (DESIGN.md Hi-Vis
// Rule). Every section's amber is its CTA; generated art is texture held far
// under the text ramp and never carries meaning.

/* ---------------------------------------------------------------- hero ---- */

function Hero() {
  // The signature brand surface belongs to the home hero (DESIGN.md §5). The
  // grid and glow are the section's own background layers; above them sits the
  // exchange photographed literally — an active scaffolded site and a dormant
  // steel frame either side of one road — under a left-weighted scrim that
  // keeps the headline column at full contrast.
  return (
    <section className="mw-grid-bg mw-glow relative overflow-hidden border-b border-hairline">
      {/* mw-hero-image: the photograph settles off a slight zoom while the
          copy staggers in — one arrival, not a static pop. */}
      <Image
        src="/generated/hero-exchange.jpg"
        alt=""
        fill
        sizes="100vw"
        priority
        className="mw-hero-image object-cover opacity-[0.55]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/40"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <div className="max-w-3xl">
          {/* Strapline, not an eyebrow: sentence case, no tracking, no caps. */}
          <p
            className="mw-enter font-semibold text-on-dark-muted"
            style={{ "--enter-step": 0 } as React.CSSProperties}
          >
            {site.tagline}
          </p>
          <h1
            className={`mw-enter ${H1} mt-(--space-4)`}
            style={{ "--enter-step": 0 } as React.CSSProperties}
          >
            You won the work. Now crew it.
          </h1>
          <p
            className="mw-enter mt-(--space-5) max-w-[58ch] text-body-lg text-on-dark-muted"
            style={{ "--enter-step": 1 } as React.CSSProperties}
          >
            Winning the job is half of it. Maintain Workforce is the exchange
            where construction companies share skilled crews with each other
            directly, so won work never sits waiting on labour and idle crews
            never sit waiting on work.
          </p>
          <div
            className="mw-enter mt-(--space-6) flex flex-wrap items-center gap-(--space-4)"
            style={{ "--enter-step": 2 } as React.CSSProperties}
          >
            <Link href={ctas.signUp.href} className={BTN_PRIMARY}>
              {ctas.signUp.label}
              <Icon name="i-arrow-right" className="size-5" />
            </Link>
            <Link href="#how" className={BTN_GHOST}>
              How it works
            </Link>
          </div>
        </div>

        <div
          className="mw-enter mt-(--space-8)"
          style={{ "--enter-step": 2 } as React.CSSProperties}
        >
          <ExchangeLedger />
        </div>

        {/* Trust strip: docket facts, not marketing claims. Sentence case:
            caps are for the Label style's short operational strings, and
            these are claims, not statuses. */}
        <ul
          className="mw-enter mt-(--space-7) flex flex-wrap items-center gap-x-(--space-6) gap-y-(--space-3) border-t border-hairline pt-(--space-5)"
          style={{ "--enter-step": 3 } as React.CSSProperties}
        >
          {[
            "4 trades",
            "ABN, licence and insurance verified",
            PILOT_REGION,
            "Introductions by a person",
          ].map((item) => (
            <li key={item} className="text-sm font-semibold text-on-dark-faint">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- problem ---- */
/* A 4-cell cost ledger. Stark, not salesy: each cell names a cost the
   industry already knows. No invented numbers anywhere. */

const COSTS = [
  {
    label: "Won work at risk",
    body: "The job is signed and the crew to deliver it does not exist in-house this month. Winning it was never the hard part.",
  },
  {
    label: "Idle crews",
    body: "Wages run while nothing is billed. Good tradespeople get stood down, and many of them never come back.",
  },
  {
    label: "Recruitment delays",
    body: "Hiring is built for permanent roles. It cannot source, screen and start a crew for a three-week block.",
  },
  {
    label: "Labour hire margins",
    body: "The middleman solves the shortage but takes a margin and owns the relationship. You rent strangers.",
  },
];

function Problem() {
  return (
    <section className="relative overflow-hidden border-b border-hairline bg-bg-deep">
      {/* Texture, not mode: a stalled site at dusk — unused rebar and timber,
          an idle scissor lift, empty scaffold bays — with an active building
          burning amber in the distance. Held under the text ramp. */}
      <Image
        src="/generated/problem-imbalance.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.34]"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <Reveal>
          <h2 className={`${H2} max-w-2xl`}>
            The same day, the same city: crews idle here, shortages there.
          </h2>
        </Reveal>
        {/* gap-px over the hairline token paints the 1px cell separators. */}
        <div className="mt-(--space-7) grid gap-px overflow-hidden rounded-(--radius-lg) border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {COSTS.map(({ label, body }, i) => (
            <Reveal key={label} delay={i * 0.06} className="bg-bg-deep">
              <div className="h-full p-(--space-5)">
                {/* Category heading over prose, not operational data: sentence
                    case, no caps (Caps-For-Labels-Only Rule). */}
                <p className="text-sm font-semibold text-on-dark-faint">{label}</p>
                <p className="mt-(--space-3) text-body text-on-dark-muted">
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

/* ------------------------------------------------------------ the loop ---- */
/* The group positioning section, and the page's spine: winning work and
   crewing it are one cycle. QuoteMax is a live product and Maintain Workforce
   is the exchange; both stand alone. The automated handoff between them is
   roadmap, and the stage that describes it says so on its own chip. */

function Loop() {
  return (
    <section id="loop" className="relative overflow-hidden border-b border-hairline">
      <Image
        src="/generated/quotemax-band.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.32]"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <Reveal>
          <h2 className={`${H2} max-w-3xl`}>{site.groupLine}</h2>
          <p className="mt-(--space-4) max-w-[60ch] text-body-lg text-on-dark-muted">
            Two products from the same group, either side of the same job. You
            can use one without the other; most companies meet us at whichever
            end is hurting this month.
          </p>
        </Reveal>

        <ol className="mt-(--space-7) grid gap-(--space-5) lg:grid-cols-3">
          {LOOP_STAGES.map(({ stage, product, body, status }, i) => (
            <Reveal key={stage} delay={i * 0.08}>
              <li className={`${PANEL} flex h-full list-none flex-col p-(--space-6)`}>
                <div className="flex items-baseline gap-(--space-3)">
                  {/* Order carries meaning here, so the numeral stays. Faint,
                      not amber: on a static page no stage is "active". */}
                  <span className="font-display text-h3 font-extrabold text-on-dark-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-h3 font-bold text-on-dark">
                    {stage}
                  </h3>
                </div>
                <p className="mt-(--space-4) text-sm font-semibold text-on-dark-faint">
                  {product}
                </p>
                <p className="mt-(--space-3) flex-1 text-body text-on-dark-muted">
                  {body}
                </p>
                <div className="mt-(--space-5) border-t border-hairline pt-(--space-4)">
                  <Chip variant="neutral">{status}</Chip>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={0.24}>
          <p className="mt-(--space-6) max-w-[60ch] text-sm text-on-dark-faint">
            QuoteMax and Maintain Workforce are separate products today. A won
            job does not yet surface its own labour gap on the exchange; that
            integration is roadmap, and we will not pretend otherwise.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- how it works ---- */
/* Three real steps. Numbering is legitimate here: order carries meaning. */

const STEPS = [
  {
    n: "01",
    title: "List one thing",
    body: "Register your company with its ABN, then post either a labour need or your available crew: trade, location, headcount, dates. Verification is manual and fast.",
  },
  {
    n: "02",
    title: "See your counterpart",
    body: "Browse verified companies filtered by trade, location and availability. The other side of your problem is usually already on the board.",
  },
  {
    n: "03",
    title: "Request the introduction",
    body: "A person on our team reviews both companies and connects you directly. You contract with each other; the workforce stays with its employer.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className={`${SHELL} ${SECTION}`}>
      {/* No eyebrow: "How it works" already names this section in the nav and
          the section id; the heading stands alone (Hi-Vis Standard). */}
      <Reveal>
        <h2 className={`${H2} max-w-2xl`}>
          From short-staffed to crewed, in three steps.
        </h2>
      </Reveal>

      {/* Content image, not texture: it carries the same three-stage shape as
          the steps below it. */}
      <RevealImage className="mt-(--space-6)">
        <Image
          src="/generated/how-steps.jpg"
          alt=""
          width={1600}
          height={679}
          sizes="(min-width: 1400px) 1200px, 100vw"
          className="h-[180px] w-full rounded-(--radius-lg) border border-hairline object-cover sm:h-[240px]"
        />
      </RevealImage>

      <div className="mt-(--space-6) grid gap-(--space-5) lg:grid-cols-3">
        {STEPS.map(({ n, title, body }, i) => (
          <Reveal key={n} delay={i * 0.08}>
            <div className={`${PANEL} h-full p-(--space-6)`}>
              {/* Numbered steps keep their numerals: order carries meaning.
                  Faint, not amber: on a static page no step is "active", and
                  amber marks the next action only. */}
              <p className="font-display text-h3 font-extrabold text-on-dark-faint">{n}</p>
              <h3 className="mt-(--space-4) font-display text-h3 font-bold text-on-dark">
                {title}
              </h3>
              <p className="mt-(--space-3) text-body text-on-dark-muted">
                {body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------- marketplace preview ---- */
/* Three sample cards: available / need / available. Anonymous by design: the
   live board opens with verified SE QLD businesses, and the marketing site
   does not invent company names. */

const PREVIEW = [
  { ...SAMPLE_SUPPLY[1], kind: "supply" as const, descriptor: "Carpentry subcontractor" },
  { ...SAMPLE_DEMAND[1], kind: "demand" as const, descriptor: "Plumbing contractor" },
  { ...SAMPLE_SUPPLY[2], kind: "supply" as const, descriptor: "Electrical subcontractor" },
];

function MarketplacePreview() {
  return (
    <section
      id="marketplace"
      className="relative overflow-hidden border-y border-hairline bg-bg-deep"
    >
      {/* Texture, not mode: an overhead laydown yard, material bundles racked
          in an orderly grid with a few bays floodlit — a board of stock, read
          literally. Held far under the text ramp. */}
      <Image
        src="/generated/marketplace-board.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.30]"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <Reveal>
          <h2 className={`${H2} max-w-2xl`}>
            A board of verified companies, not a feed of ads.
          </h2>
        </Reveal>

        <div className="mt-(--space-7) grid gap-(--space-5) md:grid-cols-3">
          {PREVIEW.map(({ code, area, crew, window: win, kind, descriptor }, i) => (
            <Reveal key={`${code}-${area}`} delay={i * 0.08}>
              <article className={`${PANEL} flex h-full flex-col p-(--space-5)`}>
                <div className="flex items-center gap-(--space-3)">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-black-2 font-display text-h4 font-bold text-on-dark-muted"
                  >
                    {code[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-on-dark">{descriptor}</p>
                    <p className={LABEL}>ABN VERIFIED · {area.toUpperCase()}</p>
                  </div>
                </div>
                <div className="mt-(--space-4) flex flex-wrap items-center gap-(--space-2)">
                  <TradePill code={code} />
                  <Chip variant="verified">ABN ✓</Chip>
                  {win === "AVAIL NOW" ? (
                    <Chip variant="live" dot>
                      AVAILABLE NOW
                    </Chip>
                  ) : null}
                </div>
                <p className="mt-(--space-4) text-sm text-on-dark-muted">
                  {kind === "supply" ? `${crew} crew · ${win}` : `Needs ${crew} · ${win}`}
                </p>
                <p className="mt-auto pt-(--space-5) text-sm text-on-dark-faint">
                  <span className="block border-t border-hairline pt-(--space-4)">
                    Sample listing. Register to see the live board and request an
                    introduction.
                  </span>
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="mt-(--space-7)">
            <Link href={ctas.signUp.href} className={BTN_GHOST}>
              Register to browse the live board
              <Icon name="i-arrow-right" className="size-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- trades ---- */
/* Four pilot trades with their trade codes and generated brand art. */

function Trades() {
  return (
    <section id="trades" className={`${SHELL} ${SECTION}`}>
      <Reveal>
        <h2 className={`${H2} max-w-2xl`}>Four trades, {PILOT_REGION}.</h2>
        <p className="mt-(--space-4) max-w-[60ch] text-body-lg text-on-dark-muted">
          We open where verified supply already exists, so the board is alive on
          day one. Civil and commercial construction follow.
        </p>
      </Reveal>

      <div className="mt-(--space-7) grid gap-(--space-5) sm:grid-cols-2 lg:grid-cols-4">
        {TRADES.map(({ code, name, blurb }, i) => (
          <Reveal key={code} delay={i * 0.06}>
            <article className={`${PANEL} h-full overflow-hidden`}>
              {/* h-40, not h-32: at 128px a trade photograph is too small to
                  read as its trade. The images are tight macro details for the
                  same reason. */}
              <div className="relative h-40">
                <Image
                  src={`/generated/trade-${code.toLowerCase()}.jpg`}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-(--space-5)">
                <TradePill code={code} />
                <h3 className="mt-(--space-3) font-display text-h4 font-bold text-on-dark">
                  {name}
                </h3>
                <p className="mt-(--space-2) text-sm text-on-dark-muted">{blurb}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- why us ---- */
/* Reframes what it is not into what it is (blueprint §2). */

const WHY = [
  {
    not: "Not a labour hire company",
    is: "Direct, company to company",
    body: "We never employ or on-hire workers and take no margin on their time. Crews stay with their employer; you deal with their business, not a middleman.",
  },
  {
    not: "Not a recruitment agency",
    is: "Built for temporary capacity",
    body: "No placement fees, no permanent hires. A crew for three weeks is a normal transaction here, not an exception recruiters cannot price.",
  },
  {
    not: "Not a job board",
    is: "A closed, verified network",
    body: "Nothing is advertised to the public. Every company on the board holds a verified ABN, the licence its trade requires and current insurance.",
  },
  {
    not: "Not a gig marketplace",
    is: "Businesses, never individuals",
    body: "The match is between two companies that can work together again next month. We never list a person, and you never pick one off a shelf.",
  },
];

function WhyMaintainWorkforce() {
  return (
    <section className="relative overflow-hidden border-y border-hairline bg-bg-deep">
      {/* Texture, not mode: brand terrain art held far under the text ramp.
          Stays at 0.18 while the photographic sections sit nearer 0.32: this
          is bright amber line art, not a dark dusk photograph, so it reaches
          the same visual weight at a much lower opacity. */}
      <Image
        src="/design-system/graphics/web/mountain-forms-1.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.18]"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <Reveal>
          <h2 className={`${H2} max-w-2xl`}>
            What this is, said by what it is not.
          </h2>
        </Reveal>
        <div className="mt-(--space-7) divide-y divide-hairline border-t border-hairline">
          {WHY.map(({ not, is, body }, i) => (
            <Reveal key={not} delay={i * 0.06}>
              <div className="grid gap-(--space-3) py-(--space-6) md:grid-cols-12 md:gap-(--space-6)">
                {/* Classifier phrase, not a status: sentence case, quiet, so
                    it never reads as a tracked-caps eyebrow when the grid
                    stacks on mobile. */}
                <p className="text-sm font-semibold text-on-dark-faint md:col-span-3">
                  {not}
                </p>
                <h3 className="font-display text-h3 font-bold text-on-dark md:col-span-4">
                  {is}
                </h3>
                <p className="max-w-[52ch] text-body text-on-dark-muted md:col-span-5">
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

/* ----------------------------------------------------------------- faq ---- */

function FaqSection() {
  return (
    <section id="faq" className="relative overflow-hidden border-t border-hairline bg-bg-deep">
      {/* Texture, not mode: a macro of a bolted structural moment connection —
          trust as an engineered fact rather than a claim. Anchored right so it
          fills the column the max-w-3xl question list leaves empty, rather
          than sitting under the questions. */}
      <Image
        src="/generated/faq-trust.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-right opacity-[0.32]"
      />
      <div className={`${SHELL} ${SECTION} relative`}>
        <Reveal>
          <h2 className={`${H2} max-w-2xl`}>Asked before joining.</h2>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mt-(--space-7) max-w-3xl">
            <Faq items={[...FAQ_ITEMS]} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ CTA band ---- */

function CtaBand() {
  return (
    <section className="relative overflow-hidden border-t border-hairline">
      {/* The brand's closing surface: terrain art under an ink-teal scrim.
          The page theme is locked dark, so the band changes texture, not
          mode. */}
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
            <h2 className={H2}>Get on the board.</h2>
            <p className="mt-(--space-4) text-body-lg text-on-dark-muted">
              Registration takes a few minutes: company, ABN, trades, and which
              side you are on this month. Verification is manual, and the pilot
              is free.
            </p>
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
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Problem />
      <Loop />
      <HowItWorks />
      <MarketplacePreview />
      <Trades />
      <WhyMaintainWorkforce />
      <FaqSection />
      <CtaBand />
    </main>
  );
}

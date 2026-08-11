import { Chip, TradePill } from "@/components/chip";
import { SAMPLE_DEMAND, SAMPLE_SUPPLY } from "@/lib/content";
import { LABEL, PANEL } from "@/lib/ui";
import { cn } from "@/lib/utils";

// The hero signature: a live two-sided ledger. Supply on one side, demand on
// the other, a match node between them. The thesis is visible in three
// seconds: crews over here, shortages over there, we connect them. Entries
// are deliberately anonymous samples (trade + area + shape), labelled
// illustrative: the live board ships with verified SE QLD businesses.
//
// Amber budget on this component: the match node's live dot only. Chips run
// the Dot-and-Label pattern on the status ramp; everything else stays on the
// quiet on-dark ramp.

function LedgerRow({
  code,
  area,
  crew,
  window: win,
  kind,
}: {
  code: string;
  area: string;
  crew: number;
  window: string;
  kind: "supply" | "demand";
}) {
  const live = win === "AVAIL NOW";
  // Two deliberate lines on a phone, one line from sm up. Free-wrapping this
  // row let a long availability window fall onto its own line for some entries
  // and not others, so the ledger read as ragged rows of uneven height. Fixing
  // the break point makes every row the same shape at any width.
  return (
    <li className="flex flex-col gap-(--space-2) border-b border-hairline px-(--space-4) py-(--space-3) last:border-b-0 sm:flex-row sm:items-center sm:gap-(--space-3)">
      <div className="flex min-w-0 items-center gap-(--space-3)">
        <TradePill code={code} />
        <span className="truncate text-sm font-medium text-on-dark-muted">
          {area}
        </span>
      </div>
      <div className="flex items-center gap-(--space-3) sm:ml-auto">
        <span className={LABEL}>
          {kind === "supply" ? `${crew} CREW` : `NEEDS ${crew}`}
        </span>
        {live ? (
          <Chip variant="live" dot>
            {win}
          </Chip>
        ) : (
          <span className={LABEL}>{win}</span>
        )}
      </div>
    </li>
  );
}

export function ExchangeLedger() {
  return (
    <figure aria-label="Illustration of the workforce exchange: available crews matched to labour needs">
      <div className="grid items-center gap-(--space-3) lg:grid-cols-[1fr_auto_1fr]">
        {/* Supply column */}
        <div className={PANEL}>
          <p className={`border-b border-hairline px-(--space-4) py-(--space-3) ${LABEL}`}>
            Available workforce
          </p>
          <ul>
            {SAMPLE_SUPPLY.map((row) => (
              <LedgerRow key={`${row.code}-${row.area}`} {...row} kind="supply" />
            ))}
          </ul>
        </div>

        {/* Match node: works horizontal between stacked columns on mobile and
            as the hinge between side-by-side columns on desktop. */}
        <div
          className="mx-auto flex items-center gap-(--space-2) rounded-(--radius-pill) border border-hairline bg-black-2 px-(--space-4) py-(--space-2)"
          aria-hidden="true"
        >
          {/* Status-active, like every live dot in the system: amber marks
              the next action, and a decoration is not one. */}
          <span className="mw-dot-live size-2 shrink-0 rounded-(--radius-pill) bg-status-active" />
          <span className={cn(LABEL, "text-on-dark-muted")}>Match</span>
        </div>

        {/* Demand column */}
        <div className={PANEL}>
          <p className={`border-b border-hairline px-(--space-4) py-(--space-3) ${LABEL}`}>
            Needs labour
          </p>
          <ul>
            {SAMPLE_DEMAND.map((row) => (
              <LedgerRow key={`${row.code}-${row.area}`} {...row} kind="demand" />
            ))}
          </ul>
        </div>
      </div>
      {/* Sentence case: this is a sentence, and body copy never sets in caps
          (DESIGN.md Caps-For-Labels-Only Rule). */}
      <figcaption className="mt-(--space-3) text-center text-sm text-on-dark-faint">
        Illustrative. The live board opens with verified SE QLD businesses.
      </figcaption>
    </figure>
  );
}

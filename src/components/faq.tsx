"use client";

import { useId, useState } from "react";
import { Icon } from "./icon";

// Accordion for the homepage FAQ. State indication is the purpose: the row
// visibly opens instead of teleporting. Grid-rows 0fr to 1fr carries the
// height change (no layout thrash on siblings) at --dur-slow (320ms) on the
// brand curve, with the opacity fade at --dur-base (200ms); the chevron
// rotation confirms the press. tokens.css's reduced-motion block collapses
// both to an instant settle. Buttons + aria-expanded, so keyboard and screen
// readers get the native disclosure contract.

export type FaqItem = { q: string; a: string };

function Row({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <li className="border-b border-hairline">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="group flex min-h-11 w-full items-center justify-between gap-(--space-4) py-(--space-5) text-left font-display text-h4 font-bold text-on-dark"
        >
          {item.q}
          {/* Faint, not amber. A list of questions renders one chevron per row,
              so an amber chevron puts five or six ambers in a single viewport
              and breaks the Hi-Vis Rule (DESIGN.md: one primary amber per
              viewport, amber marks the NEXT ACTION). A disclosure affordance is
              not the next action; it brightens to full white on hover and when
              its row is open, which is the state that matters. */}
          <Icon
            name="i-arrow-right"
            className={`size-5 shrink-0 transition-[transform,color] duration-(--dur-base) ease-(--ease-out) group-hover:text-on-dark ${
              open ? "rotate-90 text-on-dark" : "text-on-dark-faint"
            }`}
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        className="grid transition-[grid-template-rows] duration-(--dur-slow) ease-(--ease-out)"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p
            className={`max-w-[60ch] pb-(--space-5) text-body text-on-dark-muted transition-opacity duration-(--dur-base) ease-(--ease-out) ${
              open ? "opacity-100" : "opacity-0"
            }`}
          >
            {item.a}
          </p>
        </div>
      </div>
    </li>
  );
}

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <ul className="border-t border-hairline">
      {items.map((item) => (
        <Row key={item.q} item={item} />
      ))}
    </ul>
  );
}

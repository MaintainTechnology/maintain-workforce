@AGENTS.md

## Design Context

Read before touching anything user-facing:

- **[PRODUCT.md](PRODUCT.md)** — strategy. The product is **Maintain Worker**,
  Australia's B2B workforce exchange for construction (a Maintain / The Pep
  Collective venture). The unit of the marketplace is the *company*, never the
  individual worker; primary conversion is company registration. Distilled from
  `../MaintainWorkforce/maintain-worker-blueprint.md` and
  `maintain-worker-build-spec.md.pdf`, which win on conflict.
- **[DESIGN.md](DESIGN.md)** — the visual system. The hero is the exchange;
  amber is earned, never ambient (~2 per screen); monospace carries operational
  truth (ABNs, trade codes, availability); Archivo displays, Inter reads,
  IBM Plex Mono attests. Dark-locked, teal-tinted hairlines, raised-metal cards.
- **[public/design-system/](public/design-system/)** — the legacy Maintain
  Workforce brand archive. The raw colour ramp in `tokens.css` still feeds the
  Tailwind mapping in `src/app/globals.css`; the Maintain Worker semantic layer
  and type stack are defined on top of it in `globals.css`. The old style guide
  at `/design-system/index.html` documents the previous brand, not this one.

Never hardcode a colour, radius, shadow or duration in components. If a value
is not in `tokens.css` or the semantic layer in `globals.css`, add it there
first. Generated brand imagery lives in `public/generated/` (Nano Banana Pro;
regenerate with the script noted in the session logs, style locked to petrol
teal + hi-vis amber wireframe, no people, no text).

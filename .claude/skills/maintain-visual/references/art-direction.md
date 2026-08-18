# Art direction — Maintain Workforce imagery

The house grade (see `public/generated/*.jpg` for the canon): Australian
construction at **blue hour**, deep petrol-teal colour grade, overcast sky, wet
surfaces; the **only warm light is amber** — worklights, task lighting, interior
glow. Steel framing, scaffolding, concrete, glass. Cinematic and moody, not
gloomy. The photo must never fight the layout: no text, no logos, no signage,
no watermarks in the image, ever.

## Recipe 1 — Environment (default; matches the site)

> Photorealistic Australian construction site at dusk (blue hour), deep petrol
> teal colour grade, overcast sky, wet ground with subtle reflections. [SUBJECT —
> e.g. "multi-storey steel frame with scaffolding", "residential timber framing
> stage", "commercial glass facade under construction"]. The only warm light
> comes from amber worklights and interior task lighting. Cinematic, high detail,
> shallow atmospheric haze. No people, no text, no signage, no logos, no
> watermarks.

## Recipe 2 — Crew (people allowed; for social warmth)

Use when the content is about workers, crews, or registration — a human subject
converts better on social. PPE must be correct (this brand sells to builders who
will notice): hard hat, hi-vis vest or long-sleeve shirt.

> Photorealistic Australian tradesperson on a construction site at dusk, wearing
> correct PPE (hard hat, hi-vis amber/orange vest), [ACTION — e.g. "reviewing a
> tablet", "guiding a steel beam", "walking the site"]. Deep petrol teal colour
> grade, the warm light sources are amber worklights. Natural, candid, not posed
> at camera. Cinematic, high detail. No text, no visible brand logos, no
> watermarks.

## Recipe 3 — Wireframe brand-art (legacy abstract style)

For conceptual content (process, data, the exchange itself) where photography
would be literal-minded:

> Minimal isometric wireframe illustration on a deep petrol teal (#07272D)
> background: [SUBJECT — e.g. "two building outlines connected by a glowing
> path", "a grid of construction site plots"]. Thin hi-vis amber (#FFC400) line
> work, sparse, technical-drawing aesthetic, subtle amber glow. No people, no
> text, no labels, no watermarks.

## Using pasted/reference images

- A **photo the user pastes** (site photo, team photo): pass as `--ref` and ask
  Gemini to regrade it into the house look — "Regrade this photograph into a
  deep petrol teal dusk palette where the only warm light is amber; keep the
  subject and composition; no text or logos." Or embed it directly untouched if
  the user says it's final.
- A **product screenshot** (the exchange UI, a dashboard): never send through
  Gemini — embed directly in the HTML inside a `.panel` with a hairline border,
  so the UI text stays crisp and verbatim.

## Checks before accepting a panel

Open the generated image and look at it. Reject and regenerate if: any text or
lettering appears; the grade drifts warm/daylight (the site canon is teal-dark);
PPE is wrong in a Crew shot; or the composition puts detail where the layout
puts type (busy areas belong away from the text column).

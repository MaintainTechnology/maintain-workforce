// Content shared across pages. Single source so sections cannot drift.
// Trades and codes are the blueprint's pilot beachhead (§7.2): four trades,
// South East Queensland.

export const TRADES = [
  {
    code: "ROOF",
    name: "Roofing",
    blurb: "Metal, tile and membrane crews for residential and commercial roofs.",
  },
  {
    code: "PLUMB",
    name: "Plumbing",
    blurb: "Rough-in, fit-off and maintenance plumbers across build stages.",
  },
  {
    code: "CARP",
    name: "Carpentry",
    blurb: "Formwork, framing and fix carpenters, from slab to handover.",
  },
  {
    code: "ELEC",
    name: "Electrical",
    blurb: "Rough-in, fit-off and testing electricians for every stage.",
  },
] as const;

export type TradeCode = (typeof TRADES)[number]["code"];

export const PILOT_REGION = "South East Queensland";

// Illustrative exchange entries for the marketing hero and marketplace
// preview. Deliberately anonymous (trade + area + shape of the listing, no
// company names): the live board ships seeded with verified SE QLD
// businesses, and nothing on the marketing site may pretend to be one.
export const SAMPLE_SUPPLY = [
  { code: "ROOF", area: "Logan", crew: 4, window: "AVAIL 12 AUG - 20 SEP" },
  { code: "CARP", area: "Gold Coast", crew: 6, window: "AVAIL NOW" },
  { code: "ELEC", area: "Brisbane North", crew: 2, window: "AVAIL 18 AUG" },
] as const;

export const SAMPLE_DEMAND = [
  { code: "CARP", area: "Ipswich", crew: 4, window: "3 WKS FROM 11 AUG" },
  { code: "PLUMB", area: "Sunshine Coast", crew: 3, window: "6 WKS FROM 25 AUG" },
  { code: "ROOF", area: "Brisbane South", crew: 5, window: "URGENT - 2 WKS" },
] as const;

// The short, trust-building answers (build spec §6.8). Trust is the thing the
// business asked to lead on, so the first three answers are all trust answers.
// Factual claims that depend on legal or commercial calls stay bracketed
// (blueprint §19); nothing here may prejudge the legal review or imply that
// the QuoteMax handoff has shipped.
export const FAQ_ITEMS = [
  {
    q: "Is this labour hire?",
    a: "No. We never employ or on-hire workers and we take no margin on their time. We introduce two construction companies; they contract directly and the workforce stays on its own employer's books. [Structure under legal review before launch.]",
  },
  {
    q: "Who can join?",
    a: "Registered construction businesses only, never individuals. You need an ABN, the licence your trade requires and current insurance. The pilot covers roofing, plumbing, carpentry and electrical across South East Queensland.",
  },
  {
    q: "How do you know the crew is any good?",
    a: "A person verifies every company before it appears on the board: ABN, licence, insurance and the qualifications of the people it puts forward. Companies carry a record on the exchange, and one that sends poor crews stops getting introductions.",
  },
  {
    q: "How does this relate to QuoteMax?",
    a: "QuoteMax is our sister product and helps construction companies win work. Maintain Workforce helps them deliver it. They are separate products you can use on their own; the automated handoff between them is roadmap, not shipped.",
  },
  {
    q: "What does it cost?",
    a: "The pilot is free. We do not charge until the exchange is proving real matches; pricing after that is [confirmed before any charging starts].",
  },
  {
    q: "How do introductions work?",
    a: "You request one. A person on our team reviews both companies and connects you directly, usually the same day. No bots, no automated matching in v1.",
  },
  {
    q: "What happens to my details?",
    a: "Your company appears on the board only after verification, and only verified members see it. Contact details are shared when both sides agree to an introduction.",
  },
] as const;

// The group loop: the two halves of the same job. QuoteMax is live today and
// Maintain Workforce is the exchange; the automated handoff between them is
// roadmap and is labelled wherever it appears.
export const LOOP_STAGES = [
  {
    stage: "Win it",
    product: "QuoteMax",
    body: "Quote faster, and get paid to turn up. QuoteMax turns an estimate into a validated quote and a sales order, so the work you chase is work that converts.",
    status: "Live product",
  },
  {
    stage: "Crew it",
    product: "Maintain Workforce",
    body: "The job lands and the crew to deliver it does not exist in-house this month. The exchange finds it inside a verified network of construction companies, not a labour hire desk.",
    status: "Pilot open",
  },
  {
    stage: "Deliver it",
    product: "Both",
    body: "The work goes out on time, the relationship stays yours, and the crew goes back to its own employer. Next month the roles reverse and you supply the capacity.",
    status: "Roadmap integration",
  },
] as const;

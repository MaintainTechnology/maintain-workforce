// Site identity: Maintain Workforce, Australia's B2B workforce exchange for
// construction (blueprint §1). The product name matches the shipped wordmark
// in /design-system/assets/logo, which reads "Maintain WORKFORCE". The company
// name is still an open decision with the business; if it lands somewhere else
// this constant is the single place it changes.

const phone = "+61 [phone confirmed before launch]";

export const site = {
  name: "Maintain Workforce",
  tagline: "Australia's B2B workforce exchange for construction",
  description:
    "Winning the work is half the job. Maintain Workforce is the trusted exchange where construction companies share skilled crews, so a won job never sits waiting on labour.",
  // Set NEXT_PUBLIC_SITE_URL in the deploy env (production: https://maintainworkforce.com.au).
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  email: "hello@maintainworkforce.com.au",
  phone,
  telHref: `tel:${phone.replace(/\s+/g, "")}`,
  venture: "A Maintain / The Pep Collective venture",
  // The group positioning line. QuoteMax is the live sister product; the
  // automated handoff between the two is roadmap and is labelled as such
  // everywhere it appears (PRODUCT.md honesty rules).
  sisterProduct: "QuoteMax",
  groupLine: "QuoteMax wins the work. Maintain Workforce crews it.",
} as const;

// Marketing nav (build spec: links + login + register CTA). "The loop" is the
// group positioning section: winning work and crewing it are one cycle.
export const nav = [
  { href: "/#how", label: "How it works" },
  { href: "/#loop", label: "The loop" },
  { href: "/#trades", label: "Trades" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

// One label per intent, site-wide.
export const ctas = {
  register: { href: "/register", label: "Register your company" },
  login: { href: "/login", label: "Log in" },
  contact: { href: "/contact", label: "Talk to the team" },
} as const;

import type { MDXComponents } from "mdx/types";

// Every .md/.mdx file renders through these, so long-form content inherits the
// brand type scale instead of browser defaults. The site is dark-locked
// (DESIGN.md), so these map to the on-dark text ramp; the light-surface ink
// tokens are reserved for documents and print.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => (
      <h1
        className="font-display text-h1 font-extrabold leading-(--leading-display) tracking-(--tracking-display) text-on-dark"
        {...props}
      />
    ),
    h2: (props) => (
      <h2
        className="mt-(--space-7) font-display text-h2 font-bold tracking-(--tracking-tight) text-on-dark"
        {...props}
      />
    ),
    h3: (props) => (
      <h3
        className="mt-(--space-6) font-display text-h3 font-bold text-on-dark"
        {...props}
      />
    ),
    p: (props) => (
      <p className="mt-(--space-4) text-body text-on-dark-muted" {...props} />
    ),
    a: (props) => (
      <a
        className="font-semibold text-on-dark underline underline-offset-4 hover:text-on-dark-muted"
        {...props}
      />
    ),
    ul: (props) => (
      <ul
        className="mt-(--space-4) list-disc space-y-(--space-2) pl-(--space-5) text-on-dark-muted"
        {...props}
      />
    ),
    ol: (props) => (
      <ol
        className="mt-(--space-4) list-decimal space-y-(--space-2) pl-(--space-5) text-on-dark-muted"
        {...props}
      />
    ),
    // Panel, not a side-stripe: coloured left borders over 1px are banned
    // (DESIGN.md), and hairline + tonal step is how this system does depth.
    blockquote: (props) => (
      <blockquote
        className="mt-(--space-5) rounded-(--radius-lg) border border-hairline bg-black-2 p-(--space-5) text-body-lg text-on-dark"
        {...props}
      />
    ),
    ...components,
  };
}

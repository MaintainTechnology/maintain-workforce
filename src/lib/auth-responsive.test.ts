import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: unknown) => {
    clerk.signIn(props);
    return null;
  },
  SignUp: (props: unknown) => {
    clerk.signUp(props);
    return null;
  },
}));

const { default: SignInPage } = await import("../app/signin/[[...rest]]/page");
const { default: SignUpPage, metadata: signUpMetadata } = await import(
  "../app/signup/[[...rest]]/page"
);

beforeEach(() => vi.clearAllMocks());

describe("responsive Clerk authentication", () => {
  for (const [name, Page, widget] of [
    ["signin", SignInPage, clerk.signIn],
    ["signup", SignUpPage, clerk.signUp],
  ] as const) {
    it(`${name} allows the grid and padded form column to shrink on mobile`, () => {
      const html = renderToStaticMarkup(Page());
      expect(html).toMatch(/class="[^"]*\bgrid-cols-1\b[^"]*\blg:grid-cols-2\b/);
      for (const id of ["auth-form-column", "auth-form-panel"]) {
        const element = html.match(new RegExp(`<div[^>]*data-testid="${id}"[^>]*>`))?.[0];
        expect(element).toBeDefined();
        expect(element).toMatch(/class="[^"]*\bmin-w-0\b/);
        expect(element).not.toMatch(/overflow-(?:x-)?(?:hidden|clip)/);
      }
      expect(html).toContain("p-(--space-3) sm:p-(--space-5)");
    });

    it(`${name} sizes every Clerk card layer to its container without changing redirects`, () => {
      renderToStaticMarkup(Page());
      expect(widget).toHaveBeenCalledOnce();
      const props = widget.mock.calls[0][0];
      for (const element of ["rootBox", "cardBox", "card"]) {
        expect(props.appearance?.elements?.[element]).toMatchObject({
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        });
      }
      expect(props.appearance.elements.card.paddingInline).toBe(
        "clamp(var(--space-4), 5vw, 2.5rem)",
      );
      expect(props).toMatchObject(
        name === "signin"
          ? { signUpUrl: "/signup", fallbackRedirectUrl: "/auth/continue" }
          : { signInUrl: "/signin", forceRedirectUrl: "/onboarding" },
      );
    });
  }

  it("describes ABN verification as conditional in signup copy and metadata", () => {
    const html = renderToStaticMarkup(SignUpPage());
    expect(html).toContain("ABN, if supplied");
    expect(signUpMetadata.description).toContain("ABN, if supplied");
  });
});

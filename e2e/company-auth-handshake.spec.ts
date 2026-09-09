import { expect, test } from "@playwright/test";

// Credential-free regression for src/lib/clerk-handshake-cookies.ts. Under a headless
// User-Agent Clerk's Frontend API omits `Secure` from the handshake cookies; without the
// proxy repairing them a cookie-less first load bounces nine times before Clerk gives up
// and treats the visitor as signed out, and a signed-in visitor whose session token has
// lapsed is sent back to /signin on their next server-side navigation. The filename is
// picked up by the company-mobile project; the User-Agent override is the trigger.
test.describe("Clerk handshake under a headless user agent", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36",
  });

  for (const route of ["/signin", "/app"] as const) {
    test(`a cookie-less first load of ${route} completes the handshake in one round trip`, async ({ page, context }) => {
      // "commit" stops before clerk-js runs, so the cookies below come from the handshake alone.
      const response = await page.goto(route, { waitUntil: "commit" });
      expect(response?.status()).toBe(200);

      let redirects = 0;
      for (let request = response?.request().redirectedFrom(); request; request = request.redirectedFrom()) {
        redirects += 1;
      }
      // app -> Clerk Frontend API -> app?__clerk_handshake -> app is the whole exchange.
      expect(redirects, "handshake redirect chain length").toBeLessThanOrEqual(route === "/app" ? 4 : 3);

      const host = new URL(page.url()).hostname;
      const names = (await context.cookies()).filter((cookie) => cookie.domain.replace(/^\./, "") === host).map((cookie) => cookie.name);
      expect(names, "handshake cookies accepted by the browser").toContain("__clerk_db_jwt");
    });
  }
});

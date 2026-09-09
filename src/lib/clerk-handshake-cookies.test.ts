import { describe, expect, it } from "vitest";
import { needsSecureAttribute, secureSameSiteNoneCookies } from "./clerk-handshake-cookies";

// The four directives Clerk's Frontend API returned for a HeadlessChrome User-Agent,
// captured on 2026-09-09 against the development instance; the same request from a
// regular Chrome User-Agent carried "; Secure" on each of them.
const HEADLESS_HANDSHAKE = [
  "__client_uat=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None",
  "__client_uat=0; Path=/; Domain=localhost; Max-Age=315360000; SameSite=None",
  "__session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None",
  "__clerk_db_jwt=dvb_test_placeholder; Path=/; Expires=Thu, 09 Sep 2027 04:07:41 GMT; SameSite=None",
];

function headersWith(cookies: string[]): Headers {
  const headers = new Headers({ location: "/signin", "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}

describe("Clerk handshake cookie hardening", () => {
  it("restores Secure on every SameSite=None cookie the handshake sets without it", () => {
    const headers = headersWith(HEADLESS_HANDSHAKE);
    secureSameSiteNoneCookies(headers);
    expect(headers.getSetCookie()).toEqual(HEADLESS_HANDSHAKE.map((cookie) => `${cookie}; Secure`));
    expect(headers.get("location")).toBe("/signin");
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("leaves compliant and same-site cookies untouched, preserving order", () => {
    const compliant = [
      "__session=abc; Path=/; Secure; SameSite=None",
      "__clerk_redirect_count=1; SameSite=Lax; HttpOnly; Max-Age=2",
      "__client_uat=0; Path=/; Domain=localhost; Max-Age=315360000; secure; samesite=none",
    ];
    const headers = headersWith(compliant);
    secureSameSiteNoneCookies(headers);
    expect(headers.getSetCookie()).toEqual(compliant);
    for (const cookie of compliant) expect(needsSecureAttribute(cookie)).toBe(false);
  });

  it("only repairs the non-compliant cookies in a mixed response", () => {
    const headers = headersWith([HEADLESS_HANDSHAKE[3], "__clerk_redirect_count=1; SameSite=Lax; HttpOnly; Max-Age=2"]);
    secureSameSiteNoneCookies(headers);
    expect(headers.getSetCookie()).toEqual([
      `${HEADLESS_HANDSHAKE[3]}; Secure`,
      "__clerk_redirect_count=1; SameSite=Lax; HttpOnly; Max-Age=2",
    ]);
  });

  it("is a no-op for responses without cookies", () => {
    const headers = new Headers({ "x-pathname": "/app" });
    secureSameSiteNoneCookies(headers);
    expect(headers.getSetCookie()).toEqual([]);
    expect(headers.get("x-pathname")).toBe("/app");
  });

  it("does not mistake a cookie value or name for the Secure attribute", () => {
    expect(needsSecureAttribute("secure=1; Path=/; SameSite=None")).toBe(true);
    expect(needsSecureAttribute("flag=secure; Path=/; SameSite=None")).toBe(true);
    expect(needsSecureAttribute("flag=1; Path=/secure; SameSite=None")).toBe(true);
  });
});

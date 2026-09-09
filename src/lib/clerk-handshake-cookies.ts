// Clerk's Frontend API builds the session-handshake cookies it hands back to the
// middleware. When the browser's User-Agent identifies a headless browser, the API
// omits the `Secure` attribute while keeping `SameSite=None`. Every browser rejects
// that combination (Chromium: SameSiteNoneInsecure), so the handshake never lands,
// the middleware retries until Clerk's loop guard signs the request out, and the
// server log reads "Refreshing the session token resulted in an infinite redirect
// loop". Real browsers receive `Secure` and are unaffected; automated browsers
// (Playwright default contexts, browser agents, CI) cannot keep a session.
//
// `SameSite=None` requires `Secure` by specification, so restoring it changes nothing
// for a compliant cookie. Chromium and WebKit accept `Secure` cookies on
// http://localhost, which is the only plain-HTTP origin this app is served from.

const SAME_SITE_NONE = /;\s*samesite=none\b/i;
const SECURE = /;\s*secure\s*(?:;|$)/i;

export function needsSecureAttribute(cookie: string): boolean {
  return SAME_SITE_NONE.test(cookie) && !SECURE.test(cookie);
}

/** Append `Secure` to every `SameSite=None` Set-Cookie header that lacks it, in place. */
export function secureSameSiteNoneCookies(headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (!cookies.some(needsSecureAttribute)) return;
  headers.delete("set-cookie");
  for (const cookie of cookies) {
    headers.append("set-cookie", needsSecureAttribute(cookie) ? `${cookie}; Secure` : cookie);
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The server Supabase client carries a Clerk session token. When Supabase does not
// trust the Clerk instance that signed it, PostgREST answers 401 and every RLS-gated
// read comes back empty. The client names the refused issuer once, in the server log,
// so the misconfiguration is diagnosable from runtime output alone.

const clerk = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ getToken: clerk.getToken }) }));

const { createClient } = await import("@/lib/supabase/server");

/** An unsigned stand-in for a Clerk template token; only the issuer claim matters here. */
function sessionToken(iss: string) {
  const encode = (claims: object) => Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss, role: "authenticated" })}.signature`;
}

function postgrest(status: number, body: unknown) {
  return vi.fn(async () => Response.json(body, { status }));
}

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://workforce.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  clerk.getToken.mockResolvedValue(sessionToken("https://clerk.example.test"));
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  error.mockRestore();
  vi.unstubAllGlobals();
});

describe("Supabase refusing a Clerk session token", () => {
  it("names the untrusted issuer and the Third-Party Auth fix, and still returns the error", async () => {
    const fetch = postgrest(401, { code: "PGRST301", message: "No suitable key or wrong key type" });
    vi.stubGlobal("fetch", fetch);

    const supabase = await createClient();
    const result = await supabase.from("region").select("id");

    expect(result.error?.code).toBe("PGRST301");
    expect(result.data).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0][0]);
    expect(line).toContain("https://clerk.example.test");
    expect(line).toContain("Third-Party Auth");
    expect(line).toContain("401");
  });

  it("reports a 401 that is not about token trust without the Third-Party Auth advice", async () => {
    vi.stubGlobal("fetch", postgrest(401, { message: "Invalid API key", hint: "Double check your Supabase anon or service_role API key." }));

    const supabase = await createClient();
    const result = await supabase.from("region").select("id");

    expect(result.error?.message).toBe("Invalid API key");
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0][0]);
    expect(line).toContain("401");
    expect(line).toContain("Invalid API key");
    expect(line).toContain("https://clerk.example.test");
    expect(line).not.toContain("Third-Party Auth");
  });

  it("stays silent when Supabase accepts the session", async () => {
    vi.stubGlobal("fetch", postgrest(200, [{ id: "region" }]));

    const supabase = await createClient();
    const result = await supabase.from("region").select("id");

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "region" }]);
    expect(error).not.toHaveBeenCalled();
  });

  it("does not crash the request when the refused token is unreadable", async () => {
    clerk.getToken.mockResolvedValue("not-a-jwt");
    vi.stubGlobal("fetch", postgrest(401, { code: "PGRST301", message: "No suitable key or wrong key type" }));

    const supabase = await createClient();
    const result = await supabase.from("region").select("id");

    expect(result.error?.code).toBe("PGRST301");
    expect(String(error.mock.calls[0][0])).toContain("an unknown issuer");
  });
});

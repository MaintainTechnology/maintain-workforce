import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { createAdminClient } from "./admin";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mocks.createClient.mockClear();
});

async function request(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  createAdminClient();
  const options = mocks.createClient.mock.calls[0][2] as {
    global: { fetch: typeof fetch };
  };
  return options.global.fetch("https://database.example.test/rest/v1/rpc/create_worker_transactional");
}

describe("service-role schema diagnostics", () => {
  it.each(["PGRST202", "PGRST205"])("reports a missing database object returned as HTTP 404 (%s)", async (code) => {
    const body = { code, message: "Missing database object" };
    const response = new Response(JSON.stringify(body), { status: 404 });

    const result = await request(response);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(code));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("seed-data/PRODUCTION-CUTOVER.md"));
    // Inspect a clone so the Supabase caller can still read and classify the failure.
    expect(result).toBe(response);
    expect(await result.json()).toEqual(body);
  });

  it("does not label unrelated 404 responses as migration failures", async () => {
    const result = await request(new Response("Not found", { status: 404 }));
    expect(console.error).not.toHaveBeenCalled();
    expect(await result.text()).toBe("Not found");
  });
});

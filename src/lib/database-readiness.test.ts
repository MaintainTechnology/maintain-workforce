import { describe, expect, it, vi } from "vitest";
import { checkDatabaseReadiness, REQUIRED_RPCS } from "../../scripts/check-database-readiness.mjs";

const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-test-key" };

describe("read-only database readiness", () => {
  it("detects missing worker and activation RPCs despite a healthy HTTP response", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ paths: {
      "/rpc/company_verification_checklist": { post: {} },
      "/rpc/verify_company_document_atomic": { post: {} },
    } }));
    expect(await checkDatabaseReadiness(env, request)).toEqual([
      "create_worker_transactional", "transition_company_status_atomic",
      "update_company_profile_atomic",
      "save_company_document_atomic",
      "save_company_document_details_atomic",
      "attach_company_document_with_snapshot_atomic",
      "approve_company_as_maintain_atomic",
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toBe("https://example.supabase.co/rest/v1/");
    expect(options.method).toBeUndefined(); // GET schema only; never invoke a mutation.
    expect(options.body).toBeUndefined();
    expect(options.redirect).toBe("error");
  });

  it("accepts a complete schema but requires POST support for each RPC", async () => {
    const paths = Object.fromEntries(REQUIRED_RPCS.map((name) => [`/rpc/${name}`, { post: {} }]));
    expect(await checkDatabaseReadiness(env, vi.fn().mockResolvedValue(Response.json({ paths })))).toEqual([]);
    expect(await checkDatabaseReadiness(env, vi.fn().mockResolvedValue(Response.json({ paths: {
      ...paths, "/rpc/create_worker_transactional": { get: {} },
    } })))).toEqual(["create_worker_transactional"]);
  });

  it("fails closed for failed, malformed or unavailable schema responses without exposing response secrets", async () => {
    await expect(checkDatabaseReadiness(env, vi.fn().mockResolvedValue(new Response("secret", { status: 401 }))))
      .rejects.toThrow("HTTP 401");
    await expect(checkDatabaseReadiness(env, vi.fn().mockResolvedValue(Response.json({ message: "secret" }))))
      .rejects.toThrow("readiness is unverified");
    await expect(checkDatabaseReadiness(env, vi.fn().mockResolvedValue(new Response("secret"))))
      .rejects.toThrow("not valid JSON");
    await expect(checkDatabaseReadiness(env, vi.fn().mockRejectedValue(new Error("secret"))))
      .rejects.toThrow("Check connectivity");
  });

  it("does not send a service key over a non-local plaintext connection", async () => {
    const request = vi.fn();
    await expect(checkDatabaseReadiness({ ...env, NEXT_PUBLIC_SUPABASE_URL: "http://example.com" }, request))
      .rejects.toThrow("must use HTTPS");
    expect(request).not.toHaveBeenCalled();
  });
});

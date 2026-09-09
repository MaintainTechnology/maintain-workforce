import { existsSync, readFileSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";

// Clerk's bot protection (Cloudflare Turnstile) replaces the sign-up form with a
// "Verify you are human" challenge that no automated browser can pass. Clerk's answer
// for test suites is a Testing Token: minted with the secret key, attached to every
// Frontend API request, and honoured by the API by marking the client captcha-exempt.
// This mirrors @clerk/testing's setupClerkTestingToken without adding the dependency.
// ponytail: swap for @clerk/testing if Clerk changes the token contract.

const TESTING_TOKEN_PARAM = "__clerk_testing_token";

/** Local runs: fill missing keys from .env.local the way the app itself reads them. */
export function withDotenvLocal(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!existsSync(".env.local")) return env;
  const merged = { ...env };
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && merged[match[1]] === undefined) merged[match[1]] = match[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return merged;
}

/** The instance's Frontend API host, decoded from the publishable key. */
export function frontendApiHost(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  return Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
}

export async function mintTestingToken(env: NodeJS.ProcessEnv): Promise<string | null> {
  if (env.CLERK_TESTING_TOKEN) return env.CLERK_TESTING_TOKEN;
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) return null;
  const response = await fetch("https://api.clerk.com/v1/testing_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) throw new Error(`Clerk refused to mint a testing token (HTTP ${response.status}).`);
  const body = (await response.json()) as { token?: string };
  return body.token ?? null;
}

export async function installTestingToken(context: BrowserContext, token: string, frontendApi: string): Promise<void> {
  const prefix = `https://${frontendApi}/v1/`;
  await context.route((url) => url.href.startsWith(prefix), async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set(TESTING_TOKEN_PARAM, token);
    const response = await route.fetch({ url: url.toString() });
    if (!(response.headers()["content-type"] ?? "").includes("application/json")) return route.fulfill({ response });
    let json: { response?: { captcha_bypass?: boolean }; client?: { captcha_bypass?: boolean } };
    try {
      json = await response.json();
    } catch {
      return route.fulfill({ response });
    }
    if (json.response?.captcha_bypass === false) json.response.captcha_bypass = true;
    if (json.client?.captcha_bypass === false) json.client.captcha_bypass = true;
    await route.fulfill({ response, json });
  });
}

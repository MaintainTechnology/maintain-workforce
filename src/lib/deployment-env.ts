type DeploymentEnvironment = Readonly<Record<string, string | undefined>>;

const REQUIRED_VARIABLES = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const URL_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "APP_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

function isPlaceholder(value: string): boolean {
  const unprefixed = value.replace(/^(?:pk|sk)_(?:live|test)_/, "");
  return /^(?:your(?:[-_ ]|$)|replace(?:[-_ ]?me)?(?:[-_ ]|$)|change[-_ ]?me(?:[-_ ]|$)|placeholder(?:[-_ ]|$)|example(?:[-_ ]|$)|dummy(?:[-_ ]|$)|undefined$|null$|<.*>$|\$\{.*\}$)/i.test(unprefixed);
}

function isHostedHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password &&
      host !== "localhost" && !host.endsWith(".localhost") &&
      !/^127\./.test(host) && host !== "[::1]" && host !== "0.0.0.0" &&
      !/(?:^|\.)(?:example\.(?:com|org|net)|invalid|test)$/.test(host) &&
      !isPlaceholder(host);
  } catch {
    return false;
  }
}

/**
 * Stop a hosted build before missing configuration becomes a runtime HTTP 500.
 * This checks configuration shape only; it never connects to a provider or
 * includes supplied values in diagnostics. Local and isolated CI builds keep
 * their existing fixture configuration when VERCEL_ENV is not a hosted target.
 */
export function assertDeploymentEnvironment(env: DeploymentEnvironment = process.env): void {
  const target = env.VERCEL_ENV;
  if (target !== "production" && target !== "preview") return;

  const problems: string[] = [];
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
  if (missing.length) problems.push(`Missing required variables: ${missing.join(", ")}.`);

  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.startsWith("sb_secret_")) {
    problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a public application key, never a Supabase secret key.");
  }

  for (const name of REQUIRED_VARIABLES) {
    const value = env[name];
    if (!value?.trim()) continue;
    if (value !== value.trim() || /\s/.test(value) || isPlaceholder(value)) {
      problems.push(`${name} must contain a configured value without whitespace or placeholders.`);
    }
  }

  for (const name of URL_VARIABLES) {
    const value = env[name];
    if (value?.trim() && !isHostedHttpsUrl(value)) {
      problems.push(`${name} must be an absolute HTTPS URL for the hosted service, without embedded credentials or a local/placeholder hostname.`);
    }
  }

  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = env.CLERK_SECRET_KEY;
  const publishableMode = publishableKey?.match(/^pk_(live|test)_[A-Za-z0-9+/_=-]+$/)?.[1];
  const secretMode = secretKey?.match(/^sk_(live|test)_[A-Za-z0-9+/_=-]+$/)?.[1];

  if (publishableKey?.trim() && !publishableMode) {
    problems.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk pk_live_ or pk_test_ publishable key.");
  }
  if (secretKey?.trim() && !secretMode) {
    problems.push("CLERK_SECRET_KEY must be a Clerk sk_live_ or sk_test_ secret key.");
  }
  if (publishableMode && secretMode && publishableMode !== secretMode) {
    problems.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must use the same Clerk key mode (live or test).");
  }
  if (target === "production" && (publishableMode === "test" || secretMode === "test")) {
    problems.push("Production requires Clerk live keys: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (pk_live_) and CLERK_SECRET_KEY (sk_live_).");
  }

  if (problems.length) {
    throw new Error([
      `Vercel ${target} deployment configuration is invalid:`,
      ...problems.map((problem) => `- ${problem}`),
      `Configure these variables for the ${target} environment in Vercel Project Settings, then redeploy. GitHub Actions secrets are not automatically Vercel environment variables.`,
    ].join("\n"));
  }
}

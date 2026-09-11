# Deployment configuration and missing-secret recovery

## Incident observed on 9 September 2026

Production deployment `dpl_ApT6sPdbH1VGLFfYthc2nq79WrNw` serves commit
`c0671f2f73256843760814d68997ecf840856c9a`. Vercel marked its build Ready, but
requests to `/`, `/about` and `/signin` returned HTTP 500. Its runtime logs report
`@clerk/nextjs: Missing publishableKey` in the request proxy. Static assets return
200. This is missing deployment configuration, not a failed page compilation.

Read-only inspection found **no project environment variables** for either
Production or Preview in `maintain-technology/maintain-workforce`. The regular local
Clerk assignments used a development instance. The user subsequently identified
the separate `#CLERK LIVE KEY` comment section and authorised its live keys plus
the Workforce Supabase credentials for production.

Those live keys passed a read-only Clerk production-instance lookup; a Workforce
Supabase health query also passed. Nine core Vercel Production settings were then
configured (the seven below plus the two Clerk auth paths), and the existing
revision was redeployed as `dpl_9CGEcviqrSKkZbMaUYot74whmsY1`. On 9 September at
07:08 UTC, `/` and `/signin` returned 200 and `/api/health` returned 200/healthy.
No database migration or application-data write was performed. This redeployment
uses the existing source revision; the new local preflight code is a separate patch.

GitHub run [34319489267](https://github.com/MaintainTechnology/maintain-workforce/actions/runs/34319489267)
passed `verify` and `local-database`, then failed `starred-flows` because
`E2E_FIXTURE_BUNDLE_JSON` was absent. No repository, accessible organization or
`Production` environment secrets were available. GitHub test configuration and
Vercel runtime configuration are separate; adding a secret to one does not configure
the other. These observations are dated and must be rechecked after provisioning.

## Configure the existing Vercel project

Use the intended Maintain Workforce production Clerk instance and Supabase project.
Do not create a replacement identity system or copy an unverified development
database into production to satisfy a check.

| Setting | Production value source |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_` key from the intended Clerk production instance |
| `CLERK_SECRET_KEY` | Matching instance's `sk_live_` key; server-only |
| `NEXT_PUBLIC_SUPABASE_URL` | Intended Supabase project's HTTPS API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | That project's anonymous/publishable application key |
| `SUPABASE_SERVICE_ROLE_KEY` | That project's server-only service-role/secret key |
| `APP_BASE_URL` | Canonical public HTTPS application origin |
| `NEXT_PUBLIC_SITE_URL` | Canonical public HTTPS marketing origin |

For this production site the public origin is `https://www.maintainworkforce.com.au`.
Clerk domains/redirects and the Supabase `supabase` JWT template trust must agree with
the selected instances. Confirm database migration compatibility separately using
[PRODUCTION-CUTOVER.md](PRODUCTION-CUTOVER.md); setting keys does not apply migrations.

Set `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/signin` and
`NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup`. Also configure the remaining workflow
settings from [`.env.example`](../.env.example): Resend sender/key, Maintain inbox,
`CRON_SECRET` and `LEAD_WEBHOOK_TOKEN`. Their values must belong to the intended
environment. A valid-looking key is not proof of connectivity, grants or delivery.

`next.config.ts` validates hosted Production/Preview configuration before building.
It lists missing or invalid setting names without logging their values. Ordinary
local/CI verification with no hosted environment retains the existing dummy-key
build workflow. The hosted check prevents a new apparently successful release with
missing identity/data configuration; it does not repair an existing deployment.

Store values through Vercel's environment settings or secure CLI input. Never put
secret values in Git, command arguments, screenshots or incident reports. Environment
changes require a new deployment; `NEXT_PUBLIC_` values are embedded during the build.
After configuration, build and verify a compatible artifact through the existing
release process, then check anonymous homepage/sign-in, authenticated company/admin
routes, tenant isolation and `/api/health`. Do not report recovery until live checks pass.

Read-only metadata checks:

```powershell
$env:NO_UPDATE_NOTIFIER='1'
vercel env ls production --project maintain-workforce --scope maintain-technology
vercel env ls preview --project maintain-workforce --scope maintain-technology
vercel inspect https://www.maintainworkforce.com.au --scope maintain-technology
```

The explicit scope avoids inspecting another team's context. `NO_UPDATE_NOTIFIER`
avoids the local CLI update-check worker timeout; it does not affect the deployment.

## Clerk DNS and auth-form HTTPS recovery verified

The production instance already has a `supabase` JWT template. Its frontend URL is
`https://clerk.maintainworkforce.com.au`, which initially did not resolve. A
200 response from `/signin` alone does not establish a working sign-in form.
The domain uses `ns51.domaincontrol.com` / `ns52.domaincontrol.com`; the Vercel team
does not manage that DNS zone.

The authenticated Clerk domain API supplied these required CNAMEs. The user added
them to the GoDaddy zone for `maintainworkforce.com.au`; all five resolved to the
expected targets through `1.1.1.1` on 9 September at approximately 08:15 UTC:

| Type | Name in the zone | Value |
| --- | --- | --- |
| CNAME | `clerk` | `frontend-api.clerk.services` |
| CNAME | `accounts` | `accounts.clerk.services` |
| CNAME | `clkmail` | `mail.0eqatdfvqrcb.clerk.services` |
| CNAME | `clk._domainkey` | `dkim1.0eqatdfvqrcb.clerk.services` |
| CNAME | `clk2._domainkey` | `dkim2.0eqatdfvqrcb.clerk.services` |

These are public DNS targets, not secret keys. The Clerk frontend CNAME was also
confirmed through `8.8.8.8`. At 08:16 UTC, the homepage returned 200 and
`/api/health` returned 200/healthy, but the Clerk frontend script and accounts
domain both failed verified TLS with a handshake failure. Browser inspection
confirmed that sign-in and sign-up still rendered only their surrounding page
content. A Google DNS lookup at 08:18 UTC returned no CAA records for the root
domain, so that lookup found no CAA restriction on certificate issuance.

For future production setup, Clerk's
[production deployment guide](https://clerk.com/docs/guides/development/deployment/production)
identifies **Deploy certificates** as the final dashboard step after configuration.

At **08:28:03 UTC on 9 September**, a fresh request to the exact failing
`https://clerk.maintainworkforce.com.au/npm/@clerk/clerk-js@6/dist/clerk.browser.js`
returned **200 with normal TLS validation**. The homepage also returned 200.
Fresh browser pages subsequently rendered both the sign-in and sign-up forms,
including their email/password fields, Continue buttons and Google option.
The health endpoint again returned 200/healthy. No certificate activation or
configuration mutation was performed by the agent during this recheck; the earlier
TLS failure had cleared. Clerk dashboard access is no longer needed to resolve
this particular loading error.

Record actual authentication evidence separately; this configuration pass does not
create users, send verification emails or claim a completed authenticated journey.

## Configure isolated-preview CI separately

The live test job intentionally fails when fixtures are missing. Main-push and
acknowledged-release gates remain enforced. Its new no-network preflight reports all
missing Actions secret names before installing dependencies, writing bearer-state
files or applying preview migrations.

Follow [E2E-VERIFICATION.md](E2E-VERIFICATION.md) and
[LIVE-VERIFICATION.md](LIVE-VERIFICATION.md) for the complete contract. Use a
disposable Supabase preview database, Clerk development instance and genuine test
accounts/sessions, including an admin session that completed a real second factor.
`E2E_FIXTURE_BUNDLE_JSON` contains the complete manifest and referenced browser
storage states as a JSON object. Empty/sample tokens are not valid fixtures.

The `starred-flows` job reads repository secrets or organization secrets shared with
this repository. It does not attach the GitHub `Production` environment; secrets
stored only there are unavailable to it. Provision every required name reported by
`scripts/validate-preview-config.mjs`, then run the same-release preview validation.
Do not disable the gate or treat a skipped transaction suite as a successful release.

## Verification of this change

- `npm run verify` passed: TypeScript, ESLint, **977 tests** and platform vocabulary
  lint. **10 live RLS tests were skipped**, not passed.
- A real `next build` invocation with empty hosted settings exited before
  compilation with the expected variable-name-only error from `next.config.ts`.
- The normal local production build passed using CI dummy keys and one static
  worker. Its client-secret scan checked **93 browser assets** and rendered
  payloads without finding the server-secret sentinel. `git diff --check` passed.
- Independent source review found no blocking defects in the hosted validator,
  Next config wiring or preserved CI release gates.
- The authorised Vercel configuration/redeployment recovered the homepage and
  database health endpoint. Browser inspection confirmed the homepage renders.
  All five Clerk DNS targets now resolve correctly. The exact Clerk script URL
  returns 200 over verified HTTPS, and both sign-in and sign-up forms render in
  fresh browser pages. No account submission, OAuth or MFA journey was exercised.
- No fixture manifest, saved test sessions, E2E/RLS environment settings or Supabase
  preview branch existed in the bounded read-only inspection. Live CI remains
  blocked until the isolated environment and genuine fixtures are provisioned.

DNS setup and public auth-form loading are verified. Creating a separate paid
preview environment requires the user's pending
choice. The local preflight changes are not yet committed or pushed; the recovered
production deployment uses the previously committed revision. No migrations,
application-data changes, user/session creation or outbound emails were performed.

## Supabase must trust the production Clerk instance

Diagnosed on 11 September. Signed in through the production Clerk instance, the
Add a worker screen rendered its reference-data selects (base region, primary trade,
proficiency, travel regions) with no options, and the crew list would show no workers.
The catalogue itself is intact: the Workforce Supabase project holds the full
`seed-data` load (industries, regions, trades, proficiency mappings, skills,
qualifications).

The cause is token trust, not data. The server Supabase client sends the Clerk
`supabase` template token as the bearer. The Supabase project lists one Third-Party
Auth integration, the **development** instance `accepted-panda-5245.clerk.accounts.dev`.
A token issued by the production instance `https://clerk.maintainworkforce.com.au` is
refused with HTTP 401 `PGRST301 No suitable key was found to decode the JWT`, so every
RLS-gated read (catalogue tables and tenant tables alike) returns nothing. In the same
check a real development-instance session token read the same tables successfully,
which isolates the missing trust entry.

Fix: on the Supabase project, Authentication, then Sign In / Providers, then
Third-Party Auth, add Clerk with domain `clerk.maintainworkforce.com.au`. The
equivalent Management API call (a personal access token; nothing else changes):

    POST https://api.supabase.com/v1/projects/<project-ref>/config/auth/third-party-auth
    {"oidc_issuer_url": "https://clerk.maintainworkforce.com.au"}

Keep the development entry: this project already holds a development-instance company
membership (the first registration), and local work against it uses that instance. Verify by
listing `GET .../config/auth/third-party-auth` (two entries), then loading
`/app/workers/new` in a production session: the base-region and primary-trade selects
list the seeded catalogue.

The server client now logs one `[supabase] Rejected the Clerk session token issued by
<issuer>` line on any 401, and the Workforce and Company settings screens fail visibly
instead of rendering an empty required form, so a repeat of this misconfiguration is
named in the runtime logs rather than hidden behind blank selects.

Local note: `.env.local` carries both the development and the `#CLERK LIVE KEY`
assignments for the same variable names. `next dev` takes the later value, so local
development also signs in through the production instance and needs the same trust
entry.

Applied on 11 September through the Management API: the project now lists both
issuers, the development one as `clerk-development` and the production one as
`custom` with its JWKS resolved at registration. A production-instance session token
then read the catalogue and tenant tables with HTTP 206/200, matching the development
token, without any deployment.

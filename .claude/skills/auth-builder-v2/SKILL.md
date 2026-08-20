---
name: auth-builder-v2
description: Build and maintain Stripe → Clerk authentication flows for the V2 pricing tiers (Clinical Academy, Knowledge, Professional). Use when implementing subscription tiers, fixing auto-enrollment issues, or adding payment-to-access flows with the current 3-tier pricing model.
allowed-tools: Read, Write, Edit, Glob, Grep, Shell
---

# Auth Builder V2 — NGM Platform

## Overview

This skill manages the V2 authentication and enrollment flow for the NGM platform. It handles the complete Stripe → Clerk integration for the **3-tier pricing model**:

| Tier | Clerk Metadata `lipTier` | Annual | Monthly | Access |
|------|--------------------------|--------|---------|--------|
| **Clinical Academy** | `clinical_academy` | $79/mo | $95/mo | Education content only |
| **Knowledge** | `knowledge` | $99/mo | $119/mo | Education + Knowledge Assistant + Business Advisor |
| **Professional** | `professional` | $199/mo | $249/mo | Everything: Education + Knowledge + Business Advisor + Biomarker Analysis + Advanced Analysis |

> **Key difference from V1:** The old `core` tier is replaced by `clinical_academy`. The `knowledge` tier is new — it includes Knowledge Assistant AND Business Advisor but NOT biomarker analysis. The `elite` tier is removed from the checkout flow (handled separately via mentorship).

## Complete Flow

```
1. User clicks CTA button (pricing card or upgrade banner)
   ↓
2. Frontend calls /api/lip/create-checkout with tier + billingPeriod
   tier: "clinical_academy" | "knowledge" | "professional"
   ↓
3. User is redirected to Stripe Checkout
   ↓
4. User completes payment
   ↓
5. Stripe redirects to /subscription-success?session_id={id}
   ↓
6. Frontend calls /api/verify-and-enroll with session_id
   ↓
7. Backend verifies payment, creates/updates Clerk user with V2 metadata
   ↓
8. Backend generates sign-in token
   ↓
9. Frontend redirects to /auth/callback?ticket={token}
   ↓
10. User is auto-logged in and redirected to dashboard
```

## Key Files

| File | Purpose |
|------|---------|
| `src/views/LongevityIntelligenceCore.tsx` | Dashboard with pricing cards, `handleSubscribe`, tab gating |
| `src/views/AIPlatformPage.tsx` | AI Platform marketing page with pricing section |
| `src/views/home.tsx` | Homepage pricing section |
| `src/app/api/lip/create-checkout/route.ts` | Next.js checkout — creates Stripe session with V2 tier metadata |
| `src/app/api/verify-and-enroll/route.ts` | Creates/updates Clerk user, sets V2 metadata, generates sign-in token |
| `src/views/SubscriptionSuccess.tsx` | Post-payment page, calls verify-and-enroll |
| `src/views/AuthCallback.tsx` | Clerk sign-in with ticket |
| `src/components/AuthProvider.tsx` | Access control flags based on `lipTier` metadata |
| `src/lib/knowledge-access.ts` | Tier type definitions and access logic |
| `server/routes.ts` | Express routes (checkout + webhook handler) |

## V2 Tier Metadata Configuration

### Clinical Academy ($79/month annual, $95/month monthly)
```json
{
  "publicMetadata": {
    "lipTier": "clinical_academy",
    "mentorshipAccess": false
  },
  "privateMetadata": {
    "stripeCustomerId": "cus_xxx",
    "stripeSessionId": "cs_xxx",
    "lipSubscriptionStatus": "active"
  }
}
```

### Knowledge ($99/month annual, $119/month monthly)
```json
{
  "publicMetadata": {
    "lipTier": "knowledge",
    "mentorshipAccess": false
  },
  "privateMetadata": {
    "stripeCustomerId": "cus_xxx",
    "stripeSessionId": "cs_xxx",
    "lipSubscriptionStatus": "active"
  }
}
```

### Professional ($199/month annual, $249/month monthly)
```json
{
  "publicMetadata": {
    "lipTier": "professional",
    "mentorshipTier": "legacy",
    "mentorshipAccess": true
  },
  "privateMetadata": {
    "stripeCustomerId": "cus_xxx",
    "stripeSessionId": "cs_xxx",
    "lipSubscriptionStatus": "active"
  }
}
```

## Access Control Flags (AuthProvider.tsx)

The `AuthProvider` maps `lipTier` to boolean flags used throughout the app:

| Flag | Clinical Academy | Knowledge | Professional | Elite |
|------|-----------------|-----------|-------------|-------|
| `hasContentAccess` | ✅ | ✅ | ✅ | ✅ |
| `hasDashboardAccess` | ❌ | ✅ | ✅ | ✅ |
| `hasFullDashboard` | ❌ | ❌ | ✅ | ✅ |
| `hasAdvancedAnalysis` | ❌ | ❌ | ✅ | ✅ |

### What each flag controls in the dashboard:
- `hasContentAccess` → Can view education/course content
- `hasDashboardAccess` → Can access Knowledge Assistant tab + Business Advisor tab
- `hasFullDashboard` → Can access Biomarker Analysis tab + report history
- `hasAdvancedAnalysis` → Can run Advanced Biomarker Analysis pipelines

## Environment Variables

### Required Stripe Price IDs
```bash
# Clinical Academy
STRIPE_PRICE_ID_CLINICAL_ACADEMY=price_xxx          # $79/mo billed annually
STRIPE_PRICE_ID_CLINICAL_ACADEMY_MONTHLY=price_xxx   # $95/mo

# Knowledge Platform
STRIPE_PRICE_ID_KNOWLEDGE=price_xxx                  # $99/mo billed annually
STRIPE_PRICE_ID_KNOWLEDGE_MONTHLY=price_xxx           # $119/mo

# Professional
STRIPE_PRICE_ID_PROFESSIONAL=price_xxx               # $199/mo billed annually
STRIPE_PRICE_ID_PROFESSIONAL_MONTHLY=price_xxx        # $249/mo

# Free trial (Professional only)
STRIPE_PRICE_ID_PROFESSIONAL_FREE_TRIAL=price_xxx
```

### Legacy Fallback Price IDs (still supported)
```bash
STRIPE_PRICE_ID_CORE=price_xxx            # Falls back for clinical_academy
STRIPE_PRICE_ID_CORE_MONTHLY=price_xxx    # Falls back for clinical_academy monthly
STRIPE_PRICE_ID_STANDARD=price_xxx        # Falls back for clinical_academy
```

## Frontend Implementation

### handleSubscribe Function
Located in `src/views/LongevityIntelligenceCore.tsx`:

```typescript
const handleSubscribe = async (
  tier: "clinical_academy" | "knowledge" | "core" | "professional" | "elite",
  period: "annual" | "monthly" = billingPeriod
) => {
  const response = await fetch("/api/lip/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tier,
      billingPeriod: period,
      clerkUserId: user?.id || null,
      userEmail: user?.email || null,
    }),
  });
  const data = await response.json();
  if (data.checkoutUrl) window.location.href = data.checkoutUrl;
};
```

## Backend: Tier Normalization

### Next.js create-checkout (`src/app/api/lip/create-checkout/route.ts`)
Already uses V2 canonical tiers with legacy fallbacks:
```typescript
let canonicalTier: 'clinical_academy' | 'knowledge' | 'professional' | 'elite' = 'clinical_academy';
if (tier === 'clinical_academy' || tier === 'foundations' || tier === 'core') canonicalTier = 'clinical_academy';
else if (tier === 'knowledge' || tier === 'standard') canonicalTier = 'knowledge';
else if (tier === 'pro' || tier === 'professional') canonicalTier = 'professional';
else if (tier === 'elite') canonicalTier = 'elite';
```

### verify-and-enroll (`src/app/api/verify-and-enroll/route.ts`)
**CRITICAL:** Must map incoming Stripe metadata tier to V2 canonical tiers:
```typescript
let tier: 'clinical_academy' | 'knowledge' | 'professional' | 'elite' = 'clinical_academy';
if (rawTier === 'clinical_academy' || rawTier === 'core' || rawTier === 'foundations' || rawTier === 'copilot') {
  tier = 'clinical_academy';
} else if (rawTier === 'knowledge' || rawTier === 'standard') {
  tier = 'knowledge';
} else if (rawTier === 'professional' || rawTier === 'unlimited' || rawTier === 'pro') {
  tier = 'professional';
} else if (rawTier === 'elite') {
  tier = 'elite';
}

// mentorshipAccess: only professional and elite
const mentorshipAccess = tier === 'professional' || tier === 'elite';
```

### Express checkout (`server/routes.ts` line ~1063)
**NEEDS UPDATE:** Still uses old `core`/`professional`/`elite` canonical tiers. Must be updated to match the Next.js route with `clinical_academy` and `knowledge` support.

### Webhook handler (`server/routes.ts` line ~1450)
**NEEDS UPDATE:** `checkout.session.completed` handler still maps to `core`/`professional`/`elite`. Must add `clinical_academy` and `knowledge` mappings.

## Updating Files Checklist

When modifying the auth flow, update ALL of these locations:

### Tier normalization (4 places):
- [ ] `src/app/api/lip/create-checkout/route.ts` — Next.js checkout (✅ already V2)
- [ ] `src/app/api/verify-and-enroll/route.ts` — Auto-enrollment after payment
- [ ] `server/routes.ts` `/api/lip/create-checkout` — Express checkout
- [ ] `server/routes.ts` `checkout.session.completed` webhook — Stripe webhook handler

### Access control (2 places):
- [ ] `src/components/AuthProvider.tsx` — Boolean flags from `lipTier`
- [ ] `src/lib/knowledge-access.ts` — Tier type definitions

### UI/Pricing display (3 places):
- [ ] `src/views/LongevityIntelligenceCore.tsx` — Dashboard tabs + upgrade banners
- [ ] `src/views/AIPlatformPage.tsx` — AI Platform marketing page
- [ ] `src/views/home.tsx` — Homepage pricing cards

## Legacy Tier Mapping

Old tier names are still accepted and normalized:

| Legacy Name | Maps To |
|-------------|---------|
| `core` | `clinical_academy` |
| `foundations` | `clinical_academy` |
| `copilot` | `clinical_academy` |
| `standard` | `knowledge` |
| `pro` | `professional` |
| `unlimited` | `professional` |

## Testing Checklist

- [ ] Clinical Academy subscription → Clerk metadata `lipTier: "clinical_academy"`, `mentorshipAccess: false`
- [ ] Knowledge subscription → Clerk metadata `lipTier: "knowledge"`, `mentorshipAccess: false`
- [ ] Professional subscription → Clerk metadata `lipTier: "professional"`, `mentorshipAccess: true`
- [ ] Clinical Academy user sees: content only, Knowledge/Biomarker/Advisor tabs locked
- [ ] Knowledge user sees: content + Knowledge Assistant + Business Advisor, Biomarker tab locked
- [ ] Professional user sees: everything unlocked
- [ ] User is auto-logged in after payment
- [ ] User is redirected to `/longevity-intelligence-core`
- [ ] Existing user's metadata is updated (not duplicated)
- [ ] Legacy tier names (`core`, `standard`, etc.) still work through normalization

## Debugging

Check terminal logs for these patterns:
```
[Verify-Enroll] Looking up user by email: xxx
[Verify-Enroll] Found X existing user(s)
[Verify-Enroll] ✅ Created new user xxx with tier: clinical_academy
[Verify-Enroll] ✅ Created new user xxx with tier: knowledge
[Verify-Enroll] ✅ Created new user xxx with tier: professional
[Verify-Enroll] ✅ Generated sign-in token for user xxx
```

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Knowledge user can't access Business Advisor | `hasDashboardAccess` not including `knowledge` tier | Check AuthProvider.tsx line ~149 |
| Knowledge user can access Biomarker Analysis | `hasFullDashboard` incorrectly including `knowledge` | Ensure only `professional`/`elite` in hasFullDashboard |
| Old `core` users lost access | Legacy mapping missing | Ensure `core` → `clinical_academy` in AuthProvider normalizer |
| Stripe checkout fails for Knowledge tier | Missing `STRIPE_PRICE_ID_KNOWLEDGE` env var | Add the price ID to `.env` |
| Webhook sets wrong tier | `checkout.session.completed` handler uses old mapping | Update server/routes.ts webhook to use V2 tiers |

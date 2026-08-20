# Auth Builder Skill

This skill manages the Stripe → Clerk authentication flow for the NGM platform's pricing CTA buttons.

## When to Use

- Implementing new subscription tiers
- Fixing auto-enrollment issues after Stripe payment
- Adding payment-to-access flows
- Debugging Clerk user creation errors
- Updating tier metadata structure

## Quick Reference

### Add a New Tier

1. Create Stripe product and price in Stripe Dashboard
2. Add price ID to `.env`:
   ```
   STRIPE_PRICE_ID_NEWTIER=price_xxx
   STRIPE_PRICE_ID_NEWTIER_MONTHLY=price_xxx
   ```
3. Update `server/routes.ts` pricing logic
4. Update `src/app/api/lip/create-checkout/route.ts` pricing logic
5. Update `src/app/api/verify-and-enroll/route.ts` tier normalization
6. Add pricing card in `src/views/LongevityIntelligenceCore.tsx`

### Fix Auto-Enrollment

1. Check terminal logs for `[Verify-Enroll]` messages
2. Verify `success_url` includes `?session_id={CHECKOUT_SESSION_ID}`
3. Ensure Clerk user creation includes required fields (firstName, lastName)
4. Check tier metadata matches expected structure

### Update Tier Metadata

Edit `src/app/api/verify-and-enroll/route.ts`:
- Line ~70: `mentorshipAccess` and `mentorshipTier` defaults
- Lines ~115, ~157, ~225, ~262, ~303: All `publicMetadata` objects

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CTA Button    │────▶│  Stripe Checkout │────▶│  Success Page   │
│  (Frontend)     │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Dashboard     │◀────│  Auth Callback  │◀────│ verify-and-enroll│
│  (Logged In)    │     │  (Auto Login)   │     │   (Clerk API)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

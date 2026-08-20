---
name: NGM Turborepo Migration
overview: "Migrate NGM Website from React+Vite+Express to a Turborepo monorepo with two Next.js apps: marketing site (Vercel) and LIP platform (Railway), with shared packages for UI, database, and auth."
todos:
  - id: phase-0-cleanup
    content: Delete garbage files, peptide content, library pages, duplicates, backups
    status: pending
  - id: phase-1-turborepo
    content: Initialize Turborepo monorepo with directory structure
    status: pending
  - id: phase-2-packages
    content: "Create shared packages: @ngm/database, @ngm/auth, @ngm/ui, @ngm/config"
    status: pending
  - id: phase-3-web
    content: Create apps/web (marketing site) with migrated pages
    status: pending
    dependencies:
      - phase-1-turborepo
      - phase-2-packages
  - id: phase-4-platform
    content: Create apps/platform (LIP) with dashboard, lectures, API routes
    status: pending
    dependencies:
      - phase-1-turborepo
      - phase-2-packages
  - id: phase-5-tools
    content: Migrate HubSpot CLI, content, Cursor rules, Claude skills
    status: pending
  - id: phase-6-env
    content: Configure environment variables and Clerk cross-subdomain auth
    status: pending
  - id: phase-7-deploy
    content: Configure Vercel (web) and Railway (platform) deployments
    status: pending
  - id: phase-8-test
    content: Test locally, update imports, verify all functionality
    status: pending
---

# NGM Turborepo Migration - Detailed Execution Plan

## Architecture Overview

```javascript
ngm-monorepo/
├── apps/
│   ├── web/           → nextgenerationmedicine.co (Vercel)
│   └── platform/      → app.nextgenerationmedicine.co (Railway)
├── packages/
│   ├── ui/            → Shared Shadcn components
│   ├── database/      → Drizzle schema + client
│   ├── auth/          → Clerk configuration
│   └── config/        → Shared configs
├── tools/
│   └── hubspot-cli/   → HubSpot email CLI
└── content/           → Lectures, email sequences, docs
```

---

## PHASE 0: CLEANUP (Before Migration)

### 0.1 Delete Garbage Files

Delete the following from the current repo root:**Python test files (25 files):**

```javascript
test_*.py, *_test.py, working_*.py, exact_*.py, async_*.py
check_pipeline_metadata.py, connectivity_test.py, run_pipeline_with_insights.py
parse_pipeline_details.py, get_pipeline_info.py, full_pipeline_details.py
fresh_pipeline_test.py, exact_script.py, copy_screenshots.py
```

**Temporary/junk files:**

```javascript
90000, cookie.txt, SSHTest, temp.txt, temp_recovery.txt
peptide_part1.txt, peptide_part2.txt, peptide_part2_fixed.txt
bpc157-scroll.gif, bpc157-scroll-compressed.gif, bpc157-scroll.mp4, bpc157-start.png
slideshow_component.txt, testing.txt, pipeline_full_data.json, vectorshift_pipelines.json
capture-bpc157-scroll.js, cv-anant-vinjamoori.html
```

**Replit files:**

```javascript
replit.md, replit.nix, windsurf_deployment.yaml
```

**Temporary directories:**

```javascript
attached_assets/    (229 files)
frames/             (17 files)
deploy-temp/
temp/
```



### 0.2 Delete Peptide Content

**Pages to delete from `client/src/pages/`:**

```javascript
FreePeptides.tsx
PeptideProtocols.tsx (and all variants: .backup, .backup2, .bak, .bak3, .fixed, .fixed2, .new, .new2, .new3, .new.fresh, .clean)
PeptideProtocolsModular.tsx
PeptideAssistant.tsx
Slideshow.tsx (peptide slideshow)
peptides/           (entire directory - 7 files)
```

**Components to delete from `client/src/components/`:**

```javascript
peptides/           (entire directory)
sections/Hero.tsx
sections/Introduction.tsx
sections/WhatArePeptides.tsx
sections/PeptidesVsPharmaceuticals.tsx
sections/PeptideHistory.tsx
sections/CurrentLandscape.tsx
sections/Applications.tsx
sections/Conclusion.tsx
sections/PremiumBanner.tsx
sections/AboutTheAuthor.tsx
```

**Assets to delete from `client/src/assets/`:**

```javascript
diagrams/           (entire directory - 19 files)
images/             (entire directory - 2 BPC157 files)
```

**Data to delete:**

```javascript
client/src/data/peptidesData.tsx
```



### 0.3 Delete Library/Free Content Pages

**Pages to delete from `client/src/pages/`:**

```javascript
LibraryPage.tsx
BryanJohnsonReview.tsx
LongevityLessons.tsx
LongevityMistakes.tsx
Longevity2025.tsx
LongevityGuild.tsx
```



### 0.4 Clean Up Assets

**Delete duplicates from `client/src/assets/`:**

```javascript
clean market logo.png       (keep clean-market-logo.png)
clean_market_logo.png       (keep clean-market-logo.png)
midi logo.png               (keep midi-logo.png)
midi_logo.png               (keep midi-logo.png)
superpower logo.png         (keep superpower-logo.png)
superpower_logo.png         (keep superpower-logo.png)
doctor-image.jpg            (keep doctor-image.jpeg)
screenshot-*.png            (all 5 timestamped screenshots)
```

**Move misplaced files:**

```javascript
NGM Report Example.html → content/docs/
NGM Sample Report.pdf   → public/downloads/
```



### 0.5 Clean Up Auth References

**In `esbuild.config.js`, remove 'passport' from externals array.**

### 0.6 Delete Backup Files

```javascript
client/src/pages/Consulting.tsx.bak
client/src/pages/mentorship/lectures/Inflammation.tsx.backup
temp/Inflammation.tsx.bak
```

---

## PHASE 1: CREATE TURBOREPO STRUCTURE

### 1.1 Initialize New Monorepo

Create a new directory alongside the current project:

```bash
mkdir ngm-monorepo
cd ngm-monorepo
npx create-turbo@latest . --example with-tailwind
```

When prompted, select:

- Package manager: npm
- No example apps needed (we'll create our own)

### 1.2 Create Directory Structure

```bash
# Remove example apps if any
rm -rf apps/* packages/*

# Create app directories
mkdir -p apps/web
mkdir -p apps/platform

# Create package directories
mkdir -p packages/ui/src
mkdir -p packages/database/src
mkdir -p packages/auth/src
mkdir -p packages/config

# Create tools directory
mkdir -p tools

# Create content directory
mkdir -p content/lectures
mkdir -p content/email-sequences
mkdir -p content/docs
```



### 1.3 Configure Root package.json

Create `ngm-monorepo/package.json`:

```json
{
  "name": "ngm-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*",
    "tools/*"
  ],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "dev:web": "turbo dev --filter=web",
    "dev:platform": "turbo dev --filter=platform",
    "lint": "turbo lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "db:push": "turbo db:push --filter=@ngm/database",
    "db:studio": "turbo db:studio --filter=@ngm/database"
  },
  "devDependencies": {
    "prettier": "^3.2.5",
    "turbo": "^2.0.0",
    "typescript": "^5.6.3"
  },
  "engines": {
    "node": ">=20"
  },
  "packageManager": "npm@10.0.0"
}
```



### 1.4 Configure turbo.json

Create `ngm-monorepo/turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "db:push": {
      "cache": false
    },
    "db:studio": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## PHASE 2: CREATE SHARED PACKAGES

### 2.1 Database Package (@ngm/database)

Create `packages/database/package.json`:

```json
{
  "name": "@ngm/database",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.4",
    "drizzle-orm": "^0.39.1"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.4",
    "typescript": "^5.6.3"
  }
}
```

Copy schema from current project:

- Copy `shared/schema.ts` → `packages/database/src/schema.ts`
- Copy `server/db.ts` → `packages/database/src/client.ts`

Create `packages/database/src/index.ts`:

```typescript
export * from './schema';
export { db } from './client';
```

Create `packages/database/drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```



### 2.2 Auth Package (@ngm/auth)

Create `packages/auth/package.json`:

```json
{
  "name": "@ngm/auth",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./middleware": "./src/middleware.ts"
  },
  "dependencies": {
    "@clerk/nextjs": "^5.0.0"
  },
  "peerDependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0"
  }
}
```

Create `packages/auth/src/index.ts`:

```typescript
export {
  ClerkProvider,
  SignIn,
  SignUp,
  SignInButton,
  SignUpButton,
  SignOutButton,
  UserButton,
  useAuth,
  useUser,
  useClerk,
} from '@clerk/nextjs';
```

Create `packages/auth/src/middleware.ts`:

```typescript
export { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
```



### 2.3 UI Package (@ngm/ui)

Create `packages/ui/package.json`:

```json
{
  "name": "@ngm/ui",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "sideEffects": false,
  "dependencies": {
    "@radix-ui/react-accordion": "^1.2.1",
    "@radix-ui/react-alert-dialog": "^1.1.2",
    "@radix-ui/react-avatar": "^1.1.1",
    "@radix-ui/react-checkbox": "^1.1.2",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-popover": "^1.1.2",
    "@radix-ui/react-progress": "^1.1.0",
    "@radix-ui/react-scroll-area": "^1.2.0",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.2",
    "@radix-ui/react-tooltip": "^1.1.3",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.453.0",
    "tailwind-merge": "^2.5.4"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

Copy UI components from current project:

- Copy all files from `client/src/components/ui/` → `packages/ui/src/`

Create `packages/ui/src/index.ts` exporting all components:

```typescript
export * from './button';
export * from './card';
export * from './input';
export * from './label';
export * from './dialog';
export * from './dropdown-menu';
export * from './toast';
export * from './toaster';
export * from './use-toast';
// ... export all UI components
```



### 2.4 Config Package (@ngm/config)

Create `packages/config/package.json`:

```json
{
  "name": "@ngm/config",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./tailwind": "./tailwind.config.ts",
    "./typescript/base": "./tsconfig.base.json",
    "./typescript/nextjs": "./tsconfig.nextjs.json"
  }
}
```

Copy and adapt configs:

- Copy `tailwind.config.ts` → `packages/config/tailwind.config.ts`
- Create shared TypeScript configs

---

## PHASE 3: CREATE MARKETING SITE (apps/web)

### 3.1 Initialize Next.js App

```bash
cd apps/web
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```



### 3.2 Configure package.json

Update `apps/web/package.json`:

```json
{
  "name": "web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@ngm/ui": "*",
    "@ngm/auth": "*",
    "@ngm/database": "*",
    "next": "^14.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "framer-motion": "^11.13.1",
    "stripe": "^18.2.1",
    "@stripe/stripe-js": "^7.3.1"
  }
}
```



### 3.3 Migrate Marketing Pages

Copy and convert the following pages to Next.js App Router format:**From `client/src/pages/` to `apps/web/src/app/`:**| Current File | New Location | Notes |

|--------------|--------------|-------|

| `Home.tsx` | `app/page.tsx` | Home page |

| `WhatsInside.tsx` | `app/core/page.tsx` | Core features page |

| `PrivacyPolicy.tsx` | `app/privacy-policy/page.tsx` | Legal |

| `Commons.tsx` | `app/commons/page.tsx` | Commons page |

| `BusinessSolutions.tsx` | `app/business-solutions/page.tsx` | B2B |

| `Consulting.tsx` | `app/consulting/page.tsx` | Consulting |

| `Mentorship.tsx` | `app/mentorship/page.tsx` | Mentorship sales page |

| `Login.tsx` | `app/login/page.tsx` | Auth |

| `Signup.tsx` | `app/signup/page.tsx` | Auth |

| `ForgotPassword.tsx` | `app/forgot-password/page.tsx` | Auth |

| `ResetPassword.tsx` | `app/reset-password/page.tsx` | Auth |

| `Proposals.tsx` | `app/proposals/page.tsx` | Proposals hub |

| `PLVProposal.tsx` | `app/proposals/plv052025/page.tsx` | Individual proposal |

| `CactusProposal.tsx` | `app/proposals/cactus052025/page.tsx` | |

| `HighMountMadisonProposal.tsx` | `app/proposals/highmountmadison052025/page.tsx` | |

| `NextHealthProposal.tsx` | `app/proposals/nexthealth052025/page.tsx` | |

| `levey052025.tsx` | `app/proposals/levey052025/page.tsx` | |

| `AIMasterclass.tsx` | `app/ai-masterclass/page.tsx` | |

| `PatientOnboarding.tsx` | `app/patients/onboarding/page.tsx` | |

| `PatientOnboardingBasic.tsx` | `app/patients/onboarding-basic/page.tsx` | |

| `PatientOnboardingFF.tsx` | `app/patients-ff/onboarding/page.tsx` | |**Conversion pattern for each page:**

```typescript
// Before (React + Wouter):
import { Link } from "wouter";
export default function PageName() { ... }

// After (Next.js App Router):
import Link from "next/link";
export default function Page() { ... }
```



### 3.4 Create Layout

Create `apps/web/src/app/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import { ClerkProvider } from '@ngm/auth';
import { Toaster } from '@ngm/ui';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'Next Generation Medicine',
  description: 'The most comprehensive longevity education platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Navbar />
          {children}
          <Footer />
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
```



### 3.5 Migrate Layout Components

Copy and adapt:

- `client/src/components/layout/Navbar.tsx` → `apps/web/src/components/navbar.tsx`
- `client/src/components/layout/Footer.tsx` → `apps/web/src/components/footer.tsx`

Update imports to use shared packages:

```typescript
import { Button, Input } from '@ngm/ui';
import { useAuth, UserButton } from '@ngm/auth';
```



### 3.6 Create API Routes for Web

Create `apps/web/src/app/api/` routes for:

- `/api/subscribe` (newsletter signup)
- `/api/contact` (contact form)

These are simple routes that don't need long-running processes.---

## PHASE 4: CREATE PLATFORM APP (apps/platform)

### 4.1 Initialize Next.js App

```bash
cd apps/platform
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```



### 4.2 Configure package.json

Update `apps/platform/package.json`:

```json
{
  "name": "platform",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@ngm/ui": "*",
    "@ngm/auth": "*",
    "@ngm/database": "*",
    "next": "^14.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "framer-motion": "^11.13.1",
    "stripe": "^18.2.1",
    "@stripe/stripe-js": "^7.3.1",
    "@stripe/react-stripe-js": "^3.7.0",
    "@aws-sdk/client-s3": "^3.925.0",
    "@aws-sdk/s3-request-presigner": "^3.925.0",
    "axios": "^1.8.4",
    "recharts": "^2.13.0"
  }
}
```



### 4.3 Migrate LIP Pages

Copy and convert to Next.js App Router:| Current File | New Location |

|--------------|--------------|

| `LongevityIntelligenceCore.tsx` | `app/dashboard/page.tsx` |

| `LongevityIntelligencePDP.tsx` | `app/pricing/page.tsx` |

| `LongevityIntelligencePromo.tsx` | `app/promo/page.tsx` |

| `ReportAccess.tsx` | `app/report-access/page.tsx` |

| `ReportAccessUpgrade.tsx` | `app/report-access/upgrade/page.tsx` |

| `ReportAccessWelcome.tsx` | `app/report-access/welcome/page.tsx` |

| `SubscriptionSuccess.tsx` | `app/subscription-success/page.tsx` |

| `PromoSubscriptionSuccess.tsx` | `app/promo-subscription-success/page.tsx` |

| `PostPaymentSignup.tsx` | `app/post-payment-signup/page.tsx` |

### 4.4 Migrate Mentorship Lectures

Create `apps/platform/src/app/mentorship/` structure:

```javascript
app/mentorship/
├── page.tsx                    (MentorshipContent.tsx)
├── layout.tsx                  (shared mentorship layout)
├── lectures/
│   ├── [slug]/
│   │   └── page.tsx           (dynamic route for all lectures)
│   └── page.tsx               (lecture index)
├── lab/
│   ├── page.tsx               (LectureLab index)
│   └── [lectureId]/
│       └── page.tsx           (LectureViewer)
├── admin/
│   └── lecture-manager/
│       └── page.tsx
├── qa-archives/
│   └── peptide-protocols/
│       └── page.tsx
├── business/
│   ├── practice-models/page.tsx
│   ├── telehealth/page.tsx
│   └── ehr-platforms/page.tsx
└── payment/
    ├── promotion/page.tsx
    └── promotion0625/page.tsx
```

**For the 94 lectures**, create a dynamic route:Create `apps/platform/src/app/mentorship/lectures/[slug]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import { lectures } from '@/data/lectures';

// Generate static params for all lectures
export function generateStaticParams() {
  return lectures.map((lecture) => ({
    slug: lecture.slug,
  }));
}

export default function LecturePage({ params }: { params: { slug: string } }) {
  const lecture = lectures.find((l) => l.slug === params.slug);
  if (!lecture) return notFound();
  
  const LectureComponent = lecture.component;
  return <LectureComponent />;
}
```

Create `apps/platform/src/data/lectures.ts` mapping slugs to components.

### 4.5 Migrate Lecture Components

Copy lecture-related components:

- `client/src/components/lectures/` → `apps/platform/src/components/lectures/`

### 4.6 Migrate API Routes

Create `apps/platform/src/app/api/` routes:| Current Route (server/routes.ts) | New Location |

|----------------------------------|--------------|

| POST /api/create-lip-checkout | `app/api/create-lip-checkout/route.ts` |

| POST /api/create-lip-promo-checkout | `app/api/create-lip-promo-checkout/route.ts` |

| POST /api/create-mentorship-checkout | `app/api/create-mentorship-checkout/route.ts` |

| POST /api/stripe-webhook | `app/api/webhooks/stripe/route.ts` |

| POST /api/webhooks/clerk | `app/api/webhooks/clerk/route.ts` |

| POST /api/vectorshift/* | `app/api/vectorshift/[...path]/route.ts` |

| GET /api/lip/subscription-status | `app/api/lip/subscription-status/route.ts` |

| GET /api/lip/reports | `app/api/lip/reports/route.ts` |

| POST /api/lip/reports | `app/api/lip/reports/route.ts` |

| GET /api/lip/reports/[id] | `app/api/lip/reports/[id]/route.ts` |

### 4.7 Create Middleware

Create `apps/platform/src/middleware.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@ngm/auth/middleware';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/mentorship(.*)',
  '/report-access(.*)',
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

---

## PHASE 5: MIGRATE TOOLS AND CONTENT

### 5.1 Copy HubSpot CLI

```bash
cp -r hubspot-email-cli/ ngm-monorepo/tools/hubspot-cli/
```

Update `tools/hubspot-cli/package.json` name to `@ngm/hubspot-cli`.

### 5.2 Copy Content

```bash
# Lectures
cp content/lectures/*.json ngm-monorepo/content/lectures/
cp content/lectures/schema.ts ngm-monorepo/content/lectures/

# Email sequences
cp -r content/email-sequences/ ngm-monorepo/content/email-sequences/

# Docs
cp -r content/docs/ ngm-monorepo/content/docs/
```



### 5.3 Copy Cursor Rules and Claude Skills

```bash
cp -r .cursor/ ngm-monorepo/.cursor/
cp -r .claude/ ngm-monorepo/.claude/
```



### 5.4 Copy Documentation

```bash
cp -r docs/ ngm-monorepo/docs/
```

---

## PHASE 6: CONFIGURE ENVIRONMENT

### 6.1 Create Environment Files

Create `ngm-monorepo/.env.example`:

```env
# Database
DATABASE_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=

# VectorShift
VECTORSHIFT_API_KEY=

# App URLs
NEXT_PUBLIC_WEB_URL=https://nextgenerationmedicine.co
NEXT_PUBLIC_APP_URL=https://app.nextgenerationmedicine.co
```

Each app will have its own `.env.local` that can extend shared variables.

### 6.2 Configure Clerk for Cross-Subdomain Auth

In Clerk Dashboard:

1. Add both domains to allowed origins
2. Set cookie domain to `.nextgenerationmedicine.co`

---

## PHASE 7: DEPLOYMENT CONFIGURATION

### 7.1 Vercel Configuration (apps/web)

Create `apps/web/vercel.json`:

```json
{
  "framework": "nextjs",
  "buildCommand": "cd ../.. && npx turbo build --filter=web"
}
```



### 7.2 Railway Configuration (apps/platform)

Create `apps/platform/railway.toml`:

```toml
[build]
builder = "nixpacks"
buildCommand = "cd ../.. && npm install && npx turbo build --filter=platform"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
```

Create `apps/platform/src/app/api/health/route.ts`:

```typescript
export function GET() {
  return Response.json({ status: 'ok' });
}
```

---

## PHASE 8: FINAL STEPS

### 8.1 Update Import Paths

Search and replace across all migrated files:

- `@/components/ui/` → `@ngm/ui`
- `@/components/AuthProvider` → `@ngm/auth`
- `wouter` Link → `next/link`
- `useLocation` from wouter → `usePathname` from next/navigation

### 8.2 Test Locally

```bash
cd ngm-monorepo
npm install
npm run dev
```

Verify:

- Marketing site runs on localhost:3000
- Platform runs on localhost:3001
- Auth works across both
- Database queries work
- UI components render correctly

### 8.3 Deploy

1. Connect `apps/web` to Vercel
2. Connect `apps/platform` to Railway
3. Configure environment variables in both
4. Set up webhook endpoints for Stripe and Clerk

---

## SUCCESS CRITERIA

- [ ] All garbage files deleted from original repo
- [ ] Turborepo structure created with proper workspace configuration
- [ ] Shared packages (@ngm/ui, @ngm/database, @ngm/auth) working
- [ ] Marketing site (apps/web) running with all pages
- [ ] Platform app (apps/platform) running with LIP and lectures
- [ ] Authentication working across both apps
- [ ] Database queries working
- [ ] API routes migrated and functioning
- [ ] HubSpot CLI preserved in tools/
- [ ] Cursor rules and Claude skills preserved
- [ ] Local development working with `npm run dev`
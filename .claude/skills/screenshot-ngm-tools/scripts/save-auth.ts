/**
 * One-time login helper for the screenshot-ngm-tools skill.
 *
 * Opens a HEADED browser so a human can log in with a professional/admin account,
 * then saves the authenticated session for capture.ts to reuse. Automation never
 * types credentials — the human logs in interactively.
 *
 * Usage:
 *   npx tsx .claude/skills/screenshot-ngm-tools/scripts/save-auth.ts
 *   npx tsx .../save-auth.ts --url https://staging.example.com
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const baseUrl = arg('url', process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000')!;
const storagePath = process.env.PLAYWRIGHT_STORAGE_STATE || 'playwright/.auth/ngm-session.json';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/longevity-intelligence-core`);

  console.log(
    '\n  Log in with a PROFESSIONAL or ADMIN account in the opened browser.\n' +
      '  When the Longevity Intelligence tools are visible, come back here and press Enter.\n',
  );
  await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));

  fs.mkdirSync(path.dirname(path.resolve(storagePath)), { recursive: true });
  await context.storageState({ path: storagePath });
  console.log(`✓ session saved to ${storagePath}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

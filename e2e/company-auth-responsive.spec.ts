import { expect, test } from "@playwright/test";

// Public, credential-free regressions. The filename is included by the existing
// company-mobile project; explicit widths cover both the phone and desktop split.
test.describe("responsive Clerk authentication", () => {
  for (const width of [320, 375, 414, 768, 1024, 1440]) {
    for (const route of ["signin", "signup"] as const) {
      test(`${route} fits at ${width}px without clipping the Clerk form`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${route}`);
        const root = page.locator(route === "signin" ? ".cl-signIn-root" : ".cl-signUp-root");
        await expect(root).toBeVisible();
        await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));

        const inspectLayout = () => page.getByTestId("auth-form-panel").evaluate((panel) => {
          const problems: string[] = [];
          const documentWidth = document.documentElement.clientWidth;
          if (document.documentElement.scrollWidth > documentWidth + 1) {
            problems.push("document scrolls horizontally");
          }
          const panelBounds = panel.getBoundingClientRect();
          if (panelBounds.left < -1 || panelBounds.right > documentWidth + 1) {
            problems.push("form panel escapes the viewport");
          }

          const visible = (element: Element) => {
            const bounds = element.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return false;
            // Clerk can pre-render the next password step in an invisible row.
            for (let parent: Element | null = element; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent);
              if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
                return false;
              }
              if (parent === panel) break;
            }
            return true;
          };

          const layers = panel.querySelectorAll(".cl-rootBox, .cl-cardBox, .cl-card");
          if (layers.length !== 3) problems.push("Clerk form is not inside its panel");
          for (const layer of layers) {
            const bounds = layer.getBoundingClientRect();
            if (bounds.left < panelBounds.left - 1 || bounds.right > panelBounds.right + 1) {
              problems.push("Clerk card escapes its panel");
            }
            if (layer.scrollWidth > layer.clientWidth + 1) {
              problems.push("Clerk card has internal horizontal overflow");
            }
          }

          for (const control of panel.querySelectorAll("input:not([type=hidden]), button, a")) {
            if (!visible(control)) continue;
            const bounds = control.getBoundingClientRect();
            const container = control.parentElement!.getBoundingClientRect();
            if (
              bounds.left < panelBounds.left - 1 || bounds.right > panelBounds.right + 1 ||
              (container.width > 0 && (bounds.left < container.left - 1 || bounds.right > container.right + 1))
            ) {
              problems.push(`${control.tagName} escapes its container`);
            }
          }
          for (const label of panel.querySelectorAll(".cl-socialButtonsBlockButtonText")) {
            if (visible(label) && label.scrollWidth > label.clientWidth + 1) {
              problems.push("social sign-in label is clipped");
            }
          }
          return problems;
        });
        await expect.poll(inspectLayout).toEqual([]);
      });
    }
  }
});

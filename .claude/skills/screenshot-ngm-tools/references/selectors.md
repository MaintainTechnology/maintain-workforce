# Verified selectors & gotchas

Anchors for the NGM tools on `/longevity-intelligence-core`, verified against the live code.
**Re-verify before debugging a broken selector** — the tree shifts. Line numbers are approximate.

## Route & auth

- Route: `/longevity-intelligence-core` (`src/ClientApp.tsx:~507`).
- **Public at middleware, gated client-side.** No server redirect blocks the URL, but each tool is
  gated by `useAppAuth()` subscription tier (`hasLipAccess` / `lipTier` / `isAdmin`). Therapy needs
  `isAdmin || lipTier ∈ {knowledge, professional}`. The saved session **must** be a pro/admin user
  or the tools render empty/locked.

## Tabs (the tab union)

`LIPTab = biomarker | advanced | knowledge | operations | growth | wearables | peptides | peptide-gps | therapy`
(`LongevityIntelligenceCore.tsx:~976`). Nav labels: Biomarker Analysis, Therapy Explorer, Peptide
Explorer, Peptide GPS, Knowledge, Business Advisor.

> **No "Web Explorer" tab exists.** Do not invent one. Closest things: the `advanced` (Advanced
> Analysis) tab, or the "Deep Research" *mode* inside biomarker/advanced (`LIC:~2775`) — a mode, not a tab.

## Per-tool

| Tool | tab click (label) | activeTab | trigger | ready-signal |
|------|-------------------|-----------|---------|--------------|
| Biomarker Analysis | "Biomarker Analysis" | `biomarker` | `setInputFiles('input#files')` (`BiomarkerAnalysisDashboard.tsx:516`, accept `.pdf,.jpg,.jpeg,.png,.txt,.csv`) → click "Generate analysis report" (`:1087`) | `#biomarker-visual-report-iframe` becomes visible (`LIC:~3855`); it only mounts once the visual report is ready. Wrapper `div[data-report-section]` (`LIC:~3510`). Pipeline up to ~30 min. |
| Knowledge Assistant | "Knowledge" | `knowledge` | fill `getByPlaceholder("Ask a question")` (`:2355/:2961`) → click `button[aria-label="Send message"]` (`:3093`) | `button[aria-label="Stop generating"]` (`:2939/:3078`) detaches; assistant `.prose` block present (`:2597`). |
| Business Advisor | "Business Advisor" | `operations` | fill `getByPlaceholder("Ask a question")` (`:975/:1404`) → **press Enter** | **No aria-labels on send/stop.** Done = `button[title="Download as PDF"]` appears (`BusinessAdvisor.tsx:1330`) — the action row renders only on a finished answer. Fallback signal: the `isLoading` thinking-dots block (`:1353`) clears. |
| Therapy Explorer | "Therapy Explorer" | `therapy` | fill `getByPlaceholder(/Ask a clinical question/)` (`:1148`) → click `button[aria-label="Send message"]` (`:1177`) | `button[aria-label="Stop generating"]` (`:1162/:1286/:1329`) detaches; assistant answer present. |

## Chrome to hide

- **Cookie consent** — key `localStorage['cookie-consent']` (`CookieConsent.tsx:12/23`). Pre-seed
  `'accepted'` before load (capture.ts does this via `addInitScript`). Fallback:
  `button[aria-label="Close cookie consent"]` (`:79`).
- **Intercom** — injected by the widget loader in `src/app/layout.tsx:57-68`. No static container in
  the DOM; hide the runtime-injected `#intercom-container` / `.intercom-lightweight-app` /
  `iframe[name^="intercom"]` via CSS.
- **What's New modal** — auto-opens ~800ms after load (`LIC:1326`). Gated by `hasUnseenUpdate()`,
  which compares `localStorage['ngm-whats-new-dismissed']` to `CURRENT_VERSION`
  (`WhatsNewModal.tsx:16/99`). capture.ts dismisses it with Escape and hides `[role="dialog"]` before
  the shot. To suppress it entirely, pre-seed that key to the current version string.

## Known fragilities

- Tab opening uses `getByText(label, { exact: true }).first()`. "Knowledge" is a short label that
  could collide with other on-page text; if it mis-clicks, switch to a more specific nav locator.
- Only the active tab's component is mounted, so placeholders like "Ask a question" (shared by
  Knowledge + Business) are unambiguous *after* the tab is opened.
- Business Advisor submit uses Enter. If the composer ever switches Enter to insert-newline, add an
  explicit send-button locator in `tools.config.ts`.

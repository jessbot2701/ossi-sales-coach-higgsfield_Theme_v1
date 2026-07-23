# Midnight Blue Ossi Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Midnight Blue visual system and Liquid-Chrome Ossi portrait to every user-visible route while preserving all existing behavior.

**Architecture:** Add one optimized production asset, a reusable server-rendered `OssiPortrait`, and a reusable `PortalHeading`. Existing page data fetching and interactive client components remain unchanged; public, portal, admin, and auth styling is converted through shared CSS tokens and focused selector updates.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Next Image, Sharp, Vitest, Playwright

---

## File Structure

### Create

- `public/assets/ozzy-liquid-chrome.webp` — optimized production portrait derived from the approved concept.
- `components/ossi-portrait.tsx` — the only component that knows the production asset path, intrinsic dimensions, variants, and alt behavior.
- `components/portal-heading.tsx` — shared portal/admin heading layout with Ossi and optional actions.
- `tests/ossi-asset.test.ts` — verifies production asset presence, format, and size budget.
- `tests/ossi-theme.test.ts` — verifies shared components, Midnight tokens, and mobile visibility contract.
- `tests/ossi-routes.test.ts` — verifies Ossi adoption across every user-facing route.

### Modify

- `styles.css` — global Midnight tokens plus landing-page surface and Ossi asset treatment.
- `app/app.css` — portal, admin, auth, form, card, table, portrait, and responsive Midnight styling.
- `app/page.tsx` — render the shared Liquid-Chrome portrait in the public hero.
- `app/login/page.tsx` — add the auth portrait treatment.
- `app/set-password/page.tsx` — add the auth portrait treatment.
- `app/app/page.tsx` — use `PortalHeading`.
- `app/app/training/page.tsx` — use `PortalHeading`.
- `app/app/sessions/[id]/page.tsx` — use `PortalHeading` while preserving actions.
- `app/admin/users/page.tsx` — use `PortalHeading`.
- `app/admin/sessions/page.tsx` — use `PortalHeading`.
- `components/training-launcher.tsx` — replace the previous Ossi artwork with the shared portrait.
- `tests/training-ui.test.ts` — assert the new shared portrait contract.
- `tests/e2e/landing.spec.ts` — assert Ossi on landing/auth pages and capture the approved public visuals.
- `tests/e2e/landing.spec.ts-snapshots/*` — update desktop/mobile baselines and add auth baselines.

## Task 1: Produce and Guard the Production Asset

**Files:**
- Create: `public/assets/ozzy-liquid-chrome.webp`
- Create: `tests/ossi-asset.test.ts`
- Reference: `docs/superpowers/specs/assets/ozzy-liquid-chrome-concept.png`

- [ ] **Step 1: Write the failing asset test**

Create `tests/ossi-asset.test.ts`:

```ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const asset = join(process.cwd(), "public/assets/ozzy-liquid-chrome.webp");

describe("Liquid-Chrome Ossi production asset", () => {
  it("ships one optimized WebP under the 700 KB budget", () => {
    expect(existsSync(asset)).toBe(true);
    expect(statSync(asset).size).toBeLessThan(700_000);
    const header = readFileSync(asset).subarray(0, 12);
    expect(header.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(header.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing-asset failure**

Run:

```powershell
npx vitest run tests/ossi-asset.test.ts
```

Expected: FAIL because `public/assets/ozzy-liquid-chrome.webp` does not exist.

- [ ] **Step 3: Convert the approved PNG to production WebP**

Run:

```powershell
node -e "require('sharp')('docs/superpowers/specs/assets/ozzy-liquid-chrome-concept.png').resize({width:1086,withoutEnlargement:true}).webp({quality:84,effort:6}).toFile('public/assets/ozzy-liquid-chrome.webp')"
```

Expected: `public/assets/ozzy-liquid-chrome.webp` is created and remains below 700 KB.

- [ ] **Step 4: Run the asset test again**

Run:

```powershell
npx vitest run tests/ossi-asset.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the production asset**

Stage only `tests/ossi-asset.test.ts` and `public/assets/ozzy-liquid-chrome.webp`. Use this IGZ message after the required confirmation:

```text
[cw]: Add Liquid-Chrome Ossi production asset
Add: Add optimized Ossi WebP and asset budget test
Mod:
Ref:
Fix:
Rem:
Rea: Prepare the approved Midnight portrait for production
```

## Task 2: Add Shared Ossi and Portal Heading Components

**Files:**
- Create: `components/ossi-portrait.tsx`
- Create: `components/portal-heading.tsx`
- Create: `tests/ossi-theme.test.ts`

- [ ] **Step 1: Write the failing component contract test**

Create `tests/ossi-theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Midnight Ossi visual contract", () => {
  it("centralizes the selected portrait and portal heading", () => {
    const portrait = source("components/ossi-portrait.tsx");
    const heading = source("components/portal-heading.tsx");
    expect(portrait).toContain('/assets/ozzy-liquid-chrome.webp');
    expect(portrait).toContain('data-testid={`ossi-portrait-${variant}`}');
    expect(portrait).toContain('alt={decorative ? "" : "Ossi, der AI Sales Coach"}');
    expect(heading).toContain("<OssiPortrait variant={portraitVariant} decorative");
    expect(heading).toContain("portal-heading-copy");
  });
});
```

- [ ] **Step 2: Run the new test and confirm missing component failures**

Run:

```powershell
npx vitest run tests/ossi-theme.test.ts
```

Expected: FAIL because the shared component files do not exist.

- [ ] **Step 3: Implement `OssiPortrait`**

Create `components/ossi-portrait.tsx`:

```tsx
import Image from "next/image";

export type OssiPortraitVariant = "hero" | "heading" | "auth" | "session";

const sizes: Record<OssiPortraitVariant, string> = {
  hero: "(max-width: 680px) 100vw, (max-width: 940px) 620px, 42vw",
  heading: "(max-width: 760px) 112px, 260px",
  auth: "(max-width: 760px) 128px, 360px",
  session: "(max-width: 760px) 104px, 220px",
};

export function OssiPortrait({
  variant,
  priority = false,
  decorative = false,
}: {
  variant: OssiPortraitVariant;
  priority?: boolean;
  decorative?: boolean;
}) {
  return (
    <div className={`ossi-portrait ossi-portrait-${variant}`} data-testid={`ossi-portrait-${variant}`}>
      <span className="ossi-portrait-halo" aria-hidden="true" />
      <Image
        className="ossi-portrait-image"
        src="/assets/ozzy-liquid-chrome.webp"
        width={1086}
        height={1448}
        sizes={sizes[variant]}
        priority={priority}
        alt={decorative ? "" : "Ossi, der AI Sales Coach"}
      />
    </div>
  );
}
```

- [ ] **Step 4: Implement `PortalHeading`**

Create `components/portal-heading.tsx`:

```tsx
import type { ReactNode } from "react";
import { OssiPortrait, type OssiPortraitVariant } from "@/components/ossi-portrait";

export function PortalHeading({
  eyebrow,
  title,
  description,
  actions,
  portraitVariant = "heading",
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  portraitVariant?: Extract<OssiPortraitVariant, "heading" | "session">;
}) {
  return (
    <div className={`portal-heading portal-heading-with-ossi${actions ? " portal-heading-actions" : ""}`}>
      <div className="portal-heading-copy">
        <p className="eyebrow"><span /> {eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
      <OssiPortrait variant={portraitVariant} decorative />
    </div>
  );
}
```

- [ ] **Step 5: Run focused type and test checks**

Run:

```powershell
npm run typecheck
npx vitest run tests/ossi-theme.test.ts
```

Expected: typecheck and the complete component contract test pass.

- [ ] **Step 6: Commit the shared components**

Stage the two component files and `tests/ossi-theme.test.ts`. Use this IGZ message after the required confirmation:

```text
[cw]: Add shared Ossi presentation components
Add: Add reusable portrait and portal heading components
Mod:
Ref: Centralize Ossi asset and heading ownership
Fix:
Rem:
Rea: Support the approved site-wide Ossi visibility
```

## Task 3: Adopt the Shared Heading Across Portal and Admin Routes

**Files:**
- Modify: `app/app/page.tsx`
- Modify: `app/app/training/page.tsx`
- Modify: `app/app/sessions/[id]/page.tsx`
- Modify: `app/admin/users/page.tsx`
- Modify: `app/admin/sessions/page.tsx`
- Create: `tests/ossi-routes.test.ts`

- [ ] **Step 1: Write the failing protected-route adoption test**

Create `tests/ossi-routes.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Ossi route adoption", () => {
  it("uses the shared Ossi heading on protected content pages", () => {
    for (const path of [
      "app/app/page.tsx",
      "app/app/training/page.tsx",
      "app/app/sessions/[id]/page.tsx",
      "app/admin/users/page.tsx",
      "app/admin/sessions/page.tsx",
    ]) {
      expect(source(path), path).toContain("<PortalHeading");
    }
  });
});
```

- [ ] **Step 2: Run the route test and confirm failure**

Run:

```powershell
npx vitest run tests/ossi-routes.test.ts
```

Expected: FAIL because the five routes still contain duplicated heading markup.

- [ ] **Step 3: Replace each duplicated heading with `PortalHeading`**

Add this import to every listed route:

```tsx
import { PortalHeading } from "@/components/portal-heading";
```

Use these exact heading calls:

```tsx
<PortalHeading
  eyebrow="Persönliches Dashboard"
  title={<>Hallo {user.displayName.split(" ")[0]}.</>}
  description="Ossi begleitet deine Entwicklung und empfiehlt dir den passenden nächsten Schritt."
/>
```

```tsx
<PortalHeading
  eyebrow="Neue Session"
  title="Wie möchtest du heute trainieren?"
  description="Ossi überrascht dich standardmäßig. Wenn du gezielt üben möchtest, stehen dir unabhängig von der Historie immer alle Schwerpunkte offen."
/>
```

```tsx
<PortalHeading
  eyebrow="Session-Auswertung"
  title={session.title || "Voice-Coaching"}
  description={<>{new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(new Date(session.created_at))}{session.duration_seconds ? ` · ${Math.round(session.duration_seconds / 60)} Minuten` : ""}</>}
  portraitVariant="session"
  actions={<div className="page-actions"><Link className="button button-secondary" href="/app">Zum Dashboard</Link><Link className="button button-primary" href="/app/training">Neues Training</Link></div>}
/>
```

```tsx
<PortalHeading
  eyebrow="Administration"
  title="Nutzer verwalten"
  description="Einladungen, Rollen und Zugangssperren. Rollenänderungen erfolgen ausschließlich serverseitig."
/>
```

```tsx
<PortalHeading
  eyebrow="Administration"
  title="Alle Sessions"
  description="Transkripte und Bewertungen sind einsehbar, aber nicht editierbar."
/>
```

- [ ] **Step 4: Run route-contract and type checks**

Run:

```powershell
npx vitest run tests/ossi-routes.test.ts
npm run typecheck
```

Expected: all five protected-route assertions and typecheck pass.

- [ ] **Step 5: Commit portal adoption**

Stage the five route files and `tests/ossi-routes.test.ts`. Use this IGZ message after the required confirmation:

```text
[cw]: Show Ossi across portal and administration headings
Add: Add Ossi portrait headings to dashboard, training, session, and admin pages
Mod: Preserve existing page copy and actions in the shared heading
Ref: Replace duplicated portal heading markup
Fix:
Rem:
Rea: Make Ossi visible throughout authenticated pages
```

## Task 4: Add Ossi to Authentication Pages

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/set-password/page.tsx`
- Test: `tests/ossi-routes.test.ts`

- [ ] **Step 1: Extend the route test with the auth contract**

Add this test inside the existing `describe` block in `tests/ossi-routes.test.ts`:

```ts
it("shows Ossi on both authentication pages", () => {
  expect(source("app/login/page.tsx")).toContain('<OssiPortrait variant="auth"');
  expect(source("app/set-password/page.tsx")).toContain('<OssiPortrait variant="auth"');
});
```

- [ ] **Step 2: Run the auth route test and confirm failure**

Run:

```powershell
npx vitest run tests/ossi-routes.test.ts
```

Expected: FAIL on the two new auth assertions.

- [ ] **Step 3: Add the auth portrait import and markup**

Add to both files:

```tsx
import { OssiPortrait } from "@/components/ossi-portrait";
```

Change the login shell body to:

```tsx
<main className="auth-shell">
  <div className="auth-portrait-shell"><OssiPortrait variant="auth" priority /></div>
  <section className="auth-card">
    <Brand />
    <div className="auth-heading"><p className="eyebrow"><span /> Sicherer Zugang</p><h1>Anmelden</h1><p>Dein persönliches Voice-Coaching ist nur mit einer Admin-Einladung verfügbar.</p></div>
    {params.error === "inactive" && <p className="form-message error">Dein Zugang ist derzeit gesperrt. Bitte wende dich an einen Administrator.</p>}
    <LoginForm next={params.next} />
    <div className="auth-links"><Link href="/">Zur Startseite</Link><span>Keine Selbstregistrierung</span></div>
  </section>
</main>
```

Change the set-password page body to:

```tsx
return <main className="auth-shell"><div className="auth-portrait-shell"><OssiPortrait variant="auth" priority /></div><section className="auth-card"><Brand /><div className="auth-heading"><p className="eyebrow"><span /> Konto schützen</p><h1>Passwort festlegen</h1><p>Wähle ein persönliches Passwort mit mindestens zehn Zeichen.</p></div><SetPasswordForm /></section></main>;
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npx vitest run tests/ossi-routes.test.ts
npm run typecheck
```

Expected: auth route assertions pass and typecheck remains green.

- [ ] **Step 5: Commit auth adoption**

Use this IGZ message after staging the two auth pages plus `tests/ossi-routes.test.ts` and receiving the required confirmation:

```text
[cw]: Add Ossi to authentication pages
Add: Add Liquid-Chrome Ossi to login and password setup
Mod: Preserve invitation and reset behavior
Ref:
Fix:
Rem:
Rea: Keep Ossi visible on every user-facing route
```

## Task 5: Replace Landing and Training Artwork

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/training-launcher.tsx`
- Modify: `tests/training-ui.test.ts`
- Test: `tests/ossi-routes.test.ts`

- [ ] **Step 1: Extend the route test with the public portrait contract**

Add this test inside the existing `describe` block in `tests/ossi-routes.test.ts`:

```ts
it("shows the hero portrait on the public landing page", () => {
  expect(source("app/page.tsx")).toContain('<OssiPortrait variant="hero"');
});
```

- [ ] **Step 2: Run the public route test and confirm failure**

Run:

```powershell
npx vitest run tests/ossi-routes.test.ts
```

Expected: FAIL on the new landing-page assertion.

- [ ] **Step 3: Replace the landing portrait with the shared component**

Add:

```tsx
import { OssiPortrait } from "@/components/ossi-portrait";
```

Remove the redundant `aria-label` from `.portrait-wrap`, then replace the existing `<picture>` inside it with:

```tsx
<OssiPortrait variant="hero" priority />
```

Keep `.sound-bars` as the next sibling inside `.portrait-wrap`.

- [ ] **Step 4: Replace the training portrait**

Add the same import to `components/training-launcher.tsx`. Replace the current `<picture>` in `.voice-portrait` with:

```tsx
<OssiPortrait variant="session" decorative />
```

- [ ] **Step 5: Update the training UI test**

Replace the two old asset expectations with:

```ts
expect(launcher).toContain('<OssiPortrait variant="session" decorative />');
expect(launcher).not.toContain("ozzy-surreal");
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npx vitest run tests/training-ui.test.ts tests/ossi-routes.test.ts
npm run typecheck
```

Expected: landing, training, and component route contracts pass; only CSS token/mobile assertions remain pending.

- [ ] **Step 7: Commit artwork adoption**

Use this IGZ message after staging the listed files plus `tests/ossi-routes.test.ts` and receiving the required confirmation:

```text
[cw]: Replace public and training Ossi artwork
Add:
Mod: Use the Liquid-Chrome portrait on landing and training surfaces
Ref: Reuse the shared Ossi portrait component
Fix:
Rem: Remove old portrait references from rendered pages
Rea: Apply the selected Foto 4 throughout the website
```

## Task 6: Apply the Midnight System to the Public Landing Page

**Files:**
- Modify: `styles.css`
- Test: `tests/ossi-theme.test.ts`

- [ ] **Step 1: Add the failing public Midnight token test**

Add inside the existing `describe` block in `tests/ossi-theme.test.ts`:

```ts
it("defines the approved Midnight public tokens", () => {
  const globalStyles = source("styles.css");
  expect(globalStyles).toContain("--midnight-page: #071b2c");
  expect(globalStyles).toContain("--midnight-nav: #020c16");
  expect(globalStyles).toContain("--midnight-surface: #0a2438");
});
```

- [ ] **Step 2: Run the token test and confirm failure**

Run:

```powershell
npx vitest run tests/ossi-theme.test.ts
```

Expected: FAIL because the Midnight tokens are not defined yet.

- [ ] **Step 3: Replace the root palette with the approved tokens**

Add these variables and map the existing aliases to them:

```css
:root {
  --midnight-nav: #020c16;
  --midnight-page: #071b2c;
  --midnight-surface: #0a2438;
  --midnight-elevated: #102e45;
  --midnight-border: #1e4a68;
  --blue: #168ce3;
  --blue-logo: #168ce3;
  --blue-bright: #168ce3;
  --blue-soft: #66bdf3;
  --navy: var(--midnight-nav);
  --navy-2: var(--midnight-page);
  --ink: #f3f9fc;
  --white: #ffffff;
  --paper: var(--midnight-page);
  --muted: #a9c0d0;
  --line: rgba(102, 189, 243, .18);
  --success: #61d2a2;
  --shell: 1180px;
  --radius: 20px;
  --shadow: 0 24px 80px rgba(0, 8, 15, .28);
}
```

- [ ] **Step 4: Convert remaining light landing sections and portrait treatment**

Use these exact surface rules, retaining existing layout declarations:

```css
body { color: var(--ink); background: var(--midnight-page); }
body::before { background: radial-gradient(circle at 80% 22%, rgba(22,140,227,.2), transparent 36%), linear-gradient(180deg, var(--midnight-nav) 0 70%, var(--midnight-page) 100%); }
.how { color: var(--ink); background: linear-gradient(180deg, #081e31 0%, var(--midnight-page) 30%, #061827 100%); }
.section-heading > p:last-child, .step p { color: var(--muted); }
.step, .steps { border-color: var(--line); }
.prompt-panel, .about, .agent-card { background: linear-gradient(145deg, var(--midnight-elevated), var(--midnight-nav)); }
.final-cta { color: var(--ink); background: linear-gradient(180deg, #0a2438, #071b2c); }
.privacy-note { border-color: var(--line); background: #081d2e; }
.privacy-inner p { color: var(--muted); }
.site-footer { background: var(--midnight-nav); }
.portrait-wrap .ossi-portrait { width: 100%; height: 100%; }
.portrait-wrap .ossi-portrait-image { width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; filter: saturate(.92) contrast(1.04); }
.portrait-wrap .ossi-portrait-halo { position: absolute; inset: 8% 6%; border-radius: 50%; background: rgba(22,140,227,.25); filter: blur(38px); }
```

- [ ] **Step 5: Run the theme contract and landing E2E without snapshot updates**

Run:

```powershell
npx vitest run tests/ossi-theme.test.ts
npx playwright test tests/e2e/landing.spec.ts --project=chromium
```

Expected: theme token assertions pass. Playwright reaches the visual screenshot assertion and reports the expected snapshot difference.

- [ ] **Step 6: Commit the public Midnight theme**

Use this IGZ message after staging `styles.css` and receiving the required confirmation:

```text
[cw]: Apply Midnight Blue to the public site
Add: Add shared Midnight color tokens
Mod: Restyle landing sections and portrait framing
Ref: Drive public colors through shared variables
Fix: Preserve readable contrast on former light sections
Rem:
Rea: Implement the approved Midnight direction
```

## Task 7: Apply Midnight Styling to Portal, Admin, and Auth

**Files:**
- Modify: `app/app.css`
- Test: `tests/ossi-theme.test.ts`
- Test: `tests/training-ui.test.ts`

- [ ] **Step 1: Add the failing portal/mobile visibility test**

Add inside the existing `describe` block in `tests/ossi-theme.test.ts`:

```ts
it("defines dark portal surfaces and never hides mobile Ossi", () => {
  const appStyles = source("app/app.css");
  expect(appStyles).toContain("var(--midnight-page)");
  expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.ossi-portrait-heading/);
  expect(appStyles).not.toMatch(/@media \(max-width: 760px\)[\s\S]*\.ossi-portrait[^}]*display:\s*none/);
});
```

- [ ] **Step 2: Run the portal/mobile contract and confirm failure**

Run:

```powershell
npx vitest run tests/ossi-theme.test.ts
```

Expected: FAIL because `app/app.css` has no shared portrait or Midnight portal rules yet.

- [ ] **Step 3: Restyle portal surfaces and controls**

Update the existing selectors to these approved surface values while preserving their current grid, sizing, and spacing declarations:

```css
.portal-page { color: var(--ink); background: radial-gradient(circle at 88% 4%, rgba(22,140,227,.2), transparent 24rem), var(--midnight-page); }
.portal-header { border-bottom-color: rgba(102,189,243,.12); background: rgba(2,12,22,.96); }
.portal-card { border-color: rgba(102,189,243,.18); color: var(--ink); background: rgba(10,36,56,.96); box-shadow: 0 12px 34px rgba(0,8,15,.18); }
.coaching-resume, .learning-goal-card { border-color: rgba(102,189,243,.3); background: linear-gradient(135deg, #0b273d, #081e31); }
.button-secondary, .button-table { border-color: #3e7597; color: #b8d7e9; background: #0b2235; }
.field input, .field select, .field textarea { border-color: #315b77; color: var(--ink); background: #081d2e; }
.training-type-option, .mode-option, .consent-field, .score-card { border-color: #294f69; color: var(--ink); background: #0b273d; }
.training-type-option.selected, .mode-option.selected { border-color: var(--blue-bright); background: #0d304a; }
.table-card, table { color: var(--ink); background: #0a2438; }
th { color: #789bae; background: #081d2e; }
td { color: #c7d9e5; }
tbody tr:hover { background: #0d2d45; }
.empty-state { border-color: #315b77; color: var(--muted); background: rgba(10,36,56,.66); }
```

- [ ] **Step 4: Add portrait and shared-heading layout rules**

Append this component block once:

```css
.portal-heading-with-ossi { position: relative; min-height: 190px; isolation: isolate; padding-right: 250px; }
.portal-heading-copy { position: relative; z-index: 3; }
.portal-heading-with-ossi .ossi-portrait { position: absolute; z-index: 1; top: -30px; right: 0; width: 250px; height: 225px; overflow: hidden; pointer-events: none; }
.portal-heading-with-ossi .ossi-portrait-image { position: relative; z-index: 2; width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; border-radius: 48% 35% 18px 48%; mask-image: linear-gradient(to bottom, #000 74%, transparent 100%); }
.portal-heading-with-ossi .ossi-portrait-halo { position: absolute; z-index: 1; inset: 12% 8%; border-radius: 50%; background: rgba(20,133,208,.3); filter: blur(28px); }
.portal-heading-actions .page-actions { position: relative; z-index: 4; }
.voice-portrait .ossi-portrait { width: 100%; height: 100%; }
.voice-portrait .ossi-portrait-image { width: 100%; height: 100%; object-fit: contain; object-position: right bottom; }
.voice-portrait .ossi-portrait-halo { position: absolute; inset: 14%; border-radius: 50%; background: rgba(20,133,208,.25); filter: blur(26px); }
```

- [ ] **Step 5: Restyle auth surfaces and keep Ossi visible**

```css
.auth-shell { grid-template-columns: minmax(280px, 390px) minmax(360px, 470px); gap: 42px; background: radial-gradient(circle at 24% 22%, rgba(22,140,227,.22), transparent 30%), var(--midnight-page); }
.auth-portrait-shell { align-self: end; width: 100%; }
.auth-portrait-shell .ossi-portrait { position: relative; height: min(76vh, 650px); overflow: hidden; }
.auth-portrait-shell .ossi-portrait-image { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; mask-image: linear-gradient(to bottom, #000 78%, transparent 100%); }
.auth-portrait-shell .ossi-portrait-halo { position: absolute; inset: 12%; border-radius: 50%; background: rgba(20,133,208,.28); filter: blur(34px); }
.auth-card { border-color: rgba(102,189,243,.2); color: var(--ink); background: rgba(10,36,56,.98); box-shadow: 0 26px 90px rgba(0,0,0,.38); }
.auth-card .brand, .auth-heading h1 { color: var(--ink); }
.auth-card .brand-copy small, .auth-heading > p:last-child, .auth-links { color: var(--muted); }
```

- [ ] **Step 6: Add exact tablet and mobile portrait behavior**

Inside the existing media queries, add:

```css
@media (max-width: 960px) {
  .auth-shell { grid-template-columns: minmax(210px, 300px) minmax(340px, 470px); gap: 20px; }
  .portal-heading-with-ossi { padding-right: 210px; }
  .portal-heading-with-ossi .ossi-portrait { width: 210px; }
}

@media (max-width: 760px) {
  .portal-heading-with-ossi { min-height: 150px; padding-right: 112px; }
  .portal-heading-with-ossi .ossi-portrait-heading,
  .portal-heading-with-ossi .ossi-portrait-session { top: -10px; right: -12px; width: 112px; height: 145px; opacity: .8; }
  .portal-heading-with-ossi h1 { max-width: calc(100vw - 150px); }
  .auth-shell { display: flex; flex-direction: column; justify-content: center; gap: 0; }
  .auth-portrait-shell { width: 128px; height: 128px; margin: 0 auto -22px; z-index: 2; }
  .auth-portrait-shell .ossi-portrait { height: 128px; border-radius: 50%; }
  .auth-portrait-shell .ossi-portrait-image { mask-image: none; border-radius: 50%; }
}
```

- [ ] **Step 7: Run CSS contract, UI, type, and lint checks**

Run:

```powershell
npx vitest run tests/ossi-theme.test.ts tests/training-ui.test.ts
npm run typecheck
npm run lint
```

Expected: all focused tests, typecheck, and lint pass.

- [ ] **Step 8: Commit authenticated Midnight styling**

Use this IGZ message after staging `app/app.css`, the shared contract test, and receiving the required confirmation:

```text
[cw]: Apply Midnight Blue across app and administration
Add: Add responsive Ossi heading and auth portrait treatments
Mod: Restyle cards, forms, tables, controls, and status surfaces
Ref: Drive authenticated UI through shared Midnight tokens
Fix: Keep Ossi visible without mobile content collisions
Rem:
Rea: Extend the selected design to every protected page
```

## Task 8: Update Browser Assertions and Visual Baselines

**Files:**
- Modify: `tests/e2e/landing.spec.ts`
- Modify/Create: `tests/e2e/landing.spec.ts-snapshots/*.png`

- [ ] **Step 1: Update the landing and auth E2E coverage**

Replace `tests/e2e/landing.spec.ts` with:

```ts
import { expect, test } from "@playwright/test";

test("shows the approved Liquid-Chrome Ossi identity", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Meet Ossi/ })).toBeVisible();
  await expect(page.getByTestId("ossi-portrait-hero")).toBeVisible();
  await expect(page.getByAltText("Ossi, der AI Sales Coach")).toBeVisible();
  await expect(page.locator(".agent-card")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sicher anmelden" })).toHaveAttribute("href", "/login");
  await page.locator(".reveal").evaluateAll((elements) => elements.forEach((element) => element.classList.add("visible")));
  await expect(page).toHaveScreenshot("landing-page.png", { fullPage: true, animations: "disabled" });
});

test("shows Ossi on invitation-only login", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  await expect(page.getByTestId("ossi-portrait-auth")).toBeVisible();
  await expect(page.getByText("Keine Selbstregistrierung")).toBeVisible();
  await expect(page).toHaveScreenshot("login-page.png", { fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Passwort vergessen?" }).click();
  await expect(page.getByRole("button", { name: "Reset-Link senden" })).toBeVisible();
});

test("shows Ossi on password setup", async ({ page }) => {
  await page.goto("/set-password");
  await expect(page.getByRole("heading", { name: "Passwort festlegen" })).toBeVisible();
  await expect(page.getByTestId("ossi-portrait-auth")).toBeVisible();
  await expect(page).toHaveScreenshot("set-password-page.png", { fullPage: true, animations: "disabled" });
});
```

- [ ] **Step 2: Regenerate approved desktop and mobile snapshots**

Run:

```powershell
npx playwright test tests/e2e/landing.spec.ts --update-snapshots
```

Expected: all three tests pass in Chromium and mobile; updated/new snapshots are written for both projects.

- [ ] **Step 3: Inspect every generated snapshot directly**

Use `view_image` on the desktop and mobile landing, login, and set-password snapshots. Confirm:

- Liquid-Chrome Ossi is visible;
- no heading, card, field, or navigation collision exists;
- Midnight surfaces match the accepted mockup;
- mobile Ossi remains visible;
- no text or control is clipped.

- [ ] **Step 4: Run Playwright again without updating**

Run:

```powershell
npx playwright test tests/e2e/landing.spec.ts
```

Expected: PASS against the committed baselines.

- [ ] **Step 5: Commit browser coverage and baselines**

Use this IGZ message after staging the E2E spec and snapshots and receiving the required confirmation:

```text
[cw]: Update Midnight Ossi visual baselines
Add: Add login and password setup visual coverage
Mod: Refresh landing screenshots for Midnight Blue and Foto 4
Ref:
Fix: Verify Ossi remains visible on desktop and mobile
Rem: Remove superseded light-theme snapshots
Rea: Lock the approved visual direction in browser tests
```

## Task 9: Full Verification and Final Review

**Files:**
- Verify all modified files
- No planned production changes unless a check identifies a concrete defect

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Expected: every command exits with code 0.

- [ ] **Step 2: Verify all user-visible routes in the browser**

Check desktop and a mobile viewport for:

```text
/
/login
/set-password
/app
/app/training
/app/sessions/[id]
/admin/users
/admin/sessions
```

For authenticated routes, use the configured local test account. If the local environment redirects because credentials or seeded records are unavailable, record that exact blocker and still verify the shared component contract plus all reachable routes.

- [ ] **Step 3: Complete the fidelity ledger**

Compare the implementation against:

```text
docs/superpowers/specs/assets/ozzy-liquid-chrome-concept.png
docs/superpowers/specs/2026-07-20-midnight-blue-ossi-site-design.md
```

Record results for portrait crop, Midnight palette, typography, card/table treatment, responsive visibility, and focus/contrast. Fix any material mismatch before continuing.

- [ ] **Step 4: Run repository hygiene checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only the intentional implementation changes remain.

- [ ] **Step 5: Prepare the final implementation commit**

If earlier task commits were intentionally squashed, use this IGZ message after the required confirmation:

```text
[cw]: Roll out Midnight Blue Ossi across the website
Add: Add reusable Liquid-Chrome Ossi presentation and visual tests
Mod: Restyle public, auth, app, training, session, and admin pages
Ref: Centralize portrait and portal heading rendering
Fix: Preserve contrast, focus, responsive visibility, and content clearance
Rem: Remove rendered references to the superseded portrait
Rea: Implement the approved site-wide Midnight design
```

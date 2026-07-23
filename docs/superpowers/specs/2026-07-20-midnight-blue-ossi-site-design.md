# Midnight Blue + Liquid-Chrome Ossi — Site Design

Status: Visual direction approved by the user on 2026-07-20.

## Objective

Apply the selected Midnight Blue visual system and the selected Liquid-Chrome Ossi portrait to every user-visible page of the Ossi V2 website. Ossi must remain visibly present at every supported viewport without covering navigation, content, forms, tables, or primary actions.

API routes and authentication callback routes do not render UI and are therefore outside the visual scope.

## Approved References

- Selected portrait concept: `docs/superpowers/specs/assets/ozzy-liquid-chrome-concept.png`
- Direction: Midnight Blue
- Portrait treatment: editorial crop at the upper right on desktop; compact but still visible portrait on mobile
- Personality: surreal, futuristic, charismatic, friendly, and professional

The concept PNG is the visual source of truth. Production implementation will derive an optimized WebP sibling without overwriting the concept file.

## Visual System

### Color tokens

| Role | Value | Usage |
| --- | --- | --- |
| Midnight navigation | `#020c16` | Sticky portal header and deepest regions |
| Page background | `#071b2c` | All app, admin, auth, and public page backgrounds |
| Primary surface | `#0a2438` | Cards, tables, forms, and content panels |
| Elevated surface | `#102e45` | Emphasized panels and table headers |
| Primary accent | `#168ce3` | Primary actions, focus rings, and active navigation |
| Ossi cyan | `#66bdf3` | Ossi-linked labels, metrics, and portrait halo |
| Primary text | `#f3f9fc` | Headings and important values |
| Secondary text | `#a9c0d0` | Body copy |
| Muted text | `#789bae` | Labels and metadata |
| Border | `#1e4a68` | Low-contrast structural borders |
| Success | `#61d2a2` | Completed and active states |

Surfaces use restrained radial blue light around Ossi, but no decorative gradient may reduce text contrast or obscure content.

### Typography and spacing

- Keep the existing Manrope heading and Inter interface typography.
- Preserve the current heading scale and compact portal density.
- Keep the existing spacing, radius, and control sizing unless color contrast requires a local adjustment.
- Do not add new marketing copy, badges, status labels, or decorative controls.

## Component Design

### Shared Ossi portrait

Create a reusable portrait component with explicit presentation variants:

- `hero`: prominent public landing-page artwork.
- `heading`: editorial upper-right portrait for portal and admin headings.
- `auth`: supporting portrait beside the login or password card.
- `session`: compact portrait for session evaluation headings.
- `mobile`: compact crop that remains visible without reducing the usable content width.

The component uses the optimized production WebP and stable intrinsic dimensions. Meaningful uses receive the alt text `Ossi, der AI Sales Coach`; repeated decorative uses use an empty alt attribute. The portrait must never be the only carrier of information.

### Shared portal heading

Introduce a focused portal-heading component that owns the title block, optional actions, and the `heading` Ossi presentation. Existing page copy remains unchanged. This prevents five separate pages from implementing different crop, spacing, and responsive behavior.

### Surface variants

Existing cards, tables, form fields, badges, and buttons keep their component structure. Styling changes are token-driven:

- cards and tables move to Midnight surfaces;
- borders become blue-gray and lower contrast;
- primary buttons keep a strong blue fill;
- secondary buttons use a dark surface with a visible blue-gray border;
- destructive and warning treatments retain their semantic red and amber distinction;
- hover and focus states remain visibly distinct.

## Route Treatment

| Route | Ossi placement | Midnight treatment |
| --- | --- | --- |
| `/` | Replace the existing hero portrait with Liquid-Chrome Ossi; Ossi remains the dominant visual | Convert public navigation, hero, instructional sections, examples, about section, and footer to the shared Midnight palette while preserving structure and copy |
| `/login` | `auth` portrait beside/behind the login card on desktop; compact top portrait on mobile | Midnight page background, dark form card, high-contrast fields and links |
| `/set-password` | Same `auth` treatment as login | Same auth color and focus system |
| `/app` | Prominent `heading` portrait at upper right | Full Midnight dashboard with dark cards and cyan metrics |
| `/app/training` | Compact `heading` portrait plus Liquid-Chrome Ossi in the existing voice-session artwork | Dark configuration cards, options, consent state, and voice panel with preserved interaction hierarchy |
| `/app/sessions/[id]` | Compact `session` portrait at upper right, clear of page actions | Dark summary, evaluation, transcript, learning-goal, and privacy surfaces with unchanged score semantics |
| `/admin/users` | Compact `heading` portrait at upper right | Dark invitation form and user table |
| `/admin/sessions` | Compact `heading` portrait at upper right | Dark session table and status badges |

Server-only routes under `/api` and redirect/callback routes under `/auth` receive no visual markup.

## Responsive Behavior

- At desktop widths, Ossi occupies the upper-right heading region with an editorial mask and cyan halo.
- Between tablet and desktop widths, the crop becomes smaller and moves behind reserved heading space.
- Below `760px`, Ossi changes to the compact mobile crop near the eyebrow/title block. It must not disappear.
- Text always stays in the foreground with sufficient padding; the portrait receives reduced opacity only when necessary for legibility.
- Navigation remains horizontally scrollable at the existing mobile breakpoint.
- Tables retain horizontal scrolling and must not be narrowed to unreadable columns.

## Data Flow and Behavior

This is a presentational change only. Authentication, Supabase access, role checks, session lifecycle, ElevenLabs integration, forms, navigation targets, copy, and button behavior remain unchanged.

The shared portrait and heading components accept presentation props only. They do not fetch data and introduce no client-side state.

## Accessibility

- Meet WCAG AA contrast for body text, controls, focus indicators, and status badges.
- Preserve keyboard focus visibility with a cyan focus ring that remains distinct on dark surfaces.
- Use semantic images and alt attributes as defined above.
- Respect `prefers-reduced-motion`; no required animation is introduced.
- Do not place text inside the generated bitmap.

## Asset Handling

- Preserve `ozzy-liquid-chrome-concept.png` as the accepted high-fidelity reference.
- Produce an optimized production WebP in `public/assets/` during implementation.
- Do not overwrite `ozzy-surreal.png` or `ozzy-surreal.webp`; retain them until the new implementation and tests are complete.
- Use one production asset across all routes to keep the brand depiction consistent and avoid duplicate downloads.

## Verification

Implementation is complete only after all of the following pass:

1. TypeScript typecheck, ESLint, Vitest, and production build.
2. Browser verification of `/`, `/login`, `/set-password`, `/app`, `/app/training`, `/app/sessions/[id]`, `/admin/users`, and `/admin/sessions` where test data and authentication permit.
3. Desktop and mobile screenshots confirming Ossi remains visible without content collisions.
4. Direct visual comparison against the accepted Midnight mockup and Liquid-Chrome concept.
5. Contrast, keyboard-focus, overflow, table-scroll, and reduced-motion checks.
6. Existing navigation, forms, training start, session actions, and admin actions remain behaviorally unchanged.

## Non-goals

- No changes to database schema, authentication, roles, APIs, ElevenLabs configuration, or session evaluation logic.
- No new dashboard metrics, navigation items, copy, or workflows.
- No theme switcher or user-selectable light mode in this change.
- No replacement of the existing brand wordmark or favicon.

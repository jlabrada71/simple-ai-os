# Index Page Redesign — Design

**Date:** 2026-07-15

## Goal

Redesign `app/pages/index.vue` (currently a bare `<h1>` + one-line description + two plain links) using
a design generated via the Stitch MCP, per the user's global preference to use Stitch for all
design-related needs.

## Source design

Generated via Stitch (project `16018729180732929566`, screen `d9ff4bef88a84ab4b0b44a0c6a767ed5`) using a
"High-End Developer Minimalist" design system (Inter + JetBrains Mono, indigo primary `#4f46e5`, light
mode, 8px spacing grid, `rounded-xl` cards). The generated screen includes a fixed top nav, hero section
(badge + headline + subheading + framed mockup image), a two-card CTA grid, a "Built for the modern
stack" feature grid, and a footer. The user chose to keep this full structure rather than trimming to
just the hero + CTAs.

## Content decisions

- **Real links**: "Open Chat" (Chat Streaming card) → `<NuxtLink to="/chat-streaming">`; "Manage Library"
  (Prompts card) → `<NuxtLink to="/prompts">`.
- **Dead links kept as inert placeholders**: nav items (Docs, Features, Pricing, Get Started) and footer
  links (Changelog, Status, Privacy, Terms) reference pages that don't exist in this app. Per the user's
  choice, these stay visually as designed but render as non-navigating `<span>` elements (not `<a>` /
  `<NuxtLink>`) with the same classes, rather than being removed or wired to real routes.
- **Hero mockup image**: Stitch generated an illustrative screenshot (dark code editor + chat UI) hosted
  on an ephemeral Google asset URL. Downloaded and committed to `public/images/hero-mockup.jpg` (32KB),
  referenced as `/images/hero-mockup.jpg` — no runtime dependency on Stitch's asset host.

## Styling approach

Stitch's output is a standalone HTML file with a Tailwind CDN config extending dozens of Material
Design 3-style tokens (`surface-container-lowest`, `on-primary-fixed-variant`, etc.) plus custom spacing
(`xs`/`sm`/`md`/`lg`/`xl`/`gutter`/`margin-desktop`) and font-size scale (`display`, `headline-lg`,
`body-md`, etc.) via `tailwind.config.extend`.

Rather than port all of that into the project's global `app/assets/css/main.css` (Tailwind v4, currently
just `@import "tailwindcss";` with zero customization) — which would add dozens of utility classes
available site-wide for a design meant for one page — the translation uses a `<style scoped>` block
in `index.vue` with CSS custom properties for the exact colors/spacing/type values Stitch generated,
plus ordinary Tailwind utilities (`flex`, `grid`, `gap-*`) for layout structure. This keeps the change
contained to `index.vue`; no other page's available classes change.

## Icons

The design uses Google's Material Symbols glyphs (`bolt`, `forum`, `terminal`, `arrow_forward`,
`folder_open`, `api`, `security`, `analytics`, `sync_alt`). The project has `@nuxt/icon` installed
(`nuxt.config.ts` modules list) but unused anywhere yet. This page uses
`<Icon name="material-symbols:<glyph-name>" />` for each instead of loading Google's separate Material
Symbols icon font — consistent with existing project tooling, no new font dependency.

## Fonts

Inter and JetBrains Mono are loaded via a Google Fonts `<link>` added through `useHead()` inside
`index.vue`'s `<script setup>` — page-scoped (only fetched when this page is visited), not a
`nuxt.config.ts`-level global change.

## Animation

Stitch's output includes a `.reveal` CSS class (fade + slide-up) driven by an `IntersectionObserver` in
a `<script>` tag, so elements animate in as they scroll into view. Since this page's content roughly
fits one viewport, this is simplified to a pure-CSS entrance animation that plays once on mount
(staggered via `animation-delay`, matching Stitch's delays) — no JS scroll-observation logic needed.

## Out of scope

- No changes to any other page, `nuxt.config.ts`, or `app/assets/css/main.css`.
- No new real pages created for the placeholder nav/footer links.
- No dark mode (matches the rest of the app).

## Files touched

- `app/pages/index.vue` (rewritten)
- `public/images/hero-mockup.jpg` (new, already downloaded)

## Testing

Per the user's global preference, UI changes get a Playwright script for automated testing. Playwright
is not yet set up in this project (`@playwright/test` is not a dependency, no config exists), so this
task adds it:

- `@playwright/test` as a devDependency, plus its bundled Chromium browser (`npx playwright install
  chromium`).
- `playwright.config.ts` at the repo root: `testDir: './tests/e2e'`, `use.baseURL:
  'http://localhost:3000'`. No `webServer` auto-start block — this project's established convention
  (used throughout prior verification work) is to bring the stack up manually via
  `docker compose up -d --build -V postgres dev` before testing, so Playwright assumes the server is
  already running rather than managing its own dev-server lifecycle.
- `npm run test:e2e` script (`playwright test`) in `package.json`, alongside the existing `npm test`
  (Vitest, unit tests only — unchanged).
- `tests/e2e/index.spec.ts`: verifies the page renders the "Simple AI OS" headline, the "Open Chat" card
  navigates to `/chat-streaming`, and the "Manage Library" card navigates to `/prompts`.

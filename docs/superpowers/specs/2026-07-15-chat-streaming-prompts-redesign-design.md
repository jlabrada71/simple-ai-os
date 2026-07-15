# Chat-Streaming & Prompts Pages Redesign — Design

**Date:** 2026-07-15

## Goal

Redesign `app/pages/chat-streaming.vue` and the prompts pages (`app/pages/prompts/index.vue`,
`app/pages/prompts/new.vue`, `app/pages/prompts/[id].vue`) — currently bare Tailwind scaffolding with no
shared visual identity — to match the design system established by the `app/pages/index.vue` redesign
(see `docs/superpowers/specs/2026-07-15-index-page-redesign-design.md`), per the user's global preference
to use Stitch for all design work.

## Source design

Generated via Stitch, project `16018729180732929566` (design system asset
`assets/37153a1f500649eb97008e13a643b6d7`, "High-End Developer Minimalist": Inter + JetBrains Mono,
indigo primary `#4f46e5`, light mode, 8px grid, `rounded-xl` cards — same system as the index page):

- Screen `3f4a6b3ae9854399bd16ce9aa6e5fc3f` — chat-streaming reference: top nav, centered chat panel card
  with header + "New Thread" button, left-aligned assistant bubbles / right-aligned indigo user bubbles,
  a segmented mode control, and a rounded textarea with a circular indigo send button.
- Screen `c6e064c9627846ed8e741c89f0679ea0` — prompts library reference: top nav, page header with
  primary "New Prompt" button, tag filter input, data table card with pill-shaped tag chips and
  Edit/Delete row actions, secondary-styled pagination buttons.

These are translation references (like the index page's source screen), not literally embedded — no new
image assets are needed for these two pages (unlike index.vue's hero mockup).

## Scope

Both pages are covered by this single spec since they share the same design system, the new shared nav
layout, and similar component patterns (buttons, inputs, chips). In scope:

- `app/pages/chat-streaming.vue`
- `app/pages/prompts/index.vue`, `app/pages/prompts/new.vue`, `app/pages/prompts/[id].vue`
- New: `app/layouts/app.vue` (shared top nav)
- Extension: `app/assets/css/main.css` (adds a `:root` design-token block; still zero global utility
  classes)

Out of scope: `app/pages/index.vue`, `app/layouts/default.vue`, `app/pages/chat.vue`,
`app/pages/stream-test.vue`, `app/pages/tests.vue` (unrelated in-progress scaffolding page), any backend
logic (`server/lib/agent-streaming.ts`, `server/api/prompts/*`, `app/lib/streaming.ts`,
`app/lib/mcp-client.ts`) — these pages restyle their existing markup and add UX polish, they do not change
data flow, validation, or the streaming mechanism.

## Design tokens (shared, `app/assets/css/main.css`)

Add a `:root` block with the small set of custom properties needed across these pages and the new nav
layout — colors, font stacks, and the `rounded-xl` radius — matching the values `index.vue` currently
keeps in its own `<style scoped>` block:

```css
:root {
  --color-primary: #4f46e5;
  --color-primary-hover: #4338ca;
  --color-on-primary: #ffffff;
  --color-surface: #ffffff;
  --color-background: #f9f9f9;
  --color-border: #e5e7eb;
  --color-text: #1a1c1c;
  --color-text-variant: #464555;
  --color-error: #ba1a1a;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius-card: 1.5rem;
  --radius-control: 0.5rem;
}
```

This is a set of variable *declarations* only — it does not add any new utility classes available to
other pages, so it doesn't reintroduce the "dozens of new classes site-wide" problem the index-page spec
avoided. `index.vue`'s existing scoped block is updated to reference these shared vars instead of
redeclaring the same hex values, removing that duplication.

Fonts: Inter + JetBrains Mono are loaded via a Google Fonts `<link>` in the new `app/layouts/app.vue`'s
`useHead()` (layout-scoped, so only pages using this layout fetch them — `index.vue` keeps its own
page-scoped link, unchanged).

## Shared nav layout — `app/layouts/app.vue`

A slim top nav bar: "Simple AI OS" logo (`<NuxtLink to="/">`), links to "Chat Streaming"
(`/chat-streaming`) and "Prompts" (`/prompts`) with an active-route indicator (indigo underline/text,
via `useRoute().path`). `<slot />` for page content below. Styled with the shared tokens in a
`<style scoped>` block local to this layout file.

`chat-streaming.vue` and the three prompts pages add `definePageMeta({ layout: 'app' })`. `index.vue` and
any other page not listed above keep the current `default` layout — no behavior change for them.

## `chat-streaming.vue`

- Chat area becomes a `rounded-xl` white card (using `--radius-card`) centered in a max-width container,
  sized with `flex flex-col` + `min-height` to fill available viewport height (replacing the current fixed
  `h-96`), with the panel header (title + "New Thread" as a secondary button) inside the card instead of
  a separate button below the form.
- Each message renders as a bubble: user messages right-aligned, `background: var(--color-primary)`,
  white text, `border-radius` rounded on all but the bottom-right corner; assistant messages left-aligned,
  light gray bubble, a small circular avatar icon (`<Icon name="material-symbols:smart-toy" />` or similar)
  next to it, content still rendered through `<MDC>` for markdown — no change to how markdown is produced
  or streamed.
- Mode selector (`<select>`) becomes a segmented control: a row of buttons ("Free text" + one per
  available prompt name), the active one styled with the primary color — same `mode` ref and
  `onModeChange` logic, just different markup/styling (buttons with `@click="mode = ...; onModeChange()"`
  instead of a native `<select>`).
- Prompt-argument inputs keep the existing `v-for` over `selectedPrompt.arguments`, restyled with
  labeled-input treatment consistent with the prompts forms (label above field, subtle background,
  indigo border on focus).
- Send button becomes a circular icon button (`material-symbols:send`) in indigo, positioned at the
  end of the input row; disabled/inert state not required (matches current behavor — no disabled state
  today either).
- No changes to `streamingFetch`, `sendMessage`, `newThread`, `listMcpPrompts`, or session/cookie
  handling.

## Prompts pages

**`prompts/index.vue`**: keeps the table structure (per user's choice over a card grid — a library that
can grow long stays scannable as a table). Restyled: table wrapped in a `rounded-xl` bordered card,
header row with `--color-text-variant` labels, row hover state (subtle background tint), tags rendered
as pill-shaped chips (`rounded-full`, soft indigo tint background, `--color-primary` text) instead of a
comma-joined string. "New Prompt" becomes a primary indigo button; the tag filter becomes a styled search
input; Previous/Next become secondary (bordered, white background) buttons. Edit/Delete actions keep their
current text-link treatment (indigo / red) per the Stitch reference. No change to `fetchPrompts`,
pagination logic, or `removePrompt`.

**`prompts/new.vue` / `prompts/[id].vue`**: the form card becomes `rounded-xl` with the shared tokens;
each `label` + `input`/`textarea` pair uses the "input field" treatment from the design system (subtle
background when inactive, indigo border + white background on focus, bold `body-sm` label above the
field). Primary button for Create/Save, red/destructive-styled button for Delete (`[id].vue` only), a
secondary (bordered) button for Cancel. No change to `submit`, `load`, `remove`, or validation logic in
either file.

## Testing

Per the established Playwright convention (`docs/superpowers/specs/2026-07-15-index-page-redesign-design.md`),
add two new specs alongside the existing `tests/e2e/index.spec.ts`, assuming the dev server is already
running (no `webServer` auto-start):

- `tests/e2e/chat-streaming.spec.ts`: navigates to `/chat-streaming`, sends a free-text message, asserts
  the user bubble appears and a streamed assistant bubble eventually appears with non-empty content.
- `tests/e2e/prompts.spec.ts`: exercises the full CRUD loop through the UI — create a prompt via
  "New Prompt", verify it appears in the table, edit it via "Edit" and change a field, verify the change
  persists, then delete it via "Delete" (accepting the `confirm()` dialog) and verify it's removed from
  the table.

## Out of scope

- No changes to `index.vue`, `default.vue`, `chat.vue`, `stream-test.vue`, or `tests.vue`.
- No dark mode (matches the rest of the app).
- No new backend routes, validation, or data model changes.
- No card-grid layout for the prompts list (table layout retained, per user's choice).
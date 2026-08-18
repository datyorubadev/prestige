# Prestige Support Portal — Design Specification (v4.0)

| | |
|---|---|
| **Status** | Draft — forward redesign spec |
| **Scope** | All components of the Prestige support platform (super-admin console, tenant owner/agent workspaces, customer portal, embeddable chat widget) |
| **Source of truth** | This document. The v3.2 prototype is the implementation baseline; v4.0 updates the prototype to match this spec (see Appendix A for the delta). |
| **Audience** | Designers, engineers, and anyone who will extend or rebuild the interface. |

---

## Contents

1. [Design principles](#1-design-principles)
2. [Forbidden defaults](#2-forbidden-defaults)
3. [Foundations](#3-foundations)
   - [Color](#31-color)
   - [Typography](#32-typography)
   - [Spacing](#33-spacing)
   - [Radii](#34-radii)
   - [Elevation](#35-elevation)
   - [Borders](#36-borders)
   - [Motion](#37-motion)
   - [Iconography](#38-iconography)
4. [Components](#4-components)
   - [Primitives](#41-primitives)
   - [Layout & navigation](#42-layout--navigation)
   - [Data display](#43-data-display)
   - [Support-specific](#44-support-specific)
   - [Chat widget](#45-chat-widget)
5. [Patterns](#5-patterns)
6. [Content & microcopy](#6-content--microcopy)
7. [Accessibility baseline](#7-accessibility-baseline)
8. [Appendix A — v3.2 → v4.0 delta](#8-appendix-a--v32--v40-delta)
9. [Appendix B — v4.0 → v4.1 delta](#9-appendix-b--v40--v41-delta)
10. [Appendix C — v4.2 two-step inbox delta](#10-appendix-c--v42-two-step-inbox-delta)

---

## 1. Design principles

Six opinions govern every decision in this system. If a choice contradicts a principle, the principle wins.

1. **A calm tool, not a decorated marketing page.** This is software people operate for hours. Surfaces are quiet: white and near-white, hairline borders, one accent color at a time. Nothing pulses except the live indicator and the chat launcher.
2. **Green means action. Never decoration.** The primary color is reserved for the single most important action on a screen. Success states reuse it. Charts may use it for "good." It is not applied to icons, cards, or text that merely exists.
3. **Density is respect.** Agents work queues, not reading experiences. Rows are compact, grids are tight, and secondary text is small but legible. Whitespace is spent where it helps scanning (page heads, KPI rows), not where it pads.
4. **Every number has context.** A KPI without a trend, target, or comparison is a guessing game. If we show a number, we show what it means — direction, target gap, or sparkline. See [KPI cards](#kpi-card).
5. **The widget is a tiny conversation surface.** Every choice — launcher size, teaser timing, greeting copy — either invites a reply or kills one. The widget never blocks money actions on mobile and never pretends an agent is online when one isn't.
6. **Restraint builds trust.** No glassmorphism, no purple gradients, no bounce-on-hover. Users should never wonder whether a control is clickable. If it looks interactive, it is; if it isn't interactive, it doesn't look like it.

## 2. Forbidden defaults

These are the tell-tale patterns this system explicitly forbids. They read as "no human decided this."

- **Purple or indigo gradients** for backgrounds, buttons, or hero surfaces. Our accent is `#00a86b`. Avatars may use soft gradients to differentiate people; nothing else does.
- **Inter at default weight with no hierarchy.** Inter is our face, but it must be *set*, not dropped in: explicit weights, leading, tracking, and uppercase micro-labels (see [Typography](#32-typography)).
- **Centered hero + one button** as the default shape of any screen. Only the public portal hero and the widget landing demo use centered heroes, and both are already specified here.
- **Rows of identical icon cards.** The marketing demo uses a three-card grid because it is a product page; inside the product, cards always differ in content hierarchy (title, metric, or action) and are never icon-only filler.
- **Drop shadows at 0.1 opacity on everything.** Elevation is a named, three-step system ([§3.5](#35-elevation)). Resting cards get a single 1px border; shadow is earned by popovers, modals, and floats.
- **Rounded corners on every element.** Corners are an *exception* system ([§3.4](#34-radii)). Radius communicates interactivity; large radius on inert surfaces reads as candy.
- **"Clean and modern" as a direction.** This document is the direction. Every spec below names exact tokens, sizes, and states.

## 3. Foundations

### 3.1 Color

Semantic tokens only. Never use a raw hex in a component when a token exists.

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#f3f5f8` | App canvas behind all surfaces |
| `--surface` | `#ffffff` | Cards, panels, popovers, sidebar |
| `--surface-2` | `#f8fafc` | Table headers, hover fills, raised insets |
| `--surface-3` | `#f1f4f8` | Hover fills, chat bubbles (bot), role-switch track |
| `--border` | `#e3e8ee` | Hairline dividers, default input/control borders |
| `--border-strong` | `#cdd6df` | Hover borders, dashed stage frames |
| `--text` | `#15202b` | Primary text, headings |
| `--text-2` | `#5b6b7b` | Secondary text, labels, metadata |
| `--text-3` | `#93a1af` | Tertiary text: captions, hints, disabled affordances |
| `--primary` | `#00a86b` | The one accent. Primary buttons, active tabs, focus rings, success |
| `--primary-dark` | `#008b57` | Hover state of primary, active nav text |
| `--primary-soft` | `#e6f7ef` | Active nav bg, selected rows, success pills, "mine" bubbles |
| `--primary-border` | `#b9e8d2` | Border for success pills and soft-green interactive cards |
| `--danger` | `#d93636` | Destructive actions, errors, escalation/high severity, unread dots |
| `--danger-soft` | `#fdecec` | Danger pills bg, danger button bg |
| `--danger-border` | `#f3c1c1` | Danger pill/button border |
| `--warning` | `#b98800` | Warnings, pending states, CSAT hover |
| `--warning-soft` | `#fff6e0` | Handover banner bg, system messages |
| `--warning-border` | `#efdc9a` | Warning pill/alert border |
| `--info` | `#2563eb` | Links, informational pills, AI/bot messages, KB icons |
| `--info-soft` | `#e8effd` | AI bubble bg, KB icon chip, info pills |
| `--info-border` | `#bcd0f8` | Info pill/alert border |
| `--violet` | `#7c3aed` | Third-party/automation flavor, some avatar variants |
| `--violet-soft` | `#f1eafe` | Violet pill bg |
| `--violet-border` | `#d6c2f5` | Violet pill border |

**Chart palette** (data-viz only, in this order): `#00a86b`, `#2563eb`, `#b98800`, `#7c3aed`, `#64748b`. Bars/segments never take the `--danger` red for a plain category — red is reserved for "bad."

**Usage rules**

- One primary action per view. When a `.btn.primary` and a `.btn.info` (or `.violet`) would both appear in the same view, demote one.
- Red is earned: destructive, error, escalation, unread, overdue, suspended. Never decorative.
- Text colors carry hierarchy: `--text` for anything a user must read, `--text-2` for support, `--text-3` for captions and hints. If two labels are fighting for `--text-2`, one is probably redundant.
- The only animated color is the live dot (pulse) and the launcher (pulse ring). See [Motion](#37-motion).

### 3.2 Typography

Face: **Inter** (system fallback: `system-ui, -apple-system, "Segoe UI", Roboto`). Monospace: `Cascadia Code / JetBrains Mono / Consolas` for IDs, canned-response shortcuts, and rule IDs.

Inter is specified here *deliberately* — this is what keeps it from reading generic:

| Role | Size | Weight | Leading | Notes |
|---|---|---|---|---|
| Display (portal hero) | 40px / 30px / 24px | 800 | 1.05 | `letter-spacing: -0.03em` |
| Page title (`h1`) | 21px | 800 | 1.2 | `letter-spacing: -0.01em` |
| Card title (`h3`) | 15px | 700 | 1.3 | no negative tracking |
| Section sub-label | 10.5–11px | 700 | — | UPPERCASE, `letter-spacing: 0.06–0.08em`, `--text-3` |
| Body | 13.5–14px | 400/500 | 1.5 | the default workhorse |
| Meta / captions | 11.5–12px | 400/500 | 1.45 | `--text-2` or `--text-3` |
| KPI value | 25px | 800 | 1.1 | `letter-spacing: -0.01em`; tabular numerals |
| Code / IDs | 12px | 400/700 | 1.4 | monospace |

**Rules**

- **Metrics use `font-variant-numeric: tabular-nums`** so KPI rows and tables don't jitter as numbers change. Applied on `.k-value`, `.table`, `.donut-center b`, `.q-id`, `.cell-main`.
- Uppercase micro-labels are the tool's voice for structure: table headers, side-nav groups, card labels. Set them in `--text-3` with tracking — never lowercase-bold for the same job.
- Never letter-space lowercase body text; never negative-track body.
- Max line length for paragraphs: ~65ch (help-center articles). Chat bubbles wrap naturally.

### 3.3 Spacing

Base unit **4px**, practical grid **8px**. The tool is dense; gaps resolve to the *smaller* end of a conflict.

| Token | Value | Typical use |
|---|---|---|
| `--sp-1` | 4px | icon-gap in tiny pills, dot spacing |
| `--sp-2` | 8px | icon↔label gap, chat bubble gap, tag gaps |
| `--sp-3` | 12px | nav item padding-y, cell padding, popover inner padding |
| `--sp-4` | 16px | card padding, grid gap, topbar inner gap |
| `--sp-5` | 20px | modal body padding, page section gaps |
| `--sp-6` | 24px | `.main` outer padding, large panel padding |
| `--sp-7` | 28px+ | page-to-page rhythm, hero sections |

Layout grid: `.main` outer padding 24px horizontal / 28px top / 60px bottom; content max-width unconstrained (density tool), public portal constrained to 1220px.

### 3.4 Radii

Radius communicates *what a thing is*:

| Token | Value | Applied to |
|---|---|---|
| `--radius-sm` | 9px | **Interactive controls**: buttons, inputs, selects, nav items, rule IDs |
| `--radius` | 12px | **Surfaces**: cards, KPI, panels, chat bubbles, icon chips |
| `--radius-lg` | 16px | **Overlays**: modal, chat window |
| `--radius-xl` | 18px | **Hero panels**: login card |
| 999px | | **Capsules**: pills, tags, switches, search chips, launcher, teaser tail |

Corner *exceptions* (the "not everything is round" rule):
- Chat bubbles: asymmetric — 12px corners with a **3px** tail corner on the sending edge (`border-bottom-right-radius: 3px` for agent, `border-bottom-left-radius: 3px` for customer/bot).
- Teaser and mine-bubbles: 12px with a 3px tail.
- Chart bars: 6px top corners, 2px bottom (a bar isn't a capsule).
- Queue rows: square — row separators are hairline borders, not gaps of air.

### 3.5 Elevation

Three named recipes, plus hairline borders for resting surfaces:

| Token | Recipe | Used by |
|---|---|---|
| `--shadow` | `0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.08)` | Resting cards (paired with `--border`) |
| `--shadow-lg` | `0 18px 40px rgba(16,24,40,.16), 0 4px 12px rgba(16,24,40,.08)` | Modals, popovers, notif feed, canned menu, login card |
| float | `0 10px 26px rgba(16,24,40,.28)` | Chat launcher, widget window (`0 18px 44px`) |

Rules: resting cards *always* also carry a 1px border (shadow alone reads as smudge). Popovers sit above everything (`z-index 80–90`), toasts highest (`120`). No glow shadows, no colored shadows (except the brand-mark, which is the single brand device).

### 3.6 Borders

- Default: 1px `--border`. Hover: `--border-strong`. Never 2px except avatar-stacking rings and the unread dot halo.
- **Dashed** border means *inert or provisional*: `.msg.note` (internal note), `.widget-stage` (the preview frame), `.rule-body` top edge, `.pt-row`/`.reason-row` separators.
- Solid hairline separates structure (rows, table cells, panes). Dashed separates *events* within a block (past-ticket rows, reason rows) — keep this distinction.
- Internal notes are **dashed purple** (`#d8b7ec`) on `#fbf3ff` so they can never be mistaken for customer-visible content. This is a hard rule.

### 3.7 Motion

Motion is brief and purposeful. Default duration 150ms for hover/color/transform; 200–250ms for appearance (pop, slide, fade).

| Move | Spec | Used by |
|---|---|---|
| Hover fill/color | 150ms ease | buttons, nav, rows |
| Pop | 220ms ease (translateY 10px + scale .98 → none, fade 0→1) | widget bubble, launcher, teaser |
| Slide up | 220ms ease (translateY 16px + fade) | modal |
| Slide in (right) | 250ms ease (translateX 24px + fade) | toast |
| Fade | 180ms ease | modal overlay, popover |
| Blink | 1.2s infinite, staggered 0/.2/.4s, opacity .25↔1 | typing dots |
| Pulse | 2s infinite ring | live dot |
| Launcher ring | 7s loop, one ring at 94% | cz-launcher |
| Skeleton shimmer | 1.4s infinite slide | skeletons |
| Row flash | 1.2s, `--primary-soft` → transparent | fresh feed items |

All motion must honor `prefers-reduced-motion`: animations collapse to a single 0ms or 150ms opacity-only step. See [Accessibility §7](#7-accessibility-baseline).

### 3.8 Iconography

- 60-icon inline SVG set, 24px viewBox rendered at **18px** default (`.ic`), 16px inside buttons/pills, 14px inside small pills/KB rows, 11px inside status dots.
- Stroke style: consistent 1.75px stroke weight, rounded caps/joins. No filled-duotone mix within one icon; the set stays uniform.
- Meaning is never carried by color alone — icons paired with text for navigation, and status uses icon + label (pill) or icon + color + text.
- New icons must be added to `icons.js` and pass `crosscheck.js` (no missing / unused).

## 4. Components

Every component follows the same template: **Purpose → Anatomy → Variants → States → Behavior → Responsive → Accessibility → Do / Don't.**

### 4.1 Primitives

#### Button

**Purpose.** Trigger a single action. The tool's most-used control; must be instantly recognizable and never decorative.

**Anatomy.** Container (inline-flex, gap 7px, `white-space: nowrap`), optional leading icon (16px), label (13px / 600). Sizes:

| Size | Padding | Font | Radius |
|---|---|---|---|
| default | 9px 15px | 13px | `--radius-sm` (9px) |
| `.sm` | 6px 11px | 12.5px | 8px |
| `.xs` | 3px 8px | 11.5px | 8px |
| `.block` | full-width, centered | — | `--radius-sm` |

**Variants.**

| Variant | Fill | Text | Border | Use |
|---|---|---|---|---|
| default | `--surface` | `--text` | `--border` | secondary action |
| `.primary` | `--primary` (hover `--primary-dark`) | `#fff` | — | **the** primary action |
| `.danger` | `--danger-soft` (hover `#fbd8d8`) | `--danger` | `--danger-border` | destructive or high-stakes |
| `.info` | `--info` | `#fff` | — | special informational action |
| `.violet` | `--violet` | `#fff` | — | automation/3rd-party action |
| `.ghost` | transparent | `--text-2` | transparent | toolbar / low-emphasis |
| `.ghost-light` | white 14% | `#fff` | white 35% | on dark (widget head) |

**States.** Default, hover (fill/color 150ms), disabled (`opacity .5`, `cursor: not-allowed`, excluded from tab order in v4.0 via `disabled`), active. Focus: visible 3px ring `rgba(0,168,107,.15)` (see [Accessibility](#7-accessibility-baseline)).

**Behavior.** Click fires immediately. Buttons that open a menu or popover carry a rotated chevron. Loading: swap label for a small spinner; do not resize the button.

**Responsive.** `.block` on narrow forms. Never shrink below a 36px tap target for primary actions on touch.

**Accessibility.** Real `<button>`; minimum 44px tap target on touch; focus ring; `:disabled` suppresses hover styling.

**Do / Don't**
- ✅ One `.primary` per view. ✅ Label is a verb ("Send reply", not "Reply sending").
- ❌ Don't stack two accent buttons (primary + info) in one toolbar. ❌ Don't use `.ghost-light` anywhere except the widget header.

#### Icon button

**Purpose.** A quiet, square control for toolbar actions (attach, emoji, close, more).

**Anatomy.** 38px square, 10px radius, `--surface` fill, `--border`, 19px icon at `--text-2`; hover fills `--surface-3`, icon `--text`. With an unread badge, the badge is 17px, `--danger`, white, 2px white ring, positioned -4px top/-4px right.

**Accessibility.** `aria-label` is mandatory — icon buttons are meaningless to AT without it. Tooltip on hover/focus.

**Do / Don't.** ✅ Same-size group in a toolbar (notif bell, role switch). ❌ Don't use an icon button for the *only* way to send a message — the send control in the widget is a filled circle and reads as primary.

#### Input / Select / Textarea

**Purpose.** Capture text, options, and long-form content.

**Anatomy.** `.field` wrapper: label (12.5px / 600, 6px below spacing), control, optional `.field-hint` (11.5px `--text-3`). Control: 1px `--border`, `--radius-sm`, padding 9px 12px, 13.5px text. `.input-wrap` variant positions a leading icon at left 12px and pads control `padding-left: 36px`.

**States.** Default, focus (`--primary` border + 3px `rgba(0,168,107,.15)` ring), error (red border + red ring, message below), disabled (`--surface-2`, `--text-3`), placeholder (`--text-3`). Search inputs rest on `--surface-2` and lift to white on focus.

**Behavior.** Textarea resizes vertically, min-height 70px; composer textarea min 42px / max 120px.

**Accessibility.** Real labels (not placeholders as labels — placeholders are hints, labels always exist). Focus ring visible. Error text announced via `aria-describedby`.

**Do / Don't.** ✅ Consistent 9px radius on all controls. ✅ Search box in topbar max-width 420px. ❌ Don't use a bare input for search — always use `.search-box` with leading icon so it's unmistakable.

#### Dropdown / Select

**Purpose.** Pick one option from a small set (filters, assign, urgency, category) with the same look everywhere — no native `<select>` styling drift.

**Anatomy.** `.dd` (relative wrapper) → `.dd-trigger` (button: 1px `--border`, `--radius-sm`, 12px padding, 13.5px text; `.sm` compact = 6px 10px, 12.5px text). Inside the trigger: `.dd-value` (selected text, ellipsis) + `.dd-chevron` (16px, sits inside the trigger's right padding so every option row shares the same gutter; rotates 180° when open). Open panel `.dd-panel`: absolute, 4px padding, `--shadow-lg`, max-height 264px, pop animation (scale .98→1 + fade, 160ms). Options reuse `.menu-item` (8px/10px, 7px radius) so dropdowns match every existing menu — `.menu-item.active` = `--primary-soft` bg + `--primary-dark` text for the current value.

**States.** Hover `--surface-2`; focus ring on trigger (3px `rgba(0,168,107,.15)`); disabled = opacity .5, `cursor: not-allowed`.

**Behavior.** Outside-click + Esc close; arrow keys navigate (listbox semantics). Branded option labels (e.g. urgency with a helper line) are allowed — keep the label left and the helper at `--text-3`.

**Accessibility.** `role="listbox"` + `aria-expanded` on trigger, `aria-selected` on options; real label (`.field` label or `aria-label`).

**Do / Don't.** ✅ Chevron gutter identical across every option width (chevron lives in the trigger, not the option). ✅ Default the trigger to the current value, not a placeholder, when one exists. ❌ Don't render two different dropdown systems — native `<select>` is banned in favor of `.dd`.

#### Modal

**Purpose.** Focused task or confirmation (create ticket, view article, confirm delete) without leaving the page.

**Anatomy.** `.modal-overlay` (fixed inset-0, z-100, `rgba(21,32,43,.45)`, fade 180ms) → `.modal-panel` (`--radius-lg` 16px, `--shadow-lg`, `--surface`, max-height `min(calc(100dvh - 48px), 720px)`, slide-up 220ms, vertical center). Widths: `sm` 440 / `md` 520 / `lg` 720. `.modal-header` (title 15px/700 + 20px icon chip at left, close icon-button right), `.modal-body` (padding `--sp-5`, scrolls internally), `.modal-footer` on `--surface-2` (right-aligned action buttons).

**Behavior.** Esc, overlay click, and the close button all dismiss. Focus moves to the panel on open and returns to the opener on close; body scroll locks while open.

**Accessibility.** `role="dialog"` + `aria-modal="true"`, `aria-label` from the title, focus trap (light: keep focus inside the panel), rendered via portal to `document.body`.

**Do / Don't.** ✅ One primary action in the footer. ✅ Small modals (440px) for single-field actions. ❌ Don't nest tabs inside a modal ([§4.1 Tabs](#tabs)). ❌ Don't stack two modals.

#### Spinner

**Purpose.** Indicate in-flight work (loading a list, submitting a form) without layout shift.

**Anatomy.** 16px ring: 2px `--primary-border`, top segment `--primary`, `animation: spin 700ms linear infinite` (`.animate-spin`). Sizes: 16 (default, inside buttons), 20 (inline empty states), 28 (page/panel loading).

**Behavior.** Loading buttons swap the label for a spinner + "…" suffix and keep their width (no resize). Disabled while pending.

**Accessibility.** `role="status"` + `aria-label` ("Loading…", "Submitting…"); never color-only.

**Do / Don't.** ✅ Reuse the same spinner everywhere. ❌ Don't mix spinner styles (ring vs dots vs arcs).

#### Switch

**Purpose.** Boolean on/off with an immediate effect.

**Anatomy.** 38×22px track, 999px, off `#cbd4dd`, on `--primary`; 16px white knob translating 16px, 200ms. `.switch-row`: label + sub-hint left, switch right, 1px `--border` separators between rows.

**States.** Off / on / disabled (opacity). Focus: ring around track.

**Accessibility.** Hidden native checkbox drives the control (already in markup); keyboard space toggles; `aria-checked` maintained.

**Do / Don't.** ✅ Use for settings that take effect immediately. ❌ Don't use for actions with side effects (deleting, suspending) — those get buttons + confirm modal.

#### Tabs

**Purpose.** Switch between sibling views without navigation.

**Anatomy.** Flex row, bottom hairline `--border`, 2px transparent bottom border on each tab; active: `--primary-dark` text + `--primary` underline. Tab: 13.5px / 600, padding 10px 15px, optional 15px icon, `overflow-x: auto`.

**Variants.** Text tabs (default), tabs with counts (inbox filter tabs as segmented control instead — see [Filter chips](#filter-chips)).

**Accessibility.** `role="tablist"`/`role="tab"`/`aria-selected`, arrow-key navigation, `tabindex="0"` on active.

**Do / Don't.** ✅ Tabs only for peers, not parent/child. ❌ Don't nest tabs inside a modal.

#### Pill / Badge / Tag

**Purpose.** Compact status and classification. Pills = status; tags = technical metadata.

**Anatomy.** Pill: inline-flex, gap 5px, 11.5px / 700, padding 3px 10px, 999px, optional 11px icon or 6px `.dot` (currentColor). Semantic set:

| Pill class | Fill / text / border |
|---|---|
| success / active / online / paid | `--primary-soft` / `--primary-dark` / `--primary-border` |
| pending / warn | `--warning-soft` / `--warning` / `--warning-border` |
| escalated / high / overdue / suspended | `--danger-soft` / `--danger` / `--danger-border` |
| neutral / resolved / offline / low / waived | `#eef1f5` / `--text-2` / `#e2e7ec` |
| info / medium / open / unassigned | `--info-soft` / `--info` / `--info-border` |
| violet | `--violet-soft` / `--violet` / `--violet-border` |

Tag (technical): 11.5px monospace, 6px radius, `#eef1f5` / `#e2e7ec`, `.off` = line-through at 45% for disabled rules.

**Accessibility.** Pills with a dot must also convey state in text (dot is never the only signal). Counts in nav (`.count`) use `--danger` white 999px.

**Do / Don't.** ✅ One pill per status axis — never two pills competing for the same state. ✅ Reserved pill semantics map 1:1 to data status values (keep a single source of truth in `data.js`).

#### Avatar

**Purpose.** Identify people. Initials on gradient, deterministic per role/person.

**Anatomy.** 32px circle (`.sm` 26px), 13px / 700 white initials, `place-items: center`. Gradient variants: green (primary), violet, blue, amber, slate. Widget header avatar is 27–30px at 25% white.

**Behavior.** No hover change. Stacking (future): 2px white ring overlap.

**Accessibility.** `aria-hidden` when the name is adjacent; `alt`-equivalent role label when standalone.

**Do / Don't.** ✅ Same person always same gradient (map by name hash). ❌ Don't mix photos and initials within one list.

#### Table

**Purpose.** Dense, sortable-feeling data review (tenants, audit, agents, billing).

**Anatomy.** `border-collapse: collapse`, 13.5px cells. Header: 11px uppercase `--text-3` tracking .06em, `--surface-2` bg, bottom `--border`. Cells: 12px 14px padding, bottom hairline. `.cell-main` (600) + `.cell-sub` (11.5px `--text-3`) two-line pattern for entity rows. Row hover `--surface-2`.

**Responsive.** Horizontal scroll wrapper on narrow screens; never squeeze columns (columns ≥ 100px).

**Accessibility.** Real `<table>` with `<th scope="col">`. Sortable columns (future): button inside `th` with `aria-sort`.

**Do / Don't.** ✅ Row hover + click affordance only when rows are actionable. ✅ Right-align nothing but numbers/amounts (or keep everything left — pick one per table). ❌ Don't gray out rows unless they're actually disabled.

#### Meter / Progress

**Purpose.** Show progress toward a target or a share of a whole.

**Anatomy.** `.meter`: 8px track `#e8edf2`, 999px, fill `--primary`; `.warn` `--warning`, `.over` `--danger`. `.bars` chart: flex-end columns, bar max-width 26px, 6px/2px corners, hover tooltip (`::after` `data-v`, dark tooltip). `.donut`: 150px circle, 26px inner cutout, `.donut-center` value + caption, `.legend` rows with 10×10 3px swatches.

**Accessibility.** Bars/donut need visible values — legend labels always include the number, not just the segment. Add `role="img"` + `aria-label` summarizing the chart.

**Do / Don't.** ✅ Bars for part-of-whole comparisons; donut only when the total matters. ✅ Tooltips on bars, not on meters. ❌ Don't use a gauge; bars read faster (preattentive).

### 4.2 Layout & navigation

#### App shell (topbar + sidebar + main)

**Purpose.** Persistent frame that keeps identity, search, and navigation one click away.

**Topbar** (60px, sticky, `rgba(255,255,255,.92)` + `backdrop-filter: blur(8px)`, bottom hairline). Order: brand → global search (flex 1, max 420px) → right actions: live status (`.rt-wrap` green pulsing dot + label), notification bell + badge, role switch, user chip (avatar + name + role).

**Sidebar** (236px, `--surface`, right hairline, sticky under topbar, own scroll). Groups via uppercase micro-labels. Nav item: 13.5px / 500, 9px radius, 17px icon at 80% opacity; hover `--surface-2`; active `--primary-soft` + `--primary-dark` + weight 600. Badge `.count` for queued work. Optional `.side-card` (primary-soft panel) for a persistent hint.

**Main**: `flex: 1`, padding 24px 28px 60px, `min-width: 0`.

**Impersonation banner**: full-width `--danger` white strip above the frame when viewing as a customer — text "Viewing as" + persona + a leave control. It must be impossible to miss and impossible to confuse with product chrome.

**Behavior.** Search opens a results popover (`.search-results`, 11px radius, `--shadow-lg`) with grouped hits (`.s-hit` + uppercase `.k` group key). Bell opens 320px notif pop (see [Notification feed](#notification-feed)). Role switch is a segmented control (`.role-switch`, `--surface-3` track, active white + `--shadow`).

**Responsive.** Below ~1020px sidebar collapses to icon rail (future) or hidden behind a hamburger; the v3.2 target keeps the topbar always visible with the brand acting as home.

**Accessibility.** Landmarks: `<header>`, `<nav>` with `aria-label`, `<main>`. Skip-to-content link. Nav is a real `<nav>` of buttons with `aria-current="page"`.

**Do / Don't.** ✅ Keep search in the topbar across all app pages. ❌ Don't scroll the topbar away; the frame must persist.

#### Login

**Purpose.** Authenticate — and, in this prototype, let a reviewer enter any role instantly.

**Anatomy.** Full-viewport grid, centered 420px card. Background: two soft radial washes (green top-left, blue bottom-right) over `--bg` — the *only* gradient allowed outside avatars, and it reads as a room, not a decoration. Card: `--surface`, 1px `--border`, `--radius-xl` 18px, `--shadow-lg`, padding 30px. Brand mark 42px gradient (`linear-gradient(135deg, --primary, #2ecf96)`) + title 19px/800 + sub 12.5px `--text-2`. Divider with hairline rules. `.demo-role` rows: 11px radius, icon + bold name + small role description; hover lifts to primary-soft with primary-border.

**Accessibility.** Labels, single-column focus order, visible focus on role buttons.

**Do / Don't.** ✅ Demo roles are buttons that read as list items (full-width, left-aligned). ❌ Don't add a fake "sign in" form on top — the demo role cards ARE the sign-in.

#### Cards & grids

**Purpose.** Group related content into scannable surfaces.

**Anatomy.** `.card`: `--surface`, 1px `--border`, `--radius`, `--shadow`, padding 18px. `.card-head`: icon (17px `--text-2`) + title (15px/700) + spacer + actions. `.hint` subtitle 12.5px `--text-2`. `.pad0` variant: no padding, `overflow: hidden` (tables live edge-to-edge inside).

Grid recipes: `.grid.kpis` `auto-fit minmax(190px,1fr)`, `.grid.two` / `.grid.three` equal, `.grid.builder` `1.7fr 1fr` (preview + config). Collapse to 1fr below 1020px.

**Do / Don't.** ✅ Cards inside a grid align to one gutter (16px). ❌ Don't put a card in a card; use `.pad0` + inner sections instead.

#### Two-step ticket inbox (v4.2)

**Purpose.** The agent's operating surface, split into two focused screens the way Freshdesk/Zendesk do it: a **Step-1 full-width list** for triage, and a **Step-2 workspace** for one ticket. No information is crammed side-by-side until the agent actually opens a ticket.

**Step 1 — Ticket queue** (`/dashboard/tickets`, `TicketList`). A single edge-to-edge card list screen:

- **Views** — segmented chips with live counts (All, Mine, Unassigned, Escalated, Resolved). Active chip = `--text` fill, white text; count badge `--surface-3` (white/20 on the active chip). Selecting a view resets to page 1.
- **Toolbar** — search (grows, clear affordance), then compact selects for Status / Priority / Assignee (incl. "Unassigned") / Channel, a sort select (Newest, Oldest, Priority, SLA first, Subject A–Z), a "Clear" link when any filter is active, and a list/table view toggle (segmented `--surface-3`).
- **Rows** — `LIST_COLS = 34px 40px 1.25fr 1fr 86px 102px 74px 120px`: checkbox · avatar · subject+preview (unread = bold + 7px `--danger` dot) · requester name+email · channel glyph+label · status pill · priority (colored) · time+SLA. Row hover `--surface-2`; rows are keyboard-activatable (Enter/Space) and navigate to the workspace. **Table view** (`TABLE_COLS = 34px 84px 1.5fr 1.1fr 84px 98px 78px 112px`) adds a sticky column header row with a select-all checkbox.
- **Pagination** — footer: "Showing 1–10 of 87 tickets", page-size select (10/25/50), prev/next and numbered pages (ellipsis when > 7). Selecting rows swaps the footer for a **bulk bar** ("N selected" + Reopen / Resolve / Deselect).
- **New ticket** — primary button in the page header opens a modal (subject, customer, channel, priority, type, message); creating navigates straight into the new ticket's workspace.
- Deep link `?email=…` (customer "My tickets") prefills search with that email.

**Step 2 — Ticket workspace** (`/dashboard/tickets/[id]`, `TicketDetail`). One card, three columns joined **edge-to-edge with hairline dividers and no gutter**:

- **Header** — back-to-queue button, mono ID, status pill, truncated `h1` subject, meta line (customer · channel · type · priority · opened · SLA), then actions: assign select, Resolve (or Reopen when resolved), a "more" menu (Escalate / Assign to me), and prev/next ticket navigation.
- **Quick list (left, 230px)** — compact rows (mono badge, subject, time · customer) with the current ticket highlighted (`--primary-soft` + 3px `--primary` left rule); clicking jumps to that ticket. Collapsible to a 36px vertical strip ("Queue").
- **Conversation (center, fluid)** — the composer pane in `flat` mode: no card chrome, no duplicated subject header; the page header owns title/status/actions. Thread, AI handover banner, reply/note composer, canned responses, Enter-to-send.
- **Context rail (right, 320px)** — tabbed (Overview / Customer / Assist / Notes, underline tabs). Overview: status pill, KV properties (priority, channel, type, sentiment, SLA, opened), assign, Resolve/Escalate or Reopen. Customer: contact block, segment, past tickets (dashed rows). Assist: AI handover (reason, evidence, suggested reply + "Use reply") and a KB search. Notes: internal-note list + private composer. Collapsible to a 36px vertical strip that keeps the four tab icons.

**Behavior & sync.** Agent actions (reply, note, resolve, escalate, reopen, assign) are persisted through `mockApi.updateTicket` and pushed over the realtime bus, so the list and the workspace never diverge. Opening a ticket clears its unread flag.

**Responsive.** The workspace has a `min-width: 920px` with horizontal scroll inside the card below that; on the narrowest shells the rails collapse first, conversation remains the focus.

**Accessibility.** Rows are keyboard-activatable with `aria-current` on the active ticket; rail collapse toggles expose `aria-expanded` (via title/aria-label); tabs use `aria-pressed`; page numbers use `aria-current="page"`.

### 4.3 Data display

#### KPI card

**Purpose.** Answer "is this good, and is it getting better?" in three seconds.

**Anatomy.** `.kpi`: `--surface`, 1px border, `--radius`, `--shadow`, padding 16px 18px. Label row: 12px/600 `--text-2` + optional 14px icon. Value: 25px/800 `--text`, tabular nums. Context line (v4.0 mandatory): trend arrow + Δ + target or sparkline. Accent variant `.kpi-accent` = 3px `--primary` top rule for the *one* headline metric per dashboard.

**Direction semantics (hard rule):** green = up-is-better, red = down-is-better, and **inverted** for lower-is-better metrics (FRT, avg resolution time) — response time falling is *good* and renders green. `.good`/`.bad`/`.warn` classes follow this, not the raw delta sign.

**Dashboard layout.** Z-pattern: KPI row top (≤5 primary), trend charts middle, tables bottom. Dashboards expose a maximum of 5 primary KPIs; anything else is a secondary card below, not another big number.

**Do / Don't.** ✅ Every value has target/trend context. ✅ Tabular numerals. ❌ Don't stack 9 KPIs in a row — the wall of numbers defeats the purpose.

#### Charts (bars / donut)

**Purpose.** Trends and distributions at a glance.

**Anatomy.** `.bars`: 190px, flex-end columns, 26px max bars, 6/2px corners, 9.5px `--text-3` axis labels, hover tooltip with exact value. `.donut` + `.legend`: 150px donut, 26px cutout, center = total, legend rows each with swatch + label + value (value always visible — never color-only).

**Color.** Chart palette order `#00a86b, #2563eb, #b98800, #7c3aed, #64748b`. Red only for the "bad" segment, never a plain category.

**Do / Don't.** ✅ Line = trend, bar = comparison, donut = part-to-whole — keep this mapping everywhere. ✅ Tooltips carry exact numbers. ❌ Don't put a donut legend with swatches only and no values.

#### Notification feed

**Purpose.** Surface async events without interrupting the current task.

**Anatomy.** Bell icon-button (38px) with `--danger` count badge. Popover: 320px, max-height 380px, `--shadow-lg`, header "Notifications" + "Mark all read", items (30px icon chip + title 12.5px/600 + meta 11.5px `--text-3`); unread items tint title `--primary-dark`; hover `--surface-2`; hairline separators.

**Behavior.** New events flash the count badge. Clicking an item navigates to the relevant ticket/view and marks it read.

**Do / Don't.** ✅ Push high-signal events only (new high-priority ticket, escalation, SLA breach). ❌ Don't notify on every reply — the inbox already shows that.

#### Feed (activity stream)

**Purpose.** Chronological record of events in a dashboard.

**Anatomy.** `.feed` max-height 420px, own scroll. Items: 32px event chip (colored icon) + title 13px/600 + meta 12px `--text-3`. Fresh items flash `--primary-soft` → transparent (1.2s). `.feed-empty` centered caption for no events.

**Do / Don't.** ✅ Color-coded event chips match the event's severity pill. ❌ Don't auto-scroll the feed while an agent is reading.

#### Empty states & skeletons

**Purpose.** Tell the user what's missing and what to do next.

**Empty state**: centered, 30px icon at 40% opacity, caption 13px `--text-3`, optional action button. Copy formula: *what happened + why + one next step* (see [Microcopy](#6-content--microcopy)).

**Skeleton**: shimmer `linear-gradient(90deg, #eef1f5 25%, #f7f9fb 50%, #eef1f5 75%)`, 200% bg-size, 1.4s slide, 8px radius, 14px bars. One skeleton row per expected list item.

**Do / Don't.** ✅ Skeleton dimensions match final layout to avoid jump. ✅ Loading ≠ empty — empty is only ever shown after data returns zero. ❌ Don't show "No results" before the first fetch completes.

#### Escalation rules

**Purpose.** Let the owner configure when conversations escalate, then watch the config behave.

**Anatomy.** `.rule-card`: 1px border, 11px radius, hover `--border-strong`, disabled at 62% opacity. Header: mono `.rule-id` chip + name 13.5px/600 + description 12px + preset tag + actions. Open state: dashed top edge, `.kv` cells (uppercase 10.5px label + mono value), condition tags (`.tag`, `.off` = strikethrough), console preview (dark `#0d1b26`, mono, colored outcome lines: `.ok` green, `.hit` amber, `.err` red, `.muted` slate).

**Do / Don't.** ✅ Live console readout ties config to behavior — keep it on the same card. ❌ Don't ship a rule editor with no dry-run output; it's a debugging trap.

### 4.4 Support-specific

#### Conversation bubbles

Covered in [3-pane inbox](#3-pane-inbox). Standalone rules: agent bubble is the only solid-primary element in a thread; AI bubbles are the only `--info` ones; system capsules and internal notes are the only full-stretch elements. Bubbles max-width 80–85%.

#### Handover / SLA

**Purpose.** Signal that a conversation needs ownership escalation, with time pressure visible.

**Anatomy.** `.handover`: `--warning-soft`, 1px `--warning-border`, 10px radius, 12px text, icon 15px `--warning`. Structure: uppercase 11px `--warning-dark` label ("Handover to Tier 2") + bolded target + paragraph detail.

**Behavior.** Appears at the top of the conversation. SLA-sensitive conversations also carry a live time chip in the header (future) — never a passive banner with no clock.

**Do / Don't.** ✅ One handover banner at a time; a new one replaces the old. ✅ Color maps to severity (`--warning` normal, `--danger` for overdue). ❌ Don't animate the banner in/out on every keystroke.

#### Canned responses

**Purpose.** Insert vetted replies with a shortcut.

**Anatomy.** Triggered from the composer toolbar. Menu: 220px max-height, `--shadow-lg`, rows = mono shortcut + description 11.5px `--text-2`, hover `--primary-soft`. Selection fills the composer with the full template.

**Accessibility.** Opens with `aria-expanded` on the trigger; arrow-key navigation over rows; Esc closes.

**Do / Don't.** ✅ Shortcuts are visible and typed (`/refund`), and searchable. ❌ Don't store customer names or ticket specifics inside a template.

#### Context rail / agent assist

Covered in [3-pane inbox](#3-pane-inbox). Assist card (`.assist`) may appear as the rail's fourth block: `.ai-chip` AI badge, KB article links, suggested reply block (`--primary-soft`/`--primary-border`), `.next-actions` chip row, and a `.note` (12px, warning icon) for cautions. Keep it scannable — assist is suggestion, never an obstacle.

#### KB list & article

**Purpose.** Self-serve answers in the portal and agent-side suggestions.

**Anatomy.** `.kb-list` grid, gap 8px. `.kb-row`: 10px radius, 1px border, hover → primary-soft/primary-border. Icon chip 28px (`--info-soft`, `--info`), title 12.5px, snippet `--text-2`, `em` tag line 10.5px `--text-3`. Agent context variant `.cx-kb` (9px radius, `--surface-2`).

**Article view (portal):** modal or page at ~720px, H1 + meta + body (max ~65ch), ends with "Was this helpful?" Yes/No → thanks state, no → "Talk to support" link.

**Do / Don't.** ✅ Every article ends with the feedback + fallback. ❌ Don't show raw HTML in snippets; strip to text.

### 4.5 Chat widget

#### Launcher

**Purpose.** The single invitation to chat.

**Anatomy.** `.cz-launcher`: **56px circle** desktop, `--primary` fill, white 24px icon, float shadow, hover scale 1.07, a soft pulse ring on a 7s loop. Position: fixed bottom-right 26px, above content, never over a sticky cart/checkout CTA.

**Responsive.** Mobile: 48–56px, thumb-reachable, bottom-center-or-right; must not cover the money action. Full-screen takeover on ≤700px (launcher hidden; window fills viewport — Conferbot pattern).

**Do / Don't.** ✅ High contrast against the page. ✅ One launcher. ❌ Don't bounce it, tilt it, or replace the icon with an animated orb.

#### Teaser / proactive prompt

**Purpose.** Surface the widget *on intent*, not on arrival.

**Anatomy.** `.cz-teaser-card`: white, 1px `--border`, 13px radius, `--shadow-lg`, 12–13px copy with 15px `--primary` icon, action row (dismiss ghost + "Chat now" primary-sm) right-aligned, tail 3px toward the launcher.

**Trigger rules (v4.0, configurable per tenant):**
- *Intent pages* (pricing, checkout, "help"): nudge after 20–30s idle.
- *Content pages* (blog, about): quiet. Reactive only.
- Never before the visitor has scrolled or after they've dismissed once in the session.
- Offline (no agent): no teaser at all — see offline mode.

**Do / Don't.** ✅ One specific question ("Question about pricing?") beats "Need help?" ✅ Dismiss is permanent for the session. ❌ Don't auto-open the full window; teaser opens on click.

#### Window & conversation

**Anatomy.** 360×520px (max-height calc(100vh − 130px)), 16px radius, `--shadow-lg` 44px. Header: brand color fill (tenant-configurable), 30px avatar at 25% white, name + state line (10.5px), close button. Body: `.w-chat` scroll area, `.w-input` pill input + 32px circular send (primary fill). Bubbles 12.5px, asymmetric tails, 85% max-width; `.w-bot.agent` variant = light blue (`#eef4ff`/`#c7d9ff`) with 14px info icon — visually distinct from the bot. `.w-sys` centered capsule for status (agent joined, assigned, etc.). Quick replies `.w-chip`: primary-soft pill, 11.5px/600, hover → solid primary.

**Typing indicator.** `.w-typing`: three 6px dots, `--text-3`, stagger blink 1.2s. Always in the flow, never in the header.

**Accessibility.** Window is a dialog (`role="dialog"`, `aria-modal` on mobile fullscreen), focus trapped while open, Esc closes, `aria-live="polite"` on new messages.

**Do / Don't.** ✅ Bubbles breathe: gap 8px, group consecutive same-author messages without a gap *inside* the group. ✅ Send on Enter, Shift+Enter for newline. ❌ Don't ping a sound per message; the first greeting is enough.

#### CSAT

**Purpose.** Measure satisfaction without interrupting.

**Anatomy.** `.w-csat`: centered `--primary-soft` capsule, 12px, "How did we do?" + rating row. v4.0 target: **5-face scale** (😞…😍) 20px, `--border-strong` rest color, hover/warn amber. Submitted: `.done` state — `--surface-2`, neutral border, check icon, "Thanks for your feedback."

**Rules.** One survey per conversation, after a back-and-forth (not after a single bot ping). Configurable: prevent rating after N minutes; prevent changing after N minutes; a remark field is optional and freezes the rating once submitted.

**Do / Don't.** ✅ CSAT is optional — auto-dismissable, never blocks. ✅ Show the thank-you state in the flow. ❌ Don't send CSAT on conversations that were escalated internally to no reply — the customer's rating would measure the wrong thing.

#### Offline mode

**Purpose.** Never pretend an agent is there.

When no agent is online: launcher opens a short "We're offline right now — leave your email and we'll reply by email" form. No teaser, no "typically replies in…". The state line in the header always tells the truth (Online / Away / Offline).

### 4.6 Customer portal

**Purpose.** The self-serve half of support: help center (KB), ticket creation, ticket tracking, and a real-time chat with the support team. Customers only ever see their own tenant's content and their own tickets — the agent queue, notes, and other tenants are invisible to them (role-branched at the route level).

**Screens.** Help center (`/portal/{tenant}`), My tickets (`/portal/{tenant}/inbox`), Support chat (`/chat/{tenant}`).

**Anatomy.**
- **Help center.** Header with tenant name + two actions: "Track a ticket" (secondary → inbox) and "Contact support" (primary → create-ticket modal). Prominent search (max-width unconstrained, leading icon) filtering the KB list; `.kb-row` results open the [Article view](#kb-list--article) as an `lg` modal with "Was this helpful?" and a "Talk to support" fallback that hands off to the create-ticket modal.
- **Create ticket modal.** `md` modal reusing [Dropdown](#dropdown--select) for Urgency (low/medium/high with helper labels) and Category (payments/cards/account/billing/other). Email prefilled from the signed-in customer; subject (≥4 chars) and message (≥10 chars) required; field errors inline. Submit swaps to a [Spinner](#spinner) + "Submitting…" (button width fixed). Success state: generated ticket id (`TK-NNNN`) + "Open conversation" → `/chat/{tenant}?email=…` and "Done".
- **My tickets.** Lookup by email (prefilled for signed-in customers, auto-runs on arrival). Live + past tickets in one table; "Open in support" deep-links to the chat with `?email=` so the right thread auto-opens; resolved rows get a violet "Reopen" action. "New ticket" opens the create-ticket modal.
- **Support chat.** Full-width thread, not the 360px widget: conversation list filtered to the signed-in customer (or `?email=`), auto-selecting the deep-linked/oldest-open/newest ticket. Agent-online pill in the header. Bubbles mirror the [3-pane inbox](#3-pane-inbox) rules (agent right green, customer left, AI info-blue with bot chip, system as centered amber capsule). Resolved thread shows a banner with a violet "Reopen" button. Composer: textarea + Send (Enter), disabled while sending with spinner. Link out to the help center when the customer wants to self-serve.

**Behavior.** Creating a ticket unshifts it into the live queue (agent side sees it immediately) and seeds the thread with an AI acknowledgement. New messages from the agent land in the same thread in real time (mock latency).

**Accessibility.** Same modal/spinner/listbox semantics as the primitives; table rows link with descriptive action text; `aria-live="polite"` on new chat messages.

**Do / Don't.** ✅ The chat and the queue are the same ticket data — a customer's "Open in support" and an agent's queue row are the same object. ✅ All customer surfaces hide internal notes (`kind: "note"`) and unread agent tooling. ❌ Don't show a customer another customer's tickets in search — scope global search to articles + own tickets for the customer role. ❌ Don't reuse the widget for the in-portal chat; it's a full page by design.

## 5. Patterns

### P5.1 New conversation → resolve

1. Ticket lands in queue (real-time push, row flash optional).
2. Unread = bold + red dot. Agent opens → dot clears.
3. Agent reads context rail (customer, past tickets, KB suggestions, notes).
4. Reply via composer; canned responses for repeat questions; internal notes for the team.
5. Resolve → CSAT offered on the customer side. Pattern contract: an agent can *always* see why a conversation was escalated (see P5.2) before replying.

### P5.2 Handover with SLA

1. Message matches an escalation rule → `.handover` banner + queue filter updates.
2. Owner/agent sees the banner with target + clock at the top of the thread; internal note records who/when/why.
3. Handover banner is dismissed only by acting (assign, reply, or resolve) — not by closing the thread.

### P5.3 Widget → CSAT loop

1. Visitor opens teaser → window → quick replies or free text.
2. Bot answers (chatbot path) → flagged for agent; agent takes over with `.w-bot.agent` style so the customer sees the handoff.
3. Conversation resolves → CSAT face scale → done state. Rating flows to agent stats and owner analytics (not just message counts).

### P5.4 KB self-serve → "Did this help?"

1. Customer searches; article opens; body + "Was this helpful?"
2. Yes → thanks + related articles. No → "Talk to support" → opens the ticket tracker / widget with the article pre-referenced.
3. No-answers feed the KB gaps metric (owner analytics) — self-serve and support are one loop, not two.

### P5.5 Escalation rule configuration

1. Rule list (cards) → open → condition tags + KV cells + live console.
2. Edit → next message re-evaluates (no restart). Console shows hit/miss per rule.
3. Disabled rules stay visible at reduced opacity (`.off` tags) — deleting is the only way to lose the audit trail.

### P5.6 Role switch & impersonation

1. Role switch (segmented) swaps the sidebar and permission surface in place.
2. Impersonation (super admin → tenant persona) raises the red banner and *must* be exited explicitly; no silent auto-return.

### P5.7 Notification routing

High-signal only: new high/urgent ticket, escalation, SLA breach, billing action. Each opens the right screen. Mark-all-read clears the badge; individual read clears just that item.

## 6. Content & microcopy

**Voice.** Short, concrete, human. The support tool talks like a teammate, the widget talks like the front desk.

- Greet once, specifically: "Question about pricing?" not "Welcome! How may we assist you today?"
- Buttons are verbs in the present tense: "Send reply", "Resolve", "Save changes", "Close".
- Progress is stated, not promised: "Typically replies in ~2 min" only if the queue supports it; otherwise "We'll get back to you by email."

**Empty states.** Formula: *what + why + next step*.
- "No escalations this week. Escalated conversations will appear here." → button "Review escalation rules".

**Error states.** Say what broke and what to do: "Couldn't save — connection lost. Retry." Never "An error occurred."

**Labels.** Status pill text mirrors the data value exactly (a pill says "Suspended" because the tenant *is* suspended). Do not invent decorative synonyms.

**Numbers.** Abbreviate only when space demands (1.2k, 3.4M). Percentages get one decimal only when it changes the answer.

**Length constraints.** Button labels ≤ 24 chars; toast titles ≤ 48; KPI labels ≤ 20; chat bubbles wrap freely.

## 7. Accessibility baseline

Minimum: **WCAG 2.2 AA**.

- **Contrast.** All text tokens pass 4.5:1 at body sizes, 3:1 at 18px+ display sizes. Verified pairs: `--text-2` on `--surface` (7.4:1), `--text-3` on `--surface` (4.6:1), white on `--primary` (3.6:1 — acceptable at 13px/600+ for UI components, but never use `--primary` text on white at small sizes; use `--primary-dark`). `--text-3` captions on `--surface-2` fail — captions on tinted fills use `--text-2`.
- **Focus.** Every interactive element has a visible focus ring. Target: 2px outline in `--primary` offset 2px, or the 3px `rgba(0,168,107,.15)` box-shadow on inputs. Implement `:focus-visible` so mouse clicks don't paint rings; keyboard always gets them.
- **Keyboard.** Full tab order on all screens; Esc closes modals/popovers/canned menus; arrows navigate tablists, canned menus, and (future) queue rows with `j`/`k`; Enter/Space activate.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` disables pulse, blink, pop, slide, shimmer — replaced by opacity-only transitions ≤ 150ms. No purely decorative motion for users who opt out.
- **Target size.** Touch targets ≥ 44px (icon buttons, launcher 48–56px). Dense desktop rows may be 32px minimum when adjacent targets are visually separated.
- **AT.** Real `<button>`/`<table>`/`<label>`; `aria-label` on icon-only controls; `role="dialog"` + `aria-modal` on widget window; `aria-live` on message stream; status conveyed in text, never color alone.
- **Color.** No meaning carried by color alone anywhere (pills add text, charts add values, unread adds bold + dot).

## 8. Appendix A — v3.2 → v4.0 delta

Mechanical change list for updating the prototype. Items are grouped by component; each is one concrete edit.

| # | Component | Change |
|---|---|---|
| A1 | Foundations | Add `--radius-lg: 16px`, `--radius-xl: 18px`, `--sp-1…--sp-7` spacing tokens; document chart palette. |
| A2 | Typography | Apply `font-variant-numeric: tabular-nums` to `.k-value`, `.table`, `.donut-center b`, `.q-id`, `.cell-main`; enforce uppercase micro-label spec on `.side-label`, `.table th`. |
| A3 | KPI card | Add mandatory context line (trend arrow + Δ + target/sparkline) to `.kpi`; limit dashboard primaries to 5; apply inverted good/bad semantics for lower-is-better metrics (FRT, avg resolution). |
| A4 | Dashboard layout | Reorder to Z-pattern: KPI row → trend charts → tables on owner analytics + agent stats pages. |
| A5 | Queue rows | Formalize 7-column grid; bold + red dot for unread (dot exists; ensure bold always accompanies it); keep mono IDs. |
| A6 | Composer | Add Reply/Note tabs as the first-class toggle (already present in markup — promote to visual tabs); keep canned menu behavior. |
| A7 | Chat widget | Launcher spec 56px (already); ensure it never overlaps money CTAs on mobile; mobile full-screen takeover ≤700px (exists — keep); teaser only on intent pages after 20–30s (add trigger gating). |
| A8 | CSAT | Swap star scale → 5-face scale; add `.done` thanks state (exists); add config for rating window + prevent-change (data model). |
| A9 | Offline mode | Add offline email-capture state; suppress teaser + fake presence when no agent online. |
| A10 | Accessibility | Add `:focus-visible` ring to all controls; add `prefers-reduced-motion: reduce` block; confirm `--text-3` captions never sit on tinted fills; add `aria-label`s to icon buttons, `role="dialog"` on widget. |
| A11 | Notes | Enforce dashed-purple internal note style everywhere (`#fbf3ff` / `#d8b7ec`) — no note may share the solid `--border` bubble style. |
| A12 | Empty states | Route every list/table through skeleton → empty (with copy formula) instead of bare "No data". |
| A13 | Notification feed | Restrict events to high-signal set; add Mark-all-read (exists); unread tint `--primary-dark` (exists). |
| A14 | Charts | Bars get hover tooltips (exists); donut legends always render values; remove any gauge-style visuals. |
| A15 | Content | Apply voice rules: verb-first buttons, specific greeting copy in widget, empty/error formulas. |
| A16 | Iconography | Keep 60-icon set, 1.75px stroke; new icons pass `crosscheck.js`. |

## 9. Appendix B — v4.0 → v4.1 delta

Round of inbox polish applied to the prototype after the v4.0 rework. Items are one concrete edit each; shadows stay disabled by design until the elevation pass is approved separately.

| # | Component | Change |
|---|---|---|
| B1 | Queue rows | Rebalanced `ROW_COLS` from `92px 1.5fr 1fr 100px 88px 1.3fr 64px` to `88px 1.6fr 0.9fr 90px 80px 1.4fr 60px` — Subject/Preview gain width so subjects stop truncating at 3 words; ID/channel/time tighten. |
| B2 | Queue headers | Column headers become sortable buttons with `aria-sort` and a `chevron-down` direction indicator (rotated 180° for ascending). Sorting is opt-in (default = natural order); `time` sorts on display string. |
| B3 | Row flash | Unread queue rows carry `animate-row-flash` on mount (fires only for newly mounted rows via stable React keys) — matches §3.7 fresh-feed flash. |
| B4 | Empty states | All three panes use a 52px rounded `--surface-2` icon chip (icon 24px, `--text-3`) instead of a bare floating glyph; the queue empty state adds a "Clear search" primary button when a query is active. |
| B5 | Context rail | Sections (Past tickets, Knowledge base, Agent assist, Private note) become collapsible blocks: chevron header toggles `aria-expanded`, body collapses. Codified as `.cx-block` / `.cx-block-header` / `.cx-block-body`. |
| B6 | Micro-labels | Context rail section headers standardized to 10.5px/700/UPPERCASE/`--text-3`/tracking 0.07em (was mixed 12–13px `--text`). KV labels stay 10px. |
| B7 | Past-ticket rows | Separators switched from solid to **dashed** `--border` — past-ticket rows are events within a block, not structural rows (§3.6). |
| B8 | Sidebar badges | "Ticket queue" (staff) and "My tickets" (customer) show live `--danger` white count capsules (`.nav-count`) of open/queued tickets; hidden at zero. |
| B9 | Search box | Global search stays `max-w-[420px]`; confirmed spec compliance, no change needed. |
| B10 | Keyboard hint | "Enter to send · Shift+Enter for new line" is no longer hidden below `sm` — always visible in the composer toolbar. |
| B11 | ARIA | `aria-label` added to queue search input and context-rail KB search input; collapsible headers expose `aria-expanded`; queue column headers expose `aria-sort`. |

---

## 10. Appendix C — v4.2 two-step inbox delta

The inbox was restructured from a simultaneous 3-pane layout into the two-step Freshdesk/Zendesk model (Step 1 full-width list → Step 2 workspace). One concrete edit per row; shadows stay disabled by design.

| # | Component | Change |
|---|---|---|
| C1 | List screen | New `TicketList` (`/dashboard/tickets`): full-width card list replacing the 3-pane grid. Views with live counts, toolbar (search + status/priority/assignee/channel selects + sort), list/table toggle, pagination footer, and a bulk-action bar replacing the footer while rows are selected. |
| C2 | Table view | Dense `TABLE_COLS` grid with a select-all header checkbox; list view uses the rich `LIST_COLS` (avatar, subject+preview, requester, channel glyph, status pill, priority, time+SLA). Rows are keyboard-activatable and navigate on click. |
| C3 | Pagination | "Showing 1–10 of 87" label, page-size select (10/25/50), prev/next, and numbered pages with ellipsis past 7; `aria-current="page"` on the active page. |
| C4 | Bulk actions | Row checkboxes feed a selection set; bulk bar offers Reopen / Resolve / Deselect, persisted via the mock event bus. |
| C5 | New ticket | Header primary button opens a modal (subject, customer, channel, priority, type, message) reusing the new `.field-input`; creation deep-links into the workspace. |
| C6 | Detail screen | New `TicketDetail` + route `/dashboard/tickets/[id]`: workspace card with three columns joined edge-to-edge (`230px 1fr 320px`, no gutter, hairline dividers, min-width 920px with horizontal scroll). |
| C7 | Quick list rail | Left rail (mono badge rows, current highlighted with `--primary-soft` + primary left rule) jumps between tickets; collapses to a 36px vertical strip labelled "Queue". |
| C8 | Conversation flat mode | `ConversationPane` gains `flat`: strips card chrome and the duplicated subject/actions header (the page header owns them) so the thread sits directly in the workspace. |
| C9 | Context rail tabs | New `ContextRail` replaces the scrolling rail: underline tabs Overview / Customer / Assist / Notes; collapses to a 36px strip that keeps the four tab icons. Overview holds status/KV/assign/Resolve–Escalate–Reopen; Assist adds evidence chunks + "Use reply" + KB search. |
| C10 | Persistence | New `mockApi.updateTicket(id, patch)` mutation emits `ticket_updated` on the bus; both screens subscribe, so replies, notes, resolve, escalate, reopen and assign never diverge between list and workspace. Opening a ticket clears its unread flag. |
| C11 | Styles | `.field-input` component class added (form inputs in modals); workspace reuses `.menu-panel`/`.menu-item` for the header "more" menu. |

---

*Conventions: tokens and class names refer to the v3.2 prototype; where v4.0 changes a token (radii, spacing), both old and new class references are given. Any future change to this spec must update Appendix A with a matching delta row.*

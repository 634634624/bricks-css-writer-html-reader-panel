# Bricks CSS Writer and HTML Reader Panel in Editor

A CodeMirror 6-based CSS editor panel for [Bricks Builder](https://bricksbuilder.io/) (WordPress). Write CSS with live sync, read HTML in real-time, manage reusable CSS recipes, autocomplete Bricks variables — all inside the builder. Cyberpunk terminal interface.

**This plugin is no longer actively maintained.** See [Background](#background) for the story.

![License: GPL-2.0-or-later](https://img.shields.io/badge/license-GPL--2.0--or--later-blue)
![WordPress 6.0+](https://img.shields.io/badge/WordPress-6.0%2B-blue)
![PHP 8.0+](https://img.shields.io/badge/PHP-8.0%2B-purple)
![Bricks 2.2.x](https://img.shields.io/badge/Bricks-2.2.x-orange)

---

## Background

This plugin was built almost entirely with AI assistance (Claude, Codex) over the course of several months in early 2026. It started as an exciting experiment: could a non-developer build a professional-grade WordPress plugin using AI coding tools?

The answer: **technically yes, practically no** — at least not for long-term maintenance.

The plugin works. It has a comprehensive test suite (100+ tests, unit + E2E with Playwright). The code passed multiple rounds of independent code review. The security surface was audited. The release gate runs clean.

But I learned the hard way that **building a plugin in the WordPress + Bricks Builder ecosystem is brutally hard to sustain as a solo non-developer**:

- WordPress, Bricks, and other plugins all update on their own schedules. Every update can break compatibility in ways that require deep technical debugging.
- The plugin has to coexist with dozens of other plugins in unpredictable combinations.
- Monkey-patching third-party builder internals (Bricks DOM, iframe, selection API) is inherently fragile.
- There's no proper CSS code editor solution for Bricks yet, and I'd rather wait for real developers to build one than try to maintain this myself.

I'm sharing this code publicly because:
1. It might be useful to someone in the Bricks community
2. The architecture and patterns (especially the Bricks API bridge, live CSS sync, and recipe system) might save someone else time

**Use it as you wish. Fork it, learn from it, take parts of it. No support, no updates, no guarantees.**

---

## Features

### CSS Editor Panel

A docked panel at the bottom of the Bricks Builder with two panes:

- **CSS pane** — Full CodeMirror 6 editor with syntax highlighting (GitHub Dark theme), live CSS sync to Bricks elements
- **HTML pane** — Read-only HTML view of the selected element

**Panel controls:**
- Font size adjustment (A-/A+, range 9-16px)
- Soft wrap toggle
- Undo/redo with keyboard shortcuts (Cmd+Z / Cmd+Shift+Z)
- Scope mode selector (Element / Page)
- Recipe browser modal
- Variable cheat sheet modal
- Minimize/close
- Resizable panel height (drag handle)

### Live CSS Sync

The core feature. When you type CSS in the editor, it's applied to the selected Bricks element in real-time:

- **80ms debounce** — fast enough to feel instant, slow enough to not overwhelm the builder
- **Bidirectional** — select an element in Bricks, its CSS appears in the editor; edit the CSS, it writes back
- **Scope modes:**
  - `self` — edit the selected element's `_cssCustom` field
  - `page` — edit page-level custom CSS
- **Property filter** — click class/ID chips in the panel header to filter CSS to a specific selector
- **Hover preview** — hover over CSS selectors in the editor to highlight matching elements in the builder

### Recipe System

A snippet library for reusable CSS patterns:

- **@-triggered autocomplete** — type `@` in the editor, get a searchable recipe list
- **3 recipe types:** CSS snippet, HTML snippet, compound (both)
- **Recipe modal** — full browser with search, categories, favorites, recent list, split preview pane, keyboard navigation
- **8 managed presets** — curated recipe collections (QMinimal, General Full, Vertical Full, etc.)
- **Admin-locked preset mode** — admin controls which preset is active, editors can't switch

**Built-in recipes (7):**

| Recipe | Category | Description |
|--------|----------|-------------|
| `auto-grid-5` | layout | Auto-fit responsive grid (5 columns) |
| `bg-dark` | visual | Dark background with light text |
| `card-review` | component | Review card with padding and shadow |
| `schema-review` | component | Schema.org review markup helper |
| `a11y-tabs` | a11y | Accessible tab component styles |
| `hover-lift` | interaction | Hover lift effect with shadow transition |
| `focus-ring` | a11y | Keyboard focus ring styling |

### Recipe Catalog (Admin Page)

A full single-page application for managing recipes:

- **Recipes tab** — CRUD operations, drag-and-drop reordering, category accordions, search, pagination
- **Presets tab** — manage and switch recipe presets
- **Import tab** — bulk import from text or file, merge or replace mode, preset assignment
- **Export tab** — full catalog JSON export with copy-to-clipboard
- **Guide tab** — built-in user guide + technical reference (11 accordion sections)

### Variable Autocomplete

- **$-triggered** — type `$` in the editor to see all Bricks CSS variables
- Variables grouped by prefix (`--space-`, `--color-`, `--font-`, etc.)
- Inline color swatches for color variables
- Copy-to-clipboard
- Inserts as `var(--variable-name)`

### Bricks Builder API Bridge

The largest and most complex part of the plugin (8200+ lines). Provides:

- **Element selection tracking** — real-time tracking of which element is selected in Bricks
- **CSS read/write** — read and write `_cssCustom` fields on any element
- **DOM observation** — MutationObserver + polling for builder DOM changes
- **Selection analysis** — detects component context, slots, variants, query loops, dynamic data, schema, conditions, WPML
- **CSS property mapping** — 100+ entry bidirectional map between CSS properties and Bricks model paths
- **Preview system** — hover preview highlighting and recipe ghost preview injection

### Editor-First Launch Gate

Controls whether the panel auto-opens when the builder loads:

- `opt-in` — panel hidden by default, user clicks to show
- `team-default` — panel shown by default, user can opt out
- `editor-first` — panel always shown
- **Kill switch** — emergency disable via config

### Companion Diagnostics

Automatic environment checking:

- WordPress version (min 6.0)
- PHP version (min 8.0)
- Bricks Builder detection and version verification
- Core Framework detection and API availability
- Admin notice rendering for compatibility issues
- Structured diagnostic report in JS config

### Input Shield

Prevents Bricks Builder from stealing keyboard focus when typing in the editor:

- Shields: Ctrl/Cmd + C/X/V/Z/A/S/D/F, Shift+Z/Y
- Passes through: regular typing, AltGr/Option characters, dead keys, Ctrl+Space (autocomplete)

### Debug API

Extensive client-side inspection via `window.__CM6GPT`:

```javascript
// Inspection
__CM6GPT.getSelectionAnalysis()
__CM6GPT.printSelectionAnalysis()

// Reports
__CM6GPT.getWriteSync9Report()
__CM6GPT.getCanonicalSnapshotReport()
__CM6GPT.printSafeSubsetCompilerReport()

// Recipe catalog
__CM6GPT.getRecipeCatalog()
__CM6GPT.searchRecipes('grid')
__CM6GPT.insertRecipe('auto-grid-5')

// Shadow parity telemetry
__CM6GPT.runShadowParityProbe()
```

### Admin Dashboard

Two-tab admin page:

- **Dashboard** — recipe statistics, active preset, Bricks variable count, compatibility status, quick links
- **Documentation** — user guide + technical reference with accordion sections

---

## Design

**Theme: Cyberpunk Terminal**

- Pitch black background (`#000000`)
- Cyan primary (`#00f0ff`)
- Neon green success (`#39ff14`)
- Hot pink accent (`#ff00aa`)
- JetBrains Mono / SF Mono / Fira Code typography
- Zero border-radius (angular aesthetic)
- GitHub Dark autocomplete theme

---

## Technical Details

### Architecture

```
cm6gpt-lite.php          — Bootstrap, hooks, enqueue, admin pages, diagnostics
assets/js/
  cm6gpt-main.js         — Entry point, bootstrap, editor-first gate, companion diagnostics
  cm6gpt-panel.js         — Panel UI construction, modals, preferences (5152 lines)
  cm6gpt-editors.js       — CodeMirror 6 factory, autocomplete integration (1480 lines)
  cm6gpt-recipes.js       — Client-side recipe manager (1172 lines)
  cm6gpt-bricks-api.js    — Bricks Builder API bridge (8206 lines)
  cm6gpt-bridge-css.js    — CSS live sync bridge (6123 lines)
  cm6gpt-bridge-html.js   — HTML read-only bridge (3689 lines)
  cm6gpt-bridge-shared.js — Shared bridge utilities (1765 lines)
  cm6gpt-css-map.generated.js — CSS→Bricks property mapping
  codemirror-bundle.js    — CodeMirror 6 vendor bundle
assets/css/
  cm6gpt-panel.css        — Panel + modal styles (cyberpunk theme)
  cm6gpt-admin.css        — Admin page styles
includes/
  recipe-manager/         — PHP classes for Recipe Catalog admin (11 classes)
data/
  recipe-seed.json        — Default recipe catalog (seeded on activation)
docs/
  57 markdown files       — Architecture docs, API references, decision logs
```

### Requirements

- WordPress 6.0+
- PHP 8.0+
- Bricks Builder 2.2.x
- Optional: Core Framework 1.10.x (for variable detection)

### Permissions

| Context | Capability Required |
|---------|-------------------|
| Builder panel | `edit_posts` |
| Admin dashboard | `manage_options` |
| Recipe CRUD (AJAX) | `manage_options` + nonce |

### Storage

- **wp_options:** recipe catalog, blocked IDs, preset profiles
- **localStorage:** UI preferences, editor-first opt-in, recent/favorite recipes
- **Clean uninstall:** removes all wp_options on plugin deletion

---

## Installation

1. Download or clone this repository
2. Copy `app/public/wp-content/plugins/CM6GPT-Lite/` to your WordPress `wp-content/plugins/` directory
3. Activate "CM6GPT Lite" in WordPress admin
4. Open the Bricks Builder on any page — the panel appears at the bottom

---

## License

GPL-2.0-or-later

---

## Disclaimer

This plugin is provided as-is, with no warranty, no support, and no commitment to future updates. It was a learning project. Use at your own risk. If you find it useful, great. If you improve it, even better.

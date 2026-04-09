---
title: "CM6GPT-Lite — Design Tokens (Autocomplete Panel)"
description: "Color token reference for the autocomplete panel: list background/foreground, hover/selected states, text highlights, variable swatch area — GitHub Dark inspired theme"
category: reference
tags: [design-tokens, css-variables, autocomplete, colors, theme, github-dark]
related:
  - docs/css-panel.md
  - docs/js-editors.md
created: 2026-03-29
updated: 2026-04-01
status: current
---

# CM6GPT-Lite — Design Tokens (Autocomplete Panel)

> Updated: 2026-03-29
> Theme: "GitHub Dark" inspired — muted, readable, eye-friendly

---

## Autocomplete List

| Token | Hex | Usage |
|-------|-----|-------|
| `list-bg` | `#0d1117` | List item default background |
| `list-fg` | `#c9d1d9` | List item default text color |
| `list-border` | `#1b2332` | Separator between items |
| `list-hover-bg` | `#1f3a5f` | Hovered item background |
| `list-hover-fg` | `#e6edf3` | Hovered item text color |
| `list-selected-bg` | `#264f78` | Selected (aria-selected) item background |
| `list-selected-fg` | `#e6edf3` | Selected item text color |
| `list-selected-border` | `#264f78` | Selected item border color |

## Text Highlights

| Token | Hex | Usage |
|-------|-----|-------|
| `match-fg` | `#e3b341` | Matched/typed characters in label |
| `match-selected-fg` | `#ffd866` | Matched characters on selected/hovered row |

## Variable Swatch Area

| Token | Hex | Usage |
|-------|-----|-------|
| `var-val-fg` | `#8b949e` | Variable value text (truncated) |
| `var-val-hover-fg` | `#b1bac4` | Variable value on selected/hovered row |
| `swatch-border` | `rgba(255,255,255,0.15)` | Color swatch border (default) |
| `swatch-hover-border` | `rgba(0,0,0,0.3)` | Color swatch border (hover/selected) |
| `bar-bg` | `rgba(88,166,255,0.55)` | Spacing bar default |
| `bar-hover-bg` | `rgba(88,166,255,0.7)` | Spacing bar on hover/selected |

## Completion Info Panel

| Token | Hex | Usage |
|-------|-----|-------|
| `info-bg` | `#0d1117` | Info tooltip background |
| `info-fg` | `#c9d1d9` | Info tooltip text |
| `info-border` | `#1b2332` | Info tooltip border |

## Typography

| Property | Value |
|----------|-------|
| Font family | `'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace` |
| Info font size | `11px` |
| Value font size | `0.8em` |
| Label font weight | `500` |
| Match font weight | `700` |

## Design Rationale

- **Previous palette**: Neon cyan `#00f0ff` + hot pink `#ff00aa` — high-energy but fatiguing
- **New palette**: Muted blue/gold on near-black — VS Code / GitHub Dark harmony
- **Selected state**: `#264f78` (slightly brighter than hover `#1f3a5f`) for clear hierarchy
- **Match highlight**: Gold `#e3b341` is visible on both dark bg and blue selected bg
- **Value text**: Subdued gray `#8b949e` — present but not competing with the label

---

*File: `assets/css/cm6gpt-panel.css` lines 2876–3010*

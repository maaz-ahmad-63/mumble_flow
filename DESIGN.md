<USER_REQUEST>
You are an expert UI/UX designer and senior frontend developer.

Analyze the provided DESIGN.md file and build a modern, production-ready website inspired by its design system.

Requirements:
- Follow the layout, spacing, typography, color palette, and component hierarchy from DESIGN.md.
- Do NOT copy logos, brand names, copyrighted text, or proprietary assets.
- Create original content while maintaining a similar premium design language.
- Make the website fully responsive for desktop, tablet, and mobile.
- Ensure accessibility, smooth animations, and optimized performance.
- Output complete production-ready code.  # Design System Inspired by Flow for Business

> Auto-extracted from `https://wisprflow.ai/business` on 2026-10-08

## 1. Visual Theme & Atmosphere

Friendly, approachable design with rounded shapes and generous whitespace.

The hero section leads with "The fastest teams don't type. They speak.".

**Key Characteristics:**
- Eb garamond as the heading font (custom web font loaded via @font-face)
- Figtree as the body font for all running text
- Heading weight 400, letter-spacing -3.75px
- Light/white background (#ffffeb) as the primary canvas
- Primary accent `#ffa946` used for CTAs and brand highlights
- 3 shadow level(s) detected — tinted shadows
- Rounded corners (8px+) creating a friendly, approachable feel
- Tags: light, rounded, accented, bold-typography, sans-serif

## 2. Color Palette & Roles

### Primary
- **Primary Accent** (`#ffa946`) · `--color-primary`: Brand color, CTA backgrounds, link text, interactive highlights.
- **Secondary Accent** (`#ff6c4c`) · `--color-secondary`: Secondary brand, hover states, complementary highlights.
- **Background** (`#ffffeb`) · `--color-bg`: Page background, primary canvas.
- **Background Secondary** (`#e4e4d0`) · `--color-bg-secondary`: Cards, surfaces, alternating sections.

### Text
- **Text Primary** (`#1a1a1a`) · `--color-text`: Headings and body text.
- **Text Secondary** (`#666666`) · `--color-text-secondary`: Muted text, captions, placeholders.

### Borders & Surfaces
- **Border** (`#e4e4d0`) · `--color-border`: Dividers, outlines, input borders.

### Full Extracted Palette

| # | Hex | CSS Variable | Role | Area | Contrast |
|---|---|---|---|---|---|
| 1 | `#ffffeb` | `--palette-1` | block | large | text-dark |
| 2 | `#e4e4d0` | `--palette-2` | button | large | text-dark |
| 3 | `#034f46` | `--palette-3` | block | large | text-light |
| 4 | `#ff6c4c` | `--palette-4` | section | large | text-dark |
| 5 | `#f0d7ff` | `--palette-5` | button | large | text-dark |
| 6 | `#34d399` | `--palette-6` | text-accent | large | text-dark |
| 7 | `#ffa946` | `--palette-7` | section | large | text-dark |
| 8 | `#ffffff` | `--palette-8` | badge | large | text-dark |
| 9 | `#1a5e54` | `--palette-9` | block | medium | text-light |
| 10 | `#1a1a1a` | `--palette-10` | button | medium | text-light |
| 11 | `#dddddd` | `--palette-11` | block | medium | text-dark |
| 12 | `#f5f4f0` | `--palette-12` | badge | medium | text-dark |

## 3. Typography Rules

- **Heading Font:** `Eb garamond` (web font)
- **Body Font:** `Figtree` (web font)

### Type Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| H1 | Eb garamond | 75px | 400 | 75px | -3.75px |
| H2 | Eb garamond | 75px | 400 | 75px | -2.25px |
| H3 | Eb garamond | 18.08px | 400 | 19.888px | normal |
| H4 | Eb garamond | 40px | 400 | 38px | -1.2px |
| Body | Figtree | 20px | 500 | 26px | normal |

### Type Scale

| Token | Size | Suggested Usage |
|---|---|---|
| Display | `120px` | headings |
| H1 | `75px` | headings |
| H2 | `64px` | headings |
| H3 | `48px` | headings |
| H4 | `40px` | headings |
| Body L | `32px` | body / supporting text |
| Body | `26px` | body / supporting text |
| Small | `24px` | body / supporting text |
| XS | `20px` | body / supporting text |
| Caption | `18.08px` | body / supporting text |

## 4. Component Stylings

### Primary Button

```css
.btn-primary {
  background: #f0d7ff;
  color: #1a1a1a;
  border-radius: 8px;
  padding: 14px 14px;
  font-size: 16px;
  font-weight: 600;
  border: 2px solid rgb(26, 26, 26);
  cursor: pointer;
}
```

### Filled Button

```css
.btn-filled {
  background: #ffffeb;
  color: #1a1a1a;
  border-radius: 8px;
  padding: 0px 0px;
  font-size: 16px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Ghost Button

```css
.btn-ghost {
  background: transparent;
  color: #1a1a1a;
  border-radius: 0px;
  padding: 8px 10.08px;
  font-size: 16px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Filled Button 2

```css
.btn-filled-2 {
  background: #1a1a1a;
  color: #ffffff;
  border-radius: 6.08px;
  padding: 0px 0px;
  font-size: 16px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Ghost Button 2

```css
.btn-ghost-2 {
  background: transparent;
  color: #ffffff;
  border-radius: 0px;
  padding: 0px 0px;
  font-size: 16px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Ghost Button 3

```css
.btn-ghost-3 {
  background: transparent;
  color: #ffffeb;
  border-radius: 0px;
  padding: 0px 0px;
  font-size: 32px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Card

```css
.card {
  background: #1f1f1f;
  border-radius: 20px;
  padding: 16px;
}
```

## 5. Layout Principles

- **Base spacing unit:** `6px` — use multiples (12px, 18px, 24px, etc.)

### Spacing Scale (extracted from real elements)

| Token | Value | Role |
|---|---|---|
| spacing-1 | `6px` | element |
| spacing-2 | `16px` | element |
| spacing-3 | `24px` | card |
| spacing-4 | `8px` | element |
| spacing-5 | `4px` | element |
| spacing-6 | `96px` | section |
| spacing-7 | `5px` | element |
| spacing-8 | `32px` | card |

### Border Radius Scale

| Token | Value | Element |
|---|---|---|
| radius-button | `8px` | button |
| radius-card | `32px` | card |
| radius-pill | `100px` | pill |
| radius-card | `24px` | card |
| radius-button | `12px` | button |
| radius-card | `50px` | card |

## 6. Depth & Elevation

| Level | Shadow | Usage |
|---|---|---|
| Low | `rgba(0, 0, 0, 0.3) 1.1px 1.1px 1.1px 0px` | Cards, subtle elevation |
| Low | `rgb(100, 100, 100) -2px 2px 0px 0px` | Cards, subtle elevation |
| Low | `rgba(0, 0, 0, 0.1) 1px 1px 3px 0px` | Cards, subtle elevation |


## 7. Do's and Don'ts

### Do
- Use `#ffffeb` as the primary background color
- Use `Eb garamond` for all headings and `Figtree` for body text
- Use `#ffa946` as the single dominant accent/CTA color
- Maintain `6px` as the base spacing unit — all gaps should be multiples
- Use rounded corners (`8px`+) consistently for all interactive elements
- Make headlines large and bold — typography is the hero element
- Apply the shadow system for elevation — use the extracted shadow values
- Use weight 400 for headings to match the brand's typographic voice

### Don't
- Don't use colors outside the extracted palette without justification
- Don't substitute Eb garamond/Figtree with generic alternatives
- Don't use irregular spacing — stick to 6px grid
- Don't use dark/black backgrounds — this is a light-themed design
- Don't use sharp corners — they feel hostile in this rounded design language
- Don't use pure black (#000000) for text — use `#1a1a1a` instead
- Don't add decorative elements not present in the original design — no badges, ribbons, banners, or ornaments unless the source site uses them
- Don't invent UI patterns the source site doesn't have — if the original has no NEW badge, don't add one just because a red is in the palette

## 8. Responsive Behavior

| Breakpoint | Width | Notes |
|---|---|---|
| Mobile | < 640px | Single column, stack sections, reduce font sizes ~80% |
| Tablet | 640–1024px | 2-column where appropriate, maintain spacing ratios |
| Desktop | 1024–1440px | Full layout as designed |
| Wide | > 1440px | Max-width container, center content |

- Touch targets: minimum 44×44px on mobile
- Maintain 6px base unit across breakpoints — only scale multipliers

## 9. Agent Prompt Guide

### Quick Color Reference

```
Background:  #ffffeb
Text:        #1a1a1a
Accent:      #ffa946
Secondary:   #ff6c4c
Border:      #e4e4d0
```

### Example Prompts

1. "Build a hero section with a `#ffffeb` background, `Eb garamond` heading in `#1a1a1a`, and a `#ffa946` CTA button with 8px radius."
2. "Create a pricing card using background `#e4e4d0`, border `#e4e4d0`, `Figtree` for text, and 18px padding."
3. "Design a navigation bar — `#ffffeb` background, `#1a1a1a` links, `#ffa946` for active state."
4. "Build a feature grid with 3 columns, 18px gap, each card using the card component style."
5. "Create a footer with `#1a1a1a` background, `#ffffeb` text, and 12px padding."

### Iteration Guide

1. Start with layout structure (sections, grid, spacing)
2. Apply colors from the palette — background first, then text, then accents
3. Set typography — font families, sizes from the type scale, weights
4. Add components — buttons, cards, inputs using the specs above
5. Apply border-radius consistently across all elements
6. Add shadows for depth — use the extracted shadow values, not defaults
7. Check responsive behavior — test mobile and tablet layouts
8. Final pass — verify all colors match, spacing is consistent, fonts are correct

## 10. CSS Custom Properties

> 94 custom properties extracted from `:root` / `html` stylesheets.

### Color Variables

| Variable | Value |
|---|---|
| `--border-color--border-primary` | `#1a1a1a4d` |
| `--base-color--pulse` | `#7f1c34` |
| `--alpha--light--50` | `#ffffeb80` |
| `--base-color-neutral--neutral-darkest` | `#111` |
| `--base-color--lumen` | `#ffffeb` |
| `--base-color--fathom` | `#034f46` |
| `--base-color--lumen-dark` | `#e4e4d0` |
| `--base-color--glow` | `#ffa946` |
| `--base-color--dawn` | `#f0d7ff` |
| `--alpha--dark--70` | `#1a1a1ab3` |
| `--base-color--vast` | `#1a1a1a` |
| `--base-color--white` | `#fff` |
| `--alpha--dark--50` | `#1a1a1a80` |
| `--base-color-system--success-green` | `#cef5ca` |
| `--alpha--light--15` | `#ffffeb26` |
| `--alpha--light--70` | `#ffffebb3` |
| `--alpha--light--30` | `#ffffeb4d` |
| `--alpha--dark--30` | `#1a1a1a4d` |
| `--base-color--flare` | `#ff6c4c` |
| `--alpha--light--10` | `#ffffeb1a` |
| `--base-color--signal` | `#ffbcf2` |
| `--alpha--dark--15` | `#1a1a1a26` |
| `--base-color-neutral--neutral-lighter` | `#ccc` |
| `--alpha--dark--10` | `#1a1a1a1a` |
| `--alpha--dark--5-2` | `#1a1a1a0d` |
| `--base-color-neutral--black` | `#000` |
| `--base-color-neutral--white` | `#fff` |
| `--base-color-neutral--neutral-lightest` | `#eee` |
| `--base-color-neutral--neutral-light` | `#aaa` |
| `--base-color-neutral--neutral` | `#666` |
| ... | *(14 more)* |

### Spacing Variables

| Variable | Value |
|---|---|
| `--_spacing---section-radius--small` | `2.5rem` |
| `--_spacing---section-paddings--large` | `8rem` |
| `--_spacing---section-paddings--medium` | `6rem` |
| `--_spacing---spacers--medium` | `1.5rem` |
| `--_spacing---spacers--large` | `3rem` |
| `--_spacing---section-radius--large` | `5rem` |
| `--_spacing---section-paddings--x-large` | `10rem` |
| `--_spacing---spacers--xx-huge` | `10rem` |
| `--_spacing---section-radius--tiny` | `2rem` |
| `--_spacing---section-radius--medium` | `4rem` |
| `--_spacing---section-radius--x-tiny` | `1rem` |
| `--_spacing---section-radius--regular` | `3rem` |
| `--_spacing---padding--xx-huge` | `14rem` |

### Typography Variables

| Variable | Value |
|---|---|
| `--_text-collection---font--body-font` | `Figtree,Arial,sans-serif` |
| `--text-color--text-primary` | `var(--base-color--vast)` |
| `--_text-collection---font--primary-font` | `"Eb garamond",Arial,sans-serif` |
| `--_text-collection---heading--h1` | `7.5rem` |
| `--_text-collection---heading--h2` | `4rem` |
| `--_text-collection---heading--h3` | `3rem` |
| `--_text-collection---heading--h4` | `2rem` |
| `--_text-collection---heading--h5` | `1.25rem` |
| `--_text-collection---heading--h6` | `1rem` |
| `--_text-collection---body--medium` | `1.125rem` |
| `--text-color--text-alternate` | `var(--base-color-neutral--white)` |
| `--text-color--text-secondary` | `var(--base-color--lumen)` |
| `--text-color--text-success` | `var(--base-color-system--success-green-dark)` |
| `--_text-collection---heading--h1-small` | `6rem` |
| `--_text-collection---body--regular` | `1rem` |
| `--_text-collection---body--small` | `.875rem` |
| `--_text-collection---body--large` | `1.25rem` |
| `--text-color--text-error` | `var(--base-color-system--error-red-dark)` |
| `--text-color--text-warning` | `var(--base-color-system--warning-yellow-dark)` |
| `--text-color--text-tertiary` | `var(--base-color--dawn)` |
| ... | *(4 more)* |

### Other Variables

| Variable | Value |
|---|---|
| `--background-color--background-primary` | `var(--base-color--lumen)` |
| `--background-color--background-success` | `var(--base-color-system--success-green)` |
| `--background-color--background-alternate` | `var(--base-color--white)` |
| `--background-color--background-secondary` | `var(--base-color--dawn)` |
| `--border-color--border-secondary` | `var(--base-color--vast)` |
| `--base-color-system--error-red-dark` | `var(--base-color--pulse)` |
| `--link-color--link-primary` | `var(--base-color--dawn)` |
| `--background-color--background-tertiary` | `var(--base-color--vast)` |
| `--background-color--background-error` | `var(--base-color-system--error-red)` |
| `--background-color--background-warning` | `var(--base-color-system--warning-yellow)` |
| `--border-color--border-alternate` | `var(--base-color-neutral--neutral-darker)` |
| `--link-color--link-secondary` | `var(--base-color--vast)` |
| `--link-color--link-alternate` | `var(--base-color-neutral--white)` |

</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-08T15:22:44+05:30.

The user's current state is as follows:
Active Document: /Users/maazahmad/Desktop/Peoducts/mumble-flow/.env (LANGUAGE_UNSPECIFIED)
Cursor is on line: 7
Other open documents:
- /Users/maazahmad/Desktop/Peoducts/mumble-flow/client/js/app.js (LANGUAGE_JAVASCRIPT)
- /Users/maazahmad/Desktop/Peoducts/mumble-flow/desktop/electron/main.js (LANGUAGE_JAVASCRIPT)
- /Users/maazahmad/Desktop/Peoducts/mumble-flow/desktop/electron/modules/serverManager.js (LANGUAGE_JAVASCRIPT)
- /Users/maazahmad/Desktop/Peoducts/mumble-flow/server/utils/audioUtils.js (LANGUAGE_JAVASCRIPT)
- /Users/maazahmad/Desktop/Peoducts/mumble-flow/server/db/repositories/settingsRepository.js (LANGUAGE_JAVASCRIPT)
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from Gemini 3.8 Flash (Medium) to Claude Opus 4.6 (Thinking). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>
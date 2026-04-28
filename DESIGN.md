---
name: Professional Financial Interface
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#191c1e'
  on-tertiary-container: '#818486'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display-lg:
    fontFamily: manrope
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-caps:
    fontFamily: inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  sidebar-width: 260px
  container-max: 1440px
---

## Brand & Style

This design system is anchored in the concept of **Sophisticated Utility**. It targets financial professionals and business owners who require high-density information environments that remain legible and stress-free. The brand personality is authoritative yet modern, favoring precision over decoration.

The design style follows a **Corporate / Modern** aesthetic. It utilizes generous whitespace to reduce cognitive load during complex financial tasks, while maintaining a strict structural grid that communicates stability and reliability. The interface avoids unnecessary flourishes, focusing instead on clear visual hierarchies and purposeful motion that guides the user through transactional workflows.

## Colors

The palette is built on a foundation of **Deep Blues and Slate Greys** to establish a sense of institutional trust. 

- **Primary:** A deep navy used for navigation backgrounds, primary headings, and high-level structural elements.
- **Secondary:** A neutral slate used for secondary text and icons, providing a softer contrast than pure black.
- **Tertiary:** A series of cool-toned off-whites and greys used for page backgrounds and section nesting to create depth without relying on heavy borders.
- **Accent:** A vibrant 'Electric Blue' reserved exclusively for high-priority actions, such as "Generate Payment Link" or "Authorize Transaction."
- **Semantic Colors:** Green and Red are utilized strictly for financial indicators (profit/loss) and system feedback (success/error).

## Typography

The typography strategy employs two distinct typefaces to balance character with functionality. 

**Manrope** is used for headlines and primary UI labels. Its modern, geometric construction provides a refined look that differentiates the tool from generic spreadsheets. 

**Inter** is the workhorse for all body copy, data tables, and numerical inputs. It was selected for its exceptional legibility at small sizes and its neutral, systematic appearance. For financial figures, use `data-mono` (Inter with tabular lining figures enabled) to ensure that columns of numbers align perfectly for easy comparison.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for the main content area, paired with a fixed-width left navigation sidebar. 

The spacing rhythm is based on an **8px linear scale**, ensuring consistent alignment across all components. High-density data views should utilize `sm` (8px) and `md` (16px) spacing to maximize information display, while dashboard overviews and marketing-adjacent screens should lean into `lg` (24px) and `xl` (40px) margins to maintain a premium, "spacious" feel. 

Margins for the main application window should be set to 32px to provide a comfortable frame for the content.

## Elevation & Depth

This design system uses **Tonal Layers** as the primary method for conveying hierarchy, supplemented by subtle ambient shadows for interactive elements.

- **Background (Level 0):** The base application surface, using the lightest tertiary grey.
- **Card/Surface (Level 1):** White surfaces with a very soft, 1px border (#E2E8F0). This is where 90% of content resides.
- **Raised/Interactive (Level 2):** Elements like dropdowns or hovered cards use a soft, diffused shadow (0px 4px 12px rgba(15, 23, 42, 0.08)).
- **Overlay (Level 3):** Modals and dialogs use a more pronounced shadow and a 40% opacity backdrop blur to focus the user's attention.

Avoid heavy drop shadows; depth should feel like physical paper layers rather than floating objects.

## Shapes

The shape language is **Soft and Disciplined**. A standard corner radius of 6px (`rounded-md`) is applied to most UI components, including input fields, buttons, and small cards. 

Large containers and modals use an 8px radius (`rounded-lg`). This subtle rounding maintains a professional, "engineered" look while appearing more modern and accessible than sharp 90-degree corners. Use 0px radius only for components that must bleed to the edge of the viewport, such as sidebars or bottom-docked status bars.

## Components

### Buttons
- **Primary:** Deep Navy (#0F172A) background with white text. High-contrast and authoritative.
- **Secondary:** Transparent background with a Slate Grey (#64748B) border. Used for tertiary actions.
- **Accent:** Electric Blue (#2563EB) background. Used specifically for revenue-generating or "link" actions.

### Data Tables
Tables are the core of this financial tool. Rows should have a height of 48px to remain spacious. Use subtle horizontal dividers (#F1F5F9) and no vertical dividers. Column headers must use `label-caps` for clear distinction from row data.

### Input Fields
Inputs feature a 1px border (#CBD5E1) and a 4px padding-left. On focus, the border transitions to the Accent Blue with a subtle 2px outer glow.

### Navigation Components
- **Sidebar:** Dark primary background with high-contrast active states. Navigation items should include a 20px icon and `body-md` text.
- **Status Chips:** Small, pill-shaped indicators for "Paid," "Pending," or "Overdue." Use low-saturation background tints with high-saturation text for legibility (e.g., light green background with dark green text).

### Financial Cards
Summary cards (e.g., Total Revenue) should feature a `headline-sm` title and a `display-lg` figure. Use a 2px vertical accent bar on the left edge of the card to denote the category or status.
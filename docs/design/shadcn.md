# Shadcn theme

Use this section to theme Shadcn components with Clan tokens. Every Shadcn variable is an alias of a token, so a change to a token reaches both.

**Page and panels**

| Shadcn variable | Clan token | Note |
| --- | --- | --- |
| `--background` | `ground` | Page behind panels |
| `--foreground` | `ink` |  |
| `--card` | `surface` | Panels |
| `--card-foreground` | `ink` |  |
| `--popover` | `surface-raised` | Menus and overlays |
| `--popover-foreground` | `ink` |  |

**Actions**

| Shadcn variable | Clan token | Note |
| --- | --- | --- |
| `--primary` | `ink` | Never a hue: brand colours report facts |
| `--primary-foreground` | `on-ink` |  |
| `--secondary` | `surface-sunken` |  |
| `--secondary-foreground` | `ink` |  |
| `--accent` | `surface-sunken` | Shadcn uses this for hover, so it stays neutral |
| `--accent-foreground` | `ink` |  |
| `--destructive` | `halt` | Failure, refusal and irreversible deletion only |
| `--destructive-foreground` | `on-halt` |  |

**Quiet text and edges**

| Shadcn variable | Clan token | Note |
| --- | --- | --- |
| `--muted` | `surface-sunken` | The most used variable in Forge |
| `--muted-foreground` | `ink-muted` |  |
| `--border` | `line` | Decorative only |
| `--input` | `line-strong` | Control edges, 3:1 or better |
| `--ring` | `focus` |  |

**Sidebar**

| Shadcn variable | Clan token | Note |
| --- | --- | --- |
| `--sidebar` | `surface` | The trade sidebar. The rail stays iron |
| `--sidebar-foreground` | `ink` |  |
| `--sidebar-primary` | `ink` |  |
| `--sidebar-primary-foreground` | `on-ink` |  |
| `--sidebar-accent` | `surface-sunken` |  |
| `--sidebar-accent-foreground` | `ink` |  |
| `--sidebar-border` | `line` |  |
| `--sidebar-ring` | `focus` |  |

**Charts (provisional)**

| Shadcn variable | Clan token | Note |
| --- | --- | --- |
| `--chart-1` | `ink` |  |
| `--chart-2` | `up` |  |
| `--chart-3` | `down` |  |
| `--chart-4` | `ink-muted` |  |
| `--chart-5` | `line-strong` |  |

**Corners**

| Tailwind class | Value | Main users |
| --- | --- | --- |
| `rounded-sm` | 2px | Dropdown items, select items |
| `rounded-md` | 4px | Buttons, inputs, popovers |
| `rounded-lg` | 4px | Alerts, tab lists |
| `rounded-xl` | 4px | Cards |
| `rounded-2xl` | 8px | Dialogs, once overridden |
| `rounded-3xl` | 8px | Unused by the main components |
| `rounded-4xl` | 2px | Badges |

## Where the two systems disagree

Follow these rules wherever a Shadcn default conflicts with the brand.

- **Dark mode.** Shadcn switches on `.dark` and this system on `data-theme`. The theme below answers to both.
- **Proof and authority.** Shadcn has no variables for them. Use the added utilities, such as `bg-gate text-on-gate`, `text-proof` and `bg-halt-wash`.
- **Round shapes.** Only people are round. Replace `rounded-full` with `rounded-sm` in `Switch`, `Progress`, `Slider` and `RadioGroup`, and keep it on `Avatar`.
- **Cards and dialogs.** Shadcn gives both `rounded-xl`. Keep that for cards at 4px, and add `rounded-2xl` to `DialogContent` for its 8px.
- **Focus.** Shadcn draws a 3px ring at half strength with no offset. It clears 3:1, but this system's ring is solid. Replace `focus-visible:ring-ring/50` with a solid 2px `focus` ring offset by 2px in `Button`, `Input` and other controls.
- **Destructive buttons.** Shadcn's tinted style falls below 4.5:1 in the light theme, at 4.44:1 at rest and 3.81:1 on hover. Change the variant to `bg-destructive text-destructive-foreground`, the solid `halt` that `Button` uses here, and reserve it for irreversible deletion.
- **Shadows.** Small shadows are removed. `shadow-md` and larger all become `shadow-raised`, for overlays.
- **Type.** Set headings and body in `font-sans`. Keep `font-display` for signs, because Shadcn's headings are too frequent for it.
- **Hard-coded colours.** Palette classes bypass the theme. Replace them in diff views with `added` and `removed`, and in status and kind badges with the state tokens.
- **Code.** Replace the highlighter's colour theme with one using `ink`, `ink-muted` and weight.

## The theme

Replace the `:root` and `.dark` blocks of the global stylesheet with this:

```css
:root {
  --ground: #eceeea;
  --surface: #f8f9f6;
  --surface-raised: #ffffff;
  --surface-sunken: #e1e4de;
  --line: #cdd2ca;
  --line-strong: #78827a;
  --ink: #141a17;
  --ink-muted: #4b5550;
  --on-ink: #f8f9f6;
  --focus: #141a17;
  --proof: #0b6673;
  --on-proof: #ffffff;
  --proof-wash: #d6ebee;
  --gate: #e5ad1c;
  --on-gate: #241a00;
  --gate-ink: #755200;
  --gate-wash: #f8ecc9;
  --halt: #b5360e;
  --on-halt: #ffffff;
  --halt-wash: #f9e0d6;
  --up: #1d58b3;
  --down: #9a4a06;
  --added: #1d58b3;
  --added-wash: #dde8f8;
  --removed: #9a4a06;
  --removed-wash: #f7e5d2;
  --iron: #1b2420;
  --iron-raised: #2f3b35;
  --on-iron: #eaeee9;
  --on-iron-muted: #a6b0a9;
  --shadow-raised: 0 8px 24px rgba(20, 26, 23, 0.18);
}

.dark,
[data-theme="dark"] {
  --ground: #0f1311;
  --surface: #161b18;
  --surface-raised: #1e2521;
  --surface-sunken: #0a0d0c;
  --line: #2c3530;
  --line-strong: #6b7870;
  --ink: #eaeee9;
  --ink-muted: #a6b0a9;
  --on-ink: #0f1311;
  --focus: #eaeee9;
  --proof: #56cfd6;
  --on-proof: #06262b;
  --proof-wash: #10323a;
  --gate: #f0bf3f;
  --on-gate: #241a00;
  --gate-ink: #f0bf3f;
  --gate-wash: #33290f;
  --halt: #ff8f5e;
  --on-halt: #2b0e02;
  --halt-wash: #3a1c10;
  --up: #86b4ff;
  --down: #f2a96f;
  --added: #86b4ff;
  --added-wash: #16294a;
  --removed: #f2a96f;
  --removed-wash: #3a2511;
  --iron: #0a0d0c;
  --iron-raised: #222b26;
  --on-iron: #eaeee9;
  --on-iron-muted: #a6b0a9;
  --shadow-raised: 0 8px 24px rgba(0, 0, 0, 0.55);
}

:root,
.dark,
[data-theme="dark"] {
  --background: var(--ground);
  --foreground: var(--ink);
  --card: var(--surface);
  --card-foreground: var(--ink);
  --popover: var(--surface-raised);
  --popover-foreground: var(--ink);
  --primary: var(--ink);
  --primary-foreground: var(--on-ink);
  --secondary: var(--surface-sunken);
  --secondary-foreground: var(--ink);
  --accent: var(--surface-sunken);
  --accent-foreground: var(--ink);
  --destructive: var(--halt);
  --destructive-foreground: var(--on-halt);
  --muted: var(--surface-sunken);
  --muted-foreground: var(--ink-muted);
  --border: var(--line);
  --input: var(--line-strong);
  --ring: var(--focus);
  --sidebar: var(--surface);
  --sidebar-foreground: var(--ink);
  --sidebar-primary: var(--ink);
  --sidebar-primary-foreground: var(--on-ink);
  --sidebar-accent: var(--surface-sunken);
  --sidebar-accent-foreground: var(--ink);
  --sidebar-border: var(--line);
  --sidebar-ring: var(--focus);
  --chart-1: var(--ink);
  --chart-2: var(--up);
  --chart-3: var(--down);
  --chart-4: var(--ink-muted);
  --chart-5: var(--line-strong);
  --radius: 4px;
  --shadow-2xs: 0 0 #0000;
  --shadow-xs: 0 0 #0000;
  --shadow-sm: 0 0 #0000;
  --shadow: 0 0 #0000;
  --shadow-md: var(--shadow-raised);
  --shadow-lg: var(--shadow-raised);
  --shadow-xl: var(--shadow-raised);
  --shadow-2xl: var(--shadow-raised);
}
```

Add this to `@theme inline`, replacing the existing `--radius-*` lines:

```css
@theme inline {
  --color-proof: var(--proof);
  --color-on-proof: var(--on-proof);
  --color-proof-wash: var(--proof-wash);
  --color-gate: var(--gate);
  --color-on-gate: var(--on-gate);
  --color-gate-ink: var(--gate-ink);
  --color-gate-wash: var(--gate-wash);
  --color-halt-wash: var(--halt-wash);
  --color-added: var(--added);
  --color-added-wash: var(--added-wash);
  --color-removed: var(--removed);
  --color-removed-wash: var(--removed-wash);
  --color-up: var(--up);
  --color-down: var(--down);
  --color-iron: var(--iron);
  --color-iron-raised: var(--iron-raised);
  --color-on-iron: var(--on-iron);
  --color-on-iron-muted: var(--on-iron-muted);
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 4px;
  --radius-xl: 4px;
  --radius-2xl: 8px;
  --radius-3xl: 8px;
  --radius-4xl: 2px;
  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  --font-display: "Big Shoulders Display", "Arial Narrow", sans-serif;
}
```

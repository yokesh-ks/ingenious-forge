# TradeRail

The app's fixed left rail: one icon per trade with a count of what is held for you, then global destinations at the foot. For now it shows only Work and Settings.

**Consumer provides:** a sized parent, `value` or `defaultValue`, `onChange`, and optionally `trades` (`{id, icon?, code?, name, held?}`) and `tools` (`{id, icon?, code?, name}`). Defaults to Work, with Settings as the only tool. Add later items through `trades` and `tools`. Selection is shared across both groups.

- Give a new trade one Lucide icon and no colour of its own. `icon` takes a built-in glyph name. Without one, the rail falls back to the two-letter `code`.
- Always keep the name under the icon.
- `held` is the only badge the rail carries.
- The rail carries no user avatar.

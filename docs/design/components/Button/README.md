# Button

Runs a single action, labelled with its verb.

**Consumer provides:** `children`, `onClick`, and any native button props. `variant` is `primary`, `secondary`, `ghost` or `danger`. `size` is `sm`, `md` or `lg`. `icon` takes a built-in glyph name such as `lock`.

- Keep one `primary` per panel. It is `ink`, because the brand colours report facts.
- Label with what happens: "Approve with passkey", not "OK".
- Use `lg` for anything that commits money.
- `danger` is for irreversible deletion only. To stop trading, use `KillSwitch`.

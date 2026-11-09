# TradeSidebar

The secondary sidebar beside the rail: the trade's title, its primary action, its navigation and the daemon status.

**Consumer provides:** a sized parent, `title`, and `children` for the navigation, such as `ProjectTree`. Optional: `newLabel` and `onNew`, `onCollapse`, `daemon` (`DaemonStatus` props) and `onToggleTheme`.

- Use the rail label as the title, so the two always agree.
- Keep one primary action, named for what it creates.
- Keep `DaemonStatus` in the foot. Screens have no header, so this is where it stays visible.

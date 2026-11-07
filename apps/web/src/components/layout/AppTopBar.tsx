import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/lib/router";

/** The slim bar above the rail and content: the Forge name and global controls. */
export default function AppTopBar() {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between px-4">
      <Link to="/" className="text-sm font-bold tracking-tight">
        Ingenious <span className="text-primary">Forge</span>
      </Link>
      <ThemeToggle />
    </header>
  );
}

import { Badge } from "@/components/ui/badge";
import Composer from "./components/Composer";
import SessionView from "./components/SessionView";
import { ThemeToggle } from "./components/theme-toggle";

export default function App() {
  return (
    <div className="flex h-screen flex-col">
      <header className="relative flex flex-col items-center gap-3 px-4 pt-8 pb-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Badge>local server running</Badge>
        <h1 className="text-[1.75rem] font-bold tracking-tight">
          Ingenious <span className="text-primary">Forge</span>
        </h1>
      </header>
      <main className="flex min-h-0 flex-1 px-4">
        <SessionView />
      </main>
      <footer className="px-4 pb-6">
        <Composer />
      </footer>
    </div>
  );
}

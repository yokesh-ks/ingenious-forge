import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/session/use-session";
import ChangedFilesPanel from "./components/ChangedFilesPanel";
import Composer from "./components/Composer";
import SessionView from "./components/SessionView";
import { ThemeToggle } from "./components/theme-toggle";

export default function App() {
  // Sessions get server-side ids once the session list lands (PRD §6.2
  // Projects and session list); until then each page load is one session.
  const [sessionId] = useState(() => crypto.randomUUID());
  const { state, connected, send, stop } = useSession(sessionId);

  return (
    <div className="flex h-screen flex-col">
      <header className="relative flex flex-col items-center gap-3 px-4 pt-8 pb-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Badge variant={connected ? "default" : "outline"}>
          {connected ? "local server running" : "connecting…"}
        </Badge>
        <h1 className="text-[1.75rem] font-bold tracking-tight">
          Ingenious <span className="text-primary">Forge</span>
        </h1>
      </header>
      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <main className="flex min-h-0 flex-1">
            <SessionView messages={state.messages} running={state.running} error={state.error} />
          </main>
          <footer>
            <Composer onSend={send} busy={state.running} onStop={stop} />
          </footer>
        </div>
        <aside className="hidden w-96 shrink-0 overflow-y-auto border-l pl-4 lg:flex lg:flex-col">
          <ChangedFilesPanel files={state.changedFiles} />
        </aside>
      </div>
    </div>
  );
}

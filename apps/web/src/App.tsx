import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/session/use-session";
import Composer from "./components/Composer";
import SessionView from "./components/SessionView";
import { ThemeToggle } from "./components/theme-toggle";

export default function App() {
  // Sessions get server-side ids once the session list lands (PRD §6.2
  // Projects and session list); until then each page load is one session.
  const [sessionId] = useState(() => crypto.randomUUID());
  const { state, connected, send } = useSession(sessionId);

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
      <main className="flex min-h-0 flex-1 px-4">
        <SessionView messages={state.messages} running={state.running} error={state.error} />
      </main>
      <footer className="px-4 pb-6">
        <Composer onSend={send} busy={state.running} />
      </footer>
    </div>
  );
}

import { type FormEvent, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { GitHubConnection } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The GitHub account git push uses for github.com remotes. */
export default function GitHubSection() {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.github().then(
      (found) => !cancelled && setConnection(found),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<GitHubConnection>) {
    setBusy(true);
    setError(null);
    try {
      setConnection(await action());
      setToken("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function connect(event: FormEvent) {
    event.preventDefault();
    run(() => api.connectGitHub(token));
  }

  return (
    <section aria-label="GitHub connection" className="flex flex-col gap-3 rounded-lg border p-3">
      {connection?.connected ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">
            Connected as @{connection.login ?? "your account"}. Pushes to github.com use it.
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={busy}
            onClick={() => run(() => api.disconnectGitHub())}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        connection && (
          <form className="flex flex-col gap-2" onSubmit={connect}>
            <p className="text-sm text-muted-foreground">
              Paste a personal access token with the <code>repo</code> scope (create one in your
              GitHub settings under Developer settings). It is checked with GitHub and stored
              encrypted.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                aria-label="GitHub token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={busy || token.trim() === ""}>
                Connect GitHub
              </Button>
            </div>
          </form>
        )
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

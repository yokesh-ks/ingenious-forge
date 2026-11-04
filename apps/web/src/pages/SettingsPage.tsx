import { type FormEvent, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { ProviderKeyStatus } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Settings (PRD §6.2 Settings). */
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <h2 className="text-xl font-semibold">Settings</h2>
      <ProviderKeys />
    </main>
  );
}

function ProviderKeys() {
  const [providers, setProviders] = useState<ProviderKeyStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.providerKeys().then(
      (list) => !cancelled && setProviders(list),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="providers-heading" className="flex flex-col gap-3">
      <h3 id="providers-heading" className="text-base font-semibold">
        Model providers
      </h3>
      <p className="text-sm text-muted-foreground">
        API keys are encrypted on this computer and are never sent back to the browser.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!providers && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {providers?.map((provider) => (
        <ProviderKeyRow key={provider.provider} initial={provider} />
      ))}
    </section>
  );
}

function describeKey(status: ProviderKeyStatus): string {
  switch (status.source) {
    case "settings":
      return `Key saved (${status.hint ?? "…"})`;
    case "environment":
      return `Using a key from the environment (${status.hint ?? "…"})`;
    default:
      return "No API key yet";
  }
}

function ProviderKeyRow({ initial }: { initial: ProviderKeyStatus }) {
  const [status, setStatus] = useState(initial);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ProviderKeyStatus>) {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
      setKey("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    run(() => api.setProviderKey(status.provider, key));
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would imply one form
    <div
      role="group"
      aria-label={status.name}
      className="flex flex-col gap-2 rounded-lg border p-3"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{status.name}</span>
        <span className="text-sm text-muted-foreground">{describeKey(status)}</span>
        {status.source === "settings" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={busy}
            onClick={() => run(() => api.removeProviderKey(status.provider))}
          >
            Remove key
          </Button>
        )}
      </div>
      <form className="flex gap-2" onSubmit={save}>
        <Input
          type="password"
          autoComplete="off"
          aria-label={`${status.name} API key`}
          placeholder={status.source ? "Enter a new key to replace it" : "Paste your API key"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy || key.trim() === ""}>
          Save
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

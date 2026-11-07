import { type FormEvent, useEffect, useState } from "react";
import { api } from "@/api/client";
import type {
  ApprovalMode,
  GitHubConnection,
  ModelCatalog,
  ProviderKeyStatus,
  ProviderKeyTest,
  SessionDefaults,
  SessionModel,
} from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ModelFields, { selectClass } from "@/features/sandbox/components/ModelFields";
import { useModelCatalog } from "@/features/sandbox/hooks/use-model-catalog";
import { APPROVAL_MODES } from "@/lib/approval-modes";

/** Settings (PRD §6.2 Settings). */
export default function SettingsPage() {
  const models = useModelCatalog();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <h2 className="text-xl font-semibold">Settings</h2>
      <ProviderKeys onChanged={models.reload} />
      <SessionDefaultsForm catalog={models.catalog} catalogError={models.error} />
      <GitHubSection />
    </main>
  );
}

function ProviderKeys({ onChanged }: { onChanged: () => void }) {
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
        <ProviderKeyRow key={provider.provider} initial={provider} onChanged={onChanged} />
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

function ProviderKeyRow({
  initial,
  onChanged,
}: {
  initial: ProviderKeyStatus;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState(initial);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<ProviderKeyTest | null>(null);
  const [testing, setTesting] = useState(false);

  async function testKey() {
    setTesting(true);
    setError(null);
    setTested(null);
    try {
      setTested(await api.testProviderKey(status.provider));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function run(action: () => Promise<ProviderKeyStatus>) {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      setStatus(await action());
      setKey("");
      onChanged();
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
        <div className="ml-auto flex items-center gap-1">
          {status.source && (
            <Button size="sm" variant="ghost" disabled={busy || testing} onClick={() => testKey()}>
              {testing ? "Testing…" : "Test key"}
            </Button>
          )}
          {status.source === "settings" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => api.removeProviderKey(status.provider))}
            >
              Remove key
            </Button>
          )}
        </div>
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
      {tested?.ok && (
        <p role="status" className="text-sm text-muted-foreground">
          {status.name} accepted this key.
        </p>
      )}
      {tested && !tested.ok && (
        <p role="alert" className="text-sm text-destructive">
          {tested.message ?? `${status.name} did not accept this key.`}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The model, effort and approval mode new sessions start with. */
function SessionDefaultsForm({
  catalog,
  catalogError,
}: {
  catalog: ModelCatalog | null;
  catalogError: string | null;
}) {
  const [defaults, setDefaults] = useState<SessionDefaults | null>(null);
  const [model, setModel] = useState<SessionModel | null>(null);
  const [mode, setMode] = useState<ApprovalMode>("ask");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.sessionDefaults().then(
      (found) => {
        if (cancelled) return;
        setDefaults(found);
        setMode(found.approval_mode);
      },
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The saved model, or the catalog's default when none is saved or its
  // provider no longer has a key. Keys can change while this page is open.
  useEffect(() => {
    if (!defaults || !catalog) return;
    const listed = (m: SessionModel | null) =>
      m !== null && catalog.providers.some((p) => p.id === m.provider);
    if (!listed(model)) setModel(listed(defaults.model) ? defaults.model : catalog.default);
  }, [defaults, catalog, model]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.setSessionDefaults({ model, approval_mode: mode });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const loadError = catalogError;
  return (
    <form
      aria-label="New session defaults"
      className="flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={save}
    >
      <h3 className="text-base font-semibold">New session defaults</h3>
      <p className="text-sm text-muted-foreground">
        New sessions start with these; sessions already open keep their own.
      </p>
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {catalog && model && <ModelFields catalog={catalog} value={model} onChange={setModel} />}
      <label className="flex flex-col gap-1 text-sm">
        Approval mode
        <select
          className={selectClass}
          value={mode}
          onChange={(e) => setMode(e.target.value as ApprovalMode)}
        >
          {APPROVAL_MODES.map((option) => (
            <option key={option.mode} value={option.mode}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !defaults}>
          Save defaults
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved</span>}
      </div>
    </form>
  );
}

/** The GitHub account git push uses for github.com remotes. */
function GitHubSection() {
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
    <section aria-labelledby="github-heading" className="flex flex-col gap-3 rounded-lg border p-3">
      <h3 id="github-heading" className="text-base font-semibold">
        GitHub
      </h3>
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

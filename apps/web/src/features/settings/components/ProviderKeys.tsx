import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { ProviderKeyStatus, ProviderKeyTest } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CustomProviderPanel from "./CustomProviderPanel";
import ProviderKeyPanel from "./ProviderKeyPanel";
import ProviderLogo from "./ProviderLogo";

/** Model providers, connected ones first (PRD §6.2 Settings). */
export default function ProviderKeys() {
  const [providers, setProviders] = useState<ProviderKeyStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What is being configured: beside the list on a wide screen, in place of it
   * on a narrow one. */
  const [panel, setPanel] = useState<ProviderKeyStatus | "custom" | null>(null);
  /** How many saves there have been; each starts the rows afresh, so an old
   * test message cannot linger. */
  const [saves, setSaves] = useState(0);
  const editing = panel !== null && panel !== "custom" ? panel.provider : null;

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

  function update(status: ProviderKeyStatus) {
    setProviders((list) => list?.map((p) => (p.provider === status.provider ? status : p)) ?? null);
  }

  function remove(id: string) {
    setProviders((list) => list?.filter((p) => p.provider !== id) ?? null);
    if (editing === id) setPanel(null);
  }

  const row = (provider: ProviderKeyStatus) => (
    <ProviderRow
      key={`${provider.provider}:${provider.source}:${provider.hint}:${saves}`}
      status={provider}
      selected={editing === provider.provider}
      onEnterKey={() => setPanel(provider)}
      onChanged={(status) => {
        update(status);
        if (editing === status.provider) setPanel(null);
      }}
      onTested={(ok) => update({ ...provider, key_valid: ok })}
      onRemoved={remove}
    />
  );
  const connected = providers?.filter((p) => p.source) ?? [];
  const available = providers?.filter((p) => !p.source) ?? [];

  return (
    <section
      aria-label="Model providers"
      className="@container/providers flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col @2xl/providers:flex-row">
        <div
          className={`min-h-0 min-w-0 flex-1 flex-col gap-6 @2xl/providers:flex @2xl/providers:overflow-y-auto ${
            panel ? "hidden" : "flex"
          }`}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!providers && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
          {providers && (
            <>
              <ProviderGroup title="Connected providers">
                {connected.length > 0 ? (
                  connected.map(row)
                ) : (
                  <li className="py-3 text-sm text-muted-foreground">No connected providers</li>
                )}
              </ProviderGroup>
              <ProviderGroup title="Popular providers">
                {available.map(row)}
                <li
                  aria-label="Custom provider"
                  aria-current={panel === "custom" ? "true" : undefined}
                  className={`-mx-2 rounded px-2 py-3 ${panel === "custom" ? "bg-muted" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <ProviderLogo provider="custom" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Custom provider</span>
                        <Badge variant="secondary">Custom</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Add a custom provider by base URL.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Connect a custom provider"
                      onClick={() => setPanel("custom")}
                    >
                      <PlusIcon /> Connect
                    </Button>
                  </div>
                </li>
              </ProviderGroup>
            </>
          )}
        </div>
        {panel && (
          <div className="min-h-0 min-w-0 @2xl/providers:ml-6 @2xl/providers:flex-[1.4] @2xl/providers:overflow-y-auto @2xl/providers:border-l @2xl/providers:pl-6">
            {panel === "custom" ? (
              <CustomProviderPanel
                onClose={() => setPanel(null)}
                onAdded={(status) => {
                  setProviders((list) => [...(list ?? []), status]);
                  setPanel(null);
                }}
              />
            ) : (
              // Opening another provider starts its form afresh.
              <ProviderKeyPanel
                key={panel.provider}
                provider={panel}
                onClose={() => setPanel(null)}
                onSaved={(status) => {
                  update(status);
                  setSaves((count) => count + 1);
                  setPanel(null);
                }}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ProviderGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul aria-label={title} className="flex flex-col divide-y border-b">
        {children}
      </ul>
    </div>
  );
}

/** Green once a key is saved or passes a test, red when a test fails, and grey
 * for a key from the environment that has not been tested. */
function KeyDot({ valid }: { valid: boolean | null }) {
  const [label, color] =
    valid === null
      ? ["API key not tested", "bg-muted-foreground/50"]
      : valid
        ? ["API key valid", "bg-green-500"]
        : ["API key not valid", "bg-destructive"];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`size-2.5 shrink-0 rounded-full ${color}`}
    />
  );
}

function ProviderRow({
  status,
  selected,
  onEnterKey,
  onChanged,
  onTested,
  onRemoved,
}: {
  status: ProviderKeyStatus;
  /** True while this provider is being configured. */
  selected: boolean;
  onEnterKey: () => void;
  onChanged: (status: ProviderKeyStatus) => void;
  onTested: (ok: boolean) => void;
  onRemoved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<ProviderKeyTest | null>(null);

  async function testKey() {
    setBusy(true);
    setError(null);
    setTested(null);
    try {
      const result = await api.testProviderKey(status.provider);
      setTested(result);
      onTested(result.ok);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      if (status.custom) {
        await api.removeCustomProvider(status.provider);
        onRemoved(status.provider);
      } else {
        onChanged(await api.removeProviderKey(status.provider));
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const hint = status.hint ?? "…";

  return (
    <li
      aria-label={status.name}
      aria-current={selected ? "true" : undefined}
      className={`-mx-2 flex flex-col gap-1 rounded px-2 py-3 ${selected ? "bg-muted" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ProviderLogo provider={status.provider} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{status.name}</span>
            {status.source && <KeyDot valid={status.key_valid} />}
            {status.custom && <Badge variant="secondary">Custom</Badge>}
            {status.source === "environment" && <Badge variant="secondary">Environment</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {status.source === "environment" && `Using ${status.env_var} (${hint})`}
            {!status.source && status.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {status.source ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={testKey}>
                {busy ? "Working…" : "Test key"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onEnterKey}>
                Edit
              </Button>
              {/* A key from the environment can only be removed from there. */}
              {status.source === "settings" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Connect ${status.name}`}
              onClick={onEnterKey}
            >
              <PlusIcon /> Connect
            </Button>
          )}
        </div>
      </div>
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
    </li>
  );
}

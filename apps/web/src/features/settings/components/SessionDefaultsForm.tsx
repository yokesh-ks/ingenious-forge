import { type FormEvent, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { ApprovalMode, SessionDefaults, SessionModel } from "@/api/types";
import { Button } from "@/components/ui/button";
import ModelFields, { selectClass } from "@/features/sandbox/components/ModelFields";
import { useModelCatalog } from "@/features/sandbox/hooks/use-model-catalog";
import { APPROVAL_MODES } from "@/lib/approval-modes";

/** The model, effort and approval mode new sessions start with. */
export default function SessionDefaultsForm() {
  const { catalog, error: catalogError } = useModelCatalog();
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

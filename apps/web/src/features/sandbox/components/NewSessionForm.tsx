import { type FormEvent, useState } from "react";
import type { ModelCatalog, SessionModel } from "@/api/types";
import { Button } from "@/components/ui/button";
import ModelFields from "./ModelFields";

interface NewSessionFormProps {
  /** `null` while the catalog loads. */
  catalog: ModelCatalog | null;
  /** Why the catalog could not be loaded. */
  error: string | null;
  onStart: (model: SessionModel) => void;
  onCancel: () => void;
  /** True while the session is being created. */
  starting?: boolean;
}

/** Picks the provider, model and reasoning effort for a new session. */
export default function NewSessionForm({
  catalog,
  error,
  onStart,
  onCancel,
  starting = false,
}: NewSessionFormProps) {
  if (!catalog) {
    return (
      <section aria-label="New session" className="flex flex-col gap-3 p-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading models…</p>
        )}
        <Button variant="outline" size="sm" className="self-start" onClick={onCancel}>
          Cancel
        </Button>
      </section>
    );
  }
  if (!catalog.default || catalog.providers.length === 0) {
    return (
      <section aria-label="New session" className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          No model provider is configured. Add a provider key to start a session.
        </p>
        <Button variant="outline" size="sm" className="self-start" onClick={onCancel}>
          Cancel
        </Button>
      </section>
    );
  }
  return (
    <ModelPicker
      catalog={catalog}
      initial={catalog.default}
      onStart={onStart}
      onCancel={onCancel}
      starting={starting}
    />
  );
}

function ModelPicker({
  catalog,
  initial,
  onStart,
  onCancel,
  starting,
}: {
  catalog: ModelCatalog;
  initial: SessionModel;
  onStart: (model: SessionModel) => void;
  onCancel: () => void;
  starting: boolean;
}) {
  const [choice, setChoice] = useState<SessionModel>(initial);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (choice.model) onStart(choice);
  }

  return (
    <form
      aria-label="New session"
      className="mx-auto flex w-full max-w-sm flex-col gap-4 p-4"
      onSubmit={submit}
    >
      <h3 className="text-base font-semibold">Start a new session</h3>
      <ModelFields catalog={catalog} value={choice} onChange={setChoice} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={starting || !choice.model}>
          Start session
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

import { type FormEvent, useRef, useState } from "react";
import { api } from "@/api/client";
import type { ApiProtocol, ProviderKeyStatus, ProviderModel } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/features/sandbox/components/ModelFields";
import { ModelList } from "./ProviderKeyPanel";
import {
  PANEL,
  PANEL_BODY,
  PANEL_FOOTER,
  PANEL_SECTION,
  PanelHeader,
  useFocusOnOpen,
} from "./ProviderPanel";

const PROTOCOLS: { value: ApiProtocol; label: string }[] = [
  { value: "openai_chat", label: "OpenAI Chat Completions" },
  { value: "openai_responses", label: "OpenAI Responses" },
  { value: "anthropic_messages", label: "Anthropic Messages" },
];

/** Adds an API by its base URL, protocol and models. */
export default function CustomProviderPanel({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (status: ProviderKeyStatus) => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [protocol, setProtocol] = useState<ApiProtocol>("openai_chat");
  const [key, setKey] = useState("");
  const [models, setModels] = useState<ProviderModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusOnOpen(formRef);

  const listed = (models ?? []).filter((m) => m.id.trim());
  const ready =
    id.trim() !== "" &&
    name.trim() !== "" &&
    baseUrl.trim() !== "" &&
    key.trim() !== "" &&
    listed.length > 0;

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(
        await api.addCustomProvider({ id, name, base_url: baseUrl, protocol, key, models: listed }),
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function fetchModels() {
    if (baseUrl.trim() === "" || key.trim() === "") {
      throw new Error("Enter a base URL and an API key to fetch models.");
    }
    return api.fetchCustomProviderModels({ base_url: baseUrl, protocol, key });
  }

  return (
    <form
      ref={formRef}
      aria-labelledby="custom-panel-title"
      data-provider-config
      className={PANEL}
      onSubmit={create}
    >
      <PanelHeader
        id="custom-panel-title"
        title="Custom provider"
        description="Connect a relay, a self-hosted server, or any other OpenAI- or Anthropic-compatible endpoint by its base URL, protocol and models. Your key is encrypted on this computer and is never sent back to the browser."
        onBack={onClose}
      />
      <div className={PANEL_BODY}>
        <div className={PANEL_SECTION}>
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-id" className="text-sm">
              Provider ID
            </label>
            <Input
              id="custom-id"
              placeholder="acme-gateway"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Lowercase identifier, starting with a letter, that uniquely names this provider. It
              cannot be changed later.
            </p>
          </div>
          <label htmlFor="custom-name" className="flex flex-col gap-1 text-sm">
            Display name
            <Input
              id="custom-name"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <div className={PANEL_SECTION}>
          <label htmlFor="custom-url" className="flex flex-col gap-1 text-sm">
            Base URL
            <Input
              id="custom-url"
              type="url"
              placeholder="https://gateway.example/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label htmlFor="custom-protocol" className="flex flex-col gap-1 text-sm">
            API protocol
            <select
              id="custom-protocol"
              className={`${selectClass} sm:max-w-xs`}
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as ApiProtocol)}
            >
              {PROTOCOLS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="custom-key" className="flex flex-col gap-1 text-sm">
            API key
            <Input
              id="custom-key"
              type="password"
              autoComplete="off"
              placeholder="Enter your API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
        </div>
        <div className={PANEL_SECTION}>
          <ModelList
            models={models}
            defaults={null}
            onChange={setModels}
            fetchModels={fetchModels}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
      <footer className={PANEL_FOOTER}>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !ready}>
          Create provider
        </Button>
      </footer>
    </form>
  );
}

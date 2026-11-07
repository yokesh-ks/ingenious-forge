import { ArrowDownIcon, ArrowUpIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { ProviderKeyStatus, ProviderModel } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PROVIDER_KEY_PAGES } from "../provider-key-pages";
import {
  PANEL,
  PANEL_BODY,
  PANEL_FOOTER,
  PANEL_SECTION,
  PanelHeader,
  useFocusOnOpen,
} from "./ProviderPanel";

/** Connects a provider, or changes its key, base URL or model list. */
export default function ProviderKeyPanel({
  provider,
  onClose,
  onSaved,
}: {
  provider: ProviderKeyStatus;
  onClose: () => void;
  onSaved: (status: ProviderKeyStatus) => void;
}) {
  const [key, setKey] = useState("");
  const [useCustomUrl, setUseCustomUrl] = useState(provider.base_url !== null);
  const [baseUrl, setBaseUrl] = useState(provider.base_url ?? "");
  /** The user's model list; `null` uses the provider's own. */
  const [models, setModels] = useState<ProviderModel[] | null>(provider.models);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  useFocusOnOpen(formRef);

  const typedKey = key.trim() !== "";
  const customUrl = useCustomUrl ? baseUrl.trim() || null : null;
  const customization = {
    base_url: customUrl,
    models: models?.some((m) => m.id.trim()) ? models : null,
  };
  const customized =
    JSON.stringify(customization) !==
    JSON.stringify({ base_url: provider.base_url, models: provider.models });

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // A failed key leaves the rest saved, and trying again only repeats the key.
      let status = provider;
      if (customized) status = await api.setProviderCustomization(provider.provider, customization);
      if (typedKey) status = await api.setProviderKey(provider.provider, key);
      onSaved(status);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      aria-labelledby="provider-panel-title"
      data-provider-config
      className={PANEL}
      onSubmit={save}
    >
      <PanelHeader
        id="provider-panel-title"
        title={provider.source ? `Edit ${provider.name}` : `Connect ${provider.name}`}
        description="This key is encrypted, stored locally and only used to make API requests from Forge."
        onBack={onClose}
      />
      <div className={PANEL_BODY}>
        <div className={PANEL_SECTION}>
          <KeyField provider={provider} value={key} onChange={setKey} />
        </div>
        <div className={PANEL_SECTION}>
          <label htmlFor="use-custom-base-url" className="flex items-center gap-2 text-sm">
            <Checkbox
              id="use-custom-base-url"
              checked={useCustomUrl}
              onCheckedChange={(on) => setUseCustomUrl(on === true)}
            />
            Use custom base URL
          </label>
          <p className="break-all text-sm text-muted-foreground">
            Default: {provider.default_base_url}
          </p>
          {useCustomUrl && (
            <Input
              aria-label="Base URL"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          )}
        </div>
        <div className={PANEL_SECTION}>
          <ModelList
            models={models}
            defaults={provider.default_models}
            onChange={setModels}
            fetchModels={() =>
              api.fetchProviderModels(provider.provider, {
                base_url: customUrl,
                key: key.trim() || null,
              })
            }
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="border-t py-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <footer className={PANEL_FOOTER}>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={busy || (provider.source ? !typedKey && !customized : !typedKey)}
        >
          {provider.source ? "Save" : "Connect"}
        </Button>
      </footer>
    </form>
  );
}

/** The API key, saying whether the provider's environment variable was found. */
function KeyField({
  provider,
  value,
  onChange,
}: {
  provider: ProviderKeyStatus;
  value: string;
  onChange: (value: string) => void;
}) {
  const env = provider.env_var;
  const fromEnv = provider.source === "environment";
  const keyPage = PROVIDER_KEY_PAGES[provider.provider];
  const placeholder = fromEnv
    ? `Leave blank to use ${env}`
    : provider.source
      ? "Enter a new key to replace it"
      : "Paste your API key";

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="provider-key" className="text-sm">
        {provider.name} API key
      </label>
      <Input
        id="provider-key"
        type="password"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {keyPage && (
        <p className="text-sm text-muted-foreground">
          You can get your {provider.name} API key by{" "}
          <a href={keyPage} target="_blank" rel="noreferrer" className="underline">
            signing up here
          </a>
          .
        </p>
      )}
      {fromEnv && <p className="text-sm text-muted-foreground">Detected {env}.</p>}
      {!provider.source && env && (
        <p className="text-sm text-amber-700 dark:text-amber-500">
          Env var not detected. Enter an API key, or set {env} before starting Forge.
        </p>
      )}
    </div>
  );
}

/** The provider's own models, or the list the user edits. The first is the default. */
export function ModelList({
  models,
  defaults,
  onChange,
  fetchModels,
}: {
  models: ProviderModel[] | null;
  /** The built-in models; `null` when the provider has no list of its own, so
   * the user's is the only one. */
  defaults: ProviderModel[] | null;
  onChange: (models: ProviderModel[] | null) => void;
  /** Asks the provider which models it serves, using what the form shows. */
  fetchModels: () => Promise<ProviderModel[]>;
}) {
  const [adding, setAdding] = useState(false);
  // The built-in models show as rows too, and any change to them starts the
  // user's own list from them.
  const current = models ?? defaults ?? [];
  const update = (index: number, change: Partial<ProviderModel>) =>
    onChange(current.map((m, i) => (i === index ? { ...m, ...change } : m)));
  const move = (index: number, by: number) => {
    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    onChange(next);
  };

  return (
    <section aria-label="Models" className="flex flex-col gap-2">
      <div>
        <div className="flex flex-wrap items-center gap-1">
          <p className="mr-auto text-sm">Models</p>
          {models && defaults && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              Restore defaults
            </Button>
          )}
        </div>
        {(models || defaults) && (
          <p className="text-sm text-muted-foreground">
            {models ? "Customized model list; the first is the default" : "Using the built-in list"}
          </p>
        )}
      </div>
      {current.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {current.map((model, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: an id changes as it is typed
            <li key={index} className="flex items-start gap-1 rounded-lg border p-1.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1 @lg:flex-row">
                <Input
                  aria-label={`Model ID ${index + 1}`}
                  placeholder="Model ID"
                  value={model.id}
                  onChange={(e) => update(index, { id: e.target.value })}
                />
                <Input
                  aria-label={`Display name ${index + 1}`}
                  placeholder="Display name"
                  value={model.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Move model ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Move model ${index + 1} down`}
                disabled={index === current.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete model ${index + 1}`}
                // A provider with its own list cannot be left with none: an empty
                // list means the built-in one.
                disabled={defaults !== null && current.length === 1}
                onClick={() => onChange(current.filter((_, i) => i !== index))}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Add at least one model, or fetch them from the provider.
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => setAdding(true)}
      >
        <PlusIcon /> Add model
      </Button>
      {adding && (
        <AddModelSheet
          existing={current}
          fetchModels={fetchModels}
          onClose={() => setAdding(false)}
          onAdd={(added) => {
            // Added at the end: the first model is the default, so it must not change.
            onChange([...current, ...added]);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

/** Adds models: picked from what the provider serves, or entered by hand. */
function AddModelSheet({
  existing,
  fetchModels,
  onClose,
  onAdd,
}: {
  existing: ProviderModel[];
  fetchModels: () => Promise<ProviderModel[]>;
  onClose: () => void;
  onAdd: (models: ProviderModel[]) => void;
}) {
  const [tab, setTab] = useState("provider");
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add model</SheetTitle>
          <SheetDescription>
            Pick from the models this provider serves, or enter a model ID yourself.
          </SheetDescription>
        </SheetHeader>
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-4 grid w-auto grid-cols-2">
            <TabsTrigger value="provider">From provider</TabsTrigger>
            <TabsTrigger value="manual">Enter manually</TabsTrigger>
          </TabsList>
          {/* Kept mounted so switching tabs does not lose the list or what was ticked. */}
          <TabsContent value="provider" forceMount hidden={tab !== "provider"} className={TAB_PANE}>
            <PickFromProvider
              existing={existing}
              fetchModels={fetchModels}
              onClose={onClose}
              onAdd={onAdd}
              onEnterManually={() => setTab("manual")}
            />
          </TabsContent>
          <TabsContent value="manual" forceMount hidden={tab !== "manual"} className={TAB_PANE}>
            <EnterManually existing={existing} onClose={onClose} onAdd={onAdd} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

const TAB_PANE = "flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden";

/** Loads what the provider serves as soon as it opens, and adds the ticked models. */
function PickFromProvider({
  existing,
  fetchModels,
  onClose,
  onAdd,
  onEnterManually,
}: {
  existing: ProviderModel[];
  fetchModels: () => Promise<ProviderModel[]>;
  onClose: () => void;
  onAdd: (models: ProviderModel[]) => void;
  onEnterManually: () => void;
}) {
  const [found, setFound] = useState<ProviderModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const latest = useRef(fetchModels);
  latest.current = fetchModels;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is what asks again
  useEffect(() => {
    let cancelled = false;
    setFound(null);
    setError(null);
    latest.current().then(
      (models) => {
        if (cancelled) return;
        if (models.length === 0) setError("This provider listed no models.");
        else setFound(models);
      },
      (err: Error) => {
        if (!cancelled) setError(err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const added = new Set(existing.map((m) => m.id.trim()));
  const query = search.trim().toLowerCase();
  const shown = (found ?? []).filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(query));
  const addable = shown.filter((m) => !added.has(m.id));
  const allTicked = addable.length > 0 && addable.every((m) => ticked.has(m.id));
  const chosen = (found ?? []).filter((m) => ticked.has(m.id) && !added.has(m.id));

  function toggle(ids: string[], on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {!found && !error && (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">
            Loading models…
          </p>
        )}
        {error && (
          <div className="flex flex-col items-start gap-3 rounded-lg border p-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onEnterManually}>
                Enter a model ID instead
              </Button>
            </div>
          </div>
        )}
        {found && (
          <>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon
                  aria-hidden="true"
                  className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Search models"
                  placeholder={`Search ${found.length} models`}
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0"
                disabled={addable.length === 0}
                onClick={() =>
                  toggle(
                    addable.map((m) => m.id),
                    !allTicked,
                  )
                }
              >
                {allTicked ? "Deselect all" : "Select all"}
              </Button>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {shown.map((model) => {
                const already = added.has(model.id);
                return (
                  <li key={model.id}>
                    <label
                      htmlFor={`choose-${model.id}`}
                      className={`flex items-center gap-3 rounded px-1 py-2 text-sm ${
                        already ? "text-muted-foreground" : "cursor-pointer hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        id={`choose-${model.id}`}
                        disabled={already}
                        checked={already || ticked.has(model.id)}
                        onCheckedChange={(on) => toggle([model.id], on === true)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{model.name}</span>
                        {model.name !== model.id && (
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {model.id}
                          </span>
                        )}
                      </span>
                      {already && <span className="shrink-0 text-xs">Added</span>}
                    </label>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No models match your search.
                </li>
              )}
            </ul>
          </>
        )}
      </div>
      <SheetFooter className="mt-0 flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={chosen.length === 0} onClick={() => onAdd(chosen)}>
          {chosen.length === 0
            ? "Add models"
            : `Add ${chosen.length} ${chosen.length === 1 ? "model" : "models"}`}
        </Button>
      </SheetFooter>
    </>
  );
}

/** Adds one model the provider's list does not show. */
function EnterManually({
  existing,
  onClose,
  onAdd,
}: {
  existing: ProviderModel[];
  onClose: () => void;
  onAdd: (models: ProviderModel[]) => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const trimmed = id.trim();
  const duplicate = existing.some((m) => m.id.trim() === trimmed);

  function add(event: FormEvent) {
    event.preventDefault();
    // This form is in a portal, but React still bubbles its submit to the
    // configuration form around the model list, which must not save.
    event.stopPropagation();
    if (trimmed && !duplicate) onAdd([{ id: trimmed, name: name.trim() || trimmed }]);
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={add}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="add-model-id" className="text-sm">
            Model ID
          </label>
          <Input
            id="add-model-id"
            placeholder="model-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          {trimmed && duplicate ? (
            <p role="alert" className="text-sm text-destructive">
              This model is already in the list.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Use the ID the provider expects.</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="add-model-name" className="text-sm">
            Display name
          </label>
          <Input
            id="add-model-name"
            placeholder={trimmed || "Optional"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            What the model picker shows. The ID is used if you leave this blank.
          </p>
        </div>
      </div>
      <SheetFooter className="mt-0 flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed || duplicate}>
          Add model
        </Button>
      </SheetFooter>
    </form>
  );
}

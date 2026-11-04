import type { ModelCatalog, ReasoningEffort, SessionModel } from "@/api/types";
import { effortLabel } from "@/lib/models";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ModelFieldsProps {
  catalog: ModelCatalog;
  value: SessionModel;
  onChange: (value: SessionModel) => void;
}

/** Provider, model and reasoning effort pickers; changing the provider
 * picks its first model. */
export default function ModelFields({ catalog, value, onChange }: ModelFieldsProps) {
  const provider = catalog.providers.find((p) => p.id === value.provider);

  function changeProvider(id: string) {
    const next = catalog.providers.find((p) => p.id === id);
    onChange({ ...value, provider: id, model: next?.models[0]?.id ?? "" });
  }

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Provider
        <select
          className={selectClass}
          value={value.provider}
          onChange={(e) => changeProvider(e.target.value)}
        >
          {catalog.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Model
        <select
          className={selectClass}
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        >
          {provider?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Reasoning effort
        <select
          className={selectClass}
          value={value.effort}
          onChange={(e) => onChange({ ...value, effort: e.target.value as ReasoningEffort })}
        >
          {catalog.efforts.map((effort) => (
            <option key={effort} value={effort}>
              {effortLabel(effort)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

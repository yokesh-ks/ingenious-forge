import type { ModelCatalog, ReasoningEffort, SessionModel } from "@/api/types";
import { effortLabel, fitEffort } from "@/lib/models";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ModelFieldsProps {
  catalog: ModelCatalog;
  value: SessionModel;
  onChange: (value: SessionModel) => void;
}

/** Provider, model and reasoning effort pickers. Changing the provider picks
 * its first model, and each model offers only its own efforts. */
export default function ModelFields({ catalog, value, onChange }: ModelFieldsProps) {
  const provider = catalog.providers.find((p) => p.id === value.provider);
  const model = provider?.models.find((m) => m.id === value.model);

  function changeProvider(id: string) {
    const first = catalog.providers.find((p) => p.id === id)?.models[0];
    onChange({
      provider: id,
      model: first?.id ?? "",
      effort: first ? fitEffort(first, value.effort) : value.effort,
    });
  }

  function changeModel(id: string) {
    const next = provider?.models.find((m) => m.id === id);
    onChange({
      ...value,
      model: id,
      effort: next ? fitEffort(next, value.effort) : value.effort,
    });
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
          onChange={(e) => changeModel(e.target.value)}
        >
          {provider?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {model && model.efforts.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          Reasoning effort
          <select
            className={selectClass}
            value={value.effort}
            onChange={(e) => onChange({ ...value, effort: e.target.value as ReasoningEffort })}
          >
            {model.efforts.map((effort) => (
              <option key={effort} value={effort}>
                {effortLabel(effort)}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

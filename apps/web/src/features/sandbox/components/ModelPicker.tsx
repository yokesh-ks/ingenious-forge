import { ChevronDownIcon } from "lucide-react";
import type { ModelCatalog, ModelOption, ReasoningEffort, SessionModel } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { describeModel, effortLabel, fitEffort } from "@/lib/models";

interface ModelPickerProps {
  /** The session's model; `null` means it runs on the catalog's default. */
  model: SessionModel | null;
  catalog: ModelCatalog | null;
  onChange: (model: SessionModel) => void;
  /** True while a turn runs or a change is being saved. */
  disabled?: boolean;
}

/** The session's model and reasoning effort, changeable from a small menu. */
export default function ModelPicker({
  model,
  catalog,
  onChange,
  disabled = false,
}: ModelPickerProps) {
  const current = model ?? catalog?.default ?? null;
  if (!current) return null;

  const names = describeModel(current, catalog);
  const selected = catalog?.providers
    .find((p) => p.id === current.provider)
    ?.models.find((m) => m.id === current.model);
  const selectedKey = `${current.provider}/${current.model}`;

  function chooseModel(provider: string, option: ModelOption) {
    if (!current || `${provider}/${option.id}` === selectedKey) return;
    onChange({ provider, model: option.id, effort: fitEffort(option, current.effort) });
  }

  function chooseEffort(effort: ReasoningEffort) {
    if (current && effort !== current.effort) onChange({ ...current, effort });
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          title={names.provider}
          aria-label={`Model: ${names.model}`}
          disabled={disabled || !catalog}
        >
          <span className="max-w-48 truncate">{names.model}</span>
          {names.effort && <span className="text-muted-foreground">{names.effort}</span>}
          <ChevronDownIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="max-h-96 w-60 overflow-y-auto">
        {catalog?.providers.map((provider) => (
          <DropdownMenuGroup key={provider.id}>
            <DropdownMenuLabel>{provider.name}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={selectedKey}>
              {provider.models.map((option) => (
                <DropdownMenuRadioItem
                  key={option.id}
                  value={`${provider.id}/${option.id}`}
                  onSelect={() => chooseModel(provider.id, option)}
                >
                  {option.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        ))}
        {selected && selected.efforts.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={current.effort}>
                {selected.efforts.map((effort) => (
                  <DropdownMenuRadioItem
                    key={effort}
                    value={effort}
                    onSelect={() => chooseEffort(effort)}
                  >
                    {effortLabel(effort)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

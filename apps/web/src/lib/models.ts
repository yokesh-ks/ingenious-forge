import type { ModelCatalog, ReasoningEffort, SessionModel } from "@/api/types";

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

export function effortLabel(effort: ReasoningEffort): string {
  return EFFORT_LABELS[effort];
}

/** Display names for a session's model, falling back to the raw ids. */
export function describeModel(model: SessionModel, catalog: ModelCatalog | null) {
  const provider = catalog?.providers.find((p) => p.id === model.provider);
  return {
    provider: provider?.name ?? model.provider,
    model: provider?.models.find((m) => m.id === model.model)?.name ?? model.model,
    effort: effortLabel(model.effort),
  };
}

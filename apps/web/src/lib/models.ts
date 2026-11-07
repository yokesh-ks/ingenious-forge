import type { ModelCatalog, ModelOption, ReasoningEffort, SessionModel } from "@/api/types";

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

/** The effort to use when moving to `model`: the current one if it is offered,
 * else the usual default, else the model's first. A model with no effort
 * setting keeps the value, which is then never sent. */
export function fitEffort(model: ModelOption, effort: ReasoningEffort): ReasoningEffort {
  if (model.efforts.length === 0 || model.efforts.includes(effort)) return effort;
  return model.efforts.includes("high") ? "high" : model.efforts[0];
}

/** Display names for a session's model, falling back to the raw ids. `effort`
 * is null when the session's model does not offer that effort. */
export function describeModel(model: SessionModel, catalog: ModelCatalog | null) {
  const provider = catalog?.providers.find((p) => p.id === model.provider);
  const found = provider?.models.find((m) => m.id === model.model);
  return {
    provider: provider?.name ?? model.provider,
    model: found?.name ?? model.model,
    effort: found && !found.efforts.includes(model.effort) ? null : effortLabel(model.effort),
  };
}

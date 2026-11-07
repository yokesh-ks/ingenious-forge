import type { ModelCatalog, ReasoningEffort } from "@/api/types";

const allEfforts: ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

/** A model catalog with two providers, for tests. Stub's models show the other
 * two shapes a model can have: a few efforts, or none. */
export const catalog: ModelCatalog = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      models: [
        { id: "claude-opus-5-5", name: "Claude Opus 5.5", efforts: allEfforts },
        { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", efforts: allEfforts },
      ],
    },
    {
      id: "stub",
      name: "Stub",
      models: [
        { id: "echo", name: "Echo", efforts: ["low", "high"] },
        { id: "picky", name: "Picky", efforts: ["low", "medium"] },
        { id: "plain", name: "Plain", efforts: [] },
      ],
    },
  ],
  default: { provider: "anthropic", model: "claude-opus-5-5", effort: "high" },
};

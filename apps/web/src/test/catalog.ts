import type { ModelCatalog } from "@/api/types";

/** A model catalog with two providers, for tests. */
export const catalog: ModelCatalog = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      models: [
        { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
        { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
      ],
    },
    { id: "stub", name: "Stub", models: [{ id: "echo", name: "Echo" }] },
  ],
  efforts: ["low", "medium", "high", "xhigh", "max"],
  default: { provider: "anthropic", model: "claude-opus-5-5", effort: "high" },
};

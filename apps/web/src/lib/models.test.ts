import { describe, expect, it } from "vitest";
import { catalog } from "@/test/catalog";
import { describeModel, effortLabel } from "./models";

describe("effortLabel", () => {
  it("names every effort level", () => {
    expect(catalog.efforts.map(effortLabel)).toEqual([
      "Low",
      "Medium",
      "High",
      "Extra high",
      "Max",
    ]);
  });
});

describe("describeModel", () => {
  it("uses the catalog's names", () => {
    expect(
      describeModel(
        { provider: "anthropic", model: "claude-sonnet-5-5", effort: "xhigh" },
        catalog,
      ),
    ).toEqual({ provider: "Anthropic", model: "Claude Sonnet 5.5", effort: "Extra high" });
  });

  it("falls back to the ids when the catalog does not know the model", () => {
    expect(describeModel({ provider: "gone", model: "old-1", effort: "low" }, catalog)).toEqual({
      provider: "gone",
      model: "old-1",
      effort: "Low",
    });
    expect(describeModel({ provider: "anthropic", model: "x", effort: "max" }, null)).toEqual({
      provider: "anthropic",
      model: "x",
      effort: "Max",
    });
  });
});

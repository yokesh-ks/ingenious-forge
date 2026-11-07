import { describe, expect, it } from "vitest";
import type { ReasoningEffort } from "@/api/types";
import { catalog } from "@/test/catalog";
import { describeModel, effortLabel, fitEffort } from "../models";

describe("effortLabel", () => {
  it("names every effort level", () => {
    expect(catalog.providers[0].models[0].efforts.map(effortLabel)).toEqual([
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

  it("names no effort when the session's model does not offer it", () => {
    expect(
      describeModel({ provider: "stub", model: "plain", effort: "high" }, catalog).effort,
    ).toBe(null);
    expect(describeModel({ provider: "stub", model: "picky", effort: "max" }, catalog).effort).toBe(
      null,
    );
  });
});

describe("fitEffort", () => {
  const model = (efforts: ReasoningEffort[]) => ({ id: "m", name: "M", efforts });

  it("keeps an effort the model offers", () => {
    expect(fitEffort(model(["low", "max"]), "max")).toBe("max");
  });

  it("prefers high, then the model's first", () => {
    expect(fitEffort(model(["low", "high"]), "max")).toBe("high");
    expect(fitEffort(model(["low", "medium"]), "max")).toBe("low");
  });

  it("leaves the effort alone for a model with no effort setting", () => {
    expect(fitEffort(model([]), "max")).toBe("max");
  });
});

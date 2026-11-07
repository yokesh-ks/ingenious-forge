import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalog } from "@/test/catalog";
import { fakeFetch } from "@/test/fake-fetch";
import { useModelCatalog } from "../../hooks/use-model-catalog";

afterEach(() => vi.unstubAllGlobals());

describe("useModelCatalog", () => {
  it("is loading, then holds the catalog", async () => {
    fakeFetch({ "GET /api/models": catalog });
    const { result } = renderHook(() => useModelCatalog());
    expect(result.current).toMatchObject({ catalog: null, error: null });
    await waitFor(() => expect(result.current.catalog).toEqual(catalog));
  });

  it("reports why the catalog could not be loaded", async () => {
    fakeFetch({ "GET /api/models": () => ({ status: 500, body: { error: "boom" } }) });
    const { result } = renderHook(() => useModelCatalog());
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.catalog).toBeNull();
  });
});

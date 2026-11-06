import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { ModelCatalog } from "@/api/types";

/** The providers, models and efforts a new session can pick from. */
export function useModelCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.modelCatalog().then(
      (found) => !cancelled && setCatalog(found),
      (err: Error) => !cancelled && setError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, error };
}

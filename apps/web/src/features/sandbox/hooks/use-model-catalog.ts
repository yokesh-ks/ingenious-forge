import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import type { ModelCatalog } from "@/api/types";

/** The providers, models and efforts a new session can pick from. Call
 * `reload` after a provider key changes, since keys decide what is listed. */
export function useModelCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may set the state.
  const latest = useRef(0);

  const reload = useCallback(() => {
    const request = ++latest.current;
    api.modelCatalog().then(
      (found) => {
        if (request !== latest.current) return;
        setCatalog(found);
        setError(null);
      },
      (err: Error) => {
        if (request === latest.current) setError(err.message);
      },
    );
  }, []);

  useEffect(() => {
    reload();
    return () => {
      latest.current++;
    };
  }, [reload]);

  return { catalog, error, reload };
}

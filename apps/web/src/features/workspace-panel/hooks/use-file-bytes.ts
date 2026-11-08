import { useEffect, useState } from "react";

export interface FileBytes {
  data: Uint8Array;
  headers: Headers;
}

export type BytesState =
  | { status: "loading" }
  | { status: "ready"; file: FileBytes }
  | { status: "failed"; message: string; httpStatus: number };

/** A file's bytes from `url`, or `null` to stay idle. Keeps what it has
 * showing while a new read of the same file runs. */
export function useFileBytes(url: string | null): BytesState {
  const [state, setState] = useState<BytesState>({ status: "loading" });
  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    setState((old) => (old.status === "ready" ? old : { status: "loading" }));
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setState({
            status: "failed",
            message: body?.error ?? `Request failed (${response.status})`,
            httpStatus: response.status,
          });
          return;
        }
        const data = new Uint8Array(await response.arrayBuffer());
        setState({ status: "ready", file: { data, headers: response.headers } });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setState({ status: "failed", message: error.message, httpStatus: 0 });
        }
      });
    return () => controller.abort();
  }, [url]);
  return state;
}

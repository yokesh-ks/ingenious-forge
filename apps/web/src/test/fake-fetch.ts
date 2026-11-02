import { vi } from "vitest";

type Handler = (init: RequestInit | undefined, url: URL) => { status?: number; body: unknown };

/**
 * Stubs `fetch` with handlers keyed by "METHOD /path" (query string
 * ignored). Unknown routes answer 404. Returns the mock to inspect calls.
 */
export function fakeFetch(routes: Record<string, Handler | unknown>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    if (!(key in routes)) {
      return new Response(JSON.stringify({ error: `no route ${key}` }), { status: 404 });
    }
    const route = routes[key];
    const { status = 200, body } =
      typeof route === "function" ? (route as Handler)(init, url) : { body: route };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

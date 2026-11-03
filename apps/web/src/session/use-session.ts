import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ApiRequestError, api } from "@/api/client";
import type { ClientMessage, SessionEnvelope } from "@/api/types";
import { initialSessionState, sessionReducer } from "./session-reducer";

export function sessionSocketUrl(location: Pick<Location, "protocol" | "host">): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws`;
}

interface Options {
  createSocket?: (url: string) => WebSocket;
  /** First wait before reconnecting, in ms; it doubles up to 5 s. */
  reconnectDelay?: number;
}

const defaultCreateSocket = (url: string) => new WebSocket(url);
const MAX_RECONNECT_DELAY = 5_000;

function isEnvelope(value: unknown): value is SessionEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.seq === "number" && typeof v.type === "string" && typeof v.session_id === "string"
  );
}

/**
 * Connects to the server's session socket and tracks one session. Every
 * event carries a per-session sequence number: on each (re)connect the
 * hook loads the logged events it has not applied yet, holding live
 * frames until then, and it applies each sequence number once, in order.
 */
export function useSession(
  sessionId: string,
  { createSocket = defaultCreateSocket, reconnectDelay = 500 }: Options = {},
) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let lastSeq = 0;
    // Live frames held back while the backlog loads; null when not syncing.
    let held: SessionEnvelope[] | null = null;
    let closed = false;
    let delay = reconnectDelay;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const apply = (envelope: SessionEnvelope) => {
      if (envelope.seq <= lastSeq) return;
      lastSeq = envelope.seq;
      dispatch({ kind: "event", event: envelope });
    };

    async function catchUp() {
      held = [];
      try {
        for (const envelope of await api.sessionEvents(sessionId, lastSeq)) apply(envelope);
      } catch (err) {
        // Live frames still apply, and the next reconnect retries. An
        // unknown session simply has no backlog.
        if (!(err instanceof ApiRequestError && err.status === 404)) {
          console.warn("Could not load the session backlog", err);
        }
      } finally {
        const pending = held ?? [];
        held = null;
        for (const envelope of pending) apply(envelope);
      }
    }

    function connect() {
      const socket = createSocket(sessionSocketUrl(window.location));
      socketRef.current = socket;
      socket.onopen = () => {
        delay = reconnectDelay;
        setConnected(true);
        void catchUp();
      };
      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
        timer = setTimeout(connect, delay);
        delay = Math.min(Math.max(delay * 2, 1), MAX_RECONNECT_DELAY);
      };
      socket.onmessage = (message: MessageEvent<string>) => {
        let value: unknown;
        try {
          value = JSON.parse(message.data);
        } catch {
          return;
        }
        if (!isEnvelope(value) || value.session_id !== sessionId) return;
        if (held) held.push(value);
        else apply(value);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, [sessionId, createSocket, reconnectDelay]);

  const send = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        dispatch({ kind: "local_error", message: "Not connected to the Forge server." });
        return false;
      }
      const message: ClientMessage = { type: "send_message", session_id: sessionId, text: trimmed };
      socket.send(JSON.stringify(message));
      dispatch({ kind: "send", text: trimmed });
      return true;
    },
    [sessionId],
  );

  /** Sends a message that needs no local bookkeeping; false if offline. */
  const post = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const stop = useCallback(() => {
    post({ type: "interrupt", session_id: sessionId });
  }, [post, sessionId]);

  const revertAll = useCallback(() => {
    if (!post({ type: "revert_all", session_id: sessionId })) {
      dispatch({ kind: "local_error", message: "Not connected to the Forge server." });
    }
  }, [post, sessionId]);

  return { state, connected, send, stop, revertAll };
}

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ClientMessage, SessionEvent } from "@/api/types";
import { initialSessionState, sessionReducer } from "./session-reducer";

export function sessionSocketUrl(location: Pick<Location, "protocol" | "host">): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws`;
}

interface Options {
  createSocket?: (url: string) => WebSocket;
}

const defaultCreateSocket = (url: string) => new WebSocket(url);

function isSessionEvent(value: unknown): value is SessionEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { session_id?: unknown }).session_id === "string"
  );
}

/** Connects to the server's session socket and tracks one session's turns. */
export function useSession(
  sessionId: string,
  { createSocket = defaultCreateSocket }: Options = {},
) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = createSocket(sessionSocketUrl(window.location));
    socketRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => {
      setConnected(false);
      dispatch({ kind: "local_error", message: "Lost the connection to the Forge server." });
    };
    socket.onmessage = (message: MessageEvent<string>) => {
      let event: unknown;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (isSessionEvent(event) && event.session_id === sessionId) {
        dispatch({ kind: "event", event });
      }
    };
    return () => {
      socket.onclose = null;
      socket.close();
      socketRef.current = null;
    };
  }, [sessionId, createSocket]);

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

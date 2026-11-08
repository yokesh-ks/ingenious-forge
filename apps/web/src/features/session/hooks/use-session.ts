import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ApiRequestError, api } from "@/api/client";
import type { ApprovalDecision, ClientMessage, QuestionAnswer, SessionEnvelope } from "@/api/types";
import { initialSessionState, sessionReducer } from "../session-reducer";
import { type EventStore, emptyEventStore, mergeEvents, startAtTurn } from "../store/event-store";

export function sessionSocketUrl(location: Pick<Location, "protocol" | "host">): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws`;
}

interface Options {
  createSocket?: (url: string) => WebSocket;
  /** First wait before reconnecting, in ms; it doubles up to 5 s. */
  reconnectDelay?: number;
  /** Events per page when opening a session or loading older ones. */
  pageSize?: number;
}

/** The server's largest page. */
const PAGE_SIZE = 500;

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
 * event carries a per-session sequence number, and the hook holds them in
 * one event store: a new session view loads the latest page first, older
 * pages when asked (`loadOlder`), and on each reconnect the events it
 * missed, holding live frames until then. Each sequence number applies
 * once, in order.
 */
export function useSession(
  sessionId: string,
  { createSocket = defaultCreateSocket, reconnectDelay = 500, pageSize = PAGE_SIZE }: Options = {},
) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [connected, setConnected] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // The raw events, for views that need more than the chat keeps.
  const [events, setEvents] = useState<SessionEnvelope[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const storeRef = useRef<EventStore>(emptyEventStore);
  const hasOlderRef = useRef(false);
  const loadingRef = useRef(false);
  // The session the store holds, so a page that arrives after a switch
  // is dropped.
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  /** Adds events to the store and brings the timeline up to date. */
  const ingest = useCallback((envelopes: SessionEnvelope[]) => {
    const next = mergeEvents(storeRef.current, envelopes);
    storeRef.current = next;
    if (next.appended === null || next.appended.length > 0) setEvents(next.events);
    if (next.appended === null) dispatch({ kind: "reset", events: next.events });
    else if (next.appended.length > 0) dispatch({ kind: "events", events: next.appended });
  }, []);

  const markOlder = useCallback((older: boolean) => {
    hasOlderRef.current = older;
    setHasOlder(older);
  }, []);

  useEffect(() => {
    storeRef.current = emptyEventStore;
    setEvents([]);
    markOlder(false);
    dispatch({ kind: "reset", events: [] });
    // Live frames held back while the backlog loads; null when not syncing.
    let held: SessionEnvelope[] | null = null;
    let closed = false;
    let delay = reconnectDelay;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** The latest page, starting at a turn, and the full list of changed
     * files when the session is longer than the page. */
    async function loadTail() {
      const page = await api.sessionEventsPage(sessionId, { limit: pageSize });
      if (closed) return;
      const full = page.length >= pageSize;
      ingest(full ? startAtTurn(page) : page);
      markOlder(full);
      if (full) {
        const files = await api.sessionChanges(sessionId);
        if (!closed) dispatch({ kind: "changes", files });
      }
    }

    async function catchUp() {
      held = [];
      try {
        if (storeRef.current.events.length === 0) await loadTail();
        else ingest(await api.sessionEvents(sessionId, storeRef.current.lastSeq));
      } catch (err) {
        // Live frames still apply, and the next reconnect retries. An
        // unknown session simply has no backlog.
        if (!(err instanceof ApiRequestError && err.status === 404)) {
          console.warn("Could not load the session backlog", err);
        }
      } finally {
        const pending = held ?? [];
        held = null;
        if (!closed && pending.length > 0) ingest(pending);
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
        else ingest([value]);
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
  }, [sessionId, createSocket, reconnectDelay, pageSize, ingest, markOlder]);

  /** Loads the page of events before the oldest one held. */
  const loadOlder = useCallback(async () => {
    const before = storeRef.current.firstSeq;
    if (!hasOlderRef.current || loadingRef.current || before === null) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await api.sessionEventsPage(sessionId, { before, limit: pageSize });
      if (sessionRef.current !== sessionId) return;
      const full = page.length >= pageSize;
      ingest(full ? startAtTurn(page) : page);
      markOlder(full);
    } catch (err) {
      console.warn("Could not load older session events", err);
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [sessionId, pageSize, ingest, markOlder]);

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

  const answerApproval = useCallback(
    (callId: string, decision: ApprovalDecision) => {
      if (!post({ type: "answer_approval", session_id: sessionId, call_id: callId, decision })) {
        dispatch({ kind: "local_error", message: "Not connected to the Forge server." });
      }
    },
    [post, sessionId],
  );

  const answerQuestion = useCallback(
    (callId: string, answers: QuestionAnswer[]) => {
      if (!post({ type: "answer_question", session_id: sessionId, call_id: callId, answers })) {
        dispatch({ kind: "local_error", message: "Not connected to the Forge server." });
      }
    },
    [post, sessionId],
  );

  return {
    state,
    events,
    connected,
    hasOlder,
    loadingOlder,
    loadOlder,
    send,
    stop,
    revertAll,
    answerApproval,
    answerQuestion,
  };
}

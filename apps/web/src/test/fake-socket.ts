import { act } from "@testing-library/react";
import type { SessionEvent } from "@/api/types";

/** A WebSocket stand-in that tests drive by hand. */
export class FakeSocket {
  static instances: FakeSocket[] = [];
  static seqs = new Map<string, number>();
  static readonly OPEN = 1;

  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  binaryType = "blob";

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  drop() {
    this.readyState = 3;
    this.onclose?.();
  }

  /** Sends an event, numbering it after the last one of its session
   * unless `seq` is given. */
  emit(event: SessionEvent, seq?: number) {
    const next = seq ?? (FakeSocket.seqs.get(event.session_id) ?? 0) + 1;
    FakeSocket.seqs.set(
      event.session_id,
      Math.max(next, FakeSocket.seqs.get(event.session_id) ?? 0),
    );
    this.onmessage?.({ data: JSON.stringify({ seq: next, ...event }) });
  }

  emitRaw(data: string) {
    this.onmessage?.({ data });
  }

  /** Delivers a binary frame, as the terminal socket sends output. */
  emitBinary(text: string) {
    const bytes = new TextEncoder().encode(text);
    this.onmessage?.({
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    });
  }

  static latest(): FakeSocket {
    const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
    if (!socket) throw new Error("no socket created");
    return socket;
  }

  static reset() {
    FakeSocket.instances = [];
    FakeSocket.seqs = new Map();
  }
}

export const createFakeSocket = (url: string) => new FakeSocket(url) as unknown as WebSocket;

/** Opens `socket` and waits for the session's backlog request to settle. */
export async function openSocket(socket: FakeSocket) {
  await act(async () => {
    socket.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

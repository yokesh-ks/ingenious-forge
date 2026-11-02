import type { SessionEvent } from "@/api/types";

/** A WebSocket stand-in that tests drive by hand. */
export class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

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

  emit(event: SessionEvent) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  emitRaw(data: string) {
    this.onmessage?.({ data });
  }

  static latest(): FakeSocket {
    const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
    if (!socket) throw new Error("no socket created");
    return socket;
  }

  static reset() {
    FakeSocket.instances = [];
  }
}

export const createFakeSocket = (url: string) => new FakeSocket(url) as unknown as WebSocket;

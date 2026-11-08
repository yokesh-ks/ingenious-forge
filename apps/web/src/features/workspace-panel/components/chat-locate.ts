/** Finding a log record's place in the chat beside the panel. */

export interface ChatTarget {
  callId: string | null;
  turn: number | null;
}

const chatRoot = () => document.querySelector<HTMLElement>('[aria-label="Session"]');

function elementFor({ callId, turn }: ChatTarget): HTMLElement | null {
  const root = chatRoot();
  if (!root) return null;
  const call = callId
    ? root.querySelector<HTMLElement>(`[data-chat-call="${CSS.escape(callId)}"]`)
    : null;
  return (
    call ?? (turn === null ? null : root.querySelector<HTMLElement>(`[data-chat-turn="${turn}"]`))
  );
}

const REVEAL =
  "pointer-events-none fixed z-[1200] rounded-md bg-primary/15 outline outline-1 outline-primary";
const OVERLAY =
  "pointer-events-none fixed z-[1201] rounded bg-primary/15 outline outline-1 outline-primary";

/** Covers the part of `element` inside the chat's visible area. */
function drawOver(element: HTMLElement, overlay: HTMLElement) {
  const box = element.getBoundingClientRect();
  const area = chatRoot()?.getBoundingClientRect() ?? box;
  const left = Math.max(box.left, area.left);
  const top = Math.max(box.top, area.top);
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${Math.max(0, Math.min(box.right, area.right) - left)}px`;
  overlay.style.height = `${Math.max(0, Math.min(box.bottom, area.bottom) - top)}px`;
}

function makeOverlay(className = OVERLAY) {
  const overlay = document.createElement("div");
  overlay.className = className;
  overlay.dataset.chatPick = "";
  document.body.append(overlay);
  return overlay;
}

/** Scrolls the chat to a record and marks it briefly; without a place for
 * it, marks the chat itself. */
export function revealInChat(target: ChatTarget) {
  const element = elementFor(target) ?? chatRoot();
  if (!element) return;
  element.scrollIntoView?.({ block: "center" });
  const overlay = makeOverlay(REVEAL);
  overlay.style.opacity = "0";
  // The chat's own scrolling settles first, then the mark pulses once.
  window.setTimeout(() => {
    drawOver(element, overlay);
    overlay.animate?.([{ opacity: 0.65 }, { opacity: 0.1 }, { opacity: 0.5 }, { opacity: 0 }], 700);
    window.setTimeout(() => overlay.remove(), 700);
  }, 150);
}

function targetAt(
  x: number,
  y: number,
  mask: HTMLElement,
): { element: HTMLElement; target: ChatTarget } | null {
  for (const hit of document.elementsFromPoint?.(x, y) ?? []) {
    if (hit === mask || (hit as HTMLElement).dataset?.chatPick !== undefined) continue;
    const call = hit.closest<HTMLElement>("[data-chat-call]");
    const turn = hit.closest<HTMLElement>("[data-chat-turn]");
    const element = call ?? turn;
    if (!element) continue;
    const turnNumber = turn ? Number(turn.dataset.chatTurn) : null;
    return { element, target: { callId: call?.dataset.chatCall ?? null, turn: turnNumber } };
  }
  return null;
}

/** Lets the user click an element of the chat. Returns the way to stop, or
 * `null` when no chat is on screen. `onPick` says whether the pick landed. */
export function pickInChat(onPick: (target: ChatTarget) => boolean, onCancel: () => void) {
  const root = chatRoot();
  if (!root) return null;
  const box = root.getBoundingClientRect();
  const mask = document.createElement("div");
  mask.className = "fixed z-[1200] cursor-crosshair touch-none";
  Object.assign(mask.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  document.body.append(mask);
  const preview = makeOverlay();
  preview.style.display = "none";

  const stop = () => {
    mask.remove();
    preview.remove();
    window.removeEventListener("keydown", onKey, true);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stop();
    onCancel();
  };
  mask.addEventListener("pointermove", (event) => {
    const found = targetAt(event.clientX, event.clientY, mask);
    preview.style.display = found ? "" : "none";
    if (found) drawOver(found.element, preview);
  });
  mask.addEventListener("click", (event) => {
    const found = targetAt(event.clientX, event.clientY, mask);
    if (found && onPick(found.target)) stop();
  });
  window.addEventListener("keydown", onKey, true);
  return stop;
}

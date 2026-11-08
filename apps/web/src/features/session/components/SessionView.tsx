import { CheckIcon, CopyIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalDecision, QuestionAnswer } from "@/api/types";
import { Bubble, BubbleContent } from "@/components/ai-elements/bubble";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ai-elements/message-scroller";
import { useCopy } from "@/components/markdown/code-tools";
import Markdown from "@/components/markdown/Markdown";
import { Button } from "@/components/ui/button";
import FailureRow from "@/features/chat/components/FailureRow";
import ProcessGroup from "@/features/chat/components/ProcessGroup";
import ReplyFooter from "@/features/chat/components/ReplyFooter";
import TurnControl, { RunningStatus } from "@/features/chat/components/TurnControl";
import {
  buildChat,
  type ChatGroup,
  type ChatNode,
  type ChatTurn,
} from "@/features/chat/model/build-chat";
import { formatClock } from "@/features/chat/model/format";
import type {
  SessionItem,
  SessionMessage,
  SessionNotice,
  TurnRecord,
} from "@/features/session/session-reducer";

interface SessionViewProps {
  messages: SessionItem[];
  /** The session's turns; without them every item shows outside a turn. */
  turns?: TurnRecord[];
  running: boolean;
  error: string | null;
  /** Answers a tool call's approval card. */
  onAnswerApproval?: (callId: string, decision: ApprovalDecision) => void;
  /** Answers a tool call's question card. */
  onAnswerQuestion?: (callId: string, answers: QuestionAnswer[]) => void;
  /** Whether older events exist that are not loaded yet. */
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
}

/**
 * The top of a session whose older events are not loaded: loads them when
 * it scrolls into view, or when its button is pressed.
 */
function OlderRow({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoad();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoad]);
  return (
    <div ref={ref} className="flex justify-center">
      <Button variant="ghost" size="sm" disabled={loading} onClick={onLoad}>
        {loading ? "Loading earlier messages…" : "Load earlier messages"}
      </Button>
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mx-auto w-full max-w-3xl rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

const NO_TURNS: TurnRecord[] = [];

interface Handlers {
  onAnswerApproval?: (callId: string, decision: ApprovalDecision) => void;
  onAnswerQuestion?: (callId: string, answers: QuestionAnswer[]) => void;
}

/** A user message: its bubble, then its time and Copy under it. */
function UserMessage({ item }: { item: SessionMessage }) {
  const { copied, copy } = useCopy(item.text);
  return (
    <div className="flex flex-col items-end gap-1">
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent className="whitespace-pre-wrap" data-testid="message-text">
              {item.text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {item.at !== undefined && <span className="tabular-nums">{formatClock(item.at)}</span>}
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy message"}
          onClick={copy}
          className="inline-flex size-6 items-center justify-center rounded-lg hover:bg-muted hover:text-foreground"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** A reply: the assistant's text as Markdown, outside any bubble. */
const Reply = memo(function Reply({ item }: { item: SessionMessage }) {
  return (
    <div data-testid="message-text">
      <Markdown text={item.text} />
    </div>
  );
});

function Notice({ item }: { item: SessionNotice }) {
  return <p className="text-center text-xs text-muted-foreground">{item.text}</p>;
}

/** A group re-renders only when one of its items or its title changed, so
 * a streaming reply leaves earlier groups alone. */
const Group = memo(
  function Group({ group, live, ...handlers }: { group: ChatGroup; live?: boolean } & Handlers) {
    return <ProcessGroup group={group} live={live} {...handlers} />;
  },
  (a, b) =>
    a.live === b.live &&
    a.onAnswerApproval === b.onAnswerApproval &&
    a.onAnswerQuestion === b.onAnswerQuestion &&
    a.group.title === b.group.title &&
    a.group.running === b.group.running &&
    a.group.waiting === b.group.waiting &&
    a.group.activity === b.group.activity &&
    a.group.items.length === b.group.items.length &&
    a.group.items.every((item, i) => item === b.group.items[i]),
);

/**
 * One turn: once finished, its control line first; then its groups
 * (unless folded), replies, steering messages and notices; while it runs,
 * its status last. Rows sit 4px apart, replies 12px from process rows and
 * the control line 16px from its neighbours.
 */
function Turn({
  turn,
  folded,
  onToggle,
  ...handlers
}: { turn: ChatTurn; folded: boolean; onToggle: (turn: number) => void } & Handlers) {
  const live = turn.status === "running";
  // The last reply of a finished turn carries the turn's footer.
  const lastReply = live
    ? undefined
    : [...turn.nodes].reverse().find((n) => n.kind === "reply")?.item;
  return (
    <div className="flex flex-col gap-3">
      {!live && (
        <div className="mb-1">
          <TurnControl turn={turn} folded={folded} onToggle={() => onToggle(turn.turn)} />
        </div>
      )}
      {turn.nodes.map((node) => {
        switch (node.kind) {
          case "group":
            return folded ? null : <Group key={node.id} group={node} live={live} {...handlers} />;
          case "reply":
            return node.item === lastReply ? (
              <div key={node.item.id} className="flex flex-col gap-1">
                <Reply item={node.item} />
                <ReplyFooter text={node.item.text} usage={turn.usage} at={turn.endedAt} />
              </div>
            ) : (
              <Reply key={node.item.id} item={node.item} />
            );
          case "steer":
            return <UserMessage key={node.item.id} item={node.item} />;
          case "notice":
            return <Notice key={node.item.id} item={node.item} />;
          default:
            return null;
        }
      })}
      {live && <RunningStatus startedAt={turn.startedAt} />}
      {turn.failure && <FailureRow failure={turn.failure} />}
    </div>
  );
}

/** The scroller key and anchor of a top-level entry. */
function nodeKey(node: ChatNode): string {
  if (node.kind === "turn") return `turn-${node.turn}`;
  if (node.kind === "group") return node.id;
  return node.item.id;
}

export default function SessionView({
  messages,
  running,
  error,
  onAnswerApproval,
  onAnswerQuestion,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
  turns = NO_TURNS,
}: SessionViewProps) {
  const nodes = useMemo(() => buildChat({ messages, turns }), [messages, turns]);
  // Turns the user folded or unfolded; the rest follow their default.
  const [folds, setFolds] = useState<Record<number, boolean>>({});
  const toggleTurn = useCallback(
    (turn: number) =>
      setFolds((all) => {
        const node = nodes.find((n) => n.kind === "turn" && n.turn === turn);
        const current = all[turn] ?? (node?.kind === "turn" && node.collapsible);
        return { ...all, [turn]: !current };
      }),
    [nodes],
  );

  if (messages.length === 0) {
    return (
      <section
        className="flex flex-1 flex-col items-center justify-center gap-4"
        aria-label="Session"
      >
        <p className="text-sm text-muted-foreground">
          No messages yet. Send a task to get started.
        </p>
        {error && <ErrorAlert message={error} />}
      </section>
    );
  }

  const last = messages[messages.length - 1];
  // A running turn shows its own status; this covers the moment between
  // sending and the turn starting, and sessions logged without turns.
  const runningTurn = turns[turns.length - 1]?.status === "running";
  const waitingForReply =
    running &&
    !runningTurn &&
    (last?.role === "user" || (last?.role === "tool" && last.status !== "running"));

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1" aria-label="Session">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-6">
            {hasOlder && onLoadOlder && <OlderRow loading={loadingOlder} onLoad={onLoadOlder} />}
            {nodes.map((node) => (
              <MessageScrollerItem
                key={nodeKey(node)}
                messageId={nodeKey(node)}
                scrollAnchor={node.kind === "message"}
              >
                {node.kind === "turn" ? (
                  <Turn
                    turn={node}
                    folded={folds[node.turn] ?? node.collapsible}
                    onToggle={toggleTurn}
                    onAnswerApproval={onAnswerApproval}
                    onAnswerQuestion={onAnswerQuestion}
                  />
                ) : node.kind === "group" ? (
                  <Group
                    group={node}
                    onAnswerApproval={onAnswerApproval}
                    onAnswerQuestion={onAnswerQuestion}
                  />
                ) : node.kind === "reply" ? (
                  <Reply item={node.item} />
                ) : node.kind === "notice" ? (
                  <Notice item={node.item} />
                ) : (
                  <UserMessage item={node.item} />
                )}
              </MessageScrollerItem>
            ))}
            {waitingForReply && (
              <p role="status" className="text-sm text-muted-foreground">
                Forge is thinking…
              </p>
            )}
            {/* A failed turn already says why in its own last row. */}
            {error && error !== turns[turns.length - 1]?.failure?.message && (
              <ErrorAlert message={error} />
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

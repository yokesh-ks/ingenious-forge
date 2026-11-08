import { memo, useEffect, useRef } from "react";
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
import Markdown from "@/components/markdown/Markdown";
import { Button } from "@/components/ui/button";
import type { SessionItem } from "@/features/session/session-reducer";
import ToolCallCard from "./ToolCallCard";

interface SessionViewProps {
  messages: SessionItem[];
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

/**
 * One entry of the timeline. Memoised: the reducer keeps unchanged items'
 * identity, so while a reply streams only its own entry re-renders, which
 * keeps sessions with thousands of entries responsive.
 */
const TimelineItem = memo(function TimelineItem({
  item,
  onAnswerApproval,
  onAnswerQuestion,
}: {
  item: SessionItem;
  onAnswerApproval?: (callId: string, decision: ApprovalDecision) => void;
  onAnswerQuestion?: (callId: string, answers: QuestionAnswer[]) => void;
}) {
  return (
    <MessageScrollerItem messageId={item.id} scrollAnchor={item.role === "user"}>
      {item.role === "tool" ? (
        <ToolCallCard tool={item} onAnswer={onAnswerApproval} onAnswerQuestion={onAnswerQuestion} />
      ) : item.role === "notice" ? (
        <p className="text-center text-xs text-muted-foreground">{item.text}</p>
      ) : item.role === "assistant" ? (
        <div data-testid="message-text">
          <Markdown text={item.text} />
        </div>
      ) : (
        <Message align="end">
          <MessageContent>
            <Bubble align="end" variant="muted">
              <BubbleContent className="whitespace-pre-wrap" data-testid="message-text">
                {item.text}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )}
    </MessageScrollerItem>
  );
});

export default function SessionView({
  messages,
  running,
  error,
  onAnswerApproval,
  onAnswerQuestion,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
}: SessionViewProps) {
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
  const waitingForReply =
    running && (last?.role === "user" || (last?.role === "tool" && last.status !== "running"));

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1" aria-label="Session">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-6">
            {hasOlder && onLoadOlder && <OlderRow loading={loadingOlder} onLoad={onLoadOlder} />}
            {messages.map((message) => (
              <TimelineItem
                key={message.id}
                item={message}
                onAnswerApproval={onAnswerApproval}
                onAnswerQuestion={onAnswerQuestion}
              />
            ))}
            {waitingForReply && (
              <p role="status" className="text-sm text-muted-foreground">
                Forge is thinking…
              </p>
            )}
            {error && <ErrorAlert message={error} />}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

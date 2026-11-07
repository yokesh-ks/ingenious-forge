import { memo } from "react";
import type { ApprovalDecision } from "@/api/types";
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
import type { SessionItem } from "@/features/session/session-reducer";
import ToolCallCard from "./ToolCallCard";

interface SessionViewProps {
  messages: SessionItem[];
  running: boolean;
  error: string | null;
  /** Answers a tool call's approval card. */
  onAnswerApproval?: (callId: string, decision: ApprovalDecision) => void;
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
}: {
  item: SessionItem;
  onAnswerApproval?: (callId: string, decision: ApprovalDecision) => void;
}) {
  return (
    <MessageScrollerItem messageId={item.id} scrollAnchor={item.role === "user"}>
      {item.role === "tool" ? (
        <ToolCallCard tool={item} onAnswer={onAnswerApproval} />
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
            {messages.map((message) => (
              <TimelineItem key={message.id} item={message} onAnswerApproval={onAnswerApproval} />
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

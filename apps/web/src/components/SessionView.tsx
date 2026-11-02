import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { SessionItem } from "@/session/session-reducer";
import ToolCallCard from "./ToolCallCard";

interface SessionViewProps {
  messages: SessionItem[];
  running: boolean;
  error: string | null;
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

export default function SessionView({ messages, running, error }: SessionViewProps) {
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
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                {message.role === "tool" ? (
                  <ToolCallCard tool={message} />
                ) : (
                  <Message align={message.role === "user" ? "end" : "start"}>
                    <MessageContent>
                      <Bubble align={message.role === "user" ? "end" : "start"} variant="muted">
                        <BubbleContent className="whitespace-pre-wrap" data-testid="message-text">
                          {message.text}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                )}
              </MessageScrollerItem>
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
